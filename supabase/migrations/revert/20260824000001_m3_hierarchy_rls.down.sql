-- =============================================================================
-- Tazkerat Altaleb — rollback for 20260824000001_m3_hierarchy_rls
-- Drops the hierarchy CRUD RLS policies added by this migration, leaf-first
-- (lectures → lecturers → books → categories), restoring deny-by-default.
-- Tables, triggers and functions are untouched; the M2 users policies remain
-- in place. Fully guarded with IF EXISTS.
-- =============================================================================

-- -------------------------------------------------------------- lectures ----
DROP POLICY IF EXISTS lectures_delete_own ON public.lectures;
DROP POLICY IF EXISTS lectures_update_own ON public.lectures;
DROP POLICY IF EXISTS lectures_insert_own ON public.lectures;
DROP POLICY IF EXISTS lectures_select_own ON public.lectures;

-- ------------------------------------------------------------- lecturers ----
DROP POLICY IF EXISTS lecturers_delete_own ON public.lecturers;
DROP POLICY IF EXISTS lecturers_update_own ON public.lecturers;
DROP POLICY IF EXISTS lecturers_insert_own ON public.lecturers;
DROP POLICY IF EXISTS lecturers_select_own ON public.lecturers;

-- ----------------------------------------------------------------- books ----
DROP POLICY IF EXISTS books_delete_own ON public.books;
DROP POLICY IF EXISTS books_update_own ON public.books;
DROP POLICY IF EXISTS books_insert_own ON public.books;
DROP POLICY IF EXISTS books_select_own ON public.books;

-- ------------------------------------------------------------ categories ----
DROP POLICY IF EXISTS categories_delete_own ON public.categories;
DROP POLICY IF EXISTS categories_update_own ON public.categories;
DROP POLICY IF EXISTS categories_insert_own ON public.categories;
DROP POLICY IF EXISTS categories_select_own ON public.categories;
