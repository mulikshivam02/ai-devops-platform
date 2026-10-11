import { describe, expect, it } from 'vitest';
import { comparePredictionReality } from '../src/engines/comparisonEngine.js';
import { compareSecurityImpact } from '../src/engines/securityComparisonEngine.js';
import type { PredictionSnapshotDTO, ObservedImpactDTO } from '../src/types/predictionReality.js';

const basePrediction: PredictionSnapshotDTO = {
  id: 'prediction',
  changeId: 'change',
  analysisId: 'analysis',
  resourceId: 'resource',
  predictedAt: '2026-09-14T00:00:00.000Z',
  predictedRisk: { score: 70, level: 'high' },
  predictedImpact: { categories: ['deployment', 'dependency', 'security'], summary: 'x' },
  predictedBlastRadius: { directCount: 2, transitiveCount: 1, totalCount: 4, maxDependencyDepth: 2 },
  predictedResourceIds: ['dep-a', 'dep-b', 'dep-c'],
  predictedSecurityFindings: [],
  predictionVersion: '1.0',
  metadata: {},
  createdAt: '',
  updatedAt: ''
};

function observation(overrides: Partial<ObservedImpactDTO>): ObservedImpactDTO {
  return {
    id: 'observation',
    changeId: 'change',
    predictionId: 'prediction',
    resourceId: 'resource',
    observationWindow: { start: '2026-09-14T00:00:00.000Z', end: '2026-09-14T01:00:00.000Z' },
    evidenceIds: ['evidence'],
    observedImpact: { categories: [], summary: '' },
    observedResources: [],
    observedMetrics: [],
    observedEvents: [],
    observedFailures: [],
    observedSecurityFindings: [],
    status: 'observed',
    createdAt: '',
    updatedAt: '',
    ...overrides
  };
}

/** Review 2.8: a total miss must score 0, not be excluded from the average. */
describe('comparisonEngine: misses count toward accuracy instead of being skipped (review 2.8)', () => {
  it('predicting 3 categories and observing none scores accuracy near 0, not null/undefined', () => {
    const result = comparePredictionReality(
      basePrediction,
      observation({ observedImpact: { categories: [], summary: '' } })
    );
    // predictedCategories has 3 entries, none confirmed -> that dimension is 0%,
    // not skipped. observedResourceIds is also empty -> that dimension is 0% too.
    expect(result.accuracy.score).not.toBeNull();
    expect(result.accuracy.score).toBeLessThanOrEqual(10);
  });
});

/** Review 2.9: zero observed resources (a real, confirmed no-impact) must not be treated as "no data". */
describe('comparisonEngine: a genuine zero-impact observation is distinguishable from missing data (review 2.9)', () => {
  it('status "observed" with zero observed resources reports observedTotal as 0, not null', () => {
    const result = comparePredictionReality(
      { ...basePrediction, predictedImpact: { categories: [], summary: '' }, predictedResourceIds: [] },
      observation({ status: 'observed', observedResources: [] })
    );
    expect(result.blastRadiusComparison.observedTotal).toBe(0);
  });

  it('status "insufficient_evidence" still reports observedTotal as null (genuinely no data)', () => {
    const result = comparePredictionReality(
      basePrediction,
      observation({ status: 'insufficient_evidence', evidenceIds: [] })
    );
    expect(result.blastRadiusComparison.observedTotal).toBeNull();
  });
});

/** Review 2.10: mostly-correct-plus-one-surprise must not be lumped in with entirely wrong. */
describe('comparisonEngine: partial success with a surprise outranks total failure (review 2.10)', () => {
  it('confirming most predictions plus one unexpected category is "partially_predicted", not "unexpected_impact"', () => {
    const result = comparePredictionReality(
      basePrediction,
      observation({
        observedImpact: { categories: ['deployment', 'dependency', 'availability'], summary: '' }, // 2/3 confirmed + 1 surprise
        observedResources: ['dep-a', 'dep-b', 'dep-c']
      })
    );
    expect(result.outcome).toBe('partially_predicted');
  });

  it('a prediction that got NOTHING right plus a surprise is still "unexpected_impact"', () => {
    const result = comparePredictionReality(
      basePrediction,
      observation({ observedImpact: { categories: ['availability'], summary: '' }, observedResources: [] })
    );
    expect(result.outcome).toBe('unexpected_impact');
  });
});

/** Review 2.5: the blast-radius accuracy dimension must not be off by one (self-inclusion mismatch). */
describe('comparisonEngine: blast radius accuracy is not off-by-one on the changed resource itself (review 2.5)', () => {
  it('a perfect prediction (all predicted resources observed, nothing extra) scores the resource dimension at 100', () => {
    const result = comparePredictionReality(
      basePrediction, // predictedResourceIds has 3 entries; predictedBlastRadius.totalCount is 4 (includes self)
      observation({
        observedImpact: { categories: ['deployment', 'dependency', 'security'], summary: '' },
        observedResources: ['dep-a', 'dep-b', 'dep-c'] // exactly matches predictedResourceIds, not totalCount
      })
    );
    // Under the old bug this would be off by one (3 observed vs totalCount 4),
    // capping the achievable accuracy even on a perfect prediction.
    expect(result.blastRadiusComparison.delta).toBe(0);
    expect(result.accuracy.score).toBe(100);
  });
});

/** Review 2.11: nothing predicted + nothing observed + evidence present must read as "clean", not "insufficient_evidence". */
describe('securityComparisonEngine: a verified-clean result is distinct from an unchecked one (review 2.11)', () => {
  it('evidence available, nothing predicted, nothing observed -> "clean"', () => {
    expect(compareSecurityImpact([], [], true).status).toBe('clean');
  });

  it('no evidence at all -> "insufficient_evidence" (unchanged)', () => {
    expect(compareSecurityImpact([], [], false).status).toBe('insufficient_evidence');
  });

  it('a predicted finding that never showed up in observation is reported as unconfirmed', () => {
    const result = compareSecurityImpact(
      [{ fingerprint: 'cve-1', category: 'vulnerability', severity: 'high', title: 't' }],
      [],
      true
    );
    expect(result.unconfirmed).toHaveLength(1);
    expect(result.unconfirmed[0].fingerprint).toBe('cve-1');
  });
});
