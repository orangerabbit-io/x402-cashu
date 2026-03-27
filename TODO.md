# TODO

## Publish

- [ ] Create GitHub repo `orangerabbit-io/x402-cashu`
- [ ] Add `NPM_TOKEN` secret to repo (npm access token with publish permissions)
- [ ] Push to GitHub — semantic-release will publish `x402-cashu` to npm

## Upstream to coinbase/x402

- [ ] PR 1: Submit spec (`specs/schemes/exact/scheme_exact_cashu.md`)
- [ ] PR 2: Submit reference implementation (after spec approval)

## Pre-Open Source Cleanup

- [ ] Remove `CLAUDE.md`
- [ ] Remove `docs/superpowers/` (design spec and implementation plan)
- [ ] Remove Co-Authored-By lines from commits (optional — rebase or squash)

## Transport Adapters

- [ ] MCP transport — Cashu payment via Model Context Protocol
- [ ] A2A transport — Cashu payment via Agent-to-Agent protocol

## Test Coverage Gaps

- [ ] P2PK integration test — lock, verify, swap against real mint
- [ ] Concurrent submission test — same proofs submitted simultaneously
- [ ] Multi-mint integration test — tokens from multiple trusted mints
