import { describe, it, expect, vi } from "vitest";
import { settlePayment, type SettleContext } from "../../src/shared/settle.js";
import { CashuErrorCode } from "../../src/shared/types.js";
import type { Token, Proof } from "@cashu/cashu-ts";

function makeToken(): Token {
  return {
    mint: "https://mint.example.com",
    unit: "sat",
    proofs: [
      { id: "keyset1", amount: 64, secret: "s1", C: "C1" },
      { id: "keyset1", amount: 32, secret: "s2", C: "C2" },
      { id: "keyset1", amount: 4, secret: "s3", C: "C3" },
    ] as Proof[],
  };
}

function makeContext(overrides?: Partial<SettleContext>): SettleContext {
  const freshProofs = [
    { id: "keyset1", amount: 100, secret: "fresh1", C: "Cfresh1" },
  ] as Proof[];
  return {
    receiveToken: vi.fn().mockResolvedValue(freshProofs),
    proofStore: { saveProofs: vi.fn().mockResolvedValue(undefined) },
    ...overrides,
  };
}

describe("settlePayment", () => {
  it("swaps proofs and stores fresh ones", async () => {
    const token = makeToken();
    const ctx = makeContext();
    const result = await settlePayment(token, ctx);
    expect(result.success).toBe(true);
    expect(result.transaction).toBeDefined();
    expect(ctx.receiveToken).toHaveBeenCalledWith(token);
    expect(ctx.proofStore.saveProofs).toHaveBeenCalled();
  });

  it("returns SWAP_FAILED when swap fails", async () => {
    const token = makeToken();
    const ctx = makeContext({
      receiveToken: vi.fn().mockRejectedValue(new Error("proofs already spent")),
    });
    const result = await settlePayment(token, ctx);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(CashuErrorCode.SWAP_FAILED);
  });

  it("returns settled amount from fresh proofs", async () => {
    const token = makeToken();
    const freshProofs = [
      { id: "keyset1", amount: 100, secret: "f1", C: "Cf1" },
    ] as Proof[];
    const ctx = makeContext({
      receiveToken: vi.fn().mockResolvedValue(freshProofs),
    });
    const result = await settlePayment(token, ctx);
    expect(result.success).toBe(true);
    expect(result.amount).toBe(100);
  });
});
