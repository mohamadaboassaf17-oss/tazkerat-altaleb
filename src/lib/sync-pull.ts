import type { PostgrestError } from '@supabase/supabase-js';
import type { Table } from 'dexie';
import type { LocalNoteLink, TableName } from '../types/models';
import { db } from './db';
import { toLocalRow } from './sync-serialize';
import { parseWikiLinks } from './note-text';
import { supabase } from './supabase';

/**
 * Pull half of the M5 sync engine (AGENTS.md "Sync model").
 *
 * Fetches cloud rows table-by-table in fixed parent-before-child order,
 * using a per-user, per-table `updated_at` cursor stored in `sync_meta`.
 * Each pull overlaps the previous cursor by a small window so rows written
 * within the drift gap are never missed. RLS scopes every query to the
 * session owner automatically.
 *
 * Reconciliation rule: an incoming row is applied only when there is no
 * local row yet, or the local row is clean AND the incoming `version` is
 * strictly higher — pending local edits are never clobbered. Applied rows
 * land with `dirty=false` / `server_version=<incoming version>`.
 *
 * Every table fetch is offset-paginated (`PAGE_SIZE` per request): a bare
 * `select('*')` truncates at PostgREST's server-side max-rows while the
 * cursor would still advance past the truncated tail — permanent silent
 * loss. Pulled notes get their wiki-link edges re-derived locally in the
 * SAME Dexie transaction as their row writes (decision D10: note_links
 * never sync; they are rebuilt from `notes.content`).
 */

/** Tables eligible for pulling; note_links is derived and never synced (D10). */
export type SyncableTableName = Exclude<TableName, 'note_links'>;

/** Fixed pull order — parents before children so FK targets exist locally first. */
export const PULL_TABLE_ORDER: readonly SyncableTableName[] = [
  'users',
  'categories',
  'books',
  'lecturers',
  'lectures',
  'notes',
  'media',
];

/**
 * Extra look-back window (ms) subtracted from the stored cursor so rows
 * committed inside the clock-drift gap between pulls are still fetched.
 */
const OVERLAP_WINDOW_MS = 5000;

/**
 * Rows requested per paginated fetch. PostgREST caps any single response
 * at its configured max-rows (~1000), so paging keeps large-table pulls
 * complete instead of silently truncated.
 */
export const PAGE_SIZE = 500;

/**
 * Typed accessor map from table names to their local Dexie tables, viewed
 * through the loose row shape the sync layer manipulates.
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

/** `sync_meta` key holding one table's last-seen `updated_at`. */
function pullCursorKey(userId: string, table: SyncableTableName): string {
  return `pull_cursor_${userId}_${table}`;
}

interface CloudPage {
  data: unknown;
  error: PostgrestError | null;
}

/**
 * Fetch EVERY matching row of one table behind bounded offset pagination.
 *
 * Why pagination: PostgREST truncates a bare `select('*')` at its
 * server-side max-rows setting, while the `updated_at` cursor would still
 * advance past the truncated tail — permanently losing those rows. Pages
 * of `PAGE_SIZE` are requested via `.range(offset, …)` until one comes
 * back shorter than `PAGE_SIZE`; only then is the table considered fully
 * fetched (and only then may the caller advance its cursor). A page error
 * aborts the fetch so the caller never advances past partial data.
 *
 * Full fetch on first-ever pull, otherwise only rows at or after
 * (`cursor - overlap window`). A corrupt cursor self-heals into a full
 * fetch rather than bricking synchronization.
 */
async function fetchAllRows(table: SyncableTableName, cursor: string | null): Promise<CloudPage> {
  const cursorTime = cursor !== null ? Date.parse(cursor) : Number.NaN;
  const overlapFrom =
    cursor !== null && !Number.isNaN(cursorTime)
      ? new Date(cursorTime - OVERLAP_WINDOW_MS).toISOString()
      : null;

  const rows: Array<Record<string, unknown>> = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const query =
      overlapFrom === null
        ? supabase.from(table).select('*')
        : supabase.from(table).select('*').gte('updated_at', overlapFrom);
    const { data, error }: CloudPage = await query.range(offset, offset + PAGE_SIZE - 1);
    if (error !== null) {
      return { data: [], error };
    }
    const pageRows = normalizeRows(data);
    rows.push(...pageRows);
    if (pageRows.length < PAGE_SIZE) {
      return { data: rows, error: null };
    }
  }
}

/**
 * Pull every table for `userId`, advancing per-table cursors and returning
 * how many local rows were written. Throws on any query failure — callers
 * (the sync engine) own retry policy.
 */
export async function pullChanges(userId: string): Promise<{ pulled: number }> {
  if (userId.trim().length === 0) {
    throw new Error('sync-pull: pullChanges requires a non-empty user id.');
  }

  let pulled = 0;

  for (const table of PULL_TABLE_ORDER) {
    const cursorKey = pullCursorKey(userId, table);
    const metaRow = await db.sync_meta.get(cursorKey);
    const cursor = metaRow?.value ?? null;

    const page = await fetchAllRows(table, cursor);
    if (page.error !== null) {
      throw new Error(`sync-pull: fetching "${table}" failed: ${page.error.message}`);
    }
    const rows = normalizeRows(page.data);

    pulled +=
      table === 'notes'
        ? await reconcileNotesAtomically(rows)
        : await reconcileOtherTable(table, rows);

    let maxUpdatedAt = cursor;
    for (const cloudRow of rows) {
      const id = requireString(cloudRow['id'], `${table} row "id"`);
      maxUpdatedAt = maxIso(
        maxUpdatedAt,
        requireString(cloudRow['updated_at'], `${table} row "${id}" field "updated_at"`),
      );
    }

    // Cursor advances only when something was actually fetched, and only
    // after the table has been fetched in full (see fetchAllRows) — an
    // empty batch must not push the window forward past unseen rows.
    if (rows.length > 0 && maxUpdatedAt !== null) {
      await db.sync_meta.put({ key: cursorKey, value: maxUpdatedAt });
    }
  }

  return { pulled };
}

