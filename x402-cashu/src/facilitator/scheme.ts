import { Wallet } from "@cashu/cashu-ts";
import type { Token } from "@cashu/cashu-ts";
import {
  type CashuConfig,
  CashuErrorCode,
  CashuPaymentError,
  CASHU_CAIP_FAMILY,
  CASHU_NETWORK,
  noopProofStore,
  validateConfig,
} from "../shared/types.js";
import { parseToken, normalizeMintUrl } from "../shared/token.js";
import { isMintTrusted, validateProofState } from "../shared/verify.js";
import { verifyPayment, type VerifyContext } from "../shared/verify.js";
import { settlePayment, type SettleContext } from "../shared/settle.js";
import type {
  PaymentPayload,
  PaymentRequirements,
  SchemeNetworkFacilitator,
  FacilitatorContext,
  VerifyResponse,
  SettleResponse,
  Network,
} from "@x402/core/types";

/** Maximum number of cached wallet instances (LRU eviction by insertion order). */
const MAX_WALLET_CACHE_SIZE = 100;

/** Default timeout in milliseconds for outbound mint HTTP calls. */
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Cashu exact scheme facilitator.
 * Handles verification and settlement of Cashu ecash payments.
 */
export class ExactCashuFacilitator implements SchemeNetworkFacilitator {
  readonly scheme = "exact";
  readonly caipFamily = CASHU_CAIP_FAMILY;
  private readonly config: CashuConfig;
  private readonly timeoutMs: number;
  private walletCache = new Map<string, Wallet>();
  /** Cached keyset IDs from all trusted mints, for V4 token decoding. */
  private knownKeysetIds: string[] = [];

