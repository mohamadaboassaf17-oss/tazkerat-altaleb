import 'fake-indexeddb/auto';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalCategory, CloudBook, LocalNote } from '../types/models';
import { db } from './db';
import {
  BASE_BACKOFF_MS,
  MAX_BACKOFF_MS,
  backoffMs,
  pushOutbox,
} from './sync-push';
import {
  errorWithMessage,
  getSupabaseMockHarness,
  makeError,
  resetSupabaseMockHarness,
} from './testing/mock-supabase';

/**
 * Unit tests for the push half of the M5 engine over a faked IndexedDB and
 * a fully controllable supabase-js mock. The `db` singleton is created at
 * import time, so every test starts from an empty database by deleting and
 * reopening it.
 */

vi.mock('./supabase', () =>
  import('./testing/mock-supabase').then((m) => m.supabaseModuleMock()),
);

const h = getSupabaseMockHarness();

const NOW = '2026-08-25T10:00:00.000Z';

function categoryPayload(version = 3): Record<string, unknown> {
  return {
    id: 'cat_1',
    user_id: 'u_1',
    name: 'العقيدة',
    icon: null,
    created_at: NOW,
    updated_at: NOW,
    version,
  };
}

function localCategory(dirty = true, serverVersion = 2): LocalCategory {
  return {
    ...(categoryPayload() as Omit<LocalCategory, 'dirty' | 'server_version'>),
    version: 3,
    dirty,
    server_version: serverVersion,
  };
}

/** Locally shaped note payload — carries the TS discriminator field `type`. */
function notePayload(version = 4): Record<string, unknown> {
  return {
    id: 'note_1',
    user_id: 'u_1',
    book_id: 'book_1',
    lecture_id: null,
    title: 'فائدة عن النية',
    content: 'متن الملاحظة',
    type: 'memorization',
    review_date: '2026-09-01',
    is_public: false,
    created_at: NOW,
    updated_at: NOW,
    version,
  };
}

/** Cloud-shaped book payload used to test multi-entry passes. */
const BOOK_PAYLOAD = {
  id: 'book_1',
  user_id: 'u_1',
  category_id: 'cat_1',
  title: 'الأصول الثلاثة',
  total_pages: 40,
  current_page: 7,
  last_opened_at: NOW,
  created_at: NOW,
  updated_at: NOW,
  version: 1,
} satisfies CloudBook;

async function seedLocalRow(row: LocalCategory): Promise<void> {
  await db.categories.put(row);
}

async function queueInsert(payload: Record<string, unknown>): Promise<void> {
  await db.outbox.add({
    table_name: 'categories',
    op: 'insert',
    record_id: String(payload['id']),
    payload,
    queued_at: NOW,
  });
}

/** Sorted key set of an opaque value — proves nothing was added or removed. */
function keysOf(value: unknown): string[] {
  return value !== null && typeof value === 'object' ? Object.keys(value).sort() : [];
}

async function outboxEntry(): Promise<{ attempts?: number; next_attempt_at?: string | null; last_error?: string | null }> {
  const entry = await db.outbox.get(1);
  if (entry === undefined) {
    throw new Error('spec bug: expected the first outbox entry to exist.');
  }
  return entry;
}

beforeEach(async () => {
  resetSupabaseMockHarness();
  await db.delete();
  await db.open();
});

describe('pushOutbox — success paths', () => {
  it('flushes an insert, clears the entry, and marks the local row clean in one pass', async () => {
    h.session = { user: { id: 'u_1' } };
    h.responder.upsert = () => ({ data: null, error: null });
    await seedLocalRow(localCategory());
    await queueInsert(categoryPayload());

    const result = await pushOutbox();

    expect(result).toEqual({ pushed: 1, failed: false });
    expect(await db.outbox.count()).toBe(0);
    // Payload went verbatim from the entry — no row re-read.
    expect(h.calls).toEqual([
      { op: 'upsert', table: 'categories', arg: categoryPayload() },
    ]);

    const stored = await db.categories.get('cat_1');
    expect(stored?.dirty).toBe(false);
    expect(stored?.server_version).toBe(3);
    expect(stored?.version).toBe(3);
  });

  it('treats a delete affecting zero rows as success and drops the entry', async () => {
    h.session = { user: { id: 'u_1' } };
    h.responder.delete = () => ({ data: [], error: null });
    await db.outbox.add({
      table_name: 'categories',
      op: 'delete',
      record_id: 'gone_row',
      payload: null,
      queued_at: NOW,
    });

    const result = await pushOutbox();

    expect(result).toEqual({ pushed: 1, failed: false });
    expect(await db.outbox.count()).toBe(0);
    expect(h.calls).toEqual([{ op: 'delete', table: 'categories', arg: 'gone_row' }]);
  });

  it('is a no-op that touches nothing when there is no session', async () => {
    await queueInsert(categoryPayload());
    let called = false;
    h.responder.upsert = () => {
      called = true;
      return { data: null, error: null };
    };

    const result = await pushOutbox();

    expect(result).toEqual({ pushed: 0, failed: false });
    expect(called).toBe(false);
    expect(h.calls).toHaveLength(0);
    expect(await db.outbox.count()).toBe(1);
  });
});

