"use client"

/**
 * App-wide state: loads the demo personas, remembers which one is selected, opens one SpacetimeDB connection as that persona, and subscribes once to every view so all pages share live data.
 *
 * Inputs:
 * - /api/personas, localStorage("govflow.persona")
 * - Live rows from the `organization` table and every `my_*` view
 *
 * Outputs:
 * - usePersonas(): { personas, persona, setPersona }
 * - useLive(): every visible row, plus `ready`, `isActive` and `myIdentity`
 * - useAct(): runs a reducer and reports success/failure as a toast
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { SpacetimeDBProvider, useSpacetimeDB, useTable } from "spacetimedb/react"
import { toast } from "sonner"
import { DbConnection, tables } from "@/lib/module_bindings"
import { buildConnection, GUEST, safeSet, type Persona } from "@/lib/spacetime"
import { readUrlFlags } from "@/lib/url-flags"

type PersonaCtx = { personas: Persona[]; persona: Persona; setPersona: (key: string) => void; loaded: boolean }
const PersonaContext = createContext<PersonaCtx | null>(null)

export function usePersonas() {
  const v = useContext(PersonaContext)
  if (!v) throw new Error("usePersonas outside Providers")
  return v
}

export function Providers({ children }: { children: ReactNode }) {
  const [personas, setPersonas] = useState<Persona[]>([])
  const [key, setKey] = useState<string>("guest")
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch("/api/personas")
      .then(r => (r.ok ? r.json() : []))
      .catch(() => [])
      .then((list: Persona[]) => {
        if (cancelled) return
        setPersonas(list)
        // ?as= wins (Live screen panes); otherwise the read-only observer.
        const forced = readUrlFlags().as
        const saved = forced
        const pick = list.find(p => p.key === saved) ?? list.find(p => p.observer) ?? list[0]
        setKey(pick?.key ?? "guest")
        setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const persona = personas.find(p => p.key === key) ?? GUEST
  const setPersona = useCallback((k: string) => {
    // A pane pinned with ?as= shouldn't change the person saved for the main window.
    if (!readUrlFlags().as) safeSet("govflow.persona", k)
    setKey(k)
  }, [])

  const connectionBuilder = useMemo(() => buildConnection(persona), [persona])

  const ctx = useMemo(() => ({ personas, persona, setPersona, loaded }), [personas, persona, setPersona, loaded])

  return (
    <PersonaContext.Provider value={ctx}>
      {loaded ? (
        <SpacetimeDBProvider key={persona.key} connectionBuilder={connectionBuilder}>
          <LiveData>{children}</LiveData>
        </SpacetimeDBProvider>
      ) : (
        children
      )}
    </PersonaContext.Provider>
  )
}

function useLiveRows() {
  const [organizations, r0] = useTable(tables.organization)
  const [meRows, r1] = useTable(tables.me)
  const [members, r2] = useTable(tables.myMember)
  const [contracts, r3] = useTable(tables.myContract)
  const [deals, r4] = useTable(tables.myDeal)
  const [signatures, r5] = useTable(tables.myDealSignature)
  const [mandates, r6] = useTable(tables.myMandate)
  const [milestones, r7] = useTable(tables.myMilestone)
  const [invoices, r8] = useTable(tables.myInvoice)
  const [approvals, r9] = useTable(tables.myApproval)
  const [changes, r10] = useTable(tables.myBeneficiaryChange)
  const [payments, r11] = useTable(tables.myPayment)
  const [verifications, r12] = useTable(tables.myVerification)
  const [receipts, r13] = useTable(tables.myX402Receipt)
  const [ledger, r14] = useTable(tables.myLedgerEntry)
  const [agentActions, r15] = useTable(tables.myAgentAction)
  const [findings, r16] = useTable(tables.myAgentFinding)
  const [comments, r17] = useTable(tables.myRoomComment)
  const [audit, r18] = useTable(tables.myAuditEvent)
  const ready = [r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11, r12, r13, r14, r15, r16, r17, r18].every(Boolean)
  return {
    ready,
    organizations,
    me: (meRows[0] ?? null) as (typeof meRows)[number] | null,
    members,
    contracts,
    deals,
    signatures,
    mandates,
    milestones,
    invoices,
    approvals,
    changes,
    payments,
    verifications,
    receipts,
    ledger,
    agentActions,
    findings,
    comments,
    audit,
  }
}

export type Live = ReturnType<typeof useLiveRows> & { isActive: boolean; myIdentity: string | null }

const LiveContext = createContext<Live | null>(null)
// Null until personas load and the provider mounts; useAct handles that.
const ConnContext = createContext<(() => DbConnection | null) | null>(null)

function LiveData({ children }: { children: ReactNode }) {
  const rows = useLiveRows()
  const { isActive, identity, getConnection } = useSpacetimeDB()
  // Rows change identity on every live update, so a fresh object per render is the honest dependency.
  const value: Live = { ...rows, isActive, myIdentity: identity?.toHexString() ?? null }
  const conn = useCallback(() => getConnection() as DbConnection | null, [getConnection])
  return (
    <ConnContext.Provider value={conn}>
      <LiveContext.Provider value={value}>{children}</LiveContext.Provider>
    </ConnContext.Provider>
  )
}

const EMPTY: Live = {
  ready: false,
  isActive: false,
  myIdentity: null,
  organizations: [],
  me: null,
  members: [],
  contracts: [],
  deals: [],
  signatures: [],
  mandates: [],
  milestones: [],
  invoices: [],
  approvals: [],
  changes: [],
  payments: [],
  verifications: [],
  receipts: [],
  ledger: [],
  agentActions: [],
  findings: [],
  comments: [],
  audit: [],
}

export function useLive(): Live {
  return useContext(LiveContext) ?? EMPTY
}

type Reducers = DbConnection["reducers"]

export function useAct() {
  const getConn = useContext(ConnContext)
  return useCallback(
    async (label: string, run: (r: Reducers) => Promise<unknown>) => {
      const conn = getConn?.() ?? null
      if (!conn) {
        toast.error("Not connected to the database yet")
        return false
      }
      try {
        await run(conn.reducers)
        toast.success(label)
        return true
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        toast.error(msg.replace(/^unauthorized: /, "Not allowed: "))
        return false
      }
    },
    [getConn]
  )
}
