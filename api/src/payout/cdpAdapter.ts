/**
 * Real testnet adapter: USDC transfer from the payer's CDP treasury wallet (govflow-agency-treasury or govflow-prime-treasury) on Base Sepolia, waiting for the receipt.
 *
 * Inputs:
 * - from wallet name, to address, amount (6 decimals), idempotency key
 *
 * Outputs:
 * - txHash + receipt status
 */

import { createHash } from 'node:crypto';
import { CdpClient } from '@coinbase/cdp-sdk';
import { createPublicClient, encodeFunctionData, erc20Abi, http, type Hex } from 'viem';
import { baseSepolia } from 'viem/chains';
import { BASE_SEPOLIA_CHAIN_ID, NETWORK, USDC_BASE_SEPOLIA, assertSmallPayout } from '../config.ts';
import type { PayoutAdapter, Transfer } from './simulatedAdapter.ts';

if (baseSepolia.id !== BASE_SEPOLIA_CHAIN_ID) throw new Error('viem chain is not Base Sepolia');

// CDP expects UUID-shaped idempotency keys; derive one deterministically so a retry after a crash reuses it.
function cdpIdempotencyKey(key: string): string {
  const h = createHash('sha256').update(`govflow-payout|${key}`).digest('hex');
  return [h.slice(0, 8), h.slice(8, 12), `4${h.slice(13, 16)}`, ((parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16) + h.slice(17, 20), h.slice(20, 32)].join('-');
}

export function createCdpAdapter(): PayoutAdapter {
  const cdp = new CdpClient();
  const chain = createPublicClient({ chain: baseSepolia, transport: http() });

  return {
    simulated: false,

    async usdcBalance(address) {
      const { balances } = await cdp.evm.listTokenBalances({ address: address as Hex, network: NETWORK });
      const b = balances.find((x) => x.token.contractAddress.toLowerCase() === USDC_BASE_SEPOLIA.toLowerCase());
      return b ? b.amount.amount : 0n;
    },

    async send({ from, to, atomic, idempotencyKey }: Transfer) {
      assertSmallPayout(atomic);
      // Only wallets this CDP project holds can pay; getAccount throws for anything else.
      const account = await cdp.evm.getAccount({ address: from as Hex });
      const { transactionHash } = await cdp.evm.sendTransaction({
        address: account.address,
        network: NETWORK,
        transaction: {
          to: USDC_BASE_SEPOLIA as Hex,
          data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [to as Hex, atomic] }),
        },
        idempotencyKey: cdpIdempotencyKey(idempotencyKey),
      });
      return transactionHash;
    },

    async confirm(txHash) {
      const r = await chain.waitForTransactionReceipt({ hash: txHash as Hex, timeout: 120_000 });
      return r.status === 'success';
    },
  };
}
