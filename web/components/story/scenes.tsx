"use client"

/**
 * The nine story scenes, one focus each: contract issued → contractors screened by CRS → one picked (its checks) → papers signed and agents mandated → contract awarded → first payment to the prime → the prime hires a sub → paying the sub → project complete (totals and the verified team).
 *
 * Inputs:
 * - The Story object (lib/story.ts) and live rows
 *
 * Outputs:
 * - SCENES: { key, chapter, render } used by the Story page
 */

import { motion } from "motion/react"
import { Bot, Check, FileText, Landmark, Building2, HardHat, ShieldAlert, ShieldCheck, Sparkles, Snowflake, Zap } from "lucide-react"
import type { ReactNode } from "react"
import type { Live } from "@/components/app/providers"
import { approvalsFor, billStages } from "@/lib/domain"
import { CRS_CHECKS } from "@/lib/verification-graph"
import { decisionOf, type Story } from "@/lib/story"
import { actorName, agentLabel, crsReason, fmtUsdc, orgHue, roleLabel, scopeList, short, titleCase } from "@/lib/format"
import { describeAudit } from "@/lib/describe"
import { cn } from "@/lib/utils"

type Ctx = { s: Story; live: Live }

// ---------- shared pieces ----------

function Title({ kicker, title, sub }: { kicker: string; title: string; sub?: string }) {
  return (
    <div className="mb-8 text-center">
      <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mb-3 inline-block rounded-full bg-secondary/70 px-3 py-1 text-[11px] font-medium tracking-[0.18em] text-secondary-foreground uppercase">
        {kicker}
      </motion.p>
      <motion.h1
        initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ delay: 0.1, duration: 0.6 }}
        className="text-3xl leading-tight font-semibold tracking-tight md:text-5xl"
      >
        {title}
      </motion.h1>
      {sub ? (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }} className="mx-auto mt-3 max-w-2xl text-base text-muted-foreground md:text-lg">
          {sub}
        </motion.p>
      ) : null}
    </div>
  )
}

const kindIcon = { AGENCY: Landmark, PRIME: Building2, SUB: HardHat } as const

function Person({ name, kind, role, verified, delay = 0 }: { name?: string; kind: string; role?: string; verified?: boolean; delay?: number }) {
  const initials = (name ?? "?").split(/\s+/).map(w => w[0]).slice(0, 2).join("")
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }} className="flex items-center gap-2.5">
      <span className={cn("relative grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold", orgHue[kind]?.soft)}>
        {initials}
        {verified ? (
          <span className="absolute -right-0.5 -bottom-0.5 grid size-4 place-items-center rounded-full bg-leaf text-background ring-2 ring-background">
            <Check className="size-2.5" strokeWidth={3} />
          </span>
        ) : null}
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-sm font-medium">{titleCase(name ?? "—")}</span>
        {role ? <span className="block truncate text-xs text-muted-foreground">{role}</span> : null}
      </span>
    </motion.div>
  )
}

function Stamp({ decision, delay = 0 }: { decision: string; delay?: number }) {
  const tone = decision === "PASS" ? "border-leaf text-leaf" : decision === "REVIEW" ? "border-warning text-warning" : decision === "FAIL" ? "border-destructive text-destructive" : "border-border text-muted-foreground"
  return (
    <motion.span
      initial={{ scale: 2.2, opacity: 0, rotate: -18 }}
      animate={{ scale: 1, opacity: 1, rotate: -8 }}
      transition={{ delay, type: "spring", stiffness: 260, damping: 14 }}
      className={cn("inline-block rounded-md border-2 px-2 py-0.5 text-xs font-bold tracking-widest uppercase", tone)}
    >
      {decision === "PASS" ? "Pass" : decision === "REVIEW" ? "Review" : decision === "FAIL" ? "Fail" : "Pending"}
    </motion.span>
  )
}

function Waiting({ text }: { text: string }) {
  return (
    <div className="glass mx-auto flex max-w-md items-center justify-center gap-3 rounded-full px-5 py-3 text-sm text-muted-foreground">
      <motion.span className="size-2 rounded-full bg-sun" animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.2, repeat: Infinity }} />
      {text}
    </div>
  )
}

