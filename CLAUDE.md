# x402

## Project Structure
- `x402-cashu/` — standalone TypeScript package (ESM, strict, Vitest)
- When dispatching subagents, specify full paths explicitly — the package is a subdirectory, not the repo root

## Build & Test
- `cd x402-cashu && npx tsc --noEmit` — type check
- `cd x402-cashu && npx vitest run` — unit tests
- `cd x402-cashu && npx vitest run --config vitest.integration.config.ts` — integration tests (requires Docker: `docker compose -f docker-compose.test.yml up -d`)

## Dependencies
- `@x402/core` types: import from `@x402/core/types`, NOT `@x402/core` (root only exports `x402Version`)
- `@cashu/cashu-ts` v3: `Wallet.send(amount, proofs, config?, outputConfig?)` — proofs required as 2nd arg
- `@types/node` is a devDependency (needed for `node:crypto`)

## TypeScript
- Test files are excluded from tsconfig (`"exclude": ["test"]`) — TS language server "Cannot find module" warnings on test imports are expected
- Use `moduleResolution: "bundler"` with ESM `.js` extensions in imports
