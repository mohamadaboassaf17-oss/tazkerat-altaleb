import 'fake-indexeddb/auto';

import { beforeEach, describe, expect, it } from 'vitest';
import type { LocalNote, LocalNoteLink, NoteType, OutboxEntry } from '../types/models';
import { db } from './db';
import { createNote, deleteNote, updateNote } from './note-crud';

/**
 * Unit tests for the notes data layer over a faked IndexedDB. The `db`
 * singleton from './db' is created at import time, so every test starts
 * from an empty database by deleting and reopening it.
 */

function makeNoteFields(content: string): {
  user_id: string;
  book_id: string | null;
  lecture_id: string | null;
  content: string;
  type: NoteType;
} {
  return { user_id: 'user_1', book_id: null, lecture_id: null, content, type: 'benefit' };
}

function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/** Fetch a row by id, failing loudly instead of leaking `undefined`. */
async function getOrFailNote(id: string): Promise<LocalNote> {
  const row = await db.notes.get(id);
  if (row === undefined) {
    throw new Error(`Expected a note with id "${id}".`);
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

async function linksOf(sourceId: string): Promise<LocalNoteLink[]> {
  return db.note_links.where('source_note_id').equals(sourceId).toArray();
}

/** Cloud-shaped payloads are opaque `unknown` until narrowed here. */
function asPayload(entry: OutboxEntry): Record<string, unknown> {
  return entry.payload as Record<string, unknown>;
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('createNote', () => {
  it('stamps derived fields, extracts the title, and queues exactly one insert', async () => {
    const noteId = await createNote(
      makeNoteFields('أول ملاحظة\n\nجسم الملاحظة الطويل'),
    );

    const stored = await getOrFailNote(noteId);
    expect(stored.id).toBe(noteId);
    expect(stored.title).toBe('أول ملاحظة');
    expect(stored.review_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(stored.is_public).toBe(false);
    expect(stored.created_at).toBe(stored.updated_at);
    expect(stored.version).toBe(1);
    expect(stored.dirty).toBe(true);
    expect(stored.server_version).toBe(0);

    const entries = await outboxEntries();
    const entry = single(entries);
    expect(entry.table_name).toBe('notes');
    expect(entry.op).toBe('insert');
    expect(entry.record_id).toBe(noteId);

    const payload = asPayload(entry);
    expect(payload.id).toBe(noteId);
    expect(payload.title).toBe('أول ملاحظة');
    expect(payload.dirty).toBeUndefined();
    expect(payload.server_version).toBeUndefined();
  });

  it('creates valid initial wiki-link edges and skips dangling and duplicate targets', async () => {
    const targetA = await createNote(makeNoteFields('الهدف أ'));
    const targetB = await createNote(makeNoteFields('الهدف ب'));
    expect(await outboxEntries()).toHaveLength(2);

    const sourceId = await createNote(
      makeNoteFields(`مراجع [[${targetA}|أ]] و [[${targetA}]] و [[${targetB}]] و [[missing_id]]`),
    );

    const edges = await linksOf(sourceId);
    // Index queries return rows in primary-key order, so compare as a set.
    expect([...edges.map((edge) => edge.target_note_id)].sort()).toEqual(
      [targetA, targetB].sort(),
    );
    for (const edge of edges) {
      expect(edge.source_note_id).toBe(sourceId);
      expect(edge.created_at.length).toBeGreaterThan(0);
    }

    // D10: note_links never enter the outbox — still exactly the two inserts.
    const entries = await outboxEntries();
    expect(entries).toHaveLength(3);
    expect(entries.every((entry) => entry.table_name === 'notes')).toBe(true);
  });

  it('rejects a note attached to both a book and a lecture without writing anything', async () => {
    const fields = makeNoteFields('ملاحظة مخالفة');
    fields.book_id = 'book_1';
    fields.lecture_id = 'lecture_1';

    await expect(createNote(fields)).rejects.toThrow();
    expect(await db.notes.count()).toBe(0);
    expect(await db.note_links.count()).toBe(0);
    expect(await outboxEntries()).toHaveLength(0);
  });
});

describe('updateNote', () => {
  it('bumps version and re-extracts the title after a content change', async () => {
    const noteId = await createNote(makeNoteFields('العنوان القديم'));
    const current = await getOrFailNote(noteId);

    await sleep(5);
    await updateNote(current, { content: 'العنوان الجديد المستخرج\nباقي النص' });

    const stored = await getOrFailNote(noteId);
    expect(stored.version).toBe(current.version + 1);
    expect(stored.dirty).toBe(true);
    expect(stored.title).toBe('العنوان الجديد المستخرج');
    expect(Date.parse(stored.updated_at)).toBeGreaterThan(Date.parse(current.updated_at));

    const updateEntry = single(
      (await outboxEntries()).filter((entry) => entry.op === 'update'),
    );
    expect(updateEntry.record_id).toBe(noteId);
    expect(asPayload(updateEntry).title).toBe('العنوان الجديد المستخرج');
  });

  it('removes vanished wiki-links on save so no orphan edges survive', async () => {
    const targetA = await createNote(makeNoteFields('الهدف أ'));
    const targetB = await createNote(makeNoteFields('الهدف ب'));
    const sourceId = await createNote(
      makeNoteFields(`يربط [[${targetA}]] و [[${targetB}]]`),
    );
    expect(await linksOf(sourceId)).toHaveLength(2);

    await updateNote(await getOrFailNote(sourceId), {
      content: `لم يبق سوى [[${targetB}]]`,
    });

    const edges = await linksOf(sourceId);
    const edge = single(edges);
    expect(edge.target_note_id).toBe(targetB);
    expect(
      await db.note_links.where('target_note_id').equals(targetA).count(),
    ).toBe(0);
  });

  it('skips self-references when rebuilding links', async () => {
    const sourceId = await createNote(makeNoteFields('ملاحظة مستقلة'));

    await updateNote(await getOrFailNote(sourceId), {
      content: `[[${sourceId}|نفسي]] و [[missing]] لا تُحسب`,
    });

    expect(await linksOf(sourceId)).toHaveLength(0);
  });
});

describe('deleteNote', () => {
  it('removes the row plus outgoing AND incoming edges, queueing one delete entry', async () => {
    const noteA = await createNote(makeNoteFields('الملاحظة أ'));
    const noteB = await createNote(makeNoteFields(`تشير إلى [[${noteA}]]`));
    const noteC = await createNote(makeNoteFields('ملاحظة مستقلة بلا روابط'));
    expect((await outboxEntries()).filter((entry) => entry.op === 'insert')).toHaveLength(3);

    // Now the graph holds an incoming edge B -> A and, after this update,
    // an outgoing edge A -> B. Deleting A must clear both directions.
    await updateNote(await getOrFailNote(noteA), { content: `أشير إلى [[${noteB}]]` });
    expect(await db.note_links.count()).toBe(2);

    await deleteNote(noteA);

    expect(await db.notes.get(noteA)).toBeUndefined();
    expect(await db.note_links.count()).toBe(0);
    expect(await db.notes.get(noteB)).toBeDefined();
    expect(await db.notes.get(noteC)).toBeDefined();

    const entries = await outboxEntries();
    expect(entries.every((entry) => entry.table_name === 'notes')).toBe(true);
    const deleteEntries = entries.filter((entry) => entry.op === 'delete');
    const deleteEntry = single(deleteEntries);
    expect(deleteEntry.record_id).toBe(noteA);
    expect(deleteEntry.payload).toBeNull();
  });
});
