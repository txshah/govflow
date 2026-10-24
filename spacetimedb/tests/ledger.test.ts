/**
 * The ledger stays balanced per organization, every confirmed payout has a ledger entry with its tx hash, and payouts are idempotent.
 *
 * Inputs:
 * - A settled pay application (100 USDC) and a settled sub invoice (50 USDC)
 *
 * Outputs:
 * - Account balances per org; idempotency and payment-ordering rejections
 */

import { describe, expect, it } from 'vitest';
import { makeWorld, mod, USDC } from './world';

function balances(w: ReturnType<typeof makeWorld>, orgId: bigint) {
  const b: Record<string, bigint> = {};
  for (const e of w.h.db.ledgerEntry.orgId.filter(orgId)) {
    b[e.debit] = (b[e.debit] ?? 0n) + e.amount;
    b[e.credit] = (b[e.credit] ?? 0n) - e.amount;
  }
  return b;
}

describe('ledger', () => {
  it('books both levels on the right org with zero open payables after settlement', () => {
    const w = makeWorld();
    const payApp = w.billToReview(w.levels.gov);
    w.settle(w.levels.gov, payApp);
    const subInv = w.billToReview(w.levels.sub);
    w.settle(w.levels.sub, subInv);

    expect(balances(w, w.orgs.agency)).toEqual({
      'Construction costs': USDC(100), 'Accounts payable': 0n, 'USDC treasury': -USDC(100),
    });
    expect(balances(w, w.orgs.prime)).toEqual({
      'Accounts receivable': 0n, 'Contract revenue': -USDC(100), 'USDC treasury': USDC(100) - USDC(50),
      'Subcontract costs': USDC(50), 'Accounts payable': 0n,
    });
    // Every org's books sum to zero.
    for (const o of Object.values(w.orgs)) {
      expect(Object.values(balances(w, o)).reduce((s, x) => s + x, 0n)).toBe(0n);
    }
  });

  it('every confirmed payout reconciles to a ledger entry with the same tx hash', () => {
    const w = makeWorld();
    const id = w.billToReview(w.levels.gov);
    w.settle(w.levels.gov, id);
    for (const p of w.h.db.payment.iter()) {
      if (p.state !== 'CONFIRMED') continue;
      const entries = [...w.h.db.ledgerEntry.invoiceId.filter(p.invoiceId)].filter(e => e.txHash === p.txHash && e.orgId === p.fromOrgId);
      expect(entries).toHaveLength(1);
    }
  });

  it('nothing is booked for payment until a bill is approved', () => {
    const w = makeWorld();
    w.billToReview(w.levels.gov);
    expect([...w.h.db.ledgerEntry.iter()]).toHaveLength(0);
  });
});

describe('payout idempotency and ordering', () => {
  it('rejects a repeated key, a second live payment, skipped states and a confirm without tx hash', () => {
    const w = makeWorld();
    const L = w.levels.gov;
    const id = w.billToReview(L);
    w.approveBoth(L, id);
    w.pay(id, 'k1', ['CREATED']);
    expect(() => w.pay(id, 'k1', ['CREATED'])).toThrow('illegal payment transition');
    expect(() => w.pay(id, 'k2', ['CREATED'])).toThrow();
    expect(() => w.pay(id, 'k1', ['SUBMITTED'])).toThrow('illegal payment transition');
    w.pay(id, 'k1', ['POLICY_CHECKED', 'AUTHORIZED', 'SUBMITTED']);
    expect(() =>
      w.call(w.service, mod.recordPayment, { invoiceId: id, idempotencyKey: 'k1', state: 'CONFIRMED', txHash: '', simulated: true })
    ).toThrow('needs a txHash');
  });

  it('cannot pay an unapproved bill, and only the service records payments', () => {
    const w = makeWorld();
    const L = w.levels.gov;
    const id = w.billToReview(L);
    expect(() => w.pay(id, 'k1', ['CREATED'])).toThrow('cannot pay a bill in FINANCE_REVIEW');
    w.approveBoth(L, id);
    expect(() =>
      w.call(w.p.agencyFin1, mod.recordPayment, { invoiceId: id, idempotencyKey: 'k1', state: 'CREATED', txHash: '', simulated: true })
    ).toThrow('service identity only');
  });
});
