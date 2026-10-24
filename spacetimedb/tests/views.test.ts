/**
 * Each organization's room is private and the payment envelope is shared only between payer and payee: the agency never sees the subcontract, the sub never sees the prime contract, and outsiders see nothing.
 *
 * Inputs:
 * - The seeded world after one settled pay application (agency → prime) and one settled sub invoice (prime → sub), plus agent activity and comments in each room
 *
 * Outputs:
 * - Assertions on what each persona's `my_*` views return; CRS hash stamped on verified people and orgs
 */

import { describe, expect, it } from 'vitest';
import { makeWorld, mod, HASH } from './world';

function settledWorld() {
  const w = makeWorld();
  const payApp = w.billToReview(w.levels.gov);
  w.settle(w.levels.gov, payApp);
  const subInv = w.billToReview(w.levels.sub);
  w.settle(w.levels.sub, subInv);
  w.call(w.service, mod.logAgentAction, {
    agentId: 'agency-agent', dealId: w.levels.gov.dealId, orgId: w.orgs.agency, scope: 'match', step: 'match', status: 'done', detail: 'agency internal',
  });
  w.call(w.service, mod.logAgentAction, {
    agentId: 'sub-agent', dealId: w.levels.sub.dealId, orgId: w.orgs.sub, scope: 'summarize', step: 'summarize', status: 'done', detail: 'sub internal',
  });
  w.call(w.p.agencyFin1, mod.postComment, { targetType: 'invoice', targetId: payApp, text: 'agency-only note' });
  w.call(w.p.subOwner, mod.postComment, { targetType: 'invoice', targetId: subInv, text: 'sub-only note' });
  return { w, payApp, subInv };
}

type W = ReturnType<typeof makeWorld>;
const view = (w: W, who: Parameters<W['call']>[0], v: (ctx: any, args: any) => any) => v(w.h.viewContext(who), {});

describe('per-organization views', () => {
  it('the agency sees its prime contract and pay application, never the subcontract', () => {
    const { w, payApp, subInv } = settledWorld();
    const who = w.p.agencyFin1;
    expect(view(w, who, mod.myContract).map((c: any) => c.kind)).toEqual(['PRIME_CONTRACT']);
    expect(view(w, who, mod.myInvoice).map((i: any) => i.id)).toEqual([payApp]);
    expect(view(w, who, mod.myPayment).map((p: any) => p.invoiceId)).toEqual([payApp]);
    expect(view(w, who, mod.myMilestone).every((m: any) => m.contractId === w.levels.gov.contractId)).toBe(true);
    expect(view(w, who, mod.myApproval).every((a: any) => a.invoiceId !== subInv)).toBe(true);
    expect(view(w, who, mod.myMember).some((m: any) => m.orgId === w.orgs.sub)).toBe(false);
  });

  it('the sub sees only its subcontract; the prime sees both levels', () => {
    const { w, payApp, subInv } = settledWorld();
    expect(view(w, w.p.subOwner, mod.myContract).map((c: any) => c.kind)).toEqual(['SUBCONTRACT']);
    expect(view(w, w.p.subOwner, mod.myInvoice).map((i: any) => i.id)).toEqual([subInv]);
    expect(view(w, w.p.subOwner, mod.myMember).some((m: any) => m.orgId === w.orgs.agency)).toBe(false);
    const primeInvoices = view(w, w.p.primeCtrl1, mod.myInvoice).map((i: any) => i.id).sort();
    expect(primeInvoices).toEqual([payApp, subInv].sort());
  });

  it('ledger, agent activity and comments stay inside each org’s room', () => {
    const { w } = settledWorld();
    expect(view(w, w.p.agencyFin1, mod.myLedgerEntry).every((e: any) => e.orgId === w.orgs.agency)).toBe(true);
    expect(view(w, w.p.subOwner, mod.myLedgerEntry)).toHaveLength(0);
    expect(view(w, w.p.primeAP, mod.myAgentAction).map((a: any) => a.detail)).toEqual([]);
    expect(view(w, w.p.agencyPM, mod.myAgentAction).map((a: any) => a.detail)).toEqual(['agency internal']);
    expect(view(w, w.p.agencyPM, mod.myRoomComment).map((c: any) => c.text)).toEqual(['agency-only note']);
    expect(view(w, w.p.subOwner, mod.myRoomComment).map((c: any) => c.text)).toEqual(['sub-only note']);
    expect(view(w, w.p.primeAP, mod.myAgentFinding).every((f: any) => f.orgId === w.orgs.prime)).toBe(true);
  });

  it('the audit log hides the other level’s events', () => {
    const { w, subInv } = settledWorld();
    const agencyAudit = view(w, w.p.agencyPM, mod.myAuditEvent);
    expect(agencyAudit.length).toBeGreaterThan(0);
    expect(agencyAudit.some((e: any) => e.subjectType === 'invoice' && e.subjectId === subInv)).toBe(false);
  });

  it('outsiders see nothing; the service sees everything', () => {
    const { w } = settledWorld();
    for (const v of [mod.myContract, mod.myInvoice, mod.myMember, mod.myLedgerEntry, mod.myAuditEvent, mod.myVerification])
      expect(view(w, w.p.outsider, v)).toHaveLength(0);
    expect(view(w, w.p.outsider, mod.me)).toBeUndefined();
    expect(view(w, w.service, mod.myInvoice)).toHaveLength(2);
    expect(view(w, w.service, mod.myLedgerEntry).length).toBe([...w.h.db.ledgerEntry.iter()].length);
  });

  it('`me` returns the caller’s own member row', () => {
    const { w } = settledWorld();
    expect(view(w, w.p.subOwner, mod.me)?.displayName).toBe('sub-owner');
  });
});

