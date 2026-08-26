---
date: 2026-08-25
status: implementing
diff_base: c15b711b87ba983a418da217cc489a11940894da
tier: critical           # edits the genesis-state-gate.sh hook (process boundary) and adds a spec-paths key
area: genesis
design: false
breaking: false
depends_on: [specs/20260825/03-genesis-currency-executed.md]
depended_on_by: []
brief: 10
open_markers: 0
spiked: 2026-08-25
---

# The genesis driver and the one `/spec:genesis` command

## Goal

Genesis's architect stage becomes driver-stepped, the review-driver shape from brief 16: one
script, `genesis-driver.js`, derives the current state from `.claude/genesis/status.json` plus
the artifacts actually on disk, executes every deterministic step itself (status
initialization, the coverage-audit gate, the registry check per menu, the decision-record
closure check, the scaffold command, the zero-day gate, the roadmap closure check), and prints
only the one step that needs the session's judgment. `/spec:genesis-architect` is replaced by a
thin `/spec:genesis` command that loops on the driver; the explore and design commands are
untouched except for the predecessor's name (their fold into the driver is brief 10a). Every
accepted mark prints a **checkpoint** line — the state is saved, the session may `/clear` and
re-invoke — so a full genesis never has to fit one context window. Done means: the driver's
states run end-to-end against a synthetic host, the hook admits `/spec:genesis` as the entry
point, the old command file is gone, and the suite is green.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | New `spec/scripts/genesis-driver.js` (`spec-paths genesis-driver`), zero-dependency, header per Worker Rules; contract: `genesis-driver.js [--root <dir>] [--mark <mark> [--file <path>]] [--state]`; marks (closed set): `discovery-done` · `menu-written --file <menu.json>` · `menus-done` · `decided` · `skeleton-landed` · `roadmap-written`; `--state` prints the state name only; every child process (registry-check, scaffold, gate) runs through one fail-closed `runChild` (null status = die, never a pass) (AC-20260825-04-1, AC-20260825-04-8) | Brief 10 unit D / brief 16: procedural hallucination is the largest agent-failure class; a driver-owned sequence deletes it |
| D2 | States, derived on every invocation from status + artifacts (a mark whose artifact vanished is demanded again): `DISCOVERY` → `MENUS` → `DECIDE` → `SCAFFOLD` (driver-only) → `SKELETON` → `GATE` (driver-only) → `GATE_RED` \| `ROADMAP` → `HANDOFF` (terminal for this stage). No `status.json` → create it from `$(spec-paths templates)/status.json` (schemaVersion 2) and print DISCOVERY; `brief.md` absent → the DISCOVERY step names `$(spec-paths templates)/genesis-brief.md` as the source (AC-20260825-04-1, AC-20260825-04-2) | Re-entry verifies artifacts, never trusts the enum (genesis.md § State Machine) |
| D3 | `--mark discovery-done`: parse `brief.md`'s `## Coverage` block against spec 02's line grammar; any key `dark` → exit 2 naming the dark keys and the remedy ("ask them, in the user's words, then re-mark"); a missing key or unparseable line → exit 2 naming it; else record `marks.discoveryDone` (AC-20260825-04-2) | The coverage audit is the interview's one fixed structure — enforced at the boundary, never by prose |
| D4 | MENUS step text lists every `## Open Dimensions` entry marked `open` that lacks `interview-research/<key>.json` or a `## Picks` line `- <key>: …`, and names only those files as the reading list; `--mark menu-written --file <f>`: `<f>` must exist and parse with an `options` array, then the driver runs `node registry-check.js --menu <f> --write` and records `menus[<key>] = {registryExit, at}`; registry exits 0/1/3 are accepted (1 → the step re-print names the dropped labels; 3 → `⚠️ unverified`), exit 2 → the mark is refused with registry-check's stderr; `--mark menus-done`: every open dimension has both a menu file and a pick line, else exit 2 naming the missing keys (AC-20260825-04-3) | The driver owns the deterministic invocation the command used to narrate (spec 03 D7) |
| D5 | `--mark decided`: `stack-descriptor.json` exists with the template's required keys (`archetype`, `language`, `framework`, `packageManager`, `testRunner`, `linter`, `typechecker`, `gateCommand`, `scaffoldCommand`, non-empty `decisionRecords`); every `decisionRecords[]` path exists and contains a `## Dissents` heading followed by at least one non-blank line before the next heading or EOF; every `## Open Dimensions` key (open or constrained) is named — as a backticked literal — in at least one listed ADR; any failure → exit 2 naming the first offender; success flips `architect: decisions-recorded` (AC-20260825-04-4) | The decision record's closure is checkable: descriptor complete, dissents present, every dimension decided somewhere |
| D6 | SCAFFOLD (driver-only, runs on the invocation after `decided`): runs the descriptor's `scaffoldCommand` via `bash -c` in `--root` unless `scaffold.exit === 0` is already recorded (idempotent); stdout+stderr to `.claude/genesis/scaffold.log`; records `scaffold: {exit, at}`; exit ≠ 0 → step `SCAFFOLD_RED` with the log tail and remedy ("fix the command in stack-descriptor.json, delete the scaffold key, re-run"); exit 0 → SKELETON, whose step text is the test/CI/runtime-substrate list (moved verbatim from architect Phase B item 2 into `genesis.md`); `--mark skeleton-landed` records the mark (judgment-owned artifacts, no driver verification beyond the mark) (AC-20260825-04-5) | The create-* run and its exit code are deterministic facts the session used to narrate |
| D7 | GATE (driver-only): runs `gateCommand` via `bash -c` in `--root`, log to `.claude/genesis/gate.log`, records `zeroDayGate: {exit, at}`; exit 0 → `architect: scaffold-complete`, `gateCommand` copied into `status.json`, state ROADMAP; exit ≠ 0 → state `GATE_RED` printing the log tail and remedy ("fix scaffold-level issues only, then re-run — the gate re-executes, the scaffold does not") (AC-20260825-04-5, AC-20260825-04-6) | The zero-day gate is the one executed check genesis has always had — now it cannot be skipped or hand-reported |
| D8 | `--mark roadmap-written`: `docs/roadmap/00-overview.md` exists; ≥1 `docs/roadmap/NN-*.md` exists; every brief has `Phase:` and `Depends on:` header lines before its first `## `; the `Depends on:` graph has no cycle; else exit 2 naming the offender; success → HANDOFF, whose step text prints the report inputs: archetype, resolved gate, ADR count, brief count, and `next: /spec:genesis-explore <idea>` when `stack-descriptor.designCatalog` is neither absent nor `"none"`, else `next: /spec:init` (AC-20260825-04-7) | Roadmap shape is the one thing that makes the pipeline invocable after setup |
| D9 | **Checkpoint contract:** every accepted `--mark` prints, as its last line, `✅ checkpoint — genesis state saved (<prev> → <next>); safe to /clear and re-run /spec:genesis`; every step text opens with `Read only:` followed by the files that step needs (never the whole `.claude/genesis/` dir) (AC-20260825-04-2, AC-20260825-04-3) | JJ 2026-08-25: one command is only better if every step is re-enterable from disk and the user knows when |
| D10 | `spec/templates/status.json`: `schemaVersion: 2`; adds `marks: {}`, `menus: {}`, `scaffold: null`, `zeroDayGate: null`; existing keys unchanged; a v1 file on disk is read as-is (missing keys default) and rewritten as v2 on the first accepted mark (AC-20260825-04-1) | Additive; explore/design and the hook read only the `architect`/`explore`/`design` enums |
| D11 | New `spec/commands/genesis.md` (frontmatter `description`, `argument-hint: <project idea — what you want to build, for whom>`); body ≤ 120 lines: Setup (`spec-paths shared-for genesis`, `shared-genesis`, `genesis-driver`, `wf-research`), the greenfield-only refusal, the driver loop protocol (run → execute the one step → `--mark` → re-run; dismissed question → STOP), per-state judgment pointers into `genesis.md` sections, and the HANDOFF report slots (architect Phase D's slots, `Chain:` bullet updated to `/spec:genesis → …`); `spec/commands/genesis-architect.md` is deleted; the ops-conventions ADR paragraph (Phase A item 2), the skeleton list (Phase B item 2), and the roadmap decomposition rules (Phase C items 1–4) move verbatim into `genesis.md` as `## Genesis: Ops Conventions ADR`, `## Genesis: Day-Zero Skeleton`, and `## Genesis: Roadmap Decomposition` (AC-20260825-04-9) | Command = thin shell; doctrine = invariants; net prose is a cut (the command's phase choreography dies) |
| D12 | `spec/scripts/genesis-state-gate.sh`: the `/spec:genesis-architect*` entry-point arm becomes `"/spec:genesis "*\|"/spec:genesis")` (exact command or command+space — executed 2026-08-25, A1: `/spec:genesis-explore idea` does NOT match it); the first `case` list adds the same pattern; nothing else changes (AC-20260825-04-8) | Critical hook surface; one arm renamed, behavior for explore/design/init byte-identical |
| D13 | `spec/bin/spec-paths`: key `genesis-driver) echo "$ROOT/scripts/genesis-driver.js"`, usage token, and `shared-for genesis)` = the former `genesis-architect)` section list (the `genesis-architect)` entry is removed); `spec/entrypoints.json`: row `spec/scripts/genesis-driver.js` → `["spec/commands/genesis.md"]`; `registry-check.js`'s entry points become `["spec/scripts/genesis-driver.js", "spec/commands/genesis-design.md", "spec/commands/genesis-explore.md"]`; `wf-research.js`'s replace `genesis-architect.md` with `genesis.md` (AC-20260825-04-9) | New-surface checklist |
| D14 | Name sweep: `spec/doctrine/core.md` line 8's chain, `spec/doctrine/genesis.md`'s read-by line and its "architect Phase C" roadmap sentence, `spec/templates/roadmap-overview.md`'s authoring comment, `spec/commands/genesis-explore.md` and `genesis-design.md` predecessor mentions, `README.md`'s genesis block and command table (`/spec:genesis "…"` + explore + design + init) all say `/spec:genesis`; `spec/templates/grounding-contract.md` line 131 keeps `/spec:genesis-architect` — a wording edit would re-stamp every host (rules § Risk Tiers) and is **waived** until the next genuine contract change [no-ac: sweep; AC-9's literal ban covers the plugin files that matter] | One binding home for the command name; the contract hash is not paid for a word |
| D15 | Regression pins: the hook continues to block `/spec:genesis-explore` at `architect: pending` and `/spec:genesis-design` at `explore: tiles-culled`, and to pass `/spec:init` at `design: rules-locked` (AC-20260825-04-8); `spec-paths shared-for genesis-explore` continues to serve `## Design Canon` (AC-20260825-04-9) | A hook edit must be observed to change only what it names |
| D16 | Tests: `tests/genesis/genesis-driver.test.js` drives the real binary end-to-end against synthetic `tmpdir()` hosts with `--root` (fake `scaffoldCommand`/`gateCommand` shell lines, menus with `packages: []` so no network is touched); `tests/genesis-gate.test.js` gains the `/spec:genesis` cases; `tests/spec-paths.test.js` resolve list gains `genesis-driver` (in place); `tests/consistency/genesis-doctrine.test.js` gains AC-9 [no-ac: test-plumbing row] | Behavioral tests over synthetic hosts (rules § Test Rules) |
| D17 | New-surface checklist: `plugin.json` bump to next free 7.39.x with a changelog paragraph naming the driver, the one command, the checkpoint contract, and the deleted command [no-ac: plugin-version guard] | — |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/genesis-driver.js | CREATE | scripts | D1–D10 |
| spec/scripts/genesis-state-gate.sh | MODIFY | scripts | D12 entry-point arm |
| spec/bin/spec-paths | MODIFY | scripts | D13 key, usage token, `shared-for genesis` |
| spec/entrypoints.json | MODIFY | scripts | D13 rows |
| spec/commands/genesis.md | CREATE | doctrine | D11 thin shell |
| spec/doctrine/genesis.md | MODIFY | doctrine | D2 State Machine (driver-owned, checkpoint contract); D11 three migrated sections; D14 |
| spec/templates/status.json | MODIFY | doctrine | D10 |
| spec/templates/roadmap-overview.md | MODIFY | doctrine | D14 comment |
| spec/doctrine/core.md | MODIFY | doctrine | D14 chain line |
| spec/commands/genesis-explore.md | MODIFY | doctrine | D14 predecessor name |
| spec/commands/genesis-design.md | MODIFY | doctrine | D14 predecessor name |
| README.md | MODIFY | other | D14 genesis block |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D17 |
| tests/genesis/genesis-driver.test.js | CREATE | tests | AC-20260825-04-1, AC-20260825-04-2, AC-20260825-04-3, AC-20260825-04-4, AC-20260825-04-5, AC-20260825-04-6, AC-20260825-04-7 |
| tests/genesis-gate.test.js | MODIFY | tests | AC-20260825-04-8 |

Orchestrator duties outside the table: `git rm spec/commands/genesis-architect.md` before the
doctrine batch runs; `tests/spec-paths.test.js` resolve-all list gains `genesis-driver` and
`tests/consistency/genesis-doctrine.test.js` gains the AC-20260825-04-9 test (both edit-only
plumbing on files already in earlier siblings' plans — the orchestrator applies them in the
tests batch and names the file, never an invented ID).

## Contracts

Driver output shape (mirrors `spec-review-driver.js`):

```
[genesis-driver] state: MENUS  root: /path/to/project
(re-run this driver after completing the step; it verifies artifacts and prints the next one)

## Step: research and pick the open dimensions
Read only: .claude/genesis/brief.md (## Open Dimensions, ## Coverage), .claude/genesis/interview-research/hosting.json
open, no menu yet: hosting, background-jobs
open, menu written, no pick: persistence
…
```

Accepted mark, last line: `✅ checkpoint — genesis state saved (MENUS → DECIDE); safe to /clear and re-run /spec:genesis`

`status.json` v2:

```json
{
  "schemaVersion": 2,
  "architect": "pending", "explore": "pending", "design": "pending",
  "archetype": null, "localeScope": null,
  "stackDescriptorPath": ".claude/genesis/stack-descriptor.json",
  "designManifestPath": ".claude/genesis/design-rules.json",
  "gateCommand": null, "lastUpdated": null,
  "marks": {}, "menus": {}, "scaffold": null, "zeroDayGate": null
}
```

Exit codes: 0 = step printed / mark accepted · 2 = precondition failure or refused mark
(message names the repair) · any wrapped child dying with no exit code → 2 via `runChild`.
Never asserts a design or roadmap judgment.

`genesis-state-gate.sh` arms after D12 (excerpt):

```bash
case "$PROMPT" in
  "/spec:genesis "*|"/spec:genesis"|/spec:genesis-explore*|/spec:genesis-design*|/spec:init*) ;;
  *) exit 0 ;;
esac
case "$PROMPT" in
  "/spec:genesis "*|"/spec:genesis") exit 0 ;;   # entry point — owns its own re-entry
esac
```

## Behavior

- Cold invocation on a root with no `.claude/genesis/` → status created, DISCOVERY printed,
  nothing else written.
- Re-invocation without `--mark` always re-derives: a `discoveryDone` mark with a coverage key
  edited back to `dark` prints DISCOVERY again (and says why).
- SCAFFOLD/GATE run only on a bare invocation (no `--mark`) in that state; a second bare
  invocation after a green scaffold does not re-run the create command.
- `--state` output: exactly the state name and a newline.
- The greenfield-only refusal (source files beyond scaffold present → point at `/spec:init`)
  stays in the command: it is a judgment about "real codebase", not a file count.

## Acceptance Criteria

- **AC-20260825-04-1**: WHEN `genesis-driver.js --root <empty dir>` runs THE SYSTEM SHALL
  create `.claude/genesis/status.json` with `schemaVersion: 2` and the template's keys, print
  `state: DISCOVERY`, and `--state` SHALL print exactly `DISCOVERY` (e.g. an empty tmpdir →
  status file exists, stdout matches `/^\[genesis-driver\] state: DISCOVERY/`) →
  `tests/genesis/genesis-driver.test.js`
- **AC-20260825-04-2**: WHEN `--mark discovery-done` runs with a `brief.md` whose
  `## Coverage` has `- residency: dark` THE SYSTEM SHALL exit 2 with stderr naming `residency`;
  WHEN every key is `covered`/`n/a` THE SYSTEM SHALL exit 0, print a last line matching
  `/^✅ checkpoint — genesis state saved \(DISCOVERY → MENUS\); safe to \/clear/`, and the
  next bare run SHALL print `state: MENUS` with a first step line beginning `Read only:` →
  `tests/genesis/genesis-driver.test.js`
- **AC-20260825-04-3**: WHEN `## Open Dimensions` lists `hosting` (open) and `persistence`
  (constrained) THE SYSTEM SHALL list `hosting` as `open, no menu yet`; WHEN `--mark
  menu-written --file interview-research/hosting.json` runs on a menu whose options carry
  `packages: []` THE SYSTEM SHALL record `menus.hosting.registryExit === 0` and print the
  checkpoint line; WHEN `--mark menus-done` runs before a `- hosting: <label>` pick line exists
  THE SYSTEM SHALL exit 2 naming `hosting`, and after the pick line SHALL exit 0 and advance to
  DECIDE → `tests/genesis/genesis-driver.test.js`
- **AC-20260825-04-4**: WHEN `--mark decided` runs with a descriptor lacking
  `scaffoldCommand`, or an ADR whose `## Dissents` section is empty, or an open dimension
  `hosting` named in no ADR THE SYSTEM SHALL exit 2 naming the first offender (`scaffoldCommand`
  / the ADR path / `hosting`); WHEN all three hold THE SYSTEM SHALL set `architect:
  decisions-recorded` and advance to SCAFFOLD → `tests/genesis/genesis-driver.test.js`
- **AC-20260825-04-5**: WHEN the bare run reaches SCAFFOLD with `scaffoldCommand: "touch
  scaffolded.txt"` THE SYSTEM SHALL execute it in `--root` (the file exists afterwards), record
  `scaffold.exit === 0`, write `.claude/genesis/scaffold.log`, and print SKELETON; a second
  bare run SHALL NOT re-execute it (delete the file → still absent after the run) →
  `tests/genesis/genesis-driver.test.js`
- **AC-20260825-04-6**: WHEN `--mark skeleton-landed` is accepted and `gateCommand` is `exit 1`
  THE SYSTEM SHALL record `zeroDayGate.exit === 1`, print `state: GATE_RED` with the log tail
  and the remedy, and leave `architect: decisions-recorded`; WHEN `gateCommand` is `exit 0` THE
  SYSTEM SHALL set `architect: scaffold-complete`, copy `gateCommand` into `status.json`, and
  print ROADMAP → `tests/genesis/genesis-driver.test.js`
- **AC-20260825-04-7**: WHEN `--mark roadmap-written` runs with two briefs whose `Depends on:`
  lines form a cycle (`01` → `02` → `01`) THE SYSTEM SHALL exit 2 naming the cycle; WHEN the
  roadmap is acyclic and `00-overview.md` exists THE SYSTEM SHALL print HANDOFF containing
  `next: /spec:init` for `designCatalog: "none"` and `next: /spec:genesis-explore` for
  `designCatalog: "storybook"` → `tests/genesis/genesis-driver.test.js`
- **AC-20260825-04-8**: WHEN the hook receives `/spec:genesis idea` or `/spec:genesis` with
  any `status.json` THE SYSTEM SHALL exit 0 with empty stderr; and it SHALL CONTINUE TO exit 2
  for `/spec:genesis-explore idea` at `architect: pending`, exit 2 for `/spec:genesis-design
  idea` at `explore: tiles-culled`, and exit 0 for `/spec:init` at `design: rules-locked` →
  `tests/genesis-gate.test.js`
- **AC-20260825-04-9**: WHEN `spec-paths genesis-driver` runs THE SYSTEM SHALL print an
  existing path; `spec-paths shared-for genesis` SHALL emit `## Host Grounding` and `## Question
  Style`; `spec/commands/genesis-architect.md` SHALL NOT exist; `spec/commands/genesis.md` SHALL
  exist with ≤ 120 lines; `spec/doctrine/genesis.md` SHALL contain the headings `## Genesis: Ops
  Conventions ADR`, `## Genesis: Day-Zero Skeleton`, `## Genesis: Roadmap Decomposition`; and
  none of `README.md`, `spec/doctrine/core.md`, `spec/doctrine/genesis.md`,
  `spec/commands/genesis-explore.md`, `spec/commands/genesis-design.md`,
  `spec/templates/roadmap-overview.md` SHALL contain `genesis-architect`; and `spec-paths shared-for genesis-explore` SHALL CONTINUE TO emit
  `## Design Canon` → `tests/consistency/genesis-doctrine.test.js`

## Assumptions (escalation triggers)

- A1 (executed micro-spike 2026-08-25, bash `case`): patterns `"/spec:genesis "*|"/spec:genesis"`
  match `/spec:genesis idea` and `/spec:genesis`, and do NOT match `/spec:genesis-explore idea`
  (matched by its own arm) or `/spec:genesis-architect x` (falls to `*)`) — observed output
  `ONE-CMD / ONE-CMD / EXPLORE / OTHER` — **if false**: STOP, the hook edit is wrong by
  construction.
- A2: `jq` reads of `status.json` in the hook are unaffected by the v2 keys (additive JSON;
  the hook reads `.architect`, `.explore`, `.design`, `.stackDescriptorPath` only) — **if
  false** (a hook test reddens): the driver's v2 write is wrong, not the hook.
- A3: `spec-review-driver.js`'s `runChild`, `die`, step-print, and mark-dispatch shape is the
  template (read 2026-08-25); the genesis driver copies the shape, never `require`s the review
  driver — **if false** (a shared helper is wanted): lift it into `spec/scripts/lib/` in the
  same build with both callers, never a cross-require between two entry points.
- A4: The `## Open Dimensions` line grammar the driver parses is `- <key>: open|constrained
  [— note]` (spec 01's registry keys and spec 02's derived keys are lowercase-hyphenated);
  the `## Picks` grammar is `- <key>: <label>`; both are stated in `genesis-brief.md`'s section
  comments by this spec's doctrine row — **if false** (spec 02's build chose another grammar):
  the driver follows the template on disk; amend the template comment, never fork the grammar.
