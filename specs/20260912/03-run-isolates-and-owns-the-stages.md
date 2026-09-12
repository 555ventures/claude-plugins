---
date: 2026-09-12
status: done
tier: critical
area: pipeline-entry
design: false
breaking: true
depends_on: []
depended_on_by: []
brief: n/a
spiked: 2026-09-12
open_markers: 0
build_base: main
diff_base: 66141d41b1c25a2b1727792e88a2542d139e7ec7
---

# `/spec:run` isolates by default, and it is the only stage command

## Goal

`/spec:run <spec>` opens the spec's own git worktree itself, before anything else runs, instead
of requiring `/git:enter-worktree <spec>` by hand first. `--in-place` is the opt-out; a worktree
that cannot be created stops the run rather than silently continuing on the current branch. In
the same pass the three stage commands `/spec:design`, `/spec:build` and `/spec:review` stop
being slash commands: their bodies move under `spec/doctrine/stages/` as the prose `/spec:run`
already delegates into, and every surface that names them is rewritten. Done means: a bare
`/spec:run` on a `hardened` spec lands the session in `.claude/worktrees/spec-<stem>` before the
design stage, `/spec:build` is not an invokable command anywhere, and the ledger still records
`via` so the fleet's escapes-per-CLEAN query keeps working.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `/spec:run` gains **Step 0 — Isolate**, placed above Routing step 1, which executes `git/commands/enter-worktree.md` Steps 1–3 in this session against `$ARGUMENTS` and suppresses that command's own report (its `Next: nothing needs you` line is wrong mid-loop). (AC-20260912-03-1) | Isolation before design, not after: every design script is root-relative, `design/mocks/` lives under whatever root the session is in, and design's checkpoint commit lands on the spec branch that merge-back carries to main. |
| D2 | `--in-place` is the only opt-out, documented in run.md § Input. A worktree-creation failure is a **hard stop** — the run prints the failure and stops, never continues in place. (AC-20260912-03-1, AC-20260912-03-2) | The three real failure modes — `.claude/worktrees/` not gitignored, unborn HEAD, a stale `spec/<stem>` branch from an abandoned build — are exactly the ones under which a silent in-place run merges garbage. |
| D3 | Step 0 skips (the run stays in place, printing one line saying so) when the spec's `status:` is past `hardened` **and** `{worktree}` is absent from `git worktree list --porcelain`. (AC-20260912-03-1, AC-20260912-03-3) | Correctness, not convenience: a spec at `implementing` keeps its marks in an untracked `<spec>.build/` sidecar and uncommitted worker output; `git worktree add` carries neither, so the driver would see `implementing` with no sidecar and restart the build against an empty tree while the half-built work sits orphaned. Must fire on a `/clear` resume too. |
| D4 | Step 0's stop message distinguishes two cases by the text `merge-back.sh create` prints: `create: run from the main working tree` → "exit that worktree first"; any other failure → name `--in-place` as the deliberate opt-out. Both exit 2, so the message is the only discriminator. (AC-20260912-03-2) | Executed: all four `create` refusals exit 2 (spike S1); an exit-code branch would collapse "you are in the wrong worktree" into "your repo is misconfigured". |
| D5 | `/git:enter-worktree` gains an **already-inside short-circuit** at the top of Step 2: when `git rev-parse --show-toplevel` already equals `{worktree}`, report **re-entered** and stop — no `EnterWorktree` call, no setup, no `build_base` write. (AC-20260912-03-4) | `/clear` keeps cwd, so the common re-entry is already inside; calling `EnterWorktree` on the tree you are in is a no-op at best and a verification failure at worst. |
| D6 | `/git:enter-worktree`'s opening paragraph is rewritten: it is the **manual repair surface** for a worktree `/spec:run` could not open or the user wants to re-enter, no longer a documented pre-step. The sentence "If you never run this command, the pipeline runs in place on the current branch" is deleted. (AC-20260912-03-5) | That sentence is now false — `/spec:run` runs it. |
| D7 | `spec/commands/{build,review,design}.md` are **deleted** and their bodies recreated at `spec/doctrine/stages/stage-{build,review,design}.md`. Frontmatter is dropped; every `## ` heading stays byte-identical. Each file's "run `/git:enter-worktree` first" and "direct entry point" prose is rewritten in the same pass. (AC-20260912-03-6) | Claude Code registers every `.md` under a plugin's `commands/` as a slash command regardless of frontmatter, so stripping frontmatter in place would leave `/spec:build` invokable. |
| D8 | The new files are named `stage-*.md`, never `stages/design.md`. (AC-20260912-03-6) | `citations-check.js` resolves a bare `design.md § X` through a basename index that prefers a same-directory match; a second `design.md` would make every bare citation from inside `stages/` resolve to the wrong file. |
| D9 | `spec/doctrine/stages` is added to `citations-check.js`'s `SCANNED_DIRS` and to the entry-point corpus surface list in `tests/consistency/entrypoints.test.js`. (AC-20260912-03-7, AC-20260912-03-8) | Executed (spike S3): both walkers are non-recursive, so without this the moved files' own `§` citations and `spec-paths <key>` call sites leave both sweeps silently — a dangling citation planted in `spec/doctrine/stages/` was not reported while the identical one in `spec/commands/` was. |
| D10 | Both drivers stop reading `--via` from their own argv and record `marks.via = 'loop'` at sidecar creation. `marks.via` itself, the `['--via', marks.via]` forward to `verdict.js`, `verdict.js`'s own `--via loop\|direct` enum and `fleet-reader.js`'s buckets are **untouched**. (AC-20260912-03-9, AC-20260912-03-10, AC-20260912-03-16) | `via` is a measurement field: it is written as `row.via` and brief 19's fleet query buckets escapes-per-CLEAN by it. Dropping it would orphan that query and change the ledger row shape; only the flag that chose between two entry points dies with the entry points. |
| D11 | The build driver's already-DONE refusal remedy prints the review-driver command with no `--via` suffix. (AC-20260912-03-11) | The remedy currently appends ` --via loop` conditionally on a flag that no longer exists. |
| D12 | `spec-state-gate.sh` retires its three command arms, drops the three names from its prompt filter and from its jq-missing notice. A `/spec:build …` prompt then falls through untouched (exit 0) at every spec status. (AC-20260912-03-12) | Same shape as the `/spec:genesis-explore` retirement (specs/20260827/02 D9): a gate arm for a command that cannot be invoked is dead prose in a critical-tier hook. |
| D13 | `spec-paths shared-for build`, `… review` and `… design` are retired; the three commands fall through to the fail-open whole-doctrine output. `tests/consistency/read-load.test.js`'s `BUDGET` and `SHARED_FOR` lose their three entries. `tests/spec-paths.test.js`'s AC-20260824-05-3 is **repointed to `run-design`**, not retired. (AC-20260912-03-13, AC-20260912-03-14) | Executed (spike S2): all three section lists are exact subsets of `shared-for run` ∪ `shared-for run-design`, so no session loses doctrine. `run-design` still serves `## Design Render Gate`, so the guard AC-20260824-05-3 exists for keeps its subject. |
| D14 | `BUDGET.run` rises from 310 to the value measured at build time, recorded as a deliberate ruling in the test's own comment; the three stage files gain their own line caps in the same table, measured at build, may only shrink. (AC-20260912-03-14, AC-20260912-03-15) | Measured: `/spec:run`'s load is 308 against a budget of 310, and Step 0 is ~18 lines. Step 0 states a contract (where isolation happens, what refuses, what is skipped), not procedure — the same ground on which `design`'s ceiling was granted at 510 (specs/20260907/09 D13). |
| D15 | The zero-hit sweep covers `spec/`, `git/`, `scripts/`, `README.md`, `docs/canonical/`, and the assertions and fixtures in `tests/`. **Excluded as history**: `specs/`, `docs/roadmap/`, `docs/adr/`, `docs/audit/`, `.claude/`, and comment lines in `tests/` that record why a pin exists. (AC-20260912-03-17) | `.claude/` is host grounding owned by `/spec:init`/`/spec:doctor`, not plugin source — queued for a doctor re-stamp rather than hand-edited here. A test comment naming the command a pin was born under is the same class of record as the spec that locked it. |
| D16 | The Canonical Delta prose narrates the retirement **without spelling the retired command names**. (AC-20260912-03-17) | `docs/canonical/` is live surface this spec's own sweep walks, and applying a Delta paragraph containing the names would redden the sweep at the close commit, after the last green run (host rules § Gotchas, specs/20260827/03). |
| D17 | `spec/.claude-plugin/plugin.json` is bumped via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"`. No version literal appears anywhere in this spec. (AC-20260912-03-18) | Concurrent sessions in this repo race the same semver; `plugin-bump.js --check` in the gate is the oracle. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/commands/build.md | DELETE | doctrine | D7 — body moves to spec/doctrine/stages/stage-build.md |
| spec/commands/review.md | DELETE | doctrine | D7 — body moves to spec/doctrine/stages/stage-review.md |
| spec/commands/design.md | DELETE | doctrine | D7 — body moves to spec/doctrine/stages/stage-design.md |
| spec/doctrine/stages/stage-build.md | CREATE | doctrine | D7/D8 — build.md's body, frontmatter dropped, `## ` headings byte-identical, direct-entry and enter-worktree prose rewritten |
| spec/doctrine/stages/stage-review.md | CREATE | doctrine | D7/D8 — as above for review.md |
| spec/doctrine/stages/stage-design.md | CREATE | doctrine | D7/D8 — as above for design.md |
| spec/commands/run.md | MODIFY | doctrine | D1 Step 0, D2 `--in-place` in § Input, D3 skips, D4 stop messages, render-server warn line; citations repointed to the stage files; `--via` dropped from frontmatter description |
| git/commands/enter-worktree.md | MODIFY | doctrine | D5 short-circuit, D6 opening paragraph, stage-name sweep |
| spec/doctrine/core.md | MODIFY | doctrine | Lifecycle sentence and § State Machine (both name the three commands), § Decomposition, § Model Placement |
| spec/doctrine/design.md | MODIFY | doctrine | D15 sweep |
| spec/doctrine/genesis.md | MODIFY | doctrine | D15 sweep |
| spec/commands/plan.md | MODIFY | doctrine | D15 sweep (marker-gate sentence, decomposition cap, Canonical Delta line) |
| spec/commands/atlas.md | MODIFY | doctrine | D15 sweep |
| spec/commands/sketch.md | MODIFY | doctrine | D15 sweep incl. its printed `Next:` line |
| spec/commands/init.md | MODIFY | doctrine | D15 sweep |
| spec/commands/status.md | MODIFY | doctrine | D15 sweep |
| spec/commands/replay.md | MODIFY | doctrine | D15 sweep |
| spec/commands/doctor.md | MODIFY | doctrine | D15 sweep |
| spec/commands/escape.md | MODIFY | doctrine | D15 sweep |
| spec/agents/reviewer.md | MODIFY | doctrine | D15 sweep (frontmatter description) |
| spec/templates/spec.md | MODIFY | doctrine | D15 sweep across the frontmatter comments and section guidance |
| spec/templates/grounding-contract.md | MODIFY | doctrine | D15 sweep — changes `spec-paths contract-hash`, host escalation trigger, one edit only |
| spec/entrypoints.json | MODIFY | doctrine | 16 rows renamed to the three stage paths |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D17 — bump via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` |
| git/.claude-plugin/plugin.json | MODIFY | doctrine | D17, added at build — D5/D6 edit `git/commands/enter-worktree.md`, so the git plugin owes its own bump; `plugin-bump.js --check` reads the merge base, so the gap reddens only once the checkpoint commit lands |
| README.md | MODIFY | other | Command table loses three rows; `/git:enter-worktree` row's "Before build/design isolation" and the approval-stops paragraph rewritten |
| docs/canonical/pipeline.md | MODIFY | other | D15 sweep — the three-direct-entries paragraph and the state-gate admissions paragraph |
| docs/canonical/design.md | MODIFY | other | D15 sweep |
| docs/canonical/review-close.md | MODIFY | other | D15 sweep |
| docs/canonical/review-legs.md | MODIFY | other | D15 sweep |
| spec/bin/spec-paths | MODIFY | scripts | D13 — three `shared-for` arms and their usage-line entries retired |
| spec/scripts/spec-state-gate.sh | MODIFY | scripts | D12 — three arms, prompt filter, jq-missing notice, header comment |
| spec/scripts/spec-build-driver.js | MODIFY | scripts | D10 `marks.via = 'loop'`, D11 remedy string, header comment; stage-file citation repointed |
| spec/scripts/spec-review-driver.js | MODIFY | scripts | D10 `marks.via = 'loop'`, header comment; stage-file citation repointed |
| spec/scripts/citations-check.js | MODIFY | scripts | D9 — `spec/doctrine/stages` joins `SCANNED_DIRS` |
| spec/scripts/spec-status.js | MODIFY | scripts | D15 sweep (header and inline comments only — no action string changes) |
| spec/scripts/scope-reconcile.js | MODIFY | scripts | D15 sweep |
| spec/scripts/render-gate.js | MODIFY | scripts | D15 sweep |
| spec/scripts/merge-back.sh | MODIFY | scripts | D15 sweep |
| spec/scripts/init-gen.js | MODIFY | scripts | D15 sweep |
| spec/scripts/components-check.js | MODIFY | scripts | D15 sweep |
| spec/scripts/verdict.js | MODIFY | scripts | D15 sweep — comment only; the `--via` enum is untouched (D10) |
| spec/scripts/review-legs.js | MODIFY | scripts | D15 sweep |
| spec/scripts/replay.js | MODIFY | scripts | D15 sweep — its own `--via driver\|manual` flag is unrelated and untouched |
| spec/scripts/render-rules.js | MODIFY | scripts | D15 sweep |
| spec/scripts/lib/frontmatter.js | MODIFY | scripts | D15 sweep |
| spec/scripts/design-atlas.js | MODIFY | scripts | D15 sweep |
| spec/scripts/design-ac-reconcile.js | MODIFY | scripts | D15 sweep |
| spec/scripts/ci-query.js | MODIFY | scripts | D15 sweep |
| spec/scripts/block-cross-worktree-writes.sh | MODIFY | scripts | D15 sweep |
| scripts/spec-patterns.sh | MODIFY | scripts | D15 sweep |
| tests/run/isolate-step.test.js | CREATE | tests | AC-20260912-03-1, -2, -3, -4, -5 |
| tests/consistency/stage-files.test.js | CREATE | tests | AC-20260912-03-6, -15 |
| tests/consistency/retired-stage-commands.test.js | CREATE | tests | AC-20260912-03-17 — same shape as `genesis-doctrine.test.js`'s `sweepRetiredLiteral`, waivedPrefixes = specs/, docs/roadmap/, docs/adr/, docs/audit/, .claude/ |
| tests/state-gates.test.js | MODIFY | tests | AC-20260912-03-12 |
| tests/consistency/read-load.test.js | MODIFY | tests | AC-20260912-03-14, -15 |
| tests/consistency/entrypoints.test.js | MODIFY | tests | AC-20260912-03-7 |
| tests/spec-paths.test.js | MODIFY | tests | AC-20260912-03-13 |
| tests/prose-debt/doctrine-pins.test.js | MODIFY | tests | AC-20260912-03-6 (path pin repointed) |
| tests/build/build-driver-commit.test.js | MODIFY | tests | AC-20260912-03-9, -11 |
| tests/review/review-driver.test.js | MODIFY | tests | AC-20260912-03-10 |
| tests/consistency/red-fixture-coverage.test.js | MODIFY | tests | AC-20260912-03-12 (hook fixture prompt) |
| tests/consistency/base-derivation.test.js | MODIFY | tests | AC-20260912-03-6 (path pin repointed) |
| tests/run-ledger.test.js | MODIFY | tests | AC-20260912-03-6 (path pins repointed) |
| tests/design-look-handoff.test.js | MODIFY | tests | AC-20260912-03-6 (path pin repointed) |
| tests/env-preflight.test.js | MODIFY | tests | AC-20260912-03-6 (path pin repointed) |
| tests/spec-status.test.js | MODIFY | tests | AC-20260912-03-6, -17 |
| tests/provenance/provenance.test.js | MODIFY | tests | AC-20260912-03-16 |
| tests/queue/queue-overlay.test.js | MODIFY | tests | AC-20260912-03-17 |
| tests/render/render-gate.test.js | MODIFY | tests | AC-20260912-03-17 |
| tests/smoke-manifest.test.js | MODIFY | tests | AC-20260912-03-17 |
| tests/merge-back.test.js | MODIFY | tests | AC-20260912-03-2 (refusal pins tagged in place) |
| tests/review/stopped-row-durability.test.js | MODIFY | tests | AC-20260912-03-10 — added at build: D10's `via` default collision (the byte-equality re-run never threaded `--via`, so verdict.js's own `direct` default no longer matches the driver's recorded `loop`); the re-run now threads the row's own `via`/`model`, as its sibling pin already does |

Orchestrator duty, outside the table: the three CREATE rows are the DELETE rows' bodies. The
build performs them with `git mv` followed by the in-place edits, so the rename is visible to
`git diff -M` and the review panel reads as a move plus a small edit, not 450 deleted lines.

## Contracts

`/spec:run`'s new Step 0, as it appears in `spec/commands/run.md` above `## Routing`:

