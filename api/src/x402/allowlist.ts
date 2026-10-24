/**
 * Server-side allowlist of URLs agents may pay; AI-chosen URLs are rejected.
 *
 * Inputs:
 * - Requested URL
 *
 * Outputs:
 * - Allowed / throws
 */

export const VERIFICATION_URL =
  process.env.X402_VERIFICATION_URL ?? 'http://localhost:4021/api/verification/contractor';

const ALLOWED = new Set([VERIFICATION_URL]);

export class NotAllowlistedError extends Error {}

export function assertAllowlisted(url: string): void {
  // Exact match only: no prefixes, query strings or redirects to other hosts.
  if (!ALLOWED.has(url)) throw new NotAllowlistedError(`x402 URL not allowlisted: ${url}`);
}
