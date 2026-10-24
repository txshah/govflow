/**
 * Polls the SpacetimeDB client cache until a value shows up (a reducer's row changes can land just after its call resolves).
 *
 * Inputs:
 * - Description for the timeout error, finder over the cache
 *
 * Outputs:
 * - The found value, or a timeout error
 */

export async function waitFor<T>(what: string, find: () => T | undefined, ms = 15_000): Promise<T> {
  const until = Date.now() + ms;
  for (;;) {
    const v = find();
    if (v !== undefined) return v;
    if (Date.now() > until) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}
