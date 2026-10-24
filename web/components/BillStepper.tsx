"use client"

/**
 * A bill's progress as six steps on a line (work accepted → submitted → agent check → CRS verified → 2 approvals → paid). Done steps turn green, the current one glows gold, a frozen one turns red.
 *
 * Inputs:
 * - The invoice row (+ live approvals); size compact | full
 *
 * Outputs:
 * - A horizontal stepper with labels in the full size
 */

import { Check, Snowflake } from "lucide-react"
import { motion } from "motion/react"
import { cn } from "@/lib/utils"
import { useLive, type Live } from "@/components/app/providers"
import { billStages } from "@/lib/domain"

export function BillStepper({ invoice, size = "compact" }: { invoice: Live["invoices"][number]; size?: "compact" | "full" }) {
  const live = useLive()
  const stages = billStages(live, invoice)
  const full = size === "full"
  const done = stages.filter(s => s.status === "done").length
  return (
    <div className="relative w-full">
      {/* track */}
      <div className={cn("absolute right-[8%] left-[8%] h-0.5 rounded-full bg-border", full ? "top-3.5" : "top-2")} />
      <motion.div
        className={cn("absolute left-[8%] h-0.5 rounded-full bg-gradient-to-r from-leaf to-primary", full ? "top-3.5" : "top-2")}
        initial={{ width: 0 }}
        animate={{ width: `${(Math.max(0, done - 1) / (stages.length - 1)) * 84}%` }}
        transition={{ type: "spring", stiffness: 70, damping: 18 }}
      />
      <ol className="relative grid grid-cols-6">
        {stages.map((st, i) => (
          <li key={st.key} className="flex flex-col items-center gap-1.5 text-center">
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: i * 0.05, type: "spring", stiffness: 300, damping: 16 }}
              className={cn(
                "relative grid place-items-center rounded-full",
                full ? "size-7" : "size-4",
                st.status === "done" && "bg-leaf text-background",
                st.status === "current" && "bg-sun text-foreground",
                st.status === "blocked" && "bg-destructive text-background",
                st.status === "pending" && "border border-border bg-background"
              )}
            >
              {st.status === "done" ? (
                <Check className={full ? "size-4" : "size-2.5"} strokeWidth={3} />
              ) : st.status === "blocked" ? (
                <Snowflake className={full ? "size-4" : "size-2.5"} />
              ) : st.status === "current" ? (
                <motion.span
                  className={cn("rounded-full bg-foreground/70", full ? "size-2" : "size-1")}
                  animate={{ scale: [1, 1.6, 1], opacity: [0.8, 0.3, 0.8] }}
                  transition={{ duration: 1.6, repeat: Infinity }}
                />
              ) : null}
            </motion.span>
            {full ? (
              <span className="px-1">
                <span className={cn("block text-xs font-medium", st.status === "pending" && "text-muted-foreground")}>{st.label}</span>
                {st.detail ? <span className="block text-[11px] text-muted-foreground">{st.detail}</span> : null}
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  )
}
