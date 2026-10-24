/**
 * Small colored chip for any bill or milestone state, in plain language.
 *
 * Inputs:
 * - state string and which machine it belongs to (invoice | milestone)
 *
 * Outputs:
 * - A tone-colored pill ("Awaiting approval", "Frozen", "Paid", …)
 */

import { cn } from "@/lib/utils"
import { invoiceStateLabel, milestoneStateLabel, type Tone } from "@/lib/format"

const toneClass: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-info/10 text-info",
  success: "bg-success/12 text-success",
  warning: "bg-warning/15 text-warning",
  danger: "bg-destructive/10 text-destructive",
}

export function Pill({ tone = "neutral", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", toneClass[tone], className)}>
      {children}
    </span>
  )
}

export function StatusBadge({ state, machine = "invoice" }: { state: string; machine?: "invoice" | "milestone" }) {
  const map = machine === "invoice" ? invoiceStateLabel : milestoneStateLabel
  const { label, tone } = map[state] ?? { label: state, tone: "neutral" as Tone }
  return <Pill tone={tone}>{label}</Pill>
}
