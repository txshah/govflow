"use client"

/**
 * Mock paperwork rendered from the real data, so the audience can see what's actually being submitted at each step: the contract (with signatures), site photos and a daily report, the inspection form, the pay application (AIA G702/G703 style, with the agent's annotations and approval stamps), the CRS report, and the USDC payment receipt.
 *
 * Inputs:
 * - Live rows and the project parts (contract, lines, bills) from lib/live-steps
 *
 * Outputs:
 * - StepDocument: picks the right document for a step key
 */

import { motion } from "motion/react"
import { Check, ChevronRight, FileUp, Loader2, ShieldAlert } from "lucide-react"
import { useState, type ReactNode } from "react"
import type { Live } from "@/components/app/providers"
import type { LiveStep } from "@/lib/live-steps"
import { briefAtomic, DEFAULT_BRIEF, IMPOSTOR_WALLET, projectParts, type ProjectBrief } from "@/lib/live-steps"
import { CRS_CHECKS } from "@/lib/verification-graph"
import { contractNo, crsReason, docNo, fmtUsdc, short, titleCase, toDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useNow } from "@/lib/use-now"

type Parts = ReturnType<typeof projectParts>
const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
const dateOf = (t?: { microsSinceUnixEpoch: bigint }) => (t ? fmtDate(toDate(t as never)) : "—")

// ---------- paper ----------

function Paper({ letterhead, kind, children, stamp }: { letterhead: string; kind: string; children: ReactNode; stamp?: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18, rotate: -0.6 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={{ type: "spring", stiffness: 120, damping: 18 }}
      className="relative mx-auto w-full max-w-[34rem] rounded-sm border bg-white p-6 text-[13px] text-neutral-800 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_12px_32px_-12px_rgba(0,0,0,0.25)] dark:bg-neutral-100"
    >
      <div className="mb-4 flex items-start justify-between border-b border-neutral-300 pb-3">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.15em] text-neutral-500 uppercase">{letterhead}</p>
          <p className="mt-0.5 text-lg font-semibold text-neutral-900">{kind}</p>
        </div>
        <div className="size-8 rounded-sm border-2 border-neutral-300" aria-hidden />
      </div>
      {children}
      {stamp}
    </motion.div>
  )
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] tracking-wide text-neutral-500 uppercase">{label}</p>
      <p className="truncate font-medium text-neutral-900">{value}</p>
    </div>
  )
}

function Signature({ name, signed, label, delay = 0 }: { name: string; signed: boolean; label: string; delay?: number }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="relative h-9 border-b border-neutral-400">
        {signed ? (
          <motion.span
            initial={{ clipPath: "inset(0 100% 0 0)" }}
            animate={{ clipPath: "inset(0 0% 0 0)" }}
            transition={{ duration: 1.1, delay, ease: "easeOut" }}
            className="absolute bottom-0 left-1 font-[family-name:var(--font-signature)] text-2xl text-blue-900"
          >
            {titleCase(name)}
          </motion.span>
        ) : null}
      </div>
      <p className="mt-1 text-[10px] text-neutral-500">{label}</p>
    </div>
  )
}

function Stamp({ text, tone = "green", rotate = -10 }: { text: string; tone?: "green" | "red" | "blue"; rotate?: number }) {
  const c = tone === "green" ? "border-green-700 text-green-700" : tone === "red" ? "border-red-700 text-red-700" : "border-blue-800 text-blue-800"
  return (
    <motion.div
      initial={{ scale: 2, opacity: 0, rotate: rotate - 12 }}
      animate={{ scale: 1, opacity: 0.85, rotate }}
      transition={{ type: "spring", stiffness: 260, damping: 14 }}
      className={cn("pointer-events-none absolute right-6 bottom-16 rounded border-[3px] px-3 py-1 text-sm font-bold tracking-[0.2em] uppercase", c)}
    >
      {text}
    </motion.div>
  )
}

// ---------- documents ----------

