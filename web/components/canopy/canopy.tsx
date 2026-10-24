"use client"

/**
 * The flow scene: the whole payment chain as one picture. Agency, prime and sub are glowing nodes; each contract is a line between them; light pulses travel the line while USDC moves; solid dots mark paid work and hollow dots billed work; a frozen bill turns its line red; each AI agent orbits the organization it works for, faster while it's working.
 *
 * Inputs:
 * - Live organizations, contracts, invoices, mandates and agent actions (whatever the signed-in persona may see)
 *
 * Outputs:
 * - A responsive SVG + glass-pod scene; pods link to their rooms, vine labels to the bills board
 */

import Link from "next/link"
import { Building2, HardHat, Landmark, Snowflake } from "lucide-react"
import { motion } from "motion/react"
import { useLive, type Live } from "@/components/app/providers"
import { RollingNumber } from "@/components/ui/rolling-number"
import { agentsOf, chainOrgs, contractTotals } from "@/lib/domain"
import { kindLabel, orgHue, titleCase } from "@/lib/format"
import { useNow } from "@/lib/use-now"
import { describeAgentStep } from "@/lib/describe"
import { cn } from "@/lib/utils"

const W = 1000
const H = 520
const POD_Y = 300
const POD_R = 78
const PODS = { AGENCY: 170, PRIME: 500, SUB: 830 } as const
const icons = { AGENCY: Landmark, PRIME: Building2, SUB: HardHat } as const
const rooms = { AGENCY: "/agency", PRIME: "/prime", SUB: "/sub" } as const

type Pt = { x: number; y: number }

// An arching vine from one pod to the next.
function vine(x1: number, x2: number) {
  // Starts at one node's upper edge and arcs over to the next.
  const a: Pt = { x: x1 + POD_R * 0.72, y: POD_Y - POD_R * 0.72 }
  const d: Pt = { x: x2 - POD_R * 0.72, y: POD_Y - POD_R * 0.72 }
  const span = d.x - a.x
  const b: Pt = { x: a.x + span * 0.22, y: POD_Y - 205 }
  const c: Pt = { x: d.x - span * 0.22, y: POD_Y - 205 }
  return { a, b, c, d, path: `M ${a.x} ${a.y} C ${b.x} ${b.y}, ${c.x} ${c.y}, ${d.x} ${d.y}` }
}

function bezier(v: ReturnType<typeof vine>, t: number): Pt & { angle: number } {
  const u = 1 - t
  const x = u ** 3 * v.a.x + 3 * u ** 2 * t * v.b.x + 3 * u * t ** 2 * v.c.x + t ** 3 * v.d.x
  const y = u ** 3 * v.a.y + 3 * u ** 2 * t * v.b.y + 3 * u * t ** 2 * v.c.y + t ** 3 * v.d.y
  const dx = 3 * u ** 2 * (v.b.x - v.a.x) + 6 * u * t * (v.c.x - v.b.x) + 3 * t ** 2 * (v.d.x - v.c.x)
  const dy = 3 * u ** 2 * (v.b.y - v.a.y) + 6 * u * t * (v.c.y - v.b.y) + 3 * t ** 2 * (v.d.y - v.c.y)
  return { x, y, angle: (Math.atan2(dy, dx) * 180) / Math.PI }
}

