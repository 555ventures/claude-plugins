---
date: 2026-11-03
status: hardened
tier: standard           # per ADR-0039 D3 the tier is a property of files touched: the spec-status.js and grounding-contract.md rows are § Risk Tiers surfaces, so their ACs carry literal examples; the spec as a whole is standard
area: pipeline
breaking: false
depends_on: []
brief: n/a
open_markers: 0
---

# A change is sized by its files

## Goal

The pipeline's per-change ceremony shrinks to what the change's size and files justify, as
ADR-0039 decided: a small repair takes the fix lane whatever the host's `layerGroups` say; a spec
is one capability and folds into a fresh sibling it overlaps instead of racing it; the tier is
read off the files touched; the plugin version bumps once per release or landing, never per spec;
an AC test is scaffolding that review close deletes unless it is tagged to stay; and `/spec:status`
shows the two numbers a future ratchet would need. Done means: every decision below is live in
doctrine, template, contract and the five scripts named, and the next close after this lands
deletes what it classified.

## Users

- The maintainer repairing a defect under 100 lines: When the fix touches two files in this
  host's one `layerGroups` group, I want `/spec:fix` to be the lane, so I can land a root-cause
  repair with one commit and one ledger row instead of a spec. First run / empty: a host with no
  ledger still routes by size; nothing else is read.
- The planner locking a draft: When my draft shares three files with a spec locked three days
  ago, I want the lock to tell me which spec and which files, so I can fold into it or declare
  `depends_on` before two builds race the same lines. First run / empty: a host with no ledger or
  no plan rows in the last seven days prints an empty overlap leg and locks.
- The session closing a review: When the close classifies a test as scaffolding, I want it gone in
  the close commit, so I can stop running a manual sweep that has never run. First run / empty: a
  spec whose tests are all tagged `[invariant]` or `SHALL CONTINUE TO` deletes nothing and prints no
  🧹 line.
- The maintainer releasing: When I cut a release (or land to main with no release stage), I want
  one version bump that names the specs it carries, so I can stop bumping per spec and racing the
  semver across branches. First run / empty: a manifest that has never been bumped by the script
  prints every CLEAN review row since the manifest's first commit.
- The owner reading `/spec:status`: When I ask where the work stands, I want to see suite runs per
  spec and the test:production line ratio, so I can judge whether the diet is working before any
  guard is proposed. First run / empty: a host whose ledger carries no review row prints both lines
  as `n/a`.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | ADR-0039 D1, lane floor. `spec/doctrine/core.md` § Pipeline Entry replaces the clause "a repair across more than two `layerGroups` or user-visible text follows `/spec:fix`, its playbook" with: a repair under ~100 production lines touching at most three non-test files takes `/spec:fix` whatever the host's `layerGroups` count, and so does one that touches text a user sees; above that floor a repair is a spec. The Direct lane's "no behaviour or data change" definition is unchanged. `spec/commands/fix.md`'s opening sentence states the same floor in place of its "more than two of the host's `layerGroups`" clause. `[no-ac: wording — read by review; the retired clauses are the literals oracle of AC-20261103-13-14]` | This host declares one group, so the old trigger never fired here (ADR-0039 Context); Google's small-CL guidance sizes the landing unit by lines and files, not by architecture layers. |
