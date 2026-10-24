/**
 * Agents act only through the service identity under an unexpired, unrevoked, correctly scoped mandate for the right org on an ACTIVE deal, and never make human decisions; x402 spend caps and idempotency are enforced.
 *
 * Inputs:
 * - Seeded world with agency-agent, prime-agent and sub-agent mandates
 *
 * Outputs:
 * - Rejected reducer calls for every out-of-mandate action; accepted calls inside it
 */

import { describe, expect, it } from 'vitest';
import { Timestamp } from 'spacetimedb';
import { makeWorld, mod, USDC } from './world';

const match = (invoiceId: bigint, agentId: string) => ({ invoiceId, agentId, result: 'MATCHED', reasons: 'ok', modelId: 'test' });

describe('agent mandates', () => {
  it('the payer’s agent can match; the payee’s agent and unknown agents cannot', () => {
    const w = makeWorld();
    const L = w.levels.gov;
    const ms = w.acceptLine(L);
    const id = w.submitBill(L, [ms.id], ms.scheduledValue);
    expect(() => w.call(w.service, mod.recordMatch, match(id, 'prime-agent'))).toThrow('no active mandate');
    expect(() => w.call(w.service, mod.recordMatch, match(id, 'rogue-agent'))).toThrow('no active mandate');
    w.call(w.service, mod.recordMatch, match(id, 'agency-agent'));
    expect(w.invoice(id).state).toBe('MATCHED');
  });

  it('scope is enforced', () => {
    const w = makeWorld();
    const L = w.levels.sub;
    w.acceptLine(L);
    // sub-agent may draft but not match or record a risk case
    w.call(w.service, mod.draftInvoice, { contractId: L.contractId, milestoneIds: [w.lines(L)[0]!.id], amount: USDC(50), memo: '', agentId: 'sub-agent' });
    const id = w.lastInvoiceId();
    expect(w.invoice(id).draftedByAgent).toBe('sub-agent');
    expect(() =>
      w.call(w.service, mod.recordFinding, {
        kind: 'RISK_CASE', subjectType: 'invoice', subjectId: id, agentId: 'sub-agent', dealId: L.dealId, orgId: L.payee,
        result: 'LOW', body: 'x', flags: '', modelId: 'test', inputIds: '',
      })
    ).toThrow('does not cover risk_review');
  });

  it('expired and revoked mandates stop the agent', () => {
    const w = makeWorld();
    const L = w.levels.gov;
    const ms = w.acceptLine(L);
    const id = w.submitBill(L, [ms.id], ms.scheduledValue);
    w.h.clock.set(new Timestamp(w.h.clock.now().microsSinceUnixEpoch + 31n * w.DAY));
    expect(() => w.call(w.service, mod.recordMatch, match(id, 'agency-agent'))).toThrow('no active mandate');

    const w2 = makeWorld();
    const L2 = w2.levels.gov;
    const ms2 = w2.acceptLine(L2);
    const id2 = w2.submitBill(L2, [ms2.id], ms2.scheduledValue);
    const m = [...w2.h.db.mandate.iter()].find(x => x.agentId === 'agency-agent')!;
    expect(() => w2.call(w2.p.primeAP, mod.revokeMandate, { mandateId: m.id })).toThrow('wrong organization');
    w2.call(w2.p.agencyPM, mod.revokeMandate, { mandateId: m.id });
    expect(() => w2.call(w2.service, mod.recordMatch, match(id2, 'agency-agent'))).toThrow('no active mandate');
  });

  it('agents never submit, accept work, sign, approve or unfreeze', () => {
    const w = makeWorld();
    const L = w.levels.sub;
    const ms = w.lines(L)[0]!;
    w.call(L.preparer, mod.submitEvidence, { milestoneId: ms.id, evidenceRefs: 'photo.jpg' });
    expect(() => w.call(w.service, mod.inspectMilestone, { milestoneId: ms.id, accept: true, note: '' })).toThrow('cannot act as a person');
    w.call(L.reviewer, mod.inspectMilestone, { milestoneId: ms.id, accept: true, note: 'ok' });
    w.call(w.service, mod.draftInvoice, { contractId: L.contractId, milestoneIds: [ms.id], amount: ms.scheduledValue, memo: '', agentId: 'sub-agent' });
    const id = w.lastInvoiceId();
    expect(() => w.call(w.service, mod.submitInvoice, { invoiceId: id })).toThrow('cannot act as a person');
    expect(() => w.call(w.service, mod.signDeal, { dealId: L.dealId })).toThrow('cannot act as a person');
    expect(() => w.call(w.service, mod.voteUnfreeze, { invoiceId: id, vote: 'RELEASE', reason: 'x' })).toThrow();
  });

  it('a deal is not ACTIVE until both orgs sign and mandate their agents', () => {
    const w = makeWorld();
    w.call(w.p.agencyPM, mod.createDeal, {
      kind: 'PRIME_CONTRACT', payeeOrgId: w.orgs.prime, parentContractId: undefined, title: 'Phase 2',
      lines: [{ description: 'Paving', scheduledValue: USDC(10) }],
    });
    const c = [...w.h.db.contract.iter()].find(x => x.title === 'Phase 2')!;
    const d = w.h.db.deal.contractId.find(c.id)!;
    expect(d.state).toBe('AWAITING_SIGNATURES');
    w.call(w.p.agencyPM, mod.signDeal, { dealId: d.id });
    w.call(w.p.primeAP, mod.signDeal, { dealId: d.id });
    expect(w.h.db.deal.id.find(d.id)!.state).toBe('AWAITING_SIGNATURES');
    const ms = w.lines({ ...w.levels.gov, contractId: c.id })[0]!;
    expect(() => w.call(w.p.primeAP, mod.submitEvidence, { milestoneId: ms.id, evidenceRefs: 'x' })).toThrow('not ACTIVE');
    expect(() => w.call(w.p.primeAP, mod.signDeal, { dealId: d.id })).toThrow('already signed');
    expect(() => w.call(w.p.subOwner, mod.signDeal, { dealId: d.id })).toThrow('not a party');
  });

  it('mandates cannot exceed the platform spend caps', () => {
    const w = makeWorld();
    expect(() =>
      w.call(w.p.agencyPM, mod.signMandate, {
        dealId: w.levels.gov.dealId, agentId: 'greedy', scope: 'verify', perCallLimit: USDC(1), sessionLimit: USDC(1),
        expiresAt: new Timestamp(w.h.clock.now().microsSinceUnixEpoch + w.DAY),
      })
    ).toThrow('platform caps');
  });
});

