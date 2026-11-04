---
date: 2026-11-03
status: hardened
tier: standard           # caller-fixed at plan time (see D0); the host's § Risk Tiers names review-legs.js and grounding-contract.md — the build upgrades on mid-build evidence per core § Tiers
area: gate-integrity
breaking: false
depends_on: [specs/20261101/06-a-rerun-re-runs-only-what-went-red.md, specs/20261101/05-the-gate-that-ran-the-suite-is-the-suite.md]
brief: n/a
spiked: 2026-11-03
open_markers: 0
---

# One suite run per tree

## Goal

The host test suite runs several times over trees that are byte-identical in every file a test
can read. Today's audit measured a clean spec at ~6.6 suite-equivalents on this repo (build
post-gate, review gate, review suite, at-risk, close gate, close suite, fan-out gate) and ~4 on
genesis-seeded hosts, and the ledger (1,004 rows at audit) holds zero cases where a same-tree
rerun caught anything — all 7 suite-only reds after a post-gate build carried `diff.dirty:true`,
a changed tree. Done means a green run's result is recorded once per (command, tree, declared
test-env names) in a cache every worktree of the repo shares, every later consumer of that same
command over that same tree reuses the recorded row with a provenance stamp instead of spawning,
a red result is never reused, and the scoped gate names the File Plan's exact test files instead
of widening to their directories.

## Users

- Spec owner: When a spec reaches review after a green build, I want the review's gate and suite
  legs to reuse the build's green run over the unchanged tree, so I can get to the reviewer in
  minutes instead of waiting for the same suite again. First run / empty: no cache entry exists;
  every consumer runs the command and records it.
- Spec owner: When the close commit writes only the pipeline's own overlay (spec status, canonical
  doc, ledger) and no test reads those paths, I want the close-time suite skipped under
  `policy.closeSuite: auto`, so I can close without a third whole-suite run. First run / empty:
  a host whose config predates the key reads `auto`.
- Fan-out operator: When a lane merges into main and main's tree equals the tree the lane's
  review already judged green, I want the post-merge gate reused from the cache, so I can merge
  the next lane without a serial suite run per lane. First run / empty: a main tree no lane
  judged runs the gate and records it.
- Fix session: When I run `/spec:fix`, I want the gate run once by the session while workers run
  only their named test file, so I can keep the fix lane under one suite run.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D0 | `tier: standard`, caller-fixed at plan time `[asked: the user pre-gave tier standard — not boot-path code, no data model]`; the host's § Risk Tiers names `review-legs.js` and `grounding-contract.md` as critical triggers, so the build upgrades on the first mid-build evidence per core § Tiers. `[no-ac: frontmatter — read by the drivers]` | The tier is the owner's call; the file-named triggers are recorded so the upgrade path is visible. |
