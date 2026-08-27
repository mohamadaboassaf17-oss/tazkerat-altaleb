-- =============================================================================
-- Tazkerat Altaleb — rollback for 20260828000001_m8_sharing_anon
-- Drops the anon SELECT policies added by this migration, restoring
-- authenticated-only visibility on notes / note_links.
-- Idempotent with IF EXISTS guards.
-- =============================================================================

DROP POLICY IF EXISTS note_links_select_public_anon ON public.note_links;
DROP POLICY IF EXISTS notes_select_public_anon ON public.notes;
