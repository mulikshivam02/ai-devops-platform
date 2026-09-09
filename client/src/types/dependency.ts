export const relationshipTypes = ['depends_on', 'communicates_with', 'deploys_to', 'reads_from', 'writes_to', 'routes_to', 'monitored_by', 'configured_by'] as const;
export type RelationshipType = (typeof relationshipTypes)[number];

export const dependencyOrigins = ['manual', 'evidence', 'inferred'] as const;
export type DependencyOrigin = (typeof dependencyOrigins)[number];

export interface Dependency {
  id: string;
  sourceResourceId: string;
  targetResourceId: string;
  relationshipType: RelationshipType;
  direction: 'source_to_target';
  origin: DependencyOrigin;
  confidence: number;
  evidenceIds: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface DependencyInput {
  sourceResourceId: string;
  targetResourceId: string;
  relationshipType: RelationshipType;
  origin: DependencyOrigin;
  confidence?: number;
  evidenceIds?: string[];
  metadata?: Record<string, unknown>;
}

export interface DependencyFilters {
  sourceResourceId?: string;
  targetResourceId?: string;
  relationshipType?: RelationshipType;
  origin?: DependencyOrigin;
  page?: number;
  limit?: number;
}

export interface GraphNode {
  id: string;
  name: string;
  type: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relationshipType: RelationshipType;
  origin: DependencyOrigin;
  confidence: number;
}

export interface DependencyGraph {
  rootResourceId: string;
  depth: number;
  direction: 'dependencies' | 'dependents';
  nodes: GraphNode[];
  edges: GraphEdge[];
}