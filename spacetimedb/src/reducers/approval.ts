/**
 * Decisions that move money, made only by verified finance approvers of the paying org: `approveInvoice`, `rejectInvoice` and `voteUnfreeze`. Two distinct people are required; never the requester, never an agent.
 *
 * Inputs:
 * - approveInvoice(invoiceId, reason) on a bill in FINANCE_REVIEW
 * - rejectInvoice(invoiceId, reason) on any not-yet-approved bill (one approver may stop a payment)
 * - voteUnfreeze(invoiceId, vote, reason) on a PAYMENT_FROZEN bill; vote is ACCEPT_CHANGE | REJECT_CHANGE | RELEASE
 *
 * Outputs:
 * - approval rows (per round; a freeze starts a new round)
 * - invoice → APPROVED (+ approval ledger entries), → REJECTED, or PAYMENT_FROZEN → FINANCE_REVIEW
 * - beneficiaryChange → ACCEPTED (payout wallet replaced) or REJECTED; auditEvent rows
 */

import { SenderError, t } from 'spacetimedb/server';
import spacetimedb from '../schema';
import {
  ApprovalKind,
  ChangeState,
  Decision,
  FreezeReason,
  InvoiceState as I,
  REQUIRED_APPROVALS,
  Role,
  Vote,
} from '../lib/constants';
import { requireMember } from '../lib/auth';
import { assertTransition } from '../lib/stateMachines';
import { appendAudit } from '../lib/audit';
import { postApproval } from '../lib/ledger';
import type { Ctx, InvoiceRow } from '../lib/ctx';

function votesThisRound(ctx: Ctx, invoiceId: bigint, round: number, kind: string) {
  return [...ctx.db.approval.invoiceId.filter(invoiceId)].filter(a => a.round === round && a.kind === kind);
}

function castVote(ctx: Ctx, inv: InvoiceRow, kind: string, vote: string, reason: string) {
  const m = requireMember(ctx, { orgId: inv.payerOrgId, roles: [Role.APPROVER], verified: true });
  if (inv.submittedBy?.isEqual(ctx.sender))
    throw new SenderError('unauthorized: the requester cannot approve their own bill');
  const prior = votesThisRound(ctx, inv.id, inv.approvalRound, kind);
  if (prior.some(a => a.approver.isEqual(ctx.sender)))
    throw new SenderError('you already voted in this round; a second, different approver is required');
  ctx.db.approval.insert({
    id: 0n,
    invoiceId: inv.id,
    round: inv.approvalRound,
    kind,
    approver: ctx.sender,
    approverOrgId: m.orgId,
    vote,
    reason,
    at: ctx.timestamp,
  });
  return [...prior.filter(a => a.vote === vote), { vote }].length;
}

export const approveInvoice = spacetimedb.reducer(
  { invoiceId: t.u64(), reason: t.string() },
  (ctx, { invoiceId, reason }) => {
    const inv = ctx.db.invoice.id.find(invoiceId);
    if (!inv) throw new SenderError('no such invoice');
    if (inv.state !== I.FINANCE_REVIEW) throw new SenderError(`cannot approve a bill in ${inv.state}`);
    const count = castVote(ctx, inv, ApprovalKind.PAYMENT, Vote.APPROVE, reason);
    appendAudit(ctx, 'approveInvoice', 'invoice', invoiceId, `${count}/${REQUIRED_APPROVALS}`);
    if (count >= REQUIRED_APPROVALS) {
      assertTransition('invoice', inv.state, I.APPROVED);
      ctx.db.invoice.id.update({ ...inv, state: I.APPROVED });
      postApproval(ctx, inv);
      appendAudit(ctx, 'invoiceApproved', 'invoice', invoiceId);
    }
  }
);

