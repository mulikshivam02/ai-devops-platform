import crypto from 'node:crypto';
import mongoose, { Types } from 'mongoose';
import { EvidenceModel } from '../../models/Evidence.js';
import { ResourceModel } from '../../models/Resource.js';
import { createEvidence } from '../../services/evidenceService.js';
import { AppError } from '../../utils/app-error.js';
import { redactSecrets } from '../../utils/sensitive-data.js';
import { getLokiBuildInfo, isLokiConfigured, queryLoki } from './loki.client.js';
import type { LokiHealth, LokiImportResult, LokiLogObservation, LokiQueryData, LokiQueryRange } from './loki.types.js';

const MAX_QUERY_LENGTH = 1000;
const MAX_LOGS = 50;
const MAX_LABELS = 20;
const MAX_TEXT_LENGTH = 1000;
// Matches the Prediction-vs-Reality observation window (MAX_WINDOW_MS in predictionRealityService).
// The cap used to be one hour, so filling a 7-day window by hand meant 168 separate calls.
export const MAX_LOKI_RANGE_MS = 7 * 24 * 60 * 60 * 1000;
// One upstream request covers at most this much time; longer ranges are walked newest-first.
const CHUNK_MS = 24 * 60 * 60 * 1000;
const MAX_PLAUSIBLE_MS = BigInt(Date.UTC(2100, 0, 1));
const SENSITIVE_LABEL = /(authorization|api.?key|password|secret|token|credential|cookie|private.?key|certificate)/i;

export function validateLokiQuery(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new AppError(400, 'query is required.');
  const query = value.trim();
  if (query.length > MAX_QUERY_LENGTH) throw new AppError(400, `query must be at most ${MAX_QUERY_LENGTH} characters.`);
  if (/\0/.test(query)) throw new AppError(400, 'query contains unsupported characters.');
  return query;
}

export function validateLokiLimit(value: unknown): number {
  if (value === undefined) return MAX_LOGS;
  if (typeof value !== 'string' && typeof value !== 'number')
    throw new AppError(400, 'limit must be a positive integer.');
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LOGS)
    throw new AppError(400, `limit must be between 1 and ${MAX_LOGS}.`);
  return limit;
}

// Only strings and numbers can be dates; anything else (an object, an array) is invalid input, not "[object Object]".
function parseDateInput(value: unknown): Date {
  return typeof value === 'string' || typeof value === 'number' ? new Date(value) : new Date(Number.NaN);
}

export function validateLokiRange(startValue?: unknown, endValue?: unknown): LokiQueryRange {
  const end = endValue === undefined ? new Date() : parseDateInput(endValue);
  const start = startValue === undefined ? new Date(end.getTime() - 15 * 60 * 1000) : parseDateInput(startValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()))
    throw new AppError(400, 'start and end must be valid dates.');
  if (end <= start) throw new AppError(400, 'end must be after start.');
  if (end.getTime() - start.getTime() > MAX_LOKI_RANGE_MS)
    throw new AppError(400, 'The Loki time range must not exceed 7 days.');
  if (end.getTime() > Date.now() + 60_000) throw new AppError(400, 'end must not be in the future.');
  return { start, end };
}

function ensureResourceId(resourceId: string): Types.ObjectId {
  if (!mongoose.isValidObjectId(resourceId)) throw new AppError(400, 'resourceId must be a valid MongoDB ObjectId.');
  return new Types.ObjectId(resourceId);
}

async function assertResourceExists(resourceId: string): Promise<void> {
  const objectId = ensureResourceId(resourceId);
  if (!(await ResourceModel.exists({ _id: objectId }))) throw new AppError(404, 'Resource not found.');
}

function redact(value: string, maxLength = MAX_TEXT_LENGTH): string {
  return redactSecrets(value, maxLength);
}

function boundedLabels(labels: Record<string, string> | undefined): Record<string, string> {
  if (!labels) return {};
  return Object.fromEntries(
    Object.entries(labels)
      .filter(([key]) => !SENSITIVE_LABEL.test(key))
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(0, MAX_LABELS)
      .map(([key, value]) => [key.slice(0, 80), redact(String(value), 240)])
  );
}

/**
 * Loki timestamps are nanoseconds since the epoch as a decimal string (~1.7e18), which is
 * past Number.MAX_SAFE_INTEGER (~9e15). Parsing with Number() rounds to the nearest ~256ns,
 * so the division is done in BigInt. The unit is inferred from digit count so a seconds,
 * milliseconds or microseconds value (e.g. from a proxy) is not misread as nanoseconds.
 */
