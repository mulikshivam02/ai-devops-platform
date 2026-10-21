import { afterEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

async function loadWith(overrides: Record<string, string | undefined>) {
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV, ...overrides };
  for (const [key, value] of Object.entries(overrides)) if (value === undefined) delete process.env[key];

  return {
    envModule: await import('../src/config/env.js'),
    providerModule: await import('../src/ai/provider.js')
  };
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
});

describe('AI provider configuration (plan 5.6)', () => {
  it('defaults to ollama and exposes the choice through env', async () => {
    const { envModule, providerModule } = await loadWith({ AI_PROVIDER: undefined });

    expect(envModule.env.aiProvider).toBe('ollama');
    expect(providerModule.getAIProvider().name).toBe('ollama');
  });

  it('selects the mock provider from env.aiProvider', async () => {
    const { envModule, providerModule } = await loadWith({ AI_PROVIDER: 'mock' });

    expect(envModule.env.aiProvider).toBe('mock');
    expect(providerModule.getAIProvider().name).toBe('mock');
    expect(providerModule.getAIProvider().model).toBe('mock');
  });

  it('fails fast on an unrecognised AI_PROVIDER instead of silently using ollama', async () => {
    await expect(loadWith({ AI_PROVIDER: 'openai' })).rejects.toThrow(/AI_PROVIDER must be "ollama" or "mock"/);
  });

  it('does not read AI_PROVIDER from process.env after startup', async () => {
    const { providerModule } = await loadWith({ AI_PROVIDER: 'mock' });
    process.env.AI_PROVIDER = 'ollama';

    expect(providerModule.getAIProvider().name).toBe('mock');
  });

  it('returns the same instance on every call', async () => {
    const { providerModule } = await loadWith({ AI_PROVIDER: 'mock' });

    expect(providerModule.getAIProvider()).toBe(providerModule.getAIProvider());
  });

  it('rebuilds after the test reset hook', async () => {
    const { providerModule } = await loadWith({ AI_PROVIDER: 'mock' });
    const first = providerModule.getAIProvider();

    providerModule.resetAIProviderForTests();

    expect(providerModule.getAIProvider()).not.toBe(first);
  });

  it('reports the configured Ollama model on the provider', async () => {
    const { envModule, providerModule } = await loadWith({ AI_PROVIDER: 'ollama', OLLAMA_MODEL: 'qwen3:8b' });

    expect(envModule.env.ollamaModel).toBe('qwen3:8b');
    expect(providerModule.getAIProvider().model).toBe('qwen3:8b');
  });
});
