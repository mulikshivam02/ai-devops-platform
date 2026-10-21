/**
 * Where the bearer token lives.
 *
 * sessionStorage, not localStorage: the app renders text that outsiders control (commit messages, log
 * lines), so any XSS that slips through can read whatever script-reachable storage holds. localStorage
 * kept an 8-hour token for every future visit; sessionStorage drops it when the tab closes, which
 * shortens the window but does NOT make it unreachable. An httpOnly cookie with CSRF protection would;
 * that is a server change and is recorded in docs/LIMITATIONS.md.
 *
 * Trade-off worth knowing: sessionStorage is per tab, so opening a link in a NEW tab asks for sign-in.
 */
const TOKEN_KEY = 'changelens_token';

export const authSessionChanged = 'changelens-auth-session-changed';

function store(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    // Storage can be blocked (privacy mode, sandboxed frames). Treat as "no session", not a crash.
    return null;
  }
}

export function getAuthToken(): string | null {
  try {
    return store()?.getItem(TOKEN_KEY) ?? null;
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null): void {
  try {
    if (token) store()?.setItem(TOKEN_KEY, token);
    else store()?.removeItem(TOKEN_KEY);
  } catch {
    // Quota or blocked storage: the token simply is not kept.
  }

  window.dispatchEvent(new Event(authSessionChanged));
}

/** Earlier versions kept the token in localStorage for 8 hours. Remove any that is still there. */
export function purgeLegacyToken(): void {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Nothing to purge if storage is unavailable.
  }
}

purgeLegacyToken();
