/**
 * End-to-end smoke test against the shared database: walks one small bill from evidence to SETTLED, with `npm start` doing the outside work.
 *
 * Inputs:
 * - Level: `sub` (prime pays sub 0.15, default) or `prime` (agency pays prime 0.40); add `fraud` to run the
 *   wallet-change email beat (freeze → risk case file → approvers reject the change) before approval
 * - seed/.demo-tokens.json demo logins, the service token, a running API
 *
 * Outputs:
 * - One line per step; the final payment row with its tx hash; non-zero exit if the bill doesn't settle
 *
 * Bills the next unbilled milestone at that level, so it runs once per milestone (reseed to start over).
 * Run: cd api && npm start (in another terminal), then npm run payout:smoke [-- prime [fraud]]
 */

import { readFileSync } from 'node:fs';
import { connect, connectService, subscribe } from '../stdb.ts';
import { waitFor } from '../waitFor.ts';

const LEVELS = {
  sub: { contractKind: 'SUBCONTRACT', amount: 150_000n, preparer: 'subOwner', inspector: 'primeInspector',
    approvers: ['primeCtrl1', 'primeCtrl2'], matcher: 'prime-agent' },
  prime: { contractKind: 'PRIME_CONTRACT', amount: 400_000n, preparer: 'primeAP', inspector: 'agencyPM',
    approvers: ['agencyFin1', 'agencyFin2'], matcher: 'agency-agent' },
} as const;
const level = LEVELS[(process.argv[2] ?? 'sub') as keyof typeof LEVELS];
const fraud = process.argv.includes('fraud');
if (!level) throw new Error('level must be "sub" or "prime"');
const usdc = (n: bigint) => (Number(n) / 1e6).toFixed(2);

const tokens = JSON.parse(readFileSync(new URL('../../../seed/.demo-tokens.json', import.meta.url), 'utf8')) as Record<
  string,
  { token: string }
>;
const as = async (who: string) => (await connect(tokens[who]!.token)).conn;

const [sub, inspector, ctrl1, ctrl2, svc] = await Promise.all([
  as(level.preparer),
  as(level.inspector),
  as(level.approvers[0]),
  as(level.approvers[1]),
  connectService().then((s) => s.conn),
]);
await subscribe(sub, ['SELECT * FROM my_contract', 'SELECT * FROM my_milestone', 'SELECT * FROM my_invoice', 'SELECT * FROM my_payment']);
await subscribe(ctrl1, ['SELECT * FROM my_agent_finding', 'SELECT * FROM my_invoice']);
const db = sub.db;

const contract = [...db.myContract.iter()].find((c) => c.kind === level.contractKind);
if (!contract) throw new Error(`no ${level.contractKind} visible to ${level.preparer}`);
const ms = [...db.myMilestone.iter()].find((m) => m.contractId === contract.id && m.billedInvoiceId === undefined);
if (!ms) throw new Error('no unbilled milestone left at this level; reseed to run again');
const invoiceState = (id: bigint) => [...db.myInvoice.iter()].find((i) => i.id === id)?.state;
const step = (s: string) => console.log(`- ${s}`);

if (ms.state !== 'ACCEPTED') {
  if (ms.state !== 'SUBMITTED_FOR_INSPECTION') {
    await sub.reducers.submitEvidence({ milestoneId: ms.id, evidenceRefs: 'smoke:conduit-photos' });
    step(`${level.preparer} submitted evidence for milestone ${ms.id}`);
  }
  await waitFor('evidence', () => ([...db.myMilestone.iter()].find((m) => m.id === ms.id)?.state === 'SUBMITTED_FOR_INSPECTION' || undefined));
  await inspector.reducers.inspectMilestone({ milestoneId: ms.id, accept: true, note: 'smoke: inspected' });
  step(`${level.inspector} accepted the milestone`);
  await waitFor('acceptance', () => ([...db.myMilestone.iter()].find((m) => m.id === ms.id)?.state === 'ACCEPTED' || undefined));
}

