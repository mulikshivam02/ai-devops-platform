import crypto from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import mongoose, { Types } from 'mongoose';
import { EvidenceModel } from '../../models/Evidence.js';
import { ResourceModel } from '../../models/Resource.js';
import { createChange } from '../../services/changeService.js';
import { createEvidence } from '../../services/evidenceService.js';
import { AppError } from '../../utils/app-error.js';
import { env } from '../../config/env.js';
import {
  getKubernetesNamespaces,
  getKubernetesVersion,
  getKubernetesWorkloads,
  isKubernetesConfigured
} from './kubernetes.client.js';
import {
  kubernetesWorkloadKinds,
  type KubernetesImportResult,
  type KubernetesNamespaceSummary,
  type KubernetesWorkloadKind,
  type KubernetesWorkloadItem,
  type KubernetesWorkloadSummary
} from './kubernetes.types.js';

const MAX_NAMESPACES = 100;
const MAX_WORKLOADS = 50;
const MAX_LABELS = 20;
const MAX_IMAGES = 20;
const SENSITIVE_KEY = /(token|secret|password|credential|authorization|cookie|private.?key|certificate)/i;

export function validateKubernetesNamespace(value: unknown): string | undefined {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string') throw new AppError(400, 'namespace must be a string.');
  const namespace = value.trim();
  if (!namespace || namespace.length > 63 || !/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(namespace))
    throw new AppError(400, 'namespace must be a valid Kubernetes namespace.');
  return namespace;
}

export function validateKubernetesKind(value: unknown): KubernetesWorkloadKind | undefined {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || !kubernetesWorkloadKinds.includes(value as KubernetesWorkloadKind))
    throw new AppError(400, 'kind must be Deployment, StatefulSet, or DaemonSet.');
  return value as KubernetesWorkloadKind;
}

export function validateKubernetesLimit(value: unknown, defaultValue = MAX_WORKLOADS): number {
  if (value === undefined) return defaultValue;
  if (typeof value !== 'string' && typeof value !== 'number')
    throw new AppError(400, 'limit must be a positive integer.');
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_WORKLOADS)
    throw new AppError(400, `limit must be between 1 and ${MAX_WORKLOADS}.`);
  return limit;
}

function ensureResourceExists(resourceId: string): Types.ObjectId {
  if (!mongoose.isValidObjectId(resourceId)) throw new AppError(400, 'resourceId must be a valid MongoDB ObjectId.');
  return new Types.ObjectId(resourceId);
}

async function assertResourceExists(resourceId: string): Promise<void> {
  const objectId = ensureResourceExists(resourceId);
  if (!(await ResourceModel.exists({ _id: objectId }))) throw new AppError(404, 'Resource not found.');
}

function boundedMap(values: Record<string, string> | undefined): Record<string, string> {
  if (!values) return {};
  return Object.fromEntries(
    Object.entries(values)
      .filter(([key, value]) => !SENSITIVE_KEY.test(key) && typeof value === 'string')
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(0, MAX_LABELS)
      .map(([key, value]) => [key.slice(0, 80), value.slice(0, 200)])
  );
}

function boundedImages(item: KubernetesWorkloadItem): string[] {
  return Array.from(
    new Set(
      (item.spec?.template?.spec?.containers ?? [])
        .map((container) => container.image)
        .filter((image): image is string => typeof image === 'string' && image.trim().length > 0)
        .map((image) => image.trim().slice(0, 240))
    )
  ).slice(0, MAX_IMAGES);
}

function apiIdentity(): string {
  return env.kubernetesApiUrl ?? 'unconfigured';
}

function normalizeWorkload(
  kind: KubernetesWorkloadKind,
  item: KubernetesWorkloadItem,
  observedAt: string
): KubernetesWorkloadSummary | undefined {
  const name = item.metadata?.name?.trim();
  const namespace = item.metadata?.namespace?.trim();
  if (!name || !namespace) return undefined;
  const status = item.status ?? {};
  const replicas =
    kind === 'DaemonSet'
      ? {
          desired: status.desiredNumberScheduled,
          current: status.currentNumberScheduled,
          ready: status.numberReady,
          available: status.numberAvailable,
          updated: status.updatedNumberScheduled
        }
      : {
          desired: item.spec?.replicas,
          current: status.replicas,
          ready: status.readyReplicas,
          available: status.availableReplicas,
          updated: status.updatedReplicas
        };
  return {
    provider: 'kubernetes',
    apiIdentity: apiIdentity(),
    kind,
    namespace,
    name,
    replicas,
    images: boundedImages(item),
    labels: boundedMap(item.metadata?.labels),
    annotations: boundedMap(item.metadata?.annotations),
    ...(typeof item.metadata?.generation === 'number' ? { generation: item.metadata.generation } : {}),
    ...(item.metadata?.resourceVersion ? { resourceVersion: item.metadata.resourceVersion.slice(0, 120) } : {}),
    ...(item.metadata?.creationTimestamp ? { createdAt: item.metadata.creationTimestamp } : {}),
    status: {
      conditions: (status.conditions ?? []).slice(0, 10).flatMap((condition) => {
        if (!condition.type || !condition.status) return [];
        return [
          {
            type: condition.type.slice(0, 80),
            status: condition.status.slice(0, 40),
            ...(condition.reason ? { reason: condition.reason.slice(0, 120) } : {}),
            ...(condition.message ? { message: condition.message.slice(0, 300) } : {})
          }
        ];
      })
    },
    observedAt
  };
}

