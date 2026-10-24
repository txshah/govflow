"use client"

/**
 * List of bills with who pays whom, amount, plain-language state, and the six-stage stepper; each row opens its payment envelope.
 *
 * Inputs:
 * - invoice rows (already filtered by the caller); optional `showActions`
 *
 * Outputs:
 * - Rows linking to /envelope/[id], with the ApprovalPanel inline when showActions is set
 */

import Link from "next/link"
import { Snowflake } from "lucide-react"
import { useLive, type Live } from "@/components/app/providers"
import { orgName } from "@/lib/domain"
import { fmtUsdc, freezeReasonLabel, kindLabel, timeAgo, titleCase } from "@/lib/format"
import { StatusBadge } from "@/components/StatusBadge"
import { BillStepper } from "@/components/BillStepper"
import { ApprovalPanel } from "@/components/ApprovalPanel"
import { Empty } from "@/components/app/page-header"

export function InvoiceTable({ invoices, showActions = false, empty = "No bills yet." }: { invoices: readonly Live["invoices"][number][]; showActions?: boolean; empty?: string }) {
  const live = useLive()
  if (!invoices.length) return <Empty>{empty}</Empty>
  const sorted = [...invoices].sort((a, b) => (a.id > b.id ? -1 : 1))
  return (
    <ul className="divide-y">
      {sorted.map(inv => (
        <li key={String(inv.id)} className="py-3 first:pt-0 last:pb-0">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.6fr)_auto] md:items-center">
            <Link href={`/envelope/${inv.id}`} className="min-w-0 hover:underline-offset-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">
                  {kindLabel[inv.kind]} #{String(inv.id)}
                </span>
                <StatusBadge state={inv.state} />
              </div>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {titleCase(orgName(live, inv.payerOrgId))} → {titleCase(orgName(live, inv.payeeOrgId))} · {timeAgo(inv.submittedAt ?? inv.createdAt)}
              </p>
              {inv.state === "PAYMENT_FROZEN" ? (
                <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
                  <Snowflake className="size-3" />
                  {freezeReasonLabel[inv.freezeReason] ?? inv.freezeReason}
                </p>
              ) : null}
            </Link>
            <BillStepper invoice={inv} />
            <div className="text-right text-sm font-semibold tabular-nums">{fmtUsdc(inv.amount)}</div>
          </div>
          {showActions ? (
            <div className="mt-3">
              <ApprovalPanel invoice={inv} />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  )
}
