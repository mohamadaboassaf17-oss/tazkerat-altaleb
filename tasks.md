# Tasks — تذكرة الطالب

## M1 — Foundation

- [x] Scaffold PWA project (Vite + React + TypeScript + Workbox recommended), set up `npm run dev` / `build` / `lint` / `typecheck`
- [x] Create Supabase project, install Supabase CLI, initialize `supabase/` folder
- [x] Write initial migration with all 8 tables from PRD §7, including `version int default 1` on every mutable table
- [x] Install Dexie.js, define local schema mirroring the cloud tables (with `version` + `dirty` + `server_version` columns for sync)
- [x] Register Service Worker via Workbox, add `manifest.json` with icons + RTL `dir` + Arabic fonts covering `ٱ ﷲ ى`
- [x] Verify PWA installability — **automated (2026-08-23, Chrome desktop)**: SW active + precache offline shell renders full login screen with network emulated Offline; manifest valid (`dir=rtl`, `lang=ar`, `display=standalone`, theme `#1e6f50`, 3 icons incl. maskable all HTTP 200); Lighthouse Accessibility 100 / Best Practices 100 / SEO 91. **Residual manual step**: tap-through Add-to-Home-Screen on physical iOS Safari + Android Chrome per docs/device-checklist.md (requires real hardware + HTTPS host).

> ✅ Implemented: migration includes XOR CHECK constraints + RLS enabled deny-by-default early (originally planned M3/M2) — see supabase/migrations/20260821000001_initial_schema.sql

> ⚠️ Supabase CLI could not be installed on this machine (GitHub throttled); config.toml hand-created. Install manually per docs/supabase-setup.md before running `supabase db push`.

## M2 — Auth & Onboarding

- [x] Configure Supabase Auth: Google OAuth provider + email/password, set redirect URLs
- [x] Build login / signup / password-reset screens, with email verification gate
- [x] Write SQL function `seed_demo_template(uid uuid)` inserting العقيدة → الأصول الثلاثة → الشيخ صالح الفوزان → المحاضرة الأولى + a sample `حفظ` note
- [x] Add post-signup trigger that calls `seed_demo_template` for new `auth.users` rows
- [x] Write RLS policies for `users` table: own-row select/update for `authenticated`
- [x] Verify fresh sign-up shows the seeded template immediately on first dashboard load — **live E2E 2026-08-25:** fresh signup account `e2e-m5b` saw the seeded العقيدة chain via engine pull ~40s post-signup WITHOUT manual reload; server-side seed proven by SQL row counts

## M3 — Content Hierarchy

- [x] CRUD UI for Category, Book, Lecturer, Lecture (nested navigation: categories → books → lecturers → lectures)
- [x] Add the two XOR `CHECK` constraints at the DB level (`notes` and `media` tables)
- [x] Increment `version` on every local edit before push
- [x] RLS policies: `authenticated` can CRUD only their own rows on all four tables
- [x] Update `books.last_opened_at` on book open (local write + queued push)
- [x] Unit tests: cannot insert note with both `book_id` and `lecture_id` set; same for media

> ✅ Implemented (2026-08-24): CRUD screens + nested routing (`CategoriesScreen` → `BooksScreen` → `LecturersScreen` → `LecturesScreen`, wired in `App.tsx`), version/outbox pipeline in `src/lib/entity-crud.ts` (create stamps `version=1`/`dirty=true`, updates bump via `bumpVersion()`, row + outbox entry in one Dexie transaction; cloud push itself remains M5), and `touchBookOpened()` fired once-per-entry from LecturersScreen. RLS landed in `supabase/migrations/20260824000001_m3_hierarchy_rls.sql` (+revert) but is **pending cloud push**. Tests: `src/lib/xor-guards.spec.ts` + `src/lib/entity-crud.spec.ts` (adds `fake-indexeddb` devDependency) — full suite 22/22, typecheck + lint clean. Note: the two XOR `CHECK` constraints were already delivered early in `20260821000001_initial_schema.sql` (the checkbox above was stale); local unit coverage mirrors them in `src/lib/xor-guards.ts`.

