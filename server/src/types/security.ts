export const securitySources = ['scanner', 'configuration', 'dependency', 'container', 'terraform', 'kubernetes', 'code', 'ci_cd', 'manual'] as const;
export type SecuritySource = (typeof securitySources)[number];
export const securityCategories = ['vulnerability', 'misconfiguration', 'secret_exposure', 'dependency', 'container', 'iac', 'kubernetes', 'identity', 'network', 'ci_cd', 'configuration', 'unknown'] as const;
export type SecurityCategory = (typeof securityCategories)[number];
export const securitySeverities = ['info', 'low', 'medium', 'high', 'critical', 'unknown'] as const;
export type SecuritySeverity = (typeof securitySeverities)[number];
export const securityStatuses = ['open', 'acknowledged', 'resolved', 'false_positive', 'unknown'] as const;
export type SecurityStatus = (typeof securityStatuses)[number];
export interface SecurityLocation { file?: string; path?: string; line?: number; component?: string; }
export interface SecurityRemediation { available: boolean; summary?: string; safe?: boolean; }
export interface SecurityFinding { id: string; resourceId?: string; changeId?: string; evidenceIds: string[]; source: SecuritySource; category: SecurityCategory; severity: SecuritySeverity; title: string; description: string; ruleId?: string; cve?: string; cwe?: string; package?: string; installedVersion?: string; fixedVersion?: string; location?: SecurityLocation; status: SecurityStatus; confidence: number; remediation: SecurityRemediation; metadata: Record<string, unknown>; fingerprint: string; detectedAt: string; createdAt: string; updatedAt: string; }
export interface CreateSecurityFindingInput { resourceId?: string; changeId?: string; evidenceIds?: string[]; source: SecuritySource; category: SecurityCategory; severity?: SecuritySeverity; title: string; description: string; ruleId?: string; cve?: string; cwe?: string; package?: string; installedVersion?: string; fixedVersion?: string; location?: SecurityLocation; status?: SecurityStatus; confidence?: number; remediation?: SecurityRemediation; metadata?: Record<string, unknown>; detectedAt: string; }
export interface SecurityFindingFilters { severity?: SecuritySeverity; category?: SecurityCategory; status?: SecurityStatus; source?: SecuritySource; resourceId?: string; changeId?: string; }
export interface SecuritySummary { total: number; critical: number; high: number; medium: number; low: number; info: number; open: number; affectedResources: number; categories: Record<string, number>; highestSeverity: SecuritySeverity; riskContribution: number; }