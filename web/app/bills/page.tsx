"use client"

/**
 * Bills: every bill at both levels as a timeline row — when the work was accepted, submitted, checked by the agent, verified by CRS, approved and paid — with how long payment took, set against the ~50-day industry wait. Filter by in progress / frozen / paid; open a bill or watch its verification.
 *
 * Inputs:
 * - Live invoices, audit events, milestones, verifications for the signed-in persona
 *
 * Outputs:
 * - Speed comparison, filters, and grouped timeline rows
 */

import Link from "next/link"
import { useState } from "react"
import { motion } from "motion/react"
import { ArrowUpRight, Check, Clock, ShieldCheck, Snowflake, Zap } from "lucide-react"
import { useLive, type Live } from "@/components/app/providers"
import { Empty, PageHeader } from "@/components/app/page-header"
import { StatusBadge } from "@/components/StatusBadge"
import { billStages, orgName } from "@/lib/domain"
import { billTimes, fmtDuration, STAGE_LABEL, type StageKey } from "@/lib/bill-timeline"
import { fmtUsdc, freezeReasonLabel, kindLabel, titleCase, toDate, docNo } from "@/lib/format"
import { cn } from "@/lib/utils"

const INDUSTRY_DAYS = 50
const FILTERS = [
  { id: "all", label: "All" },
  { id: "progress", label: "In progress" },
  { id: "frozen", label: "Frozen" },
  { id: "paid", label: "Paid" },
] as const
type Filter = (typeof FILTERS)[number]["id"]

const matches = (f: Filter, state: string) =>
  f === "all" ||
  (f === "paid" && state === "SETTLED") ||
  (f === "frozen" && state === "PAYMENT_FROZEN") ||
  (f === "progress" && !["SETTLED", "PAYMENT_FROZEN", "REJECTED", "FAILED"].includes(state))

const STAGE_KEYS: StageKey[] = ["work", "submitted", "matched", "crs", "approved", "paid"]
const STAGE_FROM_DOMAIN: Record<string, StageKey> = { work: "work", bill: "submitted", check: "matched", crs: "crs", approve: "approved", paid: "paid" }

