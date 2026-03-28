import { describe, it, expect, vi } from "vitest";
import { verifyPayment, validateProofState, type VerifyContext } from "../../src/shared/verify.js";
import { CashuErrorCode } from "../../src/shared/types.js";
import type { Token, Proof } from "@cashu/cashu-ts";

function makeToken(overrides?: Partial<Token>): Token {
  return {
    mint: "https://mint.example.com",
    unit: "sat",
    proofs: [
      { id: "keyset1", amount: 64, secret: "secret1", C: "C1" },
      { id: "keyset1", amount: 32, secret: "secret2", C: "C2" },
      { id: "keyset1", amount: 4, secret: "secret3", C: "C3" },
    ] as Proof[],
    ...overrides,
  };
}

function makeContext(overrides?: Partial<VerifyContext>): VerifyContext {
  return {
    mints: ["https://mint.example.com"],
    unit: "sat",
    requiredAmount: 100,
    allowInsecure: false,
    checkProofStates: vi.fn().mockResolvedValue(
      Array(3).fill({ state: "UNSPENT" }),
    ),
    ...overrides,
  };
}

describe("validateProofState", () => {
  it("returns valid states unchanged", () => {
    expect(validateProofState("UNSPENT")).toBe("UNSPENT");
    expect(validateProofState("SPENT")).toBe("SPENT");
    expect(validateProofState("PENDING")).toBe("PENDING");
  });

  it("throws on unknown state", () => {
    expect(() => validateProofState("INVALID")).toThrow("Unknown proof state: INVALID");
  });

  it("throws on empty string", () => {
    expect(() => validateProofState("")).toThrow("Unknown proof state: ");
  });
});

describe("verifyPayment", () => {
  it("passes with valid token meeting all requirements", async () => {
    const token = makeToken();
    const ctx = makeContext();
    const result = await verifyPayment(token, ctx);
    expect(result.isValid).toBe(true);
  });

  it("rejects token from untrusted mint", async () => {
    const token = makeToken({ mint: "https://evil.mint.com" });
    const ctx = makeContext();
    const result = await verifyPayment(token, ctx);
    expect(result.isValid).toBe(false);
    expect(result.errorCode).toBe(CashuErrorCode.UNTRUSTED_MINT);
  });

  it("rejects token from HTTP mint", async () => {
    const token = makeToken({ mint: "http://insecure.mint.com" });
    const ctx = makeContext({ mints: ["http://insecure.mint.com"] });
    const result = await verifyPayment(token, ctx);
    expect(result.isValid).toBe(false);
    expect(result.errorCode).toBe(CashuErrorCode.UNTRUSTED_MINT);
  });

  it("allows HTTP mint when allowInsecure is true", async () => {
    const token = makeToken({ mint: "http://localhost:3338" });
    const ctx = makeContext({
      mints: ["http://localhost:3338"],
      allowInsecure: true,
    });
    const result = await verifyPayment(token, ctx);
    expect(result.isValid).toBe(true);
  });

  it("rejects token with wrong unit", async () => {
    const token = makeToken({ unit: "usd" });
    const ctx = makeContext();
    const result = await verifyPayment(token, ctx);
    expect(result.isValid).toBe(false);
    expect(result.errorCode).toBe(CashuErrorCode.UNIT_MISMATCH);
  });

  it("rejects token with missing unit", async () => {
    const token = makeToken({ unit: undefined });
    const ctx = makeContext();
    const result = await verifyPayment(token, ctx);
    expect(result.isValid).toBe(false);
    expect(result.errorCode).toBe(CashuErrorCode.UNIT_MISMATCH);
  });

  it("rejects token with insufficient amount", async () => {
    const token = makeToken({
      proofs: [{ id: "keyset1", amount: 32, secret: "s1", C: "C1" }] as Proof[],
    });
    const ctx = makeContext();
    const result = await verifyPayment(token, ctx);
    expect(result.isValid).toBe(false);
    expect(result.errorCode).toBe(CashuErrorCode.INSUFFICIENT_AMOUNT);
  });

  it("rejects token with spent proofs", async () => {
    const token = makeToken();
    const ctx = makeContext({
      checkProofStates: vi.fn().mockResolvedValue([
        { state: "UNSPENT" },
        { state: "SPENT" },
        { state: "UNSPENT" },
      ]),
    });
    const result = await verifyPayment(token, ctx);
    expect(result.isValid).toBe(false);
    expect(result.errorCode).toBe(CashuErrorCode.PROOFS_SPENT);
  });

  it("rejects token with pending proofs", async () => {
    const token = makeToken();
    const ctx = makeContext({
      checkProofStates: vi.fn().mockResolvedValue([
        { state: "UNSPENT" },
        { state: "PENDING" },
        { state: "UNSPENT" },
      ]),
    });
    const result = await verifyPayment(token, ctx);
    expect(result.isValid).toBe(false);
    expect(result.errorCode).toBe(CashuErrorCode.PROOFS_SPENT);
  });

  it("handles mint unreachable during proof check", async () => {
    const token = makeToken();
    const ctx = makeContext({
      checkProofStates: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    });
    const result = await verifyPayment(token, ctx);
    expect(result.isValid).toBe(false);
    expect(result.errorCode).toBe(CashuErrorCode.MINT_UNREACHABLE);
  });

  it("normalizes mint URLs before comparison", async () => {
    const token = makeToken({ mint: "https://Mint.Example.COM/" });
    const ctx = makeContext({ mints: ["https://mint.example.com"] });
    const result = await verifyPayment(token, ctx);
    expect(result.isValid).toBe(true);
  });

  it("rejects when pubkey required but token has no P2PK lock", async () => {
    const token = makeToken();
    const ctx = makeContext({ pubkey: "02abcdef1234567890" });
    const result = await verifyPayment(token, ctx);
    expect(result.isValid).toBe(false);
    expect(result.errorCode).toBe(CashuErrorCode.P2PK_MISMATCH);
  });
});
