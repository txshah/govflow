# crs/

CRS sandbox client that turns identity and public-record checks into attestations.

**Inputs**

- CRS_BASE_URL / USERNAME / PASSWORD, IDENTITY_HASH_KEY
- Sandbox test personas only (`personas.ts`)

**Outputs**

- Attestations (no raw PII) recorded through recordVerification

**Sandbox products used**

| Product | Route | GovFlow use |
| --- | --- | --- |
| TransUnion identity | `POST /transunion/identity-manager-verification/basic` | Signers, payout owners, beneficiary-change re-verification |
| TransUnion credit report | `POST /transunion/credit-report/standard/tu-prequal-fico9` | Credit-file patterns: thin/no file, inquiry burst, history newer than the business |
| PitchPoint BLJ | `POST /pp/fcrablj/data` | Bankruptcies, liens, judgments shown to the finance approver |

State-filing rules (officer match, entity age, recent changes) run on seeded filings, not CRS.
OFAC is screened against the U.S. Treasury SDN list (`api/src/ofac/screen.ts`, cached a day), not CRS; a name match is REVIEW.
Decisions: FAIL = identity wrong; REVIEW = signals, not proof (money stays held); PASS. Cases live in `answerKey.ts`.

The CalHacks sandbox has no business-credit or OFAC product; a business is verified through its owner.
Login failures can disable the account, so `client.ts` never retries a failed login.

Smoke test: `cd api && npm run crs:smoke`
