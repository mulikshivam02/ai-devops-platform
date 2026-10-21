import type { AIAnalysisResult, ReasoningItemType } from './types.js';

import { AppError } from '../utils/app-error.js';

/**
 * Limits on what we store from a model response. Without them an unbounded answer goes straight
 * into MongoDB. Over-long strings are truncated and over-long arrays trimmed, with a note in
 * `limitations`, rather than rejecting an otherwise usable analysis.
 */
export const aiResponseLimits = {
  summary: 2000,
  explanation: 4000,
  title: 500,
  shortText: 1000,
  maxItems: 20,
  maxEvidenceIds: 40,
  maxWarnings: 10
} as const;

/**
 * Words that make a recommendation something other than "safe to just do". `apply`, `deploy` and
 * `scale` used to be here too, but they appear in benign prose ("apply the principle", "scale of
 * impact") and flipped harmless advice to unsafe; the command pattern below catches the cases
 * that matter.
 */
const destructiveAction = /\b(delete|destroy|drop|wipe|terminate|execute|rollback|restart)\b/i;

const command = /\b(kubectl|terraform|docker|helm|shell|sudo)\b|\brm\s+-/i;

export function isUnsafeRecommendation(text: string): boolean {
  return command.test(text) || destructiveAction.test(text);
}

function pathError(path: string, detail: string): never {
  throw new AppError(502, `AI ${path} is invalid: ${detail}.`, 'AI_INVALID_RESPONSE');
}

/** Collects non-fatal problems so one bad field does not discard an otherwise good analysis. */
class Warnings {
  private readonly messages: string[] = [];
  private overflow = 0;

  add(message: string): void {
    if (this.messages.length < aiResponseLimits.maxWarnings) this.messages.push(message);
    else this.overflow += 1;
  }

  toLimitations(): string[] {
    if (this.overflow === 0) return [...this.messages];

    return [...this.messages, `${this.overflow} further response-validation warning(s) omitted.`];
  }
}

function clip(text: string, max: number, path: string, warnings: Warnings): string {
  if (text.length <= max) return text;

  warnings.add(`${path} was truncated from ${text.length} to ${max} characters.`);

  return text.slice(0, max);
}

function stringField(
  source: Record<string, unknown>,
  key: string,
  path: string,
  max: number,
  warnings: Warnings
): string {
  const value = source[key];

  if (typeof value !== 'string' || value.trim().length === 0) {
    pathError(path, `expected non-empty string at ${key}`);
  }

  return clip(value, max, path, warnings);
}

function textField(
  source: Record<string, unknown>,
  key: string,
  path: string,
  max: number,
  warnings: Warnings
): string {
  const value = source[key];

  if (typeof value !== 'string') pathError(path, `expected string at ${key}`);

  return clip(value, max, path, warnings);
}

function confidenceField(source: Record<string, unknown>, key: string, path: string): number {
  const value = source[key];

  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 100) {
    pathError(path, `expected integer confidence between 0 and 100 at ${key}`);
  }

  return value;
}

function objectItems(
  value: unknown[],
  path: string,
  warnings: Warnings,
  max: number = aiResponseLimits.maxItems
): Array<Record<string, unknown>> {
  if (value.length > max) {
    warnings.add(`${path} had ${value.length} items; only the first ${max} were kept.`);
  }

  return value.slice(0, max).map((item, index) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      pathError(path, `expected object at ${path}[${index}]`);
    }

    return item as Record<string, unknown>;
  });
}

/**
 * Unknown IDs are dropped, not fatal: one hallucinated reference used to throw away a whole
 * analysis. The allow-list still guarantees that nothing we store points at evidence that does not
 * exist; we just stop punishing the model's valid claims for it.
 */
function evidenceRefs(value: unknown, allowedEvidenceIds: Set<string>, path: string, warnings: Warnings): string[] {
  if (!Array.isArray(value)) {
    pathError(path, 'expected array of evidence IDs');
  }

  const ids = value as unknown[];

  const known: string[] = [];

  let dropped = 0;

  for (const id of ids) {
    if (typeof id === 'string' && allowedEvidenceIds.has(id)) known.push(id);
    else dropped += 1;
  }

  if (dropped > 0) {
    warnings.add(`${dropped} unrecognised evidence reference(s) removed from ${path}.`);
  }

  const unique = [...new Set(known)];

  if (unique.length > aiResponseLimits.maxEvidenceIds) {
    warnings.add(
      `${path} had ${unique.length} evidence IDs; only the first ${aiResponseLimits.maxEvidenceIds} were kept.`
    );
  }

  return unique.slice(0, aiResponseLimits.maxEvidenceIds);
}

