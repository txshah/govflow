/**
 * Full-screen verification theater for one bill: every security check and approval as nodes that resolve in order.
 *
 * Inputs:
 * - invoiceId from the URL (read on the client inside Suspense, as Cache Components requires for dynamic params)
 *
 * Outputs:
 * - VerificationTheater
 */

import { Suspense } from "react"
import { TheaterClient } from "@/components/verify/theater-client"

export default function Page() {
  return (
    <Suspense fallback={null}>
      <TheaterClient />
    </Suspense>
  )
}
