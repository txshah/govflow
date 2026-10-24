/**
 * Runs for the paying org's agent and compares a sub invoice or pay application to its contract and accepted milestones, returning MATCHED, MISMATCH or UNSURE with reasons.
 *
 * Inputs:
 * - Invoice or pay application, its contract, accepted milestones, amounts already billed
 *
 * Outputs:
 * - recordMatch call (MISMATCH freezes, UNSURE routes to a human)
 * - Request for a paid CRS check on the payee via x402/client.ts
 */

// TODO: implement
export {};
