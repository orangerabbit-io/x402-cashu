# x402 Cashu Scheme Design

## Overview

A Cashu ecash payment scheme for the x402 protocol, enabling micropayments over HTTP 402 using blind-signed ecash tokens. Implemented as a standalone TypeScript package (`x402-cashu`) that registers into any x402 server via the plugin pattern.

### Why Cashu for x402

- **No facilitator required** — the server verifies and claims tokens directly against the mint via HTTP
- **No gas costs** — mint operations are free
- **Instant** — no block confirmations
- **Privacy** — blind-signed tokens; the mint cannot link payer to payee
- **Micropayment-native** — no minimum transaction size
- **Multi-asset** — mints can issue tokens denominated in sat, usd, eur, etc.

The trust model shifts from blockchain consensus to mint trust. The server explicitly opts into this by listing accepted mints.

### Scope

**v1 implements direct mode only.** The server handles Cashu verification and settlement itself — no facilitator intermediary.

**Facilitated mode** (server delegates to a Cashu-to-Lightning bridge) is documented in the spec as a defined future path but not implemented in v1.

### Supported NUTs

| NUT | Name | Role |
|-----|------|------|
| 00 | Token format | TokenV4 serialization/deserialization |
| 03 | Swap | Settlement — claim proofs for fresh ones |
| 05 | Melt | Documented for future auto-melt; not in v1 |
| 07 | Check state | Verify proofs are UNSPENT before settlement |
| 10 | Spending conditions | P2PK token locking (optional per server) |
| 11 | P2PK | Signature verification for spending conditions |

NUT-15 (multi-path payments) is deferred.

## Protocol Mapping

### Network Identifier

`cashu:mainnet` — CAIP-2 style, consistent with `eip155:1` (EVM), `solana:mainnet` (SVM).

