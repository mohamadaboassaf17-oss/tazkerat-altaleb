/**
 * Arabic text normalization helpers shared by search, autocomplete and the
 * knowledge-graph labels (AGENTS.md "Arabic search normalization").
 */

/**
 * Strip Arabic diacritics (tashkeel) from a string.
 *
 * Removes U+064B–U+065F (tanwin, harakat, shadda, sukun, small marks) plus
 * the dagger alif U+0670. Base letters, tatweel, and hamza-on-alif forms
 * (أ إ آ) are preserved untouched.
 *
 * Pure function — no side effects.
 */
export function stripTashkeel(text: string): string {
  return text.replace(/[\u064B-\u065F\u0670]/g, '');
}
