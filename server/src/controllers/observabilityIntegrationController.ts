import type { RequestHandler } from 'express';
import { AppError } from '../utils/app-error.js';
import { assertObjectId, parseObject, requiredString } from '../utils/request-validation.js';
import { importObservability } from '../integrations/observability/observability.service.js';
import { validateLokiLimit, validateLokiRange } from '../integrations/loki/loki.service.js';
import { validatePrometheusQuery } from '../integrations/prometheus/prometheus.service.js';

export const importObservabilityController: RequestHandler = async (request, response) => {
  const body = parseObject(request.body, 'Request body', true) ?? {};
  const resourceId = assertObjectId(body.resourceId, 'resourceId');
  const prometheusBody = body.prometheus === undefined ? undefined : parseObject(body.prometheus, 'prometheus', true);
  const lokiBody = body.loki === undefined ? undefined : parseObject(body.loki, 'loki', true);
  if (!prometheusBody && !lokiBody) throw new AppError(400, 'At least one Prometheus or Loki query is required.');
  const prometheus = prometheusBody
    ? { query: validatePrometheusQuery(requiredString(prometheusBody.query, 'prometheus.query', 1000)) }
    : undefined;
  let loki: { query: string; start?: string; end?: string; limit?: number } | undefined;
  if (lokiBody) {
    const query = requiredString(lokiBody.query, 'loki.query', 1000);
    const start = typeof lokiBody.start === 'string' ? lokiBody.start : undefined;
    const end = typeof lokiBody.end === 'string' ? lokiBody.end : undefined;
    validateLokiRange(start, end);
    loki = { query, ...(start ? { start } : {}), ...(end ? { end } : {}), limit: validateLokiLimit(lokiBody.limit) };
  }
  response.status(200).json({ success: true, data: await importObservability({ resourceId, prometheus, loki }) });
};
