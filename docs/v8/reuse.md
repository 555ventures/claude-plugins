# v8 reuse audit of the old spec plugin

Source: /home/jj/projects/claude-plugins (main), paths relative to `spec/` unless noted. LOC measured with `wc -l`.
Verdicts: COPY as-is, COPY-TRIM (cut named parts), REWRITE (idea only), DROP.

Common caveat: every file's header cites `Owner: specs/YYYYMMDD/NN-...` and long "Does NOT" prose. Strip these on copy. Many tests are named by spec ID and pin doctrine, so copy only the listed test files, not the suite.

## Runtime and test platform

- `package.json` engines: `node >=26.8.2`. Memory note: system Node is 22, so the bridge needs `~/.local/opt/node-v26.8.1-linux-x64/bin` on PATH. Nothing sampled needs 26 specifically (CommonJS, `fs`, `child_process`, `node:test`). v8 can declare `>=22` unless it wants newer features.
- Test script: `node --test --test-timeout=45000 --test-force-exit --require ./scripts/test-stdout-blocking.js --test-reporter=spec 'tests/**/*.test.js'`. `scripts/test-stdout-blocking.js` is a required preload (a stdout-truncation workaround, same cause as sync-write.js). Copy it with the harness.
- node:test features used across the 232 test files that import `node:test`: `describe`/`it`/`test` (32 `describe(` hits), `test.beforeEach` (2), `t.after` (1), `test.skip` (3), `t.skip`. No `mock.*`, no snapshots, no `describe.only`. Mild usage, all stable in Node 20+.
- Every CLI is a CommonJS `#!/usr/bin/env node` + `'use strict'` script with hand-rolled `argv.indexOf('--flag')` parsing. No dependencies in package.json beyond Node built-ins (all `require()`s below are internal or built-in).

## 1. Review-service client (walkthrough)

