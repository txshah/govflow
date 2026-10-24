/**
 * Link to a transaction on sepolia.basescan.org, or a "simulated" tag when the payout adapter faked it.
 *
 * Inputs:
 * - txHash, simulated flag
 *
 * Outputs:
 * - Anchor with a shortened hash
 */

import { ArrowUpRight } from "lucide-react"
import { short } from "@/lib/format"

export function TxLink({ hash, simulated }: { hash: string; simulated?: boolean }) {
  if (!hash) return <span className="text-muted-foreground">—</span>
  if (simulated)
    return (
      <span className="font-mono text-xs text-muted-foreground" title={hash}>
        {short(hash, 8, 4)} · simulated
      </span>
    )
  return (
    <a
      href={`https://sepolia.basescan.org/tx/${hash}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-0.5 font-mono text-xs text-info hover:underline"
    >
      {short(hash, 8, 4)}
      <ArrowUpRight className="size-3" />
    </a>
  )
}
