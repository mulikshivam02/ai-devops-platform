import { env } from '../src/config/env.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OllamaProvider } from '../src/ai/ollamaProvider.js';
import { validateAIResult } from '../src/ai/responseValidator.js';
import { AppError } from '../src/utils/app-error.js';
import { aiResponseLimits, isUnsafeRecommendation } from '../src/ai/responseValidator.js';

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
  reasoning: [{ statement: 'The change is a configuration scaling update.', type: 'fact' as const }],
  impactExplanation: 'Scaling the app increases capacity and may reduce overload risk.',
  predictionRealityExplanation: 'No prediction or observed impact data was supplied for this adjustment.',
  recommendations: [],
  limitations: ['Insufficient evidence.']
};

const testPrompt = { system: 'SYSTEM-CONTRACT', user: 'USER-DATA' };

const emptyContext = {
  change: {
    id: 'c1',
    summary: 'Replicas increased',
    changeType: 'configuration',
    source: 'manual',
    resourceId: 'r1',
    evidenceIds: []
  },
  resource: { id: 'r1', name: 'demo-service', type: 'kubernetes_service' },
  dependencies: [],
  evidence: [],
  securityFindings: [],
  historicalIntelligence: {
    similarChanges: [],
    riskTrend: { status: 'insufficient_evidence' },
    predictionAccuracy: { status: 'insufficient_evidence' },
    patterns: []
  },
  history: []
};

describe('Ollama structured output handling', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts <think> block followed by valid JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          message: {
            role: 'assistant',
            content: `<think>The model is reasoning.</think>\n\n${JSON.stringify(validAiResult)}`
          }
        })
      })
    );

    const result = await new OllamaProvider().analyze({
      type: 'change_analysis',
      context: emptyContext,
      prompt: testPrompt
    });
    expect(result.summary).toBe(validAiResult.summary);
    expect(result.hypotheses[0].title).toBe('Demand increase');
  });

  it('accepts a single fenced JSON block', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          message: { role: 'assistant', content: `\`\`\`json\n${JSON.stringify(validAiResult)}\n\`\`\`` }
        })
      })
    );

    const result = await new OllamaProvider().analyze({
      type: 'change_analysis',
      context: emptyContext,
      prompt: testPrompt
    });
    expect(result.summary).toBe(validAiResult.summary);
  });

  it('rejects ambiguous JSON/prose output', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          message: {
            role: 'assistant',
            content: `Here is the result: {"summary":"x"} and some trailing braces {"other":1}`
          }
        })
      })
    );

    await expect(
      new OllamaProvider().analyze({ type: 'change_analysis', context: emptyContext, prompt: testPrompt })
    ).rejects.toMatchObject({
      name: 'AIProviderError',
      code: 'AI_INVALID_JSON'
    });
  });

  it('rejects malformed JSON output', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ message: { role: 'assistant', content: '{not valid json' } })
      })
    );

    await expect(
      new OllamaProvider().analyze({ type: 'change_analysis', context: emptyContext, prompt: testPrompt })
    ).rejects.toMatchObject({
      name: 'AIProviderError',
      code: 'AI_INVALID_JSON'
    });
  });
});

