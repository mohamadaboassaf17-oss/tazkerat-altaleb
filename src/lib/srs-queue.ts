/**
 * Dexie-backed query helpers for the M6 "today" queue.
 * Separated from srs.ts so srs.ts stays pure (no Dexie import).
 */

import { db } from './db';
import { buildTodayQueue, todayIsoDate } from './srs';
import type { LocalNote } from '../types/models';

/** All due notes for a user, sorted حفظ-first then review_date ASC. */
export async function getDueNotes(userId: string, today?: string): Promise<LocalNote[]> {
  const isoToday = today ?? todayIsoDate();
  // Dexie cannot ORDER BY a computed priority, so fetch then sort in JS.
  const raw = await db.notes.where('user_id').equals(userId).toArray();
  return buildTodayQueue(raw, isoToday);
}

/** Count only — cheaper than fetching full rows for badges. */
export async function countDueNotes(userId: string, today?: string): Promise<number> {
  const notes = await getDueNotes(userId, today);
  return notes.length;
}
