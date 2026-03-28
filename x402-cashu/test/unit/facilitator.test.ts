import { describe, it, expect, vi, beforeEach } from "vitest";
import { ExactCashuFacilitator } from "../../src/facilitator/scheme.js";
import { CashuErrorCode, CASHU_NETWORK } from "../../src/shared/types.js";
import type { Proof } from "@cashu/cashu-ts";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";

// Mock @cashu/cashu-ts v3
const mockCheckProofsStates = vi.fn();
const mockReceive = vi.fn();
const mockLoadMint = vi.fn().mockResolvedValue(undefined);

vi.mock("@cashu/cashu-ts", () => ({
  Wallet: vi.fn().mockImplementation(() => ({
    loadMint: mockLoadMint,
    checkProofsStates: mockCheckProofsStates,
    receive: mockReceive,
  })),
  getDecodedToken: vi.fn().mockImplementation((token: string) => {
    if (token === "valid-token") {
      return {
        mint: "https://mint.example.com",
        unit: "sat",
        proofs: [{ id: "k1", amount: 100, secret: "s1", C: "C1" }],
      };
    }
    throw new Error("invalid token");
  }),
  CheckStateEnum: {
    UNSPENT: "UNSPENT",
    PENDING: "PENDING",
    SPENT: "SPENT",
  },
}));

function makePayload(token: string): PaymentPayload {
  return {
    x402Version: 2,
    payload: { token },
    accepted: {} as PaymentRequirements,
  };
}

function makeRequirements(amount: string): PaymentRequirements {
  return {
    scheme: "exact",
    network: CASHU_NETWORK as `${string}:${string}`,
    asset: "sat",
    amount,
    payTo: "https://mint.example.com",
    maxTimeoutSeconds: 30,
    extra: { mints: ["https://mint.example.com"], unit: "sat" },
  };
}

describe("ExactCashuFacilitator", () => {
  let facilitator: ExactCashuFacilitator;

  beforeEach(() => {
    vi.clearAllMocks();
    facilitator = new ExactCashuFacilitator({
      mints: ["https://mint.example.com"],
      unit: "sat",
    });
  });

  it("has correct scheme and caipFamily", () => {
    expect(facilitator.scheme).toBe("exact");
    expect(facilitator.caipFamily).toBe("cashu");
  });

  it("returns empty signers array", () => {
    expect(facilitator.getSigners("cashu:mainnet")).toEqual([]);
  });

  it("returns extra with mints and unit", () => {
    const extra = facilitator.getExtra("cashu:mainnet" as `${string}:${string}`);
    expect(extra?.mints).toEqual(["https://mint.example.com"]);
    expect(extra?.unit).toBe("sat");
  });

  it("does not include pubkey in extra when not configured", () => {
    const extra = facilitator.getExtra("cashu:mainnet" as `${string}:${string}`);
    expect(extra).not.toHaveProperty("pubkey");
  });

  it("includes pubkey in extra when configured", () => {
    const f = new ExactCashuFacilitator({
      mints: ["https://mint.example.com"],
      unit: "sat",
      pubkey: "02abcdef",
    });
    expect(f.getExtra("cashu:mainnet" as `${string}:${string}`)?.pubkey).toBe("02abcdef");
  });

  it("throws on empty mints", () => {
    expect(
      () => new ExactCashuFacilitator({ mints: [], unit: "sat" }),
    ).toThrow("At least one mint");
  });

  it("throws on HTTP mint URL", () => {
    expect(
      () =>
        new ExactCashuFacilitator({ mints: ["http://insecure.com"], unit: "sat" }),
    ).toThrow("HTTPS");
  });

  describe("verify", () => {
    it("returns valid for a correct payment", async () => {
      mockCheckProofsStates.mockResolvedValue([{ state: "UNSPENT" }]);

      const result = await facilitator.verify(
        makePayload("valid-token"),
        makeRequirements("100"),
      );
      expect(result.isValid).toBe(true);
    });

    it("returns invalid for an unparseable token", async () => {
      const result = await facilitator.verify(
        makePayload("bad-token"),
        makeRequirements("100"),
      );
      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe(CashuErrorCode.INVALID_TOKEN);
    });

    it("returns invalid when token mint is not in accepted list", async () => {
      const facilitatorOtherMint = new ExactCashuFacilitator({
        mints: ["https://other.mint.com"],
        unit: "sat",
      });

      const result = await facilitatorOtherMint.verify(
        makePayload("valid-token"),
        makeRequirements("100"),
      );
      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe(CashuErrorCode.UNTRUSTED_MINT);
    });

    it("returns invalid for insufficient amount", async () => {
      mockCheckProofsStates.mockResolvedValue([{ state: "UNSPENT" }]);

      const result = await facilitator.verify(
        makePayload("valid-token"),
        makeRequirements("200"),
      );
      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe(CashuErrorCode.INSUFFICIENT_AMOUNT);
    });

    it("returns invalid for spent proofs", async () => {
      mockCheckProofsStates.mockResolvedValue([{ state: "SPENT" }]);

      const result = await facilitator.verify(
        makePayload("valid-token"),
        makeRequirements("100"),
      );
      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe(CashuErrorCode.PROOFS_SPENT);
    });

    it("returns invalid when mint is unreachable", async () => {
      mockCheckProofsStates.mockRejectedValue(new Error("ECONNREFUSED"));

      const result = await facilitator.verify(
        makePayload("valid-token"),
        makeRequirements("100"),
      );
      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe(CashuErrorCode.MINT_UNREACHABLE);
    });

    it("does not call loadMint twice for the same mint (wallet cache)", async () => {
      mockCheckProofsStates.mockResolvedValue([{ state: "UNSPENT" }]);

      await facilitator.verify(makePayload("valid-token"), makeRequirements("100"));
      await facilitator.verify(makePayload("valid-token"), makeRequirements("100"));

      expect(mockLoadMint).toHaveBeenCalledTimes(1);
    });
  });

  describe("settle", () => {
    it("returns success after swap", async () => {
      const freshProofs = [
        { id: "k1", amount: 100, secret: "f1", C: "Cf1" },
      ] as Proof[];
      mockReceive.mockResolvedValue(freshProofs);

      const result = await facilitator.settle(
        makePayload("valid-token"),
        makeRequirements("100"),
      );
      expect(result.success).toBe(true);
      expect(result.network).toBe(CASHU_NETWORK);
      expect(typeof result.transaction).toBe("string");
      expect(result.transaction.length).toBeGreaterThan(0);
    });

    it("returns failure when swap throws", async () => {
      mockReceive.mockRejectedValue(new Error("token already spent"));

      const result = await facilitator.settle(
        makePayload("valid-token"),
        makeRequirements("100"),
      );
      expect(result.success).toBe(false);
      expect(result.errorReason).toBe(CashuErrorCode.SWAP_FAILED);
      expect(result.network).toBe(CASHU_NETWORK);
      expect(result.transaction).toBe("");
    });
  });
});
