---
description: Optional UI design stage — direct Sonnet dispatch authors real, kept components per surface, gated by the host gate and the render gate, a blocking human catalog look once both are green, then the spec reconciled and stamped designed:
argument-hint: <spec path>
---

# Spec Design

For UI-bearing specs (`design: true`) in hosts whose config declares a `design` block (component
catalog — shared § Design Canon). Sits between `/spec:plan` and the build stage; `/spec:run`
runs it when due. Six steps, in order:
**preflight → author → host gate → render gate → your look → reconcile + stamp** — step position
is derived from disk on every invocation (Resume, below), never from a state file or a driver.
Build treats the landed components as done inputs.

**Setup:** run `spec-paths shared-for design` and read its output (the shared invariants scoped
to this command). Read the host's `.claude/spec.config.json` and its pipeline rules file. Either
missing → STOP: run `/spec:init` first.

## Input

`$ARGUMENTS` — path to a spec with `status: hardened` (hook-enforced).

## Resume — derived from disk, evaluated top-down, every invocation

| On disk | Step |
|---------|------|
| `designed:` set | DONE — report, `next: /spec:run <spec>` |
| ledger claim for every surface with `stories` for every state, both gates green this invocation | Step 5 — your look |
| ledger claim present, some state without a story id, or components absent | Step 2 — author |
| no ledger claim for a surface | Step 1 — preflight → Step 2 — author |

A session that dies mid-round re-derives its step from this table on the next invocation —
never from conversation memory. Everything the next step needs is already on disk: components,
story ids, the coverage-ledger claim, and gate reports (the scratchpad or
`.claude/spec-runs/render/`).

## Step 1 — Preflight

In order:

1. `design.render` declared in `.claude/spec.config.json` — else STOP printing the exact JSON
   to add (sub-keys per `spec/templates/grounding-contract.md`):
   ```jsonc
   "design": {
     "render": {
       "capture": "<host command turning one --url into an inventory JSON>",   // REQUIRED
       "url": "<component render URL, {story}/{theme}/{width}/{height}/{state} placeholders>", // REQUIRED
       "ready": "<optional: command exiting 0 once the render server serves>",
       "boot": "<optional: command that starts the render server, killed on exit>",
       "readyTimeout": 120   // optional, seconds, default 120
     }
   }
   ```
2. `node "$(spec-paths env-preflight)" --root .` — exit 1 is a provisioning STOP: print its
   output verbatim and STOP. This precedes every author dispatch (Step 2) and carries
   AC-20260815-05-8's incident forward — an unprovisioned environment must never enter a
   gate-repair loop, because the gate cannot distinguish wrong code from a missing variable,
   and a repair dispatch structurally cannot fix the second.
3. Spec `status: hardened` (hook-enforced).
4. `design_source` resolves to mock file(s) whose `data-status` is `ratified` or `approved` —
   else STOP naming the exact next command: `/spec:sketch <brief>` for a roadmap brief's
   surface, or the **standalone preamble** (below) for a spec with no brief.
5. `node "$(spec-paths design-atlas)" check <mocks>` — fail-closed (shared § Design Canon).
6. `node "$(spec-paths components-check)" design/components.json` — advisory.
7. Derive the **surfaces** (the mocks' `data-screen-label` values) and each surface's
   **states** (its `data-state-btn` values; a mock with none has the single state `default`).

## Standalone preamble (D10) — no `design_source` anywhere, no brief

Five lines, then continue at Step 1:

1. Author `design/mocks/<label>.html` for each of the spec's UI surfaces under the design
   harness (shared § Design Canon): draft framing first (the most-constrained declared viewport,
   light theme), checked by `node "$(spec-paths design-atlas)" check design/mocks/<label>.html`.
2. Iterate to direction approval with the user, then run the **matrix expansion pass** (media
   queries + the tokens dark block, one responsive file, never per-device variants), gated by
   `check --matrix`.
3. Stamp `data-status="approved"` on the mock's root — approval is two-step (direction, then
   the matrix confirm), so the check enforces the matrix on `approved` mocks.
4. Persist the mock path as `design_source:` frontmatter.
5. Continue at Step 1 — preflight now finds a `design_source`.

Roadmap specs never take this path — `/spec:sketch` owns their mocks. A spec with a brief but
no ratified mock STOPs at Step 1 naming `/spec:sketch <brief>` instead of running this preamble.

## Step 2 — Author (direct dispatch)

