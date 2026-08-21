---
date: 2026-08-20
status: implementing
diff_base: 7e9f33746ed21870fd082fe306fce06a3a6a5e94
open_markers: 0
tier: critical
area: review-verification
design: false
breaking: true
depends_on: []
depended_on_by: ["specs/20260820/07-review-driver.md"]
brief: 16
---

# Typed Evidence Manifest — `observed` becomes a structured object; the packed-string parser is deleted

## Goal

Every evidence-manifest row's `observed` field becomes a typed JSON object, and `verdict.js`
stops regex-parsing packed strings ("skips=N todos=M", "passed=N failed=M skipped=K", …) —
the parser is deleted, not tested, and unknown-coerced-to-zero becomes unwritable by
construction (brief 16, ratified 2026-08-20). Typed rows also carry what the child process
*reported* alongside what the caller *intended*: the at-risk leg records
`{"files":N,"testsExecuted":E}` and goes red on the denominator contradiction
(intended > 0 ∧ executed = 0) — the exact shape of the 2026-08-16→08-20 vacuous-green
escape. Done means: a string-`observed` row derives `UNVERIFIED` (never a silently
misread verdict), every emitter writes the typed shapes, the release ledger copies typed
objects verbatim instead of silently omitting drifted keys, and the producer→consumer pair
test pins the new grammar end to end. This changes two emitted literals cited in the
hash-stamped grounding contract, so it re-grounds every host — a deliberate one-time cost,
paid once here, never dribbled across releases.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | Manifest row v2: `{"leg":<name>,"exit":<int>,"observed":<object>}` — `observed` is always a non-null JSON object; `verdict.js` treats ANY row whose `observed` is not a non-null object as manifest-invalid → `UNVERIFIED`, both profiles (AC-20260820-06-1, AC-20260820-06-12) | Spike A: a typed row fed to the pre-image parser derives CLEAN with fabricated `testsSkipped.total: 0` — so there is no safe compat window; old-format rows must be loudly underivable, never silently misread. Rejected: dual-grammar acceptance (recreates the misparse class for exactly as long as it exists) |
| D2 | Per-leg typed shapes are the closed set in Contracts; emitters bound free-text fields (`detail`, `summary`) to 120 chars; numeric observation slots that cannot be observed carry `{"unavailable":"<enum>"}` — enums `pattern-no-match` (declared pattern missed the output; drift) and `no-format-declared` (host declares none; sanctioned) (AC-20260820-06-2, AC-20260820-06-3, AC-20260820-06-4) | An unmade observation is typed as absent with its reason, never a fabricated number; the two enums carry forward spec 03 D3's drift/declared-none distinction without em-dash string equality |
| D3 | `verdict.js` parser deletion: `countLegFinding` reads typed fields (`reconcile`→`observed.outOfPlan`, `ac-matrix`→`observed.uncovered`, `skip-reconcile`→`skipped−sanctioned`, `promise-sweep`→`observed.orphans`); a red row whose field is absent/non-numeric still floors to 1; `parseCounts` and `deriveProduction` are DELETED — release ledger keys (`e2e`, `journeys`, `substrate`) copy the leg's `observed` object VERBATIM, `production` = `observed.result` (AC-20260820-06-11, AC-20260820-06-13, AC-20260820-06-14) | The emitter's typed object IS the ledger field — verdict stops re-deriving what the producer already typed, so there is nothing left to misparse; spike C's silent key omission (`skipped=unavailable` → no `e2e` key at all) becomes structurally impossible |
| D4 | Skip observation: gate `observed.skips` is a number (with `todos`) or `{"unavailable":<enum>}`; ledger `testsSkipped` SHALL CONTINUE TO be `{total,sanctioned,unsanctioned}` on numeric skips and exactly `{"unavailable":true}` on unavailability (spec 03 D2's shape, unchanged); the skip-drift leg finding now keys on `exit 0 ∧ observed.skips.unavailable === "pattern-no-match"` (+1, hard, dispositionable), `no-format-declared` raises nothing (AC-20260820-06-3, AC-20260820-06-4, AC-20260820-06-2) | Keeping 03's ledger shape means zero churn for ledger readers and the 03 pins convert in place; the finding trigger moves from byte-equality on an em-dash literal to a typed enum — same semantics, unmisspellable |
| D5 | New capability `testCountPattern` (regex over runner output, group 1 = executed-test count, or `"none"`): review-legs applies it to the gate and at-risk child output and writes `testsExecuted: N` or `{"unavailable":<enum>}`; the at-risk row's exit is FORCED to 1 when `files > 0 ∧ testsExecuted === 0` (emitter-side contradiction — verdict needs no new rule; a red non-blocking row already pools); pattern absent/`"none"`/unmatched → typed unavailability and no contradiction check; gate rows record `testsExecuted` but carry no contradiction rule (AC-20260820-06-5, AC-20260820-06-6, AC-20260820-06-7) | Fields record what the child reported, never what the caller intended (brief 16): `files=13` with zero executed tests was ~10 reviews of false green; declared-pattern observation mirrors `skipReportPattern` exactly, and unavailability stays honest rather than assumed-zero. Contradiction red on gate is rejected: a host gate legitimately composed of lint/typecheck legs can execute zero tests |
| D6 | `spec/templates/grounding-contract.md` gets its ONE edit: the `skipReportPattern` sentence's literal (`unavailable — host runner declares no skip format`) is replaced by the typed form, and `testCountPattern` joins the capabilities block; the hash flips and every host re-grounds via `/spec:doctor`'s re-stamp — stated up front as this spec's deliberate one-time cost (AC-20260820-06-8) | The brief requires the re-stamp be paid once at a moment hosts are re-grounding anyway; the `forge:"none"` canonical line is ci-query.js's own stdout contract, not a manifest grammar, and stays byte-unchanged |
| D7 | `release.md`'s leg-row templates are retyped to the Contracts shapes (session-emitted until brief 12 mechanizes them); `manifest-check.sh`'s `TOTAL/FAILS/INERT` stdout sentinel stays byte-unchanged — the session transcribes it into `{"checked":N,"failed":N,"inert":K}` (AC-20260820-06-11) | Brief 12 must inherit typed templates so it never births a new emitter/parser string pair; the sentinel is a script's own machine contract with existing pins, out of this schema's plane |
| D8 | Emitter stdout HUMAN lines stay byte-unchanged: promise-sweep's `rows=N carried=C sanctioned=S orphans=O` counters line, ac-matrix's summary line, review-legs' red/green table (which now renders `observed` as compact JSON) — only manifest rows and ac-matrix's `--json` `observed` field (which mirrors the typed objects) change shape (AC-20260820-06-9, AC-20260820-06-10) | plan.md's lock step copies promise-sweep's printed counters verbatim into the plan ledger row — retyping the stdout line would silently break the plan-lock contract this spec never touches |
| D9 | promise-sweep manifest rows: `{"rows":N,"carried":C,"sanctioned":S,"orphans":O}` and the pre-cutoff variant `{"notApplicable":{"spec":"YYYYMMDD","appliesFrom":"YYYYMMDD"}}` — spec 03 AC-9's literal-string pin is updated in place and retagged (AC-20260820-06-8) | The not-applicable row is 4 days old and has exactly one consumer (verdict's presence check, exit-only); converting it now costs one pin retag, converting later costs a second migration |
| D10 | `legs-verdict-pair.test.js` stays the grammar authority: every branch drives the REAL emitter against a synthetic host and feeds the ACTUAL manifest to `verdict.js` — extended to the typed gate branches and the at-risk contradiction branch; hand-written fixtures in unit tests remain as fast regression checks only (AC-20260820-06-5, AC-20260820-06-6) | 03 D6's producer→consumer principle is what caught this class; a schema migration that didn't extend the pair test would re-open the exact seam it closes |
| D11 | Ledger rows and the retained artifact carry `observed` objects verbatim (objects are not sliced; the 120-char bound moves to emitters' string FIELDS per D2); `smoke`/`staging` ledger keys keep their current scalar derivations (`observed.result` / exit codes) (AC-20260820-06-2) | Slicing a JSON object corrupts it; bounding at the emitter keeps every downstream copy well-formed. Ledger `smoke: "pass"` is a shape existing readers hold |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/review-legs.js | MODIFY | scripts | D1/D2/D5: typed `appendRow` (object rows, bounded string fields), gate/at-risk `testsExecuted` via `testCountPattern`, at-risk contradiction exit 1, summary renders observed compactly |
| spec/scripts/ac-matrix.js | MODIFY | scripts | D2/D8: typed `ac-matrix` + `skip-reconcile` rows; `--json` `observed` mirrors the objects; stdout summary line unchanged |
| spec/scripts/promise-sweep.js | MODIFY | scripts | D9/D8: typed manifest rows (normal + notApplicable); stdout counters line byte-unchanged |
| spec/scripts/verdict.js | MODIFY | scripts | D1/D3/D4: object-or-invalid rule, typed field reads, `parseCounts`/`deriveProduction` deleted, release keys copy observed verbatim, skip-drift finding keys on enum |
| spec/templates/grounding-contract.md | MODIFY | doctrine | D6: the ONE contract edit — typed skip sentence + `testCountPattern` capability; hash re-stamp is this spec's stated cost |
| spec/commands/release.md | MODIFY | doctrine | D7: leg-row templates retyped; sentinel transcription sentence; ledger-row template's derived keys described as verbatim observed objects |
| .claude/spec.config.json | MODIFY | other | D5: this repo's own `testCountPattern` (`"ℹ tests (\\d+)"` — spike D) so its reviews observe executed counts |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | Version bump target 7.12.0 (next free at build time — literal is a target, not a pin) + description changelog |
| tests/review/verdict.test.js | MODIFY | tests | AC-20260820-06-1, AC-20260820-06-2, AC-20260820-06-3, AC-20260820-06-4, AC-20260820-06-13, AC-20260820-06-14 — fixtures retyped; 03's em-dash pins updated in place + retagged |
| tests/review/legs-verdict-pair.test.js | MODIFY | tests | AC-20260820-06-5, AC-20260820-06-6, AC-20260820-06-7 — pair authority extended to typed branches + contradiction |
| tests/review/review-legs.test.js | MODIFY | tests | emitter pins retyped (gate/smoke/ci/reconcile/promise-sweep row shapes) |
| tests/review/review-legs-at-risk-argv.test.js | MODIFY | tests | at-risk typed rows (`files`/`malformed` shapes) retyped in place |
| tests/review/promise-sweep.test.js | MODIFY | tests | AC-20260820-06-8, AC-20260820-06-9 — manifest-row pins retyped incl. 03 AC-9's literal (retag), stdout counters pin stays |
| tests/ac-matrix/ac-matrix.test.js | MODIFY | tests | AC-20260820-06-10 — `--json` observed objects + manifest-row pins retyped |
| tests/ac-matrix/owning-spec-env.test.js | MODIFY | tests | `skipped/sanctioned` fixture rows retyped in place |
| tests/ac-matrix-coverage-holes.test.js | MODIFY | tests | `uncovered/sanctioned` assertions retyped in place |
| tests/verdict-gatered-no-workflow.test.js | MODIFY | tests | fixture rows retyped in place |
| tests/verdict-require-leg.test.js | MODIFY | tests | AC-20260820-06-11, AC-20260820-06-12 — release-profile typed fixtures, verbatim-copy assertions |
| tests/consistency/red-fixture-coverage.test.js | MODIFY | tests | its three packed literals retyped in place |
| tests/consistency/observed-grammar-purity.test.js | CREATE | tests | AC-20260820-06-15 — source-negative pin: verdict.js contains no packed-string grammar |

## Contracts

```
# Evidence manifest row v2 — every writer; verdict.js rejects any other shape (D1)
{"leg":"<name>","exit":<int>,"observed":<non-null JSON object>}

# Per-leg observed shapes (closed set; free-text fields bounded to 120 chars at the emitter)
reconcile      {"outOfPlan":N}
gate           {"skips":N,"todos":N,"testsExecuted":N|{"unavailable":"<enum>"}}
               skips slot alternative: "skips":{"unavailable":"pattern-no-match"|"no-format-declared"}
               (then no "todos" key)
               whole-row alternative (no gate ran, exit 1): {"unavailable":"gate-unresolvable","detail":"<reason>"}
smoke          {"result":"pass"|"inert"|"fail"}
ci             {"conclusion":"<value>"} | {"status":"in-progress"} | {"unavailable":"no-adapter"|"transient"}
at-risk        {"files":N,"testsExecuted":N|{"unavailable":"<enum>"}}
               | {"unavailable":"no-test-command"} | {"malformed":{"entries":N,"of":M}}
               exit FORCED to 1 when files > 0 and testsExecuted === 0 (D5, emitter-side)
patterns       {"matches":N}
drift          {"summary":"<first stdout line>"}
ac-matrix      {"uncovered":N,"oracle":N}
skip-reconcile {"skipped":N,"sanctioned":N}
promise-sweep  {"rows":N,"carried":N,"sanctioned":N,"orphans":N}
               | {"notApplicable":{"spec":"YYYYMMDD","appliesFrom":"YYYYMMDD"}}

# Release legs (session-emitted per release.md until brief 12)
deploy / ready / migrations   {"result":"pass"|"fail"}
substrate      {"checked":N,"failed":N,"inert":N}     (transcribed from manifest-check.sh's
                                                       unchanged TOTAL/FAILS/INERT sentinel)
e2e            {"passed":N,"failed":N,"skipped":N|{"unavailable":"pattern-no-match"|"no-format-declared"}}
journeys       {"walked":N,"failed":N}
production     {"result":"verified"|"skipped"|"failed"}

# Unavailability enums (numeric observation slots)
"pattern-no-match"    declared pattern did not match child output — drift; pages via the
                      gate-skips leg finding (D4)
"no-format-declared"  host declares no pattern ("none" or absent) — sanctioned, no finding

# verdict.js derivation changes (D1/D3/D4)
- any row with non-object observed        -> manifestValid=false -> UNVERIFIED (both profiles)
- countLegFinding                          -> typed field reads; absent/non-numeric on a red row floors to 1
- testsSkipped                             -> numeric skips: {total: skips+todos, sanctioned (from
                                              skip-reconcile.observed.sanctioned), unsanctioned}
                                              unavailable skips (or whole-row unavailable): {"unavailable":true}
- skip-drift finding                       -> gate exit 0 ∧ observed.skips.unavailable === "pattern-no-match" -> +1
- release ledger keys                      -> row.e2e/journeys/substrate = observed VERBATIM;
                                              row.production = observed.result; row.ci = observed;
                                              staging unchanged (exit codes); parseCounts/deriveProduction DELETED
- GATE_RED / legIsRed                      -> exit-code-only, byte-untouched

# Grounding contract capabilities block (D6 — the one edit; hash flips)
"testCountPattern": "<regex, group 1 = executed-test count over runner output>" | "none"
  read by review-legs.js for the gate and at-risk rows; absent / "none" / no match ->
  testsExecuted: {"unavailable": …} — never assumed zero
```

## Behavior

- A review under the new schema is observationally identical when everything is green:
  same legs, same verdict words, same ledger row keys — only `legs[].observed` and
  `testsSkipped`'s already-typed branches change shape.
- An old-format (string-observed) manifest row — from an interrupted mid-upgrade run or a
  hand-crafted file — derives `UNVERIFIED`, never a misread verdict. Remedy: re-run the
  legs; the manifest is per-run scratch, never durable state.
- A Salon-OS-shaped drift (declared skip pattern stops matching) still pages the same run
  as a hard leg finding — now keyed on the typed enum.
- The at-risk leg on a host whose runner reports executed counts goes red the first time it
  hands the runner paths that execute nothing — the 2026-08-16 escape becomes a same-run
  red instead of a ~10-review silent green. Hosts without a declared count pattern see
  typed unavailability and today's behavior.
- Hosts re-ground once: the state gate warns on the stale contract hash (warn-only, never
  blocks) and `/spec:doctor` re-stamps.

## Acceptance Criteria

- **AC-20260820-06-1**: WHEN `verdict.js` reads a manifest whose gate row is
  `{"leg":"gate","exit":0,"observed":"skips=2 todos=1"}` (string observed, all other legs
  typed and green, clean workflow) THE SYSTEM SHALL print `UNVERIFIED` as stdout line 1
  (literal: that manifest → `UNVERIFIED`, never `CLEAN` — spike A shows the pre-image
  prints `CLEAN` with `testsSkipped.total` 0) → new test in tests/review/verdict.test.js
- **AC-20260820-06-2**: WHEN the gate row is
  `{"exit":0,"observed":{"skips":2,"todos":1,"testsExecuted":48}}` and skip-reconcile is
  `{"exit":0,"observed":{"skipped":2,"sanctioned":1}}` THE SYSTEM SHALL derive the ledger's
  `testsSkipped` as exactly `{"total":3,"sanctioned":1,"unsanctioned":2}` and carry the
  gate row's observed object verbatim in `legs[]` → new test in tests/review/verdict.test.js
- **AC-20260820-06-3**: WHEN the gate row is exit 0 with observed
  `{"skips":{"unavailable":"pattern-no-match"},"testsExecuted":48}` on an otherwise
  all-green manifest with a clean workflow THE SYSTEM SHALL print `HARD_FINDINGS` and
  derive `testsSkipped` `{"unavailable":true}` (03 D3's dead-man's-switch under the typed
  grammar; pre-image cannot parse this row at all) → updated-in-place test (retagged from
  AC-20260820-03-5) in tests/review/verdict.test.js
- **AC-20260820-06-4**: WHEN the same manifest carries
  `{"skips":{"unavailable":"no-format-declared"},"testsExecuted":{"unavailable":"no-format-declared"}}`
  THE SYSTEM SHALL derive `CLEAN` with `testsSkipped` `{"unavailable":true}` (declared-none
  stays sanctioned) → updated-in-place test (retagged from AC-20260820-03-6) in
  tests/review/verdict.test.js
- **AC-20260820-06-5**: WHEN `review-legs.js` runs against a synthetic host whose
  `skipReportPattern` matches 2 skips and whose `testCountPattern` matches the runner's
  executed count THE SYSTEM SHALL emit a typed gate row which, fed unmodified to
  `verdict.js --ledger`, derives `testsSkipped.total` 2 — the object is generated by the
  emitter, never hand-written in the test → new test in tests/review/legs-verdict-pair.test.js
- **AC-20260820-06-6**: WHEN the synthetic host declares a `testCountPattern`, has ≥1
  at-risk file, and its `testCommand` exits 0 while printing output whose captured
  executed-count is 0 THE SYSTEM SHALL emit
  `{"leg":"at-risk","exit":1,"observed":{"files":1,"testsExecuted":0}}` and
  `verdict.js` SHALL pool ≥1 leg finding from it (literal: pre-image emits
  `exit:0, observed:"files=1"` — the vacuous green) → new test in
  tests/review/legs-verdict-pair.test.js
- **AC-20260820-06-7**: WHEN the host declares no `testCountPattern` (or `"none"`) THE
  SYSTEM SHALL CONTINUE TO give the at-risk row the child's real exit code, with observed
  `{"files":N,"testsExecuted":{"unavailable":"no-format-declared"}}` — no contradiction
  check without an observation → new test in tests/review/legs-verdict-pair.test.js
- **AC-20260820-06-8**: WHEN `promise-sweep.js --manifest` runs on a pre-cutoff spec THE
  SYSTEM SHALL append exactly
  `{"leg":"promise-sweep","exit":0,"observed":{"notApplicable":{"spec":"20260701","appliesFrom":"20260817"}}}`
  (updated-in-place, retagged from AC-20260820-03-9), and on a post-cutoff spec the typed
  counters row `{"rows":N,"carried":N,"sanctioned":N,"orphans":N}` → tests/review/promise-sweep.test.js
- **AC-20260820-06-9**: WHEN `promise-sweep.js` runs at plan lock (no `--manifest`) THE
  SYSTEM SHALL CONTINUE TO print the stdout counters line
  `rows=N carried=C sanctioned=S orphans=O` byte-unchanged (plan.md's verbatim-copy
  contract; tag the existing stdout pin) → tests/review/promise-sweep.test.js
- **AC-20260820-06-10**: WHEN `ac-matrix.js` appends its rows THE SYSTEM SHALL write
  `{"uncovered":N,"oracle":N}` and `{"skipped":N,"sanctioned":N}` observed objects, and its
  `--json` output's `observed` field SHALL mirror the same objects (literal:
  `observed: {acMatrix: {uncovered: 0, oracle: 0}, skipReconcile: {skipped: 0, sanctioned: 0}}`)
  → tests/ac-matrix/ac-matrix.test.js
