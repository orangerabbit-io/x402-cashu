import type { Proof } from "@cashu/cashu-ts";

/** Cashu-specific fields in PaymentRequirements.extra */
export interface CashuExtra {
  /** Accepted mint URLs */
  mints: string[];
  /** Cashu unit denomination (must match PaymentRequirements.asset) */
  unit: string;
  /** Server's public key for NUT-10/11 P2PK locking. Omit for bearer tokens. */
  pubkey?: string;
}

/** Configuration for registering the Cashu scheme */
export interface CashuConfig {
  /** Accepted mint URLs (at least one required, all must be HTTPS) */
  mints: string[];
  /** Cashu unit denomination: "sat", "usd", "eur", etc. */
  unit: string;
  /** Server's public key for P2PK token locking (optional) */
  pubkey?: string;
  /** Storage backend for claimed proofs (optional, defaults to no-op) */
  proofStore?: ProofStore;
  /** Timeout in milliseconds for outbound mint HTTP calls (default: 10000) */
  timeoutMs?: number;
}

/** Interface for persisting claimed proofs after settlement */
export interface ProofStore {
  saveProofs(proofs: Proof[], mintUrl: string): Promise<void>;
}

/** No-op proof store — proofs are discarded after swap */
export const noopProofStore: ProofStore = {
  async saveProofs(): Promise<void> {},
};

/** Error codes for Cashu verification/settlement failures */
export const CashuErrorCode = {
  INVALID_TOKEN: "INVALID_TOKEN",
  UNTRUSTED_MINT: "UNTRUSTED_MINT",
  UNIT_MISMATCH: "UNIT_MISMATCH",
  INSUFFICIENT_AMOUNT: "INSUFFICIENT_AMOUNT",
  PROOFS_SPENT: "PROOFS_SPENT",
  P2PK_MISMATCH: "P2PK_MISMATCH",
  MINT_UNREACHABLE: "MINT_UNREACHABLE",
  SWAP_FAILED: "SWAP_FAILED",
} as const;

export type CashuErrorCode = (typeof CashuErrorCode)[keyof typeof CashuErrorCode];

/** Error thrown during Cashu verification or settlement */
export class CashuPaymentError extends Error {
  constructor(
    public readonly code: CashuErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CashuPaymentError";
  }
}

/** CAIP-2 style network identifier for Cashu */
export const CASHU_NETWORK = "cashu:mainnet";

/** CAIP family identifier */
export const CASHU_CAIP_FAMILY = "cashu";

/**
 * Validate a CashuConfig at construction time.
 * Throws if configuration is invalid.
 */
export function validateConfig(config: CashuConfig): void {
  if (config.mints.length === 0) {
    throw new Error("At least one mint URL is required");
  }
  for (const mint of config.mints) {
    const url = new URL(mint);
    if (url.protocol !== "https:") {
      throw new Error(
        `Mint URL must use HTTPS: ${mint}`,
      );
    }
  }
}
