import mongoose, { Types } from 'mongoose';
import { ChangeModel } from '../../models/Change.js';
import { EvidenceModel } from '../../models/Evidence.js';
import { ResourceModel } from '../../models/Resource.js';
import { createChange } from '../../services/changeService.js';
import { createEvidence } from '../../services/evidenceService.js';
import type { ChangeDTO } from '../../types/change.js';
import { AppError } from '../../utils/app-error.js';
import { getGitHubCommitPage, getGitHubRepositorySummary } from './github.client.js';
import type { GitHubCommitPage } from './github.client.js';
import type { GitHubCommitSummary, GitHubRepositorySummary } from './github.types.js';

const MAX_REPO_LENGTH = 100;

export function validateRepositoryReference(owner: unknown, repo: unknown): { owner: string; repo: string } {
  const ownerValue = typeof owner === 'string' ? owner.trim() : '';
  const repoValue = typeof repo === 'string' ? repo.trim() : '';

  if (!ownerValue || !repoValue) throw new AppError(400, 'owner and repo are required.');
  if (ownerValue.length > MAX_REPO_LENGTH || repoValue.length > MAX_REPO_LENGTH)
    throw new AppError(400, 'owner and repo must be at most 100 characters.');
  if (
    ownerValue.includes('/') ||
    ownerValue.includes('\\') ||
    ownerValue.includes('..') ||
    repoValue.includes('/') ||
    repoValue.includes('\\') ||
    repoValue.includes('..')
  )
    throw new AppError(400, 'GitHub owner and repository must be supplied as a simple owner/repo pair.');
  if (/^[a-zA-Z0-9.-]+$/.test(ownerValue) === false || /^[a-zA-Z0-9._-]+$/.test(repoValue) === false)
    throw new AppError(400, 'GitHub owner and repository contain unsupported characters.');

  return { owner: ownerValue, repo: repoValue };
}

export function validateCommitLimit(limit: unknown): number {
  if (limit === undefined) return 10;
  if (typeof limit !== 'number' && typeof limit !== 'string')
    throw new AppError(400, 'limit must be a number between 1 and 50.');
  const numericLimit = Number(limit);
  if (!Number.isInteger(numericLimit) || numericLimit < 1 || numericLimit > 50)
    throw new AppError(400, 'limit must be between 1 and 50.');
  return numericLimit;
}

export async function getRepositorySummary(owner: string, repo: string): Promise<GitHubRepositorySummary> {
  const { owner: validOwner, repo: validRepo } = validateRepositoryReference(owner, repo);
  return getGitHubRepositorySummary(validOwner, validRepo);
}

const MAX_PAGE = 100;

export interface CommitListOptions {
  ref?: string;
  page?: number;
}

export function validateCommitRef(value: unknown): string | undefined {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string') throw new AppError(400, 'ref must be a string.');
  const ref = value.trim();
  // Branch names, tags and SHAs only. No "..", no leading "-" (option-looking), no whitespace/control characters.
  if (
    ref.length === 0 ||
    ref.length > 255 ||
    ref.includes('..') ||
    ref.startsWith('-') ||
    !/^[A-Za-z0-9._/-]+$/.test(ref)
  )
    throw new AppError(400, 'ref must be a valid branch, tag or commit SHA.');
  return ref;
}

export function validateCommitPage(value: unknown): number | undefined {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'number' && typeof value !== 'string')
    throw new AppError(400, 'page must be a positive integer.');
  const page = Number(value);
  if (!Number.isInteger(page) || page < 1 || page > MAX_PAGE)
    throw new AppError(400, `page must be between 1 and ${MAX_PAGE}.`);
  return page;
}

export async function getRecentCommits(
  owner: string,
  repo: string,
  limit: number,
  options: CommitListOptions = {}
): Promise<GitHubCommitPage> {
  const { owner: validOwner, repo: validRepo } = validateRepositoryReference(owner, repo);
  const ref = validateCommitRef(options.ref);
  const page = validateCommitPage(options.page);
  return getGitHubCommitPage(validOwner, validRepo, validateCommitLimit(limit), {
    ...(ref ? { ref } : {}),
    ...(page ? { page } : {})
  });
}

