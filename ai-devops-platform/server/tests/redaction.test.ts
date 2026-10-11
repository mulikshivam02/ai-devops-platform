import { describe, expect, it } from 'vitest';
import { redactSecrets } from '../src/utils/sensitive-data.js';

/** Review 4.8: redact BEFORE truncating, and cover the secret shapes logs actually contain. */
describe('redactSecrets', () => {
  it('redacts a secret that straddles the truncation boundary instead of leaving half of it', () => {
    // The AWS key starts at character 982, so a length-1000 truncation would cut it after 18 of its
    // 20 characters. The fragment no longer matches the key pattern, so truncate-then-redact leaves it in.
    const text = `${'x'.repeat(981)} AKIAIOSFODNN7EXAMPLE tail`;
    expect(text.slice(0, 1000)).toContain('AKIAIOSFODNN7'); // what the old order stored
    const out = redactSecrets(text, 1000);
    expect(out).not.toContain('AKIAIOS');
    expect(out).toContain('[REDACTED AWS KEY]');
    expect(out.length).toBeLessThanOrEqual(1000);
  });

  it('redacts a JWT even when it is cut off by the length limit', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
    const out = redactSecrets(`${'y'.repeat(980)} ${jwt}`, 1000);
    expect(out).not.toMatch(/eyJ/);
    expect(out).not.toContain('dozjgNry');
  });

  it('redacts AWS access key ids', () => {
    const out = redactSecrets('key AKIAIOSFODNN7EXAMPLE and ASIAIOSFODNN7EXAMPLE used', 500);
    expect(out).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(out).not.toContain('ASIAIOSFODNN7EXAMPLE');
    expect(out).toContain('[REDACTED AWS KEY]');
  });

  it('redacts a complete PEM private key block', () => {
    const pem = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEAxyz\nabcdef\n-----END RSA PRIVATE KEY-----';
    const out = redactSecrets(`before ${pem} after`, 500);
    expect(out).toBe('before [REDACTED PRIVATE KEY] after');
  });

  it('redacts an unterminated PEM block to the end of the text', () => {
    const out = redactSecrets('log: -----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC', 500);
    expect(out).toBe('log: [REDACTED PRIVATE KEY]');
  });

  it('redacts GitHub tokens', () => {
    const out = redactSecrets(`push with ghp_${'a'.repeat(36)} done`, 500);
    expect(out).not.toContain('ghp_');
  });

  it('redacts bearer tokens of any length, including short ones', () => {
    expect(redactSecrets('Authorization: Bearer abc123 ok', 200)).not.toContain('abc123');
    expect(redactSecrets('Authorization: Bearer abc123 ok', 200)).toBe('Authorization: Bearer [REDACTED] ok');
  });

  it('redacts Basic credentials but leaves the ordinary word "basic" alone', () => {
    expect(redactSecrets('Authorization: Basic dXNlcjpwYXNzd29yZA==', 200)).not.toContain('dXNlcjpw');
    expect(redactSecrets('this is basic usage of the api', 200)).toBe('this is basic usage of the api');
  });

  it('redacts key=value pairs, quoted and unquoted', () => {
    const out = redactSecrets('password=hunter2 api_key: "abc def" secret=\'x y\' token=zzz', 200);
    expect(out).not.toMatch(/hunter2|abc def|x y|zzz/);
  });

  it('leaves ordinary text untouched and truncates it', () => {
    expect(redactSecrets('GET /healthz 200 3ms', 100)).toBe('GET /healthz 200 3ms');
    expect(redactSecrets('abcdefghij', 4)).toBe('abcd');
  });
});
