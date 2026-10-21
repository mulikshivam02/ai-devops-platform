import { Schema, Types, model, type HydratedDocument } from 'mongoose';
import type {
  AccuracyDimensions,
  EvidenceQuality,
  HistoricalOutcomeDTO,
  PredictionRealityOutcome
} from '../types/historicalOutcome.js';

export interface HistoricalOutcomeDocument {
  changeId: Types.ObjectId;
  resourceId: Types.ObjectId;
  changeType: string;
  source: string;
  riskScore: number;
  riskLevel: string;
  predictedImpact: string[];
  observedImpact: string[];
  outcome: PredictionRealityOutcome;
  affectedResourceIds: Types.ObjectId[];
  securityFindingCount: number;
  predictedAt: Date;
  evaluatedAt: Date;
  predictionVersion: string;
  evidenceQuality: EvidenceQuality;
  accuracy: AccuracyDimensions;
  evidenceIds: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}
const schema = new Schema<HistoricalOutcomeDocument>(
  {
    changeId: { type: Schema.Types.ObjectId, ref: 'Change', required: true },
    resourceId: { type: Schema.Types.ObjectId, ref: 'Resource', required: true },
    changeType: { type: String, required: true, maxlength: 80 },
    source: { type: String, required: true, maxlength: 80 },
    riskScore: { type: Number, required: true, min: 0, max: 100 },
    riskLevel: { type: String, required: true },
    predictedImpact: { type: [String], default: [] },
    observedImpact: { type: [String], default: [] },
    outcome: {
      type: String,
      enum: [
        'predicted_and_observed',
        'predicted_not_observed',
        'unexpected_impact',
        'partially_predicted',
        'no_significant_impact',
        'insufficient_evidence'
      ],
      required: true
    },
    affectedResourceIds: [{ type: Schema.Types.ObjectId, ref: 'Resource' }],
    securityFindingCount: { type: Number, default: 0, min: 0, max: 1000 },
    predictedAt: { type: Date, required: true },
    evaluatedAt: { type: Date, required: true },
    predictionVersion: { type: String, required: true },
    evidenceQuality: { type: String, enum: ['high', 'medium', 'low', 'insufficient'], required: true },
    accuracy: {
      outcome: Number,
      impact: Number,
      resources: Number,
      failureModes: Number,
      overall: Number,
      accuracyVersion: { type: String, required: true }
    },
    evidenceIds: [{ type: Schema.Types.ObjectId, ref: 'Evidence' }]
  },
  { timestamps: true }
);
schema.index({ changeId: 1, predictionVersion: 1, evaluatedAt: -1 });
schema.index({ resourceId: 1, evaluatedAt: -1 });
schema.index({ changeType: 1, outcome: 1, evaluatedAt: -1 });
export type HistoricalOutcomeHydrated = HydratedDocument<HistoricalOutcomeDocument>;
export const HistoricalOutcomeModel = model<HistoricalOutcomeDocument>('HistoricalOutcome', schema);
export function toHistoricalOutcomeDTO(doc: HistoricalOutcomeHydrated): HistoricalOutcomeDTO {
  return {
    id: doc._id.toString(),
    changeId: doc.changeId.toString(),
    resourceId: doc.resourceId.toString(),
    changeType: doc.changeType,
    source: doc.source,
    riskScore: doc.riskScore,
    riskLevel: doc.riskLevel,
    predictedImpact: doc.predictedImpact,
    observedImpact: doc.observedImpact,
    outcome: doc.outcome,
    affectedResourceIds: doc.affectedResourceIds.map((id) => id.toString()),
    securityFindingCount: doc.securityFindingCount,
    predictedAt: doc.predictedAt.toISOString(),
    evaluatedAt: doc.evaluatedAt.toISOString(),
    predictionVersion: doc.predictionVersion,
    evidenceQuality: doc.evidenceQuality,
    accuracy: doc.accuracy,
    evidenceIds: doc.evidenceIds.map((id) => id.toString())
  };
}
