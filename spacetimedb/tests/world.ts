/**
 * Test fixture: builds a fully signed project in an in-memory database — agency, prime and sub with verified people, bound wallets, an ACTIVE prime contract and an ACTIVE linked subcontract — plus helpers to drive bills through the flow.
 *
 * Inputs:
 * - Nothing; each call to makeWorld() returns a fresh, isolated database
 *
 * Outputs:
 * - `w.call(persona, reducer, args)` to act as a persona; `w.h.db` to read rows
 * - Persona auths, org/contract/deal ids, and flow helpers (acceptLine, billToReview, settle)
 */

import { ConnectionId, Timestamp, type Identity } from 'spacetimedb';
import { createModuleTestHarness, TestAuth } from 'spacetimedb/server/test-utils';
import spacetime, * as mod from '../src/index';
import { MAX_X402_PER_CALL, MAX_X402_PER_SESSION, MatchResult, PaymentState } from '../src/lib/constants';

export { mod };

export const USDC = (n: number) => BigInt(Math.round(n * 1_000_000));
const T0 = 1_800_000_000_000_000n; // fixed clock, micros
const DAY = 86_400_000_000n;
export const HASH = 'ab'.repeat(32); // stand-in SHA-256 hex from the API

let nextConn = 1n;
function auth(sub: string) {
  return TestAuth.fromJwtPayload(JSON.stringify({ iss: 'govflow-test', sub }), new ConnectionId(nextConn++));
}

type Auth = ReturnType<typeof auth>;
// Reducer exports are callable as (ctx, args) inside a test transaction.
type Reducer = (ctx: any, args: any) => void;

