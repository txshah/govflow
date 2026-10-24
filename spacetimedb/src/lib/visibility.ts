/**
 * Works out what the caller may see: the service sees everything; a member sees their own org's private room plus the shared envelope with each org they have a contract with; anyone else sees nothing.
 *
 * Inputs:
 * - View context (ctx.sender, read-only ctx.db)
 *
 * Outputs:
 * - A Scope: the caller's org, partner orgs, and the contract / deal / milestone / invoice ids they are party to
 */

import type { InferSchema, ViewCtx } from 'spacetimedb/server';
import type spacetimedb from '../schema';

export type VCtx = ViewCtx<InferSchema<typeof spacetimedb>>;

export type Scope = {
  all: boolean;
  orgId: bigint | null;
  partners: Set<bigint>;
  contracts: Set<bigint>;
  deals: Set<bigint>;
  invoices: Set<bigint>;
};

export function scopeFor(ctx: VCtx): Scope {
  const s: Scope = {
    all: false,
    orgId: null,
    partners: new Set(),
    contracts: new Set(),
    deals: new Set(),
    invoices: new Set(),
  };
  if (ctx.db.admin.identity.find(ctx.sender)) return { ...s, all: true };
  const me = ctx.db.member.identity.find(ctx.sender);
  if (!me) return s;
  s.orgId = me.orgId;

  const mine = [...ctx.db.contract.payerOrgId.filter(me.orgId), ...ctx.db.contract.payeeOrgId.filter(me.orgId)];
  for (const c of mine) {
    s.contracts.add(c.id);
    s.partners.add(c.payerOrgId === me.orgId ? c.payeeOrgId : c.payerOrgId);
    const d = ctx.db.deal.contractId.find(c.id);
    if (d) s.deals.add(d.id);
  }
  for (const i of ctx.db.invoice.payerOrgId.filter(me.orgId)) s.invoices.add(i.id);
  for (const i of ctx.db.invoice.payeeOrgId.filter(me.orgId)) s.invoices.add(i.id);
  return s;
}

export const isMyOrg = (s: Scope, orgId: bigint) => s.all || s.orgId === orgId;
export const isMyOrPartnerOrg = (s: Scope, orgId: bigint) => isMyOrg(s, orgId) || s.partners.has(orgId);
