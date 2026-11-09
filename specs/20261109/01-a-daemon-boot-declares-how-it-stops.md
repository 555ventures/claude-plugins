---
date: 2026-11-09
status: hardened
area: prototype
depends_on: [specs/20261108/01-the-host-declares-its-runtime-once.md]
brief: n/a
architecture: true
breaking: false
---

# A daemon boot declares how it stops

## Intent
- You asked: "A daemon boot (runtime.bootCommand exiting 0, e.g. docker compose up -d) is not the driver's app after start: alive() is false, ensure() refuses it as foreign, stop() cannot reach untagged servers. Narrow 20261108/01 D3: an exit-0 boot is the driver's app only while a SPEC_APP-tagged process lives; an untagged daemon needs runtime.stopCommand, and alive = the ready check passes after a successful start by this record." (kept at review)
- I will build:
  - One optional config key, `runtime.stopCommand`: the host's own command that stops the app its boot left running.
  - `lib/app.js` records that command on the app record at start; while it is recorded, the app is alive when its url answers, and `stop` runs the command.
  - A boot that exits 0 and leaves no tagged process, on a host with no `stopCommand`, is refused once it answers, naming the key; the "something already answers" refusal names the key too.
  - `/spec:migrate` keeps the key; docs and ADR-0049 list it and say the reaper cannot see a daemon.
- I will not touch:
  - `lib/reap.js` and its sweep rule (spec 20261108/01 D10), spec 20261108/04's hooks and `host.release`, the ready wait itself (`[asked: wait if exit 0]` stands), `envCommand`, `readyCheck`, the gate.
- Users will notice: a host whose app boots with `docker compose up -d` and declares `runtime.stopCommand: "docker compose down"` opens a prototype, keeps the same app across rounds, restarts it at GATE and has it stopped at `closed` and at every run ending; without the key the first boot stops with one line naming it.
- You lose: nothing — no host under JJ's projects boots a daemon today (nine `bootCommand`s read 2026-11-09, none detach).
- Architecture or behaviour change: yes — ADR-0049's runtime declaration gains `stopCommand`, and its owner bullet gains "a daemon is stopped through its record, never by the reaper", needs your yes
- Client sign-off: a daemon may outlive a session that ends without `closed` (documented; the saved record lets the next open, GATE or `closed` stop it) — approve, "harden and lock" (2026-11-09)

## Goal

On a host whose `runtime.bootCommand` starts a server that leaves the process group and drops `SPEC_APP`, then exits 0, with `runtime.stopCommand` set: `app.start` returns once the url answers, `app.ensure` keeps that app, a GATE restart and `app.stop` run `stopCommand`, and afterwards nothing answers at the url. The same host without `stopCommand` gets exit 2 naming it at the first boot, instead of an app the driver can neither see nor stop.

## Decisions

