/**
 * `createDeal`, `signDeal` and `signMandate`: a verified signer of the paying org creates the contract and deal, and it goes ACTIVE only when both orgs have signed and mandated their agents.
 *
 * Inputs:
 * - createDeal(kind, payeeOrgId, parentContractId?, title, lines[]) from the payer's verified signer
 * - signDeal(dealId) / signMandate(dealId, agentId, scope, perCallLimit, sessionLimit, expiresAt) from each party's verified signer
 *
 * Outputs:
 * - contract, milestone (one per line), deal, dealSignature, mandate rows
 * - deal state DRAFT → AWAITING_SIGNATURES → ACTIVE; auditEvent rows
 */

import { SenderError, t } from 'spacetimedb/server';
import spacetimedb from '../schema';
import {
  ContractKind,
  DealState,
  MAX_X402_PER_CALL,
  MAX_X402_PER_SESSION,
  MilestoneState,
  OrgKind,
  Scope,
} from '../lib/constants';
import { requireMember } from '../lib/auth';
import { assertTransition } from '../lib/stateMachines';
import { appendAudit } from '../lib/audit';
import type { Ctx } from '../lib/ctx';

const MilestoneLine = t.object('MilestoneLine', {
  description: t.string(),
  scheduledValue: t.u64(),
});

function partiesOf(ctx: Ctx, dealId: bigint) {
  const d = ctx.db.deal.id.find(dealId);
  if (!d) throw new SenderError('no such deal');
  const c = ctx.db.contract.id.find(d.contractId);
  if (!c) throw new SenderError('deal has no contract');
  return { d, c, parties: [c.payerOrgId, c.payeeOrgId] };
}

function tryActivate(ctx: Ctx, dealId: bigint) {
  const { d, parties } = partiesOf(ctx, dealId);
  if (d.state !== DealState.AWAITING_SIGNATURES) return;
  const sigs = [...ctx.db.dealSignature.dealId.filter(dealId)];
  const mandates = [...ctx.db.mandate.dealId.filter(dealId)].filter(m => !m.revoked);
  const ready = parties.every(
    org => sigs.some(s => s.orgId === org) && mandates.some(m => m.orgId === org)
  );
  if (!ready) return;
  assertTransition('deal', d.state, DealState.ACTIVE);
  ctx.db.deal.id.update({ ...d, state: DealState.ACTIVE, activatedAt: ctx.timestamp });
  appendAudit(ctx, 'dealActivated', 'deal', dealId);
}

export const createDeal = spacetimedb.reducer(
  {
    kind: t.string(),
    payeeOrgId: t.u64(),
    parentContractId: t.option(t.u64()),
    title: t.string(),
    lines: t.array(MilestoneLine),
  },
  (ctx, { kind, payeeOrgId, parentContractId, title, lines }) => {
    const signer = requireMember(ctx, { verified: true, signer: true });
    const payer = ctx.db.organization.id.find(signer.orgId);
    const payee = ctx.db.organization.id.find(payeeOrgId);
    if (!payer || !payee) throw new SenderError('no such organization');
    if (lines.length === 0) throw new SenderError('a contract needs at least one line');
    const totalValue = lines.reduce((s, l) => s + l.scheduledValue, 0n);

    if (kind === ContractKind.PRIME_CONTRACT) {
      if (payer.kind !== OrgKind.AGENCY || payee.kind !== OrgKind.PRIME)
        throw new SenderError('a prime contract is agency → prime');
      if (parentContractId !== undefined) throw new SenderError('a prime contract has no parent');
    } else if (kind === ContractKind.SUBCONTRACT) {
      if (payer.kind !== OrgKind.PRIME || payee.kind !== OrgKind.SUB)
        throw new SenderError('a subcontract is prime → sub');
      const parent = parentContractId === undefined ? null : ctx.db.contract.id.find(parentContractId);
      if (!parent || parent.kind !== ContractKind.PRIME_CONTRACT || parent.payeeOrgId !== payer.id)
        throw new SenderError("a subcontract must link to the prime's own prime contract");
      const existing = [...ctx.db.contract.payerOrgId.filter(payer.id)]
        .filter(c => c.parentContractId === parent.id)
        .reduce((s, c) => s + c.totalValue, 0n);
      if (existing + totalValue > parent.totalValue)
        throw new SenderError('subcontracts would exceed the prime contract value');
    } else {
      throw new SenderError(`bad contract kind ${kind}`);
    }

    const c = ctx.db.contract.insert({
      id: 0n,
      kind,
      payerOrgId: payer.id,
      payeeOrgId,
      parentContractId,
      title,
      totalValue,
      createdAt: ctx.timestamp,
    });
    lines.forEach((l, i) =>
      ctx.db.milestone.insert({
        id: 0n,
        contractId: c.id,
        lineNo: i + 1,
        description: l.description,
        scheduledValue: l.scheduledValue,
        state: MilestoneState.NOT_STARTED,
        evidenceRefs: '',
        submittedBy: undefined,
        reviewNote: '',
        reviewedBy: undefined,
        reviewedAt: undefined,
        billedInvoiceId: undefined,
      })
    );
    assertTransition('deal', DealState.DRAFT, DealState.AWAITING_SIGNATURES);
    const d = ctx.db.deal.insert({
      id: 0n,
      contractId: c.id,
      state: DealState.AWAITING_SIGNATURES,
      createdBy: ctx.sender,
      createdAt: ctx.timestamp,
      activatedAt: undefined,
    });
    appendAudit(ctx, 'createDeal', 'deal', d.id, `${kind} "${title}" ${totalValue}`);
  }
);

