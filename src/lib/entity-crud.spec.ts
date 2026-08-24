import 'fake-indexeddb/auto';

import { beforeEach, describe, expect, it } from 'vitest';
import type { Table } from 'dexie';
import type { LocalBook, LocalCategory, LocalLecturer, OutboxEntry } from '../types/models';
import { db } from './db';
import { createEntity, deleteEntity, touchBookOpened, updateEntity } from './entity-crud';

/**
 * Unit tests for the shared local-first mutation pipeline over a faked
 * IndexedDB. The `db` singleton from './db' is created at import time, so
 * every test starts from an empty database by deleting and reopening it.
 */

/** Caller-supplied columns for each hierarchy entity (stamps excluded). */
type CategoryInput = Omit<
  LocalCategory,
  'id' | 'created_at' | 'updated_at' | 'version' | 'dirty' | 'server_version'
>;
type BookInput = Omit<
  LocalBook,
  'id' | 'created_at' | 'updated_at' | 'version' | 'dirty' | 'server_version'
>;
type LecturerInput = Omit<
  LocalLecturer,
  'id' | 'created_at' | 'updated_at' | 'version' | 'dirty' | 'server_version'
>;

function makeCategoryFields(): CategoryInput {
  return { user_id: 'user_1', name: 'العقيدة', icon: null };
}

function makeBookFields(): BookInput {
  return {
    user_id: 'user_1',
    category_id: 'category_1',
    title: 'الأصول الثلاثة',
    total_pages: 120,
    current_page: 1,
    last_opened_at: '2026-01-01T00:00:00.000Z',
  };
}

function makeLecturerFields(): LecturerInput {
  return { user_id: 'user_1', book_id: 'book_1', name: 'الشيخ صالح الفوزان' };
}

function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/** Fetch a row by id, failing loudly instead of leaking `undefined`. */
async function getOrFail<T>(table: Table<T, string>, id: string): Promise<T> {
  const row = await table.get(id);
  if (row === undefined) {
    throw new Error(`Expected a row with id "${id}" in table "${String(table.name)}".`);
  }
  return row;
}

/** Narrow a list to its single element (strict-safe under indexed access). */
function single<T>(rows: readonly T[]): T {
  expect(rows).toHaveLength(1);
  const row = rows[0];
  if (row === undefined) {
    throw new Error('Expected exactly one element.');
  }
  return row;
}

async function outboxEntries(): Promise<OutboxEntry[]> {
  return db.outbox.toArray();
}

/** The sole outbox entry currently queued. */
async function onlyOutboxEntry(): Promise<OutboxEntry> {
  return single(await outboxEntries());
}

