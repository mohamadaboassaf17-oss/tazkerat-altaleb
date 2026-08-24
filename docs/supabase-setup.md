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

> مفتاح `anon` آمن للواجهة الأمامية فقط بشرط تفعيل RLS — وهو مفعّل على كل الجداول منذ الترحيل الأول؛ سياسات M2/M3 (جدول `users` + التسلسل الهرمي) موجودة في ملفات الترحيل داخل المستودع، لكنها **لم تُطبَّق على أي مشروع مستضاف بعد** (انظر §7).

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

> ⚠️ **لم يُطبَّق هذا الترحيل بعد على أي مشروع Supabase مستضاف** — الدفع مؤجَّل بقرار من المالك حتى تسوية ربط المشروع (`supabase link` / `supabase db push`)، انظر PROJECT_STATE.md §6 D14.