| D1 | New `spec/scripts/lib/run-cache.js` exports `treeSha(repoRoot, {exclude})`, `cacheDir(repoRoot)`, `keyFor(cmd, tree, envNames)`, `lookup(repoRoot, cmd, tree)` and `record(repoRoot, cmd, tree, {exit, observed})`. `treeSha` is `spec-review-driver.js`'s `snapshotTree()` lifted verbatim (HEAD-seeded scratch index, `add -A`, `write-tree`, index file removed in `finally`) with the scratch index under `cacheDir` and `exclude` an array of repo-relative paths each carried as `:(exclude)<p>` (skipped when `git check-ignore` already ignores it); the driver's `snapshotTree()` becomes `treeSha(repoRoot, {exclude: [sidecarRel]})`. `cacheDir` = `path.resolve(repoRoot, git rev-parse --git-common-dir)/spec-run-cache`. Key = sha256 of `cmd + '\0' + tree + '\0' + envNames.slice().sort().join(',')` where `envNames` are the `var` names of the host config's `testEnv` rows (never values); the entry file `<cacheDir>/<key>.json` holds `{cmd, tree, envNames, observed, ts}`. `record` writes only when `exit === 0` and `observed.testsExecuted` is a number, returns `true` then and `false` otherwise (nothing written); `lookup` returns the parsed entry or `null`. (AC-20261103-10-1, AC-20261103-10-2, AC-20261103-10-3, AC-20261103-10-4) | One tree derivation, one key, one store; a red or count-less green vouches for nothing (05's rule, now at the cache). |
| D2 | 📌 Auto-picked: the CACHE KEY tree is `treeSha(repoRoot, {exclude: [...PIPELINE_OVERLAY, ...callerSidecars]})` with `PIPELINE_OVERLAY = ['.claude/spec-runs.jsonl', '.claude/spec-runs.stopped.jsonl', '.claude/spec-runs/', '.claude/agent-memory/']` exported by run-cache.js as `cacheTree(repoRoot, extraExcludes)`; the driver's `snapshotTree()`/`legsTree`/`judgedTree` keep their sidecar-only exclusion. (AC-20261103-10-1) | Every stage writes a ledger row between its own gate and the next stage's; keying on a tree that includes the ledger would miss on every build→review handoff. The ledger is pipeline-owned and no test reads it (A2). Picked because it removes the most suite runs. |
| D3 | `spec-build-driver.js` `runGate()` runs the resolved scoped gate and the resolved `postGateCommand` as TWO `runHost` children in sequence, both appending to `gate-<k>.log`, the driver itself writing the `== postGateCommand` marker line between them; a red first child skips the second (marker never lands). Before each child the driver calls `lookup(repoRoot, <that part's resolved string>, cacheTree)` and on a hit writes `== reused cache:<tree7> <cmd>` to the log instead of spawning; after each green child it computes `observed` over that child's own log slice with `lib/count-observation.js` and calls `record`. `marks.gateRuns[k]` becomes `{exit, log, tree: <40-hex cacheTree>, cached: ['gate'|'postGate'…]}` and the DONE ledger row's `gate` block gains `tree` (the last run's `tree`) and `cached` (the last run's list). (AC-20261103-10-5, AC-20261103-10-6, AC-20261103-10-7, AC-20261103-10-8) | The post-gate is the whole suite — the expensive part and the one review wants; two children are what lets each part be keyed by its own command string. |
| D4 | `lib/gate-resolve.js` gains the `{testFiles}` placeholder: the space-joined `quote()`d exact File Plan test files (fixtures dropped, baselines dropped, no directory or glob widening), substituted in `resolveGate` and `resolveGateForFiles`; the placeholder regex in `resolveGate`, `resolveGateForFiles`, `gateRunsSuite`, `init-gen.js`'s `scoped` probe and `expire-tests.js`'s prose reads `\{testDirs\}|\{scopeDirs\}|\{testFiles\}`; `{testDirs}`/`{scopeDirs}` are byte-identical to today. This repo's `.claude/spec.config.json` `gateCommand` ends `{testFiles}` instead of `{testDirs}`. (AC-20261103-10-9, AC-20261103-10-10, AC-20261103-10-11) | A File Plan names files; a `tests/review/*.test.js` glob runs 50 files to check 3. Spike S1: Node 26 runs an explicit file list. |
| D5 | `review-legs.js` gains `--tree <40-hex>` (the driver passes `cacheTree(repoRoot, [sidecarRel])`, recorded as `marks.cacheTree[String(n)]`); a malformed value exits 2 naming the flag, an absent flag means the cache is never consulted nor written. With it, the `gate` and `suite` legs resolve in this order: a `--reuse-from` prior green row (today's path, `reusedFrom: <basename>`), else a cache hit → the row `{leg, exit: 0, observed: {...entry.observed, reusedFrom: 'cache:' + tree.slice(0,7)}, scope}` with no spawn and no `gate-output.txt`/`suite-output.txt`, else today's spawn or `reused:'gate'` copy; every green spawned gate/suite row with a numeric `testsExecuted` is `record`ed under its command (the `reused:'gate'` suite copy records `config.testCommand` too). (AC-20261103-10-12, AC-20261103-10-13, AC-20261103-10-14, AC-20261103-10-15) | Same provenance shape as `--reuse-from`; verdict.js reads `observed` opaquely for these legs (06 A2), so no verdict change. |
| D6 | The `at-risk` leg appends `{files: N, testsExecuted: <suite row's number>, reused: 'suite'}` with no spawn and no `at-risk.txt` whenever this iteration's `suite` row is `exit 0` with a numeric `testsExecuted` and `config.testCommand` has no `{file}`; otherwise (suite red, count unobserved, `file-placeholder`, `no-test-command`, zero at-risk files, malformed entries) today's branches run byte-identically. (AC-20261103-10-16, AC-20261103-10-17) | A bare `testCommand` run over the tree executed every at-risk file already; the `{file}` form has no bare run to stand on. |
| D7 | `lib/host-config.js` `POLICY_DEFAULTS` gains `closeSuite: 'auto'` and `POLICY_ENUMS.closeSuite = ['always', 'auto']`; `mergePolicy`/`validatePolicy` treat it like `testExpiry`. `grounding-contract.md` § Required config keys names `{testFiles}` beside `{testDirs}`/`{scopeDirs}`, and § Policy's JSON block gains `"closeSuite": "auto"` with the Enums sentence `` `closeSuite` `always | auto` `` and the semantics sentence (D8); this repo's config sets `policy.closeSuite: "always"` and restamps `contractHash` with `spec-paths contract-hash`. (AC-20261103-10-18, AC-20261103-10-19) | One edit to the contract (host cap); this repo's tests read doctrine and canonical docs, so its close delta is never test-invisible. |
| D8 | `spec-review-driver.js` `runCloseTimeGate()`: the gate half consults the cache with `cacheTree(repoRoot, [sidecarRel])` of the close tree (hit → `close-time gate: reused cache:<tree7>`, no spawn; green spawn → `record`). The suite half, after today's `gateRunsSuite` reuse, under `policy(root).closeSuite === 'auto'` ONLY: lists `git diff --name-only <marks.judgedTree> HEAD` (every path is inside `refuseCloseTreeDrift()`'s exclude list or its `skipped` set, since that refusal passed), writes them to `<sidecar>/close-overlay.txt`, runs `scope-reconcile.js --probe-at-risk <that file> --root <repoRoot>`, and when `refs === 0` AND `lookup(repoRoot, config.testCommand, marks.cacheTree[marks.iteration])` hits, prints `close-time suite: skipped — close delta is overlay-only and no test reads it (policy.closeSuite: auto)` and spawns nothing; any other outcome (refs > 0, no cache entry, probe failure, `always`) runs today's bare `testCommand` and records it. (AC-20261103-10-20, AC-20261103-10-21, AC-20261103-10-22, AC-20261103-10-23) | The judged tree's suite was green and the only bytes that changed are ones no test reads — scope-reconcile's stem scan is the repo's one derivation of "a test reads this path". |
| D9 | `fanout-driver.js` `runGate(l)` computes `cacheTree(mainRoot, [])` after the merge, consults the cache for the resolved gate string (hit → log `$ <gate>\n== reused cache:<tree7>`, result `green`, no spawn) and records a green spawn. (AC-20261103-10-24) | A lane whose review judged this exact tree green already paid for it. |
| D10 | `spec/commands/fix.md` step 2 reads "Sonnet workers, one file each, run only the one named test file green before any reports success" and the sentence "A worker's green is a claim: run the `gateCommand` yourself before relying on it." becomes "A worker's green is a claim over one file: the session runs the host's `gateCommand` once, at step 5, before anything is committed." `[no-ac: wording — read by review]` | One suite run per fix lane; the session is the one party that sees every worker's file. |
| D11 | `spec/entrypoints.json` adds `spec/scripts/spec-review-driver.js` under `spec/scripts/scope-reconcile.js`'s entry points (D8's probe call). `[no-ac: tests/consistency/entrypoints.test.js is the standing guard]` | A new caller without a manifest row reddens the gate. |
| D12 | `node scripts/plugin-bump.js --bump --plugin spec --changelog "…"`. `[no-ac: node scripts/plugin-bump.js --check in the gate is the oracle]` | Behaviour change under `spec/`. |
| D13 | Header comments: `run-cache.js` opens with usage, owner (this spec), what it does not do (decide a verdict, cache a red, read env values) and `Exit codes: n/a`; `review-legs.js` names `--tree`, the `cache:<tree7>` provenance and the at-risk `reused:'suite'` shape in its row table; the build driver names `gateRuns[k].tree/cached`; the review driver names `cacheTree` and `closeSuite`. `[no-ac: script header prose; the behaviour is pinned by AC-20261103-10-12 and AC-20261103-10-6]` | The header is the script's contract. |
| D14 | Colliding pins enter the File Plan as fixes, never weakened: `tests/review/review-legs-at-risk-argv.test.js` keeps its spawn premise by declaring a `{file}` `testCommand` in its fixture (D6 then spawns); `tests/review/legs-verdict-pair.test.js` adds the `reused:'suite'` at-risk shape to its verdict pairs and keeps its contradiction pairs on fixtures whose suite is not green-with-count. `[no-ac: fixture currency; exercised by AC-20261103-10-16 and AC-20261103-10-17]` | A pin on "at-risk spawned while the suite was green" is the exact behaviour D6 retires. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/run-cache.js | CREATE | scripts | treeSha, cacheTree, cacheDir, keyFor, lookup, record, PIPELINE_OVERLAY (D1, D2, D13); no dependency change |
| spec/scripts/spec-review-driver.js | MODIFY | scripts | snapshotTree → lib, marks.cacheTree, `--tree` to legs, close gate cache, closeSuite auto skip (D1, D5, D8, D13) |
| spec/scripts/spec-build-driver.js | MODIFY | scripts | two gate children, per-part cache, gateRuns tree/cached, ledger gate.tree/cached (D3, D13) |
| spec/scripts/review-legs.js | MODIFY | scripts | `--tree`, gate/suite cache rows, record, at-risk reused:'suite', header (D5, D6, D13) |
| spec/scripts/fanout-driver.js | MODIFY | scripts | post-merge gate cache (D9) |
| spec/scripts/lib/gate-resolve.js | MODIFY | scripts | `{testFiles}` placeholder (D4) |
| spec/scripts/init-gen.js | MODIFY | scripts | scoped probe admits `{testFiles}` (D4) |
| spec/scripts/expire-tests.js | MODIFY | scripts | placeholder prose names `{testFiles}` (D4) |
| spec/scripts/lib/host-config.js | MODIFY | scripts | policy closeSuite default + enum (D7) |
| spec/templates/grounding-contract.md | MODIFY | doctrine | `{testFiles}` in § Required config keys; `closeSuite` in § Policy (D7) |
| .claude/spec.config.json | MODIFY | other | gateCommand `{testFiles}`, policy.closeSuite always, contractHash restamp (D4, D7) |
| spec/commands/fix.md | MODIFY | doctrine | one gate run per fix, workers run their file (D10) |
| spec/entrypoints.json | MODIFY | other | scope-reconcile.js gains the review driver as a caller (D11) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | `node scripts/plugin-bump.js --bump --plugin spec --changelog "…"` (D12) |
| tests/run-cache/run-cache.test.js | CREATE | tests | AC-20261103-10-1, AC-20261103-10-2, AC-20261103-10-3, AC-20261103-10-4 |
| tests/build/build-driver-gate-cache.test.js | CREATE | tests | AC-20261103-10-5, AC-20261103-10-6, AC-20261103-10-7, AC-20261103-10-8 |
| tests/review/gate-resolve-test-files.test.js | CREATE | tests | AC-20261103-10-9, AC-20261103-10-10 |
| tests/init-gen/gate-check.test.js | MODIFY | tests | AC-20261103-10-11 |
| tests/review/review-legs-run-cache.test.js | CREATE | tests | AC-20261103-10-12, AC-20261103-10-13, AC-20261103-10-14, AC-20261103-10-15 |
| tests/review/review-legs-at-risk-reuse.test.js | CREATE | tests | AC-20261103-10-16, AC-20261103-10-17 |
| tests/host-config/policy-block.test.js | MODIFY | tests | AC-20261103-10-18 |
| tests/host-config/contract-keys.test.js | MODIFY | tests | AC-20261103-10-19 |
| tests/review/review-driver-close-suite-policy.test.js | CREATE | tests | AC-20261103-10-20, AC-20261103-10-21, AC-20261103-10-22, AC-20261103-10-23 |
| tests/fanout/fanout-gate-cache.test.js | CREATE | tests | AC-20261103-10-24 |
| tests/review/review-legs-at-risk-argv.test.js | MODIFY | tests | fixture currency: `{file}` testCommand keeps the spawn premise (D14) |
| tests/review/legs-verdict-pair.test.js | MODIFY | tests | fixture currency: reused:'suite' at-risk pair (D14) |