- **AC-20260820-06-11**: WHEN a release manifest's e2e row is
  `{"exit":0,"observed":{"passed":3,"failed":0,"skipped":{"unavailable":"no-format-declared"}}}`
  THE SYSTEM SHALL write the ledger row's `e2e` key as exactly that observed object —
  never omit the key (literal: spike C shows the pre-image drops `e2e` entirely on the
  string form) → new test in tests/verdict-require-leg.test.js
- **AC-20260820-06-12**: WHEN a release manifest carries any string-observed row THE
  SYSTEM SHALL print `UNVERIFIED` (fail-closed applies to both profiles) → new test in
  tests/verdict-require-leg.test.js
- **AC-20260820-06-13**: WHEN the gate row's exit flips to 1 THE SYSTEM SHALL CONTINUE TO
  derive `GATE_RED` regardless of its observed object (tag the existing AC-20260820-03-12
  test with this AC-ID after retyping its fixture) → tests/review/verdict.test.js
- **AC-20260820-06-14**: WHEN a red non-blocking row's typed count field is absent or
  non-numeric (e.g. reconcile exit 3 with observed `{}`) THE SYSTEM SHALL CONTINUE TO
  floor its leg-finding contribution at 1 → tests/review/verdict.test.js
- **AC-20260820-06-15**: WHEN the plugin's own suite runs THE SYSTEM SHALL find zero
  packed-string grammar in `verdict.js`'s source — no `skips=`, `outOfPlan=`, `uncovered=`,
  `skipped=`, `orphans=`, `passed=`, `walked=`, `checked=`, `todos=` literals and no regex
  applied to an `observed` value (the fleet-reader drift test's source-negative pattern,
  extended to the deriver the parser is deleted from) → new test in
  tests/consistency/observed-grammar-purity.test.js

