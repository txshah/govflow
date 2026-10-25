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
import { Bot, Check, FileDown, Loader2, ShieldCheck, Zap } from "lucide-react"
import { useState, type ReactNode } from "react"
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

function downloadText(name: string, body: string) {
  const url = URL.createObjectURL(new Blob([body], { type: "text/plain" }))
  Object.assign(document.createElement("a"), { href: url, download: name }).click()
  URL.revokeObjectURL(url)
}

const OFFER_FILES = [
  {
    name: "okafor-offer.txt",
    body: [
      "OFFER · Okafor Builders LLC",
      "Project: Oakridge Avenue bridge railing repair",
      "Price: 0.10 USDC (test USDC, Base Sepolia)",
      "Start: Oct 27, 2026 · Duration: 10 working days",
      "Payment: progress billing on accepted work, two approvals",
      "Signed by the company's verified agent on behalf of Okafor Builders LLC",
    ].join("\n"),
  },
  { name: "schedule-of-values.csv", body: ["line,description,scheduled_value_usdc", "1,Replace damaged railing sections,0.10", ""].join("\n") },
  {
    name: "insurance-certificate.txt",
    body: [
      "CERTIFICATE OF LIABILITY INSURANCE (demo)",
      "Insured: Okafor Builders LLC",
      "General liability: $2,000,000 each occurrence",
      "Certificate holder: City of Oakridge Public Works",
      "This is a demo document.",
    ].join("\n"),
  },
]

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

