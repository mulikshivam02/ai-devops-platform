import { AppError } from '../../utils/app-error.js';
import { importLokiLogs } from '../loki/loki.service.js';
import { importPrometheusMetrics } from '../prometheus/prometheus.service.js';

export interface ObservabilityImportInput {
  resourceId: string;
  prometheus?: { query: string };
  loki?: { query: string; start?: string; end?: string; limit?: number };
}

export type ObservabilitySource = 'prometheus' | 'loki';

export interface ObservabilityImportResult {
  prometheus?: Awaited<ReturnType<typeof importPrometheusMetrics>>;
  loki?: Awaited<ReturnType<typeof importLokiLogs>>;
  /** Present only when at least one requested source failed while another succeeded. */
  errors?: Partial<Record<ObservabilitySource, { code: string; message: string }>>;
}

/**
 * Imports each requested source independently. With Promise.all, a Prometheus failure rejected
 * the whole call and hid a Loki import that had already been committed, so the caller saw an
 * error and retried work that had in fact succeeded. See review 4.9.
 *
 * - every requested source succeeded: the plain result;
 * - some succeeded, some failed: the successes plus a per-source `errors` entry (HTTP 200,
 *   because data was written and the caller must be able to see it);
 * - every requested source failed: the first failure is rethrown, so the status code is honest.
 */
export async function importObservability(input: ObservabilityImportInput): Promise<ObservabilityImportResult> {
  if (!input.prometheus && !input.loki) throw new AppError(400, 'At least one Prometheus or Loki query is required.');

  const sources: Array<[ObservabilitySource, Promise<unknown>]> = [];
  if (input.prometheus) sources.push(['prometheus', importPrometheusMetrics(input.resourceId, input.prometheus.query)]);
  if (input.loki)
    sources.push([
      'loki',
      importLokiLogs(input.resourceId, input.loki.query, input.loki.start, input.loki.end, input.loki.limit)
    ]);

  const settled = await Promise.allSettled(sources.map(([, promise]) => promise));
  const result: ObservabilityImportResult = {};
  const errors: NonNullable<ObservabilityImportResult['errors']> = {};
  let firstFailure: unknown;

  settled.forEach((outcome, index) => {
    const source = sources[index]?.[0];
    if (!source) return;
    if (outcome.status === 'fulfilled') {
      if (source === 'prometheus') result.prometheus = outcome.value as ObservabilityImportResult['prometheus'];
      else result.loki = outcome.value as ObservabilityImportResult['loki'];
      return;
    }
    firstFailure ??= outcome.reason;
    errors[source] =
      outcome.reason instanceof AppError
        ? { code: outcome.reason.code, message: outcome.reason.message }
        : { code: 'IMPORT_FAILED', message: `${source} import failed.` };
  });

  if (Object.keys(errors).length === 0) return result;
  if (!result.prometheus && !result.loki) throw firstFailure;
  return { ...result, errors };
}
