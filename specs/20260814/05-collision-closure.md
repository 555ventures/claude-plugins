---
date: 2026-08-14
status: implementing
diff_base: a15ddb3cd725299ac36a83f05d91e6603b0e150c
open_markers: 0
risk: T3
area: plan-integrity
design: false
breaking: false
depends_on: ["specs/20260814/03-suite-baseline.md"]
depended_on_by: ["specs/20260815/01-recurrence-carriers.md"]
brief: n/a
spiked: 2026-08-14
---

# collision-closure.js — the plan-time collateral-damage sweep stops being hand-executed prose

## Goal

Two sweeps are supposed to run before a spec locks: find the tests that pin the files this
spec is about to change, and find the doctrine prose elsewhere that quotes wording this spec
is about to retire. Both live as prose instructions — a `§ Gotchas` bullet in
`.claude/rules/spec-pipeline.md` and one sentence in `/spec:plan`'s obligation→carrier sweep —
hand-executed by the planning session. They have missed three times
(specs/20260813/07 D8, specs/20260813/09 D4, specs/20260814/01's `spec-paths` key-set pin,
which landed out-of-plan and had to be waived at review). This spec makes both sweeps one
script — `spec/scripts/collision-closure.js` — invoked at lock, **advisory listing only**, and
rewrites both prose loci to cite it. Done = the script's exec pins run green, the plan.md and
spec-pipeline.md pins run green, and the four surviving obligation shapes in
`tests/plan-obligation-carrier.test.js` stay green under their retagged regression pin.

