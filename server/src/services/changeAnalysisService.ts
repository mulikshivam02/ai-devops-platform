import mongoose, { Types } from 'mongoose';
import { ChangeAnalysisModel, toChangeAnalysisDTO } from '../models/ChangeAnalysis.js';
import { ChangeModel, toChangeDTO } from '../models/Change.js';
import { EvidenceModel } from '../models/Evidence.js';
import { ResourceModel } from '../models/Resource.js';
import { getBlastRadius } from './dependencyService.js';
import { normalizeChange } from './changeNormalizationService.js';
import { calculateChangeRisk } from '../engines/riskEngine.js';
import type { ChangeAnalysisDTO, ImpactCategory } from '../types/changeAnalysis.js';
import type { PaginatedResult } from '../types/pagination.js';
import { AppError } from '../utils/app-error.js';
import { SecurityFindingModel } from '../models/SecurityFinding.js';
import { calculateSecurityRiskContribution } from '../engines/securityRiskEngine.js';
import { getHistoricalRiskContribution } from '../intelligence/historical-outcome.service.js';

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

function rollbackFor(change: ReturnType<typeof toChangeDTO>): {
  available: boolean;
  source: string;
  description: string;
} {
  const metadata = change.metadata;
  if (metadata.rollbackAvailable === true)
    return {
      available: true,
      source: 'metadata',
      description: 'Change metadata explicitly records rollback availability.'
    };
  if (change.before !== undefined)
    return { available: true, source: 'before', description: 'A previous value is recorded on the Change.' };
  if (metadata.previousVersion !== undefined || metadata.previousConfiguration !== undefined)
    return {
      available: true,
      source: 'metadata',
      description: 'Previous configuration/version information is recorded on the Change.'
    };
  if (change.deploymentId && metadata.rollback !== undefined)
    return { available: true, source: 'deployment', description: 'Deployment metadata contains rollback information.' };
  return { available: false, source: 'none', description: 'No reliable rollback information is recorded.' };
}