// Money moving from one organization to the next along an arc.
function MoneyFlight({ from, to, amount, tx, done }: { from?: Live["organizations"][number]; to?: Live["organizations"][number]; amount?: bigint; tx?: string; done: boolean }) {
  const node = (o: Live["organizations"][number] | undefined) => {
    const Icon = o ? (kindIcon[o.kind as keyof typeof kindIcon] ?? Building2) : Building2
    return (
      <div className="flex w-40 flex-col items-center gap-2 text-center">
        <span className={cn("grid size-16 place-items-center rounded-full", o ? orgHue[o.kind]?.soft : "bg-muted")}>
          <Icon className={cn("size-6", o ? orgHue[o.kind]?.text : "")} />
        </span>
        <span className="text-sm font-medium leading-tight">{o ? titleCase(o.name) : "—"}</span>
      </div>
    )
  }
  return (
    <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
      {node(from)}
      <div className="relative h-24 flex-1">
        <svg viewBox="0 0 300 80" className="absolute inset-0 h-full w-full overflow-visible" preserveAspectRatio="none">
          <path d="M 4 70 Q 150 -20 296 70" fill="none" strokeWidth="2" strokeDasharray="4 6" className={done ? "stroke-leaf" : "stroke-border"} />
        </svg>
        {amount !== undefined ? (
          // Positioned in percentages so the chip follows the arc at any width.
          <motion.div
            key={String(done)}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-sun px-3 py-1 text-xs font-semibold whitespace-nowrap tabular-nums"
            initial={{ left: "2%", top: "85%" }}
            animate={done ? { left: ["2%", "50%", "90%"], top: ["85%", "10%", "55%"] } : { left: ["2%", "30%"], top: ["85%", "35%"] }}
            transition={done ? { duration: 1.8, ease: "easeInOut", times: [0, 0.5, 1] } : { duration: 2.4, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
          >
            {fmtUsdc(amount)}
          </motion.div>
        ) : null}
        <p className="absolute inset-x-0 -bottom-5 text-center font-mono text-[11px] text-muted-foreground">{done && tx ? `Base Sepolia · ${short(tx, 8, 6)}` : done ? "settled" : "waiting for approvals"}</p>
      </div>
      {node(to)}
    </div>
  )
}

// The steps of one bill with who did each one.
function PayFlow({ live, bill, s, level }: { live: Live; bill?: Live["invoices"][number]; s: Story; level: "gov" | "sub" }) {
  if (!bill) return <Waiting text="Work is being done on site…" />
  const stages = billStages(live, bill)
  const line = live.milestones.find(m => bill.milestoneIds.includes(m.id))
  const votes = approvalsFor(live, bill).filter(a => a.vote === "APPROVE")
  const payerKind = level === "gov" ? "AGENCY" : "PRIME"
  const payeeKind = level === "gov" ? "PRIME" : "SUB"
  const actor: Record<string, ReactNode> = {
    work: <Person name={s.nameOf(line?.reviewedBy?.toHexString())} kind={payerKind} role="accepted the work" verified />,
    bill: <Person name={s.nameOf(bill.submittedBy?.toHexString())} kind={payeeKind} role="sent the bill" verified />,
    check: (
      <div className="flex items-center gap-2.5">
        <span className="grid size-10 place-items-center rounded-full bg-primary/10">
          <Bot className="size-5 text-primary" />
        </span>
        <span className="text-sm leading-tight">
          <span className="block font-medium">{level === "gov" ? "Agency agent" : "Prime agent"}</span>
          <span className="text-xs text-muted-foreground">Claude · {bill.matchResult ? bill.matchResult.toLowerCase() : "checking"}</span>
        </span>
      </div>
    ),
    crs: (
      <div className="flex items-center gap-2.5">
        <span className="grid size-10 place-items-center rounded-full bg-sun/25">
          <ShieldCheck className="size-5" />
        </span>
        <span className="text-sm leading-tight">
          <span className="block font-medium">CRS check</span>
          <span className="text-xs text-muted-foreground">paid 0.01 USDC via x402</span>
        </span>
      </div>
    ),
    approve: (
      <div className="flex flex-col gap-2">
        {[0, 1].map(i => (
          <Person key={i} name={votes[i] ? s.nameOf(votes[i].approver.toHexString()) : `Approver ${i + 1}`} kind={payerKind} role={votes[i] ? "approved" : "waiting"} verified={!!votes[i]} />
        ))}
      </div>
    ),
    paid: (
      <div className="flex items-center gap-2.5">
        <span className="grid size-10 place-items-center rounded-full bg-leaf/20">
          <Zap className="size-5 text-leaf" />
        </span>
        <span className="text-sm leading-tight">
          <span className="block font-medium tabular-nums">{fmtUsdc(bill.amount)}</span>
          <span className="text-xs text-muted-foreground">USDC settled</span>
        </span>
      </div>
    ),
  }
  return (
    <div className="glass mx-auto grid max-w-6xl grid-cols-3 gap-x-4 gap-y-6 rounded-xl p-6 lg:grid-cols-6">
      {stages.map((st, i) => (
        <motion.div key={st.key} initial={{ opacity: 0, y: 12 }} animate={{ opacity: st.status === "pending" ? 0.45 : 1, y: 0 }} transition={{ delay: i * 0.08 }} className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-full",
                st.status === "done" && "bg-leaf text-background",
                st.status === "current" && "bg-sun",
                st.status === "blocked" && "bg-destructive text-background",
                st.status === "pending" && "border border-border"
              )}
            >
              {st.status === "done" ? <Check className="size-3.5" strokeWidth={3} /> : st.status === "blocked" ? <Snowflake className="size-3.5" /> : null}
            </span>
            <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{st.label}</span>
          </div>
          {actor[st.key]}
        </motion.div>
      ))}
    </div>
  )
}

