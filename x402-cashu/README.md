# x402-cashu

Cashu ecash payment scheme for the [x402 protocol](https://github.com/coinbase/x402). Enables micropayments over HTTP 402 using blind-signed ecash tokens.

## Features

- **Direct mode** -- server verifies and claims Cashu tokens directly against the mint
- **No facilitator required** -- no chain infrastructure, no gas costs
- **Instant settlement** -- swap at the mint, no block confirmations
- **P2PK support** -- optional NUT-10/11 token locking for in-transit security
- **Multi-mint** -- accept tokens from multiple trusted mints
- **Pluggable storage** -- bring your own proof storage backend

## Install

```bash
npm install x402-cashu
```

## Quick Start

### Server (Facilitator)

```typescript
import { ExactCashuFacilitator } from "x402-cashu/facilitator";

const facilitator = new ExactCashuFacilitator({
  mints: ["https://your-trusted-mint.com"],
  unit: "sat",
  // pubkey: "02...",   // optional: require P2PK-locked tokens
  // proofStore: myDB,  // optional: persist claimed proofs
});

// Register with x402 server
server.register("cashu:mainnet", facilitator);
```

### Client

```typescript
import { ExactCashuClient } from "x402-cashu/client";
import { Wallet } from "@cashu/cashu-ts";

const mintUrl = "https://your-mint.com";
const wallet = new Wallet(mintUrl, { unit: "sat" });
await wallet.loadMint();

const client = new ExactCashuClient(wallet, mintUrl, proofs);
const { payload } = await client.createPaymentPayload(2, paymentRequirements);
// Attach payload.token to X-Payment header
```

## Supported NUTs

| NUT | Name | Status |
|-----|------|--------|
| 00 | Token format (TokenV4) | Implemented |
| 03 | Swap | Implemented |
| 07 | Check state | Implemented |
| 10 | Spending conditions (P2PK) | Implemented (optional) |
| 11 | P2PK signatures | Implemented (optional) |
| 05 | Melt | Documented, not yet implemented |

## License

Apache-2.0
