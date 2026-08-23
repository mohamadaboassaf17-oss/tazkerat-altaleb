# PROJECT_STATE — تذكرة الطالب (Tazkerat Altaleb)

> Snapshot date: **2026-08-23**. Compiled by direct inspection of every file listed in §10. Facts not determinable from the repo are marked **Unknown**. Status vocabulary: Completed / In Progress / Planned / Blocked / Unknown.

---

## 1. Project Overview

**تذكرة الطالب** — an offline-first pure-PWA SaaS for Islamic-studies students (طلبة العلوم الشرعية): track Categories → Books → Lecturers → Lectures, take notes with `[[wiki-links]]`, view an interactive knowledge graph, and run spaced-repetition review (SRS) for memorization (`حفظ`) texts. Free forever for core features; monetization limited to post-trial Pro media storage (PRD §2.2, §8).

**Goal:** one place for progress tracking + smart notes + knowledge map + scheduled review, fully usable offline (PRD §1, §9).

**Current status:** early scaffolding phase. Milestones M1 (foundation/PWA shell/DB schema) and most of M2 (auth UI + onboarding SQL) exist as real code; all product features remain Planned.

**Core tech stack (hard, per AGENTS.md):**

| Layer | Choice |
|---|---|
| App | Vite 7 + React 19 + TypeScript ~5.8, react-router-dom v7 |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite`), custom brand palette, RTL |
| Local persistence | Dexie.js v4 over IndexedDB |
| Backend | Supabase only (Auth, PostgreSQL + RLS, Storage) |
| PWA | `vite-plugin-pwa` (Workbox, `autoUpdate`), manifest `dir=rtl`, `lang=ar`, theme `#1e6f50` |
| Font | IBM Plex Sans Arabic (`@fontsource`, 400/500/700 arabic+latin) |
| Tooling | ESLint 9 + typescript-eslint, Vitest 3, sharp/fontkit icon+glyph scripts |

---

## 2. Current Status

- **What currently works (verified by code inspection):**
  - Script surface: `dev / build / preview / lint / typecheck / test / icons / glyphs`.
  - PWA shell: Arabic RTL manifest (3 icons incl. maskable), Workbox precache + `navigateFallback`; `dist/` holds a completed build (`sw.js`, `manifest.webmanifest`, fonts).
  - Auth UI: login (Google OAuth + email/password), signup with email-confirmation gate, forgot-password, update-password, PKCE callback screen, protected `/dashboard` route.
  - `AuthProvider` context with session persistence, error surfacing in UI, and a once-per-load fire-and-forget `ensure_demo_seed()` recovery RPC call.
  - Full DB schema in SQL: 8 tables, both XOR CHECK constraints, RLS enabled deny-by-default, indexes, `updated_at` triggers, idempotent + reversible migrations.
  - Server-side demo-template seeding (`seed_demo_template()` + post-signup trigger + recovery RPC).
  - Dexie schema mirroring all 8 tables + `outbox` + `sync_meta`; `bumpVersion()`/`queueOutbox()` helpers with a vitest spec.
- **Still missing:** all of `tasks.md` M3–M10 — content-hierarchy CRUD, note editor (derived title, `[[` autocomplete), knowledge graph, push/pull sync engine, SRS scheduler + card UI, media upload + freeze policy, public sharing + anon RLS, Markdown/PDF export, real Dashboard, Arabic-normalized search, production hardening. Also no `README.md`.
- **Problems/constraints:** see §9 (no git repo, doc drift, stray `index_out.html`, Supabase CLI unavailable locally, cloud application status Unknown).
- **Rough completion level (approximation, not measured):** ~15–20% of MVP scope. Milestones: M1 ≈ 90% (device-install verification outstanding), M2 ≈ 70% (cloud/auth-provider config + E2E signup verification outstanding), M3–M10 = 0%.

---

## 3. Completed

All items verified present in the repo on **2026-08-23**. Dates inferred from filenames/artifacts where noted.