## Contracts

`lib/run-cache.js` (D1, D2):

```js
treeSha(repoRoot, { exclude = [] })            // → 40-hex tree sha of the working tree (tracked edits + untracked), excludes carried as :(exclude) pathspecs
cacheTree(repoRoot, extraExcludes = [])        // → treeSha(repoRoot, { exclude: [...PIPELINE_OVERLAY, ...extraExcludes] })
cacheDir(repoRoot)                             // → <git rev-parse --git-common-dir>/spec-run-cache (absolute)
keyFor(cmd, tree, envNames)                    // → sha256 hex of cmd + '\0' + tree + '\0' + envNames.slice().sort().join(',')
lookup(repoRoot, cmd, tree)                    // → { cmd, tree, envNames, observed, ts } | null
record(repoRoot, cmd, tree, { exit, observed }) // → true (written) | false (exit !== 0 or observed.testsExecuted not a number; nothing written)
PIPELINE_OVERLAY = ['.claude/spec-runs.jsonl', '.claude/spec-runs.stopped.jsonl', '.claude/spec-runs/', '.claude/agent-memory/']
```

Entry file `<cacheDir>/<key>.json`:

```json
{"cmd":"node --test … tests/review/x.test.js","tree":"<40-hex>","envNames":[],"observed":{"skips":0,"todos":0,"testsExecuted":1251},"ts":"2026-11-03T10:00:00.000Z"}
```

