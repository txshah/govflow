/**
 * Derived, view-ready facts computed from live rows: each org's role in the chain, where every bill sits in the six-stage pipeline, each agent's status and spend, and one merged activity stream.
 *
 * Inputs:
 * - The Live rows from useLive()
 *
 * Outputs:
 * - chainOrgs(), billStages(), agentsOf(), activityStream(), approvalsFor(), contractTotals()
 */

import type { Live } from "@/components/app/providers"
import { actorName, agentLabel } from "@/lib/format"
import { describeAgentStep, describeAudit } from "@/lib/describe"

type Inv = Live["invoices"][number]
type Org = Live["organizations"][number]

export const orgName = (live: Live, id: bigint | null | undefined) =>
  id == null ? "—" : (live.organizations.find(o => o.id === id)?.name ?? `Org ${id}`)

// The three orgs on the demo chain: the agency, the prime, and the sub that holds a subcontract.
export function chainOrgs(live: Live): { agency?: Org; prime?: Org; sub?: Org } {
  const agency = live.organizations.find(o => o.kind === "AGENCY")
  const prime = live.organizations.find(o => o.kind === "PRIME")
  const subContract = live.contracts.find(c => c.kind === "SUBCONTRACT")
  const sub =
    (subContract && live.organizations.find(o => o.id === subContract.payeeOrgId)) ??
    live.organizations.find(o => o.kind === "SUB" && o.payoutWallet)
  return { agency, prime, sub }
}

export function approvalsFor(live: Live, inv: Inv, kind = "PAYMENT") {
  return live.approvals.filter(a => a.invoiceId === inv.id && a.round === inv.approvalRound && a.kind === kind)
}

export type StageStatus = "done" | "current" | "blocked" | "pending"
export type Stage = { key: string; label: string; status: StageStatus; detail?: string }

const ORDER = ["DRAFT", "SUBMITTED", "MATCHED", "FINANCE_REVIEW", "APPROVED", "PAYMENT_QUEUED", "SETTLED"]

// Six stages every bill moves through, at both levels.
export function billStages(live: Live, inv: Inv): Stage[] {
  const at = ORDER.indexOf(inv.state)
  const frozen = inv.state === "PAYMENT_FROZEN"
  const reached = (state: string) => at >= ORDER.indexOf(state)
  const approvals = approvalsFor(live, inv).filter(a => a.vote === "APPROVE").length

  // Where a frozen bill got stuck.
  const frozeAt =
    inv.freezeReason === "MISMATCH" || inv.freezeReason === "OVERBILLED" || inv.freezeReason === "WALLET_MISMATCH"
      ? "check"
      : inv.freezeReason.startsWith("VERIFICATION")
        ? "crs"
        : "approve"

  const s = (key: string, label: string, done: boolean, current: boolean, detail?: string): Stage => ({
    key,
    label,
    detail,
    status: frozen && key === frozeAt ? "blocked" : done ? "done" : current ? "current" : "pending",
  })

  const matched = inv.matchResult === "MATCHED" || reached("MATCHED")
  return [
    s("work", "Work accepted", true, false),
    s("bill", "Bill submitted", inv.state !== "DRAFT", inv.state === "DRAFT"),
    s("check", "Agent check", !frozen && matched, inv.state === "SUBMITTED", inv.matchResult || undefined),
    s("crs", "CRS verified", !frozen && reached("FINANCE_REVIEW"), inv.state === "MATCHED"),
    s("approve", "2 approvals", !frozen && reached("APPROVED"), inv.state === "FINANCE_REVIEW", `${approvals}/2`),
    s("paid", "Paid", inv.state === "SETTLED", inv.state === "PAYMENT_QUEUED" || inv.state === "APPROVED"),
  ]
}

export type AgentInfo = {
  agentId: string
  label: string
  orgId: bigint
  scopes: string[]
  spent: bigint
  limit: bigint
  lastAction?: Live["agentActions"][number]
  active: boolean
}

