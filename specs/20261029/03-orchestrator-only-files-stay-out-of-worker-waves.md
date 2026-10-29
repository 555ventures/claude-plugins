---
date: 2026-10-29
status: hardened
tier: critical
area: build
breaking: false
depends_on: []
brief: n/a
open_markers: 0
spiked: 2026-10-29
---

# Orchestrator-only files stay out of worker waves

## Goal

A host can list the files that only the orchestrator may change. The build driver then keeps
those files out of every worker dispatch — in the wave steps and in the repair step — and
prints them as lines the orchestrator applies itself. Today the driver routes every File Plan
row by layer alone, so a file the host forbids workers to touch still lands in a worker's file
list (zubu-backend spec `specs/20261021/02-auth-middleware-real-401s.md`, review
`rv_5f5596b21c43`: a persistence worker edited `src/zubu/mappers.py`, a hard finding, fix commit
`c31f4e5`). Done means: a host that declares the list never sees one of its files in a worker's
batch, and a host that does not declare it builds exactly as today.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | The machine-readable list lives in one new optional config key, `orchestratorOnly`: an array of repo-relative path globs in `lib/glob-match.js` syntax (`**` any run of segments, `*` within one segment, everything else literal — no braces). The grounding contract's § Required config keys documents it among the optional keys (AC-20261029-03-1, AC-20261029-03-7) | The § Worker Rules prose mixes backticks, brace groups and phrases like "anything in alembic/versions/" — a parser that silently misses one entry repeats the incident; config is where `layerGroups`/`agentMap` routing already lives (rejected: parsing § Worker Rules prose) |
| D2 | A File Plan row path is orchestrator-only when `globMatch(g, path)` is true for at least one glob `g` in `orchestratorOnly`, matched against the row's path string exactly as the File Plan writes it (a glob row path is matched as a string) (AC-20261029-03-1) | One matcher (`lib/glob-match.js`), never a private one; a glob row like `alembic/versions/*.py` still matches the host's `alembic/versions/**` |
| D3 | Orchestrator-only rows stay in their own wave (wave membership and order unchanged). The WAVE step prints them in an `orchestrator` block after the worker dispatch lines, never inside a `layer:` worker block; the block's instruction line tells the orchestrator to change each file through its route in pipeline rules § Worker Rules — before dispatch when a worker's files depend on it, otherwise after the workers return. Format per Contracts (AC-20261029-03-1) | Keeps build order: zubu's api-wave tests exercised the `main.py` change, so moving the row after all waves (the integration step) would have workers build against the old file (rejected: a separate post-wave step) |
| D4 | A layer whose every path in the wave is orchestrator-only gets no `layer:` block; a wave whose every path is orchestrator-only prints the header `## Step: wave <label> — orchestrator rows only, spawn no worker` and its `Then:` line keeps the existing `--mark wave-done --wave <label> --workers <n>` form, accepting `--workers 0` (AC-20261029-03-2) | A wave with nothing to dispatch must not ask for a spawn; `--workers 0` is already a legal mark |
| D5 | `--mark wave-done` keeps verifying every row of the wave, orchestrator-only rows included, through the unchanged `verifyWaveRows` (AC-20261029-03-3) | Filtering only changes who edits a file, never whether the driver checks it landed |
| D6 | The REPAIR step's per-layer routing lines list only worker-owned paths (a wave label with none is omitted), and one extra line follows them: `orchestrator-owned — fix these yourself, never route them to a worker: <paths, comma-separated>`; the line is absent when no row is orchestrator-only (AC-20261029-03-4) | A red gate otherwise routes the failing orchestrator file back to a worker — the same bug one step later |
| D7 | `orchestratorOnly` absent → every row routes by layer exactly as today, byte-for-byte (AC-20261029-03-5) | Fail-open on an undeclared key: hosts adopt it through `/spec:doctor`, not a broken build |
| D8 | `orchestratorOnly` present but not an array of strings → every driver invocation exits 2 with stderr `spec-build-driver: orchestratorOnly in .claude/spec.config.json must be an array of path globs (got <JSON of the value>) — fix it, or remove the key to route every row by layer`, state unchanged (AC-20261029-03-6) | A declared-but-malformed key is the host trying to protect files; ignoring it silently would hand them to workers |
| D9 | Only the WAVE and REPAIR steps change. Tests-layer, baseline and replay rows keep their current handling [no-ac: no step besides WAVE and REPAIR hands non-tests File Plan rows to a worker (Assumption A4); a test file on an orchestrator-only list is not a shape any host declares] | Narrowest change that closes the incident |
| D10 | core.md § Read-Only Surfaces gains one sentence pointing at `orchestratorOnly` as the machine-readable home of the orchestrator-only subset; the prose in § Worker Rules keeps the change routes [no-ac: doctrine prose; the routing it describes is pinned by AC-20261029-03-1..6] | One binding home per rule (core § Doctrine Authoring): the contract defines the key, core points at it |
| D11 | `/spec:doctor` check 5 gains one advisory: when the host's § Worker Rules names surfaces workers must never edit and the config has no `orchestratorOnly`, or names one no `orchestratorOnly` glob matches, flag it — "the build driver hands these files to workers; add them to orchestratorOnly" [asked: the user's /spec:plan brief directed "/spec:doctor warns when § Worker Rules names read-only surfaces but the key is absent", 2026-10-29] [no-ac: an LLM-run advisory line in doctor.md; no script surface to execute] | Existing hosts get the stale-contract warning (A3) and land in doctor, which then names the missing key |
| D12 | The spec plugin's version bumps via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` [no-ac: `plugin-bump.js --check` in the gate is the oracle] | Behavior change (pipeline rules § Planning) |
| D13 | This repo's `.claude/spec.config.json` `contractHash` is re-stamped to the new `spec-paths contract-hash` output in the same change as the contract edit (AC-20261029-03-7) | The contract-stamp pin fails otherwise |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/spec-build-driver.js | MODIFY | scripts | D2–D8: read and validate `orchestratorOnly`; split each wave's paths into worker and orchestrator sets in `waveStepBody`; orchestrator line in `repairStepBody`; header comment names the key and the new exit-2 refusal |
| spec/templates/grounding-contract.md | MODIFY | doctrine | D1: `orchestratorOnly` added to the optional keys of § Required config keys (the one contract edit this spec makes) |
| spec/doctrine/core.md | MODIFY | doctrine | D10: one sentence in § Read-Only Surfaces |
| spec/commands/doctor.md | MODIFY | doctrine | D11: the advisory in check 5 |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D12: `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` |
| .claude/spec.config.json | MODIFY | other | D13: `contractHash` re-stamped to `spec-paths contract-hash` output |
| tests/build/build-driver-orchestrator-only.test.js | CREATE | tests | AC-20261029-03-1, AC-20261029-03-2, AC-20261029-03-3, AC-20261029-03-4, AC-20261029-03-5, AC-20261029-03-6 |
| tests/consistency/contract-stamp.test.js | MODIFY | tests | AC-20261029-03-7 — retag the reused AC-20260912-15-8 pin's title with this AC-ID, assertion unchanged |