describe('AI validation guardrails', () => {
  it('rejects hypothesis returned as a string', () => {
    expect(() =>
      validateAIResult(
        {
          summary: 'x',
          rootCause: { statement: 'x', confidence: 80, evidenceIds: [] },
          hypotheses: ['bad'],
          evidenceReferences: [],
          reasoning: [{ statement: 'x', type: 'fact' }],
          impactExplanation: 'x',
          predictionRealityExplanation: 'x',
          recommendations: [],
          limitations: []
        },
        new Set()
      )
    ).toThrow(AppError);
  });

  it('rejects hypothesis missing title', () => {
    expect(() =>
      validateAIResult(
        {
          summary: 'x',
          rootCause: { statement: 'x', confidence: 80, evidenceIds: [] },
          hypotheses: [{ explanation: 'bad', confidence: 50, supportingEvidenceIds: [], contradictingEvidenceIds: [] }],
          evidenceReferences: [],
          reasoning: [{ statement: 'x', type: 'fact' }],
          impactExplanation: 'x',
          predictionRealityExplanation: 'x',
          recommendations: [],
          limitations: []
        },
        new Set()
      )
    ).toThrow(AppError);
  });

  it('rejects hypothesis missing explanation', () => {
    expect(() =>
      validateAIResult(
        {
          summary: 'x',
          rootCause: { statement: 'x', confidence: 80, evidenceIds: [] },
          hypotheses: [{ title: 't', confidence: 50, supportingEvidenceIds: [], contradictingEvidenceIds: [] }],
          evidenceReferences: [],
          reasoning: [{ statement: 'x', type: 'fact' }],
          impactExplanation: 'x',
          predictionRealityExplanation: 'x',
          recommendations: [],
          limitations: []
        },
        new Set()
      )
    ).toThrow(AppError);
  });

  it('rejects fractional confidence on a hypothesis', () => {
    expect(() =>
      validateAIResult(
        {
          summary: 'x',
          rootCause: { statement: 'x', confidence: 80, evidenceIds: [] },
          hypotheses: [
            { title: 't', explanation: 'e', confidence: 50.5, supportingEvidenceIds: [], contradictingEvidenceIds: [] }
          ],
          evidenceReferences: [],
          reasoning: [{ statement: 'x', type: 'fact' }],
          impactExplanation: 'x',
          predictionRealityExplanation: 'x',
          recommendations: [],
          limitations: []
        },
        new Set()
      )
    ).toThrow(AppError);
  });

  it('rejects confidence outside 0-100', () => {
    expect(() =>
      validateAIResult(
        {
          summary: 'x',
          rootCause: { statement: 'x', confidence: 101, evidenceIds: [] },
          hypotheses: [],
          evidenceReferences: [],
          reasoning: [{ statement: 'x', type: 'fact' }],
          impactExplanation: 'x',
          predictionRealityExplanation: 'x',
          recommendations: [],
          limitations: []
        },
        new Set()
      )
    ).toThrow(AppError);
  });

  it('rejects reasoning returned as a string', () => {
    expect(() =>
      validateAIResult(
        {
          summary: 'x',
          rootCause: { statement: 'x', confidence: 60, evidenceIds: [] },
          hypotheses: [],
          evidenceReferences: [],
          reasoning: 'bad',
          impactExplanation: 'x',
          predictionRealityExplanation: 'x',
          recommendations: [],
          limitations: []
        },
        new Set()
      )
    ).toThrow(AppError);
  });

  it('allows benign review of deployment history when marked safe', () => {
    expect(
      validateAIResult(
        {
          summary: 'x',
          rootCause: { statement: 'x', confidence: 60, evidenceIds: [] },
          hypotheses: [],
          evidenceReferences: [],
          reasoning: [{ statement: 'x', type: 'fact' }],
          impactExplanation: 'x',
          predictionRealityExplanation: 'x',
          recommendations: [
            {
              title: 'Review historical deployment patterns',
              explanation: 'Compare prior deployment outcomes for context.',
              priority: 'low',
              safe: true,
              supportingEvidenceIds: []
            }
          ],
          limitations: []
        },
        new Set()
      ).recommendations[0].safe
    ).toBe(true);
  });
});

describe('Ollama provider request construction', () => {
  it('sends a strict schema with model, stream false, and timeout preserved', async () => {
    // config/env.ts reads its values once at import, so assigning process.env here never changed the
    // model the provider uses -- the test only passed when a local server/.env happened to say qwen3:8b,
    // and failed in CI. Assert against the configured model instead of a hard-coded name.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: { role: 'assistant', content: JSON.stringify(validAiResult) } })
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await new OllamaProvider().analyze({
      type: 'change_analysis',
      context: emptyContext,
      prompt: testPrompt
    });
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);

    expect(result.summary).toBe(validAiResult.summary);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/chat$/);
    expect(requestBody.messages).toEqual([
      { role: 'system', content: 'SYSTEM-CONTRACT' },
      { role: 'user', content: 'USER-DATA' }
    ]);
    expect(requestBody.prompt).toBeUndefined();
    expect(requestBody.model).toBe(env.ollamaModel);
    expect(requestBody.stream).toBe(false);
    expect(requestBody.think).toBe(false);
    expect(requestBody.options.temperature).toBe(0);
    expect(requestBody.format.type).toBe('object');
    expect(requestBody.format.required).toContain('hypotheses');
    expect(requestBody.format.properties.hypotheses.items.properties.confidence.minimum).toBe(0);
    expect(requestBody.format.properties.hypotheses.items.properties.confidence.maximum).toBe(100);
  });
});

function chatResponse(content: string) {
  return vi.fn().mockResolvedValue({ ok: true, json: async () => ({ message: { role: 'assistant', content } }) });
}

