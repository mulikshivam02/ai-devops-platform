import mongoose from 'mongoose';
import { ChangeModel, toChangeDTO } from '../models/Change.js';
import { EvidenceModel, toEvidenceDTO } from '../models/Evidence.js';
import { AppError } from '../utils/app-error.js';
import { describeError, logEvent, lookupFailure, tryLookup, type LookupFailure } from '../utils/lookup.js';
import { getResourceById } from '../services/resourceService.js';
import { analyzeChange as analyzeDeterministicChange, getLatestAnalysis } from '../services/changeAnalysisService.js';
import {
  analyzeChangeSecurity,
  getSecurityFindingsForChange,
  getSecuritySummary
} from '../services/securityAnalysisService.js';
import {
  evaluateReality,
  getObservations,
  getComparison,
  getOrCreatePrediction,
  getPrediction
} from '../services/predictionRealityService.js';
import { investigateChange, listInvestigations } from '../services/investigationService.js';
import {
  findSimilarChanges,
  getHistoricalRisk,
  getPredictionAccuracyHistory,
  getPatterns
} from './historical-intelligence.service.js';
import { getHistoricalOutcomeForChange, persistHistoricalOutcome } from './historical-outcome.service.js';
import type {
  ChangeIntelligenceResult,
  AIInvestigationResult,
  EvaluateRealityOptions,
  EvidenceSummary,
  HistoricalLearningResult
} from './changeIntelligence.types.js';
import type { SecurityFinding } from '../types/security.js';
import type { PredictionAccuracy, RiskTrend } from './intelligence.types.js';

async function loadChange(changeId: string) {
  if (!mongoose.isValidObjectId(changeId)) throw new AppError(400, 'changeId must be a valid MongoDB ObjectId.');
  const change = await ChangeModel.findById(changeId);
  if (!change) throw new AppError(404, 'Change not found.');
  return { document: change, dto: toChangeDTO(change) };
}

async function evidenceSummary(change: { resourceId: unknown; evidenceIds: unknown[] }): Promise<EvidenceSummary> {
  const records = await EvidenceModel.find({
    $or: [{ resourceId: change.resourceId }, { _id: { $in: change.evidenceIds } }]
  })
    .sort({ timestamp: -1 })
    .limit(100);
  const items = records.map((record) => toEvidenceDTO(record));
  const bySource: Record<string, number> = {};
  items.forEach((item) => {
    bySource[item.source] = (bySource[item.source] ?? 0) + 1;
  });
  return {
    total: items.length,
    bySource,
    items: items.map(({ id, source, evidenceType, timestamp, correlationId }) => ({
      id,
      source,
      evidenceType,
      timestamp,
      ...(correlationId ? { correlationId } : {})
    }))
  };
}

async function historicalLearning(resourceId: string, changeId: string): Promise<HistoricalLearningResult> {
  const lookupErrors: string[] = [];
  const [similarChanges, riskTrend, predictionAccuracy, patterns] = await Promise.all([
    tryLookup('similarChanges', () => findSimilarChanges(changeId, 5), [], lookupErrors),
    tryLookup<RiskTrend | LookupFailure>(
      'riskTrend',
      () => getHistoricalRisk(resourceId, 90),
      lookupFailure('riskTrend'),
      lookupErrors
    ),
    tryLookup<PredictionAccuracy | LookupFailure>(
      'predictionAccuracy',
      () => getPredictionAccuracyHistory(resourceId),
      lookupFailure('predictionAccuracy'),
      lookupErrors
    ),
    tryLookup('patterns', () => getPatterns(resourceId), [], lookupErrors)
  ]);
  const available =
    similarChanges.length > 0 ||
    riskTrend.status === 'available' ||
    predictionAccuracy.status === 'available' ||
    patterns.length > 0;
  // A failed lookup is not "insufficient evidence": that is a finding about the data, this is a
  // fault in our ability to read it. 'degraded' = some sections failed, 'error' = all of them did.
  const status: HistoricalLearningResult['status'] =
    lookupErrors.length >= 4
      ? 'error'
      : lookupErrors.length > 0
        ? 'degraded'
        : available
          ? 'available'
          : 'insufficient_evidence';
  return { status, similarChanges, riskTrend, predictionAccuracy, patterns, lookupErrors };
}

async function currentAIInvestigation(changeId: string): Promise<AIInvestigationResult> {
  const lookupErrors: string[] = [];
  const investigations = await tryLookup('aiInvestigations', () => listInvestigations(changeId), null, lookupErrors);
  // If we cannot tell whether an investigation exists, say so rather than reporting "skipped" --
  // which would also make runAIInvestigation start a duplicate run.
  if (investigations === null) return { status: 'unavailable' };
  const latest = investigations[0];
  if (latest) return { status: latest.status === 'completed' ? 'completed' : 'failed', data: latest };
  return { status: 'skipped' };
}

