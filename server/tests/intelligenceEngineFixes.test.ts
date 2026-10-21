import { describe, expect, it } from 'vitest';
import {
  compareHistoricalFeatures,
  calculatePredictionAccuracy,
  detectPredictionBias
} from '../src/intelligence/intelligence.engine.js';
import type { HistoricalFeature } from '../src/intelligence/intelligence.types.js';

const base: HistoricalFeature = {
  changeId: 'old',
  resourceId: 'resource',
  environment: 'production',
  changeType: 'configuration',
  riskScore: 60,
  riskLevel: 'high',
  changedItemCount: 2,
  impactCategories: ['configuration'],
  paths: ['replicas'],
  affectedResourceIds: ['resource'],
  dependencyResourceIds: ['database'],
  securityCategories: ['vulnerability'],
  outcome: 'degraded',
  evidenceIds: ['evidence'],
  timestamp: '2026-01-01T00:00:00.000Z'
};

/** Review 2.13/3.7: the "same resource" factor was a constant 25 points on every comparison. */
describe('compareHistoricalFeatures: same-resource is no longer a scored factor (review 2.13/3.7)', () => {
  it('two candidates with the same resourceId but nothing else alike score very differently', () => {
    const identicalOtherwise = compareHistoricalFeatures({ ...base, changeId: 'a' }, base);
    const nothingElseAlike = compareHistoricalFeatures(
      {
        ...base,
        changeId: 'b',
        changeType: 'code',
        environment: 'development',
        impactCategories: [],
        paths: [],
        changedItemCount: 99,
        dependencyResourceIds: [],
        securityCategories: []
      },
      base
    );
    // Under the old scoring, both would carry the same +25 "same resource" floor
    // regardless of anything else matching. Now the gap between them should be large.
    expect(identicalOtherwise.similarityScore - nothingElseAlike.similarityScore).toBeGreaterThan(50);
  });

  it('"same resource" never appears in matchingFactors', () => {
    const result = compareHistoricalFeatures({ ...base, changeId: 'a' }, base);
    expect(result.matchingFactors).not.toContain('same resource');
  });
});

/** Review 2.13/3.7: security category overlap was pushed into `differences`, not scored. */
describe('compareHistoricalFeatures: security category overlap is scored as a similarity (review 2.13/3.7)', () => {
  it('matching security categories increase the score and appear in matchingFactors', () => {
    const withOverlap = compareHistoricalFeatures(
      { ...base, changeId: 'a', securityCategories: ['vulnerability'] },
      base
    );
    const withoutOverlap = compareHistoricalFeatures(
      { ...base, changeId: 'b', securityCategories: ['misconfiguration'] },
      base
    );
    expect(withOverlap.matchingFactors).toContain('similar security categories');
    expect(withOverlap.differences).not.toContain('similar security categories');
    expect(withOverlap.similarityScore).toBeGreaterThan(withoutOverlap.similarityScore);
  });
});

/** Review 2.14/3.7: these fields measure accuracy magnitude, not prediction direction. */
describe('calculatePredictionAccuracy: rate fields are honestly named (review 2.14/3.7)', () => {
  it('exposes lowAccuracyRate / highAccuracyRate, not the misleading under/overPredictionRate names', () => {
    const result = calculatePredictionAccuracy([
      { accuracy: 95, level: 'excellent', evidenceIds: [] },
      { accuracy: 10, level: 'poor', evidenceIds: [] }
    ]);
    expect(result).toHaveProperty('lowAccuracyRate');
    expect(result).toHaveProperty('highAccuracyRate');
    expect(result).not.toHaveProperty('underPredictionRate');
    expect(result).not.toHaveProperty('overPredictionRate');
    expect(result.lowAccuracyRate).toBe(0.5);
    expect(result.highAccuracyRate).toBe(0.5);
  });
});

/** Review 2.15/3.7: 'unknown' observed severity must not count as a confirmed non-event. */
describe('detectPredictionBias: unknown severity is excluded, not scored as zero (review 2.15/3.7)', () => {
  it('a sample of only "unknown" observations has no comparable data, not a strong overprediction signal', () => {
    const result = detectPredictionBias([
      { predictedScore: 80, observedSeverity: 'unknown', evidenceIds: [] },
      { predictedScore: 90, observedSeverity: 'unknown', evidenceIds: [] }
    ]);
    // Under the old bug, unknown -> 0, so this would read as a large, confident
    // overprediction bias. It should instead report no comparable sample.
    expect(result.sampleSize).toBe(0);
    expect(result.type).toBe('none');
  });

  it('unknown observations are excluded from the sample size used for magnitude and confidence', () => {
    const result = detectPredictionBias([
      { predictedScore: 10, observedSeverity: 'critical', evidenceIds: [] }, // known: large under-prediction
      { predictedScore: 80, observedSeverity: 'unknown', evidenceIds: [] } // should not dilute/skew the result
    ]);
    expect(result.sampleSize).toBe(1);
    expect(result.type).toBe('underprediction');
  });
});
