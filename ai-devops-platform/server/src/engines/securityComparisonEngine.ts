import type { SecurityComparison, SecurityImpactReference } from '../types/predictionReality.js';

export function compareSecurityImpact(
  predicted: SecurityImpactReference[],
  observed: SecurityImpactReference[],
  evidenceAvailable: boolean
): SecurityComparison {
  const unique = (items: SecurityImpactReference[]) => [
    ...new Map(items.map((item) => [item.fingerprint, item])).values()
  ];
  const predictedUnique = unique(predicted);
  const observedUnique = unique(observed);
  const observedByFingerprint = new Map(observedUnique.map((item) => [item.fingerprint, item]));
  const confirmed = predictedUnique.filter((item) => observedByFingerprint.has(item.fingerprint));
  const unexpected = observedUnique.filter(
    (observedItem) => !predictedUnique.some((predictedItem) => predictedItem.fingerprint === observedItem.fingerprint)
  );
  // Predicted but never observed -- a false positive in the security prediction.
  // Previously not computed at all, so this kind of over-prediction was invisible.
  const unconfirmed = predictedUnique.filter((item) => !observedByFingerprint.has(item.fingerprint));
  return {
    predicted: predictedUnique,
    observed: observedUnique,
    confirmed,
    unexpected,
    unconfirmed,
    status: !evidenceAvailable
      ? 'insufficient_evidence'
      : confirmed.length > 0
        ? 'confirmed'
        : unexpected.length > 0
          ? 'unexpected'
          : // Evidence WAS available, and there is genuinely nothing predicted or
            // observed -- that's a clean result, not a lack of information.
            // Previously this fell through to 'insufficient_evidence', making a
            // verified-clean change indistinguishable from one nobody checked.
            // See review 2.11.
            'clean'
  };
}
