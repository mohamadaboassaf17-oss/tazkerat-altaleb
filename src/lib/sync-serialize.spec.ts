import { describe, expect, it } from 'vitest';
import type { TableName } from '../types/models';
import { toCloudRow, toLocalRow } from './sync-serialize';

const CREATED_AT = '2026-08-01T10:00:00.000Z';
const UPDATED_AT = '2026-08-05T12:00:00.000Z';

/** One representative local row per syncable table (bookkeeping included). */
const LOCAL_FIXTURES: ReadonlyArray<readonly [TableName, Record<string, unknown>]> = [
  [
    'users',
    {
      id: 'u_1',
      email: 'student@example.com',
      display_name: 'طالب العلم',
      media_trial_started_at: null,
      created_at: CREATED_AT,
      updated_at: UPDATED_AT,
      version: 3,
      dirty: true,
      server_version: 3,
    },
  ],
  [
    'categories',
    {
      id: 'cat_1',
      user_id: 'u_1',
      name: 'العقيدة',
      icon: 'mosque',
      created_at: CREATED_AT,
      updated_at: UPDATED_AT,
      version: 2,
      dirty: true,
      server_version: 2,
    },
  ],
  [
    'books',
    {
      id: 'book_1',
      user_id: 'u_1',
      category_id: 'cat_1',
      title: 'الأصول الثلاثة',
      total_pages: 40,
      current_page: 7,
      last_opened_at: UPDATED_AT,
      created_at: CREATED_AT,
      updated_at: UPDATED_AT,
      version: 5,
      dirty: false,
      server_version: 5,
    },
  ],
  [
    'lecturers',
    {
      id: 'lecturer_1',
      user_id: 'u_1',
      book_id: 'book_1',
      name: 'الشيخ صالح الفوزان',
      created_at: CREATED_AT,
      updated_at: UPDATED_AT,
      version: 1,
      dirty: true,
      server_version: 1,
    },
  ],
  [
    'lectures',
    {
      id: 'lecture_1',
      lecturer_id: 'lecturer_1',
      title: 'المحاضرة الأولى',
      duration_minutes: 45,
      is_completed: false,
      created_at: CREATED_AT,
      updated_at: UPDATED_AT,
      version: 2,
      dirty: true,
      server_version: 2,
    },
  ],
  [
    'notes',
    {
      id: 'note_1',
      user_id: 'u_1',
      book_id: 'book_1',
      lecture_id: null,
      title: 'فائدة عن التوحيد',
      content: 'فائدة عن التوحيد\n\nمتن الملاحظة',
      type: 'memorization',
      review_date: '2026-08-25',
      is_public: false,
      created_at: CREATED_AT,
      updated_at: UPDATED_AT,
      version: 4,
      dirty: true,
      server_version: 4,
    },
  ],
  [
    'media',
    {
      id: 'media_1',
      user_id: 'u_1',
      note_id: 'note_1',
      lecture_id: null,
      type: 'audio',
      url: 'https://storage.example.com/audio_1.m4a',
      created_at: CREATED_AT,
      updated_at: UPDATED_AT,
      version: 1,
      dirty: true,
      server_version: 1,
    },
  ],
];

/** Cloud-shaped rows exactly as Supabase would return them (K3 columns). */
const CLOUD_NOTE: Record<string, unknown> = {
  id: 'note_2',
  user_id: 'u_1',
  book_id: null,
  lecture_id: 'lecture_1',
  title: 'قاعدة في الميزان',
  content: 'قاعدة في الميزان\n\nمتن القاعدة',
  note_type: 'rule',
  review_date: '2026-09-01',
  is_public: false,
  created_at: CREATED_AT,
  updated_at: UPDATED_AT,
  version: 6,
};

const CLOUD_MEDIA: Record<string, unknown> = {
  id: 'media_2',
  user_id: 'u_1',
  note_id: null,
  lecture_id: 'lecture_1',
  media_type: 'image',
  url: 'https://storage.example.com/board.png',
  created_at: CREATED_AT,
  updated_at: UPDATED_AT,
  version: 2,
};

