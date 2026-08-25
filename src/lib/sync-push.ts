import type { Table } from 'dexie';
import type { PostgrestError } from '@supabase/supabase-js';
import type { OutboxEntry, TableName } from '../types/models';
import { db } from './db';
import { toCloudRow, toLocalRow } from './sync-serialize';
import { supabase } from './supabase';

/**
 * Push half of the M5 sync engine (AGENTS.md "Sync model").
 *
 * Drains the local outbox FIFO (`++seq`) to Supabase one entry at a time,
 * strictly in order: parent rows are always pushed before their children,
 * and the pass stops dead at the first entry that hits a transient error
 * or whose backoff window has not elapsed yet.
 *
 * Conflict policy — highest `version` wins, never timestamps:
 * - The DB-side guard raises `P0001` with message `SYNC_CONFLICT|<version>`
 *   whenever our UPDATE loses. We then adopt the server row wholesale
 *   (approved tie-break: server / first writer wins on equal versions).
 * - A `23505` unique violation on an INSERT means the id raced an existing
 *   server row; the server row is adopted only when it is at least as new.
 *
 * Transient failures (network, 5xx, 429, anything unrecognized) are kept
 * on the entry with attempt counting and exponential backoff — nothing is
 * ever dropped silently.
 *
 * Queued payloads are locally shaped; each upsert runs through
 * `toCloudRow` so SQL column names (`note_type`, `media_type`) reach the
 * wire — pushing a TS-shaped payload verbatim would be rejected by
 * PostgREST (PGRST204) as transient forever, wedging the FIFO behind it.
 */

/** Tables eligible for pushing; note_links never enters the outbox (D10). */
export type SyncableTableName = Exclude<TableName, 'note_links'>;

/**
 * Typed accessor map from outbox `table_name` values to their local Dexie
 * tables, viewed through the loose row shape the sync layer manipulates.
 * Casts go through `unknown` because each concrete table is stricter than
 * the generic bookkeeping view used here.
 */
const LOCAL_TABLES: Record<SyncableTableName, Table<Record<string, unknown>, string>> = {
  users: db.users as unknown as Table<Record<string, unknown>, string>,
  categories: db.categories as unknown as Table<Record<string, unknown>, string>,
  books: db.books as unknown as Table<Record<string, unknown>, string>,
  lecturers: db.lecturers as unknown as Table<Record<string, unknown>, string>,
  lectures: db.lectures as unknown as Table<Record<string, unknown>, string>,
  notes: db.notes as unknown as Table<Record<string, unknown>, string>,
  media: db.media as unknown as Table<Record<string, unknown>, string>,
};

/** Backoff base (first retry delay) in milliseconds. */
export const BASE_BACKOFF_MS = 1000;

/** Upper bound for any single retry delay, in milliseconds. */
export const MAX_BACKOFF_MS = 60_000;

/** PostgreSQL unique-violation code: our INSERT id already exists upstream. */
const UNIQUE_VIOLATION_CODE = '23505';

/** ERRCODE raised by the server-side version-guard trigger. */
const CONFLICT_GUARD_CODE = 'P0001';

/** Message prefix emitted by the server-side version-guard trigger. */
const CONFLICT_MESSAGE_PREFIX = 'SYNC_CONFLICT|';

/** Maximum fraction the computed backoff may deviate from its base. */
const JITTER_FRACTION = 0.2;

/**
 * Exponential backoff for a retry after `attempts` failures:
 * `min(BASE * 2^(attempts-1), MAX)` with ±20% jitter so many devices do
 * not retry in lockstep.
 */
export function backoffMs(attempts: number): number {
  const base = Math.min(BASE_BACKOFF_MS * 2 ** Math.max(attempts - 1, 0), MAX_BACKOFF_MS);
  const jitterFactor = 1 + (Math.random() * 2 * JITTER_FRACTION - JITTER_FRACTION);
  return Math.round(base * jitterFactor);
}

/** How one outbox entry resolved during this pass. */
type EntryOutcome =
  | { kind: 'pushed' }
  | { kind: 'adopted' }
  | { kind: 'transient'; message: string };

