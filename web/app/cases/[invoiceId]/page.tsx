/**
 * Fraud case file for one bill: why it froze, the wallet-change request, the risk agent's findings and re-verification, with the unfreeze votes.
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
      <EnvelopeClient focus="case" />
    </Suspense>
  )
}
