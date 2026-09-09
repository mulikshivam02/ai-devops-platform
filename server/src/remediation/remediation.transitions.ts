import type { RemediationStatus } from './remediation.types.js';
import { AppError } from '../utils/app-error.js';

const transitions: Record<RemediationStatus, readonly RemediationStatus[]> = {
  proposed: ['analyzed', 'cancelled', 'failed'], analyzed: ['generated', 'cancelled', 'failed'], generated: ['validated', 'validation_failed', 'cancelled', 'failed'], validation_failed: ['generated', 'cancelled'], validated: ['pr_created', 'cancelled'], pr_created: ['awaiting_approval', 'cancelled'], awaiting_approval: ['approved', 'rejected', 'cancelled'], approved: ['executing', 'cancelled'], rejected: [], executing: ['executed', 'failed'], executed: ['verified', 'verification_failed'], verification_failed: ['cancelled'], verified: [], cancelled: [], failed: [], unknown: ['proposed']
};
export function canTransition(from: RemediationStatus, to: RemediationStatus): boolean { return transitions[from]?.includes(to) ?? false; }
export function assertTransition(from: RemediationStatus, to: RemediationStatus): void { if (!canTransition(from, to)) throw new AppError(409, `Invalid remediation transition: ${from} -> ${to}.`); }