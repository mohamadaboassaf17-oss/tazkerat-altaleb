-- Revert for migration 20260826000001_m6_srs_scheduler (M6 SRS columns).

DROP INDEX IF EXISTS public.idx_notes_user_review_type;

ALTER TABLE public.notes DROP COLUMN IF EXISTS repetitions;
ALTER TABLE public.notes DROP COLUMN IF EXISTS interval_days;
ALTER TABLE public.notes DROP COLUMN IF EXISTS ease_factor;
