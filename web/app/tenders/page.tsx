"use client"

/**
 * Open tenders: every project the city has out for bid, how long each has been open, downloadable bid packages, and the
 * applications submitted by verified companies' agents, each with its CRS result. Unverified applicants can't be shortlisted.
 *
 * Inputs:
 * - Live rows (prime contracts, organizations, CRS verifications); a fixed list of demo tenders
 *
 * Outputs:
 * - Tender board, application list for the chosen tender, bid-package downloads
 */

import { useEffect, useState } from "react"
import Link from "next/link"
import { Bot, Download, FileText, MonitorPlay, ShieldAlert, ShieldCheck } from "lucide-react"
import { useLive } from "@/components/app/providers"
import { PageHeader, Section } from "@/components/app/page-header"
import { Pill } from "@/components/StatusBadge"
import { latestOrgCheck } from "@/lib/story"
import { contractNo, crsReason, fmtUsdc, titleCase, toDate } from "@/lib/format"
import { useNow } from "@/lib/use-now"
import { loadTenders, type SavedTender } from "@/lib/demo-state"
import { briefAtomic } from "@/lib/live-steps"
import { cn } from "@/lib/utils"

const DAY = 86_400_000

type Tender = { id: string; title: string; scope: string; budget: string; postedDaysAgo: number; closesInDays: number; demo: boolean; apps: number; postedAt?: number; status?: string }

// Other open tenders on the city's board (illustrative; the bridge project is the one that runs live).
const DEMO_TENDERS: Tender[] = [
  { id: "T-2026-031", title: "Elm Street storm drain replacement", scope: "Replace 420 ft of storm drain and 6 catch basins", budget: "0.80 USDC", postedDaysAgo: 12, closesInDays: 9, demo: true, apps: 4 },
  { id: "T-2026-028", title: "Fire Station 3 roof replacement", scope: "Tear-off and replace 6,200 sq ft membrane roof", budget: "0.65 USDC", postedDaysAgo: 19, closesInDays: 2, demo: true, apps: 6 },
  { id: "T-2026-024", title: "Riverside Park lighting upgrade", scope: "Swap 48 fixtures to LED, new controls", budget: "0.30 USDC", postedDaysAgo: 26, closesInDays: -1, demo: true, apps: 3 },
  { id: "T-2026-019", title: "Main Street ADA curb ramps", scope: "Rebuild 22 curb ramps to ADA standard", budget: "0.45 USDC", postedDaysAgo: 33, closesInDays: -6, demo: true, apps: 5 },
]

function openFor(now: number, at: number) {
  const m = Math.max(0, Math.floor(((now || at) - at) / 60_000))
  return m < 1 ? "Posted just now" : m < 60 ? `Open ${m} min` : `Open ${Math.floor(m / 60)} h ${m % 60} min`
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }))
  const a = Object.assign(document.createElement("a"), { href: url, download: name })
  a.click()
  URL.revokeObjectURL(url)
}

function bidPackage(t: Tender) {
  return [
    `CITY OF OAKRIDGE PUBLIC WORKS · INVITATION FOR BIDS ${t.id}`,
    ``,
    `Project: ${t.title}`,
    `Scope: ${t.scope}`,
    `Budget: ${t.budget} (test USDC, Base Sepolia)`,
    ``,
    `BID FORM`,
    `Company legal name: ____________________`,
    `Business owner (full name): ____________________`,
    `Payout wallet (Base Sepolia): ____________________`,
    `Schedule of values (line, description, amount): ____________________`,
    `Proposed start / finish: ____________________`,
    ``,
    `REQUIREMENTS`,
    `- Every bidder is screened with CRS before award: identity (TransUnion IDV), business credit,`,
    `  liens & judgments (PitchPoint), sanctions (OFAC SDN), fraud signals (Fraud Finder), business registry.`,
    `- Only bidders that pass can be selected. Results are stored as an attestation hash, not raw identity data.`,
    `- Payment: progress billing on accepted work only, two approvals, paid to the verified owner's wallet.`,
    `- Any change of payee, wallet or owner after award freezes payment until re-verified and approved.`,
    ``,
    `Submit through GovFlow, or have your company's verified agent submit on your behalf.`,
  ].join("\n")
}