/**
 * The slice of a workload that counts as "state" for change detection.
 *
 * Deliberately NOT included: status.conditions (their reason/message/heartbeat fields change every
 * few seconds, which manufactured a "change" on nearly every poll), resourceVersion (bumps on any
 * write), and current/available/updated replica counts (they ripple through every pod during a
 * single rollout, turning one deploy into a dozen "changes"). What remains is what an operator
 * would call a change: the images, the desired and ready replica counts, the rollout generation,
 * and labels/annotations. The full status is still kept in the Evidence payload. See review 4.5.
 */
interface ComparableState {
  kind: KubernetesWorkloadKind;
  namespace: string;
  name: string;
  images: string[];
  generation?: number;
  replicas: { desired?: number; ready?: number };
  labels: Record<string, string>;
  annotations: Record<string, string>;
}

function comparableState(workload: KubernetesWorkloadSummary): ComparableState {
  // Payloads read back from Mongo can pre-date a field, so don't trust the static type here.
  const replicas = workload.replicas as KubernetesWorkloadSummary['replicas'] | undefined;
  return {
    kind: workload.kind,
    namespace: workload.namespace,
    name: workload.name,
    images: workload.images,
    ...(workload.generation !== undefined ? { generation: workload.generation } : {}),
    replicas: { desired: replicas?.desired, ready: replicas?.ready },
    labels: workload.labels,
    annotations: workload.annotations
  };
}

// JSON with object keys sorted at every level, so the hash depends on content and not on the order
// keys happened to be inserted (Mongo round-trips and spread operators both reorder them).
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${(value as unknown[]).map(canonicalJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
  }
  return value === undefined ? 'null' : JSON.stringify(value);
}

function fingerprint(workload: KubernetesWorkloadSummary): string {
  return crypto
    .createHash('sha256')
    .update(canonicalJson(comparableState(workload)))
    .digest('hex');
}

function observationKey(resourceId: string, workload: KubernetesWorkloadSummary): string {
  return crypto
    .createHash('sha256')
    .update([resourceId, workload.apiIdentity, workload.namespace, workload.kind, workload.name].join('|'))
    .digest('hex');
}

function stateCorrelationId(key: string, stateFingerprint: string): string {
  return `kubernetes:${key}:${stateFingerprint}`;
}

const MAX_PAGES_PER_KIND = 5;
const PAGE_SIZE = 100;
// What a single import will read per kind. Larger than the 50-item cap on the read-only listing,
// because an import that silently covers only the first 17 of 100 Deployments is not an import.
const MAX_IMPORT_PER_KIND = 200;

interface KindListing {
  items: KubernetesWorkloadSummary[];
  /** More workloads of this kind exist than were returned (cap reached, or pagination safety stop). */
  truncated: boolean;
}

async function listByKind(
  namespace: string | undefined,
  kind: KubernetesWorkloadKind,
  limit: number
): Promise<KindListing> {
  const observedAt = new Date().toISOString();
  const items: KubernetesWorkloadSummary[] = [];
  let continueToken: string | undefined;
  let truncated = false;
  // Follows the API's `continue` token across pages (review 4.4), bounded by the caller's limit and
  // by MAX_PAGES_PER_KIND as a safety stop against an API that never stops paginating.
  for (let page = 0; page < MAX_PAGES_PER_KIND; page += 1) {
    const response = await getKubernetesWorkloads(
      namespace,
      kind,
      Math.min(limit - items.length, PAGE_SIZE),
      continueToken
    );
    for (const item of response.items ?? []) {
      if (items.length >= limit) {
        truncated = true;
        break;
      }
      const normalized = normalizeWorkload(kind, item, observedAt);
      if (normalized) items.push(normalized);
    }
    continueToken = response.metadata?.continue || undefined;
    if (truncated || !continueToken) break;
    // A continue token with the cap already reached, or with no pages left to spend, means there is more.
    if (items.length >= limit || page === MAX_PAGES_PER_KIND - 1) {
      truncated = true;
      break;
    }
  }
  return { items, truncated };
}

