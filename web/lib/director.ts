"use client"

/**
 * The live story director: runs the whole project for real, both levels, while Story mode shows each scene. Human steps are real reducer calls made as each demo person; AI-agent, CRS and payout steps are waited for (the Node API does them). It always starts on fresh work: a small change order (agency → prime) and a subcontract under it (prime → sub).
 *
 * Inputs:
 * - getLive(): the latest live rows (observer view); personas with tokens
 *
 * Outputs:
 * - useDirector(): { run, stop, running, phase, note, error, ids } — phase drives which story scene is on screen
 */

import { useCallback, useRef, useState } from "react"
import { Timestamp } from "spacetimedb"
import type { Live } from "@/components/app/providers"
import type { DbConnection } from "@/lib/module_bindings"
import type { Persona } from "@/lib/spacetime"
import { connectAs } from "@/lib/connect-as"

export type Phase = "issue" | "screen" | "pick" | "papers" | "award" | "pay1" | "plan" | "pay2" | "done"
export type StoryIds = { contract?: bigint; subContract?: bigint; bill1?: bigint; bill2?: bigint }

const DAY = 86_400_000_000n
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export function useDirector(getLive: () => Live, personas: Persona[]) {
  const [running, setRunning] = useState(false)
  const [phase, setPhase] = useState<Phase | null>(null)
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [ids, setIds] = useState<StoryIds>({})
  const stopRef = useRef(false)

  const stop = useCallback(() => {
    stopRef.current = true
  }, [])

  const run = useCallback(async () => {
    stopRef.current = false
    setError(null)
    setIds({})
    setRunning(true)
    const conns = new Map<string, DbConnection>()
    const as = async (key: string) => {
      const p = personas.find(x => x.key === key)
      if (!p?.token) throw new Error(`No demo login for ${key}`)
      if (!conns.has(key)) conns.set(key, await connectAs(p.token))
      return conns.get(key)!.reducers
    }
    const until = async <T,>(what: string, ok: (l: Live) => T | undefined | false, timeoutMs = 90_000) => {
      const t0 = Date.now()
      setNote(`Waiting for ${what}…`)
      for (;;) {
        if (stopRef.current) throw new Error("Stopped")
        const v = ok(getLive())
        if (v) return v
        if (Date.now() - t0 > timeoutMs) throw new Error(`Timed out waiting for ${what}. Is the API running? (cd api && npm start)`)
        await sleep(400)
      }
    }
    const beat = async (p: Phase, ms: number) => {
      if (stopRef.current) throw new Error("Stopped")
      setPhase(p)
      setNote("")
      await sleep(ms)
    }
    const say = (s: string) => setNote(s)

    // Runs one bill end to end: evidence → acceptance → bill → agent + CRS → two approvals → payout.
    const payLevel = async (
      contractId: bigint,
      amount: bigint,
      who: { preparer: string; reviewer: string; approvers: [string, string] },
      onBill: (id: bigint) => void
    ) => {
      const line = await until("the contract line", l => l.milestones.find(m => m.contractId === contractId))
      say("Submitting proof the work is done")
      await (await as(who.preparer)).submitEvidence({ milestoneId: line.id, evidenceRefs: "site-photos/progress-0412.jpg, daily-report-0412.pdf" })
      await until("the evidence", l => l.milestones.find(m => m.id === line.id)?.state === "SUBMITTED_FOR_INSPECTION")
      say("Inspecting the work on site")
      await (await as(who.reviewer)).inspectMilestone({ milestoneId: line.id, accept: true, note: "Inspected on site; work complete" })
      await until("the inspection", l => l.milestones.find(m => m.id === line.id)?.state === "ACCEPTED")
      say("Sending the bill")
      await (await as(who.preparer)).draftInvoice({ contractId, milestoneIds: [line.id], amount, memo: "Progress billing for completed work", agentId: "" })
      const bill = await until("the draft", l => l.invoices.find(i => i.contractId === contractId && i.milestoneIds.includes(line.id)))
      onBill(bill.id)
      await (await as(who.preparer)).submitInvoice({ invoiceId: bill.id })
      const st = (l: Live) => l.invoices.find(i => i.id === bill.id)
      await until("the AI agent's contract check", l => {
        const i = st(l)
        return !!i && (!!i.matchResult || !["DRAFT", "SUBMITTED"].includes(i.state))
      })
      if (st(getLive())?.matchResult === "UNSURE" || st(getLive())?.state === "PAYMENT_FROZEN") throw new Error("The agent flagged this bill. Open it to see why.")
      await until("the x402-paid CRS check", l => !["SUBMITTED", "MATCHED"].includes(st(l)?.state ?? ""))
      if (st(getLive())?.state === "PAYMENT_FROZEN") throw new Error("The CRS check froze this bill. Open the case file.")
      say("First approver signs off")
      await (await as(who.approvers[0])).approveInvoice({ invoiceId: bill.id, reason: "Matches inspection and contract" })
      await until("the first approval", l => l.approvals.some(a => a.invoiceId === bill.id && a.kind === "PAYMENT"))
      say("Second approver signs off")
      await (await as(who.approvers[1])).approveInvoice({ invoiceId: bill.id, reason: "Second approval" })
      await until("the USDC payout", l => st(l)?.state === "SETTLED", 120_000)
      return bill.id
    }

    try {
      const live = getLive()
      const prime = live.organizations.find(o => o.kind === "PRIME")
      const sub = live.organizations.find(o => o.kind === "SUB" && o.payoutWallet && o.verified)
      if (!prime || !sub) throw new Error("The demo organizations aren't seeded yet")
      const stamp = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
      const expiresAt = () => new Timestamp(BigInt(Date.now()) * 1000n + 7n * DAY)

      // 1 · The agency issues the contract.
      setPhase("issue")
      say("Publishing the contract")
      const title = `Bridge railing repair · ${stamp}`
      await (await as("agencyPM")).createDeal({
        kind: "PRIME_CONTRACT",
        payeeOrgId: prime.id,
        parentContractId: undefined,
        title,
        lines: [{ description: "Replace damaged railing sections", scheduledValue: 100_000n }],
      })
      const contract = await until("the contract", l => l.contracts.find(c => c.title === title))
      setIds(x => ({ ...x, contract: contract.id }))
      await sleep(2500)

      // 2–3 · Screening and selection (CRS results already on file for every contractor).
      await beat("screen", 9000)
      await beat("pick", 9000)

      // 4 · Both sides sign and mandate their agents.
      setPhase("papers")
      const deal = await until("the deal", l => l.deals.find(d => d.contractId === contract.id))
      say("The agency signs")
      await (await as("agencyPM")).signDeal({ dealId: deal.id })
      say("The prime signs")
      await (await as("primeAP")).signDeal({ dealId: deal.id })
      say("Agents get their mandates")
      await (await as("agencyPM")).signMandate({ dealId: deal.id, agentId: "agency-agent", scope: "match,verify,risk_review", perCallLimit: 10_000n, sessionLimit: 100_000n, expiresAt: expiresAt() })
      await (await as("primeAP")).signMandate({ dealId: deal.id, agentId: "prime-agent", scope: "draft_invoice,summarize", perCallLimit: 10_000n, sessionLimit: 100_000n, expiresAt: expiresAt() })
      await until("the contract to go active", l => l.deals.find(d => d.id === deal.id)?.state === "ACTIVE")

      // 5 · Awarded.
      await beat("award", 4500)

      // 6 · First partial payment, agency → prime.
      setPhase("pay1")
      const bill1 = await payLevel(contract.id, 60_000n, { preparer: "primeAP", reviewer: "agencyPM", approvers: ["agencyFin1", "agencyFin2"] }, id =>
        setIds(x => ({ ...x, bill1: id }))
      )
      await sleep(2500)

      // 7 · The prime plans the work and hires a subcontractor.
      setPhase("plan")
      say("Okafor subcontracts the lighting work")
      const subTitle = `Railing lights · ${stamp}`
      await (await as("primeAP")).createDeal({
        kind: "SUBCONTRACT",
        payeeOrgId: sub.id,
        parentContractId: contract.id,
        title: subTitle,
        lines: [{ description: "Install railing lights", scheduledValue: 40_000n }],
      })
      const subContract = await until("the subcontract", l => l.contracts.find(c => c.title === subTitle))
      setIds(x => ({ ...x, subContract: subContract.id }))
      const subDeal = await until("the subcontract deal", l => l.deals.find(d => d.contractId === subContract.id))
      await (await as("primeAP")).signDeal({ dealId: subDeal.id })
      await (await as("subOwner")).signDeal({ dealId: subDeal.id })
      await (await as("primeAP")).signMandate({ dealId: subDeal.id, agentId: "prime-agent", scope: "match,verify,risk_review", perCallLimit: 10_000n, sessionLimit: 100_000n, expiresAt: expiresAt() })
      await (await as("subOwner")).signMandate({ dealId: subDeal.id, agentId: "sub-agent", scope: "draft_invoice,summarize", perCallLimit: 10_000n, sessionLimit: 100_000n, expiresAt: expiresAt() })
      await until("the subcontract to go active", l => l.deals.find(d => d.id === subDeal.id)?.state === "ACTIVE")
      await sleep(3000)

      // 8 · Paying the subcontractor, prime → sub.
      setPhase("pay2")
      const bill2 = await payLevel(subContract.id, 30_000n, { preparer: "subOwner", reviewer: "primeInspector", approvers: ["primeCtrl1", "primeCtrl2"] }, id =>
        setIds(x => ({ ...x, bill2: id }))
      )

      // 9 · Done.
      setPhase("done")
      say("")
      return { contract: contract.id, subContract: subContract.id, bill1, bill2 }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg !== "Stopped") setError(msg)
      return null
    } finally {
      for (const c of conns.values()) c.disconnect()
      setRunning(false)
    }
  }, [getLive, personas])

  return { run, stop, running, phase, note, error, ids }
}
