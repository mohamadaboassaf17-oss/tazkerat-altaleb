/**
 * M6 SRS — SM-2-inspired scheduler (AGENTS.md SRS, PRD §5.2).
 *
 * Three ratings: سهل (easy) / متوسط (medium) / صعب (hard).
 * Pure functions — no Date.now(), no I/O — so the math is trivially testable.
 *
 * Decision (PROJECT_STATE D22 style): حفظ (memorization) priority is a
 * sort key, never a query hack — see compareDueNotes / queue helpers.
 */

import type { NoteType } from '../types/models';

/** UI rating — Arabic labels map 1:1. */
export type Rating = 'easy' | 'medium' | 'hard';

/** Arabic → canonical mapping (also accepts latin fallbacks). */
export function parseRating(raw: string): Rating | null {
  switch (raw) {
    case 'سهل':
    case 'easy':
      return 'easy';
    case 'متوسط':
    case 'medium':
      return 'medium';
    case 'صعب':
    case 'hard':
      return 'hard';
    default:
      return null;
  }
}

/** Columns the scheduler reads / writes on a note. */
export interface SrsFields {
  type: NoteType;
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  review_date: string; // YYYY-MM-DD
}

export interface NextReview {
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  review_date: string;
}

const DEFAULT_EASE = 2.5;
const MIN_EASE = 1.3;
const MEMORIZATION_BOOST = 1.15;

/** Today's date as an ISO calendar date (UTC). */
export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Add `days` calendar days to an ISO date string (YYYY-MM-DD) in UTC.
 * Uses UTC midnight arithmetic so local timezone never shifts the result.
 */
export function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + 'T00:00:00.000Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Sort-key priority: حفظ (memorization) surfaces first on the same date. */
export function srsPriority(noteType: NoteType): number {
  return noteType === 'memorization' ? 0 : 1;
}

/**
 * Comparator for the "today" queue: حفظ-first, then due date ASC,
 * then created_at ASC (stable FIFO within same priority+date).
 */
export function compareDueNotes<
  T extends { type: NoteType; review_date: string; created_at: string },
>(a: T, b: T): number {
  const pa = srsPriority(a.type);
  const pb = srsPriority(b.type);
  if (pa !== pb) return pa - pb;
  if (a.review_date !== b.review_date) return a.review_date < b.review_date ? -1 : 1;
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
  return 0;
}

/**
 * True when a note is due today-or-earlier (tolerates missing/invalid dates
 * by treating them as not-due — defensive for Dexie v1 notes).
 */
export function isDue(note: { review_date: string }, today: string): boolean {
  return note.review_date <= today;
}

/**
 * Core SM-2-inspired step.
 *
 * Rules (M6 decisions):
 * - صعب:  ease = max(1.3, ease - 0.20), repetitions = 0, interval = 1
 * - متوسط: ease unchanged,               repetitions += 1,
 *          interval = rep==1 ? 1 : rep==2 ? 6 : round(prev * ease)
 * - سهل:  ease = ease + 0.15,            repetitions += 1, same interval ladder
 * - After the ladder, حفظ scales the computed interval by ceil(*1.15) (min 1).
 * - review_date = today + interval.
 *
 * The caller supplies `today` explicitly so tests never touch the clock.
 */
export function nextReview(
  current: SrsFields,
  rating: Rating,
  today: string,
): NextReview {
  const curEase = Number.isFinite(current.ease_factor) ? current.ease_factor : DEFAULT_EASE;
  const curInterval = Number.isFinite(current.interval_days) ? current.interval_days : 0;
  const curRep = Number.isFinite(current.repetitions) ? current.repetitions : 0;

  let ease = curEase;
  let repetitions: number;
  let interval: number;

  if (rating === 'hard') {
    ease = Math.max(MIN_EASE, curEase - 0.2);
    repetitions = 0;
    interval = 1;
  } else if (rating === 'medium') {
    ease = curEase;
    repetitions = curRep + 1;
    interval = intervalForRepetition(repetitions, curInterval, ease);
  } else {
    // easy
    ease = curEase + 0.15;
    repetitions = curRep + 1;
    interval = intervalForRepetition(repetitions, curInterval, ease);
  }

  // حفظ boost only for non-hard ratings (hard is a reset, boost would be noise).
  if (rating !== 'hard' && current.type === 'memorization') {
    interval = Math.max(1, Math.ceil(interval * MEMORIZATION_BOOST));
  }

  // Round ease to 2 decimals to avoid floating-point drift (2.65 vs 2.65000001).
  ease = Math.round(ease * 100) / 100;

  return {
    ease_factor: ease,
    interval_days: interval,
    repetitions,
    review_date: addDays(today, interval),
  };
}

/** SM-2 ladder: 1, 6, then prev*ease rounded. */
function intervalForRepetition(
  newRep: number,
  prevInterval: number,
  ease: number,
): number {
  if (newRep === 1) return 1;
  if (newRep === 2) return 6;
  // Defensive: if prev was 0 (fresh note but rep jumped via external edit),
  // treat it as 6 so the next step is meaningful.
  const base = prevInterval > 0 ? prevInterval : 6;
  return Math.max(1, Math.round(base * ease));
}

/**
 * Filter + sort a raw note array into the "today" queue for one user view.
 * Pure — caller decides the source (Dexie query or in-memory).
 */
export function buildTodayQueue<
  T extends { type: NoteType; review_date: string; created_at: string },
>(notes: readonly T[], today: string): T[] {
  return [...notes].filter((n) => isDue(n, today)).sort(compareDueNotes);
}

// Re-export for convenience in queue module tests.
export const __testing = { intervalForRepetition };

/** Default SRS fields for a freshly created note (mirrors SQL defaults). */
export function defaultSrsFields(): Pick<SrsFields, 'ease_factor' | 'interval_days' | 'repetitions'> {
  return { ease_factor: DEFAULT_EASE, interval_days: 0, repetitions: 0 };
}

/**
 * Coalesce possibly-missing SRS fields on a Dexie v1 note (pre-M6 rows have
 * undefined), so scheduler inputs never see NaN.
 */
export function coalesceSrsFields(note: Partial<SrsFields> & { type: NoteType }): SrsFields {
  return {
    type: note.type,
    ease_factor:
      typeof note.ease_factor === 'number' && Number.isFinite(note.ease_factor)
        ? note.ease_factor
        : DEFAULT_EASE,
    interval_days:
      typeof note.interval_days === 'number' && Number.isFinite(note.interval_days)
        ? note.interval_days
        : 0,
    repetitions:
      typeof note.repetitions === 'number' && Number.isFinite(note.repetitions)
        ? note.repetitions
        : 0,
    review_date: typeof note.review_date === 'string' ? note.review_date : todayIsoDate(),
  };
}

// For sync tests: expose constants.
export const SRS_DEFAULTS = {
  ease: DEFAULT_EASE,
  minEase: MIN_EASE,
  memorizationBoost: MEMORIZATION_BOOST,
} as const;
