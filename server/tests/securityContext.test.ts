import { describe, expect, it } from 'vitest';
import { MockAIProvider } from '../src/ai/mockProvider.js';
import { projectSecurityContext } from '../src/ai/contextBuilder.js';
import { summarizeSecurityBlastRadius } from '../src/engines/securityBlastRadiusEngine.js';

describe('security investigation context', () => {
  it('includes bounded deterministic security facts and dependency semantics', async () => {
    const context = projectSecurityContext([{ id: 'finding-1', category: 'misconfiguration', severity: 'high', title: 'Unsafe exposure', description: 'A structured finding.', resourceId: 'resource-1', changeId: 'change-1', evidenceIds: ['evidence-1', 'evidence-1'], confidence: 88, cve: 'CVE-2026-0001', directDependents: ['resource-2'], transitiveDependents: ['resource-3', 'resource-2'], dependencyDepth: 42 }]);
    expect(context[0]).toMatchObject({ id: 'finding-1', evidenceIds: ['evidence-1'], cve: 'CVE-2026-0001', dependencyBlastRadius: { directDependents: ['resource-2'], transitiveDependents: ['resource-3'], dependencyDepth: 10, totalPotentiallyAffected: 3, semantics: 'potentially_affected_by_dependency_relationship' } });
    expect(JSON.stringify(context)).not.toContain('secret');
  });

  it('keeps AI behavior available without Ollama and does not create security facts', async () => {
    const result = await new MockAIProvider().analyze({ type: 'change_analysis', context: { change: { id: 'c', summary: 'change', changeType: 'configuration', source: 'manual', resourceId: 'r', evidenceIds: ['e'] }, resource: { id: 'r', name: 'resource', type: 'kubernetes_cluster' }, dependencies: [], evidence: [], securityFindings: [], history: [] }, prompt: '{}' });
    expect(result.rootCause.evidenceIds).toEqual([]);
    expect(result.evidenceReferences).toEqual([]);
  });

  it('handles direct, multi-hop, duplicate, cyclic, and bounded dependency impact', () => {
    const edges = [{ sourceResourceId: 'b', targetResourceId: 'a' }, { sourceResourceId: 'c', targetResourceId: 'b' }, { sourceResourceId: 'd', targetResourceId: 'c' }, { sourceResourceId: 'a', targetResourceId: 'd' }, { sourceResourceId: 'c', targetResourceId: 'b' }];
    expect(summarizeSecurityBlastRadius('a', edges, 10)).toEqual({ directDependents: ['b'], transitiveDependents: ['c', 'd'], dependencyDepth: 3, totalPotentiallyAffected: 4 });
    expect(summarizeSecurityBlastRadius('a', edges, 2).dependencyDepth).toBe(2);
  });
});