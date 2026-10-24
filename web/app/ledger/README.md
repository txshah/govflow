# ledger/

Route folder; see `page.tsx`: ledger view of double-entry rows reconciled against onchain USDC transfers.

**Inputs**

- ledgerEntry and payment rows
- Reconciliation flags from the API

**Outputs**

- Balanced ledger table with tx links; red flag on any unmatched onchain transfer
