import mongoose, { Types } from 'mongoose';
import { ChangeModel, toChangeDTO } from '../models/Change.js';
import { EvidenceModel } from '../models/Evidence.js';
import { HistoricalOutcomeModel, toHistoricalOutcomeDTO } from '../models/HistoricalOutcome.js';
import type { PredictionSnapshotDTO, ObservedImpactDTO, PredictionComparisonDTO } from '../types/predictionReality.js';
import type { AccuracyDimensions, EvidenceQuality, HistoricalOutcomeDTO } from '../types/historicalOutcome.js';
import { accuracyVersion } from '../types/historicalOutcome.js';
import { AppError } from '../utils/app-error.js';
import { predictionAccuracyScore } from './outcomeMappings.js';

function objectId(value: string, field: string): Types.ObjectId {
  if (!mongoose.isValidObjectId(value)) throw new AppError(400, `${field} must be a valid MongoDB ObjectId.`);
  return new Types.ObjectId(value);
}
function overlap(left: string[], right: string[]): number | null {
  if (left.length === 0 && right.length === 0) return null;
  if (left.length === 0 || right.length === 0) return 0;
  const rightSet = new Set(right);
  return Math.round((left.filter((item) => rightSet.has(item)).length / Math.max(left.length, right.length)) * 100);
}
function dimensions(
  prediction: PredictionSnapshotDTO,
  observation: ObservedImpactDTO,
  comparison: PredictionComparisonDTO
): AccuracyDimensions {
  if (comparison.outcome === 'insufficient_evidence')
    return { outcome: null, impact: null, resources: null, failureModes: null, overall: null, accuracyVersion };
  const impact = overlap(prediction.predictedImpact.categories, observation.observedImpact.categories);
  const resources = overlap(prediction.predictedResourceIds, observation.observedResources);
  const predictedFailures = prediction.predictedSecurityFindings.map((item) => item.fingerprint);
  const observedFailures = observation.observedSecurityFindings.map((item) => item.fingerprint);
  const failureModes =
    predictedFailures.length || observedFailures.length ? overlap(predictedFailures, observedFailures) : null;
  const values = [predictionAccuracyScore(comparison.outcome), impact, resources, failureModes].filter(
    (value): value is number => value !== null
  );
  return {
    outcome: predictionAccuracyScore(comparison.outcome),
    impact,
    resources,
    failureModes,
    overall: values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null,
    accuracyVersion
  };
}
async function quality(evidenceIds: string[], resourceId: string): Promise<EvidenceQuality> {
  if (evidenceIds.length === 0) return 'insufficient';
  const records = await EvidenceModel.find({ _id: { $in: evidenceIds.map((id) => objectId(id, 'evidenceId')) } })
    .select({ source: 1, resourceId: 1, timestamp: 1 })
    .limit(100)
    .lean();
  if (!records.length) return 'insufficient';
  const sources = new Set(records.map((item) => item.source));
  const correlated = records.some((item) => item.resourceId?.toString() === resourceId);
  if (sources.size >= 3 && correlated) return 'high';
  if (sources.size >= 2 && correlated) return 'medium';
  return 'low';
}

export async function persistHistoricalOutcome(
  changeId: string,
  prediction: PredictionSnapshotDTO,
  observation: ObservedImpactDTO,
  comparison: PredictionComparisonDTO
): Promise<HistoricalOutcomeDTO> {
  const change = await ChangeModel.findById(objectId(changeId, 'changeId'));
  if (!change) throw new AppError(404, 'Change not found.');
  const changeDTO = toChangeDTO(change);
  const accuracy = dimensions(prediction, observation, comparison);
  const evidenceQuality = await quality(
    [...new Set([...changeDTO.evidenceIds, ...observation.evidenceIds])],
    changeDTO.resourceId
  );
  const data = {
    changeId: change._id,
    resourceId: change.resourceId,
    changeType: change.changeType,
    source: change.source,
    riskScore: prediction.predictedRisk.score,
    riskLevel: prediction.predictedRisk.level,
    predictedImpact: prediction.predictedImpact.categories.slice(0, 30),
    observedImpact: observation.observedImpact.categories.slice(0, 30),
    outcome: comparison.outcome,
    affectedResourceIds: [...new Set([...prediction.predictedResourceIds, ...observation.observedResources])]
      .slice(0, 100)
      .map((id) => objectId(id, 'affectedResourceId')),
    securityFindingCount: observation.observedSecurityFindings.length,
    predictedAt: new Date(prediction.predictedAt),
    evaluatedAt: new Date(comparison.comparedAt),
    predictionVersion: prediction.predictionVersion,
    evidenceQuality,
    accuracy,
    evidenceIds: [...new Set([...changeDTO.evidenceIds, ...observation.evidenceIds, ...comparison.evidenceIds])]
      .slice(0, 100)
      .map((id) => objectId(id, 'evidenceId'))
  };
  const existing = await HistoricalOutcomeModel.findOne({
    changeId: change._id,
    predictionVersion: prediction.predictionVersion
  }).sort({ evaluatedAt: -1 });
  const saved = existing
    ? await HistoricalOutcomeModel.findByIdAndUpdate(existing._id, data, { new: true, runValidators: true })
    : await HistoricalOutcomeModel.create(data);
  return toHistoricalOutcomeDTO(saved!);
}

