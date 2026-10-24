/**
 * Reads and validates env vars and hardcodes the safety limits (network, spend caps, allowlist).
 *
 * Inputs:
 * - process.env (CRS_*, CDP_*, ANTHROPIC_API_KEY, CLAUDE_MODEL, X402_PAY_TO, STDB_*)
 *
 * Outputs:
 * - Typed config object; crashes on startup if anything is missing or the network isn't Base Sepolia
 */

// Base Sepolia only. These are constants, not env vars, so nothing can point us at mainnet.
export const NETWORK = 'base-sepolia';
export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const BASE_SEPOLIA_CAIP2 = `eip155:${BASE_SEPOLIA_CHAIN_ID}` as const;
export const USDC_BASE_SEPOLIA = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

// Spend caps, in USDC atomic units (6 decimals).
export const VERIFICATION_PRICE = '$0.01';
export const MAX_PER_CALL_ATOMIC = 10_000n; // 0.01 USDC
export const MAX_PER_SESSION_ATOMIC = 100_000n; // 0.10 USDC

// Demo payouts are deliberately tiny (e.g. 0.40 pay application, 0.15 sub invoice): the faucet
// gives only 10 test USDC per project per day. Every real testnet transfer must pass this check.
export const MAX_PAYOUT_ATOMIC = 1_000_000n; // 1.00 USDC

export function assertSmallPayout(atomic: bigint): void {
  if (atomic <= 0n || atomic > MAX_PAYOUT_ATOMIC) {
    throw new Error(`Payout of ${atomic} atomic USDC refused; demo payouts must be between 0 and 1.00 USDC`);
  }
}

export const AGENT_ACCOUNT_NAME = 'govflow-agent';

if (process.env.CDP_NETWORK && process.env.CDP_NETWORK !== NETWORK) {
  throw new Error(`CDP_NETWORK is ${process.env.CDP_NETWORK}; GovFlow only runs on ${NETWORK}`);
}

export function requireAddress(name: string): string {
  const v = process.env[name]?.trim();
  if (!v || !/^0x[0-9a-fA-F]{40}$/.test(v)) throw new Error(`${name} missing or not an EVM address`);
  return v;
}

// TODO: validate the remaining CRS_*, ANTHROPIC_*, STDB_* vars here once index.ts boots everything.
