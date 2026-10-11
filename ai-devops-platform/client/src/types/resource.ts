export const resourceTypes = [
  'github_repository',
  'kubernetes_cluster',
  'terraform_project',
  'docker_environment',
  'prometheus',
  'loki'
] as const;

export type ResourceType = (typeof resourceTypes)[number];

export const resourceStatuses = ['active', 'inactive', 'unknown'] as const;

export type ResourceStatus = (typeof resourceStatuses)[number];

export interface Resource {
  id: string;
  name: string;
  type: ResourceType;
  provider?: string;
  environment?: string;
  status: ResourceStatus;
  description?: string;
  metadata: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ResourceInput {
  name: string;
  type: ResourceType;
  provider?: string;
  environment?: string;
  status: ResourceStatus;
  description?: string;
  enabled: boolean;
}

export interface ResourceFilters {
  type?: ResourceType;
  status?: ResourceStatus;
  environment?: string;
  enabled?: boolean;
}