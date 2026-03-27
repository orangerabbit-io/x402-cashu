import { ExactCashuFacilitator } from "./scheme.js";
import type { CashuConfig } from "../shared/types.js";
import { CASHU_NETWORK } from "../shared/types.js";
import type { Network } from "@x402/core/types";

/**
 * Register the Cashu exact scheme with an x402 facilitator.
 *
 * @param facilitator - An x402Facilitator instance with a register() method
 * @param config - CashuConfig specifying accepted mints, unit, and optional settings
 */
export function registerExactCashuFacilitator(
  facilitator: {
    register(
      networks: Network | Network[],
      handler: unknown,
    ): unknown;
  },
  config: CashuConfig,
): void {
  const cashuFacilitator = new ExactCashuFacilitator(config);
  facilitator.register(CASHU_NETWORK as Network, cashuFacilitator);
}