### PaymentRequired (server -> client)

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
        "unit": "sat",
        "pubkey": "02abc...def"
      }
    }
  ]
}
```

| Field | Description |
|-------|-------------|
| `scheme` | Always `"exact"` |
| `network` | Always `"cashu:mainnet"` |
| `amount` | Required payment amount as a string |
| `asset` | Unit denomination: `"sat"`, `"usd"`, `"eur"`, etc. |
| `payTo` | Primary mint URL — the mint the server will swap proofs at |
| `extra.mints` | Array of accepted mint URLs. The client's token MUST come from one of these. |
| `extra.unit` | Cashu unit denomination. Redundant with `asset` but explicit for Cashu tooling. |
| `extra.pubkey` | Optional. Server's public key for NUT-10/11 P2PK locking. If omitted, server accepts bearer tokens. |

**Multi-unit support:** A server accepting both sat and usd publishes two `accepts` entries, each with its own mint list and unit. This scales naturally — adding a new unit is just another entry.

### PaymentPayload (client -> server)

```json
{
  "x402Version": 2,
  "payload": {
    "token": "cashuBpGhh..."
  }
}
```

| Field | Description |
|-------|-------------|
| `payload.token` | Serialized Cashu TokenV4 (NUT-00 format) |

## Verification

When the server receives a payment payload, it MUST perform these checks in order:

1. **Deserialize** — Parse `payload.token` as a Cashu TokenV4. MUST reject if malformed.
2. **Mint check** — Verify the token's mint URL is in the server's `extra.mints` list. MUST reject if the mint is untrusted.
3. **Unit check** — Verify the token's unit matches the requested `extra.unit`. MUST reject if mismatched.
4. **Amount check** — Sum the proof amounts in the token. MUST reject if total is less than the required `amount`.
5. **Proof state check** — Call `POST /v1/checkstate` at the mint (NUT-07) to verify all proofs are `UNSPENT`. MUST reject if any proof is spent or pending.
6. **P2PK check** — If `extra.pubkey` was advertised, verify the token's spending conditions (NUT-10) lock to the server's public key with a valid signature (NUT-11). MUST reject if locked to a different key or unlocked when a pubkey was required. If `extra.pubkey` was not advertised, this check is skipped.

Failure at any step returns HTTP 402 with the original PaymentRequired response so the client can retry.

### Replay Protection

The mint is the sole source of truth for proof state. No server-side replay cache is needed. If two swap attempts race for the same proofs, one succeeds and the other fails at the mint. The server handles the error and returns 402.

## Settlement

After verification passes:

1. **Swap** — Call `POST /v1/swap` at the token's mint (NUT-03) with the received proofs, requesting fresh outputs in the server's keyset. This atomically claims the tokens — the original proofs are now spent at the mint.
2. **Store** — Persist the fresh proofs via the `ProofStore` interface. Storage backend is the server operator's concern.
3. **Respond** — Return success to the middleware, which serves the protected resource.

If the swap fails (proofs already spent, mint unreachable, etc.), settlement fails, the resource is not served, and the client receives 402.

### ProofStore Interface

```typescript
interface ProofStore {
  saveProofs(proofs: Proof[], mintUrl: string): Promise<void>;
}
```

The package ships with a no-op default. Operators provide their own implementation (database, file, wallet software, etc.). A simple in-memory implementation ships in the examples.

### Future: Auto-Melt

The spec documents an optional post-settlement melt flow: after swapping, the server immediately converts fresh proofs to a Lightning payment via `POST /v1/melt` (NUT-05). This is not implemented in v1 but is a defined extension point for operators who do not want to hold ecash.

## Security Considerations

### Mint Trust

The server explicitly trusts the mints listed in `extra.mints`. Cashu's security model depends on mint honesty — a malicious mint could issue unbacked tokens or refuse to honor swaps. Server operators MUST only list mints they trust.

### P2PK Token Locking

When the server advertises `extra.pubkey`, clients MUST lock tokens to that key using NUT-10 spending conditions with NUT-11 signatures. This prevents a man-in-the-middle from stealing tokens in transit — only the holder of the server's private key can redeem them at the mint.

Servers that omit `extra.pubkey` accept bearer tokens. These are simpler but vulnerable to interception. HTTPS mitigates this for the client-to-server leg, but the tradeoff is explicit.

### HTTPS

All mint URLs MUST use HTTPS. The server MUST reject tokens from mints served over plain HTTP.

### Token Single-Use

Cashu proofs are inherently single-use. Once swapped at the mint, the original proofs are invalidated. The mint handles double-spend protection — the server does not need to maintain a spent-proof database.

### Settlement Atomicity

The swap operation at the mint is atomic — it either succeeds (all proofs spent, fresh proofs issued) or fails (no state change). There is no partial settlement.

## Operating Modes

### Direct Mode (v1)

```
Client                    Server                    Mint
  |                         |                         |
  |-- GET /resource ------->|                         |
  |<-- 402 + accepts -------|                         |
  |                         |                         |
  |-- GET /resource ------->|                         |
  |   + PAYMENT-SIGNATURE   |                         |
  |   (Cashu token)         |                         |
  |                         |-- POST /v1/checkstate ->|
  |                         |<-- proof states --------|
  |                         |                         |
  |                         |-- POST /v1/swap ------->|
  |                         |<-- fresh proofs --------|
  |                         |                         |
  |<-- 200 + resource ------|                         |
```

Server handles Cashu directly. No intermediary. Simpler, more private.

### Facilitated Mode (future)

```
Client                    Server                 Facilitator              Mint
  |                         |                         |                     |
  |-- GET /resource ------->|                         |                     |
  |<-- 402 + accepts -------|                         |                     |
  |                         |                         |                     |
  |-- GET /resource ------->|                         |                     |
  |   + PAYMENT-SIGNATURE   |                         |                     |
  |   (Cashu token)         |                         |                     |
  |                         |-- POST /settle -------->|                     |
  |                         |                         |-- POST /v1/melt --->|
  |                         |                         |<-- melt result -----|
  |                         |<-- settle result -------|                     |
  |                         |                         |                     |
  |<-- 200 + resource ------|                         |                     |
