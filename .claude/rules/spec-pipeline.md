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

T3 triggers for THIS repo:

- **`spec/templates/grounding-contract.md`** — its hash is stamped into every host's
  `spec.config.json`; any edit flags every host's grounding as stale. Edit only when the
  contract genuinely changes, never for wording.
- **Hook surfaces** (process boundary): `spec/hooks/hooks.json`, `spec/scripts/spec-state-gate.sh`,
  `spec/scripts/genesis-state-gate.sh`, `spec/scripts/question-style-gate.js`,
  `spec/scripts/block-cross-worktree-writes.sh` — a broken hook blocks or pollutes every
  session's prompts in every host repo.
- **`spec/scripts/merge-back.sh`** — runs destructive git ops against host repos; exit-code
  alphabet (3 = conflicts, 4 = CWD-inside-worktree refusal) is load-bearing for /spec:review.
- **The codegen seam**: `spec/scripts/build-workflows.js` + `spec/workflows/fragments/*` — a
  splice bug corrupts all six generated workflows at once.
- **`spec/scripts/spec-status.js`** — the sole source of "what's next" across all hosts
  (v6.20.0 rule); never a second derivation of roadmap state anywhere.
- **`spec/scripts/scope-reconcile.js`** — the sole derivation of changed-set-vs-File-Plan
  reconciliation behind `/spec:review`'s scope gate and `/spec:build`'s Final-gate advisory;
  never a second derivation of the changed-file/File-Plan diff anywhere (2026-08 spec:
  review-scope-reconciliation).
- **`spec/scripts/verdict.js`** — the sole derivation of the review/release verdict word
  (evidence manifest + workflow return + disposition counts → one word, `--ledger` row); a
  splice bug here corrupts every review and release verdict at once. Never a second place that
  computes or asserts CLEAN (2026-08 spec: review-evidence-manifest).
- **`spec/scripts/claims-lint.js`** — the sole derivation of the doctrine claims inventory and
  its dual line-count/orphan ratchet against `claims-baseline.json`; a splice bug here corrupts
  every version bump's claim gate at once. Never a second place that counts orphan claims or
  computes the corpus ratchet (2026-08 spec: claims-registry).
- **`spec/bin/spec-paths`** — every command resolves scripts through it; a wrong key breaks
  commands silently.

T1-shaped work: doctrine prose edits pinned by existing tests, new sweeps in
`scripts/spec-patterns.sh`, additive template fields, README touch-ups.

## Planning

- Ground against the real surfaces: `spec/doctrine/shared.md` (invariants; sections served
  via `spec-paths shared-for <command>` — section lists there are the canonical map),
  `spec/doctrine/scaffold-ledger.md` (every guard needs a promote/retire condition),
  `spec/templates/grounding-contract.md` (host contract), `spec/INTAKE.md` (open pins).
- Decomposition caps: at most one edit to `grounding-contract.md` per spec; a doctrine change
  and its pinning test belong in the same File Plan row pair; **never a File Plan row for a
  generated `wf-*.js`** — the row is the `.body.js`/`.frag` source plus a regenerate step.
- New-surface checklist: a new command needs frontmatter (`description`, `argument-hint`),
  a `spec-paths` key if it ships a script, a `shared-for` section list if it reads shared.md,
  and a plugin.json `description` update (the de facto changelog). A new plugin needs
  `<plugin>/.claude-plugin/plugin.json` and a `.claude-plugin/marketplace.json` entry.
- Version bump discipline: every behavior change bumps the owning plugin's
  `.claude-plugin/plugin.json` semver (see git log: `bump to 6.35.0` in every commit subject).

## Build

- Orchestrator-only integration duties: run `npm run build:workflows` after any
  `spec/workflows/src/*` or `fragments/*` edit and commit source + generated together;
  run `node spec/scripts/build-workflows.js --check` before declaring a batch done.
- Host escalation triggers: any test that must be weakened to pass (tests here are pinned
  invariants with incident headers — weakening one is a doctrine change, not a fix);
  any edit that changes `spec-paths contract-hash` output.

## Worker Rules

- **Generated surface**: `spec/workflows/wf-*.js` is read-only. Sanctioned route: edit
  `spec/workflows/src/wf-<name>.body.js` or `spec/workflows/fragments/*.frag`, then
  `npm run build:workflows`.
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
- Workflow bodies: meta block first, then the `@fragment:normalize-args` splice, then
  `args = normalizeArgs(args)`, then the shape assertion. `args` is a closed alphabet —
  paths/ids/enums/booleans/commands; prose travels on disk as paths.

