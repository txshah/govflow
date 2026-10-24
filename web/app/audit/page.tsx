"use client"

/**
 * Audit log screen: every recorded action the signed-in persona may see, newest first, filterable by text.
 *
 * Inputs:
 * - my_audit_event rows
 *
 * Outputs:
 * - Searchable table with actor, action, subject and links to bills
 */

import Link from "next/link"
import { useState } from "react"
import { useLive } from "@/components/app/providers"
import { Empty, PageHeader, Section } from "@/components/app/page-header"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { actorName, fmtTime } from "@/lib/format"
import { describeAudit } from "@/lib/describe"

export default function AuditPage() {
  const live = useLive()
  const [q, setQ] = useState("")
  const rows = [...live.audit]
    .sort((a, b) => (a.id > b.id ? -1 : 1))
    .filter(e => !q || `${e.actorLabel} ${e.action} ${e.detail} ${e.subjectType}`.toLowerCase().includes(q.toLowerCase()))
  return (
    <>
      <PageHeader
        eyebrow="Records"
        title="Audit log"
        description="Append-only. Every reducer call writes one event, so each decision traces back to the person, agent or rule behind it."
      />
      <Section title={`${rows.length} events`} actions={<Input className="h-8 w-56" placeholder="Filter…" value={q} onChange={e => setQ(e.target.value)} />}>
        {rows.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Time</TableHead>
                <TableHead>Who</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(0, 300).map(e => (
                <TableRow key={String(e.id)}>
                  <TableCell className="text-xs text-muted-foreground tabular-nums">{fmtTime(e.at)}</TableCell>
                  <TableCell className="font-medium">{actorName(e.actorLabel)}</TableCell>
                  <TableCell>{describeAudit(e.action, e.detail).title}</TableCell>
                  <TableCell className="text-xs">
                    {e.subjectType === "invoice" ? (
                      <Link className="text-info hover:underline" href={`/envelope/${e.subjectId}`}>
                        bill #{String(e.subjectId)}
                      </Link>
                    ) : (
                      `${e.subjectType.replace("_", " ")} #${e.subjectId}`
                    )}
                  </TableCell>
                  <TableCell className="max-w-72 truncate text-xs text-muted-foreground">{describeAudit(e.action, e.detail).detail ?? ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Empty>No events visible to you.</Empty>
        )}
      </Section>
    </>
  )
}
