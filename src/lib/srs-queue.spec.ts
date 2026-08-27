import 'fake-indexeddb/auto';

import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { createNote } from './note-crud';
import { getDueNotes } from './srs-queue';
import type { LocalNote } from '../types/models';

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00.000Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('getDueNotes — حفظ-first ordering', () => {
  it('حفظ due today surfaces before فائدة due today on same date', async () => {
    const today = isoToday();
    const userId = 'user_q';

    // Create two notes due today — one حفظ, one فائدة — both today.
    await createNote({ user_id: userId, book_id: null, lecture_id: null, content: 'فائدة اليوم', type: 'benefit' });
    await createNote({ user_id: userId, book_id: null, lecture_id: null, content: 'حفظ اليوم', type: 'memorization' });

    const q = await getDueNotes(userId, today);
    expect(q).toHaveLength(2);
    expect(q[0]!.type).toBe('memorization');
    expect(q[1]!.type).toBe('benefit');
  });

  it('overdue notes appear before future notes (future excluded)', async () => {
    const today = isoToday();
    const userId = 'user_q2';
    const future = addDays(today, 1);
    const past = addDays(today, -1);

    const idPast = await createNote({ user_id: userId, book_id: null, lecture_id: null, content: 'قديم', type: 'benefit' });
    const idToday = await createNote({ user_id: userId, book_id: null, lecture_id: null, content: 'اليوم', type: 'benefit' });
    const idFuture = await createNote({ user_id: userId, book_id: null, lecture_id: null, content: 'غداً', type: 'benefit' });

    // Manually push the future note's review_date to tomorrow
    const futureNote = (await db.notes.get(idFuture)) as LocalNote;
    await db.notes.put({ ...futureNote, review_date: future });
    const pastNote = (await db.notes.get(idPast)) as LocalNote;
    await db.notes.put({ ...pastNote, review_date: past });

    const q = await getDueNotes(userId, today);
    expect(q.map((n) => n.id)).toEqual(expect.arrayContaining([idPast, idToday]));
    expect(q.find((n) => n.id === idFuture)).toBeUndefined();
    // Past due first (earlier date)
    expect(q[0]!.id).toBe(idPast);
  });
});
