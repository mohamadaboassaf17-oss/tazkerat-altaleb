import 'fake-indexeddb/auto';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalNote } from '../types/models';
import { db } from './db';
import { PAGE_SIZE, pullChanges } from './sync-pull';
import {
  getSupabaseMockHarness,
  makeError,
  resetSupabaseMockHarness,
  type RecordedCall,
} from './testing/mock-supabase';

/**
 * Unit tests for the pull half of the M5 engine over a faked IndexedDB and
 * a controllable supabase-js mock: cursors, pagination, reconciliation
 * rules, and wiki-link re-derivation for pulled notes.
 */

/**
 * The shared mock builder predates pull-side offset pagination and has no
 * `.range()`. Augment the freshly built chain in place so the pull layer
 * can call it without editing testing/mock-supabase.ts; like every other
 * builder method, `range` returns the same chain, and page bounds carry no
 * meaning for the in-memory mock — the responder decides contents per
 * call count instead.
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

const USER_ID = 'u_1';
const T0 = '2026-08-01T00:00:00.000Z';
const T1 = '2026-08-02T00:00:00.000Z';
const T2 = '2026-08-03T00:00:00.000Z';

/** Configure per-table list responses; unlisted tables return empty batches. */
function respondLists(tables: Record<string, unknown[]>): void {
  h.responder.list = (table) => ({ data: tables[table] ?? [], error: null });
}

function cloudCategory(version: number, updatedAt: string): Record<string, unknown> {
  return {
    id: 'cat_1',
    user_id: USER_ID,
    name: 'العقيدة',
    icon: null,
    created_at: T0,
    updated_at: updatedAt,
    version,
  };
}

function cloudNote(
  overrides: Partial<Record<string, unknown>> & { id: string; version: number },
): Record<string, unknown> {
  return {
    user_id: USER_ID,
    book_id: null,
    lecture_id: null,
    title: 'عنوان',
    content: 'متن الملاحظة',
    note_type: 'benefit',
    review_date: '2026-09-01',
    ease_factor: 2.5,
    interval_days: 0,
    repetitions: 0,
    is_public: false,
    created_at: T0,
    updated_at: T1,
    ...overrides,
  };
}

function localNote(id: string, fields: Partial<LocalNote>): LocalNote {
  return {
    id,
    user_id: USER_ID,
    book_id: null,
    lecture_id: null,
    title: 'محلي',
    content: 'متن محلي',
    type: 'question',
    review_date: '2026-09-10',
    ease_factor: 2.5,
    interval_days: 0,
    repetitions: 0,
    is_public: false,
    created_at: T0,
    updated_at: T0,
    version: 2,
    dirty: false,
    server_version: 2,
    ...fields,
  };
}

function listCalls(table: string): RecordedCall[] {
  return h.calls.filter((call) => call.op === 'list' && call.table === table);
}

async function cursorFor(table: string): Promise<string | undefined> {
  const row = await db.sync_meta.get(`pull_cursor_${USER_ID}_${table}`);
  return row?.value;
}

beforeEach(async () => {
  resetSupabaseMockHarness();
  respondLists({});
  await db.delete();
  await db.open();
});

describe('pullChanges — cursors', () => {
  it('performs a full fetch when no cursor exists, then advances the cursor to max updated_at', async () => {
    respondLists({ categories: [cloudCategory(1, T1), cloudCategory(2, T2)] });

    const result = await pullChanges(USER_ID);

    expect(result).toEqual({ pulled: 2 });
    expect(await cursorFor('categories')).toBe(T2);
    // Tables whose batch was empty keep no cursor at all.
    expect(await cursorFor('users')).toBeUndefined();
    expect(listCalls('categories')).toHaveLength(1);
    expect(listCalls('categories')[0]?.gte).toBeNull(); // unfiltered
  });

  it('uses the gte overlap window on subsequent pulls and keeps the cursor on empty batches', async () => {
    respondLists({ categories: [cloudCategory(1, T1)] });
    await pullChanges(USER_ID);

    respondLists({});
    await pullChanges(USER_ID);

    const calls = listCalls('categories');
    expect(calls).toHaveLength(2);
    expect(calls[1]?.gte).toBe(new Date(Date.parse(T1) - 5000).toISOString());
    expect(await cursorFor('categories')).toBe(T1);
  });

  it('leaves the cursor untouched when a table returns an empty batch from the start', async () => {
    respondLists({});
    const result = await pullChanges(USER_ID);
    expect(result).toEqual({ pulled: 0 });
    expect(await db.sync_meta.count()).toBe(0);
  });
});

