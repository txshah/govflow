"use client"

/**
 * Shared page building blocks: an animated serif page title (Cult UI text-animate), frosted-glass sections, stat tiles, and the empty state.
 *
 * Inputs:
 * - title/eyebrow/description/actions; section title/description; tile label/value/hint/tone
 *
 * Outputs:
 * - PageHeader, Section, StatTile, Empty
 */

import type { ReactNode } from "react"
import { Inbox } from "lucide-react"
import { TextAnimate } from "@/components/ui/text-animate"
import { cn } from "@/lib/utils"

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
}: {
  title: ReactNode
  description?: ReactNode
  eyebrow?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? (
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-secondary/70 px-2.5 py-0.5 text-[11px] font-medium tracking-wide text-secondary-foreground uppercase">
            {eyebrow}
          </div>
        ) : null}
        {typeof title === "string" ? (
          <TextAnimate
            text={title}
            type="calmInUp"
            aria-label={title}
            className="font-display text-4xl leading-tight font-semibold tracking-tight md:text-5xl"
          />
        ) : (
          <h1 className="font-display text-4xl leading-tight font-semibold tracking-tight md:text-5xl">{title}</h1>
        )}
        {description ? <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function StatTile({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "danger" | "success" }) {
  return (
    <div className="glass relative overflow-hidden rounded-3xl p-5">
      <div
        aria-hidden
        className={cn(
          "absolute -top-10 -right-10 size-28 rounded-full blur-2xl",
          tone === "danger" ? "bg-destructive/25" : tone === "success" ? "bg-leaf/35" : "bg-sun/35"
        )}
      />
      <p className="relative text-xs font-medium text-muted-foreground">{label}</p>
      <div
        className={cn(
          "relative mt-1 font-display text-3xl font-semibold tabular-nums tracking-tight",
          tone === "danger" && "text-destructive",
          tone === "success" && "text-success"
        )}
      >
        {value}
      </div>
      {hint ? <p className="relative mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

export function Section({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn("glass rounded-[1.75rem]", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-5 pb-3">
        <div>
          <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
          {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
        </div>
        {actions}
      </div>
      <div className="px-6 pb-6">{children}</div>
    </section>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
      <Inbox className="size-5 text-muted-foreground/70" />
      {children}
    </div>
  )
}
