import type { ChangeType } from '../types/change.js';
import type { RiskFactor, RiskLevel } from '../types/changeAnalysis.js';

export interface RiskInput {
  changeType: ChangeType;
  environment?: string;
  changedItemCount: number;
  transitiveCount: number;
  maxDependencyDepth: number;
  rollbackAvailable: boolean;
}

export interface RiskResult {
  score: number;
  level: RiskLevel;
  factors: RiskFactor[];
}

const changeTypeWeights: Record<ChangeType, number> = { infrastructure: 15, deployment: 14, security: 16, dependency: 12, configuration: 8, code: 5, unknown: 6 };

export function calculateChangeRisk(input: RiskInput): RiskResult {
  const factors: RiskFactor[] = [];
  const size = Math.min(15, input.changedItemCount * 3);
  factors.push({ name: 'change_size', contribution: size, reason: `${input.changedItemCount} changed item(s) were normalized.` });
  const environment = input.environment === 'production' ? 20 : input.environment === 'staging' ? 10 : input.environment === 'development' ? 3 : 5;
  factors.push({ name: 'environment', contribution: environment, reason: `Environment is ${input.environment ?? 'unknown'}; no production assumption is made.` });
  const blast = Math.min(25, input.transitiveCount * 8);
  factors.push({ name: 'blast_radius', contribution: blast, reason: `The dependency graph reaches ${input.transitiveCount} transitive resource(s).` });
  const depth = Math.min(15, input.maxDependencyDepth * 5);
  factors.push({ name: 'dependency_depth', contribution: depth, reason: `Maximum dependency traversal depth is ${input.maxDependencyDepth}.` });
  const type = changeTypeWeights[input.changeType];
  factors.push({ name: 'change_type', contribution: type, reason: `${input.changeType} changes use the deterministic type weight.` });
  const rollback = input.rollbackAvailable ? -5 : 5;
  factors.push({ name: 'rollback', contribution: rollback, reason: input.rollbackAvailable ? 'A reliable before/previous value is available for rollback.' : 'No reliable rollback information is present.' });
  const score = Math.max(0, Math.min(100, factors.reduce((sum, factor) => sum + factor.contribution, 0)));
  const level: RiskLevel = score >= 75 ? 'critical' : score >= 50 ? 'high' : score >= 25 ? 'medium' : 'low';
  return { score, level, factors };
}