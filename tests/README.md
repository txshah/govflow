# tests/

Tests for the parts outside the database: the Node API's x402 spend caps and the agents' prompt-injection handling. Database rule tests (approvals, freeze, agent permissions, funding chain, ledger) live in `spacetimedb/tests/` because they run against the module in memory.

**Inputs**

- Node API with simulated adapters and a mock x402 endpoint

**Outputs**

- Pass/fail per control in PROJECT.md §13 that the database can't enforce on its own
