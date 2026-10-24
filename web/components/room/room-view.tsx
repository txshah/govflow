"use client"

/**
 * One organization's private room: its verified identity and wallet, money in and out, the work it does or reviews, bills it pays or is paid, its agent's activity and findings, team comments, and its verified people.
 *
 * Inputs:
 * - kind (AGENCY | PRIME | SUB), optional focus (inspection = only sub work, opens on Work)
 * - Live rows; the signed-in persona
 *
 * Outputs:
 * - The room screen, with actions only when the signed-in person belongs to this org
 */

import { useState } from "react"
import { useSearchParams } from "next/navigation"
import { Bot, Eye, Receipt, Send, Shovel, Users } from "lucide-react"
import { FluidTabs } from "@/components/watermelon/fluid-tabs"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { RollingNumber } from "@/components/ui/rolling-number"
import { useAct, useLive, usePersonas } from "@/components/app/providers"
import { Empty, PageHeader, Section, StatTile } from "@/components/app/page-header"
import { VerificationBadge } from "@/components/VerificationBadge"
import { WalletBinding } from "@/components/WalletBinding"
import { InvoiceTable } from "@/components/InvoiceTable"
import { AgentFeed } from "@/components/AgentFeed"
import { Pill } from "@/components/StatusBadge"
import { Milestones } from "@/components/room/milestones"
import { chainOrgs } from "@/lib/domain"
import { agentLabel, kindLabel, orgHue, roleLabel, timeAgo, titleCase } from "@/lib/format"

const blurbs = {
  AGENCY: "Accept the prime's work, review its monthly pay applications, and release USDC from the agency treasury with two approvals.",
  PRIME: "Bill the agency for accepted work, and review and pay your subcontractors' invoices.",
  SUB: "Submit evidence of finished work, confirm the bills your agent drafts, and get paid to your verified wallet.",
  INSPECTION: "Check subcontractor evidence on site and accept or reject each line. Only accepted work can be billed.",
}

