# Gate integrity

Canonical behavior of the checks that stand between an implementation and a `done` spec.

## Environment preflight

Suite-gating environment variables are **declared**, never inferred. A host names each one in
`.claude/spec.config.json`'s optional `testEnv` array — `[{"var": "<NAME>", "provision":
"<command>"}]` — written by `/spec:init` at the same step that derives the same pairs as prose
for pipeline rules § Test Rules.

`spec/scripts/env-preflight.js` (`spec-paths env-preflight`) is the one deterministic check
against that registry, and runs in two modes:

- **Default mode** (`--root <dir>`): reads `process.env`. `/spec:build` Phase 0 runs it
  immediately after resolving the gate command, and `/spec:design` runs it before invoking
  `wf-design` — both before any gate, red-check probe, or repair loop is reachable. A variable
  that is unset **or empty-string** is a miss: exit 1, one line per miss naming the variable and
  its declared provisioning command. That is a provisioning STOP, not a finding — the gate cannot
  distinguish "the code under test is wrong" from "the environment the test needs was never
  provisioned", and the repair loop is structurally incapable of fixing the second class. The
  remedy is the printed provisioning command, never a fix dispatch.
- **`--rules <path>` mode**: reads the registry against the host's rules file only, never
  `process.env`. `/spec:doctor` check 6b runs it; exit 3 names each declared variable absent from
  the file's `## Test Rules` section, or the section heading itself when it does not exist. The
  reverse direction — § Test Rules names variables while config carries no registry — stays a
  model judgment recommending a `/spec:init` refresh, because prose has no grammar to parse.

A malformed registry is a config defect, never a silent pass: a non-array `testEnv`, or a row
missing `var` or `provision`, exits 2 naming the offending row index. A variable declared twice
is deduplicated, first row wins.

**An absent or empty registry is a no-op** — exit 0, silent, byte-identical to pre-preflight
behavior. Hosts opt in by declaring; the check blocks nobody who has not.

Provenance: `specs/20260815/05-env-preflight.md`, INTAKE JJ-20260815-08 (salon-os, observed
twice: `DATABASE_URL` unset made two DB-backed suites fail inside env parsing, `wf-build`
classified that as implementation breakage and burned a full repair round on correct code).
Registered in `spec/doctrine/scaffold-ledger.md` as a `gate`-kind mechanism.
