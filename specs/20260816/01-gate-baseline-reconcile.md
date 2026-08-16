---
date: 2026-08-16
status: hardened
open_markers: 0
risk: T3                 # touches verdict.js and suite-baseline.js (sole-derivation surfaces) + the gate-loop fragment (codegen seam)
area: spec-pipeline
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
---

# Gate/baseline reconciliation — sanctioned reds subtracted deterministically

## Goal

The scoped gate (`gateCommand` with `{testDirs}` resolved) exits red whenever a spec's File
Plan pulls in test files carrying the repo's sanctioned always-red intake pins — 21 of 22
baseline pins red-gated the 2026-08-15 review of specs/20260815/01 for reasons unrelated to
the spec, and the session overrode the red by hand (the third recurrence of the class; see
also the 20260813 build wave-merge incident). Done means: a gate run whose only failures are
names in `.claude/suite-baseline.json` exits 0 **by derivation** — the reconciliation is
computed by the one script that already owns failing-set comparison, at every gate site
(review gate leg, build initial/final gates, wf-build/wf-design in-workflow wave gates) —
and a session never again decides whether a red gate "really" failed.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `suite-baseline.js` gains a fourth mode: `--gate "<command>"` (and `--gate-file <path>` reading the command verbatim from a file, for commands containing `"` or `$`). It runs the command via the existing `runSuite` helper (bash -c, `NODE_TEST_CONTEXT` stripped, cwd `--root`), prints the child's combined output verbatim, and on non-zero child exit parses the `✖ failing tests:` trailer with the existing `extractFailing` and subtracts the baseline set. | The script's own header forbids a second failing-set differ anywhere; extending the sole derivation is the only sanctioned home. Rejected: a review-only step-8 prose rule (leaves build unfixed, moves the override from judgment into prose — JJ ruling 2026-08-16); relocating pins (a spec that touches a pin file pulls them right back). |
| D2 | Exit semantics of `--gate`: child exit 0 → exit 0, no sentinel, output passed through untouched. Child non-zero + parseable trailer → subtract; residual empty → exit 0; residual non-empty → print one `NEW-FAILING <file> :: <name>` line per residual row and exit 1. Child non-zero + NO parseable trailer → print `suite-baseline: no failing-test trailer — exit <N> passed through` and exit with the child's exit code. Corrupt baseline JSON → exit 2 (existing path). Absent baseline file → empty sanctioned set (existing `--check` semantics), so every parsed failure is residual. | Passthrough on unparseable output keeps the wrapper honest for non-test failures (`build-workflows --check`) and non-node:test hosts — the wrapper can only ever turn a red green by name-level proof, never by absence of evidence. Absent-baseline = identity behavior makes the wrapper a no-op for pin-free hosts. |
| D3 | Subtraction is asymmetric by design: `--gate` computes only the residual (observed minus baseline, flaky rows exempt exactly as `--check`'s `newFailing`), never `fixedNotRemoved`. | A scoped run doesn't execute most baseline files, so absence proves nothing; whole-suite drift stays `--check`'s job (review's suite leg, build's D10 pre-image check) — one question per mode. |
| D4 | On every non-zero child run with a parseable trailer, `--gate` prints one machine sentinel line after the passthrough output: `__SUITE_BASELINE__ failing=<F> sanctioned=<S> residual=<R>` (F = parsed failing count, S = baseline-matched incl. flaky, R = F−S). | Script conventions: machine contracts are sentinel lines; review's gate leg and the wf gate agent both need a greppable verdict that survives inside arbitrary runner output. |
| D5 | The wrap happens at the single gate-resolution seam: build.md Phase 0 step 3, after `{testDirs}` resolves to the glob form, the resolved `gateCommand` is wrapped as `node "$(spec-paths suite-baseline)" --gate "<resolved command>" --root {root}` (or `--gate-file` when the resolved command contains `"` or `$`). review.md's gate leg does NOT inherit this by citation — review is a separate session whose citation of build.md step 3 is scoped to the `{testDirs}`→glob substitution only (the JJ-20260815-04 incident was exactly a review.md citation asserting a rule build.md didn't state) — so review.md's own gate-leg text (Phase 0 step 3 AND the Phase 2 fix→re-review re-run of the gate leg) states the wrap explicitly. `testCommand` — the red-check's per-file runner and every other `testCommand` consumer — is NEVER wrapped. | One seam fixes review, build Phase 0/Phase 4, and the workflow wave gates at once (the orchestrator passes the already-wrapped command as `args.gate.command`; workflow bodies are untouched). Wrapping `testCommand` would let sanctioned subtraction blur the red-check's expected-red observations. |
| D6 | review.md's gate leg `observed` format extends to `skips=<N> todos=<M> sanctionedReds=<K>` — the suffix appended only when the sentinel line reports `sanctioned=<S>` with S>0 (K=S). `verdict.js`'s `deriveTestsSkipped` regex tolerates the optional suffix (`^skips=(\d+) todos=(\d+)(?: sanctionedReds=\d+)?$`); the suffix is never summed into `testsSkipped`. Ledger row shape is otherwise unchanged. | A gate that went green by subtraction must say so in the evidence manifest — silent subtraction is the same dishonesty as the hand-override, mechanized. All existing manifest fixtures feed the old two-field form (grepped 2026-08-16: every `observed: 'skips=` in tests/ is suffix-free), so the tolerant regex reddens nothing. |
| D7 | The gate-loop fragment's gate-agent prompt gains one sentence: `If the output contains a __SUITE_BASELINE__ line with residual=0, every ✖ failure it counted is a sanctioned baseline pin — do not list any of them as failures.` The self-contradiction guard itself is unchanged. | Without it the agent may enumerate sanctioned ✖ lines, and the (deliberately unweakened) pass-with-failures guard would flip a true green to red — wasteful repair rounds, though never a false green. The sentence contains no per-workflow token, so the spliced region stays byte-identical in both twins (twin-parity pin). |
| D8 | New scaffold-ledger row, kind **gate**: "Gate/baseline reconciliation (`suite-baseline.js --gate`)", justified by the 2026-08-15 review override (third recurrence). Promote/retire: retire if the intake pin baseline is empty for two consecutive quarters (the wrapper is then identity); re-examine if any ledger row ever shows a gate leg green with `sanctionedReds>0` while the same iteration's suite leg reports `newFailing>0` (a subtraction the whole-suite truth contradicts). | Every new mechanism ships with its falsifier named. |
| D9 | Version bump target: spec plugin 6.81.0 (target, not a pin — build bumps to the next free version per Gotchas), description line = the changelog sentence. | House rule. |