function Vine({ from, to, contractId, live }: { from: number; to: number; contractId?: bigint; live: Live }) {
  const v = vine(from, to)
  const t = contractId !== undefined ? contractTotals(live, contractId) : null
  const paidShare = t && t.total ? Number((t.paid * 1000n) / t.total) / 1000 : 0
  const billedShare = t && t.total ? Number((t.billed * 1000n) / t.total) / 1000 : 0
  // At least a few dots once anything is paid, so small payments still read as progress.
  const paidDots = paidShare > 0 ? Math.max(3, Math.round(paidShare * 14)) : 0
  const billedDots = Math.round(billedShare * 14)
  const frozen = !!t?.frozen
  const moving = !!t?.moving
  const apex = bezier(v, 0.5)
  return (
    <g>
      {/* contract line */}
      <path d={v.path} fill="none" strokeWidth={7} strokeLinecap="round" className={cn(frozen ? "stroke-destructive/25" : "stroke-leaf/25")} />
      <path d={v.path} fill="none" strokeWidth={2.2} strokeLinecap="round" className={cn(frozen ? "stroke-destructive" : "stroke-primary/70")} />
      {/* solid dots: work paid; hollow dots: billed, not yet paid */}
      {Array.from({ length: Math.max(paidDots, billedDots) }, (_, i) => {
        const p = bezier(v, 0.1 + (i / 13) * 0.8)
        const paidDot = i < paidDots
        return (
          <motion.circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={paidDot ? 4.5 : 4}
            className={paidDot ? "fill-leaf stroke-background" : "fill-background stroke-sun"}
            strokeWidth={paidDot ? 1.5 : 2}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.3 + i * 0.05, type: "spring", stiffness: 260, damping: 16 }}
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
          />
        )
      })}
      {/* light seeds while money moves */}
      {!frozen && (moving ? [0, 0.6, 1.2] : paidShare > 0 ? [0] : []).map(delay => (
        <circle key={delay} r={moving ? 5 : 3.5} className="fill-sun" style={{ filter: "drop-shadow(0 0 6px var(--sun))" }}>
          <animateMotion dur={moving ? "1.8s" : "5s"} begin={`${delay}s`} repeatCount="indefinite" path={v.path} />
        </circle>
      ))}
      {frozen ? (
        <g transform={`translate(${apex.x} ${apex.y + 2})`}>
          <circle r={16} className="fill-destructive" />
          <Snowflake x={-9} y={-9} width={18} height={18} className="text-background" />
        </g>
      ) : null}
      {t?.contract ? (
        <foreignObject x={apex.x - 110} y={apex.y - (frozen ? 74 : 62)} width={220} height={52}>
          <Link href="/bills" className="glass mx-auto flex w-fit max-w-[220px] flex-col items-center rounded-2xl px-3 py-1.5 text-center">
            <span className="max-w-[200px] truncate text-[11px] font-semibold">{t.contract.title}</span>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {(Number(t.paid) / 1e6).toFixed(2)} of {(Number(t.total) / 1e6).toFixed(2)} USDC paid
            </span>
          </Link>
        </foreignObject>
      ) : null}
    </g>
  )
}

function Orbits({ live, now }: { live: Live; now: number }) {
  const { agency, prime, sub } = chainOrgs(live)
  const xOf = (orgId: bigint) =>
    orgId === agency?.id ? PODS.AGENCY : orgId === prime?.id ? PODS.PRIME : orgId === sub?.id ? PODS.SUB : null
  const hueOf = (orgId: bigint) =>
    orgId === agency?.id ? "var(--sky)" : orgId === prime?.id ? "var(--leaf)" : "var(--bloom)"
  const agents = agentsOf(live, now)
  return (
    <>
      {agents.map((a, i) => {
        const x = xOf(a.orgId)
        if (x === null) return null
        const r = POD_R + 26
        const startAngle = (i * 137) % 360
        return (
          <g key={`${a.agentId}:${a.orgId}`}>
            <circle cx={x} cy={POD_Y} r={r} fill="none" strokeDasharray="1 7" strokeLinecap="round" stroke={hueOf(a.orgId)} strokeOpacity={0.55} strokeWidth={1.6} />
            <g
              className="orbit"
              style={{
                transformBox: "view-box",
                transformOrigin: `${x}px ${POD_Y}px`,
                ["--orbit-duration" as string]: a.active ? "5s" : "26s",
                rotate: `${startAngle}deg`,
              }}
            >
              <g transform={`translate(${x + r} ${POD_Y})`}>
                {a.active ? <circle r={15} className="fill-sun/40 solar-breathe" /> : null}
                <circle r={10} stroke={hueOf(a.orgId)} className={a.active ? "fill-sun" : "fill-background"} strokeWidth={2} />
                <text textAnchor="middle" dy="3.5" className="fill-foreground text-[9px] font-semibold">
                  {a.label[0]}
                </text>
                <title>{`${a.label}${a.lastAction ? ` · ${describeAgentStep(a.lastAction.step, a.lastAction.status, a.lastAction.detail).title}` : ""}`}</title>
              </g>
            </g>
          </g>
        )
      })}
    </>
  )
}

