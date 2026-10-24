/**
 * Connection settings and the demo-persona model: who the browser is signed in as. Subscribe to the `my_*` views (my_invoice, my_milestone, …) and `me`; the underlying tables are private and refuse a direct subscription.
 *
 * Inputs:
 * - NEXT_PUBLIC_STDB_URI / NEXT_PUBLIC_STDB_DATABASE (default: Maincloud govflow-855y2)
 * - /api/personas (dev-only demo logins)
 *
 * Outputs:
 * - STDB_URI, STDB_DATABASE, Persona type, buildConnection(token)
 */

import { DbConnection } from "@/lib/module_bindings"

export const STDB_URI = process.env.NEXT_PUBLIC_STDB_URI ?? "wss://maincloud.spacetimedb.com"
export const STDB_DATABASE = process.env.NEXT_PUBLIC_STDB_DATABASE ?? "govflow-855y2"

export type Persona = {
  key: string
  name: string
  title: string
  orgId: string | null
  role: string | null
  token?: string
  observer: boolean
}

export const GUEST: Persona = { key: "guest", name: "Guest", title: "Not signed in", orgId: null, role: null, observer: false }

const GUEST_TOKEN_KEY = `${STDB_URI}/${STDB_DATABASE}/guest_token`

export function safeGet(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* private mode: fine, nothing to persist */
  }
}

export function buildConnection(persona: Persona) {
  const token = persona.token ?? safeGet(GUEST_TOKEN_KEY) ?? undefined
  return DbConnection.builder()
    .withUri(STDB_URI)
    .withDatabaseName(STDB_DATABASE)
    .withToken(token)
    .withAutomaticReconnect()
    .onConnect((_conn, _identity, newToken) => {
      if (!persona.token) safeSet(GUEST_TOKEN_KEY, newToken)
    })
}
