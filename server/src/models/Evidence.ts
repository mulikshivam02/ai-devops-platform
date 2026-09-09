import { Schema, Types, model, type HydratedDocument } from 'mongoose';
import { sanitizeObject } from '../utils/sensitive-data.js';
import type { EvidenceDTO, EvidenceSource, EvidenceType } from '../types/evidence.js';

export interface EvidenceDocument {
  resourceId?: Types.ObjectId;
  evidenceType: EvidenceType;
  source: EvidenceSource;
  timestamp: Date;
  collectedAt: Date;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
  correlationId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const evidenceSchema = new Schema<EvidenceDocument>(
  {
    resourceId: { type: Schema.Types.ObjectId, ref: 'Resource' },
    evidenceType: { type: String, required: true, enum: ['git', 'deployment', 'kubernetes', 'terraform', 'docker', 'metric', 'log', 'event', 'configuration'] },
    source: { type: String, required: true, enum: ['manual', 'system', 'github', 'kubernetes', 'terraform', 'prometheus', 'loki', 'docker'] },
    timestamp: { type: Date, required: true },
    collectedAt: { type: Date, required: true, default: Date.now },
    payload: { type: Schema.Types.Mixed, required: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
    correlationId: { type: String, trim: true, maxlength: 160 }
  },
  { timestamps: true }
);

evidenceSchema.index({ resourceId: 1, timestamp: -1 });
evidenceSchema.index({ evidenceType: 1, timestamp: -1 });
evidenceSchema.index({ source: 1, timestamp: -1 });
evidenceSchema.index({ correlationId: 1 });

export type EvidenceHydratedDocument = HydratedDocument<EvidenceDocument>;
export const EvidenceModel = model<EvidenceDocument>('Evidence', evidenceSchema);

export function toEvidenceDTO(evidence: EvidenceHydratedDocument): EvidenceDTO {
  return {
    id: evidence._id.toString(),
    ...(evidence.resourceId ? { resourceId: evidence.resourceId.toString() } : {}),
    evidenceType: evidence.evidenceType,
    source: evidence.source,
    timestamp: evidence.timestamp.toISOString(),
    collectedAt: evidence.collectedAt.toISOString(),
    payload: sanitizeObject(evidence.payload),
    metadata: sanitizeObject(evidence.metadata),
    ...(evidence.correlationId ? { correlationId: evidence.correlationId } : {}),
    createdAt: evidence.createdAt.toISOString(),
    updatedAt: evidence.updatedAt.toISOString()
  };
}