/**
 * Turns raw log lines into short, plain-English text: agent steps ("payee_check · PASS; x402 tx 0x…") and audit events ("recordPayment · CONFIRMED 0x…") become a title plus an optional compact detail.
 *
 * Inputs:
 * - An agent action { step, status, detail } or an audit event { action, detail }
 *
 * Outputs:
 * - { title, detail } — title ≤ ~32 chars, detail ≤ ~48 chars, hashes shortened
 */

import { freezeReasonLabel, short } from "@/lib/format"

export type Line = { title: string; detail?: string }

const hash = (s: string) => s.match(/0x[0-9a-fA-F]{16,}/)?.[0]
const clip = (s: string, n = 48) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const verdict = (s: string) => (/\bFAIL/.test(s) ? "failed" : /\bREVIEW/.test(s) ? "needs review" : "passed")

export function describeAgentStep(step: string, status: string, detail: string): Line {
  const tx = hash(detail)
  const bill = detail.match(/bill (\d+)/)?.[1]
  switch (step) {
    case "payee_check":
      return status === "done"
        ? { title: `CRS check ${verdict(detail)}`, detail: tx ? `x402 ${short(tx, 6, 4)}` : undefined }
        : { title: "Paying for a CRS check", detail: `${bill ? `Bill #${bill} · ` : ""}0.01 USDC via x402` }
    case "match":
      return { title: "Matched bill to contract", detail: clip(detail) || undefined }
    case "summarize":
      return { title: "Summarized evidence", detail: clip(detail) || undefined }
    case "draft_invoice":
      return { title: "Drafted a bill", detail: clip(detail) || undefined }
    case "risk_review":
      return { title: "Wrote a fraud case file", detail: clip(detail) || undefined }
    default: {
      const t = step.replace(/[_-]+/g, " ")
      return { title: t.charAt(0).toUpperCase() + t.slice(1), detail: detail ? clip(tx ? detail.replace(tx, short(tx, 6, 4)) : detail) : undefined }
    }
  }
}

const paymentState: Record<string, string> = {
  CREATED: "Payout queued",
  POLICY_CHECKED: "Payout policy checked",
  AUTHORIZED: "Payout authorized",
  SUBMITTED: "Payout sent onchain",
  CONFIRMED: "Payout confirmed",
  FAILED: "Payout failed",
}

export function describeAudit(action: string, detail: string): Line {
  const tx = hash(detail)
  const first = detail.split(/[\s;]/)[0] ?? ""
  switch (action) {
    case "recordPayment":
      return { title: paymentState[first] ?? "Payout updated", detail: tx ? short(tx, 6, 4) : undefined }
    case "approveInvoice": {
      const [n, of] = detail.split("/")
      return { title: n && of ? `Approved (${n} of ${of})` : "Approved" }
    }
    case "invoiceApproved":
      return { title: "Bill approved" }
    case "rejectInvoice":
      return { title: "Bill rejected", detail: clip(detail) || undefined }
    case "reopenInvoice":
      return { title: "Bill reopened" }
    case "draftInvoice":
      return { title: "Bill drafted", detail: detail ? clip(detail) : undefined }
    case "submitInvoice":
      return { title: "Bill submitted" }
    case "recordMatch": {
      const r = detail.split(": ")[1]?.toLowerCase()
      return { title: r ? `Agent check: ${r}` : "Agent check" }
    }
    case "confirmUnsureMatch":
      return { title: "Match confirmed by a person", detail: clip(detail) || undefined }
    case "recordVerification": {
      const member = detail.startsWith("MEMBER")
      const v = verdict(detail)
      return { title: member ? `Identity ${v === "passed" ? "verified" : v}` : `CRS check ${v}` }
    }
    case "recordX402Receipt":
      return { title: "Paid for CRS check", detail: "0.01 USDC via x402" }
    case "changeBeneficiary":
      return { title: "Wallet change requested", detail: detail.startsWith("EMAIL") ? "via email" : detail.startsWith("IN_APP") ? "in app" : undefined }
    case "freezeInvoice":
      return { title: "Bill frozen", detail: freezeReasonLabel[first] ?? (clip(detail) || undefined) }
    case "voteUnfreeze":
      return { title: "Unfreeze vote", detail: detail.split(" ")[1] ? `${detail.split(" ")[1]} votes` : undefined }
    case "invoiceUnfrozen":
      return { title: "Bill unfrozen" }
    case "recordWalletProof":
      return { title: "New wallet proven by owner" }
    case "recordWalletBinding":
      return { title: "Payout wallet bound", detail: tx ? short(tx, 6, 4) : detail ? short(detail, 6, 4) : undefined }
    case "submitEvidence":
      return { title: "Evidence submitted" }
    case "inspectMilestone":
      return { title: first === "ACCEPTED" ? "Work accepted" : "Work rejected", detail: clip(detail.slice(first.length).trim()) || undefined }
    case "createDeal":
      return { title: "Contract created", detail: detail.match(/"([^"]+)"/)?.[1] }
    case "signDeal":
      return { title: "Contract signed" }
    case "dealActivated":
      return { title: "Contract active" }
    case "signMandate":
      return { title: "Agent mandate signed", detail: detail.split(":")[0] || undefined }
    case "revokeMandate":
      return { title: "Agent mandate revoked" }
    case "recordFinding":
      return { title: "Agent finding recorded" }
    case "createOrganization":
      return { title: "Organization added", detail: clip(detail.split(" ").slice(1).join(" ")) || undefined }
    case "createInvite":
      return { title: "Invite created" }
    case "redeemInvite":
      return { title: "Joined organization" }
    case "requestServiceRole":
      return { title: "Service access requested" }
    case "approveServiceRole":
    case "approveObserverRole":
      return { title: "Service access granted" }
    default: {
      const t = action.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()
      return { title: t.charAt(0).toUpperCase() + t.slice(1), detail: detail ? clip(tx ? detail.replace(tx, short(tx, 6, 4)) : detail) : undefined }
    }
  }
}
