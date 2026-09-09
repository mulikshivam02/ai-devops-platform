import { MockAIProvider } from './mockProvider.js';
import { OllamaProvider } from './ollamaProvider.js';
import type { AIProvider } from './types.js';

export function getAIProvider(): AIProvider { return process.env.AI_PROVIDER === 'mock' ? new MockAIProvider() : new OllamaProvider(); }