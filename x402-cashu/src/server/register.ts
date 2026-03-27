import { ExactCashuServer } from "./scheme.js";
import type { CashuConfig } from "../shared/types.js";
import { CASHU_NETWORK } from "../shared/types.js";
import type { Network } from "@x402/core/types";

/**
 * Register the Cashu exact scheme with an x402 resource server.
 */
export function registerExactCashuServer(
  server: { register(network: Network, handler: unknown): unknown },
  config: CashuConfig,
): void {
  const scheme = new ExactCashuServer(config);
  server.register(CASHU_NETWORK as Network, scheme);
}