## M4 — Notes & Local Graph

- [x] Note editor component (content + type selector)
- [x] Title extraction on save: first non-blank line of `content` → `notes.title`
- [x] `[[` autocomplete popover: live filter on other note titles, insert as `[[note_id|display]]`
- [x] `note_links` rebuild on every save: parse `[[id]]` from content, `DELETE` old + `INSERT` new in one transaction
- [x] Resolve `display` from current title at render time (handle title renames)
- [x] Local knowledge graph: read Dexie, render nodes (notes) and edges (note_links), centered on notes attached to most recently opened book
- [x] Strip tashkeel in graph node labels and autocomplete labels only
- [x] Test: adding/removing `[[` reflects in graph on next save, no orphan edges

> ✅ Implemented (2026-08-25): data layer in `src/lib/arabic-text.ts` (stripTashkeel U+064B–U+065F + U+0670), `src/lib/note-text.ts` (extractTitle sanitizes `[[target|display]]`→display text with whitespace collapse + line fallthrough + 'بدون عنوان' fallback — D18; parseWikiLinks dedups), `src/lib/note-crud.ts` (createNote/updateNote/deleteNote mirroring the entity-crud pipeline: version bump, row + links + outbox entry in ONE Dexie transaction; deleteNote removes outgoing AND incoming edges mirroring the cloud double CASCADE; zero `note_links` outbox entries = D10). Editor UI: `wiki-autocomplete.tsx` (caret-tracked `[[` popover, tashkeel-stripped matching, keyboard nav, inserts `[[uuid|title]]`, Arabic load-failure alert «تعذّر تحميل الاقتراحات», live-DOM insertion), `note-editor.tsx` (derived-title preview, NO title input, 5-type Arabic selector, empty-content guard), `NoteEditorScreen.tsx` (`/notes/new?book=`|`?lecture=` XOR-validated create mode, `/notes/:noteId` edit mode, delete via ConfirmDeleteDialog). Entry points per D17: book-notes section «الملاحظات المرتبطة بالكتاب» on LecturersScreen bound to `:bookId`; per-row «+ ملاحظة» + live count «ملاحظات: N» on LecturesScreen rows; BooksScreen reverted untouched. Graph: `react-force-graph-2d@1.29.1` (D16) on `/graph` route via GraphScreen — nodes colored per note type (حفظ solid #1e6f50) + legend, labels tashkeel-stripped/truncated 16 chars, edges filtered to existing endpoints, cluster centering = max `books.last_opened_at` with two-hop lecturers→lectures join (inner golden-angle ring vs outer ring), click node → editor. Tests: `arabic-text.spec.ts` (8) + `note-text.spec.ts` (21) + `note-crud.spec.ts` (7) on top of the 22 pre-existing — full suite 58/58 across 6 files, typecheck + lint clean, glyphs PASS, production build OK (pre-existing >500 kB chunk warning for the graph bundle; lazy-load deferred to M10). Live E2E against `vite preview` :4173 + real Supabase project passed: signup → hierarchy created via UI → two book-notes → `[[` autocomplete insertion verbatim → save → IndexedDB edge present → token removed → save → edge gone with no orphans → version 1→2→3 with dirty=true, tashkeel preserved in bodies, outbox exclusively `table_name='notes'`; lecture-note flow «ملاحظات: 0»→«ملاحظات: 1»; graph rendering pixel-verified after fixing a mount defect found live (ResizeObserver attached while the loading branch hid the container → fixed by always-rendered container + eager `measure()`). RLS landed in `supabase/migrations/20260825000001_m4_notes_rls.sql` (+revert) but is **pending cloud push** (continuation of D14).

## M5 — Sync Engine

- [x] Push queue: mark rows dirty on local edit, store in Dexie `outbox` table
- [x] Push worker: send dirty rows with current `version`; on 409/conflict, compare server `version` and accept the higher one
- [x] Pull worker: fetch rows where server `version > local_version`, upsert to Dexie
- [x] Sync loop: trigger on `online` event, on user action, and on a debounced interval
- [x] Exponential backoff + retry on transient errors
- [x] Test offline → edit → reconnect → edit appears in cloud; concurrent edit → highest `version` wins
- [x] `last_opened_at` flows through sync without clobbering newer values

> ✅ Implemented (2026-08-25): DB guard first — `supabase/migrations/20260825000002_m5_sync_conflict_guard.sql` (+revert): shared `assert_sync_version()` BEFORE INSERT OR UPDATE trigger on users/categories/books/lecturers/lectures/notes/media (note_links excluded — derived per D10); rejects UPDATE where NEW.version <= OLD.version via `RAISE EXCEPTION ERRCODE 'P0001' MESSAGE 'SYNC_CONFLICT|'||OLD.version::text`; INSERT path passthrough; idempotent + reversible; PRD §7 got a one-line note and `docs/supabase-setup.md` §4+§7 got the migration-log entry. Serialization: `src/lib/sync-serialize.ts` (+17-test spec) — explicit local↔cloud mapping resolving K3 (`notes.type`↔`note_type`, `media.type`↔`media_type`); throws on note_links (D10) and unknown tables; `OutboxEntry` extended with attempts/next_attempt_at/last_error (non-indexed, no Dexie schema change). Push (`src/lib/sync-push.ts`): strict-FIFO drain stopping at the first unready/failed entry; auth gate; `upsert(onConflict:'id')` with payload run through toCloudRow; delete idempotent; P0001-conflict AND insert-time 23505 both ADOPT the server row (dirty=false, one Dexie transaction per finalize/adopt); transient errors get backoffMs(attempts)=min(1000·2^(n−1),60000)±20% jitter persisted as `next_attempt_at`. Pull (`src/lib/sync-pull.ts`): fixed order users→categories→books→lecturers→lectures→notes→media; per-user cursor keys `pull_cursor_<uid>_<table>` in sync_meta; `.range()` pagination PAGE_SIZE=500 until short page (mid-loop abort never advances the cursor); ±5s overlap window gte; dirty rows NEVER clobbered, clean rows replaced only when incoming.version > local.server_version — which also covers the `last_opened_at` non-clobbering requirement; pulled notes + derived note_links rebuilt atomically in ONE transaction. Loop (`src/lib/sync-engine.ts`): single-flight runSyncCycle (pull→push, never throws outward); SyncStatus {idle|syncing|error, pendingCount} pub/sub (listener throw isolated); startSyncEngine() registers online + 30s interval + visibilitychange listeners with idempotent cleanup; wiring = queueOutbox schedules one debounced ~3s cycle, AuthProvider starts/stops the engine on SIGNED_IN/sign-out. Tests: sync-push 15 / sync-pull 13 / sync-engine 10 (+17 serialize) covering conflict adoption, tie-break (server wins equal versions), FIFO stop, pagination, atomicity rollback, subscriber-throw isolation, offline→edit→cycle→upsert flow — full suite **113 tests / 10 files passing**, typecheck + lint clean. Reviewer pass fixed F1 blocker (payload not serialized on push path), F3 pagination truncation, F6 link atomicity, F7 notify recursion. **Cloud-gated, not claimable**: migrations remain repo-only until a human runs `npx supabase login` (no access token exists on this machine; the CLI itself works locally as a devDependency), then `db push`; live E2E sync verification against the hosted project is therefore also pending. **Residual manual step for the two test boxes above**: the offline→edit→reconnect→cloud and concurrent-edit behaviors are verified by mocked integration specs only — live verification against the real Supabase project awaits the token + db push. Auth redirect URLs remain localhost-only (K6) and Google OAuth is disabled pending owner credentials.
>
> **Live verification (2026-08-25):** build green at `d193357` after fixing 24 TypeScript errors + typecheck script aligned to `tsc -b` (root cause: solution-style tsconfig.json compiled zero files under `-p` mode = false green). Live E2E ALL PASS: pull-without-reload; offline create → cloud row exact id match; `books.last_opened_at` exact timestamp match; conflict adoption version trajectory 1→8→9→15 never decreasing; guard contract reproduced via direct PATCH returning `SYNC_CONFLICT|15`. All five migrations applied remotely (K2 resolved); `uri_allow_list` set for localhost dev origins.

> ⚠️ Known design gap (reviewer finding F4): remote deletes do NOT propagate between devices — pull observes only existing rows (no tombstone mechanism), so a row deleted+pushed on device B survives as a clean ghost on device A, and push-side upsert can resurrect remotely-deleted rows. Local deletes propagate normally via the outbox. Needs a product decision (soft-delete/tombstone column vs accept-for-MVP) — recorded as an open Medium issue in PROJECT_STATE.md §9.

## M6 — SRS

- [ ] Implement SM-2-inspired scheduler (ease_factor, interval, repetitions, review_date) for three ratings: سهل / متوسط / صعب
- [ ] Card mode UI: show one note, wait for rating, then advance — no peek-ahead
- [ ] Build "today" queue query: `review_date <= today`, sorted by `حفظ` priority first, then due date
- [ ] Apply rating → update `review_date`, `ease_factor`, `interval`, `repetitions`
- [ ] Unit tests: scheduler math (e.g., سهل on first review = +1 day, +1 day, +6 days pattern)
- [ ] Test: a `حفظ` note due today surfaces before a same-difficulty `فائدة` note

## M7 — Media & Freeze Policy

- [ ] Create Supabase Storage buckets for audio and image, with 5-min audio cap
- [ ] On first successful upload, set `users.media_trial_started_at = now()` if null
- [ ] RLS policy on `media` insert: allow only if `now() - media_trial_started_at < 30 days` (or null, meaning first upload)
- [ ] Storage policy: new uploads blocked at 30-day boundary
- [ ] Freeze existing media after 30 days: read-only (still downloadable, still renderable), no replace/delete
- [ ] UI: trial countdown in settings, hide upload control after freeze, "Upgrade to Pro" placeholder (no payment flow in MVP)
- [ ] Test: simulate `media_trial_started_at` = 31 days ago → insert blocked, existing media still served

## M8 — Sharing & Export

- [ ] `is_public` toggle in note editor
- [ ] `/share/note_id` route: renders the note (and its outbound `[[]]` resolved) for `anon` users
- [ ] RLS policy for `anon` role on `notes`: select allowed only when `is_public = true`
- [ ] RLS policy for `anon` on `note_links`: select allowed only when the source note is public
- [ ] Markdown export: `notes.content` with `[[id]]` → `[[title]]`, one note or a whole category, downloaded as `.md`
- [ ] PDF export: `window.print()` with a dedicated print stylesheet, one note or a whole category
- [ ] Test: anon can read a public note, cannot read a private one, `[[]]` resolves to current titles

## M9 — Dashboard & Search

- [ ] Dashboard layout: progress stats, local knowledge map, today's review list, recent 5
- [ ] Local knowledge map centered on book with most recent `last_opened_at` (its subtree only), button to open full graph
- [ ] "Recent 5" = 5 most recent notes by `created_at`
- [ ] Search box with Arabic normalization: strip tashkeel → normalize hamza family → drop ال / و / ف / ب
- [ ] Add generated/stored `title_norm` and `content_norm` columns; normalize on write or read consistently
- [ ] Test: search `العقيدة` matches `عقيدة`, `بالعقيدة`, `العقيدةَ` (tashkeel variants)

## M10 — Production Hardening

- [ ] Verify all migrations are idempotent and reversible (`supabase migration up` / `down`)
- [ ] Accessibility pass: keyboard nav, focus rings, ARIA, RTL screen reader behavior
- [ ] Install prompt: trigger on second visit, dismissable, custom A2HS UI for both iOS and Android
- [ ] PWA manifest: full icon set, theme color, splash screens
- [ ] Performance: lazy-load graph, virtualize long note lists, code-split routes
- [ ] Error reporting and basic analytics wired up
- [ ] Update `README.md` and reconcile `AGENTS.md` with the final stack choices
