/**
 * One-time: asks for the service role for this API's identity (the owner then approves it).
 *
 * Inputs:
 * - api/.stdb-service-token from stdb.smoke.ts
 *
 * Outputs:
 * - A service_request row labelled "govflow-api"
 */

import { connectService } from './stdb.ts';

const { conn, identity } = await connectService();
await conn.reducers.requestServiceRole({ label: 'govflow-api' });
console.log(`requested the service role for ${identity.toHexString()}`);
conn.disconnect();
