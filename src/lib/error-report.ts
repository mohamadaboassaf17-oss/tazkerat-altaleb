/**
 * M10 — Supabase-only error reporting.
 * Captures window error / unhandledrejection and sync-engine errors.
 * Best-effort, never throws outward.
 */

import { supabase } from './supabase';

export interface ErrorContext {
  href?: string;
  userAgent?: string;
  extra?: Record<string, unknown>;
}

async function insertReport(message: string, stack: string | null, context: ErrorContext): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user?.id ?? null;
    const row: Record<string, unknown> = {
      message: message.slice(0, 2000),
      stack: stack ? stack.slice(0, 8000) : null,
      context: {
        ...context,
        href: typeof location !== 'undefined' ? location.href : undefined,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 500) : undefined,
      },
    };
    if (uid) row['user_id'] = uid;
    // anon insert when no session (policy allows user_id IS NULL)
    const { error } = await (supabase as unknown as { from: (t: string) => { insert: (r: unknown) => Promise<{ error: { message: string } | null }> } })
      .from('error_reports')
      .insert(row);
    if (error) console.warn('error-report insert failed:', error.message);
  } catch (e) {
    console.warn('error-report failed:', e);
  }
}

export function captureError(error: unknown, context: ErrorContext = {}): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? (error.stack ?? null) : null;
  void insertReport(message, stack, context);
}

export function initErrorReporting(): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const onError = (event: ErrorEvent) => {
    const maybeErr = (event as unknown as { error?: unknown }).error;
    const stack = maybeErr instanceof Error ? (maybeErr.stack ?? null) : null;
    void insertReport(event.message || 'window.onerror', stack, {
      extra: { filename: event.filename, lineno: event.lineno, colno: event.colno },
    });
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    const err: unknown = event.reason;
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? (err.stack ?? null) : null;
    void insertReport(`unhandledrejection: ${message}`, stack, {});
  };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}
