/**
 * Role, membership, mandate and service-identity checks used at the top of every reducer.
 *
 * Inputs:
 * - ctx.sender identity
 * - Required role / org / deal / scope
 *
 * Outputs:
 * - The matching member or mandate row on success; throws SenderError('unauthorized: …') on failure
 */

import { SenderError } from 'spacetimedb/server';
import type { Ctx } from './ctx';
import { AdminRole, DealState } from './constants';

export function adminRow(ctx: Ctx) {
  return ctx.db.admin.identity.find(ctx.sender);
}

export function requireOwner(ctx: Ctx) {
  const a = adminRow(ctx);
  if (!a || a.role !== AdminRole.OWNER) throw new SenderError('unauthorized: owner only');
  return a;
}

// The Node API service identity. The owner may also act as the service (CLI seeding).
export function requireService(ctx: Ctx) {
  const a = adminRow(ctx);
  if (!a || a.role === AdminRole.OBSERVER) throw new SenderError('unauthorized: service identity only');
  return a;
}

type MemberReq = {
  orgId?: bigint;
  roles?: string[];
  verified?: boolean;
  signer?: boolean;
};

// A human member. Admin identities (the service, which every agent runs through) are
// never treated as humans, so agents can't approve, accept work, sign or unfreeze.
export function requireMember(ctx: Ctx, req: MemberReq = {}) {
  if (adminRow(ctx)) throw new SenderError('unauthorized: service and agents cannot act as a person');
  const m = ctx.db.member.identity.find(ctx.sender);
  if (!m) throw new SenderError('unauthorized: not a member');
  if (req.orgId !== undefined && m.orgId !== req.orgId)
    throw new SenderError('unauthorized: wrong organization');
  if (req.roles && !req.roles.includes(m.role))
    throw new SenderError(`unauthorized: requires role ${req.roles.join(' or ')}`);
  if (req.verified && !m.verified) throw new SenderError('unauthorized: CRS verification required');
  if (req.signer && !m.isSigner) throw new SenderError('unauthorized: not a signer');
  return m;
}

export function requireActiveDealForContract(ctx: Ctx, contractId: bigint) {
  const d = ctx.db.deal.contractId.find(contractId);
  if (!d || d.state !== DealState.ACTIVE) throw new SenderError('deal is not ACTIVE');
  return d;
}

// The service acting for an agent must hold an unexpired, unrevoked mandate for this
// org on an ACTIVE deal, with the step in its scope.
export function requireMandate(
  ctx: Ctx,
  args: { agentId: string; dealId: bigint; orgId: bigint; scope: string }
) {
  requireService(ctx);
  const d = ctx.db.deal.id.find(args.dealId);
  if (!d || d.state !== DealState.ACTIVE) throw new SenderError('unauthorized: deal is not ACTIVE');
  const m = [...ctx.db.mandate.dealId.filter(args.dealId)].find(
    x =>
      x.agentId === args.agentId &&
      x.orgId === args.orgId &&
      !x.revoked &&
      x.expiresAt.microsSinceUnixEpoch > ctx.timestamp.microsSinceUnixEpoch
  );
  if (!m) throw new SenderError(`unauthorized: no active mandate for agent ${args.agentId}`);
  if (!m.scope.split(',').map(s => s.trim()).includes(args.scope))
    throw new SenderError(`unauthorized: mandate does not cover ${args.scope}`);
  return m;
}