// ---------- scenes ----------

function Problem() {
  const stats = [
    ["$2.77B", "lost to business email compromise in 2024", "FBI IC3 2024 report"],
    ["82%", "of contractors wait more than 30 days to get paid", "Rabbet, 2024 Construction Payments Report"],
    ["Scattered", "tenders on portals, bids by email, bank details in spreadsheets", "no single place to verify who you pay"],
  ]
  return (
    <>
      <Title kicker="The problem" title="Public money moves slowly, and it's easy to steal" />
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass mx-auto max-w-3xl rounded-xl p-6">
        <p className="text-xs font-semibold tracking-wide text-destructive uppercase">A true story · Cabarrus County, North Carolina</p>
        <p className="mt-2 text-lg leading-relaxed">
          In late 2018 the county got an email from “its contractor” building a new high school, with a signed form and bank letter asking to update its bank details. Staff made the change. On December 21 the county sent <span className="font-semibold">$2.5 million</span> to the scammers. Nobody noticed until the real contractor called about a missed payment. <span className="font-semibold">$1.7 million was never recovered.</span>
        </p>
      </motion.div>
      <div className="mx-auto mt-5 grid max-w-3xl grid-cols-3 gap-3">
        {stats.map(([n, t, src], i) => (
          <motion.div key={n} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 + i * 0.2 }} className="glass rounded-xl p-4">
            <p className="text-3xl font-semibold tabular-nums">{n}</p>
            <p className="mt-1 text-sm">{t}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{src}</p>
          </motion.div>
        ))}
      </div>
    </>
  )
}

function Solution() {
  const pillars = [
    {
      Icon: ShieldCheck,
      title: "Secure",
      points: [
        "Every company and person is CRS-verified before award, and re-checked before every payment",
        "Money only goes to the wallet bound to the verified owner; a changed wallet or owner freezes payment",
        "Claude checks every bill against the contract; two people approve, never an agent",
      ],
    },
    {
      Icon: Zap,
      title: "Seamless",
      points: [
        "One place for every open tender, every bid and every bill, for the city, prime and subs",
        "Upload an RFP and Claude fills in the project; agents exchange the paperwork",
        "Paid in USDC the moment work is accepted and approved: minutes, not months",
      ],
    },
  ]
  return (
    <>
      <Title kicker="Our solution" title="GovFlow: secure and seamless public payments" sub="Unify the postings, secure every payment, and pay contractors in minutes." />
      <div className="mx-auto grid max-w-4xl grid-cols-2 gap-4">
        {pillars.map(({ Icon, title, points }, i) => (
          <motion.div key={title} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.25 }} className="glass rounded-xl p-6">
            <p className="flex items-center gap-2 text-2xl font-semibold">
              <span className="grid size-10 place-items-center rounded-full bg-primary/10 text-primary">
                <Icon className="size-5" />
              </span>
              {i + 1}. {title}
            </p>
            <ul className="mt-4 space-y-2.5 text-sm">
              {points.map((t, k) => (
                <motion.li key={t} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.6 + i * 0.25 + k * 0.15 }} className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-leaf" /> {t}
                </motion.li>
              ))}
            </ul>
          </motion.div>
        ))}
      </div>
    </>
  )
}

