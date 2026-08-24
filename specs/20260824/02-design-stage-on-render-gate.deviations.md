# Deviations — specs/20260824/02-design-stage-on-render-gate.md

- **File Plan scope addition (orchestrator, build 2026-08-24): `spec/scripts/render-gate.js`.**
  AC-20260824-02-2 requires `render-gate.js`'s exit-2 `design.render`-missing stderr to name
  `/spec:design`, but the File Plan carried only the *test* row (`tests/render/render-gate.test.js`),
  phrased as though the script already named the command. It does not — the live remedy reads
  `no usable design.render block in <config> — declare design.render.capture and design.render.url
  (see spec/templates/grounding-contract.md)`, with no command name anywhere in the file. The AC is
  unsatisfiable without a one-line change to the script's remedy string, so the row was added to the
  scripts wave rather than stalling the build on a clerical omission; the change is confined to the
  error message and leaves every other asserted substring intact.
- **Version bump target: 7.33.0, not the spec's `7.32.x`.** D17 and the plugin.json File Plan row
  name "next free 7.32.x (target 7.32.0)". Both 7.32.0 and 7.32.1 were already at HEAD by build time
  (7.32.1 landed as a concurrent prose-only doctor fix committed immediately before this build), so
  the literal target was taken. This repo's own next-free-version Gotcha makes the spec's number a
  target rather than a pin; the spec's intent was a MINOR bump (7.31.0 → 7.32.0), and this change —
  three scripts and two test files deleted, a command body rewritten, three `spec-paths` keys retired
  — is a behavior change, not the prose-only class that earns a patch bump. Landing it as 7.32.2
  would have understated it against this repo's own established bump grammar.