describe('pullChanges — pagination', () => {
  /** A batch of distinct category rows whose ids start at `start`. */
  function categoryBatch(start: number, count: number): Record<string, unknown>[] {
    return Array.from({ length: count }, (_unused, index) => {
      const ordinal = start + index;
      return {
        id: `cat_${ordinal}`,
        user_id: USER_ID,
        name: `فئة ${ordinal}`,
        icon: null,
        created_at: T0,
        updated_at: T1,
        version: 1 + (ordinal % 900),
      };
    });
  }

  it('requests a second page after a full PAGE_SIZE page, reconciles everything, and advances the cursor once', async () => {
    let categoryRequests = 0;
    h.responder.list = (table) => {
      if (table !== 'categories') {
        return { data: [], error: null };
      }
      categoryRequests += 1;
      return categoryRequests === 1
        ? { data: categoryBatch(0, PAGE_SIZE), error: null }
        : { data: categoryBatch(PAGE_SIZE, 3), error: null };
    };

    const result = await pullChanges(USER_ID);

    expect(result).toEqual({ pulled: PAGE_SIZE + 3 });
    expect(listCalls('categories')).toHaveLength(2); // two paginated requests
    expect(await db.categories.count()).toBe(PAGE_SIZE + 3); // nothing truncated away
    // Exactly one cursor advance, past every fetched row.
    expect(await db.sync_meta.count()).toBe(1);
    expect(await cursorFor('categories')).toBe(T1);
  });

  it('aborts without advancing the cursor when a later page fails', async () => {
    let booksRequests = 0;
    h.responder.list = (table) => {
      if (table !== 'books') {
        return { data: [], error: null };
      }
      booksRequests += 1;
      return booksRequests === 1
        ? { data: categoryBatch(0, PAGE_SIZE), error: null }
        : { data: null, error: makeError('XX000', 'page two exploded') };
    };

    await expect(pullChanges(USER_ID)).rejects.toThrow(/books.*page two exploded/s);

    expect(listCalls('books')).toHaveLength(2);
    // Partial page-one data must not leak into a cursor advance.
    expect(await db.books.count()).toBe(0);
    expect(await cursorFor('books')).toBeUndefined();
  });
});