/**
 * Drain every ready outbox entry, oldest `seq` first.
 *
 * Returns how many entries were successfully pushed and whether the pass
 * ended early on a transient failure (remaining entries are intentionally
 * left queued). Entries whose backoff window has not elapsed stop the pass
 * without being touched — later entries are never processed past them.
 * Without an authenticated session this is an immediate no-op.
 */
export async function pushOutbox(): Promise<{ pushed: number; failed: boolean }> {
  const { data } = await supabase.auth.getSession();
  if (data.session === null) {
    // Auth gate — leave every entry untouched for the next cycle.
    return { pushed: 0, failed: false };
  }

  const entries = await db.outbox.orderBy('seq').toArray();
  let pushed = 0;

  for (const entry of entries) {
    if (!isEligible(entry)) {
      // FIFO strictness: never skip past a not-yet-ready entry.
      break;
    }
    try {
      const outcome = await processEntry(entry);
      if (outcome.kind === 'transient') {
        await recordTransientFailure(requireSeq(entry), entry.attempts ?? 0, outcome.message);
        return { pushed, failed: true };
      }
      if (outcome.kind === 'pushed') {
        pushed += 1;
      }
    } catch (error) {
      // Thrown errors are network-level failures (fetch TypeErrors and
      // alike) — treated exactly like resolved transient errors.
      await recordTransientFailure(
        requireSeq(entry),
        entry.attempts ?? 0,
        error instanceof Error ? error.message : String(error),
      );
      return { pushed, failed: true };
    }
  }

  return { pushed, failed: false };
}

/** True when the entry's backoff window (if any) has elapsed. */
function isEligible(entry: OutboxEntry): boolean {
  if (entry.next_attempt_at === undefined || entry.next_attempt_at === null) {
    return true;
  }
  const at = Date.parse(entry.next_attempt_at);
  // A corrupt timestamp must never brick an entry forever.
  return Number.isNaN(at) || at <= Date.now();
}

/** Push or resolve a single outbox entry according to its `op`. */
async function processEntry(entry: OutboxEntry): Promise<EntryOutcome> {
  const table = assertSyncableTable(entry.table_name);

  if (entry.op === 'delete') {
    const { error }: { data: unknown; error: PostgrestError | null } = await supabase
      .from(table)
      .delete()
      .eq('id', entry.record_id);
    if (error !== null) {
      return transientOrAdopt(table, entry, error);
    }
    // Zero affected rows is success — the row may already be gone upstream.
    await finalizeSuccess(table, entry, null);
    return { kind: 'pushed' };
  }

  const payload = toCloudRow(table, requirePayloadObject(entry));
  const { error }: { data: unknown; error: PostgrestError | null } = await supabase
    .from(table)
    .upsert(payload, { onConflict: 'id' });

  if (error !== null) {
    return transientOrAdopt(table, entry, error);
  }
  await finalizeSuccess(table, entry, requireVersion(payload));
  return { kind: 'pushed' };
}

/**
 * Route a resolved-but-failed write: conflicts and racing inserts adopt the
 * server row, everything else is transient.
 */
async function transientOrAdopt(
  table: SyncableTableName,
  entry: OutboxEntry,
  error: PostgrestError,
): Promise<EntryOutcome> {
  if (error.code === CONFLICT_GUARD_CODE && error.message.startsWith(CONFLICT_MESSAGE_PREFIX)) {
    // The guard fired because the server already holds a version >= ours.
    const adopted = await adoptServerRow(table, entry, undefined);
    return adopted ?? { kind: 'transient', message: error.message };
  }
  if (entry.op === 'insert' && error.code === UNIQUE_VIOLATION_CODE) {
    // Same id inserted concurrently — server wins only if it is at least
    // as new as our payload.
    const clientVersion = requireVersion(requirePayloadObject(entry));
    const adopted = await adoptServerRow(table, entry, clientVersion);
    return adopted ?? { kind: 'transient', message: error.message };
  }
  return { kind: 'transient', message: error.message };
}

