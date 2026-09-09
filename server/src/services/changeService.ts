import mongoose, { Types } from 'mongoose';
import { ChangeModel, toChangeDTO, type ChangeHydratedDocument } from '../models/Change.js';
import { EvidenceModel } from '../models/Evidence.js';
import { ResourceModel } from '../models/Resource.js';
import type { ChangeDTO, ChangeFilters, CreateChangeInput, ChangeStatus } from '../types/change.js';
import type { PaginatedResult } from '../types/pagination.js';
import { AppError } from '../utils/app-error.js';
import { sanitizeObject, sanitizeStructured } from '../utils/sensitive-data.js';

async function assertResourceExists(resourceId: string): Promise<Types.ObjectId> {
  if (!mongoose.isValidObjectId(resourceId)) throw new AppError(400, 'resourceId must be a valid MongoDB ObjectId.');
  const objectId = new Types.ObjectId(resourceId);
  if (!(await ResourceModel.exists({ _id: objectId }))) throw new AppError(404, 'Resource not found.');
  return objectId;
}

async function validateEvidenceIds(evidenceIds: string[] = []): Promise<Types.ObjectId[]> {
  if (evidenceIds.some((id) => !mongoose.isValidObjectId(id))) throw new AppError(400, 'evidenceIds must contain valid MongoDB ObjectIds.');
  const objectIds = evidenceIds.map((id) => new Types.ObjectId(id));
  if (objectIds.length !== await EvidenceModel.countDocuments({ _id: { $in: objectIds } })) throw new AppError(404, 'One or more evidence records were not found.');
  return objectIds;
}

export async function createChange(input: CreateChangeInput): Promise<ChangeDTO> {
  const resourceId = await assertResourceExists(input.resourceId);
  const evidenceIds = await validateEvidenceIds(input.evidenceIds);
  const change = await ChangeModel.create({
    ...input,
    resourceId,
    evidenceIds,
    timestamp: new Date(input.timestamp),
    before: input.before !== undefined ? sanitizeStructured(input.before) : undefined,
    after: input.after !== undefined ? sanitizeStructured(input.after) : undefined,
    metadata: sanitizeObject(input.metadata)
  });
  return toChangeDTO(change);
}

export async function getChanges(filters: ChangeFilters, page: number, limit: number): Promise<PaginatedResult<ChangeDTO>> {
  const query: Record<string, unknown> = {};
  if (filters.resourceId) query.resourceId = await assertResourceExists(filters.resourceId);
  if (filters.source) query.source = filters.source;
  if (filters.changeType) query.changeType = filters.changeType;
  if (filters.status) query.status = filters.status;
  if (filters.author) query.author = filters.author;
  if (filters.startTime || filters.endTime) query.timestamp = { ...(filters.startTime ? { $gte: filters.startTime } : {}), ...(filters.endTime ? { $lte: filters.endTime } : {}) };
  const [records, total] = await Promise.all([
    ChangeModel.find(query).sort({ timestamp: -1 }).skip((page - 1) * limit).limit(limit),
    ChangeModel.countDocuments(query)
  ]);
  return { data: records.map((record) => toChangeDTO(record as ChangeHydratedDocument)), pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

export async function getChangeById(id: string): Promise<ChangeDTO> {
  if (!mongoose.isValidObjectId(id)) throw new AppError(400, 'Change ID must be a valid MongoDB ObjectId.');
  const change = await ChangeModel.findById(id);
  if (!change) throw new AppError(404, 'Change not found.');
  return toChangeDTO(change);
}

export function getChangesForResource(resourceId: string, page: number, limit: number): Promise<PaginatedResult<ChangeDTO>> {
  return getChanges({ resourceId }, page, limit);
}

export async function updateChangeStatus(id: string, status: ChangeStatus): Promise<ChangeDTO> {
  if (!mongoose.isValidObjectId(id)) throw new AppError(400, 'Change ID must be a valid MongoDB ObjectId.');
  const change = await ChangeModel.findByIdAndUpdate(id, { status }, { new: true, runValidators: true });
  if (!change) throw new AppError(404, 'Change not found.');
  return toChangeDTO(change);
}