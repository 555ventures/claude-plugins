---
date: 2026-08-01
status: hardened
risk: T3
open_markers: 0
area: autopilot
design: false
breaking: false
depends_on: [specs/20260801/01-telegram-adapter.md, specs/20260801/02-session-runner.md, specs/20260801/03-lane-engine.md]
depended_on_by: []
brief: n/a
spiked: 2026-08-01
---

# autopilot 04 — live smoke & standing boot proof

## Goal

Specs 01–03 shipped CLEAN with every seam faked on both sides, and the pipeline's one
executed-verification gate was switched off repo-wide by a `runtime.inert` line that stopped
being true the moment a daemon landed here. This spec closes both halves: a **one-time
supervised live run** proving a real lane drives a real stage against real Telegram and the
real SDK, and a **standing offline boot leg** so "the daemon still starts" is re-checked on
every future review instead of being assumed. Done means a phone tap has demonstrably reached
the model as an answer, the repo's boot smoke actually passes green against a real bootable
process, and a fresh clone can be turned into a running daemon from the README alone.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | The first live run is **question-only**: one `/spec:plan` stage against a throwaway repo. No code is written, no git ref moves. Build/review stages stay out of v1's live proof | User decision 2026-08-01. `/spec:plan` is the most question-dense stage, so it targets the riskiest unknown (does a phone tap reach the model?) with nothing at stake — rejected: full build+merge cycle, whose extra proof is not worth an unattended first run rewriting history |
| D2 | `autopilotd --check` is an **offline preflight**: validate config, resolve `daemon/sdk.js` (forcing the real ESM require), assert the oracle script exists under `specPluginRoot`, construct the adapter and every lane, then exit 0 — **without** starting lanes, polling Telegram, spawning a session, or writing state. Exit 2 on any failure, naming the remedy | The boot check must be deterministic and network-free to sit in a gate. A lazy SDK require means a bare `autopilotd` boot proves nothing — forcing the resolve is the whole point (`session.js:119` loads `./sdk` lazily by design) |
| D3 | `--check` gains **`--hold --ready-file <path>`**: on a passing preflight it writes the ready file and then blocks until signalled, instead of exiting. This — not bare `--check` — is what the boot leg runs | **Refuter-driven (both refuters, execution-verified).** `smoke.sh:80-92` backgrounds `bootCommand` and reports `__SMOKE_FAIL__ boot-crashed` (exit 2) if the process exits before `readyCheck` passes. A one-shot preflight as `bootCommand` would red-gate *every* review — the exact inverse of this spec's purpose |
| D4 | `.claude/spec.config.json`'s repo-wide `runtime.inert` is **replaced** by a real runtime block: `bootCommand` clears any stale ready file then runs `--check --hold`, `readyCheck` is `test -f <ready file>` | The inert reason ("no app process to boot") became false when `autopilot/bin/autopilotd` landed, and nothing re-validated it — that stale exemption is the root cause of three specs passing with zero executed verification. `readyCheck` is executed via `bash -c` (`smoke.sh:99`), so it must be a real command; a preflight failure exits the process and surfaces as boot-crashed, which is the correct verdict |
| D5 | `--state-dir <path>` is implemented (it was promised by spec 03's A5 fallback and never built — `parseArgs` recognizes only `--config`) and defaults to today's `~/.config/autopilot/state` | AC-4 needs a seam to prove the preflight writes nothing, and shipping an AC that depends on an uncontracted flag is how undocumented CLI surface gets invented by a worker |
| D6 | Live ACs are **environment-gated interactive tests** requiring an explicit `AUTOPILOT_LIVE=1` opt-in **in addition to** credentials, each with a bounded wait and a failure message naming the likely cause | A runbook you follow once decays; a re-runnable test is the artifact. The explicit opt-in is refuter-driven: keying activation on credential presence alone means a leftover exported token turns a routine `npm test` into a hang waiting for a tap that never comes |
| D7 | This spec **does not** absorb BRIEF #1's `/spec:sketch` gap. Remote sketching stays deferred and is recorded as an open scope item, not silently folded in | Spec 03 already deferred it explicitly. Folding an unowned scope gap into a smoke spec is precisely how the live-smoke gap itself happened — name it, don't absorb it |
| D8 | The class-level fix — a deterministic check that a spec shipping a bootable entry under an `inert` runtime is a hard finding — is **recorded in `spec/INTAKE.md`**, not implemented here | Fable consult 2026-08-01: fix the instance now, fix the class on its own evidence with a failing test first. Riding a plugin-wide enforcement change on a host smoke spec couples two unrelated blast radii |
| D9 | Operator docs go in the **root `README.md`** as an autopilot section — no `autopilot/README.md` | The standing single-README decision (2026-07-16) holds; the genuine gap is that no doc answers "how do I start this", and a root section fills it without reversing the rule |
| D10 | Live-run evidence (observed output, verbatim) is recorded into this spec's **Assumptions** at build time, retiring 02-A2, 02-A3 and 03-A2 by name | An assumption is retired by observation, not by a passing verdict — this is the record that makes the retirement auditable later |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| autopilot/bin/autopilotd | MODIFY | scripts | `--check`, `--hold`, `--ready-file`, `--state-dir` (D2/D3/D5); header exit-code list updated |
| autopilot/fixtures/preflight-config.json | CREATE | other | token-free, repo-relative fixture config the boot leg checks against |
| .claude/spec.config.json | MODIFY | other | replace `runtime.inert` with a real runtime block (D4) |
| .claude/rules/spec-pipeline.md | MODIFY | doctrine | § Test Rules: sanction the opt-in live suite (the section currently states there is none) |
| spec/INTAKE.md | MODIFY | doctrine | record the stale-`inert` falsifier pin (D8) |
| README.md | MODIFY | doctrine | autopilot operator runbook (D9) |
| autopilot/.claude-plugin/plugin.json | MODIFY | other | bump 0.3.0 → 0.4.0 |
| tests/autopilot/preflight.test.js | CREATE | tests | AC-20260801-04-1..5, AC-20260801-04-12, AC-20260801-04-13 |
| tests/autopilot/smoke-leg.test.js | CREATE | tests | AC-20260801-04-6 |
| tests/autopilot/live.test.js | CREATE | tests | AC-20260801-04-7..9 (all opt-in gated) |
| tests/autopilot/runbook.test.js | CREATE | tests | AC-20260801-04-10, AC-20260801-04-11 |

## Contracts

```
autopilotd [--config <path>] [--state-dir <path>] [--check] [--hold] [--ready-file <path>]

  --config      config file path      (default ~/.config/autopilot/config.json)
  --state-dir   lane-state directory  (default ~/.config/autopilot/state)  [D5, new]
  --check       run the offline preflight instead of starting lanes        [D2, new]
  --hold        with --check: after a PASSING preflight, write --ready-file
                and block until SIGTERM/SIGINT instead of exiting          [D3, new]
  --ready-file  path written on preflight pass; removed on exit            [D3, new]

  Preflight order (all offline): recursion guard → Node floor → parse args → load+validate
  config → require('../daemon/sdk') → assert <specPluginRoot>/scripts/spec-status.js exists
  → construct adapter → construct every lane → PASS.
  Constructing the adapter and lanes performs no I/O; only adapter.start()/lane.start() do,
  and preflight calls neither. It spawns no child process and writes nothing under --state-dir.

  Exit codes:
    0  preflight passed (without --hold), or normal shutdown
    1  forced exit — second SIGTERM/SIGINT during an in-progress shutdown
    2  usage / precondition failure — recursion guard, Node floor, config error,
       unresolvable SDK, missing oracle script (message names the remedy)
```

```jsonc
// .claude/spec.config.json — runtime block replacing the inert declaration (D4).
// bootCommand runs from the repo root. The leading rm makes a stale ready file from a
// killed previous run incapable of producing a false PASS.
"runtime": {
  "bootCommand": "rm -f /tmp/autopilot-preflight.ready && node autopilot/bin/autopilotd --check --hold --ready-file /tmp/autopilot-preflight.ready --config autopilot/fixtures/preflight-config.json --state-dir /tmp/autopilot-preflight-state",
  "readyCheck": "test -f /tmp/autopilot-preflight.ready",
  "readyTimeout": 60,
  "stopSignal": "SIGTERM"
}
```

```jsonc
// autopilot/fixtures/preflight-config.json
// Structurally valid, deliberately non-secret, and REPO-RELATIVE — no placeholder
// substitution exists anywhere in the daemon (config.js only JSON.parses and checks presence),
// so every path here is consumed verbatim and must work from the repo root.
{
  "botToken": "000000000:preflight-fixture-token-not-a-real-credential",
  "supergroupId": -1000000000000,
  "allowedUserIds": [1],
  "specPluginRoot": "spec",
  "pluginPaths": ["spec", "git"],
  "lanes": [{ "project": "preflight", "root": ".", "topicId": 1 }]
}
```

## Behavior

- **Preflight.** Runs after the existing recursion guard and Node-floor check (both keep their
  current exit-2 behavior) and before anything touching the network. The SDK resolve is the
  load-bearing step: it is what makes a missing `autopilot/node_modules` a red gate instead of
  a silent success. The oracle-script existence assertion is the second: a `specPluginRoot`
  pointing nowhere would otherwise only surface as a lane backoff at runtime.
- **State is not written during preflight.** Today `main()` creates the state dir
  unconditionally after a successful config load (`fs.mkdirSync(stateDir, {recursive:true})`,
  after `loadConfig`). Preflight must skip that call entirely — guard it, do not reorder it.
  (An earlier draft of this spec claimed the dir is created *before* the config check; that was
  wrong, and the refuters caught it. The requirement stands; the rationale was corrected.)
- **`--hold` teardown.** On SIGTERM/SIGINT the held process removes `--ready-file` and exits 0.
  `smoke.sh` sends `stopSignal` to the whole process group and escalates to `kill -9` after
  10s, so the handler must not block.
- **The live run (supervised, once).** Operator follows the runbook: install deps, create a
  forum-enabled supergroup with one topic, add the bot, run `/spec:init` on a throwaway repo,
  write a config, start the daemon. The oracle offers a `/spec:plan` pick; the lane posts the
  brief checkpoint; the operator taps ▶; the stage runs and asks real questions in the topic;
  each tap returns an answer the model consumes. Success = the stage completes `done` and the
  spec document it wrote exists on disk.
- **The live tests.** `tests/autopilot/live.test.js` activates **only** when `AUTOPILOT_LIVE=1`
  AND `AUTOPILOT_LIVE_TOKEN`/`_SUPERGROUP`/`_TOPIC`/`_USER` are all set; otherwise every test
  skips by declaration. Each interactive wait is bounded and fails with *"no tap received
  within Ns — check that no other daemon is polling this bot token"* rather than hanging.
- **One poller per token.** Telegram permits a single `getUpdates` consumer per bot token
  (BRIEF #8). The live tests and a running daemon cannot share a token; the runbook says so and
  the timeout message names it as cause #1.

## Acceptance Criteria

- **AC-20260801-04-1**: WHEN `autopilotd --check` runs with a valid config and the SDK installed THE SYSTEM SHALL exit `0` and print a pass notice naming the lane count (one lane → `autopilotd: preflight OK — 1 lane, SDK resolved`) → tests/autopilot/preflight.test.js
- **AC-20260801-04-2**: WHEN `autopilotd --check` runs and `require('../daemon/sdk')` throws THE SYSTEM SHALL exit `2` with a message naming the remedy `cd autopilot && npm install` → tests/autopilot/preflight.test.js
- **AC-20260801-04-3**: WHEN `autopilotd --check` runs against a config missing a required field THE SYSTEM SHALL exit `2` with the same `autopilotd: config missing "<field>" — edit <path>` message a normal start produces → tests/autopilot/preflight.test.js
- **AC-20260801-04-4**: WHEN `autopilotd --check --state-dir <fresh empty temp dir>` completes (pass or fail) THE SYSTEM SHALL leave that directory empty — `fs.readdirSync(dir)` → `[]` → tests/autopilot/preflight.test.js
- **AC-20260801-04-5**: WHEN `autopilotd --check` runs with a config whose `specPluginRoot` contains no `scripts/spec-status.js` THE SYSTEM SHALL exit `2` naming the missing oracle script and the offending `specPluginRoot` value → tests/autopilot/preflight.test.js
- **AC-20260801-04-6**: WHEN `bash spec/scripts/smoke.sh` runs from the repo root against the repo's own `.claude/spec.config.json` THE SYSTEM SHALL print `__SMOKE_PASS__` and exit `0` (not `__SMOKE_INERT__`/exit 4, and not `__SMOKE_FAIL__ boot-crashed`/exit 2) → tests/autopilot/smoke-leg.test.js
- **AC-20260801-04-7** `[env: AUTOPILOT_LIVE]`: WHEN the real Telegram adapter posts a two-option question into the configured live topic THE SYSTEM SHALL receive a message id back and begin long-polling without error → tests/autopilot/live.test.js
- **AC-20260801-04-8** `[env: AUTOPILOT_LIVE]`: WHEN a live question is posted and the operator taps an option THE SYSTEM SHALL resolve the pending ask with an answers object mapping the question text to the tapped label (tapping `Postgres` on `"Which storage?"` → `{"Which storage?":"Postgres"}`) → tests/autopilot/live.test.js
- **AC-20260801-04-9** `[env: AUTOPILOT_LIVE]`: WHEN one real `runStage` runs a `/spec:plan` stage against a throwaway repo with the spec plugin loaded, and the operator answers its questions from the topic THE SYSTEM SHALL return outcome `done` with non-empty `resultText`, and the spec file that stage wrote SHALL exist on disk → tests/autopilot/live.test.js
- **AC-20260801-04-10**: WHEN the root `README.md` is read THE SYSTEM SHALL contain an autopilot operator section naming, in order, the dependency install, the throwaway-repo grounding step, the config file location, the start command, and the stop signal → tests/autopilot/runbook.test.js
- **AC-20260801-04-11**: WHEN `.claude/rules/spec-pipeline.md` § Test Rules is read THE SYSTEM SHALL declare the opt-in live suite and its `AUTOPILOT_LIVE` switch, and SHALL NOT still assert that no environment-gated suite exists → tests/autopilot/runbook.test.js
- **AC-20260801-04-12**: WHEN `autopilotd` starts **without** `--check` THE SYSTEM SHALL CONTINUE TO load config, construct lanes, start the adapter long-poll, and install SIGTERM/SIGINT handlers exactly as before → tests/autopilot/preflight.test.js
- **AC-20260801-04-13**: WHEN `autopilotd` starts with `AUTOPILOT_SESSION=1` in its environment THE SYSTEM SHALL CONTINUE TO exit `2` with the recursion-guard message before reading config, with or without `--check` → tests/autopilot/preflight.test.js

## Assumptions (escalation triggers)

- A1: The installed SDK `0.3.220` exposes the option names spec 02 relies on — **verified by execution 2026-08-01**: `node -e` against `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` reported FOUND for `settingSources`, `permissionMode`, `canUseTool`, `updatedInput`, `plugins`, `cwd`, `abortController`, `model`; `plugins?: SdkPluginConfig[]` with `type: 'local'`; `PermissionResult` allow branch carries `updatedInput?: Record<string, unknown>`. **Note the limit:** `updatedInput` is optional and untyped, so this proves the shape is *permitted*, never that the model consumes it — exactly what AC-9 tests. **If false:** the option surface is one file (`session.js`); re-run the lookup per MCP policy and amend Contracts before touching code.
- A2: `require()` of the ESM-only SDK from CommonJS works here — **verified by execution 2026-08-01**: `node -e "require('./autopilot/daemon/sdk')"` → `SDK require OK — exports: [ 'query' ]` on Node v26.0.0. **If false on another host:** the Node floor (20.19.0) already exits 2 naming it; fallback is a dynamic `import()` inside `sdk.js`.
- A3: `smoke.sh` treats a boot process that exits before ready as a failure and runs `readyCheck` through `bash -c` — **verified by execution 2026-08-01** (refuter repro): a one-shot `bootCommand` yields `__SMOKE_FAIL__ boot-crashed`, exit 2; `bash -c "exit-zero"` → command not found, 127. D3/D4 are built on this. **If false:** the `--hold` mode becomes unnecessary but harmless; `--check` alone would then be the boot command.
- A4: A throwaway repo needs the spec grounding layer (`/spec:init`) before any lane can drive it — the daemon is a no-op on ungrounded repos (BRIEF constraint). **If skipped:** the `/spec:plan` stage STOPs immediately and the live run proves nothing; the runbook makes grounding a numbered prerequisite.
- A5: A forum-enabled supergroup with ≥1 topic, bot added and allowed to post, is a prerequisite no code can create. **If false:** every live AC fails at the first `sendMessage`; the runbook covers creation and the failure message names it.
- A6: One `getUpdates` consumer per bot token (BRIEF #8). **If false:** live tests and a running daemon silently steal each other's updates; the runbook forbids running both concurrently.
- A7: `spec-status --next` on a freshly-`init`ed throwaway repo offers at least one admissible pick. **If false:** seed the scratch repo with one roadmap brief so a `/spec:plan` pick exists; failing that, drive `runStage` directly — AC-9 tests the stage, not the oracle.
- A8: `/tmp` is writable and shared between the smoke process and its `readyCheck` subshell on macOS and Linux. **If false:** move the ready file under the repo (gitignored) — the path appears only in the runtime block.

## Rationale

The root cause of "three CLEAN specs, nothing that runs" was not decomposition — the
adapter/runner/engine slicing with injected fakes is sanctioned and produced genuinely good
unit coverage. It was a **stale exemption**: `runtime.inert` was true when written and became
false when a daemon landed, and nothing re-validated it, so the boot leg that exists precisely
to catch "all legs green on a program that cannot start" was voided for all three reviews. Both
02 and 03 also *named* a live smoke as required — 02's A2 says "STOP and verify live before
spec 03 ships" — but prose with no owner and no gate changes nothing. This spec fixes the
instance (D2–D4) and refuses to fix the class with more prose: the class-level falsifier goes to
INTAKE with a failing test first (D8), per the standing holistic-not-additive rule.

D1's question-only first run follows the user's call and is the right risk ordering anyway: the
one assumption everything rests on is whether a tap becomes an answer the model consumes, and it
is provable with nothing at stake. D6 turns that proof into a re-runnable test rather than a
one-time ritual — accepting that it is interactive by design, because a human tap is the thing
under test.

**Refuter findings, all folded (two independent refuters, 2026-08-01).** Both found the same
critical defect by execution: a one-shot `--check` as `bootCommand` would make `smoke.sh` report
`boot-crashed` on every review, inverting this spec's purpose — hence D3's `--hold`/`--ready-file`
mode and AC-6, which tests the boot leg end to end rather than trusting the config edit. `readyCheck: "exit-zero"` was an invented sentinel and is now a real `test -f` command. AC-4 originally
asserted "no network request, no child process" — unassertable through this repo's black-box
subprocess test mode — and is narrowed to the state-dir guarantee that actually is observable;
the network/no-spawn property survives as a Contracts guarantee, not a false AC. `--state-dir`
was an uncontracted flag invented inside an AC parenthetical; D5 promotes it to a real contract
(and it closes a hole spec 03's A5 already promised). The fixture's `<repo>` placeholders implied
substitution logic that exists nowhere and are now repo-relative literals. A Behavior claim about
state-dir creation order was simply false against `main()` and is corrected in place. Refuter
finding on `.claude/rules/spec-pipeline.md` having no pinning test is fixed by AC-11.

Fragile: A6 (one poller per token) will bite during the live run if a daemon is left running,
and AC-9 depends on local plugin loading headless (02's A3), typings-verified only. If AC-9
fails, suspect plugin loading before suspecting the answer relay.

Deliberately out of scope, named not absorbed (D7): remote `/spec:sketch`, which BRIEF #1 scopes
into v1 and spec 03 deferred. Autopilot v1 is not complete until that is planned or the brief is
amended to drop it — that decision belongs to its own session, not to a smoke spec.

## Canonical Delta

Append to `docs/canonical/autopilot.md`:

**Operational proof.** `autopilotd --check` is an offline preflight — it validates config, forces
the real SDK require (which the daemon otherwise loads lazily), asserts the oracle script exists,
constructs the adapter and every lane, and reports without touching the network, spawning a
process, or writing state. With `--hold --ready-file <path>` it stays resident after a passing
preflight so it can serve as a boot leg: `.claude/spec.config.json` declares it as `bootCommand`
with `readyCheck: test -f <path>`, and the repo no longer declares itself `inert`. The reason the
hold mode exists is worth remembering — `smoke.sh` treats a boot process that exits before
`readyCheck` passes as a crash, so a one-shot preflight would red-gate every review. `--state-dir`
overrides the lane-state location and preflight writes nothing there.

**The exemption lesson.** An `inert` runtime declaration is an exemption with an expiry, and this
one expired silently the moment a bootable entry point landed, voiding executed verification for
three consecutive specs. Re-read the declared reason whenever a repo gains a process.

**Live verification.** Real-world behavior is pinned by a deliberately interactive suite
(`tests/autopilot/live.test.js`) that posts real questions to a real Telegram topic and waits for
a real tap. It activates only under `AUTOPILOT_LIVE=1` plus credentials — credential presence
alone is not enough, so a stray exported token cannot turn `npm test` into a hang. Telegram permits
one `getUpdates` consumer per bot token, so the live tests and a running daemon must never share
one. Operator setup — install, grounding a throwaway repo, config location, start, stop — lives in
the root `README.md`; autopilot ships no README of its own.
