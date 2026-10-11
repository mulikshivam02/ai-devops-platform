import type { RequestHandler } from 'express';
import { AppError } from '../utils/app-error.js';
import { requiredString, parseQueryString } from '../utils/request-validation.js';
import {
  getRecentCommits,
  getRepositorySummary,
  importGitHubCommits,
  validateCommitLimit,
  validateCommitPage,
  validateCommitRef,
  validateRepositoryReference
} from '../integrations/github/github.service.js';

function parseGitHubQuery(query: Record<string, unknown>): { owner: string; repo: string } {
  const owner = requiredString(parseQueryString(query.owner, 'owner'), 'owner', 100);
  const repo = requiredString(parseQueryString(query.repo, 'repo'), 'repo', 100);
  return validateRepositoryReference(owner, repo);
}

function parseImportBody(body: unknown): {
  owner: string;
  repo: string;
  resourceId: string;
  limit: number;
  ref?: string;
  page?: number;
} {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new AppError(400, 'Request body must be a JSON object.');
  }

  const value = body as Record<string, unknown>;
  const owner = requiredString(value.owner, 'owner', 100);
  const repo = requiredString(value.repo, 'repo', 100);
  const resourceId = requiredString(value.resourceId, 'resourceId', 24);
  const limit = validateCommitLimit(value.limit ?? 10);

  const ref = validateCommitRef(value.ref);
  const page = validateCommitPage(value.page);

  return {
    ...validateRepositoryReference(owner, repo),
    resourceId,
    limit,
    ...(ref ? { ref } : {}),
    ...(page ? { page } : {})
  };
}

export const getGitHubRepositoryController: RequestHandler = async (request, response) => {
  const { owner, repo } = parseGitHubQuery(request.query);
  const data = await getRepositorySummary(owner, repo);
  response.status(200).json({ success: true, data });
};

export const getGitHubCommitsController: RequestHandler = async (request, response) => {
  const { owner, repo } = parseGitHubQuery(request.query);
  const query = request.query as Record<string, unknown>;
  const limit = validateCommitLimit(query.limit ?? 10);
  const ref = validateCommitRef(parseQueryString(query.ref, 'ref'));
  const page = validateCommitPage(parseQueryString(query.page, 'page'));
  const result = await getRecentCommits(owner, repo, limit, { ...(ref ? { ref } : {}), ...(page ? { page } : {}) });
  // `data` stays a bare array (existing clients); paging state travels in `meta`.
  response.status(200).json({ success: true, data: result.commits, meta: { hasMore: result.hasNextPage } });
};

export const importGitHubCommitsController: RequestHandler = async (request, response) => {
  const { owner, repo, resourceId, limit, ref, page } = parseImportBody(request.body);
  const data = await importGitHubCommits(owner, repo, resourceId, limit, {
    ...(ref ? { ref } : {}),
    ...(page ? { page } : {})
  });
  response.status(200).json({ success: true, data });
};
