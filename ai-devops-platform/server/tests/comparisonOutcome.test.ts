import { describe, expect, it } from 'vitest';
import { comparePredictionReality } from '../src/engines/comparisonEngine.js';
import type { PredictionSnapshotDTO, ObservedImpactDTO } from '../src/types/predictionReality.js';

const prediction: PredictionSnapshotDTO = {
  id: 'prediction',
  changeId: 'change',
  analysisId: 'analysis',
  resourceId: 'resource',
  predictedAt: '2026-09-14T00:00:00.000Z',
  predictedRisk: { score: 70, level: 'high' },
  predictedImpact: { categories: ['deployment'], summary: 'deployment' },
  predictedBlastRadius: { directCount: 0, transitiveCount: 1, totalCount: 2, maxDependencyDepth: 1 },
  predictedResourceIds: ['resource', 'dependency'],
  predictedSecurityFindings: [],
  predictionVersion: '1.0',
  metadata: {},
  createdAt: '2026-09-14T00:00:00.000Z',
  updatedAt: '2026-09-14T00:00:00.000Z'
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

describe('prediction reality outcome classification', () => {
  it('classifies insufficient evidence', () =>
    expect(
      comparePredictionReality(prediction, observation({ status: 'insufficient_evidence', evidenceIds: [] })).outcome
    ).toBe('insufficient_evidence'));
  it('classifies predicted and observed impact', () =>
    expect(
      comparePredictionReality(
        prediction,
        observation({
          observedImpact: { categories: ['deployment'], summary: '' },
          observedResources: ['resource', 'dependency']
        })
      ).outcome
    ).toBe('predicted_and_observed'));
  it('classifies unexpected impact', () =>
    expect(
      comparePredictionReality(
        prediction,
        observation({ observedImpact: { categories: ['availability'], summary: '' } })
      ).outcome
    ).toBe('unexpected_impact'));
  it('classifies partial prediction', () =>
    expect(
      comparePredictionReality(
        prediction,
        observation({ observedImpact: { categories: ['deployment'], summary: '' }, observedResources: ['resource'] })
      ).outcome
    ).toBe('partially_predicted'));
});