describe('pushOutbox — payload serialization (cloud column mapping)', () => {
  it('maps a queued notes payload onto SQL columns — note_type rides the wire, type never does', async () => {
    h.session = { user: { id: 'u_1' } };
    h.responder.upsert = () => ({ data: null, error: null });
    await db.notes.put({
      ...(notePayload() as Omit<LocalNote, 'dirty' | 'server_version'>),
      dirty: true,
      server_version: 3,
    });
    await db.outbox.add({
      table_name: 'notes',
      op: 'insert',
      record_id: 'note_1',
      payload: notePayload(),
      queued_at: NOW,
    });

    const result = await pushOutbox();

    expect(result).toEqual({ pushed: 1, failed: false });
    expect(await db.outbox.count()).toBe(0);
    expect(h.calls.map((call) => ({ op: call.op, table: call.table }))).toEqual([
      { op: 'upsert', table: 'notes' },
    ]);

    // The renamed discriminator column reached the wire; the TS name did not.
    const sent = h.calls[0]?.arg;
    expect(sent).toHaveProperty('note_type', 'memorization');
    expect(sent).not.toHaveProperty('type');
    expect(sent).toEqual({
      id: 'note_1',
      user_id: 'u_1',
      book_id: 'book_1',
      lecture_id: null,
      title: 'فائدة عن النية',
      content: 'متن الملاحظة',
      note_type: 'memorization',
      review_date: '2026-09-01',
      is_public: false,
      created_at: NOW,
      updated_at: NOW,
      version: 4,
    });

    // `version` survives the mapping — the DB conflict guard depends on it.
    const stored = await db.notes.get('note_1');
    expect(stored?.dirty).toBe(false);
    expect(stored?.server_version).toBe(4);
  });

  it('pushes a pass-through table payload through unchanged — no keys added or removed', async () => {
    h.session = { user: { id: 'u_1' } };
    h.responder.upsert = () => ({ data: null, error: null });
    const queued = categoryPayload();
    await seedLocalRow(localCategory());
    await queueInsert(queued);

    const result = await pushOutbox();

    expect(result).toEqual({ pushed: 1, failed: false });
    expect(h.calls).toHaveLength(1);
    const sent = h.calls[0]?.arg;
    expect(sent).toEqual(queued);
    expect(keysOf(sent)).toEqual(keysOf(queued));
  });
});

describe('pushOutbox — conflict adoption', () => {
  it('adopts the server row on SYNC_CONFLICT and resolves the entry without failing', async () => {
    h.session = { user: { id: 'u_1' } };
    h.responder.upsert = () => ({
      data: null,
      error: makeError('P0001', 'SYNC_CONFLICT|7'),
    });
    const serverRow = { ...categoryPayload(7), name: 'اسم من الخادم' };
    h.responder.single = () => ({ data: serverRow, error: null });
    await seedLocalRow(localCategory());
    await queueInsert(categoryPayload());

    const result = await pushOutbox();

    expect(result).toEqual({ pushed: 0, failed: false });
    expect(await db.outbox.count()).toBe(0);
    expect(h.calls.map((call) => call.op)).toEqual(['upsert', 'single']);

    const stored = await db.categories.get('cat_1');
    expect(stored?.name).toBe('اسم من الخادم');
    expect(stored?.version).toBe(7);
    expect(stored?.server_version).toBe(7);
    expect(stored?.dirty).toBe(false);
  });

  it('adopts on a 23505 unique violation during insert when the server row is at least as new', async () => {
    h.session = { user: { id: 'u_1' } };
    h.responder.upsert = () => ({
      data: null,
      error: makeError('23505', 'duplicate key value violates unique constraint'),
    });
    h.responder.single = () => ({
      data: { ...categoryPayload(5), name: 'من الخادم' },
      error: null,
    });
    await seedLocalRow(localCategory());
    await queueInsert(categoryPayload());

    const result = await pushOutbox();

    expect(result).toEqual({ pushed: 0, failed: false });
    expect(await db.outbox.count()).toBe(0);
    const stored = await db.categories.get('cat_1');
    expect(stored?.name).toBe('من الخادم');
    expect(stored?.server_version).toBe(5);
    expect(stored?.dirty).toBe(false);
  });
});

