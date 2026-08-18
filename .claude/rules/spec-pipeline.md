---
paths:
  - "specs/**"
  - ".claude/**"
---

# Spec pipeline grounding — claude-plugins

This repo is the **source of the spec plugin itself** (plus `git/` and `autopilot/`). The
pipeline dogfoods here: the grounding below describes the marketplace repo, not an app.
Everything is dependency-free Node + bash; the only external binary assumed is `jq`.

## Risk Tiers

Critical-tier triggers for THIS repo:

- **`spec/templates/grounding-contract.md`** — its hash is stamped into every host's
  `spec.config.json`; any edit flags every host's grounding as stale. Edit only when the
  contract genuinely changes, never for wording.
- **Hook surfaces** (process boundary): `spec/hooks/hooks.json`, `spec/scripts/spec-state-gate.sh`,
  `spec/scripts/genesis-state-gate.sh`, `spec/scripts/question-style-gate.js`,
  `spec/scripts/block-cross-worktree-writes.sh` — a broken hook blocks or pollutes every
  session's prompts in every host repo.
- **`spec/scripts/merge-back.sh`** — runs destructive git ops against host repos; exit-code
  alphabet (3 = conflicts, 4 = CWD-inside-worktree refusal) is load-bearing for /spec:review.
- **`spec/scripts/spec-status.js`** — the sole source of "what's next" across all hosts and a
  frozen API for the autopilot daemon (`--root/--next/--json` shape, the five action strings);
  never a second derivation of roadmap state anywhere.
- **`spec/scripts/scope-reconcile.js`** — the sole derivation of changed-set-vs-File-Plan
  reconciliation (incl. `atRisk`) behind review's reconcile/at-risk legs and build's Final-gate
  advisory.
- **`spec/scripts/verdict.js`** — the sole derivation of the review/release verdict word; a
  splice bug here corrupts every review and release verdict at once. Never a second place that
  computes or asserts CLEAN.
- **`spec/scripts/review-legs.js`** — runs every deterministic review leg and writes the
  evidence manifest verdict.js derives from; a bug here silently changes what every review
  observes.
- **`spec/bin/spec-paths`** — every command resolves scripts through it; a wrong key breaks
  commands silently.

Standard-tier-shaped direct work: doctrine prose edits, new sweeps in
`scripts/spec-patterns.sh`, additive template fields, README touch-ups.

## Planning

- Ground against the real surfaces: `spec/doctrine/core.md` + `spec/doctrine/design.md`
  (invariants; sections served via `spec-paths shared-for <command>` — the section lists in
  `spec/bin/spec-paths` are the canonical map) and `spec/templates/grounding-contract.md`
  (host contract).
- Decomposition caps: at most one edit to `grounding-contract.md` per spec; a behavior change
  and its behavioral test belong in the same File Plan row pair.
- New-surface checklist: a new command needs frontmatter (`description`, `argument-hint`),
  a `spec-paths` key if it ships a script, a `shared-for` section list if it reads the
  doctrine, and a plugin.json `description` update (the changelog surface, last-3-versions
  form). A new plugin needs `<plugin>/.claude-plugin/plugin.json` and a
  `.claude-plugin/marketplace.json` entry.
- Version bump discipline: every behavior change bumps the owning plugin's
  `.claude-plugin/plugin.json` semver.

## Build

- Host escalation triggers: any test that must be weakened to pass (tests here are pinned
  invariants with incident headers — weakening one is a doctrine change, not a fix);
  any edit that changes `spec-paths contract-hash` output.

## Worker Rules

- **Frozen scripts**: `spec/workflows/wf-*.js` (the design/enforce workflow scripts) are
  plain checked-in scripts carried as-is for the design family; edit them only under a spec
  that names them, never as a side effect.
- **Zero dependencies**: scripts and tests use only Node built-ins (`fs`, `path`,
  `child_process`, `os`, `assert`, `node:test`) and `jq` in bash. Never add a package. The
  `autopilot/**` SDK-import exception is stated in full in § Review Checks below.
  `autopilot/contract/**` is a read-only vendored copy of the hub's wire contract (ADR-0007) —
  its inert typebox import in `index.ts`/`contract.test.ts` is sanctioned and never edited,
  never a package addition (specs/20260808/01-autopilot-enroll.md D2–D3).
- Bash scripts open `#!/usr/bin/env bash` + `set -u` (never `set -e` — failures are explicit
  and carry remedies). JS scripts open `#!/usr/bin/env node` + `'use strict'`.
