/**
 * Markdown + print export helpers (M8).
 *
 * Markdown: notes.content with [[id|display]] / [[id]] rewritten to [[title]].
 * PDF: browser print pipeline (window.print() + print stylesheet).
 */

import { db } from './db';
import type { LocalNote } from '../types/models';

const WIKI_WITH_DISPLAY = /\[\[([^\][|\n]*)\|([^\][\n]*)\]\]/g;
const WIKI_BARE = /\[\[([^\][\n]*)\]\]/g;

/**
 * Rewrite wiki-link markup in content so every [[id]] token becomes
 * [[title]]. Pure function — caller supplies titleMap.
 */
export function rewriteWikiLinksToTitles(
  content: string,
  titleMap: Map<string, string>,
): string {
  let out = content.replace(WIKI_WITH_DISPLAY, (_m: string, target: string) => {
    const tid = target.trim();
    const title = titleMap.get(tid);
    return title !== undefined ? `[[${title}]]` : `[[${tid}]]`;
  });
  out = out.replace(WIKI_BARE, (_m: string, target: string) => {
    const tid = target.trim();
    const title = titleMap.get(tid);
    return title !== undefined ? `[[${title}]]` : `[[${tid}]]`;
  });
  return out;
}

/** Collect all wiki-link target ids from content. */
export function collectWikiLinkIds(content: string): string[] {
  const ids: string[] = [];
  for (const m of content.matchAll(/\[\[([^\][\n]*)\]\]/g)) {
    const part = m[1]?.split('|')[0]?.trim();
    if (part && !ids.includes(part)) ids.push(part);
  }
  return ids;
}

/** Build a title map for ids by reading Dexie notes. */
export async function buildTitleMap(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const rows = await db.notes.bulkGet(ids);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const id = ids[i];
    if (id === undefined) continue;
    if (row !== undefined) map.set(id, row.title);
  }
  return map;
}

export function markdownForNote(note: LocalNote, titleMap: Map<string, string>): string {
  const body = rewriteWikiLinksToTitles(note.content, titleMap);
  return `# ${note.title}\n\n${body}\n`;
}

/** Export a single note as Markdown with resolved [[titles]]. */
export async function exportSingleNoteMarkdown(note: LocalNote): Promise<string> {
  const ids = collectWikiLinkIds(note.content);
  const map = await buildTitleMap(ids);
  return markdownForNote(note, map);
}

/** Export all notes in a category as one Markdown doc. */
export async function exportCategoryMarkdown(categoryId: string): Promise<string> {
  const books = await db.books.where('category_id').equals(categoryId).toArray();
  const bookIds = books.map((b) => b.id);
  if (bookIds.length === 0) return '';

  const lecturers = await db.lecturers.where('book_id').anyOf(bookIds).toArray();
  const lecturerIds = lecturers.map((l) => l.id);
  const lectures = lecturerIds.length > 0
    ? await db.lectures.where('lecturer_id').anyOf(lecturerIds).toArray()
    : [];
  const lectureIds = lectures.map((l) => l.id);

  const notesByBook = bookIds.length > 0
    ? await db.notes.where('book_id').anyOf(bookIds).toArray()
    : [];
  const notesByLecture = lectureIds.length > 0
    ? await db.notes.where('lecture_id').anyOf(lectureIds).toArray()
    : [];
  const notes = [...notesByBook, ...notesByLecture];
  // Deduplicate (should not overlap per XOR but be safe)
  const seen = new Set<string>();
  const deduped: LocalNote[] = [];
  for (const n of notes) {
    if (!seen.has(n.id)) {
      seen.add(n.id);
      deduped.push(n);
    }
  }
  if (deduped.length === 0) return '';

  const allIds: string[] = [];
  for (const n of deduped) {
    for (const id of collectWikiLinkIds(n.content)) {
      if (!allIds.includes(id)) allIds.push(id);
    }
  }
  const titleMap = await buildTitleMap(allIds);
  return deduped.map((n) => markdownForNote(n, titleMap)).join('\n---\n\n');
}

/** Trigger a download of text as a file. */
export function downloadTextFile(filename: string, content: string, mime = 'text/markdown;charset=utf-8'): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Sanitize a string for use as filename. */
export function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'export';
}