async function runAIInvestigation(changeId: string): Promise<AIInvestigationResult> {
  const existing = await currentAIInvestigation(changeId);
  if (existing.status !== 'skipped') return existing;
  try {
    return { status: 'completed', data: await investigateChange(changeId) };
  } catch (error) {
    // investigateChange already logs and records provider/validation failures; this one-line trace
    // ties the outcome to the analyze request.
    logEvent('warn', 'AI_INVESTIGATION_UNAVAILABLE', { changeId, ...describeError(error) });
    return { status: 'unavailable' };
  }
}

/**
 * For lookups that throw 404 to mean "there is none yet" (analysis, prediction, comparison). A
 * 404 is a normal absence; anything else is a failure that must be logged and reported, not
 * flattened into "none".
 */
function absentOk<T>(label: string, work: () => Promise<T>, failed: string[]): Promise<T | undefined> {
  return tryLookup<T | undefined>(
    label,
    async () => {
      try {
        return await work();
      } catch (error) {
        if (error instanceof AppError && error.statusCode === 404) return undefined;
        throw error;
      }
    },
    undefined,
    failed
  );
}

async function consolidated(changeId: string): Promise<ChangeIntelligenceResult> {
  const failed: string[] = [];
  const { document, dto: change } = await loadChange(changeId);
  const resource = await getResourceById(change.resourceId);
  const [
    analysis,
    prediction,
    observations,
    comparison,
    securityResult,
    securitySummary,
    aiInvestigation,
    evidence,
    historical,
    historicalOutcome
  ] = await Promise.all([
    absentOk('analysis', () => getLatestAnalysis(changeId), failed),
    absentOk('prediction', () => getPrediction(changeId), failed),
    tryLookup('observations', () => getObservations(changeId), [], failed),
    absentOk('comparison', () => getComparison(changeId), failed),
    tryLookup(
      'securityFindings',
      () => getSecurityFindingsForChange(changeId, 1, 100),
      {
        data: [] as SecurityFinding[],
        pagination: { page: 1, limit: 100, total: 0, pages: 0 }
      },
      failed
    ),
    tryLookup(
      'securitySummary',
      () => getSecuritySummary({ changeId }),
      {
        total: 0,
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        info: 0,
        open: 0,
        affectedResources: 0,
        categories: {},
        highestSeverity: 'unknown' as const,
        riskContribution: 0
      },
      failed
    ),
    currentAIInvestigation(changeId),
    evidenceSummary({ resourceId: document.resourceId, evidenceIds: document.evidenceIds }),
    historicalLearning(change.resourceId, changeId),
    tryLookup('historicalOutcome', () => getHistoricalOutcomeForChange(changeId), null, failed)
  ]);
  return {
    change,
    resource,
    evidenceSummary: evidence,
    ...(analysis
      ? {
          analysis,
          dependencyImpact: {
            directlyAffectedResourceIds: analysis.directlyAffectedResourceIds,
            transitivelyAffectedResourceIds: analysis.transitivelyAffectedResourceIds,
            blastRadius: analysis.blastRadius
          },
          risk: analysis.risk
        }
      : {}),
    ...(prediction ? { prediction } : {}),
    ...(observations[0] ? { reality: observations[0] } : {}),
    ...(comparison ? { predictionVsReality: comparison } : {}),
    security: { findings: securityResult.data, summary: securitySummary },
    aiInvestigation,
    historicalLearning: historical,
    ...(failed.length > 0 ? { lookupErrors: failed } : {}),
    ...(historicalOutcome ? { historicalOutcome } : {})
  };
}

export async function analyzeChange(changeId: string): Promise<ChangeIntelligenceResult> {
  await loadChange(changeId);
  await analyzeChangeSecurity(changeId).catch(() => undefined);
  await analyzeDeterministicChange(changeId);
  await getOrCreatePrediction(changeId);
  const result = await consolidated(changeId);
  result.aiInvestigation = await runAIInvestigation(changeId);
  return result;
}

export async function evaluateChangeReality(
  changeId: string,
  options: EvaluateRealityOptions = {}
): Promise<ChangeIntelligenceResult> {
  await loadChange(changeId);
  const evaluated = await evaluateReality(changeId, options);
  const prediction = await getPrediction(changeId);
  await persistHistoricalOutcome(changeId, prediction, evaluated.observation, evaluated.comparison);
  return consolidated(changeId);
}

export async function getChangeIntelligence(changeId: string): Promise<ChangeIntelligenceResult> {
  return consolidated(changeId);
}
