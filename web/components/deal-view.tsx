"use client"

/**
 * Deal signing status: each party's verified signature and the mandate it gave its agent; the deal goes ACTIVE when all are in.
 *
 * Inputs:
 * - dealId from the URL; deal, contract, signatures, mandates (live)
 *
 * Outputs:
 * - Signature checklist with signDeal for a verified signer of a party that hasn't signed
 */

import { useParams } from "next/navigation"
import { Check, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAct, useLive } from "@/components/app/providers"
import { PageHeader, Section } from "@/components/app/page-header"
import { Pill } from "@/components/StatusBadge"
import { orgName } from "@/lib/domain"
import { agentLabel, fmtUsdc, kindLabel, timeAgo, titleCase } from "@/lib/format"

export function DealView() {
  const { dealId } = useParams<{ dealId: string }>()
  const live = useLive()
  const act = useAct()
  const deal = live.deals.find(d => String(d.id) === dealId)
  const contract = deal && live.contracts.find(c => c.id === deal.contractId)
  if (!deal || !contract) return <PageHeader title={`Deal #${dealId}`} description="Not found or not visible to you." />
  const parties = [contract.payerOrgId, contract.payeeOrgId]
  const me = live.me
  return (
    <>
      <PageHeader
        eyebrow={kindLabel[contract.kind]}
        title={contract.title}
        description={`${titleCase(orgName(live, contract.payerOrgId))} pays ${titleCase(orgName(live, contract.payeeOrgId))} · ${fmtUsdc(contract.totalValue)}`}
        actions={<Pill tone={deal.state === "ACTIVE" ? "success" : "warning"}>{deal.state.toLowerCase().replace("_", " ")}</Pill>}
      />
      <div className="grid gap-6 md:grid-cols-2">
        {parties.map(orgId => {
          const sig = live.signatures.find(s => s.dealId === deal.id && s.orgId === orgId)
          const mandates = live.mandates.filter(m => m.dealId === deal.id && m.orgId === orgId && !m.revoked)
          const canSign = !sig && me?.orgId === orgId && me.isSigner && me.verified && deal.state === "AWAITING_SIGNATURES"
          return (
            <Section key={String(orgId)} title={titleCase(orgName(live, orgId))} description={orgId === contract.payerOrgId ? "Pays" : "Is paid"}>
              <div className="space-y-3 text-sm">
                <p className="flex items-center gap-2">
                  {sig ? <Check className="size-4 text-success" /> : <Clock className="size-4 text-muted-foreground" />}
                  {sig ? `Signed ${timeAgo(sig.signedAt)}` : "Not signed yet"}
                </p>
                {mandates.map(m => (
                  <div key={String(m.id)} className="rounded-lg bg-muted/60 p-3 text-xs">
                    <p className="font-medium">{agentLabel(m.agentId)} mandate</p>
                    <p className="mt-1 text-muted-foreground">
                      {m.scope.replaceAll(",", " · ")} · up to {fmtUsdc(m.perCallLimit)} per call, {fmtUsdc(m.sessionLimit)} total · expires{" "}
                      {new Date(Number(m.expiresAt.microsSinceUnixEpoch / 1000n)).toLocaleDateString()}
                    </p>
                  </div>
                ))}
                {canSign ? (
                  <Button size="sm" onClick={() => act("Deal signed", r => r.signDeal({ dealId: deal.id }))}>
                    Sign deal
                  </Button>
                ) : null}
              </div>
            </Section>
          )
        })}
      </div>
    </>
  )
}
