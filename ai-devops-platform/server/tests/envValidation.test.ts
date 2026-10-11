import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * config/env.ts computes everything at module load time, so exercising a
 * different configuration means resetting the module registry and re-importing
 * with different process.env values. Each case restores process.env afterward so
 * it can't leak into other tests in this file.
 *
 * Covers review 1.7: production must reject known placeholder JWT secrets (length
 * alone doesn't catch them -- several past defaults were 32+ characters), and must
 * require an initial admin to be configured, since registration is disabled by
 * default (review 1.2/1.3) and a production deployment with neither would have no
 * way for anyone to ever log in.
 */

const BASE_PRODUCTION_ENV = {
  NODE_ENV: 'production',
  MONGODB_URI: 'mongodb://mongo:27017/changelens',
  CLIENT_URL: 'https://changelens.example.com',
  AUTH_DISABLED: 'false',
  JWT_SECRET: 'a-genuinely-random-secret-that-is-at-least-32-characters-long',
  INITIAL_ADMIN_EMAIL: 'admin@example.com',
  INITIAL_ADMIN_PASSWORD: 'a-strong-password'
};

const ORIGINAL_ENV = { ...process.env };

async function loadEnvWith(overrides: Record<string, string | undefined>): Promise<unknown> {
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV, ...BASE_PRODUCTION_ENV, ...overrides };
  return import('../src/config/env.js');
}

describe('env validation', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
  });

  it('boots successfully with a real secret and an initial admin configured', async () => {
    await expect(loadEnvWith({})).resolves.toBeDefined();
  });

  it.each([
    'development-only-change-lens-secret',
    'replace-with-a-long-development-secret',
    'change-me-to-32-char-random-string-in-production'
  ])('rejects the known placeholder secret %s in production', async (placeholder) => {
    await expect(loadEnvWith({ JWT_SECRET: placeholder })).rejects.toThrow(/placeholder/i);
  });

  it('rejects a short secret in production even if not a known placeholder', async () => {
    await expect(loadEnvWith({ JWT_SECRET: 'too-short' })).rejects.toThrow(/32 characters/);
  });

  it('rejects production with no initial admin configured', async () => {
    await expect(loadEnvWith({ INITIAL_ADMIN_EMAIL: '', INITIAL_ADMIN_PASSWORD: '' })).rejects.toThrow(
      /INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD are required/
    );
  });

  it('rejects production with only one of the initial admin pair set', async () => {
    await expect(loadEnvWith({ INITIAL_ADMIN_PASSWORD: '' })).rejects.toThrow(
      /INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD are required/
    );
  });

  it('allows a placeholder secret outside production (development convenience)', async () => {
    await expect(
      loadEnvWith({ NODE_ENV: 'development', JWT_SECRET: undefined, CLIENT_URL: undefined })
    ).resolves.toBeDefined();
  });

  describe('KUBERNETES_CA_CERT (review 4.2)', () => {
    const fixtureUrl = new URL('./fixtures/test-ca.crt', import.meta.url);
    const fixturePath = fileURLToPath(fixtureUrl);
    const pem = readFileSync(fixtureUrl, 'utf8').trim();
    const caOf = async (value: string | undefined) =>
      ((await loadEnvWith({ KUBERNETES_CA_CERT: value })) as { env: { kubernetesCaCert?: string } }).env
        .kubernetesCaCert;

    it('is undefined when unset or blank', async () => {
      expect(await caOf(undefined)).toBeUndefined();
      expect(await caOf('   ')).toBeUndefined();
    });

    it('accepts PEM text inline', async () => {
      expect(await caOf(pem)).toBe(pem);
    });

    it('accepts PEM text with literal \\n sequences, as env files and compose must write it', async () => {
      expect(await caOf(pem.replace(/\n/g, '\\n'))).toBe(pem);
    });

    it('accepts a path to a PEM file', async () => {
      expect((await caOf(fixturePath))?.trim()).toBe(pem);
    });

    it('fails fast when the path cannot be read', async () => {
      await expect(caOf('/definitely/not/a/real/ca.crt')).rejects.toThrow(/could not be read/);
    });

    it('rejects a file that is not a PEM certificate', async () => {
      await expect(caOf(fileURLToPath(new URL('./fixtures/README.md', import.meta.url)))).rejects.toThrow(
        /PEM-encoded certificate/
      );
    });

    it('rejects a private key pasted where the certificate belongs', async () => {
      const keyPem = readFileSync(new URL('./fixtures/test-ca.key', import.meta.url), 'utf8').trim();
      await expect(caOf(keyPem)).rejects.toThrow(/PEM-encoded certificate/);
    });
  });
});
