import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const service = vi.hoisted(() => ({
  createSecurityFinding: vi.fn(),
  listSecurityFindings: vi.fn(),
  getSecurityFinding: vi.fn(),
  updateSecurityFinding: vi.fn(),
  deleteSecurityFinding: vi.fn(),
  getSecurityFindingsForChange: vi.fn(),
  getSecurityFindingsForResource: vi.fn(),
  getSecuritySummary: vi.fn(),
  analyzeChangeSecurity: vi.fn()
}));
vi.mock('../src/services/securityAnalysisService.js', () => service);

const { app } = await import('../src/server.js');
const finding = { id: '507f1f77bcf86cd799439011', evidenceIds: [], source: 'manual', category: 'unknown', severity: 'unknown', title: 'Finding', description: 'Description', status: 'open', confidence: 60, remediation: { available: false }, metadata: {}, fingerprint: 'fingerprint', detectedAt: '2026-09-09T00:00:00.000Z', createdAt: '2026-09-09T00:00:00.000Z', updatedAt: '2026-09-09T00:00:00.000Z' };
const page = { data: [finding], pagination: { page: 1, limit: 25, total: 1, pages: 1 } };

describe('security API routes', () => {
  beforeEach(() => { vi.clearAllMocks(); service.createSecurityFinding.mockResolvedValue(finding); service.listSecurityFindings.mockResolvedValue(page); service.getSecurityFinding.mockResolvedValue(finding); service.updateSecurityFinding.mockResolvedValue(finding); service.deleteSecurityFinding.mockResolvedValue(undefined); service.getSecurityFindingsForChange.mockResolvedValue(page); service.getSecurityFindingsForResource.mockResolvedValue(page); service.getSecuritySummary.mockResolvedValue({ total: 1, critical: 0, high: 0, medium: 0, low: 0, info: 0, open: 1, affectedResources: 0, categories: { unknown: 1 }, highestSeverity: 'unknown', riskContribution: 0 }); service.analyzeChangeSecurity.mockResolvedValue({ changeId: finding.id, findings: [finding], summary: { total: 1 } }); });

  it('supports finding CRUD and rejects invalid payloads', async () => {
    const create = await request(app).post('/api/security/findings').send({ source: 'manual', category: 'unknown', title: 'Finding', description: 'Description', detectedAt: '2026-09-09T00:00:00.000Z' });
    expect(create.status).toBe(201); expect(service.createSecurityFinding).toHaveBeenCalled();
    expect((await request(app).get(`/api/security/findings/${finding.id}`)).status).toBe(200);
    expect((await request(app).patch(`/api/security/findings/${finding.id}`).send({ status: 'acknowledged' })).status).toBe(200);
    expect((await request(app).delete(`/api/security/findings/${finding.id}`)).status).toBe(200);
    expect((await request(app).post('/api/security/findings').send({ source: 'manual', category: 'unknown', title: 'Missing date', description: 'Invalid' })).status).toBe(400);
  });

  it('supports filtering, pagination, summary, change/resource views, and analysis', async () => {
    expect((await request(app).get('/api/security/findings?severity=high&page=2&limit=10')).status).toBe(200);
    expect(service.listSecurityFindings).toHaveBeenCalledWith(expect.objectContaining({ severity: 'high' }), 2, 10);
    expect((await request(app).get('/api/security/summary')).status).toBe(200);
    expect((await request(app).get(`/api/changes/${finding.id}/security-findings`)).status).toBe(200);
    expect((await request(app).get(`/api/resources/${finding.id}/security-findings`)).status).toBe(200);
    expect((await request(app).post(`/api/changes/${finding.id}/security-analysis`)).status).toBe(200);
  });
});
