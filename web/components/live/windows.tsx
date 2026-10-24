"use client"

/**
 * Pop-up screens for the Live view. A person's window (their ID badge, what they're looking at, and the one button they press) slides in when it's their turn and slides away when they're done. Automatic steps get their own windows: the agent's console (Claude's reasoning line by line), the CRS check (the paid x402 request and each result), and the block explorer (the USDC transfer).
 *
 * Inputs:
 * - The current step, live rows, personas; onAct/busy for the person's button
 *
 * Outputs:
 * - StepWindows: the windows for the step on stage
 */

import { motion } from "motion/react"
import { Bot, Loader2, ShieldCheck, Zap } from "lucide-react"
import type { ReactNode } from "react"
import type { Live } from "@/components/app/providers"
import type { Persona } from "@/lib/spacetime"
import type { LiveStep } from "@/lib/live-steps"
import { projectParts } from "@/lib/live-steps"
import { IdBadge } from "@/components/live/people"
import { CRS_CHECKS } from "@/lib/verification-graph"
import { crsReason, docNo, fmtUsdc, short, titleCase } from "@/lib/format"
import { cn } from "@/lib/utils"

export function Window({ title, subtitle, children, i = 0, dark }: { title: string; subtitle?: string; children: ReactNode; i?: number; dark?: boolean }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 60, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 60, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 170, damping: 22, delay: i * 0.12 }}
      className={cn("overflow-hidden rounded-lg border shadow-[0_18px_40px_-18px_rgba(0,0,0,0.35)]", dark ? "border-neutral-800 bg-neutral-950 text-neutral-100" : "bg-card")}
    >
      <div className={cn("flex items-center gap-2 border-b px-3 py-2", dark ? "border-neutral-800 bg-neutral-900" : "bg-muted/60")}>
        <span className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-red-400" />
          <span className="size-2.5 rounded-full bg-amber-400" />
          <span className="size-2.5 rounded-full bg-green-500" />
        </span>
        <span className="min-w-0 flex-1 truncate text-center text-xs font-medium">{title}</span>
        {subtitle ? <span className={cn("hidden truncate text-[10px] sm:block", dark ? "text-neutral-400" : "text-muted-foreground")}>{subtitle}</span> : null}
      </div>
      <div className="p-4">{children}</div>
    </motion.div>
  )
}

const Line = ({ children, d = 0, tone }: { children: ReactNode; d?: number; tone?: "ok" | "dim" }) => (
  <motion.p initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: d }} className={cn("font-mono text-[11.5px] leading-relaxed", tone === "ok" ? "text-green-400" : tone === "dim" ? "text-neutral-500" : "")}>
    {children}
  </motion.p>
)