function Row({ inv, live }: { inv: Live["invoices"][number]; live: Live }) {
  const { times, toPaidMs } = billTimes(live, inv)
  const stages = billStages(live, inv)
  const status = Object.fromEntries(stages.map(s => [STAGE_FROM_DOMAIN[s.key], s.status]))
  const frozen = inv.state === "PAYMENT_FROZEN"
  return (
    <motion.li layout className="glass grid items-center gap-x-6 gap-y-3 rounded-xl px-5 py-4 lg:grid-cols-[13rem_minmax(0,1fr)_11rem]">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            {kindLabel[inv.kind]} {docNo(inv)}
          </span>
        </div>
        <p className="text-2xl font-semibold tabular-nums tracking-tight">{fmtUsdc(inv.amount)}</p>
        <p className="truncate text-xs text-muted-foreground">
          {titleCase(orgName(live, inv.payerOrgId))} → {titleCase(orgName(live, inv.payeeOrgId))}
        </p>
      </div>

      {/* stage timeline with times */}
      <ol className="relative grid grid-cols-6">
        <span aria-hidden className="absolute top-3 right-[8%] left-[8%] h-0.5 rounded-full bg-border" />
        {STAGE_KEYS.map(k => {
          const st = status[k] ?? "pending"
          const t = times[k]
          return (
            <li key={k} className="relative flex flex-col items-center gap-1 text-center">
              <span
                className={cn(
                  "z-10 grid size-6 place-items-center rounded-full",
                  st === "done" && "bg-leaf text-background",
                  st === "current" && "bg-sun",
                  st === "blocked" && "bg-destructive text-background",
                  st === "pending" && "border border-border bg-background"
                )}
              >
                {st === "done" ? <Check className="size-3.5" strokeWidth={3} /> : st === "blocked" ? <Snowflake className="size-3.5" /> : null}
              </span>
              <span className={cn("text-[11px] font-medium", st === "pending" && "text-muted-foreground")}>{STAGE_LABEL[k]}</span>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {t ? toDate(t).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" }) : "—"}
              </span>
            </li>
          )
        })}
      </ol>

      <div className="flex items-center justify-between gap-3 lg:flex-col lg:items-end">
        {inv.state === "SETTLED" && toPaidMs !== undefined ? (
          <p className="flex items-center gap-1.5 text-sm font-medium text-success">
            <Zap className="size-4" /> Paid in {fmtDuration(toPaidMs)}
          </p>
        ) : frozen ? (
          <p className="flex items-center gap-1.5 text-xs text-destructive">
            <Snowflake className="size-3.5" />
            {freezeReasonLabel[inv.freezeReason] ?? "Frozen"}
          </p>
        ) : (
          <StatusBadge state={inv.state} />
        )}
        <div className="flex gap-1.5">
          <Link href={`/verify/${inv.id}`} className="inline-flex h-8 items-center gap-1 rounded-lg bg-primary/10 px-3 text-xs font-medium text-primary hover:bg-primary hover:text-primary-foreground">
            <ShieldCheck className="size-3.5" /> Verify
          </Link>
          <Link href={frozen ? `/cases/${inv.id}` : `/envelope/${inv.id}`} className="inline-flex h-8 items-center gap-1 rounded-lg bg-muted px-3 text-xs font-medium hover:bg-muted/70">
            Open <ArrowUpRight className="size-3.5" />
          </Link>
        </div>
      </div>
    </motion.li>
  )
}

export default function BillsPage() {
  const live = useLive()
  const [filter, setFilter] = useState<Filter>("all")
  const paidTimes = live.invoices.map(i => billTimes(live, i).toPaidMs).filter((x): x is number => x !== undefined).sort((a, b) => a - b)
  const median = paidTimes.length ? paidTimes[Math.floor(paidTimes.length / 2)] : undefined
  const levels = [
    { id: "PAY_APPLICATION", title: "Agency → Prime", hint: "Monthly pay applications" },
    { id: "SUB_INVOICE", title: "Prime → Subcontractor", hint: "Subcontractor invoices" },
  ]
  const count = (f: Filter) => live.invoices.filter(i => matches(f, i.state)).length
  const industryMs = INDUSTRY_DAYS * 86_400_000
  const ourShare = median ? Math.max(1.2, (median / industryMs) * 100) : 0

  return (
    <>
      <PageHeader eyebrow="Bills" title="Bills" description="Every bill, both levels, with the time each step happened." />

      {/* Speed: GovFlow vs the industry */}
      <section className="glass mb-6 grid gap-5 rounded-xl px-6 py-5 md:grid-cols-[14rem_minmax(0,1fr)]">
        <div>
          <p className="text-xs text-muted-foreground">Median time, submitted → paid</p>
          <p className="text-4xl font-semibold tracking-tight text-success">{median ? fmtDuration(median) : "—"}</p>
          <p className="text-xs text-muted-foreground">{paidTimes.length} paid bill{paidTimes.length === 1 ? "" : "s"}</p>
        </div>
        <div className="flex flex-col justify-center gap-3">
          <div>
            <div className="mb-1 flex justify-between text-xs">
              <span className="font-medium">GovFlow</span>
              <span className="tabular-nums text-muted-foreground">{median ? fmtDuration(median) : "—"}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-muted">
              <motion.div className="h-full rounded-full bg-gradient-to-r from-leaf to-primary" initial={{ width: 0 }} animate={{ width: `${ourShare}%` }} transition={{ type: "spring", stiffness: 60, damping: 18 }} />
            </div>
          </div>
          <div>
            <div className="mb-1 flex justify-between text-xs">
              <span className="flex items-center gap-1 font-medium">
                <Clock className="size-3" /> Typical subcontractor wait
              </span>
              <span className="tabular-nums text-muted-foreground">~{INDUSTRY_DAYS} days</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-muted">
              <motion.div className="h-full rounded-full bg-clay/70" initial={{ width: 0 }} animate={{ width: "100%" }} transition={{ duration: 1.2, ease: "easeOut" }} />
            </div>
          </div>
        </div>
      </section>

      <div className="mb-5 flex flex-wrap gap-1 rounded-full bg-muted/60 p-1 sm:w-fit">
        {FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn("rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors", filter === f.id ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >
            {f.label} <span className="ml-1 text-xs tabular-nums text-muted-foreground">{count(f.id)}</span>
          </button>
        ))}
      </div>

      {live.invoices.length ? (
        <div className="space-y-8">
          {levels.map(level => {
            const bills = live.invoices.filter(i => i.kind === level.id && matches(filter, i.state)).sort((a, b) => (a.id > b.id ? -1 : 1))
            if (!bills.length) return null
            return (
              <section key={level.id}>
                <div className="mb-3 flex items-baseline gap-3 px-1">
                  <h2 className="text-xl font-semibold">{level.title}</h2>
                  <span className="text-xs text-muted-foreground">{level.hint}</span>
                </div>
                <ul className="space-y-3">
                  {bills.map(inv => (
                    <Row key={String(inv.id)} inv={inv} live={live} />
                  ))}
                </ul>
              </section>
            )
          })}
          {!live.invoices.some(i => matches(filter, i.state)) ? <Empty>No bills match this filter.</Empty> : null}
        </div>
      ) : (
        <Empty>No bills visible to you yet.</Empty>
      )}
    </>
  )
}
