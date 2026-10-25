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

## Full script (2:00)

**Open (0:00–0:15)**
> "Cities lose six-figure sums to one email: 'Hi, we changed our bank details.' The next payment goes to the impostor. GovFlow makes that email worthless. Here it is, live."

**Demo (0:15–1:25).** The driver is already on `/live`, and the project is already posted.

> "The city posts a bridge repair. Before anyone can win it, CRS screens every applicant: identity, credit, liens, and fraud signals." *(Driver tries to select the failed applicant.)* "This one failed, so the database itself blocks the award, and here's why."

> "Okafor Builders wins. They finish the first milestone, the inspector accepts it, and they send a pay application. Claude reads it against the contract and the accepted work and says MATCHED. Claude can flag a bill, but it can never approve or pay one."

> "Before money moves, the city's agent pays one cent in test USDC over x402 for a fresh CRS check on the payee, and the result must match the identity recorded at award."

> *(Driver triggers the impostor email.)* "Now the fraud. An email claims to be Okafor and asks for a new wallet. The bill freezes instantly. The agent re-checks the payee and the sender with CRS, and Claude writes a case file: high risk, unverified channel, the sender's identity failed. Two approvers reject the change."

> "Two approvals, and USDC settles on Base Sepolia to the verified wallet. The impostor got nothing. And the same rules run one level down, from prime to subcontractor."

**Honesty line (say it during the demo):**
> "Everything here is sandbox: CRS test personas, test USDC on Base Sepolia, and a mock business registry, because CRS doesn't offer one."

**Tech (1:25–1:45)**
> "The rules don't live in the AI. They live in SpacetimeDB reducers: roles, freezes, two-person approval and spend caps. Our API is just a service identity. It does the outside work with Claude, CRS, x402 and Coinbase, then writes back, and the database re-checks every rule. So even a fully compromised agent can't pay an impostor."

**Impact (1:45–2:00)**
> "Every party verified, every bill checked, every wallet change frozen until people decide. Next: Claude vision on evidence photos and real registry data. Thank you."

## 30-second version (for a judge who arrives late)

> "GovFlow stops payment-redirection fraud on public contracts. Watch." *(Show the frozen bill and the case file.)* "An impostor emailed a new wallet. The bill froze, CRS re-checked the payee and the sender, and Claude wrote this case file. Two people rejected it." *(Show SETTLED.)* "The real contractor got paid in USDC on Base Sepolia. The agent can't approve or pay, because the database enforces it."

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
