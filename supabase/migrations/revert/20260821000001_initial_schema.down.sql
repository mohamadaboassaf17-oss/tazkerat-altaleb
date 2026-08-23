-- =============================================================================
-- Tazkerat Altaleb — rollback for 20260821000001_initial_schema
-- Drops triggers/function, then tables in reverse FK order, then the enum.
-- Fully guarded with IF EXISTS.
-- =============================================================================

-- --------------------------------------------------------- updated_at triggers
DROP TRIGGER IF EXISTS trg_media_updated_at ON public.media;
DROP TRIGGER IF EXISTS trg_notes_updated_at ON public.notes;
DROP TRIGGER IF EXISTS trg_lectures_updated_at ON public.lectures;
DROP TRIGGER IF EXISTS trg_lecturers_updated_at ON public.lecturers;
DROP TRIGGER IF EXISTS trg_books_updated_at ON public.books;
DROP TRIGGER IF EXISTS trg_categories_updated_at ON public.categories;
DROP TRIGGER IF EXISTS trg_users_updated_at ON public.users;

DROP FUNCTION IF EXISTS set_updated_at();

-- ------------------------------------------------------- tables (reverse FK) --
DROP TABLE IF EXISTS public.media;
DROP TABLE IF EXISTS public.note_links;
DROP TABLE IF EXISTS public.notes;
DROP TABLE IF EXISTS public.lectures;
DROP TABLE IF EXISTS public.lecturers;
DROP TABLE IF EXISTS public.books;
DROP TABLE IF EXISTS public.categories;
DROP TABLE IF EXISTS public.users;

-- --------------------------------------------------------------------- enum --
DROP TYPE IF EXISTS note_type;
