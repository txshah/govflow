"use client"

/**
 * Reads the bill id from the URL and opens the verification theater.
 *
 * Inputs:
 * - useParams().invoiceId
 *
 * Outputs:
 * - VerificationTheater
 */

import { useParams } from "next/navigation"
import { VerificationTheater } from "@/components/verify/theater"

export function TheaterClient() {
  const { invoiceId } = useParams<{ invoiceId: string }>()
  return <VerificationTheater invoiceId={invoiceId} />
}
