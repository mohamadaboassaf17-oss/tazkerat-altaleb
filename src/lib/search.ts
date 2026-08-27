/**
 * Arabic-normalized local search (M9).
 * Primary path is offline-first: Dexie title_norm/content_norm substring match.
 * Cloud fallback is optional and only used when online.
 */

import { normalizeArabic } from './arabic-text';
import { db } from './db';
import type { LocalNote } from '../types/models';

export function normalizeQuery(raw: string): string {
  return normalizeArabic(raw.trim());
}

/**
 * Local substring search across title_norm || content_norm.
 * Returns notes whose normalized title or content contains the normalized needle.
 * Sorted by created_at DESC (most recent first).
 */
export async function searchNotesLocal(userId: string, rawQuery: string): Promise<LocalNote[]> {
  const needle = normalizeQuery(rawQuery);
  if (needle.length === 0) return [];
  const all = await db.notes.where('user_id').equals(userId).toArray();
  const hits = all.filter((n) => {
    const titleNorm = typeof n.title_norm === 'string' ? n.title_norm : normalizeArabic(n.title);
    const contentNorm = typeof n.content_norm === 'string' ? n.content_norm : normalizeArabic(n.content);
    return titleNorm.includes(needle) || contentNorm.includes(needle);
  });
  hits.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  return hits;
}
