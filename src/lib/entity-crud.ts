import type { Table } from 'dexie';
import type {
  LocalBook,
  LocalCategory,
  LocalLecture,
  LocalLecturer,
  OutboxEntry,
} from '../types/models';
import { db } from './db';
import { bumpVersion, queueOutbox } from './sync-helpers';

/**
 * Shared local-first mutation pipeline for the M3 hierarchy entities.
 *
 * Every create/update/delete:
 * 1. writes to Dexie (source of truth for the UI),
 * 2. bumps `version` via bumpVersion() on updates (never mutates in place),
 * 3. queues an outbox entry via queueOutbox().
 *
 * Steps 1+3 share one Dexie transaction so a row can never exist without
 * its pending push (or vice versa). The cloud push itself is M5 — these
 * helpers never touch supabase-js.
 */

/** The four hierarchy entities managed by this layer (M3 scope). */
export type CrudEntity = LocalCategory | LocalBook | LocalLecturer | LocalLecture;

export type CrudTableName = Extract<
  OutboxEntry['table_name'],
  'categories' | 'books' | 'lecturers' | 'lectures'
>;

const INITIAL_VERSION = 1;
const NEVER_SYNCED_SERVER_VERSION = 0;

/** Columns stamped here — callers never supply them. */
type EntityStamp =
  | 'id'
  | 'created_at'
  | 'updated_at'
  | 'version'
  | 'dirty'
  | 'server_version';

/**
 * Outbox payload carries the cloud-shaped row (`Cloud*` interface): the
 * client-only sync bookkeeping is stripped so M5 can push it verbatim.
 * For deletes the payload is null — `record_id` identifies the row.
 */
function toCloudPayload(record: CrudEntity): Record<string, unknown> {
  const cloudRow: Record<string, unknown> = { ...record };
  delete cloudRow.dirty;
  delete cloudRow.server_version;
  return cloudRow;
}

export async function createEntity<T extends CrudEntity>(
  table: Table<T, string>,
  tableName: CrudTableName,
  fields: Omit<T, EntityStamp>,
): Promise<void> {
  const now = new Date().toISOString();
  const record = {
    ...fields,
    id: crypto.randomUUID(),
    created_at: now,
    updated_at: now,
    version: INITIAL_VERSION,
    dirty: true,
    server_version: NEVER_SYNCED_SERVER_VERSION,
  } as T;

  await db.transaction('rw', table, db.outbox, async () => {
    await table.add(record);
    await queueOutbox({
      table_name: tableName,
      op: 'insert',
      record_id: record.id,
      payload: toCloudPayload(record),
    });
  });
}

export async function updateEntity<T extends CrudEntity>(
  table: Table<T, string>,
  tableName: CrudTableName,
  current: T,
  changes: Partial<Omit<T, 'id' | 'created_at' | 'version' | 'dirty' | 'server_version'>>,
): Promise<void> {
  const next = bumpVersion({
    ...current,
    ...changes,
    updated_at: new Date().toISOString(),
  });

  await db.transaction('rw', table, db.outbox, async () => {
    await table.put(next);
    await queueOutbox({
      table_name: tableName,
      op: 'update',
      record_id: next.id,
      payload: toCloudPayload(next),
    });
  });
}

export async function deleteEntity<T extends CrudEntity>(
  table: Table<T, string>,
  tableName: CrudTableName,
  recordId: string,
): Promise<void> {
  await db.transaction('rw', table, db.outbox, async () => {
    await table.delete(recordId);
    await queueOutbox({
      table_name: tableName,
      op: 'delete',
      record_id: recordId,
      payload: null,
    });
  });
}

// ---------------------------------------------------------------------------
// Delete-blocking child counts — an entity with children can never be
// deleted from the UI (no cascades in MVP; prevents orphans locally and in
// the outbox stream).
// ---------------------------------------------------------------------------

export async function countCategoryChildren(categoryId: string): Promise<number> {
  return db.books.where('category_id').equals(categoryId).count();
}

export async function countBookChildren(bookId: string): Promise<number> {
  const lecturerCount = await db.lecturers.where('book_id').equals(bookId).count();
  const noteCount = await db.notes.where('book_id').equals(bookId).count();
  return lecturerCount + noteCount;
}

export async function countLecturerChildren(lecturerId: string): Promise<number> {
  return db.lectures.where('lecturer_id').equals(lecturerId).count();
}

export async function countLectureChildren(lectureId: string): Promise<number> {
  return db.notes.where('lecture_id').equals(lectureId).count();
}

/**
 * Record that the user opened a book (drives the dashboard knowledge-map
 * centering per AGENTS.md). Follows the standard update path:
 * bumpVersion + Dexie put + queueOutbox. A missing row is an expected race
 * (deleted mid-navigation) and resolves as a no-op — real DB failures still
 * propagate to the caller.
 */
export async function touchBookOpened(bookId: string): Promise<void> {
  const book = await db.books.get(bookId);
  if (book === undefined) {
    return;
  }
  await updateEntity(db.books, 'books', book, {
    last_opened_at: new Date().toISOString(),
  });
}
