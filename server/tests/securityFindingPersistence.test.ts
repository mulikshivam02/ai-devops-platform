import { Types } from 'mongoose';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fingerprintFor } from '../src/services/securityNormalizer.js';
import type { CreateSecurityFindingInput } from '../src/types/security.js';

/**
 * Review 2.2/3.3. Two bugs in one: the fingerprint didn't include changeId, so
 * the same underlying issue detected on two different changes collapsed into a
 * single document whose changeId belonged to whichever change was scanned
 * first -- silently zeroing the security contribution to every other change's
 * risk score. And the upsert used $setOnInsert for every field, so a finding's
 * severity, description, and fixedVersion were frozen at whatever they were the
 * first time it was ever seen.
 */
describe('security finding fingerprint (review 2.2/3.3)', () => {
  const base: CreateSecurityFindingInput = {
    resourceId: '507f1f77bcf86cd799439011',
    source: 'scanner',
    category: 'vulnerability',
    title: 'Outdated dependency',
    description: 'x',
    cve: 'CVE-2024-1234',
    detectedAt: new Date().toISOString()
  };

  it('the same issue on two different changes produces two different fingerprints', () => {
    const onChangeOne = fingerprintFor({ ...base, changeId: '507f1f77bcf86cd799439012' });
    const onChangeTwo = fingerprintFor({ ...base, changeId: '507f1f77bcf86cd799439013' });
    // Before the fix these were equal, which is why change #2's lookup by
    // changeId returned nothing -- the document belonged to change #1.
    expect(onChangeOne).not.toBe(onChangeTwo);
  });

  it('the same issue on the same change is still deduplicated (idempotent re-scan)', () => {
    const first = fingerprintFor({ ...base, changeId: '507f1f77bcf86cd799439012' });
    const second = fingerprintFor({ ...base, changeId: '507f1f77bcf86cd799439012' });
    expect(first).toBe(second);
  });

  it('no changeId at all is treated consistently, not confused with a real change', () => {
    const withoutChangeId = fingerprintFor(base);
    const withChangeId = fingerprintFor({ ...base, changeId: '507f1f77bcf86cd799439012' });
    expect(withoutChangeId).not.toBe(withChangeId);
  });
});

vi.mock('../src/models/Resource.js', () => ({ ResourceModel: { exists: vi.fn().mockResolvedValue(true) } }));
vi.mock('../src/models/Change.js', () => ({ ChangeModel: { exists: vi.fn().mockResolvedValue(true) } }));
vi.mock('../src/models/Evidence.js', () => ({ EvidenceModel: { countDocuments: vi.fn().mockResolvedValue(0) } }));

describe('security finding upsert (review 2.2/3.2 — mutable fields must update on re-scan)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('sends severity, description, fixedVersion and lastSeenAt in $set, not $setOnInsert', async () => {
    const findOneAndUpdate = vi.fn().mockResolvedValue({
      _id: new Types.ObjectId(),
      resourceId: new Types.ObjectId(),
      evidenceIds: [],
      source: 'scanner',
      category: 'vulnerability',
      severity: 'critical',
      title: 't',
      description: 'd',
      status: 'open',
      confidence: 90,
      remediation: { available: false },
      metadata: {},
      fingerprint: 'x',
      detectedAt: new Date(),
      lastSeenAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    });
    vi.doMock('../src/models/SecurityFinding.js', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../src/models/SecurityFinding.js')>();
      return { ...actual, SecurityFindingModel: { ...actual.SecurityFindingModel, findOneAndUpdate } };
    });

    const { createSecurityFinding } = await import('../src/services/securityAnalysisService.js');
    await createSecurityFinding({
      resourceId: '507f1f77bcf86cd799439011',
      source: 'scanner',
      category: 'vulnerability',
      severity: 'critical',
      title: 'Outdated dependency',
      description: 'Now confirmed exploitable',
      fixedVersion: '2.1.0',
      detectedAt: new Date().toISOString()
    });

    expect(findOneAndUpdate).toHaveBeenCalledTimes(1);
    const [, update] = findOneAndUpdate.mock.calls[0] as [unknown, Record<string, unknown>];
    const setFields = update.$set as Record<string, unknown>;
    const setOnInsertFields = update.$setOnInsert as Record<string, unknown>;

    // The whole point of the fix: these must be re-applied on every scan.
    expect(setFields.severity).toBe('critical');
    expect(setFields.description).toBe('Now confirmed exploitable');
    expect(setFields.fixedVersion).toBe('2.1.0');
    expect(setFields.lastSeenAt).toBeInstanceOf(Date);

    // Identity fields still only apply once, at creation.
    expect(setOnInsertFields.title).toBe('Outdated dependency');
    expect(setOnInsertFields.detectedAt).toBeInstanceOf(Date);
    expect(setOnInsertFields).not.toHaveProperty('severity');
    expect(setOnInsertFields).not.toHaveProperty('description');
  });
});
