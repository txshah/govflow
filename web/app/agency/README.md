# agency/

Route folder; see `page.tsx`: the agency (government) room where the agency PM accepts the prime's work and two finance approvers release USDC.

**Inputs**

- Agency-scoped pay applications, prime-contract milestones, matches, verifications, agentAction rows
- Agency treasury balance

**Outputs**

- inspectMilestone calls for pay-application lines
- Approve / reject / unfreeze actions
- Live agent feed and fraud alerts
