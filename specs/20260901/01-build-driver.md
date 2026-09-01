---
date: 2026-09-01
status: implementing
tier: critical
area: build-integrity
design: false
breaking: false
depends_on: []
depended_on_by: ["specs/20260901/02-run-provenance.md", "specs/20260901/03-unified-build-loop.md"]
brief: 18
build_base: main
open_markers: 0
---

# Build Driver — the build stage becomes a stepped program; build.md becomes the judgment shell

## Goal

`/spec:build` today is a 161-line markdown procedure with no driver and no state file: it
resumes by inspecting the diff, runs the red-check, the gate, and scope-reconcile by hand, and
hand-appends its own ledger row — the last stage in the per-feature loop whose deterministic
choreography is still performed by an LLM (brief 18, seam 1). This spec gives build what review
got in specs/20260820/07: `spec-build-driver.js` re-derives the build's state from spec
frontmatter + a `<spec>.build/` sidecar + on-disk artifacts on every invocation, executes every
deterministic step itself (admission, wave derivation, gate resolution, env preflight, the
status flip, red-check, the final gate, scope-reconcile, diff counts, the ledger row), and
prints exactly one judgment step at a time (test-author dispatch, red attribution, worker
dispatch per wave, host integration, repair dispatch, the checkpoint commit). `build.md`
shrinks to the judgment shell. Done means: a fixture host can be driven from `hardened` to a
script-written `stage:"build"` ledger row by marks alone, every mark refused with a remedy when
its artifact is missing, and `/spec:build`'s read load stays under the 500-line budget. The
outer loop, run provenance, and the state-gate/doctrine changes are siblings 02 and 03.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | New `spec/scripts/spec-build-driver.js` on the review-driver contract: `<spec.md>` prints the current state + only that step's instructions; `--mark <mark> [args]` verifies the step's artifacts, records the mark, prints the next step; `--state` prints the bare state token and nothing else with zero side effects; exit 0 = step printed or mark accepted, exit 2 = precondition failure or refused mark (state unchanged, remedy named). State is re-derived every invocation from spec frontmatter + `<spec>.build/build-state.json` + on-disk artifacts. (AC-20260901-01-1, AC-20260901-01-10) | The review driver's contract is the proven shape (specs/20260820/07 D1); a second contract would be a second thing to learn. Rejected: a Workflow script (wf-build.js was deleted 2026-08-17 for exactly the opacity a driver avoids). |
| D2 | The driver EXECUTES itself: admission (`hardened` → fresh run; `implementing` → resume; anything else → exit 2 naming the owning command); design admission (host config declares a `design` block AND `design: true` AND no `designed:` → exit 2 naming `/spec:design <spec>`); File Plan parse via `lib/file-plan.js` into waves (tests-layer rows → the TESTS step; each `layerGroups` entry → one wave labelled by its joined layer names, its file sets disjoint or the wave splits per layer; `other` and any layer outside `layerGroups` → the final serial wave `other`); gate resolution via `lib/gate-resolve.js` (a `{gate:null}` result is exit 2 naming the missing test rows; `typecheckCommand` recorded when declared); `env-preflight --root` (exit 1 → its output verbatim, exit 2, no status flip, no sidecar); the `hardened → implementing` flip with `diff_base: <git rev-parse HEAD>` stamped absent-only when no `build_base` exists; `red-check` execution; the final gate execution; `scope-reconcile --json` (advisory, printed); `git diff --shortstat <base>..HEAD`; the deviations count; the ledger append; sidecar deletion at DONE; the `spec-status --next` capture. It PRINTS steps for the session-only work: test-author dispatch, red attribution, per-wave worker dispatch, host integration, repair dispatch, the checkpoint commit. (AC-20260901-01-1, AC-20260901-01-2, AC-20260901-01-6, AC-20260901-01-7, AC-20260901-01-11, AC-20260901-01-12) | Every one of those steps is deterministic today and performed by hand; procedural hallucination is the measured largest agent-failure class (review driver header). Rejected: the driver dispatching agents itself — dispatch is the session's judgment seat (core § Model Placement). |
| D3 | Marks are a closed set, each verified before it lands: `tests-authored` (every non-DELETE tests-layer File Plan path exists) · `red-attributed` (no non-tests CREATE-row path exists on disk — stub residue is a refusal) · `wave-done --wave <label> --workers <n>` (every row of that wave verified by Action: CREATE and MODIFY paths exist, DELETE paths absent; `<n>` = worker agents spawned for the wave, a non-negative integer) · `integrated` (no artifact; recorded; triggers the gate run) · `repair-applied --continued <n> --spawned <n>` (records worker continuations vs fresh spawns; triggers a gate re-run; the fourth is refused) · `committed` (no File Plan path appears in `git status --porcelain`, and HEAD ≠ the base sha). An unknown mark, a missing argument, or a non-integer count is exit 2. (AC-20260901-01-3, AC-20260901-01-5, AC-20260901-01-6, AC-20260901-01-8, AC-20260901-01-9) | A mark whose artifact vanished is demanded again — the driver never trusts the sidecar alone (specs/20260820/07 D3). Wave marks are keyed by label, not index, so a mid-build File Plan ruling that adds a row never shifts a landed wave's mark. |
| D4 | State catalogue, in order: `PREFLIGHT` (driver-only) → `TESTS` → `RED_CHECK` (driver-only) → `RED_FINDINGS` (session; re-derived — the driver re-runs red-check on every invocation until it exits 0; no mark) → `RED_ATTRIBUTION` (session; only when the File Plan has a non-tests CREATE row) → `WAVE:<label>` per wave → `INTEGRATION` → `GATE` (driver-only) → `REPAIR` (session; round k of 3, both the current and the previous gate output paths printed) → `COMMIT` → `DONE` (terminal). `ESCALATE` (terminal) lands on the fourth `repair-applied`; its two exits are printed: edit the tree and delete `<spec>.build/gate-cap` to re-arm one more round, or delete the whole sidecar to restart cold. A File Plan with no tests-layer rows skips TESTS/RED_CHECK/RED_FINDINGS/RED_ATTRIBUTION with one printed line. (AC-20260901-01-4, AC-20260901-01-8, AC-20260901-01-12) | Mirrors build.md's five phases one-to-one so the shell prose maps onto states by name. The unsanctioned-green sanction stays where red-check reads it — the spec's own `[pre-green:]`/`SHALL CONTINUE TO` carriers — so no "accept" mark can launder a green (build-integrity canon). |
| D5 | Sidecar `<spec path minus .md>.build/`: `build-state.json` (marks + observations: `runId`, `redCheck`, `gateRuns[]`, `waves{label:{workers}}`, `repairs[]`, `committedAt`), `red-check-<k>.log`, `gate-<k>.log`, `reconcile.json`. Never committed; deleted at DONE. `init-gen.js`'s `IGNORE_ENTRIES` gains `specs/**/*.build/` with a child-path sample; this repo's `.gitignore` gains both `specs/**/*.review/` and `specs/**/*.build/` (the `.review/` line was provisioned for hosts on 2026-08-31 but never landed here). (AC-20260901-01-13) | One directory per driver keeps the review driver's refusal catalogue untouched (brief 18 open question 4). The gitignore gap is the 7.45.0 hearwell class on this very host. |
| D6 | The build ledger row is script-written at DONE, never by the session: `{"ts","spec","stage":"build","tier","runId":"bd_<12 hex>","diff":{"files","loc"},"gate":{"finalRounds"},"deviations","redCheck":"green"\|"skipped-resume"\|"none","workers":{"spawned","continued"}}` — `diff` from `git diff --shortstat <base>..HEAD` (`loc` = insertions + deletions), `gate.finalRounds` = number of gate executions in this run, `deviations` = count of `^- ` lines in `<spec>.deviations.md` (0 when absent), `workers` = sums over `wave-done --workers` and `repair-applied --spawned/--continued`. Appended through the synchronous writer; the existing four fields keep their names and shapes. (AC-20260901-01-9) | The four existing fields have no reader today (measured 2026-09-01), so additive keys break nothing; `runId` gives future escape rows a build join the way review rows have one. `via` and the session model are sibling 02's. |
| D7 | Resume without a sidecar (`status: implementing`, no `<spec>.build/`): the driver starts at TESTS, prints a warning that the red-check cannot run on a post-image tree, records `redCheck: "skipped-resume"` with the dirty non-tests paths, and carries it onto the row. (AC-20260901-01-14) | red-check refuses a dirty pre-image by contract (executed spike, Assumptions A6); the honest alternative to a refusal loop is a ledger-visible skip. Rejected: silently re-running red-check on the post-image (proves nothing about vacuity). |
| D8 | Long-lived workers: the WAVE step instructs the session to spawn one `Agent {model: sonnet}` per layer in the wave and KEEP it; the REPAIR step routes each failing file to the worker that owns its layer via `SendMessage`, spawning fresh only when that worker is gone (a resumed session). The test author and the reviewer stay fresh-context dispatches. The counts land on the row (D6) so the continuation claim is measurable. (AC-20260901-01-9) `[no-ac: the dispatch itself is session behavior the driver cannot observe — only its counts are pinned]` | Fable 5.1 guidance: long-lived asynchronous sub-agents beat spawn-and-block (brief 18 § Grounding); continuation is executed-verified (Assumptions A4). Workers die at a `/clear`, so continuation is within a stage only (brief 18 open question 3). |
| D9 | `build.md` becomes the judgment shell: Setup, Input, the driver-loop protocol (run → execute exactly the printed step → `--mark` → re-run), the Worker Contract the WAVE step points at, `blocked`-return handling, the report, Rules. Every choreography paragraph the driver now owns is deleted. The sentence naming `.claude/spec-runs.jsonl` stays (the run-ledger pin reads it). `/spec:build` read load stays ≤ 500 lines. (AC-20260901-01-15) | Brief 18 § Scope 4 — the de-prescribe A/B. The ledger sentence is a live pin (tests/run-ledger.test.js). |
| D10 | `spec-paths` gains the key `build-driver`; `spec/entrypoints.json` gains the driver's row (entry point `spec/commands/build.md`) and the script-to-script edges it now owns (`red-check`, `env-preflight`, `scope-reconcile`, `spec-status`); `build.md`'s moved edges are dropped in the same diff. (AC-20260901-01-16) | New-surface checklist (host § Planning); the entrypoints live-green pin is exact-count and forward-verified. |
| D11 | `lib/driver-io.js` extracts the four private helpers both drivers need — `runChild` (fail-closed spawn), `writeOut` (sync EAGAIN-retrying stdout), `appendLedger(root, jsonLine)`, `loadSidecar/saveSidecar(dir, file)` — and `spec-review-driver.js` imports them, deleting its own copies; behavior byte-identical. (AC-20260901-01-17) | Two drivers with two copies is the drift seam every lib header cites; the review suite is the regression net. |
| D12 | The driver never dispatches agents, never writes the Decisions table, never renders a user-facing report, never runs a git write (its git calls are `rev-parse`, `diff --shortstat`, `status --porcelain`), and never creates, enters, or leaves a worktree — `/git:enter-worktree` stays the worktree owner and `build_base` stays its field. `[no-ac: an absence contract — the File Plan and the header's "does NOT do" list carry it; no observable to assert]` | core § Model Placement (dispatch is judgment), § Worker Git Ban (the session owns commits), build.md's standing worktree rule. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/spec-build-driver.js | CREATE | scripts | D1–D8, D12: the stepped build driver; header per host § Worker Rules (usage, incident, does-NOT-do, exit codes 0/2) |
| spec/scripts/lib/driver-io.js | CREATE | scripts | D11: `runChild`, `writeOut`, `appendLedger`, `loadSidecar`, `saveSidecar` |
| spec/scripts/spec-review-driver.js | MODIFY | scripts | D11: import from `lib/driver-io.js`, delete the private copies; no behavior change |
| spec/commands/build.md | MODIFY | doctrine | D9: judgment shell; keep the `.claude/spec-runs.jsonl` sentence; ≤ 500-line read load |
| spec/bin/spec-paths | MODIFY | scripts | D10: `build-driver` key + usage string |
| spec/entrypoints.json | MODIFY | doctrine | D10: driver row + edges; drop build.md's moved edges |
| spec/scripts/init-gen.js | MODIFY | scripts | D5: `IGNORE_ENTRIES` gains `specs/**/*.build/` |
| .gitignore | MODIFY | other | D5: add `specs/**/*.review/` and `specs/**/*.build/` for this host |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | version bump target 7.48.0 + changelog paragraph (next free version if taken — host § Gotchas) |
| tests/build/build-driver.test.js | CREATE | tests | AC-20260901-01-1, AC-20260901-01-2, AC-20260901-01-3, AC-20260901-01-4, AC-20260901-01-5, AC-20260901-01-6, AC-20260901-01-7, AC-20260901-01-8, AC-20260901-01-9, AC-20260901-01-10, AC-20260901-01-11, AC-20260901-01-12, AC-20260901-01-14 |
| tests/review/review-driver.test.js | MODIFY | tests | AC-20260901-01-17 (tag the existing byte-identity ledger test in place) |
| tests/spec-paths.test.js | MODIFY | tests | AC-20260901-01-16 (add `build-driver` to the in-place key list) |
| tests/init-gen/generate.test.js | MODIFY | tests | AC-20260901-01-13 |

