-- =============================================================================
-- Tazkerat Altaleb — M8: Sharing (anon read) + Export helpers
-- Migration: 20260828000001_m8_sharing_anon
--
-- PRD §5.5 / §5.6 / AGENTS.md "Sharing" + "Export":
--   * notes.is_public toggles public visibility; public read path is
--     /share/:noteId served by an anon-role RLS policy. No signed URLs,
--     no Edge Functions, no external services.
--   * RLS for anon is scoped to is_public = true on notes and to links
--     whose source note is public. Everything else stays authenticated-only.
--   * Export: markdown rewrites [[id]] → [[title]], PDF via window.print().
--
-- This migration adds ONLY the anon SELECT policies. The authenticated
-- policies from M4 (notes_*_own / note_links_*_own) remain untouched.
-- media has no public path in MVP — anon cannot read media.
--
-- Re-runnable: DROP POLICY IF EXISTS guards.
-- Reversible: see revert/20260828000001_m8_sharing_anon.down.sql
-- =============================================================================

-- ---------------------------------------------------------------- notes (anon) ---
-- Anon can read a note iff it is explicitly marked public.
-- No INSERT/UPDATE/DELETE for anon — public is read-only.
DROP POLICY IF EXISTS notes_select_public_anon ON public.notes;
CREATE POLICY notes_select_public_anon
  ON public.notes
  FOR SELECT
  TO anon
  USING (is_public = true);

-- ----------------------------------------------------------- note_links (anon) ---
-- Anon can see an edge iff its SOURCE note is public. The target may be
-- private — the edge still renders but the target row itself is invisible to
-- anon (read via notes_select_public_anon). This matches AGENTS.md:
-- "RLS for anon must be scoped to is_public = true on notes and to links
-- whose source note is public."
DROP POLICY IF EXISTS note_links_select_public_anon ON public.note_links;
CREATE POLICY note_links_select_public_anon
  ON public.note_links
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1
        FROM public.notes n
       WHERE n.id = note_links.source_note_id
         AND n.is_public = true
    )
  );
