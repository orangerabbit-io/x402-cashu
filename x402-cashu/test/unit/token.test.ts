import { describe, it, expect } from "vitest";
import { normalizeMintUrl, parseToken, assertHttps } from "../../src/shared/token.js";

describe("normalizeMintUrl", () => {
  it("lowercases hostname", () => {
    expect(normalizeMintUrl("https://Mint.Example.COM")).toBe(
      "https://mint.example.com",
    );
  });

  it("strips trailing slash", () => {
    expect(normalizeMintUrl("https://mint.example.com/")).toBe(
      "https://mint.example.com",
    );
  });

  it("removes default port 443", () => {
    expect(normalizeMintUrl("https://mint.example.com:443")).toBe(
      "https://mint.example.com",
    );
  });

  it("removes default port 80 for HTTP", () => {
    expect(normalizeMintUrl("http://mint.example.com:80")).toBe(
      "http://mint.example.com",
    );
  });

  it("preserves non-default port", () => {
    expect(normalizeMintUrl("https://mint.example.com:3338")).toBe(
      "https://mint.example.com:3338",
    );
  });

  it("preserves path", () => {
    expect(normalizeMintUrl("https://mint.example.com/v1/mint")).toBe(
      "https://mint.example.com/v1/mint",
    );
  });
});

describe("assertHttps", () => {
  it("accepts HTTPS URLs", () => {
    expect(() => assertHttps("https://mint.example.com")).not.toThrow();
  });

  it("rejects HTTP URLs", () => {
    expect(() => assertHttps("http://mint.example.com")).toThrow("HTTPS");
  });

  it("allows HTTP in test mode", () => {
    expect(() => assertHttps("http://localhost:3338", true)).not.toThrow();
  });
});

describe("parseToken", () => {
  it("throws CashuPaymentError for malformed token", () => {
    expect(() => parseToken("not-a-token")).toThrow("INVALID_TOKEN");
  });

  it("throws CashuPaymentError for empty string", () => {
    expect(() => parseToken("")).toThrow("INVALID_TOKEN");
  });
});
