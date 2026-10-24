/**
 * Defines contracts (prime contract agency → prime, or subcontract prime → sub linked to it), the deal that must be signed before work starts, signatures, and agent mandates.
 *
 * Inputs:
 * - createDeal / signDeal / signMandate reducers
 *
 * Outputs:
 * - contract rows: kind (PRIME_CONTRACT | SUBCONTRACT), payerOrgId, payeeOrgId, parentContractId, totalValue
 * - deal rows: state DRAFT → AWAITING_SIGNATURES → ACTIVE → CLOSED
 * - dealSignature rows: one per party org
 * - mandate rows: agentId, scope, spend limits, expiry; checked by every agent-facing reducer
 */

import { t, table } from 'spacetimedb/server';

export const contract = table(
  { name: 'contract' },
  {
    id: t.u64().primaryKey().autoInc(),
    kind: t.string(),
    payerOrgId: t.u64().index('btree'),
    payeeOrgId: t.u64().index('btree'),
    parentContractId: t.option(t.u64()),
    title: t.string(),
    // micro-USDC
    totalValue: t.u64(),
    createdAt: t.timestamp(),
  }
);

export const deal = table(
  { name: 'deal' },
  {
    id: t.u64().primaryKey().autoInc(),
    contractId: t.u64().unique(),
    state: t.string(),
    createdBy: t.identity(),
    createdAt: t.timestamp(),
    activatedAt: t.option(t.timestamp()),
  }
);

export const dealSignature = table(
  { name: 'deal_signature' },
  {
    id: t.u64().primaryKey().autoInc(),
    dealId: t.u64().index('btree'),
    orgId: t.u64(),
    signer: t.identity(),
    signedAt: t.timestamp(),
  }
);

export const mandate = table(
  { name: 'mandate' },
  {
    id: t.u64().primaryKey().autoInc(),
    dealId: t.u64().index('btree'),
    orgId: t.u64(),
    agentId: t.string(),
    // Comma-separated Scope values, e.g. "match,verify,risk_review"
    scope: t.string(),
    perCallLimit: t.u64(),
    sessionLimit: t.u64(),
    spent: t.u64(),
    expiresAt: t.timestamp(),
    signedBy: t.identity(),
    signedAt: t.timestamp(),
    revoked: t.bool(),
  }
);
