# 0049. The host declares its runtime once

- Status: accepted
- Date: 2026-11-08
- Archetype: n/a (amendment ADR for this plugin repo) · Audience: n/a
- Deciders: JJ + session (specs/20261108/01-the-host-declares-its-runtime-once.md)
- Amends: ADR-0043 — the consequence "A host needs `prototype.url` and `bootCommand` to open";
  the "the app the driver boots" wording of its Decision now names one owner. Everything else in
  ADR-0043 (sentences, lock coverage, pin tests in GATE, LOOK's literal, pictures, close, one
  migration) stands.

## Context

On 2026-11-08 `/spec:prototype` refused a real host (zubu-web: a monorepo booting two
fixed-port apps with one command, whose config declares `runtime.bootCommand` and
`runtime.readyCheck` and no `prototype` block). A four-agent audit found the app had two owners
— `run.js` spawned and killed it through `host.withApp`, `prototype.js` printed a boot line for
the session to type and only polled — so nothing stopped a prototype's app, `approved` was
accepted over a dead one, the host shape was one command, one `{port}` and one url, the ready
check was ignored, `/spec:migrate` filled the boot command from `runtime` only when a
`prototype` block already existed, and the prototype worktree got neither the
`.worktreeinclude` files nor any environment step (v7's `dbCreate`/`dbDestroy` had no v8 heir).
The user's input — copy the production database locally, launch the dev server, make one
address the admin — was a legitimate environment stage the plugin had no hook for.

## Options considered

- **Patch each flaw where it sits** — a `runtime` fallback in `bootCommandOf`, a kill at
  `closed`, a readyCheck poll in prototype.js: three readers of one fact and still two owners.
- **Restore v7's runtime module** — boot, ready, db hooks, smoke; ports mechanisms the v7
  evidence did not show earning their keep, and names tools.
- **One declaration, one owner** (chosen) — the host says once how its app boots, when it is
  ready, which url to show and the one idempotent environment command; a single lifecycle
  module starts, waits, restarts and stops it for every driver, with the pid in the driver's
  state; no step prints a boot line; the old keys move by migration and are refused after.

## Decision

- **The host declares its runtime once**, in config `runtime`: `bootCommand`, `readyCheck` (a
  list of urls or a command), `url`, optional `publicUrl`, `envCommand`, `readySeconds`. The
  plugin names no language, tool, database or default command. `prototype` keeps only
  `picture`, `e2eFile`, `e2eCommand`.
- **One owner of the app.** `lib/app.js` starts the app detached, waits on the host's ready
  check, keeps the pid in `status.json` / `state.json`, restarts it when dead (the prototype
  trusts the host's dev reload between rounds) or at every GATE (the gated tree is the booted
  tree), and stops it at `closed` and at every ending of a run. A fixed url that already answers
  before the start is refused: it is serving some other tree.
- **The Claude session owns the app's life** (added 2026-11-08 after the leaked-servers report).
  The app inherits Claude Code's `CLAUDE_PID` and carries `SPEC_APP=<worktree>`; stop kills
  every tagged process, so a server that detaches itself still dies. Every start first reaps
  processes whose owning session is dead: tagged ones under this repo, untagged ones only by a
  working directory under this repo. No supervisor, TTL, registry or daemon: the process table is the record, read on entry.
  Session hooks and worktree removal reuse the same reaper (specs/20261108/04).
- **An environment stage exists.** A fresh prototype worktree is provisioned like a run
  worktree (`.worktreeinclude` files, `setupCommand`); `runtime.envCommand` runs once per
  worktree before the first boot, with `PORT` in its env and nothing else from the plugin.
- **Migrate over compat.** `/spec:migrate` moves `prototype.bootCommand`/`url`/`publicUrl` to
  `runtime`; a config still holding them is refused naming the migration. No tolerant read.

## Consequences

- A host needs `runtime.bootCommand` (and, for a prototype spec, `prototype.e2eFile` +
  `e2eCommand`); hosts on the old shape run `/spec:migrate` once.
- The session never types a boot line; `host.withApp`, `host.allocApp`, `state.bootCommandOf`
  and both boot-line builders are gone.
- A monorepo with several fixed-port apps opens; its `readyCheck` names every url.
- A boot command that exits 0 (`docker compose up -d`) keeps the wait; once the ready check passes with
  no tagged process alive the server is a daemon's this driver cannot stop, so the start is refused
  naming `runtime.stopCommand` (specs/20261109/01) and nothing is adopted.
- The environment command is the host's own and may be slow or destructive on its side; the
  plugin runs it only where an app runs, never per lane open.

## Applies to

- ADR-0043 — the consequence line named under Amends.
- specs/20261108/01-the-host-declares-its-runtime-once.md — the spec this ADR records.
