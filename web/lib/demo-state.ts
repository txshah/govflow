/**
 * Browser-saved demo state: where the Live run is (so you can visit Open tenders mid-run and come back), and the
 * projects the city has posted from Live (shown on the Open tenders board).
 *
 * Inputs:
 * - Values from the Live page; localStorage (may be unavailable, so every access is guarded)
 *
 * Outputs:
 * - loadRun/saveRun, loadTenders/saveTender/updateTender
 */

import type { ProjectBrief } from "@/lib/live-steps"

export type RunState = {
  chosen: string | null // "new", a prime contract id, or null for the newest
  tenderId: string | null
  fraudSkipped: boolean
  posted: boolean
  screened: boolean
  selected: boolean
  checked: boolean
  negotiated: boolean
  triedBad: boolean
  brief: ProjectBrief | null
}

export type SavedTender = ProjectBrief & { id: string; postedAt: number; contractId?: string }

const RUN = "govflow.live-run"
const TENDERS = "govflow.tenders"

function read<T>(key: string): T | null {
  try {
    const v = localStorage.getItem(key)
    return v ? (JSON.parse(v) as T) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage blocked: the demo still works, it just won't survive navigation.
  }
}

export const loadRun = () => read<RunState>(RUN)
export const saveRun = (r: RunState) => write(RUN, r)

export const loadTenders = () => read<SavedTender[]>(TENDERS) ?? []

export function saveTender(brief: ProjectBrief): SavedTender {
  const all = loadTenders()
  const t: SavedTender = { ...brief, id: `T-2026-${String(115 + all.length).padStart(4, "0")}`, postedAt: Date.now() }
  write(TENDERS, [t, ...all])
  return t
}

export function updateTender(id: string, patch: Partial<SavedTender>) {
  write(
    TENDERS,
    loadTenders().map(t => (t.id === id ? { ...t, ...patch } : t))
  )
}