- A5: `bash -c` is the portable way to run `scaffoldCommand`/`gateCommand` strings (they are
  shell lines by contract — `bunx create-next-app@latest . --typescript --app`, `bun typecheck
  && bun lint && bun test`) — the idiom `smoke.sh` uses for `bootCommand`/`readyCheck`
  (executed 2026-08-25: `grep -n "bash -c" spec/scripts/smoke.sh` → lines 95, 116, 127, 129) —
  **if false**: STOP, ask the user.
- A6: No other plugin file names `genesis-architect` (executed 2026-08-25: `grep -rn
  genesis-architect spec/ README.md docs/canonical` → core.md:8, genesis.md:7 and :344,
  genesis-design.md:250 (rewritten by spec 01), grounding-contract.md:131 (waived, D14),
  roadmap-overview.md:3, README.md:40 and :99, the command file itself, explore/design Setup
  lines, `spec-paths` `shared-for` map, `entrypoints.json`, `wf-research.js` `meta.whenToUse`
  (reworded by spec 03 D6), `wf-panel.js` (deleted by spec 01)) — **if false**: add the row;
  never a stale reference.
- A7: Deleting `genesis-architect.md` does not break `tests/consistency/entrypoints.test.js`'s
  reverse-invocation direction (it checks every manifest entry point exists; D13 renames the
  entries) — **if false**: the build's whole-suite check names it; fix the manifest, never the
  test.

