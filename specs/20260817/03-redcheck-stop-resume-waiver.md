---
date: 2026-08-17
status: hardened
open_markers: 0
risk: T3                 # rewrites wf-build.body.js through the codegen seam (named T3 trigger) — a defect here corrupts the TDD red-first evidence floor for every host
area: build-workflow
design: false
breaking: false
depends_on: []
depended_on_by: ["specs/20260817/04-redcheck-sentinel-path-keying.md"]
brief: n/a
---

# Red-check stop: token resume + evidence-priced per-file waiver

## Goal

A `tdd-red-check` stop currently has no honest exit. On `resumeFromRunId` the red-check
`agent()` call's prompt is a pure function of `testBatches` paths + gate commands (a
structural fact of the source, independently confirmed at adversarial check), so the
workflow journal cache replays the cached stop verdict even after the orchestrator has
fixed the test files' *content* — and the only lever the args contract offers is
`tdd: false`, an all-or-nothing, trace-free disarm of the red-first evidence floor.
Evidence: JJ-20260816-02 (open intake row, three sanctioned-failing pins) hit the lever
after load-attribution mismatches; an UpWell build on 2026-08-16 (run `wf_43fd35e6`,
relayed by JJ this session and verified against this repo's workflow source — not
ledgered here) burned two dead cycles on the cache-replay half specifically;
TRADOYO-20260813-01 is precedent for the lever-misuse pattern only (its proximate defect
was separately fixed at 6.65.0). Done means: (1) a reserved cache-bust token re-runs the
red-check on resume, (2) a per-file waiver with a mandatory evidence record replaces
`tdd: false` as the sanctioned exit when the check is wrong about a specific adjudicated
file, (3) disarming TDD entirely also costs an evidence record — mechanically, not by
doctrine request, (4) the run's terminal return and its durable ledger row both say
whether the floor was disarmed or any file waived, and (5) the three JJ-20260816-02 pins
go green and leave the suite baseline.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | Reserve the key `tdd-red-check` in the existing `args.resolutions` map as the red-check re-adjudication token; its value is passed as the `salt` argument to `redCheckPrompt` at the real RedCheck `agent()` call site — literally `(args.resolutions ‖ {})['tdd-red-check'] ‖ ''` — changing the prompt bytes so the journal cache re-dispatches instead of replaying the stop verdict. Cumulative-across-resumes semantics and `assertResolutions`' TOKEN_RE validation apply unchanged. | Mirrors the ratified `blocked`-verdict mechanism (build.md `resolutions[batchId]`) instead of inventing a second cache-bust concept; a new top-level arg and an orchestrator-computed content hash were rejected as extra machinery. The call-site expression is spelled out because a correct-but-unwired `redCheckPrompt` would pass every unit AC while shipping the fix inert (refuter finding). |
| D2 | Hoist the red-check prompt construction into a named pure function `redCheckPrompt(redExpected, greenExpected, gate, salt)` — **declared immediately after `phase('RedCheck')`**, not at the top of the file. `salt === ''` produces a prompt with no token line and byte-identical output for identical inputs; any non-empty salt appends exactly one line containing it. | Named functions are this file's `evalFns` testability pattern (`extractFn` brace-matches by name, position-independent — verified). The in-region placement is load-bearing: five existing test files pin prompt prose by slicing `phase('RedCheck')` → `'FAIL CLOSED'`, and two of their pins are absence asserts that would go *vacuously green* if the prose moved above the region (blind-spot finding) — the function must keep the prompt text inside that slice. |
| D3 | New optional args field `waivers: [{path, evidencePath}]` (default `[]`). `assertWaivers(waivers, testBatches)` fails loud at args validation unless every entry has a `path` exactly matching some `testBatches[].files[].path` and a non-empty string `evidencePath`. `applyWaivers(rawExpectations, waivers)` is applied **once**, at the construction of the `expectations` binding, so the same filtered binding feeds the `redExpected`/`greenExpected` split AND the later `crossCheckSentinels(expectations, …)` call — a waived path never appears anywhere downstream. | Waiver scoped to the adjudicated file (pin i), structurally impossible without an on-disk evidence record (pin iii); args stays a closed alphabet — both fields are paths, prose lives at `evidencePath` (conventionally the deviations sidecar). The single-binding rule is explicit because filtering only the prompt inputs would leave the waived path in the cross-check's expectation list, manufacturing a spurious `no sentinel reported` mismatch on the exact route this spec fixes (refuter finding). The path-membership check turns a typo'd waiver into a loud throw, never a silent no-op. |
| D4 | Waivers self-bust the cache: removing a path changes the file lists `redCheckPrompt` embeds, so the waiver route needs no token. The D1 token exists for the one route waivers and reclassification cannot cover — test file *content* edited under unchanged paths/expectations. | States exactly when each mechanism applies so build.md documents two exits without overlap. |
| D5 | Provenance is echoed in BOTH artifacts: (a) the terminal `complete`/`gate-exhausted` return gains flat fields immediately after `stage` — `tdd: args.tdd !== false`, `waivedFiles: (args.waivers ‖ []).map(w => w.path)`, and `tddEvidence: args.tddEvidencePath ‖ ''`; (b) build.md's durable `.claude/spec-runs.jsonl` build-row schema gains `"tdd"` and `"waivedFiles"` fields. The field name is `waivedFiles`, never `waived`. Other stop returns (`blocked`, `tdd-red-check`, `out-of-scope-failure`) are unchanged. | The workflow return alone is transcript-ephemeral — the ledger row is what doctor/intake mining durably read (blind-spot finding), and it is shared by fast-path runs, closing provenance for both vehicles. `waived` is avoided because the review ledger pins that exact name as findings-nested-only (tests/review/verdict.test.js AC-20260805-02-8) — a flat sibling with different semantics is a review-time trap. Review-side *consumption* stays deferred until a real review demonstrably needs it. |
| D6 | build.md's `tdd-red-check` verdict row names the two sanctioned exits — (a) tests were wrong: fix them, set/bump `resolutions['tdd-red-check']`, resume; (b) the check is wrong about a specific file and a human adjudicated it: record the verbatim evidence at the deviations sidecar (or spec Decisions), add a `waivers` entry pointing at it, resume — and states that `tdd: false` is never the exit from a red-check stop. Fast-path parity: the fast path (no journal, no cache problem) re-runs freely, and its red-check mismatch handling routes through the SAME evidence discipline — waiver evidence recorded at the deviations sidecar and echoed in the shared ledger row's `tdd`/`waivedFiles` fields; the args mechanisms don't exist there and the doctrine says so. | Row 200 documents the blocked resume mechanism; row 201 said "resume" with no mechanism at all. Without the parity clause, D6 would tell fast-path readers to use exits that are structurally unreachable on their vehicle (blind-spot finding). |
| D7 | The three `tests/tdd-waiver-provenance.test.js` pins are retagged with this spec's AC-IDs and tightened from vocabulary-presence regexes to the landed shape; their rows leave `.claude/suite-baseline.json` via `suite-baseline.js --update` in the landing batch; INTAKE row JJ-20260816-02 is stamped fixed. | The pins' own header sanctions exactly this; the baseline update riding the landing batch is the 20260814/03 Contracts convention. The stamp is honest only because D10 closes the EVIDENCE gap mechanically — see D10. |
| D8 | Rejected (recorded, applied nowhere): UpWell's two proposed relaxations — treating a pre-stub resolution-shaped diagnostic (TS2307/TS2305) as satisfied red, and auto-satisfying `not-collected` when the missing specifier is a File-Plan CREATE path. Also dropped: hardening the probe prompt against post-stub `typecheckRed` misreports. | The relaxations reopen the vacuous-red class 20260815/06 D3/D4 deliberately closed; the probe-misreport hardening has one incident and the system failed closed correctly — reopen on a second case per the intake convention. |
| D9 | New scaffold-ledger row registering the resume-path mechanism (token + waiver + evidence-priced disarm), explicitly naming it a **two-instance class of which this spec fixes one**: wf-design has the identical cached-stop shape (`stage: 'blocked'` returns, no `resolutions` arg at all, while its driver instructs on-disk-plan edits + `resumeFromRunId` — zero prompt bytes change) and stays open, recorded at lock as follow-up. | Every mechanism carries a promote/retire condition (doctor check 13); a ledger row that hides the known-open sibling instance would misreport class closure. |
| D10 | `tdd: false` is mechanically evidence-priced: args validation throws unless it is accompanied by a non-empty `tddEvidencePath` (a path — for a genuinely TDD-free spec, conventionally the spec path itself, whose File Plan shows no test rows; for anything else, the record justifying the disarm). Echoed in the terminal return as `tddEvidence`. | Refuter finding: D6 alone is prose — an orchestrator ignoring doctrine could still pass `tdd: false` trace-free, leaving JJ-20260816-02's SCOPE and EVIDENCE gaps open in mechanism. Pricing the boolean at a record makes the disarm cost what the waiver costs; SCOPE is closed by the waiver existing as the narrow alternative. |

