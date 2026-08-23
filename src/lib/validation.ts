/**
 * Pure client-side validation helpers for auth forms.
 *
 * No React, no Supabase, no side effects — trivially unit-testable.
 * Each validator returns an Arabic error message, or `null` when the value
 * is acceptable.
 */

/** Deliberately pragmatic: something@something.tld with no whitespace. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Matches the Supabase default minimum password length (6). If the project
 * ever raises it in the dashboard, this constant and its message must move
 * in lockstep.
 */
const MIN_PASSWORD_LENGTH = 6;

export function validateEmail(value: string): string | null {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return 'البريد الإلكتروني مطلوب.';
  }

  if (!EMAIL_PATTERN.test(trimmed)) {
    return 'صيغة البريد الإلكتروني غير صحيحة.';
  }

  return null;
}

export function validatePassword(value: string): string | null {
  if (value.length === 0) {
    return 'كلمة المرور مطلوبة.';
  }

  if (value.length < MIN_PASSWORD_LENGTH) {
    return 'كلمة المرور يجب أن تكون 6 أحرف على الأقل.';
  }

  return null;
}
