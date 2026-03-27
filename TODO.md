# TODO

## Publish

- [ ] Create GitHub repo `orangerabbit-io/x402-cashu`
- [ ] Add `NPM_TOKEN` secret to repo (npm access token with publish permissions)
- [ ] Push to GitHub — semantic-release will publish `x402-cashu` to npm

## Upstream to coinbase/x402

- [ ] PR 1: Submit spec (`specs/schemes/exact/scheme_exact_cashu.md`)
- [ ] PR 2: Submit reference implementation (after spec approval)

## Test Coverage Gaps

- [ ] P2PK integration test — lock, verify, swap against real mint
- [ ] Concurrent submission test — same proofs submitted simultaneously
- [ ] Multi-mint integration test — tokens from multiple trusted mints
