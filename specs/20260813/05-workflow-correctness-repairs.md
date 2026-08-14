---
date: 2026-08-13
status: done
diff_base: 4d476ffe8889698f3170d560141d80fb095b4d42
open_markers: 0
risk: T3
area: workflows
design: false
breaking: false
depends_on: []
depended_on_by: ["specs/20260813/06-report-renderer.md"]
brief: n/a
---

# Workflow correctness repairs — gate placeholders, review emphasis, twin drift, trust boundaries

## Goal

Fix the workflow layer's live correctness defects found by the 2026-08-13 audit
(docs/audit/style-audit-2026-08-13.md, Class F) plus one the blind-spot pass found beyond
it: the design gate that can never pass on placeholder-using hosts, the review command's own
gate leg running the raw placeholder-bearing `gateCommand` (unconditional red on every
review of such hosts), the review coverage emphasis that never runs on single-reviewer
panels (the majority path), the unsentineled red-check, the wf-design/wf-build twin drift,
and the unguarded trust boundaries. Done means: every finding is either fixed with a pinning
test or explicitly rejected in Rationale, and the shared gate-repair machinery lives in
fragments so the twins cannot drift again.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `spec-design-driver.js` resolves the design gate per-leg: split `config.gateCommand` on `&&` **at top nesting level only** (a small depth/quote-aware scanner: `&&` inside balanced `()` or inside single/double quotes never splits; unbalanced input → the whole command passes through unsplit, never mis-split); drop any leg still containing an unresolved `{placeholder}` token, logging each dropped leg into the emitted step text; surviving legs re-joined with `&&` become the gate. An optional config key `design.gateCommand` overrides the whole derivation when present. | Today the whole `gateCommand` passes through unsubstituted (`{testDirs}` literal → gate can never pass → guaranteed gate-exhausted); naive `&&` splitting would corrupt subshell/quoted host gates (refuter-verified class: turbo/pnpm wrapper chains), so the split is conservative-by-construction. |
| D2 | Zero surviving legs (or an empty `gateCommand`) ⇒ the driver emits the gate as the literal sentinel string `__UNGATED__`, and `wf-design` returns `stage: 'complete-ungated'` (never `'complete'`) when its gate command is `__UNGATED__` or empty; the driver's next-step text for `complete-ungated` says verification is absent and routes to `/spec:review` with the fact stated, never a green mark. | Sonnet-authored code must never be marked done with zero deterministic verification (F3); a distinct stage makes the degradation loud at every consumer. |
| D3 | `reviewerPrompt(i)` in `wf-review.body.js` always includes the full coverage emphasis: `EMPHASES[i]` becomes primary *framing* only, and the block currently living only in `EMPHASES[1]` (File Plan / Contracts / Decisions / AC↔test coverage incl. `${DRIFT_NOTE}` / wiring / boundaries) is appended to every reviewer prompt unconditionally. | EMPHASES[1] is unreachable on every single-reviewer panel — the majority path (fix-delta always 1, full scope usually 1) — so AC-coverage review and the no-drift-script note never fire where they're needed (F2). |
| D4 | Red-check gains the sentinel discipline the gate leg already documents: the red-check prompt instructs the agent to run, per file, `<testCommand> <path> && echo AUDIT_GREEN:<path> \|\| echo AUDIT_RED:<path>` and to paste the observed sentinel lines into a new required `RED.sentinels` array (`{path, sentinel}`); the workflow cross-checks each file's reported state against its sentinel and treats any mismatch or missing sentinel as an UNVERIFIED red state (existing fail-closed path). **Scope guard:** the cross-check applies only when the red-check agent actually ran — the existing all-sanctioned-green-carriers path hand-constructs its `red` literal without an agent (pinned by tests/redcheck-green-carriers.test.js) and is exempt; that literal gains `sentinels: null` and the cross-check skips `null`. | The only proof tests fail first currently rides the model's stdout reading — the exact false-green hole the gate 40 lines away closes with exit-code-only discipline (F4); the exemption keeps a pinned sanctioned path green (refuter-caught interaction). |
| D5 | Extract the gate-repair loop shared by `wf-build`/`wf-design` into `fragments/gate-loop.js.frag` (gate probe, repair-round loop with ceiling, phantom-failure hardening, anti-oscillation repair history, deviations-sidecar accumulation, exhaustion return assembly). Both bodies splice it; per-body differences (batch shapes, prompts) stay in the bodies as parameters. The repair ceiling becomes one named constant inside the fragment. **Naming constraint:** the fragment's gate-command variable keeps the name `gateCmd` — tests/workflow-guards.test.js pins the literal `${gateCmd}` interpolation in both generated files; the extraction must not rename it. | wf-design is a drift-victim twin: build's deviations sidecar, anti-oscillation history, and phantom-failure hardening never reached it though the justifying comments were copied (F5); the fragment mechanism exists precisely for this and is unused for its densest case. |
| D6 | The exhaustion return in the shared fragment carries `exhaustedBy: 'agent-died' \| 'no-attributable-failure' \| 'oscillation' \| 'ceiling'` alongside the existing `stage: 'gate-exhausted'`. This spec only *records* the cause; report-surface consumption lands in spec 06. | Four distinct causes currently collapse into one opaque token — a dead gate agent is indistinguishable from a red gate; recording at the source is this spec's half because the fragment owns the return assembly. |
| D7 | Verifier prompt in `wf-review.body.js`: the closing rule becomes "never run git commands other than `status` and `log`" (the prompt's own step 1 mandates `git log -1`); the cleanup clause downgrades from a guarantee to best-effort ("leave no file you created; the orchestrator's close sweep is authoritative"). | A compliant verifier currently refuses its own mandated stale-worktree check → false MISCITED kills (F6); the porcelain close sweep (spec 20260813/01 D5) is the real guarantee. |
| D8 | Trust-boundary asserts, each wrapped in a named function at the arg boundary so tests can execute it (`assertGateArgs`, `assertBatchKinds`, `assertResolutions`): `wf-build` asserts `args.gate && typeof args.gate.testCommand === 'string'`; `wf-design` validates every batch `b.kind` against the closed kind set and throws naming the offending value; `wf-build` asserts every `args.resolutions` value matches the args token alphabet (`/^[A-Za-z0-9._\/:@=-]+$/`) and throws naming the offending key. | Unguarded derefs crash cryptically mid-run; an unvalidated `kind` silently routes a batch to the wrong prompt; free-text `resolutions` is the 2026 args-corruption class's last open door (F7). Named wrappers exist because `extractFn`/`evalFns` cannot reach bare top-level statements (refuter-verified helper limitation). |
| D9 | Scaffold-ledger rows for the previously unregistered guards: `MAX_VERIFIES=12` (retune: raise if two quarters show capped-finding runs), the shared repair ceiling (retune: raise on two gate-exhausted-at-ceiling escapes with distinct causes), the red-check sentinel cross-check (retire: never — it is the TDD evidence floor), and the `__UNGATED__`/`complete-ungated` guard (retire: only if a host class emerges where ungated design completion is sanctioned — none known). | Every new mechanism/gate needs a ledger row or review flags it hard (§ Review Checks); the D2 guard is itself a new mechanism (refuter-caught self-inflicted hard finding). |
| D10 | `spec/commands/review.md`'s gate leg (Phase 0 step "run the host's gateCommand") gains the same placeholder resolution build.md already performs: `{testDirs}` resolves from the spec's File Plan tests rows to the glob form before the leg runs; an unresolvable placeholder makes the leg `unavailable` naming the token, never a raw execution. | Blind-spot finding: review.md runs the raw `gateCommand` with zero substitution — on any `{testDirs}` host every review's gate leg is an unconditional red (worse than F1, it fires unconditionally); init.md's own config comment promises review substitutes. |
| D11 | Version bump target 6.63.0 (next free at build time), plugin.json description updated as changelog. | Repo discipline; literal number is a target, not a pin. |
| D12 | **(post-build user ruling, 2026-08-13 — overrides this spec's original rejection of the subshell-sentinel nit.)** The shared fragment's gate probe becomes two lines: `( set -e; <gateCmd> )` on its own, then `if [ $? -eq 0 ]; then echo __GATE_PASS__; fi`. The prompt text instructs the agent to run both lines in one shell and explicitly forbids collapsing them back to `( … ) && echo`. Pinned by AC-20260813-05-15. | The old `( <gate> ) && echo` probe reported only the LAST statement's status, so a `;`-joined host gate whose first leg failed still printed the pass sentinel — a false green at the one point the whole pipeline trusts. The two-line shape is not stylistic: POSIX ignores errexit for any non-final command of an AND-OR list and bash applies that suppression *inside* the subshell, so `( set -e; … ) && echo` (and `if ( set -e; … ); then`) leave the `set -e` completely inert — verified by execution, which is why the AC carries behavioral pins for the naive fix as well as the defect. |

| D13 | **(post-build user ruling, 2026-08-13 — out-of-area, admitted deliberately.)** `tests/autopilot/lock.test.js`'s AC-20260810-05-12 lifecycle pin waits for the daemon lockfile's CONTENT (`existsSync && readFileSync().trim() !== ''`), not bare existence. No production code changes. | The pin polled `existsSync` and then asserted on the file's pid contents, but D5 of specs/20260810/05 pins `writeFileSync(path, pid, {flag:'wx'})` — an `O_CREAT\|O_EXCL` open followed by a *separate* write. The poller can observe the file between those two syscalls and read an empty string. Microseconds when idle; milliseconds when the child is descheduled under a loaded full-suite run — which is exactly when this test was observed flaking (1 in ~7 runs, never reproducible in isolation). Test-only defect; the daemon behavior it pins is correct. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/spec-design-driver.js | MODIFY | scripts | D1 top-level-aware per-leg gate resolution + `design.gateCommand` override; D2 `__UNGATED__` sentinel + complete-ungated routing in step text; header updated |
| spec/workflows/fragments/gate-loop.js.frag | CREATE | workflows | D5 shared gate-repair loop (`gateCmd` name preserved; ceiling constant, phantom hardening, oscillation history, deviations sidecar, D6 `exhaustedBy`) |
| spec/workflows/src/wf-build.body.js | MODIFY | workflows | D5 splice gate-loop fragment (delete inlined copy); D4 red-check sentinel prompt + `RED.sentinels` cross-check w/ sanctioned-green exemption; D8 `assertGateArgs` + `assertResolutions` |
| spec/workflows/src/wf-design.body.js | MODIFY | workflows | D5 splice gate-loop fragment (gains sidecar/oscillation/phantom); D2 `complete-ungated` return; D8 `assertBatchKinds` |
| spec/workflows/src/wf-review.body.js | MODIFY | workflows | D3 coverage emphasis + DRIFT_NOTE appended to every reviewer prompt; D7 verifier git-rule fix + best-effort cleanup clause |
| spec/commands/review.md | MODIFY | doctrine | D10 gate-leg placeholder resolution (build.md's recipe cited, glob form, unresolvable → `unavailable`) |
| spec/doctrine/scaffold-ledger.md | MODIFY | doctrine | D9 four guard rows |
| spec/doctrine/claims-baseline.json | MODIFY | doctrine | ratchet re-stamp for doctrine deltas (same commit) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D11 bump + changelog description |
| tests/workflows/design-gate-resolution.test.js | CREATE | tests | AC-20260813-05-1, AC-20260813-05-2, AC-20260813-05-3, AC-20260813-05-12 |
| tests/workflows/review-emphasis-coverage.test.js | CREATE | tests | AC-20260813-05-4, AC-20260813-05-5, AC-20260813-05-11, AC-20260813-05-13 |
| tests/workflows/red-check-sentinel.test.js | CREATE | tests | AC-20260813-05-6, AC-20260813-05-14 |
| tests/workflows/twin-parity.test.js | CREATE | tests | AC-20260813-05-7, AC-20260813-05-8, AC-20260813-05-10, AC-20260813-05-15 |
| tests/gate-phantom-failures.test.js | MODIFY | tests | AC-20260813-05-9 (widen the existing pin to assert the hardening text in BOTH bodies via the shared fragment) |
| tests/workflow-guards.test.js | MODIFY | tests | D12 — tighten the pre-existing `gate sentinel` guard to the probe shape that actually delivers its own stated intent (was pinning the false-greening `( … ) && echo`) |
| tests/autopilot/lock.test.js | MODIFY | tests | D13 — flake fix: wait for lockfile CONTENT, not bare existence |

## Contracts

```js
// fragments/gate-loop.js.frag — spliced into wf-build and wf-design bodies.
// Exposes (closure-scoped, per existing fragment conventions):
//   REPAIR_CEILING = 3                       // sole definition; bodies stop duplicating `<=3`
//   runGateLoop({gateCmd, phase, repairFn, contextLabel}) -> {
//     pass: boolean,
//     rounds: number,
//     deviations: [...],                     // sidecar rows accumulated across repairs
//     exhaustedBy: 'agent-died'|'no-attributable-failure'|'oscillation'|'ceiling'|null,
//   }
//   NOTE: the interpolated variable name `gateCmd` is load-bearing —
//   tests/workflow-guards.test.js pins `${gateCmd}` in both generated outputs.
// wf-design return: stage ∈ 'complete' | 'complete-ungated' | 'gate-exhausted' | 'blocked'
// wf-build RED schema gains: sentinels: [{path, sentinel}] | null (null = agent didn't run:
//   the sanctioned-green-carriers literal; cross-check skips null)
// spec-design-driver step text: gate command string is never emitted containing an
//   unresolved `{...}` token; the fully-dropped case emits the literal `__UNGATED__`.
// Trust-boundary named functions (evalFns-reachable): assertGateArgs(args),
//   assertBatchKinds(batches), assertResolutions(resolutions)
```

## Behavior

- Gate resolution (D1): the driver's job is purely defensive — legs still carrying `{...}`
  after the command's substitution are dropped and logged. Example with this repo's gate:
  input `node spec/scripts/build-workflows.js --check && node --test {testDirs}` → design
  gate `node spec/scripts/build-workflows.js --check`, step text notes
  `dropped leg (unresolved placeholder): node --test {testDirs}`. Nested example:
  `(cd sub && npm test) && npm run lint` splits into exactly two legs — the parenthesized
  group is one leg (inner `&&` protected), `npm run lint` the other.
- Review gate leg (D10): the substitution recipe is cited from build.md (File Plan tests
  rows → repo-root-relative glob), not duplicated — one sentence plus the `unavailable`
  fallback; review.md is edited by later wave specs (07/08/10), and this spec runs first in
  the chain, so no contention.
- Emphasis merge (D3): `EMPHASES` stays a 2-element array of *framings*; the coverage block
  moves into the shared prompt body. On 2-reviewer panels the framings still differentiate
  the seats; on 1-reviewer panels nothing is lost. (No existing test pins the current
  index split — refuter-verified.)
- Twin extraction (D5) is behavior-preserving for wf-build (its inlined loop is the source
  of truth) and behavior-*adding* for wf-design (sidecar, oscillation history, phantom
  hardening). Any forced departure from build's semantics during extraction is a deviation
  the worker records, not a silent adaptation. Oscillation detection, phantom hardening, and
  sidecar semantics are copied verbatim from wf-build — this spec relocates, never redesigns.

## Acceptance Criteria

- **AC-20260813-05-1**: WHEN `spec-design-driver.js` runs against a config whose
  `gateCommand` is `node spec/scripts/build-workflows.js --check && node --test {testDirs}`
  THE SYSTEM SHALL emit a design gate of `node spec/scripts/build-workflows.js --check` and
  a logged dropped-leg note naming `{testDirs}` (emitted step text contains no unresolved
  `{` token) → tests/workflows/design-gate-resolution.test.js
- **AC-20260813-05-2**: WHEN the config declares `design.gateCommand` THE SYSTEM SHALL emit
  exactly that string as the gate, bypassing leg-dropping (e.g. `"design": {"gateCommand":
  "npm run lint"}` → gate `npm run lint`) → tests/workflows/design-gate-resolution.test.js
- **AC-20260813-05-3**: WHEN every leg drops (e.g. `gateCommand: "vitest {testDirs}"`) THE
  SYSTEM SHALL emit the literal `__UNGATED__`, and the wf-design body source SHALL return
  `stage: 'complete-ungated'` for that gate value (source-text pin: the empty/`__UNGATED__`
  branch contains the literal `'complete-ungated'`) →
  tests/workflows/design-gate-resolution.test.js
- **AC-20260813-05-4**: WHEN `reviewerPrompt(0)` is rendered (single-reviewer panel) THE
  SYSTEM SHALL include the AC↔test coverage requirement and, for `hasDriftScript: false`,
  the DRIFT_NOTE text (literal: prompt contains `every AC covered by a real test` and
  `semantic backstop`) → tests/workflows/review-emphasis-coverage.test.js
- **AC-20260813-05-5**: WHEN `reviewerPrompt(1)` is rendered THE SYSTEM SHALL CONTINUE TO
  carry the design-integrity vs rule-compliance framing difference from `reviewerPrompt(0)`
  (the two prompts differ in their primary-framing line) →
  tests/workflows/review-emphasis-coverage.test.js
- **AC-20260813-05-6**: WHEN the wf-build red-check prompt is rendered THE SYSTEM SHALL
  mandate per-file sentinel commands (literal: prompt contains `AUDIT_RED:` and the RED
  schema requires `sentinels`), and the body SHALL treat a file whose reported state lacks a
  matching sentinel as unverified-red (source-text pin on the cross-check block) →
  tests/workflows/red-check-sentinel.test.js
- **AC-20260813-05-7**: WHEN both generated workflows are rebuilt THE SYSTEM SHALL contain
  the identical gate-loop fragment text in `wf-build.js` and `wf-design.js` (byte-identical
  spliced region — build-workflows.js splices verbatim except `__WF_NAME__`, which the
  fragment must not use) → tests/workflows/twin-parity.test.js
- **AC-20260813-05-8**: WHEN wf-design's gate loop exhausts THE SYSTEM SHALL return
  `exhaustedBy` from the closed set (`'agent-died'|'no-attributable-failure'|'oscillation'|'ceiling'`)
  and a `deviations` array (source-shape pin on the shared fragment's return assembly) →
  tests/workflows/twin-parity.test.js
- **AC-20260813-05-9**: WHEN the phantom-failure hardening pin runs THE SYSTEM SHALL CONTINUE TO
  find the hardening text reachable from wf-build AND newly from wf-design (widened existing
  pin; the build half is a regression pin, green pre-change) →
  tests/gate-phantom-failures.test.js
- **AC-20260813-05-10**: WHEN `assertGateArgs` receives `args.gate` without `testCommand`,
  or `assertBatchKinds` receives a batch kind outside the closed set, or
  `assertResolutions` receives a value failing the token alphabet (e.g.
  `{"D3": "use the old name — it's fine"}`) THE SYSTEM SHALL throw naming the offending
  key/value (evalFns execution of the named functions) → tests/workflows/twin-parity.test.js
- **AC-20260813-05-11**: WHEN the verifier prompt is rendered THE SYSTEM SHALL permit
  `git log` alongside `git status` (literal: closing rule reads `other than status and log`)
  and SHALL NOT claim guaranteed cleanup (contains `best-effort`) →
  tests/workflows/review-emphasis-coverage.test.js
- **AC-20260813-05-12**: WHEN the leg-splitter receives `(cd sub && npm test) && npm run lint`
  THE SYSTEM SHALL treat the parenthesized group as one leg (two legs total; no leg equals
  the garbage fragment `(cd sub `), and WHEN input has unbalanced parens THE SYSTEM SHALL
  pass the whole command through unsplit → tests/workflows/design-gate-resolution.test.js
- **AC-20260813-05-13**: WHEN review.md's gate-leg step is read THE SYSTEM SHALL contain the
  placeholder-resolution instruction (literal: `{testDirs}` resolved to the glob form before
  the leg runs, unresolvable → `unavailable`) → tests/workflows/review-emphasis-coverage.test.js
- **AC-20260813-05-15**: WHEN the shared gate probe runs a `;`-joined gate whose first leg fails
  (`false; true`) THE SYSTEM SHALL NOT print `__GATE_PASS__`, WHILE CONTINUING TO print it for a
  passing gate (`true; true`, `true && true`) and for a gate that deliberately tolerates a failing
  step (`false || true`); the probe source in the fragment and in BOTH generated workflows SHALL
  carry the two-line shape (`( set -e; …)` then a separate `$?` test), and the pin SHALL also
  execute the old probe and the naive one-line `set -e` fix to demonstrate both still leak the
  sentinel → tests/workflows/twin-parity.test.js
- **AC-20260813-05-14**: WHEN every test carrier is sanctioned-green THE SYSTEM SHALL
  CONTINUE TO skip the red-check probe with the hand-built literal (existing pin
  tests/redcheck-green-carriers.test.js stays green; the literal gains `sentinels: null`
  and the cross-check skips it) → tests/workflows/red-check-sentinel.test.js

## Assumptions (escalation triggers)

- The inlined gate loops in wf-build and wf-design are semantically close enough to extract
  behind one parameterized fragment. If a genuine semantic fork surfaces mid-extraction
  (beyond prompts/batch shapes), the worker STOPS and escalates — if false → the fragment
  splits into thinner shared pieces (probe + return assembly) and the loop skeleton stays
  per-body.
- `build-workflows.js` splices fragments verbatim except `__WF_NAME__` substitution
  (refuter-verified at build-workflows.js:62-76), so AC-7's byte-identical-region check
  works iff the fragment avoids `__WF_NAME__`. If the fragment turns out to need it → AC-7
  falls back to asserting both bodies contain the `@fragment:gate-loop` marker.
- The driver's emitted step text is the only channel wf-design receives its gate through
  (refuter-verified: design.md never independently constructs `gate:`). If false → D1/D2
  move to the command prose that assembles the args, same semantics.
- The scoped gate for this spec is `node spec/scripts/build-workflows.js --check &&
  node --test 'tests/workflows/*.test.js' tests/gate-phantom-failures.test.js
  tests/redcheck-green-carriers.test.js` (glob form per the {testDirs} gotcha;
  refuter-executed green on Node v26 with a scratch file).

## Rationale

Audit provenance: docs/audit/style-audit-2026-08-13.md Class F (F1–F8) + the blind-spot
pass's discovery that review.md's gate leg never substitutes placeholders (the audit's own
F1 parenthetical "(only build/review substitute)" was false — nobody substitutes but build).
F1/F2/F6 re-verified at HEAD after specs 20260813/01–04 landed.

Refuter-driven corrections (two seats + blind-spot, 2026-08-13): D1 gained the top-level-only
split rule (naive `&&` splitting corrupts subshell/quoted host gates); D4 gained the
sanctioned-green-carriers exemption (the hand-built `red` literal bypasses the schema by
design — pinned by tests/redcheck-green-carriers.test.js); D5 gained the `gateCmd` naming
constraint (tests/workflow-guards.test.js pins the literal interpolation); D8's asserts
became named functions (extractFn/evalFns cannot reach bare top-level statements); D9 gained
the fourth ledger row (the D2 guard is itself a new mechanism — shipping it rowless would be
a self-inflicted hard review finding); D10 was added whole from the blind-spot pass.

Rejected from this spec: E-class report/schema fields beyond `exhaustedBy` (spec 06 owns the
report surface); F9 stack-shaped phrasing (spec 10).

The pre-existing subshell-sentinel falsifiability nit (the `( cmd ) && echo` wrapper fires on
`( false; true )`) was originally rejected here as a behavior change outside this spec's
findings, to be relocated verbatim. **The user reversed that after the build**, and it landed
as D12 / AC-20260813-05-15 — the extraction had just made it a one-place fix instead of two,
which is what changed the cost side of the original call. Worth recording: the first attempt
at the fix (`( set -e; cmd ) && echo`) was inert, and only the AC's *executable* assertions
caught it — a source-text pin on the presence of `set -e` would have passed while the guard
did nothing.

Regression-pin coverage: AC-5 (two-seat framing), AC-9 build half (phantom hardening), AC-14
(sanctioned-green skip), AC-7 (extraction didn't fork build's loop semantics).

## Canonical Delta

None — no docs/canonical/ exists in this repo; scaffold-ledger rows are the durable record.
