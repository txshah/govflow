"use client"

/**
 * Live: the demo from the government's side. The city's own steps are buttons (issue, countersign, accept work, approve, reject a suspicious wallet change); the prime's and sub's steps run by themselves and pop up as their screen beside yours; the AI agent, CRS check and payout show as their own windows. The middle shows the paperwork itself (contract, site photos, inspection form, pay application, CRS report, impostor email, case file, receipt). After the CRS check you can simulate an impostor's wallet-change email and watch it get frozen, investigated, and rejected. Teams on the left, agents & services on the right.
 *
 * Inputs:
 * - Live rows (best as the observer), demo personas (for acting as each person)
 *
 * Outputs:
 * - Step rail, the current step card with its action, teams panel, agents & services feed
 */

import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { ArrowRight, Building2, Check, Clapperboard, HardHat, Landmark, Plus, ShieldCheck, TriangleAlert } from "lucide-react"
import { useLive, usePersonas, type Live } from "@/components/app/providers"
import { AgentFeed } from "@/components/AgentFeed"
import { StepDocument } from "@/components/live/documents"
import { StepWindows } from "@/components/live/windows"
import { buildSteps, performStep, projectParts, usePersonaActor, type LiveStep } from "@/lib/live-steps"
import { latestOrgCheck, decisionOf } from "@/lib/story"
import {fmtUsdc, orgHue, roleLabel, short, titleCase, toDate, contractNo, docNo} from "@/lib/format"
import { useNow } from "@/lib/use-now"
import { cn } from "@/lib/utils"

const ORGS = [
  { kind: "AGENCY", icon: Landmark },
  { kind: "PRIME", icon: Building2 },
  { kind: "SUB", icon: HardHat },
] as const
const LEVEL_LABEL = { setup: "Setup", gov: "Agency → Prime", sub: "Prime → Sub" } as const

function Avatar({ name, kind, size = "md" }: { name: string; kind: string; size?: "md" | "lg" }) {
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-full font-semibold", orgHue[kind]?.soft, size === "lg" ? "size-12 text-base" : "size-8 text-xs")}>
      {name
        .split(/\s+/)
        .map(w => w[0])
        .slice(0, 2)
        .join("")}
    </span>
  )
}

const HOLD_MS = 3000

const AUTO_KINDS = ["agent", "crs", "payout", "risk"]
const TURN_LABEL: Record<string, string> = { you: "Your turn", agent: "AI agent", crs: "CRS · x402", payout: "Payout", risk: "AI agent · investigating", fraud: "Your call", screen: "CRS screening" }

// When an automatic step's result landed (agent finding, CRS attestation, confirmed payout, case file).
function autoDoneAt(step: LiveStep, live: Live): number | undefined {
  const b = step.bill
  if (!b) return undefined
  const ms = (t?: { microsSinceUnixEpoch: bigint }) => (t ? Number(t.microsSinceUnixEpoch / 1000n) : undefined)
  if (step.kind === "risk") return ms([...live.findings].filter(f => f.kind === "RISK_CASE" && f.subjectId === b.id).sort((a, c) => (a.id > c.id ? -1 : 1))[0]?.at)
  if (step.kind === "agent") return ms(live.findings.find(f => f.kind === "MATCH" && f.subjectId === b.id)?.at)
  if (step.kind === "crs") return ms([...live.verifications].filter(v => v.invoiceId === b.id).sort((a, c) => (a.checkedAt.microsSinceUnixEpoch > c.checkedAt.microsSinceUnixEpoch ? -1 : 1))[0]?.checkedAt)
  if (step.kind === "payout") return ms(live.payments.find(p => p.invoiceId === b.id && p.state === "CONFIRMED")?.updatedAt)
  return undefined
}

