/**
 * Builds the security graph for one bill: every check that must come back clean before USDC moves, in the order it happens, with how each node is connected.
 *
 * Inputs:
 * - The invoice and live rows (milestones, x402 receipts, agent actions, CRS verifications, payee org, beneficiary changes, approvals, members, payments)
 *
 * Outputs:
 * - { nodes, edges, columns }: nodes carry stage column, status (pass | review | fail | active | pending), a label, a one-line detail, and when it resolved
 */

import type { Live } from "@/components/app/providers"
import { approvalsFor } from "@/lib/domain"
import { fmtUsdc, short, titleCase } from "@/lib/format"
import type { Timestamp } from "spacetimedb"

export type NodeStatus = "pass" | "review" | "fail" | "active" | "pending"
export type GraphNode = {
  id: string
  col: number
  label: string
  detail: string
  status: NodeStatus
  kind: "work" | "agent" | "x402" | "crs" | "wallet" | "person" | "payout"
  at?: Timestamp
}
export type GraphEdge = { from: string; to: string }

export const COLUMNS = ["Work", "Agent", "Paid check", "CRS security", "Wallet", "People", "Payout"]

// CRS products as they come back from the API, and which reasons belong to which check.
const CRS_CHECKS: { id: string; product: string; label: string; source: string; reasons: RegExp }[] = [
  { id: "crs-identity", product: "tu_identity_verification", label: "Identity", source: "TransUnion IDV", reasons: /SSN|DOB|ADDRESS|NAME|OFFICER/ },
  { id: "crs-credit", product: "tu_credit_report", label: "Business credit", source: "TransUnion credit", reasons: /CREDIT|THIN_FILE|INQUIRY/ },
  { id: "crs-records", product: "pitchpoint_blj", label: "Liens & judgments", source: "PitchPoint public records", reasons: /LIEN|JUDGMENT|BANKRUPT/ },
  { id: "crs-sanctions", product: "ofac_sdn", label: "Sanctions", source: "OFAC SDN list", reasons: /OFAC|SDN|SANCTION/ },
  { id: "crs-filings", product: "state_filing", label: "State filings", source: "Secretary of State", reasons: /NEW_ENTITY|FILING/ },
]

type Inv = Live["invoices"][number]

