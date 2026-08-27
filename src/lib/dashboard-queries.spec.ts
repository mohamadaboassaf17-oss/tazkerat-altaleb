import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { getProgressByCategory, getRecentNotes, getTodayQueue } from './dashboard-queries';
import { createNote } from './note-crud';
import { normalizeArabic } from './arabic-text';

const uid = 'u1';

function isoNow(): string {
  return new Date().toISOString();
}

async function seedHierarchy(): Promise<{ catId: string; bookId: string; lecturerId: string; lecture1: string; lecture2: string }> {
  const now = isoNow();
  const catId = crypto.randomUUID();
  await db.categories.put({ id: catId, user_id: uid, name: 'العقيدة', icon: null, created_at: now, updated_at: now, version: 1, dirty: false, server_version: 1 });
  const bookId = crypto.randomUUID();
  await db.books.put({ id: bookId, user_id: uid, category_id: catId, title: 'الأصول الثلاثة', total_pages: 10, current_page: 5, last_opened_at: now, created_at: now, updated_at: now, version: 1, dirty: false, server_version: 1 });
  const lecturerId = crypto.randomUUID();
  await db.lecturers.put({ id: lecturerId, user_id: uid, book_id: bookId, name: 'الفوزان', created_at: now, updated_at: now, version: 1, dirty: false, server_version: 1 });
  const lecture1 = crypto.randomUUID();
  const lecture2 = crypto.randomUUID();
  await db.lectures.put({ id: lecture1, lecturer_id: lecturerId, title: 'محاضرة 1', duration_minutes: 30, is_completed: true, created_at: now, updated_at: now, version: 1, dirty: false, server_version: 1 });
  await db.lectures.put({ id: lecture2, lecturer_id: lecturerId, title: 'محاضرة 2', duration_minutes: 30, is_completed: false, created_at: now, updated_at: now, version: 1, dirty: false, server_version: 1 });
  return { catId, bookId, lecturerId, lecture1, lecture2 };
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('getProgressByCategory', () => {
  it('returns per-category lecture completion pct', async () => {
    await seedHierarchy();
    const prog = await getProgressByCategory(uid);
    expect(prog).toHaveLength(1);
    expect(prog[0]?.lecturesTotal).toBe(2);
    expect(prog[0]?.lecturesCompleted).toBe(1);
    expect(prog[0]?.progressPct).toBe(50);
    expect(prog[0]?.booksCount).toBe(1);
  });
  it('zero lectures → 0%', async () => {
    const now = isoNow();
    const catId = crypto.randomUUID();
    await db.categories.put({ id: catId, user_id: uid, name: 'فقه', icon: null, created_at: now, updated_at: now, version: 1, dirty: false, server_version: 1 });
    const prog = await getProgressByCategory(uid);
    expect(prog[0]?.progressPct).toBe(0);
  });
});

describe('getRecentNotes — 5 most recent by created_at', () => {
  it('returns 5 most recent ordered DESC', async () => {
    for (let i = 0; i < 7; i++) {
      const id = await createNote({ user_id: uid, book_id: null, lecture_id: null, content: `ملاحظة ${i}`, type: 'benefit' });
      // Stagger created_at to make order deterministic
      const note = await db.notes.get(id);
      if (note) {
        note.created_at = new Date(Date.now() + i * 1000).toISOString();
        await db.notes.put(note);
      }
    }
    const recent = await getRecentNotes(uid, 5);
    expect(recent).toHaveLength(5);
    // Most recent first
    expect(recent[0]?.title).toBe('ملاحظة 6');
    expect(recent[4]?.title).toBe('ملاحظة 2');
  });
});

describe('getTodayQueue — حفظ first', () => {
  it('surfaces حفظ before فائدة on same review_date', async () => {
    // Create two notes due today with different types
    await createNote({ user_id: uid, book_id: null, lecture_id: null, content: 'فائدة عادية', type: 'benefit' });
    await createNote({ user_id: uid, book_id: null, lecture_id: null, content: 'حفظ مهم', type: 'memorization' });
    const queue = await getTodayQueue(uid);
    expect(queue.length).toBe(2);
    expect(queue[0]?.type).toBe('memorization');
  });
});

describe('title_norm stamping', () => {
  it('stamps title_norm / content_norm on create', async () => {
    const id = await createNote({ user_id: uid, book_id: null, lecture_id: null, content: 'العقيدة\nنص', type: 'benefit' });
    const note = await db.notes.get(id);
    expect(note?.title_norm).toBe(normalizeArabic('العقيدة'));
    expect(note?.content_norm).toBeDefined();
  });
});
