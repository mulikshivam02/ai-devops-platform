import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './helpers/api.js';

const history = vi.hoisted(() => ({ getHistoricalSummary: vi.fn(), getHistoricalAccuracy: vi.fn() }));
const similar = vi.hoisted(() => ({ findSimilarChanges: vi.fn() }));
const outcomeModel = vi.hoisted(() => ({ find: vi.fn() }));
vi.mock('../src/intelligence/historical-outcome.service.js', () => history);
vi.mock('../src/intelligence/historical-intelligence.service.js', () => similar);
vi.mock('../src/models/HistoricalOutcome.js', () => ({
  HistoricalOutcomeModel: outcomeModel,
  toHistoricalOutcomeDTO: (value: unknown) => value
}));
const { app } = await import('../src/server.js');

beforeEach(() => {
  vi.clearAllMocks();
  outcomeModel.find.mockReturnValue({ sort: () => ({ limit: async () => [] }) });
  history.getHistoricalSummary.mockResolvedValue({
    completedEvaluations: 2,
    averageAccuracy: 75,
    outcomeDistribution: { predicted_and_observed: 1, unexpected_impact: 1 },
    accuracyDistribution: { high: 1, medium: 1 },
    evidenceQualityDistribution: { high: 1, medium: 1 },
    commonUnexpectedImpacts: ['availability'],
    commonPartiallyPredicted: []
  });
  history.getHistoricalAccuracy.mockResolvedValue({
    accuracy: { outcome: 100, impact: 80, resources: null, failureModes: null, overall: 90, accuracyVersion: '1.0' },
    evidenceQuality: 'high'
  });
  similar.findSimilarChanges.mockResolvedValue([
    {
      changeId: '507f1f77bcf86cd799439011',
      similarityScore: 80,
      matchingFactors: ['same resource'],
      differences: [],
      outcome: 'successful',
      evidenceIds: []
    }
  ]);
});

describe('historical intelligence API', () => {
  it('returns bounded historical summary, similarity, and accuracy without secrets', async () => {
    const summary = await api(app).get('/api/intelligence/history/summary');
    const similarResponse = await api(app).get('/api/intelligence/history/similar/507f1f77bcf86cd799439011');
    const accuracy = await api(app).get('/api/intelligence/history/accuracy/507f1f77bcf86cd799439011');
    expect(summary.status).toBe(200);
    expect(summary.body.data.completedEvaluations).toBe(2);
    expect(similarResponse.status).toBe(200);
    expect(similarResponse.body.data).toHaveLength(1);
    expect(accuracy.body.data.accuracy.overall).toBe(90);
    expect(JSON.stringify(summary.body)).not.toContain('token');
  });

  it('keeps viewer access read-only through the shared API boundary', async () => {
    const { authorize } = await import('../src/middleware/auth.middleware.js');
    const next = vi.fn();
    authorize('viewer')({ user: { role: 'viewer' } } as any, {} as any, next);
    expect(next).toHaveBeenCalledWith();
  });
});
