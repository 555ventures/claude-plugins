# Design — canonical decisions

## Design Canon: one artifact (specs/20260914/01, specs/20260914/02)

The design stage runs only on hosts whose config declares a `design` block —
`{ "app": "<dir holding mock.config.ts, relative to the repo root>" }`, nothing else. There is
no second artifact: the mock app `/spec:mocks` and `/spec:sketch` author and approve **is** the
product's frontend, never a catalog a build stage renders against separately. A UI-bearing spec
on such a host defaults to `design: true` frontmatter, routed through the design stage between
plan and build; the app gates UI appearance, TDD gates logic, reachability is never exempt.

**Three import layers, one direction.** A screen (`src/screens/<label>.tsx`, under
`design.app`) composes from exactly three layers and nothing else: `@/components/ui` (the
shadcn primitives), `@/components` + `@/shells` (project components and shells built on top of
them), and `@/records` (`src/records` under `design.app` — typed data, the only source a screen
may read; never a hand-typed literal standing in for what a record should supply). An import
outside these is a `layer`-kind error finding (`mock-review check`).

**Screens carry `meta` and named states.** A screen's `meta` export names its states; each
state renders exactly what the seed or the journey's step demands — states are the AC matrix, no
unbound branch, no paraphrase. A project component or shell carries one `/** … */` doc line
above its export and a named `examples` export; a screen missing either is a `doc`-kind error
finding, and a component with neither is invisible to `mock-review sweep`'s own worklist.

**Records are the only data.** `src/records` under `design.app` holds the typed fixtures every
screen state reads from; nothing else on a screen stands in for what a record should supply.

**`design/approval.json` is the canon, one authority lifecycle.** `approval.screens[<label>]`
carries `approvedAt` and a `hash`; a spec's `design_source` resolves, under `<design.app>/`, to
one `src/screens/<label>.tsx` or the directory `src/screens`. A named screen is **approved**
once `approvedAt` is set and its `hash` equals `check --json`'s current `hash` for that screen —
**stale** the moment the hash differs (an edit after approval is a STOP, never a silent
re-bind). Once the claiming spec is `done`, authority **inverts to built**: shipped code is
truth, the screen a historical contract allowed to go stale, re-synced lazily at the next design
touch, never owed.

**Look stops are never questions.** Every look this doctrine governs — the design stage's own
look step, `/spec:sketch`'s exit — prints `🎨 ready for review — <check.serve.url>/#/<screen>`,
one line per surface, then the fixed reply line, then ends the turn; only the literal `approve`
accepts. The reviewer page (the mock app's own served UI) is the one viewer; a session never
screenshots a screen to judge it in this doctrine's place.

## Design Stage: preflight → reconcile → look → stamp (specs/20260914/02)

The design stage is four steps, resumed from disk on every invocation, never a state file:
`designed:` set → done; every named surface approved and current → look; else preflight.

**Preflight**, in order: `design.app` declared (else STOP naming the JSON to add); when
`design/mocks/status.json` exists and its `app` differs from `design.app`, STOP naming both
values (the driver's value wins — it is the one the scaffold wrote); env-preflight;
`status: hardened`; `design_source` resolves, under `<design.app>/`, to one screen file or the
`src/screens` directory — every named screen must carry `approval.screens[<name>].approvedAt`
and a matching `hash`, else STOP naming `/spec:sketch <brief>` (missing → "not approved";
mismatch → "changed since approval") — **the hash rule**; `mock-review check --json` reports
`ok: true`. **Reconcile** folds the spec's UI section to `check --json`'s screens, states and
shells for the named surfaces — an AC naming a state no screen exports is a fork, never a
silent pass — plus the affordance ↔ contract reconcile. **Look** prints the ready-for-review
block and ends the turn; a change reply is one in-session edit round under the `mock-authoring`
skill, then `check`, then re-approval **on the served page** (the hash changes, so the page must
re-stamp `approval.json` before the next preflight passes — this stage never edits it itself).
**Stamp** writes `designed: YYYY-MM-DD` and checkpoint-commits.

A standalone spec with no brief and no `design_source` authors its screens in-session under the
`mock-authoring` skill, approves them on the served page, and persists
`design_source: src/screens/<label>.tsx` before continuing at preflight; roadmap specs never
take this path.

**Design Authoring Contracts.** Grounded-vs-taste (mock supremacy): each ruling is tagged
`grounded` (external anchor) or `taste` (aesthetic); with an approved screen as canon, `taste`
yields silently and `grounded` binds the value, not the intent. Overlay shells, the AppShell,
and the Toast host are system foundation — authored once behind a barrel, never re-implemented
per screen.

## Sketch: the sweep loop (specs/20260914/02)

`/spec:sketch` is the per-brief design workbench on the mock app `/spec:mocks` already produced
— it sweeps one roadmap brief's open items, applies changes in-session, and ratifies each
surface's approval, scoped by construction to the owning brief's labels. A surface claimed by a
`done` spec (its `design_source` names it) is a contract; drift routes to `/spec:run`, never to
sketch.

The loop: run the sweep, act on the brief's labels only (a red item on a screen another brief
owns is an Out-of-scope fence, reported not fixed); triage every change by root cause into one
of five bins before touching anything — **mock-detail** (edited in-session, answered),
**structure** (the brief's `surfaces` block first, then the screen), **intent/scope**
(the brief's Scope, or a cross-brief amendment ADR), a **question back** (answered, resolved
only on the served page), and **architecture-impacting** (never silently absorbed — the
affected or missing ADR is named); every surface touched gains a three-line UX argument
(`# job:`, `# risk:`, `# choice:`) in the brief's `surfaces` block. Critique runs `check` — a
screen missing a seed-required state is a warn finding, never a gate flip. The loop re-sweeps
until every brief label is clean or fenced.

Exit is the look: every brief label approved and current in `design/approval.json`, every
journey through them approved, one ready-for-review line per label, then the turn ends. There is
no separate ratify stamp — approval on the served page is the whole of it.

## Genesis and the mock app (specs/20260914/02)

The mock app pre-empts genesis's tournament and scaffold race. When `<status.app>/mock.config.ts`
exists at `MENUS`, `framework`, `language`, and `packageManager` are already fixed by the app the
user approved in `/spec:mocks` — each auto-picked (`vite-react` / `typescript` / `npm`) and
recorded decided, printed once per run while its dimension stays open; every other dimension
(`testRunner`, …) stays open and priced the ordinary way. The tournament is recorded
`tournament: { skipped: "mock-app" }` at `MENUS` itself, never reaching `FINALISTS`, `RACE`,
`PROBE`, or `PICK`; `DECIDE` proceeds straight on the derived dimensions. A host with no
`<status.app>/mock.config.ts` runs the tournament exactly as before — no behavior change on
brownfield hosts, which never reach genesis anyway.

The mock app is the day-zero skeleton: `SCAFFOLD` runs no `scaffoldCommand` against it, recording
`status.scaffold = { skipped: "mock-app" }`. `--mark skeleton-landed` then refuses unless
`mock-review check --json` reports `ok: true` and the zero-day gate is green — the precondition
that replaces every shell-extraction and component-manifest check that used to run here.

BRIEF's derivation sources are `design/approval.json` (the seed journey count, from its
`journeys` keys) and `design/notes.json` (the open-note count, `status === "open"` across notes
and journey conversations alike) — read directly through `fs` + JSON, never a notes module —
printed as `seed journeys: N · notes open: N`.
