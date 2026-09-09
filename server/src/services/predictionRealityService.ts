import mongoose, { Types } from 'mongoose';
import { ChangeModel } from '../models/Change.js';
import { ChangeAnalysisModel, toChangeAnalysisDTO } from '../models/ChangeAnalysis.js';
import { EvidenceModel } from '../models/Evidence.js';
import { PredictionSnapshotModel, toPredictionSnapshotDTO, type PredictionSnapshotDocumentHydrated } from '../models/PredictionSnapshot.js';
import { ObservedImpactModel, toObservedImpactDTO, type ObservedImpactDocumentHydrated } from '../models/ObservedImpact.js';
import { PredictionComparisonModel, toPredictionComparisonDTO, type PredictionComparisonDocumentHydrated } from '../models/PredictionComparison.js';
import { compareMetric } from '../engines/metricComparisonEngine.js';
import { comparePredictionReality } from '../engines/comparisonEngine.js';
import type { PredictionSnapshotDTO, ObservedImpactDTO, PredictionComparisonDTO, MetricObservation, MetricDirection, ObservedSeverity } from '../types/predictionReality.js';
import { AppError } from '../utils/app-error.js';
import { sanitizeObject } from '../utils/sensitive-data.js';
import { SecurityFindingModel } from '../models/SecurityFinding.js';
import { compareSecurityImpact } from '../engines/securityComparisonEngine.js';

const MAX_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
function objectId(id: string, field: string): Types.ObjectId { if (!mongoose.isValidObjectId(id)) throw new AppError(400, `${field} must be a valid MongoDB ObjectId.`); return new Types.ObjectId(id); }
function date(value: string, field: string): Date { const result = new Date(value); if (Number.isNaN(result.getTime())) throw new AppError(400, `${field} must be a valid date.`); return result; }
function windowDates(start: string, end: string): { start: Date; end: Date } { const startDate = date(start, 'start'); const endDate = date(end, 'end'); if (startDate >= endDate) throw new AppError(400, 'start must be before end.'); if (endDate.getTime() - startDate.getTime() > MAX_WINDOW_MS) throw new AppError(400, 'Observation window cannot exceed 7 days.'); return { start: startDate, end: endDate }; }
function stringArray(value: unknown): string[] { return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === 'string'))].slice(0, 100) : []; }
function record(value: unknown): Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

export async function createPrediction(changeId: string): Promise<PredictionSnapshotDTO> {
  const changeObjectId = objectId(changeId, 'changeId');
  const change = await ChangeModel.findById(changeObjectId); if (!change) throw new AppError(404, 'Change not found.');
  const analysis = await ChangeAnalysisModel.findOne({ changeId: changeObjectId }).sort({ analyzedAt: -1 }); if (!analysis) throw new AppError(404, 'Change analysis not found. Analyze the Change before creating a prediction.');
  const analysisDTO = toChangeAnalysisDTO(analysis); const resourceId = objectId(analysisDTO.resourceId, 'resourceId'); if (!(await mongoose.model('Resource').exists({ _id: resourceId }))) throw new AppError(404, 'Resource not found.');
  const securityFindings = await SecurityFindingModel.find({ changeId: changeObjectId }).limit(100).select({ _id: 1, fingerprint: 1, category: 1, severity: 1, title: 1, evidenceIds: 1 }).lean();
  const predictedSecurityFindings = securityFindings.map((finding) => ({ fingerprint: finding.fingerprint, findingId: finding._id.toString(), category: finding.category, severity: finding.severity, title: finding.title, evidenceIds: finding.evidenceIds }));
  const snapshot = await PredictionSnapshotModel.create({ changeId: changeObjectId, analysisId: analysis._id, resourceId, predictedAt: new Date(), predictedRisk: analysisDTO.risk, predictedImpact: analysisDTO.impact, predictedBlastRadius: analysisDTO.blastRadius, predictedResourceIds: [...new Set([...analysisDTO.directlyAffectedResourceIds, ...analysisDTO.transitivelyAffectedResourceIds])].map((id) => new Types.ObjectId(id)), predictedSecurityFindings, predictionVersion: analysisDTO.analysisVersion, metadata: {} });
  return toPredictionSnapshotDTO(snapshot);
}

async function predictionFor(changeId: string, predictionId: string): Promise<PredictionSnapshotDTO> { const prediction = await PredictionSnapshotModel.findById(objectId(predictionId, 'predictionId')); if (!prediction) throw new AppError(404, 'Prediction not found.'); if (prediction.changeId.toString() !== changeId) throw new AppError(400, 'Prediction does not belong to this Change.'); return toPredictionSnapshotDTO(prediction); }

