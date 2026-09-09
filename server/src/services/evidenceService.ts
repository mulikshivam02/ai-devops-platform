import mongoose, { Types } from 'mongoose';
import { EvidenceModel, toEvidenceDTO, type EvidenceHydratedDocument } from '../models/Evidence.js';
import { ResourceModel } from '../models/Resource.js';
import type { CreateEvidenceInput, EvidenceDTO, EvidenceFilters } from '../types/evidence.js';
import type { PaginatedResult } from '../types/pagination.js';
import { AppError } from '../utils/app-error.js';
import { sanitizeObject } from '../utils/sensitive-data.js';

async function assertResourceExists(resourceId: string): Promise<Types.ObjectId> {
  if (!mongoose.isValidObjectId(resourceId)) throw new AppError(400, 'resourceId must be a valid MongoDB ObjectId.');
  const objectId = new Types.ObjectId(resourceId);
  if (!(await ResourceModel.exists({ _id: objectId }))) throw new AppError(404, 'Resource not found.');
  return objectId;
}

export async function createEvidence(input: CreateEvidenceInput): Promise<EvidenceDTO> {
  const resourceId = input.resourceId ? await assertResourceExists(input.resourceId) : undefined;
  const evidence = await EvidenceModel.create({
    ...input,
    ...(resourceId ? { resourceId } : {}),
    timestamp: new Date(input.timestamp),
    payload: sanitizeObject(input.payload),
    metadata: sanitizeObject(input.metadata)
  });
  return toEvidenceDTO(evidence);
}

export async function getEvidence(filters: EvidenceFilters, page: number, limit: number): Promise<PaginatedResult<EvidenceDTO>> {
  const query: Record<string, unknown> = {};
  if (filters.resourceId) query.resourceId = await assertResourceExists(filters.resourceId);
  if (filters.evidenceType) query.evidenceType = filters.evidenceType;
  if (filters.source) query.source = filters.source;
  if (filters.correlationId) query.correlationId = filters.correlationId;
  if (filters.startTime || filters.endTime) query.timestamp = { ...(filters.startTime ? { $gte: filters.startTime } : {}), ...(filters.endTime ? { $lte: filters.endTime } : {}) };
  const [records, total] = await Promise.all([
    EvidenceModel.find(query).sort({ timestamp: -1 }).skip((page - 1) * limit).limit(limit),
    EvidenceModel.countDocuments(query)
  ]);
  return { data: records.map((record) => toEvidenceDTO(record as EvidenceHydratedDocument)), pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

export async function getEvidenceById(id: string): Promise<EvidenceDTO> {
  if (!mongoose.isValidObjectId(id)) throw new AppError(400, 'Evidence ID must be a valid MongoDB ObjectId.');
  const evidence = await EvidenceModel.findById(id);
  if (!evidence) throw new AppError(404, 'Evidence not found.');
  return toEvidenceDTO(evidence);
}

export function getEvidenceForResource(resourceId: string, page: number, limit: number): Promise<PaginatedResult<EvidenceDTO>> {
  return getEvidence({ resourceId }, page, limit);
}

export async function deleteEvidence(id: string): Promise<void> {
  if (!mongoose.isValidObjectId(id)) throw new AppError(400, 'Evidence ID must be a valid MongoDB ObjectId.');
  if (!(await EvidenceModel.findByIdAndDelete(id))) throw new AppError(404, 'Evidence not found.');
}