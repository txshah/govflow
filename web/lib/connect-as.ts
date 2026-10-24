/**
 * Opens a SpacetimeDB connection signed in as one demo person, for steps the demo performs on their behalf.
 *
 * Inputs:
 * - The person's SpacetimeDB token (from /api/personas)
 *
 * Outputs:
 * - A connected DbConnection (call .disconnect() when done)
 */

import { DbConnection } from "@/lib/module_bindings"
import { STDB_DATABASE, STDB_URI } from "@/lib/spacetime"

export function connectAs(token: string): Promise<DbConnection> {
  return new Promise((resolve, reject) => {
    DbConnection.builder()
      .withUri(STDB_URI)
      .withDatabaseName(STDB_DATABASE)
      .withToken(token)
      .onConnect(c => resolve(c))
      .onConnectError((_c, e) => reject(e))
      .build()
  })
}