```markdown
## Step 0 — Isolate

Unless `--in-place`, the loop runs in the spec's own worktree. Execute
`git/commands/enter-worktree.md`'s Steps 1–3 against `$ARGUMENTS` in this session, and do not
print its report — its `Next: nothing needs you` line is wrong mid-loop. Two skips, both
derived, each printed as one line:

- `--in-place` → skip.
- `status:` past `hardened` AND `{worktree}` absent from `git worktree list --porcelain` → skip.
  An in-flight build keeps its marks in an untracked `<spec>.build/` sidecar and its workers'
  output uncommitted; `git worktree add` carries neither, so a new worktree would restart the
  build against an empty tree while the half-built work stays behind. This fires on a `/clear`
  resume too.

A worktree that cannot be created is a **hard stop** — never a fall back to in place. When the
failure text is `create: run from the main working tree`, the session is inside a different
spec's worktree: stop and say to exit that worktree first. Any other failure: stop, print the
error, and name `--in-place` as the deliberate opt-out.

The render server must run from `{worktree}` — the design stage's render gate adopts a server
by port, not by root, so one left running at the main root would capture the wrong tree.
```

`/git:enter-worktree` Step 2's new first bullet:

```markdown
2. **Already inside (short-circuit).** If `git rev-parse --show-toplevel` (Bash) already equals
   `{worktree}`, the session is in it: report as **re-entered** and stop. No `EnterWorktree`
   call, no setup, no `build_base` write — `/clear` and `/compact` keep cwd, so this is the
   common resume.
```

