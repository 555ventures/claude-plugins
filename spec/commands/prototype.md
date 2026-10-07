---
description: Opens a throwaway worktree on proto/<brief stem> from the host's main branch, wires a dev-only pin overlay into the running app, iterates pin rounds across sessions until the user replies approve, then writes a behaviour contract — every pin as a sentence, one picture per route × state, one end-to-end test per behaviour pin — queues the /spec:plan paste, and keeps the worktree until --mark closed — driver-stepped, /clear-safe
argument-hint: <roadmap brief path — docs/roadmap/NN-*.md>
---

# Prototype: The Driver-Stepped Pin Loop

`/spec:prototype <brief>` runs a real, functional prototype for a `Lane: behaviour` brief on
its own throwaway branch — never a second wireframe, never a spec written up front.
`prototype-driver.js` (`spec-paths prototype-driver`) owns the state's sequencing (derived from
`design/prototypes/<stem>/status.json` plus disk, never from chat context) and prints exactly
one step at a time for this session's judgment. This command is a thin shell: it names where
each step's doctrine lives and does what the driver's printed step asks — it never restates the
driver's own choreography.

**Intended model: Sonnet.**

**Setup:** run `spec-paths shared-for prototype` and read its output. Read the host's
`.claude/spec.config.json` — a missing `prototype` block means the host has never declared a
prototype path; the driver itself refuses and names `/spec:doctor` (D1). Run `spec-paths
prototype-driver` once and keep the printed absolute path as `{driver}`.

## Input

`$ARGUMENTS` — a roadmap brief path (`docs/roadmap/NN-*.md`). Every round of this command reads
this same path; the driver derives the brief's stem, branch and worktree from it, never from a
prior invocation's memory.

## The driver loop

1. Run `node {driver} <brief path> --root .`. It prints the current state, a `## Step:` line,
   and a `Read only:` file list.
2. Do that one step exactly as printed.
3. Record it with the step's own printed `--mark …` line — the driver verifies the artifact it
   demands before advancing; a missing or malformed one is refused and demanded again. Every
   accepted mark prints `✅ checkpoint — prototype state saved (<prev> → <next>); safe to
   /clear and re-run /spec:prototype <brief>`.
4. Re-run. Repeat until the printed state is `CLOSED`.

## OPEN

The driver prints a `states.json` template — one route per surface the brief's journeys touch,
one state per branch the prototype must show (`default`, plus whatever named states the round
needs: `empty`, `error`, …). Author `design/prototypes/<stem>/states.json` from it, then
`node {driver} <brief path> --root . --mark opened`. The driver creates the branch and
worktree, copies the pin overlay and the stable-id module into place with the pins port baked
in, provisions the database through the host's own `dbCreate` script when declared, and
advances to `ROUND`.

## ROUND

Until the overlay is wired, the step carries a `Session:` line asking for the import: a one-line
`if (import.meta.env.DEV) import('./proto-overlay.js')` or the stack's own dev-only equivalent,
committed on `proto/<stem>` — this session picks the line; `--mark round-done` refuses until
some file in the worktree imports the overlay.

The driver's own printed step carries the two `Session:` lines to start in the background —
the host's `runtime.bootCommand` inside the worktree (carrying the driver's port as `PORT=<n>`
when the host declares `{port}` in `prototype.url`), and `node {driver} <brief path> --root .
serve --port <pinsPort>` — both tracked and stopped before this turn ends, never left resident
past the round. Print the driver's step verbatim, including the `🎨 ready for pins — <url>` line
(or the `dev server is not answering` refusal) and the fixed reply line, then **end the turn**.

JJ Alt+clicks elements in the running app; each pin lands in `pins.json` through the endpoint
the driver just started. On the literal `approve` reply (the driver's reply line: write the contract), run `--mark approved`. On anything
else, treat it as a change to apply on `proto/<stem>` — ordinary commits on that branch, this
session's git only — then run
`--mark round-done` and re-enter the loop; a round that lands zero new pins still marks (it is
how "nothing more to change" gets recorded).

## APPROVED

Read only: `design/prototypes/<stem>/pins.json`, `design/prototypes/<stem>/states.json`.

Run `node {driver} <brief path> --root . --mark contracted`. The driver refuses in order — not yet
approved; no behaviour pins (a prototype that changed no behaviour is the direct lane — mark a pin
behaviour or close with `--mark closed`); `states.json` unusable; `prototype.picture` undeclared;
a picture command that fails or writes no PNG — each refusal names its own remedy and writes
nothing further. On success the driver has pictured every declared route × state through the
host's own `picture` command and written `contract.json` (every pin as a record); it prints
`(APPROVED → TESTS)`. No gate runs, no kit is required, nothing is exported.

## TESTS

Read only: `design/prototypes/<stem>/contract.json`, `design/prototypes/<stem>/pins.json`.

The driver's printed step lists one `pin <id> · <screen> (<state>) · <anchor> · "<note>"` line
per behaviour pin, the target file (`prototype.e2eFile`, `{stem}` substituted, under the
prototype worktree) and two `Session:` lines. Write one end-to-end test per line — title
`pin <id>: <note>` — in the prototype worktree and commit the file on `proto/<stem>`; each test
passes against the prototype and fails against the base. Then run `node {driver} <brief path>
--root . --mark tests-derived`. The driver refuses a copy left in the main working tree, a file
not committed on `proto/<stem>` or edited since, a pin the file does not carry, a pin the host's
`e2eList` does not list, and a test red under `e2eRun` against the prototype (`e2e.log` names it).
On success it copies the file to `design/prototypes/<stem>/tests/`, completes `contract.json`,
appends the ledger row, queues `/spec:plan design/prototypes/<stem>/contract.json` at the top of
the session queue and advances to `CONTRACTED`; a refusal after a step has succeeded leaves it in
place and resumes at the first undone step on re-run.

## CONTRACTED

The driver prints `Read only: contract.json`, `Next: /spec:plan <contract>` and a `Close (` line.
Commit `design/prototypes/<stem>/` on **main** directly (direct lane — no build worker touches
it). The worktree, branch and database stay: `--mark closed` deletes them once every spec citing
the stem is done, or to abandon the idea — it is the one mark accepted from any resting state
(`ROUND`, `APPROVED`, `TESTS`, `CONTRACTED`).

## CLOSED

The driver prints `Read only: contract.json` and `Next:` — `spec-status --next` verbatim. The
contract and pictures on main are untouched; only the worktree, branch and database are gone.

## Rules

- **Never restate the driver's derivation.** Read its printed step and act; re-deriving state by
  hand from `status.json` is the bug class the driver exists to prevent, and editing that file
  to bypass a mark's ordering refusal is never sanctioned.
- Every file a later build must still read lives under `design/prototypes/<stem>/` on the main
  working tree, committed there directly (never through a build worker) — nothing on
  `proto/<stem>` is read by any later stage (design.md § Design Canon).
- The pin endpoint (`serve --port <pinsPort>`) runs only while a round is open; never leave it,
  or the host's dev server, resident past the turn that started them.
- The Tailscale share line the driver prints is printed, never run — sharing a running round is
  always this session's explicit choice, never automatic.
