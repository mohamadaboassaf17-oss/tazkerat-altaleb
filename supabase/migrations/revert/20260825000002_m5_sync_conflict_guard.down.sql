-- =============================================================================
-- Tazkerat Altaleb — rollback for 20260825000002_m5_sync_conflict_guard
-- Drops the seven version-guard triggers and the shared assert_sync_version()
-- function added by this migration, restoring owner-writable version columns
-- with no DB-level conflict rejection (conflict resolution falls back fully
-- to client-side highest-version-wins logic).
-- note_links was never touched by this migration and stays untouched.
-- Fully guarded with IF EXISTS.
-- =============================================================================

-- ----------------------------------------------------------------- users ----
DROP TRIGGER IF EXISTS trg_users_version_guard ON public.users;

-- ------------------------------------------------------------ categories ----
DROP TRIGGER IF EXISTS trg_categories_version_guard ON public.categories;

-- ----------------------------------------------------------------- books ----
DROP TRIGGER IF EXISTS trg_books_version_guard ON public.books;

-- ------------------------------------------------------------- lecturers ----
DROP TRIGGER IF EXISTS trg_lecturers_version_guard ON public.lecturers;

-- -------------------------------------------------------------- lectures ----
DROP TRIGGER IF EXISTS trg_lectures_version_guard ON public.lectures;

-- ----------------------------------------------------------------- notes ----
DROP TRIGGER IF EXISTS trg_notes_version_guard ON public.notes;

-- ----------------------------------------------------------------- media ----
DROP TRIGGER IF EXISTS trg_media_version_guard ON public.media;

-- --------------------------------------------------------------- guard fn ---
DROP FUNCTION IF EXISTS public.assert_sync_version();
