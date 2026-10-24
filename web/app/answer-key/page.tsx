"use client"

/**
 * Vendor checks board: every organization's latest CRS business check — including the planted vendors (failed identity, thin file, sanctions hit, liens) — so judges can see what the system would block before any money moves.
 *
 * Inputs:
 * - organization rows and my_verification rows (the observer sees all)
 *
 * Outputs:
 * - A grid of vendor cards with PASS / REVIEW / FAIL and the reasons CRS returned
 */

import { useLive } from "@/components/app/providers"
import { Empty, PageHeader, StatTile } from "@/components/app/page-header"
import { Pill } from "@/components/StatusBadge"
import { kindLabel, short, timeAgo, titleCase } from "@/lib/format"

const reasonText: Record<string, string> = {
  SSN_NAME_MISMATCH: "SSN doesn't match the name",
  DOB_MISMATCH: "Birth date mismatch",
  ADDRESS_MISMATCH: "Address mismatch",
  CREDIT_HISTORY_NEWER_THAN_BUSINESS: "Credit history newer than the business",
  INQUIRY_BURST: "Burst of recent credit inquiries",
  THIN_FILE: "Thin credit file",
  NO_CREDIT_FILE: "No credit file",
  OFFICER_MISMATCH: "Officer on file doesn't match",
  NEW_ENTITY: "Newly formed entity",
  RECENT_FILING_CHANGE: "Recent change to state filings",
}

const readable = (r: string) => {
  if (r.startsWith("OFAC")) return `Sanctions list match (${r.split(":").slice(2).join(" ")})`
  const [k, n] = r.split(":")
  if (k === "LIENS") return `${n} lien(s) on file`
  if (k === "JUDGMENTS") return `${n} judgment(s) on file`
  return reasonText[k] ?? r
}

export default function VendorChecksPage() {
  const live = useLive()
  const latest = live.organizations.map(o => {
    const v = [...live.verifications]
      .filter(x => x.orgId === o.id && x.subjectType === "ORG")
      .sort((a, b) => (a.checkedAt.microsSinceUnixEpoch > b.checkedAt.microsSinceUnixEpoch ? -1 : 1))[0] as
      | ((typeof live.verifications)[number] & { decision?: string })
      | undefined
    return { o, v, decision: v ? (v.decision ?? (v.passed ? "PASS" : "FAIL")) : "UNCHECKED" }
  })
  const count = (d: string) => latest.filter(x => x.decision === d).length
  return (
    <>
      <PageHeader
        eyebrow="Records"
        title="Vendor checks"
        description="CRS business and identity checks on every organization, including planted fraud cases. A FAIL can never be paid; a REVIEW needs two people to release it."
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatTile label="Passed" value={count("PASS")} tone="success" />
        <StatTile label="Needs review" value={count("REVIEW")} />
        <StatTile label="Failed" value={count("FAIL")} tone={count("FAIL") ? "danger" : undefined} />
      </div>
      {latest.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {latest.map(({ o, v, decision }) => (
            <div key={String(o.id)} className="rounded-xl border bg-card p-4">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{titleCase(o.name)}</p>
                  <p className="text-xs text-muted-foreground">{kindLabel[o.kind]}</p>
                </div>
                <Pill tone={decision === "PASS" ? "success" : decision === "REVIEW" ? "warning" : decision === "FAIL" ? "danger" : "neutral"}>{decision.toLowerCase()}</Pill>
              </div>
              {v?.reasons ? (
                <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                  {v.reasons.split(",").map(r => (
                    <li key={r}>· {readable(r)}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">{v ? "No issues found." : "Not checked yet."}</p>
              )}
              <p className="mt-3 font-mono text-[11px] text-muted-foreground">
                {v ? `${v.products.replaceAll(",", " · ")} · hash ${short(o.identityHash, 6, 4)} · ${timeAgo(v.checkedAt)}` : ""}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <Empty>No organizations yet.</Empty>
      )}
    </>
  )
}