export function validateAIResult(value: unknown, allowedEvidenceIds: Set<string>): AIAnalysisResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    pathError('response', 'expected object at root');
  }

  const data = value as Record<string, unknown>;

  if (
    !Array.isArray(data.hypotheses) ||
    !Array.isArray(data.reasoning) ||
    !Array.isArray(data.recommendations) ||
    !Array.isArray(data.limitations)
  ) {
    pathError('response', 'expected hypotheses, reasoning, recommendations, and limitations arrays');
  }

  const root = data.rootCause;

  if (typeof root !== 'object' || root === null || Array.isArray(root)) {
    pathError('rootCause', 'expected object');
  }

  const rootRecord = root as Record<string, unknown>;

  const warnings = new Warnings();

  const summary = stringField(data, 'summary', 'summary', aiResponseLimits.summary, warnings);

  const rootCause = {
    statement: textField(rootRecord, 'statement', 'rootCause', aiResponseLimits.explanation, warnings),

    confidence: confidenceField(rootRecord, 'confidence', 'rootCause'),

    evidenceIds: evidenceRefs(rootRecord.evidenceIds, allowedEvidenceIds, 'rootCause.evidenceIds', warnings)
  };

  const hypotheses = objectItems(data.hypotheses, 'hypotheses', warnings).map((record, index) => ({
    title: textField(record, 'title', `hypotheses[${index}]`, aiResponseLimits.title, warnings),

    explanation: textField(record, 'explanation', `hypotheses[${index}]`, aiResponseLimits.explanation, warnings),

    confidence: confidenceField(record, 'confidence', `hypotheses[${index}]`),

    supportingEvidenceIds: evidenceRefs(
      record.supportingEvidenceIds,
      allowedEvidenceIds,
      `hypotheses[${index}].supportingEvidenceIds`,
      warnings
    ),

    contradictingEvidenceIds: evidenceRefs(
      record.contradictingEvidenceIds,
      allowedEvidenceIds,
      `hypotheses[${index}].contradictingEvidenceIds`,
      warnings
    )
  }));

  const evidenceReferences = evidenceRefs(data.evidenceReferences, allowedEvidenceIds, 'evidenceReferences', warnings);

  const reasoning = objectItems(data.reasoning, 'reasoning', warnings).map((record, index) => {
    if (record.type !== 'fact' && record.type !== 'inference' && record.type !== 'hypothesis') {
      pathError('reasoning', `expected type fact|inference|hypothesis at reasoning[${index}].type`);
    }

    const type: ReasoningItemType = record.type;

    return {
      statement: textField(record, 'statement', `reasoning[${index}]`, aiResponseLimits.explanation, warnings),

      type
    };
  });

  const impactExplanation = stringField(
    data,
    'impactExplanation',
    'impactExplanation',
    aiResponseLimits.explanation,
    warnings
  );

  const predictionRealityExplanation = stringField(
    data,
    'predictionRealityExplanation',
    'predictionRealityExplanation',
    aiResponseLimits.explanation,
    warnings
  );

  const recommendations = objectItems(data.recommendations, 'recommendations', warnings).map((record, index) => {
    const path = `recommendations[${index}]`;

    const title = textField(record, 'title', path, aiResponseLimits.title, warnings);

    const explanation = textField(record, 'explanation', path, aiResponseLimits.explanation, warnings);

    const priority = textField(record, 'priority', path, aiResponseLimits.title, warnings);

    const claimedSafe = typeof record.safe === 'boolean' ? record.safe : false;

    // A model that calls a command or destructive action "safe" is wrong, not a reason to discard
    // the analysis: demote the flag and say so. Never the other direction -- unsafe stays unsafe.
    const unsafe = isUnsafeRecommendation(`${title} ${explanation}`);

    if (claimedSafe && unsafe) {
      warnings.add(
        `${path} ("${title.slice(0, 80)}") was marked safe but mentions a command or destructive action; safe was set to false.`
      );
    }

    return {
      title,

      explanation,

      priority,

      safe: claimedSafe && !unsafe,

      supportingEvidenceIds: evidenceRefs(
        record.supportingEvidenceIds,
        allowedEvidenceIds,
        `${path}.supportingEvidenceIds`,
        warnings
      )
    };
  });

  if (data.limitations.length > aiResponseLimits.maxItems) {
    warnings.add(
      `limitations had ${data.limitations.length} items; only the first ${aiResponseLimits.maxItems} were kept.`
    );
  }

  const limitations = data.limitations.slice(0, aiResponseLimits.maxItems).map((item, index) => {
    if (typeof item !== 'string') {
      pathError('limitations', `expected string at limitations[${index}]`);
    }

    return clip(item, aiResponseLimits.shortText, `limitations[${index}]`, warnings);
  });

  return {
    summary,
    rootCause,
    hypotheses,
    evidenceReferences,
    reasoning,
    impactExplanation,
    predictionRealityExplanation,
    recommendations,
    limitations: [...limitations, ...warnings.toLimitations()]
  };
}
