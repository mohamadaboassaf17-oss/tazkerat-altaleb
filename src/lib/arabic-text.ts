/**
 * Arabic text normalization helpers shared by search, autocomplete and the
 * knowledge-graph labels (AGENTS.md "Arabic search normalization").
 *
 * Search pipeline (normalizeArabic) runs in this exact order:
 *   1. Strip tashkeel (ً-ْ) + dagger alif (U+0670)
 *   2. Normalize hamza family: أ إ آ ٱ → ا
 *   3. Drop definite article ال and prefixes و/ف/ب (one level, guarded)
 * Labels (graph / autocomplete display) use stripTashkeel only — tashkeel
 * stays in the body per AGENTS.md RTL rule.
 */

/**
 * Strip Arabic diacritics (tashkeel) from a string.
 *
 * Removes U+064B–U+065F (tanwin, harakat, shadda, sukun, small marks) plus
 * the dagger alif U+0670. Base letters, tatweel, and hamza-on-alif forms
 * (أ إ آ) are preserved untouched.
 */
export function stripTashkeel(text: string): string {
  return text.replace(/[\u064B-\u065F\u0670]/g, '');
}

/**
 * Normalize the hamza family to bare alif (ا).
 * Covers أ (U+0623) إ (U+0625) آ (U+0622) ٱ (U+0671).
 */
export function normalizeHamza(text: string): string {
  return text.replace(/[أإآٱ]/g, 'ا');
}

/**
 * Drop Arabic definite article ال and single-char prefixes و/ف/ب.
 *
 * Iteratively strips leading ال (when remainder >= 2 chars) and single
 * و/ف/ب prefixes (when remainder >= 2 chars) so stacked forms like
 * والكتاب / فبالعقيدة / بالعقيدة collapse to كتاب / عقيدة.
 * Short tokens (≤2 chars) are left untouched to avoid وليد → ليد.
 * Handles ال alone and single-letter inputs safely.
 */
export function stripArabicPrefixes(text: string): string {
  let s = text.trim();
  // Normalize the whole-word path in one pass for prefix stripping to keep
  // the contract simple: callers pass a single token or phrase — we strip
  // only the leading prefixes of the first word, not interior words.
  // For multi-word phrases this still handles cases like "العقيدة والفقه"
  // correctly on token-level via normalizeArabic's word-level loop below,
  // but here we handle single-token prefix collapse.
  let iterations = 0;
  while (iterations < 4) {
    const before = s;
    // Strip ال when remainder >= 2 chars (e.g., "ال" alone stays "ال")
    if (s.startsWith('ال') && s.length > 3) {
      s = s.slice(2);
    }
    // Strip single و/ف/ب prefix — guarded to preserve short names like وليد/بدر/فهد
    // (needs token length >=5 and remainder >=3 so 4-letter وليد stays, while
    // stacked والكتاب/بالعقيدة still collapse via the iterative ال loop).
    if (/^[وفب]/.test(s) && s.length >= 5) {
      const remainder = s.slice(1);
      if (remainder.length >= 3) {
        s = remainder;
      }
    }
    // Handle stacked وال/فال/بال: after stripping ال above, a leading و/ف/ب
    // may reappear → loop again (e.g., والكتاب → الكتاب → كتاب)
    if (s === before) break;
    iterations += 1;
  }
  return s;
}

/**
 * Full Arabic search normalization (AGENTS.md § — applied to both query
 * and indexed value in this order):
 *   stripTashkeel → normalizeHamza → drop ال/و/ف/ب per word.
 *
 * Normalizes each whitespace-delimited token independently so that
 * "العقيدة والفقه" → "عقيدة فقه" (both words normalized) while keeping
 * inter-word spaces. Also lowercases and collapses whitespace for
 * case-insensitive Latin fragments.
 */
export function normalizeArabic(text: string): string {
  if (text.length === 0) return '';
  // 1+2 globally first (cheaper): tashkeel + hamza across the whole string
  let s = stripTashkeel(text);
  s = normalizeHamza(s);
  s = s.toLowerCase();
  s = s.replace(/\s+/g, ' ').trim();
  if (s.length === 0) return '';
  // 3. Prefix stripping per token
  const tokens = s.split(' ');
  const normalized = tokens
    .map((tok) => (tok.length === 0 ? '' : stripArabicPrefixes(tok)))
    .filter((tok) => tok.length > 0)
    .join(' ');
  return normalized;
}