| D2 | ADR-0039 D2, one capability per spec. `spec/doctrine/core.md` § Decomposition: the cap rises from ~12 to ~30 source-layer File Plan rows; "or a second primary area" is deleted as a split trigger; the sentence gains "landing stays in small green waves and checkpoint commits inside the spec"; `spec/templates/roadmap-overview.md`'s restatement shrinks to a pointer at core § Decomposition. `[no-ac: wording — read by review; `second primary area` is a literals stem of AC-20261103-13-14]` | 106 spec pairs shared 3+ files within 7 days under the ~12 cap (ADR-0039 Context); the cap sliced capabilities into siblings that then collided. |
| D3 | ADR-0039 D2, merge-forward at lock. `spec/scripts/collision-closure.js` gains an always-on **overlap leg**: it reads `readLedgerRows(root)` (`lib/observation.js`), takes every `stage:"plan"` row whose `ts` is within the last 7 × 86400 s and whose `spec` is not this spec, reads each such spec file that exists (a missing file is skipped silently), and intersects its non-tests File Plan paths (`parseFilePlanRows` + `isTestsRow`, `lib/file-plan.js`) with this spec's non-tests paths. A sibling sharing ≥ 3 paths is an overlap hit; the hit is **declared** when this spec's frontmatter `depends_on` names that spec's path (substring match on the repo-relative path). Text output appends an `overlap leg:` block after the literals leg — `  <spec>: <n> shared — <paths, comma-joined>` plus ` (declared in depends_on)` when declared, or `  (none)`; `--json` gains `overlap: [{spec, shared: [...], declared: bool}]`. Exit 1 (advisory, as today) when any undeclared overlap hit exists, and the remedy line names the two closures: fold this draft into the sibling, or add the sibling to `depends_on`. (AC-20261103-13-10) | The brief asks for merge-forward over the existing collision-closure machinery; the ledger's plan rows are the one record of "locked in the last 7 days" that every host carries. |
| D4 | `spec/commands/plan.md` Lock step 2: `collision-closure.js --spec {spec path} --root .` now runs at **every** lock (the overlap leg), with `--literal <stem>…` added under the existing trigger; each undeclared overlap hit is resolved before the lock by folding the draft into the sibling or declaring `depends_on`. Step 3's ledger row: `collisions` is always `{hits, waived}` from that run — the `{"skipped":true}` form is retired from the shape text (older rows keep it). `[no-ac: wording — read by review; AC-20261103-13-10 tests the leg]` | A check nobody runs is prose; the lock already runs the script on most specs. |
| D5 | ADR-0039 D3. `spec/doctrine/core.md` § Tiers gains, after its first sentence: the tier is a property of the files a spec touches (the host's § Risk Tiers surfaces and the process-boundary trigger), never of the spec as a whole — a spec whose critical-tier files are few carries literal examples on the ACs of those files and stays `standard`; a change that touches only doctrine, command or template prose is never critical. `spec/templates/spec.md`'s `tier:` frontmatter comment says the same in one clause. `[no-ac: wording — read by review]` | Continues specs/20261103/07 (the file decides at build); 77% of recent specs were critical tier by whole-spec contagion (ADR-0039 Context). |
| D6 | ADR-0039 D4, bump at release. `.claude/rules/conventions/doctrine.md`'s bump bullet becomes: the owning plugin's `plugin.json` bumps once per `/spec:release`, or once per landing to main where no release stage exists, via `node scripts/plugin-bump.js --bump --plugin <name> --changelog "<paragraph>"` with `node scripts/plugin-bump.js --shipped --plugin <name>` listing the CLEAN specs the bump carries; a spec never carries a plugin.json row and never names a version. `.claude/rules/spec-pipeline.md` § Planning's "Version bump discipline" bullet and § Review Checks' first bullet change to match (the standing guard is `tests/consistency/plugin-bump-gate.test.js`'s synthetic cases, not a run against the checkout). `spec/commands/release.md` Phase 4 gains step 0: on a marketplace host (`.claude-plugin/marketplace.json` present) run `--shipped` then `--bump` for each plugin before the tag. `git/commands/merge.md` Step 2 gains one sentence: run any landing-time check the host's pipeline rules § Review Checks declare before Step 3. `[no-ac: wording — read by review; AC-20261103-13-11 tests --shipped]` | changesets and semantic-release compute the version at release from what shipped; a per-change bump is the most-repaired File Plan row in this repo's Gotchas. |
| D7 | `scripts/plugin-bump.js` gains `--shipped --plugin <name> [--root <dir>]`: finds the commit that last changed the plugin's manifest (`git log -1 --format=%H %cI -- <manifestRel>`; no such commit → the repo's root commit date is not needed: every row qualifies), reads `.claude/spec-runs*.jsonl` rows with `stage:"review"`, `verdict:"CLEAN"` and `ts` after that commit's date, and prints one line per distinct spec, oldest first: `<spec path> — <the spec's H1 title, or the path when the file is unreadable>`. Nothing qualifies → prints nothing, exit 0. `--check` and `--bump` are unchanged. (AC-20261103-13-11) | The changelog paragraph is assembled from what shipped, so the bump needs the list the ledger already holds. |
| D8 | `tests/consistency/plugin-bump-gate.test.js`: the case running `--check` against this checkout is deleted (a branch no longer owes a bump); the synthetic red case stays as a `SHALL CONTINUE TO` pin, the provenance case stays, and a `--shipped` case is added under AC-11. The file stays untagged in its header comment as before. (AC-20261103-13-12) | The guard proves the script still detects an unbumped landing; where it runs moved from every branch's gate to the landing step. |
| D9 | ADR-0039 D4, machine commits: the lock commit (one), the close commit (one, now carrying the expiry deletions per D11) and the promoted-evidence commit after merge-back stay as they are — the last cannot fold into the merge commit because `merge-back.sh` refuses a dirty main root before merging. `[no-ac: a decision not to change; 📌 Auto-picked — the drivers do not allow the fold]` | Recorded so the ADR's "where the drivers allow" has an answer. |
| D10 | ADR-0039 D5, keep clause (b). `spec/scripts/expire-tests.js`: a tagged case is kept as `invariant` when its title or the contiguous comment block above it (the same span `citedAcIds` reads) contains the token `[invariant]`, and as `pin` when that span contains `[pin]`; the reach rule (child-process call plus an invariants-set basename, and the relative-require arm) is deleted along with `lib/case-reach.js`, and `keepsByReach` goes with it. A host-scanner case (`source: 'host'`) is judged on the same span. Clause (a) (escape class) and clause (c) (`SHALL CONTINUE TO`, `→ reuses`) are unchanged; `--invariants` mode and `lib/invariants.js` stay. The header comment states the three clauses. (AC-20261103-13-1) | Clause (b) kept 1,193 of 1,289 tagged tests (ADR-0039 Context) — a test that spawns a script is not thereby an invariant; a kept test is a tagged choice. |
| D11 | ADR-0039 D5, close applies. `spec/scripts/expire-tests.js` gains `--no-gate` (with `--apply` only; otherwise usage exit 2): the writes are made and no gate runs, `gate` in the JSON is `{"skipped":"no-gate"}`, `applied` is `true`. `spec/scripts/spec-review-driver.js` `doCloseWork()` passes `--apply --no-gate` (unless `policy.testExpiry` is `off`); `marks.testsExpiry` gains `files` (the sorted distinct `retired[].file` values) and `applied: true`; `refuseCloseTreeDrift()` adds `marks.testsExpiry.files` to its excludes; the CLOSE step's 🧹 line becomes `🧹 <n> tests expired with this spec (<m> files removed) — the deletions ride the close commit` and prints only when `retired > 0`. The close commit instruction is unchanged: the deletions are uncommitted tree edits like the canonical doc. `spec/doctrine/stages/stage-review.md`'s Close bullet says expiry is applied at CLOSE and a test the reviewer or disposer orders in a fix round is written with `[invariant]` in its title. (AC-20261103-13-2, AC-20261103-13-3) | The `--all-done --apply` sweep has never run; the gate is skipped because `--mark closed` re-runs the host gate over the committed close tree anyway. The field incident that ended close-time deletion (specs/20260912/15) was a reviewer-ordered guard carrying the spec's AC tag; under D10 that guard is tagged and kept. |
| D12 | ADR-0039 D5, runner grammar: `expire-tests.js` already reads the host's `testCaseScanner` (contract § Required config keys) and cuts only cases printed with a span, so a pytest or vitest host declaring a scanner expires at close with no further change; `spec/templates/grounding-contract.md` § Test expiry is rewritten to say tests are deleted at close (the sweep stays as the catch-up path), that `[invariant]`/`[pin]` and `SHALL CONTINUE TO` are the two ways a test outlives its spec, and that a non-JavaScript host expires through its `testCaseScanner` listing; § Test tiers says `slowTestCommand` runs once at review close and once at release, never in the build loop or the review legs. One edit to the contract. `[no-ac: wording — read by review; the contract's hash moves and `.claude/spec.config.json` is restamped]` | The contract must tell hosts the truth about when tests die; the scanner key already exists (specs/20261102/01's grammar family). |
| D13 | ADR-0039 D5, slow tier schedule. `spec/scripts/review-legs.js` deletes wave 2c (no `slow` row, no `slow-output.txt`, header updated); `spec/scripts/spec-review-driver.js` `runCloseTimeGate()` runs `config.slowTestCommand` bare after the whole-suite re-run when it is a non-empty string — non-zero exit refuses `--mark closed` with `slow red at close — <command> exited <n>` and the output's last 40 lines; `spec/scripts/release-legs.js` `stage` runs it as a `slow` leg row `{"leg":"slow","exit":E,"observed":{"skips":N,"todos":N,"testsExecuted":N|{"unavailable":…}}}` after wave 2 (typed like review's old row, output to `slow-output.txt`), and `spec/scripts/verdict.js` treats a present `slow` row as blocking on every profile (the `profile !== 'release'` guard goes). `spec/commands/init.md`'s slow-tier consequence text says the slow tests run at close and at release; `README.md`'s `/spec:fix` row states D1's floor. (AC-20261103-13-5, AC-20261103-13-6, AC-20261103-13-7, AC-20261103-13-8) | A slow tier run once per legs iteration is the review loop's most expensive repeated cost; close and release are the two points where the whole tree is certified. |
| D14 | ADR-0039 D5, close row. `doCloseWork()` adds `lines: {tests: N, production: M}` to the review row after `tests` (before `sessionTokens`): `git diff --numstat <base>` summed as insertions + deletions per path, classified by `isTestClassified(rel, fileShapes(config))` (`lib/file-shapes.js`); a binary `-` pair counts 0. (AC-20261103-13-4) | The test:production ratio must come from the ledger (ADR-0039 D6), and no row carries the split today. |
| D15 | ADR-0039 D6, metric before guard. `spec/scripts/lib/observation.js` exports `ceremonyMetrics(rows)` → `{ specs, suiteRuns, closes, testLines, productionLines }`: over distinct specs with a CLEAN review row, `suiteRuns` sums each spec's review-row legs named `suite` or `slow` whose `observed` has no `unavailable` key plus each build row's `gate.finalRounds` when `gate.postGate` is true; `closes`/`testLines`/`productionLines` sum review rows carrying `lines`. `spec/scripts/spec-status.js` prints, after the decide lines (and after 🧹 Hygiene under `--all`) and before the footer, two lines: `📈 suite runs per spec: <suiteRuns/specs to 1 decimal> (<specs> specs)` and `📈 test:production lines: <testLines/productionLines to 2 decimals> (+<testLines>/+<productionLines> over <closes> close(s))`; `n/a` replaces the number when `specs` is 0 or `productionLines` is 0. `--json` and `--next --json` are unchanged. No ratchet, no anomaly, no blocking. (AC-20261103-13-9) | Betterer and Sonar ratchet only after a measured baseline; core § Incident Policy's admission bar needs the number before any guard is proposed. |
| D16 | `spec/commands/doctor.md` check 20 shrinks to the two dry runs plus one sentence: the close applies expiry; `--all-done --apply` is the catch-up for tests that closed before this version, still behind one `AskUserQuestion`. `spec/commands/status.md` names the 📈 lines in its block list. `spec/templates/spec.md` § Acceptance Criteria comment: an AC test is scaffolding deleted at close unless its title carries `[invariant]` or its bullet is a `SHALL CONTINUE TO` pin. `[no-ac: wording — read by review]` | One binding home per rule (core § Doctrine Authoring). |
| D17 | Fixture currency: `tests/review/review-driver.fixtures.js`'s `GREEN_TEST` title gains ` [invariant]` so the shared close rehearsals keep their one tagged test through the now-applied expiry; `tests/review/review-driver-close-expiry.test.js` and the new `tests/review/review-driver-close-slow.test.js` are the only places the deletion and the slow run are exercised. Retired AC tags: specs/20260912/15 AC-1, AC-2, AC-6; specs/20261103/05 AC-4, AC-5, AC-6; specs/20261101/07 AC-2, AC-3, AC-4, AC-5 — each bullet ends `[retired: specs/20261103/13-a-change-is-sized-by-its-files.md]`. `[no-ac: fixture and tag currency; the ACs above cover the behaviour]` | Rules § Gotchas: a new close-time side effect strands every shared setup that rehearses the step; a deleted test case's AC-ID is tagged retired in the same batch. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/doctrine/core.md | MODIFY | doctrine | D1 § Pipeline Entry lane floor; D2 § Decomposition ~30 rows, no second-area trigger; D5 § Tiers file-property sentence |
| spec/commands/fix.md | MODIFY | doctrine | D1 opening sentence: the floor replaces the `layerGroups` count |
| spec/commands/plan.md | MODIFY | doctrine | D4 lock step 2 overlap leg at every lock; step 3 `collisions` shape |
| spec/templates/spec.md | MODIFY | doctrine | D5 tier comment; D16 AC comment: scaffolding by default, `[invariant]` |
| spec/templates/grounding-contract.md | MODIFY | doctrine | D12 § Test expiry and § Test tiers — the one contract edit |
| spec/doctrine/stages/stage-review.md | MODIFY | doctrine | D11 Close bullet: expiry applied at CLOSE, deletions ride the close commit, fix-round guard tests carry `[invariant]`; D13 slow runs at `--mark closed` |
| spec/commands/doctor.md | MODIFY | doctrine | D16 check 20 shrinks |
| spec/commands/status.md | MODIFY | doctrine | D16 names the two 📈 lines |
| spec/commands/release.md | MODIFY | doctrine | D6 Phase 4 step 0 bump from `--shipped`; D13 names the `slow` row via release-legs' header |
| git/commands/merge.md | MODIFY | doctrine | D6 Step 2: landing-time checks the host rules declare |
| spec/templates/roadmap-overview.md | MODIFY | doctrine | D2 its decomposition sentence shrinks to a pointer at core § Decomposition (literals-leg hit) |
| spec/commands/init.md | MODIFY | doctrine | D13 slow-tier consequence text: runs at close and at release, never per review (literals-leg hit) |
| README.md | MODIFY | other | D1 the `/spec:fix` row's "when" cell states the size floor (literals-leg hit) |
| .claude/rules/conventions/doctrine.md | MODIFY | other | D6 bump bullet: once per release or landing |
| .claude/rules/spec-pipeline.md | MODIFY | other | D6 § Planning version-bump bullet and § Review Checks first bullet |
| .claude/spec.config.json | MODIFY | other | D12 `contractHash` restamped to `$(spec-paths contract-hash)` after the contract edit |
| spec/scripts/expire-tests.js | MODIFY | scripts | D10 `[invariant]`/`[pin]` keep clause replaces reach; D11 `--no-gate`; header; no dependency change |
| spec/scripts/lib/case-reach.js | DELETE | scripts | D10 sole consumer gone |
| spec/scripts/spec-review-driver.js | MODIFY | scripts | D11 `--apply --no-gate` at CLOSE, `marks.testsExpiry.files`, drift excludes, 🧹 line; D13 slow at `runCloseTimeGate`; D14 `lines` row key; no dependency change |
| spec/scripts/review-legs.js | MODIFY | scripts | D13 wave 2c deleted, header row grammar drops `slow` |
| spec/scripts/verdict.js | MODIFY | scripts | D13 `slow` blocking-if-present on every profile |
| spec/scripts/release-legs.js | MODIFY | scripts | D13 `slow` leg after wave 2; header row grammar gains it; no dependency change |
| spec/scripts/spec-status.js | MODIFY | scripts | D15 two 📈 lines before the footer; `--json` shapes untouched |
| spec/scripts/lib/observation.js | MODIFY | scripts | D15 `ceremonyMetrics(rows)` |
| spec/scripts/collision-closure.js | MODIFY | scripts | D3 overlap leg (ledger plan rows ≤ 7 days, ≥ 3 shared non-tests paths, `depends_on` declares); text + `--json`; no dependency change |
| scripts/plugin-bump.js | MODIFY | scripts | D7 `--shipped --plugin <name>`; header usage; no dependency change |
| tests/expiry/test-expiry.test.js | MODIFY | tests | AC-20261103-13-1, AC-20261103-13-2 |
| tests/expiry/case-reach.test.js | DELETE | tests | D10 — its subject is deleted; AC-20261103-05-4..6 tagged retired |
| tests/review/review-driver.fixtures.js | MODIFY | tests | D17 `GREEN_TEST` title carries `[invariant]` |
| tests/review/review-driver-close-expiry.test.js | MODIFY | tests | AC-20261103-13-3, AC-20261103-13-4 |
| tests/review/review-driver-close-slow.test.js | CREATE | tests | AC-20261103-13-5 |
| tests/review/review-legs-slow-leg.test.js | MODIFY | tests | AC-20261103-13-6 |
| tests/review/verdict-slow-leg.test.js | MODIFY | tests | AC-20261103-13-8 |
| tests/release-legs/slow-leg.test.js | CREATE | tests | AC-20261103-13-7 |
| tests/status/ceremony-metrics.test.js | CREATE | tests | AC-20261103-13-9 |
| tests/collision-closure-overlap.test.js | CREATE | tests | AC-20261103-13-10 |
| tests/consistency/plugin-bump-gate.test.js | MODIFY | tests | AC-20261103-13-11, AC-20261103-13-12; the this-checkout `--check` case deleted (D8) |
| tests/ceiling/host-scanner.test.js | MODIFY | tests | AC-20261103-13-13 added to the reused case's title after its prefix |
| specs/20260912/15-the-close-stops-deleting-tests.md | MODIFY | other | D17 retired tags on AC-1, AC-2, AC-6 |
| specs/20261103/05-tests-that-earn-their-keep.md | MODIFY | other | D17 retired tags on AC-4, AC-5, AC-6 |
| specs/20261101/07-the-gate-is-scoped-and-the-slow-tier-has-a-home.md | MODIFY | other | D17 retired tags on AC-2, AC-3, AC-4, AC-5 |

