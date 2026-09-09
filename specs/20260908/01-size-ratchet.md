---
date: 2026-09-08
status: done
build_base: main
tier: standard
area: gate-integrity
design: false
breaking: false
depends_on: []
depended_on_by: [specs/20260908/02-driver-dedupe-onto-lib.md, specs/20260908/03-test-fixture-dedupe.md, specs/20260908/04-duplicate-window-ratchet.md]
brief: n/a
open_markers: 0
spiked: 2026-09-08
diff_base: 54b398a3b942ca3410fc4db01fcf26e3645d13e3
---

# Size ratchet — a tight, cited-raise byte budget over scripts and tests

## Goal

Every file under `spec/scripts`, `scripts`, and `tests` gets a byte ceiling recorded in one
tracked baseline, and every tree gets a total ceiling, so the plugin's own code can shrink
freely but can only grow through a raise that names the spec asking for it. The baseline is
kept *tight* by the gate itself: a ceiling that has outlived its shrink is a failure, not a
loophole. Done means the repo's own suite runs the check green on a freshly seeded baseline,
every red case is pinned against a synthetic tree, and the host rules state the budget as a
one-line duty.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `scripts/size-ratchet.js` inventories **tracked files by location**: `git ls-files` over the three roots `spec/scripts`, `scripts`, `tests`, admitting every file type; trees are `spec/scripts` (everything under it except `lib/`), `spec/scripts/lib`, `scripts`, `tests`. Untracked files never count. (AC-20260908-01-1, AC-20260908-01-8) | A name-shape filter is a hole (host rules § Gotchas, entrypoint-conformance); tracked-only keeps scratch files and worktree leftovers out of the budget. Rejected: an `fs` walk with an ignore list — it re-implements `.gitignore`. |
| D2 | Baseline lives at repo root `size-baseline.json`, shape in Contracts. The check exits 1 when any file's actual size is **over** its ceiling, when any ceiling is **stale** (above the actual size), when a **tree** total exceeds its tree ceiling, or when a file absent from the baseline exceeds `newFileCap`. Exit 0 only when every ceiling equals its actual size and every tree ceiling equals its tree sum. (AC-20260908-01-1, -2, -3, -4) | Tightness is what makes a ratchet ratchet down: the reported OmniRoute failure (`fix(quality): file-size ratchet only ratchets up`) is caps nobody re-tightened. The tree ceiling is the anti-split rule — splitting one big file into three cannot pass a sum. Rejected: file ceilings only (evadable by splitting) and a `.claude/` location (host state, not repo source). |
| D3 | `--update` rewrites the baseline **downward only**: lowers every stale ceiling, adds new files at their actual size, drops deleted files, sets each tree ceiling to its new sum — and refuses (exit 1, baseline untouched byte-for-byte) when any file is over, any new file is over `newFileCap`, or a tree sum exceeds its tree ceiling. (AC-20260908-01-5, -6) | One command makes any shrink land; growth can never land through it. Rejected: `--update` that also raises — that is the loophole D2 closes. |
| D4 | `--raise <path\|tree> --to <bytes> --cite <spec path>` sets one ceiling to `<bytes>` and appends `{path, from, to, cite}` to `raises[]`; `--cite` must name an existing file matching `^specs/\d{8}/\d{2}-`; anything else is exit 2 with the baseline untouched. A raise never lowers. (AC-20260908-01-7) | Growth stays possible but every increase is traceable to the feature that asked for it; review sees the baseline in the File Plan of any spec that raises. Rejected: free-form reason strings — unverifiable. |
| D5 | Exit alphabet: 0 tight and under; 1 findings (check) or refused (update); 2 bad invocation (missing `--root`, unreadable or non-object baseline, `--raise` without `--to`/`--cite`, unknown flag). `--json` prints `{ok, files, trees, findings:[{kind, path, actual, ceiling}]}` with `kind ∈ over \| stale \| new-over-cap \| tree-over`; text mode prints one line per finding naming the remedy command. (AC-20260908-01-2, -3, -4) | Same alphabet as every gate script here (host rules § Worker Rules); a kind enum lets tests and the review reader discriminate without parsing prose. |
| D6 | `newFileCap` is **40,000 bytes** and lives in the baseline (`newFileCap` key), not in code. (AC-20260908-01-4) | Measured: p75 of scripts is 22 KB and of tests 22 KB; p90 is 50 KB / 44 KB. 40 KB admits an ordinary new script or test file and refuses a fourth 120 KB driver. Rejected: a per-tree cap — the four drivers make the scripts' p90 unrepresentative. |
| D7 | The check runs as two suites: `tests/size-ratchet/size-ratchet.test.js` against synthetic `tmpdir()` git repos (every red kind, update, raise), and `tests/consistency/size-ratchet-live.test.js` running the real script over this repo's tracked tree asserting exit 0 and that the baseline's `raises[]` entries all cite files that exist. (AC-20260908-01-1..9) | Mirrors `comment-narration-live.test.js` + its synthetic sibling: behavior pinned on fixtures, standing enforcement on the live tree. |
| D8 | Build seeds `size-baseline.json` by running `node scripts/size-ratchet.js --root . --update` after every other row has landed (orchestrator duty, last step before the final gate); the CREATE row for the baseline is satisfied by that run, never by hand-typed numbers. (AC-20260908-01-9) | Hand-typed numbers are stale on arrival; the script's own writer is the only producer. |
| D9 | Host rules `.claude/rules/spec-pipeline.md` § Worker Rules gains one bullet: a mechanism pays its own size — every file under the three roots lands under `scripts/size-ratchet.js`; a raise cites its spec; spec history stays in the spec, a script header carries the owner citation only. § Review Checks gains: a baseline raise whose `cite` is not the spec under review is **hard**. `[no-ac: prose rule; a regex over prose is not a test (host rules § Test Rules) — the mechanism it names is pinned by AC-1..9]` | The root cause of this month's growth is that `core.md` § Doctrine Authoring converts rules into scripts with no cost clause; the clause belongs in this repo's own grounding because only this repo carries the gate. Rejected: editing `core.md` — `/spec:design` sits at 498 of its 500-line read-load budget and every command loads core.md. |
| D10 | Delete the notes-layer spike prototype `docs/spikes/22-notes-layer/` (three tracked files) and rewrite the two citing lines in `docs/roadmap/22-mocks-first-genesis.md` to say the prototype was folded into `spec/scripts/lib/notes-layer.browser.js` and deleted. `docs/audit/*` stays. `[no-ac: one-time deletion; review's scope-reconcile leg observes the removed paths]` | The plan doctrine already says a spike is run, observed, and deleted; the prototype shipped as lib code. Every audit report is cited by two to eight roadmap briefs or ADRs as evidence, so deleting them creates dead citations for no read-load gain (nothing under `spec/` loads `docs/`). Rejected: an orphan-docs sweep — measured zero orphans today. |
| D11 | The atlas-index spike `docs/spikes/23-atlas-index-nav/` is **not** deleted here: it is the executed A2 evidence of the still-unbuilt `specs/20260907/09-atlas-index-and-note-navigation.md`; its deletion is queued to run after that spec lands. `[no-ac: deferred by spec-queue]` | Deleting a prototype its builder may still read is rework risk for zero gain. |
| D12 | No plugin file changes: no `plugin.json` bump, no `spec-paths` key, no `spec/entrypoints.json` row. `[no-ac: absence of change]` | The script is repo tooling like `scripts/test-file-budget-reporter.js`; it sits outside the entrypoint-conformance inventory (`spec/scripts` minus `lib`, `spec/workflows`), so it needs no activating command. |
| D13 | A **from-scratch seed** (`--update` with no baseline file present) writes every tracked file at its actual size and exits 0; `new-over-cap` cannot arise there, because "new" means *absent from an existing baseline*. The D3 `new-over-cap` refusal applies to `--update` against a baseline that already exists. (AC-20260908-01-5, -6) | Ruling by the orchestrator, 2026-09-08, resolving a build-time fork: 26 tracked files already exceed `newFileCap`, so a literal reading made D8's seeding run impossible. The spec's own Contracts example settles the intent — it records `genesis-driver.js` at 124092 and `replay.test.js` at 202065 as plain `files` entries with no matching `raises[]` — and AC-20260908-01-6 names only `over` and `tree-over` as refusal triggers. D6's rationale grandfathers the same way: it refuses "a fourth 120 KB driver", not the three already here. |
| D14 | `--raise --to <n>` where `<n>` equals the ceiling already recorded is **accepted** and appends its `{path, from, to, cite}` row to `raises[]` like any other raise; a no-op raise is not refused. `[no-ac: absence of a refusal; D4's lowering refusal is pinned by AC-20260908-01-7]` | Ruling by JJ, 2026-09-09, on a review finding. D4 forbids lowering only and D5's exit-2 alphabet admits no no-op-raise case, so refusing it would change a locked decision rather than fix a defect. Cost accepted: the raise log may carry occasional rows recording no growth. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| scripts/size-ratchet.js | CREATE | scripts | D1–D6: tracked inventory, tight check, `--update` (down only), `--raise --cite`, `--json`, exit alphabet |
| size-baseline.json | CREATE | other | D8: seeded by `--update` at build's last step; never hand-typed |
| tests/size-ratchet/size-ratchet.test.js | CREATE | tests | AC-20260908-01-1, -2, -3, -4, -5, -6, -7, -8 |
| tests/consistency/size-ratchet-live.test.js | CREATE | tests | AC-20260908-01-9 |
| .claude/rules/spec-pipeline.md | MODIFY | other | D9: one § Worker Rules bullet, one § Review Checks bullet |
| docs/spikes/22-notes-layer/notes.js | DELETE | other | D10 |
| docs/spikes/22-notes-layer/server.js | DELETE | other | D10 |
| docs/spikes/22-notes-layer/notes.sample.json | DELETE | other | D10 |
| docs/roadmap/22-mocks-first-genesis.md | MODIFY | other | D10: rewrite the two lines citing `docs/spikes/22-notes-layer/` |