**This spec deliberately does not gate anything.** Execution adjudicates collisions, at the
end of the build, via `specs/20260814/03-suite-baseline.md` D10's blocking whole-suite check.
This script exists for what execution cannot deliver: getting the colliding file into the
File Plan *before* work starts (so a batch worker owns the pin edit under TDD discipline
instead of an orchestrator hot-patching it at the gate), and covering the retired-doctrine-
prose class, which has **no execution oracle at any stage** — stale wording quoted in another
command file breaks no test and fails no gate, forever.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | CREATE `spec/scripts/collision-closure.js` (repo script conventions: header with usage / dated incident / does-NOT-do / `Exit codes:` list, hand-rolled `--flag value` parsing, remedy-naming errors, `#!/usr/bin/env node` + `'use strict'`). Registered as `spec-paths collision-closure` (key + usage line). It is the sole derivation of plan-time collision listing; never a second grep-based collision lister anywhere. It is **not** a second `scope-reconcile.js` — that script diffs a *git changed set* against the File Plan after the build; this one joins *declared File Plan paths* against the *corpus that references them* before the build. Disjoint inputs, disjoint stage. | The class is the pipeline's own strict-downgrade shape (checker-enforceable rule carried as prose, hand-executed, drifting per session and per model) — the same class `ac-matrix.js` closed for review's AC matrix, and the class roadmap brief 06 exists to kill. |
| D2 | Two legs, both reported in one run. **Paths leg** (always runs): for each File Plan row whose Layer is not `tests`, search the test corpus for that row's repo-relative path as a literal substring. **Literals leg** (`--literal <stem>`, repeatable, optional): for each planner-supplied single-word stem, search the whole repo case-insensitively. A run with no `--literal` flags reports the paths leg alone and says so. | The two sweeps have different targets and different incidents but one invocation point (lock) and one output shape; splitting them into two scripts would re-pay File Plan parsing twice and give the planner two things to remember instead of one. |
| D3 | Paths-leg search roots are **derived, never hardcoded**: the deduped first path segment of every `tests`-layer File Plan row (for a spec with rows under `tests/ac-matrix/` and `tests/foo.test.js`, that is `tests`). `--tests <dir>` (repeatable) overrides the derivation entirely. Neither available (no `tests`-layer rows and no `--tests`) → exit 2 naming both remedies. A resolved root that does not exist or cannot be read → **exit 2** naming the root and the `--tests` remedy — never an uncaught `ENOENT`, never a silent empty result (a silently-empty closure is indistinguishable from a clean one, which is the failure mode this whole spec exists to remove). Matching is **case-sensitive literal substring on the full repo-relative path**. | Same derivation shape review.md already uses to resolve `{testDirs}` from tests rows — portable with zero new config keys, and a host whose tests live elsewhere gets the override rather than a wrong hardcoded default. The missing-root exit is a Worker-Rules obligation (every error path names its remedy) and a Review-Checks hard finding if omitted. |
| D4 | **No basename matching.** A test that mentions only a file's basename is never a paths-leg hit. Measured 2026-08-14 against spec 01's seven non-test File Plan paths: full-path closure 30 files, basename closure 42 — basename adds 12 files and zero known real collisions, and the 2026-08-14 incident file (`tests/terminal-observable-acs.test.js`) is found by the full-path form. AC-7 pins the exclusion so a future "helpful" widening turns a test red. | A knob with measured cost and no measured signal is dropped, not defaulted. (This retires the opposite claim in the 2026-08-14 Fable brief, refuted by executed evidence — see Rationale.) |
| D5 | Literals-leg search roots: the repo root, walked recursively, **excluding** `.git`, `node_modules`, and every path matched by `lib/glob-match.js`'s `pipelineOwnedGlobs(root)` — which already resolves `BASELINE_GLOBS` (`specs/**`, `.claude/spec-runs.jsonl`) plus the host config's `pipelineOwnedPaths`, and already owns its own `readConfig` call. That single call supplies all three exclusions this leg needs: the spec corpus (a spec naming the stem it retires is planning, not a carrier), the append-only run ledger (history, never a carrier), and generated surfaces (never File Plan rows, so a hit there is unactionable by construction). **The script imports `{ globMatch, pipelineOwnedGlobs }` from `lib/glob-match.js` — it never re-derives glob translation, never calls `readConfig` for `pipelineOwnedPaths` itself, and never hand-rolls a `*.jsonl` or spec-dir rule.** Non-UTF8/unreadable files are skipped silently. | `glob-match.js`'s own header names it "the sole glob matcher for `pipelineOwnedPaths` semantics," extracted in 2026-08-12 precisely because `scope-reconcile.js` and `hotspot.js` had grown two private matchers. A third private copy here would re-commit the duplication that extraction paid down — both refuters flagged the draft's hand-rolled translator independently. |
| D6 | Exit + output contract: **0** = every hit is already a File Plan row (or there are no hits); **1** = one or more hits are not File Plan rows — the advisory listing, never a block; **2** = usage, unreadable spec, no File Plan table, or either of D3's root failures (no tests-layer rows and no `--tests`; a resolved root that is missing or unreadable). Human render by default (one section per leg, per-target hit lists **split into `likely` and `mentions` per D12**, then `unplanned=<N>` and split remedy lines: `likely` and every literals hit → "add as a File Plan row, or record the waive in Rationale"; `mentions` → visibility only, no waive owed); `--json` emits the machine shape in Contracts. Hits that ARE File Plan rows still print under their target — visibility, never a finding. | Exit 1 is the advisory-listing signal the lock step reads and enumerates; it never blocks, because blocking was measured at roughly 93% false positive against spec 01 (~40 listed files, one real collision) and a guard that cries wolf 39 times out of 40 trains the planner to wave it through. |
| D7 | `spec/commands/plan.md` Phase 4 step 2's obligation→carrier sweep: the sentence "A Decision that retires or narrows doctrine prose owes a stem-level grep of the doctrine corpus and `tests/`, every hit enumerated in the File Plan as fix or recorded waive" is **replaced** by an invocation line — run `node "$(spec-paths collision-closure)" --spec {spec path} --root . --literal <stem>…` (one `--literal` per distinctive single-word stem the spec retires; stem *selection* stays the planner's judgment) and enumerate **every `likely`-tier paths hit and every literals hit** in the File Plan as fix or recorded waive; `mentions`-tier hits are skimmed for visibility and owe no waive line. The four other obligation shapes in that paragraph are **untouched**. Marked `<!-- enforcedBy: spec/scripts/collision-closure.js -->`. | Doctrine shrinks to an invocation line — the shape `ac-matrix.js` established for review.md steps 5–6 (spec 01 D5). |
| D8 | `.claude/rules/spec-pipeline.md` § Gotchas: the colliding-pin bullet is **rewritten in place, not appended to** — the hand-grep instruction (its "At plan time, grep `tests/` … case-insensitively for each distinctive single-word stem" recipe, the hard-wrapping explanation, and the mid-build retag sentence) collapses to: the class statement, the two live mechanisms that now catch it (this script at lock; spec 03 D10's blocking whole-suite check at build Phase 4, which is the only thing that catches the behavioral variant), and the retag rule for a mid-build hit. **Net prose reduction.** Citations: the bullet's two existing ones (20260813/07 D8, 20260813/09 D4) survive **verbatim**, and the 2026-08-14 `spec-paths` key-set collision is **added** as a third — verified at HEAD, the bullet cites only two today. A Gotcha whose citations are trimmed stops being falsifiable, and the rewrite must not buy its prose reduction out of the evidence. | Holistic rule: an incident is not fixed by adding prose next to the prose that failed; deterministic enforcement replaces the instruction, and the bullet becomes a pointer plus its evidence. |
| D9 | Two out-of-plan pins found by running this spec's own sweep by hand (A4) enter the File Plan as **regression pins** — green against pre-change code, the sanctioned exception to red-first. (a) `tests/plan-obligation-carrier.test.js`: retag an existing test with AC-20260814-05-9 — the four surviving obligation shapes stay stated after D7's fifth-shape rewrite. (b) `tests/terminal-observable-acs.test.js`: its closed `deepStrictEqual` over `spec/bin/spec-paths`'s complete key set is **the only place that key set is pinned**, so D1's new `collision-closure` key breaks it by construction; add the key to the `expected` array and retag the assert message with AC-20260814-05-12. Neither is weakened; both are updated in place. | (b) is the fourth recurrence of this spec's own headline class — self-inflicted, caught by the paths leg before build rather than at it. Both adversarial refuters found it independently in the draft; it is the strongest available evidence that the mechanism is worth mechanizing, and it is why D11 does not treat the paths leg as ceremony. |
| D10 | Scaffold-ledger row, ADVISORY, two retire conditions because the legs have independent evidence: **paths leg** retires if two quarters show every listed hit was already a File Plan row (pure ceremony, since build Phase 4 catches the real ones anyway); **literals leg** retires after two quarters of zero corpus-restatement catches across hosts. PROMOTE (either leg, to a lock block) only if the ledger shows an unlisted collision reaching build Phase 4 twice — i.e. the listing is being produced and ignored. **Tier reopen (D12/D13):** a `mentions`-tier file causing a build Phase 4 pre-image block twice → revisit the form family and widen the `likely` rule, recording the new measurement (the mirror of D4's basename reopen). Claims-baseline re-stamp for plan.md's line delta rides the same commit; plugin.json bump target 6.76.0 (target, not a pin — concurrent sessions race semver). | Doctor check 13; the repo's hard review checks (missing ledger row, missing claims-baseline hunk, missing version bump). |
| D12 | **Paths-leg hits are tiered** (amendment 2026-08-14 — the debt fix; supersedes the first draft's "never tier" exclusion, which rested on a measurement too coarse to be true). A hit is `likely` iff the hit file contains `deepStrictEqual` **within ±25 lines** of the matched path reference; every other hit is `mentions`. Both tiers always print. The tier line carries a fixed honesty sentence — *"tier is a lexical proxy; `mentions` may contain closed pins; the build-time suite check adjudicates"* — and the tier **never** gates: exit codes are unchanged (D6), and the enumeration obligation scopes per D7. Literals-leg hits are **never** tiered — every one stays mandatory, because that leg has no execution backstop anywhere in the pipeline. | Measured 2026-08-14 on spec 01's seven non-test paths: 30 closure files → 9 containing `deepStrictEqual` at all → **4 proximal**, and the 2026-08-14 incident pin survives the filter. Re-executed by the retainer, which read all five dropped `deepStrictEqual` files and confirmed **zero proximity false negatives among them** — each far assert is on executed script output or arg round-trips, not a text pin. The idiom behind it: closed text pins here inline `read()` immediately before the assert, while top-of-file `read()` consts pair with open `assert.match`. An idiom is not a guarantee, which is exactly why the tier informs and never blocks. |
| D13 | **The tier's measured false negatives are recorded, not papered over.** Three closed pins in this same closure that D12's rule files as `mentions`: a closed *count* pin (`tests/consistency/drift-reconcile.test.js` — `strictEqual(blankLines.length, 0)` over `scaffold-ledger.md`, the pin this spec's own A9 had to adjudicate by hand); a closed *named-count-field* pin (`tests/claims/claims-lint.test.js` — the live-corpus orphan ratchet on `review.md`); and a closed pin *expressed as `assert.match` of an exact array literal* (`tests/terminal-observable-acs.test.js`'s `REVIEW_LEGS` assert, which reddens on any additive verdict leg). The obvious widening — `strictEqual` with a numeric/`.length` expected — was measured and **rejected**: it takes the list from 4 to 12 proximal / 16 per-file, because `strictEqual(res.status, 1)` exit-code asserts are ubiquitous in exec-mode tests. | Closedness is semantic ("does an additive change to the target redden this?"); every lexical proxy has both false positives and false negatives. A tier is only admissible because the miss is *bounded*: a closed pin sitting in `mentions` surfaces at build Phase 4 as an own-diff block, enters the sanctioned retag path, and costs friction — never an escape. Naming the three forms is what keeps the tier honest instead of authoritative. |
| D11 | v1 explicitly does NOT: block the lock (D6 — reopen if PROMOTE's condition fires); run at build or review time (spec 03 D10 owns execution adjudication end-to-end; a second collision mechanism at those stages would be two guards for one class); shell out to `grep` (BSD/GNU flag divergence — pure Node `fs` walk with directory pruning, executed A7); choose stems for the planner; touch `scope-reconcile.js`, `verdict.js`, or any gate command. | Every exclusion carries its reopen condition; fencing v1 to a listing keeps the blast radius at two doctrine sentences and one new advisory script. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/collision-closure.js | CREATE | scripts | D1–D6: File Plan parse, paths leg, literals leg, exclusions, exit/output contract |
| spec/bin/spec-paths | MODIFY | scripts | D1: `collision-closure` key + usage line entry |
| spec/commands/plan.md | MODIFY | doctrine | D7: fifth obligation shape becomes an invocation line + enforcedBy marker |
| .claude/rules/spec-pipeline.md | MODIFY | other | D8: colliding-pin Gotcha rewritten to two mechanisms + surviving citations |
| spec/doctrine/scaffold-ledger.md | MODIFY | doctrine | D10: ADVISORY row, per-leg retire conditions, shared promote condition |
| spec/doctrine/claims-baseline.json | MODIFY | doctrine | D10: ratchet re-stamp for plan.md's line delta (same commit) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D10: bump + changelog description |
| tests/collision-closure/collision-closure.test.js | CREATE | tests | AC-20260814-05-1 … AC-20260814-05-8 |
| tests/collision-closure/doctrine.test.js | CREATE | tests | AC-20260814-05-10, AC-20260814-05-11 |
| tests/plan-obligation-carrier.test.js | MODIFY | tests | D9a: AC-20260814-05-9 regression pin retag (green pre-change) |
| tests/terminal-observable-acs.test.js | MODIFY | tests | D9b: add `collision-closure` to the spec-paths key-set `expected` array, retag with AC-20260814-05-12 |

## Contracts

```
# spec/scripts/collision-closure.js
node collision-closure.js --spec <path> [--root <dir>] [--tests <dir>]… [--literal <stem>]… [--json]
#   --root defaults to the process CWD
# Exit codes:
#   0 = every hit is already a File Plan row (or no hits)
#   1 = one or more hits are not File Plan rows — ADVISORY listing, never a block
#   2 = usage / unreadable spec / no File Plan table / no tests-layer rows and no --tests /
#       a resolved test root that is missing or unreadable
# --json shape (exactly these seven top-level keys):
#   {"spec":"<repo-relative path>",
#    "testRoots":["tests",…],
#    "planned":["<every File Plan path>",…],
#    "paths":[{"target":"<non-tests File Plan path>","hits":["<repo-relative file>",…]},…],
#    "literals":[{"stem":"<stem>","hits":["<repo-relative file>",…]},…],
#    "unplanned":["<repo-relative file>",…],
#    "likely":["<repo-relative file>",…]}
#   `hits` are sorted, deduped, repo-relative; `unplanned` is the sorted union of all hits
#   minus `planned` minus the spec path itself; `likely` is the sorted D12-tier subset of
#   `unplanned` (paths leg only — literals hits are never tiered)
# human render (default), in order:
#   paths leg — per target: `likely` hits, then `mentions` hits, each indented;
#               targets with no hits print `— none`
#   the fixed honesty line: tier is a lexical proxy; mentions may contain closed pins;
#               the build-time suite check adjudicates
#   literals leg — one line per stem, then its hits indented; omitted entirely when no --literal
#   unplanned=<N> likely=<M>
#   remedy: add each `likely` hit and each literals hit as a File Plan row, or record the waive
#           in the spec's Rationale; `mentions` hits are visibility only and owe no waive line

# Imported, never re-derived (all three already shipped; read at HEAD 2026-08-14):
# lib/file-plan.js:
#   parseFilePlanRows(text) -> [{paths:[string], action:string|null, layer:string|null}]
# lib/glob-match.js — THE sole matcher for pipelineOwnedPaths semantics:
#   globMatch(glob, relPath) -> boolean
#   pipelineOwnedGlobs(root)  -> BASELINE_GLOBS (`specs/**`, `.claude/spec-runs.jsonl`)
#                                 + host config `pipelineOwnedPaths`; owns its own config read
# lib/host-config.js: readConfig(root) — NOT called by this script; glob-match.js already
#   makes the only config read this script needs.
```

## Behavior

- Flow: parse args → read `--spec` → `parseFilePlanRows` (empty/absent table → exit 2 with
  remedy) → build `planned` = every path in every row → derive test roots (D3) → walk each
  test root, reading each file once and testing every non-tests target path against it →
  if any `--literal`, walk the repo root under D5's exclusions, reading each file once and
  testing every stem case-insensitively → assemble → render → exit.
- **One read per file, all targets tested against it** — never one pass per target. Executed
  A7: 131 test files scanned in 4ms; the whole repo tree is 9822 entries in 186ms *including*
  `node_modules`, which is why the walk prunes directories as it descends rather than using
  `fs.readdirSync(recursive:true)` (which cannot prune mid-walk).
- Directory entries are resolved with `path.join(dirent.parentPath, dirent.name)` when walking
  with `withFileTypes`. Executed 2026-08-14 on Node v26.0.0: `dirent.parentPath` is present and
  `dirent.path` is **absent entirely** (not a working legacy alias) — use `parentPath` only.
- Exclusion test: `pipelineOwnedGlobs(root).some(g => globMatch(g, relPath))`, both imported
  from `lib/glob-match.js`. The script contains no glob-to-regex translation of its own.
- Files that fail `readFileSync(p,'utf8')` (binary, permissions) are skipped, not fatal. A
  *directory* that fails to read is only skipped inside the literals walk; a missing or
  unreadable **test root** is D3's exit 2.
- The spec's own path is never reported as a hit against itself.

## Acceptance Criteria

- **AC-20260814-05-1**: WHEN a test file outside the File Plan contains a non-tests File Plan
  row's repo-relative path THE SYSTEM SHALL exit 1, list that file under that target, and
  include it in `unplanned` (literal fixture: File Plan row `src/a.js`, test root `tests`,
  `tests/pin.test.js` containing the text `src/a.js`, no `tests/pin.test.js` row →
  `unplanned=1`) → tests/collision-closure/collision-closure.test.js
- **AC-20260814-05-2**: WHEN every file containing a File Plan path is itself a File Plan row
  THE SYSTEM SHALL exit 0 with `unplanned=0`, still printing the hit under its target
  (literal fixture: same as AC-1 plus a `tests/pin.test.js` File Plan row) →
  tests/collision-closure/collision-closure.test.js
- **AC-20260814-05-3**: WHEN `--literal Widget` is passed and a doctrine file outside the File
  Plan contains `widget` in lowercase THE SYSTEM SHALL exit 1 and list that file under stem
  `Widget` (literal fixture: `spec/doctrine/x.md` containing `the widget rule`; the match is
  case-insensitive in both directions) → tests/collision-closure/collision-closure.test.js
- **AC-20260814-05-4**: WHEN the same stem also appears in the spec corpus directory, in
  `.claude/spec-runs.jsonl`, and in a file matching a configured `pipelineOwnedPaths` glob THE
  SYSTEM SHALL report none of those three as hits (literal fixture: stem present in
  `specs/20260814/05-x.md`, `.claude/spec-runs.jsonl`, and `spec/workflows/wf-x.js` with config
  `pipelineOwnedPaths: ["spec/workflows/wf-*.js"]` → that stem's `hits` is `[]`); and the
  script's source SHALL contain no glob-to-regex translation of its own, resolving exclusions
  only through `lib/glob-match.js`'s `pipelineOwnedGlobs`/`globMatch` (source-shape pin — a
  third private matcher is the duplication that module's extraction paid down) →
  tests/collision-closure/collision-closure.test.js
- **AC-20260814-05-5**: WHEN a non-test file outside the derived test roots contains a File
  Plan path THE SYSTEM SHALL NOT report it as a paths-leg hit (literal fixture: `docs/a.md`
  containing `src/a.js`, test roots `["tests"]` → `paths[0].hits` is `[]`, `unplanned=0`,
  exit 0) → tests/collision-closure/collision-closure.test.js
- **AC-20260814-05-6**: WHEN the spec's File Plan has `tests`-layer rows THE SYSTEM SHALL
  derive `testRoots` as their deduped first path segments; WHEN `--tests <dir>` is passed it
  SHALL use exactly those directories instead; WHEN the spec has no `tests`-layer rows and
  no `--tests` is passed it SHALL exit 2 with a stderr line naming both remedies (add the
  spec's tests rows, or pass `--tests <dir>`); and WHEN a resolved test root does not exist on
  disk it SHALL exit 2 naming that root and the `--tests` remedy — never throwing `ENOENT` and
  never reporting an empty closure (literal fixture: `--tests nope` against a spec with a
  valid File Plan → status 2, stderr contains `nope` and `--tests`) →
  tests/collision-closure/collision-closure.test.js
- **AC-20260814-05-7**: WHEN a test file contains only the **basename** of a File Plan path
  and never its full repo-relative path THE SYSTEM SHALL NOT report it as a hit (literal
  fixture: File Plan row `src/deep/a.js`, `tests/pin.test.js` containing only `a.js` →
  `unplanned=0`, exit 0) — the measured D4 exclusion, pinned so a later widening reddens →
  tests/collision-closure/collision-closure.test.js
- **AC-20260814-05-8**: WHEN `--json` is passed THE SYSTEM SHALL emit the Contracts shape with
  exactly its seven top-level keys (`spec`, `testRoots`, `planned`, `paths`, `literals`,
  `unplanned`, `likely`) present and `hits`/`unplanned`/`likely` sorted and deduped; WHEN an unknown flag is
  passed, the spec path is unreadable, or the spec has no File Plan table THE SYSTEM SHALL
  exit 2 with a stderr line naming the remedy; and WHEN `spec-paths collision-closure` runs
  THE SYSTEM SHALL print the script's path (the key-registration carrier) →
  tests/collision-closure/collision-closure.test.js
- **AC-20260814-05-9**: WHEN `spec/commands/plan.md` Phase 4 step 2 is read THE SYSTEM SHALL
  CONTINUE TO state all four surviving obligation shapes — a Decision naming a file by path
  owes a File Plan row; a Decision ordering a persisted rendered artifact owes a
  Contracts/schema row; a spec whose tests import CREATE-d modules owes those factory
  signatures in Contracts; an AC whose expected value is computed by a helper owes that
  helper's ground-truth carrier — after the fifth shape is rewritten (regression pin, green
  against pre-change code) → tests/plan-obligation-carrier.test.js
- **AC-20260814-05-10**: WHEN `spec/commands/plan.md` Phase 4 step 2 is read THE SYSTEM SHALL
  name `spec-paths collision-closure` with `--literal` as the fifth obligation shape's
  carrier, SHALL carry the `enforcedBy: spec/scripts/collision-closure.js` marker, and SHALL
  NOT instruct a hand-executed grep of the doctrine corpus (the literal words `stem-level
  grep` are gone) → tests/collision-closure/doctrine.test.js
- **AC-20260814-05-11**: WHEN `.claude/rules/spec-pipeline.md` § Gotchas is read THE SYSTEM
  SHALL state the colliding-pin bullet as two named mechanisms — `collision-closure` at lock
  and the whole-suite check at build Phase 4 — SHALL NOT instruct a hand-executed grep there
  either, and SHALL CONTINUE TO cite all three recurrences by spec path
  (`specs/20260813/07…`, `specs/20260813/09…`, `specs/20260814/01…`) →
  tests/collision-closure/doctrine.test.js
- **AC-20260814-05-12**: WHEN `spec/bin/spec-paths`'s complete key set is scraped from its live
  case statement THE SYSTEM SHALL CONTINUE TO deep-equal the pinned `expected` array, with
  `collision-closure` present in both (regression pin: the pin is green before this spec and
  must be green after; D1's new key breaks it by construction, which is the collision this
  spec's own paths leg caught) → tests/terminal-observable-acs.test.js
- **AC-20260814-05-13**: WHEN two unplanned test files both reference a File Plan path — one
  with a `deepStrictEqual` within ±25 lines of the reference, one whose only assert is an
  `assert.match` 60 lines away — THE SYSTEM SHALL place the first in `likely` and NOT the
  second, while placing both in `unplanned`, and exit 1; and WHEN any paths-leg hit exists THE
  SYSTEM SHALL print the fixed honesty line naming the tier as a lexical proxy and the
  build-time suite check as the adjudicator (that line is what stops the tier reading as
  authoritative — D13's three measured false-negative forms are why it must be unconditional)
  → tests/collision-closure/collision-closure.test.js
- **AC-20260814-05-14**: WHEN a `--literal` stem produces a hit outside the File Plan THE
  SYSTEM SHALL include it in `unplanned` and SHALL NOT include it in `likely`, regardless of
  what that hit file asserts (literals hits are never tiered — that leg has no execution
  backstop anywhere in the pipeline, so every hit stays mandatory) →
  tests/collision-closure/collision-closure.test.js

## Assumptions (escalation triggers)

- **A1** (executed 2026-08-14, spec 01's seven non-test File Plan paths): full-repo-relative
  path grep over `tests/` → 30 files; basename grep → 42 files (+12, zero known real
  collisions); per-path spread `spec/bin/spec-paths` 3→15, `spec/commands/review.md` 22→29.
  The 2026-08-14 incident file `tests/terminal-observable-acs.test.js` is in the full-path
  set. **if false at build** (a re-measure shows basename catching a real collision the full
  path misses): D4 reopens — add the basename form behind a flag, default off, and record the
  measurement.
- **A2** (executed 2026-08-14): the same seven paths grepped over the whole repo (excluding
  `.git`, `node_modules`, `specs/`) → 50 files, of which 20 are non-test (`docs/`, `README.md`,
  `.claude/agents/`, roadmap briefs). This is why D3 scopes the paths leg to the derived test
  roots — a doc naming a path is a stale-reference concern, already owned by
  `tests/consistency/stale-refs.test.js`, not a broken pin. **if false**: leave the scope as
  specified and record the finding; widening the paths leg is a separate decision.
- **A3** (executed 2026-08-14, five stems over the repo minus `.git`/`node_modules`/`specs/`):
  `red-pin` 1 file, `folklore` 7, `uncorrelated` 8, `miscited` 12, `inert` 41. Distinctive
  stems are naturally sparse; a weak stem is a long list. **This is why D11 keeps stem
  selection with the planner** — the script mechanizes the sweep, never the judgment.
- **A4** (executed 2026-08-14 — this spec's own sweep, run by hand as the last performance of
  the recipe being retired; **corrected after the adversarial check**, which caught the first
  draft attributing a paths-leg hit to the literals leg):
  - **Literals leg** — stems `stem-level`, `recorded waive`, `hard wrapping`, `colliding pin`,
    `retired literal` over the corpus → `spec/commands/plan.md` and
    `.claude/rules/spec-pipeline.md` (both already File Plan rows); `docs/roadmap/07-suite-baseline.md`
    and `tests/model/doctrine-placement.test.js` (**recorded waives** — each mentions a phrase
    narratively in a brief/comment; neither asserts on the rewritten text).
    `tests/consistency/drift-reconcile.test.js` matches `§ Gotchas` only inside an assert
    message about a different check — recorded waive.
  - **Paths leg** — the File Plan's own non-tests paths over `tests/` →
    `tests/plan-obligation-carrier.test.js` (via `plan.md`) and
    **`tests/terminal-observable-acs.test.js` (via `spec/bin/spec-paths`)**. Both were absent
    from the first draft's File Plan; both entered as D9's regression-pin rows. The second is
    the fourth recurrence of this spec's headline class, self-inflicted in the draft — the
    single strongest piece of evidence in this spec, and it came from the leg the draft's own
    Rationale was closest to calling ceremony.
  - **Full paths-leg adjudication (post-refuter, this spec's final File Plan)**: 22 hits fell
    outside the plan — the ~93% false-positive rate observed live, and the burden that made
    D12's tier necessary. Under D12 only the `likely` subset would have owed a waive line;
    the rest print as `mentions`. Every one adjudicated anyway, for the record: the five `spec/commands/plan.md` referencers
    (`ac-terminal-observable`, `conflict-fixes`, `fileplan-bundled-edits`,
    `negative-claim-microspike`, `spec-status`) pin other paragraphs, and the literals sweep
    for `stem-level`/`recorded waive` matched no test at all, so D7's rewritten sentence has
    no test carrier besides the new one — **recorded waives**. The five
    `scaffold-ledger.md` referencers assert only that *a row mentioning X exists*, so D10's
    additive row cannot redden them — **recorded waives**, with one build constraint
    promoted to A9. The two `claims-baseline.json` referencers are ratchet-shaped (counts
    re-stamped by the same commit) — **recorded waives**. `tests/spec-paths.test.js` holds no
    key-set or usage-line pin (that pin lives only in `terminal-observable-acs.test.js`) —
    **recorded waive**. The `.claude/rules/spec-pipeline.md` and `plugin.json` referencers
    match on unrelated assertions — **recorded waives**.
  - **Same collision, two neighbours**: `specs/20260814/02` (`ci-gate-parity` key) and
    `specs/20260814/03` (`suite-baseline` key) each add a `spec-paths` key and neither
    File Plan lists `tests/terminal-observable-acs.test.js`. Both were amended the same
    session. Three hardened specs carrying one identical invisible collision is the frequency
    argument for D6's listing over any amount of further prose.
- **A5** (executed 2026-08-14 against spec 01 at HEAD): `lib/file-plan.js` exports
  `parseFilePlanRows(text)` returning 10 rows with `action` ∈ {CREATE, MODIFY} and `layer` ∈
  {scripts, doctrine, tests}; column indices are read from the header row, so a spec without a
  Layer column yields `layer: null`. **if false**: rows with `layer: null` are treated as
  non-tests targets (conservative — they get searched for), and the tests-root derivation
  falls back to requiring `--tests`.
- **A6** (executed 2026-08-14, Node v26.0.0): a pure-Node walk reproduces `grep -rl` exactly —
  131 test files scanned in 4ms, 3 hits for `spec/bin/spec-paths`, identical to the shell
  result. This is the load-bearing number and it reproduced on re-execution during the
  adversarial check. The unpruned `fs.readdirSync('.', {recursive:true, withFileTypes:true})`
  figure is **volatile and not load-bearing** (measured 9822 entries/186ms, re-measured
  10828/~38ms hours later as `.git` grew); what matters is that it **cannot prune**
  `node_modules` mid-walk. **if false at build**: hand-roll the recursive walk with
  per-directory pruning as D11 specifies — never shell out to `grep`.
- **A7**: `specs/20260814/03-suite-baseline.md` (as amended today: D10's blocking build
  Phase 4 check) lands before this builds — `depends_on` — so D8's rewritten Gotcha cites a
  live mechanism rather than a promise. **if false / 03 slips**: land the bullet naming only
  this script and the *scoped* gate's limits, record the deviation, and file the second
  mechanism's sentence as a one-line follow-up when 03 lands.
- **A9** (executed 2026-08-14, read at `tests/consistency/drift-reconcile.test.js:273`):
  D10's new `scaffold-ledger.md` row must introduce **no blank line** between the table header
  separator and the last data row — AC-20260810-10-8 counts blank lines in that region and
  goes red on one. Adjudicated as a recorded waive rather than a File Plan row (the pin is
  shape-only and stays green for a correctly-formatted additive row). **if false at build**
  (the row lands with a stray blank line): fix the formatting, never the pin.
- **A8**: plan.md's Phase 4 step 2 obligation paragraph is at HEAD as read today (four shapes
  stated before the stem-grep sentence, then the "A missing carrier blocks lock" close).
  **if false / a concurrent spec restructured it**: keep the four shapes untouched, place the
  invocation line where the fifth shape lives, and record the deviation.

## Rationale

**Why this exists at all, given spec 03 D10 already blocks on execution.** JJ's instruction
was "no hot patches — fix properly, structurally," after spec 01 closed with an out-of-plan
test edit that had to be waived at review, the third recurrence of the class. The honest
argument against this script is that with D10 blocking at build, a missed collision costs
friction rather than an escape. The argument for it, which won: that "friction" *is* the
observed failure — an orchestrator patched a file no batch owned, and review had to waive a
mechanical scope finding, and every waived mechanical finding makes the next waiver cheaper,
which is exactly how the scope-reconcile guard stops meaning anything. Getting the file into
the File Plan is structural value D10 cannot deliver, because D10 fires after batch
assignment is over. And the retired-doctrine-prose class has **no execution oracle at any
stage**, so if this script did not exist, that half of the sweep would remain a hand-grep
that has already failed three times.

**Why the mechanism is a listing and not a gate.** The first Fable retainer brief (2026-08-14)
proposed a grep-derived "closure" of tests referencing the spec's File Plan paths, run
BLOCKING at the build gate, with basename matching declared load-bearing. Live measurement in
this session retired most of that design and JJ ratified the replacement:

1. **Basename is not load-bearing** (D4). The claim was that full-path grep misses 6 of 9
   `spec-paths` referencers including the incident file. Measured: full-path returns 3 files
   and the incident file is one of them. Basename returns 15, adding 12 files with no known
   real collision. The retainer accepted the refutation on re-consult.
2. **The closure is the wrong oracle for the blocking seat** (D11). The severe recurrence
   (specs/20260813/10 — five pins broken, green scoped gate, qualified-CLEAN review, shipped)
   is *behavioral*: a shared script's changed return value breaks tests that never name its
   file. A closure over *naming* provably cannot reach it. Measured: the bare suite is 10.1s,
   the closure 2.5s — so the closure's entire economic case was the red-by-design baseline
   that spec 03 declares away, and what remained was a seven-second saving bought with a
   permanent blind spot. A heuristic that approximates an oracle you can afford to run is a
   hot patch. The blocking seat therefore moved to spec 03 D10 (whole suite vs the checked-in
   expected-failure set, once, after the gate is green), amended into that spec today.
3. **Lock-blocking is unaffordable** (D6). ~40 listed files against one real collision for
   spec 01 is roughly 93% false positive, each demanding a waive line from the planner.
4. **The "no cheap precision knob" claim was wrong, and is now retracted** (D12/D13, amended
   2026-08-14 on JJ's instruction to fix the debt rather than price it in). The original test —
   "does this test match `deepStrictEqual` **or** `read(`" — returned 30 of 30 and was too
   coarse to mean anything. Measured properly: `deepStrictEqual` alone drops the list to 9, and
   requiring it within ±25 lines of the path reference drops it to **4, with the incident pin
   retained**. The retainer re-executed this, read every one of the five `deepStrictEqual`
   files the proximity rule drops, and confirmed each far assert is on executed script output
   or argument round-trips rather than a text pin — zero proximity false negatives in this
   closure. So the mandatory-adjudication set falls from 30 to 4 and the 22 recorded waives
   this spec's own A4 had to write mostly evaporate. The tier still informs rather than gates,
   because D13 records three closed-pin *forms* it provably misses; the honest reading is that
   closedness is semantic and every lexical proxy leaks both ways. That is affordable only
   because the miss is bounded — a closed pin left in `mentions` surfaces at build Phase 4 as
   an own-diff block and enters the sanctioned retag path.

**Why no roadmap brief** (`brief: n/a`). This is brief 06's class — deterministic algorithms
carried as prose and hand-executed — but its trigger (today's out-of-plan waiver, the third
recurrence) postdates the brief, and brief 06's enumerated Scope was already sliced into
specs 01 and 02. Expanding a brief's Scope without an amendment ADR would be the invisible-
at-plan pattern the roadmap-amendment machinery exists to prevent, so this lands as an
explicit ad-hoc spec instead.

**Dogfooding note — and the finding that nearly killed the paths leg's own case for existing.**
A4 records this spec running its own sweep by hand, the recipe's last performance. The first
draft ran only the literals half and locked a File Plan that omitted
`tests/terminal-observable-acs.test.js` — whose closed `deepStrictEqual` over `spec/bin/spec-paths`'s
key set is the *only* pin on that key set, and which D1's new `collision-closure` key breaks by
construction. Both adversarial refuters found it independently: the spec written to prevent this
class reproduced it, in the draft, against its own headline incident. Widening the hand-sweep to
the paths leg then found the same omission in `specs/20260814/02` and `/03`, both already
hardened. Three specs, one invisible collision, one afternoon. That is the frequency the earlier
"is the paths leg ceremony?" argument was missing, and it is why D11 keeps it.

**Adversarial-check adjudication (2026-08-14, two blind refuters).** ACCEPTED and folded:
the omitted `spec-paths` key-set pin (above, now D9b + AC-12); the hand-rolled
`pipelineOwnedPaths` glob translator in the draft's Behavior section, which would have been a
**third** private copy of `lib/glob-match.js`'s `globMatch` — the exact duplication that
module's 2026-08-12 extraction paid down, now imported instead (D5, AC-4's source-shape pin);
a missing-or-unreadable test root falling through to an uncaught `ENOENT` instead of a
remedy-naming exit 2 (D3, AC-6); AC-8 demanding "seven keys" against a six-key Contracts shape;
D8 claiming three Gotcha citations "survive verbatim" when the bullet cites only two at HEAD
(the third is added, not preserved); A4's mis-attribution of a paths-leg hit to the literals
leg; a stale `dirent.path` "legacy alias" claim (executed: the field is absent on Node v26).
Both refuters independently re-derived and reproduced A1–A5's measurements; the only
non-reproducing number was A6's unpruned-walk figure, now marked volatile and non-load-bearing.

**Known residue** (carried deliberately, not oversight): stems the planner does not supply are
still missed (D11 — judgment stays human); a collision with no literal reference anywhere is
invisible here and covered only by spec 03 D10's execution; hits inside `pipelineOwnedPaths`
generated surfaces are excluded by construction, which is correct only while the codegen seam
keeps generated files out of File Plans; and a closed pin in one of D13's three unmatched forms
lands in `mentions` and is caught only later, at build Phase 4 — bounded to friction by spec 03
D10's pre-image attribution, and monitored by D10's tier-reopen condition.

## Canonical Delta

None — plugin doctrine edits are the delta itself (repo precedent).
