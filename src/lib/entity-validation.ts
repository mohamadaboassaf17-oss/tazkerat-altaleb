/**
 * Pure client-side validation helpers for the M3 hierarchy entity forms
 * (categories, books, lecturers, lectures).
 *
 * Same contract as validation.ts: no React, no Dexie, no side effects;
 * each validator returns an Arabic error message or `null` when valid.
 */

const MAX_TEXT_LENGTH = 120;

export function validateRequiredText(value: string, label: string): string | null {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return `${label} مطلوب.`;
  }

  if (trimmed.length > MAX_TEXT_LENGTH) {
    return `${label} طويل جدًا (${MAX_TEXT_LENGTH} حرفًا كحد أقصى).`;
  }

  return null;
}

/** Digits-only parse; returns null for blank or non-integer input. */
export function parseIntegerInput(raw: string): number | null {
  const trimmed = raw.trim();

  if (trimmed.length === 0 || !/^\d+$/.test(trimmed)) {
    return null;
  }

  return Number.parseInt(trimmed, 10);
}
