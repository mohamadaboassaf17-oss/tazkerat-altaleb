import { useState, type FormEvent, type ReactElement } from 'react';
import type { AuthError } from '@supabase/supabase-js';
import { Link, Navigate } from 'react-router-dom';
import { AuthCard, FormField, Spinner } from '../components/form-field';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { validateEmail, validatePassword } from '../lib/validation';

const GENERIC_SIGNUP_ERROR = 'تعذّر إنشاء الحساب، حاول مجددًا.';
const RATE_LIMIT_ERROR = 'محاولات كثيرة جدًا — انتظر قليلًا ثم أعد المحاولة.';

function mapSignupError(error: AuthError): string {
  if (
    error.code === 'user_already_exists' ||
    error.code === 'email_exists' ||
    error.message.includes('User already registered') ||
    error.message.includes('already been registered')
  ) {
    return 'هذا البريد مسجَّل مسبقًا، جرّب تسجيل الدخول.';
  }

  if (
    error.code === 'over_email_send_rate_limit' ||
    error.code === 'over_request_rate_limit' ||
    /rate.?limit/i.test(error.message)
  ) {
    return RATE_LIMIT_ERROR;
  }

  console.error('Sign-up failed:', error);
  return GENERIC_SIGNUP_ERROR;
}

export default function SignupScreen(): ReactElement {
  const { user } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // With email confirmations enabled (supabase/config.toml
  // enable_confirmations = true) a successful signUp resolves with a user
  // but NO session — the account is inert until the inbox link is clicked.
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  // An authenticated user must always land on the dashboard, even when
  // stale local `awaitingConfirmation` state says otherwise — mirrors the
  // top-of-component guard in LoginScreen.
  if (user !== null) {
    return <Navigate replace to="/dashboard" />;
  }

  if (awaitingConfirmation) {
    return (
      <AuthCard title="تحقق من بريدك الإلكتروني">
        <p className="text-sm leading-relaxed text-neutral-600">
          أرسلنا رابط تأكيد إلى بريدك الإلكتروني. افتح الرسالة واضغط على الرابط لتأكيد الحساب، ثم
          سجّل الدخول.
        </p>
        <p className="text-sm leading-relaxed text-neutral-500">
          إن لم تصلك الرسالة خلال دقائق، تحقق من مجلد البريد غير الهام (Spam).
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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    const nextNameError =
      fullName.trim().length > 50 ? 'الاسم طويل جدًا (50 حرفًا كحد أقصى).' : null;
    const nextEmailError = validateEmail(email);
    const nextPasswordError = validatePassword(password);
    setNameError(nextNameError);
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);

    if (nextEmailError !== null || nextPasswordError !== null || nextNameError !== null) {
      return;
    }

    setFormError(null);
    setIsSubmitting(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
          },
        },
      });

      if (error) {
        setFormError(mapSignupError(error));
        setIsSubmitting(false);
        return;
      }

      // With email confirmation disabled on the hosted project, signUp
      // resolves with an active session immediately: onAuthStateChange
      // flips the context `user`, and the top-of-component guard swaps
      // this render for <Navigate to="/dashboard"> (mirrors LoginScreen).
      // Keep the spinner up in the interim. Only fall back to the
      // verify-email screen when no session came back.
      if (data.session !== null) {
        return;
      }

      setAwaitingConfirmation(true);
    } catch (error: unknown) {
      console.error('Unexpected sign-up failure:', error);
      setFormError(GENERIC_SIGNUP_ERROR);
      setIsSubmitting(false);
    }
  };

  return (
    <AuthCard
      title="إنشاء حساب جديد"
      description="أنشئ حسابك لتنظيم مذاكرتك ومتابعة مراجعاتك."
    >
      {formError !== null && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {formError}
        </p>
      )}

      <form className="flex flex-col gap-4" noValidate onSubmit={(event) => void handleSubmit(event)}>
        <FormField
          autoComplete="name"
          disabled={isSubmitting}
          error={nameError}
          label="الاسم (اختياري)"
          onChange={setFullName}
          placeholder="اسمك الكامل"
          type="text"
          value={fullName}
        />
        <FormField
          autoComplete="email"
          error={emailError}
          label="البريد الإلكتروني"
          onChange={setEmail}
          placeholder="name@example.com"
          type="email"
          value={email}
        />
        <FormField
          autoComplete="new-password"
          error={passwordError}
          label="كلمة المرور"
          onChange={setPassword}
          type="password"
          value={password}
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
            'إنشاء الحساب'
          )}
        </button>
      </form>

      <p className="text-sm text-neutral-600">
        لديك حساب؟{' '}
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
