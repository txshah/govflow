/**
 * Display helpers: USDC amounts, timestamps, short hashes/addresses, and plain-language labels for every state the database uses.
 *
 * Inputs:
 * - Raw row values (bigint micro-USDC, SpacetimeDB Timestamps, state strings)
 *
 * Outputs:
 * - Strings and tone names the components render
 */

import type { Timestamp } from "spacetimedb"

export const usdc = (micro: bigint | number) => Number(micro) / 1_000_000

export function fmtUsdc(micro: bigint | number, opts: { sign?: boolean } = {}) {
  const v = usdc(micro)
  const s = v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${opts.sign && v > 0 ? "+" : ""}${s} USDC`
}

export const toDate = (ts: Timestamp) => new Date(Number(ts.microsSinceUnixEpoch / 1000n))

export function timeAgo(ts: Timestamp | undefined, now = Date.now()) {
  if (!ts) return "—"
  const s = Math.max(0, Math.round((now - toDate(ts).getTime()) / 1000))
  if (s < 5) return "just now"
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return toDate(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export const fmtTime = (ts: Timestamp | undefined) =>
  ts ? toDate(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" }) : "—"

export const short = (s: string, head = 6, tail = 4) =>
  !s ? "—" : s.length <= head + tail + 1 ? s : `${s.slice(0, head)}…${s.slice(-tail)}`

const SMALL = new Set(["of", "and", "the", "for", "a", "an", "to", "in", "on", "at", "by"])

// "CITY OF OAKRIDGE PUBLIC WORKS" → "City of Oakridge Public Works"; keeps LLC / Inc. tidy.
export const titleCase = (s: string) =>
  s
    .toLowerCase()
    .split(/(\s+)/)
    .map((w, i) => (i > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join("")
    .replace(/\bLlc\b/g, "LLC")
    .replace(/\bInc\.?(?=\s|$)/g, "Inc.")
    .replace(/\bCo\.?(?=\s|$)/g, "Co.")

export type Tone = "neutral" | "info" | "success" | "warning" | "danger"

export const invoiceStateLabel: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  SUBMITTED: { label: "Agent checking", tone: "info" },
  MATCHED: { label: "CRS check", tone: "info" },
  FINANCE_REVIEW: { label: "Awaiting approval", tone: "warning" },
  APPROVED: { label: "Approved", tone: "success" },
  REJECTED: { label: "Rejected", tone: "danger" },
  PAYMENT_QUEUED: { label: "Paying", tone: "info" },
  SETTLED: { label: "Paid", tone: "success" },
  FAILED: { label: "Payment failed", tone: "danger" },
  PAYMENT_FROZEN: { label: "Frozen", tone: "danger" },
}

export const milestoneStateLabel: Record<string, { label: string; tone: Tone }> = {
  NOT_STARTED: { label: "Not started", tone: "neutral" },
  IN_PROGRESS: { label: "In progress", tone: "neutral" },
  SUBMITTED_FOR_INSPECTION: { label: "Awaiting inspection", tone: "warning" },
  ACCEPTED: { label: "Accepted", tone: "success" },
  REJECTED: { label: "Rejected", tone: "danger" },
}

export const freezeReasonLabel: Record<string, string> = {
  BENEFICIARY_CHANGED: "Wallet change requested",
  MISMATCH: "Agent found a mismatch",
  OVERBILLED: "Billed more than accepted work",
  WALLET_MISMATCH: "Wallet doesn't match the verified one",
  VERIFICATION_FAILED: "CRS check failed",
  VERIFICATION_REVIEW: "CRS check needs review",
}

export const kindLabel: Record<string, string> = {
  AGENCY: "Agency",
  PRIME: "Prime contractor",
  SUB: "Subcontractor",
  PAY_APPLICATION: "Pay application",
  SUB_INVOICE: "Sub invoice",
  PRIME_CONTRACT: "Prime contract",
  SUBCONTRACT: "Subcontract",
}

export const roleLabel: Record<string, string> = {
  REVIEWER: "Reviews work",
  APPROVER: "Finance approver",
  PREPARER: "Prepares bills",
}

// Turns "approveInvoice" or "payee_check" into "Approve invoice" / "Payee check".
export const humanize = (action: string) =>
  action
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/^./, c => c.toUpperCase())

// Labels for the non-person identities that write to the database.
const systemActors: Record<string, string> = {
  owner: "Setup",
  "govflow-api": "GovFlow service",
  "node-api": "GovFlow service",
  "flow-screen": "Observer",
}
export const actorName = (label: string) => systemActors[label] ?? titleCase(label)

export const agentLabel = (agentId: string) =>
  ({ "agency-agent": "Agency agent", "prime-agent": "Prime agent", "sub-agent": "Sub agent" })[agentId] ?? agentId

// Each organization's soft signature color, used sparingly (pods, room glow, avatars).
export const orgHue: Record<string, { text: string; bg: string; soft: string; ring: string; varName: string }> = {
  AGENCY: { text: "text-sky", bg: "bg-sky", soft: "bg-sky/25", ring: "ring-sky/50", varName: "var(--sky)" },
  PRIME: { text: "text-leaf", bg: "bg-leaf", soft: "bg-leaf/25", ring: "ring-leaf/50", varName: "var(--leaf)" },
  SUB: { text: "text-bloom", bg: "bg-bloom", soft: "bg-bloom/25", ring: "ring-bloom/50", varName: "var(--bloom)" },
}

// Shortens any long hex hash inside free text (agent details, audit notes) so it never overflows a card.
export const tidy = (text: string) => text.replace(/0x[0-9a-fA-F]{16,}/g, h => short(h, 6, 4))

// CRS product codes from the API → names a person understands.
const CRS_PRODUCT: Record<string, string> = {
  tu_identity_verification: "Identity",
  tu_credit_report: "Business credit",
  pitchpoint_blj: "Liens & judgments",
  ofac_sdn: "Sanctions",
  state_filing: "Business registry",
  fraud_finder: "Fraud signals",
  agency_registry: "Public agency registry",
  IDV: "Identity",
  OFAC: "Sanctions",
  BUSINESS: "Business credit",
}
// A ":mock" suffix means the check was simulated for the demo; say so.
export const crsProducts = (products: string) =>
  [
    ...new Set(
      products.split(",").map(p => {
        const [code, tag] = p.trim().split(":")
        const name = CRS_PRODUCT[code] ?? code
        return tag === "mock" ? `${name} (mock)` : name
      })
    ),
  ].join(" · ")

const REASON_TEXT: Record<string, string> = {
  SSN_NAME_MISMATCH: "SSN doesn't match the name",
  DOB_MISMATCH: "Birth date mismatch",
  ADDRESS_MISMATCH: "Address mismatch",
  CREDIT_HISTORY_NEWER_THAN_BUSINESS: "Credit history newer than the business",
  INQUIRY_BURST: "Burst of recent credit inquiries",
  THIN_FILE: "Thin credit file",
  NO_CREDIT_FILE: "No credit file",
  OFFICER_MISMATCH: "Officer on file doesn't match",
  NEW_ENTITY: "Newly formed entity",
  RECENT_FILING_CHANGE: "Recent change to state filings",
  PHONE_OWNER_MISMATCH: "Phone doesn't belong to the owner",
  IP_FAR_FROM_ADDRESS: "Request came from far from the business address",
  EMAIL_INVALID: "Email address is invalid",
}

// CRS reason codes → plain words, e.g. "FRAUD_SCORE_HIGH:85" → "High fraud risk score (85)".
export function crsReason(r: string) {
  const [k, ...rest] = r.trim().split(":")
  if (k.startsWith("OFAC")) return `Sanctions list match${rest.length > 1 ? ` (${rest.slice(1).join(" ")})` : ""}`
  if (k === "FRAUD_SCORE_HIGH") return `High fraud risk score${rest[0] ? ` (${rest[0]})` : ""}`
  if (k === "FRAUD_SCORE_MEDIUM") return `Elevated fraud risk score${rest[0] ? ` (${rest[0]})` : ""}`
  if (k === "LIENS") return `${rest[0] ?? "Some"} lien(s) on file`
  if (k === "JUDGMENTS") return `${rest[0] ?? "Some"} judgment(s) on file`
  return REASON_TEXT[k] ?? k.toLowerCase().replaceAll("_", " ")
}

// Agent mandate scopes in plain words.
export const scopeLabel: Record<string, string> = {
  summarize: "Summarize evidence",
  draft_invoice: "Draft bills",
  match: "Match bills to contract",
  verify: "Pay for CRS checks",
  risk_review: "Write fraud case files",
}
export const scopeList = (scope: string) =>
  scope
    .split(",")
    .map(s => scopeLabel[s.trim()] ?? s.trim())
    .join(" · ")

// Document numbers, the way a pay system would print them: PA-0004 (pay application), SI-0001 (sub invoice), C-0003 (contract).
export const docNo = (inv: { kind: string; id: bigint }) => `${inv.kind === "PAY_APPLICATION" ? "PA" : "SI"}-${String(inv.id).padStart(4, "0")}`
export const contractNo = (c: { id: bigint }) => `C-${String(c.id).padStart(4, "0")}`
