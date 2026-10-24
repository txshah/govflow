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
import { useEmbed } from "@/lib/url-flags"

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  meta,
}: {
  title: ReactNode
  description?: ReactNode
  eyebrow?: ReactNode
  actions?: ReactNode
  /** Small facts shown in a row under the description (verification, wallet, …). */
  meta?: ReactNode
}) {
  const embed = useEmbed()
  if (embed)
    return (
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {meta}
        {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
      </div>
    )
  return (
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? (
          <div className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">{eyebrow}</div>
        ) : null}
        {typeof title === "string" ? (
          <TextAnimate
            text={title}
            type="calmInUp"
            aria-label={title}
            className="text-2xl leading-tight font-semibold tracking-tight md:text-3xl"
          />
        ) : (
          <h1 className="text-2xl leading-tight font-semibold tracking-tight md:text-3xl">{title}</h1>
        )}
        {description ? <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p> : null}
        {meta ? <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">{meta}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 md:pt-8">{actions}</div> : null}
    </div>
  )
}

export function StatTile({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "danger" | "success" }) {
  const embed = useEmbed()
  if (embed)
    return (
      <div className="glass rounded-2xl px-3 py-2">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <div className={cn("text-lg font-semibold tabular-nums", tone === "danger" && "text-destructive", tone === "success" && "text-success")}>{value}</div>
      </div>
    )
  return (
    <div className="glass relative overflow-hidden rounded-xl p-5">
      <p className="relative text-xs font-medium text-muted-foreground">{label}</p>
      <div
        className={cn(
          "relative mt-1 text-2xl font-semibold tabular-nums tracking-tight",
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
    <section className={cn("glass rounded-xl", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-5 pb-3">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
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
