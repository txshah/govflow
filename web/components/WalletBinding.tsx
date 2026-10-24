/**
 * Payout wallet line for an organization: the verified wallet money goes to, when it was bound, and whether a change is pending.
 *
 * Inputs:
 * - organization row, pending beneficiary changes for its bills
 *
 * Outputs:
 * - A compact wallet row with a "change pending" warning
 */

import { Wallet } from "lucide-react"
import { Pill } from "@/components/StatusBadge"
import { short, timeAgo } from "@/lib/format"
import type { Live } from "@/components/app/providers"

export function WalletBinding({ org, pending }: { org: Live["organizations"][number]; pending: number }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Wallet className="size-4 text-muted-foreground" />
      {org.payoutWallet ? (
        <span className="font-mono text-xs" title={org.payoutWallet}>
          {short(org.payoutWallet, 6, 4)}
        </span>
      ) : (
        <span className="text-muted-foreground">No payout wallet</span>
      )}
      {org.walletBoundAt ? <span className="text-xs text-muted-foreground">bound {timeAgo(org.walletBoundAt)}</span> : null}
      {pending ? <Pill tone="danger">{pending} change pending</Pill> : null}
    </div>
  )
}
