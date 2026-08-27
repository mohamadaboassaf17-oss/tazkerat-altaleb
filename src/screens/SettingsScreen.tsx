import { Link } from 'react-router-dom';
import { useMediaTrial } from '../hooks/useMediaTrial';

export default function SettingsScreen() {
  const trial = useMediaTrial();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h2 className="mb-6 text-xl font-bold text-neutral-900">الإعدادات</h2>

      <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
        <h3 className="mb-2 text-sm font-medium text-neutral-800">التخزين والوسائط</h3>
        {trial.isLoading ? (
          <p className="text-sm text-neutral-500">جارٍ التحميل…</p>
        ) : (
          <>
            <p className="rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-700">{trial.label}</p>
            {trial.trialStartedAt ? (
              <p className="mt-2 text-xs text-neutral-500">بدأت التجربة: {new Date(trial.trialStartedAt).toLocaleDateString('ar-EG')}</p>
            ) : (
              <p className="mt-2 text-xs text-neutral-500">لم يتم رفع أي وسيط بعد — ستبدأ التجربة عند أول رفع</p>
            )}
            {trial.isExpired ? (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-medium text-amber-900">انتهت فترة التجربة</p>
                <p className="mt-1 text-sm text-amber-700">
                  الملفات الحالية محفوظة للقراءة فقط ويمكن تحميلها. لرفع ملفات جديدة ستحتاج إلى خطة Pro.
                </p>
                <button
                  type="button"
                  disabled
                  className="mt-3 rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-900 opacity-60"
                  title="الترقية إلى Pro قريبًا — لا يوجد دفع في MVP"
                >
                  الترقية إلى Pro (قريبًا)
                </button>
              </div>
            ) : (
              <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4">
                <p className="text-sm text-green-800">يمكنك رفع الصور والملفات الصوتية (حتى 5 دقائق) بحرية خلال فترة التجربة.</p>
              </div>
            )}
          </>
        )}
      </div>

      <div className="mt-6 flex gap-3">
        <Link to="/dashboard" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          العودة للوحة التحكم
        </Link>
        <Link to="/categories" className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
          تصنيفاتي
        </Link>
      </div>
    </div>
  );
}
