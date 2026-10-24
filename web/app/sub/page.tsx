"use client"

/**
 * Subcontractor room: the owner submits evidence, confirms bills and gets paid to the verified wallet.
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
      <RoomView kind="SUB" />
    </Suspense>
  )
}