export async function createObservation(changeId: string, predictionId: string, start: string, end: string): Promise<ObservedImpactDTO> {
  const changeObjectId = objectId(changeId, 'changeId'); const prediction = await predictionFor(changeId, predictionId); const dates = windowDates(start, end); const change = await ChangeModel.findById(changeObjectId); if (!change) throw new AppError(404, 'Change not found.');
  const changeEvidenceIds = change.evidenceIds.map((id) => id.toString());
  const evidence = await EvidenceModel.find({ timestamp: { $gte: dates.start, $lte: dates.end }, $or: [{ resourceId: prediction.resourceId }, { _id: { $in: changeEvidenceIds } }] }).sort({ timestamp: 1 }).limit(100);
  const categories = new Set<string>(); const observedResources = new Set<string>(); const metrics: MetricObservation[] = []; const events: Array<{ name: string; status?: string; source: string }> = []; const failures: Array<{ name: string; severity: ObservedSeverity; source: string }> = [];
  for (const item of evidence) {
    if (item.resourceId) observedResources.add(item.resourceId.toString()); const payload = record(item.payload); stringArray(payload.categories).forEach((category) => categories.add(category)); if (typeof payload.category === 'string') categories.add(payload.category); stringArray(payload.observedResourceIds ?? payload.resourceIds ?? payload.observedResources).forEach((id) => observedResources.add(id));
    const metric = record(payload.metric ?? payload); if (typeof metric.name === 'string' && typeof metric.baseline === 'number' && typeof metric.observed === 'number') { const result = compareMetric(metric.baseline, metric.observed); metrics.push({ name: metric.name, baseline: metric.baseline, observed: metric.observed, delta: result.delta, unit: typeof metric.unit === 'string' ? metric.unit : undefined, direction: result.direction, source: item.source }); if (typeof payload.category === 'string') categories.add(payload.category); }
    if (typeof payload.eventName === 'string') events.push({ name: payload.eventName, status: typeof payload.status === 'string' ? payload.status : undefined, source: item.source });
    if (typeof payload.failureName === 'string') { const severity = payload.severity; const valid = severity === 'critical' || severity === 'high' || severity === 'medium' || severity === 'low'; failures.push({ name: payload.failureName, severity: valid ? severity : 'unknown', source: item.source }); }
  }
  const observationEvidenceIds = evidence.map((item) => item._id); const securityFindings = await SecurityFindingModel.find({ evidenceIds: { $in: observationEvidenceIds } }).limit(100).select({ _id: 1, fingerprint: 1, category: 1, severity: 1, title: 1, evidenceIds: 1 }).lean();
  const observedSecurityFindings = securityFindings.map((finding) => ({ fingerprint: finding.fingerprint, findingId: finding._id.toString(), category: finding.category, severity: finding.severity, title: finding.title, evidenceIds: finding.evidenceIds }));
  const status = evidence.length === 0 ? 'insufficient_evidence' : 'observed'; const summary = evidence.length === 0 ? 'Insufficient evidence to determine observed impact in the requested window.' : `Observed ${evidence.length} relevant evidence record(s); unsupported dimensions remain unconfirmed.`;
  const doc = await ObservedImpactModel.create({ changeId: changeObjectId, predictionId: objectId(predictionId, 'predictionId'), resourceId: objectId(prediction.resourceId, 'resourceId'), observationWindow: dates, evidenceIds: observationEvidenceIds, observedImpact: { categories: [...categories].slice(0, 30), summary }, observedResources: [...observedResources].slice(0, 100).map((id) => objectId(id, 'observedResourceId')), observedMetrics: metrics.slice(0, 50), observedEvents: events.slice(0, 50), observedFailures: failures.slice(0, 50), observedSecurityFindings, status });
  return toObservedImpactDTO(doc);
}

export async function compareObservation(changeId: string, predictionId: string, observationId: string): Promise<PredictionComparisonDTO> {
  const prediction = await predictionFor(changeId, predictionId); const observation = await ObservedImpactModel.findById(objectId(observationId, 'observationId')); if (!observation) throw new AppError(404, 'Observation not found.'); if (observation.changeId.toString() !== changeId || observation.predictionId.toString() !== predictionId) throw new AppError(400, 'Observation does not belong to the requested Change and Prediction.');
  const observationDTO = toObservedImpactDTO(observation); const result = comparePredictionReality(prediction, observationDTO); const doc = await PredictionComparisonModel.create({ ...result, changeId: objectId(changeId, 'changeId'), predictionId: objectId(predictionId, 'predictionId'), observationId: objectId(observationId, 'observationId'), comparedAt: new Date(result.comparedAt), evidenceIds: result.evidenceIds.map((id) => objectId(id, 'evidenceId')) }); return toPredictionComparisonDTO(doc);
}

export async function getPrediction(changeId: string): Promise<PredictionSnapshotDTO> { const changeObjectId = objectId(changeId, 'changeId'); const doc = await PredictionSnapshotModel.findOne({ changeId: changeObjectId }).sort({ predictedAt: -1 }); if (!doc) throw new AppError(404, 'Prediction not found.'); return toPredictionSnapshotDTO(doc); }
export async function getObservations(changeId: string): Promise<ObservedImpactDTO[]> { const docs = await ObservedImpactModel.find({ changeId: objectId(changeId, 'changeId') }).sort({ createdAt: -1 }).limit(100); return docs.map((doc) => toObservedImpactDTO(doc)); }
export async function getComparison(changeId: string): Promise<PredictionComparisonDTO> { const doc = await PredictionComparisonModel.findOne({ changeId: objectId(changeId, 'changeId') }).sort({ comparedAt: -1 }); if (!doc) throw new AppError(404, 'Comparison not found.'); return toPredictionComparisonDTO(doc); }
export async function getPredictionById(id: string): Promise<PredictionSnapshotDTO> { const doc = await PredictionSnapshotModel.findById(objectId(id, 'predictionId')); if (!doc) throw new AppError(404, 'Prediction not found.'); return toPredictionSnapshotDTO(doc); }
export async function getObservationById(id: string): Promise<ObservedImpactDTO> { const doc = await ObservedImpactModel.findById(objectId(id, 'observationId')); if (!doc) throw new AppError(404, 'Observation not found.'); return toObservedImpactDTO(doc); }
export async function getComparisonById(id: string): Promise<PredictionComparisonDTO> { const doc = await PredictionComparisonModel.findById(objectId(id, 'comparisonId')); if (!doc) throw new AppError(404, 'Comparison not found.'); return toPredictionComparisonDTO(doc); }