// Every applicant as a card you can click: a failed or flagged one is refused with its CRS reasons; the clean one is selected.
function ApplicantPicker({ live, busy, onSelect }: { live: Live; busy: boolean; onSelect: () => void }) {
  const [refused, setRefused] = useState<bigint | null>(null)
  const apps = live.organizations
    .filter(o => o.kind !== "AGENCY")
    .filter(o => o.kind === "PRIME" || !(o.payoutWallet && o.verified && live.contracts.some(c => c.payeeOrgId === o.id)))
    .map(o => {
      const v = [...live.verifications]
        .filter(z => z.orgId === o.id && z.subjectType === "ORG")
        .sort((a, b) => (a.checkedAt.microsSinceUnixEpoch > b.checkedAt.microsSinceUnixEpoch ? -1 : 1))[0] as (Live["verifications"][number] & { decision?: string }) | undefined
      const d = v ? (v.decision ?? (v.passed ? "PASS" : "FAIL")) : "PENDING"
      const reasons = v?.reasons ? v.reasons.split(",").filter(Boolean) : []
      // Award rule: a clean CRS pass. A pass with liens or judgments on file is held back for this contract.
      const clean = d === "PASS" && reasons.length === 0
      return { o, d, reasons, clean, products: v?.products ?? "" }
    })
    .sort((a, b) => (a.o.kind === "PRIME" ? 1 : 0) - (b.o.kind === "PRIME" ? 1 : 0))
  const picked = apps.find(a => a.o.id === refused)
  return (
    <div className="mt-3">
      <p className="mb-1.5 text-xs font-semibold">Select the contractor</p>
      <ul className="space-y-1.5">
        {apps.map(a => (
          <li key={String(a.o.id)}>
            <button
              disabled={busy}
              onClick={() => (a.clean ? onSelect() : setRefused(a.o.id))}
              className={cn(
                "flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left text-xs transition-colors",
                refused === a.o.id ? "border-destructive bg-destructive/8" : "hover:bg-muted",
                a.clean && "border-leaf/50"
              )}
            >
              <span className={cn("rounded px-1 text-[10px] font-semibold uppercase", a.d === "PASS" ? "bg-leaf/15 text-leaf" : a.d === "REVIEW" ? "bg-warning/20 text-foreground" : "bg-destructive/15 text-destructive")}>{a.d.toLowerCase()}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{titleCase(a.o.name)}</span>
              <span className="text-muted-foreground">Select</span>
            </button>
          </li>
        ))}
      </ul>
      {picked ? (
        <motion.div key={String(picked.o.id)} initial={{ scale: 0.94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mt-2 rounded-md border-2 border-destructive bg-destructive/8 p-2.5 text-xs">
          <p className="font-bold tracking-wide text-destructive uppercase">Not allowed</p>
          <p className="mt-0.5">
            {picked.d === "PASS"
              ? `${titleCase(picked.o.name)} passed CRS but has records on file; this award requires a clean result.`
              : `${titleCase(picked.o.name)} ${picked.d === "FAIL" ? "failed" : "was flagged in"} CRS screening and can't be awarded a contract.`}
          </p>
          <p className="mt-1 text-muted-foreground">{picked.reasons.length ? picked.reasons.slice(0, 2).map(crsReason).join(", ") : "No clean CRS result"} · open it in the report for every check</p>
        </motion.div>
      ) : null}
    </div>
  )
}

// What a counterparty's screen shows while their step runs on its own.
const PARTY_SCRIPT: Record<string, string[]> = {
  "prime-sign": ["Opening the contract", "Signing with a verified identity", "Setting the prime agent's mandate"],
  "gov-evidence": ["Uploading site-photo-railing-north.jpg", "Uploading site-photo-railing-south.jpg", "Attaching daily-report-1024.pdf", "Submitting for inspection"],
  "gov-bill": ["Filling in the application for payment", "Billing line 1 · half of the accepted line", "Submitting to City of Oakridge"],
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
  onActKey,
  onSkip,
}: {
  step: LiveStep
  live: Live
  personas: Persona[]
  contractId?: bigint
  isCurrent: boolean
  busy: boolean
  onAct: () => void
  onActKey?: (key: string) => void
  onSkip: () => void
}) {
  const x = projectParts(live, contractId)
  const bill = step.bill
  const sub = step.level === "sub"
  const contract = sub ? x.sub : x.contract

  // The two agents settle the offer and swap documents.
  if (step.kind === "agents") {
    const msgs: [string, string][] = [
      ["city", "Okafor Builders LLC was selected for the Oakridge Ave bridge railing repair. Please confirm your offer and send the award documents."],
      ["okafor", "Confirmed: 0.10 USDC, one line (replace damaged railing sections). Start Oct 27, finish in 10 working days. Attaching the offer, schedule of values and insurance certificate."],
      ["city", "Received. Payout wallet matches the one bound to your CRS-verified owner. Billing is progress-based, only on inspected and accepted work."],
      ["okafor", "Understood. Subcontract planned for railing lights with Nakamura Electric (CRS-verified). Ready to sign."],
      ["city", "Sending the contract for signature. Any change of payee, wallet or owner will freeze payment until re-verified."],
    ]
    return (
      <Window title="Agent channel · city ⇄ Okafor" subtitle="mandated agents">
        <ul className="space-y-2">
          {msgs.map(([who, text], i) => (
            <motion.li key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 1.3 }} className={cn("flex", who === "okafor" && "justify-end")}>
              <span className={cn("max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed", who === "city" ? "bg-muted" : "bg-primary/10")}>
                <span className="block text-[10px] font-semibold text-muted-foreground uppercase">{who === "city" ? "City of Oakridge agent" : "Okafor Builders agent"}</span>
                {text}
              </span>
            </motion.li>
          ))}
        </ul>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 5.6 }} className="mt-3 flex flex-wrap gap-1.5">
          {OFFER_FILES.map(f => (
            <button key={f.name} onClick={() => downloadText(f.name, f.body)} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] hover:bg-muted">
              <FileDown className="size-3" /> {f.name}
            </button>
          ))}
        </motion.div>
        <p className="mt-2 text-[10.5px] text-muted-foreground">Messages scripted for the demo; files are downloadable.</p>
      </Window>
    )
  }

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

  // Two approvers from the same org, one above the other in one window, each with their own button.
  if (step.kind === "you" && step.pair && bill) {
    return (
      <Window title={step.danger ? "Two approvers · reject the change" : "Two approvers · payment"} subtitle="City of Oakridge">
        <p className="text-xs text-muted-foreground">
          {step.danger ? "Each reviews the case file. Both must reject before the frozen payment moves." : `Each reviews ${docNo(bill)} against the contract, inspection and CRS check. Both must approve.`}
        </p>
        <ul className="mt-3 divide-y rounded-lg border">
          {step.who!.map((w, i) => {
            const p = personas.find(q => q.key === w.persona)
            const member = p ? live.members.find(m => m.displayName.toUpperCase() === p.name.toUpperCase()) : undefined
            const vote = member
              ? live.approvals.find(
                  a => a.invoiceId === bill.id && a.kind === step.voteKind && a.approver.toHexString() === member.identity.toHexString() && (step.voteKind === "UNFREEZE" || a.round === bill.approvalRound)
                )
              : undefined
            const done = step.done || !!vote
            return (
              <li key={w.persona} className="p-3">
                <div className="flex items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold">{i + 1}</span>
                  <div className="min-w-0 flex-1 leading-tight">
                    <p className="truncate text-sm font-semibold">{titleCase(p?.name ?? "")}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{p?.title}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-[11px] text-leaf">
                      <ShieldCheck className="size-3" /> CRS verified · {short(member?.identityHash ?? "", 4, 4)}
                    </p>
                  </div>
                  {done ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-leaf/15 px-2.5 py-1 text-xs font-medium text-leaf">
                      <Check className="size-3.5" /> {step.danger ? "Rejected" : "Approved"}
                    </span>
                  ) : isCurrent ? (
                    <button
                      onClick={() => onActKey?.(step.pair![i])}
                      disabled={busy}
                      className={cn("inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-4 text-sm font-semibold disabled:opacity-70", step.danger ? "bg-destructive text-background" : "bg-primary text-primary-foreground")}
                    >
                      {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                      {step.verb}
                    </button>
                  ) : null}
                </div>
                {vote?.reason ? <p className="mt-2 pl-12 text-[11px] text-muted-foreground">“{vote.reason}”</p> : null}
              </li>
            )
          })}
        </ul>
      </Window>
    )
  }

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
        {step.key === "select" && isCurrent && !step.done ? <ApplicantPicker live={live} busy={busy} onSelect={onAct} /> : null}
        {isCurrent && !step.done && step.key !== "select" ? (
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
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md border p-2.5">
            <p className="font-semibold">The usual way</p>
            <p className="mt-1 text-muted-foreground">A clerk updates the bank details from the email. The next payment goes to the thief, and nobody notices for weeks.</p>
          </div>
          <div className="rounded-md border border-leaf/50 bg-leaf/8 p-2.5">
            <p className="font-semibold">With GovFlow</p>
            <p className="mt-1 text-muted-foreground">Logging the request freezes the bill. CRS checks the sender, and two people must agree before any wallet changes.</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Terrence in finance received this email. Log it as a wallet change request and see what happens.</p>
        {isCurrent && !step.done ? (
          <div className="mt-4 grid gap-2">
            <button onClick={onAct} disabled={busy} className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-destructive px-4 text-sm font-semibold text-background disabled:opacity-70">
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Log the wallet change request
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
            <Line d={2.3} tone={v.identityHash === payee?.identityHash ? "ok" : undefined}>
              {v.identityHash === payee?.identityHash
                ? `✓ matches the hash on file from the award (${short(payee?.identityHash ?? "", 6, 4)}): same owner`
                : `! differs from the hash on file (${short(payee?.identityHash ?? "", 6, 4)}): payment frozen for review`}
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
