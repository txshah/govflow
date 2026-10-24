# reducers/

Reducers enforce roles and state machines server-side; every one appends an auditEvent, and agents (which act through the service identity) can never call one that needs a person.

| File | Who calls it |
|---|---|
| `admin.ts` | Publisher (init), Node API (orgs, invites, first wallet binding), people (redeem invite) |
| `deal.ts` | Verified signers of each party |
| `milestone.ts` | Payee preparers (evidence), payer reviewers (accept/reject) |
| `invoice.ts` | Payee preparers, the service for mandated agents, either party for wallet changes |
| `approval.ts` | Verified finance approvers of the paying org |
| `service.ts` | Node API only: CRS results, x402 receipts, payouts, agent logs |
| `room.ts` | Any member |

**Inputs**

- Caller identity (ctx.sender) plus typed arguments

**Outputs**

- Validated row inserts/updates, or a thrown SenderError that rolls the whole call back
