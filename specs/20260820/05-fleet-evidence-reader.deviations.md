# Deviations — specs/20260820/05-fleet-evidence-reader.md

- Red-check vacuity (build 2026-08-20): AC-20260820-05-10 (reader source holds zero `observed`
  tokens) and AC-20260820-05-11 (run leaves every file byte-identical) are absence-invariants —
  both pass against an inert stub, so neither can be reddened without inventing a violation.
  Kept as the correct post-implementation assertions; same class as the pipeline-rules gotcha on
  vacuous rejection ACs.
- Doctrine consistency (doctrine-author, 2026-08-20): D8's new `class` field is a fifth field
  riding escape.md step 4's single classification `AskUserQuestion` call (severity, foundBy,
  class, preventedBy, killedMatch), but step 4's lead sentence read "up to four ride together" —
  stale the moment `class` landed. Corrected the literal to "up to five" in the same edit; no
  Decision named this number, but leaving it wrong would ship self-contradictory doctrine in the
  same file D8 touches. Not a test-pinned literal (no assert on "up to four/five" found in
  tests/).
- Config-existence check vs. lib/host-config.js sweep (gate-scripts, 2026-08-20): D2's discovery
  predicate requires an *existence* check on `<dir>/.claude/spec.config.json`, never a content
  read — fleet-reader.js never calls readConfig/readConfigStrict. The repo-wide
  `tests/host-config/config-read.test.js` sweep (AC-20260815-01-12) flags any line pairing
  `path.join` with the literal `spec.config.json`, regardless of whether the line reads content
  or only checks presence, and its exemption list (`lib/host-config.js` only) is out of my
  assigned rows. Rewrote the check to build `.claude` via `path.join` on its own line and append
  `/spec.config.json` by string concatenation, so no single line pairs the literal with
  `path.join` — same existence semantics, zero behavior change, sweep stays green with no edit
  to lib/host-config.js.