function ContractDoc({ live, x, sub, nameOf }: { live: Live; x: Parts; sub: boolean; nameOf: (orgId?: bigint) => string }) {
  const c = sub ? x.sub : x.contract
  const deal = sub ? x.subDeal : x.deal
  if (!c) return <DraftContract live={live} sub={sub} />
  const payer = live.organizations.find(o => o.id === c.payerOrgId)
  const payee = live.organizations.find(o => o.id === c.payeeOrgId)
  const sigs = deal ? live.signatures.filter(s => s.dealId === deal.id) : []
  const signer = (orgId: bigint) => {
    const sg = sigs.find(s => s.orgId === orgId)
    return sg ? (live.members.find(m => m.identity.isEqual(sg.signer))?.displayName ?? "") : ""
  }
  const lines = live.milestones.filter(m => m.contractId === c.id).sort((a, b) => a.lineNo - b.lineNo)
  return (
    <Paper letterhead={payer ? titleCase(payer.name) : "Agency"} kind={sub ? "Subcontract agreement" : "Public works contract"} stamp={deal?.state === "ACTIVE" ? <Stamp text="Executed" tone="blue" /> : undefined}>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Contract no." value={contractNo(c)} />
        <Field label="Date" value={dateOf(c.createdAt)} />
        <Field label="Contract sum" value={fmtUsdc(c.totalValue)} />
      </div>
      <p className="mt-3 text-neutral-700">
        <span className="font-medium">{payer ? titleCase(payer.name) : ""}</span> engages <span className="font-medium">{payee ? titleCase(payee.name) : ""}</span> for: <span className="font-medium">{c.title}</span>.
      </p>
      <table className="mt-3 w-full text-left text-[12px]">
        <thead className="text-[10px] tracking-wide text-neutral-500 uppercase">
          <tr className="border-b border-neutral-300">
            <th className="py-1">Item</th>
            <th>Schedule of values</th>
            <th className="text-right">Value</th>
          </tr>
        </thead>
        <tbody>
          {lines.map(m => (
            <tr key={String(m.id)} className="border-b border-neutral-200">
              <td className="py-1.5">{m.lineNo}</td>
              <td>{m.description}</td>
              <td className="text-right tabular-nums">{fmtUsdc(m.scheduledValue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-[11px] text-neutral-500">Payment: progress billing on accepted work, paid in USDC to the payee&apos;s verified wallet after two approvals.</p>
      <div className="mt-6 flex gap-6">
        <Signature name={signer(c.payerOrgId)} signed={!!signer(c.payerOrgId)} label={`For ${nameOf(c.payerOrgId)}`} />
        <Signature name={signer(c.payeeOrgId)} signed={!!signer(c.payeeOrgId)} label={`For ${nameOf(c.payeeOrgId)}`} delay={0.6} />
      </div>
    </Paper>
  )
}

// The contract about to be issued, before it exists in the database.
// The request for bids the city is about to post, filled from the form (or an uploaded document).
function BriefDoc({ live, brief }: { live: Live; brief: ProjectBrief }) {
  const agency = live.organizations.find(o => o.kind === "AGENCY")
  return (
    <Paper letterhead={agency ? titleCase(agency.name) : "City of Oakridge"} kind="Request for bids · draft">
      <div className="grid grid-cols-3 gap-3">
        <Field label="Project" value={brief.title || "—"} />
        <Field label="Budget" value={fmtUsdc(briefAtomic(brief))} />
        <Field label="Complete by" value={brief.finish || "—"} />
      </div>
      <div className="mt-3 space-y-2 text-neutral-700">
        <Field label="Location" value={brief.location || "—"} />
        <div>
          <p className="text-[10px] tracking-wide text-neutral-500 uppercase">Scope of work</p>
          <p className="text-[13px] text-neutral-800">{brief.scope || "—"}</p>
        </div>
      </div>
      <table className="mt-3 w-full text-left text-[12px]">
        <tbody>
          <tr className="border-y border-neutral-200">
            <td className="py-1.5">1</td>
            <td>{brief.line || "—"}</td>
            <td className="text-right tabular-nums">{fmtUsdc(briefAtomic(brief))}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-3 text-[11px] text-neutral-500">
        Bidders must pass CRS screening before award. Progress billing only on inspected, accepted work; payment to the verified owner&apos;s wallet after two approvals.
      </p>
    </Paper>
  )
}

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4021"

// New project: fill out the request for bids (or let Claude fill it from an uploaded RFP), then view the generated document.
function BriefEditor({ live, brief, setBrief }: { live: Live; brief: ProjectBrief; setBrief: (b: ProjectBrief) => void }) {
  const [tab, setTab] = useState<"fill" | "view">("fill")
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const extract = async (name: string, mediaType: string, data: string) => {
    setBusy(name)
    setMsg(null)
    try {
      const res = await fetch(`${API}/api/extract`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "project", name, mediaType, data }) })
      const out = await res.json()
      if (!res.ok) throw new Error(out.error ?? `Extraction failed (${res.status})`)
      setBrief({ title: out.title || brief.title, location: out.location || brief.location, scope: out.scope || brief.scope, line: out.lineDescription || brief.line, amount: out.amountUsdc || brief.amount, finish: out.finish || brief.finish })
      setMsg({ ok: true, text: `Claude filled the form from ${name}` })
      setTab("view")
    } catch (e) {
      setMsg({ ok: false, text: e instanceof TypeError ? "Can't reach the GovFlow API. Start it with: cd api && npm start" : e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(null)
    }
  }
  const toBase64 = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result).split(",")[1] ?? "")
      r.onerror = () => reject(r.error)
      r.readAsDataURL(blob)
    })
  const useSample = async () => extract("RFB-2026-114.pdf", "application/pdf", await toBase64(await (await fetch("/samples/oakridge-rfp.pdf")).blob()))
  const onFile = async (f?: File) => f && extract(f.name, f.type || "application/pdf", await toBase64(f))

  const input = "mt-1 w-full rounded-sm border border-neutral-300 bg-white px-2.5 py-1.5 text-[13px] text-neutral-900 outline-none focus:border-neutral-600"
  const field = (k: keyof ProjectBrief, label: string, wide = false) => (
    <label key={k} className={cn("block", wide && "col-span-2")}>
      <span className="text-[10px] tracking-wide text-neutral-500 uppercase">{label}</span>
      {k === "scope" ? (
        <textarea rows={3} value={brief[k]} onChange={e => setBrief({ ...brief, [k]: e.target.value })} className={input} />
      ) : (
        <input value={brief[k]} onChange={e => setBrief({ ...brief, [k]: e.target.value })} className={input} />
      )}
    </label>
  )

  return (
    <div className="mx-auto w-full max-w-[34rem]">
      <div className="mb-2 flex items-center gap-1 rounded-lg bg-muted p-1 text-sm">
        {(["fill", "view"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={cn("flex-1 rounded-md px-3 py-1.5 font-medium", tab === t ? "bg-background shadow-sm" : "text-muted-foreground")}>
            {t === "fill" ? "Fill out" : "View document"}
          </button>
        ))}
      </div>
      {tab === "view" ? (
        <BriefDoc live={live} brief={brief} />
      ) : (
        <Paper letterhead="City of Oakridge · Public Works" kind="New project · request for bids">
          <div className="rounded-sm border border-dashed border-neutral-300 bg-neutral-50 p-3">
            <p className="text-[12px] font-medium text-neutral-800">Have the RFP already? Upload it and Claude fills this in.</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
              <button onClick={useSample} disabled={!!busy} className="inline-flex items-center gap-1.5 rounded-sm bg-neutral-900 px-2.5 py-1.5 font-medium text-white disabled:opacity-60">
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : <FileUp className="size-3.5" />} Upload RFB-2026-114.pdf
              </button>
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm border border-neutral-300 bg-white px-2.5 py-1.5">
                Choose a file…
                <input type="file" accept=".pdf,.txt" className="hidden" onChange={e => onFile(e.target.files?.[0])} />
              </label>
              <a href="/samples/oakridge-rfp.pdf" download="RFB-2026-114.pdf" className="text-blue-800 underline">
                Download sample RFP
              </a>
            </div>
            {busy ? <p className="mt-2 text-[11px] text-neutral-500">Claude is reading {busy}…</p> : null}
            {msg ? <p className={cn("mt-2 text-[11px]", msg.ok ? "text-green-800" : "text-red-700")}>{msg.text}</p> : null}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {field("title", "Project title", true)}
            {field("location", "Location", true)}
            {field("scope", "Scope of work", true)}
            {field("line", "Contract line 1", true)}
            {field("amount", "Budget (USDC, 0.05–0.50)")}
            {field("finish", "Required completion")}
          </div>
          <button onClick={() => setTab("view")} className="mt-4 text-[12px] text-blue-800 underline">
            View the generated request for bids →
          </button>
        </Paper>
      )}
    </div>
  )
}