## Rationale

The three genesis commands each consume 30–40% of a context window today — not because there
are three, but because each re-reads ~600 lines of doctrine and phase prose before acting, and
then leans on chat context inside a phase, so a mid-phase `/clear` loses work. Merging the
commands without changing that would be worse (one 120% session). JJ's 2026-08-25 ruling is
therefore conditional: one command, **driver-stepped and `/clear`-safe** — the driver
re-derives state from disk on every invocation, prints one step with a `Read only:` list, and
tells the user when the state is saved. That conditional is D9, and it is a hard requirement
of this spec, not a nicety.

This spec drives the architect stage only. The explore and design commands stay as they are
(one name changes) because their fold into the driver depends on the tournament (brief 10a):
the tournament needs design tiles before the stack pick, which is what dissolves the
explore/architect boundary. Landing the driver first means 10a plans against real code.

The driver's checks are closure checks on artifacts, never judgments: dark coverage keys, a
menu file that parses, a descriptor with its required keys, an ADR with a non-empty Dissents
body, a dimension named somewhere, a roadmap with headers and no cycles. Each is a fact a
session used to narrate ("I wrote the ADRs") and can now not skip. The scaffold and gate
commands move into the driver because their exit codes are the two executed facts genesis has
always had and the only ones nothing verified were actually run.

