/**
 * Shared payment envelope: the only cross-org view, showing one bill with its match, CRS checks, approvals, payout and audit trail.
 *
 * Inputs:
 * - invoiceId from the URL (read on the client inside Suspense, as Cache Components requires for dynamic params)
 *
 * Outputs:
 * - EnvelopeView for that bill
 */

import { Suspense } from "react"
import { EnvelopeClient } from "@/components/envelope/envelope-client"

export default function Page() {
  return (
    <Suspense fallback={null}>
      <EnvelopeClient />
    </Suspense>
  )
}
