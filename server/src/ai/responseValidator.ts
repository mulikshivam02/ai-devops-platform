import type { AIAnalysisResult } from './types.js';
import { AppError } from '../utils/app-error.js';

const destructiveAction = /\b(delete|destroy|apply|deploy|execute|rollback|restart|scale)\b/i;
const command = /\b(kubectl|terraform|docker|shell)\b/i;

function isUnsafeRecommendation(text: string): boolean {
  if (command.test(text)) return true;
  if (!destructiveAction.test(text)) return false;
  return true;
}

function pathError(path: string, detail: string): never {
  throw new AppError(502, `AI ${path} is invalid: ${detail}.`);
}

function stringField(source: Record<string, unknown>, key: string, path: string): string {
  const value = source[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    pathError(path, `expected non-empty string at ${key}`);
  }
  return value;
}

function confidenceField(source: Record<string, unknown>, key: string, path: string): number {
  const value = source[key];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 100) {
    pathError(path, `expected integer confidence between 0 and 100 at ${key}`);
  }
  return value;
}

function evidenceRefs(value: unknown, allowedEvidenceIds: Set<string>, path: string): string[] {
  if (!Array.isArray(value)) {
    pathError(path, 'expected array of evidence IDs');
  }
  const ids = value as unknown[];
  const normalized = ids.map((id, index) => {
    if (typeof id !== 'string') pathError(path, `expected string at ${path}[${index}]`);
    if (!allowedEvidenceIds.has(id)) pathError(path, `unknown evidence ID ${id}`);
    return id;
  });
  return [...new Set(normalized)];
}

export function validateAIResult(value: unknown, allowedEvidenceIds: Set<string>): AIAnalysisResult {
  if (typeof value !== 'object' || value === null) {
    pathError('response', 'expected object at root');
  }

  const data = value as Record<string, unknown>;
  if (!Array.isArray(data.hypotheses) || !Array.isArray(data.reasoning) || !Array.isArray(data.recommendations) || !Array.isArray(data.limitations)) {
    pathError('response', 'expected hypotheses, reasoning, recommendations, and limitations arrays');
  }

  const root = data.rootCause;
  if (typeof root !== 'object' || root === null) {
    pathError('rootCause', 'expected object');
  }
  const rootRecord = root as Record<string, unknown>;

  return {
    summary: stringField(data, 'summary', 'summary'),
    rootCause: {
      statement: typeof rootRecord.statement === 'string' ? rootRecord.statement : pathError('rootCause', 'expected statement string'),
      confidence: confidenceField(rootRecord, 'confidence', 'rootCause'),
      evidenceIds: evidenceRefs(rootRecord.evidenceIds, allowedEvidenceIds, 'rootCause.evidenceIds')
    },
    hypotheses: data.hypotheses.map((item, index) => {
      if (typeof item !== 'object' || item === null) {
        pathError('hypothesis', `expected object at hypotheses[${index}]`);
      }
      const record = item as Record<string, unknown>;
      const title = typeof record.title === 'string' ? record.title : pathError('hypothesis', `expected title string at hypotheses[${index}].title`);
      const explanation = typeof record.explanation === 'string' ? record.explanation : pathError('hypothesis', `expected explanation string at hypotheses[${index}].explanation`);
      return {
        title,
        explanation,
        confidence: confidenceField(record, 'confidence', `hypotheses[${index}]`),
        supportingEvidenceIds: evidenceRefs(record.supportingEvidenceIds, allowedEvidenceIds, `hypotheses[${index}].supportingEvidenceIds`),
        contradictingEvidenceIds: evidenceRefs(record.contradictingEvidenceIds, allowedEvidenceIds, `hypotheses[${index}].contradictingEvidenceIds`)
      };
    }),
    evidenceReferences: evidenceRefs(data.evidenceReferences, allowedEvidenceIds, 'evidenceReferences'),
    reasoning: data.reasoning.map((item, index) => {
      if (typeof item !== 'object' || item === null) {
        pathError('reasoning', `expected object at reasoning[${index}]`);
      }
      const record = item as Record<string, unknown>;
      if (record.type !== 'fact' && record.type !== 'inference' && record.type !== 'hypothesis') {
        pathError('reasoning', `expected type fact|inference|hypothesis at reasoning[${index}].type`);
      }
      return {
        statement: typeof record.statement === 'string' ? record.statement : pathError('reasoning', `expected statement string at reasoning[${index}].statement`),
        type: record.type as AIAnalysisResult['reasoning'][number]['type']
      };
    }),
    impactExplanation: stringField(data, 'impactExplanation', 'impactExplanation'),
    predictionRealityExplanation: stringField(data, 'predictionRealityExplanation', 'predictionRealityExplanation'),
    recommendations: data.recommendations.map((item, index) => {
      if (typeof item !== 'object' || item === null) {
        pathError('recommendation', `expected object at recommendations[${index}]`);
      }
      const record = item as Record<string, unknown>;
      const title = typeof record.title === 'string' ? record.title : pathError('recommendation', `expected title string at recommendations[${index}].title`);
      const explanation = typeof record.explanation === 'string' ? record.explanation : pathError('recommendation', `expected explanation string at recommendations[${index}].explanation`);
      const destructiveText = `${title} ${explanation}`;
      const safeValue = typeof record.safe === 'boolean' ? record.safe : false;
      if (safeValue === true && isUnsafeRecommendation(destructiveText)) {
        pathError('recommendation', 'unsafe recommendation cannot be marked safe=true');
      }
      return {
        title,
        explanation,
        priority: typeof record.priority === 'string' ? record.priority : pathError('recommendation', `expected priority string at recommendations[${index}].priority`),
        safe: safeValue,
        supportingEvidenceIds: evidenceRefs(record.supportingEvidenceIds, allowedEvidenceIds, `recommendations[${index}].supportingEvidenceIds`)
      };
    }),
    limitations: data.limitations.map((item, index) => {
      if (typeof item !== 'string') {
        pathError('limitations', `expected string at limitations[${index}]`);
      }
      return item;
    })
  };
}
