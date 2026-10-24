---
date: 2026-10-08
status: done
build_base: main
open_markers: 0
tier: standard
area: doctrine
breaking: false
depends_on: [specs/20261008/01-doctrine-states-contracts-and-points-at-its-enforcers.md]
brief: n/a
diff_base: 6620ceada2ce21d0f398cb2e5a956f24b771968b
---

# Commands state their steps and point at their scripts

## Goal

The fourteen command files under `spec/commands/` shrink to what a session needs to act: the
script to run, its flags, the order, how to render its output, and the judgments only the
session can make. Every paragraph that restates what a script, driver or hook already does
becomes a one-line pointer at it, and the behavioural guidance in `init.md` that a spike proved
nothing pins or guards is deleted. Nothing is rewritten, every `## ` heading and every numbered
step or check keeps its number, and every script invocation the entrypoints manifest declares
survives. Done means: each command at or under its ceiling, `read-load.test.js`'s per-command
budgets lowered to the new measured values, the entrypoints and wiring pins green, and no
assertion weakened.

## Decisions (locked — workers apply verbatim, never override)

<!-- Carrier contract (specs/20260817/07-promise-sweep-leg.md D8): every row cites ≥1 of this
     spec's own AC-IDs or carries `[no-ac: <reason>]`. -->

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | **The pointer rule** (spec 01 D1, verbatim): a paragraph whose behaviour a script, driver or hook enforces becomes at most three lines naming the enforcer in backticks; its header comment is the contract. The command never restates a script's branches, refusal texts or exit codes. (AC-20261008-02-1) | Same rule, second corpus. The spike in `.claude/worktrees/agent-a8c877fb42f8a1f52` cut 267 such lines from init.md and enforce.md with zero test failures. |
| D2 | **The keep rule for commands.** A line survives when it is: an invocation (`node "$(spec-paths <key>)" …`, a script basename, a `/spec:*` chain literal), a flag or its argument, a numbered step or check and its first sentence, a `## ` heading, a slot name for `report-render`, a refusal the session must act on, a file path, or a pin anchor in Rationale § Pin inventory. A line that explains why, teaches method, cites history or restates doctrine served by `shared-for` is deleted. Numbered steps and checks keep their numbers even when their body shrinks to one line. (AC-20261008-02-1) | `spec/entrypoints.json` declares command files as call sites: a deleted invocation literal reddens `entrypoints.test.js`. Tests anchor on check and step numbers (doctor check 11/15/17, replay Phase 1 steps 1/5/7, escape step 6). |
| D3 | **Deletion only, no rewriting** (spec 01 D3). `[no-ac: reviewer judgment over the diff]` | Retired prose leaves; it never comes back shorter. |
| D4 | **Procedure-only prose stays.** `enforce.md` Phases 1–7, `escape.md` Steps, `doctor.md` checks 1–12 and Repair mode, `init.md` Phases 2–5 and 7–8 are the procedure itself — no driver runs them — and are cut only under D1 (restated script behaviour), never under D2's method clause. Moving doctor's checks 1–12 into a script is queued as its own item, not done here. `[no-ac: scoping rule; its effect is the per-file ceilings in D5]` | The research measured advice layered over gates; prose that *is* the mechanism has no gate to lean on. Mechanizing it is a different spec. |
| D5 | **Per-file ceilings** (Contracts § Ceilings): init 270, doctor 215, enforce 295, escape 215, genesis 85, mocks 60, plan 120, prototype 95, queue 55, release 175, replay 190, run 75, status 60, connect 22. The build records each command's measured read-load (own + shared) into `BUDGET`; entries may only shrink. (AC-20261008-02-1, AC-20261008-02-2) | Sums of the audit's A/B/C classification per file with B shrunk to pointers, C deleted only where D4 allows, and the init spike's measured result (455 → 288 before B shrinks). |
| D6 | **`genesis.md`'s own cap tightens** from `<=120` to the measured value, keeping the literal chain `/spec:mocks → /spec:genesis → /spec:enforce` and the `- Chain:` bullet. (AC-20261008-02-3) | Three tests pin the 120 cap and the chain literal; the cap becomes a true ratchet. |
| D7 | **Retired phrase pins leave, never weaken** (spec 01 D8). The command-blanking spike's 21 red tests are all anchored on lines D2 keeps (Rationale § Pin inventory); a pin that reddens anyway is handled under A3. `[no-ac: the host gate is the oracle]` | pipeline rules § Test Rules. |
| D8 | **Plugin version bump** via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"`. `[no-ac: scripts/plugin-bump.js --check in the gate is the oracle]` | pipeline rules § Planning. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/commands/init.md | MODIFY | doctrine | D1/D2/D5 — Phase 1 profiling guidance, Phase 1.5 substrate list, Phase 4 content-bar paragraphs and Phase 6 justification go (spike diff is the reference); init-gen exit codes / Worker Contract / settings-merge restatements → pointers at `init-gen.js`; ≤ 270 |
| spec/commands/doctor.md | MODIFY | doctrine | D1/D4/D5 — checks 13–24 shrink to `N. **Name** — run <invocation>; <one clause>`; checks 1–12, Repair mode and Report untouched beyond D1; ≤ 215 |
| spec/commands/enforce.md | MODIFY | doctrine | D1/D4/D5 — the wf-enforce return-shape restatement → pointer at `wf-enforce.js`; phases untouched; ≤ 295 |
| spec/commands/escape.md | MODIFY | doctrine | D1/D4/D5 — escape-row.js validation and duplicate-refusal restatements → pointers; step 6's three fates and the owner-citation rule stay verbatim; `.claude/spec-runs.jsonl` stays named; ≤ 215 |
| spec/commands/genesis.md | MODIFY | doctrine | D1/D2/D5/D6 — driver-restating lines → pointer at `genesis-driver.js`; chain literal and `- Chain:` bullet kept; ≤ 85 |
| spec/commands/mocks.md | MODIFY | doctrine | D1/D5 — driver-restating lines → pointer at `mocks-driver.js`; ≤ 60 |
| spec/commands/plan.md | MODIFY | doctrine | D1/D5 — ac-matrix / promise-sweep / state-gate restatements → the invocation plus one clause each; Lock steps keep their numbers; ≤ 120 |
| spec/commands/prototype.md | MODIFY | doctrine | D1/D5 — the per-state refusal restatements → pointer at `prototype-driver.js`; ≤ 95 |
| spec/commands/queue.md | MODIFY | doctrine | D1/D5 — spec-queue.js subcommand restatement → the invocation lines; ≤ 55 |
| spec/commands/release.md | MODIFY | doctrine | D1/D5 — release-legs.js / verdict.js restatements → pointers; `UNMEASURED:` and the never-promote rule stay verbatim; ≤ 175 |
| spec/commands/replay.md | MODIFY | doctrine | D1/D5 — replay.js refusal restatements → pointers; Phase 1 steps keep numbers and their first sentences (setup gate, `--overlay`, `.worktreeinclude`, reconcile hook, step 7 re-key); ≤ 190 |
| spec/commands/run.md | MODIFY | doctrine | D1/D5 — the deriveNext order restatement → pointer at the driver; ≤ 75 |
| spec/commands/status.md | MODIFY | doctrine | D1/D5 — spec-status.js render restatement → the invocation and slot lines; ≤ 60 |
| tests/consistency/read-load.test.js | MODIFY | tests | D5 — AC-20261008-02-1/-2: every `BUDGET` entry lowered to the value measured at build |
| tests/consistency/genesis-doctrine.test.js | MODIFY | tests | D6 — AC-20261008-02-3: the three `<=120` assertions on spec/commands/genesis.md tighten to the measured value |
| spec/.claude-plugin/plugin.json | MODIFY | other | D8 — `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` |

