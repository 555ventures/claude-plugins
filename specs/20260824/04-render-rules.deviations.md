- spec/entrypoints.json's `render-rules.js` File Plan row named only "reached from
  spec/scripts/render-gate.js", but by the time this batch ran, concurrent doctrine-author
  landings for this same spec had already added real `spec-paths render-gate`/`spec-paths
  render-rules` invocations to spec/commands/sketch.md (D6) and spec/doctrine/design.md (D6)
  respectively — tests/consistency/entrypoints.test.js's forward-completeness check (AC-20260820-
  04-6, a live-repo green pin) went red on both undeclared call sites. Added
  "spec/commands/sketch.md" to render-gate.js's entryPoints and "spec/doctrine/design.md" to
  render-rules.js's entryPoints in spec/entrypoints.json — the same file the File Plan row already
  assigns to this batch — rather than requesting a blocked; this is the parallel-batch-corpus-
  landing class (a cross-batch AC going green/red from a sibling worker's concurrent landing).
