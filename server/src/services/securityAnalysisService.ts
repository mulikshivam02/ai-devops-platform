import mongoose, { Types } from 'mongoose';
import { ChangeModel } from '../models/Change.js';
import { EvidenceModel } from '../models/Evidence.js';
import { ResourceModel } from '../models/Resource.js';
import {
  SecurityFindingModel,
  toSecurityFindingDTO,
  type SecurityFindingHydratedDocument
} from '../models/SecurityFinding.js';
import { calculateSecurityRiskContribution } from '../engines/securityRiskEngine.js';
import { normalizeSecurityEvidence, fingerprintFor } from './securityNormalizer.js';
import type {
  CreateSecurityFindingInput,
  SecurityFinding,
  SecurityFindingFilters,
  SecuritySummary
} from '../types/security.js';
import type { PaginatedResult } from '../types/pagination.js';
import { AppError } from '../utils/app-error.js';
import { sanitizeObject } from '../utils/sensitive-data.js';

function objectId(value: string, field: string): Types.ObjectId {
  if (!mongoose.isValidObjectId(value)) throw new AppError(400, `${field} must be a valid MongoDB ObjectId.`);
  return new Types.ObjectId(value);
}
async function existingId(
  value: string | undefined,
  field: string,
  model: typeof ResourceModel | typeof ChangeModel
): Promise<Types.ObjectId | undefined> {
  if (!value) return undefined;
  const id = objectId(value, field);
  if (!(await model.exists({ _id: id }))) throw new AppError(404, `${field} reference was not found.`);
  return id;
}
async function evidenceIds(values: string[] = []): Promise<Types.ObjectId[]> {
  const ids = [...new Set(values)].map((value) => objectId(value, 'evidenceIds'));
  if (ids.length !== (await EvidenceModel.countDocuments({ _id: { $in: ids } })))
    throw new AppError(404, 'One or more evidence references were not found.');
  return ids;
}
function dto(document: SecurityFindingHydratedDocument): SecurityFinding {
  return toSecurityFindingDTO(document);
}

export async function createSecurityFinding(input: CreateSecurityFindingInput): Promise<SecurityFinding> {
  const resourceId = await existingId(input.resourceId, 'resourceId', ResourceModel);
  const changeId = await existingId(input.changeId, 'changeId', ChangeModel);
  const refs = await evidenceIds(input.evidenceIds);
  if (!Number.isInteger(input.confidence ?? 60) || (input.confidence ?? 60) < 0 || (input.confidence ?? 60) > 100)
    throw new AppError(400, 'confidence must be an integer between 0 and 100.');
  const detectedAt = new Date(input.detectedAt);
  if (Number.isNaN(detectedAt.getTime())) throw new AppError(400, 'detectedAt must be a valid date.');
  const fingerprint = fingerprintFor(input);

  // Split into what only makes sense the first time this fingerprint is seen
  // (identity fields, status defaulting to 'open', the original detectedAt) versus
  // what should reflect the LATEST scan every time (severity, description,
  // fixedVersion, confidence, metadata, remediation guidance). The previous
  // version used $setOnInsert for everything, so a CVE re-scanned as critical
  // after first being logged as medium stayed medium forever -- the record was
  // created once and never updated again. See review 2.2/3.2.
  const onInsert = {
    ...(resourceId ? { resourceId } : {}),
    ...(changeId ? { changeId } : {}),
    source: input.source,
    category: input.category,
    title: input.title,
    ...(input.ruleId ? { ruleId: input.ruleId } : {}),
    ...(input.cve ? { cve: input.cve } : {}),
    ...(input.cwe ? { cwe: input.cwe } : {}),
    ...(input.package ? { package: input.package } : {}),
    ...(input.location ? { location: input.location } : {}),
    fingerprint,
    detectedAt,
    status: input.status ?? 'open'
  };
  const onEveryScan = {
    severity: input.severity ?? 'unknown',
    description: input.description,
    ...(input.installedVersion ? { installedVersion: input.installedVersion } : {}),
    ...(input.fixedVersion ? { fixedVersion: input.fixedVersion } : {}),
    confidence: input.confidence ?? 60,
    remediation: input.remediation ?? { available: false },
    metadata: sanitizeObject(input.metadata ?? {}),
    lastSeenAt: new Date()
  };
  const saved = await SecurityFindingModel.findOneAndUpdate(
    { fingerprint },
    { $setOnInsert: onInsert, $set: onEveryScan, $addToSet: { evidenceIds: { $each: refs } } },
    { new: true, upsert: true, runValidators: true }
  );
  return dto(saved);
}

