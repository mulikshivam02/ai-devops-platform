import type { RequestHandler } from 'express';
import { createEvidence, deleteEvidence, getEvidence, getEvidenceById, getEvidenceForResource } from '../services/evidenceService.js';
import { evidenceSources, evidenceTypes, type CreateEvidenceInput, type EvidenceFilters } from '../types/evidence.js';
import { AppError } from '../utils/app-error.js';
import { parseDate, parseObject, parsePagination, parseQueryString, pathString, requiredString } from '../utils/request-validation.js';

const allowedFields = ['resourceId', 'evidenceType', 'source', 'timestamp', 'payload', 'metadata', 'correlationId'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function enumValue<T extends string>(value: unknown, field: string, values: readonly T[]): T {
  const result = requiredString(value, field, 40);
  if (!values.includes(result as T)) throw new AppError(400, `${field} must be one of: ${values.join(', ')}.`);
  return result as T;
}

function parseInput(body: unknown): CreateEvidenceInput {
  if (!isRecord(body)) throw new AppError(400, 'Request body must be a JSON object.');
  const unsupported = Object.keys(body).find((key) => !allowedFields.includes(key));
  if (unsupported) throw new AppError(400, `Unsupported evidence field: ${unsupported}.`);
  const timestamp = parseDate(body.timestamp, 'timestamp', true);
  const payload = parseObject(body.payload, 'payload', true);
  return {
    ...(body.resourceId !== undefined ? { resourceId: requiredString(body.resourceId, 'resourceId', 24) } : {}),
    evidenceType: enumValue(body.evidenceType, 'evidenceType', evidenceTypes),
    source: enumValue(body.source, 'source', evidenceSources),
    timestamp: timestamp!.toISOString(),
    payload: payload!,
    ...(body.metadata !== undefined ? { metadata: parseObject(body.metadata, 'metadata', true) } : {}),
    ...(body.correlationId !== undefined ? { correlationId: requiredString(body.correlationId, 'correlationId', 160) } : {})
  };
}

function parseFilters(query: Record<string, unknown>): EvidenceFilters {
  const startTime = parseDate(parseQueryString(query.startTime, 'startTime'), 'startTime');
  const endTime = parseDate(parseQueryString(query.endTime, 'endTime'), 'endTime');
  if (startTime && endTime && startTime > endTime) throw new AppError(400, 'startTime must be before endTime.');
  return {
    resourceId: parseQueryString(query.resourceId, 'resourceId'),
    evidenceType: query.evidenceType === undefined ? undefined : enumValue(parseQueryString(query.evidenceType, 'evidenceType'), 'evidenceType', evidenceTypes),
    source: query.source === undefined ? undefined : enumValue(parseQueryString(query.source, 'source'), 'source', evidenceSources),
    correlationId: parseQueryString(query.correlationId, 'correlationId'),
    startTime,
    endTime
  };
}

export const postEvidence: RequestHandler = async (request, response) => {
  const data = await createEvidence(parseInput(request.body));
  response.status(201).json({ success: true, data });
};

export const listEvidence: RequestHandler = async (request, response) => {
  const { page, limit } = parsePagination(request.query as Record<string, unknown>);
  const result = await getEvidence(parseFilters(request.query as Record<string, unknown>), page, limit);
  response.status(200).json({ success: true, data: result.data, pagination: result.pagination });
};

export const getEvidenceItem: RequestHandler = async (request, response) => {
  const data = await getEvidenceById(pathString(request.params.id, 'id'));
  response.status(200).json({ success: true, data });
};

export const listResourceEvidence: RequestHandler = async (request, response) => {
  const { page, limit } = parsePagination(request.query as Record<string, unknown>);
  const result = await getEvidenceForResource(pathString(request.params.resourceId, 'resourceId'), page, limit);
  response.status(200).json({ success: true, data: result.data, pagination: result.pagination });
};

export const removeEvidence: RequestHandler = async (request, response) => {
  await deleteEvidence(pathString(request.params.id, 'id'));
  response.status(200).json({ success: true, data: null });
};