Orchestrator duty (D8): after the last worker returns and before the final gate, run
`node scripts/size-ratchet.js --root . --update` from the repo root and commit the produced
`size-baseline.json` with the build.

## Contracts

```jsonc
// size-baseline.json (repo root) — written only by scripts/size-ratchet.js
{
  "newFileCap": 40000,
  "trees": { "spec/scripts": 1134684, "spec/scripts/lib": 213906, "scripts": 9000, "tests": 3056356 },
  "files": { "spec/scripts/genesis-driver.js": 124092, "tests/replay/replay.test.js": 202065 /* … every tracked file under the three roots */ },
  "raises": [ { "path": "spec/scripts/genesis-driver.js", "from": 124092, "to": 126000, "cite": "specs/20260910/02-example.md" } ]
}
```

```
node scripts/size-ratchet.js --root <dir> [--baseline <file>] [--json]
node scripts/size-ratchet.js --root <dir> --update
node scripts/size-ratchet.js --root <dir> --raise <path|tree> --to <bytes> --cite <spec path>
  --baseline defaults to <root>/size-baseline.json
  a tree key is one of: spec/scripts | spec/scripts/lib | scripts | tests
Exit: 0 tight & under · 1 findings / refused · 2 bad invocation
```

Text-mode finding lines (one per finding, stderr):