## File Plan

<!-- Machine-consumed: /spec:build parses this table into workflow batches. -->

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/suite-baseline.js | MODIFY | scripts | D1–D4: `--gate`/`--gate-file` mode, sentinel line, passthrough semantics; header usage/exit-codes updated |
| spec/scripts/verdict.js | MODIFY | scripts | D6: `deriveTestsSkipped` regex tolerates optional ` sanctionedReds=<K>` suffix; header incident note |
| spec/commands/build.md | MODIFY | doctrine | D5: Phase 0 step 3 wraps the resolved gateCommand; explicit "testCommand is never wrapped" clause beside it |
| spec/commands/review.md | MODIFY | doctrine | D5+D6: gate leg (Phase 0 step 3) and the fix→re-review gate re-run both state the `--gate` wrap of the resolved command explicitly (never by citation); capture `sanctionedReds` from the `__SUITE_BASELINE__` sentinel into `observed`; document the green-by-subtraction case |
| spec/workflows/fragments/gate-loop.js.frag | MODIFY | workflows | D7: one prompt sentence teaching the sentinel (then regenerate — orchestrator duty below) |
| spec/doctrine/scaffold-ledger.md | MODIFY | doctrine | D8: new gate row with promote/retire condition |
| spec/doctrine/claims-baseline.json | MODIFY | doctrine | claims ratchet regeneration — one whole-corpus run at batch end (claims-lint.js, per its header) covers the build.md/review.md/scaffold-ledger.md line-count changes together |
| spec/.claude-plugin/plugin.json | MODIFY | other | D9: bump to 6.81.0 (or next free), description = changelog |
| tests/suite-baseline/suite-baseline.test.js | MODIFY | tests | AC-20260816-01-1, AC-20260816-01-2, AC-20260816-01-3, AC-20260816-01-4, AC-20260816-01-5, AC-20260816-01-6 |
| tests/suite-baseline/doctrine.test.js | MODIFY | tests | AC-20260816-01-9, AC-20260816-01-10, AC-20260816-01-11 |
| tests/review/verdict.test.js | MODIFY | tests | AC-20260816-01-7 (tag existing covering test), AC-20260816-01-8, AC-20260816-01-12 |

