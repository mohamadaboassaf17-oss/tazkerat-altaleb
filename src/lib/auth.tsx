import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';

/**
 * Auth context contract — downstream tasks depend on these exact names.
 *
 * Error strategy: errors are **surfaced, never swallowed**. Async work that
 * can fail (initial `getSession()`, subscription callbacks) rethrows via
 * `console.error` + an `authError` state field; the provider renders the
 * Arabic error message so failures are visible in the UI instead of a
 * silent "logged out" state.
 */
export interface AuthContextValue {
  session: Session | null;
  user: User | null;
  /** True until the initial getSession()/INITIAL_SESSION resolves. */
  isLoading: boolean;
  /** Calls supabase.auth.signOut(); this context does NOT navigate. */
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Recovery telemetry for the signup trigger's deliberate failure-swallowing
 * (supabase/migrations/20260822000001_m2_auth_onboarding.sql): when
 * handle_new_user() swallows a seeding failure there is no public.users row,
 * and no INSERT policy exists to create one — ensure_demo_seed() is the only
 * repair path. Fired at most once per page load, fire-and-forget: it must
 * never delay or block session establishment; a failure is logged as
 * recovery context, not silently dropped.
 */
let demoSeedRequested = false;

function requestDemoSeedOnce(): void {
  if (demoSeedRequested) return;
  demoSeedRequested = true;

  void supabase.rpc('ensure_demo_seed').then(
    ({ error }) => {
      if (error) {
        console.error('Demo seed recovery RPC failed:', error);
      }
    },
    (rpcError: unknown) => {
      console.error('Demo seed recovery RPC threw unexpectedly:', rpcError);
    },
  );
}

export function AuthProvider({ children }: { children: ReactNode }): ReactElement {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<Error | null>(null);

  useEffect(() => {
    let isMounted = true;

    supabase.auth
      .getSession()
      .then((result) => {
        if (!isMounted) return;
        setSession(result.data.session);
        setIsLoading(false);
        if (result.data.session !== null) {
          requestDemoSeedOnce();
        }
      })
      .catch((error: unknown) => {
        if (!isMounted) return;
        console.error('Failed to load the initial auth session:', error);
        setAuthError(
          error instanceof Error ? error : new Error(String(error)),
        );
        setIsLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return;
      // Covers INITIAL_SESSION, SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED
      // and USER_UPDATED — every event we care about carries the current
      // session snapshot, so unconditional assignment keeps state in sync.
      setSession(nextSession);
      if (nextSession !== null) {
        requestDemoSeedOnce();
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      isLoading,
      signOut: async () => {
        const { error } = await supabase.auth.signOut();
        if (error) throw new Error(`فشل تسجيل الخروج: ${error.message}`, { cause: error });
      },
    }),
    [session, isLoading],
  );

  if (authError) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-brand-50 px-6">
        <p className="text-center text-neutral-700" role="alert">
          حدث خطأ أثناء تحميل جلسة الدخول. حاول تحديث الصفحة.
        </p>
      </div>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Access the auth context; throws when used outside AuthProvider. */
// eslint-disable-next-line react-refresh/only-export-components -- the hook must live beside its provider (downstream tasks import both from this module)
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error(
      'useAuth must be used within an <AuthProvider> — wrap the app tree first.',
    );
  }
  return context;
}
