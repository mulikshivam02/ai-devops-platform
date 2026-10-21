import type { ChangeType } from '../types/change.js';
import type { RiskFactor, RiskLevel } from '../types/changeAnalysis.js';

export interface RiskInput {
  changeType: ChangeType;
  environment?: string;
  changedItemCount: number;
  // Direct dependents (depth 1) and transitive dependents (depth 2+) of the
  // changed resource. Previously only transitiveCount existed and directCount
  // was silently dropped before it ever reached this function -- a change with
  // 50 direct dependents and zero transitive ones scored a blast_radius
  // contribution of exactly 0. See review 2.2/3.2.
  directCount: number;
  transitiveCount: number;
  maxDependencyDepth: number;
  rollbackAvailable: boolean;
  securityContribution?: number;
  historicalContribution?: number;
  historicalReason?: string;
}

export interface RiskResult {
  score: number;
  level: RiskLevel;
  factors: RiskFactor[];
}

// Rebalanced so the factors' maximum possible sum is exactly 100 (previously it
// was 148, so scores routinely saturated at the 100 clamp well before reaching
// their true theoretical maximum -- a moderately risky production change and a
// genuinely catastrophic one could both read 100/critical, indistinguishably.
// See review 2.22/3.2. Each factor's own cap is noted alongside it below; they
// sum to 100 with security and historical assuming their own maximums.
const CHANGE_SIZE_CAP = 10;
const BLAST_RADIUS_CAP = 20;
const DEPTH_CAP = 10;
const SECURITY_CAP = 15;
const HISTORICAL_CAP = 5;
// ENVIRONMENT_CAP = 20 (inline in the ternary below -- production is the max)
// CHANGE_TYPE_CAP = 15 (the highest value in the table below, 'security')
// ROLLBACK_CAP = 5 (only ever contributes when rollback is NOT available)
// 10 + 20 + 20 + 10 + 15 + 5 + 15 + 5 = 100

const changeTypeWeights: Record<ChangeType, number> = {
  security: 15,
  infrastructure: 14,
  deployment: 13,
  dependency: 11,
  // 'unknown' is deliberately in the middle of the table, not the bottom. It
  // previously wasn't in the table AT ALL: `changeTypeWeights[input.changeType]`
  // returned `undefined` for any value the enum didn't already list, which turned
  // the whole score into NaN, and NaN fails every `score >= threshold` comparison,
  // so the change was classified 'low' risk -- the single safest possible outcome
  // for a change type the system doesn't even recognise. See review 2.1/3.2.
  unknown: 10,
  configuration: 7,
  code: 4
};

export function calculateChangeRisk(input: RiskInput): RiskResult {
  const factors: RiskFactor[] = [];

  const size = Math.min(CHANGE_SIZE_CAP, input.changedItemCount * 2);
  factors.push({
    name: 'change_size',
    contribution: size,
    reason: `${input.changedItemCount} changed item(s) were normalized.`
  });

  const environment =
    input.environment === 'production'
      ? 20
      : input.environment === 'staging'
        ? 10
        : input.environment === 'development'
          ? 3
          : 5;
  factors.push({
    name: 'environment',
    contribution: environment,
    reason: `Environment is ${input.environment ?? 'unknown'}; no production assumption is made.`
  });

  // Direct dependents weigh more per-resource than transitive ones (a change
  // that immediately breaks 3 things is worse than one that could theoretically
  // ripple to 3 things four hops away), but both now actually count. Previously
  // this was `Math.min(25, input.transitiveCount * 8)` -- directCount was computed
  // upstream and then discarded before it ever reached this function.
  const blast = Math.min(BLAST_RADIUS_CAP, input.directCount * 4 + input.transitiveCount * 1);
  factors.push({
    name: 'blast_radius',
    contribution: blast,
    reason: `${input.directCount} direct and ${input.transitiveCount} transitive dependent resource(s).`
  });

  const depth = Math.min(DEPTH_CAP, input.maxDependencyDepth * 3);
  factors.push({
    name: 'dependency_depth',
    contribution: depth,
    reason: `Maximum dependency traversal depth is ${input.maxDependencyDepth}.`
  });

  const type = changeTypeWeights[input.changeType] ?? changeTypeWeights.unknown;
  factors.push({
    name: 'change_type',
    contribution: type,
    reason: `${input.changeType} changes use the deterministic type weight.`
  });

  const rollback = input.rollbackAvailable ? -5 : 5;
  factors.push({
    name: 'rollback',
    contribution: rollback,
    reason: input.rollbackAvailable
      ? 'A reliable before/previous value is available for rollback.'
      : 'No reliable rollback information is present.'
  });

  const security = Math.max(0, Math.min(SECURITY_CAP, input.securityContribution ?? 0));
  if (security > 0)
    factors.push({
      name: 'security',
      contribution: security,
      reason: 'Unique evidence-backed security findings contribute a capped deterministic risk factor.'
    });

  const historical = Math.max(0, Math.min(HISTORICAL_CAP, input.historicalContribution ?? 0));
  if (historical > 0)
    factors.push({
      name: 'historical_outcomes',
      contribution: historical,
      reason: input.historicalReason ?? 'Completed historical outcomes contribute a bounded deterministic factor.'
    });

  const rawScore = factors.reduce((sum, factor) => sum + factor.contribution, 0);
  // A defensive backstop, not the primary fix: the `?? changeTypeWeights.unknown`
  // fallback above is what actually prevents NaN. This guard exists so that if a
  // future change to this function reintroduces an unguarded lookup somewhere, it
  // fails loudly instead of silently reporting the safest possible risk level.
  if (!Number.isFinite(rawScore)) {
    throw new Error(
      `calculateChangeRisk produced a non-finite score (${String(rawScore)}) for changeType "${input.changeType}". ` +
        'This indicates a missing weight or invalid numeric input, not a genuinely low-risk change.'
    );
  }
  const score = Math.max(0, Math.min(100, Math.round(rawScore)));
  const level: RiskLevel = score >= 75 ? 'critical' : score >= 50 ? 'high' : score >= 25 ? 'medium' : 'low';
  return { score, level, factors };
}