## Assumptions (escalation triggers)

- A1 (executed 2026-08-20, spike A): the pre-image `verdict.js --ledger` fed a typed-object
  gate row `{"skips":2,"todos":1}` printed `CLEAN` with
  `"testsSkipped":{"total":0,"sanctioned":0,"unsanctioned":0}` — a real 2-skip observation
  silently discarded; AC-1's red-first check must red against exactly this — **if the
  pre-image already prints `UNVERIFIED`, STOP:** fixed concurrently, re-derive.
- A2 (executed 2026-08-20, spike B): a non-`unavailable` gibberish string gate observed
  (`"tests complete, 3 skipped somewhere"`) also derives `CLEAN`/`total: 0` on the
  pre-image — the residual silent-zero hole 03 closed only for the `^unavailable` arm;
  D1 closes the class, not the instance.
- A3 (executed 2026-08-20, spike C): pre-image release profile with e2e observed
  `"passed=3 failed=0 skipped=unavailable"` printed `CLEAN` with NO `e2e` key in the ledger
  row — the silent-omit D3 makes impossible.
- A4 (executed 2026-08-20, spike D): Node 26's default reporter prints `ℹ tests 4` /
  `ℹ pass 4` summary lines — this repo's `testCountPattern` `"ℹ tests (\\d+)"` is
  observable against the real runner — **if false on another host:** that host declares
  `"none"` and gets typed unavailability, never a broken leg.