function localFixture(table: TableName): Record<string, unknown> {
  const entry = LOCAL_FIXTURES.find(([candidate]) => candidate === table);
  if (entry === undefined) {
    throw new Error(`spec bug: no fixture registered for table "${table}"`);
  }
  return entry[1];
}

/** Local fixture with only `dirty` removed — the round-trip expectation. */
function withoutDirty(row: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...row };
  delete copy.dirty;
  return copy;
}

/** Local fixture reduced to the exact shape Supabase returns. */
function asCloud(row: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...row };
  delete copy.dirty;
  delete copy.server_version;
  return copy;
}

describe('round trips (toCloudRow → toLocalRow)', () => {
  for (const [table] of LOCAL_FIXTURES) {
    it(`preserves every ${table} column across the round trip`, () => {
      const cloudRow = toCloudRow(table, localFixture(table));
      expect(cloudRow).not.toHaveProperty('dirty');
      expect(cloudRow).not.toHaveProperty('server_version');
      expect(toLocalRow(table, cloudRow)).toEqual(withoutDirty(localFixture(table)));
    });
  }
});

describe('discriminator column mapping (PROJECT_STATE K3)', () => {
  it('renames notes.type to note_type on the way out', () => {
    const cloudRow = toCloudRow('notes', localFixture('notes'));
    expect(cloudRow['note_type']).toBe('memorization');
    expect(cloudRow).not.toHaveProperty('type');
  });

  it('renames media.type to media_type on the way out', () => {
    const cloudRow = toCloudRow('media', localFixture('media'));
    expect(cloudRow['media_type']).toBe('audio');
    expect(cloudRow).not.toHaveProperty('type');
  });

  it('renames notes.note_type back to type on the way in', () => {
    const localRow = toLocalRow('notes', CLOUD_NOTE);
    expect(localRow['type']).toBe('rule');
    expect(localRow).not.toHaveProperty('note_type');
  });

  it('renames media.media_type back to type on the way in', () => {
    const localRow = toLocalRow('media', CLOUD_MEDIA);
    expect(localRow['type']).toBe('image');
    expect(localRow).not.toHaveProperty('media_type');
  });
});

describe('client-only bookkeeping', () => {
  it('strips dirty and server_version from a pass-through row on the way out', () => {
    const cloudRow = toCloudRow('categories', localFixture('categories'));
    expect(cloudRow).toEqual({
      id: 'cat_1',
      user_id: 'u_1',
      name: 'العقيدة',
      icon: 'mosque',
      created_at: CREATED_AT,
      updated_at: UPDATED_AT,
      version: 2,
    });
  });

  it('stamps server_version from version when the cloud row omits it', () => {
    const localRow = toLocalRow('books', asCloud(localFixture('books')));
    expect(localRow['server_version']).toBe(5);
    expect(localRow).not.toHaveProperty('dirty');
  });

  it('keeps a caller-supplied server_version instead of overwriting it', () => {
    const cloudRow = { ...asCloud(localFixture('lectures')), server_version: 99 };
    expect(toLocalRow('lectures', cloudRow)['server_version']).toBe(99);
  });

  it('throws when there is no numeric version to derive server_version from', () => {
    expect(() => toLocalRow('lectures', { id: 'lecture_x' })).toThrow(/server_version/);
  });
});

describe('tables without serialization rules', () => {
  const link: Record<string, unknown> = {
    id: 'link_1',
    source_note_id: 'note_1',
    target_note_id: 'note_2',
    created_at: CREATED_AT,
  };

  it('rejects note_links in both directions (derived data — decision D10)', () => {
    expect(() => toCloudRow('note_links', link)).toThrow(/D10/);
    expect(() => toLocalRow('note_links', link)).toThrow(/D10/);
  });

  it('rejects any table outside the known syncable set', () => {
    const ghost = 'ghost_table' as TableName;
    expect(() => toCloudRow(ghost, { id: 'x_1' })).toThrow(/unsupported table/);
    expect(() => toLocalRow(ghost, { id: 'x_1' })).toThrow(/unsupported table/);
  });
});
