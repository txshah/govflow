# GovFlow AI: Devpost draft

**Tagline:** GovFlow helps cities pay contractors safely by verifying every payee with CRS, checking every bill with Claude, and releasing test USDC only after two verified people approve.

## Inspiration

Public construction money moves through a chain: a city pays a prime contractor, and the prime pays its subcontractors. Payment-redirection fraud targets that chain. An impostor emails "we changed our bank details", and the next payment goes to them. Agencies lose six-figure sums this way. We wanted every payee verified, every bill checked against accepted work, and every change of wallet frozen until people decide.

## What it does

- **Verified parties.** Before a contract is awarded or a bill is paid, GovFlow runs CRS sandbox checks on the business and the people behind it: TransUnion identity, credit file, PitchPoint liens and judgments, and Fraud Finder. It stores an attestation hash, never the raw data.
- **Claude checks every bill.** Claude reads each pay application against the contract, the schedule of values and the accepted milestones. It returns MATCHED, MISMATCH or UNSURE with reasons. Rule checks in code always win, and a bill that tries to instruct the model is never MATCHED. Claude can flag a bill but can never approve or pay it.
- **Agents pay for their own checks.** Before payout, the payer's agent pays 0.01 test USDC over x402 for a fresh CRS check of the payee. The verified identity must match the one stored at award, and the payout wallet must match the verified wallet.
- **Fraud freeze.** Logging a "new wallet" email freezes the bill. The agent re-verifies the payee, checks the claimed sender against CRS, and Claude writes a case file. Two approvers then reject the change.
- **Two approvals, then settlement.** USDC settles on Base Sepolia to the verified wallet. The same rules apply one level down, from prime to subcontractor.
- **Multiplayer rooms.** The agency, prime, sub and inspector each see their own live view of the same deal.

## How we built it

- **SpacetimeDB on Maincloud** is the source of truth. Tables are private, and each org reads only its own `my_*` views. Reducers enforce roles, state machines, two-person approval, freezes and spend caps.
- **A Node API** connects once as a service identity. It sweeps the cache, does the outside work (Claude, CRS, x402, CDP), and writes results back through service-only reducers. The database re-checks every rule.
- **Claude (`claude-opus-5-5`)** runs through the Anthropic TypeScript SDK with structured JSON output: one prompt matches bills, one writes fraud case files.
- **Coinbase CDP + x402:** an x402 seller endpoint sells the verification check. The agent's CDP wallet is limited by spend controls: 0.01 per call, 0.10 per day, one allowed payee, USDC only, Base Sepolia only. Payouts are CDP server-wallet ERC-20 transfers with idempotency keys.
- **CRS sandbox:** TransUnion identity, credit report, PitchPoint liens and judgments, and Fraud Finder, all run against the test personas.
- **Next.js + shadcn/ui** for the rooms, the Live demo view, the tender board and the ledger and audit views.

## Challenges we ran into

- **Keeping an AI agent away from the money.** The agent may only propose. Approving, unfreezing and paying are reducers that need verified humans.
- **Making Claude's verdict stable enough to drive a state change.** We spiked it 3/3 on clean, wrong-work and prompt-injection bills, and backed it with deterministic rules that override Claude.
- **Testnet hygiene.** We added a Base Sepolia-only guard, a 1.00 USDC payout cap, faucet limits, and CDP idempotency keys that collided after a database reseed.
- **The CRS sandbox has no business-registry or OFAC product**, so the business registry is a labelled mock and sanctions come from the Treasury SDN list.

## Accomplishments that we're proud of

- The full journey runs live: Claude match → paid x402 CRS check → impostor email freeze → CRS re-check → case file → change rejected → two approvals → USDC settles on Base Sepolia. The impostor wallet receives nothing.
- Rules are enforced in the database itself, with 73 module tests.

## What we learned

- x402 is a natural fit for agents that buy checks per use, as long as spend controls are strict.
- With a live database, each room's view comes from subscriptions to the same rows and needs no separate sync code.

## What's next

- Claude vision checks of evidence photos and documents, including a PII checklist.
- Real business-registry and sanctions data sources.
- Bank on-ramp and off-ramp, and a payout reconciliation report.
- Step-up (OTP) for approvers.

## Honesty (disclose)

- CRS sandbox personas only; all identity data is fake. The business registry check is a mock (`state_filing:mock`).
- Fraud Finder falls back to a labelled mock if the sandbox call fails.
- Test USDC on Base Sepolia only, tiny amounts, a 1.00 USDC cap, and no real money.
- The fraud email and the contractor bidding are seeded or scripted. The claimed sender is matched by the name in the email, not by real email authentication.
- The x402 endpoint runs on localhost. The payout adapter defaults to simulated (`PAYOUT_ADAPTER=cdp` for real testnet transfers).

## Built with

SpacetimeDB, Next.js, shadcn/ui, Anthropic TypeScript SDK (Claude Opus 5.5), Coinbase CDP SDK, x402, viem, CRS sandbox APIs. AI coding tool: Claude Code.
