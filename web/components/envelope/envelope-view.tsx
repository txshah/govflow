"use client"

/**
 * The shared payment envelope for one bill: the only cross-org view. Shows who pays whom, the six-stage pipeline, the agent's match, CRS checks on the payee, approvals, any wallet-change request with its case file, the payout with its transaction, and this bill's audit trail.
 *
 * Inputs:
 * - invoiceId from the URL; focus "case" puts the fraud case file first
 * - Live rows visible to the signed-in persona
 *
 * Outputs:
 * - Detail screen with the ApprovalPanel for the signed-in person
 */

import Link from "next/link"
import { ArrowLeft, ArrowRight, ShieldCheck, Snowflake, TriangleAlert } from "lucide-react"
import { useLive } from "@/components/app/providers"
import { Empty, PageHeader, Section } from "@/components/app/page-header"
import { BillStepper } from "@/components/BillStepper"
import { ApprovalPanel } from "@/components/ApprovalPanel"
import { StatusBadge, Pill } from "@/components/StatusBadge"
import { VerificationBadge } from "@/components/VerificationBadge"
import { TxLink } from "@/components/TxLink"
import { approvalsFor, orgName } from "@/lib/domain"
import { describeAudit } from "@/lib/describe"
import { actorName, agentLabel, crsProducts, crsReason, fmtTime, fmtUsdc, freezeReasonLabel, humanize, kindLabel, short, tidy, timeAgo, titleCase, docNo } from "@/lib/format"