## File Plan

<!-- Machine-consumed: /spec:build parses this table into workflow batches.
     Layer ∈ the host config's layerGroups (flattened, in order) plus tests | other.
     Tests rows list their AC-IDs in Summary. -->

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/workflows/src/wf-build.body.js | MODIFY | workflows | D1–D5, D10: `redCheckPrompt` (declared inside the RedCheck region), `assertWaivers`/`applyWaivers`, single post-waiver `expectations` binding, call-site salt wiring, terminal-return `tdd`/`waivedFiles`/`tddEvidence` echo, `tdd:false`⇒`tddEvidencePath` validation, args-comment update (never write bare `runId` in comments — use `resumeFromRunId`) |
| spec/commands/build.md | MODIFY | doctrine | D4/D6/D5b: `tdd-red-check` row's two exits + `tdd: false` narrowing (line ~201), fast-path parity clause (step 1, ~145–147), args signature loci (~169 AND ~352), the resume restatement at ~376, ledger build-row schema gains `"tdd"`/`"waivedFiles"` (~306). Do NOT touch the runId-source resume wording (JJ-20260814-02 backlog pin must stay red) |
| spec/doctrine/shared.md | MODIFY | doctrine | Blind-spot fix: § Escalation Contract (build) response path (~790–792) currently states resume as "`resolutions[batchId]` cache salt" for all six triggers — reword so trigger 5 (`tdd-red-check`) points at the reserved-key/waiver exits |
| spec/doctrine/scaffold-ledger.md | MODIFY | doctrine | D9: resume-path mechanism row, two-instance class wording, promote/retire condition |
| spec/INTAKE.md | MODIFY | doctrine | D7: JJ-20260816-02 row stamped fixed (version + mechanism column) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | version bump (target 6.87.0 — next free wins, per the semver-race gotcha) + description changelog |
| tests/redcheck-resume-waiver.test.js | CREATE | tests | AC-20260817-03-1, AC-20260817-03-2, AC-20260817-03-3, AC-20260817-03-4, AC-20260817-03-5, AC-20260817-03-7, AC-20260817-03-9, AC-20260817-03-10, AC-20260817-03-11, AC-20260817-03-12, AC-20260817-03-13 |
| tests/wf-build-resolutions-threading.test.js | CREATE | tests | AC-20260817-03-8 |
| tests/tdd-waiver-provenance.test.js | MODIFY | tests | AC-20260817-03-6 — retag the three pins, tighten to landed shape (red at HEAD by standing sanction; green after) |
| tests/run-ledger.test.js | MODIFY | tests | AC-20260817-03-14 — extend the build ledger-row field-list pin with `"tdd"` and `"waivedFiles"` |
| .claude/suite-baseline.json | MODIFY | other | D7: remove the three JJ-20260816-02 rows via `node spec/scripts/suite-baseline.js --update` in the landing batch |
| spec/doctrine/claims-baseline.json | MODIFY | other | build.md/shared.md/scaffold-ledger/INTAKE line counts change — regenerate the claims baseline in the same diff (review hard-check) |

