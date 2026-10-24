"use client"

/**
 * One contract's schedule of values: each line's value, state and evidence, with the action the signed-in person can take (payee submits evidence; the paying side's reviewer accepts or rejects).
 *
 * Inputs:
 * - The contract (live milestones, me)
 *
 * Outputs:
 * - submitEvidence / inspectMilestone calls; a New bill button for the payee's preparer
 */

import { Check, FileText } from "lucide-react"
import { useAct, useLive, type Live } from "@/components/app/providers"
import { ReasonDialog } from "@/components/app/reason-dialog"
import { Section } from "@/components/app/page-header"
import { StatusBadge } from "@/components/StatusBadge"
import { NewBillDialog } from "@/components/room/new-bill-dialog"
import { fmtUsdc, kindLabel, titleCase } from "@/lib/format"
import { orgName } from "@/lib/domain"

export function Milestones({ contract }: { contract: Live["contracts"][number] }) {
  const live = useLive()
  const act = useAct()
  const me = live.me
  const lines = live.milestones.filter(m => m.contractId === contract.id).sort((a, b) => a.lineNo - b.lineNo)
  const isPayeePreparer = me?.orgId === contract.payeeOrgId && me.role === "PREPARER"
  const isPayerReviewer = me?.orgId === contract.payerOrgId && me.role === "REVIEWER"

  return (
    <Section
      title={contract.title}
      description={`${kindLabel[contract.kind]} · ${titleCase(orgName(live, contract.payerOrgId))} pays ${titleCase(orgName(live, contract.payeeOrgId))} · ${fmtUsdc(contract.totalValue)}`}
      actions={isPayeePreparer ? <NewBillDialog contract={contract} /> : null}
    >
      <ul className="divide-y">
        {lines.map(m => (
          <li key={String(m.id)} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
            <span className="w-8 text-xs text-muted-foreground tabular-nums">#{m.lineNo}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{m.description}</p>
              <p className="truncate text-xs text-muted-foreground">
                {m.evidenceRefs ? (
                  <span className="inline-flex items-center gap-1">
                    <FileText className="size-3" />
                    {m.evidenceRefs}
                  </span>
                ) : (
                  "No evidence yet"
                )}
                {m.reviewNote ? ` · “${m.reviewNote}”` : ""}
                {m.billedInvoiceId !== undefined ? ` · billed on #${m.billedInvoiceId}` : ""}
              </p>
            </div>
            <span className="text-sm tabular-nums">{fmtUsdc(m.scheduledValue)}</span>
            <StatusBadge state={m.state} machine="milestone" />
            <div className="flex gap-2">
              {isPayeePreparer && ["NOT_STARTED", "IN_PROGRESS", "REJECTED"].includes(m.state) ? (
                <ReasonDialog
                  trigger="Submit evidence"
                  title={`Evidence for line ${m.lineNo}`}
                  description="Photos, daily reports or test results the reviewer can check. Your agent summarizes them for the reviewer."
                  placeholder="e.g. photos/deck-pour-0412.jpg, daily-report-0412.pdf"
                  confirmLabel="Submit for inspection"
                  onConfirm={refs => act("Sent for inspection", r => r.submitEvidence({ milestoneId: m.id, evidenceRefs: refs }))}
                />
              ) : null}
              {isPayerReviewer && m.state === "SUBMITTED_FOR_INSPECTION" ? (
                <>
                  <ReasonDialog
                    variant="default"
                    trigger={
                      <>
                        <Check /> Accept
                      </>
                    }
                    title={`Accept line ${m.lineNo}`}
                    description="Confirms the work was actually done. Only accepted work can be billed."
                    placeholder="Note (optional)"
                    required={false}
                    confirmLabel="Accept work"
                    onConfirm={note => act("Work accepted", r => r.inspectMilestone({ milestoneId: m.id, accept: true, note: note || "accepted on site" }))}
                  />
                  <ReasonDialog
                    variant="ghost"
                    trigger="Reject"
                    title={`Reject line ${m.lineNo}`}
                    description="The payee can fix it and resubmit evidence."
                    confirmLabel="Reject work"
                    onConfirm={note => act("Work rejected", r => r.inspectMilestone({ milestoneId: m.id, accept: false, note }))}
                  />
                </>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </Section>
  )
}
