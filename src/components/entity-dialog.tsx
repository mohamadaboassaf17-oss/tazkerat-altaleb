import { useEffect, useId, useRef, type FormEvent, type ReactElement, type ReactNode } from 'react';
import { Spinner } from './form-field';

/**
 * Modal shell for entity create/edit forms (M3 hierarchy screens).
 * Owns the overlay, heading, error banner, and submit/cancel buttons;
 * the fields themselves are passed as children.
 */
interface EntityDialogProps {
  title: string;
  submitLabel: string;
  isSubmitting: boolean;
  formError: string | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  children: ReactNode;
}

export function EntityDialog({
  title,
  submitLabel,
  isSubmitting,
  formError,
  onSubmit,
  onCancel,
  children,
}: EntityDialogProps): ReactElement {
  const headingId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const firstFocusableRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Tab') {
        const root = overlayRef.current;
        if (!root) return;
        const focusable = root.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', onKey);
    // autofocus first input inside dialog
    queueMicrotask(() => {
      const root = overlayRef.current;
      const input = root?.querySelector<HTMLInputElement>('input');
      input?.focus();
      if (!input) firstFocusableRef.current?.focus();
    });
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onCancel]);

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/50 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <section
        aria-labelledby={headingId}
        aria-modal="true"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lg focus-visible:outline-none"
        role="dialog"
      >
        <h3 className="text-lg font-bold text-brand-800" id={headingId}>
          {title}
        </h3>
        <form className="mt-4 flex flex-col gap-4" noValidate onSubmit={onSubmit}>
          {children}
          {formError !== null && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {formError}
            </p>
          )}
           <div className="mt-2 flex items-center gap-3">
            <button
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? (
                <>
                  <Spinner /> جارٍ الحفظ…
                </>
              ) : (
                submitLabel
              )}
            </button>
            <button
              className="flex-1 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 font-medium text-neutral-700 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
              disabled={isSubmitting}
              onClick={onCancel}
              type="button"
            >
              إلغاء
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
