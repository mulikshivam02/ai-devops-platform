import type { RequestHandler } from 'express';
import { AppError } from '../utils/app-error.js';
import { assertObjectId, parseQueryString } from '../utils/request-validation.js';
import {
  importKubernetesWorkloads,
  getKubernetesHealth,
  listKubernetesNamespaces,
  listKubernetesWorkloads,
  validateKubernetesKind,
  validateKubernetesNamespace,
  validateKubernetesLimit
} from '../integrations/kubernetes/kubernetes.service.js';

function queryValue(query: Record<string, unknown>, field: string): unknown {
  return parseQueryString(query[field], field);
}

export const getKubernetesHealthController: RequestHandler = async (_request, response) => {
  response.status(200).json({ success: true, data: await getKubernetesHealth() });
};

export const listKubernetesNamespacesController: RequestHandler = async (_request, response) => {
  response.status(200).json({ success: true, data: await listKubernetesNamespaces() });
};

export const listKubernetesWorkloadsController: RequestHandler = async (request, response) => {
  const query = request.query as Record<string, unknown>;
  const namespace = validateKubernetesNamespace(queryValue(query, 'namespace'));
  const kind = validateKubernetesKind(queryValue(query, 'kind'));
  const limit = validateKubernetesLimit(queryValue(query, 'limit'));
  response.status(200).json({ success: true, data: await listKubernetesWorkloads(namespace, kind, limit) });
};

export const importKubernetesWorkloadsController: RequestHandler = async (request, response) => {
  if (typeof request.body !== 'object' || request.body === null || Array.isArray(request.body))
    throw new AppError(400, 'Request body must be a JSON object.');
  const body = request.body as Record<string, unknown>;
  const resourceId = assertObjectId(body.resourceId, 'resourceId');
  const namespace = validateKubernetesNamespace(body.namespace);
  const kind = validateKubernetesKind(body.kind);
  const result = await importKubernetesWorkloads({
    resourceId,
    ...(namespace ? { namespace } : {}),
    ...(kind ? { kind } : {})
  });
  response.status(200).json({ success: true, data: result });
};
