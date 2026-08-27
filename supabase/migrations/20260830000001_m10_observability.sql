-- =============================================================================
-- Tazkerat Altaleb — M10: Observability (analytics + error reports)
-- Migration: 20260830000001_m10_observability
--
-- Supabase-only observability: no external services, no Edge Functions.
-- Two private tables, RLS authenticated-only (own rows write/read).
-- Retention is query-layer (WHERE created_at > now()-30d) — no cron in MVP.
--
-- Re-runnable: CREATE TABLE IF NOT EXISTS + DROP POLICY IF EXISTS guards.
-- Reversible: see revert/20260830000001_m10_observability.down.sql
-- =============================================================================

-- -------------------------------------------------------- analytics_events ---
CREATE TABLE IF NOT EXISTS public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event text NOT NULL,
  props jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_user_created ON public.analytics_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_event ON public.analytics_events(event);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS analytics_insert_own ON public.analytics_events;
CREATE POLICY analytics_insert_own
  ON public.analytics_events FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS analytics_select_own ON public.analytics_events;
CREATE POLICY analytics_select_own
  ON public.analytics_events FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ---------------------------------------------------------- error_reports ---
CREATE TABLE IF NOT EXISTS public.error_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  message text NOT NULL,
  stack text,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_error_reports_user_created ON public.error_reports(user_id, created_at DESC);

ALTER TABLE public.error_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS error_reports_insert_own ON public.error_reports;
CREATE POLICY error_reports_insert_own
  ON public.error_reports FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

DROP POLICY IF EXISTS error_reports_insert_anon ON public.error_reports;
CREATE POLICY error_reports_insert_anon
  ON public.error_reports FOR INSERT TO anon
  WITH CHECK (user_id IS NULL);

-- No select policy for anon — owner can select own, anon cannot select.
DROP POLICY IF EXISTS error_reports_select_own ON public.error_reports;
CREATE POLICY error_reports_select_own
  ON public.error_reports FOR SELECT TO authenticated
  USING (user_id = auth.uid());
