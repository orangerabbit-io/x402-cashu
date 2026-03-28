/**
 * Skeleton x402 + Cashu direct-mode example using Express.
 *
 * This is a starting point showing how to structure an x402 Cashu server.
 * The payment middleware integration is stubbed out — see the TODO below
 * for the full wiring with @x402/http-express.
 *
 * Prerequisites:
 *   - A running Cashu mint (e.g., Nutshell)
 *   - npm install express @x402/http-express x402-cashu
 *
 * Usage:
 *   npx tsx examples/express-server.ts
 */
import express from "express";
import {
  ExactCashuFacilitator,
  noopProofStore,
  type ProofStore,
} from "../src/index.js";
import type { Proof } from "@cashu/cashu-ts";

const MINT_URL = process.env.MINT_URL ?? "https://mint.example.com";
const PORT = Number(process.env.PORT ?? 3000);

// Simple in-memory proof store for demonstration
const inMemoryStore: ProofStore = {
  proofs: [] as Array<{ proofs: Proof[]; mintUrl: string }>,
  async saveProofs(proofs: Proof[], mintUrl: string) {
    this.proofs.push({ proofs, mintUrl });
    console.log(
      `Stored ${proofs.length} proofs from ${mintUrl} (total: ${proofs.reduce((s, p) => s + p.amount, 0)} sat)`,
    );
  },
} as ProofStore & { proofs: unknown[] };

const facilitator = new ExactCashuFacilitator({
  mints: [MINT_URL],
  unit: "sat",
  proofStore: inMemoryStore,
});

const app = express();

// TODO: Wire up with x402 middleware for production use:
//
//   import { paymentMiddleware } from "@x402/http-express";
//   app.use("/paid", paymentMiddleware(resourceServer, {
//     amount: "100",
//     asset: "sat",
//     network: "cashu:mainnet",
//   }));
//
// Without the middleware, the /paid endpoint below is unprotected.

app.get("/paid/content", (_req, res) => {
  res.json({
    message: "This content was paid for with Cashu ecash!",
    timestamp: new Date().toISOString(),
  });
});

app.get("/free/content", (_req, res) => {
  res.json({ message: "This content is free." });
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log(`  Free:  GET http://localhost:${PORT}/free/content`);
  console.log(`  Paid:  GET http://localhost:${PORT}/paid/content (requires Cashu payment)`);
});
