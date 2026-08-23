import { describe, expect, it } from 'vitest';
import { bumpVersion } from './sync-helpers';

/**
 * Minimal row shape matching the sync columns from AGENTS.md / PRD §7:
 * `version` (client-side conflict counter) and `server_version` (last
 * version acknowledged by Supabase). `dirty` is added by bumpVersion().
 */
interface TestRow {
  id: string;
  version: number;
  server_version: number;
  dirty?: boolean;
}

function makeRow(): TestRow {
  return { id: 'note_1', version: 3, server_version: 7 };
}

describe('bumpVersion', () => {
  it('increments version by exactly 1', () => {
    const row = makeRow();
    const bumped = bumpVersion(row);
    expect(bumped.version).toBe(row.version + 1);
    expect(bumped.version).toBe(4);
  });

  it('sets dirty=true on the returned record', () => {
    const row = makeRow();
    expect(row.dirty).toBeUndefined();
    const bumped = bumpVersion(row);
    expect(bumped.dirty).toBe(true);
  });

  it('does not mutate the input — returns a distinct copy', () => {
    const row = makeRow();
    const before: TestRow = { ...row };
    const bumped = bumpVersion(row);

    expect(bumped).not.toBe(row);
    expect(row).toEqual(before);
    expect(row.version).toBe(3);
    expect(row.dirty).toBeUndefined();
  });

  it('preserves server_version untouched', () => {
    const row = makeRow();
    const bumped = bumpVersion(row);
    expect(bumped.server_version).toBe(7);
  });
});
