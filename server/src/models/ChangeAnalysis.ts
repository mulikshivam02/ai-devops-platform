import { Schema, Types, model, type HydratedDocument } from 'mongoose';
import { sanitizeObject, sanitizeStructured } from '../utils/sensitive-data.js';
import type { ChangeAnalysisDTO, ChangedItem, ImpactCategory, RiskFactor, RiskLevel } from '../types/changeAnalysis.js';

export interface ChangeAnalysisDocument {
  changeId: Types.ObjectId;
  resourceId: Types.ObjectId;
  analyzedAt: Date;
  changedItems: ChangedItem[];
  directlyAffectedResourceIds: Types.ObjectId[];
  transitivelyAffectedResourceIds: Types.ObjectId[];
  blastRadius: { directCount: number; transitiveCount: number; totalCount: number; maxDependencyDepth: number };
  risk: { score: number; level: RiskLevel; factors: RiskFactor[] };
  impact: { categories: ImpactCategory[]; summary: string };
  rollback: { available: boolean; source: string; description: string };
  evidenceIds: Types.ObjectId[];
  analysisVersion: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const analysisSchema = new Schema<ChangeAnalysisDocument>(
  {
    changeId: { type: Schema.Types.ObjectId, ref: 'Change', required: true, unique: true },
    resourceId: { type: Schema.Types.ObjectId, ref: 'Resource', required: true },
    analyzedAt: { type: Date, required: true },
    changedItems: [{ _id: false, path: String, itemType: String, operation: String, before: Schema.Types.Mixed, after: Schema.Types.Mixed }],
    directlyAffectedResourceIds: [{ type: Schema.Types.ObjectId, ref: 'Resource' }],
    transitivelyAffectedResourceIds: [{ type: Schema.Types.ObjectId, ref: 'Resource' }],
    blastRadius: { directCount: Number, transitiveCount: Number, totalCount: Number, maxDependencyDepth: Number },
    risk: { score: Number, level: String, factors: [{ _id: false, name: String, contribution: Number, reason: String }] },
    impact: { categories: [String], summary: String },
    rollback: { available: Boolean, source: String, description: String },
    evidenceIds: [{ type: Schema.Types.ObjectId, ref: 'Evidence' }],
    analysisVersion: { type: String, required: true },
    metadata: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

analysisSchema.index({ resourceId: 1, analyzedAt: -1 });
analysisSchema.index({ analyzedAt: -1 });

export type ChangeAnalysisHydratedDocument = HydratedDocument<ChangeAnalysisDocument>;
export const ChangeAnalysisModel = model<ChangeAnalysisDocument>('ChangeAnalysis', analysisSchema);

export function toChangeAnalysisDTO(analysis: ChangeAnalysisHydratedDocument): ChangeAnalysisDTO {
  return {
    id: analysis._id.toString(),
    changeId: analysis.changeId.toString(),
    resourceId: analysis.resourceId.toString(),
    analyzedAt: analysis.analyzedAt.toISOString(),
    changedItems: analysis.changedItems.map((item) => ({
      path: item.path,
      itemType: item.itemType,
      operation: item.operation,
      ...(item.before !== undefined ? { before: sanitizeStructured(item.before) } : {}),
      ...(item.after !== undefined ? { after: sanitizeStructured(item.after) } : {})
    })),
    directlyAffectedResourceIds: analysis.directlyAffectedResourceIds.map((id) => id.toString()),
    transitivelyAffectedResourceIds: analysis.transitivelyAffectedResourceIds.map((id) => id.toString()),
    blastRadius: analysis.blastRadius,
    risk: {
      score: analysis.risk.score,
      level: analysis.risk.level,
      factors: analysis.risk.factors.map((factor) => ({ name: factor.name, contribution: factor.contribution, reason: factor.reason }))
    },
    impact: analysis.impact,
    rollback: analysis.rollback,
    evidenceIds: analysis.evidenceIds.map((id) => id.toString()),
    analysisVersion: analysis.analysisVersion,
    metadata: sanitizeObject(analysis.metadata),
    createdAt: analysis.createdAt.toISOString(),
    updatedAt: analysis.updatedAt.toISOString()
  };
}