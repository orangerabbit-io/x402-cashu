import type { Token, Proof } from "@cashu/cashu-ts";
import type { ProofStore } from "./types.js";
import { CashuErrorCode } from "./types.js";
import { createHash } from "node:crypto";

/** Result of payment settlement */
export interface SettleResult {
  success: boolean;
  errorCode?: CashuErrorCode;
  errorMessage?: string;
  /** Unique transaction identifier (SHA-256 hash of original proof secrets) */
  transaction?: string;
  /** Total amount of fresh proofs received */
  amount?: number;
}

/** Context needed for settlement — abstracts mint communication */
export interface SettleContext {
  /** Function to receive (swap) a token for fresh proofs */
  receiveToken: (token: Token) => Promise<Proof[]>;
  /** Storage backend for claimed proofs */
  proofStore: ProofStore;
}

/**
 * Settle a Cashu payment by swapping proofs at the mint.
 * Returns fresh proofs and stores them via the ProofStore.
 */
export async function settlePayment(
  token: Token,
  ctx: SettleContext,
): Promise<SettleResult> {
  let freshProofs: Proof[];

  try {
    freshProofs = await ctx.receiveToken(token);
  } catch (error) {
    return {
      success: false,
      errorCode: CashuErrorCode.SWAP_FAILED,
      errorMessage: `Swap failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  // Generate a transaction ID from original proof secrets
  const txData = token.proofs
    .map((p) => (typeof p.secret === "string" ? p.secret : JSON.stringify(p.secret)))
    .join(":");
  const transaction = createHash("sha256").update(txData).digest("hex");

  const totalAmount = freshProofs.reduce((sum, p) => sum + p.amount, 0);

  // Store fresh proofs
  await ctx.proofStore.saveProofs(freshProofs, token.mint);

  return {
    success: true,
    transaction,
    amount: totalAmount,
  };
}
