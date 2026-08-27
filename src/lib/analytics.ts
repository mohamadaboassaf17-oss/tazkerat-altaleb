/**
 * M10 — Supabase-only analytics (no external service, no Edge Function).
 * Batches in memory, flushes on visibilitychange/online/interval.
 * Respects navigator.doNotTrack. Best-effort: never throws outward.
 */

import { supabase } from './supabase';

export type AnalyticsEvent =
  | 'app_open'
  | 'page_view'
  | 'note_created'
  | 'note_updated'
  | 'note_deleted'
  | 'review_rated'
  | 'media_uploaded'
  | 'category_created'
  | 'book_created'
  | 'search_performed'
  | 'graph_opened'
  | 'install_prompt_shown'
  | 'install_prompt_accepted'
  | 'install_prompt_dismissed';

interface QueuedEvent {
  event: AnalyticsEvent;
  props: Record<string, unknown>;
  ts: string;
}

const queue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let isDoNotTrack = false;

try {
  isDoNotTrack =
    (typeof navigator !== 'undefined' &&
      (navigator.doNotTrack === '1' || (navigator as unknown as { msDoNotTrack?: string }).msDoNotTrack === '1')) ||
    (typeof window !== 'undefined' && (window as unknown as { doNotTrack?: string }).doNotTrack === '1');
} catch {
  isDoNotTrack = false;
}

export function track(event: AnalyticsEvent, props: Record<string, unknown> = {}): void {
  if (isDoNotTrack) return;
  queue.push({ event, props, ts: new Date().toISOString() });
  if (queue.length >= 10) void flush();
}

async function flush(): Promise<void> {
  if (queue.length === 0) return;
  const batch = queue.splice(0, queue.length);
  try {
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user.id ?? null;
    if (!uid) return; // anon events are dropped (no user_id)
    const rows = batch.map((q) => ({
      user_id: uid,
      event: q.event,
      props: { ...q.props, ts: q.ts, href: typeof location !== 'undefined' ? location.pathname : undefined },
    }));
    const { error } = await (supabase as unknown as { from: (t: string) => { insert: (r: unknown) => Promise<{ error: { message: string } | null }> } })
      .from('analytics_events')
      .insert(rows);
    if (error) {
      // re-queue on transient failure (best-effort, cap at 50)
      if (queue.length < 50) queue.unshift(...batch);
      console.warn('analytics flush failed:', error.message);
    }
  } catch (e) {
    console.warn('analytics flush error:', e);
  }
}

export function initAnalytics(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => undefined;
  if (flushTimer) return () => undefined;
  flushTimer = setInterval(() => void flush(), 30_000);
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') void flush();
  };
  const onOnline = () => void flush();
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('online', onOnline);
  window.addEventListener('beforeunload', () => void flush());
  // initial app_open
  track('app_open', {});
  return () => {
    if (flushTimer) clearInterval(flushTimer);
    flushTimer = null;
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('online', onOnline);
  };
}
