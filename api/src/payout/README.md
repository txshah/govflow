# payout/

Sends USDC to the sub once an invoice is APPROVED and funded, then reconciles it with the ledger.

**Inputs**

- APPROVED invoices from SpacetimeDB

**Outputs**

- payment rows with txHash via recordPayment
