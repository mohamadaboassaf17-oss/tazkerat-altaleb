-- =============================================================================
-- Tazkerat Altaleb — rollback for 20260822000001_m2_auth_onboarding
-- Drops the signup and immutable-column-freeze triggers, the seed/handler/
-- recovery functions, then the users RLS policies (deny-by-default restored). Seeded data rows are
-- intentionally left in place — data cleanup is out of scope for rollback.
-- Fully guarded with IF EXISTS.
-- =============================================================================

-- ------------------------------------------------------------------ trigger --
DROP TRIGGER IF EXISTS tazkerat_on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS trg_users_freeze_immutable_cols ON public.users;

-- ---------------------------------------------------------------- functions --
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP FUNCTION IF EXISTS public.seed_demo_template(uuid);
DROP FUNCTION IF EXISTS public.ensure_demo_seed();
DROP FUNCTION IF EXISTS public.users_freeze_immutable_cols();

-- -------------------------------------------------------------------- RLS ----
DROP POLICY IF EXISTS users_select_own ON public.users;
DROP POLICY IF EXISTS users_update_own ON public.users;
