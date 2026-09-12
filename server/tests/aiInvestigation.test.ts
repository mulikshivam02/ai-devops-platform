import { afterEach, describe, expect, it, vi } from 'vitest';
import { AIProviderError, OllamaProvider } from '../src/ai/ollamaProvider.js';
import { validateAIResult } from '../src/ai/responseValidator.js';
import { AppError } from '../src/utils/app-error.js';

const validAiResult = {
  summary: 'Increase application replicas from 2 to 5',
  rootCause: {
    statement: 'The change increased capacity to improve availability and handle higher demand.',
    confidence: 75,
    evidenceIds: []
  },
  hypotheses: [
    {
      title: 'Demand increase',
      explanation: 'The system was scaled to support a higher load.',
      confidence: 72,
      supportingEvidenceIds: [],
      contradictingEvidenceIds: []
    }
  ],
  evidenceReferences: [],
  reasoning: [
    { statement: 'The change is a configuration scaling update.', type: 'fact' as const }
  ],
  impactExplanation: 'Scaling the app increases capacity and may reduce overload risk.',
  predictionRealityExplanation: 'No prediction or observed impact data was supplied for this adjustment.',
  recommendations: [],
  limitations: ['Insufficient evidence.']
};

const emptyContext = {
  change: { id: 'c1', summary: 'Replicas increased', changeType: 'configuration', source: 'manual', resourceId: 'r1', evidenceIds: [] },
  resource: { id: 'r1', name: 'demo-service', type: 'kubernetes_service' },
  dependencies: [],
  evidence: [],
  securityFindings: [],
  historicalIntelligence: { similarChanges: [], riskTrend: { status: 'insufficient_evidence' }, predictionAccuracy: { status: 'insufficient_evidence' }, patterns: [] },
  history: []
};

describe('Ollama structured output handling', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('accepts <think> block followed by valid JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: `<think>The model is reasoning.</think>\n\n${JSON.stringify(validAiResult)}` })
    }));

    const result = await new OllamaProvider().analyze({ type: 'change_analysis', context: emptyContext, prompt: 'prompt' });
    expect(result.summary).toBe(validAiResult.summary);
    expect(result.hypotheses[0].title).toBe('Demand increase');
  });

  it('accepts a single fenced JSON block', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: `\`\`\`json\n${JSON.stringify(validAiResult)}\n\`\`\`` })
    }));

    const result = await new OllamaProvider().analyze({ type: 'change_analysis', context: emptyContext, prompt: 'prompt' });
    expect(result.summary).toBe(validAiResult.summary);
  });

  it('rejects ambiguous JSON/prose output', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: `Here is the result: {"summary":"x"} and some trailing braces {"other":1}` })
    }));

    await expect(new OllamaProvider().analyze({ type: 'change_analysis', context: emptyContext, prompt: 'prompt' })).rejects.toMatchObject({
      name: 'AIProviderError',
      code: 'AI_INVALID_JSON'
    });
  });

  it('rejects malformed JSON output', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: '{not valid json' })
    }));

    await expect(new OllamaProvider().analyze({ type: 'change_analysis', context: emptyContext, prompt: 'prompt' })).rejects.toMatchObject({
      name: 'AIProviderError',
      code: 'AI_INVALID_JSON'
    });
  });
});

