"use client"

/**
 * Bills board: every bill as a card that glides between stage columns live (checking → verifying → approving → paying → paid). Frozen bills move to a row at the top until the payee re-verifies.
 *
 * Inputs:
 * - Live invoices and approvals for the signed-in persona
 *
 * Outputs:
 * - A stage board; cards open the shared payment envelope
 */

import Link from "next/link"
import { useRouter } from "next/navigation"
import { LayoutGroup, motion } from "motion/react"
import { ShieldCheck, Snowflake } from "lucide-react"
import { useLive, type Live } from "@/components/app/providers"
import { Empty, PageHeader } from "@/components/app/page-header"
import { BillStepper } from "@/components/BillStepper"
import { approvalsFor, orgName } from "@/lib/domain"
import { fmtUsdc, freezeReasonLabel, kindLabel, timeAgo, titleCase } from "@/lib/format"
import { cn } from "@/lib/utils"

const COLUMNS = [
  { key: "check", title: "Agent checking", states: ["DRAFT", "SUBMITTED"], dot: "bg-sky" },
  { key: "verify", title: "CRS verifying", states: ["MATCHED"], dot: "bg-lilac" },
  { key: "approve", title: "Approving", states: ["FINANCE_REVIEW", "APPROVED"], dot: "bg-sun" },
  { key: "pay", title: "Paying", states: ["PAYMENT_QUEUED"], dot: "bg-clay" },
  { key: "paid", title: "Paid", states: ["SETTLED"], dot: "bg-leaf" },
]

function BillCard({ inv, live }: { inv: Live["invoices"][number]; live: Live }) {
  const router = useRouter()
  const votes = approvalsFor(live, inv).filter(a => a.vote === "APPROVE").length
  const frozen = inv.state === "PAYMENT_FROZEN"
  return (
    <motion.div layout layoutId={`bill-${inv.id}`} transition={{ type: "spring", stiffness: 260, damping: 28 }}>
      <Link
        href={`/envelope/${inv.id}`}
        className={cn(
          "glass block rounded-3xl p-4 transition-transform hover:-translate-y-0.5",
          frozen && "border-destructive/50 bg-destructive/5"
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            {kindLabel[inv.kind]} #{String(inv.id)}
          </span>
          <span className="flex items-center gap-2 text-[10px] text-muted-foreground">
            {timeAgo(inv.submittedAt ?? inv.createdAt)}
            <span
              role="link"
              tabIndex={0}
              title="Watch verification"
              onClick={e => {
                e.preventDefault()
                router.push(`/verify/${inv.id}`)
              }}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  router.push(`/verify/${inv.id}`)
                }
              }}
              className="grid size-6 place-items-center rounded-full bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground"
            >
              <ShieldCheck className="size-3.5" />
            </span>
          </span>
        </div>
        <p className="mt-1 font-display text-2xl font-semibold tabular-nums tracking-tight">{fmtUsdc(inv.amount)}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {titleCase(orgName(live, inv.payerOrgId))} → {titleCase(orgName(live, inv.payeeOrgId))}
        </p>
        <div className="mt-3">
          <BillStepper invoice={inv} />
        </div>
        {frozen ? (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-destructive">
            <Snowflake className="size-3.5" />
            {freezeReasonLabel[inv.freezeReason] ?? inv.freezeReason}
          </p>
        ) : inv.state === "FINANCE_REVIEW" ? (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            {[0, 1].map(i => (
              <span key={i} className={cn("size-2 rounded-full", i < votes ? "bg-leaf" : "bg-border")} />
            ))}
            {votes}/2 approvals
          </p>
        ) : null}
      </Link>
    </motion.div>
  )
}

export default function BillsPage() {
  const live = useLive()
  const frozen = live.invoices.filter(i => i.state === "PAYMENT_FROZEN")
  const returned = live.invoices.filter(i => i.state === "REJECTED" || i.state === "FAILED")
  return (
    <>
      <PageHeader eyebrow="Bills" title="Bills board" description="Every bill takes the same path at both levels. Watch them move as agents check, CRS verifies and two people approve." />
      <LayoutGroup>
        {frozen.length ? (
          <section className="mb-6 rounded-[2rem] border border-destructive/30 bg-destructive/[0.06] p-4">
            <p className="mb-3 flex items-center gap-2 px-1 text-sm font-semibold text-destructive">
              <Snowflake className="size-4" /> Frozen · {frozen.length} waiting for re-verification
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {frozen.map(inv => (
                <BillCard key={String(inv.id)} inv={inv} live={live} />
              ))}
            </div>
          </section>
        ) : null}
        {live.invoices.length ? (
          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
            {COLUMNS.map(col => {
              const bills = live.invoices.filter(i => col.states.includes(i.state)).sort((a, b) => (a.id > b.id ? -1 : 1))
              return (
                <div key={col.key} className="min-w-0">
                  <div className="mb-3 flex items-center justify-between px-2">
                    <h2 className="flex items-center gap-2 font-display text-base font-semibold">
                      <span className={cn("size-2 rounded-full", col.dot)} />
                      {col.title}
                    </h2>
                    <span className="grid size-6 place-items-center rounded-full bg-muted text-[11px] tabular-nums">{bills.length}</span>
                  </div>
                  <div className="min-h-24 space-y-3 rounded-[1.75rem] bg-muted/30 p-2">
                    {bills.map(inv => (
                      <BillCard key={String(inv.id)} inv={inv} live={live} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <Empty>No bills visible to you yet.</Empty>
        )}
      </LayoutGroup>
      {returned.length ? <p className="mt-6 text-center text-xs text-muted-foreground">{returned.length} bill(s) returned or failed. Find them in each room.</p> : null}
    </>
  )
}
