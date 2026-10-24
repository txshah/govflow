/**
 * `verifyPerson()` (TransUnion identity + OFAC) and `verifyBusiness()` (owner identity, credit-file patterns, PitchPoint
 * liens/judgments, state-filing rules, OFAC on the owner and the business) for the GovFlow flow.
 *
 * Inputs:
 * - Person or organization reference mapped to a sandbox test identity
 * - For a business: its state filing (seeded in the demo; CRS has no filings product)
 *
 * Outputs:
 * - PASS / REVIEW / FAIL with reasons, including name/DOB mismatch detection if the sandbox doesn't flag it
 *
 * The CalHacks sandbox has no business-credit or OFAC product, so a business is checked through its owner and
 * OFAC is screened against the Treasury SDN list directly (labelled `ofac_sdn:treasury`, not CRS).
 * Credit-file patterns are signals, not proof: they send a payee to REVIEW, never straight to FAIL.
 */

import { crsPost } from './client.ts';
import { screenName } from '../ofac/screen.ts';
import { makeAttestation, type Attestation, type Decision, type IdentityFields } from './attestation.ts';

export type PersonInput = IdentityFields & { street1: string; city: string; state: string; zip: string };

export type StateFiling = {
  // Where the filing came from; always shown next to the result.
  source: 'seeded';
  legalName: string;
  formedOn: string;
  officers: string[];
  lastChangedOn?: string;
};

// Blocking: the identity itself is wrong. Everything not listed here or in INFO sends the subject to REVIEW.
const FAIL = new Set(['SSN_NAME_MISMATCH', 'DOB_MISMATCH', 'DECEASED_SSN']);
// Shown to the finance approver, does not change the decision.
const INFO = /^(BANKRUPTCIES|JUDGMENTS|LIENS):/;

function decide(reasons: string[]): Decision {
  if (reasons.some((r) => FAIL.has(r))) return 'FAIL';
  if (reasons.some((r) => !INFO.test(r))) return 'REVIEW';
  return 'PASS';
}

type IdvMessage = { code: string; text: string };
type IdvResponse = { addOnProducts?: { idManagerVerification?: { messages?: IdvMessage[] } }[] };

// TransUnion message codes returned by the sandbox personas.
const IDV_REASON: Record<string, string> = {
  '2101': 'ADDRESS_MISMATCH',
  '2201': 'SSN_NAME_MISMATCH',
  '2202': 'DOB_MISMATCH',
  '2301': 'DECEASED_SSN',
  '2401': 'STEP_UP_REQUIRED',
};

async function checkIdentity(p: PersonInput) {
  const { data, requestId } = await crsPost<IdvResponse>('/transunion/identity-manager-verification/basic', {
    firstName: p.firstName,
    lastName: p.lastName,
    ssn: p.ssn,
    dob: p.dob,
    street1: p.street1,
    city: p.city,
    state: p.state,
    zip: p.zip,
  });
  const messages = data.addOnProducts?.[0]?.idManagerVerification?.messages ?? [];
  return { reasons: messages.map((m) => IDV_REASON[m.code] ?? `TU_${m.code}`), requestId };
}

type CreditResponse = {
  errorMessages?: { creditErrorMessageText?: string }[] | null;
  creditFiles?: { creditFileDetail?: { creditFileResultStatusType?: string } }[];
  tradelines?: { accountOpenedDate?: string }[];
  inquiries?: { inquiryDate?: string }[];
};

const DAY = 86_400_000;
const daysBetween = (a: string, b: Date) => (b.getTime() - new Date(a).getTime()) / DAY;

/** Most inquiries inside any 60-day window: a thin file that suddenly shops for credit is a synthetic-identity pattern. */
function maxInquiriesIn60Days(dates: string[]): number {
  const t = dates.map((d) => new Date(d).getTime()).sort((a, b) => a - b);
  let best = 0;
  for (let i = 0, j = 0; j < t.length; j++) {
    while (t[j] - t[i] > 60 * DAY) i++;
    best = Math.max(best, j - i + 1);
  }
  return best;
}

