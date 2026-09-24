# 27 — Design canon retirement: the kit is the contract, the approval file is not

Phase: P2 · Depends on: 26 (narrowed via ADR-0030) · Primary workspaces:
spec/commands/{sketch,plan,run}.md, spec/doctrine/{design,mocks}.md,
spec/doctrine/stages/stage-design.md, spec/scripts/{spec-review-driver,spec-status,genesis-driver}.js,
spec/templates/{spec,roadmap-brief,grounding-contract}.md, spec/skills/mock-authoring, tests ·
Risk: T3 (the `design_source` / `design/approval.json` gate leaves plan, run and review; a
command and a stage are deleted; hosts' `design` config block changes meaning) ·
Design stage: no · Expected specs: 3

<!-- Minted 2026-09-24 by the session that ran the 2026-09-23/24 research and spikes (see
     docs/adr/0030). First of four briefs (27 → 28 → 29 → 30) in that order; each is
     independently shippable. This one has no dependency on the hosted service (29). -->

## Result

A UI change is judged by mechanical gates on the code, never by agreement with a parallel
artifact. `/spec:sketch` and the design stage between plan and build no longer exist;
`design_source`, `design/approval.json` as canon, and "authority inverts at built" are gone from
plan, run, review and status. A host's design contract is code: a token file, a component kit,
an intent-to-pattern table in the host's auto-loaded design file, intent-named composite
components, and lint that refuses raw colours, arbitrary values and primitive imports outside
the kit directory. A one-sentence change goes straight to main through those gates with no spec
(the direct lane). `/spec:mocks` keeps running as today over the reviewer package until brief 29
replaces its transport; genesis keeps reading its approval record until brief 30 moves the
design stage inside genesis.

## Current state

`/spec:sketch` (spec/commands/sketch.md, 144 lines) sweeps one brief's surfaces on the mock app
and ratifies into `design/approval.json`. `stage-design.md` (117 lines) runs preflight →
reconcile → look → stamp between plan and build, gated on `design_source` resolving to an
approved-and-current screen. `plan.md` warns on unapproved surfaces and names `/spec:sketch`;
`spec-status.js` derives `design:` / `designed:` from frontmatter; `spec/doctrine/design.md`
(85 lines) states the Design Canon: approval.json is the canon, authority inverts at built.
Measured 2026-09-23 on salon-os (React 19, Tailwind 4, shadcn, custom ESLint rules): zero raw
palette colours, 27 arbitrary values (24 inside the kit folders), 162 kit restyles at 61 places
that collapse to two missing kit variants (Button pill, SheetBody default padding); the
existing `eslint-plugin-tailwindcss` passes `bg-red-500` because the theme never resets the
default palette. Pattern drift measured in the same repo: Sheet at 27 places, the same Button
override at 29 — three interaction patterns for one intent. The mock canon did not prevent any
of it; it sat beside it.

## Scope

1. **Retire the canon gate** (spec 01) — delete `/spec:sketch`, `stage-design.md`, the
   `design_source` / `designed:` frontmatter contract, the run loop's design-due derivation,
   plan's unapproved-surface warning, review's approval checks, the `mock-authoring` skill's
   approval half, and every test pinning them; `spec-status.js` drops `design:`/`designed:`.
   ADR-0030 (a) binds: `design/approval.json` is no longer read by plan, run, review or status
   (mocks and genesis still write and read it until 29/30). Roadmap briefs keep their
   `surfaces` block as structure for genesis and prototypes (brief 28), not as a gate. DELETE
   rows for every retired file; zero-hit grep AC for `design_source`, `designed:`,
   `stage-design`, `spec:sketch` outside docs/ history.
2. **The design contract is code** (spec 02) — `/spec:init` and `/spec:doctor` require and
   verify, in a host with a UI stack: a token file (`@theme` for Tailwind 4 or the stack's
   equivalent), a kit directory, a `DESIGN.md`-class auto-loaded rule surface holding the
   intent-to-pattern table (one row per intent: edit one record, confirm destructive, quick
   inline fix, …) and the voice/tone lines already in the host's product file, and intent-named
   composite components for every row. `/spec:enforce` gains a category for it. ADR-0030 (b)
   binds: no doctrine prose enforces this; the doctor check and the lint do.
3. **Gates** (spec 03) — via `/spec:enforce`'s discovery per stack: shadcn's own lint rules
   (`no-raw-colors`, `no-arbitrary-values`, `no-restyle`) or the hand-written equivalent from
   the 2026-09-23 spike (`token-discipline.js`, ~120 lines, in the spike report), a
   primitive-import ban (`@/components/ui` importable only from the kit directory), the
   `--color-*: initial` reset so the existing Tailwind lint sees palette colours, Impeccable's
   deterministic detectors, and a state-story presence check (every intent-named component has
   a fixture story per declared state). Restyle is **blocked**, not ratcheted, after the host
   folds its existing overrides into variants (host work, one spec per host, not this brief).
   ADR-0030 (c) binds: gates are deterministic scripts wired into the host gate command;
   the reviewer's rubric cites the pattern table but never scores it alone.

## Out of scope

- The prototype command, the freeze contract, RefDiff — brief 28.
- The reviewer package's transport, the hosted service, `/spec:mocks` internals — brief 29.
- Genesis's design stage, Fable's design brief, Storybook journey stories — brief 30.
- Voice-spec linting (write the lines, gate nothing), root-cause grouping of diffs, Storybook
  agentic review, a framework-agnostic contract beyond one principle line — deferred per the
  2026-09-24 cut; each returns only on a measured need.
- json-render for wireframes — watch, not work (queue).

## Grounding

- docs/adr/0030-the-kit-is-the-contract.md — the ruling, the evidence, and (a)–(c).
- docs/adr/0028-the-mock-is-the-app.md — narrowed by ADR-0030: the mock app remains the
  product's source; its approval record stops being a gate on later specs.
- .claude/rules/spec-pipeline.md § Worker Rules — dependency-free scripts; the lint rule is
  hand-written unless the host already carries the tool.
- spec/doctrine/core.md § Incident Policy — a standing guard is a deterministic script.
- Spike reports (2026-09-23, session scratchpad, to be copied under docs/spikes/ by spec 03):
  token lint counts and the hand-written rule; structural diff on one screen.

## Open questions for planning

- Whether `surfaces` blocks stay in roadmap briefs once nothing gates on them, or move into
  the seed's journey grammar only. Default: stay, as structure genesis and prototypes read.
- The exact doctor check shape for "pattern table present and every row has a composite":
  parse the table and grep the kit directory, or require a machine-readable sidecar. Default:
  parse the markdown table; no sidecar.
