import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { db } from './db';
import { createEntity } from './entity-crud';
import { queueOutbox } from './sync-helpers';
import {
  CYCLE_INTERVAL_MS,
  runSyncCycle,
  startSyncEngine,
  subscribeSyncStatus,
  type SyncStatus,
} from './sync-engine';
import {
  getSupabaseMockHarness,
  makeError,
  resetSupabaseMockHarness,
} from './testing/mock-supabase';

/**
 * Orchestrator tests for the M5 engine over a faked IndexedDB and a
 * controllable supabase-js mock: single-flight coalescing, the
 * offline→edit→online round trip, lifecycle triggers and their cleanup,
 * and the debounced post-mutation kick from queueOutbox.
 */

/**
 * The shared mock builder predates pull-side offset pagination and has no
 * `.range()`. Augment the freshly built chain in place so pullChanges can
 * call it without editing testing/mock-supabase.ts.
 */
function withRangeSupport(builder: unknown): unknown {
  const target = builder as Record<string, unknown>;
  target['range'] = (): unknown => target;
  return target;
}

vi.mock('./supabase', async () => {
  const mocks = await import('./testing/mock-supabase');
  const mod = mocks.supabaseModuleMock();
  const client = mod.supabase as { auth: unknown; from: (table: string) => unknown };
  return {
    supabase: {
      auth: client.auth,
      from: (table: string): unknown => withRangeSupport(client.from(table)),
    },
  };
});

const h = getSupabaseMockHarness();

/** Flush pending microtasks so an in-flight cycle can reach its next await. */
function tickMacrotask(): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

beforeEach(async () => {
  resetSupabaseMockHarness();
  await db.delete();
  await db.open();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('runSyncCycle — single flight', () => {
  it('coalesces concurrent calls onto one running cycle (one getSession)', async () => {
    let releaseGate!: () => void;
    h.session = { user: { id: 'u_1' } };
    h.sessionGate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });

    const first = runSyncCycle();
    const second = runSyncCycle();
    expect(first).toBe(second);

    await tickMacrotask();
    expect(h.getSessionCalls).toBe(1);

    releaseGate();
    await Promise.all([first, second]);

    expect(h.getSessionCalls).toBe(1); // second caller joined the same cycle
  });

  it('allows a brand-new cycle after the previous one completed', async () => {
    h.session = null;
    await runSyncCycle();
    await runSyncCycle();
    expect(h.getSessionCalls).toBe(2);
  });

  it('never throws outward — failures surface through the error status instead', async () => {
    h.session = { user: { id: 'u_1' } };
    h.responder.list = (table) =>
      table === 'users'
        ? { data: null, error: makeError('XX000', 'pull exploded') }
        : { data: [], error: null };

    let latest: SyncStatus | null = null;
    const unsubscribe = subscribeSyncStatus((status) => {
      latest = status;
    });

    try {
      await expect(runSyncCycle()).resolves.toBeUndefined();
      expect(latest?.state).toBe('error');
      if (latest?.state !== 'error') throw new Error('spec bug: expected error state.');
      expect(latest.lastError).toContain('pull exploded');

      h.responder.list = () => ({ data: [], error: null });
      await runSyncCycle();
      expect(latest?.state).toBe('idle'); // recovers on the next cycle
    } finally {
      unsubscribe();
    }
  });
});