| Path | LOC | What it does | Deps | CLI | Tests | Verdict |
|---|---|---|---|---|---|---|
| scripts/walkthrough-connect.js | 345 | Connect host to hosted review service through `npx walkthrough-cli` (whoami/create/join), store token in git-ignored `.claude/settings.local.json`, write `walkthrough` config block, add gitignore line | child_process, fs, path, lib/host-config, lib/json-shape (222), lib/sync-write, lib/util, lib/walkthrough-client (548) | `--root --project --name --base-url` | tests/walkthrough/connect.test.js, connect-ignore.test.js, fixture.js, stub-service.js | COPY-TRIM |
| scripts/lib/walkthrough-client.js | 548 | HTTP calls to the service: `openContext`, `push` (round + pictures), `pullNotes`, `pullApprovals`, `reply`, `mark`, `hello`; writes `design/rounds/<n>/` files atomically; timeouts and network refusal wording | crypto, fs, path, host-config, json-shape, surfaces (127), util, walkthrough-catalog | none (library) | no direct test file; covered through tests/walkthrough/* (config, contract-files, picture-notes) via stub-service.js | COPY-TRIM |
| scripts/lib/walkthrough-catalog.js | 229 | Offline check of a wireframe round against the gray vocabulary (`checkScreen`, `checkRound`, `selfCheck`) | json-shape, util | none | tests/spec-paths.test.js (incidental) | DROP unless v8 keeps wireframes; else COPY |

Notes:
- The connect script is mostly guard logic worth keeping (token never printed, gitignore guard before write, tracked-file refusal, idempotent second run). Trim: the `next: /spec:genesis` line, genesis detection, and the "Deliberately NOT here" prose.
- The client is over 500 lines because it bundles round validation, picture upload, and config checking. For mocks or prototype v8 needs `openContext`, `push`, `pullNotes`, `pullApprovals`, `reply`, `mark`. Cut `checkRoundFile`/`preparePictures`/catalog coupling if rounds are no longer gray-vocabulary wireframes; that removes walkthrough-catalog and `surfaces.js`. Roughly 548 down to about 330.
- Coupled to the external `walkthrough-cli` npm package and a service API. Reusable only if v8 keeps that service.
- `stub-service.js` and `tests/walkthrough/fixture.js` are a good local fake service. Copy them with the client.

## 2. Prototype pin overlay and driver

| Path | LOC | What it does | Deps | CLI | Tests | Verdict |
|---|---|---|---|---|---|---|
| templates/proto-overlay.js | 321 | Browser-side dev overlay injected in the running app: alt-click an element to open a pin panel, queue bar, badges, remembered "who"; POSTs pins to the driver's serve endpoint. Copied into the prototype worktree, never imported by the plugin | none (DOM only) | none | tests/prototype/prototype-driver.test.js, tests/review/prototype-close.test.js; fixture host under tests/fixtures/prototype/host | COPY-TRIM |
| templates/proto-stable-id.js | 122 | Stable element-id derivation for pin anchors | none | none | tests/prototype/stable-id.test.js | COPY (companion of overlay) |
| scripts/prototype-driver.js | 1082 | Step machine: opened, round-done, approved, contracted, tests-derived, closed; `serve` (pin HTTP endpoint); `check` | child_process, fs, http, net, path, lib/app-port, lib/contract (233), lib/driver-core, lib/driver-io, lib/host-config, lib/host-run | `<idea\|brief\|stem> [--stem --root --state] --mark <name>`, `serve --port`, `check [--json]` | tests/prototype/* (6 files) | REWRITE, keep a core |

Minimal core of prototype-driver (about 250 lines of its 1082):
1. `loadPinsDoc` / `writePinsAtomic` / `validatePin` (lines ~309-325, 843-852): pins as one JSON doc, atomic write.
2. `cmdServe` (858-938): a small `http` server with `POST /pin`, 400 on invalid, writes the pin doc. About 80 lines.
3. Round and approval state: `status.json` with a round counter and an `approved` mark (`cmdMarkRoundDone`, `cmdMarkApproved`, `deriveState`).
4. Contract (`lib/contract.js`, 233): every pin as a sentence, one picture per route x state, one e2e test per behaviour pin. Keep the pin-to-sentence and pin-to-test mapping; the picture step shells out via host-run and is optional.

Cut: worktree open and close plumbing (`cmdMarkOpened` 413-487, scratch marker, overlay import detection `worktreeImportsOverlay`, `removePlantedOverlay`), port hunting, brief stamping and reconcile (`stampBrief`, `reconcileDocs`), queue integration, checkpoint printing. The overlay itself needs trimming only of the spec-ID header comments and the "queue bar" if v8 has no pin queue.

## 3. Git and worktree scripts

| Path | LOC | What it does | Deps | CLI | Tests | Verdict |
|---|---|---|---|---|---|---|
| scripts/merge-back.sh | 341 | Worktree and merge mechanics: `branch-for`, `create` (git worktree add, .worktreeinclude copy, setupCommand), `root`, `inspect`, `merge` (merge-commit/ff-only/squash/rebase-ff; exit 3 on conflict), `cleanup` (refuses if session cwd is inside the worktree, exit 4), `verify` | bash, git, worktree-include.sh (59), reads host config via node | subcommands above plus `--root --target --source --strategy --worktree --base --name --spec --attach` | tests/merge-back.test.js, tests/worktree-include.test.js | COPY-TRIM |
| scripts/block-worker-git.sh | 52 | PreToolUse hook: refuse non-read-only git verbs while a `spec-wave-open` marker exists in the private git dir; fail-open | bash, git | stdin JSON | tests/worker-git-hook.test.js | COPY |
| scripts/block-cross-worktree-writes.sh | 135 | PreToolUse hook: block Write/Edit/NotebookEdit whose absolute path is in a different worktree of the same repo; scratch-worktree marker exception; fail-open | bash, git | stdin JSON | tests/worktree-hook.test.js | COPY-TRIM |
| scripts/spec-state-gate.sh | 97 | UserPromptSubmit hook: `/spec:run` needs status hardened/implementing/done; `/spec:plan` needs zero live `[NEEDS CLARIFICATION:` markers (recounted from body, not trusting the counter) | bash | stdin JSON | tests/state-gates.test.js, tests/state-gate-drift.test.js | REWRITE (state names change in v8); keep the recount-from-body idea |

Notes: merge-back is the highest-value script here. Trim the spec-path naming (`branch-for` → `spec/<stem>`), the `--spec P` committed-on-base check if v8 does not require it, and prose. The `inspect` step is worth keeping. block-worker-git depends on the marker that the build driver writes (spec-build-driver.js); v8 must write that marker too or the hook is inert. Cross-worktree hook: trim the scratch-worktree exception if v8 has no scratch trees.

## 4. Run cache, queue, plumbing libs

| Path | LOC | What it does | Deps | CLI | Tests | Verdict |
|---|---|---|---|---|---|---|
| scripts/lib/run-cache.js | 118 | "This command already ran green over this tree": tree derivation (git write-tree style), key = hash(tree, command), store under git dir | child_process, crypto, fs, path, host-config | none | tests/run-cache/run-cache.test.js plus 4 consumer tests (fanout-gate-cache, build-driver-gate-cache, review-legs-run-cache, review-driver-close-suite-policy) | COPY (swap `host-config` import for v8's reader) |
| scripts/lib/queue.js | 239 | Item doneness, readiness (after-gates), missing-brief placement for the session queue | brief (51), fs, path | none | tests/queue/queue-overlay.test.js | DROP (tied to briefs and spec status) |
| scripts/spec-queue.js | 734 | Sole writer of `<git-common-dir>/spec-queue.json`: `next`, `list`, `add`, `move`, `done`, `groom`; Jaccard dup refusal, age and gate flags, archive file | child_process, fs, lib/brief, driver-core, observation (78), queue, sync-write, path, pending-question | subcommands; `add --distinct` | tests/queue/spec-queue.test.js, queue-hygiene.test.js, queue-overlay.test.js | REWRITE, tiny (about 120 lines) |
| scripts/lib/frontmatter.js | 77 | `fmBlock`, `fmValue`, `fmMap` over `---` frontmatter | none | none | tests/frontmatter/frontmatter.test.js | COPY |
| scripts/lib/host-config.js | 222 | Sole reader of `.claude/spec.config.json`; `readConfig`, `declaredForge`, policy defaults/validation | fs, path, util | none | tests/host-config/* (policy-block, config-read) | COPY-TRIM (cut policy/capability keys v8 drops) |
| scripts/lib/host-run.js | 69 | Run or print a host command string: cwd, env scrubbing, quoting, `withFiles` | child_process | none | tests/host-run/host-run.test.js, with-files.test.js, real-specs-smoke.test.js; tests/consistency/one-host-runner.test.js (a repo-wide grep pin, drop) | COPY |
| scripts/lib/gate-resolve.js | 81 | Substitute `{testDirs}`/`{scopeDirs}` into `gateCommand` from a spec's File Plan | file-plan, host-run, path | none | tests/review/gate-resolve-test-files.test.js (others are review-leg tests) | COPY if v8 keeps File Plan scoping, else DROP |
| scripts/lib/driver-core.js | 83 | Step-machine frame: `die`, flag pair helpers, `--root`, status.json read/write, step print, checkpoint line | driver-io, fs, path | none | none direct | REWRITE (trivial; v8 should own its driver shape) |
| scripts/lib/driver-io.js | 94 | `runChild` (fail-closed spawnSync), `appendLedger`, sidecar load/save, `writeOut` | child_process, fs, host-run, path, sync-write | none | tests/review/review-driver.test.js, tests/queue/queue-overlay.test.js (indirect) | COPY-TRIM (keep `runChild`, `writeOut`) |
| scripts/lib/sync-write.js | 45 | Looped `fs.writeSync` so `console.log; process.exit` never truncates at the 64 KiB pipe buffer | fs | none | tests/ceiling/sync-write-callers.test.js (a callers-grep pin, drop) | COPY (no direct unit test; write one) |
| scripts/lib/file-plan.js | 108 | Sole parser for a spec's `## File Plan` table | none | none | tests/file-plan/summary-column.test.js, is-tests-row.test.js, multi-table.test.js | COPY if File Plan survives |
| scripts/lib/spec-sections.js | 257 | AC-ID grammar, `##`/`###` section extraction, top-level AC bullet parsing | none | none | tests/ac-matrix/ac-matrix.test.js, rejected-trailing-tag.test.js, red-check/mixed-pin.test.js | COPY-TRIM if v8 keeps AC IDs |
| scripts/lib/util.js | 35 | `isObj`, `escapeRegExp`, `relPosix`, `readJsonSafe` | fs, path | none | none direct | COPY |

Notes:
- All of frontmatter, util, sync-write, host-run, file-plan, spec-sections have zero internal dependencies (or only `fs`/`path`), so they copy cleanly.
- run-cache is the best find: 118 lines, one internal dependency. The test file is self-contained.
- spec-queue: 734 lines is mostly hygiene (Jaccard, age flags, groom, archive file). A v8 queue needs an array in a JSON file plus add/next/done/list.

## 5. Question relay, red-check, preflights, init profiling

| Path | LOC | What it does | Deps | CLI | Tests | Verdict |
|---|---|---|---|---|---|---|
| scripts/pending-question.js | 379 | Lane question relay: sub-agent `write`s a pending question to disk; main session `show/dismiss/consume/mark/answer`; `is-delegated` via a `spec-delegated` marker in the git dir; `stop-policy` | child_process, crypto, fs, path, host-config, question-style-gate (278, validates question style) | `write\|show\|dismiss\|consume\|mark\|is-delegated\|stop-policy\|answer --root --file --key --id --label --by` | tests/delegated/pending-question.test.js, tests/review/delegated-stops.test.js; tests/helpers.js `laneMarkerPath` | COPY-TRIM (drop question-style-gate and stop-policy) |
| scripts/red-check.js | 487 | Verify new tests fail before the fix: derives each tests-layer File Plan file's expected pre-image colour from AC tags, checks out base, runs the test leg, compares | child_process, fs, count-observation, file-plan, glob-match, host-config, host-run, ignored-paths, scan-test-calls (429), spec-sections, sync-write | `--spec --root --base [--json]` | tests/red-check/* (5 files) | REWRITE |
| scripts/env-preflight.js | 155 | Registry of required env vars in config; exit non-zero if unset (a STOP, not a red); `--rules` mode cross-checks registry against rules file | fs, host-config, path | `--root`, `--rules <path>` | tests/env-preflight.test.js | COPY-TRIM (drop `--rules` mode and direnv check) |
| scripts/port-check.js | 163 | Walk `tests/` and report fixed/computed port literals | fs, lib/app-port (66), host-config, sync-write, path | `--root --json` | none direct (indirect: tests/doctor/host-shape-hints.test.js) | DROP (replace by `freePort()` convention in the harness) |
| scripts/init-gen.js | 888 | `probe`, `generate`, `policy-check`, `shapes-check`, `gate-check` | many | many | tests/init-gen/* | split, see below |

red-check 50-line essence (rewrite):
1. Given base ref and a list of new or changed test files, `git worktree add --detach <tmp> <base>` (or `git stash`-free checkout of base) and copy only the new test files over.
2. Run the host test command scoped to those files via `host-run.withFiles(cmd, files)`.
3. Per file expect non-zero exit (red). Zero exit means a vacuous test, report it. Wall-clock timeout (the watchdog tests exist for hangs).
4. Run again on HEAD, expect zero.
5. Exit 0 all as expected, 3 on any violation, print JSON `{file, preImage, postImage}`.
Everything else (AC-tag colour derivation, mixed pins, filtered legs by test title, `scan-test-calls.js`'s 429-line test-call parser) is spec-grammar and can go. Keep tests/red-check/vacuous-green.test.js and red-check-watchdog.test.js as the behaviour list.

init-gen.js split:
- Profiling (wanted): `probe` (lines ~270-310). `probeTestCommand` runs `<cmd> <nonexistent path>` and reports whether the runner fails loudly on no-match (about 8 lines). `probeAtRisk` samples tracked non-test files via `git ls-files` and `scope-reconcile.js --probe-at-risk`. It needs file-shapes.js (68) and glob-match.js (53) and scope-reconcile.js; drop at-risk unless v8 keeps scope reconcile.
- There is NO stack detection or test-command detection in init-gen. The session-authored JSON profile carries the stack and the test command; the script only probes the given command. v8 must write detection itself (package.json scripts, lockfiles, Cargo.toml, pyproject.toml).
- Generation (`generate`, lines ~370-760): validate profile, render rules, agents, skills, patterns script, manifest, gitattributes, settings allow-list merge. This is prose and file emission. Drop.
- `gate-check`/`policy-check`/`shapes-check`: config validators; keep only the `failCountPattern` capture-group check (`patternHasGroup`, 3 lines).

## 6. Evals

| Path | LOC | What it does | Verdict |
|---|---|---|---|
| spec/evals/README.md | about 60 | Explains the suite: `claude plugin eval ./spec --scaffold --trust-plugin --no-publish --tag cheap --allow-tools Bash`; each case runs with and without the plugin; cost table ($2.89 per cheap run) | COPY-TRIM |
| spec/evals/host.sh | 121 | Writes a grounded fake host into the empty eval workspace (config, rules, git init) | COPY-TRIM (regenerate for v8 config shape) |
| spec/evals/{status,queue,doctor,run}/ | each: case.yaml, fixture.sh, prompt.md, graders/*.md (5-6 lines each) | `schema_version: "1.1"` case schema; deterministic graders `tool_used` and `tool_order` (no LLM judge); status/queue/doctor tagged cheap, run tagged heavy | COPY the layout, rewrite the four cases for v8 commands |

Reusable as a pattern: the case.yaml shape, `scaffold_script: fixture.sh`, and the grader markdown (`tool_used` on the command name and the script name) are tiny and generic. The plugin-specific part is only which commands and scripts get named. `tests/evals-suite.test.js` (referenced in the README, not found in the current tests listing; check before relying on it) pinned the shape for free. Evals never run in the gate (paid sessions).

## 7. tests/helpers.js (386 lines)

Reusable parts (about 140 lines): 
- Per-process `RUN_ROOT = mkdtemp(os.tmpdir()/cp-tests-<pid>-)`; `process.env.TMPDIR = RUN_ROOT`, so child scripts calling `os.tmpdir()` land under it; removed once on `exit`, and on SIGINT/SIGTERM/SIGHUP with the signal re-raised. This is the fix for the /tmp inode leak in memory.
- `tmpdir(prefix)`, `runNode(script, argv, opts)` (spawnSync with `process.execPath`, utf8, strips `CLAUDE_CODE_CHILD_SESSION`), `runBash`, `freePort()` (bind :0, close, return).
- `gitRepo(dir, opts)`: creates the git template once per process (init -b main, test identity, one commit, `.gitignore` for worktrees) and clones it with `cpSync` + `COPYFILE_FICLONE`, returns a `g(...args)` helper. Fast.

Plugin-specific, cut: `extractFn`/`evalFns`/`checkWorkflowSyntax` (workflow sandbox), `parseFlatDom` (about 160 lines, review-page DOM shim), `assistantUsageLine`, `writePolicy`, `sliceSection`/`section`/`phrase` (doctrine-prose pins), `laneMarkerPath` (keep only if pending-question is copied). `runNode` hardcodes `SPEC = <repo>/spec`; parameterize.

Verdict: COPY-TRIM to about 130 lines. Yes, it works as the v8 harness. Also copy `scripts/test-stdout-blocking.js`.

## Recommended copy order

1. Direct copies, no dependencies: lib/util.js, lib/sync-write.js, lib/frontmatter.js, lib/host-run.js, lib/run-cache.js (rewire host-config), block-worker-git.sh, tests/helpers.js (trimmed), scripts/test-stdout-blocking.js.
2. Trim and copy: merge-back.sh (+ worktree-include.sh), block-cross-worktree-writes.sh, lib/host-config.js, lib/driver-io.js, env-preflight.js, pending-question.js.
3. Copy only if the matching v8 feature exists: file-plan.js, spec-sections.js, gate-resolve.js, the walkthrough client and connect, proto-overlay.js with proto-stable-id.js.
4. Rewrite from the idea: red-check, queue, driver-core, prototype-driver core, spec-state-gate, init profiling.
5. Drop: lib/queue.js, port-check.js, walkthrough-catalog.js (unless wireframes), init-gen generate/validators, question-style-gate.