## Contracts

Config key (grounding contract, optional):

```jsonc
"orchestratorOnly": ["main.py", "src/zubu/mappers.py", "alembic/versions/**"]
```

WAVE step body — a wave with one worker path and one orchestrator path (worker block unchanged
from today; the orchestrator block is new and printed after every `layer:` block):

```
## Step: wave api — spawn one long-lived Agent {model: sonnet} per layer above and KEEP it
  layer: api  agent: api-routers
    {"path":"src/zubu/api/dependencies.py","action":"MODIFY"}
  orchestrator — never in a worker's file list; change each through its route in pipeline rules § Worker Rules, before dispatch when a worker's files depend on it, else after the workers return:
    {"path":"main.py","action":"MODIFY"}
spec: <spec path>
pipeline rules: <path>
deviations sidecar: <path>
Then: node <driver> <spec> --mark wave-done --wave api --workers <n>
```

WAVE step header when every path in the wave is orchestrator-only (D4):

```
## Step: wave persistence — orchestrator rows only, spawn no worker
```

REPAIR step routing tail (D6):

```
File Plan rows by layer, so failures route to the worker that owns them:
  api: src/zubu/api/dependencies.py
orchestrator-owned — fix these yourself, never route them to a worker: main.py, src/zubu/mappers.py
```

Malformed key (D8), exit 2, stderr:

