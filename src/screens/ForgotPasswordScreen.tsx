import { useState, type FormEvent, type ReactElement } from 'react';
import type { AuthError } from '@supabase/supabase-js';
import { Link } from 'react-router-dom';
import { AuthCard, FormField, Spinner } from '../components/form-field';
import { supabase } from '../lib/supabase';
import { validateEmail } from '../lib/validation';

const GENERIC_RESET_ERROR = 'تعذّر إرسال رابط إعادة التعيين، حاول مجددًا.';
const RATE_LIMIT_ERROR = 'محاولات كثيرة جدًا — انتظر قليلًا ثم أعد المحاولة.';

function mapResetError(error: AuthError): string {
  if (
    error.code === 'over_email_send_rate_limit' ||
    error.code === 'over_request_rate_limit' ||
    /rate.?limit/i.test(error.message)
  ) {
    return RATE_LIMIT_ERROR;
  }

  console.error('Password reset request failed:', error);
  return GENERIC_RESET_ERROR;
}

export default function ForgotPasswordScreen(): ReactElement {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSent, setIsSent] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    const nextEmailError = validateEmail(email);
    setEmailError(nextEmailError);
    if (nextEmailError !== null) {
      return;
    }

    setFormError(null);
    setIsSubmitting(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/update-password`,
      });

      if (error) {
        setFormError(mapResetError(error));
        setIsSubmitting(false);
        return;
      }

      setIsSent(true);
    } catch (error: unknown) {
      console.error('Unexpected password reset failure:', error);
      setFormError(GENERIC_RESET_ERROR);
      setIsSubmitting(false);
    }
  };

  if (isSent) {
    return (
      <AuthCard title="تحقق من بريدك الإلكتروني">
        <p className="text-sm leading-relaxed text-neutral-600">
          أرسلنا رابط إعادة التعيين إلى بريدك.
        </p>
        <p className="text-sm leading-relaxed text-neutral-500">
          افتح الرسالة واضغط على الرابط لاختيار كلمة مرور جديدة. إن لم تصلك خلال دقائق، تحقق من
          مجلد البريد غير الهام (Spam).
        </p>
        <Link
          className="mt-2 flex w-full items-center justify-center rounded-lg bg-brand-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-brand-700"
          to="/login"
        >
          العودة إلى تسجيل الدخول
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="استعادة كلمة المرور"
      description="أدخل بريدك الإلكتروني وسنرسل لك رابطًا لإعادة تعيين كلمة المرور."
    >
      {formError !== null && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {formError}
        </p>
      )}

      <form className="flex flex-col gap-4" noValidate onSubmit={(event) => void handleSubmit(event)}>
        <FormField
          autoComplete="email"
          error={emailError}
          label="البريد الإلكتروني"
          onChange={setEmail}
          placeholder="name@example.com"
          type="email"
          value={email}
        />

        <button
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? (
            <>
              <Spinner /> جارٍ المعالجة…
            </>
          ) : (
            'استعادة كلمة المرور'
          )}
        </button>
      </form>

      <p className="text-sm text-neutral-600">
        تذكّرت كلمة المرور؟{' '}
        <Link
          className="font-medium text-brand-700 underline underline-offset-4 hover:text-brand-800"
          to="/login"
        >
          سجّل الدخول
        </Link>
      </p>
    </AuthCard>
  );
}
