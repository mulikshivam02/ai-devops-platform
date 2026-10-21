import { Suspense } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ErrorBoundary } from './ErrorBoundary';

const primaryLinks = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/changes', label: 'Changes' },
  { to: '/resources', label: 'Resources' },
  { to: '/evidence', label: 'Evidence' },
  { to: '/change-intelligence', label: 'Intelligence' },
  { to: '/learning', label: 'Learning' },
  { to: '/integrations/kubernetes', label: 'Integrations' }
];

const moreLinks = [
  { to: '/integrations/observability', label: 'Observability' },
  { to: '/dependencies', label: 'Dependencies' },
  { to: '/analysis', label: 'Change analysis' },
  { to: '/prediction-reality', label: 'Prediction vs reality' },
  { to: '/investigations', label: 'AI investigations' },
  { to: '/security', label: 'Security' },
  { to: '/remediation', label: 'Remediation' },
  { to: '/insights', label: 'Insights' }
];

export function Layout() {
  const { user, signOut } = useAuth();
  const location = useLocation();

  return (
    <>
      <header className="topbar">
        <Link className="brand" to="/" aria-label="ChangeLens home">
          <span className="brand-mark" aria-hidden="true">C</span>
          <span>ChangeLens</span>
        </Link>
        <nav className="topbar-nav" aria-label="Primary">
          {primaryLinks.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.end}>
              {link.label}
            </NavLink>
          ))}
          <details className="nav-more" key={location.pathname}>
            <summary>More</summary>
            <div className="nav-more__menu">
              {moreLinks.map((link) => (
                <NavLink key={link.to} to={link.to}>
                  {link.label}
                </NavLink>
              ))}
            </div>
          </details>
          {user ? (
            <span className="topbar-label" title={user.email}>
              {user.role}
            </span>
          ) : null}
          <button className="text-button topbar-logout" type="button" onClick={() => void signOut()}>
            Logout
          </button>
        </nav>
      </header>
      <ErrorBoundary resetKey={location.pathname}>
        <Suspense fallback={<main className="auth-loading" aria-live="polite">Loading...</main>}>
          <Outlet />
        </Suspense>
      </ErrorBoundary>
    </>
  );
}
