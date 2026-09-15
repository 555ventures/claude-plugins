---
description: Design-stage doctrine — one artifact, the mock app itself; Design Canon and Authoring Contracts
---

# Spec Pipeline: Design Doctrine

## Design Canon (the mock app is the one artifact)

The design stage runs only on hosts whose config declares a `design` block —
`{ "app": "<dir holding mock.config.ts, relative to the repo root>" }`, nothing else. There is
no second artifact: the mock app `/spec:mocks` and `/spec:sketch` author and approve **is** the
product's frontend, never a catalog a build stage renders against separately. A UI-bearing spec
on such a host defaults to `design: true` frontmatter, routed through the design stage between
plan and build; the app gates UI **appearance**, TDD gates logic, **reachability is never
exempt** (`plan.md` Phase 2) — skipping design is the user's call, never the model's.

**Three import layers, one direction.** A screen (`src/screens/<label>.tsx`, under
`design.app`) composes from exactly three layers and nothing else: `@/components/ui` (the
shadcn primitives), `@/components` + `@/shells` (project components and shells built on top of
them), and `@/records` (`src/records` under `design.app` — typed data, the only source a screen may
read; never a hand-typed literal standing in for what a record should supply). `react` is the
runtime, not a layer. An
import outside these five specifiers is a `layer`-kind error finding (`mock-review check`).

**Screens carry `meta` and named states.** A screen's `meta` export names its states; each
state renders exactly what the seed or the journey's step demands — no unbound branch, no
paraphrase. A project component or shell carries one `/** … */` doc line above its export and a
named `examples` export; a screen missing either is a `doc`-kind error finding, and a component
with neither is invisible to `mock-review sweep`'s own worklist.

**`design/approval.json` is the canon, one authority lifecycle.** `approval.screens[<label>]`
carries `approvedAt` and a `hash`; a spec's `design_source` resolves, under `<design.app>/`, to
one `src/screens/<label>.tsx` or the directory `src/screens`. A named screen is **approved**
once `approvedAt` is set and its `hash` equals `check --json`'s current `hash` for that screen —
**stale** the moment the hash differs (an edit after approval, never silently re-bound). Once
the claiming spec is `done`, authority **inverts to built**: shipped code is truth, the screen a
historical contract allowed to go stale, re-synced lazily at the next design touch, never owed.

**Look stops are never questions.** Every look this doctrine governs — the design stage's own
look step, `/spec:sketch`'s exit — prints `🎨 ready for review —
<check.serve.url>/#/<screen>`, one line per surface, then the fixed reply line, then **ends the
turn**; only the literal `approve` accepts. The reviewer page (the mock app's own served UI) is
the one viewer; a session never screenshots a screen to judge it in this doctrine's place.

## Design Authoring Contracts

Consumed by the design stage's reconcile step and genesis's design ratification (genesis.md
§ Genesis: Brief State), authored against § Design Canon above.

**Grounded vs taste (mock supremacy).** Each ruling is tagged `grounded` (external anchor —
contrast/a11y, legal/brand, destructive-action safety) or `taste` (aesthetic), authored into the
rule itself, not judged per conflict; an untagged legacy ruling defaults to `taste` unless it
names an anchor. With an approved screen as canon, `taste` yields silently; `grounded` binds the
value, not the intent — snap to what the constraint permits, honor the screen's intent
otherwise; a screen's omission is never evidence against it. With no approved screen, doctrine
is canon; a contradicting note is a fork — local exception or doctrine change, never a silent
override.

**Base primitives.** Overlay shells (Sheet/Dialog/Popover/Drawer), the **AppShell**, and the
**Toast host** are **system foundation** — authored once behind a barrel, never re-implemented
per screen, never improvised. A screen needing an absent primitive surfaces the nearest
primitive and its coverage (author as foundation / reuse), default-authoring when no near-match
exists.

**Reconcile is a fold, never a re-invention.** The design stage's own reconcile step folds the
spec's UI section to `check --json`'s screens, states and shells for the named surfaces; an AC
that names a state no screen exports is a fork — `AskUserQuestion` (add the state / amend the
AC), never a silent pass.

## Workflows Encode Shape, Not Judgment

The plugin's `wf-build.js`, `wf-review.js`, `wf-enforce.js` (and genesis `wf-research.js`) own
ordering, schemas, retry caps, kill rules — deterministic control flow; judgment stays in the
main loop. Screen authoring — `/spec:mocks`, `/spec:sketch` — is direct, in-session dispatch,
never a workflow: no `Agent` dispatch ever writes a screen (subagents run judgment-free checks
only), and taste (fork adjudication, iteration rulings, visual review) never enters one. Never
prompt-engineer findings into existence — an empty findings list is a valid outcome. **No free
text in `args`:** a workflow's `args` is a control channel — paths, ids, enums, booleans, the
host gate command only; prose lives on disk, Read there.

**On-disk handoff** (core § On-Disk Handoff, unchanged here): every cross-stage handoff is a
file, never conversation context — the spec for the per-feature pipeline, genesis's own
artifact spine otherwise; scratch intermediates go to the session scratchpad, never `specs/`.
