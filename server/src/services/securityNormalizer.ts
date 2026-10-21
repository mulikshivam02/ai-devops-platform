import { createHash } from 'node:crypto';
import type { CreateSecurityFindingInput } from '../types/security.js';
function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const result = stringValue(value)?.toLowerCase() as T | undefined;
  return result && allowed.includes(result) ? result : fallback;
}
const sources = [
  'scanner',
  'configuration',
  'dependency',
  'container',
  'terraform',
  'kubernetes',
  'code',
  'ci_cd',
  'manual'
] as const;
const categories = [
  'vulnerability',
  'misconfiguration',
  'secret_exposure',
  'dependency',
  'container',
  'iac',
  'kubernetes',
  'identity',
  'network',
  'ci_cd',
  'configuration',
  'unknown'
] as const;
const severities = ['info', 'low', 'medium', 'high', 'critical', 'unknown'] as const;
export function normalizeSecurityFinding(
  input: Record<string, unknown>,
  context: { resourceId?: string; changeId?: string; evidenceIds?: string[] } = {}
): CreateSecurityFindingInput | null {
  const title = stringValue(input.title) ?? stringValue(input.name);
  const description = stringValue(input.description) ?? stringValue(input.message);
  if (!title || !description) return null;
  const source = enumValue(input.source, sources, 'manual');
  const category = enumValue(input.category, categories, 'unknown');
  const severity = enumValue(input.severity, severities, 'unknown');
  const location =
    typeof input.location === 'object' && input.location !== null && !Array.isArray(input.location)
      ? (input.location as CreateSecurityFindingInput['location'])
      : undefined;
  const confidence =
    typeof input.confidence === 'number' && Number.isFinite(input.confidence)
      ? Math.max(0, Math.min(100, input.confidence))
      : source === 'scanner'
        ? 90
        : 60;
  return {
    ...context,
    source,
    category,
    severity,
    title,
    description,
    ...(stringValue(input.ruleId) ? { ruleId: stringValue(input.ruleId) } : {}),
    ...(stringValue(input.cve) ? { cve: stringValue(input.cve) } : {}),
    ...(stringValue(input.cwe) ? { cwe: stringValue(input.cwe) } : {}),
    ...(stringValue(input.package) ? { package: stringValue(input.package) } : {}),
    ...(stringValue(input.installedVersion) ? { installedVersion: stringValue(input.installedVersion) } : {}),
    ...(stringValue(input.fixedVersion) ? { fixedVersion: stringValue(input.fixedVersion) } : {}),
    ...(location ? { location } : {}),
    status: enumValue(input.status, ['open', 'acknowledged', 'resolved', 'false_positive', 'unknown'] as const, 'open'),
    confidence,
    remediation: {
      available: typeof input.remediation === 'object' && input.remediation !== null,
      ...(typeof input.remediationSummary === 'string' ? { summary: input.remediationSummary } : {})
    },
    metadata:
      typeof input.metadata === 'object' && input.metadata !== null && !Array.isArray(input.metadata)
        ? (input.metadata as Record<string, unknown>)
        : {},
    detectedAt: typeof input.detectedAt === 'string' ? input.detectedAt : new Date().toISOString()
  };
}
export function normalizeSecurityEvidence(
  payload: Record<string, unknown>,
  context: { resourceId?: string; changeId?: string; evidenceIds?: string[] }
): CreateSecurityFindingInput[] {
  // No `: [payload]` fallback: only payloads that explicitly declare `findings`
  // or `securityFinding` are treated as candidates. normalizeSecurityFinding only
  // requires a title/name and a description/message to succeed -- which is a
  // shape ordinary evidence (a commit message, a Kubernetes event, a log line)
  // commonly has by accident. Falling through to "treat the whole payload as a
  // finding" meant analyzeChangeSecurity (which runs this over every piece of
  // evidence attached to a change) could manufacture a security finding, complete
  // with category:'unknown' and severity:'unknown', out of completely ordinary
  // evidence that was never flagged as security-relevant by anything. That
  // fabricated finding then fed calculateSecurityRiskContribution and inflated
  // the change's risk score. See review 2.20/3.9.
  const candidates = Array.isArray(payload.findings)
    ? payload.findings
    : payload.securityFinding && typeof payload.securityFinding === 'object'
      ? [payload.securityFinding]
      : [];
  return candidates
    .filter(
      (candidate): candidate is Record<string, unknown> =>
        typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate)
    )
    .map((candidate) => normalizeSecurityFinding(candidate, context))
    .filter((finding): finding is CreateSecurityFindingInput => finding !== null);
}
export function fingerprintFor(input: CreateSecurityFindingInput): string {
  return createHash('sha256')
    .update(
      // changeId is included so a finding is keyed per-change, not globally.
      // Previously the same underlying issue detected on change #1 and change #2
      // collapsed into ONE document whose changeId belonged to whichever change
      // created it first -- so `SecurityFinding.find({ changeId: <change #2> })`
      // returned nothing, and change #2's risk score silently excluded a security
      // contribution that was actually present. See review 2.2/3.3.
      //
      // This does mean the same issue detected across many changes to the same
      // resource creates one document per change rather than one document total
      // -- a reasonable trade for now; a cleaner long-term model separates "the
      // issue" from "a detection of it on a specific change" (see review's
      // Phase 3.2 for that fuller redesign).
      JSON.stringify([
        input.resourceId ?? null,
        input.changeId ?? null,
        input.category,
        input.ruleId ?? null,
        input.location ?? null,
        input.package ?? null,
        input.cve ?? null,
        input.title
      ])
    )
    .digest('hex');
}