/**
 * Reconcile a non-note table row-by-row; each applied row commits on its
 * own — only notes pair their writes with derived-link bookkeeping.
 */
async function reconcileOtherTable(
  table: Exclude<SyncableTableName, 'notes'>,
  rows: ReadonlyArray<Record<string, unknown>>,
): Promise<number> {
  let applied = 0;
  for (const cloudRow of rows) {
    const id = requireString(cloudRow['id'], `${table} row "id"`);
    const incomingVersion = requireNumber(
      cloudRow['version'],
      `${table} row "${id}" field "version"`,
    );
    if (await applyRowIfNewer(table, id, cloudRow, incomingVersion)) {
      applied += 1;
    }
  }
  return applied;
}

/**
 * Apply every pulled note row AND the wiki-link re-derivation for those
 * rows inside ONE Dexie transaction, mirroring note-crud's atomicity: a
 * crash mid-batch must never leave stale `note_links` behind with nothing
 * left to repair them (links are rebuilt only when their source is saved).
 */
async function reconcileNotesAtomically(
  rows: ReadonlyArray<Record<string, unknown>>,
): Promise<number> {
  return db.transaction('rw', db.notes, db.note_links, async () => {
    const appliedNoteIds: string[] = [];
    for (const cloudRow of rows) {
      const id = requireString(cloudRow['id'], 'notes row "id"');
      const incomingVersion = requireNumber(
        cloudRow['version'],
        `notes row "${id}" field "version"`,
      );
      if (await applyRowIfNewer('notes', id, cloudRow, incomingVersion)) {
        appliedNoteIds.push(id);
      }
    }
    if (appliedNoteIds.length > 0) {
      await rebuildLinks(appliedNoteIds);
    }
    return appliedNoteIds.length;
  });
}

/** Apply one cloud row unless it would clobber newer pending local work. */
async function applyRowIfNewer(
  table: SyncableTableName,
  id: string,
  cloudRow: Record<string, unknown>,
  incomingVersion: number,
): Promise<boolean> {
  const localTable = LOCAL_TABLES[table];
  const existing = await localTable.get(id);
  if (existing !== undefined) {
    // Never clobber pending local edits, whatever their version.
    if (existing['dirty'] === true) {
      return false;
    }
    const localServerVersion = existing['server_version'];
    if (
      typeof localServerVersion !== 'number' ||
      !(incomingVersion > localServerVersion)
    ) {
      // Clean but equal-or-newer locally — nothing to do.
      return false;
    }
  }

  const merged = toLocalRow(table, cloudRow);
  merged['dirty'] = false;
  merged['server_version'] = incomingVersion;
  await localTable.put(merged);
  return true;
}

/**
 * Re-derive wiki-link edges for the given notes, mirroring note-crud's
 * rebuild semantics: DELETE each source's outgoing edges, then INSERT
 * edges for parsed targets that exist locally — skipping self-references,
 * duplicates and dangling ids (no orphans).
 *
 * MUST run inside an open read-write transaction covering db.notes and
 * db.note_links — callers pair it with the note-row writes so the derived
 * edges commit atomically with them (decision D10: never queued).
 */
async function rebuildLinks(sourceNoteIds: readonly string[]): Promise<void> {
  const now = new Date().toISOString();
  const edges: LocalNoteLink[] = [];

  for (const sourceId of sourceNoteIds) {
    const source = await db.notes.get(sourceId);
    if (source === undefined) {
      continue; // deleted remotely mid-batch — nothing to derive
    }
    await db.note_links.where('source_note_id').equals(sourceId).delete();

    for (const targetId of parseWikiLinks(source.content)) {
      if (targetId === sourceId) {
        continue;
      }
      if (
        edges.some(
          (edge) =>
            edge.source_note_id === sourceId && edge.target_note_id === targetId,
        )
      ) {
        continue;
      }
      if ((await db.notes.get(targetId)) === undefined) {
        continue; // dangling target — no orphan edge
      }
      edges.push({
        id: crypto.randomUUID(),
        source_note_id: sourceId,
        target_note_id: targetId,
        created_at: now,
      });
    }
  }

  await db.note_links.bulkAdd(edges);
}

/** Narrow a query payload to its object rows, dropping anything malformed. */
function normalizeRows(data: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(data)) {
    return [];
  }
  return data.filter((row): row is Record<string, unknown> => {
    return row !== null && typeof row === 'object';
  });
}

/** Return the later of two ISO timestamps (or `b` when `a` is null). */
function maxIso(current: string | null, candidate: string): string {
  if (current === null || Date.parse(candidate) > Date.parse(current)) {
    return candidate;
  }
  return current;
}

/** Narrow an unknown column value to a string, failing loudly. */
function requireString(value: unknown, what: string): string {
  if (typeof value !== 'string') {
    throw new Error(`sync-pull: expected a string for ${what}.`);
  }
  return value;
}

/** Narrow an unknown column value to a number, failing loudly. */
function requireNumber(value: unknown, what: string): number {
  if (typeof value !== 'number') {
    throw new Error(`sync-pull: expected a number for ${what}.`);
  }
  return value;
}
