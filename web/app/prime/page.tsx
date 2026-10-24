"use client"

/**
 * Prime contractor room: the AP team bills the agency with pay applications and processes incoming sub invoices alongside the prime agent.
 *
 * Inputs:
 * - Live rows for the signed-in persona
 *
 * Outputs:
 * - RoomView for this organization, with actions only for its own people
 */

import { Suspense } from "react"
import { RoomView } from "@/components/room/room-view"

export default function Page() {
  return (
    <Suspense fallback={null}>
      <RoomView kind="PRIME" />
    </Suspense>
  )
}
