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
- T3 checkpoint surfaces: the list in § Risk Tiers, verbatim.

## Worker Rules

- **Generated surface**: `spec/workflows/wf-*.js` is read-only. Sanctioned route: edit
  `spec/workflows/src/wf-<name>.body.js` or `spec/workflows/fragments/*.frag`, then
  `npm run build:workflows`.
- **Zero dependencies**: scripts and tests use only Node built-ins (`fs`, `path`,
  `child_process`, `os`, `assert`, `node:test`) and `jq` in bash. Never add a package.
  `autopilot/**` may import ONLY `@anthropic-ai/claude-agent-sdk`, and only from
  `autopilot/daemon/sdk.js`; any other non-builtin import anywhere, or an SDK import
  elsewhere, stays a hard finding.
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
- Nothing here is exempt from TDD; there is no env-gated suite (no external services).
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
- A script or test importing a non-builtin package is **hard**. `autopilot/**` may import
  ONLY `@anthropic-ai/claude-agent-sdk`, and only from `autopilot/daemon/sdk.js`; any other
  non-builtin import anywhere, or an SDK import elsewhere, stays a hard finding.
- An error path that doesn't name its remedy command, or a new exit code not documented in
  the script's header, is **hard**.
- A `§ Section Name` citation that doesn't match a `## ` heading in the cited doctrine file
  byte-for-byte (prefix match tolerates parentheticals) is **hard** — `shared-for` filtering
  silently drops mismatches.
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