| ID | Decision | Why |
|----|----------|-----|
| D1 | Config `runtime.stopCommand?` (a command string; no default): run in the worktree with `PORT` in env when a port was allocated. `migrate.js` `RUNTIME` gains `stopCommand`, so `/spec:migrate` keeps it instead of listing it under `runtime keys dropped`. | No existing key runs at stop: `bootCommand` starts, `envCommand` runs once before the first boot, `readyCheck` probes, `setupCommand` provisions a worktree, `release.rollbackCommand` belongs to release. A daemon lives outside the process group and the `SPEC_APP` tag (dockerd's children), so only the host can say how it stops; the plugin names no tool. |
| D2 | `app.start` puts the trimmed `rt.stopCommand` on the record (`rec.stopCommand`) when it is set. When the ready check first passes, the boot's exit file (`<log>.exit`) reads `0`, no process tagged `rec.wt` lives and the record carries no `stopCommand`, `start` throws exit 2 `the boot command exited and left the app at <url> running with no process this driver can stop — set runtime.stopCommand in .claude/spec.config.json to the command that stops it, run that command once in <wt>, then re-run`. Narrows 20261108/01 D3: an exit-0 boot is the driver's app while a tagged process lives, or while its record carries `stopCommand`. | Recording the command beside the pid makes the record the fact (`stop` needs no config, and a config edit between start and stop orphans nothing); a separate `rec.daemon` boolean would be a stand-in for it. The first ready pass is the earliest moment the driver can know the boot detached; JJ's ruling to keep waiting on exit 0 stands, only its ending changes. An app nobody can stop breaks ADR-0049's "stops it at `closed` and at every ending". |
| D3 | `app.alive(rec)` = the leader lives, or a process tagged `rec.wt` lives, or (`rec.stopCommand` set and `host.listening(rec.url)`). `up` (alive and the full ready check) and `ensure` keep their code: an up daemon is kept at ROUND, and `restart: true` stops (D4) and starts it. `stopIfAt` (20261108/01 D11) works unchanged through `alive`. | `alive` takes no config, and the record's url is what the driver showed; the full ready check stays in `up`, so "alive = the ready check passes after a successful start by this record" holds where every decision reads it (ROUND, LOOK, spec 20261108/02's `approved`). `start` already refused a url that answered before the boot, so an answering url under this record is this boot's. |
| D4 | `app.stop(rec)`: after the group and tagged TERM/KILL it runs today, a record with `stopCommand` runs it through `host.run` in `rec.wt` (`PORT` = `rec.port` when set, 60 s timeout, output appended to `rec.log`), then waits up to 5 s for `rec.url` to stop answering. A non-zero exit, a timeout or a url still answering never throws: it writes `⚠️ runtime.stopCommand exited <n> in <wt> — the app at <url> may still run; see <log>` to stderr. The host's command must be idempotent (`docker compose down` is). | `stop` runs after a merge and at a park, where a throw would strand a landed run; the next `start` meets the answering url and D5 names the remedy. |
| D5 | `app.start`'s "something already answers at <url> and this driver did not start it" refusal appends `; a boot that leaves its app running after it exits needs runtime.stopCommand` when `rt.stopCommand` is unset, and `; if an earlier boot left it running, run runtime.stopCommand where it was booted` when set. | A daemon whose record was lost (a worktree removed without `closed`) is indistinguishable from a foreign server; the refusal stays, and the user gets the one remedy that applies. |
| D6 | The reaper cannot see a daemon: `reap.sweep`, spec 20261108/04's `host.release` and its SessionEnd arm read `CLAUDE_PID`, `SPEC_APP` and cwd, and a daemon's processes carry none of them under the repo. No change to `lib/reap.js`. A daemon is stopped only through its record: `prototype.js closed` keeps `app.stop(status.app)` before the worktree goes, and when spec 20261108/04 has landed first (its D2 replaces that pair with `host.release`) this build restores the `app.stop` call ahead of `host.release`. A re-open of the same prototype finds `status.app` and keeps or stops it. A daemon outlives a session that ends without `closed` or a run ending [asked: yes, documented — the next open, GATE or `closed` stops it] | The process table is the reaper's record and a daemon is not in it under this repo; the app record is the only fact that ties it to a worktree. Spec 04's sign-off ("nothing a session starts outlives it") meets a daemon here, so it is asked, not assumed. |
| D7 | Docs: `docs/v8/interface-contract.md` §3 adds `stopCommand?` to `runtime {…}` ("runs at every stop when set; needed when the boot exits and leaves its app running"), §4's prototype row adds the D2 refusal; `docs/v8/architecture.md` §3 config and the `lib/app.js` line name it; `spec/commands/prototype.md` names it in its `runtime` sentence. ADR-0049 (amended in place, `Amended: 2026-11-09, specs/20261109/01`): the declaration bullet lists `stopCommand`, the owner bullet adds "a daemon is stopped through its record, never by the reaper", Consequences add "a daemon boot needs `runtime.stopCommand`". | The docs list what exists; the ADR is the architecture record the next spec builds against. |
| D8 | Tests by execution on tmp hosts, extending spec 20261108/01's files: the daemon stub is `node daemon.js` started with `env -u SPEC_APP -u CLAUDE_PID`, `setsid` and `cd` to a tmp dir outside the repo, writing its pid file and serving after 1 s; the boot exits 0; `stopCommand` is `kill $(cat <pidfile>)`. `tests/app.test.js` rewrites 20261108/01's "exits 0 leaving nothing tagged keeps the wait" case (it now passes `stopCommand`, keeping its AC tag for the wait) and adds D2–D5; `tests/prototype.test.js` adds `closed` over a daemon; `tests/migrate.test.js` adds the kept key. | 01's daemon case boots with no `stopCommand` and asserts a return, which D2 refuses: a predecessor pin this spec rewrites, entered here. |

