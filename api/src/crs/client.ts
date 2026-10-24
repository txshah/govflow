/**
 * Logs in, caches the Bearer token, refreshes on 401, and calls CRS endpoints without ever logging bodies or tokens.
 *
 * Inputs:
 * - Endpoint path + request payload
 *
 * Outputs:
 * - Raw CRS JSON response (kept in memory only)
 */

export class CrsError extends Error {
  status: number;
  codes: string[];
  requestId: string | null;
  constructor(message: string, status: number, codes: string[], requestId: string | null) {
    super(message);
    this.status = status;
    this.codes = codes;
    this.requestId = requestId;
  }
}

export type CrsResponse<T> = { data: T; requestId: string | null };

const baseUrl = () => process.env.CRS_BASE_URL ?? 'https://api-sandbox.stitchcredit.com/api';

let token: string | null = null;
let tokenExpiresAt = 0;
let inflight: Promise<string> | null = null;
// Repeated failed logins disable the CRS account (CRS113/CRS114), so after one failure we stop for good.
let loginFailed = false;

async function login(): Promise<string> {
  if (loginFailed) throw new CrsError('CRS login failed earlier; fix credentials and restart', 401, [], null);
  const { CRS_USERNAME, CRS_PASSWORD } = process.env;
  if (!CRS_USERNAME || !CRS_PASSWORD) throw new CrsError('CRS_USERNAME / CRS_PASSWORD not set', 0, [], null);

  const res = await fetch(`${baseUrl()}/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ username: CRS_USERNAME, password: CRS_PASSWORD }),
  });
  const body = (await res.json().catch(() => ({}))) as { token?: string; expires?: number; codes?: string[] };
  if (!res.ok || !body.token) {
    loginFailed = true;
    throw new CrsError(`CRS login failed (${res.status})`, res.status, body.codes ?? [], null);
  }
  token = body.token;
  // `expires` is seconds; renew a minute early.
  tokenExpiresAt = Date.now() + ((body.expires ?? 3600) - 60) * 1000;
  return token;
}

async function getToken(force = false): Promise<string> {
  if (!force && token && Date.now() < tokenExpiresAt) return token;
  inflight ??= login().finally(() => (inflight = null));
  return inflight;
}

/** POST to a CRS path (e.g. `/transunion/identity-manager-verification/basic`), re-logging in once on 401. */
export async function crsPost<T>(path: string, payload: unknown): Promise<CrsResponse<T>> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${baseUrl()}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${await getToken(attempt > 0)}`,
      },
      body: JSON.stringify(payload),
    });
    const requestId = res.headers.get('requestid');
    if (res.status === 401 && attempt === 0) continue;
    const body = (await res.json().catch(() => null)) as (T & { codes?: string[]; messages?: string[] }) | null;
    if (!res.ok || body === null) {
      const codes = body?.codes ?? [];
      throw new CrsError(`CRS ${path} failed (${res.status}) ${codes.join(',')}`, res.status, codes, requestId);
    }
    return { data: body, requestId };
  }
}