function DraftContract({ live, sub, brief = DEFAULT_BRIEF }: { live: Live; sub: boolean; brief?: ProjectBrief }) {
  const now = useNow(60_000) // 0 while prerendering, real time in the browser
  const agency = live.organizations.find(o => o.kind === "AGENCY")
  const prime = live.organizations.find(o => o.kind === "PRIME")
  const subOrg = live.organizations.find(o => o.kind === "SUB" && o.payoutWallet && o.verified)
  const payer = sub ? prime : agency
  const payee = sub ? subOrg : prime
  return (
    <Paper letterhead={payer ? titleCase(payer.name) : ""} kind={sub ? "Subcontract agreement" : "Public works contract"} stamp={<Stamp text="Draft" tone="blue" rotate={-6} />}>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Contract no." value="pending" />
        <Field label="Date" value={now ? fmtDate(new Date(now)) : "—"} />
        <Field label="Contract sum" value={fmtUsdc(sub ? 40_000n : briefAtomic(brief))} />
      </div>
      <p className="mt-3 text-neutral-700">
        <span className="font-medium">{payer ? titleCase(payer.name) : ""}</span> engages <span className="font-medium">{payee ? titleCase(payee.name) : ""}</span> for: <span className="font-medium">{sub ? "Railing lights" : brief.title}</span>.
      </p>
      <table className="mt-3 w-full text-left text-[12px]">
        <tbody>
          <tr className="border-y border-neutral-200">
            <td className="py-1.5">1</td>
            <td>{sub ? "Install railing lights" : brief.line}</td>
            <td className="text-right tabular-nums">{fmtUsdc(sub ? 40_000n : briefAtomic(brief))}</td>
          </tr>
        </tbody>
      </table>
      <div className="mt-6 flex gap-6">
        <Signature name="" signed={false} label={`For ${payer ? titleCase(payer.name) : ""}`} />
        <Signature name="" signed={false} label={`For ${payee ? titleCase(payee.name) : ""}`} />
      </div>
    </Paper>
  )
}

// A stylized site photo: sky, bridge deck and railing; varies by index.
function SitePhoto({ i, caption }: { i: number; caption: string }) {
  const skies = ["#cfe6f5", "#f6dfc2", "#dde9ef"]
  return (
    <figure className="min-w-0">
      <svg viewBox="0 0 120 80" className="aspect-[3/2] w-full rounded-sm border border-neutral-300">
        <rect width="120" height="80" fill={skies[i % 3]} />
        <circle cx={90 - i * 20} cy="18" r="7" fill="#f4c35b" opacity="0.8" />
        <rect y="52" width="120" height="28" fill="#8a8f94" />
        <rect y="50" width="120" height="4" fill="#5d6166" />
        {Array.from({ length: 9 }, (_, k) => (
          <rect key={k} x={6 + k * 13} y={i === 1 ? 34 : 30} width="2.5" height={i === 1 ? 18 : 22} fill="#3f4448" />
        ))}
        <rect y={i === 1 ? 33 : 29} width="120" height="2.5" fill="#3f4448" />
        {i === 2 ? Array.from({ length: 5 }, (_, k) => <circle key={k} cx={12 + k * 24} cy="27" r="2.2" fill="#fde68a" />) : null}
        <text x="4" y="76" fontSize="5" fill="#fff" opacity="0.9">
          GPS 37.80N 122.27W
        </text>
      </svg>
      <figcaption className="mt-1 truncate text-[10px] text-neutral-500">{caption}</figcaption>
    </figure>
  )
}

function EvidenceDoc({ line, payeeName }: { line?: Live["milestones"][number]; payeeName: string }) {
  if (!line) return <Placeholder text="Waiting for work…" />
  const refs = (line.evidenceRefs || "site-photo-1.jpg, site-photo-2.jpg, daily-report.pdf").split(",").map(r => r.trim())
  return (
    <Paper letterhead={payeeName} kind="Progress evidence">
      <div className="grid grid-cols-3 gap-3">
        <Field label="Line" value={`${line.lineNo} · ${line.description}`} />
        <Field label="Value" value={fmtUsdc(line.scheduledValue)} />
        <Field label="Status" value={line.state === "NOT_STARTED" ? "Not submitted" : "Submitted"} />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {[0, 1, 2].map(i => (
          <SitePhoto key={i} i={i} caption={refs[i] ?? `site-photo-${i + 1}.jpg`} />
        ))}
      </div>
      <div className="mt-4 rounded-sm bg-neutral-100 p-3 text-[12px]">
        <p className="mb-1 text-[10px] tracking-wide text-neutral-500 uppercase">Daily report</p>
        <div className="grid grid-cols-4 gap-2">
          <Field label="Crew" value="6" />
          <Field label="Hours" value="48" />
          <Field label="Weather" value="Clear, 68°F" />
          <Field label="Safety" value="No incidents" />
        </div>
      </div>
    </Paper>
  )
}

function InspectionDoc({ line, inspector, payerName }: { line?: Live["milestones"][number]; inspector: string; payerName: string }) {
  if (!line) return <Placeholder text="Waiting for evidence…" />
  const accepted = line.state === "ACCEPTED"
  const items = ["Work matches the contract scope", "Materials meet specification", "Photos match the site location", "Site left safe and clean"]
  return (
    <Paper letterhead={payerName} kind="Field inspection report" stamp={accepted ? <Stamp text="Accepted" /> : undefined}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Line" value={`${line.lineNo} · ${line.description}`} />
        <Field label="Inspected" value={dateOf(line.reviewedAt)} />
      </div>
      <ul className="mt-4 space-y-2">
        {items.map((t, i) => (
          <li key={t} className="flex items-center gap-2">
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: accepted ? 1 : 0.001 }}
              transition={{ delay: 0.15 * i }}
              className="grid size-4 place-items-center rounded-sm border border-neutral-400 bg-green-700 text-white"
            >
              <Check className="size-3" strokeWidth={3} />
            </motion.span>
            {!accepted ? <span className="-ml-6 size-4 rounded-sm border border-neutral-400" /> : null}
            <span>{t}</span>
          </li>
        ))}
      </ul>
      {line.reviewNote ? <p className="mt-3 text-neutral-600">Notes: “{line.reviewNote}”</p> : null}
      <div className="mt-6 flex gap-6">
        <Signature name={inspector} signed={accepted} label="Inspector" />
      </div>
    </Paper>
  )
}