function Issue({ s }: Ctx) {
  return (
    <>
      <Title kicker="1 · Contract issued" title="The city issues a contract" sub="A public works job, posted with a schedule of values. Every party who touches it will be verified." />
      {s.contract ? (
        <motion.div initial={{ opacity: 0, y: 40, rotate: -1.5 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ type: "spring", stiffness: 90, damping: 16, delay: 0.3 }} className="glass mx-auto max-w-xl rounded-xl p-7">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <FileText className="size-4" /> {s.agency ? titleCase(s.agency.name) : "Agency"}
          </div>
          <p className="mt-2 text-3xl font-semibold">{s.contract.title}</p>
          <ul className="mt-5 divide-y text-sm">
            {s.lines.map((m, i) => (
              <motion.li key={String(m.id)} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.6 + i * 0.12 }} className="flex justify-between py-2">
                <span>
                  Line {m.lineNo} · {m.description}
                </span>
                <span className="tabular-nums text-muted-foreground">{fmtUsdc(m.scheduledValue)}</span>
              </motion.li>
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-between border-t pt-4">
            <Person name={s.nameOf(s.deal?.createdBy.toHexString())} kind="AGENCY" role="Issued by · CRS verified" verified />
            <span className="text-2xl font-semibold tabular-nums">{fmtUsdc(s.contract.totalValue)}</span>
          </div>
        </motion.div>
      ) : (
        <Waiting text="Publishing the contract…" />
      )}
    </>
  )
}

function Screen({ s }: Ctx) {
  const n = (d: string) => s.applicants.filter(a => decisionOf(a.check) === d).length
  return (
    <>
      <Title kicker="2 · Applications" title="Contractors apply. CRS screens every one." sub="Identity, credit, liens, sanctions, fraud signals and registry, before anyone looks at a price." />
      <div className="mx-auto grid max-w-5xl gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {s.applicants.map((a, i) => {
          const d = decisionOf(a.check)
          const reason = a.check?.reasons?.split(",").filter(Boolean)[0]
          return (
            <motion.div key={String(a.org.id)} initial={{ opacity: 0, y: 24, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: 0.25 + i * 0.35 }} className={cn("glass flex flex-col gap-2 rounded-xl p-4", a.org.kind === "PRIME" && "ring-2 ring-leaf/50")}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm leading-tight font-semibold">{titleCase(a.org.name)}</p>
                <Stamp decision={d} delay={0.55 + i * 0.35} />
              </div>
              <p className="min-h-8 text-xs text-muted-foreground">{reason ? crsReason(reason) : d === "PASS" ? "No issues found" : "—"}</p>
            </motion.div>
          )
        })}
      </div>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 + s.applicants.length * 0.35 }} className="mt-6 text-center text-sm text-muted-foreground">
        <span className="font-medium text-leaf">{n("PASS")} passed</span> · <span className="font-medium text-warning">{n("REVIEW")} need review</span> · <span className="font-medium text-destructive">{n("FAIL")} failed</span>
        <span className="mt-1 block text-xs">Bidding is simulated for the demo; every result is a real CRS sandbox check.</span>
      </motion.p>
    </>
  )
}

