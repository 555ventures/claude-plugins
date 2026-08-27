---
date: 2026-08-27
status: hardened
tier: standard           # driver + templates + doctrine; no hook, no contract edit; init-gen.js is invoked, not edited
area: genesis
design: false
breaking: false
depends_on: [specs/20260827/03-genesis-design-state.md]
depended_on_by: []
brief: 10a
spiked: 2026-08-27
open_markers: 0
---

# Conventions first, genesis is init: the probe suite and the grounded handoff

## Goal

The primary artifact of the decision record becomes **what agents read and gates run**, not
ADRs: at `DECIDE` the session records every ops-conventions row in
`.claude/genesis/conventions.json` (DECIDED or DEFERRED-with-reason, checker-enforceable rows
naming their probe test), and at `SKELETON` it lands the **conventions probe suite** in the host's
own test tree plus a ≤150-line `CLAUDE.md`/`AGENTS.md` carrying the binding subset — so the
zero-day gate that follows executes the conventions forever. Then greenfield genesis **is**
init: the `HANDOFF` step has the session author the init profile from the descriptor, the
conventions, and the design canon, and the driver runs `init-gen.js generate` itself, landing
the repo grounded with `/spec:enforce` as the next command; `/spec:init` stays the brownfield
entry and the regeneration owner. Done means: the two closures and the generate run are
observed on synthetic hosts, a grounded host carries a stamped config, and the suite is green.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | New template `spec/templates/conventions.json`: `{schemaVersion: 1, testTree: "<dir>", rows: [{key, status: "DECIDED"\|"DEFERRED", enforceable: bool, probe: "<path>"\|null, reason: "<text>"\|null, adr: "<path>"}]}`; the floor keys (all required): `error-taxonomy`, `logging`, `naming-identifiers`, `wire-representations`, `cross-plane-constants`, `env-config`, `ci`, `background-async`, `success-metric`; derived rows (§ Ops Conventions ADR's derive pass) are extra entries with any kebab key (AC-20260827-04-1) | The ops ADR's table becomes machine-readable; the floor is genesis.md § Genesis: Ops Conventions ADR's rows verbatim |
| D2 | `--mark decided` additionally: `.claude/genesis/conventions.json` parses; every floor key is present; each row's `status` ∈ the enum; a `DEFERRED` row carries a non-empty `reason`; a `DECIDED` row carries boolean `enforceable`; an `enforceable: true` row carries a `probe` string beginning with `<testTree>/`; each row's `adr` exists; the first offender is named with the key; the ops ADR remains a listed decision record (D5 of specs/20260825/04 unchanged) (AC-20260827-04-1) | Each row is DECIDED or DEFERRED-with-reason — the same ledger discipline as the design canon, now enforced at the boundary |
| D3 | `--mark skeleton-landed` additionally: every `enforceable` `DECIDED` row's `probe` file exists and is non-empty (refusal names the key and path); a root `CLAUDE.md` or `AGENTS.md` exists, is ≤ 150 lines, and contains the descriptor's `gateCommand` and the `testTree` value as literals (refusal names the file, the line count, or the missing literal); the zero-day gate that the mark triggers is unchanged — it runs the host's tests, which now include the probes (AC-20260827-04-2) | Conventions beat typing as the agent lever only when enforced; a convention nobody re-runs is prose; the binding subset must be where agents actually read |
| D4 | HANDOFF becomes a judgment step: `Read only: spec/commands/init.md (Phase 4 — the profile schema), <descriptor>, .claude/genesis/conventions.json, .claude/genesis/design-rules.json (when present), docs/adr/`; the session authors `.claude/genesis/init-profile.json` (init.md Phase 4's shape; `config.genesisStackDescriptor` and `design.rulesManifest` set from the genesis artifacts; `manifestExtras` claiming the skeleton's substrate and the probe suite); `--mark profile-written --file <f> [--refresh]`: `<f>` parses as JSON; the driver runs `node <init-gen.js> generate --root <root> --profile <f> [--refresh]` through `runShell` (stdout+stderr streamed to `.claude/genesis/init-gen.log`); exit 0 → `status.handoff = {initGenExit: 0, at}`, state `GROUNDED` (terminal) whose step text prints the report inputs (archetype, resolved gate, ADR count, probe count, brief count) and `next: /spec:enforce`; any other exit → the mark is refused (exit 2) with the log tail and a remedy keyed on the code: 1 `fix the manifest row init-gen.log names, re-mark`; 2 `fix the profile field it names, re-mark`; 3 `fold the hand edits into the profile and re-mark with --refresh`; 4 `re-mark (internal error, never a verdict)` (AC-20260827-04-3, AC-20260827-04-4) | Brief 10a: greenfield genesis IS init + enforce — the driver runs the generator the way `/spec:init` Phase 5 does; the profile is judgment content the session authors with the context hot |
| D5 | `spec/commands/genesis.md`: the report's `outcome` becomes `✅ architected + grounded — scaffold green, {N} ADRs, {P} convention probes, roadmap of {M} briefs`; the chain bullet becomes `Chain: /spec:genesis → /spec:atlas sweep + your holistic atlas review → /spec:enforce → /spec:plan docs/roadmap/01-*.md` (design-skipped archetypes drop the atlas link); `next` is `{kind: 'command', text: '/spec:enforce'}`; a one-line note that `/spec:init` is the brownfield entry and that re-running it on a genesis-grounded repo is a refresh (`init-gen generate --refresh`). `spec/commands/init.md` gains one sentence to the same effect at the top of Phase 5; `spec/doctrine/core.md` line 9's chain says genesis's HANDOFF grounds greenfield repos and `/spec:init` grounds brownfield ones; `README.md`'s greenfield block ends at `/spec:enforce` (AC-20260827-04-5) | The chain a user reads must match the states the driver runs |
| D6 | `spec/doctrine/genesis.md`: new `## Genesis: Conventions Probe Suite` — one executable test per checker-enforceable DECIDED row, living in the host test tree the gate runs; DEFERRED rows carry their reason; the ≤150-line `CLAUDE.md`/`AGENTS.md` binding subset (the gate command, lint/test entry points, the conventions the probes pin, the enforcement manifest's path once `/spec:enforce` writes it) is the primary artifact and ADRs are its rationale appendix (Dissents kept); § Day-Zero Skeleton gains the probe-suite and binding-subset bullets; § State Machine gains `GROUNDED`; § On-disk Handoff gains `conventions.json`, `init-profile.json`, `init-gen.log`; § Enforcement Handoff says the HANDOFF state runs `init-gen generate` (AC-20260827-04-5) | Doctrine = invariants; the driver = execution |
| D7 | `spec/templates/status.json` gains `handoff: null` (AC-20260827-04-3) | Additive, schemaVersion unchanged |
| D8 | Regression pins: `--mark decided` SHALL CONTINUE TO refuse an ADR with an empty `## Dissents`; `--mark skeleton-landed` SHALL CONTINUE TO refuse before a green scaffold; HANDOFF SHALL CONTINUE TO print `archetype:`, `resolved gate:`, `ADR count:`, `brief count:` (AC-20260827-04-6) | The closures are additive — the earlier checks must be observed intact |
| D9 | Tests: `tests/genesis/conventions-handoff.test.js` (new, real driver; the exit-0 generate case reuses the profile shape of `tests/init-gen/generate.test.js`'s `baseProfile()` against a `gitRepo()` host — Assumptions A1); `tests/genesis/genesis-driver.test.js`'s AC-20260825-04-7 HANDOFF pin gains the profile-step expectation in place; `tests/consistency/genesis-doctrine.test.js` gains AC-5 [no-ac: test-plumbing row] | Behavioral tests; pins tagged onto existing tests |
| D10 | `spec/.claude-plugin/plugin.json` bumps to the next free 7.40.x with a changelog paragraph naming the conventions closure, the probe suite, the binding subset, and genesis-is-init [no-ac: plugin-version guard] | — |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/genesis-driver.js | MODIFY | scripts | D2–D4 |
| spec/templates/conventions.json | CREATE | doctrine | D1 |
| spec/templates/status.json | MODIFY | doctrine | D7 |
| spec/doctrine/genesis.md | MODIFY | doctrine | D6 |
| spec/commands/genesis.md | MODIFY | doctrine | D5 |
| spec/commands/init.md | MODIFY | doctrine | D5 one sentence |
| spec/doctrine/core.md | MODIFY | doctrine | D5 chain line |
| README.md | MODIFY | other | D5 |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D10 |
| tests/genesis/conventions-handoff.test.js | CREATE | tests | AC-20260827-04-1, AC-20260827-04-2, AC-20260827-04-3, AC-20260827-04-4 |
| tests/genesis/genesis-driver.test.js | MODIFY | tests | AC-20260827-04-6 (pins tagged onto the AC-20260825-04-4/-6/-7 tests; the -7 HANDOFF fixture expects the profile step) |
| tests/consistency/genesis-doctrine.test.js | MODIFY | tests | AC-20260827-04-5 |

## Contracts

States after this spec: … → `ROADMAP` → [`DESIGN`] → `HANDOFF` → `GROUNDED` (terminal). Mark
added: `profile-written --file <f> [--refresh]`.

`spec/templates/conventions.json`:

```json
{
  "schemaVersion": 1,
  "testTree": "tests",
  "rows": [
    { "key": "error-taxonomy", "status": "DECIDED", "enforceable": true, "probe": "tests/conventions/error-taxonomy.test.ts", "reason": null, "adr": "docs/adr/0002-operational-conventions.md" },
    { "key": "logging", "status": "DECIDED", "enforceable": true, "probe": "tests/conventions/logging.test.ts", "reason": null, "adr": "docs/adr/0002-operational-conventions.md" },
    { "key": "naming-identifiers", "status": "DECIDED", "enforceable": true, "probe": "tests/conventions/naming.test.ts", "reason": null, "adr": "docs/adr/0002-operational-conventions.md" },
    { "key": "wire-representations", "status": "DECIDED", "enforceable": true, "probe": "tests/conventions/wire.test.ts", "reason": null, "adr": "docs/adr/0002-operational-conventions.md" },
    { "key": "cross-plane-constants", "status": "DECIDED", "enforceable": true, "probe": "tests/conventions/cross-plane.test.ts", "reason": null, "adr": "docs/adr/0002-operational-conventions.md" },
    { "key": "env-config", "status": "DECIDED", "enforceable": false, "probe": null, "reason": null, "adr": "docs/adr/0002-operational-conventions.md" },
    { "key": "ci", "status": "DECIDED", "enforceable": false, "probe": null, "reason": null, "adr": "docs/adr/0002-operational-conventions.md" },
    { "key": "background-async", "status": "DEFERRED", "enforceable": false, "probe": null, "reason": "none-in-v1 — no unattended work in the brief", "adr": "docs/adr/0002-operational-conventions.md" },
    { "key": "success-metric", "status": "DEFERRED", "enforceable": false, "probe": null, "reason": "not measured in v1", "adr": "docs/adr/0002-operational-conventions.md" }
  ]
}
```

`status.handoff`: `{ "initGenExit": 0, "at": "<ISO-8601>" }`.

Step-text excerpts:

```
## Step: handoff — author the init profile; the driver grounds the repo
Read only: spec/commands/init.md (Phase 4 — the profile schema), .claude/genesis/stack-descriptor.json, .claude/genesis/conventions.json, .claude/genesis/design-rules.json, docs/adr/
Doctrine: spec/doctrine/genesis.md § Genesis: Enforcement Handoff to the spec pipeline
Write .claude/genesis/init-profile.json, then:
  node …/genesis-driver.js --root <root> --mark profile-written --file .claude/genesis/init-profile.json
```

```
[genesis-driver] state: GROUNDED  root: <root>

## Step: grounded — genesis is complete
Read only: .claude/spec.config.json, docs/roadmap/00-overview.md
archetype: web-app · resolved gate: … · ADR count: 4 · convention probes: 5 · brief count: 6
next: /spec:enforce
```

Refused `profile-written` (exit 2), stderr excerpt:

```
genesis-driver: init-gen generate exited 2 — fix the profile field it names, then re-mark profile-written:
… truncated, full log at .claude/genesis/init-gen.log …
init-gen: profile is missing required field "config.gateCommand" — …
```

## Behavior

- `conventions.json` is authored at `DECIDE` alongside the ops ADR; a row's `adr` normally
  points at that ADR. The driver never reads the ADR table itself — the JSON is the record.
- `probe` paths are checked for existence at `skeleton-landed`, not at `decided` (they are
  landed with the skeleton).
- The binding-subset file check accepts either `CLAUDE.md` or `AGENTS.md`; when both exist,
  either satisfying the check passes.
- `profile-written` on a host where `.claude/spec.config.json` already exists and differs →
  `init-gen` exits 3 and the remedy names `--refresh`; the mark re-run with `--refresh` passes
  the flag through.
- `--state` may report `HANDOFF` or `GROUNDED`; it never runs the generator (F3's peek
  contract).
- The genesis hook's init arm is untouched: `/spec:init` on a grounded repo passes at
  `design: rules-locked|skipped` and runs init's refresh path.

## Acceptance Criteria

- **AC-20260827-04-1**: WHEN `--mark decided` runs with no `conventions.json` THE SYSTEM SHALL
  exit 2 naming `conventions.json`; with the `logging` row missing → naming `logging`; with a
  `DEFERRED` row whose `reason` is empty → naming that key and `reason`; with an `enforceable`
  row whose `probe` is `src/x.test.ts` under `testTree: "tests"` → naming that key and
  `tests/`; WHEN every floor row is valid THE SYSTEM SHALL exit 0 and advance to `SCAFFOLD`
  (the template file itself SHALL pass the same validation) → `tests/genesis/conventions-handoff.test.js`
- **AC-20260827-04-2**: WHEN `--mark skeleton-landed` runs with an enforceable row's probe
  file absent THE SYSTEM SHALL exit 2 naming the key and the path; with the probe present but
  no `CLAUDE.md`/`AGENTS.md` → naming `CLAUDE.md`; with a 151-line `CLAUDE.md` → naming `151`;
  with a `CLAUDE.md` lacking the `gateCommand` literal → naming `gateCommand`; WHEN all hold
  THE SYSTEM SHALL accept the mark and run the zero-day gate exactly as before (a `gateCommand`
  of `exit 0` → `architect: scaffold-complete`) → `tests/genesis/conventions-handoff.test.js`
- **AC-20260827-04-3**: WHEN the bare run reaches `HANDOFF` THE SYSTEM SHALL print a step
  naming `init-profile.json` and `--mark profile-written`; WHEN `--mark profile-written --file
  f` runs with `{}` THE SYSTEM SHALL exit 2 with stderr containing `exited 2`, `config.gateCommand`,
  and `.claude/genesis/init-gen.log`, write that log, and leave `status.handoff` null; `--state`
  SHALL print `HANDOFF` → `tests/genesis/conventions-handoff.test.js`
- **AC-20260827-04-4**: WHEN `--mark profile-written --file f` runs with a valid profile
  (`baseProfile()` shape) on a git-initialised root THE SYSTEM SHALL exit 0, write
  `.claude/spec.config.json` carrying `generatedBy` and `contractHash`, record
  `handoff.initGenExit === 0`, print the checkpoint `(HANDOFF → GROUNDED)`, and the next bare run
  SHALL print `state: GROUNDED` with `next: /spec:enforce` and `convention probes: <n>`; WHEN
  the mark is re-run without `--refresh` after the config was hand-edited THE SYSTEM SHALL exit 2
  naming `--refresh` → `tests/genesis/conventions-handoff.test.js`
- **AC-20260827-04-5**: `spec/doctrine/genesis.md` SHALL contain `## Genesis: Conventions
  Probe Suite`; `spec/commands/genesis.md` SHALL contain `/spec:enforce` in its chain bullet
  and SHALL NOT contain `next: /spec:init` or `text: '/spec:init'`; `spec/templates/status.json`
  SHALL carry `handoff`; `spec/templates/conventions.json` SHALL parse with the nine floor keys →
  `tests/consistency/genesis-doctrine.test.js`
- **AC-20260827-04-6**: WHEN `--mark decided` runs with an ADR whose `## Dissents` is empty
  THE SYSTEM SHALL CONTINUE TO exit 2 naming that ADR; WHEN `--mark skeleton-landed` runs before
  the scaffold recorded `exit: 0` THE SYSTEM SHALL CONTINUE TO exit 2; WHEN HANDOFF prints THE
  SYSTEM SHALL CONTINUE TO print `archetype:`, `resolved gate:`, `ADR count:`, `brief count:` →
  `tests/genesis/genesis-driver.test.js` (tagged onto the AC-20260825-04-4/-6/-7 tests)

## Assumptions (escalation triggers)

- A1 (executed micro-spike 2026-08-27, S5): `init-gen.js generate --root <dir> --profile
  <{}>` exits 2 with `profile is missing required field "config.gateCommand"` on stderr — the
  refusal shape D4's remedy quotes; and `tests/init-gen/generate.test.js`'s `baseProfile()`
  against a `gitRepo()` host generates green (that suite's AC-20260822-02-1, green at HEAD) —
  the AC-4 fixture copies that shape (`runtime.inert`, two agents, empty `manifestExtras`)
  and the genesis host under test is `gitRepo()`-initialised — **if false**: STOP, the
  generator contract moved.
- A2: `runShell` streams to the log fd (specs/20260825/04 F6) — `init-gen`'s output can never
  overflow a pipe; `logTail`'s byte bound applies to the refusal excerpt — **if false**:
  the F6/F7 tests name it.
- A3: `init-gen generate` on a genesis-grounded root finds the design canon through
  `config.genesisStackDescriptor` + `design.rulesManifest` in the profile (init.md Phase 6's
  consume arm) and needs no `.claude/genesis/status.json` read of its own (read 2026-08-27:
  `init-gen.js` never reads `status.json`) — **if false**: the profile carries the extra key
  the generator wants; never a second reader of `status.json`.
- A4: the zero-day gate command runs the host's test tree (it is the descriptor's own
  `gateCommand`, e.g. `bun test`), so probes under `testTree` execute in it — the driver checks
  location, not inclusion — **if false** (a host gate that skips its own test dir): the ops ADR's
  `ci` row is wrong; the session fixes the gate, never the check.
- A5: `manifest-check.sh` accepts `manifestExtras` `file` rows for the probe files and the
  binding-subset file — **if false**: the profile omits them; the driver's own `skeleton-landed`
  check already verified their existence.

## Rationale

The rest of brief 10 unit D′. Two things change and both are closures the driver can own.
First, the ops-conventions table stops being a paragraph in an ADR nobody re-runs: each row is
DECIDED or DEFERRED-with-reason in a JSON the driver validates, and every checker-enforceable
DECIDED row names an executable probe that lives in the host's own test tree — the default
brief 10 left open, taken: a convention nobody re-runs is prose. The binding subset agents
actually read (`CLAUDE.md`/`AGENTS.md`, ≤150 lines, naming the gate and the test tree) is
checked for existence and size, not content — content is judgment. Second, the handoff: after
the roadmap and the design canon, everything `/spec:init` would profile is already hot in the
session, so the driver runs `init-gen generate` on a session-authored profile and hands to
`/spec:enforce`, exactly the way init's Phase 5/8 do. `/spec:init` keeps brownfield and refresh.

**What is not checked** (and why): whether the gate *includes* the probes (A4 — location is
checkable, inclusion is a property of the host's gate command); whether `CLAUDE.md`'s content
is the right subset (judgment); whether `enforcement.json` is named (it does not exist until
`/spec:enforce` runs — the doctrine names it as the path to add then).

**Rejected:** deriving the profile mechanically from `stack-descriptor.json` (init.md's Phase
4 shape carries six rule sections, agents, skills, and sweeps — judgment content, not
derivable; the brief's "derived from" reads as "authored from"); having the driver invoke
`/spec:enforce` (a command, not a script — the harness runs it; the driver prints it as
`next`); a second `status.json` reader in `init-gen` (A3).

Collision-closure at lock (2026-08-27, `--literal "next: /spec:init"`, `unplanned=10
likely=2`): paths leg `likely` — `tests/consistency/red-fixture-coverage.test.js` (a lexical
hit on `spec/doctrine/core.md`, whose chain sentence changes; a `likely` hit owes no waive line
per § Gotchas) and `tests/consistency/genesis-doctrine.test.js` (row). Literals leg — the
HANDOFF literal lives in `spec/scripts/genesis-driver.js` (row); it is also asserted by
`tests/genesis/genesis-driver.test.js` AC-20260825-04-7 (row, updated in place) and by spec 03's
`tests/genesis/design-state.test.js` AC-20260827-03-5 once that spec lands — the build's
whole-suite check names it and the pin is retargeted in place, never weakened (recorded here so
the collision is expected, not discovered). Nothing waived. `SHALL CONTINUE TO` pins: AC-6.

## Canonical Delta

Append to `docs/canonical/genesis.md` § *Driver (the whole greenfield path)*: *Since
specs/20260827/04 `decided` also validates `.claude/genesis/conventions.json` (the nine ops
floor rows DECIDED or DEFERRED-with-reason; enforceable rows name a probe under `testTree`),
`skeleton-landed` requires every enforceable probe file and a ≤150-line `CLAUDE.md`/`AGENTS.md`
naming the gate command and the test tree, and `HANDOFF` is a judgment step: the session authors
`.claude/genesis/init-profile.json` (init.md Phase 4's shape) and `--mark profile-written` has
the driver run `init-gen.js generate` (log at `.claude/genesis/init-gen.log`, remedies keyed on
its exit code, `--refresh` passed through), landing the terminal state `GROUNDED` with
`next: /spec:enforce`. Greenfield genesis is init + enforce; `/spec:init` is the brownfield
entry and the regeneration owner.* Add to `docs/canonical/bootstrap.md` § *The two
subcommands*: *`generate` is also invoked by `genesis-driver.js` at genesis's HANDOFF
(specs/20260827/04) — same profile, same exit codes, same stamp ordering.*
