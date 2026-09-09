import type { SecurityComparison, SecurityImpactReference } from '../types/predictionReality.js';

export function compareSecurityImpact(predicted: SecurityImpactReference[], observed: SecurityImpactReference[], evidenceAvailable: boolean): SecurityComparison {
  const unique = (items: SecurityImpactReference[]) => [...new Map(items.map((item) => [item.fingerprint, item])).values()];
  const predictedUnique = unique(predicted); const observedUnique = unique(observed); const observedByFingerprint = new Map(observedUnique.map((item) => [item.fingerprint, item]));
  const confirmed = predictedUnique.filter((item) => observedByFingerprint.has(item.fingerprint));
  const unexpected = observedUnique.filter((observedItem) => !predictedUnique.some((predictedItem) => predictedItem.fingerprint === observedItem.fingerprint));
  return { predicted: predictedUnique, observed: observedUnique, confirmed, unexpected, status: !evidenceAvailable ? 'insufficient_evidence' : confirmed.length > 0 ? 'confirmed' : unexpected.length > 0 ? 'unexpected' : 'insufficient_evidence' };
}