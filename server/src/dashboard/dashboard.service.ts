import { ChangeModel, toChangeDTO } from '../models/Change.js';
import { ChangeAnalysisModel } from '../models/ChangeAnalysis.js';
import { PredictionSnapshotModel } from '../models/PredictionSnapshot.js';
import { ObservedImpactModel } from '../models/ObservedImpact.js';
import { PredictionComparisonModel } from '../models/PredictionComparison.js';
import { InvestigationModel } from '../models/Investigation.js';
import { ResourceModel } from '../models/Resource.js';
import { env } from '../config/env.js';
import { getKubernetesHealth } from '../integrations/kubernetes/kubernetes.service.js';
import { getPrometheusHealth } from '../integrations/prometheus/prometheus.service.js';
import { getLokiHealth } from '../integrations/loki/loki.service.js';
import { getAIHealth } from '../services/investigationService.js';
import { TtlCache } from '../utils/ttlCache.js';
import { withTimeout } from '../utils/timeout.js';
import type { DashboardSummary } from './dashboard.types.js';

const MAX_RECENT = 12;
const MAX_RECENT_OUTCOMES = 8;
const AI_HEALTH_TIMEOUT_MS = 2000;

/**
 * Health probes reach live systems. The dashboard is polled, so without a cache the polling rate
 * becomes the probe rate against Kubernetes, Prometheus, Loki and Ollama. 20s sits inside the plan's
 * 15-30s window: fresh enough for an operator, slow enough not to be a load.
 */
export const HEALTH_CACHE_TTL_MS = 20_000;

type IntegrationHealth = DashboardSummary['integrationStatus']['kubernetes'];
type AIStatus = DashboardSummary['aiStatus'];

const integrationHealthCache = new TtlCache<IntegrationHealth>(HEALTH_CACHE_TTL_MS);
const aiHealthCache = new TtlCache<AIStatus>(HEALTH_CACHE_TTL_MS);

export function resetDashboardCachesForTests(): void {
  integrationHealthCache.clear();
  aiHealthCache.clear();
}

function probe(
  name: string,
  configured: boolean,
  label: string,
  run: () => Promise<IntegrationHealth>
): Promise<IntegrationHealth> {
  // The failure is converted to a value INSIDE the loader so it is cached too: a system that is down
  // should not be re-probed on every poll either.
  return integrationHealthCache.get(name, () =>
    run().catch(() => ({ configured, reachable: false, message: `${label} status unavailable.` }))
  );
}

function boundedAIHealth(): Promise<AIStatus> {
  const fallback: AIStatus = {
    available: false,
    provider: 'unknown',
    model: 'unknown',
    message: 'AI status unavailable.'
  };

  return aiHealthCache.get('ai', () =>
    withTimeout(
      getAIHealth().catch(() => fallback),
      AI_HEALTH_TIMEOUT_MS,
      fallback
    )
  );
}

type CountRow = { _id: string | null; count: number };

function countsByKey(rows: CountRow[]): Map<string, number> {
  return new Map(rows.map((row) => [String(row._id), row.count]));
}

/** First (= newest, given the query's sort) row per change. */
function firstPerChange<T extends { changeId: { toString(): string } }>(rows: T[]): Map<string, T> {
  const result = new Map<string, T>();

  for (const row of rows) {
    const key = row.changeId.toString();

    if (!result.has(key)) result.set(key, row);
  }

  return result;
}

const riskLevels = ['low', 'medium', 'high', 'critical'] as const;

