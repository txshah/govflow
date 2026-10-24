# web/

Next.js + shadcn/ui front end: the payment-flow overview, one live room per organization, and the shared envelope, ledger, audit and vendor-check views. It reads only through the database's `my_*` views and never holds API secrets or calls CRS, Coinbase or Claude directly; the Node API does that and results appear here live.

Run: `npm run dev` then open http://localhost:3100 (`npx next dev -p 3100`).

- **Viewing as:** the switcher (bottom left) signs in as any seeded demo person, or the read-only observer that sees every room. Logins come from `seed/.demo-tokens.json` and `seed/.demo-observer.json` (gitignored) through the dev-only `/api/personas` route; in production it returns nothing unless `DEMO_PERSONAS=1`.
- **Observer login:** `npx tsx scripts/request-observer.ts`, then as owner `spacetime call govflow-855y2 approve_observer_role <id>`. Redo after any database wipe.
- **Bindings:** regenerate after module changes with `spacetime generate --lang typescript --out-dir web/lib/module_bindings --module-path spacetimedb` from the repo root.
- **UI libraries:** shadcn/ui, Cult UI (`border-beam-card`, `halo-badge`, `rolling-number`), Watermelon UI (`transaction-list`).

**Inputs**

- SpacetimeDB subscriptions to `organization`, `me` and every `my_*` view; reducer calls from people's actions

**Outputs**

- UI for people; no secrets, no direct calls to outside services
