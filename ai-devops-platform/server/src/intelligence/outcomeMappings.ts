import type { PredictionRealityOutcome } from '../types/predictionReality.js';
import type { HistoricalOutcome } from './intelligence.types.js';

/**
 * Review 2.12/3.4. `PredictionRealityOutcome` (from comparisonEngine.ts) answers
 * "how did the prediction compare to what actually happened" -- it says nothing
 * about whether the change itself went well. Two different modules used to map
 * `predicted_not_observed` to opposite readings with no shared definition:
 * historical-outcome.service.ts scored it 0 (a failed prediction), while
 * historical-intelligence.service.ts mapped it to 'successful' (a fine outcome).
 *
 * Both readings are correct -- they're just answering different questions:
 *   - predictionAccuracyScore: "was the PREDICTION right?" predicting impact that
 *     never happened is a false positive, i.e. a wrong prediction, scored low.
 *   - operationalHealthOutcome: "did the CHANGE go well?" predicted impact that
 *     never materialized means nothing bad happened, which is operationally fine.
 *
 * The fix is not to make these agree (they shouldn't -- forcing one answer would
 * make the other one wrong) but to make the duality explicit and shared, instead
 * of two independent inline computations that look like an accidental
 * contradiction to anyone reading only one of the two files.
 */
export function predictionAccuracyScore(outcome: PredictionRealityOutcome): number | null {
  if (outcome === 'insufficient_evidence') return null;
  return {
    predicted_and_observed: 100,
    partially_predicted: 50,
    // Predicted impact that never happened is a wrong prediction (a false
    // positive), independent of whether the change was otherwise fine.
    predicted_not_observed: 0,
    unexpected_impact: 0,
    no_significant_impact: 100
  }[outcome];
}

export function operationalHealthOutcome(outcome: PredictionRealityOutcome): HistoricalOutcome {
  return {
    predicted_and_observed: 'successful' as const,
    no_significant_impact: 'successful' as const,
    partially_predicted: 'partially_successful' as const,
    unexpected_impact: 'degraded' as const,
    // Nothing bad materialized. That IS operationally successful, even though
    // predictionAccuracyScore above correctly marks the prediction itself wrong.
    predicted_not_observed: 'successful' as const,
    insufficient_evidence: 'insufficient_evidence' as const
  }[outcome];
}