export function timestampFromLoki(value: string): string | undefined {
  if (!/^\d{1,20}$/.test(value)) return undefined;
  const raw = BigInt(value);
  const divisor = value.length >= 19 ? 1_000_000n : value.length >= 16 ? 1_000n : value.length >= 13 ? 1n : undefined;
  const milliseconds = divisor === undefined ? raw * 1000n : raw / divisor;
  // Beyond year 2100 is a corrupt value, not a log line; letting it through would plant a timestamp
  // that no observation window can ever reach.
  if (milliseconds > MAX_PLAUSIBLE_MS) return undefined;
  const date = new Date(Number(milliseconds));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function normalizeResults(query: string, data: LokiQueryData, limit = MAX_LOGS): LokiLogObservation[] {
  const observedAt = new Date().toISOString();
  const observations: LokiLogObservation[] = [];
  for (const stream of data.result ?? []) {
    const labels = boundedLabels(stream.stream);
    for (const value of stream.values ?? []) {
      if (observations.length >= limit) return observations;
      const timestamp = timestampFromLoki(value[0]);
      if (!timestamp || typeof value[1] !== 'string') continue;
      observations.push({
        provider: 'loki',
        query: redact(query, MAX_QUERY_LENGTH),
        timestamp,
        timestampNs: value[0],
        labels,
        message: redact(value[1], MAX_TEXT_LENGTH),
        observedAt
      });
    }
  }
  return observations;
}

export async function getLokiHealth(): Promise<LokiHealth> {
  if (!isLokiConfigured())
    return { configured: false, reachable: false, message: 'Loki integration is not configured.' };
  try {
    const info = await getLokiBuildInfo();
    return {
      configured: true,
      reachable: true,
      ...(info.version ? { version: info.version.slice(0, 120) } : {}),
      message: 'Loki API is reachable.'
    };
  } catch {
    return { configured: true, reachable: false, message: 'Loki API is not reachable.' };
  }
}

/**
 * Queries [start, end] newest-first in CHUNK_MS windows until `limit` lines are collected.
 * A 7-day range therefore costs one request when the newest day already has enough lines,
 * and never more than ceil(7d / 1d) = 7.
 */
async function queryLokiChunked(query: string, range: LokiQueryRange, limit: number): Promise<LokiLogObservation[]> {
  const collected: LokiLogObservation[] = [];
  const seen = new Set<string>();
  let chunkEnd = range.end.getTime();
  const rangeStart = range.start.getTime();
  while (chunkEnd > rangeStart && collected.length < limit) {
    const chunkStart = Math.max(rangeStart, chunkEnd - CHUNK_MS);
    const remaining = limit - collected.length;
    const data = await queryLoki(query, { start: new Date(chunkStart), end: new Date(chunkEnd) }, remaining);
    // Not capped here: Loki is asked for `remaining` lines, but whether it obeys is its business. Capping
    // in stream order would keep an arbitrary stream's lines; sorting first keeps the NEWEST.
    for (const observation of normalizeResults(query, data, Number.POSITIVE_INFINITY)) {
      // A line sitting exactly on a chunk boundary can be returned by both neighbouring windows
      // (Loki's end bound has varied between inclusive and exclusive across versions).
      const identity = `${observation.timestampNs}|${JSON.stringify(observation.labels)}|${observation.message}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      collected.push(observation);
    }
    collected.sort((left, right) => right.timestamp.localeCompare(left.timestamp));
    collected.length = Math.min(collected.length, limit);
    chunkEnd = chunkStart;
  }
  return collected.sort((left, right) => right.timestamp.localeCompare(left.timestamp)).slice(0, limit);
}

export async function queryLokiLogs(
  query: unknown,
  start?: unknown,
  end?: unknown,
  limit?: unknown
): Promise<LokiLogObservation[]> {
  const normalizedQuery = validateLokiQuery(query);
  return queryLokiChunked(normalizedQuery, validateLokiRange(start, end), validateLokiLimit(limit));
}

function observationId(resourceId: string, observation: LokiLogObservation): string {
  return crypto
    .createHash('sha256')
    .update(
      [
        resourceId,
        observation.query,
        observation.timestampNs,
        JSON.stringify(observation.labels),
        observation.message
      ].join('|')
    )
    .digest('hex');
}

export async function importLokiLogs(
  resourceId: string,
  query: unknown,
  start?: unknown,
  end?: unknown,
  limit?: unknown
): Promise<LokiImportResult> {
  await assertResourceExists(resourceId);
  const requested = validateLokiLimit(limit);
  const observations = await queryLokiLogs(query, start, end, requested);
  const result: LokiImportResult = {
    requested,
    observed: observations.length,
    imported: 0,
    alreadyPresent: 0,
    evidenceIds: []
  };
  for (const observation of observations) {
    const correlationId = `loki:${observationId(resourceId, observation)}`;
    const existing = await EvidenceModel.findOne({
      resourceId,
      source: 'loki',
      evidenceType: 'log',
      correlationId
    }).lean();
    if (existing) {
      result.alreadyPresent += 1;
      result.evidenceIds.push(String(existing._id));
      continue;
    }
    const evidence = await createEvidence({
      resourceId,
      evidenceType: 'log',
      source: 'loki',
      timestamp: observation.timestamp,
      payload: observation as unknown as Record<string, unknown>,
      metadata: { provider: 'loki', query: observation.query, labels: observation.labels },
      correlationId
    });
    result.imported += 1;
    result.evidenceIds.push(evidence.id);
  }
  return result;
}
