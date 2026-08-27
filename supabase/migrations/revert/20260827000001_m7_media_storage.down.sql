-- =============================================================================
-- Tazkerat Altaleb — rollback for 20260827000001_m7_media_storage
-- Reverts:
--   * Storage RLS policies on storage.objects (media-images / media-audio)
--   * RLS policies on public.media (select/insert/update/delete)
--   * Trigger trg_media_trial_start + helpers set_media_trial_started_at()
--     and media_trial_is_open()
--   * Buckets media-images / media-audio (objects cascade)
--   * Column public.media.duration_seconds
-- Data left intact: users.media_trial_started_at values are NOT cleared
-- (trial start is historical fact). Media rows remain.
-- Fully guarded with IF EXISTS.
-- =============================================================================

-- ---------------------------------------------------- Storage RLS (objects) ---
DROP POLICY IF EXISTS "media_audio_update_own_trial" ON storage.objects;
DROP POLICY IF EXISTS "media_images_update_own_trial" ON storage.objects;
DROP POLICY IF EXISTS "media_audio_delete_own_trial" ON storage.objects;
DROP POLICY IF EXISTS "media_images_delete_own_trial" ON storage.objects;
DROP POLICY IF EXISTS "media_audio_select_own" ON storage.objects;
DROP POLICY IF EXISTS "media_images_select_own" ON storage.objects;
DROP POLICY IF EXISTS "media_audio_insert_own_trial" ON storage.objects;
DROP POLICY IF EXISTS "media_images_insert_own_trial" ON storage.objects;

-- ------------------------------------------------------ media RLS (own) ---
DROP POLICY IF EXISTS media_delete_own ON public.media;
DROP POLICY IF EXISTS media_update_own ON public.media;
DROP POLICY IF EXISTS media_insert_own ON public.media;
DROP POLICY IF EXISTS media_select_own ON public.media;

-- --------------------------------------------------- trial trigger/funcs ---
DROP TRIGGER IF EXISTS trg_media_trial_start ON public.media;
DROP FUNCTION IF EXISTS public.set_media_trial_started_at();
DROP FUNCTION IF EXISTS public.media_trial_is_open();

-- -------------------------------------------------------------- buckets ---
DELETE FROM storage.buckets WHERE id IN ('media-images', 'media-audio');

-- --------------------------------------------------------- duration col ---
ALTER TABLE public.media DROP COLUMN IF EXISTS duration_seconds;
