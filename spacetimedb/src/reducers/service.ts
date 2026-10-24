/**
 * Reducers only the Node API service identity may call, reporting results from the outside world (CRS, x402, Base Sepolia) and from mandated agents.
 *
 * Inputs:
 * - recordVerification(subjectType, orgId, memberIdentity?, invoiceId?, products, decision, reasons, identityHash, sandbox)
 * - recordWalletProof(changeId) after the API checks a signed challenge from the requested wallet
 * - recordX402Receipt(agentId, dealId, orgId, endpoint, amount, paymentRef)
 * - recordPayment(invoiceId, idempotencyKey, state, txHash, simulated)
 * - logAgentAction(agentId, dealId, orgId, step, status, detail) / recordFinding(...)
 *
 * Outputs:
 * - verification rows; on a pass the member/org is marked verified and stamped with the attestation hash
 * - A payee check on a MATCHED bill moves it to FINANCE_REVIEW on PASS, or freezes it (VERIFICATION_FAILED on FAIL, VERIFICATION_REVIEW on REVIEW)
 * - x402Receipt rows within mandate and platform spend caps; payment rows; invoice → PAYMENT_QUEUED / SETTLED / FAILED
 * - payout ledger entries, agentAction and agentFinding rows, auditEvent rows
 */

import { SenderError, t } from 'spacetimedb/server';
import spacetimedb from '../schema';
import {
  ChangeState,
  Decision,
  FreezeReason,
  InvoiceState as I,
  MAX_X402_PER_CALL,
  MAX_X402_PER_SESSION,
  PaymentState as P,
  Scope,
} from '../lib/constants';
import { requireMandate, requireService } from '../lib/auth';
import { assertTransition } from '../lib/stateMachines';
import { appendAudit } from '../lib/audit';
import { freezeInvoice } from '../lib/freeze';
import { postPayout } from '../lib/ledger';

export const recordVerification = spacetimedb.reducer(
  {
    subjectType: t.string(),
    orgId: t.u64(),
    memberIdentity: t.option(t.identity()),
    invoiceId: t.option(t.u64()),
    products: t.string(),
    // PASS | REVIEW (signals, not proof) | FAIL
    decision: t.string(),
    reasons: t.string(),
    identityHash: t.string(),
    sandbox: t.bool(),
  },
  (ctx, { decision, ...args }) => {
    requireService(ctx);
    if (decision !== Decision.PASS && decision !== Decision.REVIEW && decision !== Decision.FAIL)
      throw new SenderError('bad decision');
    const passed = decision === Decision.PASS;
    const org = ctx.db.organization.id.find(args.orgId);
    if (!org) throw new SenderError('no such organization');
    if (passed && !/^[0-9a-f]{64}$/.test(args.identityHash))
      throw new SenderError('identityHash must be a 64-char hex SHA-256 computed by the API');
    if (args.subjectType !== 'MEMBER' && args.subjectType !== 'ORG') throw new SenderError('bad subjectType');
    if (args.subjectType === 'MEMBER') {
      const m = args.memberIdentity ? ctx.db.member.identity.find(args.memberIdentity) : null;
      if (!m || m.orgId !== args.orgId) throw new SenderError('member not in that organization');
      if (passed)
        ctx.db.member.identity.update({ ...m, verified: true, verifiedAt: ctx.timestamp, identityHash: args.identityHash });
    }
    const v = ctx.db.verification.insert({
      id: 0n,
      ...args,
      passed,
      decision,
      memberIdentity: args.memberIdentity,
      invoiceId: args.invoiceId,
      checkedAt: ctx.timestamp,
    });
    if (args.subjectType === 'ORG' && passed)
      ctx.db.organization.id.update({ ...org, verified: true, lastVerificationId: v.id, identityHash: args.identityHash });
    appendAudit(ctx, 'recordVerification', 'verification', v.id, `${args.subjectType} ${decision} ${args.reasons}`);

    // Pre-payout check on a bill: only the payee's verification counts.
    if (args.invoiceId !== undefined) {
      const inv = ctx.db.invoice.id.find(args.invoiceId);
      if (!inv) throw new SenderError('no such invoice');
      if (inv.payeeOrgId !== args.orgId) throw new SenderError('verification is not for this bill\'s payee');
      if (inv.state === I.MATCHED) {
        if (passed) {
          assertTransition('invoice', inv.state, I.FINANCE_REVIEW);
          ctx.db.invoice.id.update({ ...inv, state: I.FINANCE_REVIEW });
        } else {
          freezeInvoice(
            ctx,
            inv,
            decision === Decision.REVIEW ? FreezeReason.VERIFICATION_REVIEW : FreezeReason.VERIFICATION_FAILED
          );
        }
      }
    }
  }
);

export const recordWalletProof = spacetimedb.reducer({ changeId: t.u64() }, (ctx, { changeId }) => {
  requireService(ctx);
  const c = ctx.db.beneficiaryChange.id.find(changeId);
  if (!c || c.state !== ChangeState.PENDING) throw new SenderError('no pending change');
  ctx.db.beneficiaryChange.id.update({ ...c, walletProofAt: ctx.timestamp });
  appendAudit(ctx, 'recordWalletProof', 'beneficiary_change', changeId, c.requestedWallet);
});

