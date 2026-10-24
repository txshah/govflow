/**
 * Creates the agency, prime and sub orgs and their members, the prime contract and linked subcontract with schedules of values, and their milestones.
 *
 * Inputs:
 * - CRS sandbox test identities, treasury and payee wallet addresses
 *
 * Outputs:
 * - Seeded organization, member, contract (prime + sub), deal, milestone rows
 *
 * Every org and person is checked through the live CRS sandbox (plus the Treasury OFAC list) and the real
 * attestation is written with recordVerification. The planted subs from the identity answer key are created
 * as orgs too, so the demo can show each one held. Each demo person gets their own SpacetimeDB identity;
 * their login tokens go to seed/.demo-tokens.json (gitignored).
 *
 * Run once on an empty database: cd api && npm run seed
 */

import { createHmac, randomBytes } from 'node:crypto';
import { chmodSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { connect, connectService, recordVerification, subscribe, Timestamp, type Connected } from '../api/src/stdb.ts';
import { IDENTITY_ANSWER_KEY } from '../api/src/crs/answerKey.ts';
import { PERSONAS } from '../api/src/crs/personas.ts';
import { verifyBusiness, verifyPerson } from '../api/src/crs/verify.ts';

const TOKENS_FILE = fileURLToPath(new URL('./.demo-tokens.json', import.meta.url));
const USDC = (n: number) => BigInt(Math.round(n * 1_000_000));
// Keep every line, and any bill of all lines, under api/src/config.ts MAX_PAYOUT_ATOMIC (1.00 USDC).
// Platform caps from spacetimedb/src/lib/constants.ts (micro-USDC).
const MAX_X402_PER_CALL = 10_000n;
const MAX_X402_PER_SESSION = 100_000n;
const DAY_MICROS = 86_400_000_000n;

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} not set in .env.local`);
  return v;
}

/** Polls the client cache until a row shows up (reducer results and row updates arrive together, but not always first). */
async function waitFor<T>(what: string, find: () => T | undefined, ms = 10_000): Promise<T> {
  const until = Date.now() + ms;
  for (;;) {
    const v = find();
    if (v !== undefined) return v;
    if (Date.now() > until) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

const svc = await connectService();
await subscribe(svc.conn, [
  'SELECT * FROM organization',
  'SELECT * FROM my_contract',
  'SELECT * FROM my_deal',
  'SELECT * FROM my_verification',
]);
const db = svc.conn.db;

if ([...db.organization.iter()].length > 0) {
  console.error('Database already has organizations; refusing to seed twice. Reset with `spacetime publish --delete-data` first.');
  process.exit(1);
}

const orgId = (name: string) => waitFor(`org ${name}`, () => [...db.organization.iter()].find((o) => o.name === name)?.id);
const lastVerificationId = (id: bigint) =>
  [...db.myVerification.iter()].filter((v) => v.orgId === id).sort((a, b) => (a.id > b.id ? -1 : 1))[0]?.id;

// --- organizations
const AGENCY = 'CITY OF OAKRIDGE PUBLIC WORKS';
const primeCase = IDENTITY_ANSWER_KEY.find((c) => c.id === 'prime-owner')!;
const subCase = IDENTITY_ANSWER_KEY.find((c) => c.id === 'sub-owner')!;
const subCases = IDENTITY_ANSWER_KEY.filter((c) => c.filing && c.id !== 'prime-owner');

await svc.conn.reducers.createOrganization({ kind: 'AGENCY', name: AGENCY, treasuryWallet: env('GOVFLOW_AGENCY_TREASURY_ADDRESS') });
await svc.conn.reducers.createOrganization({ kind: 'PRIME', name: primeCase.filing!.legalName, treasuryWallet: env('GOVFLOW_PRIME_TREASURY_ADDRESS') });
for (const c of subCases) await svc.conn.reducers.createOrganization({ kind: 'SUB', name: c.filing!.legalName, treasuryWallet: '' });

const agency = await orgId(AGENCY);
const prime = await orgId(primeCase.filing!.legalName);
const sub = await orgId(subCase.filing!.legalName);
console.log(`orgs: agency ${agency}, prime ${prime}, sub ${sub}, +${subCases.length - 1} planted subs`);

// The agency is a public body, not a CRS subject: record it as checked against our seeded agency registry.
const agencyHash = createHmac('sha256', env('IDENTITY_HASH_KEY')).update(`AGENCY|${AGENCY}`).digest('hex');
await svc.conn.reducers.recordVerification({
  subjectType: 'ORG', orgId: agency, memberIdentity: undefined, invoiceId: undefined,
  products: 'agency_registry:seeded', decision: 'PASS', reasons: '', identityHash: agencyHash, sandbox: true,
});

// Prime, sub and every planted sub go through the real CRS + OFAC checks.
for (const c of [primeCase, ...subCases]) {
  const id = await orgId(c.filing!.legalName);
  const a = await verifyBusiness(c.id, PERSONAS[c.persona], c.filing!);
  await recordVerification(svc.conn, { subjectType: 'ORG', orgId: id }, a);
  console.log(`  ${c.filing!.legalName}: ${a.decision}${a.reasons.length ? ` [${a.reasons.join(', ')}]` : ''}`);
  if (a.decision !== c.expected) throw new Error(`${c.id} came back ${a.decision}, answer key expects ${c.expected}`);
}

// First payout wallets: the prime is paid into its own treasury (and pays the sub from it).
await svc.conn.reducers.recordWalletBinding({
  orgId: prime, wallet: env('GOVFLOW_PRIME_TREASURY_ADDRESS'),
  verificationId: await waitFor('prime verification', () => lastVerificationId(prime)),
});
await svc.conn.reducers.recordWalletBinding({
  orgId: sub, wallet: env('GOVFLOW_SUB_ADDRESS'),
  verificationId: await waitFor('sub verification', () => lastVerificationId(sub)),
});

// --- people: each gets a fresh identity, redeems an invite, and is CRS-verified
type Person = { key: string; persona: keyof typeof PERSONAS; orgId: bigint; role: string; isSigner: boolean; title: string };
const people: Person[] = [
  { key: 'agencyPM', persona: 'P17', orgId: agency, role: 'REVIEWER', isSigner: true, title: 'Agency project manager' },
  { key: 'agencyFin1', persona: 'P18', orgId: agency, role: 'APPROVER', isSigner: false, title: 'Agency finance approver' },
  { key: 'agencyFin2', persona: 'P20', orgId: agency, role: 'APPROVER', isSigner: false, title: 'Agency finance approver' },
  { key: 'primeAP', persona: primeCase.persona, orgId: prime, role: 'PREPARER', isSigner: true, title: 'Prime owner / AP' },
  { key: 'primeCtrl1', persona: 'P15', orgId: prime, role: 'APPROVER', isSigner: false, title: 'Prime controller' },
  { key: 'primeCtrl2', persona: 'P06', orgId: prime, role: 'APPROVER', isSigner: false, title: 'Prime controller' },
  { key: 'primeInspector', persona: 'P07', orgId: prime, role: 'REVIEWER', isSigner: false, title: 'Prime site inspector' },
  { key: 'subOwner', persona: subCase.persona, orgId: sub, role: 'PREPARER', isSigner: true, title: 'Sub owner' },
];

const conns: Record<string, Connected> = {};
const tokens: Record<string, { name: string; title: string; orgId: string; role: string; identity: string; token: string }> = {};
for (const p of people) {
  const who = PERSONAS[p.persona];
  const name = `${who.firstName} ${who.lastName}`;
  const code = `demo-${randomBytes(8).toString('hex')}`;
  await svc.conn.reducers.createInvite({ code, orgId: p.orgId, role: p.role, displayName: name, isSigner: p.isSigner });
  const c = await connect();
  await c.conn.reducers.redeemInvite({ code });
  const a = await verifyPerson(p.key, who);
  await recordVerification(svc.conn, { subjectType: 'MEMBER', orgId: p.orgId, memberIdentity: c.identity }, a);
  if (a.decision !== 'PASS') throw new Error(`${p.key} (${p.persona}) came back ${a.decision}`);
  conns[p.key] = c;
  tokens[p.key] = { name, title: p.title, orgId: String(p.orgId), role: p.role, identity: c.identity.toHexString(), token: c.token };
  console.log(`  ${p.title}: ${name} verified`);
}
writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2));
chmodSync(TOKENS_FILE, 0o600);

// --- prime contract (agency → prime) and subcontract (prime → sub)
const expiresAt = new Timestamp(BigInt(Date.now()) * 1000n + 30n * DAY_MICROS);
const mandate = (who: string, dealId: bigint, agentId: string, scope: string) =>
  conns[who]!.conn.reducers.signMandate({
    dealId, agentId, scope, perCallLimit: MAX_X402_PER_CALL, sessionLimit: MAX_X402_PER_SESSION, expiresAt,
  });
const dealFor = async (kind: string) => {
  const contract = await waitFor(`${kind} contract`, () => [...db.myContract.iter()].find((c) => c.kind === kind));
  const deal = await waitFor(`${kind} deal`, () => [...db.myDeal.iter()].find((d) => d.contractId === contract.id));
  return { contractId: contract.id, dealId: deal.id };
};

await conns.agencyPM!.conn.reducers.createDeal({
  kind: 'PRIME_CONTRACT', payeeOrgId: prime, parentContractId: undefined, title: 'Oakridge Avenue bridge rehab',
  lines: [
    { description: 'Demolition of existing deck', scheduledValue: USDC(0.4) },
    { description: 'Deck pour and cure', scheduledValue: USDC(0.6) },
  ],
});
const primeDeal = await dealFor('PRIME_CONTRACT');
await conns.agencyPM!.conn.reducers.signDeal({ dealId: primeDeal.dealId });
await conns.primeAP!.conn.reducers.signDeal({ dealId: primeDeal.dealId });
await mandate('agencyPM', primeDeal.dealId, 'agency-agent', 'match,verify,risk_review');
await mandate('primeAP', primeDeal.dealId, 'prime-agent', 'draft_invoice,summarize');

await conns.primeAP!.conn.reducers.createDeal({
  kind: 'SUBCONTRACT', payeeOrgId: sub, parentContractId: primeDeal.contractId, title: 'Bridge lighting',
  lines: [{ description: 'Conduit and fixtures', scheduledValue: USDC(0.15) }],
});
const subDeal = await dealFor('SUBCONTRACT');
await conns.primeAP!.conn.reducers.signDeal({ dealId: subDeal.dealId });
await conns.subOwner!.conn.reducers.signDeal({ dealId: subDeal.dealId });
await mandate('primeAP', subDeal.dealId, 'prime-agent', 'match,verify,risk_review');
await mandate('subOwner', subDeal.dealId, 'sub-agent', 'draft_invoice,summarize');

console.log(`deals: prime contract ${primeDeal.contractId} (deal ${primeDeal.dealId}), subcontract ${subDeal.contractId} (deal ${subDeal.dealId})`);
console.log('demo logins written to seed/.demo-tokens.json');

for (const c of Object.values(conns)) c.conn.disconnect();
svc.conn.disconnect();
process.exit(0);
