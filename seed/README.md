# seed/

Demo data: the seeded deal, the fraud email and the 10-invoice answer key.

**Inputs**

- Sandbox test identities

**Outputs**

- Rows inserted into SpacetimeDB before the demo

**Seeding the shared database**

`cd api && npm run seed` runs `seedDeal.ts` against Maincloud (`govflow-855y2`). It refuses to run if any organization
already exists; starting over means `spacetime publish --delete-data`, which wipes the shared database for everyone.

Current seed (2026-10-24):

| Org id | Org | Owner persona | CRS result |
| --- | --- | --- | --- |
| 1 | CITY OF OAKRIDGE PUBLIC WORKS (agency) | — | PASS (seeded agency registry) |
| 2 | OKAFOR BUILDERS LLC (prime) | P01 | PASS, payout wallet bound |
| 3 | NAKAMURA ELECTRIC INC (sub) | P19 | PASS, payout wallet bound |
| 4–9 | Planted subs from `api/src/crs/answerKey.ts` | P08, P13, P03, P04, P02, P10 | PASS with liens, FAIL, REVIEW ×4 |

Deal 1 is the prime contract (agency → prime), deal 2 the subcontract (prime → sub); both ACTIVE with mandates.

**Demo logins:** `seed/.demo-tokens.json` (gitignored, mode 600) maps each person (`agencyPM`, `agencyFin1`, `agencyFin2`,
`primeAP`, `primeCtrl1`, `primeCtrl2`, `primeInspector`, `subOwner`) to their SpacetimeDB token and identity, so the web
app can sign in as them. Never commit it or print the tokens.
