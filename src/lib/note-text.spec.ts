import { describe, expect, it } from 'vitest';
import { extractTitle, parseWikiLinks } from './note-text';

describe('extractTitle', () => {
  it('returns the first non-blank line trimmed', () => {
    expect(extractTitle('فائدة عن التوحيد\n\nجسم الملاحظة هنا')).toBe(
      'فائدة عن التوحيد',
    );
  });

  it('skips leading blank lines including whitespace-only lines', () => {
    expect(extractTitle('\n\n   \n\t\nالعنوان الفعلي\nالباقي')).toBe(
      'العنوان الفعلي',
    );
  });

  it("falls back to 'بدون عنوان' for whitespace-only content", () => {
    expect(extractTitle('   \n\t\n  ')).toBe('بدون عنوان');
  });

  it("falls back to 'بدون عنوان' for empty content", () => {
    expect(extractTitle('')).toBe('بدون عنوان');
  });

  it('preserves tashkeel in the extracted title', () => {
    expect(extractTitle('سُورَةُ الْفَاتِحَة')).toBe('سُورَةُ الْفَاتِحَة');
  });

  it('keeps the display text of a piped link and drops the markup', () => {
    expect(extractTitle('س[[x_1|الأصول]]')).toBe('س الأصول');
  });

  it('strips markup from a realistic uuid piped link mid-sentence', () => {
    expect(
      extractTitle('ملاحظة أ[[6704c235-9f2e-4b1a-8c3d-2e5f7a9b0c1d|ملاحظة ب]]'),
    ).toBe('ملاحظة أ ملاحظة ب');
  });

  it('removes a bare [[id]] token entirely', () => {
    expect(extractTitle('راجع [[note_1]] اليوم')).toBe('راجع اليوم');
  });

  it('handles multiple links on one line', () => {
    expect(extractTitle('[[a_1|أول]] ثم [[b_2]] ثم [[c_3|ثالث]]')).toBe(
      'أول ثم ثم ثالث',
    );
  });

  it('falls through to the next line when the first sanitizes to empty', () => {
    expect(extractTitle('[[x_1]]\nالعنوان الحقيقي\nالباقي')).toBe(
      'العنوان الحقيقي',
    );
  });

  it('reduces a markup-only piped link line to its display text', () => {
    expect(extractTitle('[[a_1|عرض]]')).toBe('عرض');
  });

  it("falls back to 'بدون عنوان' when every line is blank or bare-markup-only", () => {
    expect(extractTitle('\n\n[[a_1]]\n   \n[[b_2|]]\n')).toBe('بدون عنوان');
  });

  it('leaves link-free content unchanged (regression)', () => {
    expect(extractTitle('متن عادي بلا روابط\nسطر ثانٍ')).toBe(
      'متن عادي بلا روابط',
    );
  });
});

describe('parseWikiLinks', () => {
  it('parses [[id|display]] down to the target id', () => {
    expect(parseWikiLinks('راجع [[note_1|الملاحظة الأولى]] لاحقاً')).toEqual([
      'note_1',
    ]);
  });

  it('parses a bare [[id]] without display', () => {
    expect(parseWikiLinks('انظر [[note_2]] فقط')).toEqual(['note_2']);
  });

  it('collects multiple links in order of appearance', () => {
    expect(parseWikiLinks('[[a_1|أول]] ثم [[b_2]] ثم [[c_3|ثالث]]')).toEqual([
      'a_1',
      'b_2',
      'c_3',
    ]);
  });

  it('deduplicates repeated targets', () => {
    expect(parseWikiLinks('[[x_9|أ]] و [[x_9]] و [[x_9 | ثالث]]')).toEqual([
      'x_9',
    ]);
  });

  it('trims whitespace around captured ids', () => {
    expect(parseWikiLinks('[[ spaced_id | عرض ]]')).toEqual(['spaced_id']);
  });

  it('ignores malformed tokens with no closing brackets', () => {
    expect(parseWikiLinks('نص [[بلا إغلاق ولا شيء بعده')).toEqual([]);
    expect(parseWikiLinks('[[good_1|عرض]] و [[سيئ')).toEqual(['good_1']);
  });

  it('ignores tokens whose id part is empty', () => {
    expect(parseWikiLinks('[[]] و [[|display only]]')).toEqual([]);
  });

  it('returns an empty array when there are no links', () => {
    expect(parseWikiLinks('متن عادي بلا روابط')).toEqual([]);
  });
});