## Test Rules

- Framework: `node:test` + `node:assert`, flat `test('...')` — no `describe` blocks. Files
  are `tests/<topic>.test.js`; helpers from `tests/helpers.js`
  (`ROOT, SPEC, read, extractFn, evalFns, checkWorkflowSyntax, tmpdir, runNode, runBash, gitRepo`).
- Test names are full sentences stating the invariant. Every assert carries a third-arg
  message stating the **consequence of failure**, not the expectation.
- Plugin tests reference incident ids / dated escapes in a header comment (this repo's
  analogue of AC-IDs). Pipeline-authored tests for new specs reference AC-IDs in the test
  name per the spec template (`AC-{YYYYMMDD-NN}-1`).
- Four sanctioned modes: (1) exec-a-script against a synthetic host in `tmpdir()` via
  `runNode`/`runBash`, asserting on status + output; (2) doctrine regex pins over `read()`
  file content; (3) source-shape pins on workflow bodies via `extractFn`/`evalFns`; (4)
  in-process DI unit tests for `autopilot/daemon/*` lib modules — injected fakes
  (`queryImpl`, transports), `node:test` mock timers, zero real SDK/network calls.
  Fixtures (`tests/fixtures/`) only when the input must be a realistic multi-file artifact.
- Nothing here is exempt from TDD. Two sanctioned env-gated suites exist:
  `tests/autopilot/live.test.js` posts real questions to a real Telegram topic and waits for a
  real tap — it activates only when `AUTOPILOT_LIVE=1` is set in addition to the
  `AUTOPILOT_LIVE_TOKEN`/`_SUPERGROUP`/`_TOPIC`/`_USER` credentials, and skips by declaration
  otherwise (specs/20260801/04-live-smoke.md D6); `tests/autopilot/enroll-live.test.js`
  performs a real enrollment against the production autopilot-hub — it activates only when
  `AUTOPILOT_ENROLL_LIVE=1` is set in addition to `AUTOPILOT_ENROLL_HUB`/`AUTOPILOT_ENROLL_CODE`,
  and skips by declaration otherwise (specs/20260808/01-autopilot-enroll.md D11).
- **Red-pin baseline**: the full suite deliberately carries failing INTAKE pins (11 as of
  2026-08-01) — `npm test` exiting 1 on untouched code is the sanctioned state, not a
  regression. The pipeline gate is therefore scoped via `{testDirs}`; pipeline-authored
  tests live under `tests/<scope>/` (e.g. `tests/autopilot/`) so scoped gate runs are
  pin-free. Turning a pin green happens only by implementing its intake item.
- Scoped runs: `node --test tests/<file>` — paths are repo-root-relative and the runner
  filters exactly; no workspace/monorepo path semantics apply.

## Review Checks

- Any diff hunk in `spec/workflows/wf-*.js` without a matching `src/`/`fragments/` change in
  the same diff is **hard** (hand-edited generated surface).
- A new mechanism/gate without a `spec/doctrine/scaffold-ledger.md` row carrying a
  promote/retire condition is **hard**.
- A doctrine/behavior change without a plugin.json version bump is **hard**.
- A diff hunk in `spec/commands/*.md`, `spec/doctrine/*.md`, or `spec/agents/*.md` that changes
  line counts, with no `claims-baseline.json` hunk in the same diff, is **hard** — other specs'
  scoped gates never run `tests/claims/`, so without a review-visible check the claims ratchet
  drifts silently between claims-scoped runs.
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
  silently drops mismatches.
- A new test whose asserts lack consequence-of-failure messages is soft; a weakened existing
  assertion is **hard**.
- Duplication calibration: three or more near-identical blocks in one diff is a finding
  naming the extraction — batch-scoped workers never see the third repetition; the reviewer
  is the first eye that can. Cross-file semantic duplication and error masking are plugin-owned
  advisory smell-lens output, never a blocking reviewer finding.

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
- `[plugin]` A spec Decision that records a class-level item "in spec/INTAKE.md, doctrine-only"
  collides with INTAKE.md's authoring contract: every row's `Pinned by` must name a failing test
  or a `pre-contract` artifact. Plan the citation (or the failing test) with the Decision, or the
  build worker is forced to invent one. (specs/20260801/04-live-smoke.md D8 — landed as a
  `pre-contract` citation to the spec's own Rationale.)
