/**
 * Live x402 smoke test on Base Sepolia + CRS sandbox: starts the seller, then the agent pays for one matched and one changed-wallet check.
 *
 * Inputs:
 * - .env.local (CDP_API_KEY_*, CDP_WALLET_SECRET, X402_PAY_TO, GOVFLOW_*_ADDRESS, CRS_*, IDENTITY_HASH_KEY)
 *
 * Outputs:
 * - Result, BaseScan link and USDC balances per call; non-zero exit if a result or receipt is wrong
 *
 * Run: cd api && npm run x402:smoke
 */

import { CdpClient } from '@coinbase/cdp-sdk';
import { NETWORK, USDC_BASE_SEPOLIA, requireAddress } from '../config.ts';
import { VERIFICATION_URL } from './allowlist.ts';
import { createAgentPayer } from './client.ts';
import { createVerificationApp, demoPayees, type VerificationResult } from './server.ts';

const cdp = new CdpClient();
async function usdc(address: string): Promise<string> {
  const { balances } = await cdp.evm.listTokenBalances({ address: address as `0x${string}`, network: NETWORK });
  const b = balances.find((x) => x.token.contractAddress.toLowerCase() === USDC_BASE_SEPOLIA.toLowerCase());
  return b ? (Number(b.amount.amount) / 10 ** b.amount.decimals).toFixed(6) : '0.000000';
}

const verifier = requireAddress('X402_PAY_TO');
const app = await createVerificationApp(demoPayees());
const httpServer = app.listen(4021);
const agent = await createAgentPayer();
console.log(`agent ${agent.address} -> verifier ${verifier}`);
console.log(`before: agent ${await usdc(agent.address)} USDC, verifier ${await usdc(verifier)} USDC\n`);

const cases = [
  { label: 'wallet on file', invoiceId: 'prime', want: 'CLEAR' },
  { label: 'changed wallet', invoiceId: 'impostor', want: 'FROZEN' },
];

let failures = 0;
for (const [i, c] of cases.entries()) {
  const { status, body, receipt } = await agent.payAndPost<VerificationResult>(
    VERIFICATION_URL,
    { invoiceId: c.invoiceId },
    `smoke-${Date.now()}-${i}`
  );
  const ok = status === 200 && body.paymentStatus === c.want && !!receipt;
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${c.label}: HTTP ${status} ${body.paymentStatus} (want ${c.want}) ${body.decision} [${body.reasons.join(', ')}]`);
  console.log(`     ${receipt ? `https://sepolia.basescan.org/tx/${receipt.transaction}` : 'no payment receipt'}`);
}

// CDP balance indexing lags the chain by a few seconds.
await new Promise((r) => setTimeout(r, 5000));
console.log(`\nafter:  agent ${await usdc(agent.address)} USDC, verifier ${await usdc(verifier)} USDC`);
httpServer.close();
process.exit(failures ? 1 : 0);
