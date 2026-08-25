-- =============================================================================
-- Tazkerat Altaleb — M4: notes RLS (notes / note_links)
-- Migration: 20260825000001_m4_notes_rls
--
-- Re-runnable: every CREATE POLICY is preceded by DROP POLICY IF EXISTS.
-- No functions, triggers or schema changes are introduced by this migration.
--
-- Adds:
--   * Full CRUD RLS policies for authenticated users on notes and note_links.
--     notes carries user_id (direct ownership, user_id = auth.uid()) and the
--     policies additionally assert PARENT ownership like M3 did:
--       - book_id set        → the referenced book must belong to the caller
--                              (books.user_id = auth.uid());
--       - lecture_id set     → transitive ownership via the M3 path
--                              lectures → lecturers → books;
--       - both null          → allowed (standalone note, nothing to assert).
--   * note_links carries NO user_id (initial schema): ownership flows through
--     source_note_id (join to public.notes.user_id = auth.uid()). INSERT and
--     UPDATE additionally require the TARGET note to exist and belong to the
--     SAME user — defense-in-depth against cross-user edge creation; the
--     DB-level FKs guarantee existence but not same-user ownership.
--   * Naming scheme follows the M2/M3 convention (users_select_own /
--     <table>_<op>_own): one policy per operation, deliberately NOT combined
--     into FOR ALL policies — consistency wins.
--   * media stays deny-by-default (policies belong to a later milestone);
--     the M2/M3 policies are untouched.
--
-- Note on the subqueries: policy expressions are evaluated with the invoking
-- role's privileges, so the inner reads of public.notes / public.books /
-- public.lecturers / public.lectures are themselves filtered by their own
-- *_select_own policies. Because those filters and the user_id = auth.uid()
-- predicates agree, the result is identical for owners and empty for everyone
-- else.
--
-- Cloud push remains DEFERRED (continuation of decision D14, PROJECT_STATE.md
-- §6): these policies take effect only once migrations are applied to a
-- hosted project via supabase db push.
-- =============================================================================

-- ----------------------------------------------------------------- notes ----
-- notes carries user_id PLUS an optional parent: book_id XOR lecture_id
-- (notes_book_xor_lecture — at most one set). Every clause below asserts row
-- ownership (user_id = auth.uid()) AND, when a parent is present, that the
-- parent sits inside the caller's own hierarchy: directly via books, or
-- transitively via lectures → lecturers → books. A standalone note (both
-- parents null) passes with no extra condition.
--
-- In INSERT / UPDATE WITH CHECK clauses the bare correlated references
-- (notes.book_id / notes.lecture_id) denote the CANDIDATE row (the NEW
-- values); the UPDATE USING clause sees the CURRENT row.