Rejected: keeping `genesis-architect.md` as the shell name (the state gate would then need
two entry-point arms, and 10a renames anyway); a `wf-genesis.js` workflow (the harness cannot
ask questions inside a workflow — the interleave problem the deleted § Session ↔ Workflow Loop
existed to describe); having the driver run `init-gen` at HANDOFF (brief 10a's
conventions-first unit — genesis-is-init lands with the conventions probe suite, not before).

Retired-literal sweep at lock (by hand): `genesis-architect` (A6); `Phase 2 —`/`Phase 3 —`
architect phase names cited nowhere outside the deleted file (executed: `grep -rn "architect
Phase" spec/ docs/canonical` → `genesis-design.md` "Same loop as architect Phase 3" — rewritten
by spec 01 D6). `SHALL CONTINUE TO` pins: AC-8 (hook arms), AC-9 (explore's shared-for).

Collision-closure at lock (2026-08-25, `--literal genesis-architect --literal wf-panel`):
paths leg `likely` = 3 — `tests/consistency/entrypoints.test.js` (exhaustive live pin; the D13
rows are the add-a-member class, caught at build, no waive owed), `tests/consistency/red-fixture-coverage.test.js`
(its `genesis-state-gate.sh` handler plants `/spec:genesis-explore` at `architect: pending` —
an arm D12 leaves byte-identical; **waived**, AC-8's pin is the oracle),
`tests/host-config/config-read.test.js` (lexical `spec-paths`/`README.md` hit — **waived**);
literals leg — `specs/`, `docs/roadmap/`, `docs/audit/` waived by location;
`spec/templates/grounding-contract.md` waived per D14; every other plugin-file hit is a File
Plan row or an earlier sibling's.

## Canonical Delta

Append to `docs/canonical/genesis.md` a section *Driver (architect stage)*: *Since
specs/20260825/04 `/spec:genesis "<idea>"` is the greenfield entry point, looping on
`genesis-driver.js` (`spec-paths genesis-driver`): states DISCOVERY → MENUS → DECIDE →
SCAFFOLD → SKELETON → GATE → ROADMAP → HANDOFF, derived from `status.json` (schemaVersion 2)
plus on-disk artifacts on every invocation. The driver runs the coverage-audit gate, the
registry check per menu, the decision-record closure check, the scaffold command, the zero-day
gate, and the roadmap closure check; the session holds the interview, the picks, the ADRs, the
skeleton, and the roadmap decomposition. Every accepted mark prints `✅ checkpoint — … safe to
/clear`. `/spec:genesis-architect` is retired; `/spec:genesis-explore` and
`/spec:genesis-design` follow after HANDOFF until brief 10a folds them in.* Also add to
`docs/canonical/pipeline.md` § *Frontmatter has one reader*: unchanged (the genesis driver reads
`status.json`, never spec frontmatter).
