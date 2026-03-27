# x402-cashu

Cashu ecash payment scheme for the [x402 protocol](https://github.com/coinbase/x402). Enables micropayments over HTTP 402 using blind-signed ecash tokens.

## Why Cashu

Cashu ecash tokens are a natural fit for x402 micropayments:

- **No facilitator required** — the server can verify and redeem tokens directly against the mint (HTTP calls, no chain infrastructure)
- **No gas costs** — mint operations are free
- **Instant** — no block confirmations
- **Privacy** — blind-signed tokens, mint can't link payer to payee
- **Micropayment-native** — no minimum transaction size
- **Multi-asset** — Cashu mints can issue tokens denominated in sat, usd, eur, etc.

The trust model shifts from blockchain consensus to mint trust, which is an explicit, known tradeoff the server opts into by listing accepted mints.

## Repository Structure

```
x402-cashu/                  # TypeScript package (npm: x402-cashu)
  src/                       # Source code
  test/                      # Unit and integration tests
  examples/                  # Test server for manual testing
docs/                        # Design spec and implementation plan
specs/                       # Upstream spec for coinbase/x402 PR
```

## Protocol Mapping

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
        "mints": ["https://mint.example.com"],
        "unit": "sat",
        "pubkey": "02abc...def"
      }
    }
  ]
}
```

### PaymentPayload (client -> server)

```json
{
  "x402Version": 2,
  "payload": {
    "token": "cashuBpGhh..."
  }
}
```

### Verification

1. Deserialize TokenV4
2. HTTPS and mint trust check (before any network calls — SSRF prevention)
3. Unit check
4. Amount check
5. Proof state check (NUT-07)
6. P2PK check (NUT-10/11, optional)

### Settlement

Swap proofs at the mint (NUT-03) — atomic, instant, no gas.

## References

- [x402 protocol](https://github.com/coinbase/x402)
- [Cashu protocol (NUTs)](https://github.com/cashubtc/nuts)
- [cashu-ts library](https://github.com/cashubtc/cashu-ts)
- [Design spec](docs/superpowers/specs/2026-03-25-x402-cashu-design.md)
- [Upstream spec](specs/schemes/exact/scheme_exact_cashu.md)
