import type { SecurityFinding, SecuritySeverity } from '../types/security.js';
export const securitySeverityWeights: Record<SecuritySeverity, number> = { critical: 35, high: 24, medium: 12, low: 5, info: 1, unknown: 0 };
export const SECURITY_RISK_CAP = 40;
export function calculateSecurityRiskContribution(findings: Pick<SecurityFinding, 'severity' | 'fingerprint'>[]): number { const unique = new Map(findings.map((finding) => [finding.fingerprint, finding])); return Math.min(SECURITY_RISK_CAP, [...unique.values()].reduce((sum, finding) => sum + securitySeverityWeights[finding.severity], 0)); }