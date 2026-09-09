import { describe, expect, it } from 'vitest';
import { compareSecurityImpact } from '../src/engines/securityComparisonEngine.js';
import { calculateSecurityRiskContribution } from '../src/engines/securityRiskEngine.js';
import type { SecurityImpactReference } from '../src/types/predictionReality.js';

const finding = (fingerprint: string, severity = 'high'): SecurityImpactReference => ({ fingerprint, category: 'misconfiguration', severity, title: `Finding ${fingerprint}`, evidenceIds: ['507f1f77bcf86cd799439011'] });
describe('security comparison', () => {
  it('confirms a predicted finding supported by observed evidence', () => { const result = compareSecurityImpact([finding('a')], [finding('a')], true); expect(result.status).toBe('confirmed'); expect(result.confirmed).toHaveLength(1); });
  it('reports an observed finding as unexpected when it was not predicted', () => { const result = compareSecurityImpact([], [finding('b')], true); expect(result.status).toBe('unexpected'); expect(result.unexpected).toHaveLength(1); });
  it('does not claim no vulnerability when security evidence is unavailable', () => { const result = compareSecurityImpact([finding('a')], [], false); expect(result.status).toBe('insufficient_evidence'); });
  it('is deterministic and deduplicates fingerprints', () => { const input = [finding('a'), finding('a'), finding('b', 'critical')]; expect(compareSecurityImpact(input, input, true)).toEqual(compareSecurityImpact(input, input, true)); expect(calculateSecurityRiskContribution(input)).toBe(40); });
  it('caps security contribution', () => { expect(calculateSecurityRiskContribution(Array.from({ length: 10 }, (_, index) => finding(String(index), 'critical')))).toBe(40); });
});