function impactFor(changeType: string, transitiveCount: number): { categories: ImpactCategory[]; summary: string } {
  const categories: ImpactCategory[] = [];
  const categoryMap: Record<string, ImpactCategory | undefined> = {
    infrastructure: 'infrastructure',
    deployment: 'deployment',
    dependency: 'dependency',
    configuration: 'configuration',
    security: 'security'
  };
  const typeCategory = categoryMap[changeType];
  if (typeCategory) categories.push(typeCategory);
  if (transitiveCount > 0 && !categories.includes('dependency')) categories.push('dependency');
  return {
    categories,
    summary: `Observed change data was normalized and the deterministic dependency graph identified ${transitiveCount} transitive affected resource(s). This is potential impact, not an observation of an outage or performance change.`
  };
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
  if (evidenceIds.length !== (await EvidenceModel.countDocuments({ _id: { $in: evidenceIds } })))
    throw new AppError(404, 'One or more Change evidence records were not found.');
  const changedItems = normalizeChange(changeDTO);
  const metadata = changeDTO.metadata;
  const explicitIds = getExplicitResourceIds(metadata);
  if (explicitIds.some((id) => !mongoose.isValidObjectId(id)))
    throw new AppError(400, 'One or more explicitly affected resource IDs are invalid.');
  const distinctExplicitIds = explicitIds.filter((id) => id !== changeDTO.resourceId);
  const explicitObjectIds = distinctExplicitIds.map((id) => new Types.ObjectId(id));
  if (explicitObjectIds.length !== (await ResourceModel.countDocuments({ _id: { $in: explicitObjectIds } })))
    throw new AppError(404, 'One or more explicitly affected resources were not found.');
  // The single directed, depth-tracked traversal (dependents only -- see
  // dependencyService.ts#getBlastRadius for why direction matters here).
  // Manual overrides from metadata.affectedResourceIds are merged into "direct"
  // alongside whatever the dependency graph itself reports. Previously this
  // function unioned BOTH dependencies and dependents into one "transitive"
  // bucket -- meaning a change's blast radius could include resources that
  // depend on nothing this change touches, while "direct" came only from manual
  // metadata and never from the graph at all. See review 2.3/2.4/3.1.
  const blastRadius = await getBlastRadius(changeDTO.resourceId, MAX_DEPTH);
  const directIds = new Set([...blastRadius.direct, ...distinctExplicitIds]);
  const transitive = [...blastRadius.transitive].filter((id) => !directIds.has(id)).map((id) => new Types.ObjectId(id));
  const directGraphResourceIds = [...directIds].map((id) => new Types.ObjectId(id));
  const maxDependencyDepth = blastRadius.maxDepth;
  const rollback = rollbackFor(changeDTO);
  const securityFindings = await SecurityFindingModel.find({ changeId: changeObjectId })
    .select({ severity: 1, fingerprint: 1 })
    .limit(1000)
    .lean();
  const securityContribution = calculateSecurityRiskContribution(
    securityFindings.map((finding) => ({ severity: finding.severity, fingerprint: finding.fingerprint }))
  );
  const historical = await getHistoricalRiskContribution(changeDTO.resourceId, changeDTO.changeType);
  const risk = calculateChangeRisk({
    changeType: changeDTO.changeType,
    environment: resource.environment,
    changedItemCount: changedItems.length,
    directCount: directGraphResourceIds.length,
    transitiveCount: transitive.length,
    maxDependencyDepth,
    rollbackAvailable: rollback.available,
    securityContribution,
    historicalContribution: historical.contribution,
    historicalReason: historical.reason
  });
  const impact = impactFor(changeDTO.changeType, transitive.length);
  const data = {
    changeId: changeObjectId,
    resourceId,
    analyzedAt: new Date(),
    changedItems,
    directlyAffectedResourceIds: directGraphResourceIds,
    transitivelyAffectedResourceIds: transitive,
    blastRadius: {
      directCount: directGraphResourceIds.length,
      transitiveCount: transitive.length,
      // Self (the changed resource) plus every direct and transitive dependent.
      // Self is intentionally NOT included in directlyAffectedResourceIds above
      // (a resource isn't "affected by" its own change in any meaningful sense
      // for that field), but IS counted here since totalCount represents the
      // full scope of the change including its origin. comparisonEngine.ts's
      // accuracy comparison accounts for this same +1 when diffing against
      // observed resource counts. See review 2.5.
      totalCount: 1 + directGraphResourceIds.length + transitive.length,
      maxDependencyDepth
    },
    risk,
    impact,
    rollback,
    evidenceIds,
    analysisVersion: ANALYSIS_VERSION,
    metadata: {
      historical: {
        contribution: historical.contribution,
        reason: historical.reason,
        sampleSize: historical.sampleSize
      }
    }
  };
  // Was findOneAndUpdate(..., { upsert: true }) keyed on a unique changeId --
  // meaning re-analysing a change overwrote its only analysis record, while
  // getLatestAnalysis's `.sort({ analyzedAt: -1 })` and the analysisVersion field
  // both implied history existed. It didn't. Every analysis is now its own
  // document, so a change's risk assessment can genuinely be compared across
  // versions/re-runs instead of only ever showing the most recent one. See
  // review 2.6.
  const analysis = await ChangeAnalysisModel.create(data);
  return toChangeAnalysisDTO(analysis);
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

export async function listAnalyses(
  changeId: string | undefined,
  resourceId: string | undefined,
  page: number,
  limit: number
): Promise<PaginatedResult<ChangeAnalysisDTO>> {
  const query: Record<string, unknown> = {};
  if (changeId) query.changeId = assertId(changeId, 'changeId');
  if (resourceId) query.resourceId = assertId(resourceId, 'resourceId');
  const [records, total] = await Promise.all([
    ChangeAnalysisModel.find(query)
      .sort({ analyzedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    ChangeAnalysisModel.countDocuments(query)
  ]);
  return {
    data: records.map((record) => toChangeAnalysisDTO(record)),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  };
}
