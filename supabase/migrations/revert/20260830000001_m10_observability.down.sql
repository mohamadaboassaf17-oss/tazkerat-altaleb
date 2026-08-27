-- Revert for 20260830000001_m10_observability — idempotent.

DROP POLICY IF EXISTS error_reports_select_own ON public.error_reports;
DROP POLICY IF EXISTS error_reports_insert_anon ON public.error_reports;
DROP POLICY IF EXISTS error_reports_insert_own ON public.error_reports;
DROP POLICY IF EXISTS analytics_select_own ON public.analytics_events;
DROP POLICY IF EXISTS analytics_insert_own ON public.analytics_events;

DROP TABLE IF EXISTS public.error_reports;
DROP TABLE IF EXISTS public.analytics_events;