## File Plan

| Path | Action | Summary |
|------|--------|---------|
| spec/scripts/lib/app.js | MODIFY | D2–D5: `rec.stopCommand`, the daemon refusal, `alive`, `stop` runs the command, the foreign refusal's remedy |
| spec/scripts/migrate.js | MODIFY | D1: `RUNTIME` keeps `stopCommand` |
| spec/scripts/prototype.js | MODIFY | D6: `closed` calls `app.stop` before `host.release` (only if spec 20261108/04 landed first) |
| docs/v8/interface-contract.md + docs/v8/architecture.md + spec/commands/prototype.md | MODIFY | D7 |
| docs/adr/0049-the-host-declares-its-runtime-once.md | MODIFY | D7: amended in place |
| tests/app.test.js + tests/prototype.test.js + tests/migrate.test.js | MODIFY | D8 |

## Acceptance Criteria

- **AC-20261109-01-1**: WHEN `runtime.bootCommand` boots the daemon stub and exits 0 and `runtime.stopCommand` kills it THE SYSTEM SHALL have `app.start` return once the url answers with `rec.stopCommand` set, `app.alive(rec)` and `app.up(rt, rec)` true, `app.ensure(…, {restart: false})` return the same record, `app.ensure(…, {restart: true})` run `stopCommand` and boot a daemon with a new pid, and `app.stop` leave nothing answering at `rec.url` with `app.alive(rec)` false.
- **AC-20261109-01-2**: WHEN the same daemon boot runs with no `runtime.stopCommand` THE SYSTEM SHALL have `app.start` throw exit 2 naming `runtime.stopCommand` and the worktree, only after the url answers.
- **AC-20261109-01-3**: WHEN `runtime.stopCommand` exits 1 THE SYSTEM SHALL have `app.stop` return without throwing and write a line naming `runtime.stopCommand` and the log path to stderr.
- **AC-20261109-01-4**: WHEN a fixed url already answers before the boot THE SYSTEM SHALL have `app.start` throw exit 2 with `this driver did not start it` and `runtime.stopCommand` in the message, with and without the key set.
- **AC-20261109-01-5**: WHEN a prototype on the daemon host reaches ROUND and `--mark closed --force` runs THE SYSTEM SHALL run `stopCommand` before removing the worktree, so nothing answers at the url and the worktree is gone.
- **AC-20261109-01-6**: WHEN `migrate.js --apply` runs on a config whose `runtime` holds `stopCommand` THE SYSTEM SHALL keep `runtime.stopCommand` and print no `runtime keys dropped` line naming it.
- **AC-20261109-01-7**: WHEN the docs are read THE SYSTEM SHALL have ADR-0049, `interface-contract.md` §3 and `prototype.md` name `runtime.stopCommand`, and ADR-0049 say the reaper never stops a daemon.

## Retired criteria

- AC-20261109-01-7 — checked at review: ADR-0049, `interface-contract.md` §3 and `prototype.md` name `runtime.stopCommand`, and ADR-0049 says the reaper never stops a daemon.

## Assumptions

- A1: Spec 20261108/01 lands with `lib/app.js` as at tag `spec-01-runtime-wip-3` (the boot's `<log>.exit` file, the tagged leader, `stopIfAt`) — if false: rebase D2–D4 onto the names it shipped; the seam does not change.
- A2: If spec 20261108/04 builds after this one, its D2 would drop `closed`'s `app.stop`; AC-20261109-01-5 then reddens its gate, so the call survives — if its build rewrites that test instead: the spec 04 build keeps `app.stop` ahead of `host.release`.
- A3: Spec 20261108/04 D6's doc line ("a `bootCommand` must not clear its env … or only its process group is stopped") is written without `stopCommand` — if both land: whichever lands second adds "unless `runtime.stopCommand` is set" to that sentence.
- A4: bash runs the boot's `EXIT` trap when it exits on its own, so `<log>.exit` reads `0` for `docker compose up -d` — if false: D2 reads the leader's exit status from its `wait` instead; AC-20261109-01-2 pins the behaviour.
