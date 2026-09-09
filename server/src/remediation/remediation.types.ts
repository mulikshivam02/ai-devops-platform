export const remediationTypes = ['configuration', 'kubernetes', 'terraform', 'dependency', 'security', 'rollback', 'deployment', 'observability', 'unknown'] as const;
export type RemediationType = (typeof remediationTypes)[number];
export const remediationStatuses = ['proposed', 'analyzed', 'generated', 'validation_failed', 'validated', 'pr_created', 'awaiting_approval', 'approved', 'rejected', 'executing', 'executed', 'verification_failed', 'verified', 'cancelled', 'failed', 'unknown'] as const;
export type RemediationStatus = (typeof remediationStatuses)[number];
export const remediationActionTypes = ['update_kubernetes_manifest', 'update_terraform_variable', 'update_dependency', 'update_configuration', 'restore_previous_value'] as const;
export type RemediationActionType = (typeof remediationActionTypes)[number];
export const prStatuses = ['not_created', 'prepared', 'created', 'unknown'] as const;
export type PRStatus = (typeof prStatuses)[number];
export const verificationStatuses = ['passed', 'failed', 'insufficient_evidence', 'unknown'] as const;
export type VerificationStatus = (typeof verificationStatuses)[number];

export interface RemediationAction { action: RemediationActionType; resource?: string; file?: string; path?: string; variable?: string; package?: string; before?: unknown; after?: unknown; value?: unknown; }
export interface ValidationCheck { name: string; passed: boolean; message: string; }
export interface ValidationResult { schemaValidated: boolean; valid: boolean; checks: ValidationCheck[]; validatedAt: string; }
export interface RollbackPlan { available: boolean; actions: Array<{ action: 'restore_previous_value'; path: string; value: unknown }>; reason?: string; }
export interface RemediationRisk { score: number; level: 'low' | 'medium' | 'high' | 'critical'; factors: Array<{ name: string; contribution: number; reason: string }>; requiresApproval: boolean; }
export interface ApprovalRecord { approved: boolean; approvedBy: string; approvedAt: string; reason: string; metadata: Record<string, unknown>; }
export interface ExecutionResult { mode: 'dry_run'; startedAt: string; completedAt: string; success: boolean; message: string; }
export interface VerificationResult { status: VerificationStatus; beforeState?: unknown; expectedAfterState?: unknown; observedAfterState?: unknown; evidenceIds: string[]; summary: string; verifiedAt: string; }
export interface AuditEvent { event: string; status: RemediationStatus; actor: string; at: string; details?: Record<string, unknown>; }
export interface RemediationDTO { id: string; changeId: string; resourceId: string; affectedResourceIds: string[]; blastRadius: { directCount: number; transitiveCount: number; totalCount: number; maxDependencyDepth: number }; investigationId?: string; securityFindingIds: string[]; predictionId?: string; type: RemediationType; title: string; description: string; reason: string; proposedChanges: RemediationAction[]; validation?: ValidationResult; risk: RemediationRisk; status: RemediationStatus; approval?: ApprovalRecord; execution?: ExecutionResult; verification?: VerificationResult; rollback: RollbackPlan; evidenceIds: string[]; createdBy: string; prStatus: PRStatus; prProposal?: Record<string, unknown>; audit: AuditEvent[]; metadata: Record<string, unknown>; createdAt: string; updatedAt: string; }
export interface CreateRemediationInput { changeId: string; resourceId: string; affectedResourceIds?: string[]; blastRadius?: { directCount: number; transitiveCount: number; totalCount: number; maxDependencyDepth: number }; investigationId?: string; securityFindingIds?: string[]; predictionId?: string; type: RemediationType; title: string; description: string; reason: string; proposedChanges: RemediationAction[]; evidenceIds: string[]; createdBy: string; metadata?: Record<string, unknown>; riskContext?: { environment?: string; affectedResourceCount?: number; dependencyDepth?: number; securitySeverity?: string; rollbackAvailable?: boolean; historicalFailures?: number; }; }
export interface RemediationFilters { status?: RemediationStatus; type?: RemediationType; changeId?: string; resourceId?: string; }