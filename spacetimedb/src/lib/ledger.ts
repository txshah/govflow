/**
 * Double-entry helpers that write balanced ledger entries on the right organization's books when a bill is approved and when its payout confirms.
 *
 * Inputs:
 * - The invoice row, the event (APPROVED | PAYOUT_CONFIRMED), optional txHash
 *
 * Outputs:
 * - ledgerEntry rows (each row is one balanced debit/credit pair)
 */

import type { Ctx } from './ctx';
import { InvoiceKind } from './constants';

type Inv = { id: bigint; kind: string; payerOrgId: bigint; payeeOrgId: bigint; amount: bigint };

function post(ctx: Ctx, orgId: bigint, inv: Inv, debit: string, credit: string, txHash: string, memo: string) {
  ctx.db.ledgerEntry.insert({
    id: 0n,
    orgId,
    invoiceId: inv.id,
    debit,
    credit,
    amount: inv.amount,
    txHash,
    memo,
    at: ctx.timestamp,
  });
}

export function postApproval(ctx: Ctx, inv: Inv) {
  if (inv.kind === InvoiceKind.PAY_APPLICATION) {
    post(ctx, inv.payerOrgId, inv, 'Construction costs', 'Accounts payable', '', 'Pay application approved');
    post(ctx, inv.payeeOrgId, inv, 'Accounts receivable', 'Contract revenue', '', 'Pay application approved by agency');
  } else {
    post(ctx, inv.payerOrgId, inv, 'Subcontract costs', 'Accounts payable', '', 'Sub invoice approved');
  }
}

export function postPayout(ctx: Ctx, inv: Inv, txHash: string) {
  post(ctx, inv.payerOrgId, inv, 'Accounts payable', 'USDC treasury', txHash, 'Payout confirmed');
  if (inv.kind === InvoiceKind.PAY_APPLICATION) {
    post(ctx, inv.payeeOrgId, inv, 'USDC treasury', 'Accounts receivable', txHash, 'Payment received from agency');
  }
}