function Pick({ s }: Ctx) {
  const v = s.primeCheck
  const reasons = v?.reasons ? v.reasons.split(",").filter(Boolean) : []
  return (
    <>
      <Title kicker="3 · Selection" title={`${s.prime ? titleCase(s.prime.name) : "The prime"} is selected`} sub="Before it can sign, every check has to come back clean." />
      <div className="mx-auto grid max-w-5xl items-start gap-6 md:grid-cols-[18rem_minmax(0,1fr)]">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="glass rounded-xl p-6 text-center">
          <span className={cn("mx-auto grid size-20 place-items-center rounded-full", orgHue.PRIME.soft)}>
            <Building2 className={cn("size-8", orgHue.PRIME.text)} />
          </span>
          <p className="mt-3 text-2xl font-semibold">{s.prime ? titleCase(s.prime.name) : "—"}</p>
          <p className="text-xs text-muted-foreground">Prime contractor</p>
          <div className="mt-4">
            <Stamp decision={decisionOf(v)} delay={2.6} />
          </div>
          <p className="mt-3 font-mono text-[11px] text-muted-foreground">CRS hash {s.prime?.identityHash ? short(s.prime.identityHash, 6, 4) : "—"}</p>
        </motion.div>
        <ul className="space-y-2">
          {CRS_CHECKS.map((c, i) => {
            const ran = !!v && v.products.includes(c.product)
            const flagged = reasons.filter(r => c.reasons.test(r))
            const ok = ran && !flagged.length
            const mock = !!v && v.products.split(",").some(p => p.trim() === `${c.product}:mock`)
            return (
              <motion.li key={c.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.35 }} className="glass flex items-center gap-4 rounded-2xl px-4 py-3">
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.55 + i * 0.35, type: "spring", stiffness: 300, damping: 15 }}
                  className={cn("grid size-8 shrink-0 place-items-center rounded-full", ok ? "bg-leaf text-background" : flagged.length ? "bg-destructive text-background" : "bg-muted text-muted-foreground")}
                >
                  {ok ? <Check className="size-4" strokeWidth={3} /> : flagged.length ? <ShieldAlert className="size-4" /> : null}
                </motion.span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    {c.label} {mock ? <span className="text-xs font-normal text-muted-foreground">(mock)</span> : null}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{c.question}</p>
                </div>
                <span className="shrink-0 text-right text-xs text-muted-foreground">{ok ? c.source : flagged.length ? flagged.map(crsReason).join(", ") : ran ? "" : "not run"}</span>
              </motion.li>
            )
          })}
        </ul>
      </div>
    </>
  )
}

function Papers({ s, live }: Ctx) {
  const side = (org: Live["organizations"][number] | undefined, kind: "AGENCY" | "PRIME", i: number) => {
    const sig = org ? s.sigs.find(x => x.orgId === org.id) : undefined
    const mandate = org ? s.mandates.find(m => m.orgId === org.id) : undefined
    const signer = sig ? live.members.find(m => m.identity.isEqual(sig.signer)) : undefined
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.25 }} className="glass flex flex-col gap-4 rounded-xl p-6">
        <div className="flex items-center justify-between">
          <p className="text-xl font-semibold">{org ? titleCase(org.name) : "—"}</p>
          {sig ? <Stamp decision="PASS" delay={0.4} /> : <span className="text-xs text-muted-foreground">waiting to sign…</span>}
        </div>
        {signer ? <Person name={signer.displayName} kind={kind} role={`signed · CRS ${short(signer.identityHash, 4, 4)}`} verified /> : <Waiting text="Signer reviewing" />}
        <div className="rounded-2xl bg-muted/50 p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Bot className="size-4 text-primary" /> {mandate ? `${agentLabel(mandate.agentId)} mandate` : "Agent mandate"}
          </p>
          {mandate ? (
            <>
              <p className="mt-1 text-xs text-muted-foreground">{scopeList(mandate.scope)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Budget {fmtUsdc(mandate.sessionLimit)} · max {fmtUsdc(mandate.perCallLimit)} per call · never approves or pays
              </p>
            </>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">Not signed yet</p>
          )}
        </div>
      </motion.div>
    )
  }
  return (
    <>
      <Title kicker="4 · Papers" title="Checking the papers" sub="Both sides sign with verified identities and set exactly what their AI agent may do." />
      <div className="mx-auto grid max-w-4xl gap-5 md:grid-cols-2">
        {side(s.agency, "AGENCY", 0)}
        {side(s.prime, "PRIME", 1)}
      </div>
    </>
  )
}