describe('AI validation guardrails', () => {
  it('rejects hypothesis returned as a string', () => {
    expect(() => validateAIResult({
      summary: 'x',
      rootCause: { statement: 'x', confidence: 80, evidenceIds: [] },
      hypotheses: ['bad'],
      evidenceReferences: [],
      reasoning: [{ statement: 'x', type: 'fact' }],
      impactExplanation: 'x',
      predictionRealityExplanation: 'x',
      recommendations: [],
      limitations: []
    }, new Set())).toThrow(AppError);
  });

  it('rejects hypothesis missing title', () => {
    expect(() => validateAIResult({
      summary: 'x',
      rootCause: { statement: 'x', confidence: 80, evidenceIds: [] },
      hypotheses: [{ explanation: 'bad', confidence: 50, supportingEvidenceIds: [], contradictingEvidenceIds: [] }],
      evidenceReferences: [],
      reasoning: [{ statement: 'x', type: 'fact' }],
      impactExplanation: 'x',
      predictionRealityExplanation: 'x',
      recommendations: [],
      limitations: []
    }, new Set())).toThrow(AppError);
  });

  it('rejects hypothesis missing explanation', () => {
    expect(() => validateAIResult({
      summary: 'x',
      rootCause: { statement: 'x', confidence: 80, evidenceIds: [] },
      hypotheses: [{ title: 't', confidence: 50, supportingEvidenceIds: [], contradictingEvidenceIds: [] }],
      evidenceReferences: [],
      reasoning: [{ statement: 'x', type: 'fact' }],
      impactExplanation: 'x',
      predictionRealityExplanation: 'x',
      recommendations: [],
      limitations: []
    }, new Set())).toThrow(AppError);
  });

  it('rejects fractional confidence on a hypothesis', () => {
    expect(() => validateAIResult({
      summary: 'x',
      rootCause: { statement: 'x', confidence: 80, evidenceIds: [] },
      hypotheses: [{ title: 't', explanation: 'e', confidence: 50.5, supportingEvidenceIds: [], contradictingEvidenceIds: [] }],
      evidenceReferences: [],
      reasoning: [{ statement: 'x', type: 'fact' }],
      impactExplanation: 'x',
      predictionRealityExplanation: 'x',
      recommendations: [],
      limitations: []
    }, new Set())).toThrow(AppError);
  });

  it('rejects confidence outside 0-100', () => {
    expect(() => validateAIResult({
      summary: 'x',
      rootCause: { statement: 'x', confidence: 101, evidenceIds: [] },
      hypotheses: [],
      evidenceReferences: [],
      reasoning: [{ statement: 'x', type: 'fact' }],
      impactExplanation: 'x',
      predictionRealityExplanation: 'x',
      recommendations: [],
      limitations: []
    }, new Set())).toThrow(AppError);
  });

  it('rejects unknown evidence IDs', () => {
    expect(() => validateAIResult({
      summary: 'x',
      rootCause: { statement: 'x', confidence: 65, evidenceIds: ['unknown-id'] },
      hypotheses: [],
      evidenceReferences: [],
      reasoning: [{ statement: 'x', type: 'fact' }],
      impactExplanation: 'x',
      predictionRealityExplanation: 'x',
      recommendations: [],
      limitations: []
    }, new Set())).toThrow(AppError);
  });

  it('rejects reasoning returned as a string', () => {
    expect(() => validateAIResult({
      summary: 'x',
      rootCause: { statement: 'x', confidence: 60, evidenceIds: [] },
      hypotheses: [],
      evidenceReferences: [],
      reasoning: 'bad',
      impactExplanation: 'x',
      predictionRealityExplanation: 'x',
      recommendations: [],
      limitations: []
    }, new Set())).toThrow(AppError);
  });

  it('rejects unsafe recommendation marked safe=true', () => {
    expect(() => validateAIResult({
      summary: 'x',
      rootCause: { statement: 'x', confidence: 60, evidenceIds: [] },
      hypotheses: [],
      evidenceReferences: [],
      reasoning: [{ statement: 'x', type: 'fact' }],
      impactExplanation: 'x',
      predictionRealityExplanation: 'x',
      recommendations: [{ title: 'Deploy the change', explanation: 'Apply the rollout to production now.', priority: 'high', safe: true, supportingEvidenceIds: [] }],
      limitations: []
    }, new Set())).toThrow(AppError);
  });

  it('allows benign review of deployment history when marked safe', () => {
    expect(validateAIResult({
      summary: 'x',
      rootCause: { statement: 'x', confidence: 60, evidenceIds: [] },
      hypotheses: [],
      evidenceReferences: [],
      reasoning: [{ statement: 'x', type: 'fact' }],
      impactExplanation: 'x',
      predictionRealityExplanation: 'x',
      recommendations: [{ title: 'Review historical deployment patterns', explanation: 'Compare prior deployment outcomes for context.', priority: 'low', safe: true, supportingEvidenceIds: [] }],
      limitations: []
    }, new Set()).recommendations[0].safe).toBe(true);
  });
});

describe('Ollama provider request construction', () => {
  it('sends a strict schema with model, stream false, and timeout preserved', async () => {
    process.env.OLLAMA_BASE_URL = 'http://localhost:11434';
    process.env.OLLAMA_MODEL = 'qwen3:8b';
    process.env.OLLAMA_TIMEOUT_MS = '30000';

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: JSON.stringify(validAiResult) })
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await new OllamaProvider().analyze({ type: 'change_analysis', context: emptyContext, prompt: 'prompt' });
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);

    expect(result.summary).toBe(validAiResult.summary);
    expect(requestBody.model).toBe('qwen3:8b');
    expect(requestBody.stream).toBe(false);
    expect(requestBody.think).toBe(false);
    expect(requestBody.options.temperature).toBe(0);
    expect(requestBody.format.type).toBe('object');
    expect(requestBody.format.required).toContain('hypotheses');
    expect(requestBody.format.properties.hypotheses.items.properties.confidence.minimum).toBe(0);
    expect(requestBody.format.properties.hypotheses.items.properties.confidence.maximum).toBe(100);
  });
});
