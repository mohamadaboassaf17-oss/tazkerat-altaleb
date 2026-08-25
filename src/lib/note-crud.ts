import type { LocalNote, LocalNoteLink, NoteType } from '../types/models';
import { db } from './db';
import { bumpVersion, queueOutbox } from './sync-helpers';
import { extractTitle, parseWikiLinks } from './note-text';
import { validateNoteTargets } from './xor-guards';

/**
 * Local-first mutation pipeline for notes (M4 scope).
 *
 * Follows the entity-crud.ts conventions but cannot reuse its helpers
 * directly: every note save must also rebuild `note_links` inside the SAME
 * Dexie transaction as the row write and the outbox queueing.
 *
 * Decision D10: note_links are derived data — they never enter the outbox;
 * the cloud side cascades/rebuilds them from the pushed note payload.
 */

const INITIAL_VERSION = 1;
const NEVER_SYNCED_SERVER_VERSION = 0;

/** Caller-supplied columns for a new note (stamps excluded). */
export interface CreateNoteFields {
  user_id: string;
  book_id: string | null;
  lecture_id: string | null;
  content: string;
  type: NoteType;
}

/** Columns an update may change; `title` is derived and never accepted. */
export type NoteChanges = Partial<
  Omit<LocalNote, 'id' | 'created_at' | 'title' | 'version' | 'dirty' | 'server_version'>
>;

/** Today's date as an ISO calendar date ('YYYY-MM-DD'). */
function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Whitespace-only target ids collapse to NULL, mirroring the SQL intent of
 * xor-guards.ts ("an empty/whitespace string counts as unset").
 */
function normalizeTarget(value: string | null): string | null {
  return value !== null && value.trim().length > 0 ? value : null;
}

/**
 * Outbox payload carries the cloud-shaped row: the client-only sync
 * bookkeeping is stripped so M5 can push it verbatim. For deletes the
 * payload is null — `record_id` identifies the row.
 */
function toNotePayload(record: LocalNote): Record<string, unknown> {
  const cloudRow: Record<string, unknown> = { ...record };
  delete cloudRow.dirty;
  delete cloudRow.server_version;
  return cloudRow;
}

/**
 * Rebuild all wiki-link edges for one note inside the caller's transaction:
 * DELETE existing outgoing edges, then INSERT one edge per valid parsed
 * target. Skipped targets: self-references, duplicates, and ids that do not
 * exist in db.notes (dangling) — this prevents orphan edges at both ends of
 * the link lifecycle. Never queues outbox entries (D10).
 */
async function rebuildNoteLinks(sourceNoteId: string, content: string): Promise<void> {
  await db.note_links.where('source_note_id').equals(sourceNoteId).delete();

  const parsed = parseWikiLinks(content);
  const now = new Date().toISOString();
  const edges: LocalNoteLink[] = [];
  for (const candidate of parsed) {
    if (candidate === sourceNoteId || edges.some((edge) => edge.target_note_id === candidate)) {
      continue;
    }
    const targetExists = await db.notes.get(candidate);
    if (targetExists === undefined) {
      continue;
    }
    edges.push({
      id: crypto.randomUUID(),
      source_note_id: sourceNoteId,
      target_note_id: candidate,
      created_at: now,
    });
  }

  await db.note_links.bulkAdd(edges);
}

/** Throw when the note targets violate the PRD §7.5 XOR invariant. */
function assertValidTargets(note: Pick<LocalNote, 'book_id' | 'lecture_id'>): void {
  const verdict = validateNoteTargets(note.book_id, note.lecture_id);
  if (!verdict.ok) {
    throw new Error(verdict.reason);
  }
}

export async function createNote(fields: CreateNoteFields): Promise<string> {
  const bookId = normalizeTarget(fields.book_id);
  const lectureId = normalizeTarget(fields.lecture_id);
  assertValidTargets({ book_id: bookId, lecture_id: lectureId });

  const now = new Date().toISOString();
  const record: LocalNote = {
    id: crypto.randomUUID(),
    user_id: fields.user_id,
    book_id: bookId,
    lecture_id: lectureId,
    title: extractTitle(fields.content),
    content: fields.content,
    type: fields.type,
    review_date: todayIsoDate(),
    is_public: false,
    created_at: now,
    updated_at: now,
    version: INITIAL_VERSION,
    dirty: true,
    server_version: NEVER_SYNCED_SERVER_VERSION,
  };

  await db.transaction('rw', db.notes, db.note_links, db.outbox, async () => {
    await db.notes.add(record);
    await rebuildNoteLinks(record.id, fields.content);
    await queueOutbox({
      table_name: 'notes',
      op: 'insert',
      record_id: record.id,
      payload: toNotePayload(record),
    });
  });

  return record.id;
}

export async function updateNote(current: LocalNote, changes: NoteChanges): Promise<void> {
  const next = bumpVersion({
    ...current,
    ...changes,
    updated_at: new Date().toISOString(),
  });
  next.title = extractTitle(next.content);

  await db.transaction('rw', db.notes, db.note_links, db.outbox, async () => {
    await db.notes.put(next);
    await rebuildNoteLinks(next.id, next.content);
    await queueOutbox({
      table_name: 'notes',
      op: 'update',
      record_id: next.id,
      payload: toNotePayload(next),
    });
  });
}

export async function deleteNote(noteId: string): Promise<void> {
  await db.transaction('rw', db.notes, db.note_links, db.outbox, async () => {
    await db.notes.delete(noteId);
    // Mirror the cloud ON DELETE CASCADE in both directions.
    await db.note_links.where('source_note_id').equals(noteId).delete();
    await db.note_links.where('target_note_id').equals(noteId).delete();
    // Only the NOTE is queued — note_links never enter the outbox (D10).
    await queueOutbox({
      table_name: 'notes',
      op: 'delete',
      record_id: noteId,
      payload: null,
    });
  });
}
