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

- [ ] Configure Supabase Auth: Google OAuth provider + email/password, set redirect URLs
- [ ] Build login / signup / password-reset screens, with email verification gate
- [ ] Write SQL function `seed_demo_template(uid uuid)` inserting العقيدة → الأصول الثلاثة → الشيخ صالح الفوزان → المحاضرة الأولى + a sample `حفظ` note
- [ ] Add post-signup trigger that calls `seed_demo_template` for new `auth.users` rows
- [ ] Write RLS policies for `users` table: own-row select/update for `authenticated`
- [ ] Verify fresh sign-up shows the seeded template immediately on first dashboard load

## M3 — Content Hierarchy

- [ ] CRUD UI for Category, Book, Lecturer, Lecture (nested navigation: categories → books → lecturers → lectures)
- [ ] Add the two XOR `CHECK` constraints at the DB level (`notes` and `media` tables)
- [ ] Increment `version` on every local edit before push
- [ ] RLS policies: `authenticated` can CRUD only their own rows on all four tables
- [ ] Update `books.last_opened_at` on book open (local write + queued push)
- [ ] Unit tests: cannot insert note with both `book_id` and `lecture_id` set; same for media

## M4 — Notes & Local Graph

- [ ] Note editor component (content + type selector)
- [ ] Title extraction on save: first non-blank line of `content` → `notes.title`
- [ ] `[[` autocomplete popover: live filter on other note titles, insert as `[[note_id|display]]`
- [ ] `note_links` rebuild on every save: parse `[[id]]` from content, `DELETE` old + `INSERT` new in one transaction
- [ ] Resolve `display` from current title at render time (handle title renames)
- [ ] Local knowledge graph: read Dexie, render nodes (notes) and edges (note_links), centered on notes attached to most recently opened book
- [ ] Strip tashkeel in graph node labels and autocomplete labels only
- [ ] Test: adding/removing `[[` reflects in graph on next save, no orphan edges

## M5 — Sync Engine

- [ ] Push queue: mark rows dirty on local edit, store in Dexie `outbox` table
- [ ] Push worker: send dirty rows with current `version`; on 409/conflict, compare server `version` and accept the higher one
- [ ] Pull worker: fetch rows where server `version > local_version`, upsert to Dexie
- [ ] Sync loop: trigger on `online` event, on user action, and on a debounced interval
- [ ] Exponential backoff + retry on transient errors
- [ ] Test offline → edit → reconnect → edit appears in cloud; concurrent edit → highest `version` wins
- [ ] `last_opened_at` flows through sync without clobbering newer values

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
