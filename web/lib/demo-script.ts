/**
 * The demo script, computed live: for each level (agency → prime, prime → sub) it finds the next contract line still to be paid and reports which of the six demo steps are done, which one is next, and who performs it.
 *
 * Inputs:
 * - Live rows; level "gov" | "sub"
 *
 * Outputs:
 * - { steps, milestone, invoice, finished } where each step has who (persona key), where (route), and status
 */

import type { Live } from "@/components/app/providers"

export type DemoStatus = "done" | "next" | "waiting" | "blocked"
export type DemoStep = {
  key: string
  title: string
  hint: string
  who?: { persona: string; label: string }[]
  where?: string
  auto?: boolean
  status: DemoStatus
}

const PEOPLE = {
  gov: {
    preparer: { persona: "primeAP", label: "prime AP" },
    reviewer: { persona: "agencyPM", label: "agency PM" },
    approvers: [
      { persona: "agencyFin1", label: "approver 1" },
      { persona: "agencyFin2", label: "approver 2" },
    ],
    payeeRoom: "/prime",
    payerRoom: "/agency",
    agent: "Agency agent",
    billWord: "pay application",
  },
  sub: {
    preparer: { persona: "subOwner", label: "sub owner" },
    reviewer: { persona: "primeInspector", label: "inspector" },
    approvers: [
      { persona: "primeCtrl1", label: "controller 1" },
      { persona: "primeCtrl2", label: "controller 2" },
    ],
    payeeRoom: "/sub",
    payerRoom: "/inspector",
    agent: "Prime agent",
    billWord: "invoice",
  },
} as const

const ORDER = ["DRAFT", "SUBMITTED", "MATCHED", "FINANCE_REVIEW", "APPROVED", "PAYMENT_QUEUED", "SETTLED"]

export function demoScript(live: Live, level: "gov" | "sub") {
  const people = PEOPLE[level]
  const contract = live.contracts.find(c => c.kind === (level === "gov" ? "PRIME_CONTRACT" : "SUBCONTRACT"))
  const lines = contract ? live.milestones.filter(m => m.contractId === contract.id).sort((a, b) => a.lineNo - b.lineNo) : []
  const billOf = (mId: bigint) =>
    [...live.invoices].filter(i => i.milestoneIds.includes(mId) && i.state !== "REJECTED").sort((a, b) => (a.id > b.id ? -1 : 1))[0]
  const milestone = lines.find(m => billOf(m.id)?.state !== "SETTLED")
  const invoice = milestone ? billOf(milestone.id) : undefined
  const lastPaid = [...lines].reverse().map(m => billOf(m.id)).find(i => i?.state === "SETTLED")
  const at = invoice ? ORDER.indexOf(invoice.state) : -1
  const frozen = invoice?.state === "PAYMENT_FROZEN"

  const ms = milestone?.state ?? ""
  const raw: Omit<DemoStep, "status">[] = [
    {
      key: "evidence",
      title: "Submit proof the work is done",
      hint: milestone ? `Line ${milestone.lineNo} · ${milestone.description}` : "",
      who: [people.preparer],
      where: `${people.payeeRoom}?tab=work`,
    },
    {
      key: "accept",
      title: "Accept the work",
      hint: "The paying side confirms it on site",
      who: [people.reviewer],
      where: `${people.payerRoom}?tab=work`,
    },
    {
      key: "bill",
      title: `Create and submit the ${people.billWord}`,
      hint: "Bill any amount up to the line's value",
      who: [people.preparer],
      where: `${people.payeeRoom}?tab=work`,
    },
    {
      key: "check",
      title: "Agent checks it and pays for a CRS check",
      hint: `${people.agent} matches the bill, pays 0.01 USDC via x402`,
      auto: true,
      where: invoice ? `/verify/${invoice.id}` : undefined,
    },
    {
      key: "approve",
      title: "Two people approve",
      hint: "Different verified approvers from the paying org",
      who: [...people.approvers],
      where: invoice ? `/envelope/${invoice.id}` : undefined,
    },
    {
      key: "paid",
      title: "USDC settles",
      hint: "Then open the verification view",
      auto: true,
      where: invoice ? `/verify/${invoice.id}` : lastPaid ? `/verify/${lastPaid.id}` : undefined,
    },
  ]

  const done: Record<string, boolean> = {
    evidence: ["SUBMITTED_FOR_INSPECTION", "ACCEPTED"].includes(ms),
    accept: ms === "ACCEPTED",
    bill: at >= 1 || frozen,
    check: at >= ORDER.indexOf("FINANCE_REVIEW"),
    approve: at >= ORDER.indexOf("APPROVED"),
    paid: invoice?.state === "SETTLED",
  }
  let nextGiven = false
  const steps: DemoStep[] = raw.map(s => {
    if (done[s.key]) return { ...s, status: "done" }
    if (frozen && (s.key === "check" || s.key === "approve")) {
      nextGiven = true
      return { ...s, status: "blocked", hint: "Frozen until the payee re-verifies and two approvers agree", where: invoice ? `/cases/${invoice.id}` : s.where }
    }
    if (!nextGiven) {
      nextGiven = true
      return { ...s, status: "next" }
    }
    return { ...s, status: "waiting" }
  })

  return { contract, milestone, invoice, lastPaid, steps, finished: !milestone && lines.length > 0 }
}