/** Credit-file patterns from the TransUnion report, compared against the business the person claims to own. */
async function checkCreditFile(p: PersonInput, filing: StateFiling) {
  const { data, requestId } = await crsPost<CreditResponse>('/transunion/credit-report/standard/tu-prequal-fico9', {
    firstName: p.firstName,
    lastName: p.lastName,
    ssn: p.ssn,
    addresses: [{ addressLine1: p.street1, city: p.city, state: p.state, postalCode: p.zip, borrowerResidencyType: 'Current' }],
  });
  const reasons: string[] = [];
  // Credit reports return errors as HTTP 200, so the body decides.
  const errors = data.errorMessages ?? [];
  if (errors.length) {
    reasons.push(errors.some((e) => /deceased/i.test(e.creditErrorMessageText ?? '')) ? 'DECEASED_SSN' : 'CREDIT_UNAVAILABLE');
    return { reasons, requestId };
  }
  const status = data.creditFiles?.[0]?.creditFileDetail?.creditFileResultStatusType;
  if (status !== 'FileReturned') {
    // An established business owner with no file at any bureau doesn't fit the story.
    reasons.push(status === 'NoFileReturnedCreditFreeze' ? 'CREDIT_FROZEN' : 'NO_CREDIT_FILE');
    return { reasons, requestId };
  }
  const tradelines = data.tradelines ?? [];
  if (tradelines.length < 3) reasons.push('THIN_FILE');
  const oldest = tradelines.map((t) => t.accountOpenedDate).filter((d): d is string => !!d).sort()[0];
  if (!oldest || oldest > filing.formedOn) reasons.push('CREDIT_HISTORY_NEWER_THAN_BUSINESS');
  if (maxInquiriesIn60Days((data.inquiries ?? []).flatMap((i) => (i.inquiryDate ? [i.inquiryDate] : []))) >= 5)
    reasons.push('INQUIRY_BURST');
  return { reasons, requestId };
}

/** GovFlow-side rules on the state filing: brand-new entity, officer match, recent changes. */
function checkFiling(owner: PersonInput, filing: StateFiling, now: Date): string[] {
  const reasons: string[] = [];
  const norm = (s: string) => s.trim().toUpperCase().replace(/\s+/g, ' ');
  if (!filing.officers.map(norm).includes(norm(`${owner.firstName} ${owner.lastName}`))) reasons.push('OFFICER_MISMATCH');
  if (daysBetween(filing.formedOn, now) < 180) reasons.push('NEW_ENTITY');
  if (filing.lastChangedOn && daysBetween(filing.lastChangedOn, now) < 90) reasons.push('RECENT_FILING_CHANGE');
  return reasons;
}

// A name match is a potential match, not proof: REVIEW holds the money until compliance clears it.
async function checkOfac(owner: PersonInput, legalName?: string): Promise<string[]> {
  const [person, business] = await Promise.all([
    screenName(`${owner.firstName} ${owner.lastName}`, 'person'),
    legalName ? screenName(legalName, 'business') : [],
  ]);
  return [
    ...person.map((m) => `OFAC_PERSON:${m.entNum}:${m.program}`),
    ...business.map((m) => `OFAC_BUSINESS:${m.entNum}:${m.program}`),
  ];
}

/** Identity verification for a signer or payout owner. */
export async function verifyPerson(subjectId: string, p: PersonInput): Promise<Attestation> {
  const [idv, ofac] = await Promise.all([checkIdentity(p), checkOfac(p)]);
  const reasons = [...idv.reasons, ...ofac];
  return makeAttestation(subjectId, p, ['tu_identity_verification', 'ofac_sdn:treasury'], reasons, decide(reasons), [idv.requestId]);
}

type BljResponse = { DetailedBLJReport?: unknown };

function countFound(report: unknown, key: string): number {
  const m = JSON.stringify(report).match(new RegExp(`"${key}":"?(\\d+)`));
  return m ? Number(m[1]) : 0;
}

/** Business check through its owner: identity, credit-file fit, liens/judgments/bankruptcies and the state filing. */
export async function verifyBusiness(
  subjectId: string,
  owner: PersonInput,
  filing: StateFiling,
  now = new Date()
): Promise<Attestation> {
  const [idv, credit, ofac, blj] = await Promise.all([
    checkIdentity(owner),
    checkCreditFile(owner, filing),
    checkOfac(owner, filing.legalName),
    crsPost<BljResponse>('/pp/fcrablj/data', {
      terms: { term: [{ person: { firstName: owner.firstName, lastName: owner.lastName, ssn: owner.ssn } }] },
    }),
  ]);
  const reasons = [...new Set([...idv.reasons, ...credit.reasons, ...checkFiling(owner, filing, now), ...ofac])];
  for (const [key, label] of [
    ['BankruptciesFound', 'BANKRUPTCIES'],
    ['JudgmentsFound', 'JUDGMENTS'],
    ['LiensFound', 'LIENS'],
  ] as const) {
    const n = countFound(blj.data, key);
    if (n > 0) reasons.push(`${label}:${n}`);
  }
  return makeAttestation(
    subjectId,
    owner,
    ['tu_identity_verification', 'tu_credit_report', 'pitchpoint_blj', 'ofac_sdn:treasury', `state_filing:${filing.source}`],
    reasons,
    decide(reasons),
    [idv.requestId, credit.requestId, blj.requestId]
  );
}
