---
date: 2026-11-03
status: done
tier: standard
area: test-expiry
breaking: false
depends_on: []
brief: n/a
spiked: 2026-11-03
open_markers: 0
diff_base: 4e19cf5b20dabd3019d013a40435546a0426ac27
---

# Tests that earn their keep

## Goal

The pipeline writes a permanent test for every acceptance criterion, including criteria about
doc and command prose, and its close-time expiry classifies a test by the text of its whole file.
The result on this repo: 1,569 test cases and 47.6k test lines against 29.8k script lines, a
retired-phrase assertion in 105 of 224 test files, and a `--all-done` sweep that would delete 77
real script tests while keeping 56 one-off prose checks. After this spec, a criterion that retires
wording is checked once at review and never becomes a test, new wording is a Decision review reads
rather than a criterion, and expiry judges each test case by what that case itself reaches, so the
one deliberate sweep deletes the prose one-offs and nothing that executes a pipeline script.

## Users

- The maintainer of a host repo that runs this pipeline: When a spec changes doctrine or command
  prose, I want the review to check the change once and leave no test behind, so I can keep a
  test suite that only holds tests of behavior. First run / empty: a host whose specs have never
  tagged a prose test sees no change at all.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `[oracle: literals]` is the one in-process oracle: `ac-matrix.js` (full mode) evaluates a bullet carrying it itself instead of reading a manifest row. Its **stems** are every backtick span in the bullet after the tag run and before any `→` tail; its **scope** is every File Plan row whose Layer is not `tests`, whose Action is not `DELETE`, and whose path exists under `--root` (a glob path expanded through `lib/glob-match.js`). A stem found as a plain substring in a scoped file is hard finding `literal-survives` with detail `<AC-ID>: literal \`<stem>\` survives in <file>` (one finding per stem × file, exit 1); a bullet whose every stem is absent from every scoped file counts under the existing `oracle` counter with the warning line `<AC-ID>: oracle = literals (<stems> stems, <files> files)`. `oracle-red-or-absent` never fires for `literals`; the manifest gains no row; `observed` keeps its `{uncovered, oracle, preGreen}` shape. A `[oracle: literals]` bullet with zero stems is finding `literals-no-stem` in both `--lint` and full mode, and a `[oracle: literals]` bullet is exempt from `missing-disposition` in both modes (its oracle has no test by construction; every other `[oracle:]` bullet keeps today's `→` requirement). `ACM_FINDING_CLASSES` grows by `literal-survives` and `literals-no-stem`. (AC-20261103-05-1, AC-20261103-05-2, AC-20261103-05-3) | A retirement is a one-shot fact about the files this spec touches; checking it at review and keeping nothing is the whole point. A new manifest leg would touch `review-legs.js` and `verdict.js` (both critical tier) for the same observation — rejected. |
| D2 | `spec/templates/spec.md` § Acceptance Criteria opens with "Every AC maps to a test or to a declared oracle; prose is never a test's subject" and adds, in the same comment: a criterion that retires wording declares `[oracle: literals]` with the retired phrases in backticks and carries no `→` disposition; new or changed wording is not a criterion — its Decision carries `[no-ac: wording — read by review]`; a reference or protocol token the doctrine must keep is pinned only by an untagged standing guard (`.claude/rules/spec-pipeline.md` § Review Checks' `plugin-bump-gate` precedent), never by an AC-tagged test. `literals` joins the `[oracle:]` closed-set list in that comment and in the AC-3 example bullet. `spec/commands/plan.md`'s lock sentence "an AC that goes red in its absence" gains "or a `[no-ac: wording …]` sanction for a prose-only Decision". `spec/agents/reviewer.md`'s `[no-ac:]` residue bullet gains: a `[no-ac: wording …]` Decision whose wording is not in the diff is a finding. [no-ac: wording — read by review] | The template sentence "Every AC maps to a test" is the first cause: it forces a wording pin for every prose criterion, which `.claude/rules/conventions/tests.md` and core § Doctrine Authoring already forbid. |
| D3 | Prose is pinned for two things only — references the doctrine must keep and protocol tokens an executor must print or offer verbatim. "Phrases it must no longer contain" leaves the list on every surface that states it: `spec/doctrine/core.md` § Doctrine Authoring, `.claude/rules/conventions/tests.md`'s mode line, `.claude/rules/spec-pipeline.md` § Test Rules, `.claude/agents/plugin-tests.md` (description and mode bullet), `.claude/agents/doctrine-author.md`, `README.md`, `docs/canonical/doctrine-governance.md`, and `docs/adr/0037-prose-is-pinned-by-reference-not-wording.md` (status stays; its `Amended by:` line names this spec and one sentence records the narrowing); each names `[oracle: literals]` as the retirement route. The exemplar files in `tests.md` and `plugin-tests.md` stay as they are. Existing retired-phrase tests are not edited by this spec: D4 classifies them and the deliberate sweep removes them. [no-ac: wording — read by review] | Every rename today leaves a permanent negative assertion; after the review that landed the rename it guards nothing. |
| D4 | `expire-tests.js` keep clause (b) judges each case by its **reach**, never by its file: the reach is the case's call text plus, transitively, the text of every top-level declaration in its own file whose identifier the reach names as a whole word; for a reached declaration that `require`s a relative specifier, the same identifiers' top-level declarations and the `module.exports` statement in that module, resolved like `lib/invariants.js` resolves edges (`''`, `.js`, `.cjs`, `.mjs`, `/index.js`), to depth 3, multi-line destructures read whole. Clause (b) fires when the reach names an invariant basename (today's whole-name pattern) **and** contains a child-process call (`spawnSync`, `execFileSync`, `execSync`, `spawn`, `execFile`, `exec` or `fork` followed by `(`), or when the reach `require`s a relative specifier resolving to a file in the invariants set. Text outside the reach never keeps a case. The resolution lives in new `spec/scripts/lib/case-reach.js` (`topLevelDecls(text)`, `caseReach(callText, absFile)`), used only by `expire-tests.js`. A host that declares `testCaseScanner` keeps today's file-level clause for the cases that scanner lists (its call text is not JavaScript the resolver can read); the header documents this. (AC-20261103-05-4, AC-20261103-05-5, AC-20261103-05-6) | Measured on this repo (A2): the file-level clause keeps 56 prose one-offs that merely sit beside an exec test and would delete 77 exec tests that reach their script through a fixture module. A naive per-case rule (call text alone) retired 821 — the reach is the smallest rule that gets both directions right. |
| D5 | `lib/invariants.js` roots widen by **launchers**: every file under a `bin/` directory at depth ≤ 2 (`bin/*`, `*/bin/*`, the hooks rule's depth) is a launcher; every universe file whose basename the launcher's text names becomes a root, and the launcher's own basename joins `expire-tests.js`'s keep-clause name set. `--invariants --json` gains `"launchers":["<rel>"]`. (AC-20261103-05-7) | Scripts a command reaches only through `spec-paths` keys (`fanout-driver.js`, `genesis-driver.js`, `citations-check.js`) are not roots today, so their exec tests survive only when their file happens to name another invariant; D4 would otherwise retire them. |
| D6 | The spec's own doctrine changes carry no `[oracle: literals]` criterion and no prose test: the review of this spec runs the installed plugin's `ac-matrix.js`, which reads `literals` as a manifest leg and would raise `oracle-red-or-absent`. The first consumer is the next spec after this version ships. [no-ac: wording — read by review] | Dogfooding the new oracle on the spec that introduces it reds its own review. |
| D7 | `spec/.claude-plugin/plugin.json` is bumped with `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"`. (AC-20261103-05-8) | Doctrine and script changes ship as one version; the gate's `--check` is the oracle. |
| D8 | The one deliberate sweep `node "$(spec-paths test-expiry)" --root . --all-done --apply` runs once after this spec is `done`, on an installed plugin that carries it — queued as q26. This spec's File Plan holds no test deletion row. [no-ac: an operational follow-up the maintainer runs; no code of this spec changes] | Expiry deletes only through that command (grounding contract § Test expiry); the corrected classifier is what makes the run safe. |
| D9 | Build-time scope widening: `tests/expiry/test-expiry.test.js`'s synthetic invariant and whole-name real-hit cases named their script only by file-level mention, so D4 retires them; their fixtures now exec the script (fixture repair per the Rationale's collision closure, no assertion weakened). `tests/expiry/invariants.test.js`'s live-repo never-listed subject moves from `memory-sweep.js` (now a root through the `spec/bin/spec-paths` launcher, D5) to `spec/evals/host.sh`, reached by no gate, hook, launcher or entrypoint. 📌 Auto-picked add to scope (whole-suite gate). [no-ac: fixture repair of existing tests] | The collision closure at lock predicted these; the gate adjudicated them. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/ac-matrix.js | MODIFY | scripts | D1: `[oracle: literals]` in-process evaluation, `literal-survives`, `literals-no-stem`; no dependency change |
| spec/scripts/lib/case-reach.js | CREATE | scripts | D4: `topLevelDecls`, `caseReach` — identifier resolution in-file and one hop per relative `require`, depth 3; no dependency change |
| spec/scripts/expire-tests.js | MODIFY | scripts | D4: clause (b) per case via `lib/case-reach.js`; header rewritten for the reach rule and the `testCaseScanner` carve-out; launcher names in the keep set (D5) |
| spec/scripts/lib/invariants.js | MODIFY | scripts | D5: launcher roots, `launchers` in the `--invariants` shape |
| spec/templates/spec.md | MODIFY | doctrine | D2: § Acceptance Criteria comment and AC-3 example |
| spec/commands/plan.md | MODIFY | doctrine | D2: lock step 2 sentence |
| spec/agents/reviewer.md | MODIFY | doctrine | D2: `[no-ac: wording …]` residue bullet |
| spec/doctrine/core.md | MODIFY | doctrine | D3: § Doctrine Authoring — two prose-pin categories, retirement route |
| .claude/rules/conventions/tests.md | MODIFY | other | D3: mode line and exemplar |
| .claude/rules/spec-pipeline.md | MODIFY | other | D3: § Test Rules prose-pin bullet |
| .claude/agents/plugin-tests.md | MODIFY | other | D3: description and mode bullet — two prose-pin kinds, retirement route |
| .claude/agents/doctrine-author.md | MODIFY | other | D3: the `tests/` pins sentence |
| README.md | MODIFY | other | D3: the prose-pin sentence |
| docs/canonical/doctrine-governance.md | MODIFY | other | D3: the "three things only" bullet becomes two |
| docs/adr/0037-prose-is-pinned-by-reference-not-wording.md | MODIFY | other | D3: `Amended by:` names this spec; one sentence on the narrowing |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D7: `node scripts/plugin-bump.js --bump --plugin spec --changelog "…"` |
| tests/ac-matrix/oracle-literals.test.js | CREATE | tests | AC-20261103-05-1, AC-20261103-05-2, AC-20261103-05-3 |
| tests/expiry/case-reach.test.js | CREATE | tests | AC-20261103-05-4, AC-20261103-05-5, AC-20261103-05-6 |
| tests/expiry/invariants.test.js | MODIFY | tests | AC-20261103-05-7 |
| tests/expiry/test-expiry.test.js | MODIFY | tests | D9: fixture repair — the kept-invariant and whole-name real-hit cases exec their script, so D4's reach keeps them |

## Contracts

```
# ac-matrix.js — new finding classes (ACM_FINDING_CLASSES)
literal-survives   hard  "<AC-ID>: literal `<stem>` survives in <file>"      full mode only
literals-no-stem   hard  "<AC-ID>: [oracle: literals] declares no stem"      --lint and full mode
# warning line (full mode, every stem absent): "<AC-ID>: oracle = literals (<N> stems, <M> files)"
# stdout summary line and observed {uncovered, oracle, preGreen} unchanged; a literals bullet counts in `oracle`

# lib/case-reach.js
topLevelDecls(text) -> Map<identifier, declarationText>
  // const/let/var/function/async function/class at column 0; `{a, b: c}` and `[a, b]` destructures
  // (multi-line) bind every name; `exports.x =` binds x; `module.exports =` binds "__exports__"
caseReach(callText, absFile, { depth = 3 } = {}) -> string
  // callText + reached declarations in absFile; a reached declaration holding require('./rel')
  // appends the module's declarations for the same identifiers plus its "__exports__", recursively

# expire-tests.js — clause (b) per case
keep when: (namesInvariantBasename(reach) && CHILD_PROCESS_CALL.test(reach)) || requiresInvariant(reach, file)
CHILD_PROCESS_CALL = /\b(?:spawnSync|execFileSync|execSync|spawn|execFile|exec|fork)\s*\(/
requiresInvariant: every require('<./rel>') in reach resolved ('' | .js | .cjs | .mjs | /index.js) ∈ invariants.scripts
host with config.testCaseScanner: today's file-text rule for the listed cases (unchanged)

# lib/invariants.js — --invariants --json
{"roots":[…],"scripts":[…],"edges":{…},"launchers":["spec/bin/spec-paths", …]}
launcher = any file under bin/ or */bin/ (depth <= 2), outside skip dirs and test globs
```

## Behavior

- Review of a spec whose bullet reads ``- **AC-X-3** `[oracle: literals]`: WHEN review runs THE SYSTEM SHALL find none of `old phrase`, `older phrase` in the File Plan's doctrine files``: ac-matrix searches every non-tests, non-DELETE File Plan path for the two stems; none present → the bullet is oracle-covered and no test exists for it; one present → `literal-survives`, exit 1, disposition flow as any hard finding.
- Plan of such a spec: `ac-matrix --lint` accepts the bullet without a `→` disposition (already true for every `[oracle:]` bullet) and refuses one with no backtick stem (`literals-no-stem`). `collision-closure.js --literal <stem>` still enumerates the files outside the File Plan that quote the phrase, so the planner adds them as rows and the review's scope covers them.
- Expiry dry run on this repo after D4/D5 (A2 figures, informational): 74 retirable — prose sweeps and lib unit tests of done specs — and the 77 fixture-reached exec tests that today's clause would delete are kept.
- A test file that mixes one exec case and one prose case of a done spec: the exec case is `invariant`, the prose case `retired`; `--apply` cuts the prose span only (today's span rules).

## Acceptance Criteria

- **AC-20261103-05-1**: WHEN `ac-matrix.js --spec <s> --root <r> --manifest <m>` runs on a spec whose bullet carries `[oracle: literals]` with stems `` `gone phrase` `` and `` `other gone` ``, a File Plan with a non-tests MODIFY row `docs/a.md` whose file contains neither, a tests row, and a DELETE row THE SYSTEM SHALL exit 0, print a summary with `uncovered=0 oracle=1`, print the warning `AC-…-1: oracle = literals (2 stems, 1 files)`, and append no manifest row whose leg is `literals` → writes tests/ac-matrix/oracle-literals.test.js
- **AC-20261103-05-2**: WHEN the same run finds `gone phrase` in `docs/a.md` while a tests-layer row's file and a DELETE row's file also contain it THE SYSTEM SHALL exit 1 with exactly one hard finding `literal-survives` whose detail is `AC-…-1: literal \`gone phrase\` survives in docs/a.md` (the tests row and the DELETE row are never searched), and no `oracle-red-or-absent` finding → writes tests/ac-matrix/oracle-literals.test.js
- **AC-20261103-05-3**: WHEN a bullet carries `[oracle: literals]` and no backtick span after the tag THE SYSTEM SHALL emit finding `literals-no-stem` from `--lint` (exit 1) and from full mode; and WHEN a `[oracle: literals]` bullet with one stem carries no `→` disposition in a spec dated after the disposition floor THE SYSTEM SHALL pass `--lint` with 0 findings while a `[oracle: gate]` bullet without one in the same spec still raises `missing-disposition` → writes tests/ac-matrix/oracle-literals.test.js
- **AC-20261103-05-4**: WHEN `expire-tests.js --root <r> --all-done --json` runs on a synthetic host whose `gateCommand` names `scripts/gate.js`, whose one done spec defines `AC-20260101-01-1` and `-2`, and whose test file holds top-level `const run = () => spawnSync(process.execPath, ['scripts/gate.js'])`, a tagged case titled `AC-20260101-01-1: run() exits 0` calling `run()`, and a tagged case titled `AC-20260101-01-2: gate.js is documented` that reads `docs/a.md` and asserts on its text THE SYSTEM SHALL report `kept.invariant` 1 and `retired` holding only the second case (today both are kept) → writes tests/expiry/case-reach.test.js
- **AC-20261103-05-5**: WHEN the tagged case calls `h.run()` where the test file's only link to the script is the multi-line destructure `const {\n  h,\n} = require('./fixture')` and `fixture.js` holds `const DRIVER = 'scripts/gate.js'` and `module.exports = { h: { run: () => spawnSync(process.execPath, [DRIVER]) } }` THE SYSTEM SHALL keep the case as `invariant` (today it is retired: the file names no invariant) → writes tests/expiry/case-reach.test.js
- **AC-20261103-05-6**: WHEN a tagged case of a done spec `require('../scripts/lib/util')` (no extension) and `scripts/lib/util.js` is in the invariants set (required by `scripts/gate.js`), with no child-process call anywhere in its reach THE SYSTEM SHALL keep it as `invariant`; and WHEN a tagged case's reach names `gate.js` only in a doc-reading assertion with no child-process call THE SYSTEM SHALL retire it → writes tests/expiry/case-reach.test.js
- **AC-20261103-05-7**: WHEN a host holds `tools/bin/launch` whose text names `scripts/cli.js`, nothing else names `scripts/cli.js`, and `deep/a/bin/other` names `scripts/dead.js` THE SYSTEM SHALL list `scripts/cli.js` under `scripts` and `tools/bin/launch` under `launchers` in `--invariants --json`, omit `scripts/dead.js`, and keep a tagged done-spec case whose reach is `spawnSync('bash', ['tools/bin/launch'])` as `invariant` → writes tests/expiry/invariants.test.js
- **AC-20261103-05-8** `[oracle: gate]`: WHEN the gate runs THE SYSTEM SHALL pass `scripts/plugin-bump.js --check`, the entrypoints manifest check (no new entrypoint: `lib/case-reach.js` is a lib) and the citations check for every `§` this spec's doctrine edits cite → reuses tests/consistency/plugin-bump-gate.test.js :: gate wiring: scripts/plugin-bump.js --check at this repo root

## Assumptions (escalation triggers)

- A1: `ac-matrix.js` full mode reads the File Plan through `lib/file-plan.js`'s `parseFilePlanRows` with `action`, `layer` and `paths` per row, and resolves `--root` paths exactly as its `missing-test-file` check does — verified by reading `spec/scripts/ac-matrix.js` lines 404-445 on 2026-11-03. **if false:** the worker returns blocked naming the row shape; no second File Plan parser is written.
- A2: Micro-spike 2026-11-03, scratch copies of `expire-tests.js` against this repo, `--all-done --json`, deleted after the run. Baseline: scanned 1511, kept `{class 5, invariant 1084, pin 19, open 2}`, retired 95. Call-text-only clause (b): retired 821 (over-retires every exec test that spawns through a file-level constant). Reach rule without launchers: retired 158. Reach rule + launchers (D4+D5): kept `{class 5, invariant 1121, pin 3, open 2}`, retired 74 — 56 newly retired (all prose sweeps and lib unit tests: `dead-stops`, `genesis-doctrine`, `replay-retired`, `compat-retired`, `no-citation-comments`, `config-read`) and 77 of the baseline's 95 now kept (fixture-reached exec tests: `build-driver-orchestrator-only`, `tests-layer-spelling`, …). `--invariants` today lists 59 scripts and omits `fanout-driver.js`, `genesis-driver.js`, `citations-check.js`; `spec/bin/spec-paths` names each. **if false** (the build's implementation retires a fixture-reached exec test on this repo): the worker returns blocked with the case; the reach depth or destructure reading is widened, never the clause reverted.
- A3: `ac-matrix.js --lint` requires a `→` disposition on every bullet of a spec dated on or after `DISPOSITION_APPLIES_FROM` (20260911), `[oracle:]` bullets included — verified 2026-11-03: this spec's own `[oracle: gate]` bullet raised `missing-disposition` until it gained `→ reuses`; a scratch spec outside a dated directory passed only because the floor did not apply. D1's exemption for `[oracle: literals]` is therefore a real lint change (AC-3), red-first. **if false** (the floor is read from somewhere other than the spec path's date): the worker returns blocked naming the reader; the exemption keys on the tag, not the floor.
- A4: `verdict.js` validates manifest rows by shape, not by a closed list of leg names, so appending no row for `literals` changes nothing it reads — `REVIEW_LEGS` is the required set, not an allow-list. **if false:** nothing changes (D1 appends no row either way).
- A5: The review of this spec runs the installed plugin's scripts (`spec-paths` resolves to the plugin cache, 7.316.0 at plan time). **if false** (review runs the worktree's scripts): D6 still holds; nothing depends on it.
- A6: Editing `lib/invariants.js` roots does not change `spec/templates/grounding-contract.md` § Test expiry, whose text ("exercises a script the pipeline itself runs") stays true per case. **if false:** STOP, ask the user — a contract edit flips the tier to critical.

## Rationale

The suite is 1,569 cases and 47.6k lines for 80 scripts. Three rules produce the surplus. First,
the spec template says every criterion maps to a test and the review treats an unmatched AC-ID as
a hard finding, so a criterion about wording forces a wording pin — exactly what the repo's own
test rule and core § Doctrine Authoring forbid. Second, the doctrine sanctions "phrases it must no
longer contain" as a permanent pin, so every rename leaves a negative assertion behind (105 of 224
files carry one). Third, expiry's keep clause (b) reads the whole file: a prose one-off beside an
exec test lives forever, and an exec test that reaches its script through a fixture module is
retirable — the sweep would have deleted 77 of them.

D1 chose an in-process oracle inside `ac-matrix.js` over a new review leg: the observation is
"these files no longer contain these phrases", which ac-matrix can make from the spec and the tree
it already reads, while a leg would touch `review-legs.js` and `verdict.js` (critical tier) for no
extra evidence. Scope is the File Plan's own files, not the repo, because the plan-time
`collision-closure --literal` sweep already enumerates stragglers into the File Plan; a repo-wide
search would need an exclusion list (specs, ledger, changelog) that differs per host. A lint that
guesses whether an AC "is about prose" from its wording was rejected as a naive heuristic gate; the
doctrine and the oracle route remove the need. D4's reach rule is the smallest rule that got both
directions right in the spike (A2); one hop into relative modules is what fixtures need, and the
child-process requirement is what separates "spawns `verdict.js`" from "mentions `verdict.js`".
D5 widens roots by launchers because the pipeline's own commands reach scripts through
`spec-paths` keys, invisible to the command-string derivation. The radical option — dropping
clause (b) so exec tests of done specs expire too (about 1,100 on this repo) — was auto-picked
against: the scripts are the product and those tests are its regression net; a later spec can
revisit it (📌 veto anytime). The live-repo counts stay in Assumptions, never in a test: a pin
on this repo's own test count is the pattern this spec retires. The spec-01 trim the user was
offered is dropped: its three prose tests expire under D4 at the sweep, and merging two exec tests
changes no behavior.

Collision closure at lock (literals leg, 2026-11-03). Entered as File Plan rows: every doctrine,
agent, README, canonical and ADR surface quoting "retired phrases" or "phrases it must no longer
contain". Waived: `tests/consistency/design-stage-doctrine.test.js` uses "retired phrases" in a
test title about a different spec's literals, not as doctrine; `.claude/agent-memory/**` is a
pipeline-owned path; `oracle-red-or-absent` pins in `tests/ac-matrix/ac-matrix.test.js` and
`tests/review/contract-leg.test.js` keep passing because D1 changes that class for no leg but
`literals`; `tests/consistency/prose-pins.test.js` pins the exemplar names in `tests.md` and
`plugin-tests.md`, which D3 leaves in place; `.claude/skills/spec-verify/SKILL.md` names the same
exemplar and is untouched. The `executes` hits on `expire-tests.js` and `lib/invariants.js`
(`tests/expiry/test-expiry.test.js`, `tests/ceiling/host-scanner.test.js`,
`tests/ceiling/walk-files-symlinks.test.js`, `tests/init-gen/gate-check.test.js`) exercise the
classification on synthetic hosts; a synthetic case kept today by a file-level mention and now
retired is a fixture repair in the same wave, never a weakened clause — the build's whole-suite
check adjudicates.

Build/review deviations (folded 2026-11-03, all one-offs):
- Fixture repairs (D9): `tests/expiry/test-expiry.test.js`'s kept-invariant case (spec 20260911/03 ACs 3 and 4) now execs `scripts/gate.sh` and its whole-name real-hit case execs `scripts/log.js`; `tests/expiry/invariants.test.js`'s live-repo never-listed subject (spec 20260911/03 AC 2) moved from `memory-sweep.js`, now a root through the `spec/bin/spec-paths` launcher, to `spec/evals/host.sh`. No assertion weakened.
- A2's if-false arm fired at review: a case requiring its helper inside the test body (`citations-check.test.js`'s spec-paths case) was retired, so `lib/case-reach.js` now follows relative requires in the call text, and `caseRequires` resolves each require against the module that wrote it rather than the test file's directory (reviewer findings s0/s1, fixed, regression cases in `tests/expiry/case-reach.test.js`).

### Advisory debt (review rv_1ef7c7b19fe2)
- a0 /home/jj/projects/claude-plugins/.claude/worktrees/agent-aed1ad7bd43194483/tests/ceiling/sync-write-callers.test.js:33 — Also retired in the same live dry run: the five `tests/ceiling/sync-write-callers.test.js` AC-20261101-09-1 cases, which spawn pipeline scripts via `runNode('scripts/' + name + '.js', ...)` over a `FIVE` list of bare names — the script basename is interpolated, so no textual reach rule can see it. Not reachable by the D4 rule as locked; flagged for the maintainer before the q26 sweep.

## Canonical Delta

No `docs/canonical/test-expiry.md` exists; none is created. `.claude/rules/spec-pipeline.md`
§ Test Rules carries the rule change directly (File Plan row).