describe('runSyncCycle — offline → edit → online', () => {
  it('queues entries while signed out and pushes them once a session appears', async () => {
    h.session = null;
    await createEntity(db.categories, 'categories', {
      user_id: 'u_1',
      name: 'الفقه',
      icon: null,
    });
    expect(await db.outbox.count()).toBe(1);

    let latest: SyncStatus | null = null;
    const unsubscribe = subscribeSyncStatus((status) => {
      latest = status;
    });

    try {
      await runSyncCycle(); // offline pass touches nothing remote
      expect(h.calls).toHaveLength(0);
      expect(latest?.state).toBe('idle');

      h.session = { user: { id: 'u_1' } };
      h.responder.list = () => ({ data: [], error: null }); // pull sees nothing new
      h.responder.upsert = () => ({ data: null, error: null });
      await runSyncCycle(); // online pass drains the outbox

      const upsertCall = h.calls.find((call) => call.op === 'upsert');
      expect(upsertCall?.table).toBe('categories');
      expect(upsertCall && typeof upsertCall.arg === 'object').toBe(true);

      expect(await db.outbox.count()).toBe(0);
      const stored = await db.categories.limit(1).first();
      expect(stored?.dirty).toBe(false);
      expect(latest?.state).toBe('idle');
      expect(latest?.pendingCount).toBe(0);
    } finally {
      unsubscribe();
    }
  });

  it('reports the live pendingCount while a cycle is syncing', async () => {
    h.session = { user: { id: 'u_1' } };
    h.responder.list = () => ({ data: [], error: null });
    h.responder.upsert = () => ({ data: null, error: null });
    await queueOutbox({
      table_name: 'notes',
      op: 'insert',
      record_id: 'note_x',
      payload: { id: 'note_x', version: 1 },
    });

    const seen: SyncStatus[] = [];
    const unsubscribe = subscribeSyncStatus((status) => {
      seen.push(status);
    });
    try {
      await runSyncCycle();
      expect(seen.map((status) => status.state)).toEqual(['syncing', 'idle']);
      expect(seen[0]?.pendingCount).toBe(1);
      expect(seen.at(-1)?.pendingCount).toBe(0);
    } finally {
      unsubscribe();
    }
  });
});

describe('status notification resilience', () => {
  it('never lets a throwing subscriber break the cycle, recurse into catch, or starve other listeners', async () => {
    h.session = null;
    const seen: SyncStatus[] = [];
    const unsubscribeThrowing = subscribeSyncStatus(() => {
      throw new Error('subscriber exploded');
    });
    const unsubscribeHealthy = subscribeSyncStatus((status) => {
      seen.push(status);
    });

    try {
      // Resolves normally — a subscriber throw must not divert control
      // into the cycle's catch block (which would notify again).
      await expect(runSyncCycle()).resolves.toBeUndefined();

      expect(seen.map((status) => status.state)).toEqual(['syncing', 'idle']);
    } finally {
      unsubscribeThrowing();
      unsubscribeHealthy();
    }
  });
});