```

Server forwards proofs to a facilitator. The facilitator melts tokens at the mint and routes value to the server (Lightning, on-chain, etc.). Server does not need to know about Cashu.

Not implemented in v1. Documented here as a defined extension path.

## Package Structure

```
x402-cashu/
├── src/
│   ├── facilitator/
│   │   ├── scheme.ts          # ExactCashuScheme implementing SchemeNetworkFacilitator
│   │   └── register.ts        # registerExactCashuScheme(server, config)
│   ├── server/
│   │   ├── scheme.ts          # ExactCashuScheme implementing SchemeNetworkServer
│   │   └── register.ts        # server-side registration
│   ├── client/
│   │   └── scheme.ts          # ExactCashuScheme implementing SchemeNetworkClient
│   ├── shared/
│   │   ├── types.ts           # CashuConfig, CashuExtra, ProofStore interface
│   │   ├── verify.ts          # verification logic (steps 1-6)
│   │   ├── settle.ts          # swap logic
│   │   └── token.ts           # TokenV4 parsing/validation helpers
│   └── index.ts               # public exports
├── test/
│   ├── unit/                  # mock mint responses
│   └── integration/           # real test mint (Nutshell via Docker)
├── examples/
│   └── express-server.ts      # minimal direct-mode example
├── package.json
├── tsconfig.json
└── README.md
```

### Dependencies

- `@x402/core` — types and interfaces only
- `@cashu/cashu-ts` — mint communication, token serialization, proof management

### Registration

```typescript
import { registerExactCashuScheme } from "x402-cashu";

registerExactCashuScheme(server, {
  mints: ["https://mint.example.com"],
  unit: "sat",
  pubkey: "02abc...def",  // optional — omit for bearer tokens
  proofStore: myProofStore, // optional — defaults to no-op
});
```

Registers the scheme with CAIP identifier `cashu:mainnet` using the x402 plugin system.

### Interfaces Implemented

| Interface | Role |
|-----------|------|
| `SchemeNetworkFacilitator` | `verify()` and `settle()` methods, `caipFamily: "cashu"` |
| `SchemeNetworkServer` | `enhancePaymentRequirements()` populates `extra` fields; `parsePrice()` handles unit conversion |
| `SchemeNetworkClient` | `createPaymentPayload()` selects proofs, applies P2PK locking if needed, serializes TokenV4 |

## Testing Strategy

### Unit Tests (mocked mint)

- Token deserialization — valid TokenV4, malformed input, wrong version
- Verification — each of the 6 checks in isolation (wrong mint, wrong unit, insufficient amount, spent proofs, wrong P2PK lock, happy path)
- Settlement — successful swap, swap failure (already spent), mint unreachable
- P2PK — token locking with server pubkey, spending condition verification
- Registration — config validation, correct CAIP identifier

### Integration Tests (real test mint)

- End-to-end verify then settle against a Nutshell test mint
- Multi-mint — token from trusted vs untrusted mint
- P2PK flow — lock, verify, swap with spending conditions
- Concurrent submissions — same proofs submitted twice, second fails at mint

### Test Infrastructure

- Nutshell (Python reference mint) runs locally via Docker for integration tests
- CI runs unit tests always; integration tests against a containerized Nutshell instance
- Tests use test tokens — no real sats

## Upstream Path

1. Write spec document following `scheme_impl_template.md` and `specs/CONTRIBUTING.md`
2. Validate implementation against the spec in this repo
3. Submit spec PR to `coinbase/x402` at `specs/schemes/exact/scheme_exact_cashu.md`
4. After spec approval, submit implementation PR with tests and examples
5. All commits signed per x402 contribution requirements

Upstream submission is deferred until the implementation is validated and working.
