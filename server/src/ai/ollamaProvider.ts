import { env } from '../config/env.js';
import type { AIAnalysisInput, AIAnalysisResult, AIProvider } from './types.js';

export class AIProviderError extends Error { constructor(public readonly code: string, message: string) { super(message); this.name = 'AIProviderError'; } }

export class OllamaProvider implements AIProvider {
  readonly name = 'ollama';
  async health() { try { const response = await fetch(`${env.ollamaBaseUrl}/api/tags`, { signal: AbortSignal.timeout(Math.min(env.ollamaTimeoutMs, 5000)) }); if (!response.ok) return { available: false, provider: this.name, model: env.ollamaModel, message: 'Configured AI model unavailable' }; const body = await response.json() as { models?: Array<{ name?: string }> }; const available = Boolean(body.models?.some((model) => model.name === env.ollamaModel || model.name?.startsWith(`${env.ollamaModel}:`))); return { available, provider: this.name, model: env.ollamaModel, message: available ? 'AI provider available' : 'Configured AI model unavailable' }; } catch { return { available: false, provider: this.name, model: env.ollamaModel, message: 'AI provider unavailable' }; } }
  async analyze(input: AIAnalysisInput): Promise<AIAnalysisResult> {
    let response: Response;
    try { response = await fetch(`${env.ollamaBaseUrl}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: env.ollamaModel, prompt: input.prompt, stream: false, format: 'json' }), signal: AbortSignal.timeout(env.ollamaTimeoutMs) }); } catch (error) { throw new AIProviderError('AI_UNAVAILABLE', error instanceof Error && error.name === 'TimeoutError' ? 'AI provider request timed out.' : 'AI provider unavailable.'); }
    if (!response.ok) { if (response.status === 404) throw new AIProviderError('AI_MODEL_UNAVAILABLE', 'Configured AI model unavailable.'); throw new AIProviderError('AI_PROVIDER_ERROR', `AI provider returned status ${response.status}.`); }
    const body = await response.json() as { response?: string }; if (!body.response) throw new AIProviderError('AI_INVALID_RESPONSE', 'AI provider returned no structured response.');
    try { return JSON.parse(body.response) as AIAnalysisResult; } catch { throw new AIProviderError('AI_INVALID_JSON', 'AI provider returned invalid JSON.'); }
  }
}