describe('Ollama JSON extraction (plan 5.1)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('repairs prose-wrapped output even though the answer contains nested objects', async () => {
    // Every valid response contains nested objects (rootCause, hypotheses[i], ...) that each parse on
    // their own. The old "reject if more than one parseable span" rule therefore rejected EVERY
    // response that needed repair.
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal(
      'fetch',
      chatResponse(`Sure! Here is the analysis:\n${JSON.stringify(validAiResult)}\nHope that helps.`)
    );

    const result = await new OllamaProvider().analyze({
      type: 'change_analysis',
      context: emptyContext,
      prompt: testPrompt
    });

    expect(result.rootCause.confidence).toBe(75);
    expect(result.hypotheses).toHaveLength(1);
    expect(log.mock.calls.some(([line]) => String(line).includes('AI_JSON_REPAIR'))).toBe(true);
  });

  it('does not log a repair when structured output arrives clean', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', chatResponse(JSON.stringify(validAiResult)));

    await new OllamaProvider().analyze({ type: 'change_analysis', context: emptyContext, prompt: testPrompt });

    expect(log.mock.calls.some(([line]) => String(line).includes('AI_JSON_REPAIR'))).toBe(false);
  });

  it('keeps braces inside strings from confusing the span finder', async () => {
    const tricky = { ...validAiResult, summary: 'Config {"a": 1} was changed } oddly {' };
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', chatResponse(`Result: ${JSON.stringify(tricky)} done`));

    const result = await new OllamaProvider().analyze({
      type: 'change_analysis',
      context: emptyContext,
      prompt: testPrompt
    });

    expect(result.summary).toBe(tricky.summary);
  });

  it('still rejects two separate top-level objects as ambiguous', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal(
      'fetch',
      chatResponse(`First ${JSON.stringify(validAiResult)} second ${JSON.stringify(validAiResult)}`)
    );

    await expect(
      new OllamaProvider().analyze({ type: 'change_analysis', context: emptyContext, prompt: testPrompt })
    ).rejects.toMatchObject({ code: 'AI_INVALID_JSON' });
  });

  it('reports a non-JSON HTTP body as an AI error, not a raw SyntaxError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new SyntaxError('Unexpected token <');
        }
      })
    );

    await expect(
      new OllamaProvider().analyze({ type: 'change_analysis', context: emptyContext, prompt: testPrompt })
    ).rejects.toMatchObject({ name: 'AIProviderError', code: 'AI_INVALID_RESPONSE' });
  });

  it('exposes the model it actually calls', () => {
    expect(new OllamaProvider().model).toBe(env.ollamaModel);
  });
});

function resultWith(overrides: Record<string, unknown>) {
  return { ...validAiResult, ...overrides };
}