export default function TendersPage() {
  const live = useLive()
  const now = useNow(15_000)
  const agency = live.organizations.find(o => o.kind === "AGENCY")
  const applicants = live.organizations.filter(o => o.kind !== "AGENCY")
  const primes = [...live.contracts].filter(c => c.kind === "PRIME_CONTRACT").sort((a, b) => (a.id > b.id ? -1 : 1))
  const latest = primes[0]

  const bridge: Tender = {
    id: latest ? `T-2026-${contractNo(latest).slice(2)}` : "T-2026-0001",
    title: "Oakridge Avenue bridge railing repair",
    scope: "Replace damaged railing sections; install railing lights (subcontract)",
    budget: latest ? fmtUsdc(latest.totalValue) : "0.10 USDC",
    postedDaysAgo: latest && now ? Math.max(0, Math.floor((now - toDate(latest.createdAt).getTime()) / DAY)) : 0,
    closesInDays: 14,
    demo: false,
    apps: applicants.length,
  }
  // Projects posted from Live in this browser, newest first.
  const [saved, setSaved] = useState<SavedTender[]>([])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- read browser storage after mount
  useEffect(() => setSaved(loadTenders()), [])
  const posted: Tender[] = saved.map(t => {
    const c = t.contractId ? live.contracts.find(k => String(k.id) === t.contractId) : undefined
    const awardee = c ? live.organizations.find(o => o.id === c.payeeOrgId) : undefined
    return {
      id: t.id,
      title: t.title,
      scope: t.scope,
      budget: fmtUsdc(briefAtomic(t)),
      postedDaysAgo: 0,
      closesInDays: 14,
      demo: false,
      apps: applicants.length,
      postedAt: t.postedAt,
      status: awardee ? `Awarded · ${titleCase(awardee.name)}` : "Open · screening applicants",
    }
  })
  const tenders = [...(posted.length ? posted : [bridge]), ...DEMO_TENDERS]
  const [picked, setPicked] = useState<string | null>(null)
  const tender = tenders.find(t => t.id === picked) ?? tenders[0]

  const apps = applicants.map(o => {
    const v = latestOrgCheck(live, o.id)
    const d = v ? (v.decision ?? (v.passed ? "PASS" : "FAIL")) : "PENDING"
    return { o, v, d }
  })
  const verified = apps.filter(a => a.d === "PASS")
  const open = tenders.filter(t => t.closesInDays >= 0)

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Procurement"
        title="Open tenders"
        description={`Every project ${agency ? titleCase(agency.name) : "the city"} has out for bid, with each applicant's CRS result. Only verified companies can be shortlisted.`}
        actions={
          <Link href="/live" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground">
            <MonitorPlay className="size-4" /> Run the bridge project live
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Open tenders", String(open.length)],
          ["Longest open", `${Math.max(...open.map(t => t.postedDaysAgo))} days`],
          ["Applications", String(tenders.reduce((a, t) => a + t.apps, 0))],
          ["Verified applicants", `${verified.length} of ${apps.length}`],
        ].map(([k, v]) => (
          <div key={k} className="glass rounded-xl px-4 py-3">
            <p className="text-xs text-muted-foreground">{k}</p>
            <p className="mt-0.5 text-2xl font-semibold tabular-nums">{v}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        <Section title="Tender board" description="Click a tender to see its applications. Bid packages download as forms.">
          <ul className="divide-y">
            {tenders.map(t => {
              const closed = t.closesInDays < 0
              return (
                <li key={t.id} className={cn("flex items-center gap-3 py-3", tender.id === t.id && "-mx-3 rounded-lg bg-muted/60 px-3")}>
                  <button onClick={() => setPicked(t.id)} className="min-w-0 flex-1 text-left">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      {t.title}
                      {!t.demo ? <Pill tone="success">Live</Pill> : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t.id} · {t.budget} · {t.apps} applications
                    </p>
                    {t.status ? <p className="text-xs font-medium text-leaf">{t.status}</p> : null}
                  </button>
                  <div className="w-28 shrink-0 text-right text-xs">
                    <p className="font-medium tabular-nums">{t.postedAt ? openFor(now, t.postedAt) : t.postedDaysAgo ? `Open ${t.postedDaysAgo} ${t.postedDaysAgo === 1 ? "day" : "days"}` : "Posted today"}</p>
                    <p className={cn(closed ? "text-muted-foreground" : t.closesInDays <= 3 ? "text-amber-600" : "text-muted-foreground")}>
                      {closed ? "Closed, in review" : `Closes in ${t.closesInDays}d`}
                    </p>
                  </div>
                  <button onClick={() => download(`${t.id}-bid-package.txt`, bidPackage(t))} className="grid size-8 shrink-0 place-items-center rounded-md border hover:bg-muted" title="Download bid package">
                    <Download className="size-4" />
                  </button>
                </li>
              )
            })}
          </ul>
          <p className="mt-3 text-[11px] text-muted-foreground">Other tenders are illustrative; the bridge project runs on live data.</p>
        </Section>

        <Section title={`Applications · ${tender.title}`} description="Submitted by each company's AI agent on its behalf, then screened with CRS.">
          {tender.demo ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Applications for this tender are illustrative. Pick the bridge project to see real CRS results.</p>
          ) : (
            <ul className="space-y-2">
              {apps.map(({ o, v, d }) => {
                const reasons = v?.reasons ? v.reasons.split(",").filter(Boolean) : []
                const ok = d === "PASS"
                return (
                  <li key={String(o.id)} className={cn("rounded-lg border p-3", ok ? "border-leaf/40" : "opacity-80")}>
                    <div className="flex items-center gap-2">
                      {ok ? <ShieldCheck className="size-4 text-leaf" /> : <ShieldAlert className={cn("size-4", d === "FAIL" ? "text-destructive" : "text-amber-600")} />}
                      <span className="flex-1 text-sm font-medium">{titleCase(o.name)}</span>
                      <Pill tone={ok ? "success" : d === "FAIL" ? "danger" : "warning"}>{ok ? "Verified · can be selected" : d === "FAIL" ? "Failed · blocked" : "Review · blocked"}</Pill>
                    </div>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Bot className="size-3" /> Submitted by {o.name.split(" ")[0].toLowerCase()}-agent
                      {reasons.length ? ` · ${reasons.slice(0, 2).map(crsReason).join(", ")}` : " · no issues found"}
                    </p>
                    <button
                      onClick={() =>
                        download(
                          `${o.name.replace(/\W+/g, "-").toLowerCase()}-bid.txt`,
                          `BID · ${tender.title}\nCompany: ${titleCase(o.name)}\nCRS result: ${d}${reasons.length ? ` (${reasons.map(crsReason).join(", ")})` : ""}\nAttestation hash: ${o.identityHash || "none (not verified)"}\nOffer: ${tender.budget} per the schedule of values\nSubmitted by the company's agent through GovFlow.`
                        )
                      }
                      className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <FileText className="size-3" /> Download bid
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </Section>
      </div>
    </div>
  )
}
