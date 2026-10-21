import { describe, expect, it, vi } from 'vitest';
import { authSessionChanged, getAuthToken, purgeLegacyToken, setAuthToken } from './session';

describe('session token storage (plan 7.2)', () => {
  it('keeps the token in sessionStorage, never localStorage', () => {
    setAuthToken('abc');

    expect(window.sessionStorage.getItem('changelens_token')).toBe('abc');
    expect(window.localStorage.getItem('changelens_token')).toBeNull();
    expect(getAuthToken()).toBe('abc');
  });

  it('clears the token', () => {
    setAuthToken('abc');
    setAuthToken(null);

    expect(getAuthToken()).toBeNull();
  });

  it('announces every change so the app can react to expiry', () => {
    const listener = vi.fn();

    window.addEventListener(authSessionChanged, listener);
    setAuthToken('abc');
    setAuthToken(null);
    window.removeEventListener(authSessionChanged, listener);

    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('removes a token left in localStorage by an earlier version', () => {
    window.localStorage.setItem('changelens_token', 'old-long-lived-token');

    purgeLegacyToken();

    expect(window.localStorage.getItem('changelens_token')).toBeNull();
  });

  it('does not use a legacy localStorage token as the session', () => {
    window.localStorage.setItem('changelens_token', 'old');

    expect(getAuthToken()).toBeNull();
  });

  it('degrades to "no session" instead of throwing when storage is blocked', () => {
    const blocked = vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });

    expect(() => setAuthToken('abc')).not.toThrow();
    expect(getAuthToken()).toBeNull();

    blocked.mockRestore();
  });
});
