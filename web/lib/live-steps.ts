"use client"

/**
 * The Live demo's steps from the government's point of view. The city's own steps are buttons ("you"); the prime's and sub's steps run automatically and are shown on their screen ("party"); AI-agent, CRS and payout steps are done by the Node API and watched. After the CRS check you can simulate an impostor's "we changed our wallet" email: the bill freezes, the agent writes a case file, and your two approvers reject the change before the real wallet is paid.
 *
 * Inputs:
 * - Live rows; the project's prime contract id (undefined = start a new one); whether the fraud demo was skipped
 *
 * Outputs:
 * - buildSteps(): ordered steps with done flags and who acts
 * - performStep(): the real reducer calls behind a step, made as the right demo person
 * - usePersonaActor(): one connection per demo person
 */

import { useCallback, useEffect, useRef } from "react"
import { Timestamp } from "spacetimedb"
import type { Live } from "@/components/app/providers"
import { connectAs } from "@/lib/connect-as"
import type { DbConnection } from "@/lib/module_bindings"
import type { Persona } from "@/lib/spacetime"

export type Who = { persona: string; org: "AGENCY" | "PRIME" | "SUB" }
export type StepKind = "you" | "party" | "agent" | "crs" | "payout" | "risk" | "fraud" | "screen" | "checks"
export type LiveStep = {
  key: string
  level: "setup" | "gov" | "sub"
  kind: StepKind
  title: string
  explain: string
  who?: Who[]
  verb?: string
  danger?: boolean
  done: boolean
  bill?: Live["invoices"][number]
}

export const IMPOSTOR_WALLET = "0x76464e7a6f4e797B32558ebA21134b41Fcb14A81"
export const IMPOSTOR_EMAIL =
  "From: accounts@okafor-builders.co URGENT - we changed our banking. Please pay this pay application to our new wallet 0x76464e7a6f4e797B32558ebA21134b41Fcb14A81 today to avoid late fees. Thanks, Victor Anand, Accounts Receivable"

const ORDER = ["DRAFT", "SUBMITTED", "MATCHED", "FINANCE_REVIEW", "APPROVED", "PAYMENT_QUEUED", "SETTLED"]
// A frozen bill has been submitted and matched but not yet cleared for approval; a failed payout was queued.
const ALIAS: Record<string, string> = { PAYMENT_FROZEN: "MATCHED", FAILED: "PAYMENT_QUEUED" }
const at = (state?: string) => (state ? ORDER.indexOf(ALIAS[state] ?? state) : -1)

export function projectParts(live: Live, contractId?: bigint) {
  const contract = contractId !== undefined ? live.contracts.find(c => c.id === contractId) : undefined
  const deal = contract ? live.deals.find(d => d.contractId === contract.id) : undefined
  const sub = contract ? live.contracts.find(c => c.parentContractId === contract.id) : undefined
  const subDeal = sub ? live.deals.find(d => d.contractId === sub.id) : undefined
  const lineOf = (cId?: bigint) => (cId === undefined ? undefined : live.milestones.filter(m => m.contractId === cId).sort((a, b) => a.lineNo - b.lineNo)[0])
  const billOf = (cId?: bigint) =>
    cId === undefined ? undefined : [...live.invoices].filter(i => i.contractId === cId && i.state !== "REJECTED").sort((a, b) => (a.id > b.id ? -1 : 1))[0]
  const bill1 = billOf(contract?.id)
  const change = bill1 ? [...live.changes].filter(c => c.invoiceId === bill1.id).sort((a, b) => (a.id > b.id ? -1 : 1))[0] : undefined
  return { contract, deal, sub, subDeal, line1: lineOf(contract?.id), line2: lineOf(sub?.id), bill1, bill2: billOf(sub?.id), change }
}

const AGENCY_PM: Who = { persona: "agencyPM", org: "AGENCY" }
const FIN1: Who = { persona: "agencyFin1", org: "AGENCY" }
const FIN2: Who = { persona: "agencyFin2", org: "AGENCY" }
const PRIME_AP: Who = { persona: "primeAP", org: "PRIME" }
const SUB_OWNER: Who = { persona: "subOwner", org: "SUB" }

export type DemoFlags = { fraudSkipped: boolean; posted: boolean; screened: boolean; selected: boolean; checked: boolean }