function Pod({ org, live, x }: { org?: Live["organizations"][number]; live: Live; x: number }) {
  if (!org) return null
  const kind = org.kind as keyof typeof icons
  const Icon = icons[kind] ?? Building2
  const received = live.invoices.filter(i => i.payeeOrgId === org.id && i.state === "SETTLED").reduce((s, i) => s + i.amount, 0n)
  const paid = live.invoices.filter(i => i.payerOrgId === org.id && i.state === "SETTLED").reduce((s, i) => s + i.amount, 0n)
  const frozen = live.invoices.some(i => (i.payeeOrgId === org.id || i.payerOrgId === org.id) && i.state === "PAYMENT_FROZEN")
  const amount = kind === "AGENCY" ? paid : received
  return (
    <motion.div
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 160, damping: 16, delay: kind === "AGENCY" ? 0 : kind === "PRIME" ? 0.12 : 0.24 }}
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${(x / W) * 100}%`, top: `${(POD_Y / H) * 100}%`, width: `${((POD_R * 2) / W) * 100}%` }}
    >
      <Link
        href={rooms[kind]}
        className={cn(
          "glass group relative flex aspect-square w-full flex-col items-center justify-center rounded-full p-3 text-center transition-transform hover:scale-[1.04]",
          frozen && "ring-2 ring-destructive/60"
        )}
      >
        <span
          aria-hidden
          className="absolute inset-2 rounded-full"
          style={{ background: `radial-gradient(circle at 30% 25%, color-mix(in oklch, ${orgHue[kind]?.varName ?? "var(--sun)"} 55%, transparent), transparent 62%)` }}
        />
        <span aria-hidden className={cn("absolute -inset-3 -z-10 rounded-full opacity-60 blur-2xl", orgHue[kind]?.soft)} />
        <Icon className={cn("relative size-5", orgHue[kind]?.text)} />
        <span className="relative mt-1 text-[9px] font-medium tracking-wider text-muted-foreground uppercase md:text-[10px]">{kindLabel[kind]}</span>
        <span className="relative line-clamp-2 font-display text-[11px] leading-tight font-semibold md:text-sm">{titleCase(org.name)}</span>
        <span className="relative mt-1 text-[10px] text-muted-foreground tabular-nums md:text-xs">
          <RollingNumber precision={2} value={Number(amount) / 1e6} format={n => n.toFixed(2)} /> {kind === "AGENCY" ? "paid out" : "received"}
        </span>
        {org.verified ? <span className="relative mt-1 rounded-full bg-success/15 px-1.5 text-[9px] font-medium text-success">CRS ✓</span> : null}
      </Link>
    </motion.div>
  )
}

export function Canopy() {
  const live = useLive()
  const now = useNow(2000)
  const { agency, prime, sub } = chainOrgs(live)
  const primeContract = live.contracts.find(c => c.kind === "PRIME_CONTRACT")
  const subContract = live.contracts.find(c => c.kind === "SUBCONTRACT")
  return (
    <div className="relative w-full" style={{ aspectRatio: `${W} / ${H}` }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full overflow-visible">
        {/* soft ground line */}
        <path d={`M 40 ${POD_Y + 120} C 300 ${POD_Y + 95}, 700 ${POD_Y + 145}, 960 ${POD_Y + 115}`} fill="none" className="stroke-primary/15" strokeWidth={1.5} />
        {agency && prime ? <Vine from={PODS.AGENCY} to={PODS.PRIME} contractId={primeContract?.id} live={live} /> : null}
        {prime && sub ? <Vine from={PODS.PRIME} to={PODS.SUB} contractId={subContract?.id} live={live} /> : null}
        <Orbits live={live} now={now} />
      </svg>
      <Pod org={agency} live={live} x={PODS.AGENCY} />
      <Pod org={prime} live={live} x={PODS.PRIME} />
      <Pod org={sub} live={live} x={PODS.SUB} />
    </div>
  )
}

export function CanopyLegend() {
  const items = [
    { swatch: <span className="size-2.5 rounded-full bg-sun shadow-[0_0_8px] shadow-sun" />, text: "USDC moving" },
    { swatch: <span className="size-2.5 rounded-full bg-leaf" />, text: "Paid" },
    { swatch: <span className="size-2.5 rounded-full border-2 border-sun bg-background" />, text: "Billed" },
    { swatch: <span className="size-2.5 rounded-full border border-primary bg-background" />, text: "AI agent" },
    { swatch: <Snowflake className="size-3 text-destructive" />, text: "Frozen" },
  ]
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
      {items.map(i => (
        <span key={i.text} className="inline-flex items-center gap-1.5">
          {i.swatch}
          {i.text}
        </span>
      ))}
    </div>
  )
}
