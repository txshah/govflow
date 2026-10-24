/**
 * CRS sandbox test personas used by GovFlow (fake people published by CRS; never real data).
 *
 * Inputs:
 * - get_personas / get_test_data from the crs-calhacks MCP server
 *
 * Outputs:
 * - PersonInput bodies that match the sandbox exactly, so they get canned (free) responses
 */

import type { PersonInput } from './verify.ts';

export const PERSONAS = {
  // Prime, clean identity and records → prime contractor owner
  P01: { firstName: 'MARGARET', lastName: 'OKAFOR', ssn: '666701001', dob: '1984-03-14', street1: '1420 WILLOW CREEK DR', city: 'SAN JOSE', state: 'CA', zip: '95125' },
  // Super-prime, clean → owner on paper of the sanctioned-entity sub
  P02: { firstName: 'DANIEL', lastName: 'WHITFIELD', ssn: '666701002', dob: '1972-11-02', street1: '88 LAKESHORE BLVD', city: 'AUSTIN', state: 'TX', zip: '78746' },
  // Thin file: identity verifies, but oldest account opened 2026 → "stolen identity, history doesn't fit" plant
  P03: { firstName: 'JASMINE', lastName: 'REYES', ssn: '666701003', dob: '2004-06-21', street1: '2210 UNIVERSITY AVE APT 4B', city: 'BERKELEY', state: 'CA', zip: '94704' },
  // No file at any bureau: identity verifies, but no credit history at all
  P04: { firstName: 'TOMAS', lastName: 'LINDQVIST', ssn: '666701004', dob: '1990-01-30', street1: '415 PINE ST UNIT 12', city: 'SEATTLE', state: 'WA', zip: '98101' },
  // Clean person, used as the owner of a shell LLC that fails the filing rules
  P10: { firstName: 'LAUREN', lastName: 'KOWALCZYK', ssn: '666701010', dob: '1992-10-03', street1: '1181 WOODWARD AVE', city: 'DETROIT', state: 'MI', zip: '48226' },
  // Synthetic identity: SSN not hers, DOB doesn't match, 9 inquiries in 25 days → synthetic sub plant
  P13: { firstName: 'KAYLA', lastName: 'BRENNAN', ssn: '666701013', dob: '1999-12-24', street1: '9021 KINGSTON PIKE', city: 'KNOXVILLE', state: 'TN', zip: '37923' },
  // Staff identities (approvers, inspectors): identity verifies cleanly; only person checks run on them
  P06: { firstName: 'ANGELA', lastName: 'MORRISSEY', ssn: '666701006', dob: '1979-04-18', street1: '960 MAPLEWOOD AVE', city: 'COLUMBUS', state: 'OH', zip: '43209' },
  P07: { firstName: 'MARCUS', lastName: 'BELLAMY', ssn: '666701007', dob: '1975-12-05', street1: '1507 PEACHTREE INDUSTRIAL BLVD', city: 'ATLANTA', state: 'GA', zip: '30341' },
  P15: { firstName: 'NICOLE', lastName: 'FARRAGUT', ssn: '666701015', dob: '1983-03-30', street1: '7700 NE 72ND AVE', city: 'PORTLAND', state: 'OR', zip: '97218' },
  P17: { firstName: 'ELENA', lastName: 'CASTELLANOS', ssn: '666701017', dob: '1987-11-20', street1: '4400 N CENTRAL EXPY STE 100', city: 'DALLAS', state: 'TX', zip: '75206' },
  P18: { firstName: 'TERRENCE', lastName: 'ABERNATHY', ssn: '666701018', dob: '1980-02-29', street1: '2102 S HALSTED ST', city: 'CHICAGO', state: 'IL', zip: '60608' },
  P20: { firstName: 'DOLORES', lastName: 'WHITCOMB', ssn: '666701020', dob: '1952-05-04', street1: '612 OCEAN VIEW DR', city: 'SANTA BARBARA', state: 'CA', zip: '93109' },
  // Tax lien + civil judgment → shows liens to the finance approver
  P08: { firstName: 'PRIYA', lastName: 'VENKATESAN', ssn: '666701008', dob: '1981-07-27', street1: '3300 N LAKE SHORE DR APT 15C', city: 'CHICAGO', state: 'IL', zip: '60657' },
  // SSN belongs to another name, DOB mismatch → the beneficiary-change impostor
  P12: { firstName: 'VICTOR', lastName: 'ANAND', ssn: '666701012', dob: '1968-08-08', street1: '55 WATER ST FL 20', city: 'NEW YORK', state: 'NY', zip: '10041' },
  // Deceased SSN
  P14: { firstName: 'HAROLD', lastName: 'PETTIGREW', ssn: '666701014', dob: '1948-01-19', street1: '310 ELM ST', city: 'DAYTON', state: 'OH', zip: '45402' },
  // Fraud alert on file → step-up, not auto-pass
  P16: { firstName: 'SAMUEL', lastName: 'OYELARAN', ssn: '666701016', dob: '1977-06-12', street1: '1200 BRICKELL BAY DR APT 2203', city: 'MIAMI', state: 'FL', zip: '33131' },
  // Small-business owner, clean → subcontractor owner
  P19: { firstName: 'GRACE', lastName: 'NAKAMURA', ssn: '666701019', dob: '1976-09-16', street1: '1850 SOLANO AVE', city: 'BERKELEY', state: 'CA', zip: '94707' },
} satisfies Record<string, PersonInput>;
