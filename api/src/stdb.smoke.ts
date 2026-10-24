/**
 * SpacetimeDB connection test: connects as the service identity and prints it. Writes nothing.
 *
 * Inputs:
 * - .env.local (STDB_URI, STDB_DATABASE)
 *
 * Outputs:
 * - The service identity, and the one-time steps to make it the service if this is the first run
 *
 * Run: cd api && npm run stdb:smoke
 */

import { connectService } from './stdb.ts';

const { conn, identity, firstRun } = await connectService();
console.log(`connected to ${process.env.STDB_DATABASE} as ${identity.toHexString()}`);
if (firstRun)
  console.log(
    'New identity saved to api/.stdb-service-token. To make it the service:\n' +
      '  1. cd api && npm run stdb:request-role\n' +
      `  2. owner: spacetime sql ${process.env.STDB_DATABASE} "SELECT * FROM service_request"\n` +
      `  3. owner: spacetime call ${process.env.STDB_DATABASE} approve_service_role <id>`
  );
conn.disconnect();
