/**
 * Setup reducers: the publisher becomes OWNER, the Node API asks for and is granted the SERVICE role, the service creates orgs and invite seats, and people redeem invites to join an org.
 *
 * Inputs:
 * - init (publisher identity), requestServiceRole(label), approveServiceRole(requestId) or approveObserverRole(requestId)
 * - createOrganization(kind, name, treasuryWallet), createInvite(code, orgId, role, displayName, isSigner)
 * - redeemInvite(code) from a person's browser identity
 * - recordWalletBinding(orgId, wallet, verificationId) after the API checks the owner's signed challenge
 *
 * Outputs:
 * - admin, serviceRequest, organization, invite, member rows; first payout wallet binding; auditEvent rows
 */

import { SenderError, t } from 'spacetimedb/server';
import spacetimedb from '../schema';
import { AdminRole, OrgKind, Role } from '../lib/constants';
import { requireOwner, requireService, adminRow } from '../lib/auth';
import { appendAudit } from '../lib/audit';

export const init = spacetimedb.init(ctx => {
  if (!ctx.db.admin.identity.find(ctx.sender)) {
    ctx.db.admin.insert({ identity: ctx.sender, role: AdminRole.OWNER, label: 'owner', addedAt: ctx.timestamp });
  }
});

export const requestServiceRole = spacetimedb.reducer({ label: t.string() }, (ctx, { label }) => {
  if (adminRow(ctx)) throw new SenderError('already an admin');
  if (ctx.db.member.identity.find(ctx.sender)) throw new SenderError('members cannot become the service');
  const r = ctx.db.serviceRequest.insert({ id: 0n, identity: ctx.sender, label, requestedAt: ctx.timestamp });
  appendAudit(ctx, 'requestServiceRole', 'service_request', r.id, label);
});

export const approveServiceRole = spacetimedb.reducer({ requestId: t.u64() }, (ctx, { requestId }) => {
  requireOwner(ctx);
  const r = ctx.db.serviceRequest.id.find(requestId);
  if (!r) throw new SenderError('no such request');
  ctx.db.admin.insert({ identity: r.identity, role: AdminRole.SERVICE, label: r.label, addedAt: ctx.timestamp });
  ctx.db.serviceRequest.id.delete(requestId);
  appendAudit(ctx, 'approveServiceRole', 'service_request', requestId, r.label);
});

// Read-only identity for the demo's all-agents flow screen. Same request queue as the service.
export const approveObserverRole = spacetimedb.reducer({ requestId: t.u64() }, (ctx, { requestId }) => {
  requireOwner(ctx);
  const r = ctx.db.serviceRequest.id.find(requestId);
  if (!r) throw new SenderError('no such request');
  ctx.db.admin.insert({ identity: r.identity, role: AdminRole.OBSERVER, label: r.label, addedAt: ctx.timestamp });
  ctx.db.serviceRequest.id.delete(requestId);
  appendAudit(ctx, 'approveObserverRole', 'service_request', requestId, r.label);
});

export const createOrganization = spacetimedb.reducer(
  { kind: t.string(), name: t.string(), treasuryWallet: t.string() },
  (ctx, { kind, name, treasuryWallet }) => {
    requireService(ctx);
    if (!Object.values(OrgKind).includes(kind as never)) throw new SenderError(`bad org kind ${kind}`);
    if (kind === OrgKind.SUB && treasuryWallet) throw new SenderError('subs do not pay from a treasury');
    const o = ctx.db.organization.insert({
      id: 0n,
      kind,
      name,
      verified: false,
      lastVerificationId: undefined,
      identityHash: '',
      treasuryWallet,
      payoutWallet: '',
      walletBoundAt: undefined,
    });
    appendAudit(ctx, 'createOrganization', 'organization', o.id, `${kind} ${name}`);
  }
);

export const createInvite = spacetimedb.reducer(
  { code: t.string(), orgId: t.u64(), role: t.string(), displayName: t.string(), isSigner: t.bool() },
  (ctx, args) => {
    requireService(ctx);
    if (!ctx.db.organization.id.find(args.orgId)) throw new SenderError('no such organization');
    if (!Object.values(Role).includes(args.role as never)) throw new SenderError(`bad role ${args.role}`);
    if (args.code.length < 8) throw new SenderError('invite code too short');
    ctx.db.invite.insert({ ...args, redeemed: false });
    appendAudit(ctx, 'createInvite', 'organization', args.orgId, `${args.role} ${args.displayName}`);
  }
);

export const redeemInvite = spacetimedb.reducer({ code: t.string() }, (ctx, { code }) => {
  if (adminRow(ctx)) throw new SenderError('service identities cannot join an organization');
  if (ctx.db.member.identity.find(ctx.sender)) throw new SenderError('already a member');
  const inv = ctx.db.invite.code.find(code);
  if (!inv || inv.redeemed) throw new SenderError('invalid or used invite');
  ctx.db.invite.code.update({ ...inv, redeemed: true });
  ctx.db.member.insert({
    identity: ctx.sender,
    orgId: inv.orgId,
    role: inv.role,
    displayName: inv.displayName,
    isSigner: inv.isSigner,
    verified: false,
    verifiedAt: undefined,
    identityHash: '',
  });
  appendAudit(ctx, 'redeemInvite', 'organization', inv.orgId, inv.displayName);
});

// First binding only. Changing a bound wallet must go through changeBeneficiary,
// which freezes payment until re-verification and two approvals.
export const recordWalletBinding = spacetimedb.reducer(
  { orgId: t.u64(), wallet: t.string(), verificationId: t.u64() },
  (ctx, { orgId, wallet, verificationId }) => {
    requireService(ctx);
    const org = ctx.db.organization.id.find(orgId);
    if (!org) throw new SenderError('no such organization');
    if (org.payoutWallet) throw new SenderError('wallet already bound; use changeBeneficiary');
    const v = ctx.db.verification.id.find(verificationId);
    if (!v || v.orgId !== orgId || !v.passed) throw new SenderError('a passing verification for this org is required');
    ctx.db.organization.id.update({ ...org, payoutWallet: wallet, walletBoundAt: ctx.timestamp });
    appendAudit(ctx, 'recordWalletBinding', 'organization', orgId, wallet);
  }
);
