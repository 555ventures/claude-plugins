---
date: 2026-11-08
status: done
area: prototype
depends_on: [specs/20261108/01-the-host-declares-its-runtime-once.md]
brief: n/a
architecture: false
breaking: false
---

# Every mark proves its claim

## Intent
- You asked: "spec:prototype does not work as I expected… v7 prototype was working perfectly fine. Something has changed on v8… I want to know is architecturally sound, robust, clean solution."
- I will build:
  - Every driver step prints the plugin version it runs and warns when the installed plugin is newer, telling the user to restart Claude Code.
  - OPEN asks once, in one question, for every runtime and pin-test key the host lacks (`runtime.bootCommand`, `prototype.e2eFile`, `prototype.e2eCommand`) before making a worktree; `contracted` refuses while the pin-test keys are missing.
  - `round-done` is accepted only with a pin made this round and a committed worktree; `approved` only over a live app, with an active pin and a committed worktree.
  - CONTRACTED prints no `▶ when done: --mark closed` line; a brief path that does not exist is refused at OPEN.
- I will not touch:
  - The app lifecycle, config shape and env stage (spec 20261108/01); the contract shape, `pin`/`drop`, pictures, LOOK, the plan lock's coverage check (spec 20261105/14, ADR-0043).
- Users will notice: a `▶ OPEN · spec 8.4.0` header on every step and a `⚠️ … restart Claude Code` line when a stale plugin is running; one question up front instead of a refusal at `/spec:run`; `round-done` and `approved` refuse when nothing was pinned or committed or the app is down; a cold session can no longer close a fresh contract by following the printed line.
- You lose: `round-done` with no pin; `approved` over a dead app; the `--mark closed` suggestion right after `contracted`.
- Architecture or behaviour change: no
- Client sign-off: strict marks and when the pin-test config is asked — JJ chose: `round-done` needs a pin this round and a committed worktree, `approved` needs a live app, an active pin and a committed worktree; all missing keys asked at OPEN in one question, `contracted` refuses while the pin-test pair is missing

## Goal

A session running plugin 8.1.1 fourteen hours after 8.4.0 was installed sees the mismatch on its first step. A prototype on a host with no pin-test config is asked for it at OPEN, once, and cannot reach a contract without it. A `round-done` or `approved` mark that claims a round or an approval that did not happen is refused with the missing proof named.

## Decisions

