import Dexie, { type Table } from 'dexie';
import type {
  LocalBook,
  LocalCategory,
  LocalLecture,
  LocalLecturer,
  LocalMedia,
  LocalNote,
  LocalNoteLink,
  LocalUser,
  OutboxEntry,
  SyncMetaRow,
} from '../types/models';

/**
 * Offline-first local database (Dexie over IndexedDB) mirroring the
 * Supabase schema from PRD §7.
 *
 * Reads and writes always hit this local database first; cloud sync is a
 * separate asynchronous layer driven by `outbox` and `sync_meta`.
 */
export class TazkeratDb extends Dexie {
  /** PRD §7.8 — one row per authenticated user. */
  users!: Table<LocalUser, string>;

  /** PRD §7.1 — القسم. */
  categories!: Table<LocalCategory, string>;

  /** PRD §7.2 — الكتاب. */
  books!: Table<LocalBook, string>;

  /** PRD §7.3 — الشيخ / المدرّس. */
  lecturers!: Table<LocalLecturer, string>;

  /** PRD §7.4 — المحاضرة. */
  lectures!: Table<LocalLecture, string>;

  /** PRD §7.5 — الملاحظات. */
  notes!: Table<LocalNote, string>;

  /** PRD §7.6 — wiki-link edges, rebuilt on every note save. */
  note_links!: Table<LocalNoteLink, string>;

  /** PRD §7.7 — audio/image attachments. */
  media!: Table<LocalMedia, string>;

  /** Pending changes awaiting push to Supabase; `++seq` preserves order. */
  outbox!: Table<OutboxEntry, number>;

  /** Sync bookkeeping key-value store (e.g. last pull cursor per table). */
  sync_meta!: Table<SyncMetaRow, string>;

  constructor() {
    super('tazkerat-altaleb');
    this.version(1).stores({
      users: 'id',
      categories: 'id, user_id',
      books: 'id, user_id, category_id, last_opened_at',
      lecturers: 'id, user_id, book_id',
      lectures: 'id, lecturer_id',
      notes: 'id, user_id, book_id, lecture_id, type, review_date',
      note_links: 'id, source_note_id, target_note_id',
      media: 'id, user_id, note_id, lecture_id',
      outbox: '++seq',
      sync_meta: 'key',
    });
  }
}

/** Application-wide database singleton. */
export const db = new TazkeratDb();