Driver change, both `spec-build-driver.js` and `spec-review-driver.js` — the creation-time
recording loses its argv read:

```js
// before
if (marks.via === undefined) marks.via = flag('--via') === 'loop' ? 'loop' : 'direct'
// after
if (marks.via === undefined) marks.via = 'loop'
```

`spec-build-driver.js`'s already-DONE remedy string loses its conditional suffix:

```js
// before
specPath + (flag('--via') === 'loop' ? ' --via loop' : '')
// after
specPath
```

## Behavior

**The isolation path.** `/spec:run specs/20260912/03-x.md` on a `hardened` spec derives
`{source} = spec/03-x` via `merge-back.sh branch-for`, `{root}` via `merge-back.sh root`, and
`{worktree} = {root}/.claude/worktrees/spec-03-x`. Not in `git worktree list --porcelain` → the
create path runs, the session enters, entry is verified against
`git rev-parse --show-toplevel`, host setup runs once, `build_base` is written, and Routing
step 1 then runs inside the worktree. Re-invoking `/spec:run` from inside that worktree hits
D5's short-circuit and does nothing.

**The four creation refusals**, all exit 2, discriminated by text (executed, spike S1):

| Condition | `merge-back.sh create` stderr | Step 0 |
|---|---|---|
| `.claude/worktrees/` not gitignored | `create: '.claude/worktrees/' is not gitignored — …` | hard stop, names `--in-place` |
| session inside another worktree | `create: run from the main working tree (…), not a worktree (…)` | hard stop, "exit that worktree first" |
| stale `spec/<stem>` branch | `create: branch 'spec/03-x' already exists — …` | hard stop, names `--in-place` |
| unborn HEAD | `create: repository has no commits yet — …` | hard stop, names `--in-place` |