export function makeWorld() {
  const h = createModuleTestHarness(spacetime, mod as unknown as Record<string, unknown>);
  h.clock.set(new Timestamp(T0));

  const call = (who: Auth, reducer: Reducer, args: Record<string, unknown> = {}) =>
    h.withReducerTx(who, ctx => reducer(ctx, args));
  const identityOf = (who: Auth): Identity => h.withReducerTx(who, ctx => ctx.sender);
  const tick = (micros = 1_000_000n) => h.clock.set(new Timestamp(h.clock.now().microsSinceUnixEpoch + micros));

  // --- admins
  const owner = auth('owner');
  call(owner, mod.init as Reducer);
  const service = auth('node-api');
  call(service, mod.requestServiceRole, { label: 'node-api' });
  const req = [...h.db.serviceRequest.iter()][0]!;
  call(owner, mod.approveServiceRole, { requestId: req.id });

  // --- organizations
  call(service, mod.createOrganization, { kind: 'AGENCY', name: 'City Public Works', treasuryWallet: '0xAGENCY_TREASURY' });
  call(service, mod.createOrganization, { kind: 'PRIME', name: 'Bayline Builders', treasuryWallet: '0xPRIME_TREASURY' });
  call(service, mod.createOrganization, { kind: 'SUB', name: 'Volt Electric', treasuryWallet: '' });
  const orgs = [...h.db.organization.iter()];
  const agency = orgs.find(o => o.kind === 'AGENCY')!.id;
  const prime = orgs.find(o => o.kind === 'PRIME')!.id;
  const sub = orgs.find(o => o.kind === 'SUB')!.id;

  // --- people
  const join = (name: string, orgId: bigint, role: string, isSigner = false, verify = true) => {
    const a = auth(name);
    const code = `invite-${name}-code`;
    call(service, mod.createInvite, { code, orgId, role, displayName: name, isSigner });
    call(a, mod.redeemInvite, { code });
    if (verify) verifyMember(a, orgId);
    return a;
  };
  // true / false mean PASS / FAIL; 'REVIEW' is a signal-only hold.
  const decisionOf = (r: boolean | 'REVIEW') => (r === 'REVIEW' ? 'REVIEW' : r ? 'PASS' : 'FAIL');
  const verifyMember = (a: Auth, orgId: bigint, passed = true) =>
    call(service, mod.recordVerification, {
      subjectType: 'MEMBER', orgId, memberIdentity: identityOf(a), invoiceId: undefined,
      products: 'IDV,OFAC', decision: decisionOf(passed), reasons: passed ? '' : 'name mismatch', identityHash: HASH, sandbox: true,
    });
  const verifyOrg = (orgId: bigint, result: boolean | 'REVIEW' = true, invoiceId?: bigint, identityHash = HASH) => {
    const decision = decisionOf(result);
    call(service, mod.recordVerification, {
      subjectType: 'ORG', orgId, memberIdentity: undefined, invoiceId,
      products: 'BUSINESS,OFAC', decision,
      reasons: decision === 'PASS' ? '' : decision === 'REVIEW' ? 'THIN_FILE' : 'identity mismatch', identityHash, sandbox: true,
    });
    return [...h.db.verification.iter()].at(-1)!.id;
  };

  const p = {
    agencyPM: join('agency-pm', agency, 'REVIEWER', true),
    agencyFin1: join('agency-fin-1', agency, 'APPROVER'),
    agencyFin2: join('agency-fin-2', agency, 'APPROVER'),
    primeAP: join('prime-ap', prime, 'PREPARER', true),
    primeCtrl1: join('prime-ctrl-1', prime, 'APPROVER'),
    primeCtrl2: join('prime-ctrl-2', prime, 'APPROVER'),
    primeInspector: join('prime-inspector', prime, 'REVIEWER'),
    subOwner: join('sub-owner', sub, 'PREPARER', true),
    outsider: auth('outsider'),
  };

  for (const o of [agency, prime, sub]) verifyOrg(o);
  call(service, mod.recordWalletBinding, { orgId: prime, wallet: '0xPRIME_PAYOUT', verificationId: verifyOrg(prime) });
  call(service, mod.recordWalletBinding, { orgId: sub, wallet: '0xSUB_PAYOUT', verificationId: verifyOrg(sub) });

  // --- prime contract (agency → prime) and subcontract (prime → sub)
  const expiresAt = new Timestamp(T0 + 30n * DAY);
  const mandate = (who: Auth, dealId: bigint, agentId: string, scope: string) =>
    call(who, mod.signMandate, {
      dealId, agentId, scope, perCallLimit: MAX_X402_PER_CALL, sessionLimit: MAX_X402_PER_SESSION, expiresAt,
    });

  call(p.agencyPM, mod.createDeal, {
    kind: 'PRIME_CONTRACT', payeeOrgId: prime, parentContractId: undefined, title: 'Bridge rehab',
    lines: [
      { description: 'Demolition', scheduledValue: USDC(100) },
      { description: 'Deck pour', scheduledValue: USDC(200) },
    ],
  });
  const primeContract = [...h.db.contract.iter()].find(c => c.kind === 'PRIME_CONTRACT')!.id;
  const primeDeal = h.db.deal.contractId.find(primeContract)!.id;

  const createSubDeal = () => {
    call(p.primeAP, mod.createDeal, {
      kind: 'SUBCONTRACT', payeeOrgId: sub, parentContractId: primeContract, title: 'Lighting',
      lines: [{ description: 'Conduit + fixtures', scheduledValue: USDC(50) }],
    });
  };

  const activatePrimeDeal = () => {
    call(p.agencyPM, mod.signDeal, { dealId: primeDeal });
    call(p.primeAP, mod.signDeal, { dealId: primeDeal });
    mandate(p.agencyPM, primeDeal, 'agency-agent', 'match,verify,risk_review');
    mandate(p.primeAP, primeDeal, 'prime-agent', 'draft_invoice,summarize');
  };
  activatePrimeDeal();
  createSubDeal();
  const subContract = [...h.db.contract.iter()].find(c => c.kind === 'SUBCONTRACT')!.id;
  const subDeal = h.db.deal.contractId.find(subContract)!.id;
  call(p.primeAP, mod.signDeal, { dealId: subDeal });
  call(p.subOwner, mod.signDeal, { dealId: subDeal });
  mandate(p.primeAP, subDeal, 'prime-agent', 'match,verify,risk_review');
  mandate(p.subOwner, subDeal, 'sub-agent', 'draft_invoice,summarize');

  const levels = {
    gov: { contractId: primeContract, dealId: primeDeal, payer: agency, payee: prime,
      preparer: p.primeAP, reviewer: p.agencyPM, approvers: [p.agencyFin1, p.agencyFin2] as const,
      payerAgent: 'agency-agent', payeeAgent: 'prime-agent' },
    sub: { contractId: subContract, dealId: subDeal, payer: prime, payee: sub,
      preparer: p.subOwner, reviewer: p.primeInspector, approvers: [p.primeCtrl1, p.primeCtrl2] as const,
      payerAgent: 'prime-agent', payeeAgent: 'sub-agent' },
  };
  type Level = (typeof levels)['gov'];

  const lines = (L: Level) => [...h.db.milestone.contractId.filter(L.contractId)].sort((a, b) => a.lineNo - b.lineNo);
  const invoice = (id: bigint) => h.db.invoice.id.find(id)!;
  const lastInvoiceId = () => [...h.db.invoice.iter()].reduce((m, i) => (i.id > m ? i.id : m), 0n);

  const acceptLine = (L: Level, idx = 0) => {
    const ms = lines(L)[idx]!;
    call(L.preparer, mod.submitEvidence, { milestoneId: ms.id, evidenceRefs: `photos/${ms.id}.jpg` });
    call(L.reviewer, mod.inspectMilestone, { milestoneId: ms.id, accept: true, note: 'looks done' });
    return ms;
  };

  // Draft + submit a bill for accepted lines; returns the invoice id.
  const submitBill = (L: Level, milestoneIds: bigint[], amount: bigint, memo = '') => {
    call(L.preparer, mod.draftInvoice, { contractId: L.contractId, milestoneIds, amount, memo, agentId: '' });
    const id = lastInvoiceId();
    call(L.preparer, mod.submitInvoice, { invoiceId: id });
    return id;
  };

  // Accept line idx, bill it at full value, agent matches, payee re-verified → FINANCE_REVIEW.
  const billToReview = (L: Level, idx = 0) => {
    const ms = acceptLine(L, idx);
    const id = submitBill(L, [ms.id], ms.scheduledValue);
    call(service, mod.recordMatch, { invoiceId: id, agentId: L.payerAgent, result: MatchResult.MATCHED, reasons: 'ok', modelId: 'test' });
    verifyOrg(L.payee, true, id);
    return id;
  };

  const approveBoth = (L: Level, id: bigint) => {
    call(L.approvers[0], mod.approveInvoice, { invoiceId: id, reason: 'ok' });
    call(L.approvers[1], mod.approveInvoice, { invoiceId: id, reason: 'ok' });
  };

  const pay = (id: bigint, key: string, states: string[], txHash = '0xTX') => {
    for (const state of states)
      call(service, mod.recordPayment, { invoiceId: id, idempotencyKey: key, state, txHash: state === PaymentState.CONFIRMED ? txHash : '', simulated: true });
  };
  const ALL_STATES = ['CREATED', 'POLICY_CHECKED', 'AUTHORIZED', 'SUBMITTED', 'CONFIRMED'];
  const settle = (L: Level, id: bigint, key = `pay-${id}`) => {
    approveBoth(L, id);
    pay(id, key, ALL_STATES, `0xTX${id}`);
  };

  return {
    h, call, tick, identityOf, auth, owner, service, p, orgs: { agency, prime, sub },
    levels, lines, invoice, lastInvoiceId, acceptLine, submitBill, billToReview, approveBoth, pay, settle,
    verifyOrg, verifyMember, join, ALL_STATES, DAY,
  };
}
