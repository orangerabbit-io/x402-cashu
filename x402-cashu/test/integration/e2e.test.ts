import { describe, it, expect, beforeAll, vi } from "vitest";
import { Wallet } from "@cashu/cashu-ts";
import type { Proof } from "@cashu/cashu-ts";
import { verifyPayment, type VerifyContext } from "../../src/shared/verify.js";
import { settlePayment, type SettleContext } from "../../src/shared/settle.js";
import { parseToken } from "../../src/shared/token.js";
import { ExactCashuClient } from "../../src/client/scheme.js";
import { CASHU_NETWORK, noopProofStore } from "../../src/shared/types.js";
import { createFundedWallet, TEST_MINT_URL } from "./setup.js";

describe("e2e: direct mode payment flow", () => {
  let wallet: Wallet;
  let allProofs: Proof[];
  let serverWallet: Wallet;
  const storedProofs: Array<{ proofs: unknown[]; mintUrl: string }> = [];

  beforeAll(async () => {
    // Receive the funding token once — all tests share this pool of proofs
    ({ wallet, proofs: allProofs } = await createFundedWallet(3));
    serverWallet = new Wallet(TEST_MINT_URL, { unit: "sat" });
    await serverWallet.loadMint();
  });

  it("verifies and settles a valid payment", async () => {
    // Split 1 sat from the shared proof pool
    const { send: sendProofs, keep } = await wallet.send(1, allProofs);
    allProofs = keep;

    const client = new ExactCashuClient(wallet, TEST_MINT_URL, sendProofs);

    const requirements = {
      scheme: "exact",
      network: CASHU_NETWORK as `${string}:${string}`,
      asset: "sat",
      amount: "1",
      payTo: TEST_MINT_URL,
      maxTimeoutSeconds: 30,
      extra: { mints: [TEST_MINT_URL], unit: "sat" },
    };

    const { payload } = await client.createPaymentPayload(2, requirements);
    expect(payload.token).toBeDefined();

    const token = parseToken(payload.token as string);
    const verifyCtx: VerifyContext = {
      mints: [TEST_MINT_URL],
      unit: "sat",
      requiredAmount: 1,
      allowInsecure: true,
      checkProofStates: async (proofs) => {
        const states = await serverWallet.checkProofsStates(proofs);
        return states.map((s) => ({
          state: s.state as "UNSPENT" | "SPENT" | "PENDING",
        }));
      },
    };

    const verifyResult = await verifyPayment(token, verifyCtx);
    expect(verifyResult.isValid).toBe(true);

    const settleCtx: SettleContext = {
      receiveToken: async (t) => serverWallet.receive(t),
      proofStore: {
        async saveProofs(proofs, mintUrl) {
          storedProofs.push({ proofs, mintUrl });
        },
      },
    };

    const settleResult = await settlePayment(token, settleCtx);
    expect(settleResult.success).toBe(true);
    expect(settleResult.transaction).toBeDefined();
    expect(settleResult.amount).toBeGreaterThanOrEqual(1);
    expect(storedProofs.length).toBeGreaterThan(0);
  });

  it("rejects already-spent proofs on second submission", async () => {
    const { send: sendProofs, keep } = await wallet.send(1, allProofs);
    allProofs = keep;

    const client = new ExactCashuClient(wallet, TEST_MINT_URL, sendProofs);

    const requirements = {
      scheme: "exact",
      network: CASHU_NETWORK as `${string}:${string}`,
      asset: "sat",
      amount: "1",
      payTo: TEST_MINT_URL,
      maxTimeoutSeconds: 30,
      extra: { mints: [TEST_MINT_URL], unit: "sat" },
    };

    const { payload } = await client.createPaymentPayload(2, requirements);
    const token = parseToken(payload.token as string);

    // First settle succeeds
    const settleCtx: SettleContext = {
      receiveToken: async (t) => serverWallet.receive(t),
      proofStore: noopProofStore,
    };
    await settlePayment(token, settleCtx);

    // Second verify with same token fails (proofs spent)
    const verifyCtx: VerifyContext = {
      mints: [TEST_MINT_URL],
      unit: "sat",
      requiredAmount: 1,
      allowInsecure: true,
      checkProofStates: async (proofs) => {
        const states = await serverWallet.checkProofsStates(proofs);
        return states.map((s) => ({
          state: s.state as "UNSPENT" | "SPENT" | "PENDING",
        }));
      },
    };

    const verifyResult = await verifyPayment(token, verifyCtx);
    expect(verifyResult.isValid).toBe(false);
    expect(verifyResult.errorCode).toBe("PROOFS_SPENT");
  });

  it("rejects token from untrusted mint", async () => {
    const { send: sendProofs } = await wallet.send(1, allProofs);

    const client = new ExactCashuClient(wallet, TEST_MINT_URL, sendProofs);

    const requirements = {
      scheme: "exact",
      network: CASHU_NETWORK as `${string}:${string}`,
      asset: "sat",
      amount: "1",
      payTo: TEST_MINT_URL,
      maxTimeoutSeconds: 30,
      extra: { mints: [TEST_MINT_URL], unit: "sat" },
    };

    const { payload } = await client.createPaymentPayload(2, requirements);
    const token = parseToken(payload.token as string);

    const verifyCtx: VerifyContext = {
      mints: ["https://other-mint.example.com"],
      unit: "sat",
      requiredAmount: 1,
      allowInsecure: true,
      checkProofStates: vi.fn(),
    };

    const verifyResult = await verifyPayment(token, verifyCtx);
    expect(verifyResult.isValid).toBe(false);
    expect(verifyResult.errorCode).toBe("UNTRUSTED_MINT");
  });
});
