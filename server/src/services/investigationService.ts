import mongoose, { Types } from 'mongoose';
import { InvestigationModel, toInvestigationDTO, type InvestigationDocumentHydrated } from '../models/Investigation.js';
import { ChangeModel } from '../models/Change.js';
import { ChangeAnalysisModel } from '../models/ChangeAnalysis.js';
import { PredictionSnapshotModel } from '../models/PredictionSnapshot.js';
import { ObservedImpactModel } from '../models/ObservedImpact.js';
import { PredictionComparisonModel } from '../models/PredictionComparison.js';
import { buildInvestigationContext } from '../ai/contextBuilder.js';
import { buildInvestigationPrompt, promptVersion } from '../ai/promptBuilder.js';
import { getAIProvider } from '../ai/provider.js';
import { AIProviderError } from '../ai/ollamaProvider.js';
import { validateAIResult } from '../ai/responseValidator.js';
import type { AIAnalysisResult, ReasoningType } from '../ai/types.js';
import { AppError } from '../utils/app-error.js';

function objectId(id: string, field: string): Types.ObjectId { if (!mongoose.isValidObjectId(id)) throw new AppError(400, `${field} must be a valid MongoDB ObjectId.`); return new Types.ObjectId(id); }
function refIds(values: string[]): Types.ObjectId[] { return values.map((value) => objectId(value, 'evidenceId')); }

export async function investigateChange(changeId: string) {
  const startedAt = Date.now();
  const changeObjectId = objectId(changeId, 'changeId'); const change = await ChangeModel.findById(changeObjectId); if (!change) throw new AppError(404, 'Change not found.');
  const context = await buildInvestigationContext(changeId); const provider = getAIProvider(); const prompt = buildInvestigationPrompt({ type: 'change_analysis', context }); const allowedEvidence = new Set(context.evidence.map((item) => item.id));
  try {
    const result = validateAIResult(await provider.analyze({ type: 'change_analysis', context, prompt }), allowedEvidence); return await persistCompleted(change, result, provider.name, Date.now() - startedAt);
  } catch (error) {
    const providerError = error instanceof AIProviderError ? error : error instanceof AppError ? error : new AppError(502, 'AI response validation failed.');
    await InvestigationModel.create({ changeId: change._id, resourceId: change.resourceId, type: 'change_analysis', status: 'failed', hypotheses: [], reasoning: [], recommendations: [], limitations: ['Investigation did not complete.'], provider: provider.name, model: process.env.OLLAMA_MODEL ?? 'mock', promptVersion, latencyMs: Date.now() - startedAt, errorCode: providerError instanceof AIProviderError ? providerError.code : 'AI_VALIDATION_ERROR', errorMessage: providerError.message });
    if (providerError instanceof AIProviderError) throw new AppError(503, providerError.message); throw providerError;
  }
}

async function persistCompleted(change: { _id: Types.ObjectId; resourceId: Types.ObjectId }, result: AIAnalysisResult, provider: string, latencyMs: number) {
  const context = await buildInvestigationContext(change._id.toString()); const data = { changeId: change._id, resourceId: change.resourceId, ...(context.analysis && typeof context.analysis === 'object' && 'id' in context.analysis ? { analysisId: objectId(String(context.analysis.id), 'analysisId') } : {}), ...(context.prediction && typeof context.prediction === 'object' && 'id' in context.prediction ? { predictionId: objectId(String(context.prediction.id), 'predictionId') } : {}), ...(context.observation && typeof context.observation === 'object' && 'id' in context.observation ? { observationId: objectId(String(context.observation.id), 'observationId') } : {}), ...(context.comparison && typeof context.comparison === 'object' && 'id' in context.comparison ? { comparisonId: objectId(String(context.comparison.id), 'comparisonId') } : {}), type: 'change_analysis' as const, status: 'completed' as const, summary: result.summary, rootCause: { statement: result.rootCause.statement, confidence: result.rootCause.confidence, evidenceIds: refIds(result.rootCause.evidenceIds) }, hypotheses: result.hypotheses.map((item) => ({ ...item, supportingEvidenceIds: refIds(item.supportingEvidenceIds), contradictingEvidenceIds: refIds(item.contradictingEvidenceIds) })), reasoning: result.reasoning, impactExplanation: result.impactExplanation, predictionRealityExplanation: result.predictionRealityExplanation, recommendations: result.recommendations.map((item) => ({ ...item, supportingEvidenceIds: refIds(item.supportingEvidenceIds) })), limitations: result.limitations, provider, model: process.env.OLLAMA_MODEL ?? provider, promptVersion };
  const doc = await InvestigationModel.create({ ...data, latencyMs }); return toInvestigationDTO(doc);
}

export async function listInvestigations(changeId: string) { const docs = await InvestigationModel.find({ changeId: objectId(changeId, 'changeId') }).sort({ createdAt: -1 }).limit(50); return docs.map((doc) => toInvestigationDTO(doc)); }
export async function getInvestigation(id: string) { const doc = await InvestigationModel.findById(objectId(id, 'investigationId')); if (!doc) throw new AppError(404, 'Investigation not found.'); return toInvestigationDTO(doc); }
export async function getAIHealth() { return getAIProvider().health(); }