`review-legs.js` usage (D5), additive:

```
review-legs.js --root <dir> --spec <path> --base <ref> --manifest <path> [--skips <file>] [--fix-delta] [--out-dir <dir>] [--reuse-from <manifest>] [--tree <40-hex>]
```

Reused rows (D5, D6):

```
{"leg":"gate","exit":0,"observed":{"skips":0,"todos":0,"testsExecuted":1251,"reusedFrom":"cache:3f2a9c1"},"scope":"full"}
{"leg":"suite","exit":0,"observed":{"skips":0,"todos":0,"testsExecuted":1251,"reusedFrom":"cache:3f2a9c1"},"scope":"full"}
{"leg":"at-risk","exit":0,"observed":{"files":3,"testsExecuted":1251,"reused":"suite"},"scope":"full"}
```

Build sidecar and ledger (D3), additive:

```
"gateRuns": [{"exit":0,"log":"<sidecar>/gate-1.log","tree":"<40-hex>","cached":[]},
             {"exit":0,"log":"<sidecar>/gate-2.log","tree":"<40-hex>","cached":["postGate"]}]
ledger stage:"build" row: "gate":{"finalRounds":2,"postGate":true,"tree":"<40-hex>","cached":["postGate"]}
```

Gate log lines the driver writes (D3): `== postGateCommand` (between the two children, as today) and `== reused cache:<tree7> <cmd>` in place of a skipped child.

Policy (D7), additive to `host-config.js` and the contract § Policy block:

```json
"closeSuite": "auto"
```
Enums: `closeSuite` `always | auto`. Semantics: `auto` → the close-time whole-suite run is skipped when the close delta against the judged tree is overlay-only, no test file references an overlay path, and the judged tree's suite is green in the run cache, printing `close-time suite: skipped — close delta is overlay-only and no test reads it (policy.closeSuite: auto)`; `always` → the close-time suite runs whenever `gateRunsSuite` does not already cover it.

Gate placeholder (D4): `{testFiles}` → the File Plan's test files, each `quote()`d, space-joined, in File Plan order with duplicates and `fixtures/` paths dropped — `tests/a.test.js tests/review/b.test.js`, never `tests/*.test.js`.

Driver stdout lines (D8, D9), exact prefixes:

```
close-time gate: reused cache:3f2a9c1
close-time suite: skipped — close delta is overlay-only and no test reads it (policy.closeSuite: auto)
```

## Behavior