  constructor(config: CashuConfig) {
    validateConfig(config);
    this.config = {
      ...config,
      proofStore: config.proofStore ?? noopProofStore,
    };
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  getSigners(_network: string): string[] {
    return [];
  }

  getExtra(_network: Network): Record<string, unknown> | undefined {
    const extra: Record<string, unknown> = {
      mints: this.config.mints,
      unit: this.config.unit,
    };
    if (this.config.pubkey) {
      extra.pubkey = this.config.pubkey;
    }
    return extra;
  }

  /**
   * Verify a Cashu payment token against the given requirements.
   *
   * Validates the token string, checks the mint against the trust list (SSRF
   * prevention), then delegates to the shared `verifyPayment()` for the full
   * 6-step verification defined in the spec.
   */
  async verify(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
    _context?: FacilitatorContext,
  ): Promise<VerifyResponse> {
    // C2: Runtime type guard on token payload
    if (typeof payload.payload.token !== "string") {
      return {
        isValid: false,
        invalidReason: CashuErrorCode.INVALID_TOKEN,
        invalidMessage: "Payment payload 'token' field must be a string",
      };
    }
    const tokenStr = payload.payload.token;

    // Ensure trusted mint wallets are loaded so we have keyset IDs for V4 decoding.
    await this.ensureMintsLoaded();

    let token: Token;
    try {
      token = parseToken(tokenStr, this.knownKeysetIds);
    } catch (error) {
      return {
        isValid: false,
        invalidReason: CashuErrorCode.INVALID_TOKEN,
        invalidMessage:
          error instanceof CashuPaymentError ? error.message : "Invalid token",
      };
    }

    // SSRF prevention: check mint trust BEFORE making any network calls.
    if (!isMintTrusted(token.mint, this.config.mints)) {
      return {
        isValid: false,
        invalidReason: CashuErrorCode.UNTRUSTED_MINT,
        invalidMessage: `Token mint ${token.mint} is not in accepted mints list`,
      };
    }

    const wallet = await this.getWallet(token.mint);
    const requiredAmount = Number(requirements.amount);

    const verifyCtx: VerifyContext = {
      mints: this.config.mints,
      unit: this.config.unit,
      requiredAmount,
      pubkey: this.config.pubkey,
      checkProofStates: async (proofs) => {
        const states = await this.withTimeout(
          wallet.checkProofsStates(proofs),
          "checkProofsStates",
        );
        return states.map((s) => ({
          state: validateProofState(s.state),
        }));
      },
    };

    const result = await verifyPayment(token, verifyCtx);

    if (!result.isValid) {
      return {
        isValid: false,
        invalidReason: result.errorCode,
        invalidMessage: result.errorMessage,
      };
    }

    return { isValid: true };
  }

  /**
   * Settle a verified Cashu payment by swapping the token's proofs at the mint.
   *
   * Re-validates the mint URL against the trust list before making any outbound
   * calls (C1: SSRF prevention). Returns fresh proofs via the configured ProofStore.
   */
  async settle(
    payload: PaymentPayload,
    _requirements: PaymentRequirements,
    _context?: FacilitatorContext,
  ): Promise<SettleResponse> {
    // C2: Runtime type guard on token payload
    if (typeof payload.payload.token !== "string") {
      return {
        success: false,
        errorReason: CashuErrorCode.INVALID_TOKEN,
        errorMessage: "Payment payload 'token' field must be a string",
        transaction: "",
        network: CASHU_NETWORK as Network,
      };
    }
    const tokenStr = payload.payload.token;

    await this.ensureMintsLoaded();

    let token: Token;
    try {
      token = parseToken(tokenStr, this.knownKeysetIds);
    } catch (error) {
      return {
        success: false,
        errorReason: CashuErrorCode.INVALID_TOKEN,
        errorMessage:
          error instanceof CashuPaymentError ? error.message : "Invalid token",
        transaction: "",
        network: CASHU_NETWORK as Network,
      };
    }

    // C1: SSRF prevention — re-check mint trust before making outbound calls.
    if (!isMintTrusted(token.mint, this.config.mints)) {
      return {
        success: false,
        errorReason: CashuErrorCode.UNTRUSTED_MINT,
        errorMessage: `Token mint ${token.mint} is not in accepted mints list`,
        transaction: "",
        network: CASHU_NETWORK as Network,
      };
    }

    const wallet = await this.getWallet(token.mint);

    const settleCtx: SettleContext = {
      receiveToken: async (t) =>
        this.withTimeout(wallet.receive(t), "receive"),
      proofStore: this.config.proofStore!,
    };

    const result = await settlePayment(token, settleCtx, tokenStr);

    if (!result.success) {
      return {
        success: false,
        errorReason: result.errorCode,
        errorMessage: result.errorMessage,
        transaction: "",
        network: CASHU_NETWORK as Network,
      };
    }

    return {
      success: true,
      transaction: result.transaction!,
      network: CASHU_NETWORK as Network,
    };
  }

  /**
   * Ensure all trusted mints have loaded wallets and keyset IDs are cached.
   * Called before token parsing so V4 short keyset IDs can be resolved.
   */
  private async ensureMintsLoaded(): Promise<void> {
    for (const mintUrl of this.config.mints) {
      await this.getWallet(mintUrl);
    }
  }

  /**
   * Get or create a cached Wallet instance for the given mint URL.
   * Uses normalized URLs as cache keys and enforces a max cache size.
   * Also collects keyset IDs for V4 token decoding.
   */
  private async getWallet(mintUrl: string): Promise<Wallet> {
    const key = normalizeMintUrl(mintUrl);
    if (!this.walletCache.has(key)) {
      // Evict oldest entry if cache is full
      if (this.walletCache.size >= MAX_WALLET_CACHE_SIZE) {
        const oldest = this.walletCache.keys().next().value;
        if (oldest !== undefined) {
          this.walletCache.delete(oldest);
        }
      }
      const wallet = new Wallet(mintUrl, { unit: this.config.unit });
      await this.withTimeout(wallet.loadMint(), "loadMint");
      this.walletCache.set(key, wallet);

      // Collect keyset IDs for V4 token short-ID resolution
      const ids = wallet.keyChain.getAllKeysetIds();
      for (const id of ids) {
        if (!this.knownKeysetIds.includes(id)) {
          this.knownKeysetIds.push(id);
        }
      }
    }
    return this.walletCache.get(key)!;
  }

  /** Wrap a promise with an AbortController-style timeout. */
  private withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Mint operation '${label}' timed out after ${this.timeoutMs}ms`)),
        this.timeoutMs,
      );
      promise.then(
        (v) => { clearTimeout(timer); resolve(v); },
        (e) => { clearTimeout(timer); reject(e); },
      );
    });
  }
}
