/**
 * Bill lifecycle on the payee side and agent matching: `draftInvoice`, `submitInvoice`, `reopenInvoice`, `recordMatch`, `confirmUnsureMatch` and `changeBeneficiary`.
 *
 * Inputs:
 * - draftInvoice(contractId, milestoneIds, amount, memo, agentId) from a payee preparer, or from the service for the payee's mandated agent
 * - submitInvoice(invoiceId) / reopenInvoice(invoiceId) from a payee preparer (a human always submits)
 * - recordMatch(invoiceId, agentId, result, reasons, modelId) from the service for the payer's mandated agent
 * - confirmUnsureMatch(invoiceId, reason) from a payer approver
 * - changeBeneficiary(invoiceId, requestedWallet, source, note) from either party or the service (email intake)
 *
 * Outputs:
 * - invoice state DRAFT → SUBMITTED → MATCHED, or PAYMENT_FROZEN on overbilling, wallet mismatch, MISMATCH or any beneficiary change
 * - milestones marked billed; beneficiaryChange rows; agentFinding rows; auditEvent rows
 */

import { SenderError, t } from 'spacetimedb/server';
import spacetimedb from '../schema';
import {
  ChangeState,
  ContractKind,
  FreezeReason,
  InvoiceKind,
  InvoiceState as I,
  MatchResult,
  MilestoneState,
  Role,
  Scope,
} from '../lib/constants';
import { adminRow, requireActiveDealForContract, requireMandate, requireMember } from '../lib/auth';
import { assertTransition } from '../lib/stateMachines';
import { appendAudit } from '../lib/audit';
import { freezeInvoice } from '../lib/freeze';

export const draftInvoice = spacetimedb.reducer(
  {
    contractId: t.u64(),
    milestoneIds: t.array(t.u64()),
    amount: t.u64(),
    memo: t.string(),
    agentId: t.string(),
  },
  (ctx, { contractId, milestoneIds, amount, memo, agentId }) => {
    const c = ctx.db.contract.id.find(contractId);
    if (!c) throw new SenderError('no such contract');
    const d = requireActiveDealForContract(ctx, contractId);
    if (agentId) {
      requireMandate(ctx, { agentId, dealId: d.id, orgId: c.payeeOrgId, scope: Scope.DRAFT_INVOICE });
    } else {
      requireMember(ctx, { orgId: c.payeeOrgId, roles: [Role.PREPARER], verified: true });
    }
    if (milestoneIds.length === 0) throw new SenderError('a bill must cover at least one milestone');
    if (amount === 0n) throw new SenderError('amount must be positive');
    const payee = ctx.db.organization.id.find(c.payeeOrgId)!;
    const inv = ctx.db.invoice.insert({
      id: 0n,
      kind: c.kind === ContractKind.PRIME_CONTRACT ? InvoiceKind.PAY_APPLICATION : InvoiceKind.SUB_INVOICE,
      contractId,
      payerOrgId: c.payerOrgId,
      payeeOrgId: c.payeeOrgId,
      milestoneIds,
      amount,
      beneficiaryWallet: payee.payoutWallet,
      state: I.DRAFT,
      memo,
      matchResult: '',
      matchReasons: '',
      freezeReason: '',
      draftedByAgent: agentId,
      submittedBy: undefined,
      approvalRound: 0,
      createdAt: ctx.timestamp,
      submittedAt: undefined,
      frozenAt: undefined,
    });
    appendAudit(ctx, 'draftInvoice', 'invoice', inv.id, agentId ? `drafted by ${agentId}` : '');
  }
);

export const submitInvoice = spacetimedb.reducer({ invoiceId: t.u64() }, (ctx, { invoiceId }) => {
  const inv = ctx.db.invoice.id.find(invoiceId);
  if (!inv) throw new SenderError('no such invoice');
  requireActiveDealForContract(ctx, inv.contractId);
  requireMember(ctx, { orgId: inv.payeeOrgId, roles: [Role.PREPARER], verified: true });
  assertTransition('invoice', inv.state, I.SUBMITTED);

  // Structural rules: hard rejections.
  let scheduled = 0n;
  for (const id of inv.milestoneIds) {
    const ms = ctx.db.milestone.id.find(id);
    if (!ms || ms.contractId !== inv.contractId) throw new SenderError(`milestone ${id} is not on this contract`);
    if (ms.state !== MilestoneState.ACCEPTED) throw new SenderError(`milestone ${id} has not been accepted`);
    if (ms.billedInvoiceId !== undefined && ms.billedInvoiceId !== inv.id)
      throw new SenderError(`milestone ${id} was already billed`);
    scheduled += ms.scheduledValue;
  }
  if (new Set(inv.milestoneIds.map(String)).size !== inv.milestoneIds.length)
    throw new SenderError('duplicate milestone on bill');
  for (const id of inv.milestoneIds) {
    const ms = ctx.db.milestone.id.find(id)!;
    ctx.db.milestone.id.update({ ...ms, billedInvoiceId: inv.id });
  }

  const payee = ctx.db.organization.id.find(inv.payeeOrgId)!;
  const submitted = {
    ...inv,
    state: I.SUBMITTED,
    submittedBy: ctx.sender,
    submittedAt: ctx.timestamp,
    beneficiaryWallet: inv.beneficiaryWallet || payee.payoutWallet,
  };
  ctx.db.invoice.id.update(submitted);
  appendAudit(ctx, 'submitInvoice', 'invoice', inv.id);

  // Deterministic policy: freezes, so the bill is kept and the case is visible.
  if (inv.amount > scheduled) {
    freezeInvoice(ctx, submitted, FreezeReason.OVERBILLED);
  } else if (!payee.payoutWallet || submitted.beneficiaryWallet !== payee.payoutWallet) {
    freezeInvoice(ctx, submitted, FreezeReason.WALLET_MISMATCH);
  }
});