Build (D3): round k resolves the scoped gate `G` and post-gate `P`. `cacheTree` is taken once
before the first child. `lookup(G)` miss → spawn `G` to the log; exit ≠ 0 → stop, record nothing.
Green → `record(G)`, write `== postGateCommand`, `lookup(P)` hit → write `== reused cache:<tree7>
P`, else spawn `P`, green → `record(P)`. `marks.gateRuns[k].exit` is the last child's exit (0
when both green or reused). A repair round whose worker changed a tracked file yields a new tree
and misses; a round that changed nothing after a red never hits either (red was never recorded).

Review (D5, D6): `runLegs(n)` computes `marks.cacheTree[n]` beside `legsTree[n]` and passes
`--tree`. Over the tree the build's post-gate ran (same bytes outside `PIPELINE_OVERLAY`), the
suite leg hits the build's `P` entry when `postGateCommand` resolves to exactly `testCommand`, the
gate leg hits `G` when the File Plan's test files are unchanged and the host's scoped gate output
carried a count (this repo's `{testFiles}` gate prints no `ℹ tests` line, so its gate row is never
recorded and the scoped gate re-runs at review — cheap by construction, named in Rationale). The
at-risk leg sees a green suite with a count and appends `reused:'suite'`.

Close (D8): after `refuseCloseTreeDrift()` passes, every path in `git diff --name-only
<judgedTree> HEAD` is overlay (spec file, `docs/canonical/`, ledger, rules file, sidecar,
deviations, agent memory) or `skipped`. Under `auto`, the probe reads every test file and counts
those whose content contains any changed path's stems; zero plus a cache hit for `testCommand`
over `marks.cacheTree[iteration]` skips the suite. This repo (`always`) always runs it.

Fixture notes: counters live outside the fixture repo (06 D7 pattern) so a counter write never
moves the tree; a fixture's `.git` is its own common dir, so its cache never crosses tests; a
"tree changed" case edits a tracked file; a cache-hit case runs the same driver step twice (or
pre-seeds an entry through `record`) without touching a tracked file.

## Acceptance Criteria

