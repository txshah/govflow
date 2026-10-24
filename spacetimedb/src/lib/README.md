# lib/

Shared helpers used by reducers so each rule is written once: `constants` (every state and role name), `ctx` (typed context), `auth` (who may call), `stateMachines` (allowed transitions), `freeze` (freeze + hold), `audit`, `ledger`.

**Inputs**

- Reducer context and rows

**Outputs**

- Checks that throw SenderError on violation; audit and ledger rows
