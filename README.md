# x402-cashu

Cashu ecash payment scheme for the [x402 protocol](https://github.com/coinbase/x402). Enables micropayments over HTTP 402 using blind-signed ecash tokens.

## Why Cashu

Cashu ecash tokens are a natural fit for x402 micropayments:

- **No facilitator required** -- the server can verify and redeem tokens directly against the mint (HTTP calls, no chain infrastructure)
- **No gas costs** -- mint operations are free
- **Instant** -- no block confirmations
- **Privacy** -- blind-signed tokens, mint can't link payer to payee
- **Micropayment-native** -- no minimum transaction size
- **Multi-asset** -- Cashu mints can issue tokens denominated in sat, usd, eur, etc.

The trust model shifts from blockchain consensus to mint trust, which is an explicit, known tradeoff the server opts into by listing accepted mints.

## Install

```bash
npm install x402-cashu
```

Requires Node.js >= 20.

## Usage

### Facilitator (verify + settle)

```ts
import { ExactCashuFacilitator, noopProofStore } from "x402-cashu";

const facilitator = new ExactCashuFacilitator({
  mints: ["https://mint.example.com"],
  unit: "sat",
  proofStore: noopProofStore,
});
```

### Server (direct mode)

```ts
import { ExactCashuServer, registerExactCashuServer } from "x402-cashu/server";
```

### Client

```ts
import { ExactCashuClient } from "x402-cashu/client";
```

See [`x402-cashu/examples/`](x402-cashu/examples/) for a complete Express server example.

## Protocol

### PaymentRequired (server -> client)

```json
{
  "x402Version": 2,
  "accepts": [{
    "scheme": "exact",
    "network": "cashu:mainnet",
    "amount": "100",
    "asset": "sat",
    "payTo": "https://mint.example.com",
    "extra": {
      "mints": ["https://mint.example.com"],
      "unit": "sat",
      "pubkey": "02abc...def"
    }
  }]
}
```

### PaymentPayload (client -> server)

```json
{
  "x402Version": 2,
  "payload": { "token": "cashuBpGhh..." }
}
```

### Verification

1. Deserialize TokenV4
2. HTTPS and mint trust check (before any network calls -- SSRF prevention)
3. Unit check
4. Amount check
5. Proof state check (NUT-07)
6. P2PK check (NUT-10/11, optional)

### Settlement

Swap proofs at the mint (NUT-03) -- atomic, instant, no gas.

## Repository Structure

```
x402-cashu/          # TypeScript package (npm: x402-cashu)
  src/               # Source code
  test/              # Unit and integration tests
  examples/          # Example Express server
docs/                # Design spec and implementation plan
specs/               # Upstream spec for coinbase/x402 PR
```

## Development

```bash
cd x402-cashu
npm install
```

```bash
# Unit tests
npm test

# Type check
npx tsc --noEmit

# Integration tests (requires a running Cashu mint)
TEST_MINT_URL=http://localhost:3338 npm run test:integration
```

### Branching and Commits

Work on feature branches off `main` (`feat/short-description`, `fix/issue-description`). Use [conventional commits](https://www.conventionalcommits.org/). Open a pull request for review before merging.

## References

- [x402 protocol](https://github.com/coinbase/x402)
- [Cashu protocol (NUTs)](https://github.com/cashubtc/nuts)
- [cashu-ts library](https://github.com/cashubtc/cashu-ts)

## License

[Apache-2.0](LICENSE)
