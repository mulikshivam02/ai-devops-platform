export const kubernetesWorkloadKinds = ['Deployment', 'StatefulSet', 'DaemonSet'] as const;
export type KubernetesWorkloadKind = (typeof kubernetesWorkloadKinds)[number];

export interface KubernetesApiVersion {
  gitVersion?: string;
  platform?: string;
}

export interface KubernetesListMetadata {
  resourceVersion?: string;
  continue?: string;
}

export interface KubernetesNamespaceItem {
  metadata?: {
    name?: string;
    labels?: Record<string, string>;
    creationTimestamp?: string;
    resourceVersion?: string;
  };
  status?: { phase?: string };
}

export interface KubernetesNamespaceList {
  metadata?: KubernetesListMetadata;
  items?: KubernetesNamespaceItem[];
}

export interface KubernetesContainer {
  name?: string;
  image?: string;
}

export interface KubernetesWorkloadItem {
  metadata?: {
    name?: string;
    namespace?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
    generation?: number;
    resourceVersion?: string;
    creationTimestamp?: string;
  };
  spec?: {
    replicas?: number;
    template?: { spec?: { containers?: KubernetesContainer[] } };
  };
  status?: {
    replicas?: number;
    readyReplicas?: number;
    availableReplicas?: number;
    updatedReplicas?: number;
    currentReplicas?: number;
    numberReady?: number;
    desiredNumberScheduled?: number;
    currentNumberScheduled?: number;
    numberAvailable?: number;
    updatedNumberScheduled?: number;
    conditions?: Array<{ type?: string; status?: string; reason?: string; message?: string }>;
  };
}

export interface KubernetesWorkloadList {
  metadata?: KubernetesListMetadata;
  items?: KubernetesWorkloadItem[];
}

export interface KubernetesRepositorySummary {
  configured: boolean;
  reachable: boolean;
  version?: string;
  platform?: string;
  message: string;
}

export interface KubernetesNamespaceSummary {
  name: string;
  phase?: string;
  createdAt?: string;
  resourceVersion?: string;
  labels: Record<string, string>;
}

export interface KubernetesWorkloadSummary {
  provider: 'kubernetes';
  apiIdentity: string;
  kind: KubernetesWorkloadKind;
  namespace: string;
  name: string;
  replicas: { desired?: number; current?: number; ready?: number; available?: number; updated?: number };
  images: string[];
  labels: Record<string, string>;
  annotations: Record<string, string>;
  generation?: number;
  resourceVersion?: string;
  createdAt?: string;
  status: { conditions: Array<{ type: string; status: string; reason?: string; message?: string }> };
  observedAt: string;
}

export interface KubernetesImportResult {
  /** The per-import cap (per kind x kinds queried), not the number found. */
  requested: number;
  observed: number;
  /** Kinds that have more workloads than one import reads; narrow by namespace or kind to see the rest. */
  truncatedKinds: KubernetesWorkloadKind[];
  evidenceCreated: number;
  evidenceAlreadyPresent: number;
  changesCreated: number;
  unchanged: number;
  changes: Array<{
    id: string;
    changeId: string;
    summary: string;
    changeType: string;
    before?: unknown;
    after?: unknown;
  }>;
}
