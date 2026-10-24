# SpacetimeDB setup

macOS · TypeScript server module · React client · local server. Goal: every organization's room, the milestone, invoice and payment state machines, approvals and the audit log live in one database that pushes changes to every screen instantly.

**Architecture:** React rooms (`spacetimedb/react`) ⇄ SpacetimeDB module (tables + reducers enforce the state machines) ← Node API reports CRS and Coinbase results through reducers. Secrets stay in the Node API.

## 1. Install the CLI

Follow spacetimedb.com/install, then confirm:

```bash
spacetime --version
```

## 2. Create the project

```bash
spacetime dev --template basic-ts
```

This starts a local server, publishes the TypeScript module and generates client bindings into `src/module_bindings/`. The server module lives in `spacetimedb/src/index.ts`.

## 3. Client SDK

```bash
npm install spacetimedb
```

React hooks come from `spacetimedb/react`: `SpacetimeDBProvider`, `useSpacetimeDB`, `useTable`, `useReducer`. The old `@clockworklabs/spacetimedb-sdk` package is deprecated.

## 4. First connection

```ts
const conn = DbConnection.builder()
  .withUri("ws://localhost:3000")
  .withDatabaseName("govflow")
  .onConnect((conn, identity, token) => {
    conn.subscriptionBuilder().subscribe(tables.invoice);
  })
  .build();
await conn.reducers.submitInvoice({ milestoneId, amount });
```

Test from the terminal while building:

```bash
spacetime call submit_invoice <args>
spacetime sql "SELECT * FROM invoice"
spacetime logs
```

## 5. Tables

Define with `schema, table, t` from `spacetimedb/server`. Give every table a primary key; only those get `onUpdate` callbacks.

| Table | Key fields |
| --- | --- |
| organization | id, kind (agency, prime, sub), verificationId, verifiedAt |
| member | identity, orgId, role (inspector, finance approver, sub admin) |
| contract | id, primeOrgId, subOrgId, scheduleOfValues |
| milestone | id, contractId, state, evidenceRefs, inspectorDecision |
| invoice | id, milestoneId, amount, beneficiaryWallet, state |
| approval | id, subjectId, approverIdentity, decision, at |
| verification | id, subjectId, passed, reasons, checkedAt, identityHash |
| payment | id (idempotency key), invoiceId, state, txHash |
| x402Receipt | id, agentId, endpoint, amount, paymentRef |
| auditEvent | id, actor, action, subjectId, at (append-only) |

**Deal and multiplayer tables** (see the Hyphenate playbook):

| Table | Key fields |
| --- | --- |
| deal | id, contractId, state (DRAFT, AWAITING\_SIGNATURES, ACTIVE, CLOSED), requiredSigners |
| mandate | id, orgId, agentId, scope, limits, signedBy, expiresAt |
| agentAction | id, agentId, dealId, step, status, at (streams into the room) |
| roomComment | id, author, targetId, text (redirects to the agent) |

Add reducers `signDeal` (verified signers only; ACTIVE when all required signatures are in) and `signMandate`; every agent-facing reducer checks the agent has an unexpired mandate on an ACTIVE deal.

## 6. Reducers enforce the blueprint

Reducers are the only way to write data, so each rule is checked once, on the server.

| Reducer | Rule it enforces |
| --- | --- |
| `submitEvidence` | Only the sub's members; milestone IN\_PROGRESS → SUBMITTED\_FOR\_INSPECTION |
| `inspectMilestone` | Only an inspector; → ACCEPTED or REJECTED |
| `submitInvoice` | Milestone must be ACCEPTED; invoice → SUBMITTED |
| `recordMatch` | Node API service identity only; → MATCHED or MISMATCH (MISMATCH freezes) |
| `changeBeneficiary` | Always → PAYMENT\_FROZEN |
| `recordVerification` | Node API service identity only |
| `approveInvoice` | Finance approvers only; two distinct approvers; frozen invoices also need a newer passing verification |
| `recordPayment` | Node API only; payment states in order; one row per idempotency key |

Every reducer appends an `auditEvent`. Agents never call state-changing reducers.

## 7. Connect to GovFlow

1. Each room is a filtered view: the prime room subscribes to its own contracts and invoices; the sub room to its own milestones; the shared envelope view to the invoice and its approvals.
2. The Node API connects as its own identity, listens for invoices reaching APPROVED, runs the payout, and reports back through `recordPayment`.
3. The audit log screen is a `useTable` over `auditEvent`, newest first, with transaction hashes linked to sepolia.basescan.org.

## 8. Verify the install

| Test | Expected |
| --- | --- |
| `spacetime --version` | Installed |
| `spacetime dev --template basic-ts` | Local server running, module published |
| `spacetime sql "SELECT * FROM invoice"` | Query returns |
| Two browser windows | An approval in one appears in the other without refresh |
| `inspectMilestone` called by a non-inspector | Rejected with an error |
| `changeBeneficiary` | Invoice shows PAYMENT\_FROZEN in every room |

## 9. Prompt for Claude Code

```text
Create the GovFlow SpacetimeDB TypeScript module from the basic-ts template.
Add tables: organization, member, contract, milestone, invoice, approval, verification, payment, x402Receipt, auditEvent, each with a primary key.
Implement reducers that enforce the milestone, invoice and payment state machines exactly as specified, with role checks: only inspectors accept milestones, two distinct finance approvers approve invoices, changeBeneficiary always freezes, only the Node API service identity records matches, verifications and payments.
Every reducer appends an auditEvent. Agents must never be able to call a state-changing reducer.
Then build React rooms with spacetimedb/react hooks for the prime, sub and shared envelope views.
```

## References

- [SpacetimeDB TypeScript quickstart](https://spacetimedb.com/docs/quickstarts/typescript)
- [TypeScript client SDK](https://spacetimedb.com/docs/clients/typescript)
- [TypeScript modules](https://spacetimedb.com/docs/modules/typescript)
- [basic-ts template](https://spacetimedb.com/templates/basic-ts)
