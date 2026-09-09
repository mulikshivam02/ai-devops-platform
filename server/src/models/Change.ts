import { Schema, Types, model, type HydratedDocument } from 'mongoose';
import { sanitizeObject } from '../utils/sensitive-data.js';
import type { ChangeDTO, ChangeStatus, ChangeType } from '../types/change.js';

export interface ChangeDocument {
  resourceId: Types.ObjectId;
  changeId: string;
  source: string;
  author?: string;
  timestamp: Date;
  summary: string;
  changeType: ChangeType;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  evidenceIds: Types.ObjectId[];
  deploymentId?: string;
  status: ChangeStatus;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const changeSchema = new Schema<ChangeDocument>(
  {
    resourceId: { type: Schema.Types.ObjectId, ref: 'Resource', required: true },
    changeId: { type: String, required: true, trim: true, maxlength: 160 },
    source: { type: String, required: true, trim: true, maxlength: 80 },
    author: { type: String, trim: true, maxlength: 160 },
    timestamp: { type: Date, required: true },
    summary: { type: String, required: true, trim: true, maxlength: 500 },
    changeType: { type: String, required: true, enum: ['code', 'configuration', 'infrastructure', 'deployment', 'dependency', 'security', 'unknown'] },
    before: { type: Schema.Types.Mixed },
    after: { type: Schema.Types.Mixed },
    evidenceIds: [{ type: Schema.Types.ObjectId, ref: 'Evidence' }],
    deploymentId: { type: String, trim: true, maxlength: 160 },
    status: { type: String, required: true, enum: ['detected', 'deployed', 'failed', 'reverted', 'unknown'], default: 'unknown' },
    metadata: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

changeSchema.index({ resourceId: 1, timestamp: -1 });
changeSchema.index({ changeType: 1, timestamp: -1 });
changeSchema.index({ status: 1, timestamp: -1 });

export type ChangeHydratedDocument = HydratedDocument<ChangeDocument>;
export const ChangeModel = model<ChangeDocument>('Change', changeSchema);

export function toChangeDTO(change: ChangeHydratedDocument): ChangeDTO {
  return {
    id: change._id.toString(),
    resourceId: change.resourceId.toString(),
    changeId: change.changeId,
    source: change.source,
    ...(change.author ? { author: change.author } : {}),
    timestamp: change.timestamp.toISOString(),
    summary: change.summary,
    changeType: change.changeType,
    ...(change.before ? { before: sanitizeObject(change.before) } : {}),
    ...(change.after ? { after: sanitizeObject(change.after) } : {}),
    evidenceIds: change.evidenceIds.map((id) => id.toString()),
    ...(change.deploymentId ? { deploymentId: change.deploymentId } : {}),
    status: change.status,
    metadata: sanitizeObject(change.metadata),
    createdAt: change.createdAt.toISOString(),
    updatedAt: change.updatedAt.toISOString()
  };
}