export function EnvelopeView({ invoiceId, focus }: { invoiceId: string; focus?: "case" }) {
  const live = useLive()
  const id = (() => {
    try {
      return BigInt(invoiceId)
    } catch {
      return -1n
    }
  })()
  const inv = live.invoices.find(i => i.id === id)
  if (!live.ready) return <PageHeader title="Loading…" />
  if (!inv)
    return (
      <>
        <PageHeader title={`Bill #${invoiceId}`} description="Not found, or not visible to the person you're signed in as. Only the payer and payee can see a bill." />
        <Link href="/" className="text-sm text-info hover:underline">
          Back to the payment flow
        </Link>
      </>
    )

  const payer = live.organizations.find(o => o.id === inv.payerOrgId)
  const payee = live.organizations.find(o => o.id === inv.payeeOrgId)
  const lines = live.milestones.filter(m => inv.milestoneIds.includes(m.id))
  const nameOf = (hex: string) => live.members.find(m => m.identity.toHexString() === hex)?.displayName ?? "A verified approver"
  const votes = [...approvalsFor(live, inv), ...approvalsFor(live, inv, "UNFREEZE")]
  const pastVotes = live.approvals.filter(a => a.invoiceId === inv.id && a.round !== inv.approvalRound)
  const checks = [...live.verifications]
    .filter(v => v.orgId === inv.payeeOrgId)
    .sort((a, b) => (a.checkedAt.microsSinceUnixEpoch > b.checkedAt.microsSinceUnixEpoch ? -1 : 1)) as ((typeof live.verifications)[number] & { decision?: string })[]
  const changes = live.changes.filter(c => c.invoiceId === inv.id)
  const payments = live.payments.filter(p => p.invoiceId === inv.id)
  const findings = live.findings.filter(f => f.subjectType === "invoice" && f.subjectId === inv.id)
  const caseFiles = findings.filter(f => f.kind === "RISK_CASE")
  const trail = live.audit.filter(e => e.subjectType === "invoice" && e.subjectId === inv.id).sort((a, b) => (a.id > b.id ? 1 : -1))

  // The people's decision on the freeze (unfreeze votes, from whichever round they were cast in).
  const decisions = live.approvals.filter(a => a.invoiceId === inv.id && a.kind === "UNFREEZE")
  const decisionText = decisions.some(d => d.vote === "REJECT_CHANGE")
    ? "Wallet change rejected · paid to the original verified wallet"
    : decisions.some(d => d.vote === "ACCEPT_CHANGE")
      ? "Wallet change accepted after the owner proved the new wallet"
      : "Freeze released by two approvers"
  const hasCase = changes.length > 0 || caseFiles.length > 0 || inv.state === "PAYMENT_FROZEN"
  const caseSection = (
    <Section title="Fraud case file" description="Why this bill froze and what re-verification showed. Written by the risk agent; decided by people.">
      {changes.length || caseFiles.length || inv.state === "PAYMENT_FROZEN" ? (
        <div className="space-y-4">
          {inv.state === "PAYMENT_FROZEN" ? (
            <div className="flex items-start gap-3 rounded-lg bg-destructive/8 p-3 text-sm">
              <Snowflake className="mt-0.5 size-4 text-destructive" />
              <div>
                <p className="font-medium text-destructive">{freezeReasonLabel[inv.freezeReason] ?? inv.freezeReason}</p>
                <p className="text-muted-foreground">Frozen {timeAgo(inv.frozenAt)}. Money can&apos;t move until the payee re-verifies with CRS and two approvers agree.</p>
              </div>
            </div>
          ) : null}
          {changes.map(c => (
            <div key={String(c.id)} className="rounded-lg border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <TriangleAlert className="size-4 text-warning" />
                <span className="font-medium">Wallet change via {c.source.toLowerCase().replace("_", "-")}</span>
                <Pill tone={c.state === "PENDING" ? "warning" : c.state === "ACCEPTED" ? "success" : "neutral"}>{c.state.toLowerCase()}</Pill>
                <span className="ml-auto text-[11px] text-muted-foreground">{timeAgo(c.requestedAt)}</span>
              </div>
              <p className="mt-2 font-mono text-xs">
                {short(c.previousWallet, 8, 6)} <ArrowRight className="inline size-3" /> {short(c.requestedWallet, 8, 6)}
              </p>
              {c.note ? <p className="mt-1 text-muted-foreground">“{tidy(c.note)}”</p> : null}
              <p className="mt-1 text-xs text-muted-foreground">
                New wallet proven by its owner: {c.walletProofAt ? `yes, ${timeAgo(c.walletProofAt)}` : "no"}
              </p>
            </div>
          ))}
          {decisions.length ? (
            <div className="flex items-start gap-3 rounded-lg bg-success/10 p-3 text-sm">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />
              <div>
                <p className="font-medium text-success">{decisionText}</p>
                <p className="text-muted-foreground">
                  {decisions.map(d => titleCase(nameOf(d.approver.toHexString()))).join(" and ")} · after the payee re-verified with CRS
                </p>
              </div>
            </div>
          ) : null}
          {caseFiles.map(f => (
            <div key={String(f.id)} className="rounded-lg border p-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium">{agentLabel(f.agentId)}</span>
                <Pill tone={f.result === "LOW" ? "success" : "danger"}>risk {f.result.toLowerCase()}</Pill>
              </div>
              <p className="mt-1.5 text-sm whitespace-pre-line text-muted-foreground">{tidy(f.body)}</p>
              {f.flags ? (
                <p className="mt-2 flex flex-wrap gap-1 text-xs">
                  {f.flags.split(",").map(x => (
                    <Pill key={x} tone="danger">
                      {x.trim().toLowerCase().replaceAll("_", " ")}
                    </Pill>
                  ))}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <Empty>No fraud signals on this bill.</Empty>
      )}
    </Section>
  )

  return (
    <>
      <Link href={focus === "case" ? `/envelope/${inv.id}` : "/"} className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3" /> {focus === "case" ? "Back to the bill" : "Payment flow"}
      </Link>
      <PageHeader
        eyebrow={`${kindLabel[inv.kind]} · shared by payer and payee`}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {fmtUsdc(inv.amount)} <StatusBadge state={inv.state} />
          </span>
        }
        description={
          <>
            {titleCase(orgName(live, inv.payerOrgId))} pays {titleCase(orgName(live, inv.payeeOrgId))} · {docNo(inv)}
            {inv.draftedByAgent ? ` · drafted by ${agentLabel(inv.draftedByAgent)}` : ""}
          </>
        }
        actions={
          <>
            {inv.state === "PAYMENT_FROZEN" && focus !== "case" ? (
              <Link href={`/cases/${inv.id}`} className="text-sm text-destructive hover:underline">
                Open case file
              </Link>
            ) : null}
            <Link
              href={`/verify/${inv.id}`}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-transform hover:-translate-y-0.5"
            >
              <ShieldCheck className="size-4" /> Watch verification
            </Link>
          </>
        }
      />

      <div className="mb-6 rounded-xl border bg-card p-5">
        <BillStepper invoice={inv} size="full" />
        <div className="mt-5 border-t pt-4">
          <ApprovalPanel invoice={inv} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {focus === "case" || hasCase ? <div className="lg:col-span-2">{caseSection}</div> : null}

        <Section title="What's being billed" description={inv.memo ? `Payee's note: “${inv.memo}”` : undefined}>
          <ul className="divide-y text-sm">
            {lines.map(m => (
              <li key={String(m.id)} className="flex items-center gap-3 py-2">
                <span className="flex-1">
                  Line {m.lineNo} · {m.description}
                </span>
                <span className="tabular-nums text-muted-foreground">{fmtUsdc(m.scheduledValue)}</span>
              </li>
            ))}
            <li className="flex items-center gap-3 py-2 font-medium">
              <span className="flex-1">Billed</span>
              <span className="tabular-nums">{fmtUsdc(inv.amount)}</span>
            </li>
          </ul>
          {inv.matchResult ? (
            <div className="mt-4 rounded-lg bg-muted/60 p-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium">Agent check</span>
                <Pill tone={inv.matchResult === "MATCHED" ? "success" : inv.matchResult === "UNSURE" ? "warning" : "danger"}>{inv.matchResult.toLowerCase()}</Pill>
              </div>
              <p className="mt-1 text-sm">{inv.matchReasons.split("\n")[0]}</p>
              {inv.matchReasons.includes("\n") ? (
                <details className="mt-1 text-sm text-muted-foreground">
                  <summary className="cursor-pointer text-xs text-primary">Full reasoning</summary>
                  <p className="mt-1 whitespace-pre-line">{tidy(inv.matchReasons.split("\n").slice(1).join("\n"))}</p>
                </details>
              ) : null}
            </div>
          ) : null}
        </Section>

        <Section title="Who's being paid" description="Checked by CRS before any approval counts">
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{titleCase(payee?.name ?? "")}</span>
              {payee ? <VerificationBadge verified={payee.verified} hash={payee.identityHash} decision={checks[0]?.decision} reasons={checks[0]?.reasons} /> : null}
            </div>
            <p className="font-mono text-xs">Pays to {short(inv.beneficiaryWallet, 10, 6)}</p>
            {(() => {
              const orgChecks = checks.filter(c => c.subjectType === "ORG")
              const people = checks.filter(c => c.subjectType === "MEMBER" && (c.decision ?? (c.passed ? "PASS" : "FAIL")) === "PASS").length
              return (
                <ul className="divide-y rounded-2xl bg-muted/40 text-xs">
                  {orgChecks.slice(0, 2).map(v => {
                    const d = v.decision ?? (v.passed ? "PASS" : "FAIL")
                    return (
                      <li key={String(v.id)} className="flex items-start gap-3 px-3 py-2.5">
                        <Pill tone={d === "PASS" ? "success" : d === "REVIEW" ? "warning" : "danger"}>{d.toLowerCase()}</Pill>
                        <span className="min-w-0 flex-1">
                          <span className="block text-foreground">{crsProducts(v.products)}</span>
                          {v.reasons ? <span className="block text-muted-foreground">{v.reasons.split(",").filter(Boolean).map(crsReason).join(" · ")}</span> : null}
                        </span>
                        <span className="shrink-0 text-muted-foreground">{timeAgo(v.checkedAt)}</span>
                      </li>
                    )
                  })}
                  {people ? (
                    <li className="flex items-center gap-3 px-3 py-2.5">
                      <Pill tone="success">pass</Pill>
                      <span className="text-foreground">
                        {people} {people === 1 ? "person" : "people"} identity-verified
                      </span>
                    </li>
                  ) : null}
                </ul>
              )
            })()}
            <p className="text-xs text-muted-foreground">Payer: {titleCase(payer?.name ?? "")}</p>
          </div>
        </Section>

        <Section title="Approvals" description="Two different verified people from the paying organization. Never the requester, never an agent.">
          {votes.length ? (
            <ul className="space-y-2 text-sm">
              {votes.map(a => (
                <li key={String(a.id)} className="flex items-center gap-2">
                  <Pill tone={a.vote === "APPROVE" || a.vote === "ACCEPT_CHANGE" || a.vote === "RELEASE" ? "success" : "warning"}>{humanize(a.vote.toLowerCase())}</Pill>
                  <span className="font-medium">{titleCase(nameOf(a.approver.toHexString()))}</span>
                  <span className="truncate text-muted-foreground">{a.reason}</span>
                  <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{timeAgo(a.at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No votes this round.</Empty>
          )}
          {pastVotes.filter(v => v.kind === "PAYMENT").length ? (
            <p className="mt-3 text-xs text-muted-foreground">{pastVotes.filter(v => v.kind === "PAYMENT").length} earlier approval(s) were voided by the freeze, so approval started over.</p>
          ) : null}
        </Section>

        <Section title="Payout" description="Direct USDC transfer from the payer's treasury on Base Sepolia, one idempotency key per payment">
          {payments.length ? (
            <ul className="space-y-2 text-sm">
              {payments.map(p => (
                <li key={p.idempotencyKey} className="flex flex-wrap items-center gap-2">
                  <Pill tone={p.state === "CONFIRMED" ? "success" : p.state === "FAILED" ? "danger" : "info"}>{p.state.toLowerCase()}</Pill>
                  <span className="tabular-nums">{fmtUsdc(p.amount)}</span>
                  <span className="font-mono text-xs text-muted-foreground">→ {short(p.toWallet)}</span>
                  {p.note ? <span className="text-xs text-destructive">{p.note}</span> : null}
                  <span className="ml-auto">
                    <TxLink hash={p.txHash} simulated={p.simulated} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Not paid yet.</Empty>
          )}
        </Section>



        <Section title="Audit trail" description="Every step on this bill, oldest first" className="lg:col-span-2">
          {trail.length ? (
            <ol className="space-y-1.5 text-sm">
              {trail.map(e => (
                <li key={String(e.id)} className="flex gap-3">
                  <span className="w-24 shrink-0 text-xs text-muted-foreground tabular-nums">{fmtTime(e.at)}</span>
                  <span className="font-medium">{actorName(e.actorLabel)}</span>
                  <span className="truncate text-muted-foreground">
                    {describeAudit(e.action, e.detail).title}
                    {describeAudit(e.action, e.detail).detail ? ` · ${describeAudit(e.action, e.detail).detail}` : ""}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <Empty>No events.</Empty>
          )}
        </Section>
      </div>
    </>
  )
}