| ID | Decision | Why |
|----|----------|-----|
| D1 | `lib/driver.js` `render` prints the header as `▶ <STEP> · spec <version>` (version from `<plugin root>/.claude-plugin/plugin.json`; `--json` gains `version`). `lib/state.js` `installedVersion(pluginRoot)` reads `$CLAUDE_CONFIG_DIR`-or-`~/.claude` `/plugins/installed_plugins.json` and returns the `version` of the entry whose `installPath` shares `dirname(pluginRoot)` (the plugin's cache folder), else null (a dev checkout, an unreadable registry). When it differs from the running version every rendered step and every checkpoint line is followed by `⚠️ spec <running> is running but <installed> is installed — restart Claude Code (/clear does not reload plugins)`. `doctor.js` reuses `installedVersion` for the same finding. | A long-lived Claude Code process ran 8.1.1 fourteen hours after 8.4.0 was installed and reported HEAD's bugs plus three already fixed; the plugin has no self-check. The cache parent, not the name, binds the comparison, so the plugin repo's own checkout warns nothing. |
| D2 | OPEN, before `setup`, lists the missing keys among `runtime.bootCommand`, `prototype.e2eFile`, `prototype.e2eCommand` (`e2eFile`/`e2eCommand` are a pair: one set without the other is "missing"). Any missing: the body is `The host's runtime is not declared yet.`, then `Ask the user once (AskUserQuestion, one question, free text per key): <per missing key one line: what it is for and its placeholder — bootCommand "starts the app; $PORT when runtime.url has {port}", e2eFile "the file the pin tests go in; {stem} substituted", e2eCommand "runs one e2e file against APP_URL; {file} substituted">`, then `Set the answers in .claude/spec.config.json, then re-run.`; no worktree is made and the step accepts only `closed`. `contracted` refuses while the pair is missing: `pin tests need prototype.e2eFile and prototype.e2eCommand — set them, then re-mark`. `run.js open`'s refusal stays as the last guard. [asked: all missing keys in one question at OPEN; `contracted` refuses while the pair is missing — JJ, 2026-11-08] | HEAD asks for the boot command at OPEN and refuses the pin-test keys only at `/spec:run`, after the contract, the plan and the lock; doctrine asks once, batched. |
| D3 | `round-done` refuses, exit 2, when no active pin has `round === rounds + 1`: `no pin this round — record each ruling with the pin line, or mark approved`; and when `git status --porcelain` in the worktree is not empty: `uncommitted changes in <worktree> — commit on <branch>, then mark round-done`. `handled` and `rounds` are set only after both pass. [asked: a pin this round and a committed worktree are required — JJ, 2026-11-08] | `round-done` with nothing pinned and nothing committed is a round that did not happen; `handled` then claims ids nobody acted on (spec 14 D4's reason, one step later). |
| D4 | `approved` refuses when `app.alive(status.app)` and the ready check are not both true (`the app is down — re-run to restart it, then mark approved`), when no pin is active (`nothing to approve — pin at least one ruling`), and on a dirty worktree (D3's message with `approved`). The ROUND body with a dead app keeps accepting `closed` only. [asked: a live app, an active pin and a committed worktree are required — JJ, 2026-11-08] | Spec 14's as-built records the loophole: `approved` accepted over a dead app; the contract commit then refuses "nothing to contract" one mark too late. |
| D5 | CONTRACTED's step has no `mark`; `accepts: ['closed']`; its body's bullet reads `Worktree and branch stay until the specs built from this contract are done; then: <closed mark line>`. The `after` hook keeps printing the body under the `contracted` checkpoint. | `▶ when done: … --mark closed` right after the contract tells a cold session to close before any spec is built; the as-built of spec 14 lists `closed` as the mark by inheritance of the frame, not by design. |
| D6 | `resolveStem`: an argument ending `.md` must be a file under the root, else refuse `no brief at <path> — pass a roadmap brief path, idea words or a stem`. Routing by `pos[1] === 'pin' \| 'drop'` also requires `pos[0]` to be an existing stem, so idea words whose second word is `pin` or `drop` open a prototype. | A missing brief path opened fine (`stem` from the basename, `brief` recorded as a path nobody can read); spec 14's as-built lists the routing collision. |
| D7 | Docs: `prototype.md` (OPEN's one question, the two refusals, CONTRACTED's wording), `interface-contract.md` §4 prototype stops and the driver header, `architecture.md`'s `driver.js` line, `doctor.md`'s version finding. Tests by execution: `tests/driver.test.js` (header with a stub plugin.json and a stub registry file under a tmp `CLAUDE_CONFIG_DIR`), `tests/prototype.test.js` (D2–D6), `tests/doctor.test.js` (D1's finding). | The suite is the gate; the stale-plugin case is reproduced with a registry fixture, never a real install. |

## File Plan

| Path | Action | Summary |
|------|--------|---------|
| spec/scripts/lib/driver.js | MODIFY | D1 header, mismatch line, `--json` version |
| spec/scripts/lib/state.js | MODIFY | D1 `installedVersion` |
| spec/scripts/doctor.js | MODIFY | D1 finding through `installedVersion` |
| spec/scripts/prototype.js | MODIFY | D2 OPEN question and `contracted` refusal, D3, D4, D5, D6 |
| spec/commands/prototype.md + spec/commands/doctor.md | MODIFY | D7 |
| docs/v8/interface-contract.md + docs/v8/architecture.md | MODIFY | D7 |
| tests/driver.test.js + tests/prototype.test.js + tests/doctor.test.js | MODIFY | D7 |

## Acceptance Criteria

- **AC-20261108-02-1**: WHEN any driver step renders THE SYSTEM SHALL print `▶ <STEP> · spec <version>` with the running plugin.json's version; WHEN `CLAUDE_CONFIG_DIR` points at a tmp dir whose `plugins/installed_plugins.json` lists an entry with `installPath` beside the running plugin root and a higher `version` THE SYSTEM SHALL append `⚠️ spec <running> is running but <installed> is installed — restart Claude Code` to the step and to the `✅ checkpoint` line, and `doctor.js` SHALL list the same finding; AND WHEN no entry shares the plugin root's parent THE SYSTEM SHALL print no warning.
- **AC-20261108-02-2**: WHEN `prototype.js invoice list page` runs on a host with `runtime.bootCommand` set and no `prototype.e2eFile` THE SYSTEM SHALL print one question naming `prototype.e2eFile` and `prototype.e2eCommand` and not `runtime.bootCommand`, make no worktree and no branch, and accept only `closed`; WHEN all three are missing the question SHALL name all three; AND WHEN the pair is later removed from the config, `--mark contracted --confirmed` at APPROVED SHALL exit 2 naming both keys and write no `contract.json`.
- **AC-20261108-02-3**: WHEN `--mark round-done` runs with no pin made this round THE SYSTEM SHALL exit 2 with `no pin this round` and leave `rounds` and `handled` unchanged; WHEN a pin exists but the worktree has an uncommitted file THE SYSTEM SHALL exit 2 naming the worktree and the branch; AND WHEN a pin exists and the worktree is clean THE SYSTEM SHALL CONTINUE TO set `rounds: 1` and `handled: ['p1']`.
- **AC-20261108-02-4**: WHEN `--mark approved` runs while the app process is dead THE SYSTEM SHALL exit 2 with `the app is down` and no `marks.approved`; WHEN it runs with no active pin THE SYSTEM SHALL exit 2 with `nothing to approve`; AND WHEN the app answers, a pin is active and the worktree is clean THE SYSTEM SHALL CONTINUE TO mark approved.
- **AC-20261108-02-5**: WHEN `--mark contracted --confirmed` succeeds THE SYSTEM SHALL print the CONTRACTED body with the closed mark line inside the bullet text and no line starting `▶ when done:`; AND `--mark closed` SHALL CONTINUE TO be accepted there.
- **AC-20261108-02-6**: WHEN `prototype.js docs/roadmap/99-missing.md` runs THE SYSTEM SHALL exit 2 with `no brief at docs/roadmap/99-missing.md` and create nothing; AND WHEN `prototype.js login pin` runs with no stem `login` THE SYSTEM SHALL open a prototype with the auto stem `login-pin`.

## Assumptions

- A1: Claude Code keeps `installed_plugins.json` under `$CLAUDE_CONFIG_DIR` or `~/.claude/plugins/` with `installPath` per entry (verified on this machine, 2026-11-08) — if false: `installedVersion` returns null and nothing warns; never a refusal on a registry shape.
- A2: Spec 01 lands first (`status.app`, `runtime` keys) — if false: `depends_on` holds the lane.