| Item | Evidence | Date (inferred) | Notes |
|---|---|---|---|
| Planning docs | `tazkerat-altaleb-prd.md` (v2.0 "جاهزة للتطوير"), `AGENTS.md`, `tasks.md` | before 2026-08-21 | PRD = source of truth per AGENTS.md |
| PWA project scaffold | `package.json`, `vite.config.ts`, `tsconfig*.json`, `eslint.config.js`, `.gitignore`, `.env.example`, `index.html` (`lang="ar" dir="rtl"`) | ≤ 2026-08-21 | All scripts wired |
| PWA manifest + Service Worker | `vite.config.ts` VitePWA block; `dist/sw.js`, `dist/manifest.webmanifest`, `public/icons/*` | ≤ 2026-08-22 | At least two builds occurred (two distinct hashed bundles seen across `dist/` and stale `index_out.html`) |
| Arabic font + glyph coverage guard | `src/main.tsx` imports; `scripts/check-glyphs.mjs` checks `ٱ` U+0671, `ﷲ` U+FDF2, `ى` U+0649, shadda U+0651 | ≤ 2026-08-22 | Implements AGENTS.md font rule as a runnable check |
| Initial DB migration (M1) | `supabase/migrations/20260821000001_initial_schema.sql`: 8 tables, enum `note_type`, XOR CHECKs `notes_book_xor_lecture` + `media_note_xor_lecture`, `updated_at` triggers, FK/dashboard indexes, RLS enabled deny-by-default | 2026-08-21 | Documented deviation: columns named `note_type`/`media_type` instead of PRD's `type` |
| Revert for initial migration | `supabase/migrations/revert/20260821000001_initial_schema.down.sql` | 2026-08-21 | Reverse-FK drop order, IF EXISTS guards |
| M2 auth/onboarding migration | `supabase/migrations/20260822000001_m2_auth_onboarding.sql`: `users` SELECT/UPDATE own-row RLS, trigger freezing `email`/`created_at`, SECURITY DEFINER `seed_demo_template()`, post-signup trigger `tazkerat_on_auth_user_created`, recovery RPC `ensure_demo_seed()` (granted to authenticated only) | 2026-08-22 | Seeds العقيدة → الأصول الثلاثة → الشيخ صالح الفوزان → المحاضرة الأولى + a `حفظ` note due today; idempotent guard against double seeding |
| Revert for M2 migration | `supabase/migrations/revert/20260822000001_m2_auth_onboarding.down.sql` | 2026-08-22 | Seeded data rows intentionally left in place |
| Hand-created `supabase/config.toml` | header comment explains CLI binary couldn't be downloaded | ≤ 2026-08-22 | See §8 |
| Dexie local DB | `src/lib/db.ts`: 8 mirrored tables + `outbox` (`++seq`) + `sync_meta`; indexes incl. `review_date`, `last_opened_at` | ≤ 2026-08-22 | Singleton `db` |
| Domain type layer | `src/types/models.ts`: Cloud*/Local* types, `SyncFields` (`dirty`, `server_version`), `OutboxEntry`, `TableName`; `note_links` carries no sync fields | ≤ 2026-08-22 | Mirrors SQL incl. XOR comments |
| Sync helpers + unit spec | `src/lib/sync-helpers.ts` (`bumpVersion` pure +1 & sets dirty; `queueOutbox`), `src/lib/sync-helpers.spec.ts` (4 cases) | ≤ 2026-08-22 | Vitest |
| Supabase client | `src/lib/supabase.ts`: fail-fast env validation, PKCE, persistSession, detectSessionInUrl | ≤ 2026-08-22 | Throws at module init if env missing |
| Auth context/provider | `src/lib/auth.tsx`: session lifecycle, errors surfaced in UI, `requestDemoSeedOnce()` recovery call | ≤ 2026-08-22 | |
| Auth screens | `LoginScreen` (Google OAuth + password, Arabic error mapping incl. rate-limit/unconfirmed email), `SignupScreen` (confirmation gate), `ForgotPasswordScreen`, `UpdatePasswordScreen`, `AuthCallbackScreen` (PKCE exchange, race-safe vs detectSessionInUrl), `DashboardScreen` placeholder ("ستُبنى في الخطوة التالية") | ≤ 2026-08-22 | |
| Routing/guards/primitives/validators | `src/App.tsx`, `src/components/ProtectedRoute.tsx`, `src/components/form-field.tsx` (AuthCard/FormField/Spinner), `src/lib/validation.ts` | ≤ 2026-08-22 | RTL-safe spacing; password min length 6 mirrors Supabase default |
| Operator docs | `docs/supabase-setup.md` (hosted project, CLI, push, env vars), `docs/device-checklist.md` (manual iOS Safari A2HS + Android Chrome install checklist, stale-SW fix) | ≤ 2026-08-22 | |

