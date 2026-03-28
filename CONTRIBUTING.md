# Contributing to x402-cashu

## Development Setup

```bash
cd x402-cashu
npm install
```

## Running Tests

```bash
# Unit tests
npm test

# Type check
npx tsc --noEmit

# Integration tests (requires a Cashu mint or Docker)
TEST_MINT_URL=http://localhost:3338 npx vitest run --config vitest.integration.config.ts
```

## Branching Model

- Work on feature branches off `main`: `feat/short-description`, `fix/issue-description`
- Open a pull request for review before merging
- Use [conventional commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`

## Submitting Changes

1. Fork the repository and create a feature branch
2. Make your changes with clear, focused commits
3. Ensure `npm test` and `npx tsc --noEmit` pass
4. Open a pull request against `main`

## License

By contributing, you agree that your contributions will be licensed under the Apache-2.0 license.
