# x402 Cashu Scheme Implementation

## Goal

Implement a Cashu payment scheme for the x402 protocol, enabling ecash-based micropayments over HTTP 402.

## Background

x402 is an open payment standard (Apache-2.0, github.com/coinbase/x402) that uses HTTP 402 responses to enable programmatic payments. The protocol has a pluggable scheme system — currently `exact` (EVM, Solana, Algorand, Stellar, Sui, Aptos) and `upto` (EVM only). New schemes are added via spec documents and per-network implementation packages.

The existing ecosystem (28+ facilitators) is almost entirely EVM/Solana stablecoin settlement. Lightning support is nascent (Alby Labs facilitator, PR pending). No Cashu support exists anywhere.

## Why Cashu

Cashu ecash tokens are a natural fit for x402 micropayments:

- **No facilitator required** — the server can verify and redeem tokens directly against the mint (HTTP calls, no chain infrastructure)
- **No gas costs** — mint operations are free
- **Instant** — no block confirmations
- **Privacy** — blind-signed tokens, mint can't link payer to payee
- **Micropayment-native** — no minimum transaction size
- **Multi-asset** — Cashu mints can issue tokens denominated in sat, usd, eur, etc.

The trust model shifts from blockchain consensus to mint trust, which is an explicit, known tradeoff the server opts into by listing accepted mints.

## Two Operating Modes

### Direct (no facilitator)

1. Client requests resource
2. Server returns 402 with accepted mints and amount
3. Client attaches Cashu proofs in `PAYMENT-SIGNATURE` header
4. Server swaps/melts tokens at the mint and serves the resource

Server handles Cashu directly. Simpler, more private, no intermediary.

### Facilitated

1. Client sends Cashu proofs in `PAYMENT-SIGNATURE` header
2. Server forwards proofs to facilitator `/settle` endpoint
3. Facilitator melts tokens at the mint, routes value to server (Lightning, on-chain, etc.)
4. Server receives confirmation and serves the resource

Server doesn't need to know about Cashu at all. Facilitator acts as a Cashu-to-Lightning (or Cashu-to-anything) bridge.

## Protocol Mapping

### PaymentRequired (server → client)

```json
{
  "x402Version": 2,
  "accepts": [
    {
      "scheme": "exact",
      "network": "cashu:mainnet",
      "amount": "100",
      "asset": "sat",
      "payTo": "https://mint.example.com",
      "maxTimeoutSeconds": 30,
      "extra": {
        "mints": ["https://mint.example.com", "https://mint2.example.com"],
        "unit": "sat"
      }
    }
  ]
}
```

- `network`: `cashu:mainnet` (CAIP-2 style identifier)
- `asset`: `sat`, `usd`, `eur` — the mint's unit
- `payTo`: primary mint URL
- `extra.mints`: array of accepted mints (server may trust multiple)
- `extra.unit`: Cashu unit denomination

### PaymentPayload (client → server)

```json
{
  "x402Version": 2,
  "payload": {
    "token": "cashuBpGhh..."
  }
}
```

- `payload.token`: serialized Cashu `TokenV4`

### Verification

- Check proofs are valid at the mint (`POST /v1/checkstate`)
- Verify total amount meets requirement
- Verify token unit matches requested asset
- Verify token mint is in the accepted mints list

### Settlement

- Swap proofs for fresh ones at the mint (`POST /v1/swap`) — claims tokens to server's keyset
- Or melt proofs (`POST /v1/melt`) — converts to Lightning payment to server's invoice
- Cashu tokens are inherently single-use — the mint handles double-spend protection

## What Needs to Be Built

1. **Spec document**: `specs/schemes/exact/scheme_exact_cashu.md` — following the repo's `scheme_impl_template.md`
2. **TypeScript package**: `@x402/cashu` — verify/settle implementation using `@cashu/cashu-ts`
3. **Middleware integration**: register cashu scheme handler alongside evm/svm in Express/Hono/Next adapters
4. **Optional: facilitator support** — a Cashu facilitator that melts tokens and pays out via Lightning

## References

- x402 spec: `github.com/coinbase/x402/specs/x402-specification-v2.md`
- Scheme template: `github.com/coinbase/x402/specs/scheme_impl_template.md`
- Existing scheme examples: `specs/schemes/exact/scheme_exact_evm.md`, `scheme_exact_svm.md`
- Cashu protocol: `github.com/cashubtc/nuts` (Notation, Usage, and Terminology Specifications)
- Cashu TS library: `github.com/cashubtc/cashu-ts`
- x402 facilitator interface: v2 spec section 7 (`POST /verify`, `POST /settle`, `GET /supported`)
- Alby Lightning facilitator (precedent for non-smart-contract scheme): `x402.albylabs.com`
