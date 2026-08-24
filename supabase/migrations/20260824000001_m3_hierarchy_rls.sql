-- =============================================================================
-- Tazkerat Altaleb — M3: hierarchy RLS (categories / books / lecturers / lectures)
-- Migration: 20260824000001_m3_hierarchy_rls
--
-- Re-runnable: every CREATE POLICY is preceded by DROP POLICY IF EXISTS.
-- No functions or triggers are introduced by this migration.
--
-- Adds:
--   * Full CRUD RLS policies for authenticated users on the content hierarchy.
--     Direct ownership (user_id = auth.uid()) for categories, books,
--     lecturers; transitive ownership for lectures, which carry no user_id
--     and are owned through lecture → lecturers.book_id → books.user_id.
--   * Naming scheme follows the M2 convention (users_select_own /
--     users_update_own): <table>_<op>_own, one policy per operation.
--     Deliberately NOT combined into FOR ALL policies — M2 established the
--     separate-per-operation style and consistency wins.
--   * notes / note_links / media stay deny-by-default (policies belong to
--     later milestones); the M2 users policies are untouched.
--
-- Note on the lectures subqueries: policy expressions are evaluated with the
-- invoking role's privileges, so the inner reads of public.lecturers and
-- public.books are themselves filtered by their own *_select_own policies.
-- Because those filters and the b.user_id = auth.uid() predicate agree, the
-- result is identical for owners and empty for everyone else.
-- =============================================================================

-- ------------------------------------------------------------ categories ----
DROP POLICY IF EXISTS categories_select_own ON public.categories;
CREATE POLICY categories_select_own
  ON public.categories
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS categories_insert_own ON public.categories;
CREATE POLICY categories_insert_own
  ON public.categories
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS categories_update_own ON public.categories;
CREATE POLICY categories_update_own
  ON public.categories
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS categories_delete_own ON public.categories;
CREATE POLICY categories_delete_own
  ON public.categories
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ----------------------------------------------------------------- books ----
DROP POLICY IF EXISTS books_select_own ON public.books;
CREATE POLICY books_select_own
  ON public.books
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS books_insert_own ON public.books;
CREATE POLICY books_insert_own
  ON public.books
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    -- The parent category must belong to the same owner.
    AND EXISTS (
      SELECT 1
        FROM public.categories c
       WHERE c.id = books.category_id
         AND c.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS books_update_own ON public.books;
CREATE POLICY books_update_own
  ON public.books
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    -- Reparenting must keep the row inside the caller's own hierarchy.
    AND EXISTS (
      SELECT 1
        FROM public.categories c
       WHERE c.id = books.category_id
         AND c.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS books_delete_own ON public.books;
CREATE POLICY books_delete_own
  ON public.books
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ------------------------------------------------------------- lecturers ----
DROP POLICY IF EXISTS lecturers_select_own ON public.lecturers;
CREATE POLICY lecturers_select_own
  ON public.lecturers
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS lecturers_insert_own ON public.lecturers;
CREATE POLICY lecturers_insert_own
  ON public.lecturers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    -- The parent book must belong to the same owner.
    AND EXISTS (
      SELECT 1
        FROM public.books b
       WHERE b.id = lecturers.book_id
         AND b.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS lecturers_update_own ON public.lecturers;
CREATE POLICY lecturers_update_own
  ON public.lecturers
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    -- Reparenting must keep the row inside the caller's own hierarchy.
    AND EXISTS (
      SELECT 1
        FROM public.books b
       WHERE b.id = lecturers.book_id
         AND b.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS lecturers_delete_own ON public.lecturers;
CREATE POLICY lecturers_delete_own
  ON public.lecturers
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- -------------------------------------------------------------- lectures ----
-- lectures carries NO user_id (initial schema): ownership is transitive via
-- lecturers.book_id → books.user_id. Every clause below asserts exactly that.
--
-- In INSERT / UPDATE WITH CHECK clauses the bare correlated reference
-- lectures.lecturer_id denotes the CANDIDATE row (the NEW values) — the check
-- runs per proposed row before it is written; it never scans previously
-- inserted rows.

DROP POLICY IF EXISTS lectures_select_own ON public.lectures;
CREATE POLICY lectures_select_own
  ON public.lectures
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.lecturers l
        JOIN public.books b ON b.id = l.book_id
       WHERE l.id = lectures.lecturer_id
         AND b.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS lectures_insert_own ON public.lectures;
CREATE POLICY lectures_insert_own
  ON public.lectures
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Candidate row (NEW): the referenced lecturer must belong to the caller.
    EXISTS (
      SELECT 1
        FROM public.lecturers l
        JOIN public.books b ON b.id = l.book_id
       WHERE l.id = lectures.lecturer_id
         AND b.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS lectures_update_own ON public.lectures;
CREATE POLICY lectures_update_own
  ON public.lectures
  FOR UPDATE
  TO authenticated
  USING (
    -- Current row (OLD): must sit inside the caller's own hierarchy.
    EXISTS (
      SELECT 1
        FROM public.lecturers l
        JOIN public.books b ON b.id = l.book_id
       WHERE l.id = lectures.lecturer_id
         AND b.user_id = auth.uid()
    )
  )
  WITH CHECK (
    -- Candidate row (NEW): reparenting must stay inside the same hierarchy.
    EXISTS (
      SELECT 1
        FROM public.lecturers l
        JOIN public.books b ON b.id = l.book_id
       WHERE l.id = lectures.lecturer_id
         AND b.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS lectures_delete_own ON public.lectures;
CREATE POLICY lectures_delete_own
  ON public.lectures
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.lecturers l
        JOIN public.books b ON b.id = l.book_id
       WHERE l.id = lectures.lecturer_id
         AND b.user_id = auth.uid()
    )
  );
