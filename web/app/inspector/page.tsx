"use client"

/**
 * Inspector view: the prime's site inspector reviews subcontractor evidence and accepts or rejects each line.
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
      <RoomView kind="PRIME" focus="inspection" />
    </Suspense>
  )
}
