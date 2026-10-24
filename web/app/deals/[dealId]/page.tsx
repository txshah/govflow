/**
 * Deal signing screen where verified signers sign the deal and see each agent's mandate.
 *
 * Inputs:
 * - dealId from the URL (read on the client inside Suspense)
 *
 * Outputs:
 * - DealView
 */

import { Suspense } from "react"
import { DealView } from "@/components/deal-view"

export default function Page() {
  return (
    <Suspense fallback={null}>
      <DealView />
    </Suspense>
  )
}
