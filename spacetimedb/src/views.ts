/**
 * Per-organization views: the only way clients read private tables. Each `my_*` view returns the rows the caller is allowed to see, so every room is private and the payment envelope is shared only between payer and payee.
 *
 * Inputs:
 * - ctx.sender (a member's browser identity, or the Node API service identity)
 *
 * Outputs:
 * - me: the caller's own member row
 * - Own org only: my_ledger_entry, my_agent_action, my_agent_finding, my_room_comment, my_x402_receipt
 * - Shared with the counterparty: my_member, my_contract, my_deal, my_deal_signature, my_mandate, my_milestone, my_invoice, my_approval, my_beneficiary_change, my_payment, my_verification
 * - my_audit_event: events by my org's people or about records I can see
 * - The service sees every row in every view
 */

import { t } from 'spacetimedb/server';
import spacetimedb from './schema';
import { member } from './tables/organization';
import { contract, deal, dealSignature, mandate } from './tables/deal';
import { milestone } from './tables/milestone';
import { invoice, approval, beneficiaryChange } from './tables/invoice';
import { verification, x402Receipt } from './tables/verification';
import { payment, ledgerEntry } from './tables/payment';
import { agentAction, agentFinding, roomComment, auditEvent } from './tables/activity';
import { isMyOrg, isMyOrPartnerOrg, scopeFor } from './lib/visibility';

export const me = spacetimedb.view({ name: 'me', public: true }, t.option(member.rowType), ctx =>
  ctx.db.member.identity.find(ctx.sender) ?? undefined
);

export const myMember = spacetimedb.view({ name: 'my_member', public: true }, t.array(member.rowType), ctx => {
  const s = scopeFor(ctx);
  return [...ctx.db.member.iter()].filter(m => isMyOrPartnerOrg(s, m.orgId));
});

export const myContract = spacetimedb.view({ name: 'my_contract', public: true }, t.array(contract.rowType), ctx => {
  const s = scopeFor(ctx);
  return [...ctx.db.contract.iter()].filter(c => s.all || s.contracts.has(c.id));
});

export const myDeal = spacetimedb.view({ name: 'my_deal', public: true }, t.array(deal.rowType), ctx => {
  const s = scopeFor(ctx);
  return [...ctx.db.deal.iter()].filter(d => s.all || s.deals.has(d.id));
});

export const myDealSignature = spacetimedb.view(
  { name: 'my_deal_signature', public: true },
  t.array(dealSignature.rowType),
  ctx => {
    const s = scopeFor(ctx);
    return [...ctx.db.dealSignature.iter()].filter(x => s.all || s.deals.has(x.dealId));
  }
);

export const myMandate = spacetimedb.view({ name: 'my_mandate', public: true }, t.array(mandate.rowType), ctx => {
  const s = scopeFor(ctx);
  return [...ctx.db.mandate.iter()].filter(m => s.all || s.deals.has(m.dealId));
});

export const myMilestone = spacetimedb.view({ name: 'my_milestone', public: true }, t.array(milestone.rowType), ctx => {
  const s = scopeFor(ctx);
  return [...ctx.db.milestone.iter()].filter(m => s.all || s.contracts.has(m.contractId));
});

export const myInvoice = spacetimedb.view({ name: 'my_invoice', public: true }, t.array(invoice.rowType), ctx => {
  const s = scopeFor(ctx);
  return [...ctx.db.invoice.iter()].filter(i => s.all || s.invoices.has(i.id));
});

export const myApproval = spacetimedb.view({ name: 'my_approval', public: true }, t.array(approval.rowType), ctx => {
  const s = scopeFor(ctx);
  return [...ctx.db.approval.iter()].filter(a => s.all || s.invoices.has(a.invoiceId));
});

export const myBeneficiaryChange = spacetimedb.view(
  { name: 'my_beneficiary_change', public: true },
  t.array(beneficiaryChange.rowType),
  ctx => {
    const s = scopeFor(ctx);
    return [...ctx.db.beneficiaryChange.iter()].filter(c => s.all || s.invoices.has(c.invoiceId));
  }
);

export const myPayment = spacetimedb.view({ name: 'my_payment', public: true }, t.array(payment.rowType), ctx => {
  const s = scopeFor(ctx);
  return [...ctx.db.payment.iter()].filter(p => s.all || s.invoices.has(p.invoiceId));
});

export const myVerification = spacetimedb.view(
  { name: 'my_verification', public: true },
  t.array(verification.rowType),
  ctx => {
    const s = scopeFor(ctx);
    return [...ctx.db.verification.iter()].filter(v => isMyOrPartnerOrg(s, v.orgId));
  }
);

export const myX402Receipt = spacetimedb.view(
  { name: 'my_x402_receipt', public: true },
  t.array(x402Receipt.rowType),
  ctx => {
    const s = scopeFor(ctx);
    return [...ctx.db.x402Receipt.iter()].filter(r => {
      const m = ctx.db.mandate.id.find(r.mandateId);
      return s.all || (m !== null && m !== undefined && isMyOrg(s, m.orgId));
    });
  }
);

export const myLedgerEntry = spacetimedb.view(
  { name: 'my_ledger_entry', public: true },
  t.array(ledgerEntry.rowType),
  ctx => {
    const s = scopeFor(ctx);
    return [...ctx.db.ledgerEntry.iter()].filter(e => isMyOrg(s, e.orgId));
  }
);

export const myAgentAction = spacetimedb.view(
  { name: 'my_agent_action', public: true },
  t.array(agentAction.rowType),
  ctx => {
    const s = scopeFor(ctx);
    return [...ctx.db.agentAction.iter()].filter(a => isMyOrg(s, a.orgId));
  }
);

export const myAgentFinding = spacetimedb.view(
  { name: 'my_agent_finding', public: true },
  t.array(agentFinding.rowType),
  ctx => {
    const s = scopeFor(ctx);
    return [...ctx.db.agentFinding.iter()].filter(f => isMyOrg(s, f.orgId));
  }
);

export const myRoomComment = spacetimedb.view(
  { name: 'my_room_comment', public: true },
  t.array(roomComment.rowType),
  ctx => {
    const s = scopeFor(ctx);
    return [...ctx.db.roomComment.iter()].filter(c => isMyOrg(s, c.orgId));
  }
);

export const myAuditEvent = spacetimedb.view(
  { name: 'my_audit_event', public: true },
  t.array(auditEvent.rowType),
  ctx => {
    const s = scopeFor(ctx);
    if (s.all) return [...ctx.db.auditEvent.iter()];
    if (s.orgId === null) return [];
    const milestones = new Set(
      [...ctx.db.milestone.iter()].filter(m => s.contracts.has(m.contractId)).map(m => m.id)
    );
    const visible = (type: string, id: bigint) => {
      switch (type) {
        case 'invoice':
          return s.invoices.has(id);
        case 'deal':
          return s.deals.has(id);
        case 'milestone':
          return milestones.has(id);
        case 'organization':
          return id === s.orgId;
        case 'mandate': {
          const m = ctx.db.mandate.id.find(id);
          return !!m && s.deals.has(m.dealId);
        }
        case 'verification': {
          const v = ctx.db.verification.id.find(id);
          return !!v && isMyOrPartnerOrg(s, v.orgId);
        }
        default:
          return false;
      }
    };
    return [...ctx.db.auditEvent.iter()].filter(e => {
      const actor = ctx.db.member.identity.find(e.actor);
      return (actor && actor.orgId === s.orgId) || visible(e.subjectType, e.subjectId);
    });
  }
);
