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
  let clientWallet: Wallet;
  let clientProofs: Proof[];
  let serverWallet: Wallet;
  const storedProofs: Array<{ proofs: unknown[]; mintUrl: string }> = [];

  beforeAll(async () => {
    ({ wallet: clientWallet, proofs: clientProofs } = await createFundedWallet(500));
    serverWallet = new Wallet(TEST_MINT_URL, { unit: "sat" });
    await serverWallet.loadMint();
  });

  it("verifies and settles a valid payment", async () => {
    const client = new ExactCashuClient(clientWallet, TEST_MINT_URL, clientProofs);

    const requirements = {
      scheme: "exact",
      network: CASHU_NETWORK as `${string}:${string}`,
      asset: "sat",
      amount: "100",
      payTo: TEST_MINT_URL,
      maxTimeoutSeconds: 30,
      extra: { mints: [TEST_MINT_URL], unit: "sat" },
    };

    // Client creates payment
    const { payload } = await client.createPaymentPayload(2, requirements);
    expect(payload.token).toBeDefined();

    // Server verifies payment
    const token = parseToken(payload.token as string);
    const verifyCtx: VerifyContext = {
      mints: [TEST_MINT_URL],
      unit: "sat",
      requiredAmount: 100,
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

    // Server settles payment
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
    expect(settleResult.amount).toBeGreaterThanOrEqual(100);
    expect(storedProofs.length).toBeGreaterThan(0);
  });

  it("rejects already-spent proofs on second submission", async () => {
    // Fund a fresh wallet for this test
    const { wallet: freshWallet, proofs: freshProofs } = await createFundedWallet(200);
    const client = new ExactCashuClient(freshWallet, TEST_MINT_URL, freshProofs);

    const requirements = {
      scheme: "exact",
      network: CASHU_NETWORK as `${string}:${string}`,
      asset: "sat",
      amount: "50",
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
      requiredAmount: 50,
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
    const { wallet: freshWallet, proofs: freshProofs } = await createFundedWallet(100);
    const client = new ExactCashuClient(freshWallet, TEST_MINT_URL, freshProofs);

    const requirements = {
      scheme: "exact",
      network: CASHU_NETWORK as `${string}:${string}`,
      asset: "sat",
      amount: "10",
      payTo: TEST_MINT_URL,
      maxTimeoutSeconds: 30,
      extra: { mints: [TEST_MINT_URL], unit: "sat" },
    };

    const { payload } = await client.createPaymentPayload(2, requirements);
    const token = parseToken(payload.token as string);

    const verifyCtx: VerifyContext = {
      mints: ["https://other-mint.example.com"],
      unit: "sat",
      requiredAmount: 10,
      allowInsecure: true,
      checkProofStates: vi.fn(),
    };

    const verifyResult = await verifyPayment(token, verifyCtx);
    expect(verifyResult.isValid).toBe(false);
    expect(verifyResult.errorCode).toBe("UNTRUSTED_MINT");
  });
});
