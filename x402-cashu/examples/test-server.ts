/**
 * Minimal test server for manual x402-cashu testing with curl.
 *
 * Usage:
 *   MINT_URL=https://mint.minibits.cash/Bitcoin npx tsx examples/test-server.ts
 *
 * Test with curl:
 *   # 1. See payment requirements
 *   curl http://localhost:3000/paid
 *
 *   # 2. Pay with a Cashu token (1 sat)
 *   curl -H "X-Cashu-Token: cashuB..." http://localhost:3000/paid
 *
 * After settlement, the server prints a change token to stdout.
 * Paste it back into your wallet to recover your sats.
 */
import express from "express";
import { Wallet, getEncodedTokenV4 } from "@cashu/cashu-ts";
import type { Proof } from "@cashu/cashu-ts";
import { parseToken } from "../src/shared/token.js";
import { verifyPayment, validateProofState, type VerifyContext } from "../src/shared/verify.js";
import { settlePayment, type SettleContext } from "../src/shared/settle.js";
import { CASHU_NETWORK } from "../src/shared/types.js";

const MINT_URL = process.env.MINT_URL ?? "https://mint.minibits.cash/Bitcoin";
const PRICE = 1; // 1 sat
const PORT = Number(process.env.PORT ?? 3000);

let serverWallet: Wallet;

async function init() {
  serverWallet = new Wallet(MINT_URL, { unit: "sat" });
  await serverWallet.loadMint();
  console.log(`Server wallet connected to ${MINT_URL}`);
}

const app = express();

app.get("/paid", async (req, res) => {
  const tokenStr = req.headers["x-cashu-token"] as string | undefined;

  // No token → return payment requirements
  if (!tokenStr) {
    res.status(402).json({
      status: 402,
      message: "Payment required",
      requirements: {
        network: CASHU_NETWORK,
        amount: String(PRICE),
        asset: "sat",
        mints: [MINT_URL],
        unit: "sat",
      },
      instructions: `Send a ${PRICE} sat Cashu token in the X-Cashu-Token header`,
    });
    return;
  }

  // Parse token
  let token;
  try {
    token = parseToken(tokenStr);
  } catch {
    res.status(400).json({ error: "Invalid Cashu token" });
    return;
  }

  // Verify
  const verifyCtx: VerifyContext = {
    mints: [MINT_URL],
    unit: "sat",
    requiredAmount: PRICE,
    allowInsecure: MINT_URL.startsWith("http://"),
    checkProofStates: async (proofs) => {
      const states = await serverWallet.checkProofsStates(proofs);
      return states.map((s) => ({
        state: validateProofState(s.state),
      }));
    },
  };

  const verifyResult = await verifyPayment(token, verifyCtx);
  if (!verifyResult.isValid) {
    res.status(402).json({
      error: "Payment verification failed",
      code: verifyResult.errorCode,
      message: verifyResult.errorMessage,
    });
    return;
  }

  // Settle — swap proofs at the mint
  let freshProofs: Proof[] = [];
  const settleCtx: SettleContext = {
    receiveToken: async (t) => serverWallet.receive(t),
    proofStore: {
      async saveProofs(proofs) {
        freshProofs = proofs;
      },
    },
  };

  const settleResult = await settlePayment(token, settleCtx);
  if (!settleResult.success) {
    res.status(500).json({
      error: "Settlement failed",
      code: settleResult.errorCode,
      message: settleResult.errorMessage,
    });
    return;
  }

  // Encode fresh proofs as a token so sats can be recovered
  const changeToken = getEncodedTokenV4({
    mint: MINT_URL,
    proofs: freshProofs,
    unit: "sat",
  });

  const amount = freshProofs.reduce((s, p) => s + p.amount, 0);
  console.log(`\nSettled ${amount} sat (tx: ${settleResult.transaction?.slice(0, 16)}...)`);
  console.log(`Change token (paste into wallet to recover):\n${changeToken}\n`);

  // WARNING: Returning the change token in the response body is insecure for
  // production use. Any intermediary (proxy, CDN, log aggregator) could capture
  // and redeem it. In a real deployment, change should be returned via a secure
  // side channel or the client should use P2PK-locked tokens.
  res.json({
    message: "Payment accepted!",
    content: "This is the paid content.",
    settled: {
      amount,
      transaction: settleResult.transaction,
    },
    changeToken,
  });
});

app.get("/", (_req, res) => {
  res.json({
    endpoints: {
      "GET /paid": "Protected endpoint (send X-Cashu-Token header)",
    },
  });
});

init().then(() => {
  app.listen(PORT, () => {
    console.log(`\nTest server running at http://localhost:${PORT}`);
    console.log(`Price: ${PRICE} sat per request`);
    console.log(`\nTry:`);
    console.log(`  curl http://localhost:${PORT}/paid`);
    console.log(`  curl -H "X-Cashu-Token: cashuB..." http://localhost:${PORT}/paid`);
  });
});
