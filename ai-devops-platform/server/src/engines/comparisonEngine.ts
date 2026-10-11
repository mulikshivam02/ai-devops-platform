import { accuracyLevel } from './metricComparisonEngine.js';
import type {
  PredictionSnapshotDTO,
  ObservedImpactDTO,
  PredictionComparisonDTO,
  ObservedSeverity
} from '../types/predictionReality.js';
import { compareSecurityImpact } from './securityComparisonEngine.js';

export function comparePredictionReality(
  prediction: PredictionSnapshotDTO,
  observation: ObservedImpactDTO
): Omit<PredictionComparisonDTO, 'id' | 'createdAt' | 'updatedAt'> {
  const predictedCategories = [...new Set(prediction.predictedImpact.categories)];
  const observedCategories = [...new Set(observation.observedImpact.categories)];
  const confirmedCategories = predictedCategories.filter((category) => observedCategories.includes(category));
  const unconfirmedCategories = predictedCategories.filter((category) => !observedCategories.includes(category));
  const unexpectedCategories = observedCategories.filter((category) => !predictedCategories.includes(category));
  const predictedResourceIds = [...new Set(prediction.predictedResourceIds)];
  const observedResourceIds = [...new Set(observation.observedResources)];
  const confirmedResourceIds = predictedResourceIds.filter((id) => observedResourceIds.includes(id));
  const unexpectedResourceIds = observedResourceIds.filter((id) => !predictedResourceIds.includes(id));

  // Metric-based accuracy is not implemented: there is no captured pre-change
  // baseline to predict a direction against (Prometheus only supports instant
  // queries, not the range queries a baseline would need -- see review 3.3/4.6).
  // predictedDirection/match are left undefined/null, which is what they
  // genuinely are right now, rather than participating in a fake "100 or 0"
  // accuracy dimension computed from data that can never exist yet.
  const metricComparison = observation.observedMetrics.map((metric) => ({
    name: metric.name,
    predictedDirection: undefined,
    observedDirection: metric.direction,
    match: null,
    baseline: metric.baseline,
    observed: metric.observed,
    delta: metric.delta,
    unit: metric.unit
  }));

  // Distinguishes "genuinely zero resources were observed affected" (a correct
  // no-impact prediction) from "we have no observation data at all" -- both
  // previously collapsed to `null` whenever the observed list was empty.
  // See review 2.9.
  const observedTotal = observation.status === 'observed' ? observedResourceIds.length : null;

  // Compared against predictedResourceIds.length (excludes the changed resource
  // itself), not predictedBlastRadius.totalCount (includes it) -- otherwise even
  // a perfect prediction is off by exactly one every time, because
  // observedResources is built from evidence about OTHER affected resources.
  // predictedBlastRadius.totalCount is still shown as-is in blastRadiusComparison
  // below for human-readable display (where "including the changed resource
  // itself" is the more natural total to show). See review 2.5.
  const predictedResourceTotal = predictedResourceIds.length;
  const delta = observedTotal === null ? null : observedTotal - predictedResourceTotal;

  const observedSeverity: ObservedSeverity =
    observation.observedFailures.length > 0
      ? observation.observedFailures.reduce<ObservedSeverity>(
          (highest, failure) => (severityRank(failure.severity) > severityRank(highest) ? failure.severity : highest),
          'none'
        )
      : observation.status === 'observed'
        ? 'none'
        : 'unknown';

  const dimensions: number[] = [];
  // Previously gated on `observedCategories.length > 0` too, so a total miss
  // (predicted 3 categories, observed none) skipped this dimension entirely
  // instead of scoring it 0 -- silently removing the worst outcomes from the
  // accuracy average. See review 2.8.
  if (predictedCategories.length > 0) {
    dimensions.push((confirmedCategories.length / predictedCategories.length) * 100);
  }
  if (predictedResourceIds.length > 0) {
    dimensions.push((confirmedResourceIds.length / predictedResourceIds.length) * 100);
  }
  if (observedTotal !== null) {
    dimensions.push(
      predictedResourceTotal === observedTotal
        ? 100
        : Math.max(0, 100 - Math.abs((delta! / Math.max(1, predictedResourceTotal)) * 100))
    );
  }
  const score =
    dimensions.length === 0 ? null : Math.round(dimensions.reduce((sum, value) => sum + value, 0) / dimensions.length);

  const securityComparison = compareSecurityImpact(
    prediction.predictedSecurityFindings,
    observation.observedSecurityFindings,
    observation.evidenceIds.length > 0
  );

  const hasConfirmed = confirmedCategories.length > 0 || confirmedResourceIds.length > 0;
  const hasUnexpected =
    unexpectedCategories.length > 0 || unexpectedResourceIds.length > 0 || securityComparison.unexpected.length > 0;
  // "Unconfirmed" covers BOTH a predicted category that never showed up AND a
  // predicted resource that was never observed among the confirmed ones -- the
  // original logic checked both (`unconfirmedCategories.length > 0 ||
  // confirmedResourceIds.length < predictedResourceIds.length`); an earlier pass
  // at this fix only kept the category half, which misclassified "predicted 2
  // resources, only 1 confirmed" as a full match instead of partial.
  const hasUnconfirmedCategories = unconfirmedCategories.length > 0;
  const hasUnconfirmedResources =
    predictedResourceIds.length > 0 && confirmedResourceIds.length < predictedResourceIds.length;
  const hasUnconfirmed = hasUnconfirmedCategories || hasUnconfirmedResources;
  const predictedAnything = predictedCategories.length > 0 || predictedResourceIds.length > 0;

  // Restructured so a mostly-correct prediction with one surprise reads as
  // "partially predicted", not "unexpected impact" outright. Previously
  // `unexpectedCategories.length > 0 || ...` was tested FIRST, so 9 of 10
  // correctly predicted categories plus one surprise was classified the exact
  // same way as a prediction that got nothing right at all. See review 2.10.
  const outcome =
    observation.status === 'insufficient_evidence' || observation.evidenceIds.length === 0
      ? 'insufficient_evidence'
      : hasConfirmed && (hasUnexpected || hasUnconfirmed)
        ? 'partially_predicted'
        : hasConfirmed
          ? 'predicted_and_observed'
          : hasUnexpected
            ? 'unexpected_impact'
            : predictedAnything
              ? 'predicted_not_observed'
              : 'no_significant_impact';

  return {
    changeId: prediction.changeId,
    predictionId: prediction.id,
    observationId: observation.id,
    comparedAt: new Date().toISOString(),
    outcome,
    impactComparison: {
      predictedCategories,
      observedCategories,
      confirmedCategories,
      unconfirmedCategories,
      unexpectedCategories
    },
    resourceComparison: { predictedResourceIds, observedResourceIds, confirmedResourceIds, unexpectedResourceIds },
    securityComparison,
    metricComparison,
    blastRadiusComparison: { predictedTotal: prediction.predictedBlastRadius.totalCount, observedTotal, delta },
    riskComparison: {
      predictedScore: prediction.predictedRisk.score,
      observedSeverity,
      explanation:
        observedSeverity === 'unknown'
          ? 'Insufficient evidence to determine observed severity.'
          : `Observed severity is ${observedSeverity} based only on structured evidence.`
    },
    accuracy: { score, level: accuracyLevel(score) },
    summary:
      observedCategories.length === 0
        ? 'No observed impact categories were supported by available evidence.'
        : `Confirmed ${confirmedCategories.length} predicted impact categor${confirmedCategories.length === 1 ? 'y' : 'ies'}; ${unconfirmedCategories.length} predicted categor${unconfirmedCategories.length === 1 ? 'y was' : 'ies were'} not confirmed by available evidence.`,
    evidenceIds: observation.evidenceIds
  };
}
function severityRank(severity: ObservedSeverity): number {
  return { unknown: -1, none: 0, low: 1, medium: 2, high: 3, critical: 4 }[severity];
}
