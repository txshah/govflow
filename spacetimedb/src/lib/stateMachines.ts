/**
 * Allowed-transition tables for deal, milestone, invoice and payment states, mirroring PROJECT.md §6.
 *
 * Inputs:
 * - Machine name, current state, requested next state
 *
 * Outputs:
 * - Nothing if allowed; throws SenderError if the transition is not in the table
 */

import { SenderError } from 'spacetimedb/server';
import {
  DealState as D,
  InvoiceState as I,
  MilestoneState as M,
  PaymentState as P,
} from './constants';

const machines: Record<string, Record<string, string[]>> = {
  deal: {
    [D.DRAFT]: [D.AWAITING_SIGNATURES],
    [D.AWAITING_SIGNATURES]: [D.ACTIVE],
    [D.ACTIVE]: [D.CLOSED],
  },
  milestone: {
    [M.NOT_STARTED]: [M.IN_PROGRESS],
    [M.IN_PROGRESS]: [M.SUBMITTED_FOR_INSPECTION],
    [M.SUBMITTED_FOR_INSPECTION]: [M.ACCEPTED, M.REJECTED],
    [M.REJECTED]: [M.SUBMITTED_FOR_INSPECTION],
  },
  invoice: {
    [I.DRAFT]: [I.SUBMITTED],
    [I.SUBMITTED]: [I.MATCHED, I.PAYMENT_FROZEN, I.REJECTED],
    [I.MATCHED]: [I.FINANCE_REVIEW, I.PAYMENT_FROZEN, I.REJECTED],
    [I.FINANCE_REVIEW]: [I.APPROVED, I.REJECTED, I.PAYMENT_FROZEN],
    [I.REJECTED]: [I.DRAFT],
    [I.APPROVED]: [I.PAYMENT_QUEUED, I.PAYMENT_FROZEN],
    // Freezing a queued bill is allowed only until its payment is SUBMITTED onchain.
    [I.PAYMENT_QUEUED]: [I.SETTLED, I.FAILED, I.PAYMENT_FROZEN],
    [I.PAYMENT_FROZEN]: [I.FINANCE_REVIEW, I.REJECTED],
  },
  payment: {
    [P.CREATED]: [P.POLICY_CHECKED, P.FAILED],
    [P.POLICY_CHECKED]: [P.AUTHORIZED, P.FAILED],
    [P.AUTHORIZED]: [P.SUBMITTED, P.FAILED],
    [P.SUBMITTED]: [P.CONFIRMED, P.FAILED],
  },
};

export function canTransition(machine: string, from: string, to: string): boolean {
  return (machines[machine]?.[from] ?? []).includes(to);
}

export function assertTransition(machine: string, from: string, to: string) {
  if (!canTransition(machine, from, to))
    throw new SenderError(`illegal ${machine} transition ${from} → ${to}`);
}
