import { env } from '../config/env.js';
import { MockAIProvider } from './mockProvider.js';
import { OllamaProvider } from './ollamaProvider.js';
import type { AIProvider } from './types.js';

// One instance per process. A new provider per call re-read configuration each time and gave every
// request a different object to reason about; the provider is stateless, so there is nothing to refresh.
let cached: AIProvider | undefined;

export function getAIProvider(): AIProvider {
  cached ??= env.aiProvider === 'mock' ? new MockAIProvider() : new OllamaProvider();
  return cached;
}

/** Test seam: drop the cached instance so the next call rebuilds from current configuration. */
export function resetAIProviderForTests(): void {
  cached = undefined;
}
