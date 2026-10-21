import { env } from '../config/env.js';
import { logEvent } from '../utils/lookup.js';
import type { AIAnalysisInput, AIAnalysisResult, AIProvider } from './types.js';

export class AIProviderError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'AIProviderError';
  }
}

export const investigationResultSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'summary',
    'rootCause',
    'hypotheses',
    'evidenceReferences',
    'reasoning',
    'impactExplanation',
    'predictionRealityExplanation',
    'recommendations',
    'limitations'
  ],
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

// Index of the bracket that closes the one at `start`, honouring strings and escapes; -1 if unbalanced.
function findMatchingClose(text: string, start: number): number {
  const open = text[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let cursor = start; cursor < text.length; cursor += 1) {
    const current = text[cursor];
    if (inString) {
      if (escaped) escaped = false;
      else if (current === '\\') escaped = true;
      else if (current === '"') inString = false;
      continue;
    }
    if (current === '"') inString = true;
    else if (current === open) depth += 1;
    else if (current === close) {
      depth -= 1;
      if (depth === 0) return cursor;
    }
  }
  return -1;
}

function parses(span: string): boolean {
  try {
    JSON.parse(span);
    return true;
  } catch {
    return false;
  }
}

/**
 * Finds the JSON value embedded in prose. Returns only OUTERMOST valid spans: once a span parses, the
 * scan resumes after it. The previous version collected every parseable span and rejected the response
 * if there was more than one -- but any valid response contains nested objects ("rootCause", each
 * hypothesis...) that each parse on their own, so the repair path rejected every input it was written
 * for. Several sibling spans (`{"a":1} ... {"b":2}`) are still genuinely ambiguous and still rejected.
 * See review 5.1.
 */
function findJsonCandidate(text: string): string | null {
  const found: string[] = [];
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === '{' || char === '[') {
      const end = findMatchingClose(text, index);
      if (end !== -1) {
        const span = text.slice(index, end + 1);
        if (parses(span)) {
          found.push(span);
          index = end + 1;
          continue;
        }
      }
    }
    index += 1;
  }
  if (found.length === 1) return found[0] ?? null;
  if (found.length > 1) throw new AIProviderError('AI_INVALID_JSON', 'AI provider returned ambiguous JSON output.');
  return null;
}

export function extractStructuredJson(raw: unknown): string {
  if (typeof raw !== 'string') {
    if (typeof raw === 'object' && raw !== null) {
      try {
        return JSON.stringify(raw);
      } catch {
        throw new AIProviderError('AI_INVALID_JSON', 'AI provider returned an unsupported structured payload.');
      }
    }
    throw new AIProviderError('AI_INVALID_JSON', 'AI provider returned no structured JSON payload.');
  }

  let candidate = raw.trim();
  if (!candidate) throw new AIProviderError('AI_INVALID_JSON', 'AI provider returned an empty JSON payload.');

  candidate = candidate.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '').trim();
  if (!candidate) throw new AIProviderError('AI_INVALID_JSON', 'AI provider returned only reasoning text.');

  const fenced = candidate.match(/^```(?:json)?\s*(\{[\s\S]*\}|\[[\s\S]*\])\s*```$/i);
  const fencedInner = fenced?.[1];
  if (fencedInner) {
    candidate = fencedInner.trim();
  }

  try {
    JSON.parse(candidate);
    return candidate;
  } catch {
    const nested = findJsonCandidate(candidate);
    if (nested) {
      // With `format` enforcing the schema this path should be rare; if it is not, the model or the
      // Ollama version is misbehaving and someone should know.
      logEvent('warn', 'AI_JSON_REPAIR', { message: 'Structured output needed repair before it would parse.' });
      return nested;
    }
    throw new AIProviderError('AI_INVALID_JSON', 'AI provider returned invalid or ambiguous JSON.');
  }
}

export class OllamaProvider implements AIProvider {
  readonly name = 'ollama';
  readonly model = env.ollamaModel;
  async health() {
    try {
      const response = await fetch(`${env.ollamaBaseUrl}/api/tags`, {
        signal: AbortSignal.timeout(Math.min(env.ollamaTimeoutMs, 5000))
      });
      if (!response.ok)
        return {
          available: false,
          provider: this.name,
          model: this.model,
          message: 'Configured AI model unavailable'
        };
      const body = (await response.json()) as { models?: Array<{ name?: string }> };
      const available = Boolean(
        body.models?.some((model) => model.name === this.model || model.name?.startsWith(`${this.model}:`))
      );
      return {
        available,
        provider: this.name,
        model: this.model,
        message: available ? 'AI provider available' : 'Configured AI model unavailable'
      };
    } catch {
      return { available: false, provider: this.name, model: this.model, message: 'AI provider unavailable' };
    }
  }
  async analyze(input: AIAnalysisInput): Promise<AIAnalysisResult> {
    let response: Response;
    try {
      // /api/chat, not /api/generate: generate takes ONE prompt string, so instructions and untrusted
      // evidence could not be kept apart. Chat takes role-separated messages. See review 5.5.
      response = await fetch(`${env.ollamaBaseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: input.prompt.system },
            { role: 'user', content: input.prompt.user }
          ],
          stream: false,
          think: false,
          options: { temperature: 0 },
          format: investigationResultSchema
        }),
        signal: AbortSignal.timeout(env.ollamaTimeoutMs)
      });
    } catch (error) {
      throw new AIProviderError(
        'AI_UNAVAILABLE',
        error instanceof Error && error.name === 'TimeoutError'
          ? 'AI provider request timed out.'
          : 'AI provider unavailable.'
      );
    }
    if (!response.ok) {
      if (response.status === 404)
        throw new AIProviderError('AI_MODEL_UNAVAILABLE', 'Configured AI model unavailable.');
      throw new AIProviderError('AI_PROVIDER_ERROR', `AI provider returned status ${response.status}.`);
    }
    let body: { message?: { content?: unknown } };
    try {
      body = (await response.json()) as { message?: { content?: unknown } };
    } catch {
      // Previously a raw SyntaxError escaped here and was relabelled "validation failed" upstream.
      throw new AIProviderError('AI_INVALID_RESPONSE', 'AI provider returned a malformed HTTP body.');
    }
    const content = body.message?.content;
    if (content === undefined || content === null)
      throw new AIProviderError('AI_INVALID_RESPONSE', 'AI provider returned no structured response.');
    const rawJson = extractStructuredJson(content);
    try {
      return JSON.parse(rawJson) as AIAnalysisResult;
    } catch {
      throw new AIProviderError('AI_INVALID_JSON', 'AI provider returned invalid JSON.');
    }
  }
}