One `Agent {model: "sonnet"}` per surface — sequential when surfaces share chrome (same mock
family, so a later dispatch can cite the earlier one's output as an exemplar), parallel
otherwise. `subagent_type` = the host `agentMap` entry for the layer whose `routing` globs
match the component directory the spec's UI section names, else `agentMap.default`.

**Inputs are paths only** (shared § Model Placement — orchestrators pass paths, never file contents):
the spec, the mock file, `design/tokens.css`, the host's design doctrine doc
(`design.doctrine`), `design/components.json`, `design/targets.json`, the derived states list,
`design.storyFormat`, and the mock's shell canon path when it declares one. The mock in context
IS the binding map; the shell canon is what surfaces are built **into** — the primitive, never
a re-implemented chrome around it (shared § Design Authoring Contracts, § Design Canon).

Worker dispatch envelope: `{spec, mock, tokens, doctrine, manifest, targets, shell, states:
["default"|…], storyFormat, componentDir}` — `shell` = `design/shell/<name>.html` for the
mock's declared shell, `null` for `none`/undeclared. Worker return (receipts): `{files: [...],
components: [{name, decision: "bind"|"author", nearest, why}], stories: {"<state>": "<story
id>"}, blocked?: {kind, detail, options, recommendation}}`.

**Story rule (D5).** The story bound to a state renders exactly the values the mock illustrates
for that state — the mock's values are the source, never a paraphrase. A story exercising
extra branches is a separate, unbound story. The render gate is the drift detector; its
`text-missing`/`text-extra` findings name the story to fix.

**Base-primitive fork (D12).** A mock region needing an absent base primitive
(Sheet/Dialog/Popover/Drawer/AppShell/Toast host — shared § Design Authoring Contracts) is a fork: the
worker returns `blocked {kind: "design-fork"}`, never a per-surface improvisation. Ask — author
as foundation (Recommended when there is no near-match) / reuse the near-match.

After a green author round, write the returned story ids into the coverage-ledger claim
(`.claude/design-coverage.json`, the claim's `stories` map) plus the claim's `spec`/`at` (D6);
checkpoint-commit the ledger together with the components. Workers never run git — the session
owns every commit.

## Step 3 — Host gate

`design.gateCommand` when declared, else the host `gateCommand` with `{testDirs}` substituted
by the directories the author touched (the same substitution `/spec:build` applies). Red →
re-dispatch that surface's worker with the gate output path, at most 3 rounds, then STOP.

## Step 4 — Render gate

`node "$(spec-paths render-gate)" --spec <spec> --out <report dir>` (default report dir: the
session scratchpad, else `.claude/spec-runs/render/<spec-stem>/`).

- **Exit 0** — pass; proceed to Step 5.
- **Exit 1** — findings (per-surface `text-missing`/`text-extra`/order/role/positioning/
  geometry, or an unbound-state line): re-dispatch the failing surface's worker with the
  report path — the findings ARE the instruction — at most 3 rounds, then STOP with the
  report.
- **Exit 2 or 3** — a precondition or capture-family failure: STOP printing the script's
  remedy verbatim, never a stamp. A capture failure is never green.

## Step 5 — Your look (blocking)

Only after BOTH gates are green. Print the catalog command (`design.command`), the story ids,
and the gate report path. Then `AskUserQuestion` (shared § Question Style — wording is hook-gated):
**approve** (Recommended — the gates already measured what a human cannot overlay) / **change**
(free-text notes).

A change round: one `Agent {model: "sonnet"}` edit dispatch per affected surface, then Step 3
and Step 4 again, then this question again. The session is cold between rounds — all state on
disk.

`AskUserQuestion` dismissed → STOP. State is safely on disk; re-invoke to continue.

## Step 6 — Reconcile + stamp

1. Extend `design/components.json` with every component this run created or newly bound:
   `name`, `purpose`, `props`, `mockRefs`, and — for every `author` decision —
   `authorJustification` copied verbatim from the receipt.
2. One `Agent {model: "sonnet"}` dispatch updates the spec's UI section to the final component
   APIs and states, and folds every excused static→link role line into a Decision row.
3. **Affordance ↔ contract reconcile (blocking).** Before `designed:` is set, check every
   interactive affordance of every approved component (each event prop × each visual state it
   renders in) against a server-accepted transition in the spec's Contracts/Behavior sections.
   An affordance the server would reject is a fork, not a styling choice —
   `AskUserQuestion` (change the component / change the contract via a spec Decision), never
   pass it through to build.
4. Stamp `designed: YYYY-MM-DD` in the spec's frontmatter. `/spec:design` never moves
   `status` — it sets `designed:` only.
5. Checkpoint-commit: spec, ledger, manifest, components, stories.

## Report

Assemble slots and render via `node "$(spec-paths report-render)" --slots <file>`, printed
verbatim. `outcome`: ✅ `designed — {N} components kept, manifest extended, spec reconciled`;
`bullets`: one line per excused static→link role; `warns`: anything that changes the user's
next step; `next`: `{kind: 'command', text: '/spec:run <spec path>'}`.

```report
✅ **designed — 4 components kept, manifest extended, spec reconciled**
⚠️ two auto-excused static→link roles — see spec Decisions

Next: /spec:run specs/20260824/02-example.md
```

## Rules

- **Decisions table is authoritative** — apply it verbatim, never override, never invent
  entries; an unlocked fork is a `blocked` return, not a guess.
- **Workers never run git and never query MCPs**; read-only and generated surfaces change only
  via their declared tools.
- **Component manifest discipline** (shared § Design Authoring Contracts) — every `author` decision
  records the nearest existing manifest entry and one line on why it fails; a missing
  justification is a gate failure. Commitment entries bind exactly like token roles.
- **Tokens and the design doctrine are binding canon** (shared § Design Canon) — extending is normal,
  contradicting is a fork, never silently overridden.
- **Components built here are real and kept** — `/spec:build` wires them, never rebuilds them.
- **Mock supremacy** (shared § Design Authoring Contracts) governs every authoring dispatch; **a
  `built` surface re-entering design re-syncs its mock first** (screenshot the live screen,
  update the file) before designing the change on top — post-`built` staleness discovered here
  was permitted, never a defect.
- **Affordance ↔ contract reconcile is blocking** — the Step 6 matrix runs before `designed:`
  lands; an affordance the server would reject is a fork, never passed through to build.
- The `.design/` sidecar is **not created, read, or audited anywhere in the pipeline** (D13); a
  leftover one on a host is inert and safe to delete by hand.
- `AskUserQuestion` dismissed → STOP.
