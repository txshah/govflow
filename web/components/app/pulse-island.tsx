"use client"

/**
 * The live "pulse": a floating island at the top that always shows the newest event (an agent step, an approval, a freeze, a payout). Tap it and it morphs open into the recent stream. Replaces the old always-on activity column.
 *
 * Inputs:
 * - activityStream() over the signed-in persona's visible rows
 *
 * Outputs:
 * - A spring-animated island (morph pattern from Watermelon's scroll-island) linking bill events to their envelope
 */

import Link from "next/link"
import { useState } from "react"
import { AnimatePresence, motion, MotionConfig } from "motion/react"
import useMeasure from "react-use-measure"
import { Bot, Settings2, User } from "lucide-react"
import { cn } from "@/lib/utils"
import { useLive } from "@/components/app/providers"
import { activityStream } from "@/lib/domain"
import { timeAgo } from "@/lib/format"
import { useNow } from "@/lib/use-now"

const toneDot = { neutral: "bg-muted-foreground/50", success: "bg-success", warning: "bg-warning", danger: "bg-destructive" }

export function PulseIsland() {
  const live = useLive()
  const now = useNow(3000)
  const [open, setOpen] = useState(false)
  const [ref, bounds] = useMeasure()
  const items = activityStream(live, 10)
  const latest = items[0]

  return (
    <MotionConfig transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}>
      <div className="relative">
        <motion.div
          className="glass absolute top-0 left-1/2 z-40 -translate-x-1/2 overflow-hidden rounded-[1.4rem]"
          animate={{ width: open ? 420 : 300, height: bounds.height || "auto" }}
        >
          <div ref={ref}>
            <button
              onClick={() => setOpen(o => !o)}
              className="flex h-10 w-full items-center gap-2.5 px-3.5 text-left"
              aria-expanded={open}
              aria-label="Live activity"
            >
              <span className="relative flex size-2.5 shrink-0">
                <span className={cn("absolute inset-0 rounded-full", live.isActive ? "animate-ping bg-success/60" : "")} />
                <span className={cn("relative size-2.5 rounded-full", live.isActive ? "bg-success" : "bg-muted-foreground/40")} />
              </span>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={latest?.id ?? "none"}
                  initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
                  className="min-w-0 flex-1 truncate text-[13px]"
                >
                  {latest ? (
                    <>
                      <span className="font-medium">{latest.what}</span> <span className="text-muted-foreground">· {latest.who}</span>
                    </>
                  ) : live.isActive ? (
                    <span className="text-muted-foreground">Listening for activity…</span>
                  ) : (
                    <span className="text-muted-foreground">Connecting…</span>
                  )}
                </motion.span>
              </AnimatePresence>
              <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">{latest ? timeAgo(latest.at, now) : ""}</span>
            </button>
            <AnimatePresence initial={false}>
              {open ? (
                <motion.ol
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="max-h-[60vh] space-y-0.5 overflow-y-auto px-2 pb-2"
                >
                  {items.map((a, i) => {
                    const body = (
                      <motion.div
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className="flex items-start gap-2.5 rounded-xl px-2 py-1.5 hover:bg-muted/60"
                      >
                        <span className="relative mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-muted">
                          {a.agent ? <Bot className="size-3" /> : a.who === "Setup" ? <Settings2 className="size-3" /> : <User className="size-3" />}
                          <span className={cn("absolute -right-0.5 -bottom-0.5 size-2 rounded-full ring-2 ring-background", toneDot[a.tone])} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium">{a.what}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {a.who}
                            {a.detail ? ` · ${a.detail}` : ""}
                          </span>
                        </span>
                        <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">{timeAgo(a.at, now)}</span>
                      </motion.div>
                    )
                    return (
                      <li key={a.id}>
                        {a.subject?.type === "invoice" ? (
                          <Link href={`/envelope/${a.subject.id}`} onClick={() => setOpen(false)}>
                            {body}
                          </Link>
                        ) : (
                          body
                        )}
                      </li>
                    )
                  })}
                </motion.ol>
              ) : null}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </MotionConfig>
  )
}
