/**
 * Defines who exists in the system: admins (owner + Node API service), organizations (agency, prime, sub), members (people in an org) and single-use invites.
 *
 * Inputs:
 * - Admin reducers (init, approveServiceRole, createOrganization, createInvite, redeemInvite)
 * - recordVerification / recordWalletBinding (Node API service identity)
 *
 * Outputs:
 * - admin rows (private): identity, role OWNER | SERVICE
 * - organization rows (the only public table): id, kind (AGENCY | PRIME | SUB), name, verified, identityHash, treasuryWallet, payoutWallet
 * - member rows (private; read through views): identity, orgId, role (REVIEWER | APPROVER | PREPARER), isSigner, verified, identityHash
 * - invite rows (private): code → seat in an org, redeemed once
 */

import { t, table } from 'spacetimedb/server';

export const admin = table(
  { name: 'admin' },
  {
    identity: t.identity().primaryKey(),
    role: t.string(),
    label: t.string(),
    addedAt: t.timestamp(),
  }
);

export const serviceRequest = table(
  { name: 'service_request' },
  {
    id: t.u64().primaryKey().autoInc(),
    identity: t.identity(),
    label: t.string(),
    requestedAt: t.timestamp(),
  }
);

export const organization = table(
  { name: 'organization', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    kind: t.string(),
    name: t.string(),
    verified: t.bool(),
    lastVerificationId: t.option(t.u64()),
    // CRS attestation hash from the latest passing check; never raw identity data.
    identityHash: t.string(),
    // Wallet this org pays from (agency and prime only).
    treasuryWallet: t.string(),
    // Verified wallet this org is paid to; '' until bound.
    payoutWallet: t.string(),
    walletBoundAt: t.option(t.timestamp()),
  }
);

export const member = table(
  { name: 'member' },
  {
    identity: t.identity().primaryKey(),
    orgId: t.u64().index('btree'),
    role: t.string(),
    displayName: t.string(),
    isSigner: t.bool(),
    verified: t.bool(),
    verifiedAt: t.option(t.timestamp()),
    // CRS attestation hash from the latest passing check; never raw identity data.
    identityHash: t.string(),
  }
);

export const invite = table(
  { name: 'invite' },
  {
    code: t.string().primaryKey(),
    orgId: t.u64(),
    role: t.string(),
    displayName: t.string(),
    isSigner: t.bool(),
    redeemed: t.bool(),
  }
);
