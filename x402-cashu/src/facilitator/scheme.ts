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

/**
 * Cashu exact scheme facilitator.
 * Handles verification and settlement of Cashu ecash payments.
 */
export class ExactCashuFacilitator implements SchemeNetworkFacilitator {
  readonly scheme = "exact";
  readonly caipFamily = CASHU_CAIP_FAMILY;
  private readonly config: CashuConfig;
  private walletCache = new Map<string, Wallet>();

  constructor(config: CashuConfig) {
    validateConfig(config);
    this.config = {
      ...config,
      proofStore: config.proofStore ?? noopProofStore,
    };
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

  async verify(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
    _context?: FacilitatorContext,
  ): Promise<VerifyResponse> {
    const tokenStr = payload.payload.token as string;

    let token: Token;
    try {
      token = parseToken(tokenStr);
    } catch (error) {
      return {
        isValid: false,
        invalidReason: CashuErrorCode.INVALID_TOKEN,
        invalidMessage:
          error instanceof CashuPaymentError ? error.message : "Invalid token",
      };
    }

    // Check mint trust BEFORE making any network calls to the mint (SSRF prevention).
    const tokenMint = normalizeMintUrl(token.mint);
    const acceptedMints = this.config.mints.map(normalizeMintUrl);
    if (!acceptedMints.includes(tokenMint)) {
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
        const states = await wallet.checkProofsStates(proofs);
        return states.map((s) => ({
          state: s.state as "UNSPENT" | "SPENT" | "PENDING",
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

  async settle(
    payload: PaymentPayload,
    _requirements: PaymentRequirements,
    _context?: FacilitatorContext,
  ): Promise<SettleResponse> {
    const tokenStr = payload.payload.token as string;
    const token = parseToken(tokenStr);
    const wallet = await this.getWallet(token.mint);

    const settleCtx: SettleContext = {
      receiveToken: async (t) => wallet.receive(t),
      proofStore: this.config.proofStore!,
    };

    const result = await settlePayment(token, settleCtx);

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

  private async getWallet(mintUrl: string): Promise<Wallet> {
    if (!this.walletCache.has(mintUrl)) {
      const wallet = new Wallet(mintUrl, { unit: this.config.unit });
      await wallet.loadMint();
      this.walletCache.set(mintUrl, wallet);
    }
    return this.walletCache.get(mintUrl)!;
  }
}
