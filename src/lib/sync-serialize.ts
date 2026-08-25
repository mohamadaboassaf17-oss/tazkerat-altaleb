import type { TableName } from '../types/models';

/**
 * Explicit row translation between the local Dexie shape and the cloud
 * Supabase shape, consumed by the M5 sync engine.
 *
 * Naming mismatch (PROJECT_STATE K3): TypeScript exposes the discriminator
 * field `type` on CloudNote/CloudMedia, but the SQL columns are
 * `note_type` / `media_type`. Per the owner decision the TS field names
 * stay; the rename happens here — and only here — explicitly.
 *
 * Guarantees:
 * - `toCloudRow` produces a payload safe to push verbatim: client-only
 *   bookkeeping (`dirty`, `server_version`) is stripped and every other
 *   column passes through untouched.
 * - `toLocalRow` maps cloud columns back onto the local shape and stamps
 *   `server_version` from `version` only when the caller did not supply
 *   one — only the caller knows the pull context (fresh insert vs. merge).
 *   It never writes `dirty`; pull reconciliation owns that flag.
 * - Any table without defined rules throws. There are no silent fallbacks.
 */

/** Client-only sync bookkeeping fields that must never leave the device. */
const CLIENT_ONLY_FIELDS: readonly string[] = ['dirty', 'server_version'];

/**
 * Tables whose local and cloud rows share identical column names — they
 * need only bookkeeping stripped (push) and `server_version` restored
 * (pull).
 */
const PASS_THROUGH_TABLES: readonly TableName[] = [
  'users',
  'categories',
  'books',
  'lecturers',
  'lectures',
];

/**
 * Tables carrying a renamed discriminator column: TypeScript exposes the
 * field as `type` while the SQL column differs (PROJECT_STATE K3).
 */
const TYPE_COLUMN_BY_TABLE: ReadonlyMap<TableName, string> = new Map([
  ['notes', 'note_type'],
  ['media', 'media_type'],
]);

/** How one table's rows differ between local and cloud shape. */
type TableMapping =
  | { readonly kind: 'pass-through' }
  | { readonly kind: 'renamed-type'; readonly typeColumn: string };

/**
 * Resolve the translation rules for one table. Throws for tables that must
 * never be serialized (`note_links` is derived data — decision D10) and for
 * any name outside the known syncable set.
 */
function resolveMapping(table: TableName): TableMapping {
  if (table === 'note_links') {
    throw new Error(
      'sync-serialize: note_links is not syncable — it is derived data rebuilt from notes.content on every save and never enters the outbox (decision D10).',
    );
  }
  if (PASS_THROUGH_TABLES.includes(table)) {
    return { kind: 'pass-through' };
  }
  const typeColumn = TYPE_COLUMN_BY_TABLE.get(table);
  if (typeColumn !== undefined) {
    return { kind: 'renamed-type', typeColumn };
  }
  throw new Error(
    `sync-serialize: unsupported table "${table}" — no serialization rules are defined for it.`,
  );
}

/** Return a shallow copy with every client-only field removed. */
function stripClientOnlyFields(row: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...row };
  for (const field of CLIENT_ONLY_FIELDS) {
    delete copy[field];
  }
  return copy;
}

/**
 * Translate one local row into its cloud-shaped push payload.
 *
 * Strips `dirty` and `server_version`, renames the discriminator column on
 * notes/media (`type` → `note_type` / `media_type`) and passes every other
 * column through untouched. The input row is not mutated.
 */
export function toCloudRow(
  table: TableName,
  localRow: Record<string, unknown>,
): Record<string, unknown> {
  const mapping = resolveMapping(table);
  const cloudRow = stripClientOnlyFields(localRow);
  if (mapping.kind === 'renamed-type') {
    cloudRow[mapping.typeColumn] = cloudRow['type'];
    delete cloudRow['type'];
  }
  return cloudRow;
}

/**
 * Translate one cloud row into its local Dexie shape.
 *
 * Renames the discriminator column back onto `type` for notes/media,
 * passes every other column through untouched, and stamps
 * `server_version` from `version` when (and only when) the caller did not
 * supply a value. Throws if neither is present, so the output always has
 * a numeric `server_version`. `dirty` is never written — pull
 * reconciliation decides dirtiness. The input row is not mutated.
 */
export function toLocalRow(
  table: TableName,
  cloudRow: Record<string, unknown>,
): Record<string, unknown> {
  const mapping = resolveMapping(table);
  const localRow: Record<string, unknown> = { ...cloudRow };
  if (mapping.kind === 'renamed-type') {
    localRow['type'] = localRow[mapping.typeColumn];
    delete localRow[mapping.typeColumn];
  }
  if (localRow['server_version'] === undefined) {
    const version = localRow['version'];
    if (typeof version !== 'number') {
      throw new Error(
        `sync-serialize: cannot stamp server_version for table "${table}" — the cloud row carries no numeric "version".`,
      );
    }
    localRow['server_version'] = version;
  }
  return localRow;
}
