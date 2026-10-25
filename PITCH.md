# GovFlow AI: pitch

**Format (assumed):** a 2-minute pitch at a table, then 1–2 minutes of Q&A, with judges rotating. Change this if the real format differs.

**One-liner:** GovFlow lets a city pay its contractors in USDC only after CRS verifies who is being paid, Claude checks the bill against accepted work, and two verified people approve.

## Roles

| Role | Name |
|---|---|
| Driver (keyboard, `/live`) | _TBD_ |
| Narrator | _TBD_ |
| Tech answers | _TBD_ |
| Backup (video, hotspot, timer) | _TBD_ |

## Full script (about 2:30)

The script now runs about 2:30. If the slot is strictly 2:00, cut the stats line in the problem and the "same rules one level down" line.

**Problem: story slide 1 (0:00–0:25)**
> "In 2018, Cabarrus County, North Carolina, got an email from 'its contractor' building a new high school. It had a signed form and a bank letter asking to update the bank details. Staff made the change, and the county sent $2.5 million to scammers. Nobody noticed until the real contractor called about a missed payment. $1.7 million was never recovered."

> "That isn't rare. Business email compromise cost $2.77 billion in 2024 (FBI IC3 report). And the honest side is broken too: 82% of contractors wait more than 30 days to get paid (Rabbet, 2024). Tenders sit on portals, bids arrive by email, bank details live in spreadsheets, and there's no single place to verify who you're paying."

**Solution: story slide 2 (0:25–0:40)**
> "GovFlow makes public payments secure and seamless. Secure: every company and person is verified with CRS before award and re-checked before every payment. Money only goes to the wallet tied to the verified owner, and two people approve every payment, never an AI. Seamless: one place for every tender, bid and bill, and contractors are paid in USDC minutes after work is approved, not months later. Let me show you."

**Demo (0:40–1:55).** The driver switches to `/live`, where the project is already posted. Name each sponsor at the moment it does something.

> "The city posts a bridge repair. Before anyone can win it, **CRS** screens every applicant: TransUnion identity, credit, PitchPoint liens and judgments, and Fraud Finder." *(Driver tries to select the failed applicant.)* "This one failed CRS, so **SpacetimeDB** itself refuses the award. That rule lives in the database, not the UI."

> "Okafor Builders wins. Every screen updates live, because the city, the prime, the sub and the inspector are all subscribed to the same **SpacetimeDB** rows. Okafor finishes a milestone, the inspector accepts it, and they send a pay application. **Claude** reads it against the contract and the accepted work and returns MATCHED, with reasons. Claude can flag a bill, but it can never approve or pay one."

> "Before money moves, the city's agent buys a fresh CRS check on the payee, and it pays for it with one cent of USDC over **x402**. Its **Coinbase CDP** wallet is locked down: one cent per call, ten cents a day, one allowed payee, testnet only. The result must match the identity recorded at award."

> *(Driver triggers the impostor email.)* "Now the Cabarrus attack. An email claims to be Okafor and asks for a new wallet. The bill freezes instantly. The agent re-checks the payee and the sender with **CRS**, and **Claude** writes a case file: high risk, unverified channel, the sender's identity failed. Two approvers reject the change."

> "Two approvals, and **Coinbase CDP** sends USDC on Base Sepolia to the verified wallet, in seconds. The impostor got nothing. The same rules run one level down, from prime to subcontractor."

**Honesty line (say it during the demo):**
> "Everything here is sandbox: CRS test personas, test USDC on Base Sepolia, and a mock business registry, because CRS doesn't offer one."

**Tech (1:55–2:15)**
> "Four sponsors, four jobs. **CRS** answers 'who is this?' **Claude** answers 'is this bill right?' **x402 and Coinbase** move the money, whether it's a cent for a check or a payout. And **SpacetimeDB** is the referee: roles, freezes, two-person approval and spend caps are all reducers. Our API is just a service identity. It does the outside work and writes back, and the database re-checks every rule. So even a fully compromised agent can't pay an impostor."

**Impact (2:15–2:30)**
> "Cabarrus would have kept its $2.5 million: the email would have frozen the bill, not paid it. Every party verified, every bill checked, contractors paid in minutes. Next: Claude vision on evidence photos and real registry data. Thank you."

## 30-second version (for a judge who arrives late)

> "One fake 'new bank details' email cost Cabarrus County $2.5 million. GovFlow stops that on public contracts. Watch." *(Show the frozen bill and the case file.)* "An impostor emailed a new wallet. The bill froze, CRS re-checked the payee and the sender, and Claude wrote this case file. Two people rejected it." *(Show SETTLED.)* "The real contractor got paid in USDC on Base Sepolia. The agent can't approve or pay, because the database enforces it."

## Q&A

1. **Who is the user?** City finance and capital-projects teams, and the prime contractors who pay subs. Payment-redirection (BEC) fraud against public agencies is a recurring loss; we haven't interviewed an agency yet, and that's the next step.
2. **What did you build vs. use?** We built the SpacetimeDB module (tables, views, reducers, 73 tests), the agent API (matcher, risk reviewer, x402 seller and buyer, payout service) and the UI. We used the CRS, Coinbase CDP/x402 and Anthropic SDKs, plus shadcn/ui.
3. **What's mocked?** The business registry, the seeded fraud email, the scripted bidding, and the agency's own registry PASS. All identity data is CRS sandbox personas, and money is test USDC capped at 1.00. The x402 endpoint runs on localhost.
4. **Hardest problem?** Letting an agent take part without trusting it. It can only propose: approving, unfreezing and paying are reducers that need verified humans. And deterministic rule checks override Claude's verdict.
5. **How is this different from AP software or Bill.com?** Those trust a vendor record that can be edited. We re-verify identity per payment, freeze on any wallet change, and enforce the rules in the database rather than in the UI.
6. **What breaks at 1,000 users?** The single API sweeper and CRS rate limits. Next would be per-deal work queues and caching attestations by hash.
7. **Another week?** Claude vision checks on evidence and a PII checklist, real registry and sanctions feeds, a bank on/off ramp, and step-up auth for approvers.
8. **Tracks?** CRS: four sandbox products in the live pipeline. Coinbase: x402 paid checks and CDP wallet payouts with spend controls. SpacetimeDB: the source of truth and the rules engine, with live rooms. Anthropic: Claude matches bills and writes fraud case files, using structured outputs.

**Judge questions from HACK.md:**
- **What does the 1¢ buy?** A fresh, paid CRS check. It doesn't prove legal identity or signing authority.
- **What if the API crashes mid-payout?** Each payout has an idempotency key, and CDP has its own, so the payout resumes from its recorded state without paying twice.

## Before you pitch

- Run the pitch three times with a timer, and cut any line that runs long.
- Set up the demo machine:
  - notifications off, extra tabs closed, zoom at 125%;
  - the API running with `PAYOUT_ADAPTER=cdp`;
  - a fresh seed, or a known state;
  - the backup video open in a tab.
- Start on time, keep it honest, answer with curiosity, and thank the judges.
