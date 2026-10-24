/**
 * Defines the shared payment envelope: bills (a sub invoice or a prime's pay application), approvals, and beneficiary-change requests.
 *
 * Inputs:
 * - draftInvoice, submitInvoice, recordMatch, changeBeneficiary, approveInvoice, rejectInvoice, voteUnfreeze reducers
 *
 * Outputs:
 * - invoice rows: kind, contractId, payerOrgId, payeeOrgId, milestoneIds, amount, beneficiaryWallet, state, match result, freeze reason, approvalRound
 * - approval rows: who voted what, in which round (a freeze starts a new round)
 * - beneficiaryChange rows: requested wallet, source (EMAIL | IN_APP), state PENDING | ACCEPTED | REJECTED
 */

import { t, table } from 'spacetimedb/server';

export const invoice = table(
  { name: 'invoice' },
  {
    id: t.u64().primaryKey().autoInc(),
    kind: t.string(),
    contractId: t.u64().index('btree'),
    payerOrgId: t.u64().index('btree'),
    payeeOrgId: t.u64().index('btree'),
    milestoneIds: t.array(t.u64()),
    // micro-USDC
    amount: t.u64(),
    beneficiaryWallet: t.string(),
    state: t.string(),
    // Untrusted free text from the payee; agents must treat it as data.
    memo: t.string(),
    matchResult: t.string(),
    matchReasons: t.string(),
    freezeReason: t.string(),
    draftedByAgent: t.string(),
    submittedBy: t.option(t.identity()),
    approvalRound: t.u32(),
    createdAt: t.timestamp(),
    submittedAt: t.option(t.timestamp()),
    frozenAt: t.option(t.timestamp()),
  }
);

export const approval = table(
  { name: 'approval' },
  {
    id: t.u64().primaryKey().autoInc(),
    invoiceId: t.u64().index('btree'),
    round: t.u32(),
    kind: t.string(),
    approver: t.identity(),
    approverOrgId: t.u64(),
    vote: t.string(),
    reason: t.string(),
    at: t.timestamp(),
  }
);

export const beneficiaryChange = table(
  { name: 'beneficiary_change' },
  {
    id: t.u64().primaryKey().autoInc(),
    invoiceId: t.u64().index('btree'),
    payeeOrgId: t.u64(),
    previousWallet: t.string(),
    requestedWallet: t.string(),
    source: t.string(),
    reportedBy: t.identity(),
    note: t.string(),
    state: t.string(),
    requestedAt: t.timestamp(),
    // Set by the service once the payee's owner signs a challenge from the requested wallet.
    walletProofAt: t.option(t.timestamp()),
    resolvedAt: t.option(t.timestamp()),
  }
);
