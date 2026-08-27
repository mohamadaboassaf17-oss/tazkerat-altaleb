import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { createNote, rateNote } from './note-crud';
import type { LocalNote } from '../types/models';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function addDays(iso: string, d: number): string {
  const dt = new Date(iso + 'T00:00:00.000Z');
  dt.setUTCDate(dt.getUTCDate() + d);
  return dt.toISOString().slice(0, 10);
}

async function getNote(id: string): Promise<LocalNote> {
  const r = await db.notes.get(id);
  if (!r) throw new Error('missing note');
  return r;
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('rateNote', () => {
  it('easy bumps version, updates SRS fields, and queues update', async () => {
    const id = await createNote({ user_id: 'u1', book_id: null, lecture_id: null, content: 'حفظ آية', type: 'memorization' });
    const before = await getNote(id);
    const v0 = before.version;

    await rateNote(before, 'easy');

    const after = await getNote(id);
    expect(after.version).toBe(v0 + 1);
    expect(after.dirty).toBe(true);
    expect(after.repetitions).toBe(1);
    expect(after.ease_factor).toBeCloseTo(2.65, 5);
    // memorization easy first interval ceil(1*1.15)=2
    expect(after.interval_days).toBe(2);
    expect(after.review_date).toBe(addDays(todayIso(), 2));

    const entries = await db.outbox.toArray();
    const updates = entries.filter((e) => e.op === 'update' && e.record_id === id);
    expect(updates).toHaveLength(1);
    const payload = updates[0]!.payload as Record<string, unknown>;
    expect(payload.ease_factor).toBe(after.ease_factor);
    expect(payload.interval_days).toBe(after.interval_days);
  });

  it('hard resets repetitions and keeps interval 1 without حفظ boost', async () => {
    const id = await createNote({ user_id: 'u1', book_id: null, lecture_id: null, content: 'فائدة صعبة', type: 'benefit' });
    const before = await getNote(id);
    // manually set a progressed state
    const progressed: LocalNote = { ...before, ease_factor: 2.8, interval_days: 18, repetitions: 5, version: before.version };
    await db.notes.put(progressed);

    await rateNote(progressed, 'hard');
    const after = await getNote(id);
    expect(after.repetitions).toBe(0);
    expect(after.interval_days).toBe(1);
    expect(after.ease_factor).toBeCloseTo(2.6, 5);
    expect(after.review_date).toBe(addDays(todayIso(), 1));
  });

  it('medium second review yields 6 days', async () => {
    const id = await createNote({ user_id: 'u1', book_id: null, lecture_id: null, content: 'قاعدة', type: 'benefit' });
    const n0 = await getNote(id);
    await rateNote(n0, 'medium');
    const n1 = await getNote(id);
    expect(n1.interval_days).toBe(1);
    await rateNote(n1, 'medium');
    const n2 = await getNote(id);
    expect(n2.interval_days).toBe(6);
    expect(n2.repetitions).toBe(2);
  });
});
