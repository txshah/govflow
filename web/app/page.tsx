"use client"

/**
 * Payment flow (home): the payment chain as one animated picture, a one-line "now" of what just happened, and three numbers. Details live on the Agents and Bills screens.
 *
 * Inputs:
 * - Live rows for the signed-in persona (the observer sees every room)
 *
 * Outputs:
 * - Flow scene, legend, "now" line (Cult UI typewriter) and summary stats
 */

import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { Canopy, CanopyLegend } from "@/components/canopy/canopy"
import { PageHeader, StatTile } from "@/components/app/page-header"
import { useLive } from "@/components/app/providers"
import { RollingNumber } from "@/components/ui/rolling-number"
import { Typewriter } from "@/components/ui/typewriter"
import { Skeleton } from "@/components/ui/skeleton"
import { activityStream } from "@/lib/domain"

export default function CanopyPage() {
  const live = useLive()
  const settled = live.invoices.filter(i => i.state === "SETTLED").reduce((s, i) => s + i.amount, 0n)
  const inFlight = live.invoices.filter(i => !["DRAFT", "SETTLED", "REJECTED", "FAILED", "PAYMENT_FROZEN"].includes(i.state)).length
  const frozen = live.invoices.filter(i => i.state === "PAYMENT_FROZEN").length
  const lines = activityStream(live, 4).map(a => `${a.what} · ${a.who}`)

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Payment flow"
        description="Agency → prime → subcontractor. Agents prepare and check each bill, two verified people approve it, and USDC settles in seconds on Base Sepolia."
      />

      <section className="glass relative overflow-hidden rounded-[2.25rem] px-2 pt-6 pb-5 md:px-6">
        {live.ready ? <Canopy /> : <Skeleton className="mx-auto aspect-[1000/520] w-full rounded-[2rem]" />}
        <div className="mt-2">
          <CanopyLegend />
        </div>
      </section>

      <div className="mt-6 flex min-h-12 items-center justify-center gap-3 px-2 text-center text-sm">
        <span className="rounded-full bg-secondary/70 px-2.5 py-0.5 text-[11px] font-medium tracking-wide text-secondary-foreground uppercase">Now</span>
        <span className="font-display text-base text-foreground/90 md:text-lg">
          {lines.length ? <Typewriter key={lines[0]} delay={0.2} baseText={lines[0]} texts={lines.slice(1).length ? lines.slice(1) : [lines[0]]} /> : "No activity yet."}
        </span>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Paid down the chain"
          tone="success"
          value={
            <>
              <RollingNumber precision={2} value={Number(settled) / 1e6} format={n => n.toFixed(2)} /> <span className="text-base font-normal text-muted-foreground">USDC</span>
            </>
          }
          hint="Settled onchain, every one reconciled in the ledger"
        />
        <StatTile label="Bills in flight" value={inFlight} hint={<Link href="/bills" className="inline-flex items-center gap-1 hover:text-foreground">See the bills board <ArrowRight className="size-3" /></Link>} />
        <StatTile label="Frozen" value={frozen} tone={frozen ? "danger" : undefined} hint={frozen ? "Waiting for CRS re-verification" : "No wallet changes or mismatches"} />
      </div>
    </>
  )
}
