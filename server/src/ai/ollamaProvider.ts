import { env } from '../config/env.js';
import type { AIAnalysisInput, AIAnalysisResult, AIProvider } from './types.js';

export class AIProviderError extends Error { constructor(public readonly code: string, message: string) { super(message); this.name = 'AIProviderError'; } }

export const investigationResultSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'rootCause', 'hypotheses', 'evidenceReferences', 'reasoning', 'impactExplanation', 'predictionRealityExplanation', 'recommendations', 'limitations'],
  properties: {
    summary: { type: 'string' },
    rootCause: {
      type: 'object',
      additionalProperties: false,
      required: ['statement', 'confidence', 'evidenceIds'],
      properties: {
        statement: { type: 'string' },
        confidence: { type: 'integer', minimum: 0, maximum: 100 },
        evidenceIds: { type: 'array', items: { type: 'string' } }
      }
    },
    hypotheses: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'explanation', 'confidence', 'supportingEvidenceIds', 'contradictingEvidenceIds'],
        properties: {
          title: { type: 'string' },
          explanation: { type: 'string' },
          confidence: { type: 'integer', minimum: 0, maximum: 100 },
          supportingEvidenceIds: { type: 'array', items: { type: 'string' } },
          contradictingEvidenceIds: { type: 'array', items: { type: 'string' } }
        }
      }
    },
    evidenceReferences: { type: 'array', items: { type: 'string' } },
    reasoning: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['statement', 'type'],
        properties: {
          statement: { type: 'string' },
          type: { type: 'string', enum: ['fact', 'inference', 'hypothesis'] }
        }
      }
    },
    impactExplanation: { type: 'string' },
    predictionRealityExplanation: { type: 'string' },
    recommendations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'explanation', 'priority', 'safe', 'supportingEvidenceIds'],
        properties: {
          title: { type: 'string' },
          explanation: { type: 'string' },
          priority: { type: 'string' },
          safe: { type: 'boolean' },
          supportingEvidenceIds: { type: 'array', items: { type: 'string' } }
        }
      }
    },
    limitations: { type: 'array', items: { type: 'string' } }
  }
} as const;

function findJsonCandidate(candidate: string): string | null {
  const validCandidates: string[] = [];
  for (let index = 0; index < candidate.length; index += 1) {
    const char = candidate[index];
    if (char !== '{' && char !== '[') continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    let endIndex = -1;
    for (let cursor = index; cursor < candidate.length; cursor += 1) {
      const current = candidate[cursor];
      if (inString) {
        if (escaped) escaped = false;
        else if (current === '\\') escaped = true;
        else if (current === '"') inString = false;
        continue;
      }
      if (current === '"') {
        inString = true;
        continue;
      }
      if (current === char) depth += 1;
      else if ((char === '{' && current === '}') || (char === '[' && current === ']')) depth -= 1;
      if (depth === 0) {
        endIndex = cursor;
        break;
      }
    }
    if (endIndex === -1) continue;
    const possible = candidate.slice(index, endIndex + 1).trim();
    if (!possible) continue;
    try { JSON.parse(possible); validCandidates.push(possible); } catch { /* ignore ambiguous candidates */ }
  }
  if (validCandidates.length === 1) return validCandidates[0];
  if (validCandidates.length > 1) throw new AIProviderError('AI_INVALID_JSON', 'AI provider returned ambiguous JSON output.');
  return null;
}

export function extractStructuredJson(raw: unknown): string {
  if (typeof raw !== 'string') {
    if (typeof raw === 'object' && raw !== null) {
      try { return JSON.stringify(raw); } catch { throw new AIProviderError('AI_INVALID_JSON', 'AI provider returned an unsupported structured payload.'); }
    }
    throw new AIProviderError('AI_INVALID_JSON', 'AI provider returned no structured JSON payload.');
  }

  let candidate = raw.trim();
  if (!candidate) throw new AIProviderError('AI_INVALID_JSON', 'AI provider returned an empty JSON payload.');

  candidate = candidate.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '').trim();
  if (!candidate) throw new AIProviderError('AI_INVALID_JSON', 'AI provider returned only reasoning text.');

  const fenced = candidate.match(/^```(?:json)?\s*(\{[\s\S]*\}|\[[\s\S]*\])\s*```$/i);
  if (fenced) {
    candidate = fenced[1].trim();
  }

  try {
    JSON.parse(candidate);
    return candidate;
  } catch {
    const nested = findJsonCandidate(candidate);
    if (nested) return nested;
    throw new AIProviderError('AI_INVALID_JSON', 'AI provider returned invalid or ambiguous JSON.');
  }
}

export class OllamaProvider implements AIProvider {
  readonly name = 'ollama';
  async health() { try { const response = await fetch(`${env.ollamaBaseUrl}/api/tags`, { signal: AbortSignal.timeout(Math.min(env.ollamaTimeoutMs, 5000)) }); if (!response.ok) return { available: false, provider: this.name, model: env.ollamaModel, message: 'Configured AI model unavailable' }; const body = await response.json() as { models?: Array<{ name?: string }> }; const available = Boolean(body.models?.some((model) => model.name === env.ollamaModel || model.name?.startsWith(`${env.ollamaModel}:`))); return { available, provider: this.name, model: env.ollamaModel, message: available ? 'AI provider available' : 'Configured AI model unavailable' }; } catch { return { available: false, provider: this.name, model: env.ollamaModel, message: 'AI provider unavailable' }; } }
  async analyze(input: AIAnalysisInput): Promise<AIAnalysisResult> {
    let response: Response;
    try { response = await fetch(`${env.ollamaBaseUrl}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: env.ollamaModel, prompt: input.prompt, stream: false, think: false, options: { temperature: 0 }, format: investigationResultSchema }), signal: AbortSignal.timeout(env.ollamaTimeoutMs) }); } catch (error) { throw new AIProviderError('AI_UNAVAILABLE', error instanceof Error && error.name === 'TimeoutError' ? 'AI provider request timed out.' : 'AI provider unavailable.'); }
    if (!response.ok) { if (response.status === 404) throw new AIProviderError('AI_MODEL_UNAVAILABLE', 'Configured AI model unavailable.'); throw new AIProviderError('AI_PROVIDER_ERROR', `AI provider returned status ${response.status}.`); }
    const body = await response.json() as { response?: unknown };
    if (body.response === undefined || body.response === null) throw new AIProviderError('AI_INVALID_RESPONSE', 'AI provider returned no structured response.');
    const rawJson = extractStructuredJson(body.response);
    try { return JSON.parse(rawJson) as AIAnalysisResult; } catch { throw new AIProviderError('AI_INVALID_JSON', 'AI provider returned invalid JSON.'); }
  }
}