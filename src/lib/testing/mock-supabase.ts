import type { PostgrestError } from '@supabase/supabase-js';

/**
 * Shared, controllable mock of `src/lib/supabase.ts` for sync-engine specs.
 *
 * The mock reproduces just enough of supabase-js v2 to drive the M5 layer:
 * a chainable query builder (`from().select().gte().eq().single()` /
 * `.upsert()` / `.delete()`) that resolves like the real builder (a
 * thenable resolving `{ data, error }`), plus an auth stub.
 *
 * Usage in a spec file — the factory must be wired through a dynamic import
 * because vi.mock factories are hoisted above module imports:
 *
 *   const h = getSupabaseMockHarness();          // normal import, used in tests
 *   vi.mock('./supabase', () =>
 *     import('./testing/mock-supabase').then((m) => m.supabaseModuleMock()),
 *   );
 */

/** Minimal session shape consumed by the sync layer (only `user.id`). */
export interface FakeSession {
  user: { id: string };
}

/** `{ data, error }` pair exactly as supabase-js builders resolve. */
export interface QueryResponse {
  data?: unknown;
  error?: PostgrestError | null;
}

/** Which terminal operation a chainable query ended with. */
type TerminalOp = 'upsert' | 'delete' | 'single' | 'list';

/** Per-operation responders; throwing inside one simulates a network error. */
export interface ResponderMap {
  upsert?: (table: string, payload: Record<string, unknown>) => QueryResponse | Promise<QueryResponse>;
  delete?: (table: string, id: string) => QueryResponse | Promise<QueryResponse>;
  single?: (table: string, id: string) => QueryResponse | Promise<QueryResponse>;
  list?: (table: string, gteUpdatedAfter: string | null) => QueryResponse | Promise<QueryResponse>;
}

/** One recorded terminal operation, for assertions. */
export interface RecordedCall {
  op: TerminalOp;
  table: string;
  /** Upsert payload or the `eq('id', …)` value. */
  arg?: unknown;
  /** `gte('updated_at', …)` filter value; null when the query was unfiltered. */
  gte?: string | null;
}

/** Mutable state shared between the spec and the mocked client. */
export interface SupabaseMockHarness {
  session: FakeSession | null;
  responder: ResponderMap;
  calls: RecordedCall[];
  getSessionCalls: number;
  /**
   * When set, `getSession()` awaits it before returning — lets specs freeze
   * a cycle mid-flight to prove concurrent calls coalesce.
   */
  sessionGate: Promise<void> | null;
}

let harness: SupabaseMockHarness | null = null;

/** Lazily created per-spec-file harness singleton. */
export function getSupabaseMockHarness(): SupabaseMockHarness {
  if (harness === null) {
    harness = createHarness();
  }
  return harness;
}

/** Reset all mutable mock state (call in `beforeEach`). */
export function resetSupabaseMockHarness(): void {
  const current = getSupabaseMockHarness();
  current.session = null;
  current.responder = {};
  current.calls = [];
  current.getSessionCalls = 0;
  current.sessionGate = null;
}

function createHarness(): SupabaseMockHarness {
  return { session: null, responder: {}, calls: [], getSessionCalls: 0, sessionGate: null };
}

/** Module shape returned by the `vi.mock('./supabase', …)` factory. */
export function supabaseModuleMock(): { supabase: unknown } {
  return { supabase: buildClient(getSupabaseMockHarness()) };
}

function buildClient(h: SupabaseMockHarness): Record<string, unknown> {
  return {
    auth: {
      getSession: async (): Promise<{ data: { session: FakeSession | null }; error: null }> => {
        h.getSessionCalls += 1;
        if (h.sessionGate !== null) {
          await h.sessionGate;
        }
        return { data: { session: h.session }, error: null };
      },
    },
    from: (table: string): unknown => buildChain(table, h),
  };
}

interface PendingQuery {
  terminal?: TerminalOp;
  payload?: unknown;
  id?: unknown;
  gte?: string | null;
}

/** Shape of the chainable query builder handed back by `from()`. */
interface QueryChain {
  upsert(payload: unknown): QueryChain;
  delete(): QueryChain;
  select(): QueryChain;
  gte(column: string, value: string): QueryChain;
  eq(column: string, id: unknown): QueryChain;
  single(): QueryChain;
  then<TResult1, TResult2>(
    onFulfilled?: (value: QueryResponse) => TResult1 | PromiseLike<TResult1>,
    onRejected?: (reason: unknown) => TResult2 | PromiseLike<TResult2>,
  ): Promise<TResult1 | TResult2>;
  catch(onRejected: (reason: unknown) => unknown): Promise<unknown>;
}

function buildChain(table: string, h: SupabaseMockHarness): QueryChain {
  const pending: PendingQuery = {};
  const chain: QueryChain = {
    upsert(payload: unknown): typeof chain {
      pending.terminal = 'upsert';
      pending.payload = payload;
      return chain;
    },
    delete(): typeof chain {
      pending.terminal = 'delete';
      return chain;
    },
    select(): typeof chain {
      if (pending.terminal === undefined) {
        pending.terminal = 'list';
      }
      return chain;
    },
    gte(_column: string, value: string): typeof chain {
      pending.gte = value;
      return chain;
    },
    eq(_column: string, id: unknown): typeof chain {
      pending.id = id;
      return chain;
    },
    single(): typeof chain {
      pending.terminal = 'single';
      return chain;
    },
    then<TResult1, TResult2>(
      onFulfilled?: (value: QueryResponse) => TResult1 | PromiseLike<TResult1>,
      onRejected?: (reason: unknown) => TResult2 | PromiseLike<TResult2>,
    ): Promise<TResult1 | TResult2> {
      return dispatch(table, pending, h).then(onFulfilled, onRejected);
    },
    catch(onRejected: (reason: unknown) => unknown): Promise<unknown> {
      const settled: Promise<unknown> = (async () => {
        try {
          return await dispatch(table, pending, h);
        } catch (reason: unknown) {
          return onRejected(reason);
        }
      })();
      return settled;
    },
  };
  return chain;
}

async function dispatch(
  table: string,
  pending: PendingQuery,
  h: SupabaseMockHarness,
): Promise<QueryResponse> {
  const terminal = pending.terminal ?? 'list';
  h.calls.push({
    op: terminal,
    table,
    ...(terminal === 'upsert' ? { arg: pending.payload } : {}),
    ...(terminal === 'delete' || terminal === 'single' ? { arg: pending.id } : {}),
    ...(terminal === 'list' ? { gte: pending.gte ?? null } : {}),
  });

  const responder =
    terminal === 'upsert'
      ? h.responder.upsert
      : terminal === 'delete'
        ? h.responder.delete
        : terminal === 'single'
          ? h.responder.single
          : h.responder.list;

  if (responder === undefined) {
    return {
      data: null,
      error: errorWithMessage(
        `mock-supabase: no "${terminal}" responder registered for "${table}".`,
      ),
    };
  }

  switch (terminal) {
    case 'upsert':
      return responder(table, pending.payload as Record<string, unknown>);
    case 'delete':
      return responder(table, String(pending.id));
    case 'single':
      return responder(table, String(pending.id));
    case 'list':
      return responder(table, pending.gte ?? null);
  }
}

/** Build a PostgrestError-shaped failure for responders. */
export function makeError(code: string, message: string): PostgrestError {
  return { code, details: null, hint: null, message };
}

/** Convenience wrapper for responder errors that only need a message. */
export function errorWithMessage(message: string): PostgrestError {
  return makeError('MOCK_ERROR', message);
}
