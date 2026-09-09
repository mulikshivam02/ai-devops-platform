import mongoose, { Types } from 'mongoose';
import { ChangeAnalysisModel, toChangeAnalysisDTO, type ChangeAnalysisHydratedDocument } from '../models/ChangeAnalysis.js';
import { ChangeModel, toChangeDTO } from '../models/Change.js';
import { EvidenceModel } from '../models/Evidence.js';
import { ResourceModel } from '../models/Resource.js';
import { getResourceDependencies, getResourceDependents } from './dependencyService.js';
import { normalizeChange } from './changeNormalizationService.js';
import { calculateChangeRisk } from '../engines/riskEngine.js';
import type { ChangeAnalysisDTO, ImpactCategory } from '../types/changeAnalysis.js';
import type { PaginatedResult } from '../types/pagination.js';
import { AppError } from '../utils/app-error.js';

const MAX_DEPTH = 10;
const ANALYSIS_VERSION = '1.0';

function assertId(id: string, field: string): Types.ObjectId {
  if (!mongoose.isValidObjectId(id)) throw new AppError(400, `${field} must be a valid MongoDB ObjectId.`);
  return new Types.ObjectId(id);
}

function getExplicitResourceIds(metadata: Record<string, unknown>): string[] {
  if (!Array.isArray(metadata.affectedResourceIds)) return [];
  return [...new Set(metadata.affectedResourceIds.filter((id): id is string => typeof id === 'string'))];
}

function rollbackFor(change: ReturnType<typeof toChangeDTO>): { available: boolean; source: string; description: string } {
  const metadata = change.metadata as Record<string, unknown>;
  if (metadata.rollbackAvailable === true) return { available: true, source: 'metadata', description: 'Change metadata explicitly records rollback availability.' };
  if (change.before !== undefined) return { available: true, source: 'before', description: 'A previous value is recorded on the Change.' };
  if (metadata.previousVersion !== undefined || metadata.previousConfiguration !== undefined) return { available: true, source: 'metadata', description: 'Previous configuration/version information is recorded on the Change.' };
  if (change.deploymentId && metadata.rollback !== undefined) return { available: true, source: 'deployment', description: 'Deployment metadata contains rollback information.' };
  return { available: false, source: 'none', description: 'No reliable rollback information is recorded.' };
}

function impactFor(changeType: string, transitiveCount: number): { categories: ImpactCategory[]; summary: string } {
  const categories: ImpactCategory[] = [];
  const categoryMap: Record<string, ImpactCategory | undefined> = { infrastructure: 'infrastructure', deployment: 'deployment', dependency: 'dependency', configuration: 'configuration', security: 'security' };
  const typeCategory = categoryMap[changeType];
  if (typeCategory) categories.push(typeCategory);
  if (transitiveCount > 0 && !categories.includes('dependency')) categories.push('dependency');
  return { categories, summary: `Observed change data was normalized and the deterministic dependency graph identified ${transitiveCount} transitive affected resource(s). This is potential impact, not an observation of an outage or performance change.` };
}

