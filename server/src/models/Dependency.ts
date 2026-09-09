import { Schema, Types, model, type HydratedDocument } from 'mongoose';
import { sanitizeObject } from '../utils/sensitive-data.js';
import type { DependencyDTO, DependencyOrigin, RelationshipType } from '../types/dependency.js';

export interface DependencyDocument {
  sourceResourceId: Types.ObjectId;
  targetResourceId: Types.ObjectId;
  relationshipType: RelationshipType;
  direction: 'source_to_target';
  origin: DependencyOrigin;
  confidence: number;
  evidenceIds: Types.ObjectId[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const dependencySchema = new Schema<DependencyDocument>(
  {
    sourceResourceId: { type: Schema.Types.ObjectId, ref: 'Resource', required: true },
    targetResourceId: { type: Schema.Types.ObjectId, ref: 'Resource', required: true },
    relationshipType: { type: String, required: true, enum: ['depends_on', 'communicates_with', 'deploys_to', 'reads_from', 'writes_to', 'routes_to', 'monitored_by', 'configured_by'] },
    direction: { type: String, required: true, enum: ['source_to_target'], default: 'source_to_target' },
    origin: { type: String, required: true, enum: ['manual', 'evidence', 'inferred'], default: 'manual' },
    confidence: { type: Number, required: true, min: 0, max: 1, default: 1 },
    evidenceIds: [{ type: Schema.Types.ObjectId, ref: 'Evidence' }],
    metadata: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

dependencySchema.index({ sourceResourceId: 1 });
dependencySchema.index({ targetResourceId: 1 });
dependencySchema.index({ relationshipType: 1 });
dependencySchema.index({ sourceResourceId: 1, targetResourceId: 1, relationshipType: 1 }, { unique: true });

export type DependencyHydratedDocument = HydratedDocument<DependencyDocument>;
export const DependencyModel = model<DependencyDocument>('Dependency', dependencySchema);

export function toDependencyDTO(dependency: DependencyHydratedDocument): DependencyDTO {
  return {
    id: dependency._id.toString(),
    sourceResourceId: dependency.sourceResourceId.toString(),
    targetResourceId: dependency.targetResourceId.toString(),
    relationshipType: dependency.relationshipType,
    direction: dependency.direction,
    origin: dependency.origin,
    confidence: dependency.confidence,
    evidenceIds: dependency.evidenceIds.map((id) => id.toString()),
    metadata: sanitizeObject(dependency.metadata),
    createdAt: dependency.createdAt.toISOString(),
    updatedAt: dependency.updatedAt.toISOString()
  };
}