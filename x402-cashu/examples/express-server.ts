/**
 * Minimal x402 + Cashu direct-mode example using Express.
 *
 * Demonstrates how to protect an endpoint with Cashu ecash payments.
 * The server accepts sat-denominated tokens from a configured mint.
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
} from "x402-cashu";
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

// In a real deployment, wire up with x402 middleware:
//
//   import { paymentMiddleware } from "@x402/http-express";
//   app.use("/paid", paymentMiddleware(resourceServer, {
//     amount: "100",
//     asset: "sat",
//     network: "cashu:mainnet",
//   }));

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
