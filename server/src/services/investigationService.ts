import mongoose, { Types } from 'mongoose';
import { InvestigationModel, toInvestigationDTO } from '../models/Investigation.js';
import { ChangeModel } from '../models/Change.js';
import { buildInvestigationContext } from '../ai/contextBuilder.js';
import { buildInvestigationPrompt, promptVersion } from '../ai/promptBuilder.js';
import { getAIProvider } from '../ai/provider.js';
import { AIProviderError } from '../ai/ollamaProvider.js';
import { validateAIResult } from '../ai/responseValidator.js';
import type { AIAnalysisResult, InvestigationContext } from '../ai/types.js';
import { AppError } from '../utils/app-error.js';
import { describeError, logEvent } from '../utils/lookup.js';

function objectId(id: string, field: string): Types.ObjectId {
  if (!mongoose.isValidObjectId(id)) throw new AppError(400, `${field} must be a valid MongoDB ObjectId.`);
  return new Types.ObjectId(id);
}
function refIds(values: string[]): Types.ObjectId[] {
  return values.map((value) => objectId(value, 'evidenceId'));
}

interface ChangeRef {
  _id: Types.ObjectId;
  resourceId: Types.ObjectId;
}

/** Maps whatever went wrong inside the AI step to the error we store and the one we throw. */
function classifyFailure(error: unknown): { errorCode: string; thrown: AppError } {
  if (error instanceof AIProviderError) {
    return { errorCode: error.code, thrown: new AppError(503, error.message, error.code, { cause: error }) };
  }

  if (error instanceof AppError) {
    return { errorCode: error.code === 'APP_ERROR' ? 'AI_VALIDATION_ERROR' : error.code, thrown: error };
  }

  // Not ours: a bug, or something we did not anticipate. Keep the original as `cause` so it is not
  // lost behind a generic message.
  return {
    errorCode: 'AI_UNEXPECTED_ERROR',
    thrown: new AppError(502, 'AI investigation failed unexpectedly.', 'AI_UNEXPECTED_ERROR', { cause: error })
  };
}

async function recordFailure(
  change: ChangeRef,
  provider: { name: string; model: string },
  failure: { errorCode: string; thrown: AppError },
  startedAt: number
): Promise<void> {
  // The failed-attempt record is a courtesy. If writing it fails (the database may be the very
  // reason we are here) that must not replace the error the caller needs to see.
  try {
    await InvestigationModel.create({
      changeId: change._id,
      resourceId: change.resourceId,
      type: 'change_analysis',
      status: 'failed',
      hypotheses: [],
      reasoning: [],
      recommendations: [],
      limitations: ['Investigation did not complete.'],
      provider: provider.name,
      model: provider.model,
      promptVersion,
      latencyMs: Date.now() - startedAt,
      errorCode: failure.errorCode,
      errorMessage: failure.thrown.message
    });
  } catch (writeError) {
    logEvent('error', 'INVESTIGATION_FAILURE_RECORD_FAILED', {
      changeId: change._id.toString(),
      originalError: failure.thrown.message,
      ...describeError(writeError)
    });
  }
}

export async function investigateChange(changeId: string) {
  const startedAt = Date.now();
  const changeObjectId = objectId(changeId, 'changeId');
  const change = await ChangeModel.findById(changeObjectId);
  if (!change) throw new AppError(404, 'Change not found.');
  // Built once and reused for persistence: a second build costs the same queries again and could
  // describe different data than the model was shown.
  const context = await buildInvestigationContext(changeId);
  const provider = getAIProvider();
  const prompt = buildInvestigationPrompt({ type: 'change_analysis', context });
  const allowedEvidence = new Set(context.evidence.map((item) => item.id));
  let result: AIAnalysisResult;
  try {
    result = validateAIResult(await provider.analyze({ type: 'change_analysis', context, prompt }), allowedEvidence);
  } catch (error) {
    const failure = classifyFailure(error);
    logEvent('error', 'INVESTIGATION_FAILED', {
      changeId,
      provider: provider.name,
      model: provider.model,
      errorCode: failure.errorCode,
      ...describeError(error)
    });
    await recordFailure(change, provider, failure, startedAt);
    throw failure.thrown;
  }
  // Outside the try on purpose: a failed save is a storage problem, not an AI failure, and should
  // not be recorded or reported as one.
  return persistCompleted(change, context, result, provider, Date.now() - startedAt);
}

async function persistCompleted(
  change: ChangeRef,
  context: InvestigationContext,
  result: AIAnalysisResult,
  provider: { name: string; model: string },
  latencyMs: number
) {
  const data = {
    changeId: change._id,
    resourceId: change.resourceId,
    ...(context.analysis && typeof context.analysis === 'object' && 'id' in context.analysis
      ? { analysisId: objectId(String(context.analysis.id), 'analysisId') }
      : {}),
    ...(context.prediction && typeof context.prediction === 'object' && 'id' in context.prediction
      ? { predictionId: objectId(String(context.prediction.id), 'predictionId') }
      : {}),
    ...(context.observation && typeof context.observation === 'object' && 'id' in context.observation
      ? { observationId: objectId(String(context.observation.id), 'observationId') }
      : {}),
    ...(context.comparison && typeof context.comparison === 'object' && 'id' in context.comparison
      ? { comparisonId: objectId(String(context.comparison.id), 'comparisonId') }
      : {}),
    type: 'change_analysis' as const,
    status: 'completed' as const,
    summary: result.summary,
    rootCause: {
      statement: result.rootCause.statement,
      confidence: result.rootCause.confidence,
      evidenceIds: refIds(result.rootCause.evidenceIds)
    },
    hypotheses: result.hypotheses.map((item) => ({
      ...item,
      supportingEvidenceIds: refIds(item.supportingEvidenceIds),
      contradictingEvidenceIds: refIds(item.contradictingEvidenceIds)
    })),
    reasoning: result.reasoning,
    impactExplanation: result.impactExplanation,
    predictionRealityExplanation: result.predictionRealityExplanation,
    recommendations: result.recommendations.map((item) => ({
      ...item,
      supportingEvidenceIds: refIds(item.supportingEvidenceIds)
    })),
    limitations: result.limitations,
    provider: provider.name,
    model: provider.model,
    promptVersion
  };
  const doc = await InvestigationModel.create({ ...data, latencyMs });
  return toInvestigationDTO(doc);
}

export async function listInvestigations(changeId: string) {
  const docs = await InvestigationModel.find({ changeId: objectId(changeId, 'changeId') })
    .sort({ createdAt: -1 })
    .limit(50);
  return docs.map((doc) => toInvestigationDTO(doc));
}
export async function getInvestigation(id: string) {
  const doc = await InvestigationModel.findById(objectId(id, 'investigationId'));
  if (!doc) throw new AppError(404, 'Investigation not found.');
  return toInvestigationDTO(doc);
}
export async function getAIHealth() {
  return getAIProvider().health();
}
