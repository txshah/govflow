"use client"

/**
 * The actions the signed-in person can take on one bill, decided by their org and role: submit or reopen (payee), confirm an UNSURE match, approve, reject, or vote to unfreeze (payer approvers), report a wallet change (either party).
 *
 * Inputs:
 * - The invoice row; live data (me, approvals, beneficiary changes)
 *
 * Outputs:
 * - Buttons that call submitInvoice, reopenInvoice, confirmUnsureMatch, approveInvoice, rejectInvoice, voteUnfreeze, changeBeneficiary
 * - A one-line note when the person can't act ("Waiting for a second approver", "View only")
 */

import { Button } from "@/components/ui/button"
import { useAct, useLive, type Live } from "@/components/app/providers"
import { ReasonDialog } from "@/components/app/reason-dialog"
import { approvalsFor } from "@/lib/domain"

const FREEZABLE = ["SUBMITTED", "MATCHED", "FINANCE_REVIEW", "APPROVED", "PAYMENT_QUEUED"]

export function ApprovalPanel({ invoice: inv }: { invoice: Live["invoices"][number] }) {
  const live = useLive()
  const act = useAct()
  const me = live.me
  if (!me) return <p className="text-xs text-muted-foreground">View only. Sign in as a person to act.</p>

  const isPayee = me.orgId === inv.payeeOrgId
  const isPayer = me.orgId === inv.payerOrgId
  const preparer = isPayee && me.role === "PREPARER"
  const approver = isPayer && me.role === "APPROVER"
  const myId = live.myIdentity
  const votedPay = approvalsFor(live, inv).some(a => a.approver.toHexString() === myId)
  const votedUnfreeze = approvalsFor(live, inv, "UNFREEZE").some(a => a.approver.toHexString() === myId)
  const change = live.changes.find(c => c.invoiceId === inv.id && c.state === "PENDING")
  const id = inv.id

  const buttons: React.ReactNode[] = []

  if (preparer && inv.state === "DRAFT")
    buttons.push(
      <Button key="submit" size="sm" onClick={() => act("Bill submitted", r => r.submitInvoice({ invoiceId: id }))}>
        Submit bill
      </Button>
    )
  if (preparer && inv.state === "REJECTED")
    buttons.push(
      <Button key="reopen" size="sm" variant="outline" onClick={() => act("Bill reopened as a draft", r => r.reopenInvoice({ invoiceId: id }))}>
        Reopen as draft
      </Button>
    )

  if (approver && inv.state === "SUBMITTED" && inv.matchResult === "UNSURE")
    buttons.push(
      <ReasonDialog
        key="confirm"
        variant="default"
        trigger="Confirm match"
        title="Confirm the agent's UNSURE match"
        description="The agent wasn't sure this bill matches the contract. Say what you checked."
        onConfirm={reason => act("Match confirmed", r => r.confirmUnsureMatch({ invoiceId: id, reason }))}
      />
    )

  if (approver && inv.state === "FINANCE_REVIEW" && !votedPay)
    buttons.push(
      <ReasonDialog
        key="approve"
        variant="default"
        trigger="Approve"
        title="Approve payment"
        description="Two different approvers are needed. The money moves only after the second."
        placeholder="Note (optional)"
        required={false}
        confirmLabel="Approve"
        onConfirm={reason => act("Approval recorded", r => r.approveInvoice({ invoiceId: id, reason: reason || "approved" }))}
      />
    )

  if (approver && inv.state === "PAYMENT_FROZEN" && !votedUnfreeze) {
    if (change) {
      buttons.push(
        <ReasonDialog
          key="accept-change"
          trigger="Accept new wallet"
          title="Accept the wallet change"
          description="Only if the payee's real owner re-verified with CRS and proved control of the new wallet. A second approver must agree."
          onConfirm={reason => act("Vote recorded", r => r.voteUnfreeze({ invoiceId: id, vote: "ACCEPT_CHANGE", reason }))}
        />,
        <ReasonDialog
          key="reject-change"
          variant="default"
          trigger="Keep original wallet"
          title="Reject the wallet change"
          description="Keeps paying the verified wallet on file. Needs a fresh passing CRS check on the payee and a second approver."
          onConfirm={reason => act("Vote recorded", r => r.voteUnfreeze({ invoiceId: id, vote: "REJECT_CHANGE", reason }))}
        />
      )
    } else {
      buttons.push(
        <ReasonDialog
          key="release"
          trigger="Release freeze"
          title="Release this freeze"
          description="Needs a fresh passing CRS check on the payee and a second approver."
          onConfirm={reason => act("Vote recorded", r => r.voteUnfreeze({ invoiceId: id, vote: "RELEASE", reason }))}
        />
      )
    }
  }

  if (approver && ["SUBMITTED", "MATCHED", "FINANCE_REVIEW", "PAYMENT_FROZEN"].includes(inv.state))
    buttons.push(
      <ReasonDialog
        key="reject"
        variant="ghost"
        trigger="Reject"
        title="Reject this bill"
        description="One approver can stop a payment. The payee can fix it and resubmit."
        confirmLabel="Reject bill"
        onConfirm={reason => act("Bill rejected", r => r.rejectInvoice({ invoiceId: id, reason }))}
      />
    )

  if ((isPayee || isPayer) && FREEZABLE.includes(inv.state))
    buttons.push(
      <ReasonDialog
        key="wallet"
        variant="ghost"
        trigger="Report wallet change"
        title="Report a payout wallet change"
        description="Any request to pay a different wallet freezes this bill until the owner re-verifies with CRS and two approvers agree."
        placeholder="New wallet address (0x…)"
        confirmLabel="Freeze and report"
        onConfirm={wallet =>
          act("Bill frozen pending re-verification", r =>
            r.changeBeneficiary({ invoiceId: id, requestedWallet: wallet, source: "IN_APP", note: "Reported in GovFlow" })
          )
        }
      />
    )

  if (buttons.length) return <div className="flex flex-wrap items-center gap-2">{buttons}</div>
  if (inv.state === "SETTLED") return null

  const note =
    approver && inv.state === "FINANCE_REVIEW" && votedPay
      ? "You approved. Waiting for a second approver."
      : approver && inv.state === "PAYMENT_FROZEN" && votedUnfreeze
        ? "You voted. Waiting for a second approver."
        : "No action for you on this bill."
  return <p className="text-xs text-muted-foreground">{note}</p>
}
