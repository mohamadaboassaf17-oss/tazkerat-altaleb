import { describe, expect, it } from 'vitest';
import { validateMediaTargets, validateNoteTargets } from './xor-guards';

describe('validateNoteTargets', () => {
  it('rejects when both book and lecture are set', () => {
    const result = validateNoteTargets('book_1', 'lecture_1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason.length).toBeGreaterThan(0);
    }
  });

  it('accepts exactly one target set (book only)', () => {
    expect(validateNoteTargets('book_1', null)).toEqual({ ok: true });
    expect(validateNoteTargets('book_1', undefined)).toEqual({ ok: true });
  });

  it('accepts exactly one target set (lecture only)', () => {
    expect(validateNoteTargets(null, 'lecture_1')).toEqual({ ok: true });
    expect(validateNoteTargets(undefined, 'lecture_1')).toEqual({ ok: true });
  });

  it('accepts when both targets are null (free-standing note)', () => {
    expect(validateNoteTargets(null, null)).toEqual({ ok: true });
    expect(validateNoteTargets(undefined, undefined)).toEqual({ ok: true });
  });

  it('treats empty/whitespace strings as unset', () => {
    expect(validateNoteTargets('', '')).toEqual({ ok: true });
    expect(validateNoteTargets('book_1', '  ').ok).toBe(true);
  });
});

describe('validateMediaTargets', () => {
  it('rejects when both note and lecture are set', () => {
    const result = validateMediaTargets('note_1', 'lecture_1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason.length).toBeGreaterThan(0);
    }
  });

  it('accepts exactly one target set (note only)', () => {
    expect(validateMediaTargets('note_1', null)).toEqual({ ok: true });
    expect(validateMediaTargets(undefined, 'lecture_1')).toEqual({ ok: true });
  });

  it('rejects when both targets are null — media must attach to something', () => {
    const result = validateMediaTargets(null, null);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason.length).toBeGreaterThan(0);
    }
    expect(validateMediaTargets(undefined, undefined).ok).toBe(false);
  });

  it('treats empty/whitespace strings as unset', () => {
    expect(validateMediaTargets('', '').ok).toBe(false);
    expect(validateMediaTargets('note_1', '').ok).toBe(true);
    expect(validateMediaTargets(' ', 'lecture_1').ok).toBe(true);
  });
});
