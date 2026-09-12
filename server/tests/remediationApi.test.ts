import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { authorize } from '../src/middleware/auth.middleware.js';

const service = vi.hoisted(() => ({
  createRemediation: vi.fn(), listRemediations: vi.fn(), getRemediation: vi.fn(), updateRemediation: vi.fn(), analyzeRemediation: vi.fn(), generateRemediation: vi.fn(), validateRemediation: vi.fn(), preparePR: vi.fn(), approveRemediation: vi.fn(), rejectRemediation: vi.fn(), dryRunRemediation: vi.fn(), verifyRemediation: vi.fn()
}));
vi.mock('../src/remediation/remediation.service.js', () => service);
const { app } = await import('../src/server.js');
const remediation = { id: '507f1f77bcf86cd799439011', changeId: '507f1f77bcf86cd799439012', resourceId: '507f1f77bcf86cd799439013', securityFindingIds: [], type: 'configuration', title: 'Update replicas', description: 'Structured proposal', reason: 'Evidence-backed', proposedChanges: [{ action: 'update_configuration', path: 'replicas', before: 1, after: 2 }], evidenceIds: ['507f1f77bcf86cd799439014'], createdBy: 'test', status: 'proposed', risk: { score: 30, level: 'medium', factors: [], requiresApproval: true }, rollback: { available: true, actions: [] }, prStatus: 'not_created', audit: [], metadata: {}, createdAt: '2026-09-09T00:00:00.000Z', updatedAt: '2026-09-09T00:00:00.000Z' };

describe('remediation API routes', () => {
  beforeEach(() => { vi.clearAllMocks(); Object.values(service).forEach((mock) => mock.mockResolvedValue(remediation)); service.listRemediations.mockResolvedValue({ data: [remediation], pagination: { page: 1, limit: 25, total: 1, pages: 1 } }); });
  it('supports create, list, detail, patch, and lifecycle routes', async () => {
    const payload = { changeId: remediation.changeId, resourceId: remediation.resourceId, type: 'configuration', title: 'Update replicas', description: 'Structured proposal', reason: 'Evidence-backed', proposedChanges: remediation.proposedChanges, evidenceIds: remediation.evidenceIds, createdBy: 'attacker@example.com' };
    expect((await request(app).post('/api/remediations').send(payload)).status).toBe(201);
    expect(service.createRemediation).toHaveBeenCalledWith(expect.objectContaining({ createdBy: 'development@localhost' }));
    expect((await request(app).get('/api/remediations?status=proposed&page=1&limit=10')).status).toBe(200);
    expect((await request(app).get(`/api/remediations/${remediation.id}`)).status).toBe(200);
    expect((await request(app).patch(`/api/remediations/${remediation.id}`).send({ title: 'Updated' })).status).toBe(200);
    for (const path of ['analyze', 'generate', 'validate', 'prepare-pr', 'approve', 'reject', 'dry-run', 'verify']) expect((await request(app).post(`/api/remediations/${remediation.id}/${path}`).send({ actor: 'admin@example.com', approvedBy: 'admin@example.com', rejectedBy: 'admin@example.com', reason: 'Reviewed evidence' })).status).toBe(200);
    expect(service.approveRemediation).toHaveBeenCalledWith(remediation.id, 'development@localhost', 'Reviewed evidence');
    expect(service.rejectRemediation).toHaveBeenCalledWith(remediation.id, 'development@localhost', 'Reviewed evidence');
  });
  it('rejects command-shaped input at the API boundary', async () => { const response = await request(app).post('/api/remediations').send({ changeId: remediation.changeId, resourceId: remediation.resourceId, type: 'configuration', title: 'Unsafe', description: 'Unsafe', reason: 'Unsafe', proposedChanges: [{ action: 'run_command', command: 'kubectl apply' }], evidenceIds: remediation.evidenceIds, createdBy: 'test' }); expect(response.status).toBe(400); });
  it('rejects operator approval authorization', () => {
    const next = vi.fn();
    authorize('admin')({ user: { id: 'operator-id', email: 'operator@example.com', role: 'operator' } } as never, {} as never, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: 'FORBIDDEN' }));
  });
});
