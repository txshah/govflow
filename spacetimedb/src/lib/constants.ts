/**
 * Shared string constants for org kinds, member roles, every state machine's states, and agent mandate scopes.
 *
 * Inputs:
 * - None
 *
 * Outputs:
 * - Constants imported by tables, reducers, helpers and tests so no state name is ever mistyped
 */

export const OrgKind = { AGENCY: 'AGENCY', PRIME: 'PRIME', SUB: 'SUB' } as const;

// REVIEWER accepts the payee's work (agency PM, prime inspector).
// APPROVER is a finance approver (agency finance, prime AP controller).
// PREPARER submits evidence and bills (prime AP specialist, sub owner).
export const Role = { REVIEWER: 'REVIEWER', APPROVER: 'APPROVER', PREPARER: 'PREPARER' } as const;

// OBSERVER is read-only: sees every view (the demo's flow screen) but can never call a reducer that writes.
export const AdminRole = { OWNER: 'OWNER', SERVICE: 'SERVICE', OBSERVER: 'OBSERVER' } as const;

export const ContractKind = { PRIME_CONTRACT: 'PRIME_CONTRACT', SUBCONTRACT: 'SUBCONTRACT' } as const;
export const InvoiceKind = { PAY_APPLICATION: 'PAY_APPLICATION', SUB_INVOICE: 'SUB_INVOICE' } as const;

export const DealState = {
  DRAFT: 'DRAFT',
  AWAITING_SIGNATURES: 'AWAITING_SIGNATURES',
  ACTIVE: 'ACTIVE',
  CLOSED: 'CLOSED',
} as const;

export const MilestoneState = {
  NOT_STARTED: 'NOT_STARTED',
  IN_PROGRESS: 'IN_PROGRESS',
  SUBMITTED_FOR_INSPECTION: 'SUBMITTED_FOR_INSPECTION',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
} as const;

export const InvoiceState = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  MATCHED: 'MATCHED',
  FINANCE_REVIEW: 'FINANCE_REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  PAYMENT_QUEUED: 'PAYMENT_QUEUED',
  SETTLED: 'SETTLED',
  FAILED: 'FAILED',
  PAYMENT_FROZEN: 'PAYMENT_FROZEN',
} as const;

export const PaymentState = {
  CREATED: 'CREATED',
  POLICY_CHECKED: 'POLICY_CHECKED',
  AUTHORIZED: 'AUTHORIZED',
  SUBMITTED: 'SUBMITTED',
  CONFIRMED: 'CONFIRMED',
  FAILED: 'FAILED',
} as const;

export const MatchResult = { MATCHED: 'MATCHED', MISMATCH: 'MISMATCH', UNSURE: 'UNSURE' } as const;

export const FreezeReason = {
  BENEFICIARY_CHANGED: 'BENEFICIARY_CHANGED',
  MISMATCH: 'MISMATCH',
  OVERBILLED: 'OVERBILLED',
  WALLET_MISMATCH: 'WALLET_MISMATCH',
  VERIFICATION_FAILED: 'VERIFICATION_FAILED',
  // CRS signals (thin file, new entity, fraud alert…), not proof: two approvers can release after review.
  VERIFICATION_REVIEW: 'VERIFICATION_REVIEW',
  // The payee passed CRS, but as a different person than at award: two approvers must accept the change, with a reason.
  IDENTITY_CHANGED: 'IDENTITY_CHANGED',
} as const;

export const Decision = { PASS: 'PASS', REVIEW: 'REVIEW', FAIL: 'FAIL' } as const;

export const ChangeState = { PENDING: 'PENDING', ACCEPTED: 'ACCEPTED', REJECTED: 'REJECTED' } as const;

// Votes an approver can cast. PAYMENT votes approve a bill; the rest unfreeze one.
export const Vote = {
  APPROVE: 'APPROVE',
  ACCEPT_CHANGE: 'ACCEPT_CHANGE',
  REJECT_CHANGE: 'REJECT_CHANGE',
  RELEASE: 'RELEASE',
} as const;

export const ApprovalKind = { PAYMENT: 'PAYMENT', UNFREEZE: 'UNFREEZE' } as const;

export const Scope = {
  SUMMARIZE: 'summarize',
  DRAFT_INVOICE: 'draft_invoice',
  MATCH: 'match',
  VERIFY: 'verify',
  RISK_REVIEW: 'risk_review',
} as const;

export const REQUIRED_APPROVALS = 2;

// Hard caps from PROJECT.md §13, in micro-USDC (6 decimals).
export const MAX_X402_PER_CALL = 10_000n; // 0.01 USDC
export const MAX_X402_PER_SESSION = 100_000n; // 0.10 USDC
