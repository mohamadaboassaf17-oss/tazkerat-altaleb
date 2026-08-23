import type { ReactElement, ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

/**
 * Route guard: renders children only for an authenticated user.
 *
 * - Loading state → centered spinner + Arabic label.
 * - No session   → hard redirect to /login (replaces history entry).
 */
export default function ProtectedRoute({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div
        className="flex min-h-dvh items-center justify-center bg-neutral-50"
        role="status"
        aria-live="polite"
      >
        <p className="text-lg text-brand-700">جارٍ التحميل…</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate replace to="/login" />;
  }

  return <>{children}</>;
}
