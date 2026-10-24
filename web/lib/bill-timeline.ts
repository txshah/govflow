/**
 * When each stage of a bill happened, read from the audit log and related rows, plus how long it took to get paid.
 *
 * Inputs:
 * - The invoice and live rows (audit events, milestones, verifications)
 *
 * Outputs:
 * - billTimes(): a timestamp per stage (or undefined) and the submitted → paid duration in ms
 * - fmtDuration(): "2m 14s", "3h 5m", "4 days"
 */

import type { Timestamp } from "spacetimedb"
import type { Live } from "@/components/app/providers"
import { toDate } from "@/lib/format"

type Inv = Live["invoices"][number]
export type StageKey = "work" | "submitted" | "matched" | "crs" | "approved" | "paid"
export const STAGE_LABEL: Record<StageKey, string> = {
  work: "Work accepted",
  submitted: "Submitted",
  matched: "Agent check",
  crs: "CRS verified",
  approved: "2 approvals",
  paid: "Paid",
}

export function billTimes(live: Live, inv: Inv) {
  const events = live.audit.filter(e => e.subjectType === "invoice" && e.subjectId === inv.id)
  const first = (pred: (e: (typeof events)[number]) => boolean) =>
    events.filter(pred).sort((a, b) => (a.at.microsSinceUnixEpoch < b.at.microsSinceUnixEpoch ? -1 : 1))[0]?.at
  const last = (pred: (e: (typeof events)[number]) => boolean) =>
    events.filter(pred).sort((a, b) => (a.at.microsSinceUnixEpoch > b.at.microsSinceUnixEpoch ? -1 : 1))[0]?.at
  const lines = live.milestones.filter(m => inv.milestoneIds.includes(m.id))
  const crs = live.verifications
    .filter(v => v.invoiceId === inv.id)
    .sort((a, b) => (a.checkedAt.microsSinceUnixEpoch > b.checkedAt.microsSinceUnixEpoch ? -1 : 1))[0]?.checkedAt
  const times: Record<StageKey, Timestamp | undefined> = {
    work: lines.map(m => m.reviewedAt).find(Boolean),
    submitted: first(e => e.action === "submitInvoice"),
    matched: first(e => e.action === "recordMatch"),
    crs,
    approved: last(e => e.action === "invoiceApproved"),
    paid: first(e => e.action === "recordPayment" && e.detail.startsWith("CONFIRMED")),
  }
  const toPaidMs = times.submitted && times.paid ? toDate(times.paid).getTime() - toDate(times.submitted).getTime() : undefined
  return { times, toPaidMs }
}

export function fmtDuration(ms: number) {
  const s = Math.max(1, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h}h ${m % 60}m`
  return `${Math.round(h / 24)} days`
}