Orchestrator duties (outside the table): run `npm run build:workflows` after the body edit and
`node spec/scripts/build-workflows.js --check` before declaring the batch done; commit source +
generated `spec/workflows/wf-build.js` together — the generated file is never a File Plan row.

## Contracts

```js
// args additions (wf-build.body.js args comment — source of truth for the workflow batch)
//   resolutions: {batchId: token, 'tdd-red-check': token}
//     — 'tdd-red-check' is a RESERVED key: its token re-adjudicates the red-check on resume
//       (cache-bust only; carries no meaning). Same TOKEN_RE, same cumulative semantics.
//   waivers: [{path: string, evidencePath: string}]   // optional, default []
//     — path: a testBatches[].files[].path adjudicated by a human as exempt from its
//       red/green expectation; evidencePath: on-disk record of the verbatim evidence and
//       ruling (conventionally the deviations sidecar). Both are paths — closed alphabet.
//   tddEvidencePath: string
//     — REQUIRED (non-empty) iff tdd === false: the on-disk record justifying the disarm
//       (a genuinely TDD-free spec conventionally points at the spec itself).

// named functions (evalFns-extractable via extractFn — position-independent; signatures are
// the test contract)
function redCheckPrompt(redExpected, greenExpected, gate, salt)
//   pure; declared IMMEDIATELY AFTER phase('RedCheck') so the prompt prose stays inside the
//   region tests slice as [phase('RedCheck') … 'FAIL CLOSED');
//   salt '' → no token line, byte-identical output for identical inputs;
//   salt 'x' → exactly one added line containing 'x'
function assertWaivers(waivers, testBatches)
//   throws unless every entry: path matches some testBatches[].files[].path AND
//   evidencePath is a non-empty string; message names 'evidence'; returns waivers
function applyWaivers(expectations, waivers)
//   returns expectations minus entries whose path is waived; never mutates input

// single-binding rule (D3): expectations is computed ONCE, post-waiver —
//   const expectations = applyWaivers(args.testBatches.flatMap(…), args.waivers)
// and that SAME binding feeds redExpected/greenExpected AND crossCheckSentinels(expectations, …).

// call-site wiring (D1): the RedCheck agent() call dispatches
//   agent(redCheckPrompt(redExpected, greenExpected, args.gate,
//         (args.resolutions || {})['tdd-red-check'] || ''), { label: 'red-check', … })

// terminal return (complete / gate-exhausted only)
return {
  stage: loopResult.pass ? 'complete' : 'gate-exhausted',
  tdd: args.tdd !== false,             // false = the red-first floor was off for this run
  waivedFiles: [/* waived paths, [] when none */],   // NEVER named `waived` — collides with
                                       // the review ledger's findings-nested field pin
  tddEvidence: '',                     // args.tddEvidencePath when tdd was false
  ...
}

// build.md ledger build-row schema (durable provenance, shared with fast-path runs):
//   adds "tdd" and "waivedFiles" to the pinned field list at ~line 306
```

