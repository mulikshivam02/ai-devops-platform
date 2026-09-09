import { describe, expect, it } from 'vitest';
import { calculateRemediationRisk, rollbackFor } from '../src/remediation/remediation.engine.js';
import { assertSafeActionShape } from '../src/remediation/remediation.policy.js';
import { assertTransition, canTransition } from '../src/remediation/remediation.transitions.js';
import { DryRunRemediationExecutor } from '../src/remediation/remediation.executor.js';

describe('remediation safety engine', () => {
  const action = { action: 'update_configuration' as const, path: 'service.replicas', before: 1, after: 2 };
  it('allows structured actions and rejects command-shaped actions', () => { expect(() => assertSafeActionShape(action)).not.toThrow(); expect(() => assertSafeActionShape({ action: 'run_command', command: 'kubectl apply' })).toThrow(); });
  it('enforces lifecycle transitions', () => { expect(canTransition('proposed', 'analyzed')).toBe(true); expect(canTransition('proposed', 'executing')).toBe(false); expect(() => assertTransition('validated', 'executing')).toThrow(); });
  it('calculates deterministic approval risk and caps at 100', () => { const input = { environment: 'production', affectedResourceCount: 100, dependencyDepth: 10, securitySeverity: 'critical', rollbackAvailable: false, historicalFailures: 10 }; const first = calculateRemediationRisk(input, [action]); expect(first).toEqual(calculateRemediationRisk(input, [action])); expect(first.score).toBe(100); expect(first.requiresApproval).toBe(true); });
  it('does not fabricate rollback information', () => { expect(rollbackFor([{ action: 'update_configuration', path: 'a', after: 2 }])).toMatchObject({ available: false, actions: [] }); expect(rollbackFor([action])).toMatchObject({ available: true, actions: [{ path: 'service.replicas', value: 1 }] }); });
  it('keeps execution dry-run only and does not treat missing evidence as success', async () => { const executor = new DryRunRemediationExecutor(); const result = await executor.execute([action]); expect(result.mode).toBe('dry_run'); expect(result.message).toContain('no host'); const verification = await executor.verify([action], []); expect(verification.status).toBe('insufficient_evidence'); });
});
