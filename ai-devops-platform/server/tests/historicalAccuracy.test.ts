import { describe, expect, it } from 'vitest';
import { calculateChangeRisk } from '../src/engines/riskEngine.js';
import { comparePredictionReality } from '../src/engines/comparisonEngine.js';
import type { PredictionSnapshotDTO, ObservedImpactDTO } from '../src/types/predictionReality.js';

const prediction: PredictionSnapshotDTO = {
  id: '507f1f77bcf86cd799439011',
  changeId: '507f1f77bcf86cd799439012',
  analysisId: '507f1f77bcf86cd799439013',
  resourceId: '507f1f77bcf86cd799439014',
  predictedAt: '2026-09-14T00:00:00.000Z',
  predictedRisk: { score: 40, level: 'medium' },
  predictedImpact: { categories: ['deployment'], summary: 'deployment' },
  predictedBlastRadius: { directCount: 0, transitiveCount: 1, totalCount: 2, maxDependencyDepth: 1 },
  predictedResourceIds: ['507f1f77bcf86cd799439014'],
  predictedSecurityFindings: [],
  predictionVersion: '1.0',
  metadata: {},
  createdAt: '',
  updatedAt: ''
};
function observation(status: 'observed' | 'insufficient_evidence', categories: string[] = []): ObservedImpactDTO {
  return {
    id: '507f1f77bcf86cd799439015',
    changeId: prediction.changeId,
    predictionId: prediction.id,
    resourceId: prediction.resourceId,
    observationWindow: { start: '', end: '' },
    evidenceIds: status === 'observed' ? ['507f1f77bcf86cd799439016'] : [],
    observedImpact: { categories, summary: '' },
    observedResources: [],
    observedMetrics: [],
    observedEvents: [],
    observedFailures: [],
    observedSecurityFindings: [],
    status,
    createdAt: '',
    updatedAt: ''
  };
}

describe('historical accuracy and risk contribution', () => {
  it('does not calculate accuracy for insufficient evidence', () =>
    expect(comparePredictionReality(prediction, observation('insufficient_evidence')).outcome).toBe(
      'insufficient_evidence'
    ));
  it('classifies partial prediction deterministically', () =>
    expect(comparePredictionReality(prediction, observation('observed', ['deployment'])).outcome).toBe(
      'partially_predicted'
    ));
  it('keeps historical contribution bounded and explainable', () => {
    const result = calculateChangeRisk({
      changeType: 'deployment',
      changedItemCount: 1,
      directCount: 0,
      transitiveCount: 0,
      maxDependencyDepth: 0,
      rollbackAvailable: true,
      // Historical contribution is capped at 5 (rebalanced in review 3.2 so the
      // engine's factors sum to 100 instead of 148) -- 5 is the largest value
      // that still round-trips through the cap unchanged, which is the point
      // of this test: the reason string must flow through even when bounded.
      historicalContribution: 5,
      historicalReason: '2 of 5 similar changes had unexpected impact.'
    });
    expect(result.factors.find((factor) => factor.name === 'historical_outcomes')).toMatchObject({
      contribution: 5,
      reason: '2 of 5 similar changes had unexpected impact.'
    });
  });

  it('caps historical contribution rather than passing an oversized value through', () => {
    const result = calculateChangeRisk({
      changeType: 'deployment',
      changedItemCount: 1,
      directCount: 0,
      transitiveCount: 0,
      maxDependencyDepth: 0,
      rollbackAvailable: true,
      historicalContribution: 12,
      historicalReason: 'should be capped'
    });
    expect(result.factors.find((factor) => factor.name === 'historical_outcomes')?.contribution).toBe(5);
  });
});