/**
 * Fetch the authoritative server row for `record_id` and adopt it locally:
 * overwrite the local mirror with `dirty=false` / `server_version=<server>`
 * and drop the outbox entry — all in one Dexie transaction.
 *
 * Returns the outcome, or `null` when adoption is not possible right now
 * (fetch failed, or the server row is older than `atLeastClientVersion`)
 * so the caller falls back to the transient path.
 */
async function adoptServerRow(
  table: SyncableTableName,
  entry: OutboxEntry,
  atLeastClientVersion: number | undefined,
): Promise<EntryOutcome | null> {
  const { data, error }: { data: unknown; error: PostgrestError | null } = await supabase
    .from(table)
    .select('*')
    .eq('id', entry.record_id)
    .single();

  if (error !== null || data === null || typeof data !== 'object') {
    return null;
  }
  const serverRow = data as Record<string, unknown>;
  const serverVersion = requireVersion(serverRow);
  if (atLeastClientVersion !== undefined && serverVersion < atLeastClientVersion) {
    return null;
  }

  const localRow = toLocalRow(table, serverRow);
  localRow['dirty'] = false;
  localRow['server_version'] = serverVersion;

  const seq = requireSeq(entry);
  await db.transaction('rw', LOCAL_TABLES[table], db.outbox, async () => {
    await LOCAL_TABLES[table].put(localRow);
    await db.outbox.delete(seq);
  });
  return { kind: 'adopted' };
}

/**
 * Acknowledge a successful push in ONE transaction: stamp the local row
 * clean (`dirty=false`, `server_version=<pushed version>`) and delete the
 * outbox entry. A vanished local row (deleted by a later operation) is not
 * an error — only the entry removal matters.
 */
async function finalizeSuccess(
  table: SyncableTableName,
  entry: OutboxEntry,
  version: number | null,
): Promise<void> {
  const localTable = LOCAL_TABLES[table];
  const seq = requireSeq(entry);
  await db.transaction('rw', localTable, db.outbox, async () => {
    const localRow = await localTable.get(entry.record_id);
    if (localRow !== undefined && version !== null) {
      await localTable.put({ ...localRow, dirty: false, server_version: version });
    }
    await db.outbox.delete(seq);
  });
}

/** Persist retry bookkeeping on the entry: attempts, error, next window. */
async function recordTransientFailure(
  seq: number,
  previousAttempts: number,
  message: string,
): Promise<void> {
  const attempts = previousAttempts + 1;
  await db.outbox.update(seq, {
    attempts,
    last_error: message,
    next_attempt_at: new Date(Date.now() + backoffMs(attempts)).toISOString(),
  });
}

/** Reject tables that must never reach the wire (derived data — D10). */
function assertSyncableTable(table: TableName): SyncableTableName {
  if (table === 'note_links') {
    throw new Error(
      'sync-push: note_links must never be pushed — it is derived data rebuilt from notes.content (decision D10).',
    );
  }
  return table;
}

/**
 * Narrow the opaque payload to the locally shaped row. The cloud column
 * mapping (e.g. notes `type` → `note_type`) happens right before the wire
 * via `toCloudRow`; `version` survives that mapping untouched.
 */
function requirePayloadObject(entry: OutboxEntry): Record<string, unknown> {
  if (entry.payload === null || typeof entry.payload !== 'object') {
    throw new Error(
      `sync-push: ${entry.op} entry for "${entry.record_id}" carries no cloud-shaped payload.`,
    );
  }
  return entry.payload as Record<string, unknown>;
}

/** Narrow a cloud row's `version` column, failing loudly when absent. */
function requireVersion(row: Record<string, unknown>): number {
  const version = row['version'];
  if (typeof version !== 'number') {
    throw new Error(
      `sync-push: cloud row "${String(row['id'])}" carries no numeric "version".`,
    );
  }
  return version;
}

/** Require the auto-increment `seq`; without it retry state cannot persist. */
function requireSeq(entry: OutboxEntry): number {
  if (entry.seq === undefined) {
    throw new Error(
      `sync-push: outbox entry for "${entry.table_name}/${entry.record_id}" has no seq.`,
    );
  }
  return entry.seq;
}
