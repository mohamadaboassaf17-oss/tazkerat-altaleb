import { useEffect, useId, useRef, type ReactElement } from 'react';
import { Spinner } from './form-field';

/**
 * Arabic confirmation dialog for entity deletion.
 *
 * `error` is where the delete-blocking policy speaks: when the entity still
 * has children, the confirm handler rejects with an Arabic explanation and
 * it renders here (role=alert) instead of the deletion proceeding.
 */
interface ConfirmDeleteDialogProps {
  /** Display name of the entity being deleted. */
  entityName: string;
  isDeleting: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDeleteDialog({
  entityName,
  isDeleting,
  error,
  onConfirm,
  onCancel,
}: ConfirmDeleteDialogProps): ReactElement {
  const headingId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);

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
    queueMicrotask(() => {
      overlayRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
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
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lg"
        role="dialog"
      >
        <h3 className="text-lg font-bold text-red-700" id={headingId}>
          تأكيد الحذف
        </h3>
        <p className="mt-3 text-sm leading-relaxed text-neutral-700">
          هل أنت متأكد من حذف «{entityName}»؟ لا يمكن التراجع عن هذا الإجراء.
        </p>
        {error !== null && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
        <div className="mt-5 flex items-center gap-3">
          <button
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2"
            disabled={isDeleting}
            onClick={onConfirm}
            type="button"
          >
            {isDeleting ? (
              <>
                <Spinner /> جارٍ الحذف…
              </>
            ) : (
              'حذف'
            )}
          </button>
          <button
            className="flex-1 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 font-medium text-neutral-700 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
            disabled={isDeleting}
            onClick={onCancel}
            type="button"
          >
            إلغاء
          </button>
        </div>
      </section>
    </div>
  );
}
