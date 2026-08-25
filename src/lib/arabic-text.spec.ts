import { describe, expect, it } from 'vitest';
import { stripTashkeel } from './arabic-text';

describe('stripTashkeel', () => {
  it('strips fatha, damma and kasra', () => {
    expect(stripTashkeel('قَالَ قُلْ')).toBe('قال قل');
    expect(stripTashkeel('بِسْمِ')).toBe('بسم');
  });

  it('strips sukun', () => {
    expect(stripTashkeel('الْعَالَمِينَ')).toBe('العالمين');
  });

  it('strips tanwin (fath, damm, kasr)', () => {
    expect(stripTashkeel('شَيْئًا كِتَابٌ عِلْمٍ')).toBe('شيئا كتاب علم');
  });

  it('strips shadda', () => {
    expect(stripTashkeel('مُحَمَّدٌ رَّسُولُ')).toBe('محمد رسول');
  });

  it('strips the dagger alif (U+0670)', () => {
    expect(stripTashkeel('الرَّحْمٰنِ')).toBe('الرحمن');
  });

  it('preserves hamza-on-alif forms أ إ آ and ٱ', () => {
    expect(stripTashkeel('أَ إِ آ ٱ')).toBe('أ إ آ ٱ');
    expect(stripTashkeel('أَحَدٌ ٱللَّهُ')).toBe('أحد ٱلله');
  });

  it('preserves base letters, alif maqsura ى and tatweel', () => {
    expect(stripTashkeel('عِيسى')).toBe('عيسى');
    expect(stripTashkeel('مــد')).toBe('مــد');
    expect(stripTashkeel('ء')).toBe('ء');
  });

  it('handles an empty string safely', () => {
    expect(stripTashkeel('')).toBe('');
  });
});
