-- =============================================================================
-- Tazkerat Altaleb — M2: auth onboarding seed + users RLS
-- Migration: 20260822000001_m2_auth_onboarding
--
-- Re-runnable: CREATE OR REPLACE FUNCTION + DROP POLICY/TRIGGER IF EXISTS
-- everywhere possible.
--
-- Adds:
--   * SELECT/UPDATE RLS policies on public.users (authenticated, own rows).
--     No INSERT policy — new rows come from the SECURITY DEFINER seed path
--     below; no DELETE policy — deletes stay denied by default.
--   * trg_users_freeze_immutable_cols: BEFORE UPDATE trigger that restores
--     email / created_at to OLD values so users_update_own cannot desync
--     public.users from auth.users (version stays owner-writable).
--   * seed_demo_template(): idempotently seeds the demo template
--     (العقيدة → الأصول الثلاثة → الشيخ صالح الفوزان → المحاضرة الأولى plus a
--     memorization-type note wired to SRS), called from the post-signup
--     trigger on auth.users.
--   * handle_new_user() trigger: seeds the template after account creation.
--   * ensure_demo_seed(): SECURITY DEFINER recovery RPC — repairs the profile
--     row + demo template when the trigger above swallowed a seeding failure.
-- =============================================================================

-- ------------------------------------------------------- users table RLS ---
DROP POLICY IF EXISTS users_select_own ON public.users;
CREATE POLICY users_select_own
  ON public.users
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS users_update_own ON public.users;
CREATE POLICY users_update_own
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ------------------------------------------------- immutable column freeze ---
-- users_update_own lets the owner UPDATE any column of their profile row,
-- including email — letting a crafted client desynchronize public.users.email
-- from auth.users.email. This trigger restores email / created_at to their
-- OLD values on every owner-driven update. version is deliberately NOT
-- frozen: the sync model requires clients to increment it on every local
-- edit (highest-version-wins conflict resolution).

CREATE OR REPLACE FUNCTION public.users_freeze_immutable_cols()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Restored unconditionally (NULL-safe): these columns are owned by account
  -- creation, never by the row owner.
  NEW.email := OLD.email;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_freeze_immutable_cols ON public.users;
CREATE TRIGGER trg_users_freeze_immutable_cols
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.users_freeze_immutable_cols();

-- ------------------------------------------------------------ demo seeding ---
-- Seeds one Category → Book → Lecturer → Lecture chain plus a single
-- memorization note attached to the lecture (notes.book_id stays NULL per the
-- XOR constraint). The note's title is derived from the first non-blank line
-- of its content, mirroring the app-side rule. version is left at DEFAULT 1.
--
-- SECURITY DEFINER so the post-signup trigger can write owned rows even
-- though the user has no session yet. search_path is pinned to '' and every
-- object reference is schema-qualified explicitly.

CREATE OR REPLACE FUNCTION public.seed_demo_template(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email        text;
  v_display_name text;
  v_category_id  uuid;
  v_book_id      uuid;
  v_lecturer_id  uuid;
  v_lecture_id   uuid;
  v_content      text;
  v_title        text := '';
BEGIN
  -- Resolve identity from auth.users; display_name falls back to
  -- raw_user_meta_data->>'full_name', then to the email local part.
  SELECT u.email,
         COALESCE(u.raw_user_meta_data ->> 'full_name',
                  split_part(u.email, '@', 1))
    INTO v_email, v_display_name
    FROM auth.users AS u
   WHERE u.id = p_user_id;

  IF v_email IS NULL THEN
    RAISE WARNING 'seed_demo_template: no auth user found for %', p_user_id;
    RETURN;
  END IF;

  -- Idempotency guard: never seed twice for the same user.
  IF EXISTS (
    SELECT 1 FROM public.categories WHERE categories.user_id = p_user_id
  ) THEN
    RETURN;
  END IF;

  -- Ensure the profile row exists (ON CONFLICT keeps later email updates).
  INSERT INTO public.users (id, email, display_name)
  VALUES (p_user_id, v_email, v_display_name)
  ON CONFLICT (id) DO NOTHING;

  -- Demo hierarchy.
  INSERT INTO public.categories (user_id, name)
  VALUES (p_user_id, 'العقيدة')
  RETURNING id INTO v_category_id;

  INSERT INTO public.books (user_id, category_id, title)
  VALUES (p_user_id, v_category_id, 'الأصول الثلاثة')
  RETURNING id INTO v_book_id;

  INSERT INTO public.lecturers (user_id, book_id, name)
  VALUES (p_user_id, v_book_id, 'الشيخ صالح الفوزان')
  RETURNING id INTO v_lecturer_id;

  INSERT INTO public.lectures (lecturer_id, title)
  VALUES (v_lecturer_id, 'المحاضرة الأولى')
  RETURNING id INTO v_lecture_id;

  -- Sample memorization note. First non-blank line doubles as the title.
  v_content :=
    'متن الأصول الثلاثة' || chr(10) ||
    '' || chr(10) ||
    'اعلم رحمك الله أنه يجب علينا تعلّم أربع مسائل:' || chr(10) ||
    'الأولى: العلم، وهو معرفة الله، ومعرفة نبيّه ﷺ، ومعرفة دين الإسلام بالأدلة.';

  -- Title derivation in pure SQL: first non-blank line, trimmed.
  SELECT btrim(l.line) INTO v_title
    FROM unnest(string_to_array(v_content, chr(10)))
           WITH ORDINALITY AS l(line, ord)
   WHERE btrim(l.line) <> ''
   ORDER BY l.ord
   LIMIT 1;

  INSERT INTO public.notes (
    user_id, lecture_id, book_id, title, content, note_type, review_date
  )
  VALUES (
    p_user_id,
    v_lecture_id,
    NULL,               -- XOR: exactly one of book_id / lecture_id
    v_title,
    v_content,
    'memorization',     -- enum note_type value from initial_schema
    CURRENT_DATE        -- due immediately in SRS
  );
END;
$$;

-- ------------------------------------------------------------------ trigger ---
-- DELIBERATE TRADE-OFF: this handler swallows seeding failures so that a
-- broken or partial demo-template seed can NEVER block account creation.
-- Failures are surfaced as Postgres WARNINGs (visible in Supabase logs)
-- instead of aborting the auth.users insert. The empty account remains fully
-- usable; only the demo content is missing.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.seed_demo_template(NEW.id);
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'demo template seeding failed for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tazkerat_on_auth_user_created ON auth.users;
CREATE TRIGGER tazkerat_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ------------------------------------------------ failed-seed recovery RPC ---
-- Recovery path for the deliberate trade-off above: if handle_new_user()
-- swallowed a seeding failure, the account is left with no public.users row
-- and there is no INSERT policy to create one, so profile + demo template are
-- permanently missing. This SECURITY DEFINER function lets the authenticated
-- user repair their own onboarding from the client once they hold a session.
-- Idempotent by construction: the INSERT uses ON CONFLICT DO NOTHING and
-- seed_demo_template() carries its own already-seeded guard.

CREATE OR REPLACE FUNCTION public.ensure_demo_seed()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  -- No session → nothing to repair.
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  -- Restore the missing profile row; ON CONFLICT keeps any existing row
  -- (including its owner-managed columns) untouched.
  INSERT INTO public.users (id, email)
  SELECT u.id, u.email
    FROM auth.users AS u
   WHERE u.id = v_uid
  ON CONFLICT (id) DO NOTHING;

  PERFORM public.seed_demo_template(v_uid);
  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ensure_demo_seed() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_demo_seed() TO authenticated;
