/**
 * Defines CRS attestations (results and hashes only, never raw identity data) and x402 receipts for paid verification calls.
 *
 * Inputs:
 * - recordVerification and recordX402Receipt reducers (Node API service identity only)
 *
 * Outputs:
 * - verification rows: subjectType (MEMBER | ORG), orgId, memberIdentity, invoiceId, products, passed, reasons, identityHash, checkedAt, decision (PASS | REVIEW | FAIL)
 * - x402Receipt rows: agentId, mandateId, endpoint, amount, paymentRef (unique = idempotency key)
 */

import { t, table } from 'spacetimedb/server';

export const verification = table(
  { name: 'verification' },
  {
    id: t.u64().primaryKey().autoInc(),
    subjectType: t.string(),
    orgId: t.u64().index('btree'),
    memberIdentity: t.option(t.identity()),
    invoiceId: t.option(t.u64()),
    products: t.string(),
    passed: t.bool(),
    reasons: t.string(),
    identityHash: t.string(),
    checkedAt: t.timestamp(),
    sandbox: t.bool(),
    // Last so Maincloud can auto-migrate; '' on rows written before it existed.
    decision: t.string().default(''),
  }
);

export const x402Receipt = table(
  { name: 'x402_receipt' },
  {
    id: t.u64().primaryKey().autoInc(),
    agentId: t.string(),
    mandateId: t.u64().index('btree'),
    endpoint: t.string(),
    // micro-USDC
    amount: t.u64(),
    paymentRef: t.string().unique(),
    at: t.timestamp(),
  }
);