Orchestrator duty (outside the table, per File Plan row grammar): after the fragment edit,
run `npm run build:workflows` and commit source + regenerated `wf-build.js`/`wf-design.js`
together; `node spec/scripts/build-workflows.js --check` before declaring the batch done.

## Contracts

```text
# suite-baseline.js — new mode (additive; --check/--update/--snapshot unchanged)
suite-baseline.js --gate "<command>" --root <dir>
suite-baseline.js --gate-file <path> --root <dir>     # command read verbatim from <path>
#   --gate and --gate-file are mutually exclusive with each other and with the other modes.
# Child output: passed through verbatim (stdout+stderr combined, printed to stdout).
# Sentinel (only on non-zero child exit with parseable trailer):
__SUITE_BASELINE__ failing=<F> sanctioned=<S> residual=<R>
# Residual rows (only when R>0), same vocabulary as --check:
NEW-FAILING <file> :: <name>
# Exit codes (mode --gate): 0 = child green OR residual empty · 1 = residual non-empty ·
#   2 = usage / corrupt baseline · <child's exit> = child failed with no parseable trailer
#   (passthrough, note line printed: "suite-baseline: no failing-test trailer — exit <N> passed through")

# review.md gate leg observed grammar (extended):
observed: "skips=<N> todos=<M>"                       # unchanged base form
observed: "skips=<N> todos=<M> sanctionedReds=<K>"    # when sentinel reports sanctioned=<K>, K>0

# verdict.js deriveTestsSkipped gate-row regex (was anchored two-field):
/^skips=(\d+) todos=(\d+)(?: sanctionedReds=\d+)?$/

# gate-loop fragment — added prompt sentence (exact text, D7):
If the output contains a __SUITE_BASELINE__ line with residual=0, every ✖ failure it counted
is a sanctioned baseline pin — do not list any of them as failures.

# build.md Phase 0 step 3 — wrapped resolution (shape):
node "$(spec-paths suite-baseline)" --gate "<resolved gateCommand>" --root {root}
# when the resolved command contains a double quote or $: write it verbatim to a mktemp file
# and use --gate-file <path> instead. testCommand is never wrapped.
```

## Behavior

- Green gate: wrapper is invisible — child exit 0 propagates, output untouched, no sentinel.
- Red gate, all failures sanctioned: output passes through (review still greps `ℹ skipped (N)`
  from it), sentinel reports `residual=0`, wrapper exits 0. Review records the gate leg
  `exit:0` with `sanctionedReds=<K>` in `observed`; verdict.js derives CLEAN-family exactly as
  for any green gate. The wf gate agent sees the pass sentinel (`__GATE_PASS__` prints because
  the wrapper exited 0) plus the D7 sentence, and reports pass with no failures.
- Red gate, mixed: sentinel reports `residual>0`, `NEW-FAILING` lines name exactly the
  non-sanctioned failures, wrapper exits 1 — review hard-stops / build repairs on precisely
  the real failures. The repair loop's file-routing reads the runner's own failure output as
  today; the NEW-FAILING lines give the gate agent an authoritative shortlist.