## Behavior

A `tdd-red-check` stop now resolves down exactly one of three routes, none of which is
a trace-free `tdd: false`:

1. **The tests were wrong** (the dominant case — content edited, paths and expectations
   unchanged): orchestrator repairs the files, sets `resolutions['tdd-red-check']` to a
   fresh token, resumes with `resumeFromRunId`. The token reaches `redCheckPrompt` as its
   `salt`, the prompt differs, the cache re-dispatches, the probe re-observes. Completed
   batches still replay from cache untouched.
2. **The check is wrong about a specific file** and a human has adjudicated it (verbatim
   diagnostics read, ruling made): the ruling + evidence is recorded on disk, a
   `waivers: [{path, evidencePath}]` entry points at it, resume. The waived path leaves
   the single `expectations` binding before the split, which changes the prompt's file
   lists — self-busting, no token needed — and never reaches `crossCheckSentinels`. If
   every red-expected file is waived, the probe is skipped down the existing
   sanctioned-green path, with `waivedFiles` still echoed.
3. **The spec is wrong** — unchanged: retainer diagnosis, spec edit, then route 1.

Disarming TDD outright (`tdd: false`) remains possible only as an up-front, Phase 0
declaration and now throws at args validation without a `tddEvidencePath`. The fast path
mirrors the discipline without the mechanisms: no cache exists, so re-running is free,
and a waiver there is a deviations-sidecar record echoed in the shared ledger row.

