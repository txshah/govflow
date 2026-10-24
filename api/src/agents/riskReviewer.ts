/**
 * Writes a fraud case file when a beneficiary change is requested at either level (e.g. a fake prime emailing the agency).
 *
 * Inputs:
 * - Change request (e.g. the 'we changed our wallet' email), payment history, CRS attestations
 *
 * Outputs:
 * - Risk flags + case file row (cannot unfreeze or pay)
 *
 * Steps, as the payer's agent: pay 0.01 over x402 to re-verify the real payee (a PASS here is what lets the
 * approvers unfreeze), check the identity the request claims to come from, then have Claude write the case file.
 * If Claude can't, a rule-based case file is written instead, so the approvers always see one.
 */

import { MAX_PER_CALL_ATOMIC } from '../config.ts';
import type { Attestation } from '../crs/attestation.ts';
import { PERSONAS } from '../crs/personas.ts';
import { verifyPerson } from '../crs/verify.ts';
import type { DbConnection } from '../module_bindings/index.ts';
import type { BeneficiaryChange } from '../module_bindings/types.ts';
import { recordVerification } from '../stdb.ts';
import { VERIFICATION_URL } from '../x402/allowlist.ts';
import type { createAgentPayer } from '../x402/client.ts';
import type { VerificationResult } from '../x402/server.ts';
import { runStructured } from './claude.ts';
import { dealForContract, findMandate } from './mandates.ts';
import { RISK_PROMPT } from './prompts.ts';
import { RISK_SCHEMA, isRiskOutput, type RiskOutput } from './schemas.ts';

type AgentPayer = Awaited<ReturnType<typeof createAgentPayer>>;

/** The sandbox persona whose full name appears in the message, i.e. who the request claims to be from. */
function claimedSender(note: string) {
  const text = note.toUpperCase();
  return Object.entries(PERSONAS).find(([, p]) => text.includes(`${p.firstName} ${p.lastName}`));
}

export async function reviewChange(conn: DbConnection, payer: AgentPayer, change: BeneficiaryChange) {
  const db = conn.db;
  const inv = [...db.myInvoice.iter()].find((i) => i.id === change.invoiceId);
  if (!inv) return;
  const deal = dealForContract(conn, inv.contractId);
  const m = deal && findMandate(conn, deal.id, inv.payerOrgId, 'risk_review');
  if (!deal || !m) return console.log(`risk review change ${change.id}: skipped (no risk_review mandate for the payer)`);
  const log = (status: string, detail: string) =>
    conn.reducers.logAgentAction({ agentId: m.agentId, dealId: deal.id, orgId: inv.payerOrgId, scope: 'risk_review', step: 'risk_review', status, detail });

  await log('started', `wallet change on bill ${inv.id} via ${change.source}; re-verifying the payee`);

  // 1. Paid re-check of the payee on file. The module only lets approvers unfreeze after a PASS since the freeze.
  const key = `reverify-${change.id}`;
  let payeeCheck: VerificationResult | null = null;
  let x402Tx = '';
  const verify = findMandate(conn, deal.id, inv.payerOrgId, 'verify');
  if (verify && verify.spent + MAX_PER_CALL_ATOMIC <= verify.sessionLimit) {
    const { status, body, receipt } = await payer.payAndPost<VerificationResult>(VERIFICATION_URL, { invoiceId: String(inv.id) }, key);
    if (status === 200 && receipt) {
      payeeCheck = body;
      x402Tx = receipt.transaction;
      await conn.reducers.recordX402Receipt({
        agentId: verify.agentId, dealId: deal.id, orgId: inv.payerOrgId, endpoint: VERIFICATION_URL, amount: MAX_PER_CALL_ATOMIC, paymentRef: key,
      });
      const a: Attestation = {
        subjectId: `org:${inv.payeeOrgId}`, products: body.products, decision: body.decision, passed: body.decision === 'PASS',
        reasons: body.reasons, checkedAt: new Date().toISOString(), identityHash: body.identityHash, requestIds: [], sandbox: true,
      };
      await recordVerification(conn, { subjectType: 'ORG', orgId: inv.payeeOrgId, invoiceId: inv.id }, a);
    }
  }

  // 2. Whoever the message claims to be from. Only the result goes into the case file, never the identity data.
  const sender = claimedSender(change.note);
  const senderCheck = sender ? await verifyPerson(`claimant:${change.id}`, sender[1]) : null;

  const payee = [...db.organization.iter()].find((o) => o.id === inv.payeeOrgId);
  const document = {
    changeRequest: { source: change.source, message: change.note, previousWallet: change.previousWallet, requestedWallet: change.requestedWallet, walletProven: change.walletProofAt !== undefined },
    bill: { id: inv.id, kind: inv.kind, amountUSDC: (Number(inv.amount) / 1e6).toFixed(2), state: inv.state },
    payee: payee && { name: payee.name, payoutWalletOnFile: payee.payoutWallet, verified: payee.verified },
    crs: {
      payeeRecheck: payeeCheck ? { decision: payeeCheck.decision, reasons: payeeCheck.reasons } : 'not run',
      claimedSender: sender
        ? { name: `${sender[1].firstName} ${sender[1].lastName}`, decision: senderCheck!.decision, reasons: senderCheck!.reasons }
        : 'the message does not name a sender we can check',
    },
  };

  const ai = await runStructured({ system: RISK_PROMPT, schema: RISK_SCHEMA, document, validate: isRiskOutput });
  const out: RiskOutput = ai?.output ?? fallbackCase(change, payeeCheck, senderCheck);
  await conn.reducers.recordFinding({
    kind: 'RISK_CASE', subjectType: 'invoice', subjectId: inv.id, agentId: m.agentId, dealId: deal.id, orgId: inv.payerOrgId,
    result: out.risk, body: out.caseFile, flags: out.flags.join(','), modelId: ai?.modelId ?? 'rules',
    inputIds: `invoice:${inv.id},change:${change.id}`,
  });
  await log('done', `${out.risk} risk [${out.flags.join(', ')}]${x402Tx ? `; payee re-check paid, tx ${x402Tx}` : ''}`);
  console.log(`risk review change ${change.id}: ${out.risk} [${out.flags.join(', ')}]`);
}

function fallbackCase(change: BeneficiaryChange, payee: VerificationResult | null, sender: Attestation | null): RiskOutput {
  const flags = [
    change.source !== 'IN_APP' ? 'UNVERIFIED_CHANNEL' : '',
    change.walletProofAt === undefined ? 'NEW_UNPROVEN_WALLET' : '',
    sender && sender.decision !== 'PASS' ? 'CLAIMANT_IDENTITY_FAILED' : '',
  ].filter(Boolean);
  return {
    risk: flags.length >= 2 ? 'HIGH' : flags.length ? 'MEDIUM' : 'LOW',
    flags,
    caseFile:
      `A ${change.source} request asked to redirect this bill from ${change.previousWallet} to ${change.requestedWallet}. ` +
      `CRS re-check of the payee on file: ${payee ? payee.decision : 'not run'}. ` +
      `Identity check on the claimed sender: ${sender ? `${sender.decision} [${sender.reasons.join(', ')}]` : 'no sender named'}. ` +
      `Recommended: reject the change and confirm with the payee through a known contact.`,
  };
}
