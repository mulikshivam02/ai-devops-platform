export type KubernetesWorkloadKind = 'Deployment' | 'StatefulSet' | 'DaemonSet';

export interface KubernetesHealth {
  configured: boolean;
  reachable: boolean;
  version?: string;
  platform?: string;
  message: string;
}

export interface KubernetesNamespace {
  name: string;
  phase?: string;
  createdAt?: string;
  resourceVersion?: string;
  labels: Record<string, string>;
}

export interface KubernetesWorkload {
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
  requested: number;
  observed: number;
  /** Kinds with more workloads than one import reads; narrow by namespace or kind to see the rest. */
  truncatedKinds: KubernetesWorkloadKind[];
  evidenceCreated: number;
  evidenceAlreadyPresent: number;
  changesCreated: number;
  unchanged: number;
  changes: Array<{ id: string; changeId: string; summary: string; changeType: string; before?: unknown; after?: unknown }>;
}