describe('CRS attestation hash', () => {
  it('stamps the hash on verified people and organizations', () => {
    const w = makeWorld();
    expect(view(w, w.p.agencyPM, mod.me)?.identityHash).toBe(HASH);
    expect(w.h.db.organization.id.find(w.orgs.prime)!.identityHash).toBe(HASH);
  });

  it('a pass without a proper SHA-256 hex hash is rejected; a fail needs none', () => {
    const w = makeWorld();
    const base = { subjectType: 'ORG', orgId: w.orgs.sub, memberIdentity: undefined, invoiceId: undefined, products: 'IDV', reasons: '', sandbox: true };
    expect(() => w.call(w.service, mod.recordVerification, { ...base, decision: 'PASS', identityHash: 'SSN-123-45-6789' })).toThrow('64-char hex');
    w.call(w.service, mod.recordVerification, { ...base, decision: 'FAIL', identityHash: '' });
  });
});

describe('observer (demo flow screen)', () => {
  function withObserver() {
    const w = makeWorld();
    const obs = w.auth('observer');
    w.call(obs, mod.requestServiceRole, { label: 'flow-screen' });
    const req = [...w.h.db.serviceRequest.iter()][0]!;
    expect(() => w.call(w.p.agencyPM, mod.approveObserverRole, { requestId: req.id })).toThrow('owner only');
    w.call(w.owner, mod.approveObserverRole, { requestId: req.id });
    return { w, obs };
  }

  it('sees every org’s agents and bills', () => {
    const { w, obs } = withObserver();
    w.billToReview(w.levels.gov);
    w.billToReview(w.levels.sub);
    expect(view(w, obs, mod.myInvoice)).toHaveLength(2);
    expect(view(w, obs, mod.myContract)).toHaveLength(2);
  });

  it('can never write: no service actions, no person actions, no wallet-change reports', () => {
    const { w, obs } = withObserver();
    const id = w.billToReview(w.levels.gov);
    expect(() => w.call(obs, mod.recordPayment, { invoiceId: id, idempotencyKey: 'x', state: 'CREATED', txHash: '', simulated: true })).toThrow('service identity only');
    expect(() => w.call(obs, mod.createOrganization, { kind: 'SUB', name: 'x', treasuryWallet: '' })).toThrow('service identity only');
    expect(() => w.call(obs, mod.approveInvoice, { invoiceId: id, reason: 'x' })).toThrow('cannot act as a person');
    expect(() => w.call(obs, mod.changeBeneficiary, { invoiceId: id, requestedWallet: '0x1', source: 'EMAIL', note: '' })).toThrow('read-only');
    expect(() => w.call(obs, mod.postComment, { targetType: 'invoice', targetId: id, text: 'hi' })).toThrow('cannot act as a person');
  });
});