---

## 4. In Progress

No task was observed mid-edit in the working tree. Three threads are open (state: In Progress / Blocked externally):

1. **M2 closeout — external Supabase configuration.** Done in code: screens, seeding SQL, `users` RLS. Remaining: enable Google OAuth provider + set redirect URLs in the Supabase dashboard, create/link a hosted project, run `supabase db push`. Blocked locally because the CLI binary could not be downloaded (§8); whether any hosted project already received the migrations is **Unknown**.
2. **M1 leftover — manual PWA install verification** on iOS Safari + Android Chrome per `docs/device-checklist.md`; needs HTTPS deploy or tunnel; checkbox still open (`tasks.md` line 10).
3. **Documentation reconciliation** — `tasks.md` M2 checkboxes and parts of `docs/supabase-setup.md` §7 lag behind implemented code (see §9). `PROJECT_STATE.md` created 2026-08-23 as the authoritative snapshot.

---

## 5. Next Steps

### Critical
- [ ] Install Supabase CLI manually (per `docs/supabase-setup.md` §1) or push from another machine: `supabase link --project-ref <ref>` → `supabase db push`.
- [ ] Configure Supabase Auth in the dashboard: Google OAuth provider; redirect URLs incl. `<origin>/auth/callback`, `/update-password` (replace localhost-only URLs in `supabase/config.toml`).
- [ ] Verify end-to-end: fresh signup → confirmation email → login → seeded demo template visible immediately (closes final M2 checkbox in `tasks.md`).
- [ ] Initialize a git repository and commit current state (repo is **not under version control** — highest operational risk).

### High
- [ ] M3: CRUD UI for Category/Book/Lecturer/Lecture; RLS policies for the 7 tables still policy-less (deny-by-default currently blocks all writes); wire `version` increment + outbox enqueue on every local edit (incl. `books.last_opened_at`).
- [ ] M5: push/pull sync engine driven by `outbox`/`sync_meta`; highest-`version`-wins conflicts; backoff; online/action/interval triggers.
- [ ] Resolve `models.ts` ↔ SQL column-name mapping (`type` vs `note_type`/`media_type`) before the sync layer serializes rows (K4).

