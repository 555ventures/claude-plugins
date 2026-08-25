# Genesis — canonical decisions

## Decision record (one proposer)

- Since specs/20260825/01 the genesis architect and design stages have no proposer panel.
  `wf-research.js` (one Sonnet agent per dimension slice, web-enabled) builds ranked option
  menus on disk; the planning session is the proposer — it reads the menus and writes the ADRs
  directly. A second perspective on a hard fork is a second research call over a different
  dimension slice, never a second reader of the same brief. `wf-panel.js`, its `spec-paths`
  key, `## Panel Roles`, and `panel-results-*.json` are retired. The archetype registry names
  dimension keys only — no framework, language, runtime, or catalog product appears in
  doctrine. (specs/20260825/01-genesis-panel-collapse.md, done 2026-08-25)
- A workflow script under a `pipelineOwnedPaths` glob (`spec/workflows/wf-*.js`) is pruned from
  both collision-closure's literals leg and scope-reconcile, so neither automatic sweep can see
  a stale literal inside it; an enumerated-file doctrine test is its only gate. Coverage for
  such a file carries a stricter banned list than its siblings in the same test and a comment
  naming the blind spot. (same spec, review fix 2026-08-25)