export function verificationGraph(live: Live, inv: Inv) {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const frozen = inv.state === "PAYMENT_FROZEN"
  const nameOf = (hex: string) => titleCase(live.members.find(m => m.identity.toHexString() === hex)?.displayName ?? "Approver")

  // 1 · Work accepted by the paying side's reviewer.
  const lines = live.milestones.filter(m => inv.milestoneIds.includes(m.id))
  const accepted = lines.length > 0 && lines.every(m => m.state === "ACCEPTED")
  const reviewer = lines.find(m => m.reviewedBy)?.reviewedBy
  nodes.push({
    id: "work",
    col: 0,
    kind: "work",
    label: "Work accepted",
    detail: accepted ? `${lines.length} line${lines.length === 1 ? "" : "s"} · ${reviewer ? nameOf(reviewer.toHexString()) : "reviewer"}` : "Waiting for inspection",
    status: accepted ? "pass" : "active",
    at: lines.find(m => m.reviewedAt)?.reviewedAt,
  })

  // 2 · The payer's agent matches the bill to the contract.
  const match = inv.matchResult
  nodes.push({
    id: "match",
    col: 1,
    kind: "agent",
    label: "Agent match",
    detail: match ? `${match.toLowerCase()} · ${inv.matchReasons.split("\n")[0].slice(0, 48)}` : inv.state === "SUBMITTED" ? "Checking against the contract" : "Not started",
    status: match === "MATCHED" ? "pass" : match === "MISMATCH" ? "fail" : match === "UNSURE" ? "review" : inv.state === "SUBMITTED" ? "active" : "pending",
    at: live.findings.find(f => f.kind === "MATCH" && f.subjectId === inv.id)?.at,
  })
  edges.push({ from: "work", to: "match" })

  // 3 · The agent pays 0.01 USDC over x402 for the CRS check.
  const receipt = live.receipts.find(r => r.paymentRef.startsWith(`verify-${inv.id}-`))
  // The agent's "done" step nearest in time to this bill's receipt carries the x402 tx hash.
  const payStep = receipt
    ? live.agentActions
        .filter(a => a.agentId === receipt.agentId && a.step === "payee_check" && a.status === "done")
        .sort((a, b) => {
          const d = (x: bigint) => (x > receipt.at.microsSinceUnixEpoch ? x - receipt.at.microsSinceUnixEpoch : receipt.at.microsSinceUnixEpoch - x)
          return d(a.at.microsSinceUnixEpoch) < d(b.at.microsSinceUnixEpoch) ? -1 : 1
        })[0]
    : undefined
  const x402tx = payStep?.detail.match(/0x[0-9a-f]{64}/i)?.[0]
  nodes.push({
    id: "x402",
    col: 2,
    kind: "x402",
    label: "x402 payment",
    detail: receipt ? `${fmtUsdc(receipt.amount)} by ${receipt.agentId}${x402tx ? ` · ${short(x402tx, 6, 4)}` : ""}` : match === "MATCHED" ? "Agent paying for the check" : "Not started",
    status: receipt ? "pass" : match === "MATCHED" ? "active" : "pending",
    at: receipt?.at,
  })
  edges.push({ from: "match", to: "x402" })

  // 4 · CRS security checks on the payee, one node per product.
  const checks = [...live.verifications]
    .filter(v => v.orgId === inv.payeeOrgId && v.subjectType === "ORG")
    .sort((a, b) => (a.checkedAt.microsSinceUnixEpoch > b.checkedAt.microsSinceUnixEpoch ? -1 : 1)) as (Live["verifications"][number] & { decision?: string })[]
  const v = checks.find(c => c.invoiceId === inv.id) ?? (inv.state === "SUBMITTED" || inv.state === "DRAFT" ? undefined : checks[0])
  const reasons = v?.reasons ? v.reasons.split(",").filter(Boolean) : []
  for (const c of CRS_CHECKS) {
    const ran = !!v && v.products.includes(c.product)
    const flagged = reasons.filter(r => c.reasons.test(r))
    const decision = v?.decision ?? (v?.passed ? "PASS" : "FAIL")
    nodes.push({
      id: c.id,
      col: 3,
      kind: "crs",
      label: c.label,
      detail: !v ? (receipt ? "Querying CRS sandbox" : c.source) : !ran ? "Not part of this check" : flagged.length ? flagged.join(", ").toLowerCase().replaceAll("_", " ") : `clean · ${c.source}`,
      status: !v ? (receipt ? "active" : "pending") : !ran ? "pending" : flagged.length ? (decision === "FAIL" ? "fail" : "review") : "pass",
      at: v?.checkedAt,
    })
    edges.push({ from: "x402", to: c.id })
  }

  // 5 · The payout wallet is the one bound to the verified owner, with no unresolved change.
  const payee = live.organizations.find(o => o.id === inv.payeeOrgId)
  const pending = live.changes.find(c => c.invoiceId === inv.id && c.state === "PENDING")
  const walletOk = !!payee?.payoutWallet && inv.beneficiaryWallet === payee.payoutWallet && !pending
  nodes.push({
    id: "wallet",
    col: 4,
    kind: "wallet",
    label: "Wallet ownership",
    detail: pending ? `change requested → ${short(pending.requestedWallet)}` : walletOk ? `${short(inv.beneficiaryWallet)} · owner verified` : "Not bound",
    status: pending ? "fail" : walletOk && v ? "pass" : v ? "active" : "pending",
    at: payee?.walletBoundAt,
  })
  for (const c of CRS_CHECKS) edges.push({ from: c.id, to: "wallet" })

  // 6 · Two different verified people approve.
  const votes = approvalsFor(live, inv).filter(a => a.vote === "APPROVE")
  for (let i = 0; i < 2; i++) {
    const vote = votes[i]
    const member = vote ? live.members.find(m => m.identity.isEqual(vote.approver)) : undefined
    const id = `approver-${i + 1}`
    nodes.push({
      id,
      col: 5,
      kind: "person",
      label: vote ? nameOf(vote.approver.toHexString()) : `Approver ${i + 1}`,
      detail: vote ? `approved · CRS ${member?.verified ? "✓" : "?"} ${member?.identityHash ? short(member.identityHash, 6, 4) : ""}` : inv.state === "FINANCE_REVIEW" ? "Waiting for a verified approver" : "Not yet",
      status: vote ? "pass" : frozen ? "pending" : inv.state === "FINANCE_REVIEW" ? "active" : "pending",
      at: vote?.at,
    })
    edges.push({ from: "wallet", to: id })
  }

  // 7 · USDC moves from the payer's treasury.
  const payment = live.payments.find(p => p.invoiceId === inv.id && p.state !== "FAILED")
  nodes.push({
    id: "payout",
    col: 6,
    kind: "payout",
    label: "USDC payout",
    detail: payment
      ? `${fmtUsdc(payment.amount)} · ${payment.state.toLowerCase()}${payment.txHash ? ` · ${short(payment.txHash, 6, 4)}` : ""}`
      : frozen
        ? "Held while frozen"
        : "After two approvals",
    status: payment?.state === "CONFIRMED" ? "pass" : payment ? "active" : frozen ? "fail" : "pending",
    at: payment?.updatedAt,
  })
  edges.push({ from: "approver-1", to: "payout" }, { from: "approver-2", to: "payout" })

  return { nodes, edges, payment, frozen }
}
