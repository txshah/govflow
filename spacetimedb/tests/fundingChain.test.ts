/**
 * The chain agency → prime → sub follows the same rules at each level: the right orgs on each contract, the paying side accepts work, bills can't exceed or double-bill accepted work, and each payout leaves the payer's treasury.
 *
 * Inputs:
 * - Seeded prime contract (2 lines: 100 + 200 USDC) and subcontract (1 line: 50 USDC)
 *
 * Outputs:
 * - Rejections for wrong-direction contracts, cross-org reviews and bad bills; correct payer/payee on every payout
 */

import { describe, expect, it } from 'vitest';
import { makeWorld, mod, USDC } from './world';

describe('contracts', () => {
  it('a prime contract is agency → prime; a subcontract is prime → sub and fits inside the prime contract', () => {
    const w = makeWorld();
    const line = [{ description: 'x', scheduledValue: USDC(1) }];
    expect(() =>
      w.call(w.p.primeAP, mod.createDeal, { kind: 'PRIME_CONTRACT', payeeOrgId: w.orgs.sub, parentContractId: undefined, title: 'bad', lines: line })
    ).toThrow('agency → prime');
    expect(() =>
      w.call(w.p.agencyPM, mod.createDeal, { kind: 'SUBCONTRACT', payeeOrgId: w.orgs.sub, parentContractId: w.levels.gov.contractId, title: 'bad', lines: line })
    ).toThrow('prime → sub');
    expect(() =>
      w.call(w.p.primeAP, mod.createDeal, {
        kind: 'SUBCONTRACT', payeeOrgId: w.orgs.sub, parentContractId: w.levels.gov.contractId, title: 'too big',
        lines: [{ description: 'x', scheduledValue: USDC(251) }],
      })
    ).toThrow('exceed the prime contract');
  });

  it('only verified signers can create a deal', () => {
    const w = makeWorld();
    const line = [{ description: 'x', scheduledValue: USDC(1) }];
    expect(() =>
      w.call(w.p.agencyFin1, mod.createDeal, { kind: 'PRIME_CONTRACT', payeeOrgId: w.orgs.prime, parentContractId: undefined, title: 'x', lines: line })
    ).toThrow('not a signer');
  });
});

describe('work acceptance', () => {
  it('only the paying side’s reviewer accepts work', () => {
    const w = makeWorld();
    const gov = w.lines(w.levels.gov)[0]!;
    const sub = w.lines(w.levels.sub)[0]!;
    w.call(w.p.primeAP, mod.submitEvidence, { milestoneId: gov.id, evidenceRefs: 'a' });
    w.call(w.p.subOwner, mod.submitEvidence, { milestoneId: sub.id, evidenceRefs: 'b' });
    expect(() => w.call(w.p.primeInspector, mod.inspectMilestone, { milestoneId: gov.id, accept: true, note: '' })).toThrow('wrong organization');
    expect(() => w.call(w.p.agencyPM, mod.inspectMilestone, { milestoneId: sub.id, accept: true, note: '' })).toThrow('wrong organization');
    expect(() => w.call(w.p.subOwner, mod.submitEvidence, { milestoneId: gov.id, evidenceRefs: 'c' })).toThrow('wrong organization');
  });

  it('a rejected milestone can be resubmitted', () => {
    const w = makeWorld();
    const ms = w.lines(w.levels.gov)[0]!;
    w.call(w.p.primeAP, mod.submitEvidence, { milestoneId: ms.id, evidenceRefs: 'a' });
    expect(() => w.call(w.p.agencyPM, mod.inspectMilestone, { milestoneId: ms.id, accept: false, note: '' })).toThrow('needs a reason');
    w.call(w.p.agencyPM, mod.inspectMilestone, { milestoneId: ms.id, accept: false, note: 'blurry photos' });
    w.call(w.p.primeAP, mod.submitEvidence, { milestoneId: ms.id, evidenceRefs: 'b' });
    expect(w.h.db.milestone.id.find(ms.id)!.state).toBe('SUBMITTED_FOR_INSPECTION');
  });
});

