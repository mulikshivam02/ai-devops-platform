import { describe, expect, it } from 'vitest';
import { SecurityFindingModel } from '../src/models/SecurityFinding.js';
import {
  normalizeSecurityEvidence,
  normalizeSecurityFinding,
  fingerprintFor
} from '../src/services/securityNormalizer.js';
import { calculateChangeRisk } from '../src/engines/riskEngine.js';
import { sanitizeObject } from '../src/utils/sensitive-data.js';

describe('security domain validation and normalization', () => {
  it('normalizes structured findings without inventing optional facts', () => {
    const result = normalizeSecurityFinding({
      title: 'Unsafe policy',
      description: 'Structured evidence',
      severity: 'HIGH',
      category: 'iac',
      source: 'terraform'
    });
    expect(result).toMatchObject({ title: 'Unsafe policy', severity: 'high', category: 'iac', source: 'terraform' });
    expect(result?.cve).toBeUndefined();
    expect(result?.fixedVersion).toBeUndefined();
  });
  it('rejects incomplete findings and supports finding arrays', () => {
    expect(normalizeSecurityFinding({ title: 'Missing description' })).toBeNull();
    expect(
      normalizeSecurityEvidence(
        {
          findings: [
            { title: 'A', description: 'B' },
            { title: 'C', description: 'D' }
          ]
        },
        {}
      )
    ).toHaveLength(2);
  });
  /**
   * Review 2.20/3.9. analyzeChangeSecurity runs normalizeSecurityEvidence over
   * EVERY piece of evidence attached to a change. normalizeSecurityFinding only
   * requires a title/name and description/message -- a shape ordinary evidence
   * (a commit message, a Kubernetes event) has all the time. Without an explicit
   * `findings` or `securityFinding` marker, none of that should manufacture a
   * security finding.
   */
  it('does NOT manufacture a finding from ordinary evidence that merely has title/description-shaped fields', () => {
    // A perfectly ordinary GitHub commit evidence payload -- never flagged as a
    // security issue by anything, but structurally has the two fields
    // normalizeSecurityFinding requires.
    const commitLikePayload = { title: 'Fix typo in README', description: 'Corrected a spelling mistake.' };
    expect(normalizeSecurityEvidence(commitLikePayload, {})).toHaveLength(0);
  });

  it('does NOT manufacture a finding from a Kubernetes-event-shaped payload either', () => {
    const eventLikePayload = { name: 'PodEvicted', message: 'Pod was evicted due to node pressure.' };
    expect(normalizeSecurityEvidence(eventLikePayload, {})).toHaveLength(0);
  });

  it('STILL extracts a finding when the payload explicitly declares one via securityFinding', () => {
    const scannerPayload = {
      securityFinding: { title: 'Exposed secret', description: 'An API key was committed in plaintext.' }
    };
    expect(normalizeSecurityEvidence(scannerPayload, {})).toHaveLength(1);
  });
  it('validates model enums and required fields without MongoDB', () => {
    const valid = new SecurityFindingModel({
      source: 'manual',
      category: 'unknown',
      severity: 'unknown',
      title: 'Finding',
      description: 'Description',
      confidence: 60,
      remediation: { available: false },
      fingerprint: 'fingerprint',
      detectedAt: new Date(),
      evidenceIds: []
    });
    expect(valid.validateSync()).toBeUndefined();
    const invalid = new SecurityFindingModel({ ...valid.toObject(), severity: 'not-a-severity' });
    expect(invalid.validateSync()?.errors.severity).toBeDefined();
  });
  it('redacts secret metadata and keeps duplicate fingerprints stable', () => {
    const input = normalizeSecurityFinding({
      title: 'Secret exposure',
      description: 'Key detected',
      category: 'secret_exposure',
      metadata: { token: 'never-store', location: 'config.yaml' }
    })!;
    expect(sanitizeObject(input.metadata)).toEqual({ location: 'config.yaml' });
    expect(fingerprintFor(input)).toBe(fingerprintFor({ ...input }));
  });
  it('preserves the existing Phase 5 score when no security contribution exists', () => {
    const result = calculateChangeRisk({
      changeType: 'code',
      environment: 'development',
      changedItemCount: 1,
      directCount: 0,
      transitiveCount: 0,
      maxDependencyDepth: 0,
      rollbackAvailable: true
    });
    // Recomputed for the rebalanced weights (review 3.2): change_size
    // min(10, 1*2)=2, environment(development)=3, blast_radius=0, depth=0,
    // change_type('code')=4, rollback(available)=-5. 2+3+0+0+4-5 = 4.
    expect(result.score).toBe(4);
    expect(result.factors.some((factor) => factor.name === 'security')).toBe(false);
  });
});
