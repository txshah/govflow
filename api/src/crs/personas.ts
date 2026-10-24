/**
 * CRS sandbox test personas used by GovFlow (fake people published by CRS; never real data).
 *
 * Inputs:
 * - get_personas / get_test_data from the crs-calhacks MCP server
 *
 * Outputs:
 * - PersonInput bodies that match the sandbox exactly, so they get canned (free) responses
 *   (email, phone and ip are the Fraud Finder persona fields)
 */

import type { PersonInput } from './verify.ts';

export const PERSONAS = {
  // Prime, clean identity and records → prime contractor owner
  P01: { firstName: 'MARGARET', lastName: 'OKAFOR', ssn: '666701001', dob: '1984-03-14', street1: '1420 WILLOW CREEK DR', city: 'SAN JOSE', state: 'CA', zip: '95125', email: 'margaret.okafor@example.com', phone: '5550101001', ip: '203.0.113.11' },
  // Super-prime, clean → owner on paper of the sanctioned-entity sub
  P02: { firstName: 'DANIEL', lastName: 'WHITFIELD', ssn: '666701002', dob: '1972-11-02', street1: '88 LAKESHORE BLVD', city: 'AUSTIN', state: 'TX', zip: '78746', email: 'daniel.whitfield@example.com', phone: '5550101002', ip: '203.0.113.12' },
  // Thin file: identity verifies, but oldest account opened 2026 → "stolen identity, history doesn't fit" plant
  P03: { firstName: 'JASMINE', lastName: 'REYES', ssn: '666701003', dob: '2004-06-21', street1: '2210 UNIVERSITY AVE APT 4B', city: 'BERKELEY', state: 'CA', zip: '94704', email: 'jasmine.reyes@example.com', phone: '5550101003', ip: '203.0.113.13' },
  // No file at any bureau: identity verifies, but no credit history at all
  P04: { firstName: 'TOMAS', lastName: 'LINDQVIST', ssn: '666701004', dob: '1990-01-30', street1: '415 PINE ST UNIT 12', city: 'SEATTLE', state: 'WA', zip: '98101', email: 'tomas.lindqvist@example.com', phone: '5550101004', ip: '203.0.113.14' },
  // Clean person, used as the owner of a shell LLC that fails the filing rules
  P10: { firstName: 'LAUREN', lastName: 'KOWALCZYK', ssn: '666701010', dob: '1992-10-03', street1: '1181 WOODWARD AVE', city: 'DETROIT', state: 'MI', zip: '48226', email: 'lauren.kowalczyk@example.com', phone: '5550101010', ip: '203.0.113.20' },
  // Synthetic identity: SSN not hers, DOB doesn't match, 9 inquiries in 25 days → synthetic sub plant
  P13: { firstName: 'KAYLA', lastName: 'BRENNAN', ssn: '666701013', dob: '1999-12-24', street1: '9021 KINGSTON PIKE', city: 'KNOXVILLE', state: 'TN', zip: '37923', email: 'kb.9921x@example.com', phone: '5550101013', ip: '198.51.100.13' },
  // Staff identities (approvers, inspectors): identity verifies cleanly; only person checks run on them
  P06: { firstName: 'ANGELA', lastName: 'MORRISSEY', ssn: '666701006', dob: '1979-04-18', street1: '960 MAPLEWOOD AVE', city: 'COLUMBUS', state: 'OH', zip: '43209', email: 'angela.morrissey@example.com', phone: '5550101006', ip: '203.0.113.16' },
  P07: { firstName: 'MARCUS', lastName: 'BELLAMY', ssn: '666701007', dob: '1975-12-05', street1: '1507 PEACHTREE INDUSTRIAL BLVD', city: 'ATLANTA', state: 'GA', zip: '30341', email: 'marcus.bellamy@example.com', phone: '5550101007', ip: '203.0.113.17' },
  P15: { firstName: 'NICOLE', lastName: 'FARRAGUT', ssn: '666701015', dob: '1983-03-30', street1: '7700 NE 72ND AVE', city: 'PORTLAND', state: 'OR', zip: '97218', email: 'nicole.farragut@example.com', phone: '5550101015', ip: '203.0.113.25' },
  P17: { firstName: 'ELENA', lastName: 'CASTELLANOS', ssn: '666701017', dob: '1987-11-20', street1: '4400 N CENTRAL EXPY STE 100', city: 'DALLAS', state: 'TX', zip: '75206', email: 'elena.castellanos@example.com', phone: '5550101017', ip: '203.0.113.27' },
  P18: { firstName: 'TERRENCE', lastName: 'ABERNATHY', ssn: '666701018', dob: '1980-02-29', street1: '2102 S HALSTED ST', city: 'CHICAGO', state: 'IL', zip: '60608', email: 'terrence.abernathy@example.com', phone: '5550101018', ip: '203.0.113.28' },
  P20: { firstName: 'DOLORES', lastName: 'WHITCOMB', ssn: '666701020', dob: '1952-05-04', street1: '612 OCEAN VIEW DR', city: 'SANTA BARBARA', state: 'CA', zip: '93109', email: 'dolores.whitcomb@example.com', phone: '5550101020', ip: '203.0.113.30' },
  // Tax lien + civil judgment → shows liens to the finance approver
  P08: { firstName: 'PRIYA', lastName: 'VENKATESAN', ssn: '666701008', dob: '1981-07-27', street1: '3300 N LAKE SHORE DR APT 15C', city: 'CHICAGO', state: 'IL', zip: '60657', email: 'priya.venkatesan@example.com', phone: '5550101008', ip: '203.0.113.18' },
  // SSN belongs to another name, DOB mismatch → the beneficiary-change impostor
  P12: { firstName: 'VICTOR', lastName: 'ANAND', ssn: '666701012', dob: '1968-08-08', street1: '55 WATER ST FL 20', city: 'NEW YORK', state: 'NY', zip: '10041', email: 'v.anand.1968@example.com', phone: '5550101012', ip: '198.51.100.12' },
  // Deceased SSN
  P14: { firstName: 'HAROLD', lastName: 'PETTIGREW', ssn: '666701014', dob: '1948-01-19', street1: '310 ELM ST', city: 'DAYTON', state: 'OH', zip: '45402', email: 'harold.pettigrew@example.com', phone: '5550101014', ip: '203.0.113.24' },
  // Fraud alert on file → step-up, not auto-pass
  P16: { firstName: 'SAMUEL', lastName: 'OYELARAN', ssn: '666701016', dob: '1977-06-12', street1: '1200 BRICKELL BAY DR APT 2203', city: 'MIAMI', state: 'FL', zip: '33131', email: 'samuel.oyelaran@example.com', phone: '5550101016', ip: '203.0.113.26' },
  // Small-business owner, clean → subcontractor owner
  P19: { firstName: 'GRACE', lastName: 'NAKAMURA', ssn: '666701019', dob: '1976-09-16', street1: '1850 SOLANO AVE', city: 'BERKELEY', state: 'CA', zip: '94707', email: 'grace.nakamura@example.com', phone: '5550101019', ip: '203.0.113.29' },
} satisfies Record<string, PersonInput>;