describe('pullChanges — reconciliation', () => {
  it('never clobbers a dirty local row, even when the server row has a higher version', async () => {
    await db.notes.put(localNote('note_1', { dirty: true, server_version: 1 }));
    respondLists({
      notes: [cloudNote({ id: 'note_1', version: 9, content: 'من الخادم' })],
    });

    const result = await pullChanges(USER_ID);

    expect(result).toEqual({ pulled: 0 });
    const stored = await db.notes.get('note_1');
    expect(stored?.content).toBe('متن محلي');
    expect(stored?.dirty).toBe(true);
    expect(stored?.version).toBe(2);
    // The row was still fetched — the cursor advances past it.
    expect(await cursorFor('notes')).toBe(T1);
  });

  it('replaces a stale clean row when the server version is higher, mapping note_type back', async () => {
    await db.notes.put(localNote('note_1', {}));
    respondLists({
      notes: [
        cloudNote({
          id: 'note_1',
          version: 9,
          content: 'من الخادم',
          title: 'من الخادم',
          note_type: 'rule',
        }),
      ],
    });

    const result = await pullChanges(USER_ID);

    expect(result).toEqual({ pulled: 1 });
    const stored = await db.notes.get('note_1');
    expect(stored?.content).toBe('من الخادم');
    expect(stored?.type).toBe('rule');
    expect(stored).not.toHaveProperty('note_type');
    expect(stored?.dirty).toBe(false);
    expect(stored?.server_version).toBe(9);
    expect(stored?.version).toBe(9);
  });

  it('skips an equal-version clean row without writing anything', async () => {
    await db.notes.put(localNote('note_1', {}));
    respondLists({
      notes: [cloudNote({ id: 'note_1', version: 2, content: 'تغيير مرفوض' })],
    });

    expect(await pullChanges(USER_ID)).toEqual({ pulled: 0 });
    expect((await db.notes.get('note_1'))?.content).toBe('متن محلي');
  });

  it('throws an explicit error when one table query fails', async () => {
    h.responder.list = (table) =>
      table === 'books'
        ? { data: null, error: makeError('XX000', 'RLS violation') }
        : { data: [], error: null };

    await expect(pullChanges(USER_ID)).rejects.toThrow(/books.*RLS violation/s);
  });
});

describe('pullChanges — note_links derivation (D10)', () => {
  it('creates edges for pulled notes only toward existing targets, skipping self and dangling ids', async () => {
    await db.notes.put(localNote('note_b', { content: 'هدف ب' }));
    await db.notes.put(localNote('note_c', { content: 'هدف ج' }));
    respondLists({
      notes: [
        cloudNote({
          id: 'note_a',
          version: 4,
          content: 'انظر [[note_b|ب]] و[[note_c]] و[[note_a]] و[[ghost_id]]',
        }),
      ],
    });

    await pullChanges(USER_ID);

    const edges = await db.note_links.toArray();
    expect(edges).toHaveLength(2);
    expect(edges.map((edge) => `${edge.source_note_id}->${edge.target_note_id}`).sort()).toEqual([
      'note_a->note_b',
      'note_a->note_c',
    ]);
  });

  it('deletes removed edges on the next pull of the same note', async () => {
    await db.notes.put(localNote('note_b', { content: 'هدف ب' }));
    respondLists({
      notes: [cloudNote({ id: 'note_a', version: 4, content: 'رابط [[note_b]]' })],
    });
    await pullChanges(USER_ID);
    expect(await db.note_links.count()).toBe(1);

    respondLists({
      notes: [
        cloudNote({ id: 'note_a', version: 5, content: 'بدون روابط الآن', updated_at: T2 }),
      ],
    });
    const result = await pullChanges(USER_ID);

    expect(result).toEqual({ pulled: 1 });
    expect(await db.note_links.where('source_note_id').equals('note_a').count()).toBe(0);
    expect(await db.note_links.count()).toBe(0);
  });

  it('does not derive links for notes that were skipped by reconciliation', async () => {
    await db.notes.put(localNote('note_1', { dirty: true }));
    respondLists({
      notes: [cloudNote({ id: 'note_1', version: 9, content: '[[note_b]]' })],
    });

    await pullChanges(USER_ID);

    expect(await db.note_links.count()).toBe(0);
  });

  it('commits note writes and their edges together — a link-rebuild crash rolls the note back', async () => {
    await db.notes.put(localNote('note_b', { content: 'هدف ب' }));
    respondLists({
      notes: [cloudNote({ id: 'note_a', version: 4, content: 'رابط [[note_b]]' })],
    });

    const bulkAddSpy = vi
      .spyOn(db.note_links, 'bulkAdd')
      .mockRejectedValue(new Error('simulated crash'));
    try {
      await expect(pullChanges(USER_ID)).rejects.toThrow('simulated crash');
    } finally {
      bulkAddSpy.mockRestore();
    }

    // Atomic rollback: neither the pulled note nor any edge survived.
    expect(await db.notes.get('note_a')).toBeUndefined();
    expect(await db.note_links.count()).toBe(0);
  });
});
