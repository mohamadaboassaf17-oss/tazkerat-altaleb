import { db } from './db';
import type { OutboxEntry } from '../types/models';

/**
 * Bump the conflict-resolution version of a locally edited record and flag
 * it as dirty.
 *
 * The client increments `version` on every local edit. When connectivity
 * returns, the push layer sends the row and Supabase keeps the copy with
 * the **highest `version`** — never by timestamp — which makes conflict
 * resolution immune to device clock skew.
 *
 * Returns a shallow copy; the input record is not mutated.
 */
export function bumpVersion<T extends { version: number }>(record: T): T {
  const copy: Record<string, unknown> = { ...record };
  copy.version = record.version + 1;
  copy.dirty = true;
  return copy as T;
}

/**
 * Append one pending change to the local outbox for asynchronous push to
 * Supabase.
 *
 * `queued_at` is stamped here for diagnostics only — conflict resolution
 * still relies solely on `version`. Failures propagate to the caller; no
 * errors are swallowed.
 */
export async function queueOutbox(
  entry: Omit<OutboxEntry, 'seq' | 'queued_at'>,
): Promise<void> {
  await db.outbox.add({ ...entry, queued_at: new Date().toISOString() });
}