export function buildSteps(live: Live, contractId: bigint | undefined, flags: DemoFlags): LiveStep[] {
  const { fraudSkipped } = flags
  const x = projectParts(live, contractId)
  const b1 = x.bill1
  const b2 = x.bill2
  const s1 = b1?.state
  const s2 = b2?.state
  const sigs = x.deal ? live.signatures.filter(s => s.dealId === x.deal!.id) : []
  const votes = (b?: Live["invoices"][number]) =>
    b ? live.approvals.filter(a => a.invoiceId === b.id && a.kind === "PAYMENT" && a.round === b.approvalRound && a.vote === "APPROVE").length : 0
  const unfreezeVotes = b1 && x.change ? live.approvals.filter(a => a.invoiceId === b1.id && a.kind === "UNFREEZE").length : 0
  const caseFile = b1 ? live.findings.some(f => f.kind === "RISK_CASE" && f.subjectId === b1.id) : false
  const fraudHappened = !!x.change

  const started = !!x.contract
  const steps: LiveStep[] = [
    { key: "post", level: "setup", kind: "you", title: "Post the project", explain: "Your agency is CRS-verified, and so is everyone who'll sign or approve. Publish the job for bids.", who: [AGENCY_PM], verb: "Post for bids", done: started || flags.posted },
    { key: "screen", level: "setup", kind: "screen", title: "Contractors apply · CRS screens each one", explain: "Before anyone looks at a price, every applicant's identity, credit, liens, sanctions and registry are checked.", done: started || flags.screened },
    { key: "select", level: "setup", kind: "you", title: "Select the contractor", explain: "Only applicants that passed CRS screening can be selected. Try a failed one to see it blocked.", who: [AGENCY_PM], verb: "Select Okafor Builders", done: started || flags.selected },
    { key: "checks", level: "setup", kind: "checks", title: "Okafor Builders LLC is selected", explain: "Before it can sign, every check has to come back clean.", done: started || flags.checked },
    { key: "issue", level: "setup", kind: "you", title: "Issue the contract", explain: "Award the job to Okafor Builders with its schedule of values.", who: [AGENCY_PM], verb: "Issue contract", done: !!x.contract },
    { key: "prime-sign", level: "setup", kind: "party", title: "Okafor Builders signs", explain: "The prime's verified signer signs and sets what its AI agent may do.", who: [PRIME_AP], done: !!x.contract && sigs.some(s => s.orgId === x.contract!.payeeOrgId) },
    { key: "agency-sign", level: "setup", kind: "you", title: "Countersign and mandate your agent", explain: "Sign with your verified identity and set your agent's scope and budget.", who: [AGENCY_PM], verb: "Countersign", done: x.deal?.state === "ACTIVE" },

    { key: "gov-evidence", level: "gov", kind: "party", title: "Okafor submits proof of work", explain: "Site photos and the daily report arrive for inspection.", who: [PRIME_AP], done: ["SUBMITTED_FOR_INSPECTION", "ACCEPTED"].includes(x.line1?.state ?? "") },
    { key: "gov-accept", level: "gov", kind: "you", title: "Inspect and accept the work", explain: "Only work you've accepted can ever be billed.", who: [AGENCY_PM], verb: "Accept the work", done: x.line1?.state === "ACCEPTED" },
    { key: "gov-bill", level: "gov", kind: "party", title: "Okafor sends its pay application", explain: "The bill lands in a shared envelope only you and Okafor can see.", who: [PRIME_AP], done: !!b1 && at(s1) >= 1 },
    { key: "gov-agent", level: "gov", kind: "agent", title: "Your AI agent checks the bill", explain: "Claude compares it with the contract and the accepted work. It can flag, never approve.", done: !!b1 && (!!b1.matchResult || at(s1) >= at("MATCHED")), bill: b1 },
    { key: "gov-crs", level: "gov", kind: "crs", title: "CRS security check on the payee", explain: "Your agent pays 0.01 USDC over x402 for a fresh check on who you're paying.", done: !!b1 && (at(s1) >= at("FINANCE_REVIEW") || fraudHappened), bill: b1 },
    {
      key: "gov-fraud",
      level: "gov",
      kind: "fraud",
      title: "A wallet change request arrives",
      explain: "Most payment fraud starts with an email asking you to pay a new account. Try it.",
      who: [FIN1],
      danger: true,
      done: fraudHappened || fraudSkipped || votes(b1) > 0 || at(s1) >= at("APPROVED"),
      bill: b1,
    },
  ]
  if (fraudHappened) {
    steps.push(
      { key: "gov-freeze", level: "gov", kind: "risk", title: "Payment frozen · agent investigates", explain: "The bill freezes instantly. Your agent re-verifies the payee and checks who sent the request.", done: caseFile, bill: b1 },
      { key: "gov-reject1", level: "gov", kind: "you", title: "Reject the wallet change", explain: "The sender failed identity verification. Keep paying the verified wallet.", who: [FIN1], verb: "Reject change", danger: true, done: unfreezeVotes >= 1 || x.change?.state !== "PENDING", bill: b1 },
      { key: "gov-reject2", level: "gov", kind: "you", title: "Second approver rejects it", explain: "Two different people must agree before a frozen payment moves.", who: [FIN2], verb: "Reject change", danger: true, done: x.change?.state !== "PENDING", bill: b1 }
    )
  }
  steps.push(
    { key: "gov-approve1", level: "gov", kind: "you", title: "Approve the payment", explain: "A verified finance approver signs off. Never the requester, never an agent.", who: [FIN1], verb: "Approve", done: !!b1 && (votes(b1) >= 1 || at(s1) >= at("APPROVED")), bill: b1 },
    { key: "gov-approve2", level: "gov", kind: "you", title: "Second approval", explain: "A different person must agree before money moves.", who: [FIN2], verb: "Approve", done: !!b1 && at(s1) >= at("APPROVED"), bill: b1 },
    { key: "gov-paid", level: "gov", kind: "payout", title: "USDC settles on the verified wallet", explain: "Paid from your treasury on Base Sepolia, to the wallet bound to Okafor's verified owner.", done: s1 === "SETTLED", bill: b1 },

    { key: "sub-hire", level: "sub", kind: "party", title: "Okafor hires a subcontractor", explain: "Same rules downstream: verified signers on both sides, mandated agents.", who: [PRIME_AP, SUB_OWNER], done: x.subDeal?.state === "ACTIVE" },
    { key: "sub-work", level: "sub", kind: "party", title: "Nakamura does the work and bills Okafor", explain: "Evidence, inspection by Okafor's inspector, then an invoice.", who: [SUB_OWNER], done: !!b2 && at(s2) >= 1 },
    { key: "sub-agent", level: "sub", kind: "agent", title: "Okafor's agent checks the invoice", explain: "Claude checks the invoice against the subcontract.", done: !!b2 && (!!b2.matchResult || at(s2) >= at("MATCHED")), bill: b2 },
    { key: "sub-crs", level: "sub", kind: "crs", title: "CRS check on the subcontractor", explain: "A paid x402 check on Nakamura before Okafor can approve.", done: !!b2 && at(s2) >= at("FINANCE_REVIEW"), bill: b2 },
    { key: "sub-approve", level: "sub", kind: "party", title: "Okafor's controllers approve", explain: "Two verified people at Okafor sign off.", who: [{ persona: "primeCtrl1", org: "PRIME" }, { persona: "primeCtrl2", org: "PRIME" }], done: !!b2 && at(s2) >= at("APPROVED"), bill: b2 },
    { key: "sub-paid", level: "sub", kind: "payout", title: "Nakamura is paid", explain: "USDC from Okafor's treasury to Nakamura's verified wallet.", done: s2 === "SETTLED", bill: b2 }
  )
  return steps
}

