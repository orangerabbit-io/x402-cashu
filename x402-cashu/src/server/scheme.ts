import type { CashuConfig } from "../shared/types.js";
import { validateConfig } from "../shared/types.js";
import type {
  SchemeNetworkServer,
  PaymentRequirements,
  Network,
  Price,
  AssetAmount,
} from "@x402/core/types";

/**
 * Cashu exact scheme server.
 * Handles price parsing and payment requirements enhancement.
 */
export class ExactCashuServer implements SchemeNetworkServer {
  readonly scheme = "exact";
  private readonly config: CashuConfig;

  constructor(config: CashuConfig) {
    validateConfig(config);
    this.config = config;
  }

  /**
   * Parse a price into an `AssetAmount`. Accepts either a numeric value
   * (interpreted as the configured unit) or an `{ amount, asset }` object.
   */
  async parsePrice(price: Price, _network: Network): Promise<AssetAmount> {
    if (typeof price === "object" && "amount" in price && "asset" in price) {
      return { amount: String(price.amount), asset: price.asset };
    }
    return { amount: String(price), asset: this.config.unit };
  }

  /**
   * Enhance payment requirements with Cashu-specific fields: accepted mints,
   * unit, and optionally a P2PK pubkey for token locking.
   */
  async enhancePaymentRequirements(
    paymentRequirements: PaymentRequirements,
    _supportedKind: { x402Version: number; scheme: string; network: Network; extra?: Record<string, unknown> },
    _facilitatorExtensions: string[],
  ): Promise<PaymentRequirements> {
    if (paymentRequirements.asset !== this.config.unit) {
      throw new Error(
        `asset/unit mismatch: base asset "${paymentRequirements.asset}" does not match configured unit "${this.config.unit}"`,
      );
    }

    const extra: Record<string, unknown> = {
      ...paymentRequirements.extra,
      mints: this.config.mints,
      unit: this.config.unit,
    };
    if (this.config.pubkey) {
      extra.pubkey = this.config.pubkey;
    }
    return {
      ...paymentRequirements,
      extra,
    };
  }
}