```
size-ratchet: over      spec/scripts/x.js 120 > 100 — shrink it, or: node scripts/size-ratchet.js --root . --raise spec/scripts/x.js --to 120 --cite <spec>
size-ratchet: stale     spec/scripts/y.js 80 < 100 — run: node scripts/size-ratchet.js --root . --update
size-ratchet: new-over-cap tests/z.test.js 45000 > 40000 — split it, or --raise tests/z.test.js --to 45000 --cite <spec>
size-ratchet: tree-over tests 3060000 > 3056356 — cut 3644 bytes under tests/, or --raise tests --to 3060000 --cite <spec>
```

## Behavior

Check order: inventory → per-file over/stale/new-over-cap → per-tree sum vs ceiling. A file
that is both new and under cap is not itself a finding; the tree it joins usually is, unless
cuts elsewhere in that tree pay for it. Deleted files (in baseline, not tracked) are not a
finding in check mode — they are stale-by-absence and `--update` drops them; check mode
reports them as `stale` with actual 0 so the baseline never silently carries ghosts.
`--update` and `--raise` are mutually exclusive with each other and with `--json`. The
baseline is written with two-space indentation and sorted keys so diffs stay reviewable.

## Acceptance Criteria

- **AC-20260908-01-1**: WHEN `--root` names a git repo whose baseline records every tracked
  file under the three roots at its exact byte size and every tree at its exact sum THE SYSTEM
  SHALL exit 0 and print `size-ratchet: <files> files, <trees> trees, all tight` to stdout
  (e.g. two files of 10 and 20 bytes under `tests/` with `trees.tests = 30` → exit 0) → test in
  tests/size-ratchet/size-ratchet.test.js
