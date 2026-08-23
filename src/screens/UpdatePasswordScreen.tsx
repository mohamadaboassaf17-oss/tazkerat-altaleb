import { useState, type FormEvent, type ReactElement } from 'react';
import type { AuthError } from '@supabase/supabase-js';
import { Link, useNavigate } from 'react-router-dom';
import { AuthCard, FormField, Spinner } from '../components/form-field';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { validatePassword } from '../lib/validation';

const GENERIC_UPDATE_ERROR = 'تعذّر تحديث كلمة المرور، حاول مجددًا.';

function mapUpdateError(error: AuthError): string {
  if (error.message.includes('should be different') || error.code === 'same_password') {
    return 'كلمة المرور الجديدة يجب أن تختلف عن الحالية.';
  }

  console.error('Password update failed:', error);
  return GENERIC_UPDATE_ERROR;
}

function LoadingPanel(): ReactElement {
  return (
    <AuthCard title="جارٍ التحقق…">
      <p className="flex items-center gap-2 text-sm text-neutral-600" role="status">
        <Spinner /> جارٍ المعالجة…
      </p>
    </AuthCard>
  );
}

function MissingSessionPanel(): ReactElement {
  return (
    <AuthCard
      title="الرابط غير صالح"
      description="لم نتمكن من التحقق من هويتك. قد يكون رابط إعادة التعيين قد استُخدم مسبقًا أو انتهت صلاحيته."
    >
      <p className="text-sm leading-relaxed text-neutral-600">
        يمكنك طلب رابط جديد لإعادة تعيين كلمة المرور، ثم إتمام العملية خلال ساعة من وصول الرسالة.
      </p>
      <Link
        className="mt-2 flex w-full items-center justify-center rounded-lg bg-brand-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-brand-700"
        to="/forgot-password"
      >
        طلب رابط جديد
      </Link>
    </AuthCard>
  );
}

export default function UpdatePasswordScreen(): ReactElement {
  const { isLoading, user } = useAuth();
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUpdated, setIsUpdated] = useState(false);
  // True only when the password change succeeded but revoking other devices'
  // sessions failed — surfaced as a soft note, not a fatal error.
  const [revocationFailed, setRevocationFailed] = useState(false);

  if (isLoading) {
    return <LoadingPanel />;
  }

  // The recovery email lands here with a recovery session in the URL,
  // which the Supabase client consumes automatically (detectSessionInUrl).
  // No session after the initial load means the link was consumed,
  // malformed, or expired.
  if (user === null) {
    return <MissingSessionPanel />;
  }

  if (isUpdated) {
    return (
      <AuthCard title="تم تحديث كلمة المرور">
        <p className="text-sm leading-relaxed text-neutral-600">
          تم تغيير كلمة مرور حسابك بنجاح. يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة.
        </p>
        {revocationFailed && (
          <p className="mt-2 text-sm leading-relaxed text-amber-700" role="status">
            تعذّر إنهاء جلسات الأجهزة الأخرى — قد تبقى مسجَّلة الدخول عليها.
          </p>
        )}
        <button
          className="mt-2 flex w-full items-center justify-center rounded-lg bg-brand-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-brand-700"
          onClick={() => void navigate('/login')}
          type="button"
        >
          الانتقال إلى تسجيل الدخول
        </button>
      </AuthCard>
    );
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    const nextPasswordError = validatePassword(password);
    let nextConfirmError: string | null = null;
    if (nextPasswordError === null && confirmPassword !== password) {
      nextConfirmError = 'كلمتا المرور غير متطابقتين.';
    }
    setPasswordError(nextPasswordError);
    setConfirmError(nextConfirmError);

    if (nextPasswordError !== null || nextConfirmError !== null) {
      return;
    }

    setFormError(null);
    setIsSubmitting(true);

    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        setFormError(mapUpdateError(error));
        setIsSubmitting(false);
        return;
      }

      // Security hygiene: revoke refresh tokens on every other device while
      // keeping this session alive ('others' scope fires no SIGNED_OUT event,
      // so the auth context stays intact). The password change already
      // succeeded, so a revocation failure is logged + noted in the success
      // card rather than treated as fatal.
      const { error: revokeError } = await supabase.auth.signOut({ scope: 'others' });
      if (revokeError) {
        console.error('Failed to revoke other sessions after password change:', revokeError);
        setRevocationFailed(true);
      }

      setIsUpdated(true);
    } catch (error: unknown) {
      console.error('Unexpected password update failure:', error);
      setFormError(GENERIC_UPDATE_ERROR);
      setIsSubmitting(false);
    }
  };

  return (
    <AuthCard
      title="تعيين كلمة مرور جديدة"
      description="اختر كلمة مرور جديدة لحسابك."
    >
      {formError !== null && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {formError}
        </p>
      )}

      <form className="flex flex-col gap-4" noValidate onSubmit={(event) => void handleSubmit(event)}>
        <FormField
          autoComplete="new-password"
          error={passwordError}
          label="كلمة المرور الجديدة"
          onChange={setPassword}
          type="password"
          value={password}
        />
        <FormField
          autoComplete="new-password"
          error={confirmError}
          label="تأكيد كلمة المرور"
          onChange={setConfirmPassword}
          type="password"
          value={confirmPassword}
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
            'تحديث كلمة المرور'
          )}
        </button>
      </form>
    </AuthCard>
  );
}
