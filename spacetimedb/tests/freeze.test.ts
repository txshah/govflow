/**
 * A beneficiary change always freezes payment; only a fresh passing CRS check plus two approvers unfreezes it; an impostor never gets paid; a hold blocks a queued payout.
 *
 * Inputs:
 * - Seeded bills at both levels, a fake "we changed our wallet" email via the service, real-owner vs impostor verifications
 *
 * Outputs:
 * - Assertions on invoice, beneficiaryChange, organization wallet and payment state
 */

import { describe, expect, it } from 'vitest';
import { makeWorld, mod } from './world';

const EMAIL = { requestedWallet: '0xIMPOSTOR', source: 'EMAIL', note: 'We changed our wallet, pay this one instead' };

describe.each(['gov', 'sub'] as const)('beneficiary change freeze — %s level', level => {
  it('freezes immediately and wipes earlier approvals', () => {
    const w = makeWorld();
    const L = w.levels[level];
    const id = w.billToReview(L);
    w.call(L.approvers[0], mod.approveInvoice, { invoiceId: id, reason: 'ok' });
    w.call(w.service, mod.changeBeneficiary, { invoiceId: id, ...EMAIL });
    const inv = w.invoice(id);
    expect(inv.state).toBe('PAYMENT_FROZEN');
    expect(inv.freezeReason).toBe('BENEFICIARY_CHANGED');
    expect(inv.beneficiaryWallet).not.toBe('0xIMPOSTOR');
    expect(() => w.call(L.approvers[1], mod.approveInvoice, { invoiceId: id, reason: 'ok' })).toThrow('PAYMENT_FROZEN');
  });

  it('impostor: stays frozen until the real owner re-verifies, then two approvers reject the change', () => {
    const w = makeWorld();
    const L = w.levels[level];
    const id = w.billToReview(L);
    w.call(w.service, mod.changeBeneficiary, { invoiceId: id, ...EMAIL });
    const unfreeze = (who: (typeof L.approvers)[number], vote: string) =>
      w.call(who, mod.voteUnfreeze, { invoiceId: id, vote, reason: 'case file reviewed' });

    expect(() => unfreeze(L.approvers[0], 'REJECT_CHANGE')).toThrow('re-verification');
    w.tick();
    w.verifyOrg(L.payee, false); // impostor fails CRS
    expect(() => unfreeze(L.approvers[0], 'REJECT_CHANGE')).toThrow('re-verification');
    expect(() => unfreeze(L.approvers[0], 'ACCEPT_CHANGE')).toThrow('not been proven');

    w.verifyOrg(L.payee, true); // real owner passes
    unfreeze(L.approvers[0], 'REJECT_CHANGE');
    expect(w.invoice(id).state).toBe('PAYMENT_FROZEN');
    unfreeze(L.approvers[1], 'REJECT_CHANGE');

    const inv = w.invoice(id);
    expect(inv.state).toBe('FINANCE_REVIEW');
    const payee = w.h.db.organization.id.find(L.payee)!;
    expect(inv.beneficiaryWallet).toBe(payee.payoutWallet);
    expect(payee.payoutWallet).not.toBe('0xIMPOSTOR');
    expect([...w.h.db.beneficiaryChange.iter()][0]!.state).toBe('REJECTED');

    // Fresh round: earlier votes don't count, two new approvals still needed.
    w.call(L.approvers[0], mod.approveInvoice, { invoiceId: id, reason: 'ok' });
    expect(w.invoice(id).state).toBe('FINANCE_REVIEW');
  });

  it('legitimate change: needs wallet proof + re-verification + two approvers, then pays the new wallet', () => {
    const w = makeWorld();
    const L = w.levels[level];
    const id = w.billToReview(L);
    w.call(L.preparer, mod.changeBeneficiary, { invoiceId: id, requestedWallet: '0xNEW_REAL', source: 'IN_APP', note: 'new treasury' });
    const change = [...w.h.db.beneficiaryChange.iter()][0]!;
    w.tick();
    w.verifyOrg(L.payee, true);
    expect(() => w.call(L.approvers[0], mod.voteUnfreeze, { invoiceId: id, vote: 'ACCEPT_CHANGE', reason: 'ok' })).toThrow('not been proven');
    w.call(w.service, mod.recordWalletProof, { changeId: change.id });
    w.call(L.approvers[0], mod.voteUnfreeze, { invoiceId: id, vote: 'ACCEPT_CHANGE', reason: 'ok' });
    w.call(L.approvers[1], mod.voteUnfreeze, { invoiceId: id, vote: 'ACCEPT_CHANGE', reason: 'ok' });
    expect(w.invoice(id).beneficiaryWallet).toBe('0xNEW_REAL');
    expect(w.h.db.organization.id.find(L.payee)!.payoutWallet).toBe('0xNEW_REAL');
    w.settle(L, id);
    expect(w.invoice(id).state).toBe('SETTLED');
  });

  it('split votes do not unfreeze', () => {
    const w = makeWorld();
    const L = w.levels[level];
    const id = w.billToReview(L);
    w.call(w.service, mod.changeBeneficiary, { invoiceId: id, ...EMAIL });
    const change = [...w.h.db.beneficiaryChange.iter()][0]!;
    w.tick();
    w.verifyOrg(L.payee, true);
    w.call(w.service, mod.recordWalletProof, { changeId: change.id });
    w.call(L.approvers[0], mod.voteUnfreeze, { invoiceId: id, vote: 'ACCEPT_CHANGE', reason: 'looks fine' });
    w.call(L.approvers[1], mod.voteUnfreeze, { invoiceId: id, vote: 'REJECT_CHANGE', reason: 'suspicious' });
    expect(w.invoice(id).state).toBe('PAYMENT_FROZEN');
  });

  it('a hold stops a queued payout', () => {
    const w = makeWorld();
    const L = w.levels[level];
    const id = w.billToReview(L);
    w.approveBoth(L, id);
    w.pay(id, 'k1', ['CREATED', 'POLICY_CHECKED']);
    w.call(w.service, mod.changeBeneficiary, { invoiceId: id, ...EMAIL });
    expect(w.h.db.payment.idempotencyKey.find('k1')!.state).toBe('FAILED');
    expect(w.h.db.payment.idempotencyKey.find('k1')!.note).toBe('HOLD');
    expect(() => w.pay(id, 'k1', ['AUTHORIZED'])).toThrow('illegal payment transition');
  });

  it('a payout already onchain cannot be frozen', () => {
    const w = makeWorld();
    const L = w.levels[level];
    const id = w.billToReview(L);
    w.approveBoth(L, id);
    w.pay(id, 'k2', ['CREATED', 'POLICY_CHECKED', 'AUTHORIZED', 'SUBMITTED']);
    expect(() => w.call(w.service, mod.changeBeneficiary, { invoiceId: id, ...EMAIL })).toThrow('too late');
  });
});

