-- =============================================================================
-- Tazkerat Altaleb — M5: sync conflict guard (BEFORE INSERT OR UPDATE)
-- Migration: 20260825000002_m5_sync_conflict_guard
--
-- Protocol (AGENTS.md sync model): every mutable row carries `version int`;
-- clients bump it locally on every edit and cloud push resolves conflicts by
-- HIGHEST version — never timestamps (clock skew is assumed).
--
-- This migration moves the conflict decision into the database: a single
-- shared function public.assert_sync_version() attached as a BEFORE INSERT OR
-- UPDATE row trigger on the seven mutable tables ONLY (users, categories,
-- books, lecturers, lectures, notes, media).
--
--   * TG_OP = 'UPDATE': any write whose candidate row carries
--     NEW.version <= OLD.version is REJECTED with
--       RAISE EXCEPTION USING ERRCODE = 'P0001',
--                        MESSAGE = 'SYNC_CONFLICT|' || OLD.version::text;
--     Strictly-greater is therefore required. Equal-version ties resolve
--     deterministically as server/first-writer-wins: the second pusher gets
--     the error above instead of overwriting, adopts the server row, and the
--     client push worker parses `SYNC_CONFLICT|<server_version>` out of the
--     message to learn the authoritative version.
--
--   * TG_OP = 'INSERT': no OLD row exists, so no comparison is possible — the
--     guard passes through silently (duplicate-id inserts still fail
--     naturally on the PRIMARY KEY). This keeps SECURITY DEFINER
--     seed_demo_template() unaffected: its rows insert at DEFAULT version 1.
--
--   * note_links is deliberately EXCLUDED: it is derived data, rebuilt from
--     notes.content on every save (DELETE + INSERT in one transaction), so it
--     has NO version column and NO conflict path (decision D10,
--     PROJECT_STATE.md §6). Touching it here would break the rebuild.
--
-- Re-runnable: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS before
-- every CREATE TRIGGER. Naming follows the repo convention
-- (trg_<table>_updated_at / trg_users_freeze_immutable_cols):
-- trg_<table>_version_guard.
--
-- Cloud push remains DEFERRED (continuation of decision D14): this takes
-- effect only once migrations reach a hosted project via supabase db push.
-- =============================================================================

-- --------------------------------------------------------------- guard fn ---
CREATE OR REPLACE FUNCTION public.assert_sync_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.version <= OLD.version THEN
    -- Error contract consumed by the client push worker (M5):
    -- exactly 'SYNC_CONFLICT|<server_version>' with ERRCODE P0001.
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SYNC_CONFLICT|' || OLD.version::text;
  END IF;
  -- INSERT (no OLD row): pass through; PK collisions fail naturally.
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------- users ----
DROP TRIGGER IF EXISTS trg_users_version_guard ON public.users;
CREATE TRIGGER trg_users_version_guard
  BEFORE INSERT OR UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.assert_sync_version();

-- ------------------------------------------------------------ categories ----
DROP TRIGGER IF EXISTS trg_categories_version_guard ON public.categories;
CREATE TRIGGER trg_categories_version_guard
  BEFORE INSERT OR UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.assert_sync_version();

-- ----------------------------------------------------------------- books ----
DROP TRIGGER IF EXISTS trg_books_version_guard ON public.books;
CREATE TRIGGER trg_books_version_guard
  BEFORE INSERT OR UPDATE ON public.books
  FOR EACH ROW EXECUTE FUNCTION public.assert_sync_version();

-- ------------------------------------------------------------- lecturers ----
DROP TRIGGER IF EXISTS trg_lecturers_version_guard ON public.lecturers;
CREATE TRIGGER trg_lecturers_version_guard
  BEFORE INSERT OR UPDATE ON public.lecturers
  FOR EACH ROW EXECUTE FUNCTION public.assert_sync_version();

-- -------------------------------------------------------------- lectures ----
DROP TRIGGER IF EXISTS trg_lectures_version_guard ON public.lectures;
CREATE TRIGGER trg_lectures_version_guard
  BEFORE INSERT OR UPDATE ON public.lectures
  FOR EACH ROW EXECUTE FUNCTION public.assert_sync_version();

-- ----------------------------------------------------------------- notes ----
DROP TRIGGER IF EXISTS trg_notes_version_guard ON public.notes;
CREATE TRIGGER trg_notes_version_guard
  BEFORE INSERT OR UPDATE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.assert_sync_version();

-- ----------------------------------------------------------------- media ----
DROP TRIGGER IF EXISTS trg_media_version_guard ON public.media;
CREATE TRIGGER trg_media_version_guard
  BEFORE INSERT OR UPDATE ON public.media
  FOR EACH ROW EXECUTE FUNCTION public.assert_sync_version();