export const rejectInvoice = spacetimedb.reducer(
  { invoiceId: t.u64(), reason: t.string() },
  (ctx, { invoiceId, reason }) => {
    const inv = ctx.db.invoice.id.find(invoiceId);
    if (!inv) throw new SenderError('no such invoice');
    requireMember(ctx, { orgId: inv.payerOrgId, roles: [Role.APPROVER], verified: true });
    if (!reason.trim()) throw new SenderError('a rejection needs a reason');
    assertTransition('invoice', inv.state, I.REJECTED);
    for (const id of inv.milestoneIds) {
      const ms = ctx.db.milestone.id.find(id);
      if (ms && ms.billedInvoiceId === inv.id) ctx.db.milestone.id.update({ ...ms, billedInvoiceId: undefined });
    }
    for (const c of ctx.db.beneficiaryChange.invoiceId.filter(invoiceId)) {
      if (c.state === ChangeState.PENDING)
        ctx.db.beneficiaryChange.id.update({ ...c, state: ChangeState.REJECTED, resolvedAt: ctx.timestamp });
    }
    ctx.db.invoice.id.update({ ...inv, state: I.REJECTED, approvalRound: inv.approvalRound + 1 });
    appendAudit(ctx, 'rejectInvoice', 'invoice', invoiceId, reason);
  }
);

export const voteUnfreeze = spacetimedb.reducer(
  { invoiceId: t.u64(), vote: t.string(), reason: t.string() },
  (ctx, { invoiceId, vote, reason }) => {
    const inv = ctx.db.invoice.id.find(invoiceId);
    if (!inv) throw new SenderError('no such invoice');
    if (inv.state !== I.PAYMENT_FROZEN) throw new SenderError('bill is not frozen');
    if (!reason.trim()) throw new SenderError('an unfreeze vote needs a reason');

    const change = [...ctx.db.beneficiaryChange.invoiceId.filter(invoiceId)].find(c => c.state === ChangeState.PENDING);
    if (change && vote !== Vote.ACCEPT_CHANGE && vote !== Vote.REJECT_CHANGE)
      throw new SenderError('a pending wallet change must be accepted or rejected');
    if (!change && vote !== Vote.RELEASE) throw new SenderError('no pending wallet change; vote RELEASE or reject the bill');
    if (vote === Vote.ACCEPT_CHANGE && change && change.walletProofAt === undefined)
      throw new SenderError('the new wallet has not been proven by its verified owner');

    // Re-verification: a passing CRS check on the payee after the freeze. A REVIEW hold (signals, not proof)
    // is instead released by the two approvers' votes, as long as nothing has come back FAIL since.
    const frozenAt = inv.frozenAt?.microsSinceUnixEpoch ?? 0n;
    const since = [...ctx.db.verification.orgId.filter(inv.payeeOrgId)].filter(
      v => v.checkedAt.microsSinceUnixEpoch >= frozenAt
    );
    const reverified = since.some(v => v.passed && v.checkedAt.microsSinceUnixEpoch > frozenAt);
    const reviewOnly =
      inv.freezeReason === FreezeReason.VERIFICATION_REVIEW && !change && !since.some(v => v.decision === Decision.FAIL);
    if (!reverified && !reviewOnly) throw new SenderError('the payee must pass CRS re-verification before unfreezing');

    const count = castVote(ctx, inv, ApprovalKind.UNFREEZE, vote, reason);
    appendAudit(ctx, 'voteUnfreeze', 'invoice', invoiceId, `${vote} ${count}/${REQUIRED_APPROVALS}`);
    if (count < REQUIRED_APPROVALS) return;

    let wallet = inv.beneficiaryWallet;
    if (change) {
      const payee = ctx.db.organization.id.find(inv.payeeOrgId)!;
      if (vote === Vote.ACCEPT_CHANGE) {
        wallet = change.requestedWallet;
        ctx.db.organization.id.update({ ...payee, payoutWallet: wallet, walletBoundAt: ctx.timestamp });
      } else {
        wallet = payee.payoutWallet;
      }
      ctx.db.beneficiaryChange.id.update({
        ...change,
        state: vote === Vote.ACCEPT_CHANGE ? ChangeState.ACCEPTED : ChangeState.REJECTED,
        resolvedAt: ctx.timestamp,
      });
    }
    assertTransition('invoice', inv.state, I.FINANCE_REVIEW);
    ctx.db.invoice.id.update({
      ...inv,
      state: I.FINANCE_REVIEW,
      beneficiaryWallet: wallet,
      freezeReason: '',
      approvalRound: inv.approvalRound + 1,
    });
    appendAudit(ctx, 'invoiceUnfrozen', 'invoice', invoiceId, vote);
  }
);
