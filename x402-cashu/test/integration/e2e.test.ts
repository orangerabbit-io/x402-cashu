import { describe, it, expect, beforeAll, vi } from "vitest";
import { Wallet, getEncodedTokenV4 } from "@cashu/cashu-ts";
import type { Proof } from "@cashu/cashu-ts";
import { verifyPayment, type VerifyContext } from "../../src/shared/verify.js";
import { settlePayment, type SettleContext } from "../../src/shared/settle.js";
import { parseToken } from "../../src/shared/token.js";
import { noopProofStore } from "../../src/shared/types.js";
import { createFundedWallet, TEST_MINT_URL } from "./setup.js";

/** Encode proofs as a Cashu TokenV4 string for the test mint. */
function encodeToken(proofs: Proof[], unit = "sat"): string {
  return getEncodedTokenV4({
    mint: TEST_MINT_URL,
    proofs,
    unit,
  });
}

describe("e2e: direct mode payment flow", () => {
  let wallet: Wallet;
  let allProofs: Proof[];
  let serverWallet: Wallet;
  let keysetIds: string[];
  const storedProofs: Array<{ proofs: unknown[]; mintUrl: string }> = [];

  beforeAll(async () => {
    ({ wallet, proofs: allProofs } = await createFundedWallet(3));
    serverWallet = new Wallet(TEST_MINT_URL, { unit: "sat" });
    await serverWallet.loadMint();
    keysetIds = serverWallet.keyChain.getAllKeysetIds();
  });

  it("verifies and settles a valid payment", async () => {
    const { send: sendProofs, keep } = await wallet.send(1, allProofs);
    allProofs = keep;

    const tokenStr = encodeToken(sendProofs);
    const token = parseToken(tokenStr, keysetIds);

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

    const settleResult = await settlePayment(token, settleCtx, tokenStr);
    expect(settleResult.success).toBe(true);
    expect(settleResult.transaction).toBeDefined();
    expect(settleResult.amount).toBeGreaterThanOrEqual(1);
    expect(storedProofs.length).toBeGreaterThan(0);
  });

  it("rejects already-spent proofs on second submission", async () => {
    const { send: sendProofs, keep } = await wallet.send(1, allProofs);
    allProofs = keep;

    const tokenStr = encodeToken(sendProofs);
    const token = parseToken(tokenStr, keysetIds);

    // First settle succeeds
    const settleCtx: SettleContext = {
      receiveToken: async (t) => serverWallet.receive(t),
      proofStore: noopProofStore,
    };
    await settlePayment(token, settleCtx, tokenStr);

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
    const { send: sendProofs, keep } = await wallet.send(1, allProofs);
    allProofs = keep;

    const tokenStr = encodeToken(sendProofs);
    const token = parseToken(tokenStr, keysetIds);

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
