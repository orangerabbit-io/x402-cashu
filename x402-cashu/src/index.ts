// Shared types and constants
export {
  type CashuConfig,
  type CashuExtra,
  type ProofStore,
  CashuErrorCode,
  CashuPaymentError,
  CASHU_NETWORK,
  CASHU_CAIP_FAMILY,
  noopProofStore,
  validateConfig,
} from "./shared/types.js";

// Token utilities
export { parseToken, normalizeMintUrl, sumProofs, assertHttps } from "./shared/token.js";

// Verification
export {
  verifyPayment,
  isMintTrusted,
  type VerifyResult,
  type VerifyContext,
  type ProofState,
} from "./shared/verify.js";

// Settlement
export { settlePayment, type SettleResult, type SettleContext } from "./shared/settle.js";

// Facilitator
export { ExactCashuFacilitator } from "./facilitator/scheme.js";
export { registerExactCashuFacilitator } from "./facilitator/register.js";

// Server
export { ExactCashuServer } from "./server/scheme.js";
export { registerExactCashuServer } from "./server/register.js";

// Client
export { ExactCashuClient } from "./client/scheme.js";
