import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { normalizeArabic } from './arabic-text';
import { db } from './db';
import { createNote } from './note-crud';
import { searchNotesLocal } from './search';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('normalizeArabic (M9 tasks.md test vector)', () => {
  it('العقيدة → عقيدة (drop ال)', () => {
    expect(normalizeArabic('العقيدة')).toBe('عقيدة');
  });
  it('عقيدة stays عقيدة', () => {
    expect(normalizeArabic('عقيدة')).toBe('عقيدة');
  });
  it('بالعقيدة → عقيدة (ب + ال)', () => {
    expect(normalizeArabic('بالعقيدة')).toBe('عقيدة');
  });
  it('العقيدةَ (tashkeel) → عقيدة', () => {
    expect(normalizeArabic('العقيدةَ')).toBe('عقيدة');
  });
  it('hamza family أ إ آ ٱ → ا', () => {
    expect(normalizeArabic('أحمد')).toBe('احمد');
    expect(normalizeArabic('إسلام')).toBe('اسلام');
    expect(normalizeArabic('آمنة')).toBe('امنة');
    expect(normalizeArabic('ٱبن')).toBe('ابن');
  });
  it('does not over-strip short names like وليد/بدر/فهد', () => {
    expect(normalizeArabic('وليد')).toBe('وليد');
    expect(normalizeArabic('بدر')).toBe('بدر');
    expect(normalizeArabic('فهد')).toBe('فهد');
  });
});

describe('searchNotesLocal — العقيدة matches عقيدة / بالعقيدة / العقيدةَ', () => {
  it('finds note titled العقيدة when querying عقيدة / بالعقيدة / العقيدةَ', async () => {
    const noteId = await createNote({ user_id: 'u1', book_id: null, lecture_id: null, content: 'العقيدة\nشرح مفصل', type: 'benefit' });
    // Verify norm column was stamped
    const stored = await db.notes.get(noteId);
    expect(stored?.title_norm).toBe('عقيدة');

    for (const q of ['العقيدة', 'عقيدة', 'بالعقيدة', 'العقيدةَ', 'عقيدةَ']) {
      const hits = await searchNotesLocal('u1', q);
      expect(hits.map((h) => h.id)).toContain(noteId);
    }
  });

  it('content search also matches normalized content', async () => {
    await createNote({ user_id: 'u1', book_id: null, lecture_id: null, content: 'عنوان\nهذا نص عن بالعقيدة والتوحيد', type: 'benefit' });
    const hits = await searchNotesLocal('u1', 'عقيدة');
    expect(hits).toHaveLength(1);
  });

  it('returns empty for blank query', async () => {
    await createNote({ user_id: 'u1', book_id: null, lecture_id: null, content: 'العقيدة', type: 'benefit' });
    expect(await searchNotesLocal('u1', '   ')).toEqual([]);
  });
});