export async function getHistoricalOutcomeForChange(changeId: string): Promise<HistoricalOutcomeDTO | null> {
  const outcome = await HistoricalOutcomeModel.findOne({ changeId: objectId(changeId, 'changeId') }).sort({
    evaluatedAt: -1
  });
  return outcome ? toHistoricalOutcomeDTO(outcome) : null;
}
export async function getHistoricalSummary(): Promise<{
  completedEvaluations: number;
  averageAccuracy: number | null;
  outcomeDistribution: Record<string, number>;
  accuracyDistribution: Record<string, number>;
  evidenceQualityDistribution: Record<string, number>;
  commonUnexpectedImpacts: string[];
  commonPartiallyPredicted: string[];
}> {
  const records = await HistoricalOutcomeModel.find().sort({ evaluatedAt: -1 }).limit(1000).lean();
  // Was `records.length` (the capped sample size, silently wrong past 1000
  // completed evaluations) reported as the total. The distributions below stay
  // sample-based (most recent 1000) since they're inherently a snapshot of
  // recent trends, but a literal count like "how many evaluations have
  // completed" should be the real number, not however many fit in one page.
  // See review 2.21/3.10.
  const completedEvaluations = await HistoricalOutcomeModel.countDocuments();
  const comparable = records.map((item) => item.accuracy.overall).filter((value): value is number => value !== null);
  const count = (key: 'outcome' | 'evidenceQuality') =>
    Object.fromEntries(
      records.reduce((map, item) => map.set(item[key], (map.get(item[key]) ?? 0) + 1), new Map<string, number>())
    );
  const accuracyDistribution: Record<string, number> = {};
  records.forEach((item) => {
    const value = item.accuracy.overall;
    const bucket = value === null ? 'insufficient' : value >= 80 ? 'high' : value >= 50 ? 'medium' : 'low';
    accuracyDistribution[bucket] = (accuracyDistribution[bucket] ?? 0) + 1;
  });
  return {
    completedEvaluations,
    averageAccuracy: comparable.length
      ? Math.round(comparable.reduce((sum, value) => sum + value, 0) / comparable.length)
      : null,
    outcomeDistribution: count('outcome'),
    accuracyDistribution,
    evidenceQualityDistribution: count('evidenceQuality'),
    commonUnexpectedImpacts: records
      .filter((item) => item.outcome === 'unexpected_impact')
      .flatMap((item) => item.observedImpact)
      .slice(0, 20),
    commonPartiallyPredicted: records
      .filter((item) => item.outcome === 'partially_predicted')
      .flatMap((item) => item.observedImpact)
      .slice(0, 20)
  };
}
export async function getHistoricalAccuracy(changeId: string): Promise<HistoricalOutcomeDTO | null> {
  return getHistoricalOutcomeForChange(changeId);
}

export async function getHistoricalRiskContribution(
  resourceId: string,
  changeType: string
): Promise<{ contribution: number; reason: string; sampleSize: number }> {
  const records = await HistoricalOutcomeModel.find({ resourceId: objectId(resourceId, 'resourceId'), changeType })
    .sort({ evaluatedAt: -1 })
    .limit(20)
    .lean();
  if (records.length < 2)
    return {
      contribution: 0,
      reason: 'No sufficient completed history for this resource and change type; historical risk is neutral.',
      sampleSize: records.length
    };
  const unexpected = records.filter(
    (item) => item.outcome === 'unexpected_impact' || item.outcome === 'partially_predicted'
  ).length;
  const contribution = Math.min(12, Math.round((unexpected / records.length) * 12));
  return {
    contribution,
    reason: `${unexpected} of ${records.length} completed similar change(s) had unexpected or partially predicted impact. Historical contribution is bounded to 12 points.`,
    sampleSize: records.length
  };
}
