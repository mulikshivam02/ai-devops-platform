import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './helpers/api.js';

const service = vi.hoisted(() => ({ getDashboardSummary: vi.fn() }));
vi.mock('../src/dashboard/dashboard.service.js', () => service);
const { app } = await import('../src/server.js');

beforeEach(() => {
  vi.clearAllMocks();
  service.getDashboardSummary.mockResolvedValue({
    changeCounts: {
      total: 2,
      highCriticalRisk: 1,
      underInvestigation: 1,
      unexpectedImpact: 0,
      insufficientEvidence: 1
    },
    riskDistribution: { low: 1, medium: 0, high: 1, critical: 0 },
    recentChanges: [
      {
        id: 'change-id',
        changeId: 'source:change',
        summary: 'Deploy API',
        source: 'github',
        resourceId: 'resource-id',
        resourceName: 'API',
        changeType: 'deployment',
        status: 'detected',
        timestamp: '2026-09-14T00:00:00.000Z',
        risk: { score: 62, level: 'high' },
        predictionStatus: 'available',
        realityStatus: 'insufficient_evidence'
      }
    ],
    recentOutcomes: [],
    integrationStatus: {
      github: 'configured',
      kubernetes: { configured: false, reachable: false, message: 'Not configured' },
      prometheus: { configured: false, reachable: false, message: 'Not configured' },
      loki: { configured: false, reachable: false, message: 'Not configured' }
    },
    aiStatus: { available: false, provider: 'mock', model: 'mock', message: 'Unavailable' }
  });
});

describe('dashboard summary API', () => {
  it('returns a bounded authenticated operational summary without raw evidence', async () => {
    const response = await api(app).get('/api/dashboard/summary');
    expect(response.status).toBe(200);
    expect(response.body.data.changeCounts.total).toBe(2);
    expect(response.body.data.recentChanges).toHaveLength(1);
    expect(JSON.stringify(response.body)).not.toContain('Authorization');
    expect(JSON.stringify(response.body)).not.toContain('token');
  });
});
