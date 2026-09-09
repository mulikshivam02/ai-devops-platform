import { Schema, model, type HydratedDocument } from 'mongoose';
import type { ResourceRecord, ResourceStatus, ResourceType } from '../types/resource.js';

export interface ResourceDocument extends Omit<ResourceRecord, 'id' | 'createdAt' | 'updatedAt'> {
  createdAt: Date;
  updatedAt: Date;
}

const resourceSchema = new Schema<ResourceDocument>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    type: {
      type: String,
      required: true,
      enum: ['github_repository', 'kubernetes_cluster', 'terraform_project', 'docker_environment', 'prometheus', 'loki']
    },
    provider: { type: String, trim: true, maxlength: 80 },
    environment: { type: String, trim: true, maxlength: 80 },
    status: { type: String, enum: ['active', 'inactive', 'unknown'], default: 'unknown' },
    description: { type: String, trim: true, maxlength: 500 },
    metadata: { type: Schema.Types.Mixed, default: {} },
    enabled: { type: Boolean, default: true }
  },
  { timestamps: true }
);

resourceSchema.index({ name: 1, type: 1, environment: 1 }, { unique: true });
resourceSchema.index({ type: 1 });
resourceSchema.index({ status: 1 });
resourceSchema.index({ environment: 1 });
resourceSchema.index({ createdAt: -1 });

export type ResourceHydratedDocument = HydratedDocument<ResourceDocument>;
export const ResourceModel = model<ResourceDocument>('Resource', resourceSchema);

const sensitiveMetadataKey = /secret|token|password|api[-_]?key|private[-_]?key|credential|authorization/i;

function sanitizeMetadata(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !sensitiveMetadataKey.test(key))
      .map(([key, entry]) => [
        key,
        typeof entry === 'object' && entry !== null && !Array.isArray(entry) ? sanitizeMetadata(entry) : entry
      ])
  );
}

export function toResourceRecord(resource: ResourceHydratedDocument): ResourceRecord {
  return {
    id: resource._id.toString(),
    name: resource.name,
    type: resource.type as ResourceType,
    ...(resource.provider ? { provider: resource.provider } : {}),
    ...(resource.environment ? { environment: resource.environment } : {}),
    status: resource.status as ResourceStatus,
    ...(resource.description ? { description: resource.description } : {}),
    metadata: sanitizeMetadata(resource.metadata),
    enabled: resource.enabled,
    createdAt: resource.createdAt.toISOString(),
    updatedAt: resource.updatedAt.toISOString()
  };
}