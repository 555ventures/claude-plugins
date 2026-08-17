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

## Sanctioned-red reconciliation

The resolved gate command is always executed through `suite-baseline.js --gate` (or
`--gate-file` when the resolved command carries a `"` or `$`), which subtracts the sanctioned
always-red baseline pins by name on failure. A red gate exit therefore means genuinely new
failures — or a non-test failure passed through — and sanctioned-only reds exit 0, recorded as
`sanctionedReds=<K>` in the review manifest so a green-by-subtraction gate is visibly different
from a plainly green one. The reconciliation is a derivation of the sole failing-set differ; no
session, prompt, or reviewer re-adjudicates a red gate against the baseline by hand.

The wrap happens at one seam — `build.md` Phase 0 step 3, after `{testDirs}` resolves to the
glob form — which reaches build's initial and final gates and the workflow wave gates through
`args.gate.command`. `review.md` states the wrap in its own gate-leg text (and in its
fix→re-review re-run) rather than inheriting it by citation, because review is a separate
session whose citation of build's step 3 is scoped to the glob substitution alone. `testCommand`
is never wrapped for the red-check's per-file probe or any other expected-red observation path:
those must see raw reds. The one `testCommand` consumer that IS wrapped is review's `at-risk`
leg — an adjudication consumer whose entire purpose is sanctioned-set subtraction, never an
expected-red probe — so every gate site in the pipeline (build's gates, the workflow wave gates,
review's gate leg, review's at-risk leg) adjudicates against the baseline by that one derivation.
A red at-risk leg therefore means residual failures outside the sanctioned set, and its one
mechanical hard finding cites exactly the wrapper's `NEW-FAILING` lines; the per-review hand
waive of a sanctioned at-risk red is retired.

**Green-by-subtraction is always visibly qualified.** A leg that reached green only by
subtraction records `sanctionedReds=<K>` in its manifest `observed`, `verdict.js` derives
`CLEAN-with-qualifier` rather than plain `CLEAN` whenever a green `gate` or `at-risk` row
carries that suffix, and the `--ledger` legs row carries the count as a conditional third key
(`{leg, exit, sanctionedReds}`; every suffix-free row stays the byte-identical two-key shape).
That durable encoding is what makes the retire falsifier derivable from `.claude/spec-runs.jsonl`
alone — a gate or at-risk leg green with `sanctionedReds>0` while the same iteration's suite leg
reports `newFailing>0` — instead of dying with the console scrollback.

The baseline file is thereby a blocking-gate trust surface: its edits ride only a pin-closing
spec's File Plan or the `--update` remedy after an adjudicated drift finding, and review's
out-of-plan hard finding on the file is the enforcement. Scoping the pipeline gate via
`{testDirs}` buys speed and relevance, never pin-freedom — every pin-closing spec modifies a
pre-existing top-level test file, so subtraction, not scoping, is what keeps a gate honest.

**The wrapper fails closed on absence of evidence.** Subtraction can only ever turn a red green
by name-level proof. A child that exits non-zero with a parseable trailer is subtracted; one
that exits non-zero with no trailer passes its real exit code through; and one that dies with
**no exit code at all** — killed by a signal, failed to spawn, or overflowing the child-output
buffer — exits 1 naming the cause, never 0. Both readers of the `__SUITE_BASELINE__` sentinel
(the gate agent's prompt and review's `sanctionedReds` capture) read only the **final** sentinel
line, since the wrapper prints its own last and any earlier occurrence is child output quoted
inside the run.

Provenance: `specs/20260816/01-gate-baseline-reconcile.md`, INTAKE JJ-20260816-03 — a red gate
on the 2026-08-15 review of `specs/20260815/01` named 21 of 22 baseline-sanctioned pins and the
session verified them by hand and overrode the red, the third recurrence of judgment substituting
for derivation at a gate site. The fail-closed and sentinel-anchoring clauses were added at that
spec's own review (2026-08-17) after execution showed the first implementation reporting green
for a child killed by a signal, and for a genuinely failing child whose output exceeded the
default buffer. The at-risk consumer, the `CLEAN-with-qualifier` derivation, and the ledger
encoding come from `specs/20260816/02-sanctioned-red-closure.md` (run `wf_2222584b-9a8` filed the
intake row after four consecutive full-scope reviews spent a hand waive on a sanctioned at-risk
red). Registered in `spec/doctrine/scaffold-ledger.md` as a `gate`-kind mechanism.
