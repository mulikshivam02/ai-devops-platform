import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';
import type { Role } from './roles';

export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <main className="auth-loading" aria-live="polite">Checking session...</main>;

  // Remember where the user was going, so signing in lands them there (deep links survive login).
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location }} />;

  return <Outlet />;
}

/** Renders `children` only for users whose role is at least `minimum`; otherwise `fallback`. */
export function Can({ minimum, children, fallback = null }: { minimum: Role; children: ReactNode; fallback?: ReactNode }) {
  const { can } = useAuth();

  return <>{can(minimum) ? children : fallback}</>;
}