export const recordX402Receipt = spacetimedb.reducer(
  {
    agentId: t.string(),
    dealId: t.u64(),
    orgId: t.u64(),
    endpoint: t.string(),
    amount: t.u64(),
    paymentRef: t.string(),
  },
  (ctx, { agentId, dealId, orgId, endpoint, amount, paymentRef }) => {
    const m = requireMandate(ctx, { agentId, dealId, orgId, scope: Scope.VERIFY });
    if (ctx.db.x402Receipt.paymentRef.find(paymentRef)) throw new SenderError('duplicate paymentRef (idempotency)');
    if (amount > m.perCallLimit || amount > MAX_X402_PER_CALL) throw new SenderError('over the per-call spend cap');
    if (m.spent + amount > m.sessionLimit || m.spent + amount > MAX_X402_PER_SESSION)
      throw new SenderError('over the session spend cap');
    ctx.db.mandate.id.update({ ...m, spent: m.spent + amount });
    const r = ctx.db.x402Receipt.insert({ id: 0n, agentId, mandateId: m.id, endpoint, amount, paymentRef, at: ctx.timestamp });
    appendAudit(ctx, 'recordX402Receipt', 'x402_receipt', r.id, `${agentId} ${amount} ${endpoint}`);
  }
);

export const recordPayment = spacetimedb.reducer(
  {
    invoiceId: t.u64(),
    idempotencyKey: t.string(),
    state: t.string(),
    txHash: t.string(),
    simulated: t.bool(),
  },
  (ctx, { invoiceId, idempotencyKey, state, txHash, simulated }) => {
    requireService(ctx);
    const inv = ctx.db.invoice.id.find(invoiceId);
    if (!inv) throw new SenderError('no such invoice');
    const existing = ctx.db.payment.idempotencyKey.find(idempotencyKey);

    if (!existing) {
      if (state !== P.CREATED) throw new SenderError('a new payment must start CREATED');
      if (inv.state !== I.APPROVED) throw new SenderError(`cannot pay a bill in ${inv.state}`);
      if ([...ctx.db.payment.invoiceId.filter(invoiceId)].some(p => p.state !== P.FAILED))
        throw new SenderError('this bill already has a live payment');
      const payee = ctx.db.organization.id.find(inv.payeeOrgId)!;
      if (!payee.payoutWallet || inv.beneficiaryWallet !== payee.payoutWallet)
        throw new SenderError('beneficiary wallet does not match the payee\'s verified wallet');
      ctx.db.payment.insert({
        idempotencyKey,
        invoiceId,
        fromOrgId: inv.payerOrgId,
        toOrgId: inv.payeeOrgId,
        toWallet: inv.beneficiaryWallet,
        amount: inv.amount,
        state: P.CREATED,
        txHash: '',
        simulated,
        note: '',
        createdAt: ctx.timestamp,
        updatedAt: ctx.timestamp,
      });
      assertTransition('invoice', inv.state, I.PAYMENT_QUEUED);
      ctx.db.invoice.id.update({ ...inv, state: I.PAYMENT_QUEUED });
      appendAudit(ctx, 'recordPayment', 'invoice', invoiceId, `CREATED ${idempotencyKey}`);
      return;
    }

    if (existing.invoiceId !== invoiceId) throw new SenderError('idempotency key belongs to another bill');
    assertTransition('payment', existing.state, state);
    // A hold (frozen bill) blocks SUBMITTED.
    if (state === P.SUBMITTED && inv.state !== I.PAYMENT_QUEUED) throw new SenderError('bill is on hold');
    if (state === P.CONFIRMED && !txHash) throw new SenderError('a confirmed payment needs a txHash');
    ctx.db.payment.idempotencyKey.update({ ...existing, state, txHash: txHash || existing.txHash, updatedAt: ctx.timestamp });

    if (state === P.CONFIRMED) {
      assertTransition('invoice', inv.state, I.SETTLED);
      ctx.db.invoice.id.update({ ...inv, state: I.SETTLED });
      postPayout(ctx, inv, txHash);
    } else if (state === P.FAILED && inv.state === I.PAYMENT_QUEUED) {
      ctx.db.invoice.id.update({ ...inv, state: I.FAILED });
    }
    appendAudit(ctx, 'recordPayment', 'invoice', invoiceId, `${state} ${txHash}`);
  }
);

export const logAgentAction = spacetimedb.reducer(
  { agentId: t.string(), dealId: t.u64(), orgId: t.u64(), scope: t.string(), step: t.string(), status: t.string(), detail: t.string() },
  (ctx, { agentId, dealId, orgId, scope, step, status, detail }) => {
    requireMandate(ctx, { agentId, dealId, orgId, scope });
    ctx.db.agentAction.insert({ id: 0n, agentId, orgId, dealId, step, status, detail, at: ctx.timestamp });
  }
);

const findingScope: Record<string, string> = {
  EVIDENCE_SUMMARY: Scope.SUMMARIZE,
  RISK_CASE: Scope.RISK_REVIEW,
};

export const recordFinding = spacetimedb.reducer(
  {
    kind: t.string(),
    subjectType: t.string(),
    subjectId: t.u64(),
    agentId: t.string(),
    dealId: t.u64(),
    orgId: t.u64(),
    result: t.string(),
    body: t.string(),
    flags: t.string(),
    modelId: t.string(),
    inputIds: t.string(),
  },
  (ctx, args) => {
    const scope = findingScope[args.kind];
    if (!scope) throw new SenderError(`bad finding kind ${args.kind}`);
    requireMandate(ctx, { agentId: args.agentId, dealId: args.dealId, orgId: args.orgId, scope });
    const { dealId: _d, ...row } = args;
    const f = ctx.db.agentFinding.insert({ id: 0n, ...row, at: ctx.timestamp });
    appendAudit(ctx, 'recordFinding', args.subjectType, args.subjectId, `${args.kind} by ${args.agentId} (finding ${f.id})`);
  }
);