// The city itself and its people, all CRS-verified.
function AgencyVerified({ live }: { live: Live }) {
  const agency = live.organizations.find(o => o.kind === "AGENCY")
  const team = agency ? live.members.filter(m => m.orgId === agency.id) : []
  return (
    <div className="mt-3 rounded-md bg-muted/50 p-3 text-xs">
      <p className="flex items-center gap-1.5 font-semibold">
        <ShieldCheck className="size-3.5 text-leaf" /> {agency ? titleCase(agency.name) : "Agency"} · CRS verified
      </p>
      <p className="mt-0.5 text-muted-foreground">Public agency registry · hash {short(agency?.identityHash ?? "", 6, 4)}</p>
      <ul className="mt-2 space-y-1">
        {team.map(m => (
          <li key={m.identity.toHexString()} className="flex items-center justify-between gap-2">
            <span>{titleCase(m.displayName)}</span>
            <span className={m.verified ? "text-leaf" : "text-muted-foreground"}>{m.verified ? "✓ verified" : "not verified"}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Lets the presenter try to pick an applicant that failed CRS, and shows it being blocked.
function TryBadPick({ live, tried, onTry }: { live: Live; tried: boolean; onTry?: () => void }) {
  const bad = live.organizations
    .filter(o => o.kind !== "AGENCY")
    .map(o => ({ o, v: [...live.verifications].filter(z => z.orgId === o.id && z.subjectType === "ORG")[0] as (Live["verifications"][number] & { decision?: string }) | undefined }))
    .find(({ v }) => v && (v.decision ?? (v.passed ? "PASS" : "FAIL")) === "FAIL")
  if (!bad) return null
  if (!tried)
    return (
      <button onClick={onTry} className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-md border border-destructive/50 px-4 text-sm font-medium text-destructive hover:bg-destructive/8">
        Try selecting {titleCase(bad.o.name)}
      </button>
    )
  const reasons = bad.v?.reasons?.split(",").filter(Boolean) ?? []
  return (
    <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mt-3 rounded-md border-2 border-destructive bg-destructive/8 p-3 text-sm">
      <p className="font-bold tracking-wide text-destructive uppercase">Blocked</p>
      <p className="mt-0.5">{titleCase(bad.o.name)} failed CRS screening and can&apos;t be awarded a contract.</p>
      <ul className="mt-1.5 list-disc pl-5 text-xs text-muted-foreground">
        {reasons.slice(0, 3).map(r => (
          <li key={r}>{crsReason(r)}</li>
        ))}
      </ul>
    </motion.div>
  )
}

// Applicants CRS screening turned away; they can't be selected.
function BlockedApplicants({ live }: { live: Live }) {
  const blocked = live.organizations
    .filter(o => o.kind !== "AGENCY")
    .map(o => ({ o, v: [...live.verifications].filter(z => z.orgId === o.id && z.subjectType === "ORG")[0] as (Live["verifications"][number] & { decision?: string }) | undefined }))
    .filter(({ v }) => v && (v.decision ?? (v.passed ? "PASS" : "FAIL")) !== "PASS")
  if (!blocked.length) return null
  return (
    <ul className="mt-3 space-y-1 rounded-md bg-muted/50 p-2.5 text-xs">
      {blocked.slice(0, 5).map(({ o, v }) => (
        <li key={String(o.id)} className="flex items-center gap-2">
          <span className={cn("rounded px-1 text-[10px] font-semibold uppercase", (v?.decision ?? "FAIL") === "FAIL" ? "bg-destructive/15 text-destructive" : "bg-warning/20 text-foreground")}>
            {(v?.decision ?? "FAIL").toLowerCase()}
          </span>
          <span className="truncate">{titleCase(o.name)} · blocked</span>
        </li>
      ))}
    </ul>
  )
}

// What a counterparty's screen shows while their step runs on its own.
const PARTY_SCRIPT: Record<string, string[]> = {
  "prime-sign": ["Opening the contract", "Signing with a verified identity", "Setting the prime agent's mandate"],
  "gov-evidence": ["Uploading site-photo-railing-north.jpg", "Uploading site-photo-railing-south.jpg", "Attaching daily-report-1024.pdf", "Submitting for inspection"],
  "gov-bill": ["Filling in the application for payment", "Billing line 1 · 0.05 USDC", "Submitting to City of Oakridge"],
  "sub-hire": ["Drafting the subcontract", "Okafor signs", "Nakamura signs", "Agents mandated on both sides"],
  "sub-work": ["Nakamura uploads photos", "Okafor's inspector accepts the work", "Nakamura sends its invoice"],
  "sub-approve": ["Nicole Farragut reviews the invoice", "Nicole approves", "Angela Morrissey approves"],
}

function PartyScreen({ step, live, personas, i }: { step: LiveStep; live: Live; personas: Persona[]; i: number }) {
  const w = step.who![i]
  const p = personas.find(q => q.key === w.persona)
  const member = p ? live.members.find(m => m.displayName.toUpperCase() === p.name.toUpperCase()) : undefined
  const org = member ? live.organizations.find(o => o.id === member.orgId) : undefined
  const script = i === 0 ? (PARTY_SCRIPT[step.key] ?? []) : []
  return (
    <Window i={i} title={`${org ? titleCase(org.name) : ""} · ${titleCase(p?.name ?? "").split(" ")[0]}'s screen`} subtitle="automated for the demo">
      <IdBadge name={p?.name ?? ""} title={p?.title} kind={w.org} orgName={org?.name} verified={member?.verified} hash={member?.identityHash} />
      {script.length ? (
        <ul className="mt-3 space-y-1.5">
          {script.map((line, k) => (
            <motion.li key={line} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 + k * 0.55 }} className="flex items-center gap-2 text-sm">
              {step.done || k < script.length - 1 ? (
                <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.7 + k * 0.55 }} className="grid size-4 place-items-center rounded-full bg-leaf text-background">
                  <ShieldCheck className="size-2.5" />
                </motion.span>
              ) : (
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              )}
              <span className={cn(!step.done && k === script.length - 1 && "text-muted-foreground")}>{line}</span>
            </motion.li>
          ))}
        </ul>
      ) : null}
    </Window>
  )
}

export function StepWindows({
  step,
  live,
  personas,
  contractId,
  isCurrent,
  busy,
  onAct,
  onSkip,
  onTryBad,
  triedBad,
}: {
  step: LiveStep
  live: Live
  personas: Persona[]
  contractId?: bigint
  isCurrent: boolean
  busy: boolean
  onAct: () => void
  onSkip: () => void
  onTryBad?: () => void
  triedBad?: boolean
}) {
  const x = projectParts(live, contractId)
  const bill = step.bill
  const sub = step.level === "sub"
  const contract = sub ? x.sub : x.contract

  // The chosen contractor's checks.
  if (step.kind === "checks") {
    const prime = live.organizations.find(o => o.kind === "PRIME")
    return (
      <Window title="Okafor Builders LLC · CRS profile" subtitle="pre-award">
        <div className="flex items-center gap-3 rounded-lg border bg-background p-3">
          <span className="grid size-12 place-items-center rounded-full bg-leaf/20 text-sm font-semibold">OB</span>
          <div className="leading-tight">
            <p className="font-semibold">{prime ? titleCase(prime.name) : ""}</p>
            <p className="text-xs text-muted-foreground">Prime contractor · selected</p>
            <p className="mt-1 flex items-center gap-1 text-[11px] text-leaf">
              <ShieldCheck className="size-3" /> CRS {prime?.verified ? "pass" : "pending"} · {short(prime?.identityHash ?? "", 6, 4)}
            </p>
          </div>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">Six independent checks run before Okafor can sign. Results are stored as an attestation hash, never raw identity data.</p>
      </Window>
    )
  }

  // Screening: CRS checks every applicant.
  if (step.kind === "screen") {
    const applicants = live.organizations.filter(o => o.kind !== "AGENCY").slice(0, 8)
    return (
      <Window dark title="CRS Credit API · applicant screening" subtitle="sandbox">
        {applicants.map((o, i) => {
          const v = [...live.verifications].filter(z => z.orgId === o.id && z.subjectType === "ORG")[0] as (Live["verifications"][number] & { decision?: string }) | undefined
          const d = v ? (v.decision ?? (v.passed ? "PASS" : "FAIL")) : "…"
          return (
            <Line key={String(o.id)} d={0.2 + i * 0.35} tone={d === "PASS" ? "ok" : undefined}>
              {d === "PASS" ? "✓" : d === "FAIL" ? "✗" : "!"} {titleCase(o.name).slice(0, 26)} · {d.toLowerCase()}
            </Line>
          )
        })}
      </Window>
    )
  }

  // Counterparties: their screen, running by itself.
  if (step.kind === "party") return <>{step.who!.map((_, i) => <PartyScreen key={i} step={step} live={live} personas={personas} i={i} />)}</>

  // Your turn: your person's window with the button.
  if (step.kind === "you") {
    const w = step.who![0]
    const p = personas.find(q => q.key === w.persona)
    const member = p ? live.members.find(m => m.displayName.toUpperCase() === p.name.toUpperCase()) : undefined
    return (
      <Window title={`You · ${titleCase(p?.name ?? "")}`} subtitle="City of Oakridge">
        <IdBadge name={p?.name ?? ""} title={p?.title} kind="AGENCY" orgName="City of Oakridge Public Works" verified={member?.verified} hash={member?.identityHash} />
        <p className="mt-3 text-sm text-muted-foreground">{step.explain}</p>
        {step.key === "post" ? <AgencyVerified live={live} /> : null}
        {step.key === "select" ? <BlockedApplicants live={live} /> : null}
        {step.key === "select" && isCurrent && !step.done ? <TryBadPick live={live} tried={!!triedBad} onTry={onTryBad} /> : null}
        {isCurrent && !step.done ? (
          <button
            onClick={onAct}
            disabled={busy}
            className={cn("mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold disabled:opacity-70", step.danger ? "bg-destructive text-background" : "bg-primary text-primary-foreground")}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {step.verb}
          </button>
        ) : null}
        {step.done ? (
          <p className="mt-4 flex items-center gap-1.5 text-sm text-leaf">
            <ShieldCheck className="size-4" /> Done with your verified identity
          </p>
        ) : null}
      </Window>
    )
  }

  // The fraud moment: an email is about to arrive.
  if (step.kind === "fraud") {
    return (
      <Window title="Inbox · ap@cityofoakridge.gov" subtitle="demo">
        <div className="rounded-md border border-dashed p-3 text-sm">
          <p className="font-medium">New message from “Okafor Builders”</p>
          <p className="mt-1 text-muted-foreground">“URGENT: we changed our banking. Please pay this pay application to our new wallet today…”</p>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Logging it in GovFlow freezes the bill until the real owner re-verifies and two approvers decide.</p>
        {isCurrent && !step.done ? (
          <div className="mt-4 grid gap-2">
            <button onClick={onAct} disabled={busy} className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-destructive px-4 text-sm font-semibold text-background disabled:opacity-70">
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Simulate impostor email
            </button>
            <button onClick={onSkip} disabled={busy} className="inline-flex h-9 items-center justify-center rounded-md border px-4 text-sm text-muted-foreground hover:text-foreground">
              Skip, no fraud this time
            </button>
          </div>
        ) : null}
      </Window>
    )
  }

  // Investigation: the agent's risk review and the impostor being turned away.
  if (step.kind === "risk") {
    const f = bill ? [...live.findings].filter(z => z.kind === "RISK_CASE" && z.subjectId === bill.id).sort((a, b) => (a.id > b.id ? -1 : 1))[0] : undefined
    const flags = f?.flags ? f.flags.split(",").map(z => z.trim()).filter(Boolean) : []
    const claimantFailed = flags.some(z => /IDENTITY_FAILED|CLAIMANT/.test(z))
    return (
      <>
        <Window dark title="agency-agent · risk review" subtitle="mandate: risk_review">
          <Line d={0.1}>&gt; wallet change on {bill ? docNo(bill) : "bill"} via email</Line>
          <Line d={0.3} tone="ok">✓ payment frozen</Line>
          <Line d={0.5}>&gt; re-verify payee Okafor Builders with CRS</Line>
          <Line d={0.7}>&gt; verify sender “Victor Anand” with CRS</Line>
          {f ? (
            <>
              {flags.slice(0, 5).map((z, i) => (
                <Line key={z} d={0.9 + i * 0.2}>
                  ! {z.toLowerCase().replaceAll("_", " ")}
                </Line>
              ))}
              <Line d={2} tone="ok">
                risk {f.result} → recommend: reject the change
              </Line>
            </>
          ) : (
            <p className="mt-2 flex items-center gap-2 font-mono text-[11.5px] text-neutral-400">
              <Loader2 className="size-3 animate-spin" /> investigating…
            </p>
          )}
        </Window>
        {f ? (
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 1.8, type: "spring", stiffness: 200, damping: 16 }} className="rounded-lg border-2 border-destructive bg-destructive/8 p-4">
            <p className="flex items-center gap-2 text-sm font-bold tracking-wide text-destructive uppercase">
              <ShieldCheck className="size-4" /> Access denied
            </p>
            <p className="mt-1 text-sm">{claimantFailed ? "“Victor Anand” failed CRS identity verification. He can't redirect this payment." : "The request didn't pass verification."}</p>
          </motion.div>
        ) : null}
      </>
    )
  }

  // Agent console: Claude's reasoning on the bill.
  if (step.kind === "agent") {    const reasons = bill?.matchReasons ? bill.matchReasons.split("\n").filter(Boolean) : []
    return (
      <Window dark title={`${sub ? "prime-agent" : "agency-agent"} · Claude`} subtitle="mandate: match, verify">
        <div className="mb-2 flex items-center gap-2 text-xs text-neutral-400">
          <Bot className="size-3.5" /> Agent console
        </div>
        <Line d={0.1}>&gt; read {bill ? docNo(bill) : "bill"} ({bill ? fmtUsdc(bill.amount) : ""})</Line>
        <Line d={0.3}>&gt; load contract {contract?.title ?? ""}</Line>
        <Line d={0.5}>&gt; compare billed lines with accepted work</Line>
        <Line d={0.7} tone="dim">
          (bill text is treated as data, not instructions)
        </Line>
        {reasons.length ? (
          <>
            {reasons.slice(0, 5).map((r, i) => (
              <Line key={r} d={0.9 + i * 0.25}>
                · {r}
              </Line>
            ))}
            <Line d={1 + Math.min(5, reasons.length) * 0.25} tone="ok">
              result: {bill?.matchResult}
            </Line>
          </>
        ) : (
          <p className="mt-2 flex items-center gap-2 font-mono text-[11.5px] text-neutral-400">
            <Loader2 className="size-3 animate-spin" /> thinking…
          </p>
        )}
      </Window>
    )
  }

  // CRS: the paid request and each result.
  if (step.kind === "crs") {
    const v = bill ? [...live.verifications].filter(z => z.invoiceId === bill.id).sort((a, b) => (a.checkedAt.microsSinceUnixEpoch > b.checkedAt.microsSinceUnixEpoch ? -1 : 1))[0] : undefined
    const receipt = bill ? live.receipts.find(r => r.paymentRef.startsWith(`verify-${bill.id}-`)) : undefined
    const payee = bill ? live.organizations.find(o => o.id === bill.payeeOrgId) : undefined
    return (
      <Window dark title="POST /api/verification/contractor" subtitle="x402 · Base Sepolia">
        <Line d={0.1}>&gt; subject: {payee ? titleCase(payee.name) : ""}</Line>
        <Line d={0.3}>&gt; wallet: {bill ? short(bill.beneficiaryWallet, 6, 4) : ""}</Line>
        <Line d={0.5} tone={receipt ? "ok" : undefined}>
          {receipt ? `✓ paid ${fmtUsdc(receipt.amount)} via x402 (${receipt.paymentRef})` : "… 402 Payment Required → agent paying 0.01 USDC"}
        </Line>
        {v ? (
          <>
            {CRS_CHECKS.map((c, i) => (
              <Line key={c.id} d={0.7 + i * 0.2} tone={v.products.includes(c.product) ? "ok" : "dim"}>
                {v.products.includes(c.product) ? "✓" : "·"} {c.label.toLowerCase()} · {c.source}
              </Line>
            ))}
            <Line d={2} tone="ok">
              200 OK · attestation {short(v.identityHash, 6, 4)}
            </Line>
          </>
        ) : (
          <p className="mt-2 flex items-center gap-2 font-mono text-[11.5px] text-neutral-400">
            <Loader2 className="size-3 animate-spin" /> querying CRS sandbox…
          </p>
        )}
      </Window>
    )
  }

  // Payout: the block explorer view.
  const pay = bill ? live.payments.find(p => p.invoiceId === bill.id && p.state !== "FAILED") : undefined
  return (
    <Window title="sepolia.basescan.org" subtitle="USDC transfer">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
        <Zap className="size-4 text-primary" /> Token transfer
      </div>
      <dl className="space-y-1.5 text-xs">
        {[
          ["Status", pay ? (pay.state === "CONFIRMED" ? "Success" : `${pay.state.toLowerCase()}…`) : "waiting for approvals"],
          ["Amount", bill ? fmtUsdc(bill.amount) : "—"],
          ["To", pay ? short(pay.toWallet, 8, 6) : "—"],
          ["Tx hash", pay?.txHash ? short(pay.txHash, 10, 8) : "—"],
        ].map(([k, val]) => (
          <div key={k} className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className={cn("font-mono", k === "Status" && pay?.state === "CONFIRMED" && "text-leaf")}>{val}</dd>
          </div>
        ))}
      </dl>
    </Window>
  )
}
