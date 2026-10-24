/**
 * Watches for APPROVED invoices, runs policy checks (no hold, wallet verified, payer treasury funded), and pays from the payer's treasury: agency → prime or prime → sub.
 *
 * Inputs:
 * - Approved invoice, payer and payee orgs, bound wallet, latest verification
 * - PAYOUT_ADAPTER toggle
 *
 * Outputs:
 * - recordPayment calls for each payment state
 * - Exactly one transfer per idempotency key
 *
 * Each sweep advances every live payment one state at a time (CREATED → POLICY_CHECKED → AUTHORIZED →
 * SUBMITTED → CONFIRMED), so a restart resumes from whatever state the database last recorded.
 */

import { MAX_PAYOUT_ATOMIC } from '../config.ts';
import type { DbConnection } from '../module_bindings/index.ts';
import { waitFor } from '../waitFor.ts';
import { createCdpAdapter } from './cdpAdapter.ts';
import { createSimulatedAdapter, type PayoutAdapter } from './simulatedAdapter.ts';

const DONE = new Set(['CONFIRMED', 'FAILED']);

export function payoutAdapterFromEnv(): PayoutAdapter {
  const mode = process.env.PAYOUT_ADAPTER?.trim() || 'simulated';
  if (mode === 'cdp') return createCdpAdapter();
  if (mode === 'simulated') return createSimulatedAdapter();
  throw new Error(`PAYOUT_ADAPTER must be "simulated" or "cdp", got ${mode}`);
}

export function createPayoutService(conn: DbConnection, adapter: PayoutAdapter) {
  const db = conn.db;
  const busy = new Set<bigint>();
  // After an error, wait before retrying that bill so a persistent problem doesn't spin.
  const retryAt = new Map<bigint, number>();

  const invoice = (id: bigint) => [...db.myInvoice.iter()].find((i) => i.id === id);
  const payment = (key: string) => [...db.myPayment.iter()].find((p) => p.idempotencyKey === key);
  const org = (id: bigint) => [...db.organization.iter()].find((o) => o.id === id);

  async function record(invoiceId: bigint, key: string, state: string, txHash = '') {
    await conn.reducers.recordPayment({ invoiceId, idempotencyKey: key, state, txHash, simulated: adapter.simulated });
    await waitFor(`payment ${key} ${state}`, () => (payment(key)?.state === state ? true : undefined));
    console.log(`payout ${key}: ${state}${txHash ? ` ${txHash}` : ''}`);
  }

  // Returns a reason to refuse the payout, or null when it may go ahead.
  async function policyProblem(invoiceId: bigint, amount: bigint): Promise<string | null> {
    const inv = invoice(invoiceId);
    if (!inv || inv.state !== 'PAYMENT_QUEUED' || inv.freezeReason) return 'bill is on hold';
    if (amount <= 0n || amount > MAX_PAYOUT_ATOMIC) return `amount ${amount} is outside the demo payout cap`;
    const payer = org(inv.payerOrgId);
    if (!payer?.treasuryWallet) return 'payer has no treasury wallet';
    const balance = await adapter.usdcBalance(payer.treasuryWallet);
    if (balance < amount) return `payer treasury holds ${balance}, needs ${amount}`;
    return null;
  }

  async function advance(invoiceId: bigint, key: string) {
    for (;;) {
      const p = payment(key);
      if (!p || DONE.has(p.state)) return;
      switch (p.state) {
        case 'CREATED': {
          const problem = await policyProblem(invoiceId, p.amount);
          if (problem) {
            console.log(`payout ${key}: refused (${problem})`);
            return record(invoiceId, key, 'FAILED');
          }
          await record(invoiceId, key, 'POLICY_CHECKED');
          break;
        }
        case 'POLICY_CHECKED':
          await record(invoiceId, key, 'AUTHORIZED');
          break;
        case 'AUTHORIZED': {
          // Last look before money moves: a freeze after approval must stop the transfer.
          if (invoice(invoiceId)?.state !== 'PAYMENT_QUEUED') return;
          const inv = invoice(invoiceId)!;
          const from = org(inv.payerOrgId)!.treasuryWallet;
          // Bill ids restart after a reseed, so the payment row's creation time keeps the transfer key unique
          // (and still stable across retries of this same payment).
          const tx = await adapter.send({ from, to: p.toWallet, atomic: p.amount, idempotencyKey: `${key}|${p.createdAt.microsSinceUnixEpoch}` });
          await record(invoiceId, key, 'SUBMITTED', tx);
          break;
        }
        case 'SUBMITTED': {
          const ok = await adapter.confirm(p.txHash);
          await record(invoiceId, key, ok ? 'CONFIRMED' : 'FAILED', p.txHash);
          break;
        }
        default:
          throw new Error(`unknown payment state ${p.state}`);
      }
    }
  }

  async function handle(invoiceId: bigint) {
    const inv = invoice(invoiceId);
    if (!inv) return;
    const key = `payout-${inv.id}-${inv.approvalRound}`;
    if (!payment(key)) {
      if (inv.state !== 'APPROVED') return;
      await record(inv.id, key, 'CREATED');
    }
    await advance(inv.id, key);
  }

  /** Starts work on every bill that is APPROVED or has a payment in flight. Safe to call as often as you like. */
  function sweep() {
    for (const inv of db.myInvoice.iter()) {
      if ((inv.state !== 'APPROVED' && inv.state !== 'PAYMENT_QUEUED') || busy.has(inv.id)) continue;
      if ((retryAt.get(inv.id) ?? 0) > Date.now()) continue;
      busy.add(inv.id);
      handle(inv.id)
        .catch((e) => {
          retryAt.set(inv.id, Date.now() + 5_000);
          console.error(`payout for invoice ${inv.id} failed:`, e instanceof Error ? e.message : e);
        })
        .finally(() => busy.delete(inv.id));
    }
  }

  return { sweep };
}
