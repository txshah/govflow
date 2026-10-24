/**
 * Defines payouts (keyed by idempotency key) and the per-organization double-entry ledger.
 *
 * Inputs:
 * - recordPayment reducer (Node API only)
 * - approveInvoice (writes approval entries) and recordPayment CONFIRMED (writes payout entries)
 *
 * Outputs:
 * - payment rows: idempotencyKey, invoiceId, fromOrgId, toOrgId, toWallet, amount, state, txHash, simulated
 * - ledgerEntry rows: orgId, invoiceId, debit account, credit account, amount, txHash
 */

import { t, table } from 'spacetimedb/server';

export const payment = table(
  { name: 'payment' },
  {
    idempotencyKey: t.string().primaryKey(),
    invoiceId: t.u64().index('btree'),
    fromOrgId: t.u64(),
    toOrgId: t.u64(),
    toWallet: t.string(),
    // micro-USDC
    amount: t.u64(),
    state: t.string(),
    txHash: t.string(),
    simulated: t.bool(),
    note: t.string(),
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
  }
);

export const ledgerEntry = table(
  { name: 'ledger_entry' },
  {
    id: t.u64().primaryKey().autoInc(),
    orgId: t.u64().index('btree'),
    invoiceId: t.u64().index('btree'),
    debit: t.string(),
    credit: t.string(),
    // micro-USDC
    amount: t.u64(),
    txHash: t.string(),
    memo: t.string(),
    at: t.timestamp(),
  }
);
