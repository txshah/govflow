# CRS setup

macOS · Node API · CRS sandbox · provided test identities only. Goal: verify each organization and signer once, re-verify on any beneficiary change, and store only an attestation.

**Architecture:** GovFlow Node API → CRS sandbox (Bearer token) → identity, business and OFAC results → attestation row in SpacetimeDB → the x402 verification endpoint and the payment freeze both read it.

## 1. Get access

1. Enter your email at calhacks.crscreditapi.com (Get started).
2. Follow the first email to create your CRS portal account and get credentials.
3. A second email links a Postman collection with every request for your products, OpenAPI specs and test cases.
4. Questions: the CRS booth all weekend.

## 2. Optional: CRS MCP in Claude Code

CRS publishes `@crscreditapi/crs-calhacks-mcp-server` on npm for planning, development and debugging questions. Follow the setup on its npm page; I couldn't open that page to confirm the exact command.

## 3. Credentials

Add to `.env.local` (already in `.gitignore`):

```bash
CRS_BASE_URL=https://api-sandbox.stitchcredit.com:443/api
CRS_USERNAME=your_username
CRS_PASSWORD=your_password
```

## 4. First call

Get a token, then pull the sample report with the sample test identity:

```bash
TOKEN=$(curl -s "$CRS_BASE_URL/users/login" \
  -H 'Content-Type: application/json' -H 'Accept: application/json' \
  -d "{\"username\":\"$CRS_USERNAME\",\"password\":\"$CRS_PASSWORD\"}" | jq -r .token)

curl -s "$CRS_BASE_URL/experian/credit-profile/credit-report/standard/exp-prequal-vantage4" \
  -H 'Content-Type: application/json' -H 'Accept: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"firstName":"KYLIA","middleName":"","lastName":"PAOLIMELLI","suffix":"","birthDate":"1920-01-01","ssn":"666285642","addresses":[{"borrowerResidencyType":"Current","addressLine1":"406 E JEMEZ ST","addressLine2":"","city":"HOBBS","state":"NM","postalCode":"882403443"}]}'
```

Check the login response for the token field name; `.token` is a guess.

## 5. Find the endpoints you need

The sandbox offers credit data, identity (IDV), prefill, business credit, public records, criminal and eviction, and compliance (OFAC, MLA). Copy the exact paths for these four from the Postman collection:

| Product | GovFlow use | Step |
| --- | --- | --- |
| Identity verification | Verify each signer and each payee's owner | Onboarding, beneficiary change |
| Business credit | Confirm prime and sub are real businesses with state filings | Onboarding |
| Compliance (OFAC) | Sanctions screen on every organization and owner | Onboarding, before payout |
| Public records | Liens and judgments, shown to the finance approver | Onboarding |

## 6. Connect to GovFlow

`crs.ts` in the Node API:

1. `login()` caches the Bearer token and refreshes on 401.
2. `verifyPerson(identity)` and `verifyBusiness(org)` call the endpoints above.
3. The result becomes an attestation: `{ subjectId, products, passed, reasons, checkedAt, identityHash }`, written through the `recordVerification` reducer.
4. The x402 endpoint `/api/verification/contractor` calls these functions instead of returning simulated data.
5. `changeBeneficiary` always freezes; only a fresh passing `verifyPerson` for the owner on file plus two approvals can unfreeze.

## 7. Data rules

| Rule | Demo behavior |
| --- | --- |
| Test data | Provided test identities only |
| Storage | Attestation and hash only; no raw SSN, DOB or report |
| Logs | Never log request bodies or tokens |
| Labels | Show "CRS sandbox" on every verification badge |
| Scope | Agents read attestations, never raw CRS responses |

CRS judges score being open about data use, so say this in the demo.

## 8. Spike before building

- [ ] Does identity verification flag a mismatch when a test SSN is sent with the wrong name or birth date?
- [ ] Which business credit test entities exist?
- [ ] Are there rate limits?

If the sandbox does not flag mismatches, compare prefill results with the identity fields you sent and raise the mismatch yourself.

## 9. Verify the install

| Test | Expected |
| --- | --- |
| Login call | A Bearer token |
| Sample report call | JSON credit report for the test identity |
| Postman collection | IDV, business credit and OFAC requests present |
| `verifyPerson` with matching data | `passed: true` |
| `verifyPerson` with a wrong name | `passed: false` with a reason |
| SpacetimeDB `verification` table | Attestation rows, no raw identity fields |

## 10. Prompt for Claude Code

```text
Add a CRS client to the GovFlow Node API.
Use CRS_BASE_URL, CRS_USERNAME and CRS_PASSWORD from the environment; cache the Bearer token and refresh on 401.
Implement verifyPerson and verifyBusiness using the endpoint paths from our Postman collection (identity verification, business credit, OFAC).
Return and store only an attestation (subjectId, products, passed, reasons, checkedAt, identityHash); never store or log raw identity data or reports.
Wire the x402 contractor verification endpoint and the beneficiary-change unfreeze to these functions.
Use only the provided sandbox test identities.
```

## References

- [CRS Financial Intelligence Challenge](https://calhacks.crscreditapi.com)
- [CRS at SF Hacks 2026 (project ideas, sample code)](https://sf-hacks.crscreditapi.com/)
- [CRS Getting Started](https://crscreditapi.com/getting-started)