`connect.md` (22 lines) is not touched: nothing in it restates a script.

## Contracts

### Ceilings (D5) — own-file line counts the build measures and `BUDGET` then pins as own + shared

```js
// own-file ceilings (lines); BUDGET in read-load.test.js pins own + `shared-for` at build
const COMMAND_CEILING = {
  init: 270, doctor: 215, enforce: 295, escape: 215, genesis: 85, mocks: 60, plan: 120,
  prototype: 95, queue: 55, release: 175, replay: 190, run: 75, status: 60, connect: 22,
}
```

`BUDGET` after this spec: each command's measured `own + shared` (shared as spec 01 left it).
The test's existing generator (`AC-20260908-06-1: read-load budget: /spec:<cmd> …`) carries
`AC-20261008-02-1` in its title; the roster test (`every /spec command has a read-load budget
entry …`) carries `AC-20261008-02-2`.

### Pointer-line grammar

Spec 01 Contracts § Pointer-line grammar, unchanged: ``Enforced by `<script>` — its header
comment is the contract.`` or ``Printed by `<driver>.js` at <STATE>; never restated here.``

## Behavior

### Fate table (per file; bucket sizes from the 2026-10-08 audit)

| File | Now | A keep | B → pointers | C | Ceiling |
|---|---|---|---|---|---|
| init | 454 | 190 | 80 → ~20 | 185 → ~60 (Phase 1/1.5/4 guidance deleted; Phase 2/3/5/7/8 procedure kept; Phase 6 keeps its table and refusals) | 270 |
| doctor | 268 | 75 | 60 → ~15 (checks 13–24) | 133 kept (checks 1–12 + repair mode, D4) | 215 |
| enforce | 330 | 120 | 25 → ~6 | 185 kept (D4) | 295 |
| escape | 250 | 70 | 40 → ~10 | 140 kept (D4) | 215 |
| genesis | 117 | 70 | 30 → ~6 | 17 → ~8 | 85 |
| mocks | 76 | 50 | 15 → ~4 | 11 → ~5 | 60 |
| plan | 147 | 60 | 25 → ~8 | 62 → ~50 (Entry bullets and Lock steps are procedure) | 120 |
| prototype | 132 | 70 | 45 → ~10 | 17 → ~12 | 95 |
| queue | 78 | 45 | 25 → ~5 | 8 → ~4 | 55 |
| release | 232 | 95 | 55 → ~15 | 82 → ~60 (phase bodies are procedure; justification lines go) | 175 |
| replay | 264 | 120 | 80 → ~20 | 64 → ~45 (Phase 1 steps keep numbers + first sentences) | 190 |
| run | 99 | 65 | 25 → ~5 | 9 → ~4 | 75 |
| status | 91 | 45 | 35 → ~8 | 11 → ~5 | 60 |

