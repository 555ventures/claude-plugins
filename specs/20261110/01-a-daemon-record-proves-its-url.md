---
date: 2026-11-10
status: done
area: prototype
depends_on: []
brief: n/a
architecture: true
breaking: false
---

# A daemon record proves its url

## Intent
- You asked: "two spec gaps found at review, needing D2/D3 amended: (1) At prototype OPEN the D2 refusal tells the user to run runtime.stopCommand 'once in <wt>', but setup's undo() deletes that worktree straight after the throw, so the remedy names a place that no longer exists. (2) D3: for a record carrying stopCommand, alive() treats any answer at rec.url as this record's app; that is false after a fixed-port GATE handover, after a dead daemon's {port} is handed to another lane, or when readyCheck never probes the url, so a prototype ROUND keeps and shows an app that is not its own." (q370, amends specs/20261109/01 D2 and D3)
- I will build:
  - Prototype OPEN keeps the worktree when the boot is refused as unstoppable, so the remedy runs where it says; the re-run reuses it.
  - A daemon record is alive only while it is the newest record kept at its url and the url answers.
  - On a host with `runtime.stopCommand`, start refuses a url that answers before the boot even when `readyCheck` is a command.
  - ADR-0049 and the interface contract say so.
- I will not touch:
  - `lib/reap.js`, `host.release`, `app.stop` and `stopCommand`'s run, the ready wait, `ensure`/`up`/`stopIfAt`/`gatePins` code, hosts without `stopCommand`.
- Users will notice: a daemon host with no `stopCommand` gets a remedy whose worktree still exists; after a fixed-port GATE (or a reused port) a prototype ROUND says `⚠️ the app did not come up — something already answers at <url>` instead of showing another lane's app as its own.
- You lose: nothing — a daemon host's prototype no longer keeps an app it cannot prove is its own.
- Architecture or behaviour change: yes — ADR-0049's consequence "(alive = its url answers)" becomes "alive = its url answers and its record is the newest kept at that url"; you said yes 2026-11-10
- Client sign-off: a prototype shows its app only while its record is the newest at that url, and a refused open keeps its worktree — yes (2026-11-10)

## Goal

On a daemon host, `app.alive` is true for a `stopCommand` record only while no later start kept a record at the same url, so a prototype that lost its url to a GATE or another lane restarts (and is refused as foreign) instead of showing that app. A prototype refused at OPEN for having no `stopCommand` keeps its worktree, so "run that command once in <wt>, then re-run" works as written.

## Decisions