describe('wallet binding', () => {
  it('cannot overwrite a bound wallet outside the freeze flow', () => {
    const w = makeWorld();
    const v = w.verifyOrg(w.orgs.prime);
    expect(() => w.call(w.service, mod.recordWalletBinding, { orgId: w.orgs.prime, wallet: '0xSNEAKY', verificationId: v })).toThrow('already bound');
  });

  it('a MISMATCH freeze can be released only after re-verification and two RELEASE votes', () => {
    const w = makeWorld();
    const L = w.levels.gov;
    const ms = w.acceptLine(L);
    const id = w.submitBill(L, [ms.id], ms.scheduledValue);
    w.call(w.service, mod.recordMatch, { invoiceId: id, agentId: L.payerAgent, result: 'MISMATCH', reasons: 'qty off', modelId: 'test' });
    expect(w.invoice(id).state).toBe('PAYMENT_FROZEN');
    expect(() => w.call(L.approvers[0], mod.voteUnfreeze, { invoiceId: id, vote: 'ACCEPT_CHANGE', reason: 'x' })).toThrow('no pending wallet change');
    w.tick();
    w.verifyOrg(L.payee, true);
    w.call(L.approvers[0], mod.voteUnfreeze, { invoiceId: id, vote: 'RELEASE', reason: 'checked qty by phone' });
    w.call(L.approvers[1], mod.voteUnfreeze, { invoiceId: id, vote: 'RELEASE', reason: 'agree' });
    expect(w.invoice(id).state).toBe('FINANCE_REVIEW');
  });
});

describe('identity hash at payment', () => {
  it('a payee who passes CRS as a different person freezes the bill; two approvers with a reason adopt the new hash', () => {
    const w = makeWorld();
    const L = w.levels.gov;
    const before = w.h.db.organization.id.find(L.payee)!.identityHash;
    const ms = w.acceptLine(L);
    const id = w.submitBill(L, [ms.id], ms.scheduledValue);
    w.call(w.service, mod.recordMatch, { invoiceId: id, agentId: L.payerAgent, result: 'MATCHED', reasons: 'ok', modelId: 'test' });
    const other = 'b'.repeat(64);
    w.verifyOrg(L.payee, true, id, other);
    expect(w.invoice(id).state).toBe('PAYMENT_FROZEN');
    expect(w.invoice(id).freezeReason).toBe('IDENTITY_CHANGED');
    expect(w.h.db.organization.id.find(L.payee)!.identityHash).toBe(before);
    const release = (who: (typeof L.approvers)[number]) =>
      w.call(who, mod.voteUnfreeze, { invoiceId: id, vote: 'RELEASE', reason: 'new owner documented and verified' });
    release(L.approvers[0]);
    release(L.approvers[1]);
    expect(w.invoice(id).state).toBe('FINANCE_REVIEW');
    expect(w.h.db.organization.id.find(L.payee)!.identityHash).toBe(other);
  });

  it('the same person passes straight through', () => {
    const w = makeWorld();
    const id = w.billToReview(w.levels.gov);
    expect(w.invoice(id).state).toBe('FINANCE_REVIEW');
  });
});

