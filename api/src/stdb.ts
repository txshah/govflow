/**
 * Connects to SpacetimeDB as the service identity and exposes typed subscribe/call helpers.
 *
 * Inputs:
 * - STDB URI, service token
 * - Generated module_bindings
 *
 * Outputs:
 * - Event emitters for row changes
 * - Wrapped calls to recordMatch, recordVerification, recordPayment, logAgentAction
 *
 * The service token is saved to api/.stdb-service-token (gitignored) on first connect, so the identity the
 * owner approved with approveServiceRole stays the same across restarts.
 */

import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Timestamp, type Identity } from 'spacetimedb';
import { DbConnection } from './module_bindings/index.ts';
import type { Attestation } from './crs/attestation.ts';

// Re-exported so scripts outside api/ (seed/) don't need their own spacetimedb install.
export { Timestamp };

const TOKEN_FILE = fileURLToPath(new URL('../.stdb-service-token', import.meta.url));

export type Connected = { conn: DbConnection; identity: Identity; token: string };
export type Service = Connected & { firstRun: boolean };

/** Opens a connection with an existing token, or a fresh identity when none is given. */
export function connect(token?: string): Promise<Connected> {
  const uri = process.env.STDB_URI;
  const db = process.env.STDB_DATABASE;
  if (!uri || !db) throw new Error('STDB_URI / STDB_DATABASE not set');
  return new Promise((resolve, reject) => {
    DbConnection.builder()
      .withUri(uri)
      .withDatabaseName(db)
      .withToken(token)
      .withAutomaticReconnect()
      .onConnect((conn, identity, newToken) => resolve({ conn, identity, token: newToken }))
      .onConnectError((_ctx, err) => reject(err))
      .build();
  });
}

/** Opens the service connection; resolves once the handshake is done. */
export async function connectService(): Promise<Service> {
  const saved = existsSync(TOKEN_FILE) ? readFileSync(TOKEN_FILE, 'utf8').trim() : undefined;
  const c = await connect(saved);
  if (c.token !== saved) {
    writeFileSync(TOKEN_FILE, c.token);
    chmodSync(TOKEN_FILE, 0o600);
  }
  return { ...c, firstRun: !saved };
}

/** Subscribes to SQL queries and resolves once the initial rows are in the client cache. */
export function subscribe(conn: DbConnection, queries: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    conn
      .subscriptionBuilder()
      .onApplied(() => resolve())
      .onError((ctx) => reject(ctx.event ?? new Error('subscription failed')))
      .subscribe(queries);
  });
}

export type VerificationTarget =
  | { subjectType: 'ORG'; orgId: bigint; invoiceId?: bigint }
  | { subjectType: 'MEMBER'; orgId: bigint; memberIdentity: Identity };

/** Writes a CRS attestation through recordVerification. Only the result and keyed hash leave the API. */
export function recordVerification(conn: DbConnection, target: VerificationTarget, a: Attestation) {
  return conn.reducers.recordVerification({
    subjectType: target.subjectType,
    orgId: target.orgId,
    memberIdentity: target.subjectType === 'MEMBER' ? target.memberIdentity : undefined,
    invoiceId: target.subjectType === 'ORG' ? target.invoiceId : undefined,
    products: a.products.join(','),
    decision: a.decision,
    reasons: a.reasons.join(','),
    identityHash: a.identityHash,
    sandbox: a.sandbox,
  });
}