- **AC-20260908-01-2**: WHEN a tracked file is larger than its recorded ceiling THE SYSTEM
  SHALL exit 1, name the path with `<actual> > <ceiling>` and the `--raise … --cite` remedy on
  stderr, and under `--json` list `{kind:"over", path, actual, ceiling}` (e.g. ceiling 100,
  actual 120 → `over spec/scripts/x.js 120 > 100`) → test in tests/size-ratchet/size-ratchet.test.js
- **AC-20260908-01-3**: WHEN a recorded ceiling is larger than the file's actual size, or the
  recorded file is no longer tracked, THE SYSTEM SHALL exit 1 with `{kind:"stale"}` naming the
  `--update` remedy (e.g. ceiling 100, actual 80 → `stale … 80 < 100`; deleted → actual 0) →
  test in tests/size-ratchet/size-ratchet.test.js
- **AC-20260908-01-4**: WHEN a tracked file absent from the baseline exceeds `newFileCap` THE
  SYSTEM SHALL exit 1 with `{kind:"new-over-cap"}`; WHEN a new file within the cap pushes its
  tree's sum above the tree ceiling THE SYSTEM SHALL exit 1 with `{kind:"tree-over", path:
  "<tree>"}` (e.g. cap 40000, new 45000-byte `tests/fixtures/big.md` → `new-over-cap`; new
  1000-byte file into a tight 30-byte tree → `tree-over tests 1030 > 30`) → test in
  tests/size-ratchet/size-ratchet.test.js
- **AC-20260908-01-5**: WHEN `--update` runs with no `over`, `new-over-cap`, or `tree-over`
  finding THE SYSTEM SHALL rewrite the baseline so an immediately following check exits 0,
  lowering stale ceilings, adding new files at actual size, dropping untracked entries, and
  never raising any file ceiling (e.g. ceiling 100 / actual 80 → 80; new 500-byte file → 500)
  → test in tests/size-ratchet/size-ratchet.test.js
- **AC-20260908-01-6**: WHEN `--update` runs while any file is `over` or a tree is `tree-over`
  THE SYSTEM SHALL exit 1 and leave the baseline byte-for-byte unchanged → test in
  tests/size-ratchet/size-ratchet.test.js
- **AC-20260908-01-7**: WHEN `--raise <path> --to N --cite <existing specs/YYYYMMDD/NN-*.md>`
  runs THE SYSTEM SHALL set `files[<path>]` (or `trees[<tree>]`) to N and append
  `{path, from, to, cite}` to `raises[]`; WHEN `--cite` is missing, names a non-existent file,
  or does not match `^specs/\d{8}/\d{2}-` THE SYSTEM SHALL exit 2 and leave the baseline
  unchanged (e.g. `--cite notes.md` → exit 2) → test in tests/size-ratchet/size-ratchet.test.js
- **AC-20260908-01-8**: WHEN an untracked file of any size sits under a root THE SYSTEM SHALL
  ignore it, and WHEN a tracked non-JS file (e.g. `tests/fixtures/x.md`) exceeds a ceiling THE
  SYSTEM SHALL report it exactly like a `.js` file (classification is by location, never by
  extension) → test in tests/size-ratchet/size-ratchet.test.js
- **AC-20260908-01-9**: WHEN this repository's suite runs THE SYSTEM SHALL run
  `scripts/size-ratchet.js --root <repo>` and observe exit 0, and every `raises[].cite` in the
  tracked baseline SHALL name a file that exists → test in
  tests/consistency/size-ratchet-live.test.js

## Assumptions (escalation triggers)

- A1: `git ls-files spec/scripts scripts tests` lists exactly the tracked files under those
  roots and nothing untracked — **executed 2026-09-08**: piped into a byte-sum script it
  returned 37 top-level `.js` + 23 `lib` + 8 `.sh` under `spec/scripts`, 141 `.test.js` + 14
  other under `tests`, no scratch files. **if false:** fall back to `git ls-files -z` parsing
  with explicit root filtering; STOP if git is unavailable (the suite already requires it).
- A2: Sizes measured with `fs.statSync().size` equal the tracked blob sizes (no CRLF
  conversion in this repo) — **executed**: `git ls-tree -r -l` totals at HEAD matched the
  `statSync` totals used in the timeline table (scripts 1368 K including `.sh`, tests 2984 K).
  **if false:** measure via `git cat-file -s` per blob instead.
- A3: `/spec:design`'s read-load is 498 of 500 lines, so `core.md` cannot grow by even one line
  without a compensating cut — **executed**: `wc -l` of each command plus `spec-paths
  shared-for <cmd>` (design 498, init 968 grandfathered). **if false:** D9's clause may move
  to `core.md` § Doctrine Authoring in a follow-up; this spec still lands in host rules.
- A4: `/spec:init --regenerate` preserves host-authored bullets inside § Worker Rules and
  § Review Checks (init-gen validates the six section names exist; it does not rewrite their
  bodies). **if false:** move the two bullets to § Gotchas via `/spec:escape`; STOP and ask if
  neither survives regeneration.
- A5: Every `docs/audit/*.md` is cited from `docs/roadmap`, `docs/adr`, or `specs/` —
  **executed**: per-file citation counts 2–8 (advisory-findings 8, v7-replay-eval 6,
  design-stage-field-eval 4, three at 3, v7-backlog-drop 2). **if false:** nothing changes
  here; an uncited report would simply be a candidate for D10-style deletion later.
- A6: Nothing under `spec/`, `scripts/`, or `tests/` reads `docs/spikes/22-notes-layer/` —
  **executed**: `grep -rn docs/spikes spec/ tests/ scripts/` returned no hit; the only citations
  are the two roadmap lines D10 rewrites. **if false:** STOP; the consumer decides.

## Rationale

Last month's debloat capped prose and it held: commands and doctrine are flat under
`tests/consistency/read-load.test.js`. The same month, scripts grew six-fold and tests eleven-fold
because the doctrine's own rule — a recurring rule becomes a script with an exit code and a
behavioral test — puts no bound on what it produces, and every closed spec appends. Seventy-seven
specs since 2026-08-07 added about 770 net lines each with no consolidation commit.

The design borrows from tools that already solved this shape. Betterer, Type Ratchet, and
rubocop's todo files keep a results file that CI compares against and that may only tighten.
SonarQube's Clean-as-You-Code gates new code per change. Bundle-size budgets (size-limit,
bundlesize) fail CI on growth. The one documented failure of the naive version — per-file caps
that nobody re-tightens, so they only ratchet up — is closed by D2's tightness rule: a stale
ceiling is itself red, and `--update` is the only way to make a shrink land, so every shrink
lands. The tree ceiling closes the other evasion, file splitting, which is exactly how this
repo's test count went from 49 files to 141 under the 45-second runtime budget.

This repo has a precedent for disliking standing baselines: `comment-narration`'s ratchet was
deleted once the sweep reached zero (specs/20260902/04 D8). A size budget has no zero state, so
the baseline is permanent by nature, like `read-load.test.js`'s `RATCHET`; tightness keeps it
honest rather than a debt list.

Not in this spec: the 51 KB `spec/doctrine/genesis.md` read-load hotspot (judgment prose, not
narration — a different kind of cut), a duplication detector (sibling 04, so the ceilings it
records start from the deduped tree), and the driver and fixture consolidation (siblings 02 and
03). Fragile: the baseline is a single file every size-changing spec must touch, so concurrent
sessions will conflict on it — the resolution is always `--update`, never a hand merge.

Collision-closure at lock (literal `22-notes-layer`): four hits — `docs/roadmap/22-mocks-first-genesis.md`
is a File Plan row; the three under `.claude/worktrees/spec-04-kit-canon-family/` are another
session's checkout of the same files and are waived (not this tree). Paths leg: `likely`/`mentions`
only; no `executes` hit on a changed script.

## Canonical Delta

docs/canonical/scripts.md § Prose budgets — append:

The plugin's own code has a byte budget. `scripts/size-ratchet.js` keeps `size-baseline.json`
(repo root) tight: every tracked file under `spec/scripts`, `scripts`, and `tests` carries a
ceiling equal to its size, every tree carries a ceiling equal to its sum, and a new file may not
exceed `newFileCap` (40,000 bytes). A stale ceiling is red; `--update` lowers, adds, and drops
but never raises; `--raise … --cite <spec>` is the only way up and records who asked. The
standing check is `tests/consistency/size-ratchet-live.test.js`; a spec that must grow a file
lists the baseline in its File Plan and raises citing itself.
