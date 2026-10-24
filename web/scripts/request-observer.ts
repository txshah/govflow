/**
 * Creates the read-only observer login for the demo's flow screen: connects as a fresh identity, asks for the observer role, and saves the login to seed/.demo-observer.json (gitignored).
 *
 * Inputs:
 * - NEXT_PUBLIC_STDB_URI / NEXT_PUBLIC_STDB_DATABASE (default: Maincloud govflow-855y2)
 *
 * Outputs:
 * - seed/.demo-observer.json { name, title, identity, token } (mode 600)
 * - A pending service_request; the owner then runs: spacetime call govflow-855y2 approve_observer_role <id>
 *
 * Run: cd web && npx tsx scripts/request-observer.ts
 */

import { writeFileSync } from "node:fs"
import path from "node:path"
import { DbConnection } from "../lib/module_bindings"
import { STDB_DATABASE, STDB_URI } from "../lib/spacetime"

const out = path.resolve(import.meta.dirname, "..", "..", "seed", ".demo-observer.json")

DbConnection.builder()
  .withUri(STDB_URI)
  .withDatabaseName(STDB_DATABASE)
  .onConnect(async (conn, identity, token) => {
    writeFileSync(out, JSON.stringify({ name: "Flow screen", title: "Read-only observer", identity: identity.toHexString(), token }, null, 2), { mode: 0o600 })
    try {
      await conn.reducers.requestServiceRole({ label: "flow-screen" })
      console.log(`Requested observer role for ${identity.toHexString()}`)
      console.log(`Saved login to ${out}`)
    } catch (e) {
      console.error("Request failed:", e instanceof Error ? e.message : e)
      process.exitCode = 1
    }
    conn.disconnect()
  })
  .onConnectError((_ctx, e) => {
    console.error("Connection failed:", e)
    process.exit(1)
  })
  .build()