export async function listSecurityFindings(
  filters: SecurityFindingFilters,
  page: number,
  limit: number
): Promise<PaginatedResult<SecurityFinding>> {
  const query = buildSecurityQuery(filters);
  const [records, total] = await Promise.all([
    SecurityFindingModel.find(query)
      .sort({ detectedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    SecurityFindingModel.countDocuments(query)
  ]);
  return {
    data: records.map((record) => dto(record)),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  };
}
function buildSecurityQuery(filters: SecurityFindingFilters): Record<string, unknown> {
  const query: Record<string, unknown> = {};
  for (const key of ['severity', 'category', 'status', 'source'] as const) if (filters[key]) query[key] = filters[key];
  if (filters.resourceId) query.resourceId = objectId(filters.resourceId, 'resourceId');
  if (filters.changeId) query.changeId = objectId(filters.changeId, 'changeId');
  return query;
}
export async function getSecurityFinding(id: string): Promise<SecurityFinding> {
  const record = await SecurityFindingModel.findById(objectId(id, 'findingId'));
  if (!record) throw new AppError(404, 'Security finding not found.');
  return dto(record);
}
export async function updateSecurityFinding(
  id: string,
  input: Partial<Pick<CreateSecurityFindingInput, 'status' | 'metadata' | 'remediation'>>
): Promise<SecurityFinding> {
  const record = await SecurityFindingModel.findByIdAndUpdate(
    objectId(id, 'findingId'),
    {
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.remediation !== undefined ? { remediation: input.remediation } : {}),
      ...(input.metadata !== undefined ? { metadata: sanitizeObject(input.metadata) } : {})
    },
    { new: true, runValidators: true }
  );
  if (!record) throw new AppError(404, 'Security finding not found.');
  return dto(record);
}
export async function deleteSecurityFinding(id: string): Promise<void> {
  if (!(await SecurityFindingModel.findByIdAndDelete(objectId(id, 'findingId'))))
    throw new AppError(404, 'Security finding not found.');
}
// Was `listSecurityFindings(filters, 1, 1000).data.length` for `total` -- the
// fetched PAGE size (capped at 1000), not the true count. Past 1000 matching
// findings, every field derived from that array (total, per-severity counts,
// categories, open count, affectedResources, highestSeverity) silently
// under-reported with no indication anything was truncated. Every count here now
// comes from a database aggregation, so it's correct regardless of how many
// findings exist. See review 2.21/3.10.
export async function getSecuritySummary(filters: SecurityFindingFilters = {}): Promise<SecuritySummary> {
  const query = buildSecurityQuery(filters);
  const [bySeverity, byCategory, openCount, affectedResourceIds, riskFindings] = await Promise.all([
    SecurityFindingModel.aggregate<{ _id: string; count: number }>([
      { $match: query },
      { $group: { _id: '$severity', count: { $sum: 1 } } }
    ]),
    SecurityFindingModel.aggregate<{ _id: string; count: number }>([
      { $match: query },
      { $group: { _id: '$category', count: { $sum: 1 } } }
    ]),
    SecurityFindingModel.countDocuments({ ...query, status: 'open' }),
    SecurityFindingModel.distinct('resourceId', { ...query, resourceId: { $ne: null } }),
    // calculateSecurityRiskContribution only needs severity + fingerprint (for
    // dedup), so this is a lightweight projection rather than full documents --
    // and unlike the old `.limit(1000)`, nothing here silently truncates it.
    SecurityFindingModel.find(query).select({ severity: 1, fingerprint: 1 }).limit(10000).lean()
  ]);
  const total = bySeverity.reduce((sum, group) => sum + group.count, 0);
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const group of bySeverity) if (group._id in counts) counts[group._id as keyof typeof counts] += group.count;
  const severityOrder = ['critical', 'high', 'medium', 'low', 'info', 'unknown'] as const;
  const presentSeverities = new Set(bySeverity.map((group) => group._id));
  const highest = severityOrder.find((severity) => presentSeverities.has(severity)) ?? 'unknown';
  return {
    total,
    ...counts,
    open: openCount,
    affectedResources: affectedResourceIds.length,
    categories: Object.fromEntries(byCategory.map((group) => [group._id, group.count])),
    highestSeverity: highest,
    riskContribution: calculateSecurityRiskContribution(riskFindings)
  };
}
export function getSecurityFindingsForChange(
  changeId: string,
  page: number,
  limit: number
): Promise<PaginatedResult<SecurityFinding>> {
  return listSecurityFindings({ changeId }, page, limit);
}
export function getSecurityFindingsForResource(
  resourceId: string,
  page: number,
  limit: number
): Promise<PaginatedResult<SecurityFinding>> {
  return listSecurityFindings({ resourceId }, page, limit);
}
export async function analyzeChangeSecurity(
  changeId: string
): Promise<{ changeId: string; findings: SecurityFinding[]; summary: SecuritySummary }> {
  const changeObjectId = objectId(changeId, 'changeId');
  const change = await ChangeModel.findById(changeObjectId);
  if (!change) throw new AppError(404, 'Change not found.');
  const evidence = await EvidenceModel.find({ _id: { $in: change.evidenceIds } }).limit(100);
  const normalized = evidence.flatMap((record) =>
    normalizeSecurityEvidence(record.payload, {
      resourceId: change.resourceId.toString(),
      changeId,
      evidenceIds: [record._id.toString()]
    })
  );
  const findings = await Promise.all(normalized.map((value) => createSecurityFinding(value)));
  return { changeId, findings, summary: await getSecuritySummary({ changeId }) };
}