function PayAppDoc({ live, x, sub, annotate, approvals }: { live: Live; x: Parts; sub: boolean; annotate: boolean; approvals: boolean }) {
  const bill = sub ? x.bill2 : x.bill1
  const c = sub ? x.sub : x.contract
  if (!bill || !c) return <Placeholder text="Preparing the bill…" />
  const payer = live.organizations.find(o => o.id === bill.payerOrgId)
  const payee = live.organizations.find(o => o.id === bill.payeeOrgId)
  const lines = live.milestones.filter(m => m.contractId === c.id).sort((a, b) => a.lineNo - b.lineNo)
  const votes = live.approvals.filter(a => a.invoiceId === bill.id && a.kind === "PAYMENT" && a.vote === "APPROVE").sort((a, b) => (a.id < b.id ? -1 : 1))
  const name = (hex?: string) => live.members.find(m => m.identity.toHexString() === hex)?.displayName ?? ""
  const reasons = bill.matchReasons ? bill.matchReasons.split("\n").filter(Boolean).slice(0, 3) : []
  return (
    <Paper
      letterhead={payee ? titleCase(payee.name) : ""}
      kind={sub ? "Subcontractor invoice" : "Application for payment (G702)"}
      stamp={bill.state === "SETTLED" ? <Stamp text="Paid" /> : bill.state === "PAYMENT_FROZEN" ? <Stamp text="On hold" tone="red" /> : votes.length >= 2 ? <Stamp text="Approved" /> : undefined}
    >
      <div className="grid grid-cols-3 gap-3">
        <Field label="Application no." value={docNo(bill)} />
        <Field label="To" value={payer ? titleCase(payer.name) : ""} />
        <Field label="Period to" value={dateOf(bill.submittedAt ?? bill.createdAt)} />
        <Field label="Contract" value={contractNo(c)} />
        <Field label="Contract sum" value={fmtUsdc(c.totalValue)} />
        <Field label="Pay to wallet" value={short(bill.beneficiaryWallet, 6, 4)} />
      </div>
      <table className="mt-4 w-full text-left text-[12px]">
        <thead className="text-[10px] tracking-wide text-neutral-500 uppercase">
          <tr className="border-b border-neutral-300">
            <th className="py-1">Item</th>
            <th>Description</th>
            <th className="text-right">Scheduled</th>
            <th className="text-right">This period</th>
          </tr>
        </thead>
        <tbody>
          {lines.map(m => {
            const billed = bill.milestoneIds.includes(m.id)
            return (
              <tr key={String(m.id)} className={cn("border-b border-neutral-200", billed && annotate && "bg-green-50")}>
                <td className="py-1.5">{m.lineNo}</td>
                <td>{m.description}</td>
                <td className="text-right tabular-nums">{fmtUsdc(m.scheduledValue)}</td>
                <td className="text-right font-medium tabular-nums">{billed ? fmtUsdc(bill.amount) : "—"}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="mt-3 flex justify-between border-t border-neutral-300 pt-2 font-semibold">
        <span>Current payment due</span>
        <span className="tabular-nums">{fmtUsdc(bill.amount)}</span>
      </div>
      {annotate && reasons.length ? (
        <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="mt-3 rounded-sm border-l-4 border-blue-700 bg-blue-50 p-2 text-[11px] text-blue-950">
          <p className="mb-1 font-semibold">Agent review · {bill.matchResult.toLowerCase()}</p>
          {reasons.map(r => (
            <p key={r} className="truncate">• {r}</p>
          ))}
        </motion.div>
      ) : null}
      {approvals ? (
        <div className="mt-5 flex gap-6">
          <Signature name={name(votes[0]?.approver.toHexString())} signed={!!votes[0]} label="Approver 1" />
          <Signature name={name(votes[1]?.approver.toHexString())} signed={!!votes[1]} label="Approver 2" delay={0.3} />
        </div>
      ) : null}
    </Paper>
  )
}

function CrsReportDoc({ live, x, sub }: { live: Live; x: Parts; sub: boolean }) {
  const bill = sub ? x.bill2 : x.bill1
  if (!bill) return <Placeholder text="Waiting for the bill…" />
  const payee = live.organizations.find(o => o.id === bill.payeeOrgId)
  const v = [...live.verifications].filter(z => z.invoiceId === bill.id).sort((a, b) => (a.checkedAt.microsSinceUnixEpoch > b.checkedAt.microsSinceUnixEpoch ? -1 : 1))[0] as
    | (Live["verifications"][number] & { decision?: string })
    | undefined
  const reasons = v?.reasons ? v.reasons.split(",").filter(Boolean) : []
  return (
    <Paper letterhead="CRS Credit API · sandbox" kind="Business verification report" stamp={v ? <Stamp text={(v.decision ?? (v.passed ? "PASS" : "FAIL")) === "PASS" ? "Clear" : "Flagged"} tone={(v.decision ?? "PASS") === "PASS" ? "green" : "red"} /> : undefined}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Subject" value={payee ? titleCase(payee.name) : ""} />
        <Field label="Requested for" value={docNo(bill)} />
        <Field label="Wallet" value={short(bill.beneficiaryWallet, 6, 4)} />
        <Field label="Attestation" value={v?.identityHash ? short(v.identityHash, 6, 4) : "pending"} />
      </div>
      <ul className="mt-4 divide-y divide-neutral-200">
        {CRS_CHECKS.map(c => {
          const flagged = reasons.filter(r => c.reasons.test(r))
          const ran = !!v && v.products.includes(c.product)
          return (
            <li key={c.id} className="flex items-center gap-2 py-1.5">
              <span className={cn("grid size-4 shrink-0 place-items-center rounded-sm text-white", !v ? "bg-neutral-300" : flagged.length ? "bg-red-700" : ran ? "bg-green-700" : "bg-neutral-300")}>
                {v && ran && !flagged.length ? <Check className="size-3" strokeWidth={3} /> : flagged.length ? <ShieldAlert className="size-3" /> : null}
              </span>
              <span className="flex-1">{c.label}</span>
              <span className="text-[11px] text-neutral-500">{!v ? "querying…" : flagged.length ? flagged.map(crsReason).join(", ") : ran ? c.source : "not run"}</span>
            </li>
          )
        })}
      </ul>
      <p className="mt-3 text-[10px] text-neutral-500">Only the result and an attestation hash are stored. No SSN, date of birth or raw report.</p>
    </Paper>
  )
}

// Nakamura's progress package for Okafor: daily report, materials receipt and Okafor's inspection (demo documents
// around the live line and bill).
function ProgressDoc({ live, x }: { live: Live; x: Parts }) {
  const line = x.line2
  const reviewer = line?.reviewedBy ? live.members.find(m => m.identity.isEqual(line.reviewedBy!)) : undefined
  return (
    <Paper letterhead="Nakamura Electric Inc." kind="Progress package · railing lights" stamp={line?.state === "ACCEPTED" ? <Stamp text="Accepted" /> : undefined}>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Line" value={line?.description ?? "Install railing lights"} />
        <Field label="Scheduled" value={fmtUsdc(line?.scheduledValue ?? 40_000n)} />
        <Field label="Status" value={titleCase((line?.state ?? "in progress").replaceAll("_", " "))} />
      </div>
      <p className="mt-3 text-[10px] font-semibold tracking-wide text-neutral-500 uppercase">Daily report</p>
      <ul className="mt-1 list-disc pl-4 text-[12px] text-neutral-700">
        <li>24 LED railing fixtures mounted on the north span; conduit run complete</li>
        <li>Crew: 3 electricians, 22 hours · no safety incidents</li>
        <li>Circuit tested and energized</li>
      </ul>
      <p className="mt-3 text-[10px] font-semibold tracking-wide text-neutral-500 uppercase">Materials receipt</p>
      <table className="mt-1 w-full text-[12px]">
        <tbody>
          <tr className="border-y border-neutral-200">
            <td className="py-1">Westline Electrical Supply · INV-88213</td>
            <td>24 × LED railing fixture, conduit, fittings</td>
            <td className="text-right text-green-800">✓ matches scope</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-3 text-[10px] font-semibold tracking-wide text-neutral-500 uppercase">Inspection</p>
      <p className="text-[12px] text-neutral-700">
        {line?.state === "ACCEPTED"
          ? `Accepted by ${titleCase(reviewer?.displayName ?? "Okafor's inspector")}${line.reviewNote ? `: “${line.reviewNote}”` : ""}`
          : "Waiting for Okafor's inspector"}
      </p>
      <p className="mt-2 text-[10px] text-neutral-400">Report and receipt are demo documents; the line, inspection and bill are live.</p>
    </Paper>
  )
}

function ReceiptDoc({ live, x, sub }: { live: Live; x: Parts; sub: boolean }) {
  const bill = sub ? x.bill2 : x.bill1
  if (!bill) return <Placeholder text="Waiting for approvals…" />
  const pay = live.payments.find(p => p.invoiceId === bill.id && p.state !== "FAILED")
  const payer = live.organizations.find(o => o.id === bill.payerOrgId)
  const payee = live.organizations.find(o => o.id === bill.payeeOrgId)
  return (
    <Paper letterhead="Base Sepolia · USDC" kind="Payment receipt" stamp={pay?.state === "CONFIRMED" ? <Stamp text="Confirmed" /> : undefined}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="From" value={payer ? `${titleCase(payer.name)}` : ""} />
        <Field label="To" value={payee ? titleCase(payee.name) : ""} />
        <Field label="From wallet" value={short(payer?.treasuryWallet ?? "", 6, 4)} />
        <Field label="To wallet" value={short(pay?.toWallet ?? bill.beneficiaryWallet, 6, 4)} />
        <Field label="Amount" value={fmtUsdc(bill.amount)} />
        <Field label="For" value={docNo(bill)} />
      </div>
      <div className="mt-4 rounded-sm bg-neutral-100 p-3 font-mono text-[11px] break-all">
        {pay?.txHash ? pay.txHash : pay ? `payment ${pay.state.toLowerCase()}…` : "awaiting payout…"}
      </div>
      {pay?.txHash && !pay.simulated ? (
        <a href={`https://sepolia.basescan.org/tx/${pay.txHash}`} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[11px] text-blue-800 underline">
          View on Basescan
        </a>
      ) : null}
      {pay ? (
        <div className="mt-3 border-t border-neutral-200 pt-2">
          <p className="text-[10px] font-semibold tracking-wide text-neutral-500 uppercase">Receipt verification</p>
          <ul className="mt-1 space-y-0.5 text-[12px]">
            {[
              ["Transaction confirmed", pay.state === "CONFIRMED" && !!pay.txHash],
              ["Amount equals the approved bill", pay.amount === bill.amount],
              ["Paid to the payee's verified wallet", !!payee && pay.toWallet.toLowerCase() === payee.payoutWallet.toLowerCase()],
              ["Paid from the payer's treasury", !!payer?.treasuryWallet],
              ["Recorded on both ledgers", pay.state === "CONFIRMED"],
            ].map(([t, ok]) => (
              <li key={String(t)} className={ok ? "text-green-800" : "text-neutral-500"}>
                {ok ? "✓" : "…"} {t}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Paper>
  )
}

// A red-flag callout pinned to part of the impostor email.
function Flag({ n, children }: { n: number; children: ReactNode }) {
  return (
    <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.6 + n * 0.5, type: "spring", stiffness: 320, damping: 16 }} className="ml-1 inline-grid size-4 place-items-center rounded-full bg-red-700 align-middle text-[10px] font-bold text-white">
      {children}
    </motion.span>
  )
}

// The impostor's email as the city's payables inbox receives it, with what gives it away.
function PhishingDoc({ live, x }: { live: Live; x: Parts }) {
  const bill = x.bill1
  const prime = live.organizations.find(o => o.kind === "PRIME")
  const people = prime ? live.members.filter(m => m.orgId === prime.id) : []
  const flags = [
    ["Look-alike domain", "okafor-builders.co, not the domain Okafor signed the contract from."],
    ["Pressure", "“URGENT” and “late fees”: rushes the clerk past a phone call."],
    ["Unknown sender", `No “Victor Anand” at Okafor. Its verified people are ${people.map(m => titleCase(m.displayName).split(" ")[0]).join(", ") || "on file"}.`],
    ["Brand-new wallet", "Never used before and not bound to Okafor's CRS-verified owner."],
  ]
  return (
    <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="relative mx-auto w-full max-w-[34rem] overflow-hidden rounded-md border bg-white text-[13px] text-neutral-800 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.25)] dark:bg-neutral-100">
      <div className="flex items-center justify-between bg-neutral-800 px-4 py-2 text-xs text-white">
        <span className="font-semibold">Inbox · ap@cityofoakridge.gov</span>
        <span className="text-neutral-400">just now</span>
      </div>
      <div className="space-y-1 border-b border-neutral-200 px-4 py-3 text-[12px]">
        <p>
          <span className="text-neutral-500">From:</span> Victor Anand &lt;accounts@okafor-builders.co&gt;
          <Flag n={1}>1</Flag>
          <Flag n={3}>3</Flag>
        </p>
        <p><span className="text-neutral-500">To:</span> ap@cityofoakridge.gov</p>
        <p>
          <span className="text-neutral-500">Subject:</span> URGENT: updated payment details for {bill ? docNo(bill) : "your pay application"}
          <Flag n={2}>2</Flag>
        </p>
        <p><span className="text-neutral-500">Attachment:</span> <span className="rounded bg-neutral-100 px-1">Okafor_bank_letter.pdf</span></p>
      </div>
      <div className="px-4 py-3 leading-relaxed">
        <p>Hello Accounts Payable,</p>
        <p className="mt-2">
          Our bank account was moved after an audit. Please send {bill ? `${docNo(bill)} (${fmtUsdc(bill.amount)})` : "the pay application"} to our new wallet{" "}
          <span className="rounded bg-red-50 px-1 font-mono text-red-800">{short(IMPOSTOR_WALLET, 8, 6)}</span>
          <Flag n={4}>4</Flag> today. Payments to the old account will bounce and incur late fees.
        </p>
        <p className="mt-2">Thanks,<br />Victor Anand, Accounts Receivable · Okafor Builders</p>
      </div>
      <ol className="space-y-1.5 border-t border-neutral-200 bg-red-50/60 px-4 py-3 text-[12px]">
        {flags.map(([t, d], i) => (
          <motion.li key={t} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.8 + i * 0.5 }} className="flex gap-2">
            <span className="grid size-4 shrink-0 place-items-center rounded-full bg-red-700 text-[10px] font-bold text-white">{i + 1}</span>
            <span><span className="font-semibold">{t}.</span> <span className="text-neutral-600">{d}</span></span>
          </motion.li>
        ))}
      </ol>
      <div className="border-t border-neutral-200 bg-neutral-50 px-4 py-2 text-[11px] text-neutral-500">
        Verified wallet on file: <span className="font-mono">{short(bill?.beneficiaryWallet ?? "", 8, 6)}</span> · bound to Okafor&apos;s CRS-verified owner
      </div>
    </motion.div>
  )
}

function EmailDoc({ x }: { x: Parts }) {
  const c = x.change
  if (!c) return <Placeholder text="No change requests" />
  const bill = x.bill1
  return (
    <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="relative mx-auto w-full max-w-[34rem] overflow-hidden rounded-md border bg-white text-[13px] text-neutral-800 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.25)] dark:bg-neutral-100">
      <div className="flex items-center gap-2 bg-red-700 px-4 py-2 text-xs font-semibold text-white">
        <ShieldAlert className="size-4" /> {c.state === "PENDING" ? "Payment frozen: wallet change requested" : c.state === "REJECTED" ? "Wallet change rejected · payment protected" : "Wallet change accepted"}
      </div>
      <div className="space-y-1 border-b border-neutral-200 px-4 py-3 text-[12px]">
        <p><span className="text-neutral-500">From:</span> accounts@okafor-builders.co <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-800">look-alike domain</span></p>
        <p><span className="text-neutral-500">To:</span> ap@cityofoakridge.gov</p>
        <p><span className="text-neutral-500">Subject:</span> URGENT: updated payment details for {bill ? docNo(bill) : "your pay application"}</p>
      </div>
      <div className="px-4 py-4 leading-relaxed">
        <p>Hello Accounts Payable,</p>
        <p className="mt-2">Our bank account was moved after an audit. Please send {bill ? docNo(bill) : "the pay application"} to our new wallet <span className="rounded bg-red-50 px-1 font-mono text-red-800">{short(c.requestedWallet, 8, 6)}</span> today.</p>
        <p className="mt-2">Thanks,<br />Victor Anand, Accounts Receivable · Okafor Builders</p>
      </div>
      <div className="grid grid-cols-2 border-t border-neutral-200 text-[12px]">
        <div className="border-r border-neutral-200 bg-green-50/70 px-4 py-3">
          <p className="text-[10px] font-semibold tracking-wide text-green-800 uppercase">On file</p>
          <p className="mt-1 font-mono">{short(c.previousWallet, 8, 6)}</p>
          <p className="mt-1 text-neutral-600">Owner: Okafor Builders LLC</p>
          <p className="text-green-800">✓ CRS identity verified</p>
          <p className="text-green-800">✓ Used on signed contract</p>
        </div>
        <div className="bg-red-50/70 px-4 py-3">
          <p className="text-[10px] font-semibold tracking-wide text-red-800 uppercase">Requested</p>
          <p className="mt-1 font-mono">{short(c.requestedWallet, 8, 6)}</p>
          <p className="mt-1 text-neutral-600">Asked by: “Victor Anand”</p>
          <p className="text-red-800">✗ Not a verified person</p>
          <p className="text-red-800">✗ Never seen before</p>
        </div>
      </div>
      <ol className="space-y-1 border-t border-neutral-200 bg-neutral-50 px-4 py-3 text-[11.5px] text-neutral-600">
        {["Bill frozen: no money can move", "Agent re-verifies Okafor with CRS", "Agent checks who sent the email with CRS", "Two approvers decide; neither can be the requester"].map((t, i) => (
          <motion.li key={t} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 + i * 0.4 }}>
            {i + 1}. {t}
          </motion.li>
        ))}
      </ol>
    </motion.div>
  )
}

function CaseFileDoc({ live, x }: { live: Live; x: Parts }) {
  const bill = x.bill1
  const f = bill ? [...live.findings].filter(z => z.kind === "RISK_CASE" && z.subjectId === bill.id).sort((a, b) => (a.id > b.id ? -1 : 1))[0] : undefined
  const flags = f?.flags ? f.flags.split(",").map(z => z.trim()).filter(Boolean) : []
  const denied = flags.some(z => /IDENTITY_FAILED|CLAIMANT/.test(z)) || f?.result === "HIGH"
  return (
    <Paper letterhead="City of Oakridge · agency agent" kind="Fraud case file" stamp={denied ? <Stamp text="Access denied" tone="red" rotate={-8} /> : undefined}>
      {f ? (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Bill" value={bill ? docNo(bill) : ""} />
            <Field label="Risk" value={<span className={f.result === "HIGH" ? "text-red-700" : ""}>{f.result}</span>} />
            <Field label="Model" value={f.modelId || "—"} />
          </div>
          <p className="mt-3 line-clamp-6 whitespace-pre-line text-neutral-700">{f.body.split("\n\n")[0]}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {flags.map(z => (
              <span key={z} className="rounded bg-red-50 px-1.5 py-0.5 text-[11px] text-red-800">{z.toLowerCase().replaceAll("_", " ")}</span>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-neutral-500">The agent recommends; two people decide.</p>
        </>
      ) : (
        <p className="text-neutral-500">The agent is re-verifying the payee and checking who sent the request…</p>
      )}
    </Paper>
  )
}

// Every applicant's CRS screening, as a report the city files before awarding.
function ScreeningDoc({ live, selected }: { live: Live; selected: boolean }) {
  const [open, setOpen] = useState<bigint | null>(null)
  const agency = live.organizations.find(o => o.kind === "AGENCY")
  const applicants = live.organizations
    .filter(o => o.kind !== "AGENCY")
    .filter(o => o.kind === "PRIME" || !(o.payoutWallet && o.verified && live.contracts.some(c => c.payeeOrgId === o.id)))
    .map(o => {
      const v = [...live.verifications]
        .filter(z => z.orgId === o.id && z.subjectType === "ORG")
        .sort((a, b) => (a.checkedAt.microsSinceUnixEpoch < b.checkedAt.microsSinceUnixEpoch ? -1 : 1))[0] as (Live["verifications"][number] & { decision?: string }) | undefined
      const reasons = v?.reasons ? v.reasons.split(",").filter(Boolean) : []
      return { o, d: v ? (v.decision ?? (v.passed ? "PASS" : "FAIL")) : "PENDING", reasons, products: v?.products ?? "" }
    })
    .sort((a, b) => (a.o.kind === "PRIME" ? 1 : 0) - (b.o.kind === "PRIME" ? 1 : 0))
  const tone = (d: string) => (d === "PASS" ? "border-green-700 text-green-700" : d === "REVIEW" ? "border-amber-600 text-amber-700" : "border-red-700 text-red-700")
  return (
    <Paper letterhead={agency ? titleCase(agency.name) : "Agency"} kind="Contractor screening report · CRS">
      <p className="mb-3 text-[12px] text-neutral-600">Bridge railing repair · {applicants.length} applicants · click an applicant to see each check</p>
      <ul className="divide-y divide-neutral-200">
        {applicants.map((a, i) => {
          const isOpen = open === a.o.id
          return (
            <motion.li key={String(a.o.id)} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.35 }} className={cn(selected && a.o.kind === "PRIME" && "-mx-2 rounded bg-green-50 px-2")}>
              <button onClick={() => setOpen(isOpen ? null : a.o.id)} className="flex w-full items-center gap-3 py-2 text-left">
                <ChevronRight className={cn("size-3.5 shrink-0 text-neutral-400 transition-transform", isOpen && "rotate-90")} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-neutral-900">{titleCase(a.o.name)}</span>
                  <span className="block truncate text-[11px] text-neutral-500">{a.reasons[0] ? crsReason(a.reasons[0]) : a.d === "PASS" ? "No issues found" : "—"}</span>
                </span>
                {selected && a.o.kind === "PRIME" ? <span className="text-[11px] font-semibold text-green-700">Selected</span> : null}
                <motion.span
                  initial={{ scale: 1.8, opacity: 0, rotate: -12 }}
                  animate={{ scale: 1, opacity: 1, rotate: -6 }}
                  transition={{ delay: 0.45 + i * 0.35, type: "spring", stiffness: 260, damping: 14 }}
                  className={cn("rounded border-2 px-1.5 py-0.5 text-[10px] font-bold tracking-widest uppercase", tone(a.d))}
                >
                  {a.d === "PASS" ? "Pass" : a.d === "REVIEW" ? "Review" : a.d === "FAIL" ? "Fail" : "…"}
                </motion.span>
              </button>
              {isOpen ? (
                <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} className="mb-2 ml-6 space-y-1 overflow-hidden rounded-sm bg-neutral-50 p-2.5 text-[12px]">
                  {CRS_CHECKS.map(c => {
                    const hits = a.reasons.filter(r => c.reasons.test(r))
                    const ran = a.products.split(",").some(p => p.trim().startsWith(c.product))
                    return (
                      <li key={c.id} className="flex items-start gap-2">
                        <span className={cn("w-3 shrink-0 font-bold", hits.length ? "text-red-700" : ran ? "text-green-700" : "text-neutral-400")}>{hits.length ? "✗" : ran ? "✓" : "·"}</span>
                        <span className="min-w-0 flex-1">
                          <span className="font-medium text-neutral-900">{c.label}</span> <span className="text-neutral-500">· {c.question}</span>
                          {hits.length ? <span className="block text-red-700">{hits.map(crsReason).join(", ")}</span> : null}
                        </span>
                        <span className="shrink-0 text-[11px] text-neutral-500">{ran ? c.source : "not run"}</span>
                      </li>
                    )
                  })}
                </motion.ul>
              ) : null}
            </motion.li>
          )
        })}
      </ul>
      <p className="mt-3 text-[10px] text-neutral-500">Bidding is simulated for the demo; each result is a real CRS sandbox check. Only results and attestation hashes are stored.</p>
    </Paper>
  )
}

// The chosen contractor's six CRS checks, each with the question it answers and its source.
function PickChecksDoc({ live }: { live: Live }) {
  const prime = live.organizations.find(o => o.kind === "PRIME")
  const v = prime
    ? ([...live.verifications].filter(z => z.orgId === prime.id && z.subjectType === "ORG").sort((a, b) => (a.checkedAt.microsSinceUnixEpoch > b.checkedAt.microsSinceUnixEpoch ? -1 : 1))[0] as
        | (Live["verifications"][number] & { decision?: string })
        | undefined)
    : undefined
  const reasons = v?.reasons ? v.reasons.split(",").filter(Boolean) : []
  const d = v ? (v.decision ?? (v.passed ? "PASS" : "FAIL")) : "PENDING"
  return (
    <Paper letterhead="CRS Credit API · sandbox" kind={`${prime ? titleCase(prime.name) : "Contractor"} · pre-award checks`} stamp={<Stamp text={d === "PASS" ? "Pass" : d} tone={d === "PASS" ? "green" : "red"} />}>
      <div className="mb-3 grid grid-cols-3 gap-3">
        <Field label="Role" value="Prime contractor" />
        <Field label="Result" value={d === "PASS" ? "All checks clean" : "Flagged"} />
        <Field label="CRS hash" value={prime?.identityHash ? short(prime.identityHash, 6, 4) : "—"} />
      </div>
      <ul className="divide-y divide-neutral-200">
        {CRS_CHECKS.map((c, i) => {
          const flagged = reasons.filter(r => c.reasons.test(r))
          const ran = !!v && v.products.includes(c.product)
          const mock = !!v && v.products.split(",").some(p => p.trim() === `${c.product}:mock`)
          const ok = ran && !flagged.length
          return (
            <motion.li key={c.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.45 }} className="flex items-center gap-3 py-2.5">
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.45 + i * 0.45, type: "spring", stiffness: 300, damping: 15 }}
                className={cn("grid size-6 shrink-0 place-items-center rounded-full text-white", ok ? "bg-green-700" : flagged.length ? "bg-red-700" : "bg-neutral-300")}
              >
                {ok ? <Check className="size-3.5" strokeWidth={3} /> : flagged.length ? <ShieldAlert className="size-3.5" /> : null}
              </motion.span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-neutral-900">
                  {c.label}
                  {mock ? <span className="ml-1 text-[11px] font-normal text-neutral-500">(mock)</span> : null}
                </span>
                <span className="block text-[12px] text-neutral-600">{c.question}</span>
              </span>
              <span className="shrink-0 text-right text-[11px] text-neutral-500">{flagged.length ? flagged.map(crsReason).join(", ") : ran ? c.source : "not run"}</span>
            </motion.li>
          )
        })}
      </ul>
    </Paper>
  )
}

