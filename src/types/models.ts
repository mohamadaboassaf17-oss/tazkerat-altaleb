/**
 * Domain record types mirroring the Supabase (PostgreSQL) schema from PRD §7.
 *
 * Cloud* interfaces are 1:1 with cloud rows (snake_case fields, ISO-8601
 * timestamp strings). Local* interfaces add client-only sync bookkeeping
 * (`SyncFields`) so the Dexie layer can drive the outbox push/pull cycle.
 */

/** Note classification per PRD §6: فائدة / قاعدة / سؤال / تعقيب / حفظ. */
export type NoteType = 'benefit' | 'rule' | 'question' | 'commentary' | 'memorization';

/** Media attachment kind per PRD §7.7. */
export type MediaType = 'audio' | 'image';

/**
 * Every table name that can appear in an outbox entry.
 * Mirrors the Supabase table set exactly.
 */
export type TableName =
  | 'users'
  | 'categories'
  | 'books'
  | 'lecturers'
  | 'lectures'
  | 'notes'
  | 'note_links'
  | 'media';

/** Client-side sync bookkeeping attached to every locally mutable row. */
export interface SyncFields {
  /** True while the local row has un-pushed changes. */
  dirty: boolean;
  /** Last `version` value acknowledged by the server. */
  server_version: number;
}

/** PRD §7.8 — `users` table row. */
export interface CloudUser {
  id: string;
  email: string;
  display_name: string | null;
  media_trial_started_at: string | null;
  created_at: string;
  updated_at: string;
  version: number;
}

/** PRD §7.1 — `categories` table row. */
export interface CloudCategory {
  id: string;
  user_id: string;
  name: string;
  icon: string | null;
  created_at: string;
  updated_at: string;
  version: number;
}

/** PRD §7.2 — `books` table row. */
export interface CloudBook {
  id: string;
  user_id: string;
  category_id: string;
  title: string;
  total_pages: number;
  current_page: number;
  last_opened_at: string;
  created_at: string;
  updated_at: string;
  version: number;
}

/** PRD §7.3 — `lecturers` table row. */
export interface CloudLecturer {
  id: string;
  user_id: string;
  book_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  version: number;
}

/** PRD §7.4 — `lectures` table row. */
export interface CloudLecture {
  id: string;
  lecturer_id: string;
  title: string;
  duration_minutes: number;
  is_completed: boolean;
  created_at: string;
  updated_at: string;
  version: number;
}

/**
 * PRD §7.5 — `notes` table row.
 * XOR invariant (enforced at DB level): `book_id` and `lecture_id` are
 * never both non-null — exactly one is set, or both are null.
 */
export interface CloudNote {
  id: string;
  user_id: string;
  book_id: string | null;
  lecture_id: string | null;
  /** Auto-extracted from the first non-blank line of `content`. */
  title: string;
  /** Full body; supports `[[wiki-links]]`. */
  content: string;
  type: NoteType;
  /** Next SRS review due date (ISO date). */
  review_date: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  version: number;
}

/**
 * PRD §7.6 — `note_links` table row.
 * Derived data: fully rebuilt from `notes.content` on every save,
 * so it carries no sync fields and never enters the outbox directly.
 */
export interface CloudNoteLink {
  id: string;
  source_note_id: string;
  target_note_id: string;
  created_at: string;
}

/**
 * PRD §7.7 — `media` table row.
 * XOR invariant (enforced at DB level): `note_id` and `lecture_id` are
 * never both non-null — exactly one is set, or both are null.
 */
export interface CloudMedia {
  id: string;
  user_id: string;
  note_id: string | null;
  lecture_id: string | null;
  type: MediaType;
  /** File URL in Supabase Storage. */
  url: string;
  created_at: string;
  updated_at: string;
  version: number;
}

/** Local mirror of `users`. */
export type LocalUser = CloudUser & SyncFields;

/** Local mirror of `categories`. */
export type LocalCategory = CloudCategory & SyncFields;

/** Local mirror of `books`. */
export type LocalBook = CloudBook & SyncFields;

/** Local mirror of `lecturers`. */
export type LocalLecturer = CloudLecturer & SyncFields;

/** Local mirror of `lectures`. */
export type LocalLecture = CloudLecture & SyncFields;

/** Local mirror of `notes`. */
export type LocalNote = CloudNote & SyncFields;

/** Note links are derived on save — no sync fields needed locally. */
export type LocalNoteLink = CloudNoteLink;

/** Local mirror of `media`. */
export type LocalMedia = CloudMedia & SyncFields;

/**
 * One pending change queued in the local outbox, awaiting push to Supabase.
 * `seq` is auto-incremented by IndexedDB (`++seq`).
 *
 * Retry bookkeeping (`attempts`, `next_attempt_at`, `last_error`) lives on
 * the entry rather than in a side table so a failed push survives app
 * restarts. These fields are never indexed, so they require no Dexie
 * schema declaration.
 */
export interface OutboxEntry {
  seq?: number;
  table_name: TableName;
  op: 'insert' | 'update' | 'delete';
  record_id: string;
  payload: unknown;
  queued_at: string;
  /**
   * Number of failed push attempts recorded so far. Absent until the
   * first failure; a successful push removes the entry entirely.
   */
  attempts?: number;
  /**
   * Earliest time (ISO-8601) at which the push layer may retry this
   * entry — drives the backoff schedule. Null or absent means the entry
   * is eligible for an immediate attempt.
   */
  next_attempt_at?: string | null;
  /**
   * Message carried over from the most recent failed push attempt, kept
   * for diagnostics only. Null or absent while the entry has never failed.
   */
  last_error?: string | null;
}

/** Single key-value row of the `sync_meta` store (e.g. last pull cursor). */
export interface SyncMetaRow {
  key: string;
  value: string;
}
