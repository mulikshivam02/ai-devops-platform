import type { Change } from './change';
import type { ChangeAnalysis } from './changeAnalysis';
import type { Resource } from './resource';
import type { PredictionComparison, PredictionSnapshot, ObservedImpact } from './predictionReality';
import type { HistoricalOutcome } from './historical';

export interface ChangeIntelligenceResult {
  change: Change;
  resource: Resource;
  evidenceSummary: { total: number; bySource: Record<string, number>; items: Array<{ id: string; source: string; evidenceType: string; timestamp: string; correlationId?: string }> };
  analysis?: ChangeAnalysis;
  dependencyImpact?: { directlyAffectedResourceIds: string[]; transitivelyAffectedResourceIds: string[]; blastRadius: ChangeAnalysis['blastRadius'] };
  risk?: ChangeAnalysis['risk'];
  prediction?: PredictionSnapshot;
  reality?: ObservedImpact;
  predictionVsReality?: PredictionComparison;
  security?: { findings: Array<Record<string, unknown>>; summary: Record<string, unknown> };
  aiInvestigation: { status: string; data?: Record<string, unknown> };
  historicalLearning: { status: string; similarChanges: Array<Record<string, unknown>>; riskTrend: Record<string, unknown>; predictionAccuracy: Record<string, unknown>; patterns: Array<Record<string, unknown>>; lookupErrors?: string[] };
  historicalOutcome?: HistoricalOutcome;
}
