/**
 * People as they'd appear in a real system: a person-outline avatar tinted by organization and a compact ID badge (name, title, organization, CRS-verified hash).
 *
 * Inputs:
 * - name, title, org kind/name, verified flag and attestation hash
 *
 * Outputs:
 * - Silhouette and IdBadge components
 */

import { ShieldCheck } from "lucide-react"
import { orgHue, short, titleCase } from "@/lib/format"
import { cn } from "@/lib/utils"

export function Silhouette({ kind, className }: { kind: string; className?: string }) {
  return (
    <span className={cn("grid shrink-0 place-items-center overflow-hidden rounded-full", orgHue[kind]?.soft ?? "bg-muted", className)}>
      <svg viewBox="0 0 40 40" className="h-full w-full" aria-hidden>
        <circle cx="20" cy="15" r="7" className={cn("fill-current", orgHue[kind]?.text)} opacity="0.85" />
        <path d="M6 40c1.5-9 7-13.5 14-13.5S32.5 31 34 40Z" className={cn("fill-current", orgHue[kind]?.text)} opacity="0.85" />
      </svg>
    </span>
  )
}

export function IdBadge({
  name,
  title,
  kind,
  orgName,
  verified,
  hash,
}: {
  name: string
  title?: string
  kind: string
  orgName?: string
  verified?: boolean
  hash?: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-background p-3">
      <Silhouette kind={kind} className="size-14" />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate font-semibold">{titleCase(name)}</p>
        {title ? <p className="truncate text-xs text-muted-foreground">{title}</p> : null}
        {orgName ? <p className="truncate text-xs text-muted-foreground">{titleCase(orgName)}</p> : null}
        <p className={cn("mt-1 flex items-center gap-1 text-[11px]", verified ? "text-leaf" : "text-muted-foreground")}>
          <ShieldCheck className="size-3" /> {verified ? `CRS verified · ${short(hash ?? "", 4, 4)}` : "Not verified"}
        </p>
      </div>
    </div>
  )
}
