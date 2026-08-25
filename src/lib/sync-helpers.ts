import { db } from './db';
import type { OutboxEntry } from '../types/models';

/**
 * Delay (ms) between the last queued mutation and the automatic sync kick,
 * so a burst of edits produces one cycle instead of one per mutation.
 */
const KICK_DEBOUNCE_MS = 3000;

/** Single pending post-mutation sync timer (module-level debounce). */
let kickTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Schedule exactly one debounced sync cycle shortly after the most recent
 * mutation. Repeated mutations reset the timer; only the last one fires.
 *
 * The engine is loaded dynamically on purpose: purely-local consumers of
 * queueOutbox (entity-crud / note-crud and their specs) must not
 * transitively bootstrap the Supabase client at import time. Guarded
 * against SSR / no-window environments where timers are meaningless.
 */
function scheduleDebouncedSyncKick(): void {
  if (typeof window === 'undefined') {
    return;
  }
  if (kickTimer !== null) {
    clearTimeout(kickTimer);
  }
  kickTimer = setTimeout(() => {
    kickTimer = null;
    void import('./sync-engine').then(
      (engine) => engine.runSyncCycle(),
      (error: unknown) => console.error('Failed to kick the sync engine:', error),
    );
  }, KICK_DEBOUNCE_MS);
}

/**
 * Bump the conflict-resolution version of a locally edited record and flag
 * it as dirty.
 *
 * The client increments `version` on every local edit. When connectivity
 * returns, the push layer sends the row and Supabase keeps the copy with
 * the **highest `version`** — never by timestamp — which makes conflict
 * resolution immune to device clock skew.
 *
 * Returns a shallow copy; the input record is not mutated.
 */
export function bumpVersion<T extends { version: number }>(record: T): T {
  const copy: Record<string, unknown> = { ...record };
  copy.version = record.version + 1;
  copy.dirty = true;
  return copy as T;
}

/**
 * Append one pending change to the local outbox for asynchronous push to
 * Supabase.
 *
 * `queued_at` is stamped here for diagnostics only — conflict resolution
 * still relies solely on `version`. Failures propagate to the caller; no
 * errors are swallowed. Queueing also schedules the debounced M5 sync kick
 * so pending changes reach the cloud without waiting for the next interval.
 */
export async function queueOutbox(
  entry: Omit<OutboxEntry, 'seq' | 'queued_at'>,
): Promise<void> {
  await db.outbox.add({ ...entry, queued_at: new Date().toISOString() });
  scheduleDebouncedSyncKick();
}
