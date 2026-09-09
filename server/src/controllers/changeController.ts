import type { RequestHandler } from 'express';
import { createChange, getChangeById, getChanges, getChangesForResource, updateChangeStatus } from '../services/changeService.js';
import { changeStatuses, changeTypes, type ChangeFilters, type CreateChangeInput } from '../types/change.js';
import { AppError } from '../utils/app-error.js';
import { parseDate, parseObject, parsePagination, parseQueryString, pathString, requiredString, optionalString } from '../utils/request-validation.js';

const allowedFields = ['resourceId', 'changeId', 'source', 'author', 'timestamp', 'summary', 'changeType', 'before', 'after', 'evidenceIds', 'deploymentId', 'status', 'metadata'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseStructured(value: unknown, field: string): unknown {
  if (value === undefined || value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value) || isRecord(value)) return value;
  throw new AppError(400, `${field} must be JSON data.`);
}

function enumValue<T extends string>(value: unknown, field: string, values: readonly T[]): T {
  const result = requiredString(value, field, 40);
  if (!values.includes(result as T)) throw new AppError(400, `${field} must be one of: ${values.join(', ')}.`);
  return result as T;
}

function parseInput(body: unknown): CreateChangeInput {
  if (!isRecord(body)) throw new AppError(400, 'Request body must be a JSON object.');
  const unsupported = Object.keys(body).find((key) => !allowedFields.includes(key));
  if (unsupported) throw new AppError(400, `Unsupported change field: ${unsupported}.`);
  const before = parseStructured(body.before, 'before');
  const after = parseStructured(body.after, 'after');
  const metadata = parseObject(body.metadata, 'metadata');
  const timestamp = parseDate(body.timestamp, 'timestamp', true);
  let evidenceIds: string[] | undefined;
  if (body.evidenceIds !== undefined) {
    if (!Array.isArray(body.evidenceIds) || body.evidenceIds.some((id) => typeof id !== 'string')) throw new AppError(400, 'evidenceIds must be an array of MongoDB ObjectId strings.');
    evidenceIds = body.evidenceIds.map((id) => id.trim());
  }
  return {
    resourceId: requiredString(body.resourceId, 'resourceId', 24),
    changeId: requiredString(body.changeId, 'changeId', 160),
    source: requiredString(body.source, 'source', 80),
    ...(body.author !== undefined ? { author: optionalString(body.author, 'author', 160) } : {}),
    timestamp: timestamp!.toISOString(),
    summary: requiredString(body.summary, 'summary', 500),
    changeType: enumValue(body.changeType, 'changeType', changeTypes),
    ...(before ? { before } : {}),
    ...(after ? { after } : {}),
    ...(evidenceIds ? { evidenceIds } : {}),
    ...(body.deploymentId !== undefined ? { deploymentId: optionalString(body.deploymentId, 'deploymentId', 160) } : {}),
    ...(body.status !== undefined ? { status: enumValue(body.status, 'status', changeStatuses) } : {}),
    ...(metadata ? { metadata } : {})
  };
}

function parseFilters(query: Record<string, unknown>): ChangeFilters {
  const startTime = parseDate(parseQueryString(query.startTime, 'startTime'), 'startTime');
  const endTime = parseDate(parseQueryString(query.endTime, 'endTime'), 'endTime');
  if (startTime && endTime && startTime > endTime) throw new AppError(400, 'startTime must be before endTime.');
  return {
    resourceId: parseQueryString(query.resourceId, 'resourceId'),
    source: parseQueryString(query.source, 'source'),
    changeType: query.changeType === undefined ? undefined : enumValue(parseQueryString(query.changeType, 'changeType'), 'changeType', changeTypes),
    status: query.status === undefined ? undefined : enumValue(parseQueryString(query.status, 'status'), 'status', changeStatuses),
    author: parseQueryString(query.author, 'author'),
    startTime,
    endTime
  };
}

export const postChange: RequestHandler = async (request, response) => {
  const data = await createChange(parseInput(request.body));
  response.status(201).json({ success: true, data });
};

export const listChanges: RequestHandler = async (request, response) => {
  const { page, limit } = parsePagination(request.query as Record<string, unknown>);
  const result = await getChanges(parseFilters(request.query as Record<string, unknown>), page, limit);
  response.status(200).json({ success: true, data: result.data, pagination: result.pagination });
};

export const getChange: RequestHandler = async (request, response) => {
  const data = await getChangeById(pathString(request.params.id, 'id'));
  response.status(200).json({ success: true, data });
};

export const listResourceChanges: RequestHandler = async (request, response) => {
  const { page, limit } = parsePagination(request.query as Record<string, unknown>);
  const result = await getChangesForResource(pathString(request.params.resourceId, 'resourceId'), page, limit);
  response.status(200).json({ success: true, data: result.data, pagination: result.pagination });
};

export const patchChangeStatus: RequestHandler = async (request, response) => {
  if (!isRecord(request.body) || Object.keys(request.body).some((key) => key !== 'status')) throw new AppError(400, 'Only status may be updated.');
  const status = enumValue(request.body.status, 'status', changeStatuses);
  const data = await updateChangeStatus(pathString(request.params.id, 'id'), status);
  response.status(200).json({ success: true, data });
};