function Award({ s }: Ctx) {
  return (
    <div className="flex flex-col items-center gap-8 pt-6 text-center">
      <motion.div initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 120, damping: 12 }} className="relative grid size-56 place-items-center">
        <motion.span className="absolute inset-0 rounded-full bg-[radial-gradient(circle,var(--sun)_0%,transparent_65%)]" animate={{ scale: [1, 1.15, 1], opacity: [0.7, 1, 0.7] }} transition={{ duration: 3, repeat: Infinity }} />
        <span className="relative grid size-40 place-items-center rounded-full border-4 border-leaf bg-background/80 text-2xl font-bold tracking-widest text-leaf uppercase">Awarded</span>
      </motion.div>
      <div>
        <p className="text-4xl font-semibold md:text-5xl">{s.contract?.title ?? "—"}</p>
        <p className="mt-2 text-lg text-muted-foreground">
          to <span className="font-medium text-foreground">{s.prime ? titleCase(s.prime.name) : "—"}</span> · {s.contract ? fmtUsdc(s.contract.totalValue) : ""} · {s.deal?.state === "ACTIVE" ? "active" : "pending signatures"}
        </p>
      </div>
    </div>
  )
}

function Pay1({ s, live }: Ctx) {
  const pay = s.bill1 ? live.payments.find(p => p.invoiceId === s.bill1!.id && p.state === "CONFIRMED") : undefined
  return (
    <>
      <Title kicker="5 · First payment" title="First progress payment" sub="Work is accepted, the bill is checked by an AI agent and CRS, two people approve, and USDC moves in seconds." />
      <PayFlow live={live} bill={s.bill1} s={s} level="gov" />
      <div className="mt-10">
        <MoneyFlight from={s.agency} to={s.prime} amount={s.bill1?.amount} tx={pay?.txHash} done={s.bill1?.state === "SETTLED"} />
      </div>
    </>
  )
}

function Plan({ s }: Ctx) {
  return (
    <>
      <Title kicker="6 · Planning" title={`${s.prime ? titleCase(s.prime.name).replace(/ LLC$/, "") : "The prime"} gets to work`} sub="Its team is verified, and it hires a subcontractor under the same rules." />
      <div className="mx-auto grid max-w-5xl items-start gap-6 md:grid-cols-2">
        <div className="glass rounded-xl p-6">
          <p className="mb-4 text-xs font-semibold tracking-wide text-muted-foreground uppercase">The team</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {s.people.prime.map((m, i) => (
              <Person key={m.identity.toHexString()} name={m.displayName} kind="PRIME" role={roleLabel[m.role] ?? m.role} verified={m.verified} delay={0.2 + i * 0.12} />
            ))}
          </div>
        </div>
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.6 }} className="glass rounded-xl p-6">
          <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Subcontract</p>
          {s.subContract ? (
            <>
              <p className="text-2xl font-semibold">{s.subContract.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                to {s.sub ? titleCase(s.sub.name) : "—"} · {fmtUsdc(s.subContract.totalValue)}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Stamp decision={decisionOf(s.subCheck)} delay={1} />
                <span className="text-sm text-muted-foreground">{decisionOf(s.subCheck) === "PASS" ? "All CRS checks clean" : "CRS checks need attention"}</span>
              </div>
              <ul className="mt-4 space-y-1.5 text-sm">
                <li className="flex items-center gap-2">
                  <Check className={cn("size-4", s.subSigs.length >= 2 ? "text-leaf" : "text-muted-foreground")} /> Both sides signed
                </li>
                <li className="flex items-center gap-2">
                  <Check className={cn("size-4", s.subMandates.length >= 2 ? "text-leaf" : "text-muted-foreground")} /> Agents mandated on both sides
                </li>
              </ul>
            </>
          ) : (
            <Waiting text="Drafting the subcontract…" />
          )}
        </motion.div>
      </div>
    </>
  )
}

function Pay2({ s, live }: Ctx) {
  const pay = s.bill2 ? live.payments.find(p => p.invoiceId === s.bill2!.id && p.state === "CONFIRMED") : undefined
  const updates = s.bill2
    ? live.audit
        .filter(e => e.subjectType === "invoice" && e.subjectId === s.bill2!.id)
        .sort((a, b) => (a.id > b.id ? -1 : 1))
        .slice(0, 4)
    : []
  return (
    <>
      <Title kicker="7 · Paying the sub" title="The subcontractor gets paid" sub="Same rules one level down: the prime's inspector, agent and two controllers, each verified." />
      <PayFlow live={live} bill={s.bill2} s={s} level="sub" />
      <div className="mt-8">
        <MoneyFlight from={s.prime} to={s.sub} amount={s.bill2?.amount} tx={pay?.txHash} done={s.bill2?.state === "SETTLED"} />
      </div>
      <ol className="mx-auto mt-8 flex max-w-5xl flex-wrap justify-center gap-2">
        <li className="self-center pr-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Status updates</li>
        {[...updates].reverse().map((e, i) => (
          <motion.li key={String(e.id)} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.12 }} className="glass flex items-center gap-2 rounded-full px-3 py-1.5 text-xs">
            <span className="size-1.5 shrink-0 rounded-full bg-leaf" />
            <span className="font-medium">{describeAudit(e.action, e.detail).title}</span>
            <span className="text-muted-foreground">· {actorName(e.actorLabel)}</span>
          </motion.li>
        ))}
        {!updates.length ? <li className="text-sm text-muted-foreground">Waiting for the first update…</li> : null}
      </ol>
    </>
  )
}

