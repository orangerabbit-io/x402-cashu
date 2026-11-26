# TODO

## Blocked: npm publish credential

`NPM_TOKEN` is invalid — Release run 45696111422 fails in `verifyConditions` with
`EINVALIDNPMTOKEN`. Nothing has been published since 1.0.0 (2026-04-07); `main` at
`1689342` is ready to release 1.0.1. The token in `~/.npmrc` on the dev laptop is
401 as well, so there is no working npm credential anywhere.

Two ways out, both needing npm account access:

- **Trusted publishing** (preferred — nothing to rotate): npmjs.com → `x402-cashu`
  → Settings → Trusted Publishing → GitHub Actions, org `orangerabbit-io`, repo
  `x402-cashu`, workflow `release.yml`. `@semantic-release/npm` 13.1.5 already
  implements the OIDC path (`lib/trusted-publishing/`), so the change here is
  dropping `NPM_TOKEN` and the `if: env.NPM_TOKEN != ''` guard from
  `.github/workflows/release.yml` and letting the existing `id-token: write`
  carry the publish, with provenance.
- **New granular token**: npmjs.com → Access Tokens → Granular, read+write on
  `x402-cashu`, then `gh secret set NPM_TOKEN`.

After either, re-run the Release workflow on `main`.

Related: `has_issues` is `false` on the repo, so `@semantic-release/github` cannot
open its release-failure issue and the 422 buries the real npm error under a
header dump. `gh api -X PATCH repos/orangerabbit-io/x402-cashu -f has_issues=true`.

## Declaring the `upfront` payment flow

`ExactCashuServer.paymentFlows` (`x402-cashu/src/server/scheme.ts`) advertises
only `"authorization"`. `settlePayment` (`x402-cashu/src/shared/settle.ts:38`)
takes no `PaymentRequirements` and swaps whatever token it is handed, so unit,
amount, proof-state and P2PK checks happen only in `verifyPayment`. An upfront
flow would settle before any of that runs. Move requirement re-validation into
`settlePayment` first, then add `"upfront"` to `supported`. The same applies to
`"escrow"` if it is ever wanted.

## `examples/` is outside type checking

`x402-cashu/tsconfig.json` excludes `examples`, so the example server does not
compile and nothing notices:

```
examples/test-server.ts(18,18): error TS2724: '"@cashu/cashu-ts"' has no exported
  member named 'getEncodedTokenV4'. Did you mean 'getEncodedToken'?
examples/test-server.ts(120,47): error TS2365: Operator '+' cannot be applied to
  types 'number' and 'Amount'.
```

`getEncodedTokenV4` was removed in cashu-ts 4.x (`getEncodedToken` replaces it).
Fix the two call sites and add a tsconfig that covers `examples` so this cannot
rot again.
