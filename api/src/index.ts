/**
 * Boots the service: loads config, connects to SpacetimeDB, starts the agent runner, x402 seller and payout watcher.
 *
 * Inputs:
 * - config.ts values
 *
 * Outputs:
 * - Running subscriptions and an Express server on :4021
 *
 * Connecting only authenticates. All writes happen afterwards: on every row change (and on a timer, which also
 * covers restarts) each worker sweeps the cache for bills that need outside work and records the result.
 *
 * Run: cd api && npm start
 */

import { createAgentRunner } from './agents/runner.ts';
import { NETWORK } from './config.ts';
import { connectService, subscribe } from './stdb.ts';
import { createAgentPayer } from './x402/client.ts';
import { createPayeeCheckService } from './x402/payeeCheck.ts';
import { createVerificationApp } from './x402/server.ts';
import { createPayoutService, payoutAdapterFromEnv } from './payout/service.ts';

const SWEEP_MS = 5_000;

const svc = await connectService();
if (svc.firstRun) console.warn('New service identity; the module owner must approve it with approveServiceRole.');
await subscribe(svc.conn, [
  'SELECT * FROM organization',
  'SELECT * FROM my_deal',
  'SELECT * FROM my_mandate',
  'SELECT * FROM my_invoice',
  'SELECT * FROM my_payment',
  'SELECT * FROM my_x402_receipt',
  'SELECT * FROM my_contract',
  'SELECT * FROM my_milestone',
  'SELECT * FROM my_beneficiary_change',
  'SELECT * FROM my_agent_finding',
]);
const db = svc.conn.db;

// The x402 seller resolves a bill's payee from the cache, so callers only ever send a bill id.
const app = await createVerificationApp((invoiceId) => {
  const inv = [...db.myInvoice.iter()].find((i) => String(i.id) === invoiceId);
  const payee = inv && [...db.organization.iter()].find((o) => o.id === inv.payeeOrgId);
  return inv && payee
    ? { legalName: payee.name, beneficiaryWallet: inv.beneficiaryWallet, payoutWallet: payee.payoutWallet }
    : undefined;
});
await new Promise<void>((resolve) => app.listen(4021, () => resolve()));

const adapter = payoutAdapterFromEnv();
// One payer for every agent, so the 0.10 per-session x402 cap covers all their paid checks together.
const payer = await createAgentPayer();
const agents = createAgentRunner(svc.conn, payer);
const payeeChecks = createPayeeCheckService(svc.conn, payer);
const payouts = createPayoutService(svc.conn, adapter);

const sweep = () => {
  agents.sweep();
  payeeChecks.sweep();
  payouts.sweep();
};
db.myInvoice.onInsert(sweep);
db.myPayment.onInsert(sweep);
db.myBeneficiaryChange.onInsert(sweep);
setInterval(sweep, SWEEP_MS);
sweep();

console.log(
  `GovFlow API up: service ${svc.identity.toHexString().slice(0, 12)}…, x402 seller on :4021, ` +
    `payouts ${adapter.simulated ? 'SIMULATED' : `on ${NETWORK}`}`
);