DROP POLICY IF EXISTS notes_select_own ON public.notes;
CREATE POLICY notes_select_own
  ON public.notes
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    AND (
      -- Standalone note (both parents null): nothing further to assert.
      (notes.book_id IS NULL AND notes.lecture_id IS NULL)
      -- Attached to a book: the book must belong to the caller.
      OR EXISTS (
        SELECT 1
          FROM public.books b
         WHERE b.id = notes.book_id
           AND b.user_id = auth.uid()
      )
      -- Attached to a lecture: transitive ownership via lecturers → books.
      OR EXISTS (
        SELECT 1
          FROM public.lectures l
          JOIN public.lecturers lr ON lr.id = l.lecturer_id
          JOIN public.books b ON b.id = lr.book_id
         WHERE l.id = notes.lecture_id
           AND b.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS notes_insert_own ON public.notes;
CREATE POLICY notes_insert_own
  ON public.notes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      -- Candidate row (NEW): standalone note is allowed outright.
      (notes.book_id IS NULL AND notes.lecture_id IS NULL)
      -- Attached to a book: the book must belong to the caller.
      OR EXISTS (
        SELECT 1
          FROM public.books b
         WHERE b.id = notes.book_id
           AND b.user_id = auth.uid()
      )
      -- Attached to a lecture: the whole chain must belong to the caller.
      OR EXISTS (
        SELECT 1
          FROM public.lectures l
          JOIN public.lecturers lr ON lr.id = l.lecturer_id
          JOIN public.books b ON b.id = lr.book_id
         WHERE l.id = notes.lecture_id
           AND b.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS notes_update_own ON public.notes;
CREATE POLICY notes_update_own
  ON public.notes
  FOR UPDATE
  TO authenticated
  USING (
    -- Current row (OLD): must sit inside the caller's own hierarchy.
    user_id = auth.uid()
    AND (
      (notes.book_id IS NULL AND notes.lecture_id IS NULL)
      OR EXISTS (
        SELECT 1
          FROM public.books b
         WHERE b.id = notes.book_id
           AND b.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
          FROM public.lectures l
          JOIN public.lecturers lr ON lr.id = l.lecturer_id
          JOIN public.books b ON b.id = lr.book_id
         WHERE l.id = notes.lecture_id
           AND b.user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    -- Candidate row (NEW): reparenting must stay inside the same hierarchy.
    user_id = auth.uid()
    AND (
      (notes.book_id IS NULL AND notes.lecture_id IS NULL)
      OR EXISTS (
        SELECT 1
          FROM public.books b
         WHERE b.id = notes.book_id
           AND b.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
          FROM public.lectures l
          JOIN public.lecturers lr ON lr.id = l.lecturer_id
          JOIN public.books b ON b.id = lr.book_id
         WHERE l.id = notes.lecture_id
           AND b.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS notes_delete_own ON public.notes;
CREATE POLICY notes_delete_own
  ON public.notes
  FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND (
      (notes.book_id IS NULL AND notes.lecture_id IS NULL)
      OR EXISTS (
        SELECT 1
          FROM public.books b
         WHERE b.id = notes.book_id
           AND b.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
          FROM public.lectures l
          JOIN public.lecturers lr ON lr.id = l.lecturer_id
          JOIN public.books b ON b.id = lr.book_id
         WHERE l.id = notes.lecture_id
           AND b.user_id = auth.uid()
      )
    )
  );

-- ----------------------------------------------------------- note_links ----
-- note_links carries NO user_id (initial schema): ownership derives entirely
-- from the SOURCE note (source_note_id → notes.user_id = auth.uid()).
--
-- Defense-in-depth on the target: the DB-level FKs guarantee the target note
-- EXISTS, but nothing stops a crafted edge pointing at ANOTHER user's note —
-- so INSERT and UPDATE additionally require the target to belong to the same
-- owner. The UNIQUE (source, target) pair and note_links_no_self CHECK are
-- enforced by the schema, not here.

DROP POLICY IF EXISTS note_links_select_own ON public.note_links;
CREATE POLICY note_links_select_own
  ON public.note_links
  FOR SELECT
  TO authenticated
  USING (
    -- Visible only when the SOURCE note belongs to the caller.
    EXISTS (
      SELECT 1
        FROM public.notes n
       WHERE n.id = note_links.source_note_id
         AND n.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS note_links_insert_own ON public.note_links;
CREATE POLICY note_links_insert_own
  ON public.note_links
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Candidate row (NEW): the source note must belong to the caller…
    EXISTS (
      SELECT 1
        FROM public.notes n
       WHERE n.id = note_links.source_note_id
         AND n.user_id = auth.uid()
    )
    -- …and the target note must EXIST and belong to the SAME owner
    -- (FKs guarantee existence, never same-user ownership).
    AND EXISTS (
      SELECT 1
        FROM public.notes t
       WHERE t.id = note_links.target_note_id
         AND t.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS note_links_update_own ON public.note_links;
CREATE POLICY note_links_update_own
  ON public.note_links
  FOR UPDATE
  TO authenticated
  USING (
    -- Current row (OLD): source note must belong to the caller.
    EXISTS (
      SELECT 1
        FROM public.notes n
       WHERE n.id = note_links.source_note_id
         AND n.user_id = auth.uid()
    )
  )
  WITH CHECK (
    -- Candidate row (NEW): rewritten endpoints must keep BOTH sides inside
    -- the caller's own notes.
    EXISTS (
      SELECT 1
        FROM public.notes n
       WHERE n.id = note_links.source_note_id
         AND n.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
        FROM public.notes t
       WHERE t.id = note_links.target_note_id
         AND t.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS note_links_delete_own ON public.note_links;
CREATE POLICY note_links_delete_own
  ON public.note_links
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.notes n
       WHERE n.id = note_links.source_note_id
         AND n.user_id = auth.uid()
    )
  );
