import type { RequestHandler } from 'express';
import { AppError } from '../utils/app-error.js';
import { assertObjectId, parseQueryString, requiredString } from '../utils/request-validation.js';
import {
  getPrometheusHealth,
  importPrometheusMetrics,
  queryPrometheusMetrics
} from '../integrations/prometheus/prometheus.service.js';

export const getPrometheusHealthController: RequestHandler = async (_request, response) => {
  response.status(200).json({ success: true, data: await getPrometheusHealth() });
};

export const queryPrometheusController: RequestHandler = async (request, response) => {
  const query = parseQueryString(request.query.query, 'query');
  response.status(200).json({ success: true, data: await queryPrometheusMetrics(query) });
};

// Body, not query string: this is a POST that writes data, and GET-style query
// parameters on a write endpoint invite exactly the "this looks like a read"
// confusion that made the route a GET in the first place. See review 1.5.
export const importPrometheusController: RequestHandler = async (request, response) => {
  if (typeof request.body !== 'object' || request.body === null || Array.isArray(request.body))
    throw new AppError(400, 'Request body must be a JSON object.', 'INVALID_BODY');
  const value = request.body as Record<string, unknown>;
  const query = requiredString(value.query, 'query', 2000);
  const resourceId = assertObjectId(value.resourceId, 'resourceId');
  response.status(200).json({ success: true, data: await importPrometheusMetrics(resourceId, query) });
};
