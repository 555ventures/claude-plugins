---
name: repo-naming-shared-vs-core
description: This repo's doctrine invariants file is spec/doctrine/core.md, not shared.md — my own agent instructions reference "shared.md" but that's stale/wrong for this repo
metadata:
  type: project
  reviewed: 2026-08-26
---

`spec/doctrine/` holds `core.md`, `design.md`, `genesis.md`, `replay-corpus.md` — there is no
`shared.md`. `spec-paths shared` resolves to `core.md`; `spec-paths shared-for <command>`
pulls a section allowlist (defined in `spec/bin/spec-paths`) out of `core.md` (+ `design.md`
for design-family commands). Command prose still says "shared §" as an informal idiom even
though the file is `core.md` — `citations-check.js` unions both `core.md` and `design.md` for
any "shared" citation, so `core §`/`shared §` are interchangeable in practice.

**Why:** my own agent-definition system prompt cites `spec/doctrine/{shared.md, genesis.md,
scaffold-ledger.md}` as reference material — `shared.md` and `scaffold-ledger.md` do not exist
in this repo's current tree (2026-08-21). Don't trust that list literally; `ls spec/doctrine/`
first.

**How to apply:** when told to read "shared.md" or cite "§ Section" against "shared", resolve
against `core.md` (and `design.md` for design-family commands) instead.
