# Enforce

How `/spec:enforce` turns a host's rules into gate-wired checkers. The command prose
(`spec/commands/enforce.md`) is the procedure; this file holds the durable shape.

## Cells

Discovery runs once per `(workspace × stack × category)` cell, never once per repo.
`workspace-scan.js` lists the workspaces first; an empty scan means one root workspace whose
stack comes from the config and manifests. A cell carries `workspace` (repo-relative dir, `.`
for the root) and, for `category: "naming"` only, `layer` ∈ `code | schema | routes | wire` —
the host naming table's own `###` section list, so adding a layer is a naming-table change
first. One naming cell exists per workspace per non-empty section; one `kit-discipline` cell per
workspace that owns the `design.kit` directory.

Cell ids read `<workspace>:<stack>:<category>[/<layer>]`, with the `<workspace>:` prefix
omitted for the root, so `python:module-boundary` is a root cell and `api:python:naming/schema`
the nested form. Every pre-workspace manifest entry therefore still parses, as the root
workspace. The enforce workflow's `validateCells` defaults a missing `workspace` to `.` and
refuses a `layer` on a non-naming cell (`layer-on-non-naming`) or an unknown layer
(`unknown-layer`), accounting for each in `skipped`. `/spec:doctor` check 10 resolves each
manifest entry's workspace directory and refuses a layer outside the four.
(specs/20260926/03-gates-per-workspace.md D2, D4, D6)

## Verify

A `kit-discipline` candidate passes verify only if a red probe fails it: a scratch file
carrying one raw palette class and one arbitrary value must make the candidate's run command
exit non-zero. Proving the tool runs is not enough — a wired palette lint once passed raw
colours because the host theme never reset the default palette.
(specs/20260926/03-gates-per-workspace.md D5)

## Wiring

Each checker runs from its own workspace root, chained into the host's one `gateCommand` as a
`cd <ws> && …` segment. The gate stays one string; splitting it per workspace would be a
contract change for every gate consumer.
(specs/20260926/03-gates-per-workspace.md D5, Rationale)
