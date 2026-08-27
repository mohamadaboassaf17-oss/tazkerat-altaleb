-- =============================================================================
-- Tazkerat Altaleb — M6: SRS scheduler columns on notes
-- Migration: 20260826000001_m6_srs_scheduler
--
-- PRD §5.2 / AGENTS.md SRS: SM-2-inspired, 3 ratings سهل/متوسط/صعب,
-- card-mode one-at-a-time, حفظ priority via sort key (not a query hack).
--
-- Adds on public.notes:
--   ease_factor    double precision NOT NULL DEFAULT 2.5  CHECK >= 1.3
--   interval_days  int NOT NULL DEFAULT 0                CHECK >= 0
--   repetitions    int NOT NULL DEFAULT 0                CHECK >= 0
-- review_date already exists (date, DEFAULT current_date) — the only column
-- the M2 seed touches.
--
-- Clients treat these as local-first mutable fields; the existing version-
-- guard trigger trg_notes_version_guard (M5) already covers them — no new
-- trigger needed.
--
-- Index: composite (user_id, review_date, note_type) so the M6 "today" queue
-- `WHERE user_id = $1 AND review_date <= today()` ordered by
-- حفظ-first stays index-friendly. Pre-existing idx_notes_user_review_date
-- remains for older callers.
--
-- Re-runnable: every DDL guarded with IF NOT EXISTS.
-- Reversible: see revert/20260826000001_m6_srs_scheduler.down.sql
-- =============================================================================

ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS ease_factor double precision NOT NULL DEFAULT 2.5
    CHECK (ease_factor >= 1.3);

ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS interval_days int NOT NULL DEFAULT 0
    CHECK (interval_days >= 0);

ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS repetitions int NOT NULL DEFAULT 0
    CHECK (repetitions >= 0);

CREATE INDEX IF NOT EXISTS idx_notes_user_review_type
  ON public.notes(user_id, review_date, note_type);
