/**
 * Pre-payout check: when a bill is MATCHED, the payer's mandated agent pays the x402 endpoint to verify the payee, then records the receipt and the result.
 *
 * Inputs:
 * - MATCHED invoices, deals and mandates from the SpacetimeDB cache
 * - The agent payer from client.ts
 *
 * Outputs:
 * - recordX402Receipt (paymentRef = idempotency key, so one charge per bill per approval round)
 * - recordVerification, which moves the bill to FINANCE_REVIEW on PASS or freezes it
 * - logAgentAction rows for each step
 */

import { MAX_PER_CALL_ATOMIC, MAX_PER_SESSION_ATOMIC } from '../config.ts';
import type { Attestation } from '../crs/attestation.ts';
import type { DbConnection } from '../module_bindings/index.ts';
import { recordVerification } from '../stdb.ts';
import { VERIFICATION_URL } from './allowlist.ts';
import type { createAgentPayer, PaidResult } from './client.ts';
import type { VerificationResult } from './server.ts';

type AgentPayer = Awaited<ReturnType<typeof createAgentPayer>>;

const SCOPE = 'verify';
const MAX_ATTEMPTS = 3;
const RETRY_MS = 5_000;

// The check failed before any payment settled, so it can run again.
class RetryableError extends Error {}

export function createPayeeCheckService(conn: DbConnection, payer: AgentPayer) {
  const db = conn.db;
  const busy = new Set<string>();
  const skipped = new Set<string>();
  const attempts = new Map<string, number>();
  const retryAt = new Map<string, number>();

  const min = (a: bigint, b: bigint) => (a < b ? a : b);

  function mandateFor(dealId: bigint, orgId: bigint) {
    const now = BigInt(Date.now()) * 1000n;
    return [...db.myMandate.iter()].find(
      (m) =>
        m.dealId === dealId &&
        m.orgId === orgId &&
        !m.revoked &&
        m.expiresAt.microsSinceUnixEpoch > now &&
        m.scope.split(',').map((s) => s.trim()).includes(SCOPE)
    );
  }

  // Logs once per key, so a bill that can't be checked doesn't flood the console on every sweep.
  function skip(key: string, why: string) {
    if (skipped.has(key)) return;
    skipped.add(key);
    console.log(`payee check ${key}: skipped (${why})`);
  }

  async function check(invoiceId: bigint, key: string) {
    const inv = [...db.myInvoice.iter()].find((i) => i.id === invoiceId);
    if (!inv || inv.state !== 'MATCHED') return;
    if ([...db.myX402Receipt.iter()].some((r) => r.paymentRef === key))
      return skip(key, 'already paid for this round; needs a manual re-check');
    const deal = [...db.myDeal.iter()].find((d) => d.contractId === inv.contractId);
    if (!deal) return skip(key, 'no deal for contract');
    const m = mandateFor(deal.id, inv.payerOrgId);
    if (!m) return skip(key, `no active ${SCOPE} mandate for the payer`);

    const log = (step: string, status: string, detail: string) =>
      conn.reducers.logAgentAction({ agentId: m.agentId, dealId: deal.id, orgId: inv.payerOrgId, scope: SCOPE, step, status, detail });

    // Demo fallback when a fresh paid check can't run (spend cap, CRS down): reuse this payee's latest passing CRS
    // result from an earlier run, labelled as reused, with no new charge.
    const reuse = async (why: string) => {
      const prev = [...db.myVerification.iter()]
        .filter((v) => v.orgId === inv.payeeOrgId && v.subjectType === 'ORG' && v.passed && v.identityHash)
        .sort((a, b) => (a.checkedAt.microsSinceUnixEpoch > b.checkedAt.microsSinceUnixEpoch ? -1 : 1))[0];
      if (!prev) {
        await log('payee_check', 'failed', `${why}; no earlier CRS result to reuse`);
        return skip(key, why);
      }
      const a: Attestation = {
        subjectId: `org:${inv.payeeOrgId}`,
        products: [...prev.products.split(',').map((p) => p.trim()).filter(Boolean), 'reused_result'],
        decision: 'PASS',
        passed: true,
        reasons: prev.reasons.split(',').filter(Boolean),
        checkedAt: new Date().toISOString(),
        identityHash: prev.identityHash,
        requestIds: [],
        sandbox: true,
      };
      await recordVerification(conn, { subjectType: 'ORG', orgId: inv.payeeOrgId, invoiceId: inv.id }, a);
      const when = new Date(Number(prev.checkedAt.microsSinceUnixEpoch / 1000n)).toLocaleString('en-US');
      await log('payee_check', 'done', `PASS · reused the CRS result from ${when} (${why}); no new x402 charge`);
      console.log(`payee check ${key}: reused CRS result from ${when} (${why})`);
    };

    const amount = min(MAX_PER_CALL_ATOMIC, m.perCallLimit);
    if (m.spent + amount > min(m.sessionLimit, MAX_PER_SESSION_ATOMIC)) {
      await log('payee_check', 'blocked', `spend cap reached (${m.spent} of ${m.sessionLimit} micro-USDC)`);
      return reuse('agent spend cap reached');
    }
    if ((attempts.get(key) ?? 0) >= MAX_ATTEMPTS - 1) return reuse('CRS check unavailable after retries');

    await log('payee_check', 'started', `paying 0.01 test USDC to verify the payee of bill ${inv.id}`);
    let paid: PaidResult<VerificationResult>;
    try {
      // A hung CRS or facilitator call must not stall the demo: give up after 25 s and fall back.
      paid = await Promise.race([
        payer.payAndPost<VerificationResult>(VERIFICATION_URL, { invoiceId: String(inv.id) }, key),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timed out after 25 s')), 25_000)),
      ]);
    } catch (e) {
      // The x402 client refused to pay (daily spend limit) or the request never completed.
      return reuse(`payment not made: ${e instanceof Error ? e.message.slice(0, 80) : 'error'}`);
    }
    const { status, body, receipt } = paid;
    if (status !== 200 || !receipt) {
      // x402 settles only after a successful response, so nothing was charged: safe to try again.
      await log('payee_check', 'failed', `verification endpoint returned ${status}; retrying`);
      throw new RetryableError(`verification endpoint returned ${status} without a receipt`);
    }

    await conn.reducers.recordX402Receipt({
      agentId: m.agentId,
      dealId: deal.id,
      orgId: inv.payerOrgId,
      endpoint: VERIFICATION_URL,
      amount,
      paymentRef: key,
    });
    const a: Attestation = {
      subjectId: `org:${inv.payeeOrgId}`,
      products: body.products,
      decision: body.decision,
      passed: body.decision === 'PASS',
      reasons: body.reasons,
      checkedAt: new Date().toISOString(),
      identityHash: body.identityHash,
      requestIds: [],
      sandbox: true,
    };
    await recordVerification(conn, { subjectType: 'ORG', orgId: inv.payeeOrgId, invoiceId: inv.id }, a);
    await log(
      'payee_check',
      'done',
      `${body.decision}${body.reasons.length ? ` [${body.reasons.join(', ')}]` : ''}; x402 tx ${receipt.transaction}`
    );
    console.log(`payee check ${key}: ${body.decision} (x402 tx ${receipt.transaction})`);
  }

  /** Starts a check for every MATCHED bill not already in flight. Safe to call as often as you like. */
  function sweep() {
    for (const inv of db.myInvoice.iter()) {
      if (inv.state !== 'MATCHED') continue;
      const key = `verify-${inv.id}-${inv.approvalRound}`;
      if (busy.has(key) || skipped.has(key)) continue;
      if ((retryAt.get(key) ?? 0) > Date.now()) continue;
      busy.add(key);
      check(inv.id, key)
        .catch((e) => {
          const n = (attempts.get(key) ?? 0) + 1;
          attempts.set(key, n);
          console.error(`payee check ${key} failed (attempt ${n}):`, e instanceof Error ? e.message : e);
          // Retry only when nothing was charged; otherwise (or after MAX_ATTEMPTS) it needs a manual re-check.
          if (e instanceof RetryableError && n < MAX_ATTEMPTS) retryAt.set(key, Date.now() + RETRY_MS);
          else skipped.add(key);
        })
        .finally(() => busy.delete(key));
    }
  }

  return { sweep };
}
