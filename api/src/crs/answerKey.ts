/**
 * Identity answer key: who each payee really is in the demo, what they claim, and what CRS + GovFlow should decide.
 *
 * Inputs:
 * - Sandbox personas, mock business-registry records
 *
 * Outputs:
 * - Array of { id, persona, kind, filing?, expected decision, reasons that must appear }
 *
 * seed/answerKey.ts (the bills) can point a sub's invoice at one of these payees.
 */

import { PERSONAS } from './personas.ts';
import type { Decision } from './attestation.ts';
import type { StateFiling } from './verify.ts';

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
const filing = (legalName: string, formedOn: string, officers: string[], lastChangedOn?: string): StateFiling => ({
  source: 'mock',
  legalName,
  formedOn,
  officers,
  lastChangedOn,
});

export type IdentityCase = {
  id: string;
  label: string;
  persona: keyof typeof PERSONAS;
  filing?: StateFiling;
  expected: Decision;
  mustInclude: string[];
  planted?: true;
};

export const IDENTITY_ANSWER_KEY: IdentityCase[] = [
  { id: 'prime-owner', label: 'Prime owner, clean', persona: 'P01', expected: 'PASS', mustInclude: [],
    filing: filing('OKAFOR BUILDERS LLC', '2012-05-01', ['MARGARET OKAFOR']) },
  { id: 'sub-owner', label: 'Sub owner, clean', persona: 'P19', expected: 'PASS', mustInclude: [],
    filing: filing('NAKAMURA ELECTRIC INC', '2009-03-15', ['GRACE NAKAMURA']) },
  { id: 'sub-liens', label: 'Sub with a tax lien and judgment (shown, not blocking)', persona: 'P08', expected: 'PASS',
    mustInclude: ['JUDGMENTS:1', 'LIENS:1'], filing: filing('VENKATESAN PLUMBING LLC', '2016-03-01', ['PRIYA VENKATESAN']) },

  // Planted: the SSN comes back belonging to a different name and birth date, on a young file that is suddenly shopping for credit.
  { id: 'synthetic-sub', label: 'PLANTED: synthetic-identity sub', persona: 'P13', expected: 'FAIL', planted: true,
    mustInclude: ['SSN_NAME_MISMATCH', 'DOB_MISMATCH', 'INQUIRY_BURST'],
    filing: filing('BRENNAN CONCRETE LLC', '2018-02-01', ['KAYLA BRENNAN']) },
  // Planted: name, SSN and DOB all match (a stolen full identity), but the credit file can't belong to someone who has run a firm since 2011.
  { id: 'stolen-thin-file', label: 'PLANTED: stolen identity, thin file vs 15-year-old business', persona: 'P03', expected: 'REVIEW', planted: true,
    mustInclude: ['THIN_FILE', 'CREDIT_HISTORY_NEWER_THAN_BUSINESS'],
    filing: filing('REYES ROOFING INC', '2011-06-01', ['JASMINE REYES']) },
  { id: 'stolen-no-file', label: 'PLANTED: stolen identity, no credit file vs 2010 business', persona: 'P04', expected: 'REVIEW', planted: true,
    mustInclude: ['NO_CREDIT_FILE'], filing: filing('LINDQVIST STEEL LLC', '2010-04-12', ['TOMAS LINDQVIST']) },

  // Planted: a clean person fronting a business that is on the Treasury SDN list (real listed entity, Iran program).
  { id: 'sanctioned-sub', label: 'PLANTED: sub is an OFAC-listed entity', persona: 'P02', expected: 'REVIEW', planted: true,
    mustInclude: ['OFAC_BUSINESS:16009:IRAN'],
    filing: filing('TADBIR CONSTRUCTION DEVELOPMENT CO.', '2008-01-15', ['DANIEL WHITFIELD']) },

  { id: 'shell-llc', label: 'Shell LLC: formed last month, person not an officer, officers just changed', persona: 'P10', expected: 'REVIEW',
    mustInclude: ['NEW_ENTITY', 'OFFICER_MISMATCH', 'RECENT_FILING_CHANGE'],
    filing: filing('KOWALCZYK SUPPLY LLC', daysAgo(30), ['JOHN MERCER'], daysAgo(7)) },

  // Person-only checks (signers, wallet-change re-verification).
  { id: 'wallet-impostor', label: 'Beneficiary-change impostor', persona: 'P12', expected: 'FAIL',
    mustInclude: ['SSN_NAME_MISMATCH', 'DOB_MISMATCH', 'FRAUD_SCORE_HIGH:85', 'PHONE_OWNER_MISMATCH'] },
  { id: 'deceased', label: 'Deceased SSN', persona: 'P14', expected: 'FAIL', mustInclude: ['DECEASED_SSN'] },
  { id: 'fraud-alert', label: 'Fraud alert on file: step up, never auto-pass', persona: 'P16', expected: 'REVIEW', mustInclude: ['STEP_UP_REQUIRED'] },
];
