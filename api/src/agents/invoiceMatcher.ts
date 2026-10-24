/**
 * Runs for the paying org's agent and compares a sub invoice or pay application to its contract and accepted milestones, returning MATCHED, MISMATCH or UNSURE with reasons.
 *
 * Inputs:
 * - Invoice or pay application, its contract, accepted milestones, amounts already billed
 *
 * Outputs:
 * - recordMatch call (MISMATCH freezes, UNSURE routes to a human)
 * - Request for a paid CRS check on the payee via x402/client.ts
 *
 * Claude proposes the result; the same rules are also checked in code, and a rule failure always wins, so a
 * model error can turn a bill UNSURE or MISMATCH but never wrongly MATCHED. The paid CRS check then runs from
 * x402/payeeCheck.ts once the bill is MATCHED.
 */

import type { DbConnection } from '../module_bindings/index.ts';
import type { Invoice } from '../module_bindings/types.ts';
import { runStructured } from './claude.ts';
import { MATCH_PROMPT } from './prompts.ts';
import { MATCH_SCHEMA, isMatchOutput, type MatchOutput } from './schemas.ts';

const usdc = (n: bigint) => (Number(n) / 1e6).toFixed(2);

export async function matchInvoice(conn: DbConnection, inv: Invoice): Promise<MatchOutput & { modelId: string }> {
  const db = conn.db;
  const contract = [...db.myContract.iter()].find((c) => c.id === inv.contractId);
  const milestones = [...db.myMilestone.iter()].filter((m) => m.contractId === inv.contractId);
  const claimed = inv.milestoneIds.map((id) => milestones.find((m) => m.id === id));

  // Deterministic rules, mirrored from the module's submitInvoice checks plus double-billing.
  const problems: string[] = [];
  let scheduled = 0n;
  for (const [i, m] of claimed.entries()) {
    const id = inv.milestoneIds[i];
    if (!m) { problems.push(`milestone ${id} is not on this contract`); continue; }
    if (m.state !== 'ACCEPTED') problems.push(`milestone ${id} is ${m.state}, not ACCEPTED`);
    if (m.billedInvoiceId !== undefined && m.billedInvoiceId !== inv.id) problems.push(`milestone ${id} was already billed on bill ${m.billedInvoiceId}`);
    scheduled += m.scheduledValue;
  }
  if (inv.amount > scheduled) problems.push(`bill is ${usdc(inv.amount)} USDC but the claimed milestones total ${usdc(scheduled)}`);

  const document = {
    bill: { id: inv.id, kind: inv.kind, amountUSDC: usdc(inv.amount), memo: inv.memo, milestoneIds: inv.milestoneIds },
    contract: contract && { id: contract.id, kind: contract.kind, title: contract.title, totalValueUSDC: usdc(contract.totalValue) },
    milestones: milestones.map((m) => ({
      id: m.id,
      description: m.description,
      scheduledValueUSDC: usdc(m.scheduledValue),
      state: m.state,
      billedOnBill: m.billedInvoiceId ?? null,
      evidence: m.evidenceRefs,
    })),
  };

  const ai = await runStructured({ system: MATCH_PROMPT, schema: MATCH_SCHEMA, document, validate: isMatchOutput });
  const modelId = ai?.modelId ?? 'none';
  if (problems.length) {
    return { result: 'MISMATCH', reasons: [`Rule check failed: ${problems[0]}`, ...problems.slice(1), ...(ai?.output.reasons ?? [])], modelId };
  }
  if (!ai) return { result: 'UNSURE', reasons: ['The matching agent could not produce a result; a person should review this bill'], modelId };
  return { ...ai.output, modelId };
}