```
spec-build-driver: orchestratorOnly in .claude/spec.config.json must be an array of path globs (got "main.py") — fix it, or remove the key to route every row by layer
```

## Behavior

The driver reads `orchestratorOnly` once at startup, next to `pipelineRulesPath`. Wave
derivation (`computeWaveOrder`) is untouched: rows keep their wave and the layer-group
file-set intersection logic is unchanged. Only the two printers split paths. Within one wave,
a path is either in exactly one `layer:` block or in the `orchestrator` block, never both. The
worker count the orchestrator passes to `--mark wave-done` is its own count, as today; nothing
in the driver checks it against the printed layers.

## Acceptance Criteria

- **AC-20261029-03-1**: WHEN the host config declares `"layerGroups": [["api"]]` and `"orchestratorOnly": ["main.py", "alembic/versions/**"]` and the spec's File Plan has the non-tests rows `main.py | MODIFY | api`, `src/api/deps.js | MODIFY | api` and `alembic/versions/0012_add.py | CREATE | api` THE SYSTEM SHALL print at `WAVE:api` a step body in which the `layer: api` block lists exactly `{"path":"src/api/deps.js","action":"MODIFY"}`, and an `orchestrator — never in a worker's file list;` block after it lists `{"path":"main.py","action":"MODIFY"}` and `{"path":"alembic/versions/0012_add.py","action":"CREATE"}`, with neither of those two paths appearing on any line between `layer: api` and the `orchestrator` line → writes tests/build/build-driver-orchestrator-only.test.js
- **AC-20261029-03-2**: WHEN the host config declares `"layerGroups": [["api"], ["persistence"]]` and `"orchestratorOnly": ["src/mappers.js"]` and the persistence wave's only non-tests row is `src/mappers.js | MODIFY | persistence` THE SYSTEM SHALL print at `WAVE:persistence` the header `## Step: wave persistence — orchestrator rows only, spawn no worker` with no `layer:` line, and SHALL accept `--mark wave-done --wave persistence --workers 0` with exit 0 once `src/mappers.js` exists (e.g. header literal above; mark → exit 0) → writes tests/build/build-driver-orchestrator-only.test.js
- **AC-20261029-03-3**: WHEN `orchestratorOnly` is `["main.py"]`, the api wave holds `main.py | CREATE | api`, and `main.py` does not exist on disk THE SYSTEM SHALL CONTINUE TO refuse `--mark wave-done --wave api --workers 1` with exit 2 and stderr containing `wave-done refused — main.py does not verify for wave api` (e.g. missing `main.py` → exit 2) → writes tests/build/build-driver-orchestrator-only.test.js
- **AC-20261029-03-4**: WHEN `orchestratorOnly` is `["main.py"]`, the api wave holds `main.py | MODIFY | api` and `src/api/deps.js | MODIFY | api`, and the build has reached `REPAIR` after a red gate THE SYSTEM SHALL print the routing line `  api: src/api/deps.js` (without `main.py`) followed by the line `orchestrator-owned — fix these yourself, never route them to a worker: main.py` (e.g. those two literal lines, in that order) → writes tests/build/build-driver-orchestrator-only.test.js
- **AC-20261029-03-5**: WHEN the host config has no `orchestratorOnly` key and the File Plan holds `src/foo.js | MODIFY | scripts` and `src/bar.js | CREATE | scripts` THE SYSTEM SHALL CONTINUE TO print at `WAVE:scripts` one `layer: scripts` block listing both `{"path":"src/foo.js","action":"MODIFY"}` and `{"path":"src/bar.js","action":"CREATE"}`, with no line starting `  orchestrator` (e.g. today's step body, unchanged) → writes tests/build/build-driver-orchestrator-only.test.js
- **AC-20261029-03-6**: WHEN the host config declares `"orchestratorOnly": "main.py"` (a string, not an array) THE SYSTEM SHALL exit 2 on a bare driver invocation with stderr exactly `spec-build-driver: orchestratorOnly in .claude/spec.config.json must be an array of path globs (got "main.py") — fix it, or remove the key to route every row by layer`, and the spec's frontmatter `status` SHALL stay `hardened` (e.g. `"main.py"` → exit 2, `status: hardened`) → writes tests/build/build-driver-orchestrator-only.test.js
- **AC-20261029-03-7**: WHEN this repo's `.claude/spec.config.json` is read after the contract edit THE SYSTEM SHALL carry a `contractHash` equal to `spec-paths contract-hash` output, which is no longer `f3547b98c89a` (e.g. stamp == `spec-paths contract-hash` stdout) → reuses tests/consistency/contract-stamp.test.js :: AC-20260912-15-8

## Assumptions (escalation triggers)

- A1: `globMatch` from `spec/scripts/lib/glob-match.js` matches literal paths and `**` globs and does not expand braces. Spiked 2026-10-29: `globMatch("main.py","main.py")` → true; `globMatch("alembic/versions/**","alembic/versions/0012_add.py")` → true; `globMatch("alembic/versions/**","alembic/versions/*.py")` → true; `globMatch("src/zubu/domains/{commands,events}.py","src/zubu/domains/commands.py")` → false; `globMatch("main.py","src/main.py")` → false. — **if false:** STOP, ask the user; D1's syntax note changes.
- A2: No test fixture or host config in this repo declares `orchestratorOnly` today, so D7 keeps every existing build-driver test byte-identical. Checked 2026-10-29: `grep -rn orchestratorOnly spec tests .claude` → no hits. — **if false:** the colliding fixture's expectations are part of this spec's File Plan; add the row.
- A3: A contract hash change makes the state gate print a warning, never a block, in every host (`spec/scripts/spec-state-gate.sh` line 46: "Proceeding is fine if the drift is known-benign"). — **if false:** STOP, ask the user; the contract edit then blocks every host until re-init.
- A4: Only the WAVE and REPAIR step bodies hand non-tests File Plan paths to workers; INTEGRATION is session-only work and RED_ATTRIBUTION lists CREATE paths without dispatching. — **if false:** return blocked naming the step; it joins D6's treatment by a Decisions amendment.
- A5: The fixtures in `tests/build/build-driver.fixtures.js` (`makeHost`, `toFirstWave`, `toGreenGate`-style helpers) can be parameterized or copied to write a host with custom `layerGroups`, File Plan rows and `orchestratorOnly`, and reach `REPAIR` with a red gate. — **if false:** the new test file builds its own minimal host with `tmpdir`/`gitRepo` from `tests/helpers.js`.

## Rationale

The incident: zubu-backend's spec annotated `main.py` and `src/zubu/mappers.py` as
"orchestrator-only singleton" in its File Plan, and the host's § Worker Rules listed both as
read-only for workers. The build driver still placed them in the api and persistence waves,
because it routes by layer alone and only prints the rules file's path. The worker contract
says "edit only files in your assigned batch", so the worker followed the batch and broke the
host rule. One review round was lost.

Why a config key, not prose parsing: an independent read (Fable) showed the host's list is not
deterministically parseable, and a fail-open parser that drops an entry is a silent repeat of
this incident. `layerGroups` and `agentMap` already put routing in config, and
`lib/glob-match.js` already owns glob semantics. The cost is one contract edit: every host gets
one non-blocking "grounding drift" warning (A3) that leads to `/spec:doctor`, which D11 makes
name the missing key.

Why inline in the wave (D3) and not in the integration step: order matters in both
directions. zubu's api tests needed the new `main.py`; a mappers guard can need the
persistence wave's new models. Keeping the row in its wave and letting the orchestrator apply
it before or after the dispatch keeps both cases right without a new state.

Why fail loud on a malformed key (D8) but fail open on an absent one (D7): absence means the
host has not adopted the key; a malformed value means it tried to and the driver would
otherwise hand the files to workers anyway.

Not in scope: adding the key to zubu-backend's config (a different repo — a handoff after this
lands), and a guard that workers honor `blocked` on read-only surfaces (no ledger class has
recurred; core § Incident Policy).

## Canonical Delta

In `docs/canonical/build-integrity.md` § Build driver, after the sentence ending "and prints
one judgment step at a time.", insert:

"A File Plan path matching a glob in the host config's optional `orchestratorOnly` list never
enters a worker's file list: the WAVE step prints it in an orchestrator block inside its own
wave, the REPAIR step names it as orchestrator-owned, and `--mark wave-done` still verifies it
like any other row. An absent key routes every row by layer; a key that is not an array of
strings refuses every invocation with exit 2."
