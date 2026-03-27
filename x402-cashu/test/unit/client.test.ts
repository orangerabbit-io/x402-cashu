import { describe, it, expect, vi } from "vitest";
import { ExactCashuClient } from "../../src/client/scheme.js";
import type { Wallet, Proof } from "@cashu/cashu-ts";

// Mock getEncodedTokenV4
vi.mock("@cashu/cashu-ts", async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    getEncodedTokenV4: vi.fn().mockReturnValue("cashuBencoded-token-string"),
  };
});

describe("ExactCashuClient", () => {
  const mockProofs: Proof[] = [
    { id: "k1", amount: 64, secret: "s1", C: "C1" },
    { id: "k1", amount: 32, secret: "s2", C: "C2" },
    { id: "k1", amount: 4, secret: "s3", C: "C3" },
  ] as Proof[];

  function makeMockWallet(overrides?: Record<string, unknown>): Wallet {
    return {
      send: vi.fn().mockResolvedValue({
        send: [
          { id: "k1", amount: 64, secret: "s1", C: "C1" },
          { id: "k1", amount: 32, secret: "s2", C: "C2" },
          { id: "k1", amount: 4, secret: "s3", C: "C3" },
        ] as Proof[],
        keep: [] as Proof[],
      }),
      ...overrides,
    } as unknown as Wallet;
  }

  it("creates a payment payload with serialized token", async () => {
    const wallet = makeMockWallet();
    const client = new ExactCashuClient(wallet, "https://mint.example.com", mockProofs);

    const result = await client.createPaymentPayload(2, {
      scheme: "exact",
      network: "cashu:mainnet" as `${string}:${string}`,
      asset: "sat",
      amount: "100",
      payTo: "https://mint.example.com",
      maxTimeoutSeconds: 30,
      extra: {
        mints: ["https://mint.example.com"],
        unit: "sat",
      },
    });

    expect(result.x402Version).toBe(2);
    expect(result.payload.token).toBeDefined();
    expect(typeof result.payload.token).toBe("string");
    expect(wallet.send).toHaveBeenCalledWith(100, mockProofs);
  });

  it("applies P2PK locking when pubkey present", async () => {
    const wallet = makeMockWallet();
    const client = new ExactCashuClient(wallet, "https://mint.example.com", mockProofs);

    await client.createPaymentPayload(2, {
      scheme: "exact",
      network: "cashu:mainnet" as `${string}:${string}`,
      asset: "sat",
      amount: "100",
      payTo: "https://mint.example.com",
      maxTimeoutSeconds: 30,
      extra: {
        mints: ["https://mint.example.com"],
        unit: "sat",
        pubkey: "02abcdef1234567890",
      },
    });

    expect(wallet.send).toHaveBeenCalledWith(
      100,
      mockProofs,
      {},
      expect.objectContaining({
        send: expect.objectContaining({
          type: "p2pk",
          options: expect.objectContaining({ pubkey: "02abcdef1234567890" }),
        }),
      }),
    );
  });

  it("has correct scheme property", () => {
    const wallet = makeMockWallet();
    const client = new ExactCashuClient(wallet, "https://mint.example.com", mockProofs);
    expect(client.scheme).toBe("exact");
  });
});
