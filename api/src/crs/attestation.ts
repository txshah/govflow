/**
 * Reduces a CRS response to an attestation and hashes the identity fields (salted SHA-256, 64-char hex; the database rejects anything else on a pass).
 *
 * Inputs:
 * - Raw CRS result, subjectId, products checked
 *
 * Outputs:
 * - { subjectId, products, passed, reasons, checkedAt, identityHash }
 */

import { createHmac } from 'node:crypto';

// REVIEW holds the money like FAIL does, but tells the approver it's a signal to check, not a proven fraud.
export type Decision = 'PASS' | 'REVIEW' | 'FAIL';

export type Attestation = {
  subjectId: string;
  products: string[];
  decision: Decision;
  passed: boolean;
  reasons: string[];
  checkedAt: string;
  identityHash: string;
  // CRS RequestIDs, so a result can be looked up in the sandbox later without storing the report.
  requestIds: string[];
  sandbox: true;
};

export type IdentityFields = { firstName: string; lastName: string; ssn: string; dob: string };

/**
 * Keyed hash of name + SSN + DOB. A plain SHA-256 of a 9-digit SSN is trivially brute-forced,
 * so this needs IDENTITY_HASH_KEY, which never leaves the Node API.
 */
export function identityHash(id: IdentityFields): string {
  const key = process.env.IDENTITY_HASH_KEY;
  if (!key) throw new Error('IDENTITY_HASH_KEY not set');
  const norm = [id.firstName, id.lastName, id.ssn.replace(/\D/g, ''), id.dob].map((s) => s.trim().toUpperCase()).join('|');
  return createHmac('sha256', key).update(norm).digest('hex');
}

export function makeAttestation(
  subjectId: string,
  identity: IdentityFields,
  products: string[],
  reasons: string[],
  decision: Decision,
  requestIds: (string | null)[]
): Attestation {
  return {
    subjectId,
    products,
    decision,
    passed: decision === 'PASS',
    reasons,
    checkedAt: new Date().toISOString(),
    identityHash: identityHash(identity),
    requestIds: requestIds.filter((r): r is string => r !== null),
    sandbox: true,
  };
}
