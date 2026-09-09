import type { ExecutionResult, RemediationAction, VerificationResult } from './remediation.types.js';

export interface RemediationExecutor { validate(actions: RemediationAction[]): Promise<{ valid: boolean; message: string }>; execute(actions: RemediationAction[]): Promise<ExecutionResult>; verify(actions: RemediationAction[], evidenceIds: string[]): Promise<VerificationResult>; }
export class DryRunRemediationExecutor implements RemediationExecutor {
  async validate(actions: RemediationAction[]) { return { valid: actions.length > 0, message: 'Structured actions were checked in dry-run mode.' }; }
  async execute(actions: RemediationAction[]): Promise<ExecutionResult> { const now = new Date().toISOString(); return { mode: 'dry_run', startedAt: now, completedAt: now, success: actions.length > 0, message: 'Dry run simulated; no host, shell, cluster, cloud, or credential changes were performed.' }; }
  async verify(_actions: RemediationAction[], evidenceIds: string[]): Promise<VerificationResult> { return { status: evidenceIds.length > 0 ? 'passed' : 'insufficient_evidence', evidenceIds, summary: evidenceIds.length > 0 ? 'Verification evidence was supplied; runtime state remains externally observed.' : 'Insufficient evidence to verify a remediation; absence of evidence is not success.', verifiedAt: new Date().toISOString() }; }
}