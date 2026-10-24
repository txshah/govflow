"use client"

/**
 * Lets the payee's preparer create a draft bill from accepted, not-yet-billed milestones. The amount defaults to their scheduled value; billing more is allowed but freezes automatically.
 *
 * Inputs:
 * - The contract and its milestones (live)
 *
 * Outputs:
 * - draftInvoice(contractId, milestoneIds, amount, memo, agentId: '') — the draft then shows in Bills with a Submit button
 */

import { useMemo, useState } from "react"
import { FilePlus2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useAct, useLive, type Live } from "@/components/app/providers"
import { fmtUsdc, kindLabel } from "@/lib/format"

export function NewBillDialog({ contract }: { contract: Live["contracts"][number] }) {
  const live = useLive()
  const act = useAct()
  const billable = live.milestones.filter(m => m.contractId === contract.id && m.state === "ACCEPTED" && m.billedInvoiceId === undefined)
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const [amount, setAmount] = useState("")
  const [memo, setMemo] = useState("")
  const scheduled = useMemo(
    () => billable.filter(m => picked.includes(String(m.id))).reduce((s, m) => s + m.scheduledValue, 0n),
    [billable, picked]
  )
  const toggle = (id: string) => {
    const next = picked.includes(id) ? picked.filter(x => x !== id) : [...picked, id]
    setPicked(next)
    const sum = billable.filter(m => next.includes(String(m.id))).reduce((s, m) => s + m.scheduledValue, 0n)
    setAmount((Number(sum) / 1e6).toFixed(2))
  }
  const micro = BigInt(Math.round((parseFloat(amount) || 0) * 1e6))

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={!billable.length}>
          <FilePlus2 />
          New {contract.kind === "PRIME_CONTRACT" ? "pay application" : "invoice"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New {kindLabel[contract.kind === "PRIME_CONTRACT" ? "PAY_APPLICATION" : "SUB_INVOICE"].toLowerCase()}</DialogTitle>
          <DialogDescription>Bill accepted work on “{contract.title}”. The payer’s agent checks it against the contract before anyone approves.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {billable.map(m => (
            <label key={String(m.id)} className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 has-[:checked]:border-primary">
              <input type="checkbox" className="size-4 accent-current" checked={picked.includes(String(m.id))} onChange={() => toggle(String(m.id))} />
              <span className="flex-1 text-sm">
                Line {m.lineNo} · {m.description}
              </span>
              <span className="text-sm tabular-nums text-muted-foreground">{fmtUsdc(m.scheduledValue)}</span>
            </label>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="amt">Amount (USDC)</Label>
            <Input id="amt" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} />
            {micro > scheduled && picked.length ? <p className="text-xs text-destructive">Above the accepted value. This bill will freeze.</p> : null}
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="memo">Note to the payer</Label>
            <Textarea id="memo" rows={2} value={memo} onChange={e => setMemo(e.target.value)} placeholder="Optional" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={!picked.length || micro <= 0n}
            onClick={async () => {
              const ok = await act("Draft created. Submit it from Bills.", r =>
                r.draftInvoice({ contractId: contract.id, milestoneIds: picked.map(BigInt), amount: micro, memo, agentId: "" })
              )
              if (ok) {
                setOpen(false)
                setPicked([])
                setAmount("")
                setMemo("")
              }
            }}
          >
            Create draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
