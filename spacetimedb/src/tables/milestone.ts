/**
 * Defines milestones: one row per schedule-of-values line on either contract, tracking evidence, the paying side's review, and which bill it was billed on.
 *
 * Inputs:
 * - createDeal (creates the lines), submitEvidence, inspectMilestone, submitInvoice
 *
 * Outputs:
 * - milestone rows: contractId, lineNo, scheduledValue, state, evidenceRefs, reviewer decision, billedInvoiceId
 */

import { t, table } from 'spacetimedb/server';

export const milestone = table(
  { name: 'milestone' },
  {
    id: t.u64().primaryKey().autoInc(),
    contractId: t.u64().index('btree'),
    lineNo: t.u32(),
    description: t.string(),
    // micro-USDC
    scheduledValue: t.u64(),
    state: t.string(),
    evidenceRefs: t.string(),
    submittedBy: t.option(t.identity()),
    reviewNote: t.string(),
    reviewedBy: t.option(t.identity()),
    reviewedAt: t.option(t.timestamp()),
    billedInvoiceId: t.option(t.u64()),
  }
);