### What the session does at build

1. One doctrine worker applies the fate table file by file, deleting only; the init.md spike
   diff (`git -C .claude/worktrees/agent-a8c877fb42f8a1f52 diff spec/commands/init.md`) is the
   reference for the Phase 1/1.5/4 deletions.
2. Run `node spec/scripts/citations-check.js --root .` — MISS stays 0.
3. Measure every command's read-load; write the numbers into `BUDGET`; tighten the genesis cap.
4. Run the suite; a red pin outside the inventory is handled under A3.

## Acceptance Criteria

- **AC-20261008-02-1**: WHEN the read-load test runs THE SYSTEM SHALL hold every command's own file
  at or under its Contracts ceiling and its `own + shared` load at or under its `BUDGET` entry as
  measured at build (e.g. `wc -l spec/commands/init.md` → ≤ 270; `/spec:init` loads ≤ 270 + its
  shared lines) → rewrites tests/consistency/read-load.test.js :: AC-20260908-06-1: read-load budget [retired: specs/20261024/04-scripts-drop-their-inline-changelog.md]
- **AC-20261008-02-2**: WHEN the budget roster test runs THE SYSTEM SHALL find a `BUDGET` entry for
  every one of the fourteen commands and no entry above the value this build measured (the table
  may only shrink) → rewrites tests/consistency/read-load.test.js :: every /spec command has a read-load budget entry [retired: specs/20261024/04-scripts-drop-their-inline-changelog.md]
- **AC-20261008-02-3**: WHEN `spec/commands/genesis.md` is measured THE SYSTEM SHALL be at or under the
  value measured at build (≤ 85) and SHALL still contain the literal `/spec:mocks → /spec:genesis → /spec:enforce`
  and a `- Chain:` bullet → rewrites tests/consistency/genesis-doctrine.test.js :: AC-20260902-08-11 / AC-20260914-02-14
