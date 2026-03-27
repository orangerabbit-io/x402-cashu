# Scheme: `exact` on `cashu`

## Summary

Cashu ecash payment scheme for the x402 protocol. Enables micropayments over HTTP 402 using blind-signed ecash tokens (NUT-00 TokenV4). The server verifies and claims tokens directly against a Cashu mint — no blockchain, no gas costs, no block confirmations.

**Network identifier:** `cashu:mainnet`

**Trust model:** The server explicitly opts into mint trust by listing accepted mint URLs. Cashu's security depends on mint honesty — operators MUST only list mints they trust.

**Key properties:**
- No facilitator required — server verifies and settles directly with the mint
- Instant settlement via atomic swap (NUT-03)
- Privacy via blind-signed tokens — the mint cannot link payer to payee
- Optional P2PK token locking (NUT-10/11) for man-in-the-middle protection
- Multi-asset support — mints issue tokens denominated in `sat`, `usd`, `eur`, etc.

### Supported NUTs

| NUT | Name | Role |
|-----|------|------|
| 00 | Token format | TokenV4 serialization/deserialization |
| 03 | Swap | Settlement — claim proofs for fresh ones |
| 07 | Check state | Verify proofs are UNSPENT before settlement |
| 10 | Spending conditions | P2PK token locking (optional per server) |
| 11 | P2PK | Signature verification for spending conditions |

## `PaymentRequirements`

The server's 402 response includes the following `PaymentRequirements` entry:

```json
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
```

| Field | Type | Description |
|-------|------|-------------|
| `scheme` | `string` | Always `"exact"` |
| `network` | `string` | Always `"cashu:mainnet"` |
| `amount` | `string` | Required payment amount in the smallest unit |
| `asset` | `string` | Unit denomination: `"sat"`, `"usd"`, `"eur"`, etc. |
| `payTo` | `string` | Server's preferred mint URL. Clients SHOULD source tokens from this mint when possible |
| `maxTimeoutSeconds` | `number` | Maximum time the server will wait for verification and settlement |
| `extra.mints` | `string[]` | **Required.** Accepted mint URLs. The client's token MUST originate from one of these |
| `extra.unit` | `string` | **Required.** Cashu unit denomination. MUST match `asset` |
| `extra.pubkey` | `string` | Optional. Server's public key for NUT-10/11 P2PK locking. If omitted, server accepts bearer tokens |

### Mint URL Normalization

Mint URLs MUST be normalized before comparison: lowercase the hostname, remove default port 443, strip trailing slashes. For example, `https://Mint.Example.COM:443/` normalizes to `https://mint.example.com`. Both the server's `extra.mints` list and the token's mint URL MUST be normalized before the trust check.

### Multi-unit Support

A server accepting both `sat` and `usd` publishes two `PaymentRequirements` entries, each with its own mint list and unit. Adding a new unit is just another entry.

## `X-Payment` Header Payload

The client constructs a `PaymentPayload` containing a serialized Cashu TokenV4:

