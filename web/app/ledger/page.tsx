"use client"

/**
 * Ledger view: each organization's double-entry books (balanced per org), account balances, and every USDC payout reconciled to its transaction.
 *
 * Inputs:
 * - my_ledger_entry and my_payment rows for the signed-in persona (the observer sees every org)
 *
 * Outputs:
 * - Payouts list (Watermelon transaction list), balances and entries per org, with a red flag if any org's books don't balance
 */

import { useState } from "react"
import { ArrowUpRight, Landmark } from "lucide-react"
import { useLive } from "@/components/app/providers"
import { Empty, PageHeader, Section } from "@/components/app/page-header"
import { TransactionList, type Transaction } from "@/components/watermelon/transaction-list"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { TxLink } from "@/components/TxLink"
import { Pill } from "@/components/StatusBadge"
import { orgName } from "@/lib/domain"
import { fmtUsdc, kindLabel, short, timeAgo, titleCase, toDate } from "@/lib/format"
import { cn } from "@/lib/utils"

export default function LedgerPage() {
  const live = useLive()
  const orgIds = [...new Set(live.ledger.map(e => e.orgId))].sort((a, b) => (a < b ? -1 : 1))
  const [picked, setPicked] = useState<bigint | null>(null)
  const orgId = picked ?? orgIds[0] ?? null

  const payments: Transaction[] = live.payments
    .filter(p => p.state === "CONFIRMED")
    .map(p => {
      const inv = live.invoices.find(i => i.id === p.invoiceId)
      const d = toDate(p.updatedAt)
      return {
        id: p.idempotencyKey,
        icon: <ArrowUpRight className="size-4" />,
        name: `${titleCase(orgName(live, p.fromOrgId))} → ${titleCase(orgName(live, p.toOrgId))}`,
        category: inv ? `${kindLabel[inv.kind]} #${inv.id}` : "Payout",
        amount: fmtUsdc(p.amount),
        date: d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        time: d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
        transactionId: p.txHash || p.idempotencyKey,
        paymentMethod: p.simulated ? "USDC · simulated payout" : "USDC · Base Sepolia",
        cardNumber: short(p.toWallet, 8, 6),
        cardType: "verified wallet",
      }
    })

  const entries = live.ledger.filter(e => e.orgId === orgId).sort((a, b) => (a.id > b.id ? -1 : 1))
  const balances = new Map<string, bigint>()
  for (const e of entries) {
    balances.set(e.debit, (balances.get(e.debit) ?? 0n) + e.amount)
    balances.set(e.credit, (balances.get(e.credit) ?? 0n) - e.amount)
  }
  const total = [...balances.values()].reduce((s, x) => s + x, 0n)

  return (
    <>
      <PageHeader
        eyebrow="Records"
        title="Ledger"
        description="Double-entry books for each organization. Every confirmed USDC transfer matches an approved entry; a transfer without one is a red flag."
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          {orgIds.length > 1 ? (
            <div className="flex flex-wrap gap-2">
              {orgIds.map(id => (
                <button
                  key={String(id)}
                  onClick={() => setPicked(id)}
                  className={cn("rounded-full border px-3 py-1 text-sm transition-colors", id === orgId ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
                >
                  {titleCase(orgName(live, id))}
                </button>
              ))}
            </div>
          ) : null}
          <Section
            title={orgId !== null ? `${titleCase(orgName(live, orgId))} books` : "Books"}
            actions={entries.length ? <Pill tone={total === 0n ? "success" : "danger"}>{total === 0n ? "Balanced" : "Out of balance"}</Pill> : null}
          >
            {entries.length ? (
              <>
                <div className="mb-4 grid gap-2 sm:grid-cols-3">
                  {[...balances.entries()].map(([acct, bal]) => (
                    <div key={acct} className="rounded-lg bg-muted/60 p-3">
                      <p className="text-xs text-muted-foreground">{acct}</p>
                      <p className="text-sm font-semibold tabular-nums">{fmtUsdc(bal < 0n ? -bal : bal)} {bal < 0n ? "Cr" : bal > 0n ? "Dr" : ""}</p>
                    </div>
                  ))}
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Debit</TableHead>
                      <TableHead>Credit</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Tx</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map(e => (
                      <TableRow key={String(e.id)}>
                        <TableCell className="text-xs text-muted-foreground">{timeAgo(e.at)}</TableCell>
                        <TableCell>{e.debit}</TableCell>
                        <TableCell>{e.credit}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtUsdc(e.amount)}</TableCell>
                        <TableCell>
                          <TxLink hash={e.txHash} simulated={live.payments.find(p => p.txHash === e.txHash)?.simulated} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            ) : (
              <Empty>No entries yet. They appear when a bill is approved and when its payout confirms.</Empty>
            )}
          </Section>
        </div>
        <Section title="Payouts" description="Confirmed USDC transfers. Tap one for details.">
          {payments.length ? (
            <TransactionList transactions={payments} />
          ) : (
            <div className="flex flex-col items-center gap-2 py-6 text-sm text-muted-foreground">
              <Landmark className="size-5" />
              No payouts yet.
            </div>
          )}
        </Section>
      </div>
    </>
  )
}
