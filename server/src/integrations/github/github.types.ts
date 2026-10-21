export interface GitHubRepositorySummary {
  fullName: string;
  description?: string;
  defaultBranch?: string;
  htmlUrl?: string;
  private?: boolean;
  archived?: boolean;
  pushedAt?: string;
}

export interface GitHubCommitSummary {
  sha: string;
  message: string;
  authorName?: string;
  authorEmail?: string;
  username?: string;
  timestamp: string;
  url?: string;
  repository: string;
  additions?: number;
  deletions?: number;
  changedFiles?: number;
}
