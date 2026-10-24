/**
 * Routes SpacetimeDB events to the right org's agent (agency, prime or sub), checks its mandate, and logs each step as an agentAction.
 *
 * Inputs:
 * - Row events: evidence submitted, milestones accepted, invoice or pay application submitted, beneficiary changed, roomComment
 *
 * Outputs:
 * - Agent invocations
 * - agentAction rows streamed to the right room
 *
 * Built today: SUBMITTED bills → the payer's agent matches them; PENDING beneficiary changes → the payer's agent
 * writes a risk case file. Evidence summaries and invoice drafting are cut for the demo.
 */

import type { DbConnection } from '../module_bindings/index.ts';
import type { createAgentPayer } from '../x402/client.ts';
import { matchInvoice } from './invoiceMatcher.ts';
import { dealForContract, findMandate } from './mandates.ts';
import { reviewChange } from './riskReviewer.ts';

type AgentPayer = Awaited<ReturnType<typeof createAgentPayer>>;

export function createAgentRunner(conn: DbConnection, payer: AgentPayer) {
  const db = conn.db;
  const busy = new Set<string>();
  // One attempt per bill or change per process; a failed agent step needs a person, not a retry loop.
  const done = new Set<string>();

  function run(key: string, job: () => Promise<void>) {
    if (busy.has(key) || done.has(key)) return;
    busy.add(key);
    job()
      .catch((e) => console.error(`agent ${key} failed:`, e instanceof Error ? e.message : e))
      .finally(() => {
        busy.delete(key);
        done.add(key);
      });
  }

  async function match(invoiceId: bigint) {
    const inv = [...db.myInvoice.iter()].find((i) => i.id === invoiceId);
    if (!inv || inv.state !== 'SUBMITTED' || inv.matchResult) return;
    const deal = dealForContract(conn, inv.contractId);
    const m = deal && findMandate(conn, deal.id, inv.payerOrgId, 'match');
    if (!deal || !m) return console.log(`match bill ${inv.id}: skipped (no match mandate for the payer)`);
    const log = (status: string, detail: string) =>
      conn.reducers.logAgentAction({ agentId: m.agentId, dealId: deal.id, orgId: inv.payerOrgId, scope: 'match', step: 'match', status, detail });

    await log('started', `checking bill ${inv.id} against the contract and accepted work`);
    try {
      const r = await matchInvoice(conn, inv);
      await conn.reducers.recordMatch({ invoiceId: inv.id, agentId: m.agentId, result: r.result, reasons: r.reasons.join('\n'), modelId: r.modelId });
      await log('done', `${r.result}: ${r.reasons[0]}`);
      console.log(`match bill ${inv.id}: ${r.result} (${r.modelId})`);
    } catch (e) {
      await log('error', 'matching failed; a person should review this bill');
      throw e;
    }
  }

  /** Starts agent work for every bill and wallet change that needs it. Safe to call as often as you like. */
  function sweep() {
    for (const inv of db.myInvoice.iter()) {
      if (inv.state === 'SUBMITTED' && !inv.matchResult) run(`match-${inv.id}-${inv.approvalRound}`, () => match(inv.id));
    }
    for (const c of db.myBeneficiaryChange.iter()) {
      const reviewed = [...db.myAgentFinding.iter()].some((f) => f.kind === 'RISK_CASE' && f.inputIds.includes(`change:${c.id}`));
      if (c.state === 'PENDING' && !reviewed) run(`risk-${c.id}`, () => reviewChange(conn, payer, c));
    }
  }

  return { sweep };
}
