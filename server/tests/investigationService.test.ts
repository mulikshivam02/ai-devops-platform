import { beforeEach, describe, expect, it, vi } from 'vitest';

const OID = (n: number) => n.toString(16).padStart(24, '0');
const CHANGE_ID = OID(1);

const models = vi.hoisted(() => ({
  change: { findById: vi.fn() },
  investigation: { create: vi.fn() }
}));
const contextBuilder = vi.hoisted(() => ({ buildInvestigationContext: vi.fn() }));
const providerModule = vi.hoisted(() => ({ getAIProvider: vi.fn() }));

vi.mock('../src/models/Change.js', () => ({ ChangeModel: models.change }));
vi.mock('../src/models/Investigation.js', () => ({
  InvestigationModel: models.investigation,
  toInvestigationDTO: (doc: Record<string, unknown>) => doc
}));
vi.mock('../src/ai/contextBuilder.js', () => contextBuilder);
vi.mock('../src/ai/provider.js', () => providerModule);

const { investigateChange } = await import('../src/services/investigationService.js');
const { AIProviderError } = await import('../src/ai/ollamaProvider.js');
const { AppError } = await import('../src/utils/app-error.js');

const context = {
  change: {
    id: CHANGE_ID,
    summary: 's',
    changeType: 'deployment',
    source: 'github',
    resourceId: OID(2),
    evidenceIds: []
  },
  resource: { id: OID(2), name: 'svc', type: 'kubernetes_deployment' },
  dependencies: [],
  evidence: [
    { id: OID(10), type: 'commit', source: 'github', timestamp: '2026-09-01T00:00:00.000Z', payload: {}, metadata: {} }
  ],
  securityFindings: [],
  historicalIntelligence: {
    similarChanges: [],
    riskTrend: { status: 'insufficient_evidence' },
    predictionAccuracy: { status: 'insufficient_evidence' },
    patterns: [],
    lookupErrors: []
  },
  history: []
};

const goodResult = {
  summary: 'Deployment updated',
  rootCause: { statement: 'Config change', confidence: 70, evidenceIds: [OID(10)] },
  hypotheses: [],
  evidenceReferences: [OID(10)],
  reasoning: [{ statement: 'x', type: 'fact' }],
  impactExplanation: 'i',
  predictionRealityExplanation: 'p',
  recommendations: [],
  limitations: []
};

function provider(analyze: () => Promise<unknown>) {
  return { name: 'ollama', model: 'qwen-from-provider', analyze: vi.fn(analyze), health: vi.fn() };
}

const created = () => models.investigation.create.mock.calls.map(([doc]) => doc as Record<string, any>);

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  models.change.findById.mockReset().mockResolvedValue({ _id: CHANGE_ID, resourceId: OID(2) });
  models.investigation.create
    .mockReset()
    .mockImplementation(async (doc: Record<string, unknown>) => ({ id: 'inv', ...doc }));
  contextBuilder.buildInvestigationContext.mockReset().mockResolvedValue(context);
  providerModule.getAIProvider.mockReset();
});

