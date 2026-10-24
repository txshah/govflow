# spacetimedb/

SpacetimeDB TypeScript module: the single source of truth where tables hold all state and reducers are the only way to write it. Published to Maincloud as `govflow-855y2` (settings in the repo-root `spacetime.json`).

- Test: `npm test` (in-memory, ~1s)
- Publish: from the repo root, `spacetime publish --yes` (add `--delete-data=always` after a breaking schema change, then reseed)
- Inspect: `spacetime sql govflow-855y2 "SELECT * FROM invoice"`, `spacetime logs govflow-855y2`
- **Privacy:** every table except `organization` is private. Clients read through the `my_*` views in `src/views.ts` (plus `me`), which return only their own org's room and the envelopes they share with a counterparty; the Node API service sees everything.
- **Regenerate bindings after any schema change** (both clients):
  `spacetime generate --lang typescript --out-dir web/lib/module_bindings --module-path ./spacetimedb --no-config`
  and the same with `--out-dir api/src/module_bindings`
- **Verifications:** `recordVerification` takes `decision` (`PASS` | `REVIEW` | `FAIL`), not `passed`. REVIEW freezes a
  bill with `VERIFICATION_REVIEW` (two approvers can release it); FAIL freezes with `VERIFICATION_FAILED`
- **Service identity:** the Node API (`c20059a9…`, token in `api/.stdb-service-token`) is the approved SERVICE admin
- **Seeded data:** see `seed/README.md` (org ids, deals, demo logins)
- `CLAUDE.md` here is SpacetimeDB's API guide from the official template

**Inputs**

- Reducer calls from browsers (people), and from the Node API service identity (CRS/x402/payout results and agents)

**Outputs**

- Live row subscriptions pushed to every room
- Generated client bindings for web/ and api/
