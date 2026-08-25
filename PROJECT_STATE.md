# PROJECT_STATE — تذكرة الطالب (Tazkerat Altaleb)

> Snapshot date: **2026-08-26**. Compiled by direct inspection of every file listed in §10 and updated after the live PWA verification session (2026-08-23, §15), after the M3 closeout session of 2026-08-24 (§7, §13), after the M4 closeout session of 2026-08-25 (§7, §13), after the M5 sync-engine build-out session of 2026-08-25 (§1–§7, §9, §11, §13–§15), and finally reconciled in this 2026-08-26 closeout after the 2026-08-25 cloud-push + live-E2E session (§2, §4, §5, §9, §13–§15). Facts not determinable from the repo are marked **Unknown**. Status vocabulary: Completed / In Progress / Planned / Blocked / Unknown.

---

## 1. Project Overview

**تذكرة الطالب** — an offline-first pure-PWA SaaS for Islamic-studies students (طلبة العلوم الشرعية): track Categories → Books → Lecturers → Lectures, take notes with `[[wiki-links]]`, view an interactive knowledge graph, and run spaced-repetition review (SRS) for memorization (`حفظ`) texts. Free forever for core features; monetization limited to post-trial Pro media storage (PRD §2.2, §8).

**Goal:** one place for progress tracking + smart notes + knowledge map + scheduled review, fully usable offline (PRD §1, §9).

**Current status:** local-first build-out phase. Milestones M1 (foundation/PWA shell/DB schema) ≈95%, M2 (auth UI + onboarding SQL) ≈100%, M3 (content-hierarchy CRUD, version/outbox mutation pipeline, hierarchy RLS), M4 (notes data layer, editor UI, knowledge graph, notes RLS), and M5 (sync engine — conflict-guard migration, serializer, push/pull/engine trio + wiring) are code-complete AND live: all five migrations were pushed to hosted project `pyvskirousshlwsqtoro` on 2026-08-25 (K2 resolved) and the M5/M2 live E2E passed. SRS/media/sharing/dashboard features remain Planned.

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
  - **PWA installability verified live (2026-08-23, Chrome desktop against `vite preview` :4173):** SW `activated` at scope `/`; with network emulated Offline the full login shell re-renders from precache; manifest fields confirmed (`dir=rtl`, `lang=ar`, `display=standalone`, `start_url=/`, theme `#1e6f50`); all 3 icons HTTP 200 `image/png`; Lighthouse: Accessibility **100**, Best Practices **100**, SEO **91** (remaining failures only `robots.txt`/`llms.txt` — hosting concerns, M10). Also verified this session: `glyphs` PASS, `typecheck`, `lint`, `test` (4/4), fresh production build.
  - Auth UI: login (Google OAuth + email/password), signup with email-confirmation gate, forgot-password, update-password, PKCE callback screen, protected `/dashboard` route.
  - `AuthProvider` context with session persistence, error surfacing in UI, and a once-per-load fire-and-forget `ensure_demo_seed()` recovery RPC call.
  - Full DB schema in SQL: 8 tables, both XOR CHECK constraints, RLS enabled deny-by-default, indexes, `updated_at` triggers, idempotent + reversible migrations.
  - Server-side demo-template seeding (`seed_demo_template()` + post-signup trigger + recovery RPC).
   - Dexie schema mirroring all 8 tables + `outbox` + `sync_meta`; `bumpVersion()`/`queueOutbox()` helpers with a vitest spec.
   - **Sync engine (M5, 2026-08-25):** conflict-guard DB trigger migration (+revert) enforcing highest-version-wins at the Postgres boundary; explicit local↔cloud serializer (`toCloudRow`, resolves `type`↔`note_type`/`media_type`); push worker (strict FIFO, auth gate, conflict adoption incl. insert-time 23505, jittered exponential backoff); pull worker (FK-order walk, per-user `updated_at` cursors in sync_meta, 500-row pagination, ±5s overlap window, dirty rows never clobbered, atomic note_links rebuild); single-flight engine with SyncStatus pub/sub wired to online/visibilitychange/30s-interval/debounced-action triggers and AuthProvider lifecycle.
- **Still missing:** `tasks.md` M6–M10 — SRS scheduler + card UI, media upload + freeze policy, public sharing + anon RLS, Markdown/PDF export, real Dashboard, Arabic-normalized search (M9), production hardening. Also no `README.md`. All five M1–M5 migrations ARE applied to the hosted project (pushed 2026-08-25).
- **Problems/constraints:** see §9 (production origin/auth-provider configuration outstanding — K6; `mailer_autoconfirm=true` revisit before production; stray `index_out.html`; K2 resolved 2026-08-25 with all migrations pushed; git repo now initialized on branch `main` tracking `origin/main`).
- **Rough completion level (approximation, not measured):** ~45–50% of MVP scope. Milestones: M1 ≈ 95% (all automatable checks pass; only physical-device A2HS tap-through on iOS/Android remains — needs real hardware + HTTPS host), M2 ≈ 100% (verified live 2026-08-25: fresh signup shows the seeded template immediately without manual reload; only production-origin/auth-provider configuration remains, outside code), M3 ≈ 95% (CRUD + mutation pipeline + hierarchy RLS pushed and exercised via the live E2E), M4 ≈ 100% (data layer + editor UI + graph + notes RLS migration + tests + live E2E complete), M5 ≈ 95% (engine complete; all five migrations live; live E2E ALL PASS incl. offline→cloud exact-id match, `last_opened_at` timestamp match, conflict adoption 1→8→9→15 and `SYNC_CONFLICT|15` guard reproduction; only production-origin/auth-provider config remains), M6–M10 = 0%.

---

## 3. Completed