- A5: no consumer outside `verdict.js` parses manifest/ledger `observed` strings —
  `fleet-reader.js` carries an executed source-negative pin (zero `observed` tokens;
  tests/fleet-reader/drift.test.js), `spec-status.js` reads only `stage/spec/ci/runAt` via
  `lib/observation.js`, whose `ci === 'red'` comparison targets `stage:"ci"` observation
  rows, not review legs (verified in source 2026-08-20) — **if false:** STOP, enumerate the
  consumer before changing the shape.
- A6: the contract-hash flip is warn-only at the state gate (`spec-state-gate.sh` warns,
  never blocks — verified in source) and `/spec:doctor` re-stamps, so no host is bricked
  mid-flight — **if false:** STOP, this spec's cost model is wrong.
- A7: historical ledger rows keep string `observed` inside their `legs[]` forever; nothing
  re-derives from history (verdict reads per-run manifests only; fleet-reader ignores
  observed) — the two eras stay distinguishable by `typeof` — **if false** (a reader needs
  era-uniform history): blocked; a backfill is a user decision, never silent.
- A8: spec 03's em-dash literal pins (AC-20260820-03-3/5/6/9/11) collide with this
  migration by design — each is updated in place and retagged per the collision gotcha,
  never weakened, never left red; the File Plan's test rows enumerate every carrier file —
  **if a collision surfaces outside those files:** add the row, log the deviation.

