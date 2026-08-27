-- =============================================================================
-- Tazkerat Altaleb — M7: Media storage + freeze policy
-- Migration: 20260827000001_m7_media_storage
--
-- PRD §5.4 / AGENTS.md "Media freeze policy":
--   * First media upload sets users.media_trial_started_at (trial starts
--     there, not at signup). After 30 days without Pro: existing media is
--     read-only (downloadable/renderable, nothing deleted), new uploads
--     blocked at the API layer via RLS + Storage policy.
--   * Pro upgrade itself is out-of-scope in MVP — only freeze/block-new.
--
-- tasks.md M7:
--   - Supabase Storage buckets for audio (5-min cap) and images
--   - RLS policy on media INSERT gated by now() - media_trial_started_at < 30d
--   - Storage policy gated by same 30-day window
--   - Freeze = read-only: no UPDATE/DELETE after 30 days
--
-- Re-runnable: every DDL guarded with IF NOT EXISTS / DROP IF EXISTS.
-- Reversible: see revert/20260827000001_m7_media_storage.down.sql
-- =============================================================================

-- --------------------------------------------------------- 0. duration guard ---
-- Nullable int for audio only; images leave it NULL.
-- CHECK allows NULL (image) but bounds audio to 1..300 seconds (5 min).
ALTER TABLE public.media
  ADD COLUMN IF NOT EXISTS duration_seconds int
    CHECK (duration_seconds IS NULL OR (duration_seconds >= 1 AND duration_seconds <= 300));

-- ------------------------------------------------------- 1. Storage buckets ---
-- Two private buckets (RSL-gated) — mirrors tasks.md plural "buckets".
-- file_size_limit ~10 MiB; audio 5 min at 128 kbps ~4.7 MiB so 10 MiB is safe.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'media-images', 'media-images', false, 10485760,
  ARRAY['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif']
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'media-audio', 'media-audio', false, 10485760,
  ARRAY['audio/mpeg','audio/mp3','audio/ogg','audio/wav','audio/webm','audio/mp4','audio/x-m4a','audio/aac','audio/flac']
)
ON CONFLICT (id) DO NOTHING;

-- -------------------------------------------------- 2. Trial helper funcs ---
-- Returns true when the caller's trial window is still open (or never started).
-- NULL media_trial_started_at = first upload is allowed (trial starts on insert).
CREATE OR REPLACE FUNCTION public.media_trial_is_open()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid())
    OR (SELECT media_trial_started_at FROM public.users WHERE id = auth.uid()) IS NULL
    OR now() - (SELECT media_trial_started_at FROM public.users WHERE id = auth.uid()) < interval '30 days'
$$;

-- On first media INSERT, stamp users.media_trial_started_at = now() if still null.
-- SECURITY DEFINER so it can update users even if caller's UPDATE policy is narrow.
CREATE OR REPLACE FUNCTION public.set_media_trial_started_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.users
     SET media_trial_started_at = now()
   WHERE id = NEW.user_id
     AND media_trial_started_at IS NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_media_trial_start ON public.media;
CREATE TRIGGER trg_media_trial_start
  BEFORE INSERT ON public.media
  FOR EACH ROW EXECUTE FUNCTION public.set_media_trial_started_at();

-- ------------------------------------------------------ 3. media RLS (own) ---
-- media stays RLS-enabled from the initial migration (deny-by-default).
-- These policies are the first on media (notes/links got theirs in M4).

-- SELECT: owner can always read own media (even after freeze — read-only).
DROP POLICY IF EXISTS media_select_own ON public.media;
CREATE POLICY media_select_own
  ON public.media
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    AND (
      (media.note_id IS NULL AND media.lecture_id IS NULL)
      OR EXISTS (SELECT 1 FROM public.notes n WHERE n.id = media.note_id AND n.user_id = auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.lectures l
          JOIN public.lecturers lr ON lr.id = l.lecturer_id
          JOIN public.books b ON b.id = lr.book_id
         WHERE l.id = media.lecture_id AND b.user_id = auth.uid()
      )
    )
  );

-- INSERT: owner + parent ownership + trial window open
DROP POLICY IF EXISTS media_insert_own ON public.media;
CREATE POLICY media_insert_own
  ON public.media
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.media_trial_is_open()
    AND (
      (media.note_id IS NULL AND media.lecture_id IS NULL)
      OR EXISTS (SELECT 1 FROM public.notes n WHERE n.id = media.note_id AND n.user_id = auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.lectures l
          JOIN public.lecturers lr ON lr.id = l.lecturer_id
          JOIN public.books b ON b.id = lr.book_id
         WHERE l.id = media.lecture_id AND b.user_id = auth.uid()
      )
    )
  );

-- UPDATE: owner + trial window open (freeze = read-only after 30d)
DROP POLICY IF EXISTS media_update_own ON public.media;
CREATE POLICY media_update_own
  ON public.media
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND public.media_trial_is_open()
  )
  WITH CHECK (
    user_id = auth.uid()
    AND public.media_trial_is_open()
  );

-- DELETE: owner + trial window open (freeze = no delete after 30d — nothing deleted per AGENTS.md)
DROP POLICY IF EXISTS media_delete_own ON public.media;
CREATE POLICY media_delete_own
  ON public.media
  FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND public.media_trial_is_open()
  );

-- ---------------------------------------------------- 4. Storage RLS (objects) ---
-- Objects are private; owner is encoded as first path segment: <uid>/...
-- INSERT gated by same 30-day window; SELECT allowed for own objects forever.

DROP POLICY IF EXISTS "media_images_insert_own_trial" ON storage.objects;
CREATE POLICY "media_images_insert_own_trial"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'media-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.media_trial_is_open()
  );

DROP POLICY IF EXISTS "media_audio_insert_own_trial" ON storage.objects;
CREATE POLICY "media_audio_insert_own_trial"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'media-audio'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.media_trial_is_open()
  );

DROP POLICY IF EXISTS "media_images_select_own" ON storage.objects;
CREATE POLICY "media_images_select_own"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'media-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "media_audio_select_own" ON storage.objects;
CREATE POLICY "media_audio_select_own"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'media-audio'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "media_images_delete_own_trial" ON storage.objects;
CREATE POLICY "media_images_delete_own_trial"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'media-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.media_trial_is_open()
  );

DROP POLICY IF EXISTS "media_audio_delete_own_trial" ON storage.objects;
CREATE POLICY "media_audio_delete_own_trial"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'media-audio'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.media_trial_is_open()
  );

-- UPDATE on storage.objects is rare (metadata only); gate it like DELETE.
DROP POLICY IF EXISTS "media_images_update_own_trial" ON storage.objects;
CREATE POLICY "media_images_update_own_trial"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'media-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.media_trial_is_open()
  )
  WITH CHECK (
    bucket_id = 'media-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.media_trial_is_open()
  );

DROP POLICY IF EXISTS "media_audio_update_own_trial" ON storage.objects;
CREATE POLICY "media_audio_update_own_trial"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'media-audio'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.media_trial_is_open()
  )
  WITH CHECK (
    bucket_id = 'media-audio'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.media_trial_is_open()
  );