const before = new Set([...db.myInvoice.iter()].map((i) => i.id));
await sub.reducers.draftInvoice({ contractId: contract.id, milestoneIds: [ms.id], amount: level.amount, memo: `smoke: ${usdc(level.amount)} USDC bill`, agentId: '' });
const inv = await waitFor('draft', () => [...db.myInvoice.iter()].find((i) => !before.has(i.id)));
await sub.reducers.submitInvoice({ invoiceId: inv.id });
step(`${level.preparer} drafted and submitted bill ${inv.id} for ${usdc(level.amount)} USDC`);

step(`waiting for ${level.matcher} (Claude) to match it, then the x402 + CRS payee check`);
const matched = await waitFor('match', () => [...db.myInvoice.iter()].find((i) => i.id === inv.id && i.matchResult !== ''), 120_000);
step(`${level.matcher} match: ${matched.matchResult}: ${matched.matchReasons.split('\n')[0]}`);
if (matched.matchResult !== 'MATCHED') process.exit(1);

const afterCheck = await waitFor('payee check', () => {
  const s = invoiceState(inv.id);
  return s === 'FINANCE_REVIEW' || s === 'PAYMENT_FROZEN' ? s : undefined;
}, 180_000);
step(`payee check done: bill is ${afterCheck}`);
if (afterCheck !== 'FINANCE_REVIEW') process.exit(1);

if (fraud) {
  const impostor = process.env.GOVFLOW_IMPOSTOR_ADDRESS!;
  // Email intake: the service files the change on the payer's behalf, as the inbox integration would.
  await svc.reducers.changeBeneficiary({
    invoiceId: inv.id,
    requestedWallet: impostor,
    source: 'EMAIL',
    note: `From: accounts@okafor-builders.co\nURGENT - we changed our banking. Please pay this pay application to our new wallet ${impostor} today to avoid late fees. Thanks, Victor Anand, Accounts Receivable`,
  });
  step('impostor email filed a wallet change; waiting for the freeze and the risk case file');
  await waitFor('freeze', () => (invoiceState(inv.id) === 'PAYMENT_FROZEN' || undefined));
  const rc = await waitFor('risk case', () => [...ctrl1.db.myAgentFinding.iter()].find((f) => f.kind === 'RISK_CASE' && f.subjectId === inv.id), 240_000);
  step(`risk case (${rc.modelId}): ${rc.result} [${rc.flags}]`);
  console.log(rc.body.split('\n').map((l) => `    ${l}`).join('\n'));
  await ctrl1.reducers.voteUnfreeze({ invoiceId: inv.id, vote: 'REJECT_CHANGE', reason: 'smoke: impostor failed CRS' });
  await ctrl2.reducers.voteUnfreeze({ invoiceId: inv.id, vote: 'REJECT_CHANGE', reason: 'smoke: confirmed with prime by phone' });
  await waitFor('unfreeze', () => (invoiceState(inv.id) === 'FINANCE_REVIEW' || undefined));
  step('two approvers rejected the change; bill back in FINANCE_REVIEW on the original wallet');
}

await ctrl1.reducers.approveInvoice({ invoiceId: inv.id, reason: 'smoke: approver 1' });
await ctrl2.reducers.approveInvoice({ invoiceId: inv.id, reason: 'smoke: approver 2' });
step(`${level.approvers.join(' and ')} approved; waiting for the payout`);

const final = await waitFor('payout', () => {
  const s = invoiceState(inv.id);
  return s === 'SETTLED' || s === 'FAILED' ? s : undefined;
}, 240_000);
const p = [...db.myPayment.iter()].find((x) => x.invoiceId === inv.id);
step(`bill ${final}; payment ${p?.state} ${p?.simulated ? '(SIMULATED)' : ''} ${p?.txHash ?? ''}`);
if (p && !p.simulated && p.txHash) console.log(`  https://sepolia.basescan.org/tx/${p.txHash}`);
process.exit(final === 'SETTLED' ? 0 : 1);
