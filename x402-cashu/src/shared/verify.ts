import type { Token, Proof } from "@cashu/cashu-ts";
import { CashuErrorCode } from "./types.js";
import { normalizeMintUrl, assertHttps, sumProofs } from "./token.js";

/** Result of payment verification */
export interface VerifyResult {
  isValid: boolean;
  errorCode?: CashuErrorCode;
  errorMessage?: string;
}

/** Proof state as returned by mint checkstate */
export interface ProofState {
  state: "UNSPENT" | "SPENT" | "PENDING";
}

/** Context needed for verification — abstracts mint communication */
export interface VerifyContext {
  /** Accepted mint URLs */
  mints: string[];
  /** Expected unit */
  unit: string;
  /** Required payment amount */
  requiredAmount: number;
  /** Server's P2PK public key (optional) */
  pubkey?: string;
  /** Allow HTTP mint URLs (for testing only) */
  allowInsecure?: boolean;
  /** Function to check proof states at the mint */
  checkProofStates: (proofs: Proof[], mintUrl: string) => Promise<ProofState[]>;
}

/**
 * Verify a Cashu payment token against requirements.
 * Performs the 6-step verification defined in the spec.
 */
export async function verifyPayment(
  token: Token,
  ctx: VerifyContext,
): Promise<VerifyResult> {
  // Step 2: HTTPS and mint check
  try {
    assertHttps(token.mint, ctx.allowInsecure);
  } catch {
    return {
      isValid: false,
      errorCode: CashuErrorCode.UNTRUSTED_MINT,
      errorMessage: `Token mint must use HTTPS: ${token.mint}`,
    };
  }

  const tokenMint = normalizeMintUrl(token.mint);
  const acceptedMints = ctx.mints.map(normalizeMintUrl);
  if (!acceptedMints.includes(tokenMint)) {
    return {
      isValid: false,
      errorCode: CashuErrorCode.UNTRUSTED_MINT,
      errorMessage: `Token mint ${token.mint} is not in accepted mints list`,
    };
  }

  // Step 3: Unit check
  if (!token.unit || token.unit !== ctx.unit) {
    return {
      isValid: false,
      errorCode: CashuErrorCode.UNIT_MISMATCH,
      errorMessage: `Token unit "${token.unit ?? "(none)"}" does not match required "${ctx.unit}"`,
    };
  }

  // Step 4: Amount check
  const totalAmount = sumProofs(token);
  if (totalAmount < ctx.requiredAmount) {
    return {
      isValid: false,
      errorCode: CashuErrorCode.INSUFFICIENT_AMOUNT,
      errorMessage: `Token amount ${totalAmount} is less than required ${ctx.requiredAmount}`,
    };
  }

  // Step 5: Proof state check
  let states: ProofState[];
  try {
    states = await ctx.checkProofStates(token.proofs, tokenMint);
  } catch {
    return {
      isValid: false,
      errorCode: CashuErrorCode.MINT_UNREACHABLE,
      errorMessage: "Failed to check proof states at the mint",
    };
  }

  const allUnspent = states.every((s) => s.state === "UNSPENT");
  if (!allUnspent) {
    return {
      isValid: false,
      errorCode: CashuErrorCode.PROOFS_SPENT,
      errorMessage: "One or more proofs are not in UNSPENT state",
    };
  }

  // Step 6: P2PK check
  if (ctx.pubkey) {
    const hasP2PK = token.proofs.every((proof) => {
      try {
        const secret =
          typeof proof.secret === "string"
            ? JSON.parse(proof.secret)
            : proof.secret;
        return (
          Array.isArray(secret) &&
          secret[0] === "P2PK" &&
          typeof secret[1] === "object" &&
          secret[1].data === ctx.pubkey
        );
      } catch {
        return false;
      }
    });

    if (!hasP2PK) {
      return {
        isValid: false,
        errorCode: CashuErrorCode.P2PK_MISMATCH,
        errorMessage: "Token spending conditions do not match server pubkey",
      };
    }
  }

  return { isValid: true };
}