/** Cloud-shaped payloads are opaque `unknown` until narrowed here. */
function asPayload(entry: OutboxEntry): Record<string, unknown> {
  return entry.payload as Record<string, unknown>;
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('createEntity', () => {
  it('stamps a new row with sync bookkeeping and lands it in the target table', async () => {
    await createEntity(db.categories, 'categories', makeCategoryFields());

    expect(await db.categories.count()).toBe(1);
    const insertEntry = await onlyOutboxEntry();
    const stored = await getOrFail(db.categories, insertEntry.record_id);

    expect(stored.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(Number.isNaN(Date.parse(stored.created_at))).toBe(false);
    expect(stored.created_at).toBe(stored.updated_at);
    expect(stored.version).toBe(1);
    expect(stored.dirty).toBe(true);
    expect(stored.server_version).toBe(0);

    expect(stored.user_id).toBe('user_1');
    expect(stored.name).toBe('العقيدة');
    expect(stored.icon).toBeNull();
  });

  it('queues an insert outbox entry whose payload is cloud-shaped', async () => {
    await createEntity(db.categories, 'categories', makeCategoryFields());

    const entry = await onlyOutboxEntry();
    expect(entry.table_name).toBe('categories');
    expect(entry.op).toBe('insert');

    const payload = asPayload(entry);
    expect(payload.user_id).toBe('user_1');
    expect(payload.name).toBe('العقيدة');
    expect(payload.icon).toBeNull();

    const stored = await getOrFail(db.categories, entry.record_id);
    expect(payload.id).toBe(stored.id);
    expect(payload.created_at).toBe(stored.created_at);
    expect(payload.updated_at).toBe(stored.updated_at);
    expect(payload.version).toBe(1);

    expect(payload.dirty).toBeUndefined();
    expect(payload.server_version).toBeUndefined();
  });
});

describe('updateEntity', () => {
  it('bumps version by exactly one over the current row and persists via put', async () => {
    await createEntity(db.books, 'books', makeBookFields());
    const bookId = (await onlyOutboxEntry()).record_id;
    const current = await getOrFail(db.books, bookId);

    await sleep(5);
    await updateEntity(db.books, 'books', current, { current_page: 42 });

    const stored = await getOrFail(db.books, bookId);
    expect(stored.version).toBe(current.version + 1);
    expect(stored.current_page).toBe(42);
    expect(stored.title).toBe('الأصول الثلاثة');
    expect(Date.parse(stored.updated_at)).toBeGreaterThan(Date.parse(current.updated_at));
  });

  it('queues an update outbox entry with the cloud-shaped changed payload', async () => {
    await createEntity(db.books, 'books', makeBookFields());
    const bookId = (await onlyOutboxEntry()).record_id;
    const current = await getOrFail(db.books, bookId);

    await updateEntity(db.books, 'books', current, { current_page: 42 });

    const entries = await outboxEntries();
    const updateEntry = single(entries.filter((candidate) => candidate.op === 'update'));
    expect(updateEntry.table_name).toBe('books');
    expect(updateEntry.record_id).toBe(bookId);

    const payload = asPayload(updateEntry);
    expect(payload.id).toBe(bookId);
    expect(payload.current_page).toBe(42);
    expect(payload.title).toBe('الأصول الثلاثة');
    expect(payload.dirty).toBeUndefined();
    expect(payload.server_version).toBeUndefined();
  });
});

describe('deleteEntity', () => {
  it('removes the row from the target table', async () => {
    await createEntity(db.lecturers, 'lecturers', makeLecturerFields());
    const lecturerId = (await onlyOutboxEntry()).record_id;

    await deleteEntity(db.lecturers, 'lecturers', lecturerId);

    expect(await db.lecturers.get(lecturerId)).toBeUndefined();
    expect(await db.lecturers.count()).toBe(0);
  });

  it('queues a delete outbox entry with a null payload', async () => {
    await createEntity(db.lecturers, 'lecturers', makeLecturerFields());
    const lecturerId = (await onlyOutboxEntry()).record_id;

    await deleteEntity(db.lecturers, 'lecturers', lecturerId);

    const entries = await outboxEntries();
    const deleteEntry = single(entries.filter((candidate) => candidate.op === 'delete'));
    expect(deleteEntry.table_name).toBe('lecturers');
    expect(deleteEntry.record_id).toBe(lecturerId);
    expect(deleteEntry.payload).toBeNull();
  });
});

describe('atomicity', () => {
  it('leaves row counts and outbox counts consistent after every mutation', async () => {
    await createEntity(db.categories, 'categories', makeCategoryFields());
    expect(await db.categories.count()).toBe(1);
    expect(await db.outbox.count()).toBe(1);

    const inserted = single(await db.categories.toArray());
    await updateEntity(db.categories, 'categories', inserted, { name: 'الفقه' });
    expect(await db.categories.count()).toBe(1);
    expect(await db.outbox.count()).toBe(2);

    const updated = single(await db.categories.toArray());
    await deleteEntity(db.categories, 'categories', updated.id);
    expect(await db.categories.count()).toBe(0);
    expect(await db.outbox.count()).toBe(3);
  });
});

describe('touchBookOpened', () => {
  it('is a no-op when the book does not exist', async () => {
    await expect(touchBookOpened('missing_book')).resolves.toBeUndefined();
    expect(await db.books.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });

  it('refreshes last_opened_at, bumps version, and queues an outbox update', async () => {
    await createEntity(db.books, 'books', makeBookFields());
    const bookId = (await onlyOutboxEntry()).record_id;
    const before = await getOrFail(db.books, bookId);

    await sleep(5);
    await touchBookOpened(bookId);

    const after = await getOrFail(db.books, bookId);
    expect(Date.parse(after.last_opened_at)).toBeGreaterThan(
      Date.parse(before.last_opened_at),
    );
    expect(after.version).toBe(before.version + 1);
    expect(after.dirty).toBe(true);

    const openedEntry = single(
      (
        await outboxEntries()
      ).filter(
        (candidate) => candidate.table_name === 'books' && candidate.op === 'update',
      ),
    );
    expect(openedEntry.op).toBe('update');
    expect(openedEntry.record_id).toBe(bookId);
  });
});
