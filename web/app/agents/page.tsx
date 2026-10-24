"use client"

/**
 * Agents: one card per AI agent — which org it serves, what its signed mandate lets it do, how much of its x402 budget it has spent (ring), what it's doing right now (Cult UI typewriter), and its recent steps and findings. The agent at work wears an animated border (Cult UI border-beam-card); the rest sit in halo glass (Cult UI halo-card).
 *
 * Inputs:
 * - Live mandates, agent actions and findings for the signed-in persona
 *
 * Outputs:
 * - Principles strip + agent cards with timelines
 */

import { Bot, Hand, ShieldCheck, Sparkles } from "lucide-react"
import { motion } from "motion/react"
import { useLive } from "@/components/app/providers"
import { Empty, PageHeader } from "@/components/app/page-header"
import { BorderBeamCard, BorderBeamCardContent } from "@/components/ui/border-beam-card"
import { HaloCard } from "@/components/ui/halo-card"
import { Typewriter } from "@/components/ui/typewriter"
import { agentsOf, orgName, type AgentInfo } from "@/lib/domain"
import { fmtUsdc, timeAgo, titleCase } from "@/lib/format"
import { describeAgentStep } from "@/lib/describe"
import { useNow } from "@/lib/use-now"
import type { Live } from "@/components/app/providers"

const scopeLabel: Record<string, string> = {
  summarize: "Summarize evidence",
  draft_invoice: "Draft bills",
  match: "Match bills to contract",
  verify: "Pay for CRS checks",
  risk_review: "Write fraud case files",
}

function GrowthRing({ spent, limit }: { spent: bigint; limit: bigint }) {
  const pct = limit ? Math.min(1, Number((spent * 1000n) / limit) / 1000) : 0
  const r = 26
  const c = 2 * Math.PI * r
  return (
    <div className="relative grid size-16 shrink-0 place-items-center">
      <svg viewBox="0 0 64 64" className="absolute inset-0 -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="5" className="stroke-muted" />
        <motion.circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          strokeWidth="5"
          strokeLinecap="round"
          className="stroke-sun"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - pct) }}
          transition={{ type: "spring", stiffness: 60, damping: 16 }}
        />
      </svg>
      <Bot className="size-5 text-primary" />
    </div>
  )
}

function AgentCard({ a, live, now }: { a: AgentInfo; live: Live; now: number }) {
  const steps = live.agentActions
    .filter(x => x.agentId === a.agentId && x.orgId === a.orgId)
    .sort((x, y) => (x.at.microsSinceUnixEpoch > y.at.microsSinceUnixEpoch ? -1 : 1))
  const findings = live.findings.filter(f => f.agentId === a.agentId && f.orgId === a.orgId).length
  const now0 = steps[0] ? describeAgentStep(steps[0].step, steps[0].status, steps[0].detail) : null
  const current = now0 ? `${now0.title}${now0.detail ? ` · ${now0.detail}` : ""}` : "Waiting for work"
  const body = (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <GrowthRing spent={a.spent} limit={a.limit} />
        <div className="min-w-0">
          <p className="font-display text-xl font-semibold tracking-tight">{a.label}</p>
          <p className="truncate text-xs text-muted-foreground">{titleCase(orgName(live, a.orgId))}</p>
          {a.scopes.includes("verify") ? (
            <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
              x402 {fmtUsdc(a.spent)} of {fmtUsdc(a.limit)}
            </p>
          ) : null}
        </div>
        {a.active ? <span className="ml-auto rounded-full bg-sun/30 px-2 py-0.5 text-[11px] font-medium">Working</span> : null}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {a.scopes.map(s => (
          <span key={s} className="inline-flex items-center gap-1 rounded-full bg-secondary/70 px-2 py-0.5 text-[11px] text-secondary-foreground">
            <span className="size-1.5 rounded-full bg-leaf" />
            {scopeLabel[s] ?? s}
          </span>
        ))}
      </div>
      <div className="min-h-10 rounded-2xl bg-muted/50 px-3 py-2 text-sm">
        {a.active ? <Typewriter key={current} delay={0} baseText={current} texts={[current]} /> : <span className="text-muted-foreground">{current}</span>}
      </div>
      {steps.length ? (
        <ol className="relative space-y-2 border-l border-border pl-4">
          {steps.slice(0, 4).map(s => (
            <li key={String(s.id)} className="relative text-xs">
              <span className="absolute top-1 -left-[21px] size-2 rounded-full bg-leaf ring-4 ring-card" />
              <span className="font-medium">{describeAgentStep(s.step, s.status, s.detail).title}</span>
              <span className="text-muted-foreground">{describeAgentStep(s.step, s.status, s.detail).detail ? ` · ${describeAgentStep(s.step, s.status, s.detail).detail}` : ""}</span>
              <span className="ml-1 text-[10px] text-muted-foreground">{timeAgo(s.at, now)}</span>
            </li>
          ))}
        </ol>
      ) : null}
      <p className="text-[11px] text-muted-foreground">{findings} finding{findings === 1 ? "" : "s"} recorded</p>
    </div>
  )
  return a.active ? (
    <BorderBeamCard beamSize="md" className="h-full" cardClassName="h-full">
      <BorderBeamCardContent>{body}</BorderBeamCardContent>
    </BorderBeamCard>
  ) : (
    <HaloCard aria-label={a.label} padding="lg" className="h-full [&>div]:h-full [&_[data-slot=halo-card-surface]]:h-full">
      {body}
    </HaloCard>
  )
}

const principles = [
  { icon: Sparkles, title: "Agents propose", text: "Summaries, matches and case files, each saved with its model and inputs." },
  { icon: Hand, title: "People decide", text: "Two verified humans approve every payment. Agents can't approve or pay." },
  { icon: ShieldCheck, title: "Mandates bound them", text: "A verified signer sets each agent's scope, budget and expiry." },
]

export default function AgentsPage() {
  const live = useLive()
  const now = useNow(2000)
  const agents = agentsOf(live, now)
  return (
    <>
      <PageHeader eyebrow="Agents" title="Agents" description="Each organization has an AI agent that prepares and checks bills within a mandate a verified signer gave it. Agents never approve or move money." />
      <div className="mb-8 grid gap-3 md:grid-cols-3">
        {principles.map((p, i) => (
          <motion.div
            key={p.title}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.08 }}
            className="flex gap-3 rounded-3xl bg-secondary/40 p-4"
          >
            <p.icon className="mt-0.5 size-5 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-semibold">{p.title}</p>
              <p className="text-xs text-muted-foreground">{p.text}</p>
            </div>
          </motion.div>
        ))}
      </div>
      {agents.length ? (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {agents.map((a, i) => (
            <motion.div key={`${a.agentId}:${a.orgId}`} className="h-full" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.07 }}>
              <AgentCard a={a} live={live} now={now} />
            </motion.div>
          ))}
        </div>
      ) : (
        <Empty>No agents visible to you yet.</Empty>
      )}
    </>
  )
}
