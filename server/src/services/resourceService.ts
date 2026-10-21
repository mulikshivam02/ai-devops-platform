import mongoose from 'mongoose';
import { ResourceModel, toResourceRecord } from '../models/Resource.js';
import type { CreateResourceInput, ResourceFilters, ResourceRecord, UpdateResourceInput } from '../types/resource.js';
import type { PaginatedResult } from '../types/pagination.js';
import { AppError } from '../utils/app-error.js';

function assertResourceId(id: string): void {
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError(400, 'Resource ID must be a valid MongoDB ObjectId.');
  }
}

function isDuplicateError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

function handleDatabaseError(error: unknown): never {
  if (isDuplicateError(error)) {
    throw new AppError(409, 'A resource with the same name, type, and environment already exists.');
  }

  throw error;
}

export async function createResource(input: CreateResourceInput): Promise<ResourceRecord> {
  try {
    const resource = await ResourceModel.create(input);
    return toResourceRecord(resource);
  } catch (error: unknown) {
    return handleDatabaseError(error);
  }
}

/**
 * Builds the Mongo filter from the known, already-validated fields only. Spreading the caller's
 * object into `find()` means any extra key (an operator like `$where`, a field we never meant to
 * expose) would reach the database the moment a query-parser setting changed.
 */
export function buildResourceQuery(filters: ResourceFilters): Record<string, unknown> {
  const query: Record<string, unknown> = {
    // Soft-deleted resources are hidden from the inventory listing by default (they still exist so
    // anything referencing them by ID can resolve their name/history -- see getResourceById below).
    // See review 2.4/3.9.
    deletedAt: null
  };

  if (filters.type !== undefined) query.type = filters.type;
  if (filters.status !== undefined) query.status = filters.status;
  if (filters.environment !== undefined) query.environment = filters.environment;
  if (filters.enabled !== undefined) query.enabled = filters.enabled;

  return query;
}

export async function getResources(
  filters: ResourceFilters,
  page: number,
  limit: number
): Promise<PaginatedResult<ResourceRecord>> {
  const query = buildResourceQuery(filters);

  const [resources, total] = await Promise.all([
    // _id as a tiebreaker: createdAt alone is not unique (bulk imports), and an unstable order lets
    // a record appear on two pages or none.
    ResourceModel.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    ResourceModel.countDocuments(query)
  ]);

  return {
    data: resources.map((resource) => toResourceRecord(resource)),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  };
}

export async function getResourceById(id: string): Promise<ResourceRecord> {
  assertResourceId(id);

  // Deliberately NOT filtered by deletedAt: a Change, Remediation, or
  // SecurityFinding created before a resource was deleted still references it by
  // this ID, and should still be able to show its name in history views.
  const resource = await ResourceModel.findById(id);

  if (!resource) {
    throw new AppError(404, 'Resource not found.');
  }

  return toResourceRecord(resource);
}

export async function updateResource(id: string, input: UpdateResourceInput): Promise<ResourceRecord> {
  assertResourceId(id);

  try {
    const resource = await ResourceModel.findOneAndUpdate({ _id: id, deletedAt: null }, input, {
      new: true,
      runValidators: true
    });

    if (!resource) {
      throw new AppError(404, 'Resource not found.');
    }

    return toResourceRecord(resource);
  } catch (error: unknown) {
    return handleDatabaseError(error);
  }
}

// Was a hard `findByIdAndDelete`, which orphaned every document elsewhere in the
// system that referenced this resource by ObjectId (Changes, Evidence,
// Dependencies, SecurityFindings, Remediations, PredictionSnapshots). Soft delete
// keeps the resource resolvable for history/audit purposes while hiding it from
// the active inventory. See review 2.4/3.9.
export async function deleteResource(id: string): Promise<void> {
  assertResourceId(id);

  const result = await ResourceModel.findOneAndUpdate(
    { _id: id, deletedAt: null },
    { deletedAt: new Date(), enabled: false }
  );

  if (!result) {
    throw new AppError(404, 'Resource not found.');
  }
}
