# x402

## Project Structure
- `x402-cashu/` — standalone TypeScript package (ESM, strict, Vitest)
- When dispatching subagents, specify full paths explicitly — the package is a subdirectory, not the repo root

## Build & Test
- `cd x402-cashu && npx tsc --noEmit` — type check
- `cd x402-cashu && npx vitest run` — unit tests
- `cd x402-cashu && TEST_FUNDING_TOKEN="cashuB..." npx vitest run --config vitest.integration.config.ts` — integration tests (3 sat Cashu token from mint.minibits.cash; Docker FakeWallet fallback if no token set)
- `cd x402-cashu && MINT_URL=https://mint.minibits.cash/Bitcoin npx tsx examples/test-server.ts` — manual test server (curl with X-Cashu-Token header, returns change token)

## Dependencies
- `@x402/core` types: import from `@x402/core/types`, NOT `@x402/core` (root only exports `x402Version`)
- `@cashu/cashu-ts` v3: `Wallet.send(amount, proofs, config?, outputConfig?)` — proofs required as 2nd arg
- `@types/node` is a devDependency (needed for `node:crypto`)

## TypeScript
- Test files are excluded from tsconfig (`"exclude": ["test"]`) — TS language server "Cannot find module" warnings on test imports are expected
- Use `moduleResolution: "bundler"` with ESM `.js` extensions in imports

## Upstream
- Spec for coinbase/x402 PR: `specs/schemes/exact/scheme_exact_cashu.md`
- Follows coinbase's `scheme_impl_template.md` format (sections: PaymentRequirements, X-Payment payload, Verification, Settlement, Security)
