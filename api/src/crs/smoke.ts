/**
 * Live smoke test against the CRS sandbox: one login, then every identity answer-key case through verifyPerson/verifyBusiness.
 *
 * Inputs:
 * - .env.local (CRS_*, IDENTITY_HASH_KEY)
 *
 * Outputs:
 * - One line per case (attestation only) and a non-zero exit if any result differs from the expected one
 *
 * Run: cd api && npm run crs:smoke
 */

import { IDENTITY_ANSWER_KEY } from './answerKey.ts';
import { PERSONAS } from './personas.ts';
import { verifyBusiness, verifyPerson } from './verify.ts';

let failures = 0;
for (const c of IDENTITY_ANSWER_KEY) {
  const p = PERSONAS[c.persona];
  const a = c.filing ? await verifyBusiness(c.id, p, c.filing) : await verifyPerson(c.id, p);
  const ok = a.decision === c.expected && c.mustInclude.every((r) => a.reasons.includes(r));
  if (!ok) failures++;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${c.persona} ${a.decision.padEnd(6)} (want ${c.expected.padEnd(6)}) ${c.label}\n       [${a.reasons.join(', ')}]`
  );
}
console.log(`\n${IDENTITY_ANSWER_KEY.length - failures}/${IDENTITY_ANSWER_KEY.length} match the answer key`);
process.exit(failures ? 1 : 0);