- **AC-20261103-10-1**: WHEN `treeSha(root, {exclude})` runs in a repo with one tracked file and one untracked file THE SYSTEM SHALL print a 40-hex sha equal to `git write-tree` over the same content from a linked worktree with identical files, unchanged after appending to `.claude/spec-runs.jsonl` through `cacheTree(root)` (e.g. `cacheTree` before `3f2a…` → after the ledger append `3f2a…`), and changed after editing the tracked file → writes tests/run-cache/run-cache.test.js
- **AC-20261103-10-2**: WHEN `record(wt, cmd, tree, {exit: 0, observed: {testsExecuted: 3, skips: 0}})` runs from a linked worktree THE SYSTEM SHALL write `<main>/.git/spec-run-cache/<key>.json` (`cacheDir(wt)` ends `/.git/spec-run-cache`) and `lookup(main, cmd, tree)` from the main checkout SHALL return the entry with `observed.testsExecuted` `3` → writes tests/run-cache/run-cache.test.js
- **AC-20261103-10-3**: WHEN `record` is called with `exit: 1`, or with `exit: 0` and `observed.testsExecuted` `{unavailable: "pattern-no-match"}` THE SYSTEM SHALL return `false`, write no file under `cacheDir`, and `lookup` SHALL return `null` → writes tests/run-cache/run-cache.test.js
- **AC-20261103-10-4**: WHEN an entry exists for `(cmd, tree)` THE SYSTEM SHALL miss on `cmd + ' '` (verbatim command string) and miss after the host config's `testEnv` gains a row `{var: "TEST_DATABASE_URL"}` (e.g. `keyFor('npm test', t, [])` ≠ `keyFor('npm test', t, ['TEST_DATABASE_URL'])`) → writes tests/run-cache/run-cache.test.js
- **AC-20261103-10-5**: WHEN the build driver's GATE runs over a host with `gateCommand` `bash gate.sh {testDirs}` and `postGateCommand` `bash post.sh` THE SYSTEM SHALL spawn two children (gate counter 1, post counter 1), write `== postGateCommand` to `gate-1.log` between their outputs, and record `marks.gateRuns[0]` as `{exit: 0, log, tree: <40-hex>, cached: []}` → writes tests/build/build-driver-gate-cache.test.js
- **AC-20261103-10-6**: WHEN GATE runs again over the same tree (a repair round re-armed with no tracked change) and both parts printed `ℹ tests N` THE SYSTEM SHALL spawn neither child (counters still 1 and 1), write `== reused cache:<tree7> bash post.sh` to `gate-2.log`, and record `marks.gateRuns[1].cached` as `["gate","postGate"]` → writes tests/build/build-driver-gate-cache.test.js
- **AC-20261103-10-7**: WHEN the scoped gate exits 1 THE SYSTEM SHALL spawn no post-gate, write no `== postGateCommand` line, record nothing under `cacheDir`, and the next GATE over the same tree SHALL spawn the gate again (counter 2) → writes tests/build/build-driver-gate-cache.test.js
- **AC-20261103-10-8**: WHEN the build reaches DONE THE SYSTEM SHALL append a `stage:"build"` ledger row whose `gate` block carries `tree` equal to `marks.gateRuns.at(-1).tree` and `cached` equal to its `cached` list (e.g. `"gate":{"finalRounds":1,"postGate":true,"tree":"<40-hex>","cached":[]}`) → writes tests/build/build-driver-gate-cache.test.js
- **AC-20261103-10-9**: WHEN `resolveGate(spec, {gateCommand: 'node --test {testFiles}'})` runs over a File Plan with test rows `tests/a.test.js`, `tests/review/b.test.js` and `tests/fixtures/f.js` THE SYSTEM SHALL return `node --test tests/a.test.js tests/review/b.test.js` (no glob, fixture dropped), `resolveGateForFiles` the same for that list, and `gateRunsSuite('node --test {testFiles} && npm test', …, 'npm test')` SHALL return `false` → writes tests/review/gate-resolve-test-files.test.js
- **AC-20261103-10-10**: WHEN `resolveGate` runs with a `{testDirs}` gate over the same File Plan THE SYSTEM SHALL return the glob form `node --test 'tests/*.test.js' 'tests/review/*.test.js'` byte-identical to today's derivation, and `gateRunsSuite('npm test', 'npm test', 'npm test')` SHALL still return `true` → writes tests/review/gate-resolve-test-files.test.js
- **AC-20261103-10-11**: WHEN `init-gen.js gate-check` reads a config whose `gateCommand` carries `{testFiles}` THE SYSTEM SHALL print `"scoped":true` and `generate` SHALL print no unscoped-gate warning → writes tests/init-gen/gate-check.test.js
- **AC-20261103-10-12**: WHEN review-legs runs with `--tree <t>` and `cacheDir` holds green entries for the resolved gate and for `testCommand` over `<t>` THE SYSTEM SHALL append gate and suite rows with `observed.reusedFrom` `cache:<t.slice(0,7)>`, spawn neither (counter unchanged), write no `gate-output.txt`/`suite-output.txt`, and `verdict.js --workflow <CLEAN return>` SHALL print `CLEAN` → writes tests/review/review-legs-run-cache.test.js
- **AC-20261103-10-13**: WHEN review-legs runs with `--tree <t>` and no entry exists THE SYSTEM SHALL spawn the gate and the suite as today and, both green with a numeric `testsExecuted`, write one entry per command under `cacheDir` so a second run with the same `--tree` spawns nothing → writes tests/review/review-legs-run-cache.test.js
- **AC-20261103-10-14**: WHEN review-legs runs without `--tree` over a host whose `cacheDir` holds a green entry for its gate THE SYSTEM SHALL spawn the gate (counter +1) and append no `reusedFrom` key; WHEN `--tree` is `abc` THE SYSTEM SHALL exit 2 with stderr `review-legs.js: --tree must be a 40-hex tree sha` and append no row → writes tests/review/review-legs-run-cache.test.js
- **AC-20261103-10-15**: WHEN both `--reuse-from <m>` (green gate row) and `--tree <t>` (cache entry) apply THE SYSTEM SHALL append the gate row with `reusedFrom` equal to `path.basename(m)`, never `cache:…` → writes tests/review/review-legs-run-cache.test.js
- **AC-20261103-10-16**: WHEN reconcile reports 2 at-risk files, the suite row is `exit 0` with `testsExecuted` `4`, and `testCommand` has no `{file}` THE SYSTEM SHALL append `{"leg":"at-risk","exit":0,"observed":{"files":2,"testsExecuted":4,"reused":"suite"},"scope":"full"}`, spawn nothing for at-risk (counter unchanged), and write no `at-risk.txt` → writes tests/review/review-legs-at-risk-reuse.test.js
- **AC-20261103-10-17**: WHEN the suite row is `exit 1` (or its `testsExecuted` is `{unavailable:…}`) and reconcile reports at-risk files THE SYSTEM SHALL spawn the at-risk command (counter +1) and append the row with no `reused` key, exactly as today → writes tests/review/review-legs-at-risk-reuse.test.js
- **AC-20261103-10-18**: WHEN `policy(root)` reads a config without a `closeSuite` key THE SYSTEM SHALL return `closeSuite` `"auto"`; `validatePolicy({closeSuite: "never"})` SHALL return `["closeSuite: expected one of always|auto"]` and `validatePolicy({closeSuite: "always"})` `[]` → writes tests/host-config/policy-block.test.js
- **AC-20261103-10-19**: WHEN the contract is read THE SYSTEM SHALL name `{testFiles}` in § Required config keys and `"closeSuite": "auto"` with the Enums phrase `` `closeSuite` `always | auto` `` in § Policy, this repo's `.claude/spec.config.json` SHALL carry `policy.closeSuite` `"always"` and a `gateCommand` containing `{testFiles}` and not `{testDirs}`, and its `contractHash` SHALL equal the edited contract's hash → writes tests/host-config/contract-keys.test.js
- **AC-20261103-10-20**: WHEN `--mark closed` runs on a host with `policy.closeSuite: "auto"`, a legs iteration whose suite ran green with a count, a close commit touching only the spec file and `docs/canonical/x.md`, and no test file naming either path THE SYSTEM SHALL print `close-time suite: skipped — close delta is overlay-only and no test reads it (policy.closeSuite: auto)`, spawn no `testCommand` (counter unchanged since legs), and set `marks.closed` `true` → writes tests/review/review-driver-close-suite-policy.test.js
- **AC-20261103-10-21**: WHEN the same close runs with `policy.closeSuite: "always"` THE SYSTEM SHALL spawn `testCommand` (counter +1) and print no `skipped` line → writes tests/review/review-driver-close-suite-policy.test.js
- **AC-20261103-10-22**: WHEN `auto` applies but a test file's content contains `docs/canonical/x.md` THE SYSTEM SHALL spawn `testCommand` (counter +1) and print no `skipped` line → writes tests/review/review-driver-close-suite-policy.test.js
- **AC-20261103-10-23**: WHEN `cacheDir` holds a green entry for the resolved gate over the close tree (`cacheTree` of HEAD after the close commit) THE SYSTEM SHALL print `close-time gate: reused cache:<tree7>` and spawn no gate; absent the entry THE SYSTEM SHALL spawn it and, green, write the entry → writes tests/review/review-driver-close-suite-policy.test.js
- **AC-20261103-10-24**: WHEN `--mark merged` runs the post-merge gate and `cacheDir` holds a green entry for the resolved gate over main's `cacheTree` THE SYSTEM SHALL write `== reused cache:<tree7>` as the log's second line, spawn no gate (counter unchanged), and record the lane's gate `green`; a green spawned gate SHALL write the entry so a second identical merge hits → writes tests/fanout/fanout-gate-cache.test.js
- **AC-20261103-10-25**: WHEN `--mark skips-extracted` runs over an unchanged tree THE SYSTEM SHALL CONTINUE TO pass `--reuse-from <sidecar>/manifest-1.jsonl` and SHALL CONTINUE TO write a gate row carrying `reusedFrom: "manifest-1.jsonl"` → reuses tests/review/review-driver-rerun-reuse.test.js :: AC-20261101-06-6
- **AC-20261103-10-26**: WHEN the close-time gate's raw `gateCommand` has no placeholder and an `&&` segment is exactly `testCommand` THE SYSTEM SHALL CONTINUE TO print `close-time suite: reused the gate run (` and spawn the suite once → reuses tests/review/review-driver-close-gate-reuse.test.js :: AC-20261101-05-8
- **AC-20261103-10-27**: WHEN `testCommand` carries `{file}` THE SYSTEM SHALL CONTINUE TO append the suite row `{unavailable: "file-placeholder"}` and spawn the at-risk command with the files substituted → reuses tests/review/review-legs-at-risk-file-placeholder.test.js :: AC-20261102-01-4

