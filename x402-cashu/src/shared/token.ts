import { getDecodedToken, type Token } from "@cashu/cashu-ts";
import { CashuPaymentError, CashuErrorCode } from "./types.js";

/**
 * Normalize a mint URL for consistent comparison.
 * Lowercases hostname, removes default HTTPS port, strips trailing slash.
 *
 * Note: Path components are intentionally NOT lowercased. URL paths are
 * case-sensitive per RFC 3986 section 3.3, so `/Bitcoin` and `/bitcoin`
 * are distinct resources.
 */
export function normalizeMintUrl(url: string): string {
  const parsed = new URL(url);
  parsed.hostname = parsed.hostname.toLowerCase();
  if (parsed.port === "443" && parsed.protocol === "https:") {
    parsed.port = "";
  }
  if (parsed.port === "80" && parsed.protocol === "http:") {
    parsed.port = "";
  }
  let normalized = parsed.toString();
  if (normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

/**
 * Assert that a URL uses HTTPS.
 * @param allowInsecure - If true, allows HTTP (for testing with local mints)
 */
export function assertHttps(url: string, allowInsecure = false): void {
  if (allowInsecure) return;
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") {
    throw new CashuPaymentError(
      CashuErrorCode.UNTRUSTED_MINT,
      `Mint URL must use HTTPS: ${url}`,
    );
  }
}

/**
 * Parse and validate a serialized Cashu token string.
 * Returns the decoded token or throws CashuPaymentError.
 */
export function parseToken(tokenStr: string): Token {
  try {
    return getDecodedToken(tokenStr);
  } catch {
    throw new CashuPaymentError(
      CashuErrorCode.INVALID_TOKEN,
      `INVALID_TOKEN: Failed to deserialize Cashu token`,
    );
  }
}

/**
 * Sum the total amount across all proofs in a token.
 */
export function sumProofs(token: Token): number {
  return token.proofs.reduce((sum, proof) => sum + proof.amount, 0);
}
