/**
 * Gathers everything the story scenes need for one project: the prime contract and its deal, every contractor's CRS screening, the winner's checks, signatures and agent mandates, the people on each side, the first payment to the prime, the subcontract and the payment to the sub, and the totals.
 *
 * Inputs:
 * - Live rows; optional ids from the live director (else the first prime contract is used)
 *
 * Outputs:
 * - buildStory(): a plain object the scene components render
 */

import type { Live } from "@/components/app/providers"
import type { StoryIds } from "@/lib/director"

type Org = Live["organizations"][number]
type V = Live["verifications"][number] & { decision?: string }

export function latestOrgCheck(live: Live, orgId: bigint): V | undefined {
  return [...live.verifications]
    .filter(v => v.orgId === orgId && v.subjectType === "ORG")
    .sort((a, b) => (a.checkedAt.microsSinceUnixEpoch > b.checkedAt.microsSinceUnixEpoch ? -1 : 1))[0] as V | undefined
}

export const decisionOf = (v?: V) => (v ? (v.decision ?? (v.passed ? "PASS" : "FAIL")) : "UNCHECKED")

export function buildStory(live: Live, ids: StoryIds = {}) {
  const agency = live.organizations.find(o => o.kind === "AGENCY")
  const prime = live.organizations.find(o => o.kind === "PRIME")
  const contract =
    (ids.contract !== undefined ? live.contracts.find(c => c.id === ids.contract) : undefined) ??
    [...live.contracts].filter(c => c.kind === "PRIME_CONTRACT").sort((a, b) => (a.id < b.id ? -1 : 1))[0]
  const deal = contract ? live.deals.find(d => d.contractId === contract.id) : undefined
  const lines = contract ? live.milestones.filter(m => m.contractId === contract.id).sort((a, b) => a.lineNo - b.lineNo) : []
  const subContract =
    (ids.subContract !== undefined ? live.contracts.find(c => c.id === ids.subContract) : undefined) ??
    (contract ? live.contracts.find(c => c.parentContractId === contract.id) : undefined)
  const subDeal = subContract ? live.deals.find(d => d.contractId === subContract.id) : undefined
  const sub = subContract ? live.organizations.find(o => o.id === subContract.payeeOrgId) : undefined

  const billOn = (contractId: bigint | undefined, pinned?: bigint) =>
    (pinned !== undefined ? live.invoices.find(i => i.id === pinned) : undefined) ??
    [...live.invoices]
      .filter(i => i.contractId === contractId)
      .sort((a, b) => (a.state === "SETTLED" ? -1 : 1) - (b.state === "SETTLED" ? -1 : 1) || (a.id < b.id ? -1 : 1))[0]
  const bill1 = contract ? billOn(contract.id, ids.bill1) : undefined
  const bill2 = subContract ? billOn(subContract.id, ids.bill2) : undefined

  // Everyone screened by CRS except the agency itself; the chosen prime goes last so the reveal lands on it.
  const applicants = live.organizations
    .filter(o => o.kind !== "AGENCY" && (!sub || o.id !== sub.id))
    .map(o => ({ org: o, check: latestOrgCheck(live, o.id) }))
    .sort((a, b) => (a.org.kind === "PRIME" ? 1 : 0) - (b.org.kind === "PRIME" ? 1 : 0))

  const peopleOf = (org?: Org) => (org ? live.members.filter(m => m.orgId === org.id) : [])
  const sigs = deal ? live.signatures.filter(s => s.dealId === deal.id) : []
  const mandates = deal ? live.mandates.filter(m => m.dealId === deal.id && !m.revoked) : []
  const subSigs = subDeal ? live.signatures.filter(s => s.dealId === subDeal.id) : []
  const subMandates = subDeal ? live.mandates.filter(m => m.dealId === subDeal.id && !m.revoked) : []
  const nameOf = (hex?: string) => live.members.find(m => m.identity.toHexString() === hex)?.displayName

  const settled = live.invoices.filter(i => i.state === "SETTLED")
  return {
    agency,
    prime,
    sub,
    contract,
    deal,
    lines,
    subContract,
    subDeal,
    bill1,
    bill2,
    applicants,
    primeCheck: prime ? latestOrgCheck(live, prime.id) : undefined,
    subCheck: sub ? latestOrgCheck(live, sub.id) : undefined,
    people: { agency: peopleOf(agency), prime: peopleOf(prime), sub: peopleOf(sub) },
    sigs,
    mandates,
    subSigs,
    subMandates,
    nameOf,
    totals: {
      paid: settled.reduce((s, i) => s + i.amount, 0n),
      bills: settled.length,
      blocked: live.changes.filter(c => c.state === "REJECTED").length,
      people: live.members.filter(m => m.verified).length,
    },
  }
}

export type Story = ReturnType<typeof buildStory>
