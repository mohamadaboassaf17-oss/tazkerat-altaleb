import { useState, type FormEvent, type ReactElement } from 'react';
import type { AuthError } from '@supabase/supabase-js';
import { Link, Navigate } from 'react-router-dom';
import { AuthCard, FormField, Spinner } from '../components/form-field';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { validateEmail, validatePassword } from '../lib/validation';

const GENERIC_LOGIN_ERROR = 'تعذّر تسجيل الدخول، حاول مجددًا.';
const RATE_LIMIT_ERROR = 'محاولات كثيرة جدًا — انتظر قليلًا ثم أعد المحاولة.';
const GOOGLE_ERROR = 'تعذّر بدء تسجيل الدخول عبر Google، حاول مجددًا.';

/**
 * Maps a Supabase auth failure to an Arabic message. Checks the typed
 * `code` first and falls back to message substrings so older server/SDK
 * pairings still map correctly. Unmapped errors log their details and
 * surface the generic message — never silently swallowed.
 */
function mapLoginError(error: AuthError): string {
  if (
    error.code === 'email_not_confirmed' ||
    error.message.includes('Email not confirmed')
  ) {
    return 'يجب تأكيد بريدك الإلكتروني قبل الدخول — تحقق من صندوق الوارد.';
  }

  if (
    error.code === 'invalid_credentials' ||
    error.message.includes('Invalid login credentials')
  ) {
    return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
  }

  if (
    error.code === 'over_email_send_rate_limit' ||
    error.code === 'over_request_rate_limit' ||
    /rate.?limit/i.test(error.message)
  ) {
    return RATE_LIMIT_ERROR;
  }

  console.error('Sign-in failed:', error);
  return GENERIC_LOGIN_ERROR;
}

export default function LoginScreen(): ReactElement {
  const { user } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGooglePending, setIsGooglePending] = useState(false);

  // Session already active → straight to the dashboard. Rendered as a
  // conditional <Navigate> instead of an effect, so there is no state
  // update loop and no cleanup to worry about.
  if (user) {
    return <Navigate replace to="/dashboard" />;
  }

  const isBusy = isSubmitting || isGooglePending;

  const handleGoogleSignIn = async (): Promise<void> => {
    setFormError(null);
    setIsGooglePending(true);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        throw error;
      }
      // Success: the browser navigates away to the provider; the spinner
      // stays up until unmount.
    } catch (error: unknown) {
      console.error('Failed to start Google sign-in:', error);
      setFormError(GOOGLE_ERROR);
      setIsGooglePending(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    const nextEmailError = validateEmail(email);
    const nextPasswordError = validatePassword(password);
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);

    if (nextEmailError !== null || nextPasswordError !== null) {
      return;
    }

    setFormError(null);
    setIsSubmitting(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setFormError(mapLoginError(error));
        setIsSubmitting(false);
        return;
      }

      // Signed in: onAuthStateChange flips the context `user`, which swaps
      // this render for <Navigate to="/dashboard">. Keep the spinner up in
      // the interim.
    } catch (error: unknown) {
      console.error('Unexpected sign-in failure:', error);
      setFormError(GENERIC_LOGIN_ERROR);
      setIsSubmitting(false);
    }
  };

  return (
    <AuthCard
      title="تسجيل الدخول"
      description="أهلًا بك من جديد — سجّل دخولك للوصول إلى ملاحظاتك ومراجعاتك."
    >
      {formError !== null && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {formError}
        </p>
      )}

      <button
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 font-medium text-neutral-700 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isBusy}
        onClick={() => void handleGoogleSignIn()}
        type="button"
      >
        {isGooglePending ? (
          <>
            <Spinner /> جارٍ المعالجة…
          </>
        ) : (
          <>
            <span aria-hidden="true">G</span> متابعة عبر Google
          </>
        )}
      </button>

      <div aria-hidden="true" className="flex items-center gap-4">
        <span className="h-px flex-1 bg-neutral-200" />
        <span className="text-sm text-neutral-500">أو</span>
        <span className="h-px flex-1 bg-neutral-200" />
      </div>

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
        <FormField
          autoComplete="current-password"
          error={passwordError}
          label="كلمة المرور"
          onChange={setPassword}
          type="password"
          value={password}
        />

        <button
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isBusy}
          type="submit"
        >
          {isSubmitting ? (
            <>
              <Spinner /> جارٍ المعالجة…
            </>
          ) : (
            'تسجيل الدخول'
          )}
        </button>
      </form>

      <div className="flex flex-col items-start gap-1 pt-1 text-sm">
        <p className="text-neutral-600">
          ليس لديك حساب؟{' '}
          <Link
            className="font-medium text-brand-700 underline underline-offset-4 hover:text-brand-800"
            to="/signup"
          >
            إنشاء حساب جديد
          </Link>
        </p>
        <Link
          className="text-neutral-500 underline underline-offset-4 hover:text-neutral-700"
          to="/forgot-password"
        >
          نسيت كلمة المرور؟
        </Link>
      </div>
    </AuthCard>
  );
}
