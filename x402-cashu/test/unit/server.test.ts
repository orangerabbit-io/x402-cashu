import { describe, it, expect } from "vitest";
import { ExactCashuServer } from "../../src/server/scheme.js";

describe("ExactCashuServer", () => {
  const server = new ExactCashuServer({
    mints: ["https://mint.example.com"],
    unit: "sat",
  });

  describe("parsePrice", () => {
    it("parses string amount", async () => {
      const result = await server.parsePrice("100", "cashu:mainnet" as `${string}:${string}`);
      expect(result.amount).toBe("100");
      expect(result.asset).toBe("sat");
    });

    it("parses number amount", async () => {
      const result = await server.parsePrice(100, "cashu:mainnet" as `${string}:${string}`);
      expect(result.amount).toBe("100");
      expect(result.asset).toBe("sat");
    });

    it("parses AssetAmount", async () => {
      const result = await server.parsePrice(
        { amount: "100", asset: "sat" },
        "cashu:mainnet" as `${string}:${string}`,
      );
      expect(result.amount).toBe("100");
      expect(result.asset).toBe("sat");
    });
  });

  describe("enhancePaymentRequirements", () => {
    const supportedKind = {
      x402Version: 2,
      scheme: "exact",
      network: "cashu:mainnet" as `${string}:${string}`,
    };

    it("adds extra fields to base requirements", async () => {
      const base = {
        scheme: "exact",
        network: "cashu:mainnet" as `${string}:${string}`,
        asset: "sat",
        amount: "100",
        payTo: "https://mint.example.com",
        maxTimeoutSeconds: 30,
        extra: {},
      };
      const result = await server.enhancePaymentRequirements(base, supportedKind, []);
      expect(result.extra?.mints).toEqual(["https://mint.example.com"]);
      expect(result.extra?.unit).toBe("sat");
    });

    it("includes pubkey when configured", async () => {
      const s = new ExactCashuServer({
        mints: ["https://mint.example.com"],
        unit: "sat",
        pubkey: "02abcdef",
      });
      const base = {
        scheme: "exact",
        network: "cashu:mainnet" as `${string}:${string}`,
        asset: "sat",
        amount: "100",
        payTo: "https://mint.example.com",
        maxTimeoutSeconds: 30,
        extra: {},
      };
      const result = await s.enhancePaymentRequirements(base, supportedKind, []);
      expect(result.extra?.pubkey).toBe("02abcdef");
    });

    it("validates asset matches configured unit", async () => {
      const base = {
        scheme: "exact",
        network: "cashu:mainnet" as `${string}:${string}`,
        asset: "usd",
        amount: "100",
        payTo: "https://mint.example.com",
        maxTimeoutSeconds: 30,
        extra: {},
      };
      await expect(
        server.enhancePaymentRequirements(base, supportedKind, []),
      ).rejects.toThrow("asset/unit mismatch");
    });
  });

  it("throws on HTTP mints", () => {
    expect(
      () => new ExactCashuServer({ mints: ["http://bad.com"], unit: "sat" }),
    ).toThrow("HTTPS");
  });
});