describe('x402 spend caps', () => {
  const receipt = (paymentRef: string, amount: bigint) => ({
    agentId: 'agency-agent', dealId: 0n, orgId: 0n, endpoint: '/api/verification/contractor', amount, paymentRef,
  });

  it('allows 0.01 per call up to 0.10 per session, and rejects repeats', () => {
    const w = makeWorld();
    const r = (ref: string, amt: bigint) => ({ ...receipt(ref, amt), dealId: w.levels.gov.dealId, orgId: w.orgs.agency });
    expect(() => w.call(w.service, mod.recordX402Receipt, r('big', USDC(0.02)))).toThrow('per-call');
    for (let i = 0; i < 10; i++) w.call(w.service, mod.recordX402Receipt, r(`ref-${i}`, USDC(0.01)));
    expect(() => w.call(w.service, mod.recordX402Receipt, r('ref-10', USDC(0.01)))).toThrow('session');
    expect(() => w.call(w.service, mod.recordX402Receipt, r('ref-0', USDC(0.001)))).toThrow('duplicate');
    expect([...w.h.db.x402Receipt.iter()]).toHaveLength(10);
  });

  it('only an agent with the verify scope can spend', () => {
    const w = makeWorld();
    expect(() =>
      w.call(w.service, mod.recordX402Receipt, { ...receipt('x', USDC(0.01)), agentId: 'sub-agent', dealId: w.levels.sub.dealId, orgId: w.orgs.sub })
    ).toThrow('does not cover verify');
  });
});