function resultFor(step: LiveStep, live: Live, contractId?: bigint) {
  const x = projectParts(live, contractId)
  const nameOf = (hex?: string) => titleCase(live.members.find(m => m.identity.toHexString() === hex)?.displayName ?? "")
  const bill = step.level === "sub" ? x.bill2 : x.bill1
  const line = step.level === "sub" ? x.line2 : x.line1
  const pay = bill ? live.payments.find(p => p.invoiceId === bill.id && p.state === "CONFIRMED") : undefined
  const votes = bill ? live.approvals.filter(a => a.invoiceId === bill.id && a.kind === "PAYMENT" && a.vote === "APPROVE").sort((a, b) => (a.id < b.id ? -1 : 1)) : []
  switch (step.key) {
    case "screen": {
      const ds = live.organizations
        .filter(o => o.kind !== "AGENCY")
        .map(o => (live.verifications.find(v => v.orgId === o.id && v.subjectType === "ORG") as { decision?: string; passed: boolean } | undefined))
        .map(v => (v ? (v.decision ?? (v.passed ? "PASS" : "FAIL")) : ""))
      return `${ds.length} applicants · ${ds.filter(d => d === "PASS").length} passed · ${ds.filter(d => d === "REVIEW").length} need review · ${ds.filter(d => d === "FAIL").length} failed`
    }
    case "post":
      return "Posted for bids by a CRS-verified agency"
    case "select":
      return "Okafor Builders LLC selected · failed applicants blocked"
    case "checks": {
      const prime = live.organizations.find(o => o.kind === "PRIME")
      return `All six checks clean · CRS hash ${short(prime?.identityHash ?? "", 6, 4)}`
    }
    case "issue":
      return x.contract ? `${x.contract.title} · ${fmtUsdc(x.contract.totalValue)}` : ""
    case "sign":
      return "Both sides signed · agents mandated with spending limits"
    case "hire":
      return x.sub ? `${x.sub.title} → ${titleCase(live.organizations.find(o => o.id === x.sub!.payeeOrgId)?.name ?? "")}` : ""
  }
  if (step.key.endsWith("-evidence")) return line?.evidenceRefs ?? ""
  if (step.key.endsWith("-accept")) return `Accepted by ${nameOf(line?.reviewedBy?.toHexString())}${line?.reviewNote ? ` · “${line.reviewNote}”` : ""}`
  if (step.key.endsWith("-bill")) return bill ? `${docNo(bill)} · ${fmtUsdc(bill.amount)}` : ""
  if (step.key.endsWith("-agent")) return bill ? `${bill.matchResult.toLowerCase()} · ${bill.matchReasons.split("\n")[0]}` : ""
  if (step.key.endsWith("-crs")) return "Every check came back clean"
  if (step.key.endsWith("-approve1")) return `Approved by ${nameOf(votes[0]?.approver.toHexString())}`
  if (step.key.endsWith("-approve2")) return `Approved by ${nameOf(votes[1]?.approver.toHexString())}`
  if (step.key.endsWith("-paid")) return pay ? `${fmtUsdc(pay.amount)} · ${pay.simulated ? "simulated" : "Base Sepolia"} ${short(pay.txHash, 8, 6)}` : ""
  return ""
}

