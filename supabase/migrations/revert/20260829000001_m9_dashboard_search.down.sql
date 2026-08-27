-- Revert for 20260829000001_m9_dashboard_search — idempotent.

DROP INDEX IF EXISTS public.idx_notes_user_content_norm;
DROP INDEX IF EXISTS public.idx_notes_user_title_norm;
DROP INDEX IF EXISTS public.idx_notes_content_norm_trgm;
DROP INDEX IF EXISTS public.idx_notes_title_norm_trgm;

ALTER TABLE public.notes DROP COLUMN IF EXISTS content_norm;
ALTER TABLE public.notes DROP COLUMN IF EXISTS title_norm;

DROP FUNCTION IF EXISTS public.normalize_ar(text);

-- pg_trgm extension intentionally kept (shared, harmless).
