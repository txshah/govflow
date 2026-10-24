/**
 * `freezeInvoice()` moves a bill to PAYMENT_FROZEN, starts a new approval round so old votes no longer count, and puts any not-yet-submitted payout on hold.
 *
 * Inputs:
 * - The invoice row and a FreezeReason
 *
 * Outputs:
 * - invoice → PAYMENT_FROZEN with freezeReason, frozenAt, approvalRound + 1
 * - Pending payment rows → FAILED (note HOLD); throws if a payout is already onchain
 */

import { SenderError } from 'spacetimedb/server';
import type { Ctx, InvoiceRow } from './ctx';
import { InvoiceState, PaymentState } from './constants';
import { assertTransition } from './stateMachines';
import { appendAudit } from './audit';

export function freezeInvoice(ctx: Ctx, inv: InvoiceRow, reason: string) {
  if (inv.state === InvoiceState.PAYMENT_FROZEN) {
    appendAudit(ctx, 'freezeInvoice', 'invoice', inv.id, `already frozen; also ${reason}`);
    return inv;
  }
  assertTransition('invoice', inv.state, InvoiceState.PAYMENT_FROZEN);
  for (const p of ctx.db.payment.invoiceId.filter(inv.id)) {
    if (p.state === PaymentState.SUBMITTED || p.state === PaymentState.CONFIRMED)
      throw new SenderError('payout already submitted onchain; too late to freeze');
    if (p.state !== PaymentState.FAILED)
      ctx.db.payment.idempotencyKey.update({ ...p, state: PaymentState.FAILED, note: 'HOLD', updatedAt: ctx.timestamp });
  }
  const next = {
    ...inv,
    state: InvoiceState.PAYMENT_FROZEN,
    freezeReason: reason,
    frozenAt: ctx.timestamp,
    approvalRound: inv.approvalRound + 1,
  };
  ctx.db.invoice.id.update(next);
  appendAudit(ctx, 'freezeInvoice', 'invoice', inv.id, reason);
  return next;
}