## Rationale

Brief 16's second move, executed exactly as ratified: the emitter→parser string seam is
deleted, not hardened. The schema keeps the `observed` KEY (fleet-reader's negative pin,
the retention artifact, and the ledger `legs[]` shape all survive untouched) and retypes
its VALUE; `verdict.js` shrinks from a parser to a copier, which is the point — post-July
2026 sources uniformly back schema-first typed stage evidence with explicit omission
conventions, and no post-July source defends regex-parsed packed strings. The atomicity
call (D1, no dual-grammar window) is not taste: spike A demonstrates the pre-image
*silently misreads* typed rows today, so any compat period is a period of fabricated
zeros. The one-time host re-ground (D6) is the brief's stated, ratified cost. Emitter-side
contradiction red (D5) keeps verdict.js a pure deriver — the alternative (verdict
inspecting files-vs-executed) would put policy in the deriver and grow its input surface.
The File Plan runs 20 rows, past the ~15 guideline: eleven are mechanical fixture retypes
in existing test files, the area is single (the evidence schema), and splitting the sole
deriver's rewrite across two specs would ship exactly the half-migrated state spike A
proves dangerous — the cap yields to atomicity here, recorded for the reviewer. Fragile to
watch at build: verdict.test.js's shared SIX_GREEN-style fixtures feed ~30 pins — retype
them once at the fixture, not per-test; and review-legs' at-risk contradiction must key on
`testsExecuted === 0` strictly, never falsy (an unavailability object is not a zero).