describe('AI validation partial-failure tolerance (plan 5.2)', () => {
  it('drops an unknown evidence ID instead of discarding the analysis, and says so', () => {
    const result = validateAIResult(
      resultWith({
        rootCause: { statement: 'x', confidence: 65, evidenceIds: ['e1', 'made-up'] },
        evidenceReferences: ['e1', 'also-made-up', 'also-made-up2']
      }),
      new Set(['e1'])
    );

    expect(result.rootCause.evidenceIds).toEqual(['e1']);
    expect(result.evidenceReferences).toEqual(['e1']);
    expect(result.limitations.join('\n')).toContain(
      '1 unrecognised evidence reference(s) removed from rootCause.evidenceIds'
    );
    expect(result.limitations.join('\n')).toContain(
      '2 unrecognised evidence reference(s) removed from evidenceReferences'
    );
    // The model's own limitation is preserved ahead of ours.
    expect(result.limitations[0]).toBe('Insufficient evidence.');
  });

  it('never lets an unknown ID through to the stored result', () => {
    const result = validateAIResult(
      resultWith({
        hypotheses: [
          {
            title: 't',
            explanation: 'e',
            confidence: 50,
            supportingEvidenceIds: ['e1', 'ghost'],
            contradictingEvidenceIds: ['ghost']
          }
        ],
        recommendations: [
          {
            title: 'Look',
            explanation: 'Read logs.',
            priority: 'low',
            safe: true,
            supportingEvidenceIds: ['ghost', 'e1']
          }
        ]
      }),
      new Set(['e1'])
    );

    expect(result.hypotheses[0]?.supportingEvidenceIds).toEqual(['e1']);
    expect(result.hypotheses[0]?.contradictingEvidenceIds).toEqual([]);
    expect(result.recommendations[0]?.supportingEvidenceIds).toEqual(['e1']);
  });

  it('drops non-string evidence entries as unrecognised', () => {
    const result = validateAIResult(
      resultWith({ evidenceReferences: ['e1', 42, null, { id: 'e1' }] }),
      new Set(['e1'])
    );

    expect(result.evidenceReferences).toEqual(['e1']);
    expect(result.limitations.join('\n')).toContain('3 unrecognised');
  });

  it('still requires evidence ID fields to be arrays', () => {
    expect(() => validateAIResult(resultWith({ evidenceReferences: 'e1' }), new Set(['e1']))).toThrow(AppError);
  });

  it('forces safe=false for an unsafe recommendation instead of throwing a 502', () => {
    const result = validateAIResult(
      resultWith({
        recommendations: [
          {
            title: 'Run kubectl rollout restart',
            explanation: 'Restart the deployment now.',
            priority: 'high',
            safe: true,
            supportingEvidenceIds: []
          },
          {
            title: 'Read the logs',
            explanation: 'Check error rates.',
            priority: 'low',
            safe: true,
            supportingEvidenceIds: []
          }
        ]
      }),
      new Set()
    );

    expect(result.recommendations[0]?.safe).toBe(false);
    expect(result.recommendations[1]?.safe).toBe(true);
    expect(result.limitations.join('\n')).toContain('recommendations[0]');
    expect(result.limitations.join('\n')).toContain('safe was set to false');
  });

  it('never upgrades safe=false to true', () => {
    const result = validateAIResult(
      resultWith({
        recommendations: [
          { title: 'Read the logs', explanation: 'Check.', priority: 'low', safe: false, supportingEvidenceIds: [] }
        ]
      }),
      new Set()
    );

    expect(result.recommendations[0]?.safe).toBe(false);
  });

  it('treats benign uses of apply/deploy/scale as safe, but commands and destructive verbs as unsafe', () => {
    expect(isUnsafeRecommendation('Apply the same review checklist to the scale of this deploy history')).toBe(false);
    expect(isUnsafeRecommendation('Run kubectl get pods')).toBe(true);
    expect(isUnsafeRecommendation('terraform plan the module')).toBe(true);
    expect(isUnsafeRecommendation('Delete the stale deployment')).toBe(true);
    expect(isUnsafeRecommendation('Consider a rollback')).toBe(true);
  });

  it('keeps benign text containing "apply" safe', () => {
    const result = validateAIResult(
      resultWith({
        recommendations: [
          {
            title: 'Apply lessons from earlier changes',
            explanation: 'The scale of impact looks similar to prior deployments.',
            priority: 'low',
            safe: true,
            supportingEvidenceIds: []
          }
        ]
      }),
      new Set()
    );

    expect(result.recommendations[0]?.safe).toBe(true);
    expect(result.limitations).toEqual(['Insufficient evidence.']);
  });

  it('truncates over-long strings and trims over-long arrays, recording both', () => {
    const many = Array.from({ length: aiResponseLimits.maxItems + 5 }, (_, i) => ({
      title: `h${i}`,
      explanation: 'e',
      confidence: 10,
      supportingEvidenceIds: [],
      contradictingEvidenceIds: []
    }));

    const result = validateAIResult(
      resultWith({
        summary: 's'.repeat(aiResponseLimits.summary + 500),
        impactExplanation: 'i'.repeat(aiResponseLimits.explanation + 1),
        hypotheses: many
      }),
      new Set()
    );

    expect(result.summary).toHaveLength(aiResponseLimits.summary);
    expect(result.impactExplanation).toHaveLength(aiResponseLimits.explanation);
    expect(result.hypotheses).toHaveLength(aiResponseLimits.maxItems);
    expect(result.limitations.join('\n')).toContain('summary was truncated');
    expect(result.limitations.join('\n')).toContain('hypotheses had 25 items');
  });

  it('bounds the number of warnings it adds', () => {
    const ids = Array.from({ length: 30 }, (_, i) => `ghost${i}`);
    const hypotheses = Array.from({ length: 15 }, () => ({
      title: 't',
      explanation: 'e',
      confidence: 1,
      supportingEvidenceIds: ids,
      contradictingEvidenceIds: ids
    }));

    const result = validateAIResult(resultWith({ hypotheses }), new Set());

    expect(result.limitations.length).toBeLessThanOrEqual(1 + aiResponseLimits.maxWarnings + 1);
    expect(result.limitations.at(-1)).toContain('further response-validation warning');
  });

  it('caps an over-long limitations array and over-long limitation strings', () => {
    const result = validateAIResult(
      resultWith({ limitations: Array.from({ length: 30 }, () => 'l'.repeat(aiResponseLimits.shortText + 10)) }),
      new Set()
    );

    expect(
      result.limitations.slice(0, aiResponseLimits.maxItems).every((l) => l.length <= aiResponseLimits.shortText)
    ).toBe(true);
    expect(result.limitations.join('\n')).toContain('limitations had 30 items');
  });

  it('tags validation failures with a stable error code', () => {
    try {
      validateAIResult(resultWith({ summary: '' }), new Set());
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).statusCode).toBe(502);
      expect((error as AppError).code).toBe('AI_INVALID_RESPONSE');
    }
  });

  it('rejects arrays where objects are expected', () => {
    expect(() => validateAIResult([validAiResult], new Set())).toThrow(AppError);
    expect(() => validateAIResult(resultWith({ rootCause: [] }), new Set())).toThrow(AppError);
  });
});
