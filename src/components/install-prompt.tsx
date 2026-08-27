import { useState, type ReactElement } from 'react';
import { useInstallPrompt } from '../hooks/useInstallPrompt';

export function InstallPrompt(): ReactElement | null {
  const { canPrompt, isIos, isStandalone, prompt, dismiss } = useInstallPrompt();
  const [isPrompting, setIsPrompting] = useState(false);

  if (isStandalone || !canPrompt) return null;

  async function handleInstall(): Promise<void> {
    if (isIos) {
      // iOS has no programmatic prompt — keep banner visible; user follows manual steps.
      return;
    }
    setIsPrompting(true);
    await prompt();
    setIsPrompting(false);
  }

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="تثبيت التطبيق"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-white p-4 shadow-lg"
    >
      <div className="mx-auto flex max-w-2xl items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-neutral-900">ثبّت تذكرة الطالب على جهازك</p>
          {isIos ? (
            <p className="mt-1 text-xs leading-5 text-neutral-600">
              في <span className="font-medium">Safari</span> اضغط زر المشاركة{' '}
              <span aria-hidden="true">⎙↑</span> ثم اختر{' '}
              <span className="font-medium">«إضافة إلى الشاشة الرئيسية»</span>.
            </p>
          ) : (
            <p className="mt-1 text-xs leading-5 text-neutral-600">
              احصل على تجربة تطبيق كامل دون اتصال — يعمل من الشاشة الرئيسية.
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isIos ? (
            <button
              type="button"
              onClick={dismiss}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
              aria-label="فهمت"
            >
              فهمت
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleInstall()}
              disabled={isPrompting}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
            >
              {isPrompting ? 'جارٍ…' : 'تثبيت'}
            </button>
          )}
          <button
            type="button"
            onClick={dismiss}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
            aria-label="لاحقًا"
          >
            لاحقًا
          </button>
        </div>
      </div>
    </div>
  );
}