function Done({ s }: Ctx) {
  const everyone = [
    ...s.people.agency.map(m => ({ m, kind: "AGENCY", org: s.agency })),
    ...s.people.prime.map(m => ({ m, kind: "PRIME", org: s.prime })),
    ...s.people.sub.map(m => ({ m, kind: "SUB", org: s.sub })),
  ]
  const stats = [
    { label: "Paid down the chain", value: fmtUsdc(s.totals.paid) },
    { label: "Bills settled", value: String(s.totals.bills) },
    { label: "People verified", value: String(s.totals.people) },
    { label: "Fraud attempts blocked", value: String(s.totals.blocked) },
  ]
  return (
    <>
      <Title kicker="8 · Complete" title="Project complete. Every payment verified." />
      <div className="mx-auto mb-4 grid max-w-5xl gap-3 sm:grid-cols-4">
        {stats.map((x, i) => (
          <motion.div key={x.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.1 }} className="glass rounded-xl p-4 text-center">
            <p className="text-3xl font-semibold tabular-nums">{x.value}</p>
            <p className="text-xs text-muted-foreground">{x.label}</p>
          </motion.div>
        ))}
      </div>
      <div className="glass mx-auto max-w-5xl overflow-hidden rounded-xl">
        <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto] gap-4 border-b px-5 py-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          <span>Person</span>
          <span>Organization</span>
          <span>Role</span>
          <span>CRS</span>
        </div>
        <ul className="max-h-[30vh] divide-y overflow-y-auto">
          {everyone.map(({ m, kind, org }, i) => (
            <motion.li key={m.identity.toHexString()} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 + i * 0.05 }} className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto] items-center gap-4 px-5 py-2.5 text-sm">
              <span className="truncate font-medium">{titleCase(m.displayName)}</span>
              <span className="flex items-center gap-2 truncate text-muted-foreground">
                <span className={cn("size-2 shrink-0 rounded-full", orgHue[kind]?.bg)} />
                {org ? titleCase(org.name) : ""}
              </span>
              <span className="truncate text-muted-foreground">{roleLabel[m.role] ?? m.role}</span>
              <span className={cn("inline-flex items-center gap-1 text-xs", m.verified ? "text-leaf" : "text-muted-foreground")}>
                {m.verified ? <ShieldCheck className="size-3.5" /> : null}
                {m.verified ? `verified · ${short(m.identityHash, 4, 4)}` : "not verified"}
              </span>
            </motion.li>
          ))}
        </ul>
      </div>
      <p className="mt-5 flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <Sparkles className="size-4 text-sun" /> Agents prepared every bill. Verified people approved every payment.
      </p>
    </>
  )
}

export const SCENES = [
  { key: "problem", chapter: "The problem", render: Problem, secs: 14 },
  { key: "solution", chapter: "Our solution", render: Solution, secs: 12 },
  { key: "issue", chapter: "Contract issued", render: Issue, secs: 7 },
  { key: "screen", chapter: "Applications", render: Screen, secs: 10 },
  { key: "pick", chapter: "Selected", render: Pick, secs: 10 },
  { key: "papers", chapter: "Papers", render: Papers, secs: 8 },
  { key: "award", chapter: "Awarded", render: Award, secs: 5 },
  { key: "pay1", chapter: "First payment", render: Pay1, secs: 10 },
  { key: "plan", chapter: "Hiring the sub", render: Plan, secs: 9 },
  { key: "pay2", chapter: "Paying the sub", render: Pay2, secs: 10 },
  { key: "done", chapter: "Complete", render: Done, secs: 14 },
] as const
