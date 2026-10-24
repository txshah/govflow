# api/

Node API + agent runner: holds every secret and is the only process that talks to CRS, Coinbase CDP/x402 and Claude.

**Inputs**

- SpacetimeDB subscriptions (new evidence, invoices, beneficiary changes, approvals)
- Secrets from .env.local

**Outputs**

- Results written back only through service-identity reducers
- Payouts at both levels: agency treasury → prime, prime treasury → sub