export const reopenInvoice = spacetimedb.reducer({ invoiceId: t.u64() }, (ctx, { invoiceId }) => {
  const inv = ctx.db.invoice.id.find(invoiceId);
  if (!inv) throw new SenderError('no such invoice');
  requireMember(ctx, { orgId: inv.payeeOrgId, roles: [Role.PREPARER], verified: true });
  assertTransition('invoice', inv.state, I.DRAFT);
  ctx.db.invoice.id.update({ ...inv, state: I.DRAFT, matchResult: '', matchReasons: '', freezeReason: '' });
  appendAudit(ctx, 'reopenInvoice', 'invoice', invoiceId);
});

export const recordMatch = spacetimedb.reducer(
  { invoiceId: t.u64(), agentId: t.string(), result: t.string(), reasons: t.string(), modelId: t.string() },
  (ctx, { invoiceId, agentId, result, reasons, modelId }) => {
    const inv = ctx.db.invoice.id.find(invoiceId);
    if (!inv) throw new SenderError('no such invoice');
    const d = requireActiveDealForContract(ctx, inv.contractId);
    const m = requireMandate(ctx, { agentId, dealId: d.id, orgId: inv.payerOrgId, scope: Scope.MATCH });
    if (!Object.values(MatchResult).includes(result as never)) throw new SenderError(`bad match result ${result}`);
    if (inv.state !== I.SUBMITTED) throw new SenderError(`cannot match a bill in ${inv.state}`);

    ctx.db.agentFinding.insert({
      id: 0n,
      kind: 'MATCH',
      subjectType: 'invoice',
      subjectId: invoiceId,
      agentId,
      orgId: m.orgId,
      result,
      body: reasons,
      flags: '',
      modelId,
      inputIds: `invoice:${invoiceId},contract:${inv.contractId}`,
      at: ctx.timestamp,
    });
    const updated = { ...inv, matchResult: result, matchReasons: reasons };
    if (result === MatchResult.MATCHED) {
      assertTransition('invoice', inv.state, I.MATCHED);
      ctx.db.invoice.id.update({ ...updated, state: I.MATCHED });
    } else if (result === MatchResult.MISMATCH) {
      ctx.db.invoice.id.update(updated);
      freezeInvoice(ctx, updated, FreezeReason.MISMATCH);
    } else {
      // UNSURE stays SUBMITTED until a human decides.
      ctx.db.invoice.id.update(updated);
    }
    appendAudit(ctx, 'recordMatch', 'invoice', invoiceId, `${agentId}: ${result}`);
  }
);

export const confirmUnsureMatch = spacetimedb.reducer(
  { invoiceId: t.u64(), reason: t.string() },
  (ctx, { invoiceId, reason }) => {
    const inv = ctx.db.invoice.id.find(invoiceId);
    if (!inv) throw new SenderError('no such invoice');
    requireMember(ctx, { orgId: inv.payerOrgId, roles: [Role.APPROVER], verified: true });
    if (inv.state !== I.SUBMITTED || inv.matchResult !== MatchResult.UNSURE)
      throw new SenderError('only an UNSURE match can be confirmed by a person');
    if (!reason.trim()) throw new SenderError('a reason is required');
    assertTransition('invoice', inv.state, I.MATCHED);
    ctx.db.invoice.id.update({ ...inv, state: I.MATCHED, matchReasons: `${inv.matchReasons}\nHuman: ${reason}` });
    appendAudit(ctx, 'confirmUnsureMatch', 'invoice', invoiceId, reason);
  }
);

// Always freezes. No email, call, or in-app request can move money to a new wallet by itself.
export const changeBeneficiary = spacetimedb.reducer(
  { invoiceId: t.u64(), requestedWallet: t.string(), source: t.string(), note: t.string() },
  (ctx, { invoiceId, requestedWallet, source, note }) => {
    const inv = ctx.db.invoice.id.find(invoiceId);
    if (!inv) throw new SenderError('no such invoice');
    const a = adminRow(ctx);
    if (a && a.role === 'OBSERVER') throw new SenderError('unauthorized: observers are read-only');
    if (!a) {
      const m = requireMember(ctx);
      if (m.orgId !== inv.payerOrgId && m.orgId !== inv.payeeOrgId)
        throw new SenderError('unauthorized: not a party to this bill');
    }
    if (!['EMAIL', 'IN_APP', 'PHONE'].includes(source)) throw new SenderError(`bad source ${source}`);
    const c = ctx.db.beneficiaryChange.insert({
      id: 0n,
      invoiceId,
      payeeOrgId: inv.payeeOrgId,
      previousWallet: inv.beneficiaryWallet,
      requestedWallet,
      source,
      reportedBy: ctx.sender,
      note,
      state: ChangeState.PENDING,
      requestedAt: ctx.timestamp,
      walletProofAt: undefined,
      resolvedAt: undefined,
    });
    appendAudit(ctx, 'changeBeneficiary', 'invoice', invoiceId, `${source} → ${requestedWallet} (change ${c.id})`);
    freezeInvoice(ctx, inv, FreezeReason.BENEFICIARY_CHANGED);
  }
);
