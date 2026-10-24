---
description: Opens a throwaway worktree on proto/<stem> from the host's main branch — from an idea in plain words, a roadmap brief, or an existing prototype stem — wires a dev-only pin overlay into the running app, iterates pin rounds across sessions until the user replies approve, then writes a behaviour contract — every pin as a sentence, one picture per route × state, one end-to-end test per behaviour pin — queues the /spec:plan paste, and keeps the worktree until --mark closed — driver-stepped, /clear-safe
argument-hint: <idea in plain words | docs/roadmap/NN-*.md | prototype stem>
---

# Prototype: The Driver-Stepped Pin Loop

Printed by `prototype-driver.js` (`spec-paths prototype-driver`) at each state, derived from
`design/prototypes/<stem>/status.json` plus disk; never restated here.

**Intended model: Sonnet.**

**Setup:** run `spec-paths shared-for prototype` and read its output. Read the host's
`.claude/spec.config.json`. Run `spec-paths prototype-driver` once and keep the printed
absolute path as `{driver}`.

## Input

`$ARGUMENTS` — one of three shapes, derived by the driver in this order: a **brief** (a path to
an existing `docs/roadmap/NN-*.md`; the stem is its basename), a **stem** (a name whose
`design/prototypes/<stem>/status.json` exists), or **words** (anything else: the text is the
idea and the stem is a slug of it). `--stem <name>` replaces the slug before `--mark opened`.
Every round reads this same argument.

## The driver loop

1. Run `node {driver} <arg> --root .`. It prints the current state, a `## Step:` line,
   and a `Read only:` file list.
2. Do that one step exactly as printed.
3. Record it with the step's own printed `--mark …` line — the driver verifies the artifact it
   demands before advancing. Every accepted mark prints `✅ checkpoint — prototype state saved
   (<prev> → <next>); safe to /clear and re-run /spec:prototype <arg>`.
4. Re-run. Repeat until the printed state is `CLOSED`.

## OPEN

Author `design/prototypes/<stem>/states.json` from the driver's printed template, then
`node {driver} <arg> --root . --mark opened`.

## ROUND

Until the overlay is wired, the step carries a `Session:` line asking for the import: a one-line
`if (import.meta.env.DEV) import('./proto-overlay.js')` or the stack's own dev-only equivalent,
committed on `proto/<stem>` — this session picks the line; `--mark round-done` refuses until
some file in the worktree imports the overlay.

The driver's own printed step carries the two `Session:` lines to start in the background —
the host's `runtime.bootCommand` inside the worktree, and `node {driver} <arg> --root .
serve --port <pinsPort>` — both tracked and stopped before this turn ends, never left resident
past the round. Print the driver's step verbatim, including the `🎨 ready for pins — <url>` line
(or the `dev server is not answering` refusal) and the fixed reply line, then **end the turn**.

On the literal `approve` reply, run `--mark approved`. On anything else, treat it as a change
to apply on `proto/<stem>` — ordinary commits on that branch, this session's git only — then run
`--mark round-done` and re-enter the loop; a round that lands zero new pins still marks.

## APPROVED

Read only: `design/prototypes/<stem>/pins.json`, `design/prototypes/<stem>/states.json`.

Run `node {driver} <arg> --root . --mark contracted`. Each refusal names its own remedy (a
prototype that changed no behaviour is the direct lane — mark a pin behaviour or close with
`--mark closed`); on success it prints `(APPROVED → TESTS)`.

## TESTS

Read only: `design/prototypes/<stem>/contract.json`, `design/prototypes/<stem>/pins.json`.

The driver's printed step lists one `pin <id> · <screen> (<state>) · <anchor> · "<note>"` line
per behaviour pin, the target file (`prototype.e2eFile`, `{stem}` substituted, under the
prototype worktree) and two `Session:` lines. Write one end-to-end test per line — title
`pin <id>: <note>` — in the prototype worktree and commit the file on `proto/<stem>`; each test
passes against the prototype and fails against the base. Then run `node {driver} <arg>
--root . --mark tests-derived`.

## CONTRACTED

The driver prints `Read only: contract.json`, its `Reconcile`/`Stray` lines when the rounds left
documents behind, `Commit on main:`, `Next: /spec:plan <contract>` and a `Close (` line. Commit
`design/prototypes/<stem>/` and the stamped brief on **main** directly (direct lane — no build
worker touches them); the ADRs listed under `Reconcile` are settled by `/spec:plan`, never here. `--mark closed` deletes the worktree, branch and database once every spec citing the stem
is done, or to abandon the idea — it is the one mark accepted from any resting state.

## CLOSED

The driver prints `Read only: contract.json` and `Next:` — `spec-status --next` verbatim.

## Rules

- **Never restate the driver's derivation.** Read its printed step and act; editing `status.json`
  to bypass a mark's ordering refusal is never sanctioned.
- Every file a later build must still read lives under `design/prototypes/<stem>/` on the main
  working tree, committed there directly — nothing on `proto/<stem>` is read by any later stage
  (design.md § Design Canon).
- The pin endpoint (`serve --port <pinsPort>`) runs only while a round is open; never leave it,
  or the host's dev server, resident past the turn that started them.
