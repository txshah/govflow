"use client"

/**
 * Rooms: one page with a tab per organization (agency, prime, sub), each showing that org's live room.
 *
 * Inputs:
 * - ?room=agency|prime|sub (default agency)
 *
 * Outputs:
 * - Room tabs and the chosen RoomView
 */

import { Suspense } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { RoomView } from "@/components/room/room-view"
import { cn } from "@/lib/utils"

const ROOMS = [
  { id: "agency", label: "City of Oakridge", kind: "AGENCY" },
  { id: "prime", label: "Okafor Builders", kind: "PRIME" },
  { id: "sub", label: "Nakamura Electric", kind: "SUB" },
] as const

function Rooms() {
  const q = useSearchParams().get("room")
  const room = ROOMS.find(r => r.id === q) ?? ROOMS[0]
  return (
    <div className="space-y-4">
      <div className="inline-flex gap-1 rounded-lg bg-muted p-1 text-sm">
        {ROOMS.map(r => (
          <Link key={r.id} href={`/rooms?room=${r.id}`} className={cn("rounded-md px-3 py-1.5 font-medium", r.id === room.id ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            {r.label}
          </Link>
        ))}
      </div>
      <RoomView key={room.id} kind={room.kind} />
    </div>
  )
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Rooms />
    </Suspense>
  )
}