Orchestrator duty (outside the table): `tests/consistency/entrypoints.test.js` and
`tests/consistency/read-load.test.js` are not edited — they are the live oracles for
AC-20260901-01-15 and AC-20260901-01-16's manifest half and must stay green at Phase 4.

## Contracts

```
spec-build-driver <spec.md>                          -> print current state + ONLY that step
spec-build-driver <spec.md> --mark <mark> [args]     -> verify artifacts, record, print next step
  marks: tests-authored | red-attributed |
         wave-done --wave <label> --workers <n> | integrated |
         repair-applied --continued <n> --spawned <n> | committed
spec-build-driver <spec.md> --state                  -> print the state name only (scripting)

States: PREFLIGHT (driver-only) -> TESTS -> RED_CHECK (driver-only) -> RED_FINDINGS? ->
        RED_ATTRIBUTION? -> WAVE:<label>... -> INTEGRATION -> GATE (driver-only) ->
        REPAIR? (cap 3; 4th -> ESCALATE, terminal) -> COMMIT -> DONE (terminal)

Exit codes: 0 = step printed / mark accepted / --state printed
            2 = precondition failure or refused mark (stderr names artifact + remedy;
                state unchanged) — includes env-preflight exit 1 (output verbatim),
                red-check exit 2 (refusal verbatim), any wrapped child dying with no exit code

Printed step shape (same trailer the review driver uses):
  [spec-build-driver] state: <STATE>  spec: <spec path>
  (re-run this driver after completing the step; it verifies artifacts and prints the next one)

  ## Step: <title>
  <body: paths and machine summaries only — never file contents>

DONE:
  [spec-build-driver] state: DONE  spec: <spec path>

  ## DONE
  <spec-status --next output, verbatim>

Sidecar: <spec minus .md>.build/
  build-state.json   { runId: "bd_<12 hex>", via?: string, redCheck: "green"|"skipped-resume"|"none",
                       redCheckDirty?: [paths], testsAuthored: bool, redAttributed: bool,
                       waves: { "<label>": { workers: n } }, integrated: bool,
                       gateRuns: [ { exit, log } ], repairs: [ { continued, spawned } ],
                       committedAt?: sha }
  red-check-<k>.log, gate-<k>.log, reconcile.json
  <spec>.build/gate-cap  (touched at ESCALATE; deleting it re-arms exactly one more round)

Build ledger row (one line, appended at DONE):
  {"ts":"<ISO-8601>","spec":"<repo-relative>","stage":"build","tier":"standard|critical",
   "runId":"bd_<12 hex>","diff":{"files":N,"loc":N},"gate":{"finalRounds":N},"deviations":N,
   "redCheck":"green"|"skipped-resume"|"none","workers":{"spawned":N,"continued":N}}

lib/driver-io.js:
  runChild(cmd, args, opts) -> { status, stdout, stderr }   // dies (exit 2) when status is null
  writeOut(fd, text)                                        // sync, EAGAIN-retrying, partial-write loop
  appendLedger(root, jsonLine)                              // <root>/.claude/spec-runs.jsonl, sync
  loadSidecar(dir, file) -> object | {}                     // malformed JSON -> die
  saveSidecar(dir, file, obj)                               // mkdir -p, pretty JSON + '\n'

spec-paths build-driver -> <plugin>/scripts/spec-build-driver.js
```