| ID | Decision | Why |
|----|----------|-----|
| D1 | `prototype.js` `setup`: a refusal with `kind: 'handoff'` keeps the worktree it made (`undo` runs for every other refusal). `app.start`'s handoff message adds ` with PORT=<port>` after `in <wt>` when the record has a port, and ends `then re-run (the worktree is kept for that)`. The re-run provisions over it (`host.provision` sees it not fresh, `git.worktreeAdd` returns it, no `setupCommand` again) and boots afresh. Rewrites the assertion `the worktree it made is removed` in `tests/prototype.test.js`'s AC-20261108-01-2 daemon case. | The handoff is the one refusal that leaves something booted in the worktree running (`ready` failures stop the app first; `foreign`, `env` and `config` boot nothing), so its worktree is where the remedy must run; for docker compose the project is named after that directory. The status is not saved on a throw, so a `{port}` re-run gets a new port: the message names the old one. |
| D2 | `app.alive(rec)`'s daemon clause becomes: `rec.stopCommand` set, AND `rec` is the newest kept record at `rec.url` (the `spec-app.json` in `rec.wt`'s git dir holds `rec.startedAt`, and no `spec-app.json` under the git common dir, `<common>/spec-app.json` or `<common>/worktrees/*/spec-app.json`, holds the same `url` with a later `startedAt`), AND `host.listening(rec.url)`. Replaces 20261109/01 D3's "an answering url under this record is this boot's". | Every start writes that file and every stop removes it, so it already says who last booted at a url: a GATE handover's `stopIfAt` removes the prototype's file and the run's start writes a later one at the same url; a `{port}` reused by another lane gets that lane's later record. One `git rev-parse --git-common-dir` and a directory read, no new file or key. Limit: a server no driver started, taking a dead daemon's port, is still read as the app (nothing on the machine ties either to the repo). |
| D3 | `app.start`: (a) when `rt.stopCommand` is set, the pre-boot "something already answers at <url>" refusal also fires when `host.listening(url)`, whatever `readyCheck` is; (b) on a ready pass, a `stopCommand` record is adopted when the leader or a tagged process lives or `host.listening(url)`, then its file is written (D2's `alive` needs that file, so `start` cannot call it first). | D2's proof rests on "nothing answered at the url before this boot", which a `readyCheck` command that never probes the url did not check. Scoped to `stopCommand` because only a daemon record is adopted by its url; elsewhere the tagged process is the proof, and a url answering before the boot (a shared proxy in front of `$PORT`) stays the host's. |
| D4 | No change to `up`, `ensure`, `stopIfAt`, `gatePins` or prototype ROUND: they read `alive`. After a GATE handover or a reused port a ROUND's `revive` runs `ensure`, which stops the prototype's record (its `stopCommand` in its own worktree) and starts, meeting the foreign refusal: ROUND prints `⚠️ the app did not come up — something already answers at <url>…`. | The behaviour follows from D2 at every reader (ROUND, LOOK, `approved`, GATE's `stopIfAt`), so no reader grows a branch. |
| D5 | Docs: ADR-0049 (amended in place, `Amended: 2026-11-10, specs/20261110/01`): its Consequences line "(alive = its url answers)" reads "(alive = its url answers and its record is the newest kept at that url)". `docs/v8/interface-contract.md` §4's prototype row: the unstoppable-boot refusal keeps the worktree; a daemon prototype whose url another start took restarts. `lib/app.js` header comment for `alive`. | The ADR is what the next spec builds against. |
| D6 | Tests by execution, extending 20261109/01's daemon stub (one pid file per daemon): `tests/app.test.js` adds D2 (two worktrees of one host, two kept daemon records at one fixed url) and D3a; `tests/prototype.test.js` rewrites the AC-20261108-01-2 daemon case's worktree assertion and adds the re-run. | Grepped: the predecessor assertion is the only test pinning the removed worktree; 20261109/01's daemon tests keep passing (their worktree's own file is written at start). |

## File Plan

| Path | Action | Summary |
|------|--------|---------|
| spec/scripts/lib/app.js | MODIFY | D1 message, D2 `alive`, D3 `start` |
| spec/scripts/prototype.js | MODIFY | D1: `setup` keeps the worktree on `handoff` |
| docs/adr/0049-the-host-declares-its-runtime-once.md + docs/v8/interface-contract.md | MODIFY | D5 |
| tests/app.test.js + tests/prototype.test.js | MODIFY | D6 |

## Acceptance Criteria

- **AC-20261110-01-1**: WHEN a prototype opens on the daemon host with no `runtime.stopCommand` THE SYSTEM SHALL exit 2 naming `runtime.stopCommand` and the worktree, leave that worktree on disk, and WHEN `stopCommand` is then set and run in that worktree and the prototype re-run, print `app up at <url>`.
- **AC-20261110-01-2**: WHEN two worktrees of one host each start a daemon record at the same fixed url (the first stopped by `kill` only, its file kept) THE SYSTEM SHALL have `app.alive` true for the later record and false for the earlier one while the url answers.
- **AC-20261110-01-3**: WHEN a daemon record is stopped through `app.stopIfAt` and another worktree's start then serves the same fixed url THE SYSTEM SHALL have `app.up(rt, old)` false and `app.ensure(rt, old, {restart: false})` throw exit 2 with `this driver did not start it`, never return `old`.
- **AC-20261110-01-4**: WHEN `runtime.stopCommand` is set, `readyCheck` is a command that exits 0, and a foreign server answers at the fixed url before the boot THE SYSTEM SHALL have `app.start` throw exit 2 with `this driver did not start it` before booting.
- **AC-20261110-01-5**: WHEN the docs are read THE SYSTEM SHALL have ADR-0049 say a daemon record is alive only while it is the newest kept at its url.

## Retired criteria

- AC-20261110-01-5 — checked at review: ADR-0049's Consequences line and Amended line, and interface-contract §4's prototype row.

## Assumptions

- A1: A daemon boot's record is written by `start` in every worktree a driver uses (prototype and run worktrees are git worktrees of the repo, so `gitFile` resolves) — if false: D2 reads that record as not kept, so the daemon restarts every ROUND; AC-20261110-01-2 pins it.
- A2: Every lane that can be handed a dead daemon's `{port}` starts its app through `app.start` (prototype and run are the only callers) — if false: that caller writes no record and D2's limit widens; name it in D2.
