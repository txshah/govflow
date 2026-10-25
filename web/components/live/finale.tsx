"use client"

/**
 * The end of a project in Live: the bridge before and after, and the numbers that matter (on time, in budget, fraud stopped).
 *
 * Inputs:
 * - Live rows and the project's prime contract id
 *
 * Outputs:
 * - The finale panel
 */

import { motion } from "motion/react"
import type { Live } from "@/components/app/providers"
import { projectParts } from "@/lib/live-steps"
import { fmtUsdc } from "@/lib/format"

const micros = (t?: { microsSinceUnixEpoch: bigint }) => (t ? Number(t.microsSinceUnixEpoch / 1000n) : 0)

function Bridge({ fixed }: { fixed: boolean }) {
  return (
    <svg viewBox="0 0 320 150" className="h-auto w-full" role="img" aria-label={fixed ? "Repaired bridge" : "Damaged bridge"}>
      <rect width="320" height="150" fill={fixed ? "#dbeafe" : "#e5e7eb"} />
      <path d="M0 118 Q80 104 160 116 T320 112 V150 H0Z" fill={fixed ? "#60a5fa" : "#94a3b8"} />
      {[60, 160, 260].map(x => (
        <rect key={x} x={x - 6} y="78" width="12" height="44" fill={fixed ? "#475569" : "#6b7280"} />
      ))}
      {fixed ? (
        <>
          <rect x="10" y="70" width="300" height="10" rx="2" fill="#334155" />
          <path d="M10 70 V52 M310 70 V52 M10 52 H310" stroke="#16a34a" strokeWidth="3" fill="none" />
          {Array.from({ length: 20 }, (_, i) => (
            <line key={i} x1={25 + i * 15} y1="52" x2={25 + i * 15} y2="70" stroke="#16a34a" strokeWidth="2" />
          ))}
          <rect x="70" y="62" width="34" height="8" rx="3" fill="#f59e0b" />
          <rect x="190" y="62" width="34" height="8" rx="3" fill="#3b82f6" />
        </>
      ) : (
        <>
          <path d="M10 70 H140 L150 76 L155 70 H310 V80 H10Z" fill="#475569" />
          <path d="M10 52 H90 M120 58 L150 52 M200 52 H310" stroke="#9a3412" strokeWidth="3" fill="none" />
          {Array.from({ length: 20 }, (_, i) =>
            i % 3 === 1 ? null : <line key={i} x1={25 + i * 15} y1="52" x2={25 + i * 15 + (i % 4 === 0 ? 4 : 0)} y2="70" stroke="#9a3412" strokeWidth="2" />
          )}
          <path d="M140 70 l6 8 l4 -6 l5 8" stroke="#1f2937" strokeWidth="1.5" fill="none" />
          <g transform="translate(150 30)">
            <path d="M0 0 L12 20 H-12Z" fill="#f59e0b" />
            <text x="0" y="17" textAnchor="middle" fontSize="11" fontWeight="700" fill="#111827">!</text>
          </g>
        </>
      )}
    </svg>
  )
}

export function Finale({ live, contractId }: { live: Live; contractId?: bigint }) {
  const x = projectParts(live, contractId)
  const bills = [x.bill1, x.bill2].filter(Boolean) as NonNullable<typeof x.bill1>[]
  const paid = live.payments.filter(p => p.state === "CONFIRMED" && bills.some(b => b.id === p.invoiceId))
  const paidTotal = paid.reduce((a, p) => a + p.amount, 0n)
  const budget = x.contract?.totalValue ?? 0n
  const blocked = live.changes.filter(c => c.state === "REJECTED" && bills.some(b => b.id === c.invoiceId)).length
  const start = micros(x.contract?.createdAt)
  const end = Math.max(0, ...paid.map(p => micros(p.updatedAt)))
  const mins = start && end ? Math.max(1, Math.round((end - start) / 60000)) : 0
  const stats = [
    ["On time", mins ? `${mins} min from contract to final payment` : "Paid as soon as work was accepted", "vs. 50+ days for a typical public-works payment"],
    ["In budget", `${fmtUsdc(paidTotal)} paid of ${fmtUsdc(budget)}`, "Every bill matched to accepted work"],
    ["No fraud", blocked ? `${blocked} wallet change${blocked > 1 ? "s" : ""} stopped` : "No payment to an unverified wallet", "Every payee CRS-verified, hashes matched"],
  ]
  return (
    <div className="w-full max-w-3xl">
      <div className="grid grid-cols-2 gap-4">
        {[false, true].map(fixed => (
          <motion.figure key={String(fixed)} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: fixed ? 0.6 : 0.1 }} className="overflow-hidden rounded-lg border bg-card">
            <Bridge fixed={fixed} />
            <figcaption className="flex items-center justify-between px-3 py-2 text-xs">
              <span className="font-semibold">{fixed ? "After" : "Before"}</span>
              <span className="text-muted-foreground">{fixed ? "Railings replaced, lights installed" : "Damaged railing sections"}</span>
            </figcaption>
          </motion.figure>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 text-left">
        {stats.map(([t, v, d], i) => (
          <motion.div key={t} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1 + i * 0.2 }} className="rounded-lg border bg-card p-3">
            <p className="text-xs font-semibold text-leaf uppercase">{t}</p>
            <p className="mt-1 text-sm font-medium">{v}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{d}</p>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
