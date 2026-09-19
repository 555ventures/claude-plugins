# Spec Design

For UI-bearing specs (`design: true`) in hosts whose config declares a `design` block (the mock
app is the product's frontend — shared § Design Canon). Sits between `/spec:plan` and the build
stage; `/spec:run` runs it when due. Four steps, in order: **preflight → reconcile → look →
stamp** — step position is resumed from disk on every invocation (Resume, below), never from a
state file or a driver.

**Setup:** run `spec-paths shared-for design` and read its output. Read the host's
`.claude/spec.config.json` (its pipeline rules load with that Read — path-scoped, never
re-read). Either missing → STOP: run `/spec:init` first.

## Input

`$ARGUMENTS` — path to a spec with `status: hardened` (hook-enforced).

## Resume — derived from disk, evaluated top-down, every invocation

| On disk | Step |
|---------|------|
| `designed:` set | DONE — report, `next: /spec:run <spec>` |
| every named surface approved and current in `design/approval.json` | Step 3 — look → Step 4 — stamp |
| else | Step 1 — preflight |

A session that dies mid-round re-derives its step from this table, never from conversation
memory — `design.app`, `design/approval.json`, and `mock-review check --json` are all on disk.

## Step 1 — Preflight

In order:

1. `design.app` declared in `.claude/spec.config.json` — else STOP printing the exact JSON to
   add: `"design": { "app": "<dir>" }`, naming the directory that holds `mock.config.ts` one
   level down when one is found, else `"app"`.
2. When `design/mocks/status.json` exists and its `app` differs from `design.app`, STOP naming
   both values with `remedy: set "design": { "app": "<status.app>" }` — the driver's value wins,
   it is the one the scaffold wrote.
3. `node "$(spec-paths env-preflight)" --root .` — exit 1 is a provisioning STOP: print its
   output verbatim and STOP before any dispatch (AC-20260815-05-8: a gate cannot tell wrong code
   from a missing variable, and no repair dispatch can fix the second).
4. Spec `status: hardened` (hook-enforced).
5. `design_source` resolves, under `<design.app>/`, to one `src/screens/<label>.tsx` or the
   directory `src/screens` — every named screen must carry
   `approval.screens[<name>].approvedAt` and `approval.screens[<name>].hash ===
   check.screens[<name>].hash`, else STOP naming `/spec:sketch <brief>` (missing → "not
   approved"; mismatch → "changed since approval").
6. `mock-review check --json` reports `ok: true` (via `lib/mock-cli.js`, contract refusal
   first) — a gate failure STOPs printing the finding verbatim, never a stamp.

## Standalone preamble (D4) — no `design_source` anywhere, no brief

1. Author the spec's screens in-session under the `mock-authoring` skill.
2. Approve each on the served reviewer page (the look stop below, run ad hoc).
3. Persist `design_source: src/screens/<label>.tsx` (one file, or `src/screens` when the spec
   owns several) as frontmatter.
4. Continue at Step 1 — preflight now finds a `design_source`.

Roadmap specs never take this path — `/spec:sketch` owns their screens. A spec with a brief but
no approved screen STOPs at Step 1 naming `/spec:sketch <brief>` instead of running this
preamble.

## Step 2 — Reconcile

One `Agent {model: "sonnet"}` dispatch folds the spec's UI section to `check --json`'s screens,
states and shells for the named surfaces (shared § Design Authoring Contracts). An AC that names
a state no screen exports is a fork — `AskUserQuestion` (add the state / amend the AC), never a
silent pass. The affordance ↔ contract reconcile stays: before `designed:` is set, check every
interactive affordance of every named surface (each event prop × each visual state it renders
in) against a server-accepted transition in the spec's Contracts/Behavior sections — an
affordance the server would reject is a fork, not a styling choice, `AskUserQuestion` (change
the screen / change the contract via a spec Decision), never pass it through to build.

## Step 3 — Look (blocking)

Only after preflight and reconcile are both clean. Print exactly this block, real values, then
**end the turn** — never `AskUserQuestion` (shared § Design Canon: look stops are never
questions). The user looks at the served app, never this session:

  🎨 **ready for review — <check.serve.url>/#/<screen>**

  (one line per named surface)

  Reply  ✅ approve  — or —  ✏️ change <what looks wrong>

Only the literal `approve` accepts → Step 4, which runs `mock-review approve --screen <name>`
(once per named surface) — the served page carries no screen-approve control. Any other reply is
a change round: one in-session edit under the `mock-authoring` skill, then `mock-review check`,
then re-approve via `mock-review approve --screen <name>` — the hash changes on edit, so
`approval.json` must be re-stamped by the verb before the next preflight passes; this stage never
hand-edits `approval.json` itself. No reply → nothing moved; the Resume table lands here again on
the next invocation.

## Step 4 — Stamp

Stamp `designed: YYYY-MM-DD` (this stage never moves `status`); checkpoint-commit the spec.

## Report

Assemble slots and render via `node "$(spec-paths report-render)" --slots <file>`, printed
verbatim. `outcome`: ✅ `designed — {N} surfaces reconciled and approved`; `next`: `{kind:
'command', text: '/spec:run <spec path>'}`.

```report
✅ **designed — 3 surfaces reconciled and approved**

Next: /spec:run specs/20260824/02-example.md
```

## Rules

- **Decisions table is authoritative** — apply it verbatim, never override, never invent
  entries; an unlocked fork is a `blocked` return, not a guess.
- **Shared canon applies verbatim** — § Design Canon (the approval record binds; contradiction
  is a fork), § Design Authoring Contracts (mock — now screen — supremacy; grounded vs taste),
  § Worker Git Ban, § MCP Policy, § Read-Only Surfaces.
- **Screens approved here are real and kept** — the build stage builds from them, never
  rebuilds them.