- **AC-20261008-02-4**: WHEN the entrypoints sweep runs THE SYSTEM SHALL CONTINUE TO report zero
  violations in both inventory and both invocation directions — every `spec-paths <key>` literal a
  command file is declared as the call site of survives → reuses tests/consistency/entrypoints.test.js :: AC-20260820-04-6
- **AC-20261008-02-5**: WHEN `status.md`, `doctor.md` and `plan.md` are read THE SYSTEM SHALL CONTINUE TO
  invoke `spec-paths spec-status` as the one Next derivation → reuses tests/spec-status.test.js :: consumers are wired to the one derivation
- **AC-20261008-02-6**: WHEN `doctor.md` is read THE SYSTEM SHALL CONTINUE TO carry check 17 running
  `spec-paths ac-drift` under its own number → reuses tests/doctor/ac-drift.test.js :: AC-20260906-01-9
- **AC-20261008-02-7**: WHEN every command's `## Rules` section is counted THE SYSTEM SHALL CONTINUE TO
  hold at most 8 bullets → reuses tests/consistency/read-load.test.js :: AC-20260908-06-2 [retired: specs/20261024/04-scripts-drop-their-inline-changelog.md]

## Assumptions (escalation triggers)

- A1: Every ceiling is reachable by deletion alone under D1/D2/D4. — **if false:** the worker
  returns `blocked` naming the file and the lines it cannot delete; the session raises that one
  ceiling and records the deviation — never rewrites prose to fit.
- A2: Spec 01 has landed (its `BUDGET` table carries all fourteen commands and `CAP` is gone), so
  this spec only lowers numbers. — **if false:** this spec's read-load row also performs spec 01 D7
  (adds the missing entries, deletes `CAP`) and records the deviation.
- A3: The command-blanking spike (all 14 bodies blanked, headings kept; 1232 run, 21 red) is the
  superset of pins this cut can redden and every one anchors on a D2 keep-line (Rationale § Pin
  inventory). — **if false:** the build adds the test file as a File Plan row with the re-target or
  delete fate and records the deviation; never a weakened assertion.
- A4: The contract hash reads only `spec/templates/grounding-contract.md`; no command file feeds it.
  — **if false:** STOP; a hash change makes every host owe a re-stamp and needs the user's yes.

## Rationale

Second of two specs from the 2026-10-08 subtraction pass (spec 01 owns the doctrine files). The
audit put 926 of 2,560 command lines in the "behaviour prose, no mechanism" bucket and 542 in
"restates an enforcer". The init/enforce spike deleted 267 of those lines and the suite stayed at
1230/1230: nothing pins them and nothing guards them, which is the research finding in miniature.

**Why D4 keeps procedure-only prose.** In enforce, escape, doctor (checks 1–12) and init's middle
phases the prose *is* the mechanism — no driver prints those steps. The research that motivates the
cut measured advice layered over gates, not procedure with no gate under it. Deleting it would be a
behaviour change with no test, so those files are cut only where they restate a script. Mechanizing
doctor's checks 1–12 is queued as its own item; it is a script-writing spec, not a prose cut.

**Why ceilings rather than phrase bans** — spec 01 Rationale, same instrument (`read-load.test.js`).

**Rejected.** (1) Folding into spec 01 — 19 doctrine-layer rows exceeds core § Decomposition. (2)
Cutting `plan.md`'s Lock steps to pointers — they are the session's own procedure and three
scripts' invocation sites; they keep their numbers and lose only their explanations.

**Fragile.** Tests anchor on numbered checks and steps: doctor 6b/11/15/17, replay Phase 1 steps
1/5/7 and Phase 3, escape step 6. Renumbering is forbidden by D2; a check that shrinks to one line
keeps its number.

**Build deviations (folded at close, 2026-10-13).**
- The init.md spike worktree named in What the session does at build step 1 was gone by build
  time; init's Phase 1/1.5/4/6 deletions followed the fate table text alone.
