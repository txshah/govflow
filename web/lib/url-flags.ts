"use client"

/**
 * Reads two URL flags that let one browser show several people at once:
 * `?as=<persona>` signs this page in as that person (without changing the saved choice), and `?embed=1` hides the app chrome so the page fits in a pane on the Live screen.
 *
 * Inputs:
 * - window.location.search
 *
 * Outputs:
 * - readUrlFlags() and useEmbed()
 */

import { useSyncExternalStore } from "react"

export function readUrlFlags() {
  const q = new URLSearchParams(window.location.search)
  return { as: q.get("as"), embed: q.get("embed") === "1" }
}

const noop = () => () => {}

export function useEmbed() {
  return useSyncExternalStore(noop, () => readUrlFlags().embed, () => false)
}
