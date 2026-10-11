import { Types } from 'mongoose';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { RemediationModel } from '../src/models/Remediation.js';

/**
 * Review 2.1/3.1: `audit` was Schema.Types.Mixed, and Mongoose does not track
 * in-place mutation of Mixed paths -- so `.push()` on it followed by `.save()`
 * silently dropped every entry after the document was first created. These tests
 * check Mongoose's own change-tracking directly, which is the exact mechanism
 * that was broken, rather than just checking the array's in-memory contents
 * (which would pass under the old buggy schema too, since JS array .push() always
 * "works" -- the bug was specifically about what Mongoose decides to persist).
 */
describe('remediation audit trail persistence (review 2.1/3.1)', () => {
  it('the audit field is a real subdocument array, not Mixed', () => {
    const path = RemediationModel.schema.path('audit');
    // A Mixed path has no $isMongooseDocumentArray flag at all; a proper subdocument
    // array schema type (SchemaDocumentArray) sets it to true. This distinction is
    // precisely what determines whether Mongoose's change-tracking sees a .push().
    expect(path.$isMongooseDocumentArray).toBe(true);
    expect(path.constructor.name).toBe('SchemaDocumentArray');
  });

  it('pushing an audit entry marks the path modified (would be false under Mixed)', () => {
    // Model.hydrate() constructs a document exactly as if it had been loaded from
    // the database -- unlike `new Model(...)`, it does not mark any path modified,
    // which is what we need: the same starting state remediation.service.ts's
    // `move()` sees after `RemediationModel.findById(id)`.
    const doc = RemediationModel.hydrate({
      _id: new Types.ObjectId(),
      changeId: new Types.ObjectId(),
      resourceId: new Types.ObjectId(),
      type: 'configuration',
      title: 'Test remediation',
      description: 'd',
      reason: 'r',
      proposedChanges: [],
      risk: { score: 0, level: 'low', factors: [] },
      rollback: { available: false, actions: [] },
      createdBy: 'test@example.com',
      audit: [
        { event: 'remediation_created', status: 'proposed', actor: 'test@example.com', at: new Date().toISOString() }
      ]
    });

    expect(doc.isModified('audit')).toBe(false);
    doc.audit.push({
      event: 'remediation_analyzed',
      status: 'analyzed',
      actor: 'system',
      at: new Date().toISOString()
    });
    // This is the line that would have failed under the old Schema.Types.Mixed
    // definition: Mongoose does not observe .push() on a Mixed path, so
    // isModified would still report false here, and .save() would never write it.
    expect(doc.isModified('audit')).toBe(true);
    expect(doc.audit).toHaveLength(2);
  });
});

/**
 * Review 2.3: every remediation.service.ts transition now goes through an atomic
 * `findOneAndUpdate({ _id, status: expectedFrom }, ...)`. These test the SERVICE's
 * handling of that primitive's result -- a null result (meaning another request
 * already moved the document off the expected status) must surface as a 409
 * conflict, not proceed as if nothing happened. Mongoose/MongoDB's own atomicity
 * guarantee for findOneAndUpdate is a well-established primitive and isn't what's
 * under test here; the application-level handling of it is.
 */
describe('remediation transition concurrency (review 2.3)', () => {
  const remediationId = new Types.ObjectId().toString();

  function fakeDoc(overrides: Record<string, unknown> = {}) {
    return {
      _id: new Types.ObjectId(remediationId),
      changeId: new Types.ObjectId(),
      resourceId: new Types.ObjectId(),
      affectedResourceIds: [],
      blastRadius: { directCount: 0, transitiveCount: 0, totalCount: 1, maxDependencyDepth: 0 },
      securityFindingIds: [],
      type: 'configuration',
      title: 't',
      description: 'd',
      reason: 'r',
      proposedChanges: [],
      risk: { score: 0, level: 'low', factors: [] },
      status: 'proposed',
      rollback: { available: false, actions: [] },
      evidenceIds: [],
      createdBy: 'test@example.com',
      prStatus: 'not_created',
      audit: [
        { event: 'remediation_created', status: 'proposed', actor: 'test@example.com', at: new Date().toISOString() }
      ],
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides
    };
  }

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('surfaces a 409 REMEDIATION_CONFLICT when another request already moved the status', async () => {
    vi.spyOn(RemediationModel, 'findById').mockResolvedValue(fakeDoc());
    // findOneAndUpdate returning null is exactly what happens when the {_id, status}
    // filter no longer matches -- i.e. someone else's request got there first.
    vi.spyOn(RemediationModel, 'findOneAndUpdate').mockResolvedValue(null);

    const { analyzeRemediation } = await import('../src/remediation/remediation.service.js');
    await expect(analyzeRemediation(remediationId)).rejects.toMatchObject({
      statusCode: 409,
      code: 'REMEDIATION_CONFLICT'
    });
  });

  it('succeeds and reflects the updated document when no race occurs', async () => {
    vi.spyOn(RemediationModel, 'findById').mockResolvedValue(fakeDoc());
    vi.spyOn(RemediationModel, 'findOneAndUpdate').mockResolvedValue(
      fakeDoc({
        status: 'analyzed',
        audit: [
          { event: 'remediation_created', status: 'proposed', actor: 'test@example.com', at: new Date().toISOString() },
          { event: 'remediation_analyzed', status: 'analyzed', actor: 'system', at: new Date().toISOString() }
        ]
      })
    );

    const { analyzeRemediation } = await import('../src/remediation/remediation.service.js');
    const result = await analyzeRemediation(remediationId);
    expect(result.status).toBe('analyzed');
    expect(result.audit).toHaveLength(2);
  });

  it('the findOneAndUpdate filter is conditioned on the status being left, not just the id', async () => {
    vi.spyOn(RemediationModel, 'findById').mockResolvedValue(
      fakeDoc({ status: 'validated', validation: { valid: true, schemaValidated: true, checks: [] } })
    );
    const updateSpy = vi
      .spyOn(RemediationModel, 'findOneAndUpdate')
      .mockResolvedValue(fakeDoc({ status: 'pr_created' }));

    const { preparePR } = await import('../src/remediation/remediation.service.js');
    await preparePR(remediationId, 'system');

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'validated' }),
      expect.objectContaining({ $set: expect.objectContaining({ status: 'pr_created' }) }),
      expect.anything()
    );
  });
});
