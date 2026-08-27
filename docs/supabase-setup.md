# إعداد Supabase — تذكرة الطالب

دليل تشغيل قاعدة البيانات للمشروع: إنشاء مشروع مستضاف، ربط الـ CLI، وتطبيق الترحيلات (migrations).

---

## 1. المتطلبات المسبقة

- حساب على [supabase.com](https://supabase.com) (الخطة المجانية تكفي).
- **Supabase CLI** مثبت محلياً:

```bash
npm i -g supabase
```

> ملاحظة: حزمة npm تنزّل ثنائياً (binary) بحجم ~57MB من GitHub. إذا كانت شبكتك بطيئة تجاه GitHub، نزّل الملف `supabase_windows_amd64.tar.gz` يدوياً من صفحة إصدارات `github.com/supabase/cli/releases` وفُك الضغط في مجلد موجود ضمن `PATH` (مثل `%USERPROFILE%\.local\bin`).

- **Docker Desktop** (اختياري — فقط لتشغيل قاعدة بيانات محلية عبر `supabase start` / `supabase db reset`). بدون Docker يمكنك العمل مباشرة مع المشروع المستضاف.

## 2. إنشاء مشروع مستضاف (Hosted Project)

1. سجّل الدخول إلى supabase.com واضغط **New project**.
2. اختر اسماً مثل `tazkerat-altaleb` وكلمة مرور لقاعدة البيانات (احفظها).
3. اختر المنطقة الأقرب لمستخدميك.
4. بعد الإنشاء، ستحتاج قيمتين من **Project Settings → API**:
   - `Project URL`
   - `anon public` key

## 3. تهيئة المشروع المحلي وربطه

من جذر المستودع:

```bash
# تسجيل الدخول (يفتح المتصفح)
supabase login

# ربط مجلد supabase/ المحلي بمشروعك المستضاف
# <ref> = المعرف الموجود في Project Settings → General → Reference ID
supabase link --project-ref <ref>
```

ملف `supabase/config.toml` موجود بالفعل (`project_id = "tazkerat-altaleb"`). إذا أردت إعادة توليده بالكامل:

```bash
supabase init   # اقبل الإعدادات الافتراضية
```

## 4. تطبيق الترحيلات على السحابة

```bash
supabase db push
```

سيطبّق كل ملفات `supabase/migrations/*.sql` بالترتيب، منها:

```
20260821000001_initial_schema.sql
20260822000001_m2_auth_onboarding.sql
20260824000001_m3_hierarchy_rls.sql
20260825000001_m4_notes_rls.sql
20260825000002_m5_sync_conflict_guard.sql
20260826000001_m6_srs_scheduler.sql
20260827000001_m7_media_storage.sql
20260828000001_m8_sharing_anon.sql
20260829000001_m9_dashboard_search.sql
20260830000001_m10_observability.sql
```

لكل ترحيل نسخة تراجع مقابل في `supabase/migrations/revert/<اسم_الملف>.down.sql`. للتراجع يدوياً عند الحاجة (مثال — الترحيل الأول):

```bash
psql "$DATABASE_URL" -f supabase/migrations/revert/20260821000001_initial_schema.down.sql
```

## 5. التطوير المحلي (يتطلب Docker)

```bash
supabase start     # يشغّل Postgres + Auth + Storage + Studio محلياً
supabase db reset  # يعيد بناء القاعدة المحلية من migrations + seed
supabase stop      # إيقاف الحاويات
```

Studio المحلي متاح على `http://localhost:54323`.

## 6. متغيرات البيئة للتطبيق (Vite)

أنشئ ملف `.env.local` في جذر المشروع (لا ترفعه إلى Git):

```env
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-public-key>
```

المصدر:
- `VITE_SUPABASE_URL` ← **Project Settings → API → Project URL**
- `VITE_SUPABASE_ANON_KEY` ← **Project Settings → API → Project API keys → anon / public**

> مفتاح `anon` آمن للواجهة الأمامية فقط بشرط تفعيل RLS — وهو مفعّل على كل الجداول منذ الترحيل الأول؛ سياسات M2/M3/M4 (جدول `users` + التسلسل الهرمي + الملاحظات والروابط) موجودة في ملفات الترحيل داخل المستودع، وطبّقها على مشروعك عبر `supabase db push` قبل الاستخدام (انظر §7).

## 7. ما الذي تنشئه الترحيلات؟ (سجل الترحيلات)

### 1) `20260821000001_initial_schema.sql` — الترحيل الأول
التراجع: `revert/20260821000001_initial_schema.down.sql`

- نوع `note_type`: `benefit | rule | question | commentary | memorization`.
- 8 جداول: `users, categories, books, lecturers, lectures, notes, note_links, media`.
- قاعدتا XOR كقيود CHECK:
  - `notes_book_xor_lecture`: `book_id` أو `lecture_id` — واحد فقط أو لا شيء.
  - `media_note_xor_lecture`: `note_id` أو `lecture_id` — واحد فقط أو لا شيء.
- مشغّل `updated_at` تلقائي على الجداول السبعة القابلة للتعديل.
- فهارس على كل أعمدة FK + `(user_id, review_date)` + `last_opened_at DESC`.
- RLS مفعّل على الجميع بدون سياسات عند إنشاء هذا الترحيل (deny-by-default) — السياسات أُضيفت لاحقاً في ترحيلي M2 وM3 أدناه.

**انحراف مقصود عن PRD §7:** عمود النوع اسمه `notes.note_type` و `media.media_type` بدل `type` — لتجنب الالتباس مع كلمات SQL في بعض الأدوات، ومطابق لنماذج التطبيق.

### 2) `20260822000001_m2_auth_onboarding.sql` — المصادقة والتهيئة الأولى
التراجع: `revert/20260822000001_m2_auth_onboarding.down.sql`

- سياسة RLS على جدول `users`: قراءة/تحديث صف المالك فقط لـ `authenticated`.
- مشغّل BEFORE UPDATE يجمّد عمودي `email` و`created_at` ضد تحديثات المالك.
- دالة `seed_demo_template(uid uuid)` بـ SECURITY DEFINER + مشغّل ما بعد التسجيل `tazkerat_on_auth_user_created` (يزرع القالب التجريبي للمستخدم الجديد).
- إجراء الاسترداد `ensure_demo_seed()` ممنوح لدور `authenticated`.

### 3) `20260824000001_m3_hierarchy_rls.sql` — RLS التسلسل الهرمي
التراجع: `revert/20260824000001_m3_hierarchy_rls.down.sql`

- سياسات RLS باسم `<table>_<op>_own` لكل عملية (SELECT/INSERT/UPDATE/DELETE) على `categories` و`books` و`lecturers`: ملكية الصف عبر `user_id = auth.uid()`، مع تأكيد ملكية الجد الأب أيضاً في INSERT/UPDATE.
- ملكية `lectures` متعدِّية عبر المسار `lecturers → books` (المحاضرة مملوكة لمن يملك الكتاب الذي تتبع له المحاضر).
- تبقى `notes` و`note_links` و`media` عمداً دون سياسات (deny-by-default) حتى مراحلها اللاحقة.

> ✅ يُطبّق عبر `supabase db push` مع بقية الترحيلات (كان مؤجَّلاً بقرار D14 حتى تسوية الربط).

### 4) `20260825000001_m4_notes_rls.sql` (2026-08-25) — RLS الملاحظات والروابط
التراجع: `revert/20260825000001_m4_notes_rls.down.sql`

- سياسات RLS باسم `<table>_<op>_own` لكل عملية على `notes`: ملكية الصف عبر `user_id = auth.uid()` مع تأكيد ملكية الأب في كل العمليات — كتاب مباشرةً عبر `books.user_id`، أو محاضرة عبر المسار المتعدي `lectures → lecturers → books`، أو ملاحظة مستقلة بلا أب (`book_id` و`lecture_id` معاً NULL — مسموح).
- سياسات على `note_links`: الملكية مشتقة من ملاحظة المصدر عبر ربط `source_note_id` بـ `public.notes.user_id = auth.uid()`، ويضيف INSERT وUPDATE شرط وجود ملاحظة الهدف وانتمائها لنفس المستخدم (دفاع متعمق ضد إنشاء روابط عابرة للمستخدمين — قيود FK تضمن الوجود لا نفس الملكية).
- تبقى `media` عمداً دون سياسات (deny-by-default) حتى مرحلتها اللاحقة.
- الدفع إلى السحابة ما زال مؤجَّلاً (استكمال قرار D14) — السياسات تسري فقط عند تطبيق الترحيلات على مشروع مستضاف.

### 5) `20260825000002_m5_sync_conflict_guard.sql` (2026-08-25) — حارس تعارضات المزامنة
التراجع: `revert/20260825000002_m5_sync_conflict_guard.down.sql`

- دالة مشتركة `assert_sync_version()` مُرفقة كمشغّل BEFORE INSERT OR UPDATE باسم `trg_<table>_version_guard` على الجداول القابلة للتعديل السبعة فقط (`users, categories, books, lecturers, lectures, notes, media`).
- على UPDATE: أي كتابة بـ `version` لا تتجاوز الحالية (`NEW.version <= OLD.version`) تُرفض بخطأ `SYNC_CONFLICT|<server_version>` برمز `P0001` — يفوز أعلى إصدار دائماً، والتعادل (إصدار متساوٍ) يُحسم لصالح الصف الموجود على الخادم (first-writer wins)، ويقرأ عامل الدفع في العميل رسالة الخطأ لمعرفة إصدار الخادم.
- على INSERT: لا مقارنة ممكنة (لا صف قديم) — يمر بصمت، وتبقى بذور `seed_demo_template()` بالإصدار الافتراضي 1 غير متأثرة.
- `note_links` مستبعدة عمداً (بيانات مشتقة تُعاد بناؤها من `notes.content` — قرار D10)؛ الترحيل قابل لإعادة التشغيل وقابل للتراجع بالكامل.

### 6) `20260827000001_m7_media_storage.sql` (2026-08-27) — الوسائط وتجميد التجربة
التراجع: `revert/20260827000001_m7_media_storage.down.sql`

- عمود `public.media.duration_seconds int CHECK (1..300)` nullable — للـ audio فقط (NULL للصور)، يضمن حد 5 دقائق على مستوى قاعدة البيانات.
- دالتان: `media_trial_is_open()` (SECURITY DEFINER, تقرأ `users.media_trial_started_at` وتُرجع true إذا NULL أو now()-started < 30 يومًا) و`set_media_trial_started_at()` (BEFORE INSERT ON media, تطبَع `now()` في `users.media_trial_started_at` إذا كانت NULL — التجربة تبدأ عند أول رفع).
- حزمتان خاصتان: `media-images` و`media-audio` (private, حد 10 ميغابايت، أنواع MIME محددة).
- سياسات RLS على `public.media`: select دائمًا للمالك، insert/update/delete مشروطة بـ `media_trial_is_open()` + ملكية الأب (عبر notes أو lectures→lecturers→books) — التجميد = read-only بعد 30 يومًا (اشتراك Pro خارج MVP).
- سياسات Storage على `storage.objects`: insert/update/delete مشروطة بنفس النافذة + `foldername(name)[1]=auth.uid()` (المسار `<uid>/<mediaId>.<ext>`), select دائمًا للمالك — الرفع محظور بعد التجربة لكن التحميل/العرض يبقى.

### 7) `20260828000001_m8_sharing_anon.sql` (2026-08-27) — المشاركة العامة (anon)
التراجع: `revert/20260828000001_m8_sharing_anon.down.sql`

- سياسة `notes_select_public_anon` لدور `anon`: `FOR SELECT USING (is_public = true)` — القراءة العامة للملاحظات المميزة عامة فقط، بدون كتابة (read-only).
- سياسة `note_links_select_public_anon` لدور `anon`: مرئية فقط عندما تكون الملاحظة المصدر عامة (`EXISTS notes WHERE id=source_note_id AND is_public=true`) — الهدف قد يكون خاصًا (الصف نفسه غير مرئي لكن الحافة تراها المشاركة العامة).
- لا مسار عام للـ `media` في MVP — يبقى `authenticated`-only.

### 8) `20260829000001_m9_dashboard_search.sql` (M9) — لوحة التحكم والبحث المطبّع
التراجع: `revert/20260829000001_m9_dashboard_search.down.sql`

- دالة `public.normalize_ar(text) IMMUTABLE` بالترتيب: إزالة التشكيل (U+064B–U+065F + U+0670) → توحيد الهمز (أإآٱ→ا) → إسقاط `ال` والزوائد `و/ف/ب` طبقة واحدة، مع حارس طول (الباقي ≥ 2) — مطابقة لـ `src/lib/arabic-text.ts:normalizeArabic`.
- عمودان مولّدان مخزّنان على `public.notes`: `title_norm` / `content_norm` بصيغة `GENERATED ALWAYS AS (normalize_ar(col)) STORED` — غير قابلين للكتابة يدوياً، فلا يمسّان حارس `version` (M5).
- امتداد `pg_trgm` + فهارس GIN ثلاثية `idx_notes_title_norm_trgm` / `idx_notes_content_norm_trgm` وفهارس btree لكل مستخدم `idx_notes_user_title_norm` / `idx_notes_user_content_norm` — تدعم `ILIKE %needle%` عبر REST وواجهة البحث المحلية.

### 9) `20260830000001_m10_observability.sql` (M10 — 2026-08-27) — المراقبة السحابية فقط
التراجع: `revert/20260830000001_m10_observability.down.sql`

- جدولان: `analytics_events (user_id, event, props, created_at)` و `error_reports (user_id, message, stack, context, created_at)` مع فهارس `(user_id, created_at DESC)`؛ RLS `authenticated` فقط (كتابة/قراءة صف المالك، و`anon` يمكنه إدراج تقرير خطأ بدون user_id). لا Edge Functions. الاحتفاظ طبقة استعلام (`created_at > now()-30d`).
