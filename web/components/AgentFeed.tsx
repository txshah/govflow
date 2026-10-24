"use client"

/**
 * Live stream of what agents and people are doing, newest first: agent steps (match, verify, draft), decisions, freezes and payouts.
 *
 * Inputs:
 * - Visible agentAction and auditEvent rows; optional limit; optional `agentsOnly`
 *
 * Outputs:
 * - A scrolling feed; bill events link to the payment envelope
 */

import Link from "next/link"
import { Bot, User } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { cn } from "@/lib/utils"
import { useLive } from "@/components/app/providers"
import { activityStream } from "@/lib/domain"
import { timeAgo } from "@/lib/format"
import { useNow } from "@/lib/use-now"
import { Empty } from "@/components/app/page-header"

const dot = { neutral: "bg-muted-foreground/40", success: "bg-success", warning: "bg-warning", danger: "bg-destructive" }

export function AgentFeed({ limit = 30, agentsOnly = false, className }: { limit?: number; agentsOnly?: boolean; className?: string }) {
  const live = useLive()
  const now = useNow()
  const items = activityStream(live, limit * 2)
    .filter(a => !agentsOnly || a.agent)
    .slice(0, limit)
  if (!items.length) return <Empty>No activity yet.</Empty>
  return (
    <ol className={cn("space-y-0.5", className)}>
      <AnimatePresence initial={false}>
        {items.map(a => {
          const href = a.subject?.type === "invoice" ? `/envelope/${a.subject.id}` : undefined
          const body = (
            <div className="flex gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60">
              <span className="relative mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-muted">
                {a.agent ? <Bot className="size-3.5" /> : <User className="size-3.5" />}
                <span className={cn("absolute -right-0.5 -bottom-0.5 size-2 rounded-full ring-2 ring-card", dot[a.tone])} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{a.what}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {a.who}
                  {a.detail ? ` · ${a.detail}` : ""}
                </p>
              </div>
              <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">{timeAgo(a.at, now)}</span>
            </div>
          )
          return (
            <motion.li key={a.id} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {href ? <Link href={href}>{body}</Link> : body}
            </motion.li>
          )
        })}
      </AnimatePresence>
    </ol>
  )
}
