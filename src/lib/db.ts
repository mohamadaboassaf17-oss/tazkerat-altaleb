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

/** Offline blob queued while Storage upload is pending (M7). */
export interface PendingMediaUpload {
  mediaId: string;
  userId: string;
  bucket: string;
  path: string;
  mime: string;
  blob: Blob;
  createdAt: string;
}

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

  /** M7: blobs waiting for Storage upload when offline. */
  pending_media_uploads!: Table<PendingMediaUpload, string>;

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
    this.version(2).stores({
      users: 'id',
      categories: 'id, user_id',
      books: 'id, user_id, category_id, last_opened_at',
      lecturers: 'id, user_id, book_id',
      lectures: 'id, lecturer_id',
      // New SRS columns ride on the existing note table — no index change
      // needed (review_date already indexed); cloud adds
      // idx_notes_user_review_type while local keeps this compound index.
      notes: 'id, user_id, book_id, lecture_id, type, review_date',
      note_links: 'id, source_note_id, target_note_id',
      media: 'id, user_id, note_id, lecture_id',
      outbox: '++seq',
      sync_meta: 'key',
    });
    this.version(3).stores({
      users: 'id',
      categories: 'id, user_id',
      books: 'id, user_id, category_id, last_opened_at',
      lecturers: 'id, user_id, book_id',
      lectures: 'id, lecturer_id',
      notes: 'id, user_id, book_id, lecture_id, type, review_date',
      note_links: 'id, source_note_id, target_note_id',
      // M7: duration_seconds is not indexed; pending_media_uploads holds
      // offline File blobs awaiting Storage upload (keyed by media id).
      media: 'id, user_id, note_id, lecture_id',
      outbox: '++seq',
      sync_meta: 'key',
      pending_media_uploads: 'mediaId',
    });
    this.version(4).stores({
      users: 'id',
      categories: 'id, user_id',
      books: 'id, user_id, category_id, last_opened_at',
      lecturers: 'id, user_id, book_id',
      lectures: 'id, lecturer_id',
      // M9: title_norm/content_norm are JS-stamped normalized columns for
      // Arabic search (strip tashkeel → hamza → ال/و/ف/ب). Indexed per user
      // so the local search can use them equality-filtered.
      notes: 'id, user_id, book_id, lecture_id, type, review_date, title_norm, content_norm',
      note_links: 'id, source_note_id, target_note_id',
      media: 'id, user_id, note_id, lecture_id',
      outbox: '++seq',
      sync_meta: 'key',
      pending_media_uploads: 'mediaId',
    }).upgrade(async (tx) => {
      // Backfill existing rows (v3 → v4) — cloud has GENERATED STORED, local must match.
      const { normalizeArabic } = await import('./arabic-text');
      await tx.table('notes').toCollection().modify((note: Record<string, unknown>) => {
        const title = typeof note['title'] === 'string' ? note['title'] : '';
        const content = typeof note['content'] === 'string' ? note['content'] : '';
        note['title_norm'] = normalizeArabic(title);
        note['content_norm'] = normalizeArabic(content);
      });
    });
  }
}

/** Application-wide database singleton. */
export const db = new TazkeratDb();
