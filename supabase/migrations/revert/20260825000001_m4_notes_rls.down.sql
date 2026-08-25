-- =============================================================================
-- Tazkerat Altaleb — rollback for 20260825000001_m4_notes_rls
-- Drops the notes / note_links CRUD RLS policies added by this migration,
-- leaf-first (note_links → notes), restoring deny-by-default on both tables.
-- Tables, indexes and triggers are untouched; the M2/M3 policies remain in
-- place. Fully guarded with IF EXISTS.
-- =============================================================================

-- ----------------------------------------------------------- note_links ----
DROP POLICY IF EXISTS note_links_delete_own ON public.note_links;
DROP POLICY IF EXISTS note_links_update_own ON public.note_links;
DROP POLICY IF EXISTS note_links_insert_own ON public.note_links;
DROP POLICY IF EXISTS note_links_select_own ON public.note_links;

-- ----------------------------------------------------------------- notes ----
DROP POLICY IF EXISTS notes_delete_own ON public.notes;
DROP POLICY IF EXISTS notes_update_own ON public.notes;
DROP POLICY IF EXISTS notes_insert_own ON public.notes;
DROP POLICY IF EXISTS notes_select_own ON public.notes;