## Assumptions (escalation triggers)

- A1: `git rev-parse --git-common-dir` from a linked worktree names the main repository's `.git` while `--git-dir` names the worktree-private dir. **Spike S0 (executed 2026-11-03, git-adjudicated, from this plan's own worktree):** `--git-common-dir` printed `/home/jj/projects/claude-plugins/.git`; `--git-dir` printed `…/.git/worktrees/agent-a17132646c74cc2aa` — **if false:** `cacheDir` falls back to `--git-dir` and worktrees stop sharing (fewer hits, never a wrong hit).
- A2: No test in this repo or a genesis host reads the live `.claude/spec-runs.jsonl`, `.claude/spec-runs/`, `.claude/spec-runs.stopped.jsonl` or `.claude/agent-memory/` (grep at lock: every `spec-runs.jsonl` hit under `tests/` writes a fixture ledger in a `tmpdir()`, none joins `ROOT`) — **if false:** the reading test is the defect (the ledger is pipeline-owned, core § Ledger); D2's list is not widened.
- A3: `node --test` on Node 26 runs an explicit file list. **Spike S1 (executed 2026-11-03):** three files, two named → `ℹ tests 2`, `ℹ pass 2`, exit 0 — **if false:** D4 keeps `{testFiles}` for hosts whose runner takes files and this repo's config stays on `{testDirs}`.
- A4: `verdict.js` reads `observed` opaquely for gate, suite and at-risk (06 A2's executed spike: an extra `observed` key is inert; the at-risk contradiction rule reads `files` and `testsExecuted` only) — **if false:** `reused`/`reusedFrom` move to a top-level key placed before `scope` and verdict's row pins enter the File Plan.
- A5: The fixtures that count gate spawns across two invocations over an unchanged green tree (read at lock: `review-legs-gate-reuse.test.js`, `review-driver-close-gate-reuse.test.js`, `review-driver-rerun-reuse.test.js`, `review-legs-reuse-from.test.js`, `build-driver-gate-stage.test.js`) either spawn review-legs without `--tree` (D5: no cache), change a tracked file between runs, or pass through the driver's `--reuse-from` path first (D5's precedence; AC-25) — a count that moves is a prediction miss: **if false:** that fixture enters the File Plan as a fix row asserting the cache hit under this spec's AC, never a weakened count.
- A6: `scope-reconcile.js --probe-at-risk <file> --root <dir>` accepts any newline-separated path list, classifies tests through the host config's `fileShapes`, and prints `{sampled, testFiles, refs}` exit 0 (read at lock, header + L95–130) — **if false:** D8 reads `stemsFor`/`walkTestFiles` through a new `--probe-paths` mode on the same file, never a second scan.
- A7: `lib/count-observation.js`'s `computeSkips`/`computeTestsExecuted` are pure over a string, so the build driver can apply them to a log slice (read at lock) — **if false:** the build driver tees each child through a pipe with the host-run maxBuffer and reads the captured text.
- A8: `tests/init-gen/*` and `tests/host-config/*` pin the policy block by its six `stops` keys and the `models` seats, never by whole-block equality (read at lock: `contract-keys.test.js` iterates named keys; `policy-block.test.js` deep-equals `stops` only) — **if false:** the pinning test enters the File Plan as a fix row retagged with AC-18.

