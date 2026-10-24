"use client"

/**
 * Verification theater: a full-screen, live graph of every security check one bill passes before USDC moves — work accepted → agent match → x402-paid CRS call → five CRS checks (identity, credit, liens, sanctions, filings) → wallet ownership → two verified approvers → payout. Columns resolve one after another (checking → clean / review / flagged) with signals travelling the edges; Replay re-runs it for a demo.
 *
 * Inputs:
 * - invoiceId; live rows for the signed-in persona (payer, payee or observer)
 *
 * Outputs:
 * - A fixed full-screen overlay; Esc or Close returns to the bill's page
 */

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState, useSyncExternalStore } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "motion/react"
import {
  Bot,
  Check,
  ClipboardCheck,
  Coins,
  Fingerprint,
  Landmark,
  Loader2,
  RotateCcw,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  Snowflake,
  UserCheck,
  Wallet,
  X,
  Zap,
} from "lucide-react"
import { useLive } from "@/components/app/providers"
import { TextureOverlay } from "@/components/ui/texture-overlay"
import { COLUMNS, verificationGraph, type GraphNode, type NodeStatus } from "@/lib/verification-graph"
import { fmtUsdc, kindLabel, titleCase, toDate } from "@/lib/format"
import { orgName } from "@/lib/domain"
import { cn } from "@/lib/utils"

const VW = 1680
const VH = 720
const NODE_W = 196
const colX = (c: number) => 130 + c * ((VW - 260) / (COLUMNS.length - 1))

const kindIcon: Record<GraphNode["kind"], typeof Bot> = {
  work: ClipboardCheck,
  agent: Bot,
  x402: Coins,
  crs: Fingerprint,
  wallet: Wallet,
  person: UserCheck,
  payout: Landmark,
}
const crsIcon: Record<string, typeof Bot> = {
  "crs-identity": Fingerprint,
  "crs-credit": ScrollText,
  "crs-records": ScrollText,
  "crs-sanctions": ShieldCheck,
  "crs-filings": Landmark,
}

type Shown = NodeStatus | "checking" | "waiting"

const tone: Record<Shown, { ring: string; orb: string; text: string; edge: string }> = {
  pass: { ring: "ring-leaf/60 shadow-[0_0_28px_-6px] shadow-leaf", orb: "bg-leaf text-background", text: "text-leaf", edge: "stroke-leaf" },
  review: { ring: "ring-warning/60 shadow-[0_0_28px_-6px] shadow-warning", orb: "bg-warning text-background", text: "text-warning", edge: "stroke-warning" },
  fail: { ring: "ring-destructive/70 shadow-[0_0_30px_-6px] shadow-destructive", orb: "bg-destructive text-background", text: "text-destructive", edge: "stroke-destructive" },
  active: { ring: "ring-sun/60 shadow-[0_0_28px_-6px] shadow-sun", orb: "bg-sun text-background", text: "text-sun", edge: "stroke-sun" },
  checking: { ring: "ring-sky/60 shadow-[0_0_24px_-6px] shadow-sky", orb: "bg-sky/30 text-sky", text: "text-sky", edge: "stroke-sky" },
  pending: { ring: "ring-border", orb: "bg-muted text-muted-foreground", text: "text-muted-foreground", edge: "stroke-border" },
  waiting: { ring: "ring-border/40", orb: "bg-muted/50 text-muted-foreground/50", text: "text-muted-foreground/60", edge: "stroke-border/40" },
}

const statusWord: Record<Shown, string> = {
  pass: "clean",
  review: "review",
  fail: "flagged",
  active: "in progress",
  checking: "checking…",
  pending: "not yet",
  waiting: "",
}

function layout(nodes: GraphNode[]) {
  const pos = new Map<string, { x: number; y: number }>()
  for (let c = 0; c < COLUMNS.length; c++) {
    const col = nodes.filter(n => n.col === c)
    const gap = col.length > 3 ? 108 : 150
    col.forEach((n, i) => pos.set(n.id, { x: colX(c), y: VH / 2 + 20 + (i - (col.length - 1) / 2) * gap }))
  }
  return pos
}

function edgePath(a: { x: number; y: number }, b: { x: number; y: number }) {
  const x1 = a.x + NODE_W / 2 - 6
  const x2 = b.x - NODE_W / 2 + 6
  const mx = (x1 + x2) / 2
  return `M ${x1} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${x2} ${b.y}`
}

const noopSubscribe = () => () => {}

