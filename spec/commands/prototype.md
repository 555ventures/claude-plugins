---
description: Opens a throwaway worktree on proto/<brief stem> from the host's main branch, wires a dev-only pin overlay into the running app, iterates pin rounds across sessions until the user replies approve, then freezes — captures every route and state, derives one end-to-end test per behaviour pin, exports the data/API layer to harden/<stem>, writes the behaviour-lane spec, and deletes the worktree — driver-stepped, /clear-safe
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
needs: `empty`, `error`, …). Author `design/prototypes/<stem>/states.json` from it, wire the
overlay import into the host's dev entry inside the worktree the driver is about to create (a
one-line `if (import.meta.env.DEV) import('./proto-overlay.js')` or the stack's own dev-only
equivalent — this session picks the line, the driver only verifies some tracked file imports
it), then `node {driver} <brief path> --root . --mark opened`. The driver creates the branch and
worktree, copies the pin overlay and the stable-id module into place with the pins port baked
in, provisions the database through the host's own `dbCreate` script when declared, and verifies
the wiring before advancing to `ROUND`.

## ROUND

The driver's own printed step carries the two `Session:` lines to start in the background —
the host's `runtime.bootCommand` inside the worktree, and `node {driver} <brief path> --root .
serve --port <pinsPort>` — both tracked and stopped before this turn ends, never left resident
past the round. Print the driver's step verbatim, including the `🎨 ready for pins — <url>` line
(or the `dev server is not answering` refusal) and the fixed reply line, then **end the turn**.

JJ Alt+clicks elements in the running app; each pin lands in `pins.json` through the endpoint
the driver just started. On the literal `approve` reply, run `--mark approved`. On anything
else, treat it as a change to apply on `proto/<stem>` — ordinary commits on that branch, worker
git ban included (this session owns the branch's git, no build workers touch it) — then run
`--mark round-done` and re-enter the loop; a round that lands zero new pins still marks (it is
how "nothing more to change" gets recorded).

## APPROVED

Read only: `design/prototypes/<stem>/pins.json`, `docs/design/approval.json` (or the kit
directory when it is absent).

Run `node {driver} <brief path> --root . --mark frozen`. The driver refuses in order — not yet
approved; no composites declared (the kit must exist first, brief 30); no behaviour pins (a
prototype with none is the direct lane in disguise — mark a pin behaviour or close by hand); the
kit gates red on `proto/<stem>` (`design/prototypes/<stem>/gate.log` names the failure);
`prototype.gate` undeclared while `gateCommand` carries an unresolved placeholder; a capture
child's own stderr — each refusal names its own remedy and writes nothing further. On success the
driver has captured every declared route × state, written `contract.json`, and reserved this
freeze's spec path and AC ids; it prints `(APPROVED → TESTS)` and advances.

## TESTS

Read only: `design/prototypes/<stem>/contract.json`, `design/prototypes/<stem>/pins.json`.

The driver's printed step lists one `pin <id> → <AC-ID>` line per behaviour pin, in pin order,
each carrying its screen, state and note, plus the target file (`prototype.e2eFile`, substituted,
authored on **main**) and a `Session:` line. Write one end-to-end test per line — title grammar
`<AC-ID> pin <id>: <note>` — that fails on main today; this session authors them, the driver only
verifies they exist and are counted by the host's own runner. Then run `node {driver} <brief
path> --root . --mark tests-derived`. The driver refuses naming the e2e file when it is missing, a
still-uncounted reserved AC id when the file carries only some of them, or `e2eList` plus the
under-reported id when the file lists every id but the host's runner does not; a refusal after
export or spec-write has already succeeded leaves both in place and resumes at the first undone
step on re-run. On success it exports `harden/<stem>`, appends the brief's sub-plan, writes and
lints the behaviour-lane spec, destroys the prototype database, deletes the worktree and branch,
appends the ledger row, and advances straight to `CLOSED`.

## CLOSED

The driver prints `Read only: contract.json, <generated spec path>` and `Next:` —
`spec-status --next` verbatim, now naming `/spec:run <generated spec>`. Commit
`design/prototypes/<stem>/`, the e2e file, the brief and the generated spec on **main** directly
(direct lane — no build worker touches these). Nothing under `proto/<stem>` is read again; only
`harden/<stem>` and this commit survive.

## Rules

- **Never restate the driver's derivation.** Read its printed step and act; re-deriving state by
  hand from `status.json` is the bug class the driver exists to prevent, and editing that file
  to bypass a mark's ordering refusal is never sanctioned.
- Every file a later build must still read lives under `design/prototypes/<stem>/` on the main
  working tree, committed there directly (never through a build worker) — nothing on
  `proto/<stem>` is read once that branch closes (design.md § Design Canon).
- The pin endpoint (`serve --port <pinsPort>`) runs only while a round is open; never leave it,
  or the host's dev server, resident past the turn that started them.
- A dismissed `AskUserQuestion` STOPs the run — state is already safe on disk; re-invoke cold.
- The Tailscale share line the driver prints is printed, never run — sharing a running round is
  always this session's explicit choice, never automatic.