function Placeholder({ text }: { text: string }) {
  return (
    <div className="mx-auto grid h-72 w-full max-w-[34rem] place-items-center rounded-sm border border-dashed text-sm text-muted-foreground">{text}</div>
  )
}

export function StepDocument({
  step,
  live,
  contractId,
  brief = DEFAULT_BRIEF,
  setBrief,
}: {
  step: LiveStep
  live: Live
  contractId?: bigint
  brief?: ProjectBrief
  setBrief?: (b: ProjectBrief) => void
}) {
  const x = projectParts(live, contractId)
  const nameOf = (orgId?: bigint) => titleCase(live.organizations.find(o => o.id === orgId)?.name ?? "")
  const sub = step.level === "sub"
  const k = step.key
  if (k === "post") return setBrief && !step.done ? <BriefEditor live={live} brief={brief} setBrief={setBrief} /> : <BriefDoc live={live} brief={brief} />
  if (k === "checks") return <PickChecksDoc live={live} />
  if (k === "negotiate") return <DraftContract live={live} sub={false} brief={brief} />
  if (k === "screen") return <ScreeningDoc live={live} selected={false} />
  if (k === "select") return <ScreeningDoc live={live} selected={step.done} />
  if (k === "issue" || k === "prime-sign" || k === "agency-sign") return <ContractDoc live={live} x={x} sub={false} nameOf={nameOf} />
  if (k === "sub-hire") return <ContractDoc live={live} x={x} sub nameOf={nameOf} />
  if (k === "gov-freeze") return <EmailDoc x={x} />
  if (k === "gov-reject") return <CaseFileDoc live={live} x={x} />
  if (k === "gov-fraud") return x.change ? <EmailDoc x={x} /> : <PhishingDoc live={live} x={x} />
  const line = sub ? x.line2 : x.line1
  const payerName = nameOf(sub ? x.sub?.payerOrgId : x.contract?.payerOrgId)
  const payeeName = nameOf(sub ? x.sub?.payeeOrgId : x.contract?.payeeOrgId)
  if (k === "gov-evidence") return <EvidenceDoc line={line} payeeName={payeeName} />
  if (k === "gov-accept") {
    const reviewer = line?.reviewedBy
    const inspector = reviewer ? (live.members.find(m => m.identity.isEqual(reviewer))?.displayName ?? "") : ""
    return <InspectionDoc line={line} inspector={inspector} payerName={payerName} />
  }
  if (k === "sub-work") return <ProgressDoc live={live} x={x} />
  if (k === "gov-bill") return <PayAppDoc live={live} x={x} sub={false} annotate={false} approvals={false} />
  if (k.endsWith("-agent")) return <PayAppDoc live={live} x={x} sub={sub} annotate approvals={false} />
  if (k.endsWith("-crs")) return <CrsReportDoc live={live} x={x} sub={sub} />
  if (k.includes("-approve")) return <PayAppDoc live={live} x={x} sub={sub} annotate approvals />
  if (k.endsWith("-paid")) return <ReceiptDoc live={live} x={x} sub={sub} />
  return null
}
