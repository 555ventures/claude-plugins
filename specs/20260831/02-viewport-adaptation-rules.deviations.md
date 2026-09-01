# Deviations — 02-viewport-adaptation-rules

- Version bump target departed from the spec's literal File Plan number: the spec named
  7.46.0, but that version was already at HEAD by build time (commit history shows
  `plan(20260831/02)` landing after `build(20260831/01)`'s own 7.46.0 bump). Per
  spec-pipeline.md § Gotchas ("a spec Decision naming a literal version-bump target can be
  stale by build time"), bumped to the next free version, **7.47.0**, with the changelog
  paragraph in the same last-3-versions form.
- Gate repair, D9's out-of-File-Plan pin (AC-20260824-05-2, design.md's 160-line cap): the
  "Design harness" paragraph in § Design Canon needed both D9's new sentences (kind list
  gaining `no-overflow`/`line-length`; `render-gate --mocks` at `/spec:sketch`'s exit named as
  the matrix-adaptation verifier; the static atlas checks named as preconditions) AND its
  pre-existing sentence — "Every pass also applies § Design Authoring Contracts'
  grounded-vs-taste rules; copy in mocks is the contract code is later held to" — to survive
  intact under the cap. Reached by tightening wording only (no claim dropped): the render-rules
  pass sentence was compressed ("measured, taste advisory" for "a measured number, never a
  walked checklist; an un-mechanized taste rule is advisory only"), and the restored sentence
  itself was compressed to one clause ("§ Design Authoring Contracts' grounded-vs-taste rules
  apply too, mocks' copy the contract code is later held to") while keeping both halves — the
  cross-reference and the mock-copy-is-contract claim. Final file: 159 lines (cap 160);
  `citations-check.js` reports `MISS=0` (the § Design Authoring Contracts citation still
  resolves).