Collision closure (executed at lock, 2026-08-20, 14 literal stems): every genuine grammar
carrier is a File Plan row. Recorded waives for the out-of-plan hits: `.claude/rules/spec-pipeline.md`
and `docs/roadmap/16-*.md` quote retired literals inside dated incident/planning records
(records stay, per the Gotchas convention); `docs/canonical/review.md` is owned by this
spec's Canonical Delta, applied at review close, never a build row;
`.claude/spec-runs/*.json` and `.claude/spec-preimage/*.json` are immutable historical run
artifacts (A7 governs their era). `spec/commands/review.md`, `spec/scripts/scope-reconcile.js`,
and `docs/roadmap/17-*.md` are `files=` false positives (the git `--untracked-files=all`
flag / incident narration), verified by grep 2026-08-20. The two paths-leg `likely` hits on
`tests/consistency/entrypoints.test.js` (via the review-legs.js/ac-matrix.js rows) need no
edit: this spec changes row payloads, never call edges, so the conformance suite's
live-repo pins stay green by construction.

## Canonical Delta

`docs/canonical/review.md`: the "pinned observed grammars" paragraph (currently citing
`skips=N todos=M`-era strings and the floor-1 rule) is rewritten to state manifest row v2 —
observed is a typed object from the Contracts closed set, string rows derive UNVERIFIED,
floor-1 survives on missing typed fields, and the `uncovered=N oracle=M` byte-unchanged
note becomes the typed-object equivalent. `docs/canonical/release-integrity.md`: the
migrations row example becomes `{"leg":"migrations","exit":<exit>,"observed":{"result":"pass"|"fail"}}`
and the note that ledger keys are verbatim observed objects.
