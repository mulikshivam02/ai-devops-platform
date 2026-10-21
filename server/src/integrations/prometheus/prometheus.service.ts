import crypto from 'node:crypto';
import mongoose, { Types } from 'mongoose';
import { EvidenceModel } from '../../models/Evidence.js';
import { ResourceModel } from '../../models/Resource.js';
import { createEvidence } from '../../services/evidenceService.js';
import { AppError } from '../../utils/app-error.js';
import { redactSecrets } from '../../utils/sensitive-data.js';
import { getPrometheusBuildInfo, isPrometheusConfigured, queryPrometheus } from './prometheus.client.js';
import type {
  PrometheusHealth,
  PrometheusImportResult,
  PrometheusMetricObservation,
  PrometheusQueryData
} from './prometheus.types.js';

const MAX_QUERY_LENGTH = 1000;
const MAX_RESULTS = 50;
const MAX_LABELS = 20;
const MAX_TEXT_LENGTH = 240;
const SENSITIVE_LABEL = /(authorization|api.?key|password|secret|token|credential|cookie|private.?key|certificate)/i;

export function validatePrometheusQuery(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new AppError(400, 'query is required.');
  const query = value.trim();
  if (query.length > MAX_QUERY_LENGTH) throw new AppError(400, `query must be at most ${MAX_QUERY_LENGTH} characters.`);
  if (/\0/.test(query)) throw new AppError(400, 'query contains unsupported characters.');
  return query;
}

function ensureResourceId(resourceId: string): Types.ObjectId {
  if (!mongoose.isValidObjectId(resourceId)) throw new AppError(400, 'resourceId must be a valid MongoDB ObjectId.');
  return new Types.ObjectId(resourceId);
}

async function assertResourceExists(resourceId: string): Promise<void> {
  const objectId = ensureResourceId(resourceId);
  if (!(await ResourceModel.exists({ _id: objectId }))) throw new AppError(404, 'Resource not found.');
}

function boundedLabels(labels: Record<string, string> | undefined): Record<string, string> {
  if (!labels) return {};
  return Object.fromEntries(
    Object.entries(labels)
      .filter(([key]) => !SENSITIVE_LABEL.test(key))
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(0, MAX_LABELS)
      .map(([key, value]) => [key.slice(0, 80), redactSecrets(String(value), MAX_TEXT_LENGTH)])
  );
}

interface NormalizedResults {
  observations: PrometheusMetricObservation[];
  truncated: boolean;
  skipped: number;
}

function normalizeResults(query: string, data: PrometheusQueryData): NormalizedResults {
  const all = data.result ?? [];
  const observedAt = new Date().toISOString();
  const observations: PrometheusMetricObservation[] = [];
  let skipped = 0;
  for (const item of all.slice(0, MAX_RESULTS)) {
    // Only instant vectors are supported: a matrix (range) result carries `values`, not `value`.
    if (!Array.isArray(item.value) || (item.value as unknown[]).length < 2) {
      skipped += 1;
      continue;
    }
    const timestamp = Number(item.value[0]);
    const value = typeof item.value[1] === 'string' ? item.value[1] : String(item.value[1]);
    if (!Number.isFinite(timestamp) || value.length > MAX_TEXT_LENGTH) {
      skipped += 1;
      continue;
    }
    observations.push({
      provider: 'prometheus',
      query: redactSecrets(query, MAX_QUERY_LENGTH),
      metric: boundedLabels(item.metric),
      timestamp,
      value,
      observedAt
    });
  }
  return { observations, truncated: all.length > MAX_RESULTS, skipped };
}

export async function getPrometheusHealth(): Promise<PrometheusHealth> {
  if (!isPrometheusConfigured())
    return { configured: false, reachable: false, message: 'Prometheus integration is not configured.' };
  try {
    const info = await getPrometheusBuildInfo();
    return {
      configured: true,
      reachable: true,
      ...(info.version ? { version: info.version.slice(0, 120) } : {}),
      message: 'Prometheus API is reachable.'
    };
  } catch {
    return { configured: true, reachable: false, message: 'Prometheus API is not reachable.' };
  }
}

async function queryNormalized(query: unknown): Promise<NormalizedResults> {
  const normalizedQuery = validatePrometheusQuery(query);
  return normalizeResults(normalizedQuery, await queryPrometheus(normalizedQuery));
}

export async function queryPrometheusMetrics(query: unknown): Promise<PrometheusMetricObservation[]> {
  return (await queryNormalized(query)).observations;
}

function observationId(resourceId: string, observation: PrometheusMetricObservation): string {
  return crypto
    .createHash('sha256')
    .update(
      [
        resourceId,
        observation.query,
        JSON.stringify(observation.metric),
        observation.timestamp,
        observation.value
      ].join('|')
    )
    .digest('hex');
}

export async function importPrometheusMetrics(resourceId: string, query: unknown): Promise<PrometheusImportResult> {
  await assertResourceExists(resourceId);
  const { observations, truncated, skipped } = await queryNormalized(query);
  const result: PrometheusImportResult = {
    observed: observations.length,
    truncated,
    skipped,
    imported: 0,
    alreadyPresent: 0,
    evidenceIds: []
  };
  for (const observation of observations) {
    const correlationId = `prometheus:${observationId(resourceId, observation)}`;
    const existing = await EvidenceModel.findOne({
      resourceId,
      source: 'prometheus',
      evidenceType: 'metric',
      correlationId
    }).lean();
    if (existing) {
      result.alreadyPresent += 1;
      result.evidenceIds.push(String(existing._id));
      continue;
    }
    const evidence = await createEvidence({
      resourceId,
      evidenceType: 'metric',
      source: 'prometheus',
      timestamp: new Date(observation.timestamp * 1000).toISOString(),
      payload: observation as unknown as Record<string, unknown>,
      metadata: { provider: 'prometheus', query: observation.query, metric: observation.metric },
      correlationId
    });
    result.imported += 1;
    result.evidenceIds.push(evidence.id);
  }
  return result;
}