No laundering hole: a waived file is exempted only from the red-check *probe* — the
deterministic Gate phase still runs the host's whole gate command, so a
waived-but-actually-broken test still fails the build and routes through the normal
repair loop (confirmed against `runGateLoop`'s mechanics at adversarial check).

Edge pins: a waiver whose `path` matches no batch file throws (typo guard, never a
silent no-op); a waiver without `evidencePath` throws (the waiver's price IS the record);
`applyWaivers` treats green-expected files identically; `crossCheckSentinels` is not
modified by this spec.

## Acceptance Criteria

- **AC-20260817-03-1**: WHEN `redCheckPrompt` is called twice with identical expectations
  and gate but salts `'r1'` vs `'r2'` THE SYSTEM SHALL return different strings, each
  containing its own salt (literal: `redCheckPrompt(E, G, gate, 'r1') !==
  redCheckPrompt(E, G, gate, 'r2')`, and the `'r2'` output contains `'r2'`) → prompt-salt
  test in tests/redcheck-resume-waiver.test.js
- **AC-20260817-03-2**: WHEN `redCheckPrompt` is called with salt `''` THE SYSTEM SHALL
  return byte-identical output for identical inputs with no added token line (literal:
  two same-input calls → `===`, and the `''` output equals the `'r1'` output minus
  exactly the one line containing `'r1'`) → first-run stability test in
  tests/redcheck-resume-waiver.test.js
- **AC-20260817-03-3**: WHEN `args.waivers` waives one of two red-expected files THE
  SYSTEM SHALL exclude exactly it (literal:
  `applyWaivers([{path:'tests/a.test.js',expect:'red'},{path:'tests/b.test.js',expect:'red'}],
  [{path:'tests/a.test.js',evidencePath:'d.md'}])` → only `tests/b.test.js` remains) →
  applyWaivers test in tests/redcheck-resume-waiver.test.js
- **AC-20260817-03-4**: WHEN a waiver entry has no non-empty `evidencePath` THE SYSTEM
  SHALL throw at args validation with a message naming the missing evidence (literal:
  `assertWaivers([{path:'tests/a.test.js'}], batchesContainingIt)` → throws matching
  `/evidence/i`) → assertWaivers evidence test in tests/redcheck-resume-waiver.test.js
- **AC-20260817-03-5**: WHEN a waiver's `path` matches no `testBatches[].files[].path`
  THE SYSTEM SHALL throw at args validation naming the unmatched path (literal:
  `assertWaivers([{path:'tests/typo.test.js', evidencePath:'d.md'}], batchesWithoutIt)`
  → throws matching `/typo\.test\.js/`) → typo-guard test in
  tests/redcheck-resume-waiver.test.js
- **AC-20260817-03-6**: WHEN a run reaches the terminal `complete`/`gate-exhausted`
  return THE SYSTEM SHALL include flat `tdd`, `waivedFiles`, and `tddEvidence` fields in
  that return object (literal: source matches
  `/return \{\s*stage: loopResult\.pass \? 'complete' : 'gate-exhausted',[^}]*tdd[^}]*waivedFiles/`)
  → the three retagged pins in tests/tdd-waiver-provenance.test.js
- **AC-20260817-03-7**: WHEN every red-expected file is waived THE SYSTEM SHALL skip the
  red-check probe down the existing sanctioned-green path (literal: source computes
  `redExpected` FROM the post-`applyWaivers` `expectations` binding, so waiving the only
  red file yields `redExpected.length === 0`) → probe-skip ordering test in
  tests/redcheck-resume-waiver.test.js
- **AC-20260817-03-8**: WHEN a blocked batch's `resolutions[batchId]` token is set THE
  SYSTEM SHALL CONTINUE TO thread it into that batch's worker prompts (literal:
  `batchPrompt`, `repairPrompt`, and `testPrompt` each read
  `(args.resolutions ‖ {})[b.id]`) → green source pin in
  tests/wf-build-resolutions-threading.test.js
- **AC-20260817-03-9**: WHEN an orchestrator reads the `tdd-red-check` verdict row in
  build.md THE SYSTEM SHALL present both sanctioned exits and forbid `tdd: false` as the
  stop exit (literal: the row matches `/resolutions\['tdd-red-check'\]/` and `/waivers/`
  and `/never.{0,80}tdd: ?false|tdd: ?false.{0,80}never/i`) → doctrine pin in
  tests/redcheck-resume-waiver.test.js
- **AC-20260817-03-10**: WHEN the RedCheck phase dispatches its probe THE SYSTEM SHALL
  build the prompt via `redCheckPrompt` with the reserved-key salt at the real call site
  (literal: the RedCheck region matches `/agent\(\s*redCheckPrompt\(/` and
  `/\(args\.resolutions \|\| \{\}\)\['tdd-red-check'\] \|\| ''/`) → call-site wiring pin
  in tests/redcheck-resume-waiver.test.js
- **AC-20260817-03-11**: WHEN some but not all red-expected files are waived THE SYSTEM
  SHALL cross-check only the post-waiver expectation set (literal: source assigns
  `expectations` via `applyWaivers(`, and the `crossCheckSentinels(` call's first argument
  is that same `expectations` identifier — no second unfiltered list exists) →
  single-binding pin in tests/redcheck-resume-waiver.test.js
- **AC-20260817-03-12**: WHEN the fast path hits a red-check mismatch THE build doctrine
  SHALL route it through the same evidence-priced discipline (literal: the fast-path
  red-check step's text matches `/waiv/i` and `/deviations|ledger/i`) → fast-path parity
  pin in tests/redcheck-resume-waiver.test.js
- **AC-20260817-03-13**: WHEN `args.tdd === false` and `tddEvidencePath` is absent or
  empty THE SYSTEM SHALL throw at args validation (literal: the validation throws
  matching `/evidence/i` for `{tdd: false}` without `tddEvidencePath`; `{tdd: false,
  tddEvidencePath: 'specs/x.md'}` passes) → disarm-pricing test in
  tests/redcheck-resume-waiver.test.js
- **AC-20260817-03-14**: WHEN build.md's ledger build-row schema is read THE SYSTEM
  SHALL list `"tdd"` and `"waivedFiles"` among its fields (literal: the existing
  field-list pin's loop gains both strings and passes) → extended schema pin in
  tests/run-ledger.test.js

## Assumptions (escalation triggers)

- A1: The workflow journal cache re-dispatches an `agent()` call iff its `(prompt, opts)`
  bytes changed — ratified by the `blocked` verdict's `resolutions[batchId]` mechanism
  working in production across three hosts (build.md row 200 doctrine) — **if false:**
  the existing blocked resume path is equally broken; STOP and escalate to JJ, this
  spec's mechanism is the wrong layer.
- A2: `assertResolutions`' TOKEN_RE (`/^[A-Za-z0-9._\/:@=-]+$/`) accepts counter/hash
  tokens for the reserved key unchanged; the key side is unvalidated (`Object.keys`
  loop), and no code iterates `resolutions` expecting batchIds (verified: only keyed
  `[b.id]` lookups) — **if false:** pick tokens inside the existing alphabet; never
  widen the regex.
- A3: Appending the two-exit text to build.md's `tdd-red-check` row keeps the existing
  row-content pins green (AC-20260815-06-11's segment regexes, the RETIRED_SANCTION
  absence pin, `tests/redcheck-new-package.test.js`'s exception-row pins) — the edit
  adds sentences and retires none of the pinned phrases — **if false:** reword the
  addition; never weaken a pin (host escalation trigger).
- A4: The three JJ-20260816-02 pin regexes go green from D3/D5/D10 by construction
  (`assertWaivers` satisfies `/waiv/i` and waiver-near-evidence; D5 satisfies the
  terminal-return regex) — **if false:** the tightened retag in the same batch
  supersedes the loose regexes; the invariant, not the regex, is the contract.
- A5: Version 6.87.0 may be taken by a concurrent session at build time — the literal is
  a target, not a pin (standing gotcha); the build bumps to the next free version and
  logs the deviation.
- A6: A batch id literally named `tdd-red-check` would collide with the reserved key —
  accepted: batch ids here are orchestrator-generated (`tests-1`, `doctrine-1`, …), the
  args comment documents the reservation, and the worst case is a redundant re-run,
  never a skipped check — **if false (a host hits it):** rename the batch id.
- A7: Five test files pin red-check prompt prose by slicing
  `[phase('RedCheck') … 'FAIL CLOSED')` over the body source
  (tests/redcheck-typecheck-leg.test.js, tests/redcheck-workspace-paths.test.js,
  tests/redcheck-green-carriers.test.js, tests/workflows/red-check-sentinel.test.js,
  tests/redcheck-load-failure-attribution.test.js) — D2's in-region placement keeps them
  green, including the two absence pins that would otherwise pass vacuously — **if
  false (any goes red or its region empties):** fix the placement, never the pins; a
  vacuously-green absence pin is a silent weakening and blocks the batch.
- A8: tests/report/return-slots.test.js pins zero bare-word `runId` occurrences in
  wf-build.body.js — every new comment writes `resumeFromRunId` (which survives the word
  boundary), never bare `runId` — **if false:** reword the comment.
- A9: tests/workflow-runid-provenance.test.js (JJ-20260814-02) is a deliberate
  EXPECTED-RED backlog pin on build.md's runId-source resume wording; this spec's
  build.md edits must leave that pin red and its target sentence untouched — **if
  false (the pin turns green or moves):** revert the wording drift; opportunistically
  closing someone else's backlog pin is out of scope and corrupts the suite baseline.

## Rationale

The defect is one class seen from two sides. From the resume side: the red-check
`agent()` call is the only stop-producing stage in wf-build whose prompt is built purely
from `testBatches` paths + gate commands, so the dominant repair action — editing test
file content — cannot change the prompt, and the journal cache faithfully replays the
stale stop verdict forever. From the escape side: the only lever that ends the loop is
`tdd: false`, which disarms the red-first floor for the whole run and leaves no trace.
The fix adds no new concept: D1 generalizes the ratified `resolutions` cache-bust to a
reserved key; D3's waiver reuses the per-unit shape the JJ-20260816-02 pins point at,
priced at an on-disk evidence record because args is a closed alphabet; D10 prices the
remaining boolean the same way.

Adversarial-check dispositions (2 refuters + 1 blind-spot sweep; all findings fixed or
recorded): (fixed) unwired-`redCheckPrompt` risk → D1 call-site literal + AC-10;
(fixed) partial-waiver stale-expectations hole → D3 single-binding + AC-11; (fixed)
`tdd:false` prose-only → D10 + AC-13; (fixed) evidence-citation honesty → Goal reworded:
the UpWell run is session-relayed and unledgered, the cache-replay claim stands on
source structure both refuters independently confirmed, TRADOYO is lever-precedent only;
(fixed) five region-sliced pin files → D2 in-region placement + A7; (fixed) ephemeral
provenance → D5 ledger fields + AC-14, field named `waivedFiles` to dodge the review
ledger's `waived` nesting pin; (fixed) shared.md stale resume restatement → File Plan
row; (fixed) fast-path unreachable exits → D6 parity clause + AC-12. (Rejected)
laundering concern — a waived file is still executed by the Gate phase's whole-suite
command, so waiver cannot hide a broken test (verified against `runGateLoop`).
(Recorded waives, collision-closure run with `--literal lever --literal escape`:
tests/consistency/drift-reconcile.test.js pins phrase-consistency invariants none of
this spec's additive sentences touch; tests/claims-lint-baseline-path.test.js pins the
baseline *path*, which is regenerated in place, not moved.)

Deferred, recorded: wf-design's identical cached-stop class (no `resolutions` arg at
all) — named open in D9's ledger row, staged for its own intake/spec; review-side
consumption of the D5 provenance fields — the artifacts now carry the signal, wiring
review to act on it waits for a demonstrated miss. Fragile to watch: the build.md row
201 edit sits inside a row three test files pin (A3), and the RedCheck-region function
placement (A7) is the one implementation detail that looks refactorable but is
load-bearing.

## Canonical Delta

None — this repo keeps no `docs/canonical/` area docs; the doctrine surfaces edited
(build.md, shared.md, scaffold-ledger.md, INTAKE.md) are themselves the canonical record.
