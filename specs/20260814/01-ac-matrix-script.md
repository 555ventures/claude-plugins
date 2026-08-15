---
date: 2026-08-14
status: implementing
diff_base: 009b5addecf6129b7ec892820a80e64cf52cfb15
open_markers: 0
risk: T3
area: review-integrity
design: false
breaking: false
depends_on: []
depended_on_by: ["specs/20260814/02-doctor-mergeback-fidelity-mechanics.md", "specs/20260814/03-suite-baseline.md"]
brief: 06
---

# ac-matrix.js — mechanize review's AC coverage + skip reconciliation legs

## Goal

The review verdict currently depends on two legs the model hand-executes from prose —
review.md Phase 0 step 5 (AC-line lint + AC↔test coverage matrix + `[oracle:]` handling) and
step 6 (skipped-test reconciliation + `[env:]` handling) — then feeds to `verdict.js` as if
they were mechanical. A hand-executed leg drifts per session and per model (the strict
downgrade shared.md § Rule Enforcement itself names). This spec extracts one sole-derivation
script, `spec/scripts/ac-matrix.js`, behind a `spec-paths` key; review.md's steps 5–6 shrink
to invocation lines; the manifest rows `verdict.js` reads become script output with
byte-identical observed formats. Done = the script's exec pins run green, the retagged
doctrine/test pins run green, and `verdict.js` derives identical words from script-written
manifests.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | CREATE `spec/scripts/ac-matrix.js` (dependency-free Node, repo script conventions: header comment with usage/incident/does-NOT-do/exit codes, hand-rolled `--flag value` parsing, `--json` machine output). Registered as `spec-paths ac-matrix`. It is the sole derivation of both the `ac-matrix` and `skip-reconcile` legs — never a second computation of the AC↔test join anywhere. | The audit's C1 fix class: one sole-derivation script, doctrine shrinks to an invocation line (verdict.js/scope-reconcile.js precedent). |
| D2 | Contract: `node ac-matrix.js --spec <path> --root <dir> --manifest <path> [--skips <file>] [--has-drift-script] [--json]`. It parses the spec's `## Acceptance Criteria` top-level `- ` bullets (HTML comments stripped, nothing outside the section) and the File Plan's `tests`-layer rows — identified via the Layer column, exposed by an **additive extension to `spec/scripts/lib/file-plan.js`** (the repo's sole File Plan parser deliberately discards Action/Layer today, refuter-verified; existing callers see no change — a second ad-hoc table walker or a `tests/`-path-prefix heuristic are both rejected: the first is the second-derivation class this spec exists to kill, the second breaks on hosts whose test files don't live under `tests/`); computes the step-5 lint/matrix and step-6 reconciliation; **appends its two JSONL rows to `--manifest` itself** (single writer for its legs — removes the hand-transcription step); prints findings linter-style (or `--json`). Exit 0 = no findings, 1 = findings emitted (the leg "executed with findings" semantic review.md already assigns), 2 = usage / unreadable spec / no AC section. | Closed input alphabet (paths + flags); the script owns everything mechanical; appending its own rows makes stale hand-copied observed strings structurally impossible. |
| D3 | Step-5 mechanics in the script, semantics unchanged from review.md at HEAD: a bullet whose leading bold token is not a full anchored match of `AC-\d{8}-\d{2}[a-z]?-\d+` → **malformed AC** hard finding; each well-formed AC-ID grepped as a literal across the File Plan's tests-row paths (glob rows resolved; a listed path that doesn't exist counts as zero hits and emits its own finding line naming the missing file); zero hits → **uncovered AC** hard finding unless the AC line carries `[oracle: <manifest leg>]` — then covered-by-declaration, counted in `oracle=<M>`, reported as a named warning; a declared oracle leg that is red or **absent in the manifest at invocation time** → hard finding (identical standing to uncovered). With `--has-drift-script`, the coverage-matrix portion is skipped (the host's driftScript owns coverage); the lint and step-6 mechanics run in both modes — exactly today's mode split. Manifest row: `{"leg":"ac-matrix","exit":<0|1>,"observed":"uncovered=<N> oracle=<M>"}`, byte-format-identical to today. | The regex, the mode split, and the `[oracle:]` semantics are locked doctrine (specs 20260813/02 D4, 20260813/06a's suffix-form regex) — this spec relocates the executor, never the rules. |
| D4 | Step-6 mechanics: `--skips <file>` is one runner-reported skipped/todo test name (or path) per line, extracted by the orchestrator from the gate run's output — names-in, counts-out is the script boundary. **Honesty note (refuter-corrected):** only the skip *count* regex is host-declared (`capabilities.skipReportPattern`, spec 20260813/10); no host-declared format exists for per-test *names* — name extraction is the orchestrator's per-host reading of runner output, exactly today's standing. Where names cannot be attributed, the orchestrator passes no `--skips`: the script's row reads `skipped=0 sanctioned=0` while the gate row still carries the true count, so `verdict.js` derives every such skip as **unsanctioned** — the conservative reading, never silent green — and review.md's residue states this degradation explicitly. Mapping per line: (a) AC-IDs embedded in the line itself; else (b) the File Plan test file whose content contains the line's test name → that file's AC-IDs; else unmapped. A skipped AC without `[env: VAR]` on its AC line → hard finding; with `[env:]` → sanctioned, warning naming the un-run environment; an unmapped skip → hard finding line naming the test ("skipped test with no AC mapping"). Manifest row: `{"leg":"skip-reconcile","exit":<0|1>,"observed":"skipped=<N> sanctioned=<M>"}` — N = input line count, M = env-sanctioned mapped skips; byte-format-identical to today (verdict.js `deriveTestsSkipped` parses it unchanged). No `--skips` file (or empty) → `skipped=0 sanctioned=0` — the honest-unavailability path is unchanged: a host with no declared skip format never produces a names file AND its gate leg's observed already carries `unavailable — host runner declares no skip format`, which verdict.js (spec 20260813/10 D4) turns into the qualifier word. | The orchestrator is the only party that can read arbitrary runner output; everything after the names is deterministic. Splitting there keeps `verdict.js` untouched (brief: out of scope) and the observed grammar stable. |
| D5 | review.md Phase 0 steps 5–6 shrink to invocation lines: run the gate leg to completion first (its skip counts and manifest row are inputs), extract skipped/todo names per the host's declared format into a temp file, then run `node "$(spec-paths ac-matrix)" --spec {spec path} --root {root} --manifest {manifestPath} [--skips <file>] [--has-drift-script]`; its findings ride the normal Phase 2 disposition flow. The algorithm prose (bullet-walking, grep joins, mapping rules) is deleted from review.md; what stays: the mode split sentence, the finding severities and the `[oracle:]`/`[env:]` consequence sentences (reviewer/user-facing semantics), the Drift gate section's carve-outs (which now cite the script as the matrix's executor), and the sequencing note that ac-matrix runs after the gate leg completes. `enforcedBy:` markers on the retained claims point at `spec/scripts/ac-matrix.js`. **Ownership-claim consistency (blind-spot):** the "grep matrix IS the drift gate / reviewer AC↔test check is the semantic backstop" claim exists in three copies — review.md's Drift gate, `spec/agents/reviewer.md:71-77`, and wf-review's `DRIFT_NOTE` (specs/20260810/10 D3 already reconciled them once); the shrink must keep all three true and byte-consistent (the matrix is still the drift gate — its executor moved), and `tests/consistency/drift-reconcile.test.js` + `tests/workflows/review-emphasis-coverage.test.js` are run as verification (no edit expected; a red run means the wording drifted — fix the wording, never the pin). | Doctrine keeps the *rules* (what a finding means); the script owns the *execution*. Deleting the algorithm is the point — two copies would drift, the incident class itself. |
| D6 | Test-pin retags (sanctioned test changes, red-check reads them as declared): `tests/review/ac-id-lint.test.js` lifts the AC-ID regex from `ac-matrix.js` source (the `full anchored match of \`…\`` sentence moves there; the test's execute-the-lifted-regex technique survives verbatim); `tests/verification-qualifier-durability.test.js`'s step-5 `[oracle:]` prose pins retarget to the surviving consequence sentences + a new exec assertion against the script; `tests/review/verdict-doctrine.test.js` needs no edit (its pins match leg names/flow sentences that survive — verified by running it against the drafted shrink before the batch closes). Every retag preserves the pin's substance; none is weakened. | The locked-retired-literal gotcha (pipeline rules § Gotchas): dense regex pins sit outside the File Plan unless enumerated at plan time — all 32 colliding pins were executed green at HEAD during planning. |
| D7 | New exec suite `tests/ac-matrix/ac-matrix.test.js` (scoped dir keeps the gate run pin-free) — synthetic host trees via `tmpdir()`/`runNode`, covering ACs 1–8 below, including the producer-chain terminal pin: a manifest written by `ac-matrix.js` fed to `verdict.js` derives the same word/`testsSkipped` as one hand-written in today's format. | The user-observable terminal of these legs is the verdict word — the chain pin verifies the whole path, not an intermediate hop. |
| D8 | Data-only output: `ac-matrix.js` emits findings + observed strings, never report rendering — `report-render.js` stays the sole render authority. 📌 auto-picked per the brief's stated default posture. | One render authority (shared § Console Output Style); the brief's open question 2, resolved by its own default. |
| D9 | Scaffold-ledger row for the script (ADVISORY-equivalent registration: promote condition — the leg rows in new review ledger entries come from script output, observable as zero hand-computed drift findings across two releases; retire — if review's Phase 0 is ever restructured to drop the legs). Claims-baseline re-stamp and plugin.json bump ride the same commit. Version bump target 6.73.0 (target, not a pin — concurrent sessions race semver). | Doctor check 13; repo review checks make missing ledger/baseline hunks hard findings. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/ac-matrix.js | CREATE | scripts | D1–D4: lint, coverage matrix, oracle/env handling, skip join, manifest append, `--json` |
| spec/bin/spec-paths | MODIFY | scripts | D1: `ac-matrix` key |
| spec/scripts/lib/file-plan.js | MODIFY | scripts | D2: additive Layer-column exposure (existing callers unchanged) |
| spec/commands/review.md | MODIFY | doctrine | D5: steps 5–6 → invocation + retained-semantics sentences; Drift gate cites the script; sequencing note (gate completes first) |
| spec/doctrine/scaffold-ledger.md | MODIFY | doctrine | D9 row; amend the skipped-test-reconciliation row (line ~34) — executor is now ac-matrix.js; any residual framing attributing the computation to the reviewer/orchestrator is updated (intent-level edit — refuter-verified no literal phrase to grep) |
| spec/doctrine/claims-baseline.json | MODIFY | doctrine | ratchet re-stamp for review.md's line-count delta (same commit) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D9 bump + changelog description |
| tests/ac-matrix/ac-matrix.test.js | CREATE | tests | AC-20260814-01-1 … AC-20260814-01-8 |
| tests/review/ac-id-lint.test.js | MODIFY | tests | AC-20260814-01-9 (D6 retag: lift regex from ac-matrix.js source, execute it) |
| tests/verification-qualifier-durability.test.js | MODIFY | tests | AC-20260814-01-10 (D6 retag: oracle pins onto surviving doctrine sentences + script) |

## Contracts

```
# spec/scripts/ac-matrix.js
node ac-matrix.js --spec <path> --root <dir> --manifest <path> [--skips <file>] [--has-drift-script] [--json]
# Exit codes: 0 = executed, no findings · 1 = executed, findings emitted · 2 = usage error,
#   unreadable spec, or no ## Acceptance Criteria section
# Appends to --manifest (JSONL, one row each, formats byte-identical to review.md at HEAD):
#   {"leg":"ac-matrix","exit":<0|1>,"observed":"uncovered=<N> oracle=<M>"}
#   {"leg":"skip-reconcile","exit":<0|1>,"observed":"skipped=<N> sanctioned=<M>"}
# --json prints: {"findings":[{"severity":"hard","class":"malformed-ac|uncovered-ac|oracle-red-or-absent|unsanctioned-skip|unmapped-skip|missing-test-file","ac":"<id|''>","detail":"<one line>"}],
#                "warnings":[…named oracle/env lines…],"observed":{"acMatrix":"…","skipReconcile":"…"}}
# AC-ID shape (the single authority; ac-id-lint.test.js lifts it from this source):
#   full anchored match of `AC-\d{8}-\d{2}[a-z]?-\d+`
# --skips file: one runner-reported skipped/todo test name or path per line (orchestrator-extracted)
# --has-drift-script: skip the coverage-matrix portion (host driftScript owns coverage); lint + skip
#   reconciliation still run
```

## Behavior

- Sequencing change to review.md Phase 0: today step 5 is "computed before the reviewer panel
  runs" with the gate launched in parallel; the script's oracle-vs-manifest check and the
  `--skips` input both need the gate leg finished, so the invocation line states: after the
  step-3 background legs complete, before step 8's manifest read. Net Phase 0 wall-clock is
  unchanged (the panel already waits on the gate).
- `[oracle:]` absent-leg semantics at invocation time are strict by construction: the script
  runs after all step-3 legs have appended, so "absent" is real (the declared oracle never
  ran), never a race artifact.
- Findings-producing legs never trigger step 8's hard stop — unchanged; the script's exit 1
  feeds Phase 2 dispositions exactly as the hand-computed legs' findings did.
- Glob rows in File Plan tests paths: `ac-matrix.js` owns the filesystem expansion — a
  directory walk under `--root` filtered through the existing `lib/glob-match.js` matcher
  per candidate (refuter-corrected: no existing helper expands globs from disk;
  `lib/file-plan.js`'s header explicitly leaves resolution to callers — this is named new
  logic in the script, never a third matcher implementation).

## Acceptance Criteria

- **AC-20260814-01-1**: WHEN the spec's AC section contains a bullet whose bold token is
  `**AC-2026-1**` THE SYSTEM SHALL emit a hard `malformed-ac` finding and exit 1 (e.g. input
  bullet `- **AC-2026-1**: WHEN …` → finding class `malformed-ac`, observed still counts the
  well-formed ACs only) → tests/ac-matrix/ac-matrix.test.js
- **AC-20260814-01-2**: WHEN a well-formed AC-ID has zero hits across the File Plan tests
  rows and no `[oracle:]` tag THE SYSTEM SHALL emit a hard `uncovered-ac` finding and write
  observed `uncovered=1 oracle=0` (literal fixture: one AC, one test file without the ID) →
  tests/ac-matrix/ac-matrix.test.js
- **AC-20260814-01-3**: WHEN an AC carries `[oracle: gate]` and the manifest's gate row has
  `exit:0` THE SYSTEM SHALL exclude it from uncovered, count `oracle=1`, and emit a named
  warning (not a finding); WHEN the gate row has non-zero exit or no gate row exists THE
  SYSTEM SHALL emit a hard `oracle-red-or-absent` finding → tests/ac-matrix/ac-matrix.test.js
- **AC-20260814-01-4**: WHEN `--skips` lists a test name containing `AC-20260814-01-4` whose
  AC line carries `[env: TEST_DB]` THE SYSTEM SHALL count it sanctioned (observed
  `skipped=1 sanctioned=1`) and warn naming `TEST_DB`; WHEN the AC has no `[env:]` tag THE
  SYSTEM SHALL emit a hard `unsanctioned-skip` finding (observed `skipped=1 sanctioned=0`) →
  tests/ac-matrix/ac-matrix.test.js
- **AC-20260814-01-5**: WHEN `--skips` lists a name matching no AC-ID and no File Plan test
  file THE SYSTEM SHALL emit a hard `unmapped-skip` finding naming the test →
  tests/ac-matrix/ac-matrix.test.js
- **AC-20260814-01-6**: WHEN the script completes THE SYSTEM SHALL have appended exactly two
  JSONL rows (`ac-matrix`, `skip-reconcile`) to `--manifest`, and `verdict.js` fed that
  manifest SHALL CONTINUE TO derive the same `testsSkipped` object and verdict word as from a
  hand-written manifest with identical observed strings (producer-chain pin: e.g. gate
  `skips=3 todos=0` + script-written `skipped=3 sanctioned=2` → `{"total":3,"sanctioned":2,"unsanctioned":1}`) →
  tests/ac-matrix/ac-matrix.test.js
- **AC-20260814-01-7**: WHEN `--has-drift-script` is passed THE SYSTEM SHALL emit no
  `uncovered-ac` findings (coverage owned by the host driftScript) while still linting AC
  shape and reconciling skips → tests/ac-matrix/ac-matrix.test.js
- **AC-20260814-01-8**: WHEN invoked without `--spec`, with an unreadable spec, or against a
  spec with no `## Acceptance Criteria` section THE SYSTEM SHALL exit 2 with a stderr line
  naming the remedy; and WHEN `spec-paths ac-matrix` runs THE SYSTEM SHALL print the
  script's existing path (the key-registration carrier — red if the key is forgotten) →
  tests/ac-matrix/ac-matrix.test.js
- **AC-20260814-01-9**: WHEN review.md Phase 0 is read THE SYSTEM SHALL invoke
  `spec-paths ac-matrix` for steps 5–6 and SHALL NOT contain the hand-execution algorithm
  (the bullet-walk/grep-join instructions); the AC-ID regex authority lives in
  `ac-matrix.js` source and the lint SHALL CONTINUE TO admit letter-suffixed successor ids
  (`AC-20260813-06a-1` matches; retagged lift-and-execute pin) →
  tests/review/ac-id-lint.test.js
- **AC-20260814-01-10**: WHEN review.md is read THE SYSTEM SHALL CONTINUE TO state the
  `[oracle:]` consequence semantics (covered-by-declaration, named warning, red/absent = hard)
  in step 5's residue and in BOTH Drift gate branches (retagged pins) →
  tests/verification-qualifier-durability.test.js

## Assumptions (escalation triggers)

- A1: All 32 colliding test pins (ac-id-lint, ci-gate-parity, skeleton-subset-binding,
  verification-qualifier-durability, conflict-fixes) run green at HEAD — executed during
  planning (`node --test`, 32 pass / 0 fail, 2026-08-14). **if false at build time:** a
  concurrent spec landed on the same surfaces — re-run the sweep, fold collisions into D6
  before any doctrine edit.
- A1b (negative-claim micro-check, executed 2026-08-14): removing the `full anchored match
  of \`…\`` sentence from a copy of review.md makes ac-id-lint's lift regex fail to match
  (observed: `false`) — so the D6 retag (lift from `ac-matrix.js` source) is mandatory, not
  optional; scratch file deleted, tree clean.
- A2: `verdict.js` needs no change — it parses observed strings whose grammar this spec
  keeps byte-identical (brief fences verdict.js derivation out of scope). **if false:** STOP;
  the observed grammar drifted — that is a spec defect, never a verdict.js patch.
- A3: Spec 20260813/10 (host-capabilities) is `implementing` at HEAD with its build already
  committed (6.72.0), so review.md at HEAD carries its D3 wording; its review may still
  dispatch fixes into review.md. **if false / merge collision:** rebase the doctrine batch;
  the shrink targets steps 5–6, spec 10's edits target step 3 — disjoint hunks expected.
- A4: `tests/review/verdict-doctrine.test.js` pins survive the shrink unedited (its regexes
  match leg names and flow sentences the invocation lines retain — checked against the
  drafted wording during planning). **if false:** retag under D6's sanction in the same
  batch; never weaken.
- A5: The observed-format contract (`uncovered=<N> oracle=<M>`, `skipped=<N> sanctioned=<M>`)
  is pinned by five verdict.js suites (`tests/review/verdict.test.js`,
  `tests/verdict-gatered-no-workflow.test.js`, `tests/capabilities/verdict-qualifier.test.js`,
  `tests/clean-row-survivor-consistency.test.js`, `tests/review/smell-lens.test.js`) — none
  needs an edit because the script emits byte-identical strings; they run as the format
  regression net. **if false (any goes red):** the script's emit is wrong — fix the script,
  never the pins.
- A6: The orchestrator can extract skipped-test names for this repo's runner (node:test
  prints `ℹ skipped N` counts; names appear per-test in the TAP-ish output) — and for hosts
  that can't, the no-`--skips` path plus the gate leg's `unavailable` observed carries the
  honesty end-to-end (spec 20260813/10 D4's qualifier). **if false:** the leg degrades to
  exactly today's behavior — never assumed-zero with a green face.

## Rationale

T3: the script becomes a named sole-derivation input to `verdict.js` — the review verdict's
substrate — squarely the tier rubric's contract-surface trigger; this repo's pipeline rules
already list its siblings (`verdict.js`, `scope-reconcile.js`) as T3 surfaces.

Why names-in/counts-out (D4) instead of parsing runner output in the script: runner output
formats are precisely the thing spec 20260813/10 made host-declared because no universal
format exists; a script that parsed them would re-import the C2 assumption the capabilities
block just removed. The orchestrator's residue (extract names per the declared format) is
honest per-host work; everything downstream of the names is deterministic and now scripted.
Why the script appends manifest rows itself (D2): the hand-transcription of observed strings
was itself a drift channel; a single writer makes stale rows unrepresentable — same reasoning
as review.md's fresh-mktemp-per-iteration rule. Why steps 5–6 keep their consequence
sentences (D5): reviewers and users still need the *meaning* of a finding in doctrine; only
the *algorithm* had the drift problem. Alternatives rejected: folding ac-matrix into
`verdict.js` (verdict must stay evidence-reader only — its header's "does NOT decide whether
to run a leg" contract); a `--gate-output` parsing mode (re-imports C2, above); rendering the
matrix in the script (D8 — report-render.js is the sole render authority; the brief's default).
Fragile spots to watch during build: the ac-id-lint retag must keep its execute-the-regex
technique (a source-text pin would defeat the test's own incident header); review.md's
step-numbering cross-references (steps 7–8 cite "step 5"/"step 6") must be re-checked after
the shrink.

Adversarial-check adjudications (2026-08-14, two blind refuters): ACCEPTED and folded — the
tests-row identification gap (no parser exposes the Layer column; D2 now mandates the
additive `lib/file-plan.js` extension, with the path-prefix heuristic and a second table
walker both rejected by name); the false glob-resolution claim (no helper expands globs from
disk — the script owns filesystem expansion through `lib/glob-match.js`, named as new
logic); the phantom "host-declared name format" (only the skip *count* regex is declared —
D4 now states name extraction is orchestrator judgment and pins the conservative
no-`--skips` degradation: undeclared names derive as unsanctioned, never silent green); the
non-existent "orchestrator computes" grep literal (scaffold-ledger edit reworded to intent).
Refuter-verified clean: the producer-chain claim (executed against real `verdict.js` —
`{"total":3,"sanctioned":2,"unsanctioned":1}` observed), node:test's per-test `# SKIP` name
lines (A6 executed), fresh-manifest-per-iteration compatibility with the self-appending
design, the D6 retag list's completeness (corpus grep found no further pins), and the
three-copy ownership-claim consistency.

## Canonical Delta

None — plugin doctrine edits are the delta itself (repo precedent).
