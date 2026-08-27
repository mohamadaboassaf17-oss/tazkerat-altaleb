/**
 * Dashboard query helpers (M9) — pure Dexie reads.
 * No side effects beyond db; safe to call from any screen.
 */

import { db } from './db';
import { buildTodayQueue, todayIsoDate } from './srs';
import type { LocalNote } from '../types/models';

export interface CategoryProgress {
  categoryId: string;
  categoryName: string;
  booksCount: number;
  notesCount: number;
  lecturesTotal: number;
  lecturesCompleted: number;
  progressPct: number; // 0..100
}

/**
 * Per-category progress: lectures completion ratio drives the percentage.
 * Books with zero lectures are excluded from denominator (avoids div/0).
 */
export async function getProgressByCategory(userId: string): Promise<CategoryProgress[]> {
  const [categories, books, lecturers, lectures, notes] = await Promise.all([
    db.categories.where('user_id').equals(userId).toArray(),
    db.books.where('user_id').equals(userId).toArray(),
    db.lecturers.where('user_id').equals(userId).toArray(),
    db.lectures.toArray(),
    db.notes.where('user_id').equals(userId).toArray(),
  ]);

  // Lecturer → book index
  const lecturerById = new Map(lecturers.map((l) => [l.id, l]));
  // Book → category index
  const bookById = new Map(books.map((b) => [b.id, b]));

  // Aggregate per category
  const result: CategoryProgress[] = categories.map((cat) => {
    const catBooks = books.filter((b) => b.category_id === cat.id);
    const catLecturerIds = new Set(
      lecturers.filter((l) => catBooks.some((b) => b.id === l.book_id)).map((l) => l.id),
    );
    const catLectures = lectures.filter((lec) => catLecturerIds.has(lec.lecturer_id));
    const total = catLectures.length;
    const completed = catLectures.filter((lec) => lec.is_completed).length;
    const catNoteCount = notes.filter((n) => {
      // note hangs off book XOR lecture (or unattached)
      if (n.book_id !== null) {
        const b = bookById.get(n.book_id);
        return b !== undefined && b.category_id === cat.id;
      }
      if (n.lecture_id !== null) {
        const lec = catLectures.find((x) => x.id === n.lecture_id);
        if (lec !== undefined) return true;
        // Fallback via lecturer→book two-hop
        const lect = n.lecture_id ? lectures.find((x) => x.id === n.lecture_id) : undefined;
        if (lect !== undefined) {
          const lecturer = lecturerById.get(lect.lecturer_id);
          return lecturer !== undefined && catBooks.some((b) => b.id === lecturer.book_id);
        }
      }
      return false;
    }).length;

    return {
      categoryId: cat.id,
      categoryName: cat.name,
      booksCount: catBooks.length,
      notesCount: catNoteCount,
      lecturesTotal: total,
      lecturesCompleted: completed,
      progressPct: total === 0 ? 0 : Math.round((completed / total) * 100),
    };
  });

  // Stable order by name (Arabic locale)
  result.sort((a, b) => a.categoryName.localeCompare(b.categoryName, 'ar'));
  return result;
}

/** 5 most recent notes by created_at DESC for user. */
export async function getRecentNotes(userId: string, limit = 5): Promise<LocalNote[]> {
  const all = await db.notes.where('user_id').equals(userId).toArray();
  all.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  return all.slice(0, limit);
}

/** Today's review queue (حفظ-first) for user — reuses srs-queue logic. */
export async function getTodayQueue(userId: string, today?: string): Promise<LocalNote[]> {
  const isoToday = today ?? todayIsoDate();
  const raw = await db.notes.where('user_id').equals(userId).toArray();
  return buildTodayQueue(raw, isoToday);
}
