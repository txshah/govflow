"use client"

/**
 * Agency (government) room: the agency PM accepts the prime's work and two finance approvers release USDC from the agency treasury.
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
      <RoomView kind="AGENCY" />
    </Suspense>
  )
}