function getChangeIdentifier(owner: string, repo: string, sha: string): string {
  return `github:${owner}/${repo}:${sha}`;
}

async function ensureResourceExists(resourceId: string): Promise<Types.ObjectId> {
  if (!mongoose.isValidObjectId(resourceId)) throw new AppError(400, 'resourceId must be a valid MongoDB ObjectId.');
  const objectId = new Types.ObjectId(resourceId);
  if (!(await ResourceModel.exists({ _id: objectId }))) throw new AppError(404, 'Resource not found.');
  return objectId;
}

async function ensureEvidenceForCommit(
  resourceId: string,
  commit: GitHubCommitSummary
): Promise<{ id: string; existing: boolean }> {
  const [owner = 'unknown', repo = 'unknown'] = commit.repository.split('/');
  const changeIdentifier = getChangeIdentifier(owner, repo, commit.sha);
  // resourceId added to the lookup: changeIdentifier ('github:owner/repo:sha') is
  // the same string no matter which Resource it's imported into, so without this
  // filter, importing the same repo into a second Resource would find the FIRST
  // resource's evidence and hand it back here -- silently attributing that
  // resource's evidence to the wrong resource. See review 4.2.
  const existingEvidence = await EvidenceModel.findOne({
    resourceId,
    source: 'github',
    evidenceType: 'git',
    correlationId: changeIdentifier
  }).lean();

  if (existingEvidence) {
    const evidenceId = String(existingEvidence._id);
    return { id: evidenceId, existing: true };
  }

  const created = await createEvidence({
    resourceId,
    evidenceType: 'git',
    source: 'github',
    timestamp: commit.timestamp,
    payload: {
      repository: commit.repository,
      sha: commit.sha,
      message: commit.message,
      author: commit.authorName ?? commit.username ?? commit.authorEmail ?? 'unknown',
      url: commit.url ?? `https://github.com/${commit.repository}/commit/${commit.sha}`,
      additions: commit.additions ?? 0,
      deletions: commit.deletions ?? 0,
      changedFiles: commit.changedFiles ?? 0
    },
    metadata: {
      repository: commit.repository,
      sha: commit.sha,
      author: commit.authorName ?? commit.username ?? commit.authorEmail ?? 'unknown',
      url: commit.url ?? `https://github.com/${commit.repository}/commit/${commit.sha}`,
      additions: commit.additions ?? 0,
      deletions: commit.deletions ?? 0,
      changedFiles: commit.changedFiles ?? 0
    },
    correlationId: changeIdentifier
  });

  return { id: created.id, existing: false };
}

async function buildNormalizedChange(resourceId: string, commit: GitHubCommitSummary): Promise<ChangeDTO> {
  const repositorySegments = commit.repository.split('/');
  const owner = repositorySegments[0] ?? 'unknown';
  const repo = repositorySegments[1] ?? 'unknown';
  const changeIdentifier = getChangeIdentifier(owner, repo, commit.sha);
  const author = commit.authorName ?? commit.username ?? commit.authorEmail ?? 'unknown';
  const evidence = await ensureEvidenceForCommit(resourceId, commit);

  return createChange({
    resourceId,
    changeId: changeIdentifier,
    source: 'github',
    author,
    timestamp: commit.timestamp,
    summary: commit.message,
    changeType: 'code',
    status: 'detected',
    metadata: {
      repository: commit.repository,
      github: {
        owner,
        repo,
        sha: commit.sha,
        url: commit.url ?? `https://github.com/${commit.repository}/commit/${commit.sha}`,
        additions: commit.additions ?? 0,
        deletions: commit.deletions ?? 0,
        changedFiles: commit.changedFiles ?? 0
      }
    },
    evidenceIds: [evidence.id]
  });
}

