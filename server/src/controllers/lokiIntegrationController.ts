import type { RequestHandler } from 'express';
import { AppError } from '../utils/app-error.js';
import { assertObjectId, parseQueryString, requiredString } from '../utils/request-validation.js';
import { getLokiHealth, importLokiLogs, queryLokiLogs } from '../integrations/loki/loki.service.js';

export const getLokiHealthController: RequestHandler = async (_request, response) => {
  response.status(200).json({ success: true, data: await getLokiHealth() });
};

export const queryLokiController: RequestHandler = async (request, response) => {
  const query = parseQueryString(request.query.query, 'query');
  const start = parseQueryString(request.query.start, 'start');
  const end = parseQueryString(request.query.end, 'end');
  const limit = parseQueryString(request.query.limit, 'limit');
  response.status(200).json({ success: true, data: await queryLokiLogs(query, start, end, limit) });
};

// POST, like the Prometheus/Kubernetes/GitHub imports: it writes Evidence documents, so it must
// not be reachable by a viewer through the GET minimum. See review 1.5.
export const importLokiController: RequestHandler = async (request, response) => {
  if (typeof request.body !== 'object' || request.body === null || Array.isArray(request.body))
    throw new AppError(400, 'Request body must be a JSON object.', 'INVALID_BODY');
  const body = request.body as Record<string, unknown>;
  const resourceId = assertObjectId(body.resourceId, 'resourceId');
  const query = requiredString(body.query, 'query', 1000);
  const start = typeof body.start === 'string' ? body.start : undefined;
  const end = typeof body.end === 'string' ? body.end : undefined;
  response.status(200).json({
    success: true,
    data: await importLokiLogs(resourceId, query, start, end, body.limit)
  });
};
