import type { RequestHandler } from 'express';
import { createDependency, deleteDependency, getDependencies, getDependencyById, getDependencyGraph, getResourceDependencies, getResourceDependents, updateDependency } from '../services/dependencyService.js';
import { dependencyOrigins, relationshipTypes, type CreateDependencyInput, type DependencyFilters, type UpdateDependencyInput } from '../types/dependency.js';
import { AppError } from '../utils/app-error.js';
import { parseObject, parsePagination, parseQueryString, pathString, requiredString } from '../utils/request-validation.js';

const createFields = ['sourceResourceId', 'targetResourceId', 'relationshipType', 'origin', 'confidence', 'evidenceIds', 'metadata'];
const updateFields = ['relationshipType', 'origin', 'confidence', 'evidenceIds', 'metadata'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function enumValue<T extends string>(value: unknown, field: string, values: readonly T[]): T {
  const result = requiredString(value, field, 40);
  if (!values.includes(result as T)) throw new AppError(400, `${field} must be one of: ${values.join(', ')}.`);
  return result as T;
}

function confidence(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) throw new AppError(400, 'confidence must be between 0 and 1.');
  return value;
}

function evidenceIds(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) throw new AppError(400, 'evidenceIds must be an array of MongoDB ObjectId strings.');
  return [...new Set(value.map((item) => item.trim()))];
}

function parseInput(body: unknown, partial: boolean): CreateDependencyInput | UpdateDependencyInput {
  if (!isRecord(body)) throw new AppError(400, 'Request body must be a JSON object.');
  const fields = partial ? updateFields : createFields;
  const unsupported = Object.keys(body).find((key) => !fields.includes(key));
  if (unsupported) throw new AppError(400, `Unsupported dependency field: ${unsupported}.`);
  if (partial) {
    const update: UpdateDependencyInput = {};
    if (body.relationshipType !== undefined) update.relationshipType = enumValue(body.relationshipType, 'relationshipType', relationshipTypes);
    if (body.origin !== undefined) update.origin = enumValue(body.origin, 'origin', dependencyOrigins);
    if (body.confidence !== undefined) update.confidence = confidence(body.confidence);
    if (body.evidenceIds !== undefined) update.evidenceIds = evidenceIds(body.evidenceIds);
    if (body.metadata !== undefined) update.metadata = parseObject(body.metadata, 'metadata', true);
    if (Object.keys(update).length === 0) throw new AppError(400, 'At least one supported field is required.');
    return update;
  }
  const input: CreateDependencyInput = {
    sourceResourceId: requiredString(body.sourceResourceId, 'sourceResourceId', 24),
    targetResourceId: requiredString(body.targetResourceId, 'targetResourceId', 24),
    relationshipType: enumValue(body.relationshipType, 'relationshipType', relationshipTypes),
    origin: enumValue(body.origin ?? 'manual', 'origin', dependencyOrigins),
    ...(confidence(body.confidence) !== undefined ? { confidence: confidence(body.confidence) } : {}),
    ...(evidenceIds(body.evidenceIds) ? { evidenceIds: evidenceIds(body.evidenceIds) } : {}),
    ...(body.metadata !== undefined ? { metadata: parseObject(body.metadata, 'metadata', true) } : {})
  };
  return input;
}

function parseDepth(value: unknown): number {
  if (value === undefined) return 1;
  if (Array.isArray(value) || typeof value !== 'string' || !/^\d+$/.test(value)) throw new AppError(400, 'depth must be a positive integer.');
  const depth = Number(value);
  if (!Number.isSafeInteger(depth) || depth < 1 || depth > 10) throw new AppError(400, 'depth must be between 1 and 10.');
  return depth;
}

function parseFilters(query: Record<string, unknown>): DependencyFilters {
  return {
    sourceResourceId: parseQueryString(query.sourceResourceId, 'sourceResourceId'),
    targetResourceId: parseQueryString(query.targetResourceId, 'targetResourceId'),
    relationshipType: query.relationshipType === undefined ? undefined : enumValue(parseQueryString(query.relationshipType, 'relationshipType'), 'relationshipType', relationshipTypes),
    origin: query.origin === undefined ? undefined : enumValue(parseQueryString(query.origin, 'origin'), 'origin', dependencyOrigins)
  };
}

export const postDependency: RequestHandler = async (request, response) => {
  const data = await createDependency(parseInput(request.body, false) as CreateDependencyInput);
  response.status(201).json({ success: true, data });
};

export const listDependencies: RequestHandler = async (request, response) => {
  const { page, limit } = parsePagination(request.query as Record<string, unknown>);
  const result = await getDependencies(parseFilters(request.query as Record<string, unknown>), page, limit);
  response.status(200).json({ success: true, data: result.data, pagination: result.pagination });
};

export const getDependency: RequestHandler = async (request, response) => {
  const data = await getDependencyById(pathString(request.params.id, 'id'));
  response.status(200).json({ success: true, data });
};

export const patchDependency: RequestHandler = async (request, response) => {
  const data = await updateDependency(pathString(request.params.id, 'id'), parseInput(request.body, true) as UpdateDependencyInput);
  response.status(200).json({ success: true, data });
};

export const removeDependency: RequestHandler = async (request, response) => {
  await deleteDependency(pathString(request.params.id, 'id'));
  response.status(200).json({ success: true, data: null });
};

export const listResourceDependencies: RequestHandler = async (request, response) => {
  const data = await getResourceDependencies(pathString(request.params.resourceId, 'resourceId'), parseDepth(request.query.depth));
  response.status(200).json({ success: true, data });
};

export const listResourceDependents: RequestHandler = async (request, response) => {
  const data = await getResourceDependents(pathString(request.params.resourceId, 'resourceId'), parseDepth(request.query.depth));
  response.status(200).json({ success: true, data });
};

export const getResourceGraph: RequestHandler = async (request, response) => {
  const direction = request.query.direction === 'dependents' ? 'dependents' : 'dependencies';
  if (request.query.direction !== undefined && request.query.direction !== 'dependencies' && request.query.direction !== 'dependents') throw new AppError(400, 'direction must be dependencies or dependents.');
  const data = await getDependencyGraph(pathString(request.params.resourceId, 'resourceId'), parseDepth(request.query.depth), direction);
  response.status(200).json({ success: true, data });
};