## Contracts

```text
# expire-tests.js (D10, D11)
expire-tests.js --root <r> (--spec <path> | --all-done | --invariants) [--apply [--keep-on-red] [--no-gate]] [--json]
keep clauses: (a) call text names a ledger escape class → kept.class
              (b) title or comment block above holds `[invariant]` → kept.invariant; `[pin]` → kept.pin
              (c) a cited AC bullet is SHALL CONTINUE TO (post-floor) or names the case via → reuses → kept.pin
--no-gate JSON: {"applied":true,"gate":{"skipped":"no-gate"}, ...}   (exit 0)
--no-gate without --apply: usage, exit 2

# review close row (D14) — key order
{..., "tests":{"born":2,"kept":1,"retired":1}, "lines":{"tests":2,"production":1}, "sessionTokens":{...}}

# marks.testsExpiry (D11)
{ "born": 2, "kept": 1, "retired": 1, "filesRemoved": 0, "applied": true, "files": ["tests/foo.test.js"] }

# CLOSE step line (D11)
🧹 1 tests expired with this spec (0 files removed) — the deletions ride the close commit

# --mark closed refusal (D13)
slow red at close — <slowTestCommand> exited <n> over the committed close tree.

# release-legs stage row (D13)
{"leg":"slow","exit":E,"observed":{"skips":N,"todos":N,"testsExecuted":N|{"unavailable":"..."}}}

# collision-closure overlap leg (D3)
overlap leg:
  specs/20261103/04-x.md: 3 shared — spec/scripts/a.js, spec/scripts/b.js, spec/doctrine/core.md
  specs/20261103/02-y.md: 3 shared — ... (declared in depends_on)
  (none)
--json: "overlap": [{"spec":"specs/20261103/04-x.md","shared":["spec/doctrine/core.md","spec/scripts/a.js","spec/scripts/b.js"],"declared":false}]
window: plan rows with ts >= now − 7×86400 s; a hit = shared.length >= 3

# plugin-bump.js --shipped (D7)
node scripts/plugin-bump.js --shipped --plugin spec [--root <dir>]
specs/20261103/07-the-file-decides-not-the-tier.md — The file decides, not the tier
(oldest first; one line per distinct spec; nothing qualifies → empty stdout, exit 0)

# spec-status.js (D15) — two lines after the decide lines / 🧹 Hygiene, before the footer
📈 suite runs per spec: 2.0 (2 specs)
📈 test:production lines: 1.50 (+3/+2 over 1 close)
📈 suite runs per spec: n/a (0 specs)          ← no CLEAN review row
📈 test:production lines: n/a (+0/+0 over 0 closes)

# lib/observation.js (D15)
ceremonyMetrics(rows) → { specs, suiteRuns, closes, testLines, productionLines }
```

