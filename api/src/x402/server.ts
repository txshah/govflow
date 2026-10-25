/**
 * Express seller exposing POST /api/verification/contractor at 0.01 test USDC that runs the CRS check.
 *
 * Inputs:
 * - x402 payment header
 * - { invoiceId }; the payee and wallets are looked up server-side, never taken from the caller
 *
 * Outputs:
 * - { decision, reasons, products, identityHash, walletMatched, paymentStatus } + payment-response header
 *
 * Run standalone: cd api && npm run x402:serve (payees resolve from env demo wallets)
 */

import { fileURLToPath } from 'node:url';
import express from 'express';
import { createX402Server } from '@coinbase/cdp-sdk/x402';
import { paymentMiddlewareFromHTTPServer } from '@x402/express';
import { BASE_SEPOLIA_CAIP2, VERIFICATION_PRICE, requireAddress } from '../config.ts';
import { IDENTITY_ANSWER_KEY } from '../crs/answerKey.ts';
import { PERSONAS } from '../crs/personas.ts';
import { verifyBusiness } from '../crs/verify.ts';
import { extractDocument, extractProject } from '../agents/extractor.ts';

/** What the endpoint needs to know about a bill's payee. */
export type Payee = { legalName: string; beneficiaryWallet: string; payoutWallet: string };
export type ResolvePayee = (invoiceId: string) => Payee | undefined;

export type VerificationResult = {
  decision: 'PASS' | 'REVIEW' | 'FAIL';
  reasons: string[];
  products: string[];
  identityHash: string;
  sandbox: true;
  walletMatched: boolean;
  paymentStatus: 'CLEAR' | 'FROZEN';
};

export async function createVerificationApp(resolvePayee: ResolvePayee) {
  const payTo = requireAddress('X402_PAY_TO');
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  // Document upload → Claude extraction. Free (not behind x402) and only for the local web app.
  app.use('/api/extract', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin && /^http:\/\/(localhost|127\.0\.0\.1):3100$/.test(req.headers.origin) ? req.headers.origin : 'http://localhost:3100');
    res.setHeader('Access-Control-Allow-Headers', 'content-type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (req.method === 'OPTIONS') return void res.sendStatus(204);
    next();
  });
  app.post('/api/extract', async (req, res) => {
    try {
      const { name, mediaType, data } = req.body ?? {};
      if (typeof data !== 'string' || typeof mediaType !== 'string') return void res.status(400).json({ error: 'name, mediaType and base64 data required' });
      const file = { name: String(name ?? 'upload'), mediaType, data };
      const out = req.body.kind === 'project' ? await extractProject(file) : await extractDocument(file);
      if (!out) return void res.status(422).json({ error: 'Claude could not read this document' });
      res.json(out);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  const server = await createX402Server({
    environment: 'development', // Base Sepolia; never mainnet
    payToConfig: { type: 'address', evm: payTo as `0x${string}` },
    routes: {
      'POST /api/verification/contractor': {
        price: VERIFICATION_PRICE,
        networks: [BASE_SEPOLIA_CAIP2],
        description: 'GovFlow contractor verification',
        // The SDK lists every route in the public Bazaar directory by default; this one is private.
        extensions: { bazaar: undefined },
      },
    },
  });
  app.use(paymentMiddlewareFromHTTPServer(server));

  app.post('/api/verification/contractor', async (req, res) => {
    const payee = resolvePayee(String(req.body?.invoiceId ?? ''));
    // The demo's payees are CRS sandbox personas, found by the legal name on the state filing.
    const c = payee && IDENTITY_ANSWER_KEY.find((x) => x.filing?.legalName === payee.legalName);
    if (!payee || !c?.filing) {
      res.json({ decision: 'FAIL', reasons: ['UNKNOWN_PAYEE'], products: [], identityHash: '', sandbox: true,
        walletMatched: false, paymentStatus: 'FROZEN' } satisfies VerificationResult);
      return;
    }
    try {
      const a = await verifyBusiness(c.id, PERSONAS[c.persona], c.filing);
      const walletMatched =
        !!payee.payoutWallet && payee.beneficiaryWallet.toLowerCase() === payee.payoutWallet.toLowerCase();
      const decision = walletMatched ? a.decision : 'FAIL';
      const reasons = walletMatched ? a.reasons : [...a.reasons, 'WALLET_MISMATCH'];
      res.json({
        decision,
        reasons,
        products: a.products,
        identityHash: a.identityHash,
        sandbox: true,
        walletMatched,
        paymentStatus: decision === 'PASS' ? 'CLEAR' : 'FROZEN',
      } satisfies VerificationResult);
    } catch (e) {
      // Never echo CRS errors back; they can carry request details.
      console.error('verification failed:', e instanceof Error ? e.message : e);
      res.status(502).json({ error: 'verification unavailable' });
    }
  });

  return app;
}

/** Standalone resolver: invoice ids "prime" and "impostor" bill the prime to its own wallet or to the impostor. */
export function demoPayees(): ResolvePayee {
  const prime = requireAddress('GOVFLOW_PRIME_TREASURY_ADDRESS');
  const legalName = IDENTITY_ANSWER_KEY.find((x) => x.id === 'prime-owner')!.filing!.legalName;
  return (id) =>
    id === 'prime' ? { legalName, beneficiaryWallet: prime, payoutWallet: prime }
    : id === 'impostor' ? { legalName, beneficiaryWallet: requireAddress('GOVFLOW_IMPOSTOR_ADDRESS'), payoutWallet: prime }
    : undefined;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = await createVerificationApp(demoPayees());
  app.listen(4021, () => console.log('x402 seller on http://localhost:4021 (Base Sepolia)'));
}