describe('investigateChange', () => {
  it('records the model the provider actually used, not an env guess', async () => {
    vi.stubEnv('OLLAMA_MODEL', 'something-else');
    providerModule.getAIProvider.mockReturnValue(provider(async () => goodResult));

    await investigateChange(CHANGE_ID);

    expect(created()[0]).toMatchObject({ status: 'completed', provider: 'ollama', model: 'qwen-from-provider' });
    vi.unstubAllEnvs();
  });

  it('builds the context once and reuses it', async () => {
    providerModule.getAIProvider.mockReturnValue(provider(async () => goodResult));

    await investigateChange(CHANGE_ID);

    expect(contextBuilder.buildInvestigationContext).toHaveBeenCalledTimes(1);
  });

  it('sends the model a system/user prompt pair', async () => {
    const p = provider(async () => goodResult);
    providerModule.getAIProvider.mockReturnValue(p);

    await investigateChange(CHANGE_ID);

    const input = (p.analyze.mock.calls[0] as unknown as [{ prompt: { system: string; user: string } }])[0];

    expect(input.prompt.system).toContain('STRICT OUTPUT CONTRACT');
    expect(input.prompt.user).toContain(OID(10));
  });

  it('completes with a limitation, not a 502, when the model cites evidence that does not exist', async () => {
    providerModule.getAIProvider.mockReturnValue(
      provider(async () => ({ ...goodResult, evidenceReferences: [OID(10), OID(99)] }))
    );

    await investigateChange(CHANGE_ID);

    const stored = created()[0] as Record<string, any>;

    expect(stored.status).toBe('completed');
    expect(stored.limitations.join(' ')).toContain('unrecognised evidence reference');
    expect(stored.rootCause.evidenceIds).toHaveLength(1);
  });

  it('maps a provider failure to 503, keeps the provider code and cause, and records the failure', async () => {
    const cause = new AIProviderError('AI_UNAVAILABLE', 'AI provider unavailable.');
    providerModule.getAIProvider.mockReturnValue(
      provider(async () => {
        throw cause;
      })
    );

    const error = await investigateChange(CHANGE_ID).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ statusCode: 503, code: 'AI_UNAVAILABLE', cause });
    expect(created()[0]).toMatchObject({ status: 'failed', errorCode: 'AI_UNAVAILABLE', model: 'qwen-from-provider' });
  });

  it('keeps validation errors as 502 with their own code', async () => {
    providerModule.getAIProvider.mockReturnValue(provider(async () => ({ ...goodResult, summary: '' })));

    const error = await investigateChange(CHANGE_ID).catch((e: unknown) => e);

    expect(error).toMatchObject({ statusCode: 502, code: 'AI_INVALID_RESPONSE' });
    expect(created()[0]).toMatchObject({ status: 'failed', errorCode: 'AI_INVALID_RESPONSE' });
  });

  it('does not relabel an unexpected error as "validation failed": keeps it as the cause', async () => {
    const bug = new TypeError('cannot read properties of undefined');
    providerModule.getAIProvider.mockReturnValue(
      provider(async () => {
        throw bug;
      })
    );

    const error = await investigateChange(CHANGE_ID).catch((e: unknown) => e);

    expect(error).toMatchObject({ statusCode: 502, code: 'AI_UNEXPECTED_ERROR', cause: bug });
    expect((error as Error).message).not.toMatch(/validation/i);
    expect(created()[0]).toMatchObject({ errorCode: 'AI_UNEXPECTED_ERROR' });
  });

  it('logs the original error with its detail', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    providerModule.getAIProvider.mockReturnValue(
      provider(async () => {
        throw new TypeError('very specific bug message');
      })
    );

    await investigateChange(CHANGE_ID).catch(() => undefined);

    const lines = log.mock.calls.map(([line]) => String(line)).join('\n');

    expect(lines).toContain('INVESTIGATION_FAILED');
    expect(lines).toContain('very specific bug message');
  });

  it('throws the ORIGINAL error when recording the failure also fails', async () => {
    providerModule.getAIProvider.mockReturnValue(
      provider(async () => {
        throw new AIProviderError('AI_UNAVAILABLE', 'AI provider unavailable.');
      })
    );
    models.investigation.create.mockRejectedValue(new Error('mongo is down'));

    const error = await investigateChange(CHANGE_ID).catch((e: unknown) => e);

    expect(error).toMatchObject({ statusCode: 503, code: 'AI_UNAVAILABLE' });
    expect((error as Error).message).not.toContain('mongo');
  });

  it('does not record a successful analysis as an AI failure when saving it fails', async () => {
    providerModule.getAIProvider.mockReturnValue(provider(async () => goodResult));
    models.investigation.create.mockRejectedValueOnce(new Error('write conflict'));

    const error = await investigateChange(CHANGE_ID).catch((e: unknown) => e);

    expect(error).toMatchObject({ message: 'write conflict' });
    expect(models.investigation.create).toHaveBeenCalledTimes(1);
    expect(created().some((doc) => doc.status === 'failed')).toBe(false);
  });

  it('returns 404 for an unknown change without calling the provider', async () => {
    const p = provider(async () => goodResult);
    providerModule.getAIProvider.mockReturnValue(p);
    models.change.findById.mockResolvedValue(null);

    await expect(investigateChange(CHANGE_ID)).rejects.toMatchObject({ statusCode: 404 });
    expect(p.analyze).not.toHaveBeenCalled();
  });
});
