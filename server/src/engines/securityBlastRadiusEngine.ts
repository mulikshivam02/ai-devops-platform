export interface SecurityDependencyEdge { sourceResourceId: string; targetResourceId: string; }
export interface SecurityBlastRadius { directDependents: string[]; transitiveDependents: string[]; dependencyDepth: number; totalPotentiallyAffected: number; }

export function summarizeSecurityBlastRadius(rootResourceId: string, edges: SecurityDependencyEdge[], maxDepth = 10): SecurityBlastRadius {
  const direct = new Set<string>(); const transitive = new Set<string>(); const visited = new Set<string>([rootResourceId]); let frontier = [rootResourceId]; let depthReached = 0;
  for (let depth = 1; depth <= Math.min(10, maxDepth) && frontier.length > 0; depth += 1) {
    const next: string[] = [];
    for (const edge of edges) if (frontier.includes(edge.targetResourceId) && !visited.has(edge.sourceResourceId)) { visited.add(edge.sourceResourceId); next.push(edge.sourceResourceId); if (depth === 1) direct.add(edge.sourceResourceId); else transitive.add(edge.sourceResourceId); }
    if (next.length > 0) depthReached = depth;
    frontier = [...new Set(next)];
  }
  return { directDependents: [...direct], transitiveDependents: [...transitive].filter((id) => !direct.has(id)), dependencyDepth: depthReached, totalPotentiallyAffected: 1 + direct.size + transitive.size };
}