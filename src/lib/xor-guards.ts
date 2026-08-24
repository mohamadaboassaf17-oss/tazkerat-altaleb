/**
 * Client-side mirrors of the two XOR invariants (AGENTS.md, PRD §7.5/§7.7).
 *
 * The database CHECK constraints remain authoritative; these guards give
 * the client an early, Arabic-labeled verdict so invalid rows never reach
 * Dexie or the outbox.
 */

export type XorGuardResult = { ok: true } | { ok: false; reason: string };

const NOTE_BOTH_SET_REASON =
  'لا يمكن ربط الملاحظة بكتاب ومحاضرة في آنٍ واحد — اختر أحدهما فقط أو اترك الحقلين فارغَين.';
const MEDIA_BOTH_SET_REASON =
  'لا يمكن ربط الوسيط بملاحظة ومحاضرة في آنٍ واحد — اختر أحدهما فقط.';
const MEDIA_BOTH_NULL_REASON = 'يجب ربط الوسيط بملاحظة أو بمحاضرة — أحد الحقلين مطلوب.';

/** An empty/whitespace string counts as unset, mirroring SQL NULL intent. */
function isSet(value: string | null | undefined): boolean {
  return value !== null && value !== undefined && value.trim().length > 0;
}

/**
 * PRD §7.5 — a note hangs off a book XOR a lecture, or neither.
 * Both-null is valid (a free-standing note); both-set is not.
 */
export function validateNoteTargets(
  bookId: string | null | undefined,
  lectureId: string | null | undefined,
): XorGuardResult {
  if (isSet(bookId) && isSet(lectureId)) {
    return { ok: false, reason: NOTE_BOTH_SET_REASON };
  }
  return { ok: true };
}

/**
 * PRD §7.7 — media MUST hang off exactly one of note/lecture.
 * Unlike notes, both-null is rejected.
 */
export function validateMediaTargets(
  noteId: string | null | undefined,
  lectureId: string | null | undefined,
): XorGuardResult {
  if (isSet(noteId) && isSet(lectureId)) {
    return { ok: false, reason: MEDIA_BOTH_SET_REASON };
  }
  if (!isSet(noteId) && !isSet(lectureId)) {
    return { ok: false, reason: MEDIA_BOTH_NULL_REASON };
  }
  return { ok: true };
}
