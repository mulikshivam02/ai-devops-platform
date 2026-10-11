import { ChangeModel, toChangeDTO } from '../models/Change.js';
import { ChangeAnalysisModel, toChangeAnalysisDTO } from '../models/ChangeAnalysis.js';
import { PredictionSnapshotModel } from '../models/PredictionSnapshot.js';
import { ObservedImpactModel } from '../models/ObservedImpact.js';
import { PredictionComparisonModel, toPredictionComparisonDTO } from '../models/PredictionComparison.js';
import { InvestigationModel } from '../models/Investigation.js';
import { ResourceModel } from '../models/Resource.js';
import { env } from '../config/env.js';
import { getKubernetesHealth } from '../integrations/kubernetes/kubernetes.service.js';
import { getPrometheusHealth } from '../integrations/prometheus/prometheus.service.js';
import { getLokiHealth } from '../integrations/loki/loki.service.js';
import { getAIHealth } from '../services/investigationService.js';
import type { DashboardSummary } from './dashboard.types.js';

const MAX_RECENT = 12;

async function boundedAIHealth(): Promise<DashboardSummary['aiStatus']> {
  const fallback = { available: false, provider: 'unknown', model: 'unknown', message: 'AI status unavailable.' };
  try {
    return await Promise.race([
      getAIHealth(),
      new Promise<DashboardSummary['aiStatus']>((resolve) => setTimeout(() => resolve(fallback), 2000))
    ]);
  } catch {
    return fallback;
  }
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const [changes, total, investigations, analyses, comparisons, resources, integrationStatus, aiStatus] =
    await Promise.all([
      ChangeModel.find().sort({ timestamp: -1 }).limit(MAX_RECENT),
      ChangeModel.countDocuments(),
      InvestigationModel.find({ status: 'completed' }).select({ changeId: 1 }).limit(100),
      ChangeAnalysisModel.find().sort({ analyzedAt: -1 }).limit(MAX_RECENT),
      PredictionComparisonModel.find().sort({ comparedAt: -1 }).limit(MAX_RECENT),
      ResourceModel.find().select({ name: 1 }).limit(500).lean(),
      Promise.all([
        getKubernetesHealth().catch(() => ({
          configured: Boolean(env.kubernetesApiUrl),
          reachable: false,
          message: 'Kubernetes status unavailable.'
        })),
        getPrometheusHealth().catch(() => ({
          configured: Boolean(env.prometheusApiUrl),
          reachable: false,
          message: 'Prometheus status unavailable.'
        })),
        getLokiHealth().catch(() => ({
          configured: Boolean(env.lokiApiUrl),
          reachable: false,
          message: 'Loki status unavailable.'
        }))
      ]),
      boundedAIHealth()
    ]);

  const resourceNames = new Map(resources.map((resource) => [resource._id.toString(), resource.name]));
  const analysisByChange = new Map(
    analyses.map((analysis) => [analysis.changeId.toString(), toChangeAnalysisDTO(analysis)])
  );
  const predictionIds = await PredictionSnapshotModel.find({ changeId: { $in: changes.map((change) => change._id) } })
    .select({ changeId: 1 })
    .lean();
  const predictionChangeIds = new Set(predictionIds.map((item) => item.changeId.toString()));
  const observationByChange = new Map(
    (
      await ObservedImpactModel.find({ changeId: { $in: changes.map((change) => change._id) } })
        .sort({ createdAt: -1 })
        .limit(MAX_RECENT * 2)
        .lean()
    ).map((item) => [item.changeId.toString(), item.status])
  );
  const comparisonByChange = new Map(
    comparisons.map((comparison) => [comparison.changeId.toString(), toPredictionComparisonDTO(comparison)])
  );
  const underInvestigation = new Set(investigations.map((item) => item.changeId.toString()));
  const riskDistribution = { low: 0, medium: 0, high: 0, critical: 0 } as DashboardSummary['riskDistribution'];
  let highCriticalRisk = 0;
  let unexpectedImpact = 0;
  let insufficientEvidence = 0;

  analyses.forEach((analysis) => {
    const level = analysis.risk.level;
    if (level in riskDistribution) riskDistribution[level] += 1;
    if (level === 'high' || level === 'critical') highCriticalRisk += 1;
  });
  comparisons.forEach((comparison) => {
    const outcome = comparison.outcome;
    if (outcome === 'unexpected_impact') unexpectedImpact += 1;
    if (outcome === 'insufficient_evidence') insufficientEvidence += 1;
  });

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
      ...(analysis ? { risk: analysis.risk } : {}),
      predictionStatus: predictionChangeIds.has(dto.id) ? ('available' as const) : ('unavailable' as const),
      realityStatus: observationByChange.get(dto.id) ?? 'unavailable',
      ...(comparison ? { outcome: comparison.outcome } : {})
    };
  });

  return {
    changeCounts: {
      total,
      highCriticalRisk,
      underInvestigation: underInvestigation.size,
      unexpectedImpact,
      insufficientEvidence
    },
    riskDistribution,
    recentChanges,
    recentOutcomes: comparisons.slice(0, 8).map((comparison) => {
      const change = changes.find((item) => item._id.equals(comparison.changeId));
      return {
        changeId: comparison.changeId.toString(),
        summary: change?.summary ?? 'Change',
        outcome: comparison.outcome,
        timestamp: comparison.comparedAt.toISOString()
      };
    }),
    integrationStatus: {
      github: env.githubToken || env.githubApiBaseUrl ? 'configured' : 'not_configured',
      kubernetes: integrationStatus[0],
      prometheus: integrationStatus[1],
      loki: integrationStatus[2]
    },
    aiStatus
  };
}
