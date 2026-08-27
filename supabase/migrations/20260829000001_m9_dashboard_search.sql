-- =============================================================================
-- Tazkerat Altaleb — M9: Dashboard & Arabic-normalized search
-- Migration: 20260829000001_m9_dashboard_search
--
-- PRD §4.4 + §5.1 (AGENTS.md "Arabic search normalization" + Dashboard):
--   1. Strip tashkeel (U+064B-U+065F + U+0670)
--   2. Normalize hamza family: أ إ آ ٱ → ا
--   3. Drop definite article ال and prefixes و/ف/ب (one level)
-- Adds GENERATED STORED normalize_ar() helper + title_norm/content_norm on
-- notes (generated, not user-writable) + trigram/GIN indexes for
-- is_public-aware search. Dexie mirrors this via JS normalizeArabic().
--
-- Re-runnable: every DDL guarded (OR REPLACE, IF NOT EXISTS, IF EXISTS).
-- Reversible: see revert/20260829000001_m9_dashboard_search.down.sql
-- =============================================================================

-- --------------------------------------------------------- pg_trgm extension ---
-- Required for GIN trigram indexes; harmless on re-run.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- --------------------------------------------------- normalize_ar() helper ---
-- IMMUTABLE so it can be used in GENERATED columns and indexes.
-- Order: tashkeel → hamza → ال + و/ف/ب (AGENTS.md 1→2→3).
-- Prefix stripping only when remainder length >= 2 (avoids وليد → ليد).
CREATE OR REPLACE FUNCTION public.normalize_ar(input text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  s text;
BEGIN
  IF input IS NULL THEN
    RETURN NULL;
  END IF;
  s := input;
  -- 1. Strip tashkeel: U+064B-U+065F (ً-ْ) + dagger alif U+0670
  s := regexp_replace(s, '[\u064B-\u065F\u0670]', '', 'g');
  -- 2. Hamza family → bare alif
  s := replace(s, 'أ', 'ا');
  s := replace(s, 'إ', 'ا');
  s := replace(s, 'آ', 'ا');
  s := replace(s, 'ٱ', 'ا');
  -- 3. Drop definite article ال and single-char prefixes و/ف/ب iteratively.
  -- Loop once to handle وال/فال/بال; guard by remainder length.
  s := trim(s);
  -- Collapse whitespace and lowercase for case-insensitive matching (Arabic
  -- lowercasing is a no-op but keeps Latin fragments consistent).
  s := lower(s);
  s := regexp_replace(s, '\s+', ' ', 'g');
  -- Prefix pass: strip leading ال, then و/ف/ب one level each.
  -- Example: والكتاب → و + الكتاب → الكتاب → كتاب
  -- Implemented as iterative strip of (و|ف|ب)? + ال prefix, then single و/ف/ب.
  LOOP
    DECLARE
      before text := s;
    BEGIN
      -- Strip ال when remainder >= 2 chars (e.g., "ال" alone stays)
      IF s LIKE 'ال%' AND length(s) > 3 THEN
        s := substring(s FROM 3);
      END IF;
      -- Strip single و/ف/ب prefix — guarded (token len >=5, remainder >=3) to
      -- preserve short names like وليد/بدر/فهد while still collapsing
      -- والكتاب/بالعقيدة via the iterative ال loop.
      IF s ~ '^[وفب].+' AND length(s) >= 5 THEN
        DECLARE
          rem text := substring(s FROM 2);
        BEGIN
          IF length(rem) >= 3 THEN
            s := rem;
          END IF;
        END;
      END IF;
      -- Also handle stacked "وال"/"فال"/"بال": e.g., "والكتاب" after first
      -- iteration becomes "الكتاب" → next loop strips ال → "كتاب"
      IF s = before THEN
        EXIT;
      END IF;
    END;
  END LOOP;
  RETURN s;
END;
$$;

-- --------------------------------------------------- generated norm columns ---
-- title_norm / content_norm are STORED generated columns — not user-writable,
-- so existing trg_notes_version_guard (M5) is unaffected (it fires on UPDATE
-- of version, not on generated columns).
ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS title_norm text
    GENERATED ALWAYS AS (public.normalize_ar(title)) STORED;

ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS content_norm text
    GENERATED ALWAYS AS (public.normalize_ar(content)) STORED;

-- --------------------------------------------------------------- indexes ---
-- GIN trigram for substring/ILIKE search; btree for user-scoped lookups.
CREATE INDEX IF NOT EXISTS idx_notes_title_norm_trgm
  ON public.notes USING gin (title_norm gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_notes_content_norm_trgm
  ON public.notes USING gin (content_norm gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_notes_user_title_norm
  ON public.notes(user_id, title_norm);

CREATE INDEX IF NOT EXISTS idx_notes_user_content_norm
  ON public.notes(user_id, content_norm);
