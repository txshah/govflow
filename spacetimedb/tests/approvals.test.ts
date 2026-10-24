/**
 * Two distinct verified finance approvers from the paying org are required at both levels; the requester, an agent, the wrong org and a repeat approver are all rejected.
 *
 * Inputs:
 * - The seeded world: a pay application (agency pays) and a sub invoice (prime pays) in FINANCE_REVIEW
 *
 * Outputs:
 * - Assertions on approveInvoice outcomes and invoice state
 */

import { describe, expect, it } from 'vitest';
import { makeWorld, mod } from './world';

describe.each(['gov', 'sub'] as const)('approvals — %s level', level => {
  it('needs two different approvers before a bill is APPROVED', () => {
    const w = makeWorld();
    const L = w.levels[level];
    const id = w.billToReview(L);
    w.call(L.approvers[0], mod.approveInvoice, { invoiceId: id, reason: 'ok' });
    expect(w.invoice(id).state).toBe('FINANCE_REVIEW');
    w.call(L.approvers[1], mod.approveInvoice, { invoiceId: id, reason: 'ok' });
    expect(w.invoice(id).state).toBe('APPROVED');
  });

  it('rejects the same approver voting twice', () => {
    const w = makeWorld();
    const L = w.levels[level];
    const id = w.billToReview(L);
    w.call(L.approvers[0], mod.approveInvoice, { invoiceId: id, reason: 'ok' });
    expect(() => w.call(L.approvers[0], mod.approveInvoice, { invoiceId: id, reason: 'again' })).toThrow('already voted');
    expect(w.invoice(id).state).toBe('FINANCE_REVIEW');
  });

  it('rejects the service identity (agents) as an approver', () => {
    const w = makeWorld();
    const id = w.billToReview(w.levels[level]);
    expect(() => w.call(w.service, mod.approveInvoice, { invoiceId: id, reason: 'ok' })).toThrow('cannot act as a person');
    expect(() => w.call(w.owner, mod.approveInvoice, { invoiceId: id, reason: 'ok' })).toThrow('cannot act as a person');
  });

  it('rejects the requester and non-approver roles', () => {
    const w = makeWorld();
    const L = w.levels[level];
    const id = w.billToReview(L);
    expect(() => w.call(L.preparer, mod.approveInvoice, { invoiceId: id, reason: 'ok' })).toThrow('unauthorized');
    expect(() => w.call(L.reviewer, mod.approveInvoice, { invoiceId: id, reason: 'ok' })).toThrow('requires role APPROVER');
    expect(() => w.call(w.p.outsider, mod.approveInvoice, { invoiceId: id, reason: 'ok' })).toThrow('not a member');
  });

  it('rejects an approver who has not passed CRS verification', () => {
    const w = makeWorld();
    const L = w.levels[level];
    const id = w.billToReview(L);
    const rookie = w.join(`rookie-${level}`, L.payer, 'APPROVER', false, false);
    expect(() => w.call(rookie, mod.approveInvoice, { invoiceId: id, reason: 'ok' })).toThrow('CRS verification required');
  });

  it('only approves bills in FINANCE_REVIEW', () => {
    const w = makeWorld();
    const L = w.levels[level];
    const ms = w.acceptLine(L);
    const id = w.submitBill(L, [ms.id], ms.scheduledValue);
    expect(() => w.call(L.approvers[0], mod.approveInvoice, { invoiceId: id, reason: 'ok' })).toThrow('cannot approve a bill in SUBMITTED');
  });

  it('one approver can reject on their own, releasing the milestones for a new bill', () => {
    const w = makeWorld();
    const L = w.levels[level];
    const id = w.billToReview(L);
    w.call(L.approvers[0], mod.rejectInvoice, { invoiceId: id, reason: 'wrong period' });
    expect(w.invoice(id).state).toBe('REJECTED');
    expect(w.lines(L)[0]!.billedInvoiceId).toBeUndefined();
    w.call(L.preparer, mod.reopenInvoice, { invoiceId: id });
    expect(w.invoice(id).state).toBe('DRAFT');
  });
});

describe('approvals — organizations stay in their lane', () => {
  it('prime approvers cannot approve the agency’s payment, and agency approvers cannot approve sub payments', () => {
    const w = makeWorld();
    const payApp = w.billToReview(w.levels.gov);
    const subInv = w.billToReview(w.levels.sub);
    expect(() => w.call(w.p.primeCtrl1, mod.approveInvoice, { invoiceId: payApp, reason: 'ok' })).toThrow('wrong organization');
    expect(() => w.call(w.p.agencyFin1, mod.approveInvoice, { invoiceId: subInv, reason: 'ok' })).toThrow('wrong organization');
  });
});