## Behavior

Wave derivation from a File Plan and host `layerGroups: [["doctrine","scripts"]]`:

| File Plan layers present | Waves, in order |
|---|---|
| tests, scripts, doctrine, other | TESTS step; `WAVE:doctrine+scripts`; `WAVE:other` |
| tests, scripts | TESTS step; `WAVE:doctrine+scripts` (doctrine has no rows — the wave still carries the group label, dispatching one worker for scripts only) |
| scripts, other (no tests rows) | one printed skip line; `WAVE:doctrine+scripts`; `WAVE:other` |

A layer group whose layers' file sets intersect splits into one wave per layer, labelled by the
single layer name, in group order.

The WAVE step prints, per layer in the wave: the `agentMap` subagent type, the file list as
`{path, action}` rows, the spec path, the pipeline-rules path, and the deviations sidecar path —
never file contents (core § Model Placement). The session dispatches, then marks `wave-done`.

The REPAIR step prints the round number, the resolved gate command, the current and previous
gate log paths, and the File Plan rows by layer so the session can route each failure to the
owning worker. A round whose failure set is unchanged is the session's call to escalate to the
user early — the driver only enforces the cap.

## Acceptance Criteria

- **AC-20260901-01-1**: WHEN the driver is invoked on a `status: hardened` spec with no sidecar in a host whose env preflight passes THE SYSTEM SHALL create `<spec>.build/build-state.json`, rewrite the spec's frontmatter to `status: implementing` with `diff_base: <40-hex sha of HEAD>` inserted (absent-only, and never when `build_base` exists), and print a step whose header line is `[spec-build-driver] state: TESTS` (e.g. fixture spec with one tests row → stdout matches `/## Step: author the tests/` and the spec file matches `/^diff_base: [0-9a-f]{40}$/m`) → `tests/build/build-driver.test.js`
- **AC-20260901-01-2**: WHEN invoked on a spec whose status is `draft`, `done`, or `superseded`, or on a `hardened` spec with `design: true` and no `designed:` in a host whose config declares a `design` block THE SYSTEM SHALL exit 2 naming the owning command (`draft` → `/spec:plan`; `done` → `/spec:status`; `design` → `/spec:design <spec>`), leave the spec file byte-identical, and create no sidecar → `tests/build/build-driver.test.js`
- **AC-20260901-01-3**: WHEN `--mark tests-authored` is received and any non-DELETE tests-layer File Plan path is absent on disk THE SYSTEM SHALL exit 2 naming that path and leave `build-state.json` unchanged; WHEN every such path exists THE SYSTEM SHALL record the mark, run red-check itself, and print the resulting state (e.g. `tests/foo.test.js` missing → stderr contains `tests/foo.test.js`, `--state` still prints `TESTS`) → `tests/build/build-driver.test.js`
- **AC-20260901-01-4**: WHEN red-check exits 1 THE SYSTEM SHALL print its findings verbatim under `[spec-build-driver] state: RED_FINDINGS` and re-run red-check on the next bare invocation without any mark; WHEN red-check exits 0 THE SYSTEM SHALL record `redCheck: "green"` and print `RED_ATTRIBUTION` when the File Plan has a non-tests CREATE row, else the first WAVE (e.g. a fixture whose red-expected test already passes → stdout contains `HARD  unsanctioned-green`; after the test is made red, the next invocation prints `state: RED_ATTRIBUTION`) → `tests/build/build-driver.test.js`
- **AC-20260901-01-5**: WHEN `--mark red-attributed` is received while any non-tests CREATE-row path exists on disk THE SYSTEM SHALL exit 2 naming the path as stub residue; WHEN none exists THE SYSTEM SHALL advance to the first WAVE → `tests/build/build-driver.test.js`
- **AC-20260901-01-6**: WHEN `--mark wave-done --wave <label> --workers <n>` names the current wave THE SYSTEM SHALL verify every row of that wave by Action (CREATE/MODIFY path exists, DELETE path absent), refuse with exit 2 naming the first failing path otherwise, and on success print the next wave in `layerGroups` order then `other`, or `INTEGRATION` when no wave remains (e.g. `layerGroups: [["doctrine","scripts"]]` with rows in `scripts` and `other` → the first printed wave is `WAVE:doctrine+scripts`, the second `WAVE:other`; `--wave other` while the current wave is `doctrine+scripts` → exit 2) → `tests/build/build-driver.test.js`
- **AC-20260901-01-7**: WHEN `--mark integrated` is received THE SYSTEM SHALL run the resolved gate command itself, write `gate-1.log`, and print `COMMIT` with the scope-reconcile summary when the gate exits 0 (a non-empty `outOfPlan` prints a line starting `⚠️ out-of-plan:`), or `REPAIR` naming round `1 of 3` and the log path when it exits non-zero → `tests/build/build-driver.test.js`
- **AC-20260901-01-8**: WHEN `--mark repair-applied --continued <n> --spawned <n>` is received for the first, second, or third time THE SYSTEM SHALL re-run the gate and print `COMMIT` or the next `REPAIR` round; WHEN received a fourth time THE SYSTEM SHALL refuse with exit 2, touch `<spec>.build/gate-cap`, and every later bare invocation SHALL print `ESCALATE` with both exits until `gate-cap` is deleted (e.g. three red rounds then a fourth mark → stderr contains `cap`, `--state` prints `ESCALATE`) → `tests/build/build-driver.test.js`
- **AC-20260901-01-9**: WHEN `--mark committed` is received and every File Plan path is clean in `git status --porcelain` and HEAD differs from the base sha THE SYSTEM SHALL append exactly one line to `.claude/spec-runs.jsonl` with the D6 shape, delete the sidecar, and print `## DONE` followed by `spec-status --next`'s output verbatim; a dirty File Plan path or HEAD equal to the base sha is exit 2 (e.g. two waves marked with `--workers 2` and `--workers 1`, one repair marked `--continued 2 --spawned 0`, two gate runs, a deviations sidecar with three `- ` lines → the row carries `"gate":{"finalRounds":2}`, `"deviations":3`, `"workers":{"spawned":3,"continued":2}`, `"redCheck":"green"`, a `runId` matching `/^bd_[0-9a-f]{12}$/`, and `diff.files`/`diff.loc` equal to `git diff --shortstat <base>..HEAD`) → `tests/build/build-driver.test.js`
- **AC-20260901-01-10**: WHEN `--state` is passed THE SYSTEM SHALL print exactly the bare state token and a newline, run no child process that mutates the tree, and leave `build-state.json` and the spec file byte-identical (e.g. at COMMIT → stdout is `COMMIT\n`) → `tests/build/build-driver.test.js`
- **AC-20260901-01-11**: WHEN env preflight exits 1 at PREFLIGHT THE SYSTEM SHALL print the preflight output verbatim, exit 2, leave `status: hardened`, and create no sidecar (e.g. config `testEnv: [{"var":"NEVER_SET_XYZ","provision":"export NEVER_SET_XYZ=1"}]` → stdout contains `NEVER_SET_XYZ`, no `.build/` directory) → `tests/build/build-driver.test.js`
- **AC-20260901-01-12**: WHEN the File Plan has no tests-layer rows THE SYSTEM SHALL skip TESTS, RED_CHECK, RED_FINDINGS, and RED_ATTRIBUTION with one printed line, record `redCheck: "none"`, and print the first WAVE as the first step → `tests/build/build-driver.test.js`
- **AC-20260901-01-13**: WHEN `init-gen.js generate` runs on a host THE SYSTEM SHALL leave `git check-ignore specs/20260101/01-x.build/build-state.json` exiting 0 (idempotent on re-run: the line appears once) → `tests/init-gen/generate.test.js`
- **AC-20260901-01-14**: WHEN invoked on a `status: implementing` spec with no sidecar whose non-tests File Plan paths already differ from the base THE SYSTEM SHALL print a warning naming those paths, start at TESTS, record `redCheck: "skipped-resume"`, and carry `"redCheck":"skipped-resume"` onto the ledger row at DONE → `tests/build/build-driver.test.js`
- **AC-20260901-01-15** `[oracle: gate]`: WHEN `tests/consistency/read-load.test.js` runs THE SYSTEM SHALL find `/spec:build`'s own lines plus `spec-paths shared-for build` at or under 500 lines
- **AC-20260901-01-16**: WHEN `spec-paths build-driver` runs THE SYSTEM SHALL print the absolute path of an existing `spec/scripts/spec-build-driver.js` (the in-place key list in `tests/spec-paths.test.js`; the manifest half — a `spec/entrypoints.json` key for the driver with `spec/commands/build.md` as its entry point and the forward edges verified — is `tests/consistency/entrypoints.test.js`'s live-green pin, not a new test) → `tests/spec-paths.test.js`
- **AC-20260901-01-17**: WHEN `spec-review-driver.js` runs a CLEAN close after importing `lib/driver-io.js` THE SYSTEM SHALL CONTINUE TO append a ledger row byte-identical (minus `ts`) to a direct `verdict.js` re-invocation with the row's own recorded flags → the existing byte-identity ledger test in `tests/review/review-driver.test.js` (AC-20260820-07-2), tagged in place

## Assumptions (escalation triggers)

- A1: `lib/file-plan.js`'s `parseFilePlanRows` returns `{paths, action, layer}` per row and tolerates the template's four-column table — **if false:** extend the parser in place (it is the sole File Plan derivation; never a second parser in the driver).
- A2: `lib/gate-resolve.js`'s `resolveGate(specText, config)` is the one `{testDirs}` substitution and returns the glob form for `node --test` — **if false:** STOP, ask the user (a second substitution is the drift seam spec 20260830/02 closed).
- A3: Executed 2026-09-01 — `spec-status.js --root . --next` prints `🎯 Next` followed by the command line; the driver captures it verbatim exactly as the review driver does — **if false:** print the literal `(spec-status --next unavailable)`.
- A4: Executed 2026-09-01 — a finished `Agent` can be continued with `SendMessage` by id and resumes with its context intact (the review-driver explorer was resumed mid-session and answered a follow-up from its prior reads; harness reply: `Resuming agent …`) — **if false:** D8's continuation degrades to fresh spawns; the row's `continued` stays 0 and the A/B reads it.
- A5: Executed 2026-09-01 — `git check-ignore -q specs/20260101/01-x.build/build-state.json` exits 0 under a `.gitignore` line `specs/**/*.build/` — **if false:** use the `.review/`-line form init-gen already ships.
- A6: Executed 2026-09-01 — `red-check.js --base <sha>` on a tree whose non-tests File Plan path already differs from the base prints `red-check: pre-image is not pure — non-tests File Plan path(s) already differ from --base <sha>: src/foo.js — reconcile the working tree …` and refuses (header: exit 2); the same tree with `src/foo.js` restored classifies `1 file(s) · 0 finding(s)` and exits 0 — **if false:** D7's resume skip is unnecessary and is deleted.
- A7: Executed 2026-09-01 — `spec-state-gate.sh` with `{"prompt":"/spec:build specs/x/01-a.md"}` against `status: done` exits 2 (`requires status: hardened (or implementing to resume)`) — the loop's `done` admission is sibling 03's change; this spec never invokes the driver from a `done` spec — **if false:** nothing here changes.
- A8: The review driver's private helpers (`runChild` 170–180, `appendLedger` 544–548, sidecar load 277–278 / `saveSidecar` 283–286, `writeOut`) are the four D11 extracts and no other script defines a same-named sibling — **if false:** the worker returns `blocked` naming the extra definition; the extraction scope is decided in Decisions, never widened silently.
- A9: `tests/consistency/entrypoints.test.js`'s exact-count pin compares the manifest to the scanned executables dynamically (`Object.keys(manifest).length === executables.length`), so adding the driver's manifest row needs no test edit — **if false:** the pin is updated in place and retagged (the known exhaustive-pin class, host § Gotchas; never weakened).

## Rationale

**Why a driver and not a thinner build.md.** Every phase of build.md is either a deterministic
child-process step or a dispatch; the LLM performing the deterministic half is the seam brief
18 measured (three state substrates, one trustworthy). The review driver has run since
2026-08-21 with its refusal catalogue as the only thing that ever stopped a bad close; the
build gets the same shape rather than a new one.

**Why no "accept" mark for an unsanctioned green.** The build-integrity canon makes the spec's
own carriers (`[pre-green:]`, `SHALL CONTINUE TO`) the only sanction red-check reads. A driver
mark that let the session record "the user said it's fine" would be a second sanction channel
invisible to review's ac-matrix. The user's ruling lands in the spec (a tag or a pin) and
red-check re-runs — D4.

**Why the resume skip is recorded rather than refused.** red-check's purity refusal is
correct: a post-image run proves nothing. A build resumed from a cold session with landed
code has exactly one honest option — say so on the row (`redCheck: "skipped-resume"`) so the
fleet reader can count how often the red-check was never observed. Refusing would force a
`git checkout` of landed work to satisfy a check whose answer is already unknowable.

**Why the design admission is a refusal, not a question.** build.md today asks whether to run
`/spec:design` first; `spec-status.js` routes `design && !designed → /spec:design`
unconditionally. Two answers to one question is the class the state machine exists to
remove. A spec that should skip design sets `design: false`.

**Why `runId` on the build row.** Cheap, symmetric with review, and the join a future escape
row needs to ask "which build produced the defect" — the fleet reader's `cleanContradicted`
joins on `runId` and nothing joins build rows today.

**What is fragile.** The `wave-done` verification is existence-shaped: a MODIFY row whose
file exists but was never touched passes. The gate at INTEGRATION is the real check; the mark
guards against the wrong-wave and missing-file classes only. The deviations count regex (`^- `)
is the review driver's own, kept identical so both stages count the same lines.

**Collision closure (executed at lock, 2026-09-01).** D9 retires build.md's phase headings
(`Phase 0`–`Phase 5`). The literals leg returned 63 paths, 60 of them other commands' own
phase numbering (enforce, init, release, replay, genesis) — unrelated literals, waived. Live
references to *build's* phases outside the File Plan: `docs/canonical/build-integrity.md`
(two "build.md Phase 1" sentences — amended by the Canonical Delta below), `.claude/rules/
spec-pipeline.md` § Gotchas ("build Phase 4" in the retired-literal entry — a dated incident
record, waived), `spec/templates/spec.md` ("build's red-check … at Phase 1" — waived: the
template names the mechanism, the driver keeps the red-check as its RED_CHECK state; refreshed
when the template next changes), and comment-only mentions in `red-check.js`'s header and
`tests/red-check/red-check.test.js` (waived: comments, no behavior). Executes leg for
`spec-review-driver.js` (D11): every test that spawns the review driver is the regression net
for the byte-identical extraction and stays green unchanged; `tests/review/review-driver.test.js`
is a File Plan row for the AC tag only.

**Series.** This spec is landing unit 1 of brief 18. Sibling 02 adds `via` and the session
model to build and review rows (the hook stamp, `verdict.js` flags); sibling 03 lands the
outer loop, the `done` admission, the doctrine sentence, and the fleet query. Each leaves the
system green alone.

## Canonical Delta

In `docs/canonical/build-integrity.md`, the two existing phrases "an executed step in
build.md Phase 1" (§ Red attribution) and "Build Phase 1's red-check" (§ Mechanized
red-check) become "an executed step of the build driver's RED_CHECK state" and "The build
driver's RED_CHECK state" respectively. Then append a section `## Build driver`:

The build stage is a stepped program. `spec-build-driver.js` (`spec-paths build-driver`)
re-derives the build's state from spec frontmatter + the `<spec>.build/` sidecar + on-disk
artifacts on every invocation, executes every deterministic step itself (admission, wave
derivation from `layerGroups`, gate resolution, env preflight, the `hardened → implementing`
flip with the absent-only `diff_base` stamp, red-check, the final gate, scope-reconcile, diff
counts, the `stage:"build"` ledger row), and prints one judgment step at a time. Marks are a
closed set verified against artifacts before they land; the repair loop is capped at three
rounds by the driver, and a fourth `repair-applied` parks the run at ESCALATE. The
unsanctioned-green sanction stays in the spec's own carriers — the driver has no accept mark.
A resume with no sidecar records `redCheck: "skipped-resume"` on the row rather than
re-running red-check on a post-image tree. Build rows are script-written and carry
`runId` (`bd_`), `redCheck`, and `workers: {spawned, continued}` alongside the original four
fields; `build.md` is the judgment shell. Both drivers share `lib/driver-io.js` for the
fail-closed child runner, the synchronous stdout writer, the ledger append, and sidecar I/O.