- Red for a non-test reason (`build-workflows --check` fails, compile error, non-node:test
  runner): no trailer → child's exit passes through with the note line — behavior identical
  to today's unwrapped gate.
- The wrapper never runs a second suite: one child invocation, one parse — gate wall-clock is
  unchanged apart from process spawn overhead.
- Worst-case D7 failure (agent lists sanctioned failures anyway): the self-contradiction
  guard flips pass to false and the loop burns repair rounds on unfixable pins — wasteful,
  never a false green; the deterministic exit stays authoritative at review/build-orchestrator
  sites. Accepted residual risk, named here deliberately.

## Acceptance Criteria

<!-- Test authors derive tests from this spec alone. -->

- **AC-20260816-01-1**: WHEN `--gate` runs a command that exits 0 THE SYSTEM SHALL exit 0,
  print the child's output unchanged, and print no `__SUITE_BASELINE__` sentinel (e.g.
  `--gate "echo ok; true"` → exit 0, stdout contains `ok`, no sentinel) → new test in
  tests/suite-baseline/suite-baseline.test.js
- **AC-20260816-01-2**: WHEN the wrapped command exits non-zero and every trailer-parsed
  failing test matches a baseline row (flaky rows counting as matched) THE SYSTEM SHALL print
  `__SUITE_BASELINE__ failing=<F> sanctioned=<F> residual=0` and exit 0 (synthetic host: a
  baseline with the one failing test's `{file, name}` → exit 0, sentinel `residual=0`) → new
  test in tests/suite-baseline/suite-baseline.test.js
- **AC-20260816-01-3**: WHEN the wrapped command exits non-zero and at least one parsed
  failing test is NOT in the baseline THE SYSTEM SHALL print one `NEW-FAILING <file> :: <name>`
  line per residual row, a sentinel with `residual=<R>` where R≥1, and exit 1 (synthetic host:
  two failing tests, baseline holds one → exactly one NEW-FAILING line, exit 1) → new test in
  tests/suite-baseline/suite-baseline.test.js
- **AC-20260816-01-4**: WHEN the wrapped command exits non-zero with no parseable
  `✖ failing tests:` trailer THE SYSTEM SHALL print
  `suite-baseline: no failing-test trailer — exit <N> passed through` and exit with the
  child's own code (e.g. `--gate "exit 7"` → exit 7) → new test in
  tests/suite-baseline/suite-baseline.test.js
- **AC-20260816-01-5**: WHEN `.claude/suite-baseline.json` is absent THE SYSTEM SHALL treat
  the sanctioned set as empty so every parsed failure is residual (one failing test, no
  baseline file → exit 1, `sanctioned=0`) — pin-free hosts behave exactly as an unwrapped
  gate → new test in tests/suite-baseline/suite-baseline.test.js
- **AC-20260816-01-6**: WHEN `--gate` is invoked with `NODE_TEST_CONTEXT` set in the
  environment THE SYSTEM SHALL CONTINUE TO strip it before spawning the child (the child's
  `node --test` executes files rather than silently skipping them; pin via the existing
  `runSuite` reuse — the mode's test invokes through `runNode` from inside the suite and
  asserts the child actually ran) → new test in tests/suite-baseline/suite-baseline.test.js
- **AC-20260816-01-7**: WHEN verdict.js `--ledger` reads a gate row observed
  `skips=2 todos=1` THE SYSTEM SHALL CONTINUE TO derive `testsSkipped.total = 3` — tag the
  existing covering test (AC-20260813-02-7's) with this AC-ID in
  tests/review/verdict.test.js, never duplicate it
- **AC-20260816-01-8**: WHEN verdict.js `--ledger` reads a gate row observed
  `skips=2 todos=1 sanctionedReds=21` THE SYSTEM SHALL derive `testsSkipped.total = 3`
  identically — the suffix is tolerated and never summed (`skips=2 todos=1 sanctionedReds=21`
  → total 3, not 24) → new test in tests/review/verdict.test.js
- **AC-20260816-01-9**: WHEN build.md Phase 0 step 3 is read THE SYSTEM SHALL state that the
  resolved gateCommand is wrapped via `spec-paths suite-baseline` `--gate` (with the
  `--gate-file` escape for `"`/`$`) AND that `testCommand` is never wrapped → doctrine regex
  pin in tests/suite-baseline/doctrine.test.js
- **AC-20260816-01-10**: WHEN review.md's gate leg is read THE SYSTEM SHALL state, in the gate
  leg's own invocation text (never by citation of build.md), that the resolved command runs
  wrapped via `suite-baseline` `--gate`, AND SHALL require capturing `sanctionedReds` from the
  `__SUITE_BASELINE__` sentinel into the gate row's `observed` when sanctioned>0, AND the
  fix→re-review gate re-run SHALL name the same wrapped invocation → doctrine regex pin in
  tests/suite-baseline/doctrine.test.js
- **AC-20260816-01-11**: WHEN the gate-loop fragment is read THE SYSTEM SHALL contain the D7
  sentence naming `__SUITE_BASELINE__` and `residual=0`, with no per-workflow substitution
  token inside it (twin splice stays byte-identical) → doctrine regex pin in
  tests/suite-baseline/doctrine.test.js
- **AC-20260816-01-12**: WHEN a review evidence manifest's gate row is
  `{exit:0, observed:"skips=0 todos=0 sanctionedReds=21"}` and all other legs are green with
  a clean workflow return THE SYSTEM SHALL derive a CLEAN-family word, never GATE_RED — the
  terminal observable of this spec's chain, executed through the real verdict.js binary on a
  produced manifest fixture (`runNode` verdict.js → stdout line 1 begins `CLEAN`) → new test
  in tests/review/verdict.test.js

## Assumptions (escalation triggers)

- A1: A scoped `node --test` red run emits the same parseable `✖ failing tests:` trailer as a
  full-suite run, alongside the `ℹ skipped (N)` line review's skip capture needs. **Executed
  2026-08-16:** `node --test tests/scoped-gate-behavior-collision.test.js` → exit 1, trailer
  `✖ failing tests:` at output line 11 with `test at <file>:56:1` / `✖ <name> (…)` pairs,
  `ℹ skipped 0` present; and the 2026-08-15 review's 21-failure scoped output parsed to names
  by this same trailer. — **if false** for some future runner: D2's passthrough keeps the gate
  honestly red; never a false green.
- A2: Every existing manifest fixture in tests/ feeds the suffix-free `skips=N todos=M` form
  (grepped 2026-08-16 across 8 test files — all literal `skips=0/2/3 todos=0/1`), so D6's
  tolerant regex reddens no existing pin. — **if false:** retag the colliding pin in place
  with this spec's AC-ID per Gotchas, never weaken.
- A3: This host's resolved gateCommand contains single quotes only (`node --test
  'tests/…'`), so the doctrine's double-quoted `--gate "<cmd>"` form is safe here;
  `--gate-file` exists for hosts whose gate carries `"` or `$`. — **if false** (quoting still
  breaks): worker returns blocked; the fallback is doctrine mandating `--gate-file`
  unconditionally.
- A4: wf-build/wf-design receive the gate as an already-resolved `args.gate.command` string
  from the orchestrator (verified in wf-build.body.js's args comment), so wrapping at the
  resolution seam reaches the wave gates with zero workflow-body changes; the fragment edit
  is prompt-text only. — **if false:** STOP, consult the retainer — the seam assumption is
  the spec's spine.
- A5: `spec-paths suite-baseline` key already exists (verified — review.md's suite leg uses
  it); no new spec-paths key, no grounding-contract edit, no contract-hash change. — **if
  false:** escalate per build.md's contract-hash trigger.

## Rationale

The class has now bitten three times: the 20260813 build wave-merge (waves red-gated on the
whole scoped suite), the 20260814 escape context (pins invisible to scoped gates,
JJ-20260815-03), and the 2026-08-15 review of specs/20260815/01, where the session verified
all 21 red names against the baseline by hand and re-scoped the gate — exactly the
judgment-for-derivation substitution the hard-stop exists to forbid. JJ ruled 2026-08-16 for
the wrap-everywhere shape over a review-only prose rule (leaves build broken, mechanizes the
override instead of deleting it) and over pin relocation (any spec touching a pin file —
including every red-carrier intake spec — re-imports the pins).

The wrapper lives in suite-baseline.js because its header makes it the sole failing-set
differ; a separate gate-wrapper script would be the second differ that header forbids. The
sentinel + `sanctionedReds` observed suffix keep the manifest honest: a green-by-subtraction
gate is visibly different from a plainly green one, and D8's retire clause names the
cross-check (suite leg contradicting a subtraction) that would falsify the mechanism.
Deliberately NOT done: `fixedNotRemoved` detection in `--gate` (scoped absence proves
nothing, D3); wrapping `testCommand` (would blur the red-check's expected-red observations,
D5); any change to `REVIEW_BLOCKING`, the hard-stop rule, or the self-contradiction guard —
the gate stays absolute; what changes is that its exit code now tells the truth about
sanctioned pins. Fragile spots to watch at build: the D6 regex stays anchored (`$` after the
optional group) so garbage suffixes still fail closed to total=0; the fragment edit must not
introduce a `__WF_NAME__` token (twin-parity pin AC-20260813-05-7).

At-risk-suite sweep (JJ-20260815-03's shape, run at plan time 2026-08-16): grepped tests/
for pins on the edited surfaces outside this File Plan. `tests/testdirs-glob-resolution.test.js`
pins a ±400/1200-char window around build.md's first `{testDirs}` requiring `/glob/i` — the D5
wrap sentence appends inside that paragraph without moving the glob sentence, so it stays
green; `tests/review-runtime-inert-falsifier.test.js` pins the smoke bullet (untouched);
every `observed: 'skips=` fixture is suffix-free (A2); no fragment-prompt text is pinned
beyond `${gateCmd}` and the two-line probe shape, both untouched.

Adversarial check (2 blind refuters, 2026-08-16): one HIGH finding, fixed — review.md's gate
leg would never actually have been wrapped, because review re-derives the gate in its own
session and its build.md citation is scoped to the glob substitution only (the JJ-20260815-04
incident shape); D5, the review.md File Plan row, and AC-10 now require the wrap stated in
review.md's own gate-leg and fix→re-review text. Two informational notes fixed in place (A2
fixture-file count 9→8; claims-baseline row wording). Both refuters' executed checks upheld
the mechanics: `--gate` double-quote wrapping survives the nested single-quoted glob through
`bash -c` → `spawnSync`; the tolerant verdict regex fails closed on garbage suffixes; the
`__GATE_PASS__` probe fires mechanically off the wrapper's exit 0; an injected activation
probe (gate-activation-probe doctrine) survives subtraction because it is never in the
baseline. No collision-closure run at lock: no Decision retires or narrows a doctrine
literal — every doctrine edit is additive. No follow-up roadmap brief: the two adjacent open
items (fidelity-check NUL-byte intake fix; scaffold-ledger retirement audit) are host intake
work already tracked outside this spec, not plannable features this session discovered.

Regression pinning: AC-6 and AC-7 carry `SHALL CONTINUE TO` for the two behaviors the change
brushes (env stripping in the shared runner; the two-field observed parse). The other
neighbors (`--check/--update/--snapshot`) are untouched code paths already pinned by their
own suite.

## Canonical Delta

docs/canonical/spec-pipeline.md (create if absent), section "Gate": the resolved gate command
is always executed through `suite-baseline.js --gate`, which subtracts the sanctioned
always-red baseline pins by name on failure — a red gate exit means genuinely new failures
(or a non-test failure passed through); sanctioned-only reds exit 0 and are recorded as
`sanctionedReds=<K>` in the review manifest. The reconciliation is a derivation of the sole
failing-set differ; no session, prompt, or reviewer re-adjudicates a red gate against the
baseline by hand.
