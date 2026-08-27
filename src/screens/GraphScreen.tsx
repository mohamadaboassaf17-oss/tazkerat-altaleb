import { lazy, Suspense, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';

const KnowledgeGraph = lazy(() =>
  import('../components/knowledge-graph').then((m) => ({ default: m.KnowledgeGraph })),
);

const BACK_BUTTON_CLASS =
  'rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 transition-colors hover:bg-neutral-100';

export default function GraphScreen(): ReactElement {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-dvh flex-col gap-3 px-4 pb-6 pt-5">
      <div className="flex items-center gap-3">
        <button
          className={BACK_BUTTON_CLASS}
          onClick={() => {
            void navigate(-1);
          }}
          type="button"
        >
          رجوع
        </button>
        <h2 className="text-2xl font-bold text-brand-800">الخريطة المعرفية</h2>
      </div>
      <p className="text-sm text-neutral-500">انقر على عقدة لفتح الملاحظة.</p>
      <div className="min-h-[420px] flex-1">
        <Suspense
          fallback={
            <p className="py-10 text-center text-sm text-neutral-500" role="status">
              جارٍ تحميل الخريطة…
            </p>
          }
        >
          <KnowledgeGraph />
        </Suspense>
      </div>
    </div>
  );
}
