# Coinbase MCP + x402 setup

macOS · Claude Code · Base Sepolia · test USDC only. Goal: an agent pays 0.01 test USDC for a contractor verification over x402, a changed wallet freezes the payment, and an approved payout settles on testnet.

**Architecture:** Claude Code → Wallet MCP / CDP MCP → CDP testnet wallet → our x402 verification endpoint → verification result → deterministic fraud policy → human approval → optional testnet USDC transfer.

**Changes from the team draft:** the Wallet MCP is now confirmed to pay x402 on Base Sepolia; the first paid call targets our own local endpoint instead of an unverified public one; one named wallet is used for both the CLI and the x402 client; the seller code is added.

## 1. Prerequisites

```bash
node -v   # needs 22 or newer
npm -v
npm install -g @anthropic-ai/claude-code
claude --version
mkdir govflow-ai && cd govflow-ai && git init
```

## 2. Coinbase Wallet MCP

Gives Claude access to a Coinbase Wallet: balances, send, and paying x402 APIs. Every write action needs your approval in Coinbase Wallet, so it is for interactive testing, not unattended agents.

```bash
claude mcp add --scope user --transport http base-mcp https://wallet-mcp.coinbase.com
claude mcp list
```

In Claude Code, run `/mcp` and confirm `base-mcp` is connected. On Base Sepolia it supports `send`, `send_calls`, portfolio filtering and x402 payments; swaps are mainnet only.

## 3. CDP CLI and CDP MCP

```bash
npm install -g @coinbase/cdp-cli
cdp --version
claude mcp add --scope user --transport stdio cdp -- cdp mcp
claude mcp list
```

| MCP server | Purpose |
| --- | --- |
| base-mcp | Interactive wallet actions and x402 payments, each approved by you |
| cdp | Developer operations: accounts, faucet, balances |

## 4. CDP credentials

Create a project, API key and wallet secret at portal.cdp.coinbase.com. Store the files outside the repo.

```bash
cdp env live --key-file /secure/path/cdp-api-key.json
cdp env live --wallet-secret-file /secure/path/cdp_wallet_secret.txt
cdp env
cdp evm accounts list
```

The profile name `live` does not pick a network. Pass `base-sepolia` on every command.

## 5. Wallet and test funds

```bash
cdp evm accounts create name=govflow-agent
WALLET_ADDRESS=$(cdp evm accounts by-name govflow-agent --jq '.address')
cdp evm faucet address=$WALLET_ADDRESS network=base-sepolia token=eth
cdp evm faucet address=$WALLET_ADDRESS network=base-sepolia token=usdc
cdp evm token-balances get base-sepolia $WALLET_ADDRESS
```

Repeat for `govflow-agency-treasury` (the government pays the prime), `govflow-prime-treasury` (the prime pays subs) and `govflow-verifier` (receives x402 fees). Faucet rate limits apply.

## 6. SDK dependencies and secrets

```bash
npm init -y
npm install @coinbase/cdp-sdk @x402/core @x402/evm @x402/fetch @x402/express express viem
npm install -D typescript tsx @types/node @types/express
cat >> .gitignore <<'EOF'
.env
.env.*
!.env.example
*.pem
cdp-api-key.json
cdp_wallet_secret.txt
EOF
```

`.env.local` holds `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, `CDP_WALLET_SECRET` and `X402_PAY_TO` (the govflow-verifier address). Load it with `node --env-file=.env.local`, so `dotenv` is not needed.

## 7. Seller: the paid verification endpoint

`server.ts` charges 0.01 test USDC per call and returns a clearly labeled simulated result (swap in CRS later).

```ts
import express from "express";
import { createX402Server } from "@coinbase/cdp-sdk/x402";
import { paymentMiddlewareFromHTTPServer } from "@x402/express";

const app = express();
app.use(express.json());
const server = await createX402Server({
  environment: "development", // Base Sepolia
  payToConfig: { type: "address", evm: process.env.X402_PAY_TO! },
  routes: { "POST /api/verification/contractor": { price: "$0.01", networks: ["eip155:84532"], description: "Contractor verification (simulated)" } },
});
app.use(paymentMiddlewareFromHTTPServer(server));
app.post("/api/verification/contractor", (req, res) => {
  const { walletAddress } = req.body;
  const walletMatched = walletAddress === ON_FILE[req.body.contractorId];
  res.json({ simulated: true, identityVerified: true, walletMatched,
    risk: walletMatched ? "LOW" : "HIGH",
    paymentStatus: walletMatched ? "CLEAR" : "FROZEN",
    reason: walletMatched ? null : "Beneficiary wallet mismatch" });
});
app.listen(4021);
```

```bash
node --env-file=.env.local --import tsx server.ts
```

## 8. Buyer: the agent's first paid call

`client.ts`:

```ts
import { CdpX402Client } from "@coinbase/cdp-sdk/x402";
import { wrapFetchWithPayment } from "@x402/fetch";

