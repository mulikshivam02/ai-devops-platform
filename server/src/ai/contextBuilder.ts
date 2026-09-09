import { ChangeModel, toChangeDTO } from '../models/Change.js';
import { ChangeAnalysisModel, toChangeAnalysisDTO } from '../models/ChangeAnalysis.js';
import { EvidenceModel, toEvidenceDTO } from '../models/Evidence.js';
import { PredictionSnapshotModel, toPredictionSnapshotDTO } from '../models/PredictionSnapshot.js';
import { ObservedImpactModel, toObservedImpactDTO } from '../models/ObservedImpact.js';
import { PredictionComparisonModel, toPredictionComparisonDTO } from '../models/PredictionComparison.js';
import { ResourceModel } from '../models/Resource.js';
import type { InvestigationContext } from './types.js';
import { AppError } from '../utils/app-error.js';
import mongoose from 'mongoose';
import { SecurityFindingModel } from '../models/SecurityFinding.js';
import { getResourceDependents } from '../services/dependencyService.js';
import { summarizeSecurityBlastRadius } from '../engines/securityBlastRadiusEngine.js';
import { findSimilarChanges, getHistoricalRisk, getPatterns, getPredictionAccuracyHistory } from '../intelligence/historical-intelligence.service.js';

const MAX_EVIDENCE = 40; const MAX_TEXT = 4000; const MAX_HISTORY = 10;
function id(value: string, field: string): string { if (!mongoose.isValidObjectId(value)) throw new AppError(400, `${field} must be a valid MongoDB ObjectId.`); return value; }
function bounded(value: unknown): Record<string, unknown> { if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}; const serialized = JSON.stringify(value); return serialized.length <= MAX_TEXT ? value as Record<string, unknown> : { truncated: true, preview: serialized.slice(0, MAX_TEXT) }; }

export interface SecurityContextInput { id: string; category: string; severity: string; title: string; description: string; resourceId?: string; changeId?: string; evidenceIds: string[]; confidence: number; cve?: string; cwe?: string; directDependents?: string[]; transitiveDependents?: string[]; dependencyDepth?: number; }
export function projectSecurityContext(findings: SecurityContextInput[]): InvestigationContext['securityFindings'] { return findings.slice(0, 100).map((finding) => { const direct = [...new Set((finding.directDependents ?? []).slice(0, 100))]; const transitive = [...new Set((finding.transitiveDependents ?? []).filter((id) => !direct.includes(id)).slice(0, 100))]; return { id: finding.id, category: finding.category, severity: finding.severity, title: finding.title, description: finding.description.slice(0, 2000), ...(finding.resourceId ? { resourceId: finding.resourceId } : {}), ...(finding.changeId ? { changeId: finding.changeId } : {}), evidenceIds: [...new Set(finding.evidenceIds)].slice(0, 20), confidence: finding.confidence, ...(finding.cve ? { cve: finding.cve } : {}), ...(finding.cwe ? { cwe: finding.cwe } : {}), dependencyBlastRadius: { directDependents: direct, transitiveDependents: transitive, dependencyDepth: Math.min(10, finding.dependencyDepth ?? 0), totalPotentiallyAffected: 1 + direct.length + transitive.length, semantics: 'potentially_affected_by_dependency_relationship' as const } }; }); }

export async function buildInvestigationContext(changeId: string): Promise<InvestigationContext> {
  const change = await ChangeModel.findById(id(changeId, 'changeId')); if (!change) throw new AppError(404, 'Change not found.');
  const changeDTO = toChangeDTO(change); const resource = await ResourceModel.findById(change.resourceId).select({ name: 1, type: 1, environment: 1 }); if (!resource) throw new AppError(404, 'Resource not found.');
  const [analysis, evidenceDocs, prediction, observation, comparison, history, securityDocs, similarChanges, riskTrend, predictionAccuracy, historicalPatterns] = await Promise.all([
    ChangeAnalysisModel.findOne({ changeId: change._id }).sort({ analyzedAt: -1 }),
    EvidenceModel.find({ $or: [{ resourceId: change.resourceId }, { _id: { $in: change.evidenceIds } }] }).sort({ timestamp: -1 }).limit(MAX_EVIDENCE),
    PredictionSnapshotModel.findOne({ changeId: change._id }).sort({ predictedAt: -1 }),
    ObservedImpactModel.findOne({ changeId: change._id }).sort({ createdAt: -1 }),
    PredictionComparisonModel.findOne({ changeId: change._id }).sort({ comparedAt: -1 }),
    ChangeModel.find({ resourceId: change.resourceId, _id: { $ne: change._id } }).sort({ timestamp: -1 }).limit(MAX_HISTORY),
    SecurityFindingModel.find({ $or: [{ changeId: change._id }, { resourceId: change.resourceId }] }).sort({ detectedAt: -1 }).limit(100).lean(),
    findSimilarChanges(changeId, 5).catch(() => []), getHistoricalRisk(change.resourceId.toString(), 90).catch(() => ({ status: 'insufficient_evidence' })), getPredictionAccuracyHistory(change.resourceId.toString()).catch(() => ({ status: 'insufficient_evidence' })), getPatterns(change.resourceId.toString()).catch(() => [])
  ]);
  const evidence = evidenceDocs.map((item) => toEvidenceDTO(item)).map((item) => ({ id: item.id, type: item.evidenceType, source: item.source, timestamp: item.timestamp, ...(item.resourceId ? { resourceId: item.resourceId } : {}), payload: bounded(item.payload), metadata: bounded(item.metadata) }));
  const dependencyIds = analysis ? [...new Set([...analysis.directlyAffectedResourceIds, ...analysis.transitivelyAffectedResourceIds].map((item) => item.toString()))].slice(0, 100) : [];
  const dependencies = dependencyIds.map((target) => ({ source: change.resourceId.toString(), target, relationshipType: 'affected_by_analysis' }));
  const securityInputs = await Promise.all(securityDocs.map(async (finding) => { const root = finding.resourceId?.toString() ?? change.resourceId.toString(); const edges = await getResourceDependents(root, 10); const blastRadius = summarizeSecurityBlastRadius(root, edges); return { id: finding._id.toString(), category: finding.category, severity: finding.severity, title: finding.title, description: finding.description, resourceId: finding.resourceId?.toString(), changeId: finding.changeId?.toString(), evidenceIds: finding.evidenceIds.map((id) => id.toString()), confidence: finding.confidence, cve: finding.cve, cwe: finding.cwe, ...blastRadius }; }));
  return { change: { id: changeDTO.id, summary: changeDTO.summary, changeType: changeDTO.changeType, source: changeDTO.source, resourceId: changeDTO.resourceId, evidenceIds: changeDTO.evidenceIds }, resource: { id: resource._id.toString(), name: resource.name, type: resource.type, ...(resource.environment ? { environment: resource.environment } : {}) }, analysis: analysis ? toChangeAnalysisDTO(analysis) : undefined, dependencies, evidence, prediction: prediction ? toPredictionSnapshotDTO(prediction) : undefined, observation: observation ? toObservedImpactDTO(observation) : undefined, comparison: comparison ? toPredictionComparisonDTO(comparison) : undefined, securityFindings: projectSecurityContext(securityInputs), historicalIntelligence: { similarChanges, riskTrend, predictionAccuracy, patterns: historicalPatterns }, history: history.map((item) => { const dto = toChangeDTO(item); return { id: dto.id, summary: dto.summary, changeType: dto.changeType, timestamp: dto.timestamp, status: dto.status }; }) };
}