describe.each(['gov', 'sub'] as const)('bills — %s level', level => {
  it('billing above the accepted lines’ value freezes as OVERBILLED', () => {
    const w = makeWorld();
    const L = w.levels[level];
    const ms = w.acceptLine(L);
    const id = w.submitBill(L, [ms.id], ms.scheduledValue + 1n);
    expect(w.invoice(id).state).toBe('PAYMENT_FROZEN');
    expect(w.invoice(id).freezeReason).toBe('OVERBILLED');
  });

  it('cannot bill unaccepted work or bill the same line twice', () => {
    const w = makeWorld();
    const L = w.levels[level];
    const ms = w.lines(L)[0]!;
    w.call(L.preparer, mod.draftInvoice, { contractId: L.contractId, milestoneIds: [ms.id], amount: ms.scheduledValue, memo: '', agentId: '' });
    expect(() => w.call(L.preparer, mod.submitInvoice, { invoiceId: w.lastInvoiceId() })).toThrow('not been accepted');
    w.acceptLine(L);
    w.call(L.preparer, mod.submitInvoice, { invoiceId: w.lastInvoiceId() });
    w.call(L.preparer, mod.draftInvoice, { contractId: L.contractId, milestoneIds: [ms.id], amount: ms.scheduledValue, memo: '', agentId: '' });
    expect(() => w.call(L.preparer, mod.submitInvoice, { invoiceId: w.lastInvoiceId() })).toThrow('already billed');
  });

  it('cannot bill a line from the other contract', () => {
    const w = makeWorld();
    const L = w.levels[level];
    const other = w.levels[level === 'gov' ? 'sub' : 'gov'];
    const foreign = w.acceptLine(other);
    w.call(L.preparer, mod.draftInvoice, { contractId: L.contractId, milestoneIds: [foreign.id], amount: 1n, memo: '', agentId: '' });
    expect(() => w.call(L.preparer, mod.submitInvoice, { invoiceId: w.lastInvoiceId() })).toThrow('not on this contract');
  });

  it('an UNSURE match waits for a person', () => {
    const w = makeWorld();
    const L = w.levels[level];
    const ms = w.acceptLine(L);
    const id = w.submitBill(L, [ms.id], ms.scheduledValue);
    w.call(w.service, mod.recordMatch, { invoiceId: id, agentId: L.payerAgent, result: 'UNSURE', reasons: 'photo unclear', modelId: 'test' });
    expect(w.invoice(id).state).toBe('SUBMITTED');
    expect(() => w.call(L.approvers[0], mod.confirmUnsureMatch, { invoiceId: id, reason: '' })).toThrow('reason');
    w.call(L.approvers[0], mod.confirmUnsureMatch, { invoiceId: id, reason: 'called the site' });
    expect(w.invoice(id).state).toBe('MATCHED');
  });

  it('a failed pre-payout CRS check freezes the bill', () => {
    const w = makeWorld();
    const L = w.levels[level];
    const ms = w.acceptLine(L);
    const id = w.submitBill(L, [ms.id], ms.scheduledValue);
    w.call(w.service, mod.recordMatch, { invoiceId: id, agentId: L.payerAgent, result: 'MATCHED', reasons: 'ok', modelId: 'test' });
    w.verifyOrg(L.payee, false, id);
    expect(w.invoice(id).state).toBe('PAYMENT_FROZEN');
    expect(w.invoice(id).freezeReason).toBe('VERIFICATION_FAILED');
  });

  it('a REVIEW result holds the bill as a warning, and two approvers can release it', () => {
    const w = makeWorld();
    const L = w.levels[level];
    const ms = w.acceptLine(L);
    const id = w.submitBill(L, [ms.id], ms.scheduledValue);
    w.call(w.service, mod.recordMatch, { invoiceId: id, agentId: L.payerAgent, result: 'MATCHED', reasons: 'ok', modelId: 'test' });
    w.verifyOrg(L.payee, 'REVIEW', id);
    expect(w.invoice(id).freezeReason).toBe('VERIFICATION_REVIEW');
    expect([...w.h.db.verification.iter()].at(-1)!.decision).toBe('REVIEW');
    expect(w.h.db.organization.id.find(L.payee)!.identityHash).not.toBe('');
    w.call(L.approvers[0], mod.voteUnfreeze, { invoiceId: id, vote: 'RELEASE', reason: 'called the owner, firm checks out' });
    w.call(L.approvers[1], mod.voteUnfreeze, { invoiceId: id, vote: 'RELEASE', reason: 'state filing reviewed' });
    expect(w.invoice(id).state).toBe('FINANCE_REVIEW');
  });

  it('a REVIEW hold cannot be released once a FAIL comes back', () => {
    const w = makeWorld();
    const L = w.levels[level];
    const ms = w.acceptLine(L);
    const id = w.submitBill(L, [ms.id], ms.scheduledValue);
    w.call(w.service, mod.recordMatch, { invoiceId: id, agentId: L.payerAgent, result: 'MATCHED', reasons: 'ok', modelId: 'test' });
    w.verifyOrg(L.payee, 'REVIEW', id);
    w.tick();
    w.verifyOrg(L.payee, false);
    expect(() =>
      w.call(L.approvers[0], mod.voteUnfreeze, { invoiceId: id, vote: 'RELEASE', reason: 'looks fine' })
    ).toThrow('re-verification');
  });

  it('rejects an unknown decision', () => {
    const w = makeWorld();
    expect(() =>
      w.call(w.service, mod.recordVerification, {
        subjectType: 'ORG', orgId: w.orgs.sub, memberIdentity: undefined, invoiceId: undefined,
        products: 'IDV', decision: 'MAYBE', reasons: '', identityHash: '', sandbox: true,
      })
    ).toThrow('bad decision');
  });
});

describe('end to end', () => {
  it('agency pays the prime, then the prime pays the sub, each from its own treasury', () => {
    const w = makeWorld();
    const payApp = w.billToReview(w.levels.gov);
    w.settle(w.levels.gov, payApp);
    const subInv = w.billToReview(w.levels.sub);
    w.settle(w.levels.sub, subInv);

    expect(w.invoice(payApp).state).toBe('SETTLED');
    expect(w.invoice(subInv).state).toBe('SETTLED');
    const [p1] = [...w.h.db.payment.invoiceId.filter(payApp)];
    const [p2] = [...w.h.db.payment.invoiceId.filter(subInv)];
    expect([p1!.fromOrgId, p1!.toOrgId, p1!.toWallet]).toEqual([w.orgs.agency, w.orgs.prime, '0xPRIME_PAYOUT']);
    expect([p2!.fromOrgId, p2!.toOrgId, p2!.toWallet]).toEqual([w.orgs.prime, w.orgs.sub, '0xSUB_PAYOUT']);
    expect(w.invoice(payApp).kind).toBe('PAY_APPLICATION');
    expect(w.invoice(subInv).kind).toBe('SUB_INVOICE');
  });
});
