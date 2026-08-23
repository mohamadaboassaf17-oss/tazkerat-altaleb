# AGENTS.md

Greenfield PWA SaaS for Islamic-studies students. Read `tazkerat-altaleb-prd.md` first — it is the source of truth. This file only captures rules an agent would otherwise miss.

## Hard tech stack (do not substitute)

- **Pure PWA.** No native shell, no Electron, no Capacitor, no Tauri.
- **Supabase** for Auth, PostgreSQL, Storage, and RLS. Nothing else for backend.
- **Dexie.js** over IndexedDB for local persistence. Reads/writes hit local first; cloud sync is async.
- **Service Worker** is mandatory — required for install prompt on iOS Safari and Android Chrome and for the offline shell.
- No payment provider in MVP. The only monetized path is Pro media storage (post-MVP).

## Domain hierarchy (enforce at the DB, not just in app code)

```
Category → Book → Lecturer → Lecture
Note      (hangs off Book XOR Lecture)
Media     (hangs off Note XOR Lecture)
```

Two XOR rules — implement as `CHECK` constraints or triggers, not as UI guards:

- `notes.book_id` and `notes.lecture_id`: exactly one set, or both null.
- `media.note_id` and `media.lecture_id`: exactly one set, or both null.

## Non-obvious product rules

- **Demo template on first login.** New users get a pre-seeded `العقيدة → الأصول الثلاثة → الشيخ صالح الفوزان → المحاضرة الأولى` plus a sample `حفظ`-style note already wired to SRS and the graph. It is editable and fully deletable. Seed it in a single SQL function called from the post-signup trigger, not in client code.
- **Note title is derived.** Extract from the first non-blank line of `content` on every save. Do not show a title input. Store the extracted title in `notes.title` for search, autocomplete, and the graph.
- **Wiki-links `[[`.** Typing `[[` opens an autocomplete popover of other note titles. Insert as `[[note_id|display]]` and resolve `display` from the current title at render time — titles change, IDs do not.
- **`note_links` is rebuilt on every save.** Parse `content` for `[[…]]`, then `DELETE` + `INSERT` in one transaction. Do not diff incrementally. A removed `[[` must disappear from the graph on next save, no orphans.
- **Arabic search normalization.** Apply on both query and indexed value, in this order:
  1. Strip tashkeel (ً-ْ ٰ ٌ ٍ ُ ِ َ ٓ etc.).
  2. Normalize hamza family: أ إ آ ٱ → ا.
  3. Drop definite article ال and common prefixes و / ف / ب.
  Add a generated/stored normalized column (`title_norm`, `content_norm`) or normalize on write+read consistently — pick one and apply it everywhere.

## Sync model

- Every mutable row carries `version: int`. Increment client-side on every local edit.
- Push wins by **highest `version`**, not by timestamp. Clock skew is assumed.
- `note_links` has no conflict path — it is always derived from `notes.content`.

## SRS

- SM-2 inspired, simplified to three ratings: سهل / متوسط / صعب.
- Card mode: one note at a time. Do not show the next card before the current one is rated.
- Notes of type `حفظ` get a scheduling boost: they surface before same-difficulty notes of other types on the same review date. Implement as a priority column or a sort key, not as a hack in the query.

## Media freeze policy

- First media upload sets `users.media_trial_started_at`. The 30-day trial starts here, not at signup.
- After 30 days without Pro: existing media becomes read-only (still downloadable, still renderable), new uploads blocked at the API layer via RLS + Storage policy. Nothing is deleted.
- Pro plan is post-MVP. In MVP, only enforce the freeze/block-new state — the upgrade flow itself is not in scope.

## Sharing

- `notes.is_public` toggles public visibility.
- Public read path: `/share/note_id`, served by an `anon`-role RLS policy. No signed URLs, no Edge Functions, no external services.
- RLS for `anon` must be scoped to `is_public = true` on `notes` and to links whose source note is public. Everything else stays `authenticated`-only.

## Auth

- Google OAuth + Email/Password only, both via Supabase Auth. No third-party identity provider.
- Email verification is required for the password flow. "Forgot password" uses Supabase's built-in.

## Dashboard

- Local knowledge map is centered on the most recently opened book (`books.last_opened_at`).
- Today's review list = `notes.review_date <= today`, ordered by SRS priority (type `حفظ` first, then by due date).
- "Recent 5" = 5 most recent by `created_at` (PRD says "أحدث 5 ملاحظات مسجلة" → registered/created, not edited).

## UI / RTL

- Arabic-first. Default `dir="rtl"`. Use logical CSS properties (`margin-inline-start`, not `margin-left`).
- Strip tashkeel in autocomplete labels and graph node labels to reduce visual noise. Keep tashkeel in the note body.
- Font choice must cover full Arabic + diacritics on iOS Safari and Android Chrome. Test with `ٱ`, `ﷲ`, and `ى` before shipping any font change.

## Export

- **Markdown** export: `notes.content` with `[[id]]` rewritten to `[[title]]`. One note or a whole category.
- **PDF** export: browser print pipeline (`window.print()` + a print stylesheet). No headless Chrome, no server-side renderer in MVP.

## What is explicitly out of scope

- Lifetime plan pricing (PRD §10 — TBD post-MVP).
- Google Drive as alternative storage (PRD §10).
- Native iOS/Android apps.
- Server-side compute beyond Supabase. No Edge Functions unless a PRD requirement forces one.
- Any feature that violates the "free forever for core" PLG model.

## Conventions when editing

- Schema change → update the matching table in `tazkerat-altaleb-prd.md` in the same commit.
- New cross-cutting rule → add it here, not in a code comment.
- Conflict between PRD and this file → PRD wins, this file gets updated.
- Migration files must be idempotent and reversible. Supabase CLI `supabase migration` only — no ad-hoc DDL.