## Behavior

- **Close** (D11, D13, D14): `doCloseWork()` runs the authoritative verdict, then
  `expire-tests.js --root <r> --spec <spec> --apply --no-gate --json`; the retired cases are cut from
  disk, the row gains `tests` and `lines`, the 🧹 line prints when anything was cut. The session
  commits everything (the close commit). `--mark closed` runs the host gate, the whole suite, then
  `slowTestCommand` when declared; the drift check ignores the files expiry removed.
- **Lock** (D3, D4): `collision-closure.js` runs on every lock; an undeclared overlap is resolved by
  folding or `depends_on` before step 3.
- **Release** (D6, D7, D13): `release-legs.js stage` runs the slow tier as a leg; Phase 4 bumps each
  plugin from `--shipped`'s list.
- **Status** (D15): two 📈 lines, render-only; `--json` byte-identical to today.
- Edge: a spec whose tagged tests are all kept prints no 🧹 line and `marks.testsExpiry.files` is
  `[]`. A host with `policy.testExpiry: off` behaves exactly as today. A ledger with no plan rows in
  the window prints `overlap leg:` + `  (none)`. A manifest never changed by any commit makes every
  CLEAN review row qualify for `--shipped`.

## Acceptance Criteria

- **AC-20261103-13-1**: WHEN `expire-tests.js --root <r> --spec <done spec> --json` runs over a fixture host whose six tagged tests are: one naming a ledger escape class, one that `spawnSync`s the gate script with no bracket token, one whose title carries `[invariant]`, one whose comment block carries `[pin]`, one citing a `SHALL CONTINUE TO` donor, and one citing a still-implementing sibling THE SYSTEM reports `kept` as `{"class":1,"invariant":1,"pin":2,"open":1}` and lists the spawning test under `retired` (e.g. the file `tests/kept-invariant.test.js` of the existing fixture, retagged without a token, appears in `retired[].file`) → rewrites tests/expiry/test-expiry.test.js :: AC-20260911-03-3 / AC-20260912-13-1
- **AC-20261103-13-2**: WHEN `--apply --no-gate --json` runs on a fixture host whose `gateCommand` is `exit 1` THE SYSTEM removes the retired cases from disk, exits 0, reports `applied: true` and `gate: {"skipped":"no-gate"}`, and never runs the gate; and WHEN `--no-gate` is passed without `--apply` THE SYSTEM exits 2 with a usage line naming `--no-gate` → writes tests/expiry/test-expiry.test.js
- **AC-20261103-13-3**: WHEN the review driver reaches CLOSE for a fixture spec whose two tagged tests are one `SHALL CONTINUE TO` pin and one plain test THE SYSTEM removes the plain test from `tests/foo.test.js` on disk, leaves the pin, records `tests:{born:2,kept:1,retired:1}` on the close row, prints `🧹 1 tests expired with this spec (0 files removed) — the deletions ride the close commit`, and after the session commits the tree `--mark closed` exits 0 → rewrites tests/review/review-driver-close-expiry.test.js :: AC-20260912-15-1
- **AC-20261103-13-4**: WHEN the close row is written for a fixture branch whose diff against the base added 2 lines to `tests/foo.test.js` and 1 line to `src/foo.js` THE SYSTEM records `lines: {"tests":2,"production":1}` on the row, placed after `tests` and before `sessionTokens` when that key is present → writes tests/review/review-driver-close-expiry.test.js
- **AC-20261103-13-5**: WHEN `--mark closed` runs over a committed close tree on a host whose `slowTestCommand` is `exit 1` THE SYSTEM refuses with exit 2 and a line starting `slow red at close — exit 1 exited 1`; WHEN it is `exit 0` THE SYSTEM marks closed with exit 0; and WHEN no `slowTestCommand` is declared THE SYSTEM prints no `slow` mention → writes tests/review/review-driver-close-slow.test.js
- **AC-20261103-13-6**: WHEN `review-legs.js` runs over a host declaring `slowTestCommand` THE SYSTEM appends no `slow` row to the manifest, writes no `slow-output.txt`, and the summary's leg set is identical to a host declaring none → rewrites tests/review/review-legs-slow-leg.test.js :: AC-20261101-07-2
- **AC-20261103-13-7**: WHEN `release-legs.js stage` runs over a release host declaring `slowTestCommand` pointing at a script that exits 1 THE SYSTEM appends `{"leg":"slow","exit":1,...}` after the e2e row, writes `slow-output.txt` under `--out-dir`, prints `RED_BLOCKING:` naming `slow` and exits 1; WHEN the script exits 0 reporting `ℹ tests 3` under the host's `testCountPattern` THE SYSTEM appends `exit:0` with `testsExecuted: 3`; and WHEN none is declared THE SYSTEM appends no `slow` row → writes tests/release-legs/slow-leg.test.js
- **AC-20261103-13-8**: WHEN `verdict.js --profile release` reads a manifest whose seven release legs are green plus a `slow` row with `exit:1` THE SYSTEM derives a red verdict (not CLEAN), and with the `slow` row at `exit:0` derives CLEAN → rewrites tests/review/verdict-slow-leg.test.js :: AC-20261101-07-5
- **AC-20261103-13-9**: WHEN `spec-status.js --root .` renders a fixture host whose ledger holds, for two done specs, one review row each with a `suite` leg (one also with `lines:{tests:3,production:2}`) and one build row each with `gate:{finalRounds:1,postGate:true}` THE SYSTEM prints `📈 suite runs per spec: 2.0 (2 specs)` and `📈 test:production lines: 1.50 (+3/+2 over 1 close)` immediately before the footer line; WHEN the ledger is absent THE SYSTEM prints `📈 suite runs per spec: n/a (0 specs)` and `📈 test:production lines: n/a (+0/+0 over 0 closes)`; and WHEN `--json` or `--next --json` runs THE SYSTEM emits no `metrics` key and no 📈 text → writes tests/status/ceremony-metrics.test.js
- **AC-20261103-13-10**: WHEN `collision-closure.js --spec <draft> --root <r>` runs on a fixture host whose ledger holds a `stage:"plan"` row dated 2 days ago for sibling S sharing exactly 3 non-tests File Plan paths with the draft, and a row dated 9 days ago for sibling T sharing 4 THE SYSTEM prints `overlap leg:` followed by one line naming S with `3 shared` and the three paths, omits T, exits 1, and `--json` carries `overlap: [{"spec": <S>, "shared": [3 paths], "declared": false}]`; WHEN the draft's `depends_on` names S THE SYSTEM prints the same line with ` (declared in depends_on)` and exits 0; and WHEN no plan row is in the window THE SYSTEM prints `  (none)` under the leg → writes tests/collision-closure-overlap.test.js
- **AC-20261103-13-11**: WHEN `plugin-bump.js --shipped --plugin spec` runs on a synthetic marketplace host whose manifest was last changed at commit C and whose ledger holds CLEAN review rows for spec X (ts after C's date) and spec Y (ts before C's date) THE SYSTEM prints exactly one line `<X path> — <X's H1 title>` and exits 0; WHEN the ledger is absent THE SYSTEM prints nothing and exits 0 → writes tests/consistency/plugin-bump-gate.test.js
- **AC-20261103-13-12**: WHEN a synthetic marketplace branch changes a file under the plugin directory while `plugin.json` stays at the base version THE SYSTEM SHALL CONTINUE TO exit 1 from `--check`, naming the plugin and the `--bump` remedy → reuses tests/consistency/plugin-bump-gate.test.js :: gate wiring: an unbumped change under a plugin directory is red
- **AC-20261103-13-13**: WHEN `expire-tests.js --spec <done spec> --json` runs over a host whose `testCaseScanner` lists one tagged case with a span and one without THE SYSTEM SHALL CONTINUE TO leave the span-less case uncut, listed under `unscannable` with the span reason, and the file byte-identical → reuses tests/ceiling/host-scanner.test.js :: AC-20261101-01-9
- **AC-20261103-13-14** `[oracle: literals]`: the File Plan's non-tests files no longer contain `second primary area`, `nothing is deleted at close`, `once per review legs iteration`, `more than two of the host's`, `across more than two`

## Assumptions (escalation triggers)

- A1: Micro-spike 2026-11-03 (scratch Node script, deleted): `git add <deleted tracked path>` exits 0 and stages the deletion, and the following commit leaves `git status --porcelain` empty — so the existing fixture `commitClose` (`git add host.specRel tests/foo.test.js`) commits the expiry deletion unchanged. **if false:** fixture `commitClose` switches to `git add -A` in the same wave; never neuter the deletion.
- A2: Same spike: `git diff --numstat` prints `<added>\t<deleted>\t<path>` per path and `-\t-\t<path>` for binary; D14 sums the two numbers and skips `-`. **if false:** fall back to `--shortstat` totals under `production` only and record the deviation.
- A3: Same spike: `git log -1 --format='%H %cI' -- <path>` prints the last commit touching the path with an ISO-8601 date, and prints an empty line with exit 0 for a path no commit touched — D7's "every row qualifies" arm. **if false:** treat a non-zero exit as "every row qualifies" too.
- A4: Same spike: `parseFilePlanRows` on specs/20261103/07 returns 10 rows shaped `{paths, action, layer, summary}` with 3 `isTestsRow` rows — D3's intersection reads `paths`. **if false:** STOP, the library's shape is this spec's input.
- A5: The ledger probe (2026-11-03) over this repo's last six specs gives review `suite` legs 0–1 and build `gate.finalRounds` 0–3 per spec, so D15's sum is non-trivial on real rows. **if false:** nothing changes; the metric is defined over what rows record.
- A6: `tests/host-config/contract-keys.test.js`'s AC-20261101-07-1 pins that § Test tiers exists after § Test expiry and names `slowTestCommand` there and in the optional run, plus that the hash moved — D12 keeps the heading, the key and the order. **if false:** update that pin in place and retag it with AC-20261103-13-13's neighbour; never weaken it.
- A7: Review of this spec runs the installed plugin (7.327.0 at plan time), whose `ac-matrix.js` evaluates `[oracle: literals]` itself (specs/20261103/05 D1 shipped). **if false:** STOP and ask: the literals criterion has no manifest leg on an older plugin.
- A8: `measureDrift`'s `excludes` become `:(exclude)<path>` pathspecs (read 2026-11-03, `lib/close-tree-drift.js`), so a deleted test path passed in is ignored by the drift check. **if false:** exclude by directory prefix of each removed file and record the deviation.
- A9: `tests/consistency/read-load.test.js` budgets the lines `spec-paths shared-for status` serves; D1/D2/D5 add at most three net lines to core.md's served sections. **if false:** condense the touched sections in place until the budget holds; grep the literals inside any reflowed passage first (rules § Gotchas, fifth trigger).
- A10: No test under `tests/` greps the review driver's old 🧹 wording, the review-legs `slow` wave, or `second primary area` outside the four files in the File Plan (grep 2026-11-03: hits only in `tests/review/review-driver-close-expiry.test.js`, `tests/review/review-legs-slow-leg.test.js`, `tests/review/verdict-slow-leg.test.js`). **if false:** the hit enters the File Plan as a fix row in the same wave.
- A11: `tests/review/review-driver.test.js` cites AC-20260912-15-2 beside a `--mark closed` rehearsal whose only tagged test is `GREEN_TEST` — tagged `[invariant]` under D17, nothing is deleted there and the case stays green. **if false:** that case is retagged under AC-20261103-13-3 and asserts the deletion instead.

## Rationale

The ADR carries the argument; this spec carries the mechanics and the two places where the
mechanics had to bend the ADR's words. First, the "new optional config key `slowTestCommand`" is
not new — specs/20261101/07 added it, running once per review legs iteration. D13 keeps the key and
moves its two runs to close and release; the ADR's Applies-to records the supersession. Second,
"the expiry scanner reads the host's declared runner grammar" was already true through
`testCaseScanner`; D12 says so in the contract and adds no code, with AC-13 pinning the existing
behaviour so the claim has an executed witness.

The reversal of specs/20260912/15 is deliberate and narrower than it looks. That spec stopped
close-time deletion after a reviewer-ordered guard test, tagged with the spec's AC-ID, was deleted
by the same review's close. Its Rationale said the AC tag is provenance, not worth, and that the
manual sweep was the mechanism that had worked. The audit answers both: the sweep has never run,
and keep clause (b) turned "provenance" into 93% permanence by accident. D10 makes keeping a tagged
choice — `[invariant]` on the test, `SHALL CONTINUE TO` on the bullet — and D11's doctrine line
tells the fix round to tag what the reviewer orders, which is exactly the test the 2026-09-12
incident lost. The gate is skipped inside `--apply` because `--mark closed` already certifies the
committed tree with the host gate and the whole suite; running it twice is the ceremony this ADR
is cutting.

The bump moves off the branch (D6–D8). The guard test's "this checkout is green" case was the
only thing that made every spec branch owe a bump; deleting that case and keeping the synthetic
red is what lets a branch land unbumped while the script still proves it detects an unbumped
landing. `--shipped` is the ledger-derived list the ADR asked for; the paragraph itself stays
human-written because a changelog sentence is wording. The merge-forward leg rides
`collision-closure.js` because the brief asked for the existing machinery; the 7-day window and
the ≥3-file threshold are the audit's own numbers.

D9 is the one auto-pick: the promoted-evidence commit after merge-back stays, because
`merge-back.sh` refuses a dirty main root and folding the ledger into the merge commit would mean
writing it before the merge lands. Rejected at planning: a `--since <ref>` on `--check` to make the
gate green on branches (keeps a per-branch check nobody needs); a `lines` derivation at status time
from git (status is a ledger reader, never a second derivation); putting the 📈 numbers in the
footer clauses (the ADR says two lines, and the footer is one sentence).

Collision closure at lock (2026-11-03): 158 unplanned hits, 155 waived — the paths leg's
`executes` hits are tests that spawn the scripts this spec edits (review driver, verdict,
release-legs, spec-status, collision-closure, plugin-bump) and are adjudicated by the build's
whole-suite check; the literals leg's three doctrine hits entered the File Plan
(`spec/templates/roadmap-overview.md`, `spec/commands/init.md`, `README.md`), the ADR and
`docs/canonical/*` hits are the ADR's own record and the Canonical Delta, `init-gen.js`,
`lib/invariants.js` and their tests only name the `slowTestCommand` key, and `plugin.json`'s
`case-reach` mention is a past changelog entry.

Tier: `standard` under D5's own rule. `spec-status.js` and `grounding-contract.md` are § Risk
Tiers surfaces, so AC-9 and the contract-hash restamp carry literal examples and the `--json`
shapes are pinned untouched; nothing irreversible is touched.

## Canonical Delta

`docs/canonical/pipeline.md`: the paragraph beginning "The scoping is a host declaration" ends
instead: "The contract also names the slow tier: `slowTestCommand`, the host's own invocation of
the tests it excludes from `testCommand`, runs once at review close (`--mark closed`, after the
whole-suite re-run) and once at release as `release-legs.js`'s blocking `slow` leg — never in the
build loop or the review legs (specs/20261103/13-a-change-is-sized-by-its-files.md, superseding
specs/20261101/07's per-iteration run)." A new paragraph under the pipeline-entry heading: "A
repair under ~100 production lines touching at most three non-test files takes `/spec:fix`
whatever the host's `layerGroups` count; a spec is one capability of up to ~30 source-layer File
Plan rows, and a draft sharing three or more non-test files with a spec locked in the last seven
days folds into it or declares `depends_on` — `collision-closure.js`'s overlap leg at every lock.
The tier is a property of the files touched, never of the spec. The plugin version bumps once per
release or landing from `plugin-bump.js --shipped`'s list, never per spec. `/spec:status` prints
suite runs per spec and the test:production line ratio from the ledger; no ratchet guards them
(ADR-0039)."

`docs/canonical/review-close.md`: the bullet "Tests are classified at close, deleted only by a
deliberate sweep" becomes "Tests are classified and deleted at close": the close work runs
`expire-tests.js --spec <spec> --apply --no-gate`; a tagged test survives only through a ledger
escape class, an `[invariant]`/`[pin]` token in its title or comment block, or a `SHALL CONTINUE
TO` bullet; the deletions ride the session's close commit and the drift check ignores them; the
row records `tests:{born,kept,retired}` (retired now meaning deleted) and `lines:{tests,production}`;
the 🧹 line says what was removed. `--all-done --apply` remains the catch-up sweep for tests that
closed before this version (specs/20261103/13).

`docs/canonical/review-legs.md` § The slow leg: "Review legs run no slow leg; `slowTestCommand`
runs at `--mark closed` and as `release-legs.js`'s `slow` leg (specs/20261103/13)."