const DAY = 86_400_000_000n
const expiresAt = () => new Timestamp(BigInt(Date.now()) * 1000n + 7n * DAY)
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
async function until<T>(getLive: () => Live, ok: (l: Live) => T | undefined | false, what: string, ms = 20_000): Promise<T> {
  const t0 = Date.now()
  for (;;) {
    const v = ok(getLive())
    if (v) return v
    if (Date.now() - t0 > ms) throw new Error(`Timed out waiting for ${what}`)
    await sleep(300)
  }
}

// Keeps one connection per demo person for the life of the page.
export function usePersonaActor(personas: Persona[]) {
  const pending = useRef(new Map<string, Promise<DbConnection>>())
  // Open everyone's connection up front, so the first step each person takes doesn't wait on a handshake.
  useEffect(() => {
    for (const p of personas) if (p.token && !p.observer && !pending.current.has(p.key)) pending.current.set(p.key, connectAs(p.token).catch(e => (pending.current.delete(p.key), Promise.reject(e))))
  }, [personas])
  useEffect(() => {
    const map = pending.current
    return () => {
      for (const c of map.values()) c.then(x => x.disconnect(), () => {})
      map.clear()
    }
  }, [])
  return useCallback(
    async (key: string) => {
      const p = personas.find(x => x.key === key)
      if (!p?.token) throw new Error(`No demo login for ${key}`)
      if (!pending.current.has(key)) pending.current.set(key, connectAs(p.token).catch(e => (pending.current.delete(key), Promise.reject(e))))
      return (await pending.current.get(key)!).reducers
    },
    [personas]
  )
}