export const signDeal = spacetimedb.reducer({ dealId: t.u64() }, (ctx, { dealId }) => {
  const signer = requireMember(ctx, { verified: true, signer: true });
  const { d, parties } = partiesOf(ctx, dealId);
  if (d.state !== DealState.AWAITING_SIGNATURES) throw new SenderError('deal is not awaiting signatures');
  if (!parties.includes(signer.orgId)) throw new SenderError('unauthorized: not a party to this deal');
  if ([...ctx.db.dealSignature.dealId.filter(dealId)].some(s => s.orgId === signer.orgId))
    throw new SenderError('your organization already signed');
  ctx.db.dealSignature.insert({ id: 0n, dealId, orgId: signer.orgId, signer: ctx.sender, signedAt: ctx.timestamp });
  appendAudit(ctx, 'signDeal', 'deal', dealId);
  tryActivate(ctx, dealId);
});

export const signMandate = spacetimedb.reducer(
  {
    dealId: t.u64(),
    agentId: t.string(),
    scope: t.string(),
    perCallLimit: t.u64(),
    sessionLimit: t.u64(),
    expiresAt: t.timestamp(),
  },
  (ctx, args) => {
    const signer = requireMember(ctx, { verified: true, signer: true });
    const { d, parties } = partiesOf(ctx, args.dealId);
    if (!parties.includes(signer.orgId)) throw new SenderError('unauthorized: not a party to this deal');
    if (d.state === DealState.CLOSED) throw new SenderError('deal is closed');
    const allowed = Object.values(Scope) as string[];
    const bad = args.scope.split(',').map(s => s.trim()).filter(s => !allowed.includes(s));
    if (bad.length) throw new SenderError(`unknown scope ${bad.join(', ')}`);
    if (args.perCallLimit > MAX_X402_PER_CALL || args.sessionLimit > MAX_X402_PER_SESSION)
      throw new SenderError('mandate limits exceed the platform caps');
    if (args.expiresAt.microsSinceUnixEpoch <= ctx.timestamp.microsSinceUnixEpoch)
      throw new SenderError('mandate already expired');
    const m = ctx.db.mandate.insert({
      id: 0n,
      ...args,
      orgId: signer.orgId,
      spent: 0n,
      signedBy: ctx.sender,
      signedAt: ctx.timestamp,
      revoked: false,
    });
    appendAudit(ctx, 'signMandate', 'mandate', m.id, `${args.agentId}: ${args.scope}`);
    tryActivate(ctx, args.dealId);
  }
);

export const revokeMandate = spacetimedb.reducer({ mandateId: t.u64() }, (ctx, { mandateId }) => {
  const m = ctx.db.mandate.id.find(mandateId);
  if (!m) throw new SenderError('no such mandate');
  requireMember(ctx, { orgId: m.orgId, verified: true, signer: true });
  ctx.db.mandate.id.update({ ...m, revoked: true });
  appendAudit(ctx, 'revokeMandate', 'mandate', mandateId);
});