export async function getKubernetesHealth(): Promise<{
  configured: boolean;
  reachable: boolean;
  version?: string;
  platform?: string;
  message: string;
}> {
  if (!isKubernetesConfigured())
    return { configured: false, reachable: false, message: 'Kubernetes integration is not configured.' };
  try {
    const version = await getKubernetesVersion();
    return {
      configured: true,
      reachable: true,
      ...(version.gitVersion ? { version: version.gitVersion.slice(0, 120) } : {}),
      ...(version.platform ? { platform: version.platform.slice(0, 120) } : {}),
      message: 'Kubernetes API is reachable.'
    };
  } catch {
    return { configured: true, reachable: false, message: 'Kubernetes API is not reachable.' };
  }
}

export async function listKubernetesNamespaces(): Promise<KubernetesNamespaceSummary[]> {
  const response = await getKubernetesNamespaces(MAX_NAMESPACES);
  return (response.items ?? []).slice(0, MAX_NAMESPACES).flatMap((item) => {
    const name = item.metadata?.name?.trim();
    if (!name) return [];
    return [
      {
        name,
        ...(item.status?.phase ? { phase: item.status.phase.slice(0, 40) } : {}),
        ...(item.metadata?.creationTimestamp ? { createdAt: item.metadata.creationTimestamp } : {}),
        ...(item.metadata?.resourceVersion ? { resourceVersion: item.metadata.resourceVersion.slice(0, 120) } : {}),
        labels: boundedMap(item.metadata?.labels)
      }
    ];
  });
}

export async function listKubernetesWorkloads(
  namespace: string | undefined,
  kind: KubernetesWorkloadKind | undefined,
  limit: number
): Promise<KubernetesWorkloadSummary[]> {
  const validNamespace = validateKubernetesNamespace(namespace);
  const validKind = validateKubernetesKind(kind);
  const safeLimit = validateKubernetesLimit(limit);
  const kinds = validKind ? [validKind] : [...kubernetesWorkloadKinds];
  // With no kind given, the limit is split across kinds instead of asking for `safeLimit` of EACH and
  // slicing the combined list to `safeLimit`: that slice kept whichever kind came first (Deployments),
  // so 50+ Deployments made StatefulSets and DaemonSets vanish entirely. See review 4.4.
  const perKindLimit = validKind ? safeLimit : Math.max(1, Math.ceil(safeLimit / kinds.length));
  const results = await Promise.all(
    kinds.map((workloadKind) => listByKind(validNamespace, workloadKind, perKindLimit))
  );
  return results.flatMap((result) => result.items).slice(0, safeLimit);
}

function imagesChanged(previous: ComparableState, current: ComparableState): boolean {
  return !isDeepStrictEqual(previous.images, current.images);
}

function changeTypeFor(
  workload: KubernetesWorkloadSummary,
  previous: KubernetesWorkloadSummary
): 'infrastructure' | 'deployment' | 'configuration' {
  const before = comparableState(previous);
  const after = comparableState(workload);
  if (imagesChanged(before, after)) return 'deployment';
  if (before.replicas.desired !== after.replicas.desired) return 'infrastructure';
  // A generation bump with the same image and replica count is some other spec edit (env, resources, probes).
  if (before.generation !== after.generation) return 'deployment';
  if (!isDeepStrictEqual(before.replicas, after.replicas)) return 'infrastructure';
  return 'configuration';
}

function summaryFor(workload: KubernetesWorkloadSummary, previous: KubernetesWorkloadSummary): string {
  const subject = `${workload.kind} ${workload.namespace}/${workload.name}`;
  const before = comparableState(previous);
  const after = comparableState(workload);
  if (imagesChanged(before, after)) return `${subject} image changed.`;
  if (before.replicas.desired !== after.replicas.desired)
    return `${subject} scaled from ${before.replicas.desired ?? '?'} to ${after.replicas.desired ?? '?'} replicas.`;
  if (before.generation !== after.generation) return `${subject} rollout generation changed.`;
  if (before.replicas.ready !== after.replicas.ready)
    return `${subject} ready replicas changed from ${before.replicas.ready ?? '?'} to ${after.replicas.ready ?? '?'}.`;
  return `${subject} labels or annotations changed.`;
}