describe('pushOutbox — transient failures', () => {
  it('records attempts/backoff on a network throw and stops the rest of the pass', async () => {
    h.session = { user: { id: 'u_1' } };
    let upsertCalls = 0;
    h.responder.upsert = () => {
      upsertCalls += 1;
      if (upsertCalls === 1) {
        throw new TypeError('fetch failed');
      }
      return { data: null, error: null };
    };
    await seedLocalRow(localCategory());
    await queueInsert(categoryPayload());
    await db.books.put({
      ...BOOK_PAYLOAD,
      dirty: true,
      server_version: 0,
    });
    await db.outbox.add({
      table_name: 'books',
      op: 'insert',
      record_id: 'book_1',
      payload: BOOK_PAYLOAD,
      queued_at: NOW,
    });

    const before = Date.now();
    const result = await pushOutbox();

    expect(result).toEqual({ pushed: 0, failed: true });
    expect(upsertCalls).toBe(1); // second entry never attempted

    const entry = await outboxEntry();
    expect(entry.attempts).toBe(1);
    expect(entry.last_error).toBe('fetch failed');
    const delta = Date.parse(entry.next_attempt_at ?? '') - before;
    expect(delta).toBeGreaterThanOrEqual(BASE_BACKOFF_MS * 0.8 - 50);
    expect(delta).toBeLessThanOrEqual(BASE_BACKOFF_MS * 1.2 + 50);
  });

  it('treats resolved non-conflict errors (e.g. 500) as transient', async () => {
    h.session = { user: { id: 'u_1' } };
    h.responder.upsert = () => ({
      data: null,
      error: makeError('XX000', 'Internal Server Error'),
    });
    await seedLocalRow(localCategory());
    await queueInsert(categoryPayload());

    const result = await pushOutbox();

    expect(result).toEqual({ pushed: 0, failed: true });
    const entry = await outboxEntry();
    expect(entry.attempts).toBe(1);
    expect(entry.next_attempt_at).toBeTruthy();
  });

  it('keeps a racing-insert 23505 transient when the server row is older than ours', async () => {
    h.session = { user: { id: 'u_1' } };
    h.responder.upsert = () => ({
      data: null,
      error: makeError('23505', 'duplicate key'),
    });
    h.responder.single = () => ({
      data: categoryPayload(2), // older than payload version 3
      error: null,
    });
    await seedLocalRow(localCategory());
    await queueInsert(categoryPayload());

    const result = await pushOutbox();

    expect(result).toEqual({ pushed: 0, failed: true });
    const entry = await outboxEntry();
    expect(entry.attempts).toBe(1);
    const stored = await db.categories.get('cat_1');
    expect(stored?.name).toBe('العقيدة'); // untouched
  });

  it('stops the whole pass at the first entry whose next_attempt_at is in the future', async () => {
    h.session = { user: { id: 'u_1' } };
    let called = false;
    h.responder.upsert = () => {
      called = true;
      return { data: null, error: null };
    };
    await db.outbox.add({
      table_name: 'categories',
      op: 'insert',
      record_id: 'cat_1',
      payload: categoryPayload(),
      queued_at: NOW,
      attempts: 2,
      next_attempt_at: new Date(Date.now() + 60_000).toISOString(),
      last_error: 'earlier failure',
    });
    await queueInsert({ ...BOOK_PAYLOAD }); // ready, but behind the blocked one

    const result = await pushOutbox();

    expect(result).toEqual({ pushed: 0, failed: false });
    expect(called).toBe(false);
    expect(h.calls).toHaveLength(0);
    expect(await db.outbox.count()).toBe(2);
  });
});

describe('backoffMs', () => {
  it('stays within ±20% of the exponential schedule for the first attempt', () => {
    for (let sample = 0; sample < 200; sample += 1) {
      const delay = backoffMs(1);
      expect(delay).toBeGreaterThanOrEqual(BASE_BACKOFF_MS * 0.8);
      expect(delay).toBeLessThanOrEqual(BASE_BACKOFF_MS * 1.2);
    }
  });

  it('stays within ±20% of the uncapped exponential base at every attempt count', () => {
    for (const attempts of [1, 3, 5, 12]) {
      const expectedBase = Math.min(
        BASE_BACKOFF_MS * 2 ** (attempts - 1),
        MAX_BACKOFF_MS,
      );
      for (let sample = 0; sample < 200; sample += 1) {
        const delay = backoffMs(attempts);
        expect(delay).toBeGreaterThanOrEqual(expectedBase * 0.8);
        expect(delay).toBeLessThanOrEqual(expectedBase * 1.2);
      }
    }
  });

  it('grows exponentially before hitting the cap (midpoint sanity)', () => {
    // attempts=3 → base 4000ms; jittered value must stay well under attempts=4's cap.
    for (let sample = 0; sample < 200; sample += 1) {
      const delay = backoffMs(3);
      expect(delay).toBeGreaterThanOrEqual(4000 * 0.8);
      expect(delay).toBeLessThanOrEqual(4000 * 1.2);
    }
  });

  it('rejects a malformed resolved error shape loudly instead of looping silently', async () => {
    // A resolved error whose message is empty still counts as transient
    // (recorded), proving no code path assumes conflict semantics.
    h.session = { user: { id: 'u_1' } };
    h.responder.upsert = () => ({ data: null, error: errorWithMessage('') });
    await seedLocalRow(localCategory());
    await queueInsert(categoryPayload());

    const result = await pushOutbox();
    expect(result.failed).toBe(true);
    const entry = await outboxEntry();
    expect(entry.attempts).toBe(1);
  });
});