```json
{
  "x402Version": 2,
  "scheme": "exact",
  "network": "cashu:mainnet",
  "payload": {
    "token": "cashuBpGhh..."
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `payload.token` | `string` | Serialized Cashu TokenV4 (NUT-00 format) |

### Token Construction

1. Select proofs from a funded wallet at one of the accepted mints (`extra.mints`)
2. The total proof amount MUST be >= the required `amount`
3. If `extra.pubkey` is present, lock proofs to the server's public key using NUT-10 spending conditions with NUT-11 signatures
4. Serialize as TokenV4 via `getEncodedTokenV4({ mint, proofs, unit })`

### Overpayment

If the client sends proofs totaling more than the required `amount`, the server keeps the excess. No change is returned. Clients SHOULD construct tokens matching the required amount as closely as possible. Cashu proofs use power-of-2 denominations, so exact matches may require multiple proofs (e.g., 100 sats = 64 + 32 + 4).

## Verification

The server MUST perform these checks in order. Failure at any step returns HTTP 402 with the appropriate error code.

1. **Deserialize** — Parse `payload.token` as a Cashu TokenV4. MUST reject if malformed. Error: `INVALID_TOKEN`

2. **HTTPS check** — Verify the token's mint URL uses HTTPS. MUST reject plain HTTP mints. Error: `UNTRUSTED_MINT`

3. **Mint trust check** — Normalize the token's mint URL and compare against the server's `extra.mints` list (also normalized). MUST reject if the mint is not in the list. This check MUST happen before any network calls to the mint to prevent SSRF. Error: `UNTRUSTED_MINT`

4. **Unit check** — Verify the token's `unit` field matches the server's `extra.unit`. MUST reject if mismatched or missing. Error: `UNIT_MISMATCH`

5. **Amount check** — Sum all proof amounts in the token. MUST reject if the total is less than the required `amount`. Error: `INSUFFICIENT_AMOUNT`

6. **Proof state check** — Call `POST /v1/checkstate` at the token's mint (NUT-07) to verify all proofs are `UNSPENT`. MUST reject if any proof is `SPENT` or `PENDING`. Error: `PROOFS_SPENT`. If the mint is unreachable: `MINT_UNREACHABLE`

7. **P2PK check** (conditional) — If the server advertised `extra.pubkey`, verify every proof's secret follows the NUT-10 well-known secret format `["P2PK", {"data": "<pubkey>"}]` and the pubkey matches. MUST reject if any proof is unlocked or locked to a different key. If `extra.pubkey` was not advertised, skip this step. Error: `P2PK_MISMATCH`

### Error Codes

| Code | Trigger |
|------|---------|
| `INVALID_TOKEN` | Token cannot be deserialized as TokenV4 |
| `UNTRUSTED_MINT` | Token's mint is not in `extra.mints`, or uses HTTP |
| `UNIT_MISMATCH` | Token's unit does not match `extra.unit` |
| `INSUFFICIENT_AMOUNT` | Sum of proof amounts < required `amount` |
| `PROOFS_SPENT` | One or more proofs are not `UNSPENT` |
| `P2PK_MISMATCH` | Spending conditions do not match server's pubkey |
| `MINT_UNREACHABLE` | Cannot reach mint for verification or settlement |
| `SWAP_FAILED` | Settlement swap failed at the mint |

## Settlement

After verification passes:

1. **Swap** — Call `POST /v1/swap` at the token's originating mint (NUT-03) with the received proofs. This atomically claims the tokens — the original proofs become spent, and the server receives fresh proofs. Error on failure: `SWAP_FAILED`

2. **Store** — Persist the fresh proofs. The storage backend is the server operator's concern (database, wallet, file, etc.).

3. **Respond** — Return the `SettleResponse`:

```json
{
  "success": true,
  "transaction": "a1b2c3d4e5f6...",
  "network": "cashu:mainnet"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `success` | `boolean` | Whether settlement succeeded |
| `transaction` | `string` | SHA-256 hash of the original proof secrets, hex-encoded |
| `network` | `string` | Always `"cashu:mainnet"` |
| `errorReason` | `string` | Error code if `success` is `false` |
| `errorMessage` | `string` | Human-readable error if `success` is `false` |

### Replay Protection

The mint is the sole source of truth for proof state. No server-side replay cache is needed. If two swap attempts race for the same proofs, one succeeds and the other fails at the mint. The server returns 402 with `SWAP_FAILED`.

### Settlement Atomicity

The swap operation at the mint is atomic — it either succeeds (all proofs spent, fresh proofs issued) or fails (no state change). There is no partial settlement.

## Security Considerations

### Mint Trust

The server explicitly trusts the mints listed in `extra.mints`. A malicious mint could issue unbacked tokens or refuse to honor swaps. Server operators MUST only list mints they trust. This is analogous to trusting a specific ERC-20 contract on an EVM chain.

### P2PK Token Locking

When the server advertises `extra.pubkey`, clients MUST lock tokens to that key using NUT-10/11. This prevents a man-in-the-middle from stealing tokens in transit — only the holder of the server's private key can redeem them. Servers that omit `extra.pubkey` accept bearer tokens, which are simpler but vulnerable to interception. HTTPS mitigates this for the client-to-server leg.

### HTTPS Enforcement

All mint URLs MUST use HTTPS. The server MUST reject tokens from mints served over plain HTTP. An `allowInsecure` flag MAY be supported for local development and testing only.

### SSRF Prevention

The mint trust check (step 3 of verification) MUST be performed before any network calls to the mint. This prevents an attacker from forcing the server to make outbound HTTP requests to arbitrary URLs by submitting a token with a crafted mint URL.

### Mint Communication Timeouts

Verification and settlement involve HTTP calls to external mints. The server MUST enforce timeouts:
- Mint calls SHOULD time out within a reasonable fraction of `maxTimeoutSeconds`
- If a mint is unreachable or times out, return 402 with `MINT_UNREACHABLE`
- The server MUST NOT retry failed mint calls within a single payment attempt
- If checkstate succeeds but swap fails due to timeout, the proofs may or may not have been spent. Return 402 with `SWAP_FAILED`. The client can check proof state and retry if proofs are still unspent.

## Appendix

### Cashu Resources

- [Cashu protocol specification](https://github.com/cashubtc/nuts)
- [cashu-ts TypeScript library](https://github.com/cashubtc/cashu-ts)
- [Nutshell reference mint](https://github.com/cashubtc/nutshell)

### Differences from Blockchain Schemes

| Property | EVM/SVM schemes | Cashu scheme |
|----------|----------------|--------------|
| Settlement finality | Block confirmations | Instant (mint swap) |
| Transaction cost | Gas fees | Free (mint operations) |
| Facilitator | Required for custody | Not required |
| Privacy | Pseudonymous (on-chain) | Blind signatures |
| Trust model | Blockchain consensus | Mint trust |
| Replay protection | Nonce/chain state | Mint proof state |
| Asset type | On-chain tokens | Ecash proofs |
