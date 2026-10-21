import { describe, expect, it, vi } from 'vitest';
import { api } from './helpers/api.js';

const service = vi.hoisted(() => ({
  analyzeChange: vi.fn(),
  evaluateChangeReality: vi.fn(),
  getChangeIntelligence: vi.fn()
}));
vi.mock('../src/intelligence/changeIntelligence.service.js', () => service);
const { app } = await import('../src/server.js');

const result = {
  change: { id: 'change-id', summary: 'change' },
  resource: { id: 'resource-id' },
  evidenceSummary: { total: 0, bySource: {}, items: [] },
  aiInvestigation: { status: 'skipped' },
  historicalLearning: {
    status: 'insufficient_evidence',
    similarChanges: [],
    riskTrend: {},
    predictionAccuracy: {},
    patterns: []
  }
};

describe('change intelligence orchestration API', () => {
  it('allows the orchestrator endpoints through the existing authenticated app', async () => {
    service.analyzeChange.mockResolvedValue(result);
    service.evaluateChangeReality.mockResolvedValue(result);
    service.getChangeIntelligence.mockResolvedValue(result);
    expect((await api(app).post('/api/intelligence/changes/change-id/analyze')).status).toBe(200);
    expect((await api(app).post('/api/intelligence/changes/change-id/evaluate').send({})).status).toBe(200);
    expect((await api(app).get('/api/intelligence/changes/change-id')).status).toBe(200);
  });

  it('keeps viewer denial at the shared role guard', async () => {
    const { authorize } = await import('../src/middleware/auth.middleware.js');
    const next = vi.fn();
    authorize('operator')({ user: { role: 'viewer' } } as any, {} as any, next);
    expect(next.mock.calls[0]?.[0]?.statusCode).toBe(403);
  });
});
