import { lazy, Suspense, useEffect, useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { stripTashkeel } from '../lib/arabic-text';

const KnowledgeGraph = lazy(() =>
  import('../components/knowledge-graph').then((m) => ({ default: m.KnowledgeGraph })),
);
import { useAuth } from '../lib/auth';
import { getProgressByCategory, getRecentNotes, getTodayQueue, type CategoryProgress } from '../lib/dashboard-queries';
import { useMediaTrial } from '../hooks/useMediaTrial';
import type { LocalNote } from '../types/models';

const TYPE_LABEL: Record<string, string> = {
  benefit: 'فائدة',
  rule: 'قاعدة',
  question: 'سؤال',
  commentary: 'تعقيب',
  memorization: 'حفظ',
};

function ProgressCard({ p }: { p: CategoryProgress }): ReactElement {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <p className="font-medium text-neutral-900">{p.categoryName}</p>
      <p className="mt-1 text-xs text-neutral-500">
        {p.booksCount} كتاب · {p.notesCount} ملاحظة · {p.lecturesCompleted}/{p.lecturesTotal} محاضرة
      </p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-100">
        <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${p.progressPct}%` }} />
      </div>
      <p className="mt-1 text-end text-xs text-neutral-500">{p.progressPct}%</p>
    </div>
  );
}

export default function DashboardScreen(): ReactElement {
  const { user } = useAuth();
  const trial = useMediaTrial();
  const [progress, setProgress] = useState<CategoryProgress[] | null>(null);
  const [todayQueue, setTodayQueue] = useState<LocalNote[] | null>(null);
  const [recent, setRecent] = useState<LocalNote[] | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function load(): Promise<void> {
      const [prog, queue, rec] = await Promise.all([
        getProgressByCategory(user!.id),
        getTodayQueue(user!.id),
        getRecentNotes(user!.id, 5),
      ]);
      if (!cancelled) {
        setProgress(prog);
        setTodayQueue(queue);
        setRecent(rec);
      }
    }
    void load();
    // Light refresh on visibility change (covers sync pull completion)
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [user]);

  const dueCount = todayQueue?.length ?? null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h2 className="mb-6 text-xl font-bold text-neutral-900">لوحة التحكم</h2>

      <div className="grid gap-5">
        {/* Progress stats */}
        <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 font-medium text-neutral-900">التقدم حسب القسم</h3>
          {progress === null ? (
            <p className="text-sm text-neutral-400">جارٍ التحميل…</p>
          ) : progress.length === 0 ? (
            <p className="text-sm text-neutral-500">لا توجد أقسام بعد — أنشئ قسمك الأول من تبويب التصنيفات.</p>
          ) : (
            <div className="grid gap-3">
              {progress.map((p) => (
                <ProgressCard key={p.categoryId} p={p} />
              ))}
            </div>
          )}
          <Link to="/categories" className="mt-3 inline-flex text-sm text-brand-700 hover:underline">
            إدارة التصنيفات ←
          </Link>
        </section>

        {/* Today's review list */}
        <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 font-medium text-neutral-900">مراجعة اليوم</h3>
          {todayQueue === null ? (
            <p className="text-sm text-neutral-400">جارٍ التحميل…</p>
          ) : todayQueue.length === 0 ? (
            <p className="text-sm text-brand-700">لا توجد مراجعات اليوم — أحسنت!</p>
          ) : (
            <>
              <p className="mb-3 text-sm text-neutral-600">لديك {todayQueue.length} مراجعة مستحقة</p>
              <ul className="mb-3 grid gap-2">
                {todayQueue.slice(0, 5).map((n) => (
                  <li key={n.id} className="flex items-center justify-between rounded-lg border border-neutral-100 bg-neutral-50 px-3 py-2">
                    <span className="text-sm text-neutral-800">{stripTashkeel(n.title)}</span>
                    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-700">{TYPE_LABEL[n.type] ?? n.type}</span>
                  </li>
                ))}
                {dueCount !== null && dueCount > 5 && <li className="text-xs text-neutral-500">و {dueCount - 5} أخرى…</li>}
              </ul>
              <Link to="/review" className="inline-flex rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700">
                ابدأ المراجعة
              </Link>
            </>
          )}
        </section>

        {/* Recent 5 */}
        <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 font-medium text-neutral-900">أحدث 5 ملاحظات</h3>
          {recent === null ? (
            <p className="text-sm text-neutral-400">جارٍ التحميل…</p>
          ) : recent.length === 0 ? (
            <p className="text-sm text-neutral-500">لا توجد ملاحظات بعد.</p>
          ) : (
            <ul className="grid gap-2">
              {recent.map((n) => (
                <li key={n.id}>
                  <Link to={`/notes/${n.id}`} className="flex items-center justify-between rounded-lg border border-neutral-100 px-3 py-2 hover:bg-neutral-50">
                    <span className="text-sm text-neutral-800">{stripTashkeel(n.title)}</span>
                    <span className="text-xs text-neutral-400">{new Date(n.created_at).toLocaleDateString('ar-EG')}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Local knowledge map (cluster) */}
        <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-medium text-neutral-900">الخريطة المحلية</h3>
            <Link to="/graph" className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-50">
              افتح الخريطة الكاملة
            </Link>
          </div>
          <div className="h-[300px]">
            <Suspense
              fallback={
                <p className="py-10 text-center text-sm text-neutral-500" role="status">
                  جارٍ تحميل الخريطة…
                </p>
              }
            >
              <KnowledgeGraph scope="cluster" compact />
            </Suspense>
          </div>
        </section>

        {/* Storage + quick links */}
        <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
          <p className="mb-2 text-sm text-neutral-500">التخزين</p>
          <p className="mb-3 text-sm text-neutral-700">{trial.label}</p>
          <div className="flex gap-3">
            <Link to="/settings" className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
              الإعدادات
            </Link>
            <Link to="/graph" className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
              الخريطة
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