export default function LivePage() {
  const live = useLive()
  const { personas } = usePersonas()
  const as = usePersonaActor(personas)
  const now = useNow(1000)
  const liveRef = useRef(live)
  useEffect(() => {
    liveRef.current = live
  }, [live])
  const getLive = useCallback(() => liveRef.current, [])

  // The project: the newest prime contract, unless you start a new one.
  const latest = [...live.contracts].filter(c => c.kind === "PRIME_CONTRACT").sort((a, b) => (a.id > b.id ? -1 : 1))[0]?.id
  const [chosen, setChosen] = useState<bigint | "new" | null>(null)
  const projectId = chosen === "new" ? undefined : (chosen ?? latest)
  const [fraudSkipped, setFraudSkipped] = useState(false)
  const [screened, setScreened] = useState(false)
  const [selected, setSelected] = useState(false)
  const [posted, setPosted] = useState(false)
  const [checked, setChecked] = useState(false)
  const [triedBad, setTriedBad] = useState(false)
  const steps = useMemo(
    () => buildSteps(live, projectId, { fraudSkipped, posted, screened, selected, checked }),
    [live, projectId, fraudSkipped, posted, screened, selected, checked]
  )
  const current = steps.findIndex(s => !s.done)
  const currentIndex = current === -1 ? steps.length : current
  const [view, setView] = useState<number | null>(null)
  // An automatic step that just finished stays on screen a few seconds, so its result is seen.
  const prev = steps[currentIndex - 1]
  const [partyDone, setPartyDone] = useState<{ key: string; at: number } | null>(null)
  const prevDoneAt = prev && AUTO_KINDS.includes(prev.kind) ? autoDoneAt(prev, live) : prev && partyDone?.key === prev.key ? partyDone.at : undefined
  const holding = prevDoneAt !== undefined && now - prevDoneAt < HOLD_MS
  const shown = view ?? (holding ? currentIndex - 1 : currentIndex)
  const step = steps[shown]
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const act = async () => {
    if (!step) return
    if (step.key === "post") {
      setPosted(true)
      setPartyDone({ key: "post", at: Date.now() })
      return
    }
    if (step.key === "select") {
      setSelected(true)
      setPartyDone({ key: "select", at: Date.now() })
      return
    }
    setBusy(true)
    setError(null)
    setView(null)
    try {
      const newId = await performStep(step, getLive, projectId, as)
      if (newId !== undefined) setChosen(newId)
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^unauthorized: /, "Not allowed: ") : String(e))
    } finally {
      setBusy(false)
    }
  }

  // The prime's and sub's steps (and the screening) run by themselves, after a beat so their screen is seen.
  // The timer starts once per step and reads the latest values through refs, so live updates can't cancel it.
  const autoRan = useRef<string | null>(null)
  const stepRef = useRef({ step, projectId, as })
  useEffect(() => {
    stepRef.current = { step, projectId, as }
  }, [step, projectId, as])
  const autoKey = step && view === null && (step.kind === "party" || step.kind === "screen" || step.kind === "checks") && !step.done && !busy && !holding ? `${String(projectId)}:${step.key}` : null
  useEffect(() => {
    if (!autoKey || autoRan.current === autoKey) return
    autoRan.current = autoKey
    const isScreen = autoKey.endsWith(":screen")
    const isChecks = autoKey.endsWith(":checks")
    setTimeout(
      async () => {
        const { step: st, projectId: pid, as: actAs } = stepRef.current
        if (!st || `${String(pid)}:${st.key}` !== autoKey) return
        if (isChecks) {
          setChecked(true)
          setPartyDone({ key: "checks", at: Date.now() })
          return
        }
        if (isScreen) {
          setScreened(true)
          setPartyDone({ key: "screen", at: Date.now() })
          return
        }
        setBusy(true)
        setError(null)
        try {
          await performStep(st, getLive, pid, actAs)
          setPartyDone({ key: st.key, at: Date.now() })
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e))
          autoRan.current = null
        } finally {
          setBusy(false)
        }
      },
      isChecks ? 4500 : isScreen ? 3500 : 1500
    )
  }, [autoKey, getLive])

  const actingNames = new Set((step?.who ?? []).map(w => personas.find(p => p.key === w.persona)?.name.toUpperCase()))
  const x = projectParts(live, projectId)

  // How long an automatic step has been waiting, and whether the agent service looks offline.
  const waitingSince = step?.bill?.submittedAt
  const waitedS = waitingSince ? Math.max(0, Math.round((now - toDate(waitingSince).getTime()) / 1000)) : 0
  const agentStarted = step?.bill ? live.agentActions.some(a => a.detail.includes(`bill ${step.bill!.id}`)) : false
  const looksOffline = !!step && ["agent", "crs", "risk"].includes(step.kind) && waitedS > 30 && !agentStarted

  return (
    <div className="relative left-1/2 w-[min(98vw,1760px)] -translate-x-1/2">
      {/* Project header + step rail */}
      <div className="glass mb-4 rounded-xl px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium tracking-[0.18em] text-muted-foreground uppercase">Live project</p>
            <p className="truncate text-lg font-semibold">{x.contract ? `${x.contract.title} · ${contractNo(x.contract)}` : "New project"}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/story" className="glass inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-sm hover:text-primary">
              <Clapperboard className="size-4" /> Story
            </Link>
            <button
              onClick={() => {
                setChosen("new")
                setView(null)
                setError(null)
                setFraudSkipped(false)
                setScreened(false)
                setSelected(false)
                setPosted(false)
                setChecked(false)
                setTriedBad(false)
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground"
            >
              <Plus className="size-4" /> New project
            </button>
          </div>
        </div>
        <ol className="mt-4 flex items-center gap-1">
          {steps.map((s, i) => (
            <li key={s.key} className="min-w-0 flex-1">
              <button onClick={() => i <= currentIndex && setView(i === currentIndex ? null : i)} disabled={i > currentIndex} className="group flex w-full flex-col gap-1 text-left disabled:cursor-default" title={`${LEVEL_LABEL[s.level]} · ${s.title}`}>
                <span className={cn("h-1.5 rounded-full transition-colors", s.done ? "bg-leaf" : i === currentIndex ? "bg-sun" : "bg-border", i === shown && "ring-2 ring-primary/60 ring-offset-1 ring-offset-background")} />
                {i === 0 || steps[i - 1].level !== s.level ? <span className="truncate text-[10px] font-medium text-muted-foreground">{LEVEL_LABEL[s.level]}</span> : <span className="h-[15px]" />}
              </button>
            </li>
          ))}
        </ol>
      </div>

      <div className="grid gap-4 lg:grid-cols-[17rem_minmax(0,1fr)_20rem]">
        {/* Teams */}
        <aside className="glass max-h-[calc(100svh-17rem)] space-y-4 overflow-y-auto rounded-xl p-4">
          <p className="text-[13px] font-semibold">Teams</p>
          {ORGS.map(({ kind, icon: Icon }) => {
            const org = kind === "SUB" ? (live.organizations.find(o => o.id === (x.sub?.payeeOrgId ?? -1n)) ?? live.organizations.find(o => o.kind === "SUB" && o.payoutWallet && o.verified)) : live.organizations.find(o => o.kind === kind)
            const team = org ? live.members.filter(m => m.orgId === org.id) : []
            const check = org ? latestOrgCheck(live, org.id) : undefined
            return (
              <div key={kind}>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-medium">
                  <Icon className={cn("size-3.5", orgHue[kind]?.text)} />
                  <span className="truncate">{org ? titleCase(org.name) : kind}</span>
                  {decisionOf(check) === "PASS" ? <ShieldCheck className="size-3.5 shrink-0 text-leaf" /> : null}
                </p>
                <ul className="space-y-1">
                  {team.map(m => {
                    const acting = actingNames.has(m.displayName.toUpperCase())
                    return (
                      <li key={m.identity.toHexString()} className={cn("flex items-center gap-2 rounded-xl px-2 py-1.5 transition-colors", acting && "bg-sun/25 ring-1 ring-sun")}>
                        <Avatar name={m.displayName} kind={kind} />
                        <span className="min-w-0 flex-1 leading-tight">
                          <span className="block truncate text-[13px] font-medium">{titleCase(m.displayName)}</span>
                          <span className="block truncate text-[11px] text-muted-foreground">{acting ? "acting now" : (roleLabel[m.role] ?? m.role)}</span>
                        </span>
                        {m.verified ? <Check className="size-3.5 shrink-0 text-leaf" strokeWidth={3} aria-label="CRS verified" /> : null}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </aside>

        {/* The step on stage: what's submitted (the document) and who's acting (pop-up windows) */}
        <section className="glass relative flex min-h-[32rem] flex-col rounded-xl p-6">
          {step ? (
            <>
              {view === null && !holding && shown > 0 && steps[shown - 1]?.done ? (
                <motion.div key={`prev-${shown}`} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-leaf/12 px-3 py-2 text-sm">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-leaf text-background">
                    <Check className="size-3" strokeWidth={3} />
                  </span>
                  <span className="font-medium">{steps[shown - 1].title}</span>
                  <span className="min-w-0 truncate text-muted-foreground">· {resultFor(steps[shown - 1], live, projectId)}</span>
                </motion.div>
              ) : null}
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 font-semibold",
                        step.kind === "you" || step.kind === "fraud" ? "bg-primary text-primary-foreground" : step.kind === "party" ? "bg-muted text-foreground" : "bg-sun/30 text-foreground"
                      )}
                    >
                      {step.kind === "party" ? `${step.who?.[0]?.org === "SUB" ? "Nakamura" : "Okafor"} · automated` : TURN_LABEL[step.kind]}
                    </span>
                    {LEVEL_LABEL[step.level]} · step {shown + 1} of {steps.length}
                  </p>
                  <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">{step.title}</h1>
                </div>
                {view !== null && view !== currentIndex ? (
                  <button onClick={() => setView(null)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground">
                    Back to current step <ArrowRight className="size-4" />
                  </button>
                ) : null}
              </div>

              {looksOffline && shown === currentIndex ? (
                <p className="mt-3 flex items-center gap-2 rounded-lg bg-warning/15 px-3 py-2 text-sm">
                  <TriangleAlert className="size-4 shrink-0 text-warning" /> No agent activity for {waitedS}s. Is the API running? (<code className="font-mono text-xs">cd api &amp;&amp; npm start</code>)
                </p>
              ) : null}
              {error ? (
                <p className="mt-3 flex items-center gap-2 rounded-lg bg-destructive/12 px-3 py-2 text-sm text-destructive">
                  <TriangleAlert className="size-4 shrink-0" /> {error}
                </p>
              ) : null}

              <div className="mt-5 grid flex-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
                <AnimatePresence mode="wait">
                  <motion.div key={`doc-${step.key}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <StepDocument step={step} live={live} contractId={projectId} />
                  </motion.div>
                </AnimatePresence>
                <div className="space-y-3">
                  <AnimatePresence mode="popLayout">
                    <motion.div key={`win-${step.key}`} className="space-y-3" exit={{ opacity: 0, x: 60 }}>
                      <StepWindows step={step} live={live} personas={personas} contractId={projectId} isCurrent={shown === currentIndex} busy={busy} onAct={act} onSkip={() => setFraudSkipped(true)} onTryBad={() => setTriedBad(true)} triedBad={triedBad} />
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
            </>
          ) : (
            <motion.div key="finished" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex flex-1 flex-col items-center justify-center text-center">
              <span className="grid size-14 place-items-center rounded-full bg-leaf text-background">
                <Check className="size-7" strokeWidth={3} />
              </span>
              <h1 className="mt-4 text-3xl font-semibold">Project complete</h1>
              <p className="mt-2 text-muted-foreground">Both levels paid. Every person and payee verified.</p>
              <button
                onClick={() => {
                  setChosen("new")
                  setView(null)
                  setFraudSkipped(false)
                  setScreened(false)
                  setSelected(false)
                  setPosted(false)
                  setChecked(false)
                  setTriedBad(false)
                }}
                className="mt-6 inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
              >
                <Plus className="size-4" /> New project
              </button>
            </motion.div>
          )}
        </section>

        {/* Agents & services */}
        <aside className="glass flex max-h-[calc(100svh-17rem)] min-w-0 flex-col overflow-hidden rounded-xl">
          <header className="border-b px-4 py-3">
            <p className="text-[13px] font-semibold">Agents &amp; services</p>
            <p className="text-[11px] text-muted-foreground">Approvals, checks and payouts as they happen</p>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            <AgentFeed limit={30} />
          </div>
        </aside>
      </div>
    </div>
  )
}
