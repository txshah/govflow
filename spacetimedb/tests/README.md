# spacetimedb/tests/

Rule tests for the SpacetimeDB module, run in memory with SpacetimeDB's test harness (no server, no Maincloud). `world.ts` builds a fully signed agency → prime → sub project that every test starts from.

Run: `cd spacetimedb && npm test`

**Inputs**

- The module's reducers, called as named personas (agency PM, agency finance ×2, prime AP, prime controllers ×2, prime inspector, sub owner, the Node API service, an outsider)

**Outputs**

- Pass/fail for: two-approver rule (`approvals`), beneficiary-change freeze and unfreeze (`freeze`), agent mandates and x402 caps (`agentPermissions`), contract direction and billing rules at both levels (`fundingChain`), double-entry ledger and payout idempotency (`ledger`)
