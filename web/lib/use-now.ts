"use client"

/**
 * A clock that ticks every few seconds so "12s ago" labels and agent "at work" glows stay current. Reads 0 while prerendering on the server (Cache Components forbids Date.now() there) and the real time in the browser.
 *
 * Inputs:
 * - interval in ms (default 5000)
 *
 * Outputs:
 * - The current time in ms
 */

import { useCallback, useSyncExternalStore } from "react"

let current = 0

function snapshot() {
  if (current === 0) current = Date.now()
  return current
}

export function useNow(intervalMs = 5000) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const t = setInterval(() => {
        current = Date.now()
        onChange()
      }, intervalMs)
      return () => clearInterval(t)
    },
    [intervalMs]
  )
  return useSyncExternalStore(subscribe, snapshot, () => 0)
}