describe('startSyncEngine — lifecycle wiring', () => {
  /** Named mocks for the DOM globals, so assertions stay fully typed. */
  interface DomStubs {
    windowAddEventListener: Mock;
    windowRemoveEventListener: Mock;
    windowSetInterval: Mock;
    windowClearInterval: Mock;
    documentAddEventListener: Mock;
    documentRemoveEventListener: Mock;
    documentRef: { visibilityState: 'visible' | 'hidden' };
  }

  function stubDom(): DomStubs {
    const stubs = {
      windowAddEventListener: vi.fn(),
      windowRemoveEventListener: vi.fn(),
      windowSetInterval: vi.fn(() => 4242),
      windowClearInterval: vi.fn(),
      documentAddEventListener: vi.fn(),
      documentRemoveEventListener: vi.fn(),
      documentRef: { visibilityState: 'visible' } as DomStubs['documentRef'],
    };
    vi.stubGlobal('window', {
      addEventListener: stubs.windowAddEventListener,
      removeEventListener: stubs.windowRemoveEventListener,
      setInterval: stubs.windowSetInterval,
      clearInterval: stubs.windowClearInterval,
    });
    vi.stubGlobal('document', stubs.documentRef);
    Object.assign(stubs.documentRef, {
      addEventListener: stubs.documentAddEventListener,
      removeEventListener: stubs.documentRemoveEventListener,
    });
    return stubs;
  }

  it('registers online/visibility/interval triggers and removes exactly those on cleanup', () => {
    const dom = stubDom();

    const cleanup = startSyncEngine();
    const secondCleanup = startSyncEngine(); // idempotent start
    expect(secondCleanup).toBe(cleanup);
    expect(dom.windowAddEventListener).toHaveBeenCalledTimes(1);
    expect(dom.windowAddEventListener).toHaveBeenCalledWith(
      'online',
      expect.any(Function),
    );
    expect(dom.documentAddEventListener).toHaveBeenCalledTimes(1);
    expect(dom.documentAddEventListener).toHaveBeenCalledWith(
      'visibilitychange',
      expect.any(Function),
    );
    expect(dom.windowSetInterval).toHaveBeenCalledWith(expect.any(Function), CYCLE_INTERVAL_MS);

    cleanup();
    expect(dom.windowRemoveEventListener).toHaveBeenCalledTimes(1);
    expect(dom.documentRemoveEventListener).toHaveBeenCalledTimes(1);
    expect(dom.windowClearInterval).toHaveBeenCalledWith(4242);

    // Restarting after cleanup wires everything fresh again.
    const restarted = startSyncEngine();
    expect(dom.windowAddEventListener).toHaveBeenCalledTimes(2);
    restarted();
  });

  it('fires a cycle on the online event and on becoming visible — but not on hiding', async () => {
    const dom = stubDom();
    const cleanup = startSyncEngine();

    const onlineHandler = dom.windowAddEventListener.mock.calls[0]?.[1] as () => void;
    const visibilityHandler = dom.documentAddEventListener.mock.calls[0]?.[1] as () => void;

    h.session = null;
    const baseline = h.getSessionCalls;

    onlineHandler();
    await tickMacrotask();
    expect(h.getSessionCalls).toBe(baseline + 1);

    dom.documentRef.visibilityState = 'hidden';
    visibilityHandler();
    await tickMacrotask();
    expect(h.getSessionCalls).toBe(baseline + 1); // hidden → no cycle

    dom.documentRef.visibilityState = 'visible';
    visibilityHandler();
    await tickMacrotask();
    expect(h.getSessionCalls).toBe(baseline + 2);

    cleanup();
  });

  it('is a safe no-op without a DOM (SSR guard)', () => {
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('document', undefined);
    const cleanup = startSyncEngine();
    expect(() => cleanup()).not.toThrow();
  });
});

describe('queueOutbox — debounced post-mutation kick', () => {
  it('schedules exactly one cycle ~3s after the last mutation', async () => {
    stubDomMinimal();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      h.session = null;
      await queueOutbox({
        table_name: 'notes',
        op: 'insert',
        record_id: 'note_k',
        payload: { id: 'note_k', version: 1 },
      });
      await queueOutbox({
        table_name: 'media',
        op: 'insert',
        record_id: 'media_k',
        payload: { id: 'media_k', version: 1 },
      });

      const baseline = h.getSessionCalls;
      await vi.advanceTimersByTimeAsync(2900);
      expect(h.getSessionCalls).toBe(baseline); // still inside the debounce

      // Crossing the 3s boundary fires the kick, but Vitest's own module-
      // loader machinery cannot settle while timers are faked — real timers
      // must come back before the kicked cycle can be observed.
      await vi.advanceTimersByTimeAsync(200);
      expect(h.getSessionCalls).toBe(baseline); // import still settling
      vi.useRealTimers();

      const deadline = Date.now() + 5000;
      while (Date.now() < deadline && h.getSessionCalls !== baseline + 1) {
        await new Promise<void>((resolve) => setTimeout(resolve, 10));
      }
      expect(h.getSessionCalls).toBe(baseline + 1); // one kick for both mutations
    } finally {
      vi.useRealTimers();
    }
  });

  /** Only `typeof window` matters here; the engine itself is not wired. */
  function stubDomMinimal(): void {
    vi.stubGlobal('window', {});
  }
});