## Rationale

The audit's number is the argument: ~6.6 suite-equivalents per clean spec here, ~4 on a
genesis host, and in 1,004 ledger rows not one same-tree rerun that found anything. Every
rerun today exists because a different stage could not prove the tree was the same; a tree sha
is that proof. Bazel's test cache (`(cached) PASSED`, inputs-keyed, failures never cached),
Turborepo's input-hash replay and Gradle's test-task up-to-date check are the prior art; 06
already applied the idea inside one review, this spec moves the store to the git common dir so
build, review, close and fan-out — four processes, two or three worktrees — read one table.

D2 is the one auto-picked fork. The driver's `snapshotTree()` includes the ledger because the
drift check wants it there; the cache key cannot, because the ledger row a stage appends after
its own gate is the first thing the next stage sees. Keying on a tree with the pipeline's own
write paths excluded is what turns the build's post-gate into the review's suite row; the
drift and reuse snapshots keep their meaning. Rejected: excluding the spec file and
`docs/canonical/` from the key too — this repo's tests read both, and a host-visible knob for
"which paths are test-invisible" would be a second `closeSuite`.

The close rule is deliberately a conjunction: `auto` + overlay-only delta + zero stem references
+ a green cached suite over the judged tree. Each leg alone is a laundering route; together they
say "the bytes that changed are bytes no test reads, and the bytes a test reads were green".
This repo sets `always` because its suite reads doctrine, canonical docs and the specs tree.

The gate stays a cache consumer in every place it runs rather than being dropped where the suite
covers it, because a host's gate may carry lint and typecheck the suite lacks (05's rule). Here
the scoped gate prints no `ℹ tests` line (no spec reporter), so its row is never recordable and
it re-runs at review — a few files, seconds; adding the reporter to the gate is a host config
choice, not this spec's.

At-risk reuse (D6) is the cheapest removal: the bare `testCommand` run is a superset of
`testCommand <files>`, so a green suite with a count is the at-risk observation. The `{file}`
form keeps spawning because its suite row is typed unavailable.

Collision closure (`collision-closure.js --literal '{testDirs}' --literal 'at-risk.txt'
--literal 'close-time suite' --literal 'closeSuite' --literal 'testFiles' --literal
'gateCommand` yourself'`, 140 unplanned / 33 likely, every hit read): the at-risk spawn pins
(`review-legs-at-risk-argv.test.js`, `legs-verdict-pair.test.js`) are the two fix rows D14
names. Waived: every `{testDirs}` hit is a fixture host declaring its own gate — the placeholder
is not retired, only this repo's config moves; every `testFiles` hit is an unrelated local
identifier (`count-tests.js`, `walk-files.js`, `scope-reconcile.js` and their tests); the
`at-risk.txt` hits in `red-fixture-coverage.test.js` and `review-legs.test.js` run fixtures whose
suite is red or count-less, so D6's spawn branch is the one they already take; the `close-time
suite` hit in `review-driver-close-refusals.test.js` pins the refused-rerun message on the
always-run path, which D8 leaves byte-identical; `gateCommand\` yourself` has no test pin. The
`executes` hits on the drivers and review-legs are priced by A5 with its remedy.

## Canonical Delta

docs/canonical/review-legs.md — new section after § A rerun over an unchanged tree copies its
green rows: "## One suite run per tree\n\nA green gate, suite or post-gate run is recorded once per
(resolved command string, tree sha with the pipeline's own write paths excluded, declared
`testEnv` names) in `<git common dir>/spec-run-cache`, shared by every worktree of the repo;
a red run is never recorded. `review-legs.js` consults it with `--tree` after the `--reuse-from`
path and appends a hit as the prior row with `observed.reusedFrom: 'cache:<tree7>'`. The at-risk
leg appends `reused: 'suite'` with no spawn when this iteration's suite row is green with a
count and `testCommand` has no `{file}`. The build driver records each part of its gate round,
the fan-out driver consults it for the post-merge gate, and the review driver's close-time gate
consults it with the close tree. (specs/20261103/10-one-suite-run-per-tree.md)"

docs/canonical/gate-integrity.md — new bullet after "The gate resolves `{testDirs}` to the glob
form": "- **`{testFiles}` names the File Plan's exact test files.** The placeholder resolves to
the quoted, space-joined test files (fixtures dropped), never a directory glob; `{testDirs}`
stays for runners that take globs. This repo's gate uses `{testFiles}`." and a new bullet after
"Cost is accepted by contract" in the close rules: "- **The close-time suite is skipped only by
proof.** Under `policy.closeSuite: auto` the close-time whole-suite run is skipped when the
close delta against the judged tree is overlay-only, no test file references a changed path
(scope-reconcile's stem scan), and the judged tree's suite is green in the run cache; the driver
prints `close-time suite: skipped — close delta is overlay-only and no test reads it
(policy.closeSuite: auto)`. `always` runs it; this repo sets `always` because its tests read
doctrine. (specs/20261103/10-one-suite-run-per-tree.md)"
