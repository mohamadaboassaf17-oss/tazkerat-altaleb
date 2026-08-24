import { useId, type FormEvent, type ReactElement, type ReactNode } from 'react';
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/50 px-4">
      <section
        aria-labelledby={headingId}
        aria-modal="true"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lg"
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
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
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
              className="flex-1 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 font-medium text-neutral-700 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
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