// One card per agent per org, from their signed mandates.
export function agentsOf(live: Live, now = Date.now()): AgentInfo[] {
  const byKey = new Map<string, AgentInfo>()
  for (const m of live.mandates) {
    if (m.revoked) continue
    const k = `${m.agentId}:${m.orgId}`
    const prev = byKey.get(k)
    const scopes = [...new Set([...(prev?.scopes ?? []), ...m.scope.split(",").map(x => x.trim())])]
    byKey.set(k, {
      agentId: m.agentId,
      label: agentLabel(m.agentId),
      orgId: m.orgId,
      scopes,
      spent: (prev?.spent ?? 0n) + m.spent,
      limit: (prev?.limit ?? 0n) + m.sessionLimit,
      active: false,
    })
  }
  for (const a of live.agentActions) {
    const info = byKey.get(`${a.agentId}:${a.orgId}`)
    if (!info) continue
    if (!info.lastAction || a.at.microsSinceUnixEpoch > info.lastAction.at.microsSinceUnixEpoch) info.lastAction = a
  }
  for (const info of byKey.values()) {
    const t = info.lastAction ? Number(info.lastAction.at.microsSinceUnixEpoch / 1000n) : 0
    info.active = now - t < 20_000 && info.lastAction?.status !== "done"
  }
  return [...byKey.values()]
}

export type Activity = {
  id: string
  at: Live["audit"][number]["at"]
  who: string
  what: string
  detail?: string
  subject?: { type: string; id: bigint }
  agent: boolean
  tone: "neutral" | "success" | "warning" | "danger"
}

const tones: Record<string, Activity["tone"]> = {
  invoiceApproved: "success",
  recordPayment: "success",
  freezeInvoice: "danger",
  changeBeneficiary: "danger",
  rejectInvoice: "warning",
  invoiceUnfrozen: "success",
  dealActivated: "success",
}

// Agent steps and audit events, newest first.
export function activityStream(live: Live, limit = 40): Activity[] {
  const items: Activity[] = [
    ...live.agentActions.map(a => ({
      id: `a${a.id}`,
      at: a.at,
      who: agentLabel(a.agentId),
      what: describeAgentStep(a.step, a.status, a.detail).title,
      detail: describeAgentStep(a.step, a.status, a.detail).detail,
      agent: true,
      tone: (a.status === "error" ? "danger" : "neutral") as Activity["tone"],
    })),
    ...live.audit.map(e => ({
      id: `e${e.id}`,
      at: e.at,
      who: actorName(e.actorLabel),
      what: describeAudit(e.action, e.detail).title,
      detail: describeAudit(e.action, e.detail).detail,
      subject: { type: e.subjectType, id: e.subjectId },
      agent: e.actorLabel.includes("agent") || e.actorLabel === "node-api" || e.actorLabel.startsWith("govflow"),
      tone: tones[e.action] ?? "neutral",
    })),
  ]
  return items.sort((a, b) => (b.at.microsSinceUnixEpoch > a.at.microsSinceUnixEpoch ? 1 : -1)).slice(0, limit)
}

export function contractTotals(live: Live, contractId: bigint) {
  const c = live.contracts.find(x => x.id === contractId)
  const bills = live.invoices.filter(i => i.contractId === contractId)
  const billed = bills.filter(i => i.state !== "DRAFT" && i.state !== "REJECTED").reduce((s, i) => s + i.amount, 0n)
  const paid = bills.filter(i => i.state === "SETTLED").reduce((s, i) => s + i.amount, 0n)
  const moving = bills.some(i => i.state === "PAYMENT_QUEUED" || i.state === "APPROVED")
  const frozen = bills.some(i => i.state === "PAYMENT_FROZEN")
  return { contract: c, total: c?.totalValue ?? 0n, billed, paid, moving, frozen, bills }
}

export const isMine = (live: Live, orgId: bigint) => live.me?.orgId === orgId
