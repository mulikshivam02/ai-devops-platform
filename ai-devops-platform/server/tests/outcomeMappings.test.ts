import { describe, expect, it } from 'vitest';
import { predictionAccuracyScore, operationalHealthOutcome } from '../src/intelligence/outcomeMappings.js';
import type { PredictionRealityOutcome } from '../src/types/predictionReality.js';

const ALL_OUTCOMES: PredictionRealityOutcome[] = [
  'predicted_and_observed',
  'predicted_not_observed',
  'unexpected_impact',
  'partially_predicted',
  'no_significant_impact',
  'insufficient_evidence'
];

/**
 * Review 2.12/3.4. These two functions deliberately disagree on
 * 'predicted_not_observed' -- that's not a bug, it's the whole point (see the
 * module's own comment). This test locks in that both readings stay defined and
 * that the disagreement is exactly the one intentional case, so a future edit to
 * one function without the other is caught here instead of silently drifting.
 */
describe('outcome mappings: intentional per-question disagreement (review 2.12/3.4)', () => {
  it('every outcome value has a defined accuracy score or is explicitly null', () => {
    for (const outcome of ALL_OUTCOMES) {
      expect(predictionAccuracyScore(outcome)).not.toBeUndefined();
    }
  });

  it('every outcome value maps to a defined operational health reading', () => {
    for (const outcome of ALL_OUTCOMES) {
      expect(operationalHealthOutcome(outcome)).not.toBeUndefined();
    }
  });

  it('predicted_not_observed is a failed prediction (accuracy 0) but a successful outcome (nothing bad happened)', () => {
    expect(predictionAccuracyScore('predicted_not_observed')).toBe(0);
    expect(operationalHealthOutcome('predicted_not_observed')).toBe('successful');
  });

  it('unexpected_impact is bad on both readings', () => {
    expect(predictionAccuracyScore('unexpected_impact')).toBe(0);
    expect(operationalHealthOutcome('unexpected_impact')).toBe('degraded');
  });

  it('insufficient_evidence is "no data" on both readings, not a score of 0', () => {
    expect(predictionAccuracyScore('insufficient_evidence')).toBeNull();
    expect(operationalHealthOutcome('insufficient_evidence')).toBe('insufficient_evidence');
  });
});