export function VerificationTheater({ invoiceId }: { invoiceId: string }) {
  // Portal to <body> so the page-transition transform can't trap this fixed overlay.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false)
  const live = useLive()
  const router = useRouter()
  const inv = live.invoices.find(i => String(i.id) === invoiceId)
  const graph = useMemo(() => (inv ? verificationGraph(live, inv) : null), [live, inv])
  const pos = useMemo(() => (graph ? layout(graph.nodes) : new Map()), [graph])
  const [step, setStep] = useState(-1)
  const [run, setRun] = useState(0)
  const done = step >= COLUMNS.length

  // Reveal one column at a time; each column spends a beat "checking" before it resolves.
  useEffect(() => {
    if (!graph) return
    let s = -1
    const t = setInterval(() => {
      s += 1
      setStep(s)
      if (s >= COLUMNS.length) clearInterval(t)
    }, 900)
    return () => clearInterval(t)
  }, [run, graph])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && router.push(`/envelope/${invoiceId}`)
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [router, invoiceId])

  const shown = (n: GraphNode): Shown => (n.col < step ? n.status : n.col === step ? (n.status === "pending" ? "pending" : "checking") : "waiting")

  const stats = graph
    ? {
        clean: graph.nodes.filter(n => n.status === "pass").length,
        flagged: graph.nodes.filter(n => n.status === "fail" || n.status === "review").length,
        total: graph.nodes.length,
      }
    : null
  const approved = graph?.nodes.filter(n => n.kind === "person" && n.status === "pass") ?? []
  const lastApproval = approved.map(n => n.at).filter(Boolean).sort((a, b) => (a!.microsSinceUnixEpoch > b!.microsSinceUnixEpoch ? -1 : 1))[0]
  const settledIn =
    lastApproval && graph?.payment?.state === "CONFIRMED"
      ? Math.max(1, Math.round((toDate(graph.payment.updatedAt).getTime() - toDate(lastApproval).getTime()) / 1000))
      : null
  const allClear = !!stats && stats.flagged === 0 && graph?.payment?.state === "CONFIRMED"

  if (!mounted) return null
  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="dark fixed inset-0 z-[60] flex flex-col overflow-hidden bg-background text-foreground"
    >
      {/* dark backdrop */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(70rem_40rem_at_50%_-10%,color-mix(in_oklch,var(--primary)_22%,transparent),transparent_60%),radial-gradient(40rem_30rem_at_100%_100%,color-mix(in_oklch,var(--sun)_12%,transparent),transparent_60%),radial-gradient(40rem_30rem_at_0%_90%,color-mix(in_oklch,var(--sky)_16%,transparent),transparent_60%)]" />
        <TextureOverlay texture="dots" opacity={0.18} />
      </div>

      <header className="relative z-10 flex flex-wrap items-center gap-4 px-6 pt-5 md:px-10">
        <div className="grid size-10 place-items-center rounded-2xl bg-primary/15 text-primary">
          <ShieldCheck className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-medium tracking-[0.2em] text-muted-foreground uppercase">Verification</p>
          <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">
            {inv ? (
              <>
                {kindLabel[inv.kind]} #{String(inv.id)} · {fmtUsdc(inv.amount)}
              </>
            ) : (
              "Bill not visible"
            )}
          </h1>
          {inv ? (
            <p className="text-xs text-muted-foreground">
              {titleCase(orgName(live, inv.payerOrgId))} → {titleCase(orgName(live, inv.payeeOrgId))}
            </p>
          ) : null}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => {
              setStep(-1)
              setRun(r => r + 1)
            }}
            className="glass inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm hover:text-primary"
          >
            <RotateCcw className="size-4" /> Replay
          </button>
          <Link href={`/envelope/${invoiceId}`} className="glass grid size-9 place-items-center rounded-full hover:text-primary" aria-label="Close">
            <X className="size-4" />
          </Link>
        </div>
      </header>

      {!graph ? (
        <div className="relative z-10 grid flex-1 place-items-center text-sm text-muted-foreground">
          {live.ready ? "This bill isn't visible to the person you're signed in as." : "Connecting…"}
        </div>
      ) : (
        <div className="relative z-10 flex-1 overflow-x-auto">
          <div className="relative mx-auto min-w-[1180px]" style={{ aspectRatio: `${VW} / ${VH}`, maxHeight: "calc(100svh - 170px)", maxWidth: "min(100%, 1680px)" }}>
            <svg viewBox={`0 0 ${VW} ${VH}`} className="absolute inset-0 h-full w-full">
              {/* column headers */}
              {COLUMNS.map((c, i) => (
                <g key={c}>
                  <text x={colX(i)} y={46} textAnchor="middle" className={cn("text-[13px] font-medium tracking-wide uppercase transition-colors", i <= step ? "fill-foreground" : "fill-muted-foreground/40")}>
                    {c}
                  </text>
                  <line x1={colX(i)} y1={62} x2={colX(i)} y2={VH - 24} className="stroke-border/30" strokeDasharray="2 8" />
                </g>
              ))}
              {graph.edges.map(e => {
                const a = pos.get(e.from)
                const b = pos.get(e.to)
                const to = graph.nodes.find(n => n.id === e.to)!
                if (!a || !b) return null
                const d = edgePath(a, b)
                const lit = to.col < step
                const s = lit ? to.status : "waiting"
                return (
                  <g key={`${e.from}-${e.to}`}>
                    <path d={d} fill="none" strokeWidth={1.5} className="stroke-border/40" strokeDasharray="3 6" />
                    {lit ? (
                      <motion.path
                        d={d}
                        fill="none"
                        strokeWidth={2.2}
                        strokeLinecap="round"
                        className={tone[s].edge}
                        initial={{ pathLength: 0, opacity: 0 }}
                        animate={{ pathLength: 1, opacity: 1 }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                      />
                    ) : null}
                    {lit && (s === "pass" || s === "active") ? (
                      <circle r={3.2} className={s === "pass" ? "fill-leaf" : "fill-sun"} style={{ filter: "drop-shadow(0 0 5px currentColor)" }}>
                        <animateMotion dur="2.4s" repeatCount="indefinite" path={d} />
                      </circle>
                    ) : null}
                  </g>
                )
              })}
            </svg>

            {graph.nodes.map(n => {
              const p = pos.get(n.id)!
              const s = shown(n)
              const Icon = n.kind === "crs" ? (crsIcon[n.id] ?? Fingerprint) : kindIcon[n.kind]
              return (
                <motion.div
                  key={n.id}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${(p.x / VW) * 100}%`, top: `${(p.y / VH) * 100}%`, width: `${(NODE_W / VW) * 100}%` }}
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: s === "waiting" ? 0.45 : 1, scale: 1 }}
                  transition={{ type: "spring", stiffness: 220, damping: 20 }}
                >
                  <div className={cn("glass relative flex items-center gap-2.5 rounded-2xl px-3 py-2.5 ring-1 transition-shadow duration-500", tone[s].ring)}>
                    <span className={cn("relative grid size-8 shrink-0 place-items-center rounded-full transition-colors duration-500", tone[s].orb)}>
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.span key={s} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }}>
                          {s === "checking" ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : s === "pass" ? (
                            <Check className="size-4" strokeWidth={3} />
                          ) : s === "fail" ? (
                            n.kind === "payout" ? <Snowflake className="size-4" /> : <ShieldAlert className="size-4" />
                          ) : (
                            <Icon className="size-4" />
                          )}
                        </motion.span>
                      </AnimatePresence>
                      {s === "pass" ? (
                        <motion.span
                          key={`burst-${run}`}
                          className="absolute inset-0 rounded-full ring-2 ring-leaf"
                          initial={{ scale: 1, opacity: 0.9 }}
                          animate={{ scale: 2.1, opacity: 0 }}
                          transition={{ duration: 0.8 }}
                        />
                      ) : null}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold">{n.label}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{s === "waiting" ? "" : n.detail}</span>
                    </span>
                    {s !== "waiting" ? <span className={cn("absolute -top-2 right-3 rounded-full bg-background px-1.5 text-[9px] font-semibold tracking-wider uppercase", tone[s].text)}>{statusWord[s]}</span> : null}
                  </div>
                </motion.div>
              )
            })}
          </div>
        </div>
      )}

      {stats ? (
        <footer className="relative z-10 px-6 pb-6 md:px-10">
          <AnimatePresence>
            {done ? (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "glass mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-x-6 gap-y-2 rounded-full px-6 py-3 text-sm",
                  allClear ? "ring-1 ring-leaf/50" : stats.flagged ? "ring-1 ring-destructive/50" : ""
                )}
              >
                <span className={cn("inline-flex items-center gap-2 font-semibold", allClear ? "text-leaf" : stats.flagged ? "text-destructive" : "text-sun")}>
                  {allClear ? <ShieldCheck className="size-4" /> : stats.flagged ? <ShieldAlert className="size-4" /> : <Zap className="size-4" />}
                  {allClear ? "All clear · paid" : stats.flagged ? `${stats.flagged} check${stats.flagged === 1 ? "" : "s"} flagged` : "Checks in progress"}
                </span>
                <span className="text-muted-foreground">
                  {stats.clean}/{stats.total} clean
                </span>
                {settledIn ? <span className="text-muted-foreground">settled {settledIn}s after the 2nd approval</span> : null}
                <span className="text-xs text-muted-foreground">CRS sandbox · attestation hashes only, no raw identity data</span>
              </motion.div>
            ) : (
              <motion.p key="running" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center text-xs tracking-[0.2em] text-muted-foreground uppercase">
                running security checks…
              </motion.p>
            )}
          </AnimatePresence>
        </footer>
      ) : null}
    </motion.div>,
    document.body
  )
}
