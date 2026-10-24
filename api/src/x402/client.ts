/**
 * Agent buyer that pays for verification calls, enforcing 0.01/call, 0.10/session and one idempotency key per charge.
 *
 * Inputs:
 * - Allowlisted endpoint, request body, session spend so far
 *
 * Outputs:
 * - Verification result
 * - recordX402Receipt call
 * - Refusal if over cap or URL not allowlisted
 */

import { CdpClient } from '@coinbase/cdp-sdk';
import { applySpendControls, fromCdpEvmAccount } from '@coinbase/cdp-sdk/x402';
import { x402Client, x402HTTPClient } from '@x402/core/client';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { wrapFetchWithPayment } from '@x402/fetch';
import {
  AGENT_ACCOUNT_NAME,
  BASE_SEPOLIA_CAIP2,
  MAX_PER_CALL_ATOMIC,
  MAX_PER_SESSION_ATOMIC,
  USDC_BASE_SEPOLIA,
  requireAddress,
} from '../config.ts';
import { assertAllowlisted } from './allowlist.ts';

export class DuplicateChargeError extends Error {}

export type X402Receipt = {
  idempotencyKey: string;
  transaction: string;
  network: string;
  payer: string | undefined;
};

export type PaidResult<T> = { status: number; body: T; receipt: X402Receipt | null };

export async function createAgentPayer() {
  const cdp = new CdpClient();
  // getAccount, not getOrCreate: the agent may only pay from the wallet we provisioned.
  const account = await cdp.evm.getAccount({ name: AGENT_ACCOUNT_NAME });

  const client = new x402Client();
  registerExactEvmScheme(client, { signer: fromCdpEvmAccount(account), networks: [BASE_SEPOLIA_CAIP2] });
  // SDK guardrails: caps, Base Sepolia only, USDC only, verifier wallet only.
  applySpendControls(client, {
    maxAmountPerPayment: { atomic: MAX_PER_CALL_ATOMIC, asset: USDC_BASE_SEPOLIA },
    maxCumulativeSpend: { atomic: MAX_PER_SESSION_ATOMIC, asset: USDC_BASE_SEPOLIA },
    maxCumulativeSpendWindow: '24h',
    allowedNetworks: [BASE_SEPOLIA_CAIP2],
    allowedAssets: [USDC_BASE_SEPOLIA],
    allowedPayees: [requireAddress('X402_PAY_TO')],
  });

  const pay = wrapFetchWithPayment(globalThis.fetch, client);
  const http = new x402HTTPClient(client);
  const usedKeys = new Set<string>();

  async function payAndPost<T>(url: string, body: unknown, idempotencyKey: string): Promise<PaidResult<T>> {
    assertAllowlisted(url);
    if (usedKeys.has(idempotencyKey)) throw new DuplicateChargeError(`Already charged for ${idempotencyKey}`);
    usedKeys.add(idempotencyKey);

    const res = await pay(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey },
      body: JSON.stringify(body),
    });
    let receipt: X402Receipt | null = null;
    if (res.headers.get('payment-response')) {
      const settle = http.getPaymentSettleResponse((name) => res.headers.get(name));
      if (settle.success) {
        receipt = { idempotencyKey, transaction: settle.transaction, network: settle.network, payer: settle.payer };
      }
    }
    // TODO: recordX402Receipt reducer once the SpacetimeDB service connection is wired.
    return { status: res.status, body: (await res.json()) as T, receipt };
  }

  return { address: account.address, payAndPost };
}
