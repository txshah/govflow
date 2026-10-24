"use client"

/**
 * Reads the bill id from the URL and renders the envelope (or its case file).
 *
 * Inputs:
 * - useParams().invoiceId
 *
 * Outputs:
 * - EnvelopeView
 */

import { useParams } from "next/navigation"
import { EnvelopeView } from "@/components/envelope/envelope-view"

export function EnvelopeClient({ focus }: { focus?: "case" }) {
  const { invoiceId } = useParams<{ invoiceId: string }>()
  return <EnvelopeView invoiceId={invoiceId} focus={focus} />
}