export async function importGitHubCommits(
  owner: string,
  repo: string,
  resourceId: string,
  limit: number,
  options: CommitListOptions = {}
): Promise<{
  repository: string;
  requested: number;
  imported: number;
  alreadyPresent: number;
  /** GitHub has more commits beyond this page; call again with `page` + 1 (or an older `ref`) to continue. */
  hasMore: boolean;
  page: number;
  changes: Array<{ id: string; changeId: string; source: string; summary: string; status: string; existing?: boolean }>;
}> {
  const { owner: validOwner, repo: validRepo } = validateRepositoryReference(owner, repo);
  const normalizedLimit = validateCommitLimit(limit);
  await ensureResourceExists(resourceId);

  const repository = `${validOwner}/${validRepo}`;
  const ref = validateCommitRef(options.ref);
  const page = validateCommitPage(options.page);
  // Incremental import: only ask for commits newer than the latest one already imported for THIS
  // resource AND THIS repository, so a repeat import extends history instead of re-fetching the
  // same newest window forever. Skipped when the caller names a branch or page -- they are walking
  // history deliberately, and a `since` filter would hide exactly what they asked for. The
  // lookup was previously not scoped to the repository, so a resource importing two repos used
  // the OTHER repo's newest timestamp as `since` and silently skipped commits. See review 4.3.
  const useSince = !ref && !page;
  const mostRecent = useSince
    ? await ChangeModel.findOne({ resourceId, source: 'github', 'metadata.repository': repository })
        .sort({ timestamp: -1 })
        .lean()
    : null;
  const commitPage = await getGitHubCommitPage(validOwner, validRepo, normalizedLimit, {
    ...(mostRecent?.timestamp ? { since: new Date(mostRecent.timestamp).toISOString() } : {}),
    ...(ref ? { ref } : {}),
    ...(page ? { page } : {})
  });
  const commits = commitPage.commits;
  const changes: Array<{
    id: string;
    changeId: string;
    source: string;
    summary: string;
    status: string;
    existing?: boolean;
  }> = [];
  let imported = 0;
  let alreadyPresent = 0;

  for (const commit of commits) {
    const changeIdentifier = getChangeIdentifier(validOwner, validRepo, commit.sha);
    // resourceId added here too, for the same reason as ensureEvidenceForCommit
    // above: without it, a second resource importing the same repo would see
    // every commit as "already present" (belonging to the first resource) and
    // import nothing at all. See review 4.2.
    const existingChange = await ChangeModel.findOne({
      resourceId,
      source: 'github',
      changeId: changeIdentifier
    }).lean();

    if (existingChange) {
      const evidence = await EvidenceModel.findOne({
        resourceId,
        source: 'github',
        evidenceType: 'git',
        correlationId: changeIdentifier
      }).lean();
      if (evidence) {
        const evidenceId = String(evidence._id);
        const shouldAdd = !(
          Array.isArray(existingChange.evidenceIds) &&
          existingChange.evidenceIds.some((id) => String(id) === evidenceId)
        );
        if (shouldAdd) {
          await ChangeModel.findByIdAndUpdate(
            existingChange._id,
            { $addToSet: { evidenceIds: evidence._id } },
            { new: true }
          );
        }
      }
      changes.push({
        id: String(existingChange._id),
        changeId: existingChange.changeId,
        source: existingChange.source,
        summary: existingChange.summary,
        status: existingChange.status,
        existing: true
      });
      alreadyPresent += 1;
      continue;
    }

    const change = await buildNormalizedChange(resourceId, commit);
    changes.push({
      id: change.id,
      changeId: change.changeId,
      source: change.source,
      summary: change.summary,
      status: change.status
    });
    imported += 1;
  }

  return {
    repository,
    requested: normalizedLimit,
    imported,
    alreadyPresent,
    hasMore: commitPage.hasNextPage,
    page: page ?? 1,
    changes
  };
}
