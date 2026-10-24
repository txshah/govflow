# [invoiceId]/

Route folder; see `page.tsx`: shared payment envelope: the only cross-org view, showing one invoice's match, attestation, approvals and payout.

**Inputs**

- invoice, approval, verification, payment rows for invoiceId

**Outputs**

- Status timeline through the invoice state machine
- Approve button for eligible approvers
- Basescan link once settled