interface LatestObservation {
  _id: unknown;
  payload?: KubernetesWorkloadSummary;
}

async function latestObservation(key: string): Promise<LatestObservation | null> {
  // Every workload polled in one pass shares an observation time, and a re-import within the same
  // millisecond ties on `timestamp` too, so the tie-break matters: collectedAt, then _id (which is
  // monotonic within a process). Without it "latest" was whichever document Mongo returned first.
  return EvidenceModel.findOne({ source: 'kubernetes', evidenceType: 'kubernetes', 'metadata.observationKey': key })
    .sort({ timestamp: -1, collectedAt: -1, _id: -1 })
    .lean() as Promise<LatestObservation | null>;
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000;
}

export async function importKubernetesWorkloads(input: {
  resourceId: string;
  namespace?: string;
  kind?: KubernetesWorkloadKind;
}): Promise<KubernetesImportResult> {
  await assertResourceExists(input.resourceId);
  const validNamespace = validateKubernetesNamespace(input.namespace);
  const kinds = input.kind ? [validateKubernetesKind(input.kind)!] : [...kubernetesWorkloadKinds];
  // Per kind, not a shared pool, so a large kind cannot starve the others (review 4.4).
  const listings = await Promise.all(kinds.map((kind) => listByKind(validNamespace, kind, MAX_IMPORT_PER_KIND)));
  const workloads = listings.flatMap((listing) => listing.items);
  const result: KubernetesImportResult = {
    requested: MAX_IMPORT_PER_KIND * kinds.length,
    observed: workloads.length,
    truncatedKinds: kinds.filter((_, index) => listings[index]?.truncated),
    evidenceCreated: 0,
    evidenceAlreadyPresent: 0,
    changesCreated: 0,
    unchanged: 0,
    changes: []
  };

  for (const workload of workloads) {
    const key = observationKey(input.resourceId, workload);
    const stateHash = fingerprint(workload);
    const correlationId = stateCorrelationId(key, stateHash);

    // Fetched BEFORE this poll's evidence is created, so it reflects the state as of the LAST poll.
    const previous = await latestObservation(key);
    const previousWorkload = previous?.payload;
    const previousStateHash = previousWorkload ? fingerprint(previousWorkload) : undefined;

    // Evidence is recorded on every poll: an audit trail of "we checked, here is what we saw",
    // whether or not anything changed. Only the CHANGE record depends on the comparison below.
    const evidence = await createEvidence({
      resourceId: input.resourceId,
      evidenceType: 'kubernetes',
      source: 'kubernetes',
      timestamp: workload.observedAt,
      payload: workload as unknown as Record<string, unknown>,
      metadata: {
        provider: 'kubernetes',
        observationKey: key,
        stateFingerprint: stateHash,
        kind: workload.kind,
        namespace: workload.namespace,
        name: workload.name
      },
      correlationId
    });
    result.evidenceCreated += 1;

    // Compared with the LATEST observation, not "has this exact state ever been seen". Keying on
    // the state hash alone meant A -> B -> A looked "already seen" on the third poll and the revert
    // was never recorded. See review 4.5.
    if (previousStateHash === stateHash) {
      result.unchanged += 1;
      continue;
    }
    if (!previous || !previousWorkload) continue; // first sighting: a baseline, not a change

    try {
      const change = await createChange({
        resourceId: input.resourceId,
        // A change is a TRANSITION, so its identity is (previous observation -> new state). Keying on
        // the new state alone made the second B in A -> B -> A -> B collide with the first B and be
        // dropped. Two concurrent imports read the same previous observation, so they derive the
        // same id and the unique (resourceId, changeId) index rejects the loser.
        changeId: `kubernetes:${key}:${String(previous._id)}:${stateHash}`,
        source: 'kubernetes',
        author: 'kubernetes-api',
        timestamp: workload.observedAt,
        summary: summaryFor(workload, previousWorkload),
        changeType: changeTypeFor(workload, previousWorkload),
        before: comparableState(previousWorkload),
        after: comparableState(workload),
        evidenceIds: [evidence.id],
        status: 'detected',
        metadata: {
          provider: 'kubernetes',
          observationKey: key,
          stateFingerprint: stateHash,
          namespace: workload.namespace,
          name: workload.name,
          kind: workload.kind
        }
      });
      result.changesCreated += 1;
      result.changes.push({
        id: change.id,
        changeId: change.changeId,
        summary: change.summary,
        changeType: change.changeType,
        before: change.before,
        after: change.after
      });
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      result.unchanged += 1; // a concurrent import already recorded this exact transition
    }
  }

  return result;
}