export function RoomView({ kind, focus }: { kind: "AGENCY" | "PRIME" | "SUB"; focus?: "inspection" }) {
  const live = useLive()
  const act = useAct()
  const { personas, persona, setPersona } = usePersonas()
  const org = chainOrgs(live)[kind === "AGENCY" ? "agency" : kind === "PRIME" ? "prime" : "sub"]
  const [comment, setComment] = useState("")
  // ?tab=work (from the demo guide) picks the tab; a click overrides it until the URL changes again.
  const urlTab = useSearchParams().get("tab")
  const fallbackTab = urlTab ?? (focus === "inspection" ? "work" : "bills")
  const [picked, setPicked] = useState<{ url: string | null; tab: string } | null>(null)
  const tab = picked && picked.url === urlTab ? picked.tab : fallbackTab
  const setTab = (t: string) => setPicked({ url: urlTab, tab: t })

  if (!live.ready) return <PageHeader eyebrow={kindLabel[kind]} title="Loading…" />
  if (!org) return <PageHeader eyebrow={kindLabel[kind]} title="Not seeded yet" description="Run the seed to create the demo organizations." />

  const mine = live.me?.orgId === org.id
  const canSee = mine || persona.observer
  const contracts = live.contracts.filter(
    c => (c.payerOrgId === org.id || c.payeeOrgId === org.id) && (focus !== "inspection" || c.kind === "SUBCONTRACT")
  )
  const incoming = live.invoices.filter(i => i.payerOrgId === org.id)
  const outgoing = live.invoices.filter(i => i.payeeOrgId === org.id)
  const paidOut = incoming.filter(i => i.state === "SETTLED").reduce((s, i) => s + i.amount, 0n)
  const received = outgoing.filter(i => i.state === "SETTLED").reduce((s, i) => s + i.amount, 0n)
  const frozen = [...incoming, ...outgoing].filter(i => i.state === "PAYMENT_FROZEN").length
  const waiting = incoming.filter(i => i.state === "FINANCE_REVIEW").length
  const toInspect = live.milestones.filter(m => contracts.some(c => c.id === m.contractId && c.payerOrgId === org.id) && m.state === "SUBMITTED_FOR_INSPECTION").length
  const team = live.members.filter(m => m.orgId === org.id)
  const orgVerification = [...live.verifications]
    .filter(v => v.orgId === org.id && v.subjectType === "ORG")
    .sort((a, b) => (a.checkedAt.microsSinceUnixEpoch > b.checkedAt.microsSinceUnixEpoch ? -1 : 1))[0] as
    | ((typeof live.verifications)[number] & { decision?: string })
    | undefined
  const pendingChanges = live.changes.filter(c => c.payeeOrgId === org.id && c.state === "PENDING").length
  const findings = live.findings.filter(f => f.orgId === org.id).sort((a, b) => (a.id > b.id ? -1 : 1))
  const comments = live.comments.filter(c => c.orgId === org.id).sort((a, b) => (a.id > b.id ? -1 : 1))
  const peopleHere = personas.filter(p => p.orgId === String(org.id))
  const nameOf = (hex: string) => live.members.find(m => m.identity.toHexString() === hex)?.displayName ?? "Someone"

  return (
    <>
      <div aria-hidden className={`pointer-events-none fixed top-16 left-1/2 -z-[5] h-72 w-[48rem] -translate-x-1/2 rounded-full opacity-40 blur-3xl ${orgHue[org.kind]?.soft ?? ""}`} />
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-1.5">
            <span className={`size-1.5 rounded-full ${orgHue[org.kind]?.bg ?? "bg-leaf"}`} />
            {focus === "inspection" ? "Site inspection" : kindLabel[org.kind]}
          </span>
        }
        title={titleCase(org.name)}
        description={blurbs[focus === "inspection" ? "INSPECTION" : kind]}
        actions={
          <>
            <VerificationBadge verified={org.verified} hash={org.identityHash} decision={orgVerification?.decision} reasons={orgVerification?.reasons} />
            {kind !== "AGENCY" ? <WalletBinding org={org} pending={pendingChanges} /> : null}
          </>
        }
      />

      {!mine ? (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-dashed bg-muted/40 px-4 py-3 text-sm">
          <Eye className="size-4 text-muted-foreground" />
          <span className="flex-1 text-muted-foreground">
            {persona.observer
              ? "You're the observer: you can see this room but not act in it."
              : `You're signed in as ${titleCase(persona.name)}${live.me ? "" : " (no organization)"}. This room is private to ${titleCase(org.name)}.`}
          </span>
          {peopleHere.slice(0, 3).map(p => (
            <Button key={p.key} size="sm" variant="outline" onClick={() => setPersona(p.key)}>
              Sign in as {titleCase(p.name).split(" ")[0]} · {p.title}
            </Button>
          ))}
        </div>
      ) : null}

      {canSee || live.me ? (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {kind !== "SUB" ? (
              <StatTile label="Paid out" value={<><RollingNumber precision={2} value={Number(paidOut) / 1e6} format={n => n.toFixed(2)} /> <span className="text-sm font-normal text-muted-foreground">USDC</span></>} />
            ) : null}
            {kind !== "AGENCY" ? (
              <StatTile label="Received" tone="success" value={<><RollingNumber precision={2} value={Number(received) / 1e6} format={n => n.toFixed(2)} /> <span className="text-sm font-normal text-muted-foreground">USDC</span></>} />
            ) : null}
            <StatTile label={focus === "inspection" ? "Waiting for inspection" : "Waiting for approval"} value={focus === "inspection" ? toInspect : waiting} />
            <StatTile label="Frozen bills" value={frozen} tone={frozen ? "danger" : undefined} hint={frozen ? "Until the payee re-verifies with CRS" : "None"} />
            {kind === "SUB" ? <StatTile label="Open bills" value={outgoing.filter(i => !["SETTLED", "REJECTED"].includes(i.state)).length} /> : null}
          </div>

          <div className="mb-5 flex justify-center sm:justify-start">
            <FluidTabs
              key={urlTab ?? "default"}
              defaultActive={tab}
              onChange={setTab}
              tabs={[
                { id: "bills", label: "Bills", icon: <Receipt className="size-4" /> },
                { id: "work", label: "Work", icon: <Shovel className="size-4" /> },
                { id: "agent", label: "Agent", icon: <Bot className="size-4" /> },
                { id: "team", label: "Team", icon: <Users className="size-4" /> },
              ]}
            />
          </div>

            {tab === "bills" ? (
            <div className="space-y-6">
              {kind !== "SUB" ? (
                <Section title="Bills you pay" description={kind === "AGENCY" ? "Monthly pay applications from the prime" : "Invoices from your subcontractors"}>
                  <InvoiceTable invoices={incoming} showActions={mine} empty="Nothing to pay yet." />
                </Section>
              ) : null}
              {kind !== "AGENCY" ? (
                <Section title="Bills you're paid" description={kind === "PRIME" ? "Your pay applications to the agency" : "Your invoices to the prime"}>
                  <InvoiceTable invoices={outgoing} showActions={mine} empty="No bills yet. Get work accepted, then create one from Work." />
                </Section>
              ) : null}
            </div>
            ) : null}

            {tab === "work" ? (
            <div className="space-y-6">
              {contracts.length ? contracts.map(c => <Milestones key={String(c.id)} contract={c} />) : <Empty>No contracts.</Empty>}
            </div>
            ) : null}

            {tab === "agent" ? (
            <div className="grid gap-6 lg:grid-cols-2">
              <Section title="Agent findings" description="Evidence summaries, bill matches and fraud case files. Agents suggest; people decide.">
                {findings.length ? (
                  <ul className="space-y-3">
                    {findings.slice(0, 12).map(f => (
                      <li key={String(f.id)} className="rounded-lg border p-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{agentLabel(f.agentId)}</span>
                          <Pill tone={f.result === "MATCHED" || f.result === "LOW" ? "success" : f.result === "UNSURE" ? "warning" : "danger"}>{f.kind.replace("_", " ").toLowerCase()} · {f.result}</Pill>
                          <span className="ml-auto text-[11px] text-muted-foreground">{timeAgo(f.at)}</span>
                        </div>
                        <p className="mt-1.5 line-clamp-4 text-sm text-muted-foreground whitespace-pre-line">{f.body}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">model {f.modelId || "—"} · inputs {f.inputIds || "—"}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty>No findings yet.</Empty>
                )}
              </Section>
              <Section title="Room" description="Notes to your team and your agent. Private to this organization.">
                {mine ? (
                  <div className="mb-4 flex gap-2">
                    <Textarea rows={2} value={comment} onChange={e => setComment(e.target.value)} placeholder="Ask your agent to recheck something, or leave a note…" />
                    <Button
                      size="icon"
                      disabled={!comment.trim()}
                      onClick={async () => {
                        if (await act("Posted", r => r.postComment({ targetType: "organization", targetId: org.id, text: comment.trim() }))) setComment("")
                      }}
                    >
                      <Send />
                    </Button>
                  </div>
                ) : null}
                {comments.length ? (
                  <ul className="mb-4 space-y-2">
                    {comments.slice(0, 8).map(c => (
                      <li key={String(c.id)} className="text-sm">
                        <span className="font-medium">{titleCase(nameOf(c.author.toHexString()))}</span>{" "}
                        <span className="text-muted-foreground">{c.text}</span>
                        <span className="ml-2 text-[11px] text-muted-foreground">{timeAgo(c.at)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <AgentFeed agentsOnly limit={12} />
              </Section>
            </div>
            ) : null}

            {tab === "team" ? (
            <div>
              <Section title="People" description="Everyone here passed CRS identity verification before they could sign, review or approve.">
                {team.length ? (
                  <ul className="divide-y">
                    {team.map(m => (
                      <li key={m.identity.toHexString()} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{titleCase(m.displayName)}</p>
                          <p className="text-xs text-muted-foreground">
                            {roleLabel[m.role] ?? m.role}
                            {m.isSigner ? " · signer" : ""}
                          </p>
                        </div>
                        <VerificationBadge verified={m.verified} hash={m.identityHash} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty>Not visible to you.</Empty>
                )}
              </Section>
            </div>
            ) : null}
        </>
      ) : (
        <Empty>This room is private.</Empty>
      )}
    </>
  )
}
