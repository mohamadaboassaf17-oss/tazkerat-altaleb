import { db } from './db';
import { pullChanges } from './sync-pull';
import { pushOutbox } from './sync-push';
import { supabase } from './supabase';

/**
 * M5 sync orchestrator: single-flight pull→push cycles, a minimal status
 * subscription for the dashboard, and lifecycle triggers (online, tab
 * visibility, 30s interval). Mutation-driven kicks live in sync-helpers.
 */

/** Interval between automatic background cycles, in milliseconds. */
export const CYCLE_INTERVAL_MS = 30_000;

/** Lifecycle state of the last (or current) sync cycle. */
export type SyncEngineState = 'idle' | 'syncing' | 'error';

/** Snapshot consumed by the dashboard UI to render sync health. */
export interface SyncStatus {
  state: SyncEngineState;
  /** Entries still awaiting their first successful push. */
  pendingCount: number;
  /** Human-readable reason for the last `error` state, if any. */
  lastError?: string;
}

const listeners = new Set<(status: SyncStatus) => void>();

/** The running cycle's promise; `null` when no cycle is in flight. */
let cyclePromise: Promise<void> | null = null;

/** Cleanup of the active engine wiring; non-null between start and stop. */
let activeCleanup: (() => void) | null = null;

/**
 * Run one full sync cycle — pull then push — coalescing concurrent calls
 * onto the single in-flight cycle. Never throws outward: any failure is
 * captured into the error status instead.
 */
export function runSyncCycle(): Promise<void> {
  if (cyclePromise === null) {
    const cycle = executeCycle();
    cyclePromise = cycle.finally(() => {
      cyclePromise = null;
    });
    // The finally chain is the shared promise; an early rejection inside
    // executeCycle is already handled there, so this cannot be unobserved.
    cyclePromise.catch(() => undefined);
  }
  return cyclePromise;
}

async function executeCycle(): Promise<void> {
  try {
    notify({ state: 'syncing', pendingCount: await db.outbox.count() });

    const { data } = await supabase.auth.getSession();
    if (data.session === null) {
      notify({ state: 'idle', pendingCount: await db.outbox.count() });
      return;
    }

    await pullChanges(data.session.user.id);
    await pushOutbox();

    notify({ state: 'idle', pendingCount: await db.outbox.count() });
  } catch (error) {
    notify({
      state: 'error',
      pendingCount: await db.outbox.count(),
      lastError: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Publish a status snapshot to every subscriber. */
function notify(next: SyncStatus): void {
  // Snapshot so subscribers may unsubscribe during notification.
  for (const listener of [...listeners]) {
    try {
      listener({ ...next });
    } catch {
      // Swallowed deliberately: status listeners are UI-only observers, so
      // a throwing subscriber must never break the cycle — an unguarded
      // throw here would divert control into executeCycle's catch block,
      // which notifies again (recursion) and mislabels a healthy cycle.
    }
  }
}

/**
 * Subscribe to sync status changes. Returns an unsubscribe function;
 * calling it twice is harmless.
 */
export function subscribeSyncStatus(listener: (status: SyncStatus) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Wire the environment triggers that keep synchronization alive while the
 * user is signed in:
 *
 * - `window` `online` → immediate cycle,
 * - `document` `visibilitychange` → cycle when the tab becomes visible,
 * - a 30-second interval as the safety net.
 *
 * Idempotent: starting twice returns the existing cleanup. On environments
 * without a DOM (SSR, tests without stubs) this wires nothing and returns
 * a no-op cleanup. The returned function removes every listener and timer;
 * after cleanup the engine can be started fresh again.
 */
export function startSyncEngine(): () => void {
  if (activeCleanup !== null) {
    return activeCleanup;
  }
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => undefined;
  }

  const onOnline = (): void => {
    void runSyncCycle();
  };
  const onVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') {
      void runSyncCycle();
    }
  };

  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisibilityChange);
  const intervalId = window.setInterval(() => {
    void runSyncCycle();
  }, CYCLE_INTERVAL_MS);

  activeCleanup = () => {
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.clearInterval(intervalId);
    activeCleanup = null;
  };
  return activeCleanup;
}
