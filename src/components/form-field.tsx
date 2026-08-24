import { useId, type ChangeEvent, type ReactElement, type ReactNode } from 'react';

/**
 * Shared auth-form primitives: a labeled input with inline Arabic error
 * text, a CSS-only spinner, and the centered card shell every auth screen
 * renders inside. No component-library dependency — plain Tailwind v4.
 *
 * RTL-safe by construction: spacing is symmetric (px/py) or logical; text
 * alignment follows the document direction.
 */

const inputBaseClass =
  'w-full rounded-lg border bg-white px-3 py-2.5 text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-200 disabled:bg-neutral-100';

interface FormFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Arabic error message, or null/undefined when the field is valid. */
  error?: string | null;
  type?: 'text' | 'email' | 'password';
  /** Hints mobile keyboards, e.g. 'numeric' for page/duration fields. */
  inputMode?: 'numeric';
  autoComplete?: string;
  placeholder?: string;
  disabled?: boolean;
}

export function FormField({
  label,
  value,
  onChange,
  error = null,
  type = 'text',
  inputMode,
  autoComplete,
  placeholder,
  disabled = false,
}: FormFieldProps): ReactElement {
  const id = useId();

  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    onChange(event.target.value);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-neutral-700" htmlFor={id}>
        {label}
      </label>
      <input
        aria-describedby={error === null ? undefined : `${id}-error`}
        aria-invalid={error === null ? undefined : true}
        autoComplete={autoComplete}
        className={`${inputBaseClass} ${
          error === null ? 'border-neutral-300' : 'border-red-500'
        }`}
        disabled={disabled}
        id={id}
        inputMode={inputMode}
        name={id}
        onChange={handleChange}
        placeholder={placeholder}
        type={type}
        value={value}
      />
      {error !== null && (
        <p className="text-sm text-red-600" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function Spinner(): ReactElement {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}

interface AuthCardProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export function AuthCard({ title, description, children }: AuthCardProps): ReactElement {
  const headingId = useId();

  return (
    <div className="flex min-h-dvh items-center justify-center bg-brand-50 px-4 py-10">
      <section
        aria-labelledby={headingId}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-sm sm:p-8"
      >
        <h1 className="text-2xl font-bold text-brand-800" id={headingId}>
          {title}
        </h1>
        {description !== undefined && (
          <p className="mt-1.5 text-sm leading-relaxed text-neutral-500">{description}</p>
        )}
        <div className="mt-6 flex flex-col gap-4">{children}</div>
      </section>
    </div>
  );
}
