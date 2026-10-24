/**
 * Default fallback adapter that fakes a settled transfer when the faucet or testnet is down, clearly labeled simulated.
 *
 * Inputs:
 * - Same as cdpAdapter
 *
 * Outputs:
 * - Fake txHash flagged simulated: true
 */

import { createHash } from 'node:crypto';
import { assertSmallPayout } from '../config.ts';

export type Transfer = { from: string; to: string; atomic: bigint; idempotencyKey: string };

export type PayoutAdapter = {
  simulated: boolean;
  usdcBalance(address: string): Promise<bigint>;
  send(t: Transfer): Promise<string>;
  confirm(txHash: string): Promise<boolean>;
};

export function createSimulatedAdapter(): PayoutAdapter {
  return {
    simulated: true,
    // Treasuries are assumed funded; the real balance check runs in the cdp adapter.
    async usdcBalance() {
      return 1n << 64n;
    },
    async send({ atomic, idempotencyKey }) {
      assertSmallPayout(atomic);
      // Deterministic per key, so a retry "sends" the same fake transaction.
      return `0x${createHash('sha256').update(`simulated|${idempotencyKey}`).digest('hex')}`;
    },
    async confirm() {
      return true;
    },
  };
}
