/**
 * Shows a person's or organization's CRS result: verified with its attestation hash, needs review, failed, or not checked. Always labeled "CRS sandbox".
 *
 * Inputs:
 * - verified flag and identityHash (from a member or organization row), optional latest decision + reasons
 *
 * Outputs:
 * - A chip with a tooltip carrying the short hash and reasons
 */

import { ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Pill } from "@/components/StatusBadge"
import { short } from "@/lib/format"

export function VerificationBadge({
  verified,
  hash,
  decision,
  reasons,
}: {
  verified: boolean
  hash?: string
  decision?: string
  reasons?: string
}) {
  const d = decision ?? (verified ? "PASS" : "")
  const view =
    d === "PASS"
      ? { tone: "success" as const, icon: ShieldCheck, text: "CRS verified" }
      : d === "REVIEW"
        ? { tone: "warning" as const, icon: ShieldQuestion, text: "CRS review" }
        : d === "FAIL"
          ? { tone: "danger" as const, icon: ShieldAlert, text: "CRS failed" }
          : { tone: "neutral" as const, icon: ShieldQuestion, text: "Not verified" }
  const Icon = view.icon
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>
          <Pill tone={view.tone}>
            <Icon className="size-3" />
            {view.text}
          </Pill>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p className="font-mono text-[11px]">hash {short(hash ?? "", 10, 6)}</p>
        {reasons ? <p className="mt-1 text-[11px]">{reasons.replaceAll(",", " · ")}</p> : null}
        <p className="mt-1 text-[11px] opacity-70">CRS sandbox · attestation only, no raw identity data</p>
      </TooltipContent>
    </Tooltip>
  )
}
