/**
 * Finds the active mandate that lets an agent act for an organization on a deal, from the service's cache.
 *
 * Inputs:
 * - Deal id, acting org id, scope (match, verify, risk_review, …)
 *
 * Outputs:
 * - The mandate row, or undefined; the module re-checks the same rule on every reducer call
 */

import type { DbConnection } from '../module_bindings/index.ts';

export function findMandate(conn: DbConnection, dealId: bigint, orgId: bigint, scope: string) {
  const now = BigInt(Date.now()) * 1000n;
  return [...conn.db.myMandate.iter()].find(
    (m) =>
      m.dealId === dealId &&
      m.orgId === orgId &&
      !m.revoked &&
      m.expiresAt.microsSinceUnixEpoch > now &&
      m.scope.split(',').map((s) => s.trim()).includes(scope)
  );
}

export function dealForContract(conn: DbConnection, contractId: bigint) {
  return [...conn.db.myDeal.iter()].find((d) => d.contractId === contractId);
}
