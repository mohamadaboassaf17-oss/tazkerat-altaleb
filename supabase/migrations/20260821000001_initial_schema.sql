-- =============================================================================
-- Tazkerat Altaleb — initial schema (PRD §7)
-- Migration: 20260821000001_initial_schema
--
-- Re-runnable: guarded with IF NOT EXISTS / DO-blocks everywhere possible.
-- Domain hierarchy: Category → Book → Lecturer → Lecture; Note hangs off
-- Book XOR Lecture; Media hangs off Note XOR Lecture.
--
-- Deliberate deviation from PRD §7 naming: notes.type → notes.note_type and
-- media.type → media.media_type (`type` risks confusion with SQL keywords in
-- some tooling). Mirrored in app models.
--
-- RLS is ENABLED on all tables with NO policies yet (deny-by-default).
-- Policies are added in M2/M3.
-- =============================================================================

-- ------------------------------------------------------------------- enum ---
DO $$
BEGIN
  CREATE TYPE note_type AS ENUM ('benefit', 'rule', 'question', 'commentary', 'memorization');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ------------------------------------------------------- updated_at helper ---
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------------ tables ---

CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  display_name text,
  media_trial_started_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  icon text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS public.books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  title text NOT NULL,
  total_pages integer NOT NULL DEFAULT 0,
  current_page integer NOT NULL DEFAULT 0 CHECK (current_page >= 0),
  last_opened_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS public.lecturers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS public.lectures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lecturer_id uuid NOT NULL REFERENCES public.lecturers(id) ON DELETE CASCADE,
  title text NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 0 CHECK (duration_minutes >= 0),
  is_completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS public.notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  book_id uuid REFERENCES public.books(id) ON DELETE CASCADE,
  lecture_id uuid REFERENCES public.lectures(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  note_type note_type NOT NULL DEFAULT 'benefit',
  review_date date NOT NULL DEFAULT current_date,
  is_public boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1,
  CONSTRAINT notes_book_xor_lecture
    CHECK ((book_id IS NOT NULL)::int + (lecture_id IS NOT NULL)::int <= 1)
);

CREATE TABLE IF NOT EXISTS public.note_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_note_id uuid NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  target_note_id uuid NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_note_id, target_note_id),
  CONSTRAINT note_links_no_self CHECK (source_note_id <> target_note_id)
);

CREATE TABLE IF NOT EXISTS public.media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  note_id uuid REFERENCES public.notes(id) ON DELETE CASCADE,
  lecture_id uuid REFERENCES public.lectures(id) ON DELETE CASCADE,
  media_type text NOT NULL CHECK (media_type IN ('audio', 'image')),
  url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1,
  CONSTRAINT media_note_xor_lecture
    CHECK ((note_id IS NOT NULL)::int + (lecture_id IS NOT NULL)::int <= 1)
);

-- --------------------------------------------------------- updated_at triggers
-- Attached to the 7 mutable tables (note_links is derived/immutable —
-- rebuilt on every note save — so it has no updated_at).

DROP TRIGGER IF EXISTS trg_users_updated_at ON public.users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_categories_updated_at ON public.categories;
CREATE TRIGGER trg_categories_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_books_updated_at ON public.books;
CREATE TRIGGER trg_books_updated_at
  BEFORE UPDATE ON public.books
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_lecturers_updated_at ON public.lecturers;
CREATE TRIGGER trg_lecturers_updated_at
  BEFORE UPDATE ON public.lecturers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_lectures_updated_at ON public.lectures;
CREATE TRIGGER trg_lectures_updated_at
  BEFORE UPDATE ON public.lectures
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_notes_updated_at ON public.notes;
CREATE TRIGGER trg_notes_updated_at
  BEFORE UPDATE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_media_updated_at ON public.media;
CREATE TRIGGER trg_media_updated_at
  BEFORE UPDATE ON public.media
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------ indexes --

CREATE INDEX IF NOT EXISTS idx_categories_user_id ON public.categories(user_id);
CREATE INDEX IF NOT EXISTS idx_books_user_id ON public.books(user_id);
CREATE INDEX IF NOT EXISTS idx_books_category_id ON public.books(category_id);
CREATE INDEX IF NOT EXISTS idx_lecturers_user_id ON public.lecturers(user_id);
CREATE INDEX IF NOT EXISTS idx_lecturers_book_id ON public.lecturers(book_id);
CREATE INDEX IF NOT EXISTS idx_lectures_lecturer_id ON public.lectures(lecturer_id);
CREATE INDEX IF NOT EXISTS idx_notes_user_id ON public.notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_book_id ON public.notes(book_id);
CREATE INDEX IF NOT EXISTS idx_notes_lecture_id ON public.notes(lecture_id);
CREATE INDEX IF NOT EXISTS idx_note_links_source_note_id ON public.note_links(source_note_id);
CREATE INDEX IF NOT EXISTS idx_note_links_target_note_id ON public.note_links(target_note_id);
CREATE INDEX IF NOT EXISTS idx_media_user_id ON public.media(user_id);
CREATE INDEX IF NOT EXISTS idx_media_note_id ON public.media(note_id);
CREATE INDEX IF NOT EXISTS idx_media_lecture_id ON public.media(lecture_id);

-- Dashboard queries
CREATE INDEX IF NOT EXISTS idx_notes_user_review_date ON public.notes(user_id, review_date);
CREATE INDEX IF NOT EXISTS idx_books_last_opened ON public.books(last_opened_at DESC);

-- --------------------------------------------------------------------- RLS ---
-- Enable on all 8 tables. Intentionally NO policies here (deny-by-default);
-- M2/M3 migrations add authenticated + anon policies.

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lecturers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lectures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.note_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media ENABLE ROW LEVEL SECURITY;
