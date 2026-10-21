import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authSessionChanged, currentUser, login, logout, type AuthUser } from '../services/api';
import { getAuthToken } from '../services/session';
import { hasRole, type Role } from './roles';

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthValue {
  status: AuthStatus;
  user: AuthUser | null;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  /** True when the signed-in user's role is at least `minimum`. */
  can(minimum: Role): boolean;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    if (!getAuthToken()) {
      setStatus('anonymous');
      return;
    }

    // Keep the user, not just a yes/no: the role decides which controls are shown.
    let active = true;

    currentUser()
      .then((me) => {
        if (!active) return;
        setUser(me);
        setStatus('authenticated');
      })
      .catch(() => {
        if (!active) return;
        setUser(null);
        setStatus('anonymous');
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    // The API client clears the token on any 401 and announces it here, so an expired or revoked
    // session returns the user to the sign-in page from wherever they are.
    const handleSessionChange = () => {
      if (getAuthToken()) return;
      setUser(null);
      setStatus('anonymous');
    };

    window.addEventListener(authSessionChanged, handleSessionChange);

    return () => window.removeEventListener(authSessionChanged, handleSessionChange);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const me = await login(email, password);

    setUser(me);
    setStatus('authenticated');
  }, []);

  const signOut = useCallback(async () => {
    await logout().catch(() => undefined);
    setUser(null);
    setStatus('anonymous');
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ status, user, signIn, signOut, can: (minimum) => hasRole(user, minimum) }),
    [status, user, signIn, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);

  if (!value) throw new Error('useAuth must be used inside <AuthProvider>.');

  return value;
}

/** Shorthand for gating a control: `const canEdit = useCan('operator')`. */
export function useCan(minimum: Role): boolean {
  return useAuth().can(minimum);
}
