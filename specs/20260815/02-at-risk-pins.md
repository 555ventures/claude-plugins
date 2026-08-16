---
date: 2026-08-15
status: done
diff_base: e3ebaa871c799cbf95d51f2f7287d32264edfae3
open_markers: 0
risk: T3
area: review-integrity
design: false
breaking: false
depends_on: []
depended_on_by: ["specs/20260815/03-ac-matrix-fail-closed.md"]
brief: n/a
---

# At-risk pins — the scoped gate's compensating derivation

## Goal

A Decision that changes what a shared script returns reddens the suites that pinned the old
behavior — and because every gate is scoped to the spec's own File Plan test rows, neither the
build gate nor the review panel ever executes them (escape `wf_e1da0ea6-94c`: five pins, two
files, zero signal, found by hand 12 minutes after a CLEAN-with-qualifier; INTAKE
JJ-20260815-03). Scoping stays — it is deliberate and load-bearing (red-pin baseline, host
rules § Test Rules) — but it gains the compensating derivation it always owed: review
mechanically derives which test files elsewhere reference the changed source files, **runs
them**, and turns failures into ordinary review findings the session adjudicates
(JJ 2026-08-15 ruling: run, never list-only, never a pre-panel stop). Done = the derivation is
in `scope-reconcile.js` behind executable pins, review carries the `at-risk` leg as a required
full-scope manifest row, `tests/scoped-gate-behavior-collision.test.js` runs green, and
JJ-20260815-03 is stamped fixed.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `spec/scripts/scope-reconcile.js` gains the at-risk derivation, emitted as an **additive `atRisk` field** in `--json` output (shape in Contracts). Matching is **path-stem based, deliberately language-agnostic** (JJ 2026-08-15 stack-neutrality ruling): for each changed file that is neither test-classified (D5's `testGlobs`), pipeline-owned, nor a rename-from path, its stems are (a) the repo-relative path, (b) the path minus its last extension, (c) the last-two-segments form minus extension — form (c) only when the path has ≥2 segments, so a bare basename like `index` never becomes a stem. A candidate test file is at-risk when its content contains any stem AND it is not resolved by the spec's File Plan tests rows (Layer == `tests` rows via `lib/file-plan.js`'s `parseFilePlanRows` — the layer-aware parser ac-matrix.js already imports, not the layer-blind `parseFilePlan` scope-reconcile uses for plan paths today; exact path or `lib/glob-match.js` glob) AND it is not itself in the changed set. Candidates come from a repo walk that always skips `.git` and `node_modules`. | The File Plan names the source files being changed, so the suites at risk are mechanically derivable — the retired-literal anchor's shape applied to behavior instead of text; symbol-level matching was rejected as language-shaped (D9). One derivation home: this script already owns the changed set (host rules § Risk Tiers — never a second derivation). |
| D2 | scope-reconcile's **exit-code alphabet and existing JSON fields are byte-compatible**: exit stays `0 / 3 (outOfPlan non-empty) / 2 (usage)`; `atRisk` never affects the exit code; `--dirs` output is untouched. | at-risk is substrate for a *different* leg's run, not a reconcile finding; existing consumers (review step 2, build Final gate, `tests/scope-reconcile-glob-rows.test.js`) keep their contracts unmoved. |
| D3 | `spec/commands/review.md` Phase 0 gains the **`at-risk` leg** in step 3's parallel batch: read `{reconcilePath}`'s `atRisk` field; when non-empty, run the host's `testCommand` with the at-risk files appended (cwd `{root}`) — the same file-path contract the verifier agents already rely on — and append `{"leg":"at-risk","exit":<runner exit>,"observed":"files=<N>"}`. `files=0` → no run, exit 0. No `testCommand` in config → exit 0, `observed:"unavailable — host declares no testCommand"`. A red at-risk leg yields ONE mechanical **hard** finding — "at-risk pins red: pins that live outside the scoped gate failed on this diff; {failing files/digest, session-extracted from runner output}" — entering Phase 2 dispositions like reconcile's out-of-plan finding; a pre-existing sanctioned red (e.g. this repo's INTAKE pins) is a five-second waive naming the pin. **Never a step-8 pre-panel stop.** On `scope: "fix-delta"` the leg is skipped entirely, exactly like `reconcile`. The finding sentence bar-matches claims-lint (`hard finding`, case-insensitive pattern) and carries `<!-- enforcedBy: spec/scripts/scope-reconcile.js -->`; the never-blocks clause carries `<!-- enforcedBy: spec/scripts/verdict.js -->` — note claims-lint's `NEVER` pattern is uppercase-only (refuter-executed), so the marker there is belt-and-braces for whichever casing the worker writes, not a gate requirement. | The user chose executed evidence over a warning list (2026-08-15): a listed-only at-risk file is how the escape survived two process layers. The finding-not-blocking shape is what keeps the red-pin baseline livable; unmarked bar-matching claims fail the claims-lint orphan check. |
| D4 | `spec/scripts/verdict.js`: `'at-risk'` joins `REVIEW_LEGS` (required on full scope — an absent leg derives `UNVERIFIED`, the same fail-closed presence rule the oracle-leg check established); the fix-delta filter excludes it alongside `reconcile`; it does NOT join `REVIEW_BLOCKING`; the D4 `CLEAN-with-qualifier` unavailable-leg check widens from `('ci','gate')` to include `'at-risk'` (honest `unavailable — no testCommand` must not read as plain CLEAN). **Self-application:** this very change alters what verdict.js returns for manifests without an at-risk row, reddening every suite that builds a full green manifest or byte-pins the leg list — the adversarial check executed the exact patch and enumerated FOUR: `tests/review/verdict.test.js` (the SIX_GREEN fixture, ~15 dependent tests), `tests/terminal-observable-acs.test.js` (byte-exact six-leg array pin — a prior spec's added-no-leg assertion, not a permanent invariant), `tests/capabilities/verdict-qualifier.test.js` (`GREEN_REVIEW_LEGS` manifests, observed flipping CLEAN → UNVERIFIED under the patch), and `tests/review/smell-lens.test.js` (`greenManifest()`, feeds two AC pins) — suites this spec's own gate would not run. All four are File Plan rows, retargeted in place, never weakened. (`tests/run-ledger.test.js`, initially assumed affected from the founding escape's row, contains only doctrine-prose pins today — refuted with the file read in full; it is deliberately NOT a row.) | Required-but-not-blocking is exactly `reconcile`'s standing; fail-closed presence prevents the silently-never-ran hole. The self-application is deliberate and twice-corrected: this spec is the first consumer of its own sweep, and the executed adversarial pass — not the hand grep — produced the authoritative redden list. |
| D5 | New **optional top-level config key `testGlobs`** (array of globs enumerating the repo's test universe), read by scope-reconcile.js only. Default when absent: `["tests/**", "test/**", "**/*.test.*", "**/*.spec.*", "**/*_test.*"]` — covers dir-rooted and colocated conventions across stacks. A file matching `testGlobs` is (a) an at-risk candidate and (b) excluded from the stem-trigger side when it is itself changed. Documented in init.md's worked-example config using the **top-level optional-key style: a comment line above the key** (the `driftScript` precedent — the inline `// OPTIONAL:` trailing form is the nested-runtime-key style, refuter-corrected); `spec/templates/grounding-contract.md` is NOT touched (additive key with behavior-preserving defaults, internal to one script — not part of the host-facing contract's assertions). | Hosts' test layouts differ; a declared universe with a defaults floor is the stack-agnostic form. Grounding-contract edits flag every host stale — out of bounds for a key that changes no certification. |
| D6 | `spec/doctrine/scaffold-ledger.md` gains the **at-risk leg row**: mechanism = derivation in scope-reconcile.js + executed run at review, adjudicated as findings (ADVISORY-adjudicated, never auto-blocking). PROMOTE to a blocking leg if a review's at-risk finding is confirmed as a real cross-suite breakage that would otherwise have shipped (one confirmed catch suffices — the class has a hard escape behind it). RETIRE if 25 consecutive ledgered full-scope reviews across hosts report `files=0`, or if every at-risk finding across 10 consecutive reviews is waived as a pre-existing sanctioned pin (pure noise). No blank line enters the table region. | Every new mechanism owes a ledger row with promote/retire conditions (doctor check 13); the conditions anchor to signals the ledger actually records. |
| D7 | `spec/commands/build.md` Final gate: one clause — the advisory print of scope-reconcile's JSON now also names the `atRisk` count ("N at-risk pins outside this spec's gate — review will run them"). No build-time run, no gate effect. | Prevention visibility at near-zero cost; the executed run stays review-owned so build wall-clock is untouched. |
| D8 | `spec/.claude-plugin/plugin.json` bumps with a changelog description naming the leg — target 6.78.0 (target, not a pin: 20260814/03+05 and 20260815/01 are hardened-unbuilt targeting 6.75–6.77 and build takes the next free number). `spec/doctrine/claims-baseline.json` is re-stamped via `node "$(spec-paths claims-lint)" --update-baseline` (full-corpus rescan) in the same commit — review.md and build.md line counts move. `spec/INTAKE.md` row JJ-20260815-03 flips `open | —` → `fixed` with the landed version, same commit (intake contract: a stale Fixed-in column lies to every host doctor at once). | Version/claims/intake discipline per host rules and the intake ledger's own header contract. |
| D9 | v1 deliberately does NOT: add a plan-time derivation (out-of-plan edits — the common case in fixes, and present in the founding escape's class — never appear in a plan; the review-side run catches planned and unplanned changes alike; reopen if a collision ships that a plan-time sweep would have caught and review's did not); do symbol-level matching (an "exported symbol" means different things per language — reopen with a recorded miss if a real collision evades path stems, and record the measurement); treat changed test-classified files (e.g. shared test helpers) as stem triggers (accepted residual — reopen on a real helper-borne collision); change `wf-review`'s **args contract** (the leg is a Phase 0 session leg, manifest-row-shaped like `patterns`) — the ONE workflow-source touch is descriptive: the reviewer-prompt sentence in `spec/workflows/src/wf-review.body.js` describing `{reconcilePath}`'s shape gains the `atRisk` clause so the panel's description of the file stays true (generated `wf-*.js` is never a File Plan row; `npm run build:workflows` regenerates and the gate's `--check` enforces it). | Each exclusion carries its reopen condition; a prompt that under-describes a file it tells agents to Read is this repo's miscitation class in miniature. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/scope-reconcile.js | MODIFY | scripts | D1/D2/D5: at-risk derivation, additive `atRisk` JSON field, `testGlobs` read with defaults |
| spec/scripts/verdict.js | MODIFY | scripts | D4: `at-risk` into REVIEW_LEGS, fix-delta filter, unavailable-qualifier set |
| spec/commands/review.md | MODIFY | doctrine | D3: at-risk leg in Phase 0 step 3; finding wording includes "pins that live outside the scoped gate" (the doctrine pin's grammar) |
| spec/commands/build.md | MODIFY | doctrine | D7: Final-gate advisory clause naming the atRisk count |
| spec/commands/init.md | MODIFY | doctrine | D5: testGlobs in the worked-example config, comment-above-key style (driftScript precedent) |
| spec/workflows/src/wf-review.body.js | MODIFY | workflows | D9: reviewer-prompt's `{reconcilePath}` shape description gains the `atRisk` clause; regenerate via `npm run build:workflows` |
| spec/doctrine/scaffold-ledger.md | MODIFY | doctrine | D6: at-risk leg row with promote/retire conditions |
| spec/doctrine/claims-baseline.json | MODIFY | doctrine | D8: full-corpus `--update-baseline` re-stamp, same commit |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D8: bump + changelog description (target 6.78.0) |
| spec/INTAKE.md | MODIFY | other | D8: JJ-20260815-03 → fixed @ landed version, same commit |
| .claude/suite-baseline.json | MODIFY | other | D8 companion (in-flight): drop the JJ-20260815-03 sanctioned-red row the D3 landing turns green. Removed surgically, NOT via `--update` — a wholesale rewrite would also sanction the unrelated pre-existing red in tests/feedback-loop.test.js (a stale INTAKE pin naming a nonexistent tests/tdd-waiver-provenance.test.js), which Phase 4's disposition says to WARN on, never absorb |
| tests/scope-reconcile-at-risk.test.js | CREATE | tests | AC-20260815-02-1 … AC-20260815-02-5 (red-first, synthetic host trees) |
| tests/review/verdict.test.js | MODIFY | tests | AC-20260815-02-6, AC-20260815-02-7, AC-20260815-02-8, AC-20260815-02-9: SIX_GREEN fixture gains the at-risk row; ledger-field pins stay green unweakened (D4 self-application) |
| tests/capabilities/verdict-qualifier.test.js | MODIFY | tests | D4 self-application: `GREEN_REVIEW_LEGS` manifests gain the at-risk row; CONTINUE TO tag AC-20260815-02-9 |
| tests/review/smell-lens.test.js | MODIFY | tests | D4 self-application: `greenManifest()` gains the at-risk row; its two verdict-word pins stay green unweakened; CONTINUE TO tag AC-20260815-02-9 |
| tests/scoped-gate-behavior-collision.test.js | MODIFY | tests | AC-20260815-02-10: tag the intake pin (goes green via D3's wording) |
| tests/scope-reconcile-glob-rows.test.js | MODIFY | tests | AC-20260815-02-11: CONTINUE TO tags on existing field/exit pins |
| tests/terminal-observable-acs.test.js | MODIFY | tests | AC-20260815-02-13: retarget the byte-exact REVIEW_LEGS pin to the seven-leg array, unweakened (D4 self-application) |
| tests/clean-row-survivor-consistency.test.js | MODIFY | tests | A4 in-flight row (D4 self-application, found by Phase 4's pre-image check): six-leg manifest fixtures gain the at-risk row; CONTINUE TO tag AC-20260815-02-9 |
| tests/verdict-gatered-no-workflow.test.js | MODIFY | tests | A4 in-flight row (D4 self-application): six-leg manifest fixtures gain the at-risk row; CONTINUE TO tag AC-20260815-02-9 |
| tests/suite-baseline/doctrine.test.js | MODIFY | tests | A4 in-flight row: six-leg manifest fixture gains the at-risk row (AC-20260815-02-9); step-8 findings-producing-legs regex retargeted to the at-risk-bearing list (AC-20260815-02-14) |

## Contracts

```
# scope-reconcile.js --json output (D1/D2 — additive field, existing fields byte-compatible)
{
  outOfPlan: [...], unrealized: [...], excluded: [...], renamed: [...],   # unchanged
  atRisk: [ { file: "tests/review/verdict.test.js",                       # sorted by file
              refs: ["spec/scripts/verdict.js"] } ]                       # changed files whose
}                                                                         # stems matched; [] when none
# stems for changed file "spec/scripts/verdict.js" (D1):
#   "spec/scripts/verdict.js" · "spec/scripts/verdict" · "scripts/verdict"
# candidate universe: repo walk (skip .git, node_modules) filtered by testGlobs
# exclusions: File Plan tests-rows resolution (exact + glob via lib/glob-match.js), changed set

# .claude/spec.config.json (D5 — optional, top-level, additive)
"testGlobs": ["tests/**", "test/**", "**/*.test.*", "**/*.spec.*", "**/*_test.*"]  # = default

# review.md at-risk leg manifest row (D3)
{"leg":"at-risk","exit":<runner exit>,"observed":"files=<N>"}
{"leg":"at-risk","exit":0,"observed":"unavailable — host declares no testCommand"}

# verdict.js (D4)
REVIEW_LEGS = ['gate','smoke','reconcile','ac-matrix','skip-reconcile','ci','at-risk']
fix-delta required = REVIEW_LEGS minus 'reconcile' minus 'at-risk'
REVIEW_BLOCKING unchanged: {'gate','smoke','ci'}
CLEAN-with-qualifier unavailable-leg set: 'ci' | 'gate' | 'at-risk'
```

## Behavior

- Derivation flow (inside scope-reconcile, after the existing outOfPlan/unrealized
  computation): classify changed files via `testGlobs` → build stems for the non-test,
  non-excluded, non-rename-from remainder (deleted files included — a test referencing a
  deleted file is at risk by definition) → walk the repo once (skip `.git`, `node_modules`),
  filter to candidates → substring-scan candidates for stems → subtract File Plan tests-rows
  resolution and the changed set → sort, emit.
- Review flow: step 2 (reconcile) completes sub-second as today; the at-risk run joins step
  3's parallel batch reading `{reconcilePath}`. Runner failure detail is session-extracted
  from the run output for the finding text (no universal failure-name format exists — same
  honesty rule as skip names); the manifest row carries only counts.
- Scale guard: stems are plain substring scans over candidate files only; the one repo walk
  is shared with nothing (ac-matrix walks its own) — measured trees here are ~800 files.

## Acceptance Criteria

- **AC-20260815-02-1**: WHEN a changed source file's stem appears in a test file outside the
  spec's File Plan tests rows THE SYSTEM SHALL list it in `atRisk` with its refs (literal: in a
  synthetic tree, changed `spec/scripts/verdict.js`, File Plan tests row `tests/capabilities/*`,
  and `tests/review/verdict.test.js` containing `require('../../spec/scripts/verdict')` →
  `atRisk == [{file:"tests/review/verdict.test.js",refs:["spec/scripts/verdict.js"]}]`) →
  red-first exec test in tests/scope-reconcile-at-risk.test.js
- **AC-20260815-02-2**: WHEN the referencing test file is resolved by a File Plan tests row
  (exact or glob) THE SYSTEM SHALL exclude it from `atRisk` (literal: same tree, tests row
  `tests/review/*` → `atRisk == []`) → tests/scope-reconcile-at-risk.test.js
- **AC-20260815-02-3**: WHEN no candidate test file contains any changed file's stem THE
  SYSTEM SHALL emit `atRisk: []` and exit codes/existing JSON fields identical to today →
  tests/scope-reconcile-at-risk.test.js
- **AC-20260815-02-4**: WHEN a changed file is itself test-classified per `testGlobs` THE
  SYSTEM SHALL NOT derive stems from it, and SHALL NOT list it in `atRisk` (literal: changed
  `tests/helpers.js` referenced by other tests → `atRisk == []`) →
  tests/scope-reconcile-at-risk.test.js
- **AC-20260815-02-5**: WHEN a stem match exists only under `node_modules/` THE SYSTEM SHALL
  NOT list it (the walk never enters `.git` or `node_modules`) →
  tests/scope-reconcile-at-risk.test.js
- **AC-20260815-02-6**: WHEN a full-scope review manifest lacks an `at-risk` row THE SYSTEM
  SHALL derive `UNVERIFIED` (literal: today's green six-leg manifest + workflow → currently
  CLEAN, post-change UNVERIFIED) → red-first case in tests/review/verdict.test.js
- **AC-20260815-02-7**: WHEN the `at-risk` row is red (exit 1) and all blocking legs are green
  THE SYSTEM SHALL NOT derive `GATE_RED` (the finding flows to dispositions, matching
  `reconcile` exit-3 standing; literal: seven-leg manifest with `{"leg":"at-risk","exit":1}` +
  workflow with zero survivors → CLEAN-family word, exit 0) → tests/review/verdict.test.js
- **AC-20260815-02-8**: WHEN scope is `fix-delta` and the manifest lacks both `reconcile` and
  `at-risk` rows THE SYSTEM SHALL still derive from the remaining required legs →
  tests/review/verdict.test.js
- **AC-20260815-02-9**: WHEN a full-scope manifest carries `{"leg":"at-risk","exit":0,
  "observed":"files=0"}` THE SYSTEM SHALL CONTINUE TO derive the same verdict words and
  ledger row fields (smoke/testsSkipped/legs) existing pins assert →
  tests/review/verdict.test.js + tests/capabilities/verdict-qualifier.test.js +
  tests/review/smell-lens.test.js (fixtures gain the row; assertions unweakened)
- **AC-20260815-02-10**: WHEN the doctrine corpus is scanned for the behavior-collision
  obligation THE SYSTEM SHALL satisfy the intake pin (review.md's D3 wording names "pins that
  live outside the scoped gate") → tests/scoped-gate-behavior-collision.test.js (tagged; green
  on D3 landing)
- **AC-20260815-02-11**: WHEN scope-reconcile runs against the existing glob-row fixtures THE
  SYSTEM SHALL CONTINUE TO emit the existing outOfPlan/unrealized/excluded/renamed fields and
  exit codes byte-compatibly → tests/scope-reconcile-glob-rows.test.js (tagged)
- **AC-20260815-02-12** `[oracle: gate]`: WHEN the scoped suite for this spec runs THE SYSTEM
  SHALL pass it — the leg is the honest oracle for the doctrine-file edits (claims baseline,
  scaffold ledger, init.md's example line, wf-review regeneration via the gate's `--check`)
  no unit test asserts individually
- **AC-20260815-02-14**: WHEN review.md step 8's closing sentence enumerating the legs that
  never trigger the pre-panel hard stop is read THE SYSTEM SHALL name `at-risk` among them
  (literal: ``Findings-producing legs (`reconcile`, `ac-matrix`, `skip-reconcile`, `suite`,
  `at-risk`)``) — D3's never-a-step-8-pre-panel-stop clause stated where review.md declares
  which legs are non-blocking → tests/suite-baseline/doctrine.test.js (retargeted regex)
- **AC-20260815-02-13**: WHEN verdict.js source is scanned THE SYSTEM SHALL expose the
  seven-leg `REVIEW_LEGS` array (literal:
  `['gate', 'smoke', 'reconcile', 'ac-matrix', 'skip-reconcile', 'ci', 'at-risk']`) →
  tests/terminal-observable-acs.test.js (retargeted byte-exact pin, red-first post-retarget
  until D4 lands)
- **AC-20260815-02-15**: WHEN a changed file's stem forms would not discriminate — the empty
  string (a root dotfile such as `.gitignore` strips to `''` under the last-extension regex,
  and `content.includes('')` is vacuously true for every candidate) or a bare single-segment
  basename (`index.js` → `index`, `package.json` → `package`) — THE SYSTEM SHALL NOT emit them
  as stems, so unrelated test files are never listed in `atRisk`; the full repo-relative path
  (form (a)) is always emitted, so a root-level file stays matchable by its literal path →
  red-first exec tests in tests/scope-reconcile-at-risk.test.js (added at review 2026-08-16;
  D1's own guard clause — "so a bare basename like `index` never becomes a stem" — was written
  on form (c) only, and form (b) reproduced the degeneracy for 1-segment paths)

## Assumptions (escalation triggers)

- A1: `testCommand` accepts appended file paths — already the documented contract review.md
  relies on for verifier repro files — **if false** on some host: the leg's `unavailable`
  path (D3) is the honest degrade; never guess a runner syntax.
- A2: path-stem substring matching catches real reference forms (require/import/open-by-path)
  — spike-adjacent evidence: the founding escape's two suites both contain the two-segment
  stem `scripts/verdict` — **if false** (a collision evades stems): D9's reopen, record the
  miss verbatim.
- A3: one repo walk skipping `.git`/`node_modules` is fast enough at host scale (~sub-second
  at 10k files) — **if false**: cap candidates via `testGlobs` dir prefixes first; never
  silently sample (log what was dropped).
- A4: verdict.js required-leg extension reddens exactly the four File-Plan-named suites —
  established by the adversarial pass EXECUTING the patch (copied verdict.js + `'at-risk'`
  in REVIEW_LEGS: the six-leg green manifest flipped CLEAN → UNVERIFIED) and grepping
  `REVIEW_LEGS` across tests/ in full; the additive `atRisk` JSON key is separately safe by
  construction (no whole-object `deepStrictEqual(out, …)` exists anywhere in tests/) —
  **if a fifth suite reddens at build**: it becomes a File Plan row in-flight, recorded as a
  deviation. (Plan-time lesson recorded: the first hand sweep both included a false target
  and missed two real ones; the executed patch is the only sweep form this spec should trust,
  which is exactly the run-not-list argument behind D3.)

## Rationale

The fix inverts the gap's own geometry: the scoped gate is prediction ("these suites cover
this spec"), and this leg is the prediction-under-test for *behavior*, exactly as
scope-reconcile already is for *files*. The three carriers that could not reach the escape
(retired-literal grep — no literal; obligation→carrier sweep — obligation stated nowhere;
fix-delta re-run — wrong scope re-asserted) are each documented in the intake row; this leg
is deliberately none of them: it derives the obligation from repo topology, not from the
Decision's text. Run-not-list was a user ruling with the failure mode named (a warning is how
the escape already survived). Plan-time derivation was rejected because out-of-plan edits —
half of real-world overlap per the 333-spec measurement — never appear in a plan. Symbol
matching was rejected for stack-shape (JJ's holistic ruling: the fix must serve every host).
The required-leg extension reddening four suites outside this spec's gate is this class
happening to this spec — and the adversarial check falsifying my own hand-derived redden list
(one false target dropped, two real targets added, patch executed as proof) is the strongest
argument in this document for D3's executed-run-over-reading design. `[oracle: gate]` on
AC-12 covers the no-unit-test doctrine artifacts honestly rather than laundering them as
covered. One cost accepted knowingly: build's Final gate calls the same `--json` and now
computes `atRisk` it uses only for D7's advisory count — one extra sub-second walk per build
was judged cheaper than a mode flag forking the script's output shape by call site.

## Build deviations (sidecar folded in at review 2026-08-16)

- AC-20260815-02-7 and AC-20260815-02-8 were **not** red-first, honestly and structurally: a
  manifest-only construction cannot distinguish "at-risk row ignored by the old REVIEW_LEGS"
  from "correctly required-but-non-blocking" until `at-risk` actually enters the array. Both
  were kept as written — they are valid regression guards now that D4 has landed. Only
  AC-20260815-02-6 was genuinely red-first at build time.
- D8's literal `6.78.0` target was stale by build time (6.80.0 shipped first from the prior
  spec); the build took the next free number, 6.81.0. The standing `[host]` Gotcha about
  concurrent sessions racing the same semver covers this — the spec's number is a target, not
  a pin.
- **Assumption A4 fired.** The adversarial pass predicted four suites would redden under D4's
  required-leg extension; the build's pre-image check found **six pins across three more**
  (`clean-row-survivor-consistency`, `verdict-gatered-no-workflow`, `suite-baseline/doctrine`
  — the last one broken by D3's prose edit, not D4). All three became in-flight File Plan
  rows; fixtures gained the row, the two byte-exact regexes were retargeted, none weakened,
  and AC-20260815-02-14 was added for the step-8 promise that had no AC. This is the spec's
  own thesis landing on the spec itself: the derivation listed all three surprise suites,
  which is precisely the argument behind D3's run-not-list design.
- `.claude/suite-baseline.json` was edited surgically rather than via the printed `--update`
  remedy — see the suite-leg waive below for why.

## Review dispositions (2026-08-16, run `wf_c1e30dad-b85`)

**Fixed (4 findings, one locus).** The Sonnet panel returned zero findings; a Fable retainer
consult requested by the user found a reproduced correctness defect in the derivation's own
heart, and three lesser defects around it. All four were fixed in-review, red-first:

- *hard* — `stemsFor()` emitted the empty string for any root-level dotfile, and
  `content.includes('')` is vacuously true, so a diff touching `.gitignore`/`.npmrc`/an
  `.eslintrc` listed the entire test universe as at-risk. Reproduced in a synthetic tree
  (only `.gitignore` changed → two content-unrelated test files returned). On a red-pin host
  this is a guaranteed red leg and a mandatory waive on every such review — the exact
  cry-wolf trajectory D6's RETIRE condition exists to catch, arriving on day one.
- *soft* — the same function emitted bare single-segment basenames (`index`, `package`),
  contradicting D1's own stated guard. Both closed by AC-20260815-02-15.
- *soft* — the script header's "deliberately does NOT: review file CONTENT" claim went false
  the moment the at-risk block began substring-scanning candidates; corrected in place
  (§ Worker Rules makes the header a contract, and the `Exit codes:` list stayed untouched
  per D2).
- *soft* — AC-20260815-02-4's pin was vacuous: its fixture referenced the helper as
  `require('./helpers')`, matching neither stem of `tests/helpers.js`, so `atRisk` was `[]`
  with or without the guard it claimed to pin. Mutation-proven in both directions (guard
  removed: real `[]`, mutant `[]`), then repaired to discriminate. A pin that cannot fail is
  a false coverage claim — ac-matrix counted AC-4 covered throughout.

**Waived (2 findings, both pre-existing, neither attributable to this diff).**

- *at-risk leg red* — the leg's first live run executed 45 of this repo's 128 test files in
  3.1s and exited 1 on six failures. Five are sanctioned in `.claude/suite-baseline.json`
  (`gate-activation-probe` ×2, `gate-env-preflight` ×2, `workflow-runid-provenance` ×1). The
  sixth was re-run in a detached worktree at `diff_base` and was already red there. D3's own
  text names this disposition: "a pre-existing sanctioned red (e.g. this repo's INTAKE pins)
  is a five-second waive naming the pin."
- *suite leg `newFailing=1`* — `tests/feedback-loop.test.js`, red because INTAKE row
  JJ-20260816-02 (landed the previous commit) names a pin file,
  `tests/tdd-waiver-provenance.test.js`, that was never authored. Warned, never absorbed,
  exactly as this spec's `.claude/suite-baseline.json` File Plan row instructs — absorbing it
  via `--update` would silently sanction an unrelated defect. **Open debt, not this spec's:**
  an accepted intake row without its red carrier on disk.

**Recorded, not fixed (D9 addendum — reopen conditions).**

- *rename gap* — D1 excludes rename-from paths from stem sources, so renaming a shared script
  yields zero at-risk hits for the suites still referencing the old path, while this spec's
  own Behavior section argues a test referencing a *deleted* file is at risk by definition
  (a rename is delete+create on the reference side). The implementation follows D1 verbatim,
  so this is a spec design gap, not a build defect. **Reopen** on the first collision that
  ships behind a rename, recording the miss verbatim — the same evidence bar D9's other
  exclusions carry.
- *derivation duplication* — the advisory smell lens flags that this at-risk block re-implements
  `collision-closure.js`'s paths-leg mechanism (walk a test corpus, substring-scan content
  against File-Plan-derived targets, subtract covered hits). The two differ in input and stage,
  which is why `collision-closure.js`'s header already disclaims the overlap; the *matching*
  mechanism is nonetheless duplicated. Recorded in the advisory ledger. **Reopen** as a
  `lib/` extraction if a third consumer of the same shape appears — this repo's own
  duplication calibration (§ Review Checks: three near-identical blocks) is the trigger.

## Canonical Delta

`docs/canonical/review.md` — the Phase 0 leg inventory gains `at-risk` (required full-scope,
skipped fix-delta, non-blocking; derivation in scope-reconcile.js, run via testCommand,
failures = findings). `docs/canonical/pipeline.md` — the scoped-gate paragraph gains one
sentence: scoping is compensated by the at-risk derivation at review; the gate never runs
unscoped.