export async function analyzeChange(changeId: string): Promise<ChangeAnalysisDTO> {
  const changeObjectId = assertId(changeId, 'changeId');
  const change = await ChangeModel.findById(changeObjectId);
  if (!change) throw new AppError(404, 'Change not found.');
  const changeDTO = toChangeDTO(change);
  const resourceId = assertId(changeDTO.resourceId, 'resourceId');
  const resource = await ResourceModel.findById(resourceId).select({ environment: 1 });
  if (!resource) throw new AppError(404, 'Resource not found.');
  const evidenceIds = [...new Set(changeDTO.evidenceIds)].map((id) => assertId(id, 'evidenceIds'));
  if (evidenceIds.length !== await EvidenceModel.countDocuments({ _id: { $in: evidenceIds } })) throw new AppError(404, 'One or more Change evidence records were not found.');
  const changedItems = normalizeChange(changeDTO);
  const metadata = changeDTO.metadata as Record<string, unknown>;
  const explicitIds = getExplicitResourceIds(metadata);
  if (explicitIds.some((id) => !mongoose.isValidObjectId(id))) throw new AppError(400, 'One or more explicitly affected resource IDs are invalid.');
  const distinctExplicitIds = explicitIds.filter((id) => id !== changeDTO.resourceId);
  const explicitObjectIds = distinctExplicitIds.map((id) => new Types.ObjectId(id));
  if (explicitObjectIds.length !== await ResourceModel.countDocuments({ _id: { $in: explicitObjectIds } })) throw new AppError(404, 'One or more explicitly affected resources were not found.');
  const directlyAffected = [resourceId, ...explicitObjectIds.filter((id) => !id.equals(resourceId))];
  const dependencyEdges = await getResourceDependencies(changeDTO.resourceId, MAX_DEPTH);
  const dependentEdges = await getResourceDependents(changeDTO.resourceId, MAX_DEPTH);
  const allEdges = [...dependencyEdges, ...dependentEdges];
  const transitive = [...new Set(allEdges.flatMap((edge) => [edge.sourceResourceId, edge.targetResourceId]).filter((id) => !directlyAffected.some((direct) => direct.toString() === id)))].map((id) => new Types.ObjectId(id));
  const maxDependencyDepth = calculateMaxDepth(changeDTO.resourceId, allEdges);
  const rollback = rollbackFor(changeDTO);
  const risk = calculateChangeRisk({ changeType: changeDTO.changeType, environment: resource.environment, changedItemCount: changedItems.length, transitiveCount: transitive.length, maxDependencyDepth, rollbackAvailable: rollback.available });
  const impact = impactFor(changeDTO.changeType, transitive.length);
  const data = { changeId: changeObjectId, resourceId, analyzedAt: new Date(), changedItems, directlyAffectedResourceIds: directlyAffected, transitivelyAffectedResourceIds: transitive, blastRadius: { directCount: Math.max(0, directlyAffected.length - 1), transitiveCount: transitive.length, totalCount: directlyAffected.length + transitive.length, maxDependencyDepth }, risk, impact, rollback, evidenceIds, analysisVersion: ANALYSIS_VERSION, metadata: {} };
  const analysis = await ChangeAnalysisModel.findOneAndUpdate({ changeId: changeObjectId }, data, { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true });
  return toChangeAnalysisDTO(analysis as ChangeAnalysisHydratedDocument);
}

function calculateMaxDepth(rootId: string, edges: Array<{ sourceResourceId: string; targetResourceId: string }>): number {
  const adjacency = new Map<string, string[]>();
  edges.forEach((edge) => {
    adjacency.set(edge.sourceResourceId, [...(adjacency.get(edge.sourceResourceId) ?? []), edge.targetResourceId]);
    adjacency.set(edge.targetResourceId, [...(adjacency.get(edge.targetResourceId) ?? []), edge.sourceResourceId]);
  });
  const distances = new Map<string, number>([[rootId, 0]]);
  const queue = [rootId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of adjacency.get(current) ?? []) {
      if (!distances.has(next)) { distances.set(next, (distances.get(current) ?? 0) + 1); queue.push(next); }
    }
  }
  return Math.max(0, ...distances.values());
}

export async function getLatestAnalysis(changeId: string): Promise<ChangeAnalysisDTO> {
  const objectId = assertId(changeId, 'changeId');
  const analysis = await ChangeAnalysisModel.findOne({ changeId: objectId }).sort({ analyzedAt: -1 });
  if (!analysis) throw new AppError(404, 'Change analysis not found.');
  return toChangeAnalysisDTO(analysis);
}

export async function getAnalysisById(id: string): Promise<ChangeAnalysisDTO> {
  const analysis = await ChangeAnalysisModel.findById(assertId(id, 'analysisId'));
  if (!analysis) throw new AppError(404, 'Change analysis not found.');
  return toChangeAnalysisDTO(analysis);
}

export async function listAnalyses(changeId: string | undefined, resourceId: string | undefined, page: number, limit: number): Promise<PaginatedResult<ChangeAnalysisDTO>> {
  const query: Record<string, unknown> = {};
  if (changeId) query.changeId = assertId(changeId, 'changeId');
  if (resourceId) query.resourceId = assertId(resourceId, 'resourceId');
  const [records, total] = await Promise.all([ChangeAnalysisModel.find(query).sort({ analyzedAt: -1 }).skip((page - 1) * limit).limit(limit), ChangeAnalysisModel.countDocuments(query)]);
  return { data: records.map((record) => toChangeAnalysisDTO(record as ChangeAnalysisHydratedDocument)), pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}