- Every script starts with a header comment: usage line, why it exists (dated incident),
  what it deliberately does NOT do, and an explicit `Exit codes:` list.
- Error messages name the remedy command. Machine contracts are sentinel lines
  (`__SMOKE_PASS__`-style) or `--json`; the human render is the only other format.
- Hand-rolled `--flag value` arg parsing only; no arg-parsing library, ever.

## Test Rules

- Framework: `node:test` + `node:assert`, flat `test('...')` — no `describe` blocks. Files
  are `tests/<topic>.test.js`; helpers from `tests/helpers.js`
  (`ROOT, SPEC, read, tmpdir, runNode, runBash, gitRepo`).
- Test names are full sentences stating the invariant. Every assert carries a third-arg
  message stating the **consequence of failure**, not the expectation.
- Tests are **behavioral**: exec-a-script against a synthetic host in `tmpdir()` via
  `runNode`/`runBash`, asserting on status + output, or in-process DI unit tests for
  `autopilot/daemon/*` lib modules (injected fakes, `node:test` mock timers, zero real
  SDK/network calls). Fixtures (`tests/fixtures/`) only when the input must be a realistic
  multi-file artifact. Regexes over prose are not tests — a rule that matters gets a script
  (core § Incident Policy).
- Tests reference incident ids / dated escapes in a header comment. Pipeline-authored tests
  for new specs reference AC-IDs in the test name (`AC-{YYYYMMDD-NN}-1`).
- Nothing here is exempt from TDD. Two sanctioned env-gated suites exist:
  `tests/autopilot/live.test.js` posts real questions to a real Telegram topic and waits for a
  real tap — it activates only when `AUTOPILOT_LIVE=1` is set in addition to the
  `AUTOPILOT_LIVE_TOKEN`/`_SUPERGROUP`/`_TOPIC`/`_USER` credentials, and skips by declaration
  otherwise (specs/20260801/04-live-smoke.md D6); `tests/autopilot/enroll-live.test.js`
  performs a real enrollment against the production autopilot-hub — it activates only when
  `AUTOPILOT_ENROLL_LIVE=1` is set in addition to `AUTOPILOT_ENROLL_HUB`/`AUTOPILOT_ENROLL_CODE`,
  and skips by declaration otherwise (specs/20260808/01-autopilot-enroll.md D11).
- **Gates are plainly green** (v7): `npm test` exits 0 on untouched code; there is no
  sanctioned-failing baseline and no standing red pins. A red suite is a regression or an
  unfinished change, never a TODO.
- Scoped runs: `node --test 'tests/<scope>/*.test.js'` — the glob form; `node --test <dir>`
  does not run files on Node 26. Paths are repo-root-relative.

## Review Checks

- A doctrine/behavior change without a plugin.json version bump is **hard**.
- A script or test importing a non-builtin package is **hard**. `autopilot/**` may import
  ONLY `@anthropic-ai/claude-agent-sdk`, and only from `autopilot/daemon/sdk.js`; any other
  non-builtin import anywhere, or an SDK import elsewhere, stays a hard finding.
  `autopilot/contract/**` is exempt from this check — it is a read-only vendored copy of the
  hub's wire contract (ADR-0007, specs/20260808/01-autopilot-enroll.md D2) and its
  `index.ts`/`contract.test.ts` typebox import is sanctioned-inert, never a hard finding,
  provided the files stay byte-identical to the hub source and no other file adds a typebox
  import.
- An error path that doesn't name its remedy command, or a new exit code not documented in
  the script's header, is **hard**.
- A `§ Section Name` citation that doesn't match a `## ` heading in the cited doctrine file
  byte-for-byte (prefix match tolerates parentheticals) is **hard** — `shared-for` filtering
  silently drops mismatches (`citations-check.js` is the deterministic sweep).
- A new test whose asserts lack consequence-of-failure messages is soft; a weakened existing
  assertion is **hard**.
- Duplication calibration: three or more near-identical blocks in one diff is a finding
  naming the extraction — batch-scoped workers never see the third repetition; the reviewer
  is the first eye that can.

## Gotchas (evidence-cited)

- `[host]` A poll/retry loop driven by an **injected** transport has no I/O to pace it: if the
  fake resolves synchronously, `while (running) { await fake() }` recurses on microtasks only,
  never yields to the macrotask queue, and OOMs the test run instead of failing. Any such loop
  needs an explicit `await new Promise(r => setImmediate(r))` per iteration — harmless against
  the real API, which blocks server-side. (specs/20260801/01-telegram-adapter.md — the
  `getUpdates` long-poll loop hit this during build.)