### Medium
- [ ] M4: note editor (title auto-extracted from first non-blank line, no title input), `[[` autocomplete inserting `[[note_id|display]]`, transactional DELETE+INSERT rebuild of `note_links` on every save, graph centered on most-recently-opened book, tashkeel stripped from labels only.
- [ ] M6: SM-2-inspired SRS with سهل / متوسط / صعب, card-mode UI, `حفظ` scheduling priority via priority/sort-key column.
- [ ] M9: Dashboard (stats, local map, today's queue حفظ-first, recent 5 by `created_at`), Arabic search normalization (strip tashkeel → hamza family أإآٱ→ا → drop ال/و/ف/ب) with `title_norm`/`content_norm`.

### Low
- [ ] M7: Storage buckets, 5-min audio cap, `media_trial_started_at` set at first upload, 30-day freeze/block-new via RLS + Storage policy, countdown UI (Pro upgrade flow out of MVP scope).
- [ ] M8: `is_public` toggle, `/share/note_id` anon route, anon RLS scoped to public notes/links, Markdown export (`[[id]]`→`[[title]]`), PDF via `window.print()` + print stylesheet.
- [ ] M10: accessibility pass, lazy-loaded graph, virtualized lists, code splitting, error reporting/analytics, `README.md`.
- [ ] Housekeeping: remove stale `index_out.html`; refresh `docs/supabase-setup.md` §7; tick completed `tasks.md` boxes.

---

## 6. Decisions

| # | Decision | Reason | Rejected alternatives | Expected impact |
|---|---|---|---|---|
| D1 | Hard stack: pure PWA + Supabase + Dexie.js + mandatory Service Worker | AGENTS.md "Hard tech stack"; PRD §9 | Native shells (Electron/Capacitor/Tauri), other backends | All work constrained to web-only, Supabase-only |
| D2 | Conflict resolution = highest `version` wins, never timestamps | AGENTS.md sync model; PRD FR-M2; clock skew assumed | Timestamp-based LWW | Every mutable row carries `version` (SQL adds it to all 7 mutable tables — superset of PRD §7 listings) |
| D3 | Column renames `notes.type`→`note_type`, `media.type`→`media_type` | Avoid confusion with SQL keywords (documented in migration header and `docs/supabase-setup.md` §7) | Keep PRD names | App models still expose field `type`; mapping handled by future sync serializer (K4) |
| D4 | RLS enabled on all 8 tables in first migration with zero policies (deny-by-default) | Pulled forward from planned M3/M2 (`tasks.md` M1 note); secure default | Add RLS later | Only `users` has policies so far; all other tables fully closed |
| D5 | Demo template seeded by SQL function called from post-signup trigger, not client code | AGENTS.md rule; PRD §4.2 | Client-side seeding after login | Requires SECURITY DEFINER; works even if user never opens app |
| D6 | Signup trigger deliberately swallows seeding failures; `ensure_demo_seed()` SECURITY DEFINER recovery RPC called once-per-page-load from `AuthProvider` | Documented trade-off in M2 migration header + `src/lib/auth.tsx`: a partial seed would strand an account with no `public.users` row and no INSERT policy to create one | Fail signup on seed error; add INSERT policy on `users` | Worst case: usable empty account + Postgres WARNING; client self-heals profile/demo data |
| D7 | `users.email`/`created_at` frozen against owner UPDATEs via BEFORE UPDATE trigger | Broad `users_update_own` policy would let a crafted client desync `public.users.email` from `auth.users.email` | Narrower policy columns | `version` deliberately stays owner-writable for the sync model |
| D8 | Fail-fast env validation in `src/lib/supabase.ts` | Misconfigured deploys must crash loudly | Silent undefined credentials | Clear early errors |
| D9 | OAuth = PKCE with explicit `/auth/callback` exchange, tolerant of `detectSessionInUrl` racing the component | Single-use codes; StrictMode double-mount safety (comments in `AuthCallbackScreen.tsx`) | Implicit flow | Robust against code races/remounts |
| D10 | `note_links` excluded from sync bookkeeping (no dirty/server_version, never enters outbox) | Derived data rebuilt from `notes.content` on every save (AGENTS.md; PRD §7.6) | Versioned link sync | No conflict path exists for links |
| D11 | IBM Plex Sans Arabic; coverage enforced by `scripts/check-glyphs.mjs` | AGENTS.md font rule for iOS Safari/Android Chrome diacritics | Unverified system fonts | Testable guarantee before font changes |
| D12 | Export: Markdown rewrites `[[id]]`→`[[title]]`; PDF via browser print pipeline (both Planned, M8) | AGENTS.md export rules; PRD FR-EX1..3 | Headless Chrome/server renderers | Zero extra infra in MVP |
| D13 | Media trial starts at first upload, not signup; freeze = read-only, nothing deleted; new uploads blocked via RLS + Storage policy (Planned, M7) | AGENTS.md media freeze policy; PRD §5.4 | Trial from signup date | Fair trial window; storage is the only monetized path |

No prior decision has been reversed. Any future reversal must be recorded here with its reason.

---

## 7. Changes

Chronological log (dates inferred from migration filenames/artifacts; no git history exists):

- **≤ 2026-08-20 (approx.)** — Documentation baseline: `tazkerat-altaleb-prd.md` v2.0, `AGENTS.md`, `tasks.md`.
- **~2026-08-21** — Foundation (M1): Vite/React/TS scaffold; Tailwind v4; PWA plugin + manifest + icons (`scripts/generate-icons.mjs`); Arabic fonts; glyph checker; Dexie schema; domain types; hand-created `supabase/config.toml`; initial SQL migration + revert; operator docs. Architectural pull-forward: RLS deny-by-default moved into M1.
- **~2026-08-22** — Auth & onboarding (M2): six screens + routing/guards/form primitives/validators; `AuthProvider` incl. recovery RPC; Supabase client (PKCE, fail-fast env); sync helpers + vitest spec; M2 SQL migration (users RLS, email/created_at freeze, seed function, signup trigger, recovery RPC) + revert; rebuild into `dist/` (current bundle `index-SytsEip0.*`); `preview.log` records a successful `vite preview` run on `http://localhost:4173`.
- **2026-08-23** — Project-state audit via direct inspection; this `PROJECT_STATE.md` created. No application files modified.
- **Dependencies:** none added/removed since scaffold. **API:** none beyond Supabase client config. **Security changes:** RLS enabled day-one; `users` owner-row policies + immutable-column freeze trigger added in M2 migration.

---

## 8. Problems & Solutions

| Problem | Root cause | Solution (implemented) | Affected files | Remaining impact |
|---|---|---|---|---|
| Supabase CLI could not be installed locally | GitHub release downloads throttled (~KB/s); Docker unavailable | Hand-created minimal `supabase/config.toml`; documented manual binary download path | `supabase/config.toml`, `docs/supabase-setup.md` §1 | Migrations never provably pushed to a cloud project (`link`/`db push` pending) |
| Stale Service Worker serving old shells across localhost projects | Browser persists SW/cache per origin | Manual unregister + clear-site-data procedure + console snippet | `docs/device-checklist.md` §4 | None (documentation only) |
| Icon generator risk of blank icons without an Arabic-capable renderer | Tofu glyphs when rasterizing Arabic letter | Tofu detection via private-use codepoint; geometric bookmark fallback | `scripts/generate-icons.mjs` | None observed; icons exist |
| Seeding failure inside post-signup trigger would strand an account (no `users` row, no INSERT policy) | Deliberate failure-swallowing handler (D6) | `ensure_demo_seed()` SECURITY DEFINER recovery RPC granted to authenticated; called once-per-load from `AuthProvider` | M2 migration; `src/lib/auth.tsx` | Healing requires a session/network; offline-first-run edge case untested |
| Owner could desync `public.users.email` from `auth.users.email` via crafted UPDATE | Broad owner UPDATE policy | BEFORE UPDATE trigger restores `email`/`created_at` to OLD values | M2 migration | None known |

Unresolved problems are listed in §9.

---

## 9. Known Issues

| # | Issue | Severity | Status |
|---|---|---|---|
| K1 | Repo is **not a git repository** (no `.git`) despite `.gitignore` existing — no history or backup | High | Open |
| K2 | Whether any hosted Supabase project exists and has these migrations applied: **Unknown** | High | Open |
| K3 | Naming mismatch: TypeScript `CloudNote.type`/`CloudMedia.type` vs SQL columns `note_type`/`media_type` (`src/types/models.ts` vs initial schema). Mapping implicit; future sync serializer must translate explicitly or inserts will fail | Medium | Open (design gap) |
| K4 | `tasks.md` stale: all M2 checkboxes unticked although the M2 migration and all auth screens verifiably exist | Medium | Open (doc drift) |
| K5 | `docs/supabase-setup.md` §7 outdated: lists only the initial migration and states RLS "بدون سياسات بعد", ignoring the 2026-08-22 M2 policies | Medium | Open (doc drift) |
| K6 | `supabase/config.toml` auth URLs are localhost-only; production redirect URL set undefined until a host is chosen | Medium | Open |
| K7 | Stray root file `index_out.html`: stale copy of an older built `index.html` referencing hashed assets (`index-DVK5C-sT.js`) absent from current `dist/` (`index-SytsEip0.js`) | Low | Open (housekeeping) |
| K8 | No `README.md` although `tasks.md` M10 schedules one | Low | Open (planned) |
| K9 | PRD §7 listings omit implementation-required columns (`updated_at` everywhere, `version` on several tables). Implementation follows AGENTS.md sync model; PRD tables incomplete rather than contradictory | Low | Open (doc gap; AGENTS.md governs) |

---

## 10. Important Files

| Path | Purpose |
|---|---|
| `AGENTS.md` | Binding agent rules: hard stack, domain hierarchy, XOR constraints, sync/version model, SRS, media freeze, sharing RLS, Arabic normalization, RTL/UI conventions |
| `tazkerat-altaleb-prd.md` | Source-of-truth PRD v2.0 (Arabic): FR-D/S/M/ST/SH/EX requirements, note types, §7 schema, pricing, §10 deferred decisions |
| `tasks.md` | Milestone plan M1–M10 with checkboxes (partially stale, K4) |
| `PROJECT_STATE.md` | This snapshot — consult before large changes; update after major achievements |
| `package.json` | Scripts + pinned dependency ranges |
| `vite.config.ts` | React + Tailwind v4 plugins; full PWA manifest + Workbox config |
| `supabase/migrations/20260821000001_initial_schema.sql` (+ revert) | Full DB schema: 8 tables, enum, XOR CHECKs, triggers, indexes, RLS enablement |
| `supabase/migrations/20260822000001_m2_auth_onboarding.sql` (+ revert) | Users RLS, email/created_at freeze, demo seeding function, signup trigger, recovery RPC |
| `supabase/config.toml` | Hand-created CLI config (localhost-only auth URLs) |
| `src/lib/db.ts` | Dexie schema: 8 mirrored tables + `outbox` + `sync_meta`, singleton export |
| `src/types/models.ts` | Cloud*/Local* row types, `SyncFields`, `OutboxEntry` — contract between SQL and app |
| `src/lib/supabase.ts` | Singleton Supabase client (PKCE, fail-fast env validation) |
| `src/lib/auth.tsx` | `AuthProvider`/`useAuth`: session lifecycle, error surfacing, demo-seed recovery call |
| `src/lib/sync-helpers.ts` (+ `.spec.ts`) | `bumpVersion` (highest-version-wins primitive), `queueOutbox`, vitest suite |
| `src/lib/validation.ts` | Pure Arabic-message form validators (email, password ≥ 6) |
| `src/screens/*.tsx` | Login, Signup, ForgotPassword, UpdatePassword, AuthCallback (PKCE), Dashboard placeholder |
| `src/App.tsx`, `src/components/ProtectedRoute.tsx`, `src/components/form-field.tsx` | Router, auth guard, shared RTL-safe form card/input/spinner |
| `src/index.css` | Tailwind v4 theme: brand green palette (`#1e6f50` family), IBM Plex Sans Arabic |
| `scripts/generate-icons.mjs`, `scripts/check-glyphs.mjs` | PWA icon generation (tofu fallback); Arabic glyph coverage checker |
| `docs/supabase-setup.md`, `docs/device-checklist.md` | Cloud setup guide; real-device PWA install checklist |
| `.env.example` | Required env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |

---

## 11. Architecture Notes

**Layers (as implemented):**
1. React SPA (Vite) → `AuthProvider` (`src/lib/auth.tsx`) wraps `BrowserRouter` (`src/App.tsx`); routes: `/login`, `/signup`, `/forgot-password`, `/update-password`, `/auth/callback`, protected `/dashboard`.
2. Local-first data layer — Dexie singleton (`src/lib/db.ts`) named `tazkerat-altaleb`: 8 domain tables + `outbox` (FIFO via `++seq`) + `sync_meta` KV. Reads/writes hit local first; cloud sync is a separate async layer (engine itself not yet built).
3. Cloud layer — Supabase client (`src/lib/supabase.ts`): Auth (Google OAuth PKCE + email/password with confirmation), PostgreSQL with RLS, Storage (planned).
4. PWA layer — `vite-plugin-pwa` injects SW registration into `index.html` (`registerType: 'autoUpdate'`); Workbox precaches js/css/html/fonts/images with `navigateFallback: /index.html`.

**Domain hierarchy (AGENTS.md; PRD §3):** Category → Book → Lecturer → Lecture, enforced by FKs in the DB.

**Two XOR rules (DB-level CHECK constraints, not UI guards — AGENTS.md):**
- `notes.book_id` XOR `lecture_id`: exactly one set or both null → constraint `notes_book_xor_lecture`.
- `media.note_id` XOR `lecture_id`: exactly one set or both null → constraint `media_note_xor_lecture`.
Both verified present in `20260821000001_initial_schema.sql`.

**Sync model (AGENTS.md):** every mutable row carries `version: int`; clients increment locally on every edit (`bumpVersion`); push resolves conflicts by **highest version**, never timestamps. Local rows add `dirty`/`server_version` bookkeeping. `note_links` is always derived from `notes.content` and never synced directly.

**Demo template on first login (AGENTS.md; PRD §4.2):** seeded entirely in SQL (`seed_demo_template(uid uuid)` SECURITY DEFINER) from the post-signup trigger on `auth.users`; content = العقيدة → الأصول الثلاثة → الشيخ صالح الفوزان → المحاضرة الأولى + a sample `حفظ` note wired to SRS (`review_date = CURRENT_DATE`); editable and deletable.

**Note title derivation (AGENTS.md):** extracted from first non-blank line of `content` on every save; no title input; stored in `notes.title` for search/autocomplete/graph. The SQL seed mirrors this rule in pure SQL.

**Wiki-links (AGENTS.md):** typing `[[` opens an autocomplete popover of other note titles; insert as `[[note_id|display]]`; resolve `display` from current title at render time. `note_links` is DELETE+INSERT rebuilt in one transaction on every save — removed `[[` must vanish from the graph, no orphans.

**Arabic search normalization (AGENTS.md), applied to both query and indexed value in this order:** strip tashkeel → normalize hamza family (أ إ آ ٱ → ا) → drop definite article ال and prefixes و/ف/ب. Implement as generated/stored normalized columns (`title_norm`, `content_norm`) or consistent write+read normalization. Not yet implemented.

**SRS (AGENTS.md; PRD §5.2):** SM-2-inspired, simplified to three ratings سهل / متوسط / صعب; card mode shows one note at a time — no next card before rating; notes of type `حفظ` get scheduling priority over same-difficulty notes of other types via a priority column/sort key, not a query hack. Not yet implemented.

**Media freeze policy (AGENTS.md; PRD §5.4):** first upload sets `users.media_trial_started_at` (trial starts there, not at signup); after 30 days without Pro, existing media becomes read-only (downloadable/renderable) and new uploads are blocked at API layer via RLS + Storage policy; nothing deleted; Pro upgrade flow out of MVP scope. Not yet implemented.

**Sharing (AGENTS.md; PRD §5.5):** `notes.is_public` toggles visibility; public read path `/share/note_id` served by anon-role RLS policies scoped to `is_public = true` (and links whose source note is public); no signed URLs/Edge Functions/external services. Not yet implemented.

**RTL/UI conventions (AGENTS.md):** Arabic-first, default `dir="rtl"`, logical CSS properties (e.g., `margin-inline-start`); strip tashkeel in autocomplete/graph labels but keep it in note bodies; font must cover `ٱ`, `ﷲ`, `ى` (enforced by `scripts/check-glyphs.mjs`). Current UI complies (symmetric padding/logical classes in components).

**Agent-critical detail before modifying code:** TypeScript models expose field `type` where SQL columns are `note_type`/`media_type` (K3) — any row serializer must map names explicitly. RLS currently denies everything except owner-row SELECT/UPDATE on `users`, so any new feature writing cloud rows requires its RLS policy migration first.

---

## 12. Development Rules

Binding for any AI Agent editing this project:

1. **Tech stack is hard** (AGENTS.md): pure PWA, Supabase only, Dexie.js only, mandatory Service Worker. No Electron/Capacitor/Tauri/native shells; no other backend.
2. **Do not change architectural decisions silently.** Any reversal must be recorded in §6 (Decisions) with the reason and rejected alternative.
3. **Do not mark a task complete without verification** — evidence must exist in the repo (code, passing check, or executed test). Update `tasks.md` checkboxes only when actually done.
4. **Do not remove existing functionality without clear justification** recorded here.
5. **Update this file (`PROJECT_STATE.md`) after major achievements**, and keep `tasks.md`/docs from drifting behind reality (currently K4/K5).
6. **Consult this file before large changes.**
7. Schema changes go through idempotent + reversible `supabase/migrations/*` files with matching `revert/*.down.sql`; no ad-hoc DDL. Update the matching table description in `tazkerat-altaleb-prd.md` in the same commit when schema changes (AGENTS.md convention).
8. Enforce domain rules at the DB level (XOR CHECKs/triggers), never only in UI.
9. Arabic-first RTL: use logical CSS properties; preserve tashkeel in note bodies, strip it in labels.
10. New cross-cutting rules belong in AGENTS.md, not code comments; PRD wins on conflict with AGENTS.md, and AGENTS.md gets updated accordingly.

---

## 13. Session History

No git history exists; phases below are reconstructed from file evidence (migration dates, artifacts, logs):

- **Before 2026-08-21** — Planning phase: authored PRD v2.0, AGENTS.md, milestone plan `tasks.md`. No code.
- **2026-08-21 (approx.)** — M1 Foundation: scaffolded Vite+React+TS+Tailwind v4 project; PWA manifest/icons/SW; Arabic fonts + glyph checker; Dexie schema; domain types; hand-created `supabase/config.toml` after CLI download failure; wrote initial schema migration (+revert) including early RLS enablement; wrote operator docs. Issue found: GitHub throttling blocked CLI install.
- **2026-08-22 (approx.)** — M2 Auth & Onboarding: built all five auth screens + callback + guards + form primitives + validators; `AuthProvider` with recovery RPC; fail-fast Supabase client; sync helpers + unit spec; wrote M2 SQL migration (+revert) with users RLS, email/created_at freeze trigger, demo seeding function, signup trigger, recovery RPC; produced a fresh build (`dist/`) and ran `vite preview` (:4173). Issues found: seeding-failure stranding risk (solved via recovery RPC), email-desync risk (solved via freeze trigger).
- **2026-08-23** — Documentation/state audit session: full repo inspection; created `PROJECT_STATE.md`; identified doc drift (K4/K5), stray `index_out.html` (K7), missing README (K8), missing git repo (K1), unknown cloud-application status (K2), `type` vs `note_type` mapping gap (K3). Next task: external Supabase configuration + E2E signup verification.

---

## 14. Open Questions

- Which deployment host will serve the production PWA (needed for real auth redirect URLs, K6)? Netlify/Vercel/Cloudflare Pages all listed as options in `docs/device-checklist.md` — no choice made yet. **Unknown.**
- Does a hosted Supabase project already exist, and if so, what is its state? **Unknown.**
- Should the app-level password minimum (6, mirroring the Supabase default per comment in `src/lib/validation.ts`) be raised, and will dashboard settings stay in lockstep?
- How should the sync serializer handle the `type` ↔ `note_type`/`media_type` mapping (K3) — rename TS fields to match SQL, or keep an explicit mapping table? Owner decision needed before M5.
- Post-MVP pricing items deliberately deferred per PRD §10: Lifetime plan price TBD; Google Drive storage alternative TBD. Confirm these remain out of scope.
- Is a git remote intended (GitHub/GitLab)? None configured.

---

## 15. Verification

**Verified during the 2026-08-23 audit (this documentation session):**
- Existence and content of every file listed in §10, read directly (source, SQL migrations incl. revert scripts, configs, docs, tests, scripts).
- Presence of both XOR CHECK constraints, deny-by-default RLS enablement, users RLS policies, seed/trigger/recovery functions in the two migrations.
- Consistency between `src/types/models.ts`, `src/lib/db.ts` and the SQL schema (with the documented `type` naming exception, K3).

**NOT performed / not claimable:**
- No `npm run lint`, `npm run typecheck`, `npm run test`, or `npm run build` was executed in this session (kept read-only to avoid touching workspace files). Whether they pass today is **Unknown**.
- No runtime/browser testing; no manual device install verification (the `docs/device-checklist.md` success table is fully unchecked; `tasks.md` line 10 open).
- Past-run evidence only: `dist/` contains completed build artifacts (SW, manifest, hashed bundle `index-SytsEip0.js`, fonts) proving at least one successful `vite build`, and `preview.log` shows `vite preview` launched on port 4173 — but the date, tool versions, and pass/fail of prior lint/typecheck/test runs are **Unknown** (no logs kept, no git history).
- Migrations have never been confirmed applied to any database (**Unknown**; no CLI/local Docker available per §8).