**The retirement.** After the move, typing `/spec:build specs/x.md` is not a registered command;
the state gate sees the prompt, matches no arm, and exits 0 without reading any spec. The build
and review stages are reached only through `/spec:run`, whose routing already sends
`implementing`/`done` straight to the review driver — that driver resumes from its marks
idempotently, so the stalled-review retry surface is `/spec:run <spec>` with no new machinery.
`/spec:replay` is a measurement surface, not a stage, and is untouched.

## Acceptance Criteria

- **AC-20260912-03-1**: WHEN `spec/commands/run.md` is read THE SYSTEM SHALL carry a `## Step 0` heading positioned before its `## Routing` heading whose section text contains the literal `--in-place`, the literal `git worktree list --porcelain`, the literal `<spec>.build/`, and a phrase matching `/never .{0,30}in place/i`; and `spec/commands/run.md` SHALL NOT contain the literal `/git:enter-worktree <spec>` first (e.g. the current § Input sentence `run /git:enter-worktree <spec> first` → absent) → writes tests/run/isolate-step.test.js
- **AC-20260912-03-2**: WHEN `merge-back.sh create --source spec/99-demo --root <repo>` runs against a repo whose `.claude/worktrees/` is not gitignored THE SYSTEM SHALL CONTINUE TO exit 2 with stderr containing `create: '.claude/worktrees/' is not gitignored`, and WHEN `--root` names a path inside an existing worktree it SHALL CONTINUE TO exit 2 with stderr containing `create: run from the main working tree` → reuses tests/merge-back.test.js :: create refuses
- **AC-20260912-03-3**: WHEN `spec/commands/run.md`'s Step 0 section is read THE SYSTEM SHALL state the past-`hardened`-with-no-registered-worktree skip in a single bullet that names both conditions and both artifacts an in-flight build holds (literals `<spec>.build/` and `uncommitted`), and SHALL name `/clear` as a case that reaches it → writes tests/run/isolate-step.test.js
- **AC-20260912-03-4**: WHEN `git/commands/enter-worktree.md` Step 2 is read THE SYSTEM SHALL open with a short-circuit bullet containing the literals `git rev-parse --show-toplevel`, `re-entered`, and a phrase matching `/no .{0,20}EnterWorktree/i`, positioned before the existing `git worktree list --porcelain` re-enter bullet → writes tests/run/isolate-step.test.js
- **AC-20260912-03-5**: WHEN `git/commands/enter-worktree.md` is read THE SYSTEM SHALL NOT contain the literal `the pipeline runs **in place** on the current branch`, and SHALL contain a phrase matching `/repair|manual/i` within its first 20 lines → writes tests/run/isolate-step.test.js
- **AC-20260912-03-6**: WHEN the repo tree is read THE SYSTEM SHALL find `spec/doctrine/stages/stage-build.md`, `spec/doctrine/stages/stage-review.md` and `spec/doctrine/stages/stage-design.md` present, each with no YAML frontmatter (first line is not `---`), and `spec/commands/build.md`, `spec/commands/review.md`, `spec/commands/design.md` absent; and each stage file's ordered `## ` heading list SHALL equal its predecessor's exactly (e.g. `stage-build.md`'s six headings, in order: `Input` / `Build stage — the build driver owns this part of the state machine` / `Worker Contract — every dispatch this session makes` / ``` `blocked` returns ``` / `Report` / `Rules`) → writes tests/consistency/stage-files.test.js
- **AC-20260912-03-7** `[oracle: gate]`: WHEN `tests/consistency/entrypoints.test.js` runs THE SYSTEM SHALL report zero forward, reverse, inventory and reachability violations against the live repo with `spec/entrypoints.json`'s sixteen former `spec/commands/{build,review,design}.md` entry-point strings replaced by their `spec/doctrine/stages/stage-*.md` paths, and its corpus surface list SHALL include `spec/doctrine/stages` (e.g. a fixture whose `spec/doctrine/stages/stage-x.md` contains `` node "$(spec-paths widget)" `` with no manifest row for it → one reverse violation naming that file) → writes spec/entrypoints.json
- **AC-20260912-03-8**: WHEN `citations-check.js --root <fixture>` runs against a tree whose `spec/doctrine/stages/stage-probe.md` cites `core.md § No Such Heading` THE SYSTEM SHALL report that line as a MISS and count it in `TOTAL` (e.g. pre-change `TOTAL=1 CHECKED=1 SKIP=0 MISS=1` counting only the `spec/commands/` copy → post-change `TOTAL=2 … MISS=2`) → writes tests/consistency/stage-files.test.js
- **AC-20260912-03-9**: WHEN the build driver creates a sidecar with no flags at all THE SYSTEM SHALL record `via: "loop"` and append a DONE row whose keys immediately after `tier` are `via`, `model` with `"via":"loop"`; and WHEN the same first invocation passes `--via direct` the recorded value SHALL still be `"loop"` → rewrites tests/build/build-driver-commit.test.js :: AC-20260901-02-5:
- **AC-20260912-03-10**: WHEN the review driver creates a sidecar with no flags at all THE SYSTEM SHALL record `via: "loop"` in `review-state.json`, and WHEN the same first invocation passes `--via direct` the recorded value SHALL still be `"loop"` → rewrites tests/review/review-driver.test.js :: AC-20260901-02-4
- **AC-20260912-03-11**: WHEN the build driver is invoked on a `status: implementing` spec with no sidecar and a `stage:"build"` ledger row naming it THE SYSTEM SHALL exit 2 with stderr naming `spec-review-driver.js` and the row id, and that stderr SHALL NOT contain the literal `--via` (e.g. `… node <path>/spec-review-driver.js specs/20260912/03-x.md`, no suffix) → rewrites tests/build/build-driver-commit.test.js :: field
- **AC-20260912-03-12**: WHEN `spec-state-gate.sh` receives `{"prompt":"/spec:build specs/20260820/92-fixture.md"}` against a spec at `status: draft` with `open_markers: 2` THE SYSTEM SHALL exit 0 with empty stderr, and likewise for a `/spec:review …` and a `/spec:design …` prompt at every status; and its jq-missing notice SHALL name exactly `/spec:plan` and `/spec:run` and none of the three (e.g. the notice's command list `/spec:plan, /spec:run` → no `/spec:build`) → rewrites tests/state-gates.test.js :: AC-20260901-10-2
- **AC-20260912-03-13**: WHEN `spec-paths shared-for design` runs THE SYSTEM SHALL print the fail-open whole-doctrine output, equal in line count to `spec-paths shared-for no-such-command`; likewise for `build` and for `review` (e.g. pre-change `shared-for design` printed 292 lines against the fallback's full-doctrine count → post-change the two counts are equal) → rewrites tests/spec-paths.test.js :: shared-for: scoped
- **AC-20260912-03-14** `[oracle: gate]`: WHEN `tests/consistency/read-load.test.js` runs THE SYSTEM SHALL find no `BUDGET` or `SHARED_FOR` key named `build`, `review` or `design`, every remaining command at or under its budget, and `/spec:run` at or under a `BUDGET.run` measured at build time (e.g. pre-change `run: 310` against a measured 308; the new value is whatever `own + shared` measures once Step 0 lands, never a round number chosen ahead of it) → rewrites tests/consistency/read-load.test.js :: every
- **AC-20260912-03-15**: WHEN the three stage files are measured THE SYSTEM SHALL find each at or under a per-file line cap pinned in `tests/consistency/read-load.test.js`, each cap equal to that file's measured line count at build (e.g. `stage-build.md` measured at 96 after its 4 frontmatter lines are dropped → cap 96) → writes tests/consistency/stage-files.test.js
- **AC-20260912-03-16**: WHEN `verdict.js` is run with `--via loop --model <id>` on a review-profile ledger pass THE SYSTEM SHALL CONTINUE TO print a row whose key order begins `ts, spec, stage, tier, via, model, runId` carrying `"via":"loop"`; with `--via manual` it SHALL CONTINUE TO exit 2 naming `--via` and print no row; with neither flag it SHALL CONTINUE TO default to `via:"direct"` → reuses tests/provenance/provenance.test.js :: AC-20260901-02-3 (also
- **AC-20260912-03-17**: WHEN the tracked tree is swept for the literals `/spec:build`, `/spec:review` and `/spec:design` THE SYSTEM SHALL report zero hits under `spec/`, `git/`, `scripts/`, `README.md` and `docs/canonical/`, and zero hits on non-comment lines under `tests/` (e.g. `git grep -n "/spec:build" -- spec git scripts README.md docs/canonical` → no output, exit 1); `specs/`, `docs/roadmap/`, `docs/adr/`, `docs/audit/` and `.claude/` SHALL be excluded → writes tests/consistency/retired-stage-commands.test.js
- **AC-20260912-03-18** `[oracle: gate]`: WHEN `node scripts/plugin-bump.js --check` runs against the merge base THE SYSTEM SHALL exit 0, the spec plugin having been bumped once with a changelog paragraph naming the isolation default and the stage-command retirement → writes spec/.claude-plugin/plugin.json
- **AC-20260912-03-19**: WHEN `spec-state-gate.sh` receives `{"prompt":"/spec:run specs/x.md"}` or `{"prompt":"/spec:plan specs/x.md"}` against a spec at `status: draft` THE SYSTEM SHALL CONTINUE TO exit 2 with stderr naming both `/spec:run` and `/spec:plan`, and SHALL CONTINUE TO exit 2 on a `/spec:run` prompt against a spec carrying `open_markers: 2` → rewrites tests/state-gates.test.js :: AC-20260901-10-1:
- **AC-20260912-03-20**: WHEN `spec-paths shared-for run-design` runs THE SYSTEM SHALL CONTINUE TO emit `## Design Render Gate`, and SHALL CONTINUE TO emit neither `## Design Binding Pipeline` nor `## Workflows Encode Shape, Not Judgment` → rewrites tests/spec-paths.test.js :: AC-20260824-05-3:

## Assumptions (escalation triggers)

- A1: All four `merge-back.sh create` refusals exit 2 and are distinguishable only by stderr text. **Executed (spike S1)**: un-gitignored → `exit=2`, `create: '.claude/worktrees/' is not gitignored — …`; `--root` inside a worktree → `exit=2`, `create: run from the main working tree (…), not a worktree (…)`; existing branch → `exit=2`, `create: branch 'spec/99-demo' already exists — …`; a gitignored fresh repo → `exit=0` printing the absolute worktree path as its last stdout line. **If false:** branch Step 0's message on whatever discriminator the observed run offers; never on exit code alone.
- A2: `shared-for build`, `review` and `design` are each exact subsets of `shared-for run` ∪ `shared-for run-design`, so retiring them costs no session any doctrine. **Executed (spike S2)**: the set difference is 0 sections for all three. **If false:** keep the key whose list is not a subset and narrow D13 to the other two, recording which.
- A3: `citations-check.js`'s `SCANNED_DIRS` walk is non-recursive, so a file under `spec/doctrine/stages/` leaves the citation sweep unless the directory is added. **Executed (spike S3)**: a dangling `§` citation in `spec/commands/probe.md` reported `MISS … TOTAL=1`; the identical citation in `spec/doctrine/stages/stage-probe.md` was not reported at all. **If false:** drop D9's `citations-check.js` edit and record that the walk already recursed.
- A4: `tests/consistency/entrypoints.test.js`'s `corpusFiles`/`listFiles` pair is non-recursive in the same way, so the reverse-invocation guard loses the three moved files unless `spec/doctrine/stages` joins the surface list. **Read, not executed** — `listFiles` is `readdirSync(dir).filter(isFile)`. **If false:** drop that half of D9; the manifest rows still need renaming either way.
- A5: `/spec:run`'s measured read load is 308 lines against `BUDGET.run` of 310, and Step 0 adds roughly 18. **Measured at plan time**; re-measure at build and set the budget to the true number. **If false (Step 0 lands under 310):** leave `BUDGET.run` at 310 and drop D14's raise.
- A6: Neither driver refuses unknown flags — `flag()` is `argv.indexOf(name)` with no usage check — so a session that still types `--via direct` gets a silently ignored flag, not a refusal. **Read, not executed.** **If false:** the ignore is already a refusal and AC-20260912-03-9/-10's second clause must assert the refusal instead; do not add one.
- A7: The three commands appear in `.claude/` grounding files that `/spec:init` and `/spec:doctor` own. **If false (a `.claude/` file turns out to be hand-maintained plugin source):** add it to the File Plan and to AC-17's sweep scope in the same build.
- A9: After the move, the three stage files' own `§` citations still resolve once `spec/doctrine/stages` joins `SCANNED_DIRS` — they resolve today from `spec/commands/`, and the resolver's same-directory preference finds no competing basename in the new directory. **If false:** repoint the exact citation the MISS names; never widen the resolver.
- A8: The live-file pins this spec's sixteen `entrypoints.json` renames invalidate are caught at build by the whole-suite check and cost one review waive line (host rules § Gotchas, specs/20260814/05 D6/D12). **If false:** the waive becomes a fix row for whichever pin enumerates the manifest exhaustively.

## Rationale

Two changes, one set of paragraphs. The manual `/git:enter-worktree` wrap has been run before
every single `/spec:run` for weeks, which is the definition of a wrong default; and the three
stage commands survive only because spec 20260901/10 kept them when the loop was introduced,
while `run.md` already delegates into their bodies rather than duplicating them. Editing both at
once avoids rewriting `run.md`'s Input and Routing sections twice.

Fable 5.1 was consulted three times during planning. Its proposal to open the worktree *after*
the design stage so mocks stay visible to `/spec:atlas` on main was overruled: every design
script is root-relative, `design/mocks/status.json` lives under whatever root the session is in,
and design's checkpoint commit lands on the spec branch that merge-back carries to main —
nothing writes to the main root by path. Its two-spec split was also overruled. Its adversarial
pass on the collapsed plan then caught three errors that are folded in above: the past-`hardened`
skip is a correctness rule rather than a convenience (D3), a `stages/design.md` filename would
collide in the citation index (D8), and `via` is a measurement field that must survive the flag's
removal (D10).

The decomposition cap is deliberately exceeded. Six decisions carry judgment; the rest of the
File Plan is a one-token rename repeated across roughly thirty-five files, which is one worker's
mechanical pass and fully covered by the gate. Splitting it would leave a repo whose README and
doctrine instruct a reader to run commands that no longer exist — the exact stale-prose state
the sweep exists to close. The user was shown the size and chose one spec.

The known hazard left standing, warn-only: `render-gate.js`'s adopted-server probe checks
whether something is listening on the port, not whether it serves this root, so an always-on
render server at the main root would let a worktree's render gate capture the main tree's
components. It is already recorded as `adoptedServerNote` and diagnosed at verdict, so it can
only mis-attribute a red, never manufacture a green. Step 0 carries one line of prose about it
rather than a new check.

**The two measured constants, at build.** D14 pins three numbers the test-authoring wave cannot
know: `BUDGET.run` and the three stage files' line caps only exist once the doctrine wave has
written Step 0 and the moved bodies. The tests were authored with deliberate placeholders and the
obligation recorded, then corrected from the true measurement at integration: `BUDGET.run` rose
310 → **334** (112 own + 222 shared), and the caps landed at 96 / 129 / 212 — each file's exact
measured length under the test's own `split('\n')` metric, which runs one higher than `wc -l` for
a newline-terminated file. Every cap may only shrink from here.

**Collision closure at lock.** `collision-closure --literal` over `/spec:build`, `/spec:review`,
`/spec:design`, the three `spec/commands/*.md` paths and the three `shared-for` keys returned 38
literals-leg hits. Every hit outside `specs/`, `docs/roadmap/`, `docs/adr/`, `docs/audit/` and
`.claude/` is a File Plan row above, except two, **recorded here as waived**:
`tests/build/build-driver-base.test.js` and `tests/review/review-base-derivation.test.js` — each
carries exactly one hit, on a comment line recording which stage the pin was written for, which
D15 excludes as a record rather than an instruction. The paths leg's `executes` hits were read:
the load-bearing one is `tests/consistency/citations-check.test.js`'s live-corpus `MISS=0` pin,
which sees the three stage files for the first time once D9 lands — covered by A9. The new sweep
test reuses `tests/consistency/genesis-doctrine.test.js`'s existing `sweepRetiredLiteral` helper
shape rather than inventing a second one.

## Canonical Delta

`docs/canonical/pipeline.md`, replacing the paragraph that currently enumerates the three stage
entry points and the paragraph on what the state gate admits:

> `/spec:run` is the only way into the design, build and review stages. It derives the next
> stage from disk, opens the spec's own git worktree before anything else runs, and carries a
> hardened spec to `done` in one command. The three stage bodies live under
> `spec/doctrine/stages/` as prose the loop executes; none of them is an invokable command, and
> the state-machine hook gates `/spec:plan` and `/spec:run` alone. Isolation is the default:
> `--in-place` opts out, and a worktree that cannot be created stops the run rather than
> continuing on the current branch. A spec already past `hardened` with no worktree registered
> stays where it is, because an in-flight build's sidecar marks and uncommitted worker output do
> not travel into a new working tree.
>
> `/git:enter-worktree` remains the manual surface for entering or repairing a spec's worktree by
> hand; it is idempotent and short-circuits when the session is already inside the tree it would
> create.