- `[host]` A `flush()`-style microtask/`setImmediate` drain cannot observe anything gated on a
  **real child process**: spawning `node`/a shell and waiting on its stdout costs ~40–80ms of OS
  time no matter how the code is written, so an AC asserting on output that follows a spawn must
  use a bounded real-time `waitFor(predicate, 2000)` poll instead. Writing the assertion against
  `flush()` alone reads as an implementation defect and invites "fixing" correct code — the order
  under test (fully await the spawn, then post) is the only correct one.
  (specs/20260801/03-lane-engine.md — AC-2's checkpoint-ask assertion; fixed in the test.)
- `[plugin]` The gate's `{testDirs}` placeholder invites a directory, but `node --test <dir>`
  fails on Node 26 in this repo — with or without a trailing slash it reports
  `test at tests/autopilot:1:1 ✖` and `MODULE_NOT_FOUND`. Only the glob form
  `node --test 'tests/<scope>/*.test.js'` actually runs the files. Resolve `{testDirs}` to the
  glob on every scoped gate run. (specs/20260801/02-session-runner.md — the build hit this
  resolving its own gate command.)
<!-- One line per entry; every entry cites a ledger row (spec path + runId) or a dated
incident, and carries a provenance tag: [host] (this repo/stack) or [plugin] (traces to a
spec-plugin template/command/generated artifact). Writers: /spec:review close and
/spec:escape only. /spec:doctor prunes dead citations and rolls [plugin] entries up as an
upstream bug list. -->
- `[host]` Plain `git status --porcelain` collapses a wholly-untracked directory to one
  `?? dir/` line — file-level consumers need `--untracked-files=all` or every file inside a
  new directory is invisible to them. (specs/20260805/01-review-scope-reconciliation.md —
  scope-reconcile.js hit this on AC-4's fixture during build.)
- `[host]` A test that spawns a CLI against an **in-process** stub server must use async
  `spawn`, never `spawnSync` — spawnSync blocks the parent's event loop for the child's whole
  lifetime, so the stub can never answer and every such test hangs to its timeout
  (status=null/SIGTERM). (specs/20260808/01-autopilot-enroll.md — every stub-reaching AC hung
  in build repair round 1; fixed by switching the helper to awaited `spawn`.)
- `[host]` A spec Decision naming a literal version-bump target can be stale by build time —
  concurrent sessions in this repo race the same semver (specs/20260810/02 D11: 6.50.0 was
  already taken at HEAD before the batch ran; the worker bumped to 6.51.0 with the same
  changelog paragraph and logged the deviation). The build bumps to the next free version and
  records the deviation; the spec's literal number is a target, not a pin.
- `[host]` A locked Decision that retires or narrows a literal glyph, phrase, or claim from
  doctrine prose can leave a live assertion of the retired form **outside** the spec's File
  Plan, on two surfaces: test files (doctrine shape here is pinned by dense regex asserts, so
  the retired literal is asserted somewhere the File Plan never looked) and the doctrine corpus
  itself (the same claim restated in another command/doctrine file — often paraphrased, often
  hard-wrapped mid-phrase, so neither the literal nor the full phrase ever matches). Two
  mechanisms now catch it: `collision-closure` at plan lock lists both the paths and literals
  legs (advisory, never blocking — every hit enters the File Plan as fix or recorded waive);
  spec 03 D10's blocking whole-suite check at build Phase 4 catches the behavioral variant a
  naming closure cannot reach. Mid-build a colliding test pin is updated in place and retagged
  with the new AC-ID (never weakened, never left red).
  (specs/20260813/07-command-report-conformance.md D8 — the 🔍→📦 retirement broke
  `tests/review/smell-lens.test.js` AC-20260812-01-6 during build, the second such collision in
  one spec; specs/20260813/09-model-placement-mechanics.md D4 — the "uncorrelated model"
  narrowing enumerated both shared.md loci but missed the paraphrased restatement at
  spec/commands/review.md:14, caught at review time by corpus stem-grep; specs/20260814/01-ac-matrix-script.md
  — the `spec-paths` key-set collision landed out-of-plan and had to be waived at review, the
  third recurrence and this spec's own trigger.)
- `[plugin]` `ac-matrix.js` parses AC bullets as `^- \*\*(token)\*\*` and requires the token to
  fully match `AC-\d{8}-\d{2}[a-z]?-\d+`. A build-time amendment written the way the Decisions
  table writes one — a prime-suffixed successor (`AC-…-3′`) plus the superseded original left as
  a struck top-level `- ~~**AC-…-3**~~` bullet — yields TWO `malformed-ac` hard findings. Amend
  an AC by keeping the plain ID and demoting the superseded text to an indented sub-line; prime
  marks are for Decision IDs (unlinted) only. (specs/20260814/04-lock-signal-window.md — review
  2026-08-15 caught it on the spec's own load-bearing ordering pin. The second half of that
  incident — a malformed bullet silently dropped from the coverage denominator, so the amended
  AC's test could be deleted and review still report full coverage — was closed by
  specs/20260815/03: unparseable now counts as uncovered in both drift modes.)
- `[host]` A spec that turns an INTAKE pin green makes `.claude/suite-baseline.json` an
  **out-of-plan** change every time: the pin's sanctioned-red row must come off the list, which
  `suite-baseline.js --check` reports as `fixedNotRemoved>0` with the `--update` remedy, and
  specs/20260814/03's Contracts block says that update rides the landing batch. Review's
  scope-reconcile then raises a hard out-of-plan finding on a file the contract required the
  build to touch. It is a five-second waive citing 20260814/03 Contracts — plan it into the
  File Plan up front on any defect-fix spec that closes a pin, and the finding never fires.
  (specs/20260815/03-ac-matrix-fail-closed.md — waived at review 2026-08-16.)
- `[plugin]` **CLOSED 2026-08-16 by specs/20260815/03** — `ac-matrix.js`'s skipped-test
  reconciliation once read `[env: VAR]` from only the spec under review, so a test env-gated in
  a *different* spec was a perpetual unsanctioned-skip hard finding. It now derives the owning
  spec from the AC-ID and reads the declaration there, failing closed at every edge. Kept as a
  worked example of the class: a check whose declaration lookup is narrower than the scope it
  audits cries wolf forever, and waiving is not a fix. (Original hit:
  specs/20260814/04-lock-signal-window.md review 2026-08-15 — `AC-20260808-01-12`, declared
  `[env: AUTOPILOT_ENROLL_LIVE]` in specs/20260808/01.)
- `[host]` Two former `[plugin]` gotchas were closed at intake 2026-08-15 as already covered by
  plan lock's obligation→carrier sweep (spec 6.62.0), whose anchor list explicitly is not closed:
  a Decision recording a class-level item "in spec/INTAKE.md, doctrine-only" owes the citation or
  failing test that INTAKE's `Pinned by` contract requires (specs/20260801/04 D8), and a Decision
  pinning a non-default `model:` on a workflow seat owes the seat's **call mechanism** too —
  `dispatch()`'s model fallback only reaches calls routed through it, so a bare `agent()` call
  leaves the seat with no recovery path (specs/20260813/09 D2). Both obligations are stated in
  their Decisions' own text, which is what the sweep reads; keep them as worked examples, not as
  new anchors. Contrast JJ-20260815-03, whose obligation is stated nowhere and therefore is not
  covered.
- `[plugin]` A test worker editing a File Plan row that carries **no AC** still reaches for the
  spec template's AC-ID shape and writes the literal placeholder (`AC-<date>-NN-N`) into the test
  name and assert message. The token is not a valid AC-ID under `ac-matrix.js`'s grammar, so it
  is silently invisible to the coverage matrix rather than caught — a placeholder that looks like
  coverage and is not. Collision-sweep rows (an exhaustive key-set pin updated in place) are the
  usual carrier, since they are edit-only by construction. The fix is removal, never inventing an
  ID to fill it. (specs/20260815/05-env-preflight.md build 2026-08-16 —
  `tests/terminal-observable-acs.test.js`, caught by the orchestrator, logged in that spec's
  deviations sidecar.)
- `[plugin]` `suite-baseline.js --snapshot` / `--check --pre` binds the pre-image to a single
  instant and so assumes exclusive repo access for the whole build. Concurrent sessions are
  normal here (there is already a `[host]` entry for them racing the same semver), so a sibling
  session landing its own TDD red pins mid-build reports them as `preNewFailing` — a nominally
  BLOCKING result whose only honest resolution is out-of-band attribution work, since
  "repairing" it would mean implementing an unrelated INTAKE item. Attribute by execution
  (restore the pre-change file, re-run the pins, compare creation times against the snapshot),
  record it, and do not weaken or retag the sibling's pins. A cheap closure would be for
  `--check --pre` to subtract rows whose test file did not exist at snapshot time, or rows the
  checked-in `.claude/suite-baseline.json` sanctions and the pre-image predates.
  (specs/20260816/03-file-plan-table-scoped-parsing.md build 2026-08-17 —
  `tests/ac-matrix-duplicate-id.test.js`, JJ-20260817-01's pins, logged in that spec's
  deviations sidecar.)
- `[plugin]` `diff_base` is written once at build Phase 0 and is documented as never rewritten,
  but a concurrent session committing between that capture and the build's own commit makes the
  recorded sha a stale pre-image — review then diffs the sibling's unrelated commit into this
  spec's panel. The build corrects `diff_base` to the true pre-image at close and records the
  departure; review inherits the corrected value with no special handling.
  (specs/20260816/03-file-plan-table-scoped-parsing.md — `c467bc3` corrected to `f85d07a` at
  build close 2026-08-17.)
- `[host]` A script that wraps a child process must never hand `spawnSync`'s `status` straight
  to `process.exit`: `status` is `null` when the child is killed by a signal, fails to spawn, or
  overflows `maxBuffer`, and `process.exit(null)` exits **0** — a fail-open in exactly the place
  a gate wrapper must fail closed. Two neighbours of the same class: Node's default `maxBuffer`
  is 1MB, and a `node:test` run's `✖ failing tests:` trailer prints LAST, so a verbose red run
  loses the trailer first and reads as unparseable; and `process.stdout.write()` immediately
  before `process.exit()` truncates to 64KB when stdout is a pipe (async write, buffer cut before
  it drains) — use `fs.writeSync(1, …)` when the whole payload matters. Pin the null branch
  explicitly; every no-exit-code death is an unrun check, never a pass.
  (specs/20260816/01-gate-baseline-reconcile.md review 2026-08-17, runId `wf_28d80534-707` —
  `suite-baseline.js --gate` reported exit 0 for a signal-killed child and for a genuinely
  failing child that printed 2MB before its trailer; the sibling `observedFailing()` in the same
  file had always failed closed, and the new mode reimplemented its tail without that arm.)
- `[host]` A doctrine regex pin that requires a **contiguous** sentence cannot see text a worker
  split across two concatenated string literals — the file reads correctly, the prompt renders
  correctly, and the pin is red for a reason no diff review surfaces. When pinning prompt text
  that lives inside `fragments/*.frag` template literals, keep the pinned sentence whole in a
  single literal and append additions as separate segments.
  (specs/20260816/01-gate-baseline-reconcile.md — the D7 sentence landed split across two
  segments at build and AC-20260816-01-11 could not match it; recurred as a near-miss at review
  when the same fragment gained its anchoring sentence.)
- `[host]` `tests/autopilot/preflight.test.js`'s AC-20260810-04-12 polls for the ready file
  against a fixed 3-second wall-clock deadline, which is not robust under concurrent load:
  review Phase 0 launches the boot smoke leg (another `autopilotd` boot) in the same parallel
  batch as the whole-suite `suite-baseline --check`, and the test went red on that contention
  alone. Serial re-run and isolated run are both green. A red `suite` leg naming only this test
  is a load artifact, not a diff defect — re-run the suite leg serially before treating it as a
  finding; the durable fix is a load-tolerant deadline or a bounded predicate poll, not a
  baseline row. (specs/20260816/03-file-plan-table-scoped-parsing.md review 2026-08-17,
  runId `wf_85d3d332-882`.)
- `[plugin]` An AC asserting that a **newly-required-but-non-blocking** verdict leg does not
  derive `GATE_RED` is vacuous pre-implementation: `verdict.js` ignores any leg name outside
  `REVIEW_LEGS`/`REVIEW_BLOCKING`, so an unknown-and-red row is already indistinguishable from a
  known-and-non-blocking one and its TDD red check cannot go red. The presence half (missing row
  → `UNVERIFIED`) is the pin that actually reddens; write the non-blocking AC as a companion and
  log the vacuity rather than inventing a red. (specs/20260817/07-promise-sweep-leg.md
  AC-20260817-07-12, build 2026-08-17; same shape as specs/20260815/02-at-risk-pins.md
  AC-20260815-02-7 — second occurrence, guard on a third.)