export async function getDashboardSummary(): Promise<DashboardSummary> {
  // Start the slow live probes first; they do not depend on any query below and are mostly cache hits.
  const integrationProbes = Promise.all([
    probe('kubernetes', Boolean(env.kubernetesApiUrl), 'Kubernetes', getKubernetesHealth),
    probe('prometheus', Boolean(env.prometheusApiUrl), 'Prometheus', getPrometheusHealth),
    probe('loki', Boolean(env.lokiApiUrl), 'Loki', getLokiHealth)
  ]);
  const aiProbe = boundedAIHealth();

  const [changes, total, riskRows, outcomeRows, investigatedRows, latestComparisons] = await Promise.all([
    ChangeModel.find().sort({ timestamp: -1, _id: -1 }).limit(MAX_RECENT),
    ChangeModel.countDocuments(),
    // Counts come from the database, never from the recent-items windows. Analyses are versioned
    // (several per change), so take each change's newest before counting.
    ChangeAnalysisModel.aggregate<CountRow>([
      { $sort: { changeId: 1, analyzedAt: -1 } },
      { $group: { _id: '$changeId', level: { $first: '$risk.level' } } },
      { $group: { _id: '$level', count: { $sum: 1 } } }
    ]),
    PredictionComparisonModel.aggregate<CountRow>([
      { $sort: { changeId: 1, comparedAt: -1 } },
      { $group: { _id: '$changeId', outcome: { $first: '$outcome' } } },
      { $group: { _id: '$outcome', count: { $sum: 1 } } }
    ]),
    InvestigationModel.aggregate<{ count: number }>([
      { $match: { status: 'completed' } },
      { $group: { _id: '$changeId' } },
      { $count: 'count' }
    ]),
    PredictionComparisonModel.aggregate<{
      changeId: { toString(): string };
      outcome: string;
      comparedAt: Date;
    }>([
      { $sort: { changeId: 1, comparedAt: -1 } },
      { $group: { _id: '$changeId', outcome: { $first: '$outcome' }, comparedAt: { $first: '$comparedAt' } } },
      { $sort: { comparedAt: -1, _id: -1 } },
      { $limit: MAX_RECENT_OUTCOMES },
      { $project: { _id: 0, changeId: '$_id', outcome: 1, comparedAt: 1 } }
    ])
  ]);

  const changeIds = changes.map((change) => change._id);
  const resourceIds = [...new Set(changes.map((change) => change.resourceId.toString()))];

  // Everything below is looked up by the IDs actually on screen. Building these maps from "the 12
  // newest analyses" and then indexing them with "the 12 newest changes" -- two different sets -- is
  // why risk was usually missing.
  const [resources, analyses, predictions, observations, comparisons, outcomeChanges] = await Promise.all([
    ResourceModel.find({ _id: { $in: resourceIds } })
      .select({ name: 1 })
      .lean(),
    ChangeAnalysisModel.find({ changeId: { $in: changeIds } })
      .sort({ analyzedAt: -1 })
      .select({ changeId: 1, risk: 1 })
      .lean(),
    PredictionSnapshotModel.find({ changeId: { $in: changeIds } })
      .select({ changeId: 1 })
      .lean(),
    ObservedImpactModel.find({ changeId: { $in: changeIds } })
      .sort({ createdAt: -1 })
      .select({ changeId: 1, status: 1 })
      .lean(),
    PredictionComparisonModel.find({ changeId: { $in: changeIds } })
      .sort({ comparedAt: -1 })
      .select({ changeId: 1, outcome: 1 })
      .lean(),
    ChangeModel.find({ _id: { $in: latestComparisons.map((item) => item.changeId) } })
      .select({ summary: 1 })
      .lean()
  ]);

  const resourceNames = new Map(resources.map((resource) => [resource._id.toString(), resource.name]));
  // Sorted newest-first, so the FIRST row per change wins. (A Map built straight from the rows lets
  // later entries overwrite earlier ones, which made the OLDEST observation win.)
  const analysisByChange = firstPerChange(analyses);
  const observationByChange = firstPerChange(observations);
  const comparisonByChange = firstPerChange(comparisons);
  const predictionChangeIds = new Set(predictions.map((item) => item.changeId.toString()));
  const summaryByChange = new Map(outcomeChanges.map((change) => [change._id.toString(), change.summary]));

  const riskCounts = countsByKey(riskRows);
  const riskDistribution = Object.fromEntries(
    riskLevels.map((level) => [level, riskCounts.get(level) ?? 0])
  ) as DashboardSummary['riskDistribution'];
  const outcomeCounts = countsByKey(outcomeRows);

  const recentChanges = changes.map((change) => {
    const dto = toChangeDTO(change);
    const analysis = analysisByChange.get(dto.id);
    const comparison = comparisonByChange.get(dto.id);

    return {
      id: dto.id,
      changeId: dto.changeId,
      summary: dto.summary,
      source: dto.source,
      resourceId: dto.resourceId,
      ...(resourceNames.has(dto.resourceId) ? { resourceName: resourceNames.get(dto.resourceId) } : {}),
      changeType: dto.changeType,
      status: dto.status,
      timestamp: dto.timestamp,
      ...(analysis ? { risk: { score: analysis.risk.score, level: analysis.risk.level } } : {}),
      predictionStatus: predictionChangeIds.has(dto.id) ? ('available' as const) : ('unavailable' as const),
      realityStatus: observationByChange.get(dto.id)?.status ?? 'unavailable',
      ...(comparison ? { outcome: comparison.outcome } : {})
    };
  });

  const [integrationStatus, aiStatus] = await Promise.all([integrationProbes, aiProbe]);

  return {
    changeCounts: {
      total,
      analyzed: riskLevels.reduce((sum, level) => sum + riskDistribution[level], 0),
      highCriticalRisk: riskDistribution.high + riskDistribution.critical,
      investigated: investigatedRows[0]?.count ?? 0,
      unexpectedImpact: outcomeCounts.get('unexpected_impact') ?? 0,
      insufficientEvidence: outcomeCounts.get('insufficient_evidence') ?? 0
    },
    riskDistribution,
    recentChanges,
    recentOutcomes: latestComparisons.map((comparison) => ({
      changeId: comparison.changeId.toString(),
      summary: summaryByChange.get(comparison.changeId.toString()) ?? 'Change',
      outcome: comparison.outcome,
      timestamp: comparison.comparedAt.toISOString()
    })),
    integrationStatus: {
      // The base URL has a default, so checking it made GitHub report "configured" unconditionally.
      // Only the token says whether this deployment can actually talk to GitHub.
      github: env.githubToken ? 'configured' : 'not_configured',
      kubernetes: integrationStatus[0],
      prometheus: integrationStatus[1],
      loki: integrationStatus[2]
    },
    aiStatus
  };
}