type As = ReturnType<typeof usePersonaActor>

// The real calls behind a step (button or automatic). Returns the new contract id for "issue".
export async function performStep(step: LiveStep, getLive: () => Live, contractId: bigint | undefined, as: As): Promise<bigint | undefined> {
  const live = getLive()
  const x = projectParts(live, contractId)
  const prime = live.organizations.find(o => o.kind === "PRIME")
  const subOrg = live.organizations.find(o => o.kind === "SUB" && o.payoutWallet && o.verified)
  const stamp = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  const mandate = { perCallLimit: 10_000n, sessionLimit: 100_000n }
  const part = () => projectParts(getLive(), contractId)

  switch (step.key) {
    case "post":
    case "screen":
    case "select":
    case "checks":
      return // shown from CRS results already on file; nothing to write
    case "issue": {
      if (!prime) throw new Error("No prime contractor seeded")
      const title = `Bridge railing repair · ${stamp}`
      await (await as("agencyPM")).createDeal({ kind: "PRIME_CONTRACT", payeeOrgId: prime.id, parentContractId: undefined, title, lines: [{ description: "Replace damaged railing sections", scheduledValue: 100_000n }] })
      return (await until(getLive, l => l.contracts.find(k => k.title === title), "the new contract")).id
    }
    case "prime-sign": {
      const deal = x.deal ?? (await until(getLive, () => part().deal, "the deal"))
      await (await as("primeAP")).signDeal({ dealId: deal.id })
      await (await as("primeAP")).signMandate({ dealId: deal.id, agentId: "prime-agent", scope: "draft_invoice,summarize", ...mandate, expiresAt: expiresAt() })
      return
    }
    case "agency-sign": {
      if (!x.deal) throw new Error("No contract yet")
      await (await as("agencyPM")).signDeal({ dealId: x.deal.id })
      await (await as("agencyPM")).signMandate({ dealId: x.deal.id, agentId: "agency-agent", scope: "match,verify,risk_review", ...mandate, expiresAt: expiresAt() })
      return
    }
    case "gov-evidence":
      if (x.line1) await (await as("primeAP")).submitEvidence({ milestoneId: x.line1.id, evidenceRefs: "site-photo-railing-north.jpg, site-photo-railing-south.jpg, daily-report-1024.pdf" })
      return
    case "gov-accept":
      if (x.line1) await (await as("agencyPM")).inspectMilestone({ milestoneId: x.line1.id, accept: true, note: "Inspected on site; railing sections replaced to spec" })
      return
    case "gov-bill": {
      if (!x.line1 || !x.contract) return
      let b = x.bill1
      if (!b) {
        await (await as("primeAP")).draftInvoice({ contractId: x.contract.id, milestoneIds: [x.line1.id], amount: 50_000n, memo: "Pay application: railing repair progress", agentId: "" })
        b = await until(getLive, () => part().bill1, "the draft")
      }
      if (b.state === "DRAFT") await (await as("primeAP")).submitInvoice({ invoiceId: b.id })
      return
    }
    case "gov-fraud":
      if (x.bill1) await (await as("agencyFin1")).changeBeneficiary({ invoiceId: x.bill1.id, requestedWallet: IMPOSTOR_WALLET, source: "EMAIL", note: IMPOSTOR_EMAIL })
      return
    case "gov-reject1":
      if (x.bill1) await (await as("agencyFin1")).voteUnfreeze({ invoiceId: x.bill1.id, vote: "REJECT_CHANGE", reason: "Sender failed CRS identity check; keep the verified wallet" })
      return
    case "gov-reject2":
      if (x.bill1) await (await as("agencyFin2")).voteUnfreeze({ invoiceId: x.bill1.id, vote: "REJECT_CHANGE", reason: "Agree: impostor, keep the verified wallet" })
      return
    case "gov-approve1":
      if (x.bill1) await (await as("agencyFin1")).approveInvoice({ invoiceId: x.bill1.id, reason: "Matches inspection, contract and CRS check" })
      return
    case "gov-approve2":
      if (x.bill1) await (await as("agencyFin2")).approveInvoice({ invoiceId: x.bill1.id, reason: "Second approval" })
      return
    case "sub-hire": {
      if (!x.contract || !subOrg) throw new Error("Nothing to subcontract yet")
      let sub = x.sub
      if (!sub) {
        await (await as("primeAP")).createDeal({ kind: "SUBCONTRACT", payeeOrgId: subOrg.id, parentContractId: x.contract.id, title: `Railing lights · ${stamp}`, lines: [{ description: "Install railing lights", scheduledValue: 40_000n }] })
        sub = await until(getLive, () => part().sub, "the subcontract")
      }
      const deal = await until(getLive, () => part().subDeal, "the subcontract deal")
      const sigs = getLive().signatures.filter(s => s.dealId === deal.id)
      if (!sigs.some(s => s.orgId === sub!.payerOrgId)) await (await as("primeAP")).signDeal({ dealId: deal.id })
      if (!sigs.some(s => s.orgId === sub!.payeeOrgId)) await (await as("subOwner")).signDeal({ dealId: deal.id })
      await (await as("primeAP")).signMandate({ dealId: deal.id, agentId: "prime-agent", scope: "match,verify,risk_review", ...mandate, expiresAt: expiresAt() })
      await (await as("subOwner")).signMandate({ dealId: deal.id, agentId: "sub-agent", scope: "draft_invoice,summarize", ...mandate, expiresAt: expiresAt() })
      return
    }
    case "sub-work": {
      const line = x.line2
      if (!line || !x.sub) return
      if (["NOT_STARTED", "IN_PROGRESS", "REJECTED"].includes(line.state)) {
        await (await as("subOwner")).submitEvidence({ milestoneId: line.id, evidenceRefs: "site-photo-lights-1.jpg, site-photo-lights-2.jpg, daily-report-lights.pdf" })
        await until(getLive, l => l.milestones.find(m => m.id === line.id)?.state === "SUBMITTED_FOR_INSPECTION", "the evidence")
      }
      if (getLive().milestones.find(m => m.id === line.id)?.state !== "ACCEPTED") {
        await (await as("primeInspector")).inspectMilestone({ milestoneId: line.id, accept: true, note: "Lights installed and tested" })
        await until(getLive, l => l.milestones.find(m => m.id === line.id)?.state === "ACCEPTED", "the inspection")
      }
      let b = x.bill2
      if (!b) {
        await (await as("subOwner")).draftInvoice({ contractId: x.sub.id, milestoneIds: [line.id], amount: 30_000n, memo: "Invoice: railing lights", agentId: "" })
        b = await until(getLive, () => part().bill2, "the draft invoice")
      }
      if (b.state === "DRAFT") await (await as("subOwner")).submitInvoice({ invoiceId: b.id })
      return
    }
    case "sub-approve": {
      const b = x.bill2
      if (!b) return
      const votesNow = () => getLive().approvals.filter(a => a.invoiceId === b.id && a.kind === "PAYMENT" && a.round === b.approvalRound).length
      if (votesNow() === 0) await (await as("primeCtrl1")).approveInvoice({ invoiceId: b.id, reason: "Matches inspection" })
      await until(getLive, () => votesNow() >= 1, "the first approval")
      if (votesNow() < 2) await (await as("primeCtrl2")).approveInvoice({ invoiceId: b.id, reason: "Second approval" })
      return
    }
  }
}
