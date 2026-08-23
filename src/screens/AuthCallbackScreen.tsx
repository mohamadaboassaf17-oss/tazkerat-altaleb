import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { AuthCard } from '../components/form-field';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';

export default function AuthCallbackScreen(): ReactElement {
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const code = searchParams.get('code');
  const oauthErrorParam = searchParams.get('error');

  // 'failed' is only reachable when no usable session could be established.
  const [hasFailed, setHasFailed] = useState(false);

  // PKCE authorization codes are single-use. The code currently claimed by
  // this component lives in a ref owned by the effect lifecycle: cleanup
  // releases it, so a remount (React StrictMode's second setup pass in dev,
  // or a genuine retry) may legitimately exchange again instead of being
  // permanently blocked by an aborted first attempt.
  const handledCodeRef = useRef<string | null>(null);

  useEffect(() => {
    if (code === null || handledCodeRef.current === code) {
      return;
    }
    handledCodeRef.current = code;

    let active = true;

    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return undefined;
        // detectSessionInUrl may already have consumed this code during
        // client initialization — skip the redundant exchange in that case.
        if (data.session !== null) return undefined;
        return supabase.auth.exchangeCodeForSession(code);
      })
      .then((result) => {
        if (!active) return;
        if (result !== undefined && result.error !== null) throw result.error;
        // Session established: the auth context flips `user`, which swaps
        // this render for <Navigate to="/dashboard" />.
      })
      .catch((exchangeError: unknown) =>
        // Re-check before failing: the automatic detectSessionInUrl flow can
        // complete concurrently and win the race for the single-use code.
        supabase.auth.getSession().then(({ data }) => {
          if (!active || data.session !== null) return;
          console.error('Failed to exchange auth code for a session:', exchangeError);
          setHasFailed(true);
        }),
      );

    return () => {
      active = false;
      handledCodeRef.current = null;
    };
  }, [code]);

  if (oauthErrorParam !== null || hasFailed) {
    return (
      <AuthCard title="تعذّر إكمال تسجيل الدخول">
        <p className="text-sm leading-relaxed text-neutral-600">
          حدث خطأ أثناء إكمال عملية المصادقة. قد تكون صلاحية الرابط قد انتهت أو أنه استُخدم مسبقًا.
          جرّب تسجيل الدخول من جديد.
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

  // Covers both paths landing here:
  // - OAuth PKCE return (?code=... exchanged above)
  // - Email confirmation / recovery links whose hash or code was consumed
  //   automatically by detectSessionInUrl during client init.
  if (user !== null) {
    return <Navigate replace to="/dashboard" />;
  }

  return (
    <AuthCard title="جارٍ إكمال المصادقة…">
      <p className="text-neutral-600">لحظة واحدة، نجهّز حسابك…</p>
    </AuthCard>
  );
}