const client = new CdpX402Client({ environment: "development" });
const { evmAddress } = await client.getAddresses();
console.log("Pays from:", evmAddress); // fund this address if it is not govflow-agent
const pay = wrapFetchWithPayment(globalThis.fetch, client);
const res = await pay("http://localhost:4021/api/verification/contractor", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ contractorId: "ABC-CONSTRUCTION", invoiceId: "INV-2026-001", walletAddress: "0x123..." }),
});
console.log(res.status, await res.json(), res.headers.get("payment-response"));
```

```bash
node --env-file=.env.local --import tsx client.ts
```

**One wallet, not two:** `CdpX402Client` may pay from a different CDP-managed address than `govflow-agent`. Either fund the printed address with `cdp evm faucet`, or wrap the named account with `fromCdpEvmAccount` from `@coinbase/cdp-sdk/x402` (check its signature in the installed version).

**Expected:** HTTP 200, the JSON result, and a `payment-response` header. A 200 alone doesn't prove payment; check the header and the verifier wallet's balance.

**Fallback:** if the local seller fails, the Wallet MCP can pay any x402 endpoint on Base Sepolia from Claude Code with your approval.

## 9. Contractor payout (not x402)

Approved bills are paid as a direct USDC transfer from the payer's treasury (`govflow-agency-treasury` for pay applications, `govflow-prime-treasury` for sub invoices) (USDC on Base Sepolia: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`, 6 decimals) with `cdp.evm.sendTransaction`, then `waitForTransactionReceipt`. Store the transaction hash on the payment row and link it to sepolia.basescan.org.

## 10. Security controls

| Control | Demo behavior |
| --- | --- |
| Chain | Base Sepolia only; refuse any other network |
| Per-call charge | Max 0.01 test USDC per verification |
| Agent budget | Max 0.10 test USDC per session |
| Endpoints | Server allowlist; no AI-selected URLs |
| Payout approval | Authenticated human with the finance role, never the agent |
| Changed wallet | Freeze pending independent re-verification and two approvals |
| Idempotency | One key per verification charge and per payout; reject repeats |
| Secrets | Environment only; never logged or sent to the browser |

An x402 receipt proves the API call was paid for. It does not prove legal identity, signing authority or that the result is correct; that comes from CRS.

## 11. Verify the install

| Test | Expected |
| --- | --- |
| `node -v` | 22 or newer |
| `claude --version`, `cdp --version` | Both installed |
| `claude mcp list` | `base-mcp` and `cdp` registered |
| `/mcp` in Claude Code | Wallet connected |
| `cdp evm token-balances get base-sepolia <address>` | Test ETH and USDC on each wallet |
| `client.ts` | 200, JSON result, payment-response header |
| Wallet mismatch request | `paymentStatus: FROZEN` |

## 12. Prompt for Claude Code

```text
Build GovFlow AI contractor verification and payment protection.
First confirm base-mcp and cdp MCP are connected, CDP auth works, and the x402 client wallet holds Base Sepolia test USDC.
Run one real x402 paid call to our local /api/verification/contractor endpoint.
Then implement invoice submission, beneficiary mismatch checks, a deterministic payment freeze, two-person human approval, testnet USDC payouts from govflow-agency-treasury (to the prime) and govflow-prime-treasury (to subs), and an audit log with transaction hashes.
Base Sepolia only, endpoint allowlist, spend caps of 0.01 per call and 0.10 per session.
Never expose credentials, let an agent approve a payout, or touch mainnet.
Check SDK APIs against installed versions. Label simulated verification as simulated.
```

## References

- [Coinbase Wallet MCP](https://docs.cdp.coinbase.com/ai-agents/coinbase-for-agents/wallet-mcp)
- [CDP MCP and CLI](https://docs.cdp.coinbase.com/ai-agents/cdp-for-agents/cdp-mcp)
- [x402 buyer quickstart](https://docs.cdp.coinbase.com/x402/quickstart-for-buyers)
- [x402 seller quickstart](https://docs.cdp.coinbase.com/x402/quickstart-for-sellers)
- [CDP: send and receive USDC](https://docs.cdp.coinbase.com/payments/send-and-receive)
- [CDP Portal](https://portal.cdp.coinbase.com/)
