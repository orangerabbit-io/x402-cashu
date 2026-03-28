import { getEncodedTokenV4 } from "@cashu/cashu-ts";
import type { Wallet, Proof } from "@cashu/cashu-ts";
import type {
  SchemeNetworkClient,
  PaymentRequirements,
  PaymentPayloadResult,
  PaymentPayloadContext,
} from "@x402/core/types";

/**
 * Cashu exact scheme client.
 * Creates payment payloads by selecting proofs from the provided proof array
 * and encoding them as a Cashu TokenV4.
 *
 * The caller is responsible for wallet funding (minting tokens) and providing
 * the funded proofs. P2PK locking is applied when the server advertises a
 * pubkey in extra.
 */
export class ExactCashuClient implements SchemeNetworkClient {
  readonly scheme = "exact";

  constructor(
    private readonly wallet: Wallet,
    private readonly mintUrl: string,
    private readonly proofs: Proof[],
  ) {}

  /**
   * Create a payment payload by selecting proofs for the required amount and
   * encoding them as a Cashu TokenV4. If the server advertises a pubkey in
   * `requirements.extra`, proofs are P2PK-locked to that key.
   */
  async createPaymentPayload(
    x402Version: number,
    requirements: PaymentRequirements,
    _context?: PaymentPayloadContext,
  ): Promise<PaymentPayloadResult> {
    const extra = requirements.extra;
    const pubkey = extra?.pubkey as string | undefined;
    const amount = Number(requirements.amount);
    const unit = (extra?.unit as string | undefined) ?? requirements.asset;

    // Build outputConfig for P2PK locking when the server provides a pubkey
    const { send: sendProofs } = pubkey
      ? await this.wallet.send(amount, this.proofs, {}, {
          send: { type: "p2pk" as const, options: { pubkey } },
        })
      : await this.wallet.send(amount, this.proofs);

    const token = getEncodedTokenV4({
      mint: this.mintUrl,
      proofs: sendProofs,
      unit,
    });

    return {
      x402Version,
      payload: { token },
    };
  }
}