All items verified present in the repo on **2026-08-23**; rows dated 2026-08-24 were added after the M3 closeout session, rows dated 2026-08-25 (data layer/UI/graph) after the M4 closeout session, and rows dated 2026-08-25 (migration/serializer/engine) after the M5 sync-engine build-out session.

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
| M3 CRUD screens + nested routing | `src/screens/CategoriesScreen.tsx`, `BooksScreen.tsx`, `LecturersScreen.tsx`, `LecturesScreen.tsx`; nested routes wired in `src/App.tsx` (`/categories` → `/categories/:categoryId` → `/categories/:categoryId/books/:bookId` → `.../lecturers/:lecturerId`); shared `EntityDialog` + `ConfirmDeleteDialog` components; delete-blocking child-count checks before any delete | 2026-08-24 | |
| Entity CRUD mutation pipeline | `src/lib/entity-crud.ts`: `createEntity` stamps `version=1`/`dirty=true`; `updateEntity` bumps `version` via `bumpVersion()`; every mutation writes row + outbox entry inside one Dexie transaction; `touchBookOpened()` fired once-per-entry from `LecturersScreen` (useRef guard vs StrictMode double-effect). Cloud push itself remains M5 | 2026-08-24 | |
| XOR guards + unit spec | `src/lib/xor-guards.ts` (+ `.spec.ts`, 9 cases) mirroring the DB-level CHECK constraints `notes_book_xor_lecture` / `media_note_xor_lecture` locally | 2026-08-24 | Constraints themselves delivered early in the initial migration |
| M3 hierarchy RLS migration | `supabase/migrations/20260824000001_m3_hierarchy_rls.sql` (+ revert `revert/20260824000001_m3_hierarchy_rls.down.sql`): policies `<table>_<op>_own` per operation for categories/books/lecturers (owner via `user_id = auth.uid()`, insert/update assert parent ownership); lectures owned transitively via lecturers→books; notes/note_links/media stay deny-by-default. **Not yet pushed to any cloud project** (D14) | 2026-08-24 | |
| entity-crud spec with fake-indexeddb | `src/lib/entity-crud.spec.ts` (9 cases); `fake-indexeddb` devDependency added to `package.json`. Full suite: 22 tests / 3 files passing; typecheck + lint clean | 2026-08-24 | |
| Live E2E verification of M3 CRUD | Browser session against `vite preview` :4173 with real Supabase project `pyvskirousshlwsqtoro`: fresh signup succeeded (immediate session), full hierarchy walked via UI — category create/rename, book create (page-count validation error correctly shown for current>total), lecturer create, lecture create with completion badge; delete-blocking confirmed ("لا يمكن حذف القسم لاحتوائه على كتب مرتبطة"); bottom-up delete chain lecture→lecturer→book→category all succeeded; IndexedDB inspection confirmed `books.version=2` after `touchBookOpened()` with `last_opened_at > created_at`, and outbox accumulated exactly 11 entries in correct FIFO order incl. 4 delete ops each carrying `payload:null` plus a second books-update from re-entry (once-per-entry semantics verified) | 2026-08-24 | Surfaced the SignupScreen spinner defect, fixed per D15 |
| Notes data layer + unit specs | `src/lib/arabic-text.ts` (`stripTashkeel` covering U+064B–U+065F + U+0670), `src/lib/note-text.ts` (`extractTitle`: first non-blank line, sanitizes `[[target|display]]`→display text with whitespace collapse + line fallthrough + 'بدون عنوان' fallback — D18; `parseWikiLinks` dedups), `src/lib/note-crud.ts` (createNote/updateNote/deleteNote mirroring the entity-crud pipeline: version bump, row + links + outbox entry in ONE Dexie transaction; deleteNote removes outgoing AND incoming edges mirroring the cloud double CASCADE); specs `arabic-text.spec.ts` (8) / `note-text.spec.ts` (21) / `note-crud.spec.ts` (7) — zero note_links outbox entries verified = D10 | 2026-08-25 | Suite grew to 58 tests / 6 files passing |
| Note editor UI, routes and entry points | `wiki-autocomplete.tsx` (caret-tracked `[[` popover, tashkeel-stripped matching, keyboard nav, inserts `[[uuid|title]]`, load-failure alert «تعذّر تحميل الاقتراحات», live-DOM insertion), `note-editor.tsx` (derived-title preview, NO title input, 5-type Arabic selector, empty-content guard), `NoteEditorScreen.tsx` (`/notes/new?book=` XOR-validated create mode, `/notes/new?lecture=` alternative, `/notes/:noteId` edit mode, delete via ConfirmDeleteDialog); entry points per D17: book-notes section «الملاحظات المرتبطة بالكتاب» on LecturersScreen bound to `:bookId`, per-row «+ ملاحظة» + live count «ملاحظات: N» on LecturesScreen rows; BooksScreen reverted untouched | 2026-08-25 | |
| Local knowledge graph (+ dependency) | GraphScreen on `/graph` route using `react-force-graph-2d@1.29.1` (added to package.json — D16): nodes colored per note type (حفظ solid #1e6f50) + legend, labels tashkeel-stripped/truncated 16 chars, edges filtered to existing endpoints, cluster centering = max `books.last_opened_at` with two-hop lecturers→lectures join (inner golden-angle ring vs outer ring), click node → editor | 2026-08-25 | Mount defect found in live verification (ResizeObserver attached while the loading branch hid the container → canvas never rendered) fixed by always-rendered container + eager `measure()`; rendering pixel-verified afterwards (nodes #1e6f50/#57a97b, edge hairline #ccd6d0, zoomToFit) |
| M4 notes RLS migration (+ revert) | `supabase/migrations/20260825000001_m4_notes_rls.sql` (+ revert `revert/20260825000001_m4_notes_rls.down.sql`): 8 policies named `<table>_<op>_own`; notes assert parent ownership incl. the transitive lectures path plus standalone-null allowed; note_links ownership via source-note EXISTS with INSERT/UPDATE additionally requiring a same-user target. Idempotent + reversible. **Not yet pushed to any cloud project** (continuation of D14) | 2026-08-25 | |
| Live E2E verification of M4 notes lifecycle | Browser session against `vite preview` :4173 with real Supabase project `pyvskirousshlwsqtoro`: signup → hierarchy created via UI → two book-notes → `[[` autocomplete insertion verbatim (`[[c0a83c51…|ملاحظة الاختبار الثانية]]`) → save → IndexedDB edge present → token removed → save → edge gone with no orphans → version 1→2→3 with dirty=true; tashkeel preserved in note bodies; outbox accumulated exclusively `table_name='notes'`. Lecture-note flow: «ملاحظات: 0»→«ملاحظات: 1». Two defects found and fixed during this verification: graph mount defect (see graph row above) and title markup pollution (extractTitle now sanitizes wiki-link markup to display text — D18). Second live finding: hosted project has NO migrations applied (categories insert → 403 RLS deny-by-default; server demo seed runs but invisible to clients) — K2 proven materially | 2026-08-25 | Gates re-run green after fixes: typecheck + lint clean, glyphs PASS, 58/58 tests, production build OK (pre-existing >500 kB chunk warning, lazy-load deferred M10) |
| M5 sync-conflict-guard migration (+ revert) | `supabase/migrations/20260825000002_m5_sync_conflict_guard.sql` (+ revert): shared `assert_sync_version()` BEFORE INSERT OR UPDATE trigger on users/categories/books/lecturers/lectures/notes/media (note_links excluded — derived per D10); rejects UPDATE where NEW.version <= OLD.version via RAISE EXCEPTION ERRCODE 'P0001' MESSAGE 'SYNC_CONFLICT|'\|\|OLD.version::text; INSERT path passthrough; idempotent + reversible. PRD §7 got a one-line note; `docs/supabase-setup.md` §4 + §7 got the migration-log entry. **Not yet pushed to any cloud project** (continuation of K2/D14) | 2026-08-25 | |
| Local↔cloud serializer (closes K3) | `src/lib/sync-serialize.ts` (+ `.spec.ts`, 17 cases): explicit mapping layer translating TS field names ↔ SQL columns (`notes.type`↔`note_type`, `media.type`↔`media_type`) via toCloudRow; throws on note_links (D10) and unknown tables. Companion type change: `src/types/models.ts` OutboxEntry extended with attempts/next_attempt_at/last_error (non-indexed — no Dexie schema change) | 2026-08-25 | |
| Sync engine trio + wiring + specs | `src/lib/sync-push.ts`: strict-FIFO drain stopping at first unready/failed entry; auth gate; `upsert(onConflict:'id')` with payload through toCloudRow; delete idempotent; P0001-conflict AND insert-time 23505 both ADOPT the server row (dirty=false, one Dexie transaction per finalize/adopt); transient backoffMs = min(1000·2^(n−1),60000) ±20% jitter persisted as next_attempt_at. `src/lib/sync-pull.ts`: fixed order users→categories→books→lecturers→lectures→notes→media; per-user cursors `pull_cursor_<uid>_<table>` in sync_meta; `.range()` pagination PAGE_SIZE=500 until short page (mid-loop abort never advances cursor); ±5s overlap window gte; dirty rows never clobbered, clean rows replaced only when incoming.version > local.server_version; pulled notes + derived note_links rebuilt atomically in ONE transaction. `src/lib/sync-engine.ts`: single-flight runSyncCycle (pull→push, never throws outward); SyncStatus {idle\|syncing\|error, pendingCount} pub/sub with listener-throw isolation; startSyncEngine() registers online + 30s interval + visibilitychange with idempotent cleanup. Wiring: queueOutbox schedules one debounced ~3s cycle; AuthProvider starts/stops engine on SIGNED_IN/sign-out. Specs: sync-push 15 / sync-pull 13 / sync-engine 10 (+17 serialize) — suite **113 tests / 10 files passing**. Reviewer pass fixed F1 payload-serialization blocker, F3 pagination truncation, F6 link atomicity, F7 notify recursion | 2026-08-25 | |

---

## 4. In Progress

No task is mid-edit in the working tree. The former M2-closeout thread is closed (item 1); three threads remain open:

1. **CLOSED 2026-08-25 — M2 closeout / external Supabase configuration.** Supabase link + push completed: all five migrations applied remotely (`migration list` remote ✓ ×5), REST smoke returned `200 []`, and a fresh-signup smoke produced an immediate session with seed rows present (K2 resolved). Final M2 checkbox verified live — seeded العقيدة chain visible ~40s post-signup WITHOUT manual reload (see `tasks.md` M2 evidence note).
2. **M1 residual — physical-device A2HS tap-through.** All automatable installability checks pass (2026-08-23, see §15). Remaining tap-through on real iOS Safari + Android Chrome needs physical hardware + an HTTPS host/tunnel; `docs/device-checklist.md` success table stays unchecked until then.
3. **Documentation reconciliation** — closed 2026-08-24: `tasks.md` M1 evidence note (2026-08-23), M2 checkboxes ticked, and M3 checkboxes ticked with an evidence blockquote (XOR CHECKs delivered early in the initial migration; RLS pending cloud push; 22/22 suite). `docs/supabase-setup.md` §7 rewritten as a migration log covering all three migrations + reverts (K4/K5 resolved).
4. **Production origin + auth provider (K6).** Auth site_url/redirect URLs remain localhost-only; the Management API no longer accepts a `redirect_urls` field, so `uri_allow_list` was set for the localhost dev origins on 2026-08-25 as a dev workaround. Production host must be chosen and configured; Google OAuth provider stays disabled pending owner-supplied Google client credentials.
5. **`mailer_autoconfirm=true` revisit before production.** The hosted project auto-confirms email (immediate signup sessions — convenient for development, exercised by the smoke tests), but PRD requires an email-verification gate for the password flow; decide before launch and re-verify the auth flows under the stricter mode.

---

## 5. Next Steps

### Critical
- [ ] Decide the production deployment host and configure Supabase Auth for it (K6): set `site_url` + redirect URLs for the chosen origin. Note the Management API no longer accepts a `redirect_urls` field — final URLs go through the dashboard UI / allow-list; the `uri_allow_list` set 2026-08-25 covers localhost dev origins only.
- [ ] Enable the Google OAuth provider — blocked on owner-provided Google client credentials (provider currently disabled).
- [ ] Revisit `mailer_autoconfirm=true` before production (PRD requires an email-verification gate for the password flow; current immediate-session behavior is dev-convenient but skips verification).
- [ ] Optional: manually add production redirect URLs in the Supabase dashboard UI once the host is chosen (the Management API `redirect_urls` field was removed upstream).

### High
- [ ] M6 SRS — next milestone: SM-2-inspired scheduler, card-mode UI, `حفظ` scheduling priority (moved up from Medium at the 2026-08-26 closeout).
- [x] M5: push/pull sync engine driven by `outbox`/`sync_meta`; highest-`version`-wins conflicts; backoff; online/action/interval triggers — **delivered 2026-08-25** (see §3 rows and D19–D21); live-verified 2026-08-25 against the pushed migrations (see §15).
- [x] Resolve `models.ts` ↔ SQL column-name mapping (`type` vs `note_type`/`media_type`) before the sync layer serializes rows — resolved 2026-08-25 via the explicit serializer `src/lib/sync-serialize.ts` (D19; closes K3).

### Medium
- [ ] M9: Dashboard (stats, local map, today's queue حفظ-first, recent 5 by `created_at`), Arabic search normalization (strip tashkeel → hamza family أإآٱ→ا → drop ال/و/ف/ب) with `title_norm`/`content_norm`.

### Low
- [ ] M7: Storage buckets, 5-min audio cap, `media_trial_started_at` set at first upload, 30-day freeze/block-new via RLS + Storage policy, countdown UI (Pro upgrade flow out of MVP scope).
- [ ] M8: `is_public` toggle, `/share/note_id` anon route, anon RLS scoped to public notes/links, Markdown export (`[[id]]`→`[[title]]`), PDF via `window.print()` + print stylesheet.
- [ ] M10: accessibility pass, lazy-loaded graph, virtualized lists, code splitting, error reporting/analytics, `README.md`.
- [ ] Housekeeping: remove stale `index_out.html` (`docs/supabase-setup.md` §7 refresh + `tasks.md` box-ticking were completed 2026-08-24).

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
| D14 | M3 RLS written but cloud push deferred | Owner chose to defer until the Supabase project/link is settled (CLI install was previously blocked) | Pushing immediately | Policies exist only in the repo until `db push` runs; hierarchy tables stay deny-by-default in any hosted project until then |
| D15 | `SignupScreen` redirects any authenticated user to `/dashboard` (top-of-component guard, mirroring LoginScreen) | Hosted project has email confirmation disabled, so `signUp` resolves with an immediate session; without the guard users hang on a permanent spinner at `/signup` | Programmatic `navigate()` inside the submit handler (the LoginScreen guard pattern is the established convention) | Matches LoginScreen behavior; safe in both confirmation modes |
| D16 | Graph library = `react-force-graph-2d@1.29.1`; lazy-loading of its bundle deferred to M10 | Owner-selected over hand-rolled SVG or cytoscape; canvas rendering + built-in force layout/zoomToFit save bespoke physics work | Hand-rolled SVG graph; cytoscape.js | >500 kB chunk warning accepted for now (pre-existing build warning); `/graph` loads eagerly until M10 code-splitting |
| D17 | Dedicated routes `/notes/new?book=`/`?lecture=` and `/notes/:noteId`; book-notes entry point on LecturersScreen («الملاحظات المرتبطة بالكتاب» bound to `:bookId`) + per-row «+ ملاحظة» / «ملاحظات: N» affordances on LecturesScreen rows | No lecture-detail screen exists to host lecture notes; LecturersScreen is where a book is "entered", so it hosts the book's notes section | Embedding notes in BooksScreen; creating a new lecture-detail screen just for notes | BooksScreen reverted untouched; note creation XOR-validates `book`/`lecture` params at route level |
| D18 | `extractTitle` sanitizes wiki-link markup: first non-blank line with `[[target|display]]` yields `display` text as the title | PRD's first-non-blank-line rule interpreted for link-bearing titles: raw `[[id|display]]` in `notes.title` would pollute search/autocomplete/graph labels | Store raw markup in title; skip title extraction when line starts with a link | Titles stay human-readable everywhere they surface; content keeps the link verbatim |
| D19 | Resolved K3 via an explicit serializer mapping layer (`src/lib/sync-serialize.ts`, toCloudRow/toLocalRow) instead of renaming TypeScript fields to match SQL columns (`type` ↔ `note_type`/`media_type`) | Keeps app-side domain naming stable across editor/graph/SRS code; a single translation point at the sync boundary; renaming would ripple through every consumer of the models | Renaming TS fields to match SQL column names | Every push/pull row passes through the serializer; cloud inserts can no longer fail on column-name mismatch |
| D20 | Conflict tie-break enforced at the DB boundary: server guard `assert_sync_version()` rejects any UPDATE with NEW.version <= OLD.version (P0001 `SYNC_CONFLICT|<old_version>`), so equal-version ties resolve to server/first-writer; the client then ADOPTS the server row (dirty=false) rather than retrying | Highest-version-wins (D2/AGENTS.md) must be authoritative server-side, immune to client clock skew and racing writers; adoption avoids infinite push loops | Accepting client rows on ties; timestamp-based tie-breaks | Both conflict paths (P0001 update-guard and insert-time 23505) converge to adopting the server row in one Dexie transaction |
| D21 | Pull is incremental: per-user `updated_at` cursors (`pull_cursor_<uid>_<table>` in sync_meta) + ±5s overlap window + `.range()` pagination PAGE_SIZE=500 until short page | Delta pulls avoid re-downloading everything each cycle; overlap guards boundary/clock drift; per-user keys prevent cross-account contamination on account switch; mid-loop abort never advances the cursor | Full pull of every table each cycle | Fixed FK-order walk users→…→media keeps parent rows present before children |

No prior decision has been reversed. Any future reversal must be recorded here with its reason.

---

## 7. Changes

Chronological log (dates inferred from migration filenames/artifacts; no git history exists):

- **≤ 2026-08-20 (approx.)** — Documentation baseline: `tazkerat-altaleb-prd.md` v2.0, `AGENTS.md`, `tasks.md`.
- **~2026-08-21** — Foundation (M1): Vite/React/TS scaffold; Tailwind v4; PWA plugin + manifest + icons (`scripts/generate-icons.mjs`); Arabic fonts; glyph checker; Dexie schema; domain types; hand-created `supabase/config.toml`; initial SQL migration + revert; operator docs. Architectural pull-forward: RLS deny-by-default moved into M1.
- **~2026-08-22** — Auth & onboarding (M2): six screens + routing/guards/form primitives/validators; `AuthProvider` incl. recovery RPC; Supabase client (PKCE, fail-fast env); sync helpers + vitest spec; M2 SQL migration (users RLS, email/created_at freeze, seed function, signup trigger, recovery RPC) + revert; rebuild into `dist/` (current bundle `index-SytsEip0.*`); `preview.log` records a successful `vite preview` run on `http://localhost:4173`.
- **2026-08-23** — Project-state audit via direct inspection; this `PROJECT_STATE.md` created. No application files modified.
- **2026-08-23 (later)** — M1 live verification session: created `.env.local` placeholders (gitignored) so the shell boots; `glyphs` PASS / `typecheck` / `lint` / `test` (4/4) clean; fresh production build; served `dist/` via `vite preview :4173`; browser-verified SW activated, manifest fields, 3 icons 200; offline reload rendered the full login shell from precache (also confirming ProtectedRoute redirect to `/login`); Lighthouse A11y 100 / Best Practices 100 / SEO 91. Added Arabic `meta[name=description]` to `index.html` (SEO 82→91); remaining Lighthouse failures (`robots.txt`, `llms.txt`) deferred as hosting concerns. `tasks.md` M1 verification line updated with evidence. Preview server stopped after session.
- **2026-08-24** — M3 closeout session: hierarchy CRUD screens existed from earlier same-day work (nested routing, shared `EntityDialog`/`ConfirmDeleteDialog`, delete-blocking child-count checks); added `src/lib/entity-crud.spec.ts` with `fake-indexeddb` devDependency bringing the suite to 22/22 across 3 files; typecheck + lint green; M3 RLS migration (+revert) confirmed in-repo with cloud push deferred by owner decision (D14); docs reconciled — `tasks.md` M3 boxes ticked + evidence blockquote, `docs/supabase-setup.md` §7 rewritten as a migration log covering all three migrations, this file updated (K4/K5 resolved). Split commits planned.
- **2026-08-24 (later)** — Live E2E smoke test executed (browser against `vite preview` :4173, real Supabase project — see new Completed row); SignupScreen stuck-spinner defect discovered and fixed with an authenticated-user redirect guard (D15); gates re-run green (typecheck / lint / 22 tests / build); three split commits created (`8f6a9e6` migration, `f793644` app incl. fix, `87c4788` docs).
- **2026-08-25** — M4 closeout session: notes data layer delivered (`arabic-text.ts`, `note-text.ts`, `note-crud.ts` mirroring the entity-crud pipeline with row + links + outbox in one Dexie transaction; deleteNote removes outgoing AND incoming edges) plus specs growing the suite to 58/58 across 6 files; editor UI (`wiki-autocomplete.tsx`, `note-editor.tsx`, `NoteEditorScreen.tsx` on `/notes/*` routes) and entry points per D17 (book-notes section on LecturersScreen, per-row affordances on LecturesScreen, BooksScreen reverted untouched); knowledge graph via newly added dependency `react-force-graph-2d@1.29.1` (D16). Two defects found and fixed during live verification: graph mount defect (ResizeObserver attached while the loading branch hid the container → always-rendered container + eager `measure()`) and title markup pollution (`extractTitle` now sanitizes wiki-link markup to display text — D18). Security changes: M4 notes/note_links RLS policies added in `20260825000001_m4_notes_rls.sql` (+revert) — repo-only until cloud push runs (continuation of D14). Gates re-run green after final fixes: typecheck + lint clean, glyphs PASS, 58/58 tests, production build OK.
- **2026-08-25 (later)** — M5 sync-engine build-out: conflict-guard migration `20260825000002_m5_sync_conflict_guard.sql` (+revert; PRD §7 note, setup-docs §4/§7 entries); `sync-serialize.ts` (+17-test spec, closes K3 via D19); OutboxEntry extended with attempts/next_attempt_at/last_error; engine trio `sync-push.ts` / `sync-pull.ts` / `sync-engine.ts` wired via debounced ~3s cycle from queueOutbox and AuthProvider start/stop. Suite grew to 113/113 across 10 files; typecheck + lint clean. Reviewer pass found and fixed: F1 payload not serialized on push path, F3 pagination truncation, F6 link atomicity, F7 notify recursion. Repo-only until cloud push (K2 — concrete blocker narrowed to a missing access token needing human `npx supabase login`); remote-delete non-propagation gap recorded as K10.
- **Dependencies:** `fake-indexeddb` (dev), `supabase` CLI (dev), and `react-force-graph-2d@^1.29.1` (runtime, M4 graph). **API:** none beyond Supabase client config. **Security changes:** RLS enabled day-one; `users` owner-row policies + immutable-column freeze trigger added in M2 migration; hierarchy `<table>_<op>_own` policies for categories/books/lecturers (+ transitive lectures ownership) added in M3 migration; notes/note_links `<table>_<op>_own` policies (+ same-user link-target guard) added in M4 migration; sync-conflict guard trigger `assert_sync_version()` on all six mutable tables + media added in M5 migration — all repo-only until cloud push runs (D14 continuation).

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
| K1 | Repo is **not a git repository** (no `.git`) despite `.gitignore` existing — no history or backup | High | **Resolved** (repo initialized — branch `main` tracks `origin/main`) |
| K2 | Hosted Supabase project `pyvskirousshlwsqtoro` exists but has **no migrations applied** — proven 2026-08-25 live: categories insert → 403 RLS deny-by-default, and the server-side demo seed runs yet is invisible to clients. All M1–M5 migrations/policies/guards remain repo-only until push. Concrete blocker narrowed 2026-08-25: the Supabase CLI now works locally (devDependency v2.115.0 — the earlier GitHub-throttle issue is moot), but no access token exists on the machine (`npx supabase projects list` fails LegacyPlatformAuthRequiredError); requires human `npx supabase login`. Real credentials confirmed present in the bare `.env` (`.env.local` held placeholders only — since deleted, see K12) | High | **Resolved 2026-08-25** (all five migrations pushed; evidence: migration list remote ✓ ×5, REST smoke 200 [], signup smoke immediate-session + seed rows present) |
| K3 | Naming mismatch: TypeScript `CloudNote.type`/`CloudMedia.type` vs SQL columns `note_type`/`media_type` (`src/types/models.ts` vs initial schema). Mapping implicit; future sync serializer must translate explicitly or inserts will fail | Medium | **Resolved 2026-08-25** (D19 — explicit serializer mapping in `src/lib/sync-serialize.ts`; see §3) |
| K4 | `tasks.md` stale: all M2 checkboxes unticked although the M2 migration and all auth screens verifiably exist | Medium | Resolved 2026-08-24 (M2 boxes ticked earlier same day; M3 boxes ticked with evidence blockquote during doc reconciliation) |
| K5 | `docs/supabase-setup.md` §7 outdated: lists only the initial migration and states RLS "بدون سياسات بعد", ignoring the 2026-08-22 M2 policies | Medium | Resolved 2026-08-24 (§7 rewritten as a migration log covering initial/M2/M3 + reverts) |
| K6 | `supabase/config.toml` auth URLs are localhost-only; production site_url/redirect URL set undefined until a host is chosen. The Management API no longer accepts a `redirect_urls` field — workaround applied 2026-08-25: `uri_allow_list` set for the localhost dev origins; production URLs will go through the dashboard UI / allow-list | Medium | Open |
| K7 | Stray root file `index_out.html`: stale copy of an older built `index.html` referencing hashed assets (`index-DVK5C-sT.js`) absent from current `dist/` (`index-SytsEip0.js`) | Low | Open (housekeeping) |
| K8 | No `README.md` although `tasks.md` M10 schedules one | Low | Open (planned) |
| K9 | PRD §7 listings omit implementation-required columns (`updated_at` everywhere, `version` on several tables). Implementation follows AGENTS.md sync model; PRD tables incomplete rather than contradictory | Low | Open (doc gap; AGENTS.md governs; M5 migration added a one-line note to PRD §7 for the conflict guard) |
| K10 | Remote deletes do not propagate between devices (reviewer finding F4): pull observes only existing rows — no tombstone mechanism — so a row deleted+pushed by device B survives as a clean ghost on device A, and push-side upsert can resurrect remotely-deleted rows. Local deletes DO propagate normally via the outbox. Needs product decision: soft-delete/tombstone column vs accept-for-MVP | Medium | Open (design gap; product decision needed) |
| K11 | Reviewer minors from the M5 pass: `sync-push.ts` ignores the count returned by `outbox.update(...)` when persisting attempt/backoff fields (cosmetic — the write itself succeeds), plus a minor typing nit in one sync-spec mock | Low | Open (cosmetic) |
| K12 | Stale gitignored root file `.env.local` (placeholder-only values) took Vite precedence over the real `.env`, breaking live builds — signup hit `placeholder.supabase.co` DNS failure until worked around | Low | **Resolved 2026-08-26** (file deleted during M5 closeout; `.env` and `.env.example` untouched) |

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

**Sync engine as implemented (M5, 2026-08-25):** `src/lib/sync-push.ts` drains the `outbox` strict-FIFO — it stops at the first unready/failed entry so order is never violated — and pushes via `upsert(onConflict:'id')` with payloads serialized through `toCloudRow` (`src/lib/sync-serialize.ts` maps `type`↔`note_type`/`media_type`, D19). A DB-level guard (`assert_sync_version()`, migration 20260825000002) rejects UPDATEs where NEW.version <= OLD.version (P0001 `SYNC_CONFLICT|<old_version>`); both that conflict and insert-time 23505 cause the client to adopt the server row (dirty=false), so equal-version ties resolve to server/first-writer (D20). Transient failures schedule exponential backoff (min(1000·2^(n−1),60000) ±20% jitter) persisted as `next_attempt_at`. `src/lib/sync-pull.ts` walks tables in FK order users→categories→books→lecturers→lectures→notes→media using per-user `updated_at` cursors (`pull_cursor_<uid>_<table>` in sync_meta) with a ±5s overlap window and 500-row `.range()` pagination until a short page (D21); dirty rows are never clobbered and clean rows are replaced only when incoming.version > local.server_version. Pulled notes have their derived `note_links` rebuilt atomically inside the same Dexie transaction (derivation-on-pull). `src/lib/sync-engine.ts` runs a single-flight runSyncCycle (pull→push, never throws outward) exposing SyncStatus {idle|syncing|error, pendingCount} via pub/sub with listener-throw isolation; triggers = online event, visibilitychange, a 30s interval, and one debounced ~3s cycle scheduled by queueOutbox on every local edit; AuthProvider starts/stops the engine on SIGNED_IN/sign-out. Open gap: no tombstone mechanism — remote deletes do not propagate between devices (K10).

**Demo template on first login (AGENTS.md; PRD §4.2):** seeded entirely in SQL (`seed_demo_template(uid uuid)` SECURITY DEFINER) from the post-signup trigger on `auth.users`; content = العقيدة → الأصول الثلاثة → الشيخ صالح الفوزان → المحاضرة الأولى + a sample `حفظ` note wired to SRS (`review_date = CURRENT_DATE`); editable and deletable.

**Note title derivation (AGENTS.md):** extracted from first non-blank line of `content` on every save; no title input; stored in `notes.title` for search/autocomplete/graph. The SQL seed mirrors this rule in pure SQL.

**Wiki-links (AGENTS.md):** typing `[[` opens an autocomplete popover of other note titles; insert as `[[note_id|display]]`; resolve `display` from current title at render time. `note_links` is DELETE+INSERT rebuilt in one transaction on every save — removed `[[` must vanish from the graph, no orphans.

**Arabic search normalization (AGENTS.md), applied to both query and indexed value in this order:** strip tashkeel → normalize hamza family (أ إ آ ٱ → ا) → drop definite article ال and prefixes و/ف/ب. Implement as generated/stored normalized columns (`title_norm`, `content_norm`) or consistent write+read normalization. Not yet implemented.

**SRS (AGENTS.md; PRD §5.2):** SM-2-inspired, simplified to three ratings سهل / متوسط / صعب; card mode shows one note at a time — no next card before rating; notes of type `حفظ` get scheduling priority over same-difficulty notes of other types via a priority column/sort key, not a query hack. Not yet implemented.

**Media freeze policy (AGENTS.md; PRD §5.4):** first upload sets `users.media_trial_started_at` (trial starts there, not at signup); after 30 days without Pro, existing media becomes read-only (downloadable/renderable) and new uploads are blocked at API layer via RLS + Storage policy; nothing deleted; Pro upgrade flow out of MVP scope. Not yet implemented.

**Sharing (AGENTS.md; PRD §5.5):** `notes.is_public` toggles visibility; public read path `/share/note_id` served by anon-role RLS policies scoped to `is_public = true` (and links whose source note is public); no signed URLs/Edge Functions/external services. Not yet implemented.

**RTL/UI conventions (AGENTS.md):** Arabic-first, default `dir="rtl"`, logical CSS properties (e.g., `margin-inline-start`); strip tashkeel in autocomplete/graph labels but keep it in note bodies; font must cover `ٱ`, `ﷲ`, `ى` (enforced by `scripts/check-glyphs.mjs`). Current UI complies (symmetric padding/logical classes in components).

**Agent-critical detail before modifying code:** TypeScript models expose field `type` where SQL columns are `note_type`/`media_type` (K3 — resolved 2026-08-25 via the explicit serializer `src/lib/sync-serialize.ts`, D19): route every local↔cloud boundary crossing through toCloudRow/toLocalRow rather than passing raw rows. RLS policies for `users`/hierarchy/notes exist in-repo but stay repo-only until `db push` (K2), so any new feature writing cloud rows still requires its RLS policy migration first.

---

## 12. Development Rules

Binding for any AI Agent editing this project:

1. **Tech stack is hard** (AGENTS.md): pure PWA, Supabase only, Dexie.js only, mandatory Service Worker. No Electron/Capacitor/Tauri/native shells; no other backend.
2. **Do not change architectural decisions silently.** Any reversal must be recorded in §6 (Decisions) with the reason and rejected alternative.
3. **Do not mark a task complete without verification** — evidence must exist in the repo (code, passing check, or executed test). Update `tasks.md` checkboxes only when actually done.
4. **Do not remove existing functionality without clear justification** recorded here.
5. **Update this file (`PROJECT_STATE.md`) after major achievements**, and keep `tasks.md`/docs from drifting behind reality (K4/K5 were resolved 2026-08-24; keep it that way).
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
- **2026-08-24 (approx.)** — M3 Content Hierarchy closeout: built hierarchy CRUD screens with nested routing (`CategoriesScreen` → `BooksScreen` → `LecturersScreen` → `LecturesScreen`), shared `EntityDialog`/`ConfirmDeleteDialog`, and delete-blocking child-count checks; wrote the `entity-crud.ts` mutation pipeline (`createEntity`/`updateEntity` stamping/bumping `version`, row + outbox entry in one Dexie transaction) and once-per-entry `touchBookOpened()`; authored M3 RLS migration (+revert) — cloud push deferred by owner decision (D14); added `src/lib/entity-crud.spec.ts` (fake-indexeddb devDependency) for a 22/22 suite with typecheck/lint green. Issue found: stale `tasks.md` checkbox claiming XOR CHECKs were undelivered (they shipped early in the initial migration). Docs reconciled same day: `tasks.md` M2/M3 boxes ticked + evidence blockquote, `supabase-setup.md` §7 migration log rewritten, K4/K5 closed. Next task: link/push migrations to a hosted Supabase project and verify policies live.
- **2026-08-25** — M4 Notes & Local Graph closeout: delivered notes data layer (`arabic-text.ts` stripTashkeel, `note-text.ts` extractTitle/parseWikiLinks, `note-crud.ts` with row + links + outbox in one Dexie transaction and incoming-edge cleanup on delete) + editor UI (`wiki-autocomplete.tsx` caret-tracked popover, `note-editor.tsx` derived-title/no-title-input editor, `NoteEditorScreen.tsx` on `/notes/new?book=|?lecture=` and `/notes/:noteId`) + entry points per D17 (book-notes section on LecturersScreen, per-row «+ ملاحظة»/«ملاحظات: N» on LecturesScreen, BooksScreen reverted untouched) + knowledge graph via new dependency `react-force-graph-2d@1.29.1` (D16). Authored M4 notes RLS migration (+revert), push deferred as D14 continuation. Suite reached 58 tests / 6 files; typecheck/lint/glyphs/build green. Issues found during live E2E verification against the real project: graph mount defect (ResizeObserver attached while the loading branch hid the container → canvas never rendered; fixed by always-rendered container + eager `measure()`, then pixel-verified) and title markup pollution (extractTitle now strips wiki-link markup to display text — D18); second finding proved K2 materially — hosted project has no migrations applied (categories insert → 403; server demo seed invisible to clients). Docs reconciled same day: `tasks.md` M4 boxes ticked + evidence blockquote, this file updated throughout. Next task: push all four migrations to the hosted project (now proven blocking) and begin M5 sync engine.
- **2026-08-25 (later)** — M5 Sync Engine build-out: authored conflict-guard migration `20260825000002_m5_sync_conflict_guard.sql` (+revert; shared `assert_sync_version()` BEFORE INSERT OR UPDATE on users/categories/books/lecturers/lectures/notes/media — note_links excluded per D10; P0001 `SYNC_CONFLICT|<old_version>` on NEW.version <= OLD.version; INSERT passthrough; idempotent + reversible; PRD §7 note + `docs/supabase-setup.md` §4/§7 migration-log entries); built `sync-serialize.ts` (+17-test spec) closing K3 via an explicit local↔cloud mapping layer (D19); extended OutboxEntry with attempts/next_attempt_at/last_error; built the engine trio — `sync-push.ts` (strict FIFO, auth gate, P0001+23505 conflict adoption in single Dexie transactions, jittered exponential backoff persisted as next_attempt_at), `sync-pull.ts` (FK-order walk, per-user updated_at cursors, 500-row pagination with cursor-safety on abort, ±5s overlap, dirty-row no-clobber guard covering last_opened_at, atomic notes+note_links rebuild), `sync-engine.ts` (single-flight runSyncCycle, SyncStatus pub/sub with subscriber-throw isolation, online/30s-interval/visibilitychange triggers with idempotent cleanup) — wired via a debounced ~3s cycle from queueOutbox and AuthProvider start/stop on SIGNED_IN/sign-out. Specs 15/13/10 (+17 serialize) grew the suite to **113 tests / 10 files passing**; typecheck + lint clean. Reviewer pass found and fixed F1 (payload not serialized on push path — regression-tested), F3 (pagination truncation), F6 (link atomicity), F7 (notify recursion risk). Not done / blocked: cloud push of migrations to hosted project `pyvskirousshlwsqtoro` (CLI works locally but no access token exists on the machine — needs human `npx supabase login`), live E2E sync verification against the hosted project (blocked by the above), auth redirect URLs still localhost-only (K6 unchanged), Google OAuth still disabled (needs Google client credentials from owner). New known issue recorded: remote deletes do not propagate between devices (F4 → K10, Medium, product decision needed). Docs reconciled: `tasks.md` M5 boxes ticked + evidence blockquote, this file updated throughout (D19–D21). Next task: run `npx supabase login` + push all five migrations (proven blocking), then live verification and M6 SRS.
- **2026-08-25 (latest) — Cloud push + live E2E sync session (M2/M5 closeout):** linked and pushed all five migrations to hosted project `pyvskirousshlwsqtoro` — remote migration list ✓ ×5 (K2 resolved), REST smoke `200 []`, fresh-signup smoke gave an immediate session with seed rows present; `uri_allow_list` set for the localhost dev origins (the Management API no longer accepts a `redirect_urls` field — folded into K6). Live E2E ALL PASS: fresh signup `e2e-m5b` pulled the seeded العقيدة chain ~40s post-signup WITHOUT manual reload (server-side seed proven by SQL row counts — closes the final M2 checkbox); offline-created row pushed with the cloud row matching the local id exactly; `books.last_opened_at` synced as an exact timestamp match; conflict adoption traced versions 1→8→9→15 (never decreasing); guard contract reproduced server-side via direct PATCH returning `SYNC_CONFLICT|15`. Two defects found & fixed en route: (a) false-green typecheck gate — the solution-style tsconfig.json compiled zero files under `-p` mode; script aligned to `tsc -b`, surfacing and fixing 24 TS errors (build green at `d193357`); (b) stale gitignored `.env.local` (placeholder-only) shadowed the real `.env` under Vite precedence, breaking live builds with `placeholder.supabase.co` DNS failures — `.env.local` deleted in the 2026-08-26 documentation closeout (real `.env` untouched). Docs reconciled: `tasks.md` M2 final checkbox evidence + M5 live-verification paragraph, this file updated throughout.

---

## 14. Open Questions

- Which deployment host will serve the production PWA (needed for real auth redirect URLs, K6)? Netlify/Vercel/Cloudflare Pages all listed as options in `docs/device-checklist.md` — no choice made yet. **Unknown.**
- Does a hosted Supabase project already exist, and if so, what is its state? **Answered:** `pyvskirousshlwsqtoro` exists and is proven empty of migrations (K2); awaiting access-token login + push.
- Should the app-level password minimum (6, mirroring the Supabase default per comment in `src/lib/validation.ts`) be raised, and will dashboard settings stay in lockstep?
- How should the sync serializer handle the `type` ↔ `note_type`/`media_type` mapping (K3)? **Resolved 2026-08-25** — D19 keeps TS names and maps explicitly at the sync boundary (`src/lib/sync-serialize.ts`).
- Post-MVP pricing items deliberately deferred per PRD §10: Lifetime plan price TBD; Google Drive storage alternative TBD. Confirm these remain out of scope.
- Is a git remote intended (GitHub/GitLab)? None configured.

---

## 15. Verification

**Verified during the 2026-08-23 audit (this documentation session):**
- Existence and content of every file listed in §10, read directly (source, SQL migrations incl. revert scripts, configs, docs, tests, scripts).
- Presence of both XOR CHECK constraints, deny-by-default RLS enablement, users RLS policies, seed/trigger/recovery functions in the two migrations.
- Consistency between `src/types/models.ts`, `src/lib/db.ts` and the SQL schema (with the documented `type` naming exception, K3).

**Verified live in the 2026-08-23 PWA session (same day):**
- `npm run glyphs` → PASS (all mandated glyphs in arabic subset); `npm run typecheck`, `npm run lint` clean; `npm run test` → 4/4 passed; `npm run build` succeeded (25 precache entries).
- Against `vite preview :4173` in Chrome: `navigator.serviceWorker.ready` resolved with SW `state=activated`, scope `/`; manifest fetched and validated (`dir=rtl`, `lang=ar`, `display=standalone`, `start_url=/`, theme `#1e6f50`, 3 icons); all icons HTTP 200 `image/png`.
- With network emulated **Offline**, full page reload rendered the complete login shell from SW precache and ProtectedRoute redirected `/` → `/login` — offline-first behavior confirmed.
- Lighthouse (desktop, navigation): Accessibility 100, Best Practices 100, SEO 91; failures only `robots.txt` + `llms.txt`.

**Verified during the 2026-08-25 M4 closeout session:**
- Gates re-run green after final fixes: `npm run typecheck` + `npm run lint` clean; `npm run glyphs` → PASS; `npm run test` → **58 tests / 6 files passing** (22 pre-existing + 36 new across arabic-text 8 / note-text 21 / note-crud 7); `npm run build` succeeded with a pre-existing >500 kB chunk warning for the graph bundle (lazy-load deferred to M10).
- Live E2E against `vite preview :4173` with real Supabase project `pyvskirousshlwsqtoro`: full note lifecycle passed — signup → hierarchy created via UI → two book-notes → `[[` autocomplete insertion verbatim (`[[c0a83c51…|ملاحظة الاختبار الثانية]]`) → save → IndexedDB edge present → token removed → save → edge gone with no orphans; version 1→2→3 with dirty=true; tashkeel preserved in note bodies; outbox accumulated exclusively `table_name='notes'`. Lecture-note flow: «ملاحظات: 0»→«ملاحظات: 1».
- Graph rendering pixel-verified after fixing the mount defect found live (ResizeObserver attached while the loading branch hid the container → canvas never rendered; fixed by always-rendered container + eager `measure()`): nodes #1e6f50/#57a97b, edge hairline #ccd6d0, zoomToFit applied.
- Second live finding proved K2 materially: the hosted project has NO migrations applied — categories insert → 403 RLS deny-by-default; the server-side demo seed runs but is invisible to clients.
- **NOT performed:** cloud-side checks — RLS policy application/verification on the hosted project and any cloud push remain pending D14 continuation.

**Verified during the 2026-08-25 M5 build-out session:**
- `npm run test` → **113 tests / 10 files passing** — composition: 55 new (sync-serialize 17, sync-push 15, sync-pull 13, sync-engine 10) on top of the 58 pre-existing (arabic-text 8, note-text 21, note-crud 7, entity-crud 9, xor-guards 9, sync-helpers 4); `npm run typecheck` + `npm run lint` clean.
- Mocked integration coverage exercised by the new suites: conflict adoption on both paths (P0001 `SYNC_CONFLICT` update-guard + insert-time 23505 → client adopts server row, dirty=false, single Dexie transaction per finalize/adopt); tie-break (server guard rejects `<=`, so equal versions resolve to server/first-writer); strict-FIFO stop at first unready/failed entry; `.range()` pagination until short page with cursor never advanced on mid-loop abort; atomic rollback of the notes+note_links rebuild transaction; SyncStatus subscriber-throw isolation; offline → edit → runSyncCycle → upsert flow.

**Verified live in the 2026-08-25 M5 sync session:**
- Gates: production build green at `d193357` after fixing 24 TypeScript errors surfaced by aligning the typecheck script to `tsc -b` (root cause: the solution-style tsconfig.json compiled zero files under `-p` mode = false-green gate); `tsc -b` / `npm run typecheck` (= `tsc -b`) / `npm run lint` clean; suite **113/113 across 10 files**.
- Cloud state: all five migrations applied remotely (migration list remote ✓ ×5 — K2 resolved); REST smoke returned `200 []`; fresh-signup smoke produced an immediate session with seed rows present; `uri_allow_list` set for the localhost dev origins.
- Live E2E steps A–F ALL PASS: fresh-signup pull surfaced the seeded العقيدة chain WITHOUT manual reload (~40s post-signup); offline-created row pushed with the cloud row matching the local id exactly; `books.last_opened_at` synced as an exact timestamp match (no clobbering); conflict adoption traced version trajectory **1→8→9→15 (never decreasing)**; guard contract reproduced server-side via a direct PATCH returning `SYNC_CONFLICT|15`.

**NOT performed / not claimable (as of the 2026-08-26 closeout):**
- Physical-device Add-to-Home-Screen tap-through on iOS Safari / Android Chrome — requires real hardware + HTTPS host (`docs/device-checklist.md` table remains unchecked). Everything automatable about installability has passed.
- Google OAuth sign-in flow — provider disabled pending owner client credentials, therefore untested live.
- Remote-delete propagation between devices (K10 design gap) and multi-device concurrency beyond the single scripted conflict scenario of steps A–F.
- Production-origin configuration (K6): site_url/redirect URLs for a real host, and re-verification of auth flows with email confirmation enforced (`mailer_autoconfirm` revisit).