- The worker assembled files by whole-file rewrite from the original text rather than in-place
  deletes; review inspected every added line and found only rejoined wraps and pointer lines
  (D3 held). One rewrap split the `spec-paths mocks-driver` literal across a line break and
  reddened `entrypoints.test.js` until rejoined — the reflow trigger the host Gotchas already carry.
- Report example `report` code blocks were deleted in run, plan, release, replay, enforce,
  doctor, escape and init; slot names stay in prose. genesis keeps its example because the
  `- Chain:` pin matches a line-initial bullet only the example carries.
- genesis.md is 83 lines by `wc -l`, 84 by the test's split count; D6's cap is pinned at the
  split-count measurement, 84.
- escape.md Steps 1, 3, 4 and 6 and replay.md Phase 1 steps 1, 4, 5 and 7 lost explanatory
  clauses read as D2's "explains why" rather than D4-protected procedure; every pin anchor and
  step 6's three fates and owner-citation rule are verbatim. Review left this as a soft note.
- BUDGET was set to the measured own + shared load for all fourteen commands (connect unchanged
  at 70).
- The review's soft note on the COMMAND_CEILING comment naming the BUDGET formula was fixed at
  close; its note on escape-row.js's exit-1 clause surviving inside the pointer is left as-is
  (pre-image text, D2 refusal-adjacent).

### Pin inventory (A3) — the lock-time blanking spike

| Test | Anchor line that must survive (file) |
|---|---|
| tests/replay/replay.test.js :: AC-20260820-02-6, AC-20260823-09-9, AC-20260831-01-7, AC-20260909-01-11, AC-20260909-01-15, AC-20260904-02-13, replay-root-3 | replay.md Phase 1 steps 1/5/7 and Phase 3: the setup-gate sentence (`git -C {dir} clean -fd`, setupCommand inside `{dir}` without relocating), `--overlay {commit}`, the `.worktreeinclude` copy sentence, the post-apply reconcile hook and its failure arm, step 7's newly-red re-key, Phase 3's reconcile-path-only survivor rule |
| tests/run-ledger.test.js :: AC-20260821-02-8 / AC-20260913-09-10 | replay.md's "One entry point" paragraph (no `REPLAY` token elsewhere) |
| tests/run-ledger.test.js :: AC-20260820-07-13 / AC-20260823-01-20 | escape.md names `.claude/spec-runs.jsonl` |
| tests/prose-debt/doctrine-pins.test.js :: AC-20260823-06-4 and the owner-citation pin | escape.md step 6 `doctrine` branch: delete / merge / mechanize in order; spec-path owner citation, never the row's dated id |
| tests/release-legs/unmeasured.test.js :: AC-20260913-08-8 | release.md: `UNMEASURED:` and the never-promote-over-unmeasured rule |
| tests/consistency/genesis-doctrine.test.js :: AC-20260825-01-4, AC-20260827-04-5, AC-20260902-08-11 / AC-20260914-02-14 | genesis.md: `wf-research` named; the `- Chain:` bullet naming `/spec:enforce`; the chain literal |
| tests/consistency/entrypoints.test.js :: AC-20260820-04-6 | every `spec-paths <key>` invocation literal in every command (ac-drift, ac-matrix, ci-gate-parity, catalog-inventory, citations-check, collision-closure, comment-narration, design-contract-check, env-preflight, escape-row, fleet-reader, …) |
| tests/spec-status.test.js :: consumers are wired to the one derivation | status.md, doctor.md, plan.md invoke `spec-paths spec-status` |
| tests/consistency/citations-check.test.js :: AC-20260810-09-5 | doctor.md check 15 invokes `citations-check` |
| tests/doctor/ac-drift.test.js :: AC-20260906-01-9 | doctor.md check 17 invokes `spec-paths ac-drift` |
| tests/env-preflight.test.js :: AC-20260815-05-7 | doctor.md check 6b invokes `spec-paths env-preflight` with `--rules` |
| tests/merge-back.test.js :: AC-20260814-02-5 | doctor.md check 11 invokes `branch-for` |

## Canonical Delta

None — the command files are their own canon.
