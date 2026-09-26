# 27 — Design canon retirement: the kit is the contract, the approval file is not

Phase: P2 · Depends on: 26 (superseded in premise via ADR-0030) · Primary workspaces:
spec/commands/{sketch,plan,run,enforce,init,doctor}.md, spec/doctrine/{design,mocks}.md,
spec/doctrine/stages/stage-design.md, spec/scripts/{spec-review-driver,spec-status,genesis-driver,enforce}.js,
spec/templates/{spec,roadmap-brief,grounding-contract}.md, spec/skills/mock-authoring,
git/commands/merge.md, tests · Risk: T3 (the `design_source` / `design/approval.json` gate
leaves plan, run and review; a command and a stage are deleted; hosts' `design` config block
changes meaning; the merge gate gains a lane exemption) · Design stage: no · Expected specs: 3

<!-- Minted 2026-09-24 (docs/adr/0030), rewritten the same day from the item-by-item
     ratified list. First of the four briefs; execution order is 27 → 30 → 28, with 29
     landing when the walkthrough service's first version runs. No dependency on 29. -->

## Result

A UI change is judged by mechanical gates on the code, never by agreement with a parallel
artifact. `/spec:sketch` and the design stage between plan and build no longer exist;
`design_source`, `design/approval.json` as canon, and "authority inverts at built" are gone from
plan, run, review and status. A host's design contract is code: a token file, a component kit,
an intent-to-pattern table and a naming-convention table (one section per layer) in the host's
auto-loaded rule file, intent-named composite components, and gates that refuse raw colours,
arbitrary values, primitive imports outside the kit directory and off-convention names — wired
per workspace, so a Python backend and a TypeScript frontend each get their own checkers.
Changes travel one of three lanes chosen by the shape of the ask: a one-sentence change with no
behaviour or data change is the **direct lane** and goes through the gates straight to main
with no spec and no branch; a behaviour change is a prototype (brief 28); a schema or API
change is planned first. `/spec:mocks` keeps running as today over the reviewer package until
brief 29's service runs; genesis keeps reading its approval record until brief 30 moves the
design stage inside genesis.

## Current state

`/spec:sketch` (spec/commands/sketch.md, 144 lines) sweeps one brief's surfaces on the mock app
and ratifies into `design/approval.json`. `stage-design.md` (117 lines) runs preflight →
reconcile → look → stamp between plan and build, gated on `design_source` resolving to an
approved-and-current screen. `plan.md` warns on unapproved surfaces and names `/spec:sketch`;
`spec-status.js` derives `design:` / `designed:` from frontmatter; `spec/doctrine/design.md`
(85 lines) states the Design Canon: approval.json is the canon, authority inverts at built.
`/git:merge` refuses a branch without a review row; direct commits to main already happen in
this repository (ledger rows tagged "direct") without a named rule. Measured 2026-09-23 on
salon-os (React 19, Tailwind 4, shadcn, custom ESLint rules): zero raw palette colours, 27
arbitrary values (24 inside the kit folders), 162 kit restyles at 61 places that collapse to
two missing kit variants (Button pill, SheetBody default padding); the existing
`eslint-plugin-tailwindcss` passes `bg-red-500` because the theme never resets the default
palette. Pattern drift measured in the same repo: Sheet at 27 places, the same Button override
at 29 — three interaction patterns for one intent. No naming check exists anywhere in the
pipeline: conventions live in host rule prose and the reviewer reads them. The mock canon did
not prevent any of it; it sat beside it.

## Scope

1. **Retire the canon gate; name the lanes** (spec 01) — delete `/spec:sketch`,
   `stage-design.md`, the `design_source` / `designed:` frontmatter contract, the run loop's
   design-due derivation, plan's unapproved-surface warning, review's approval checks, the
   `mock-authoring` skill's approval half, and every test pinning them; `spec-status.js` drops
   `design:`/`designed:`. ADR-0030 (a) binds: `design/approval.json` is no longer read by plan,
   run, review or status (mocks and genesis still write and read it until 29/30). Roadmap
   briefs keep their `surfaces` block as structure for genesis and prototypes, not as a gate.
   ADR-0030 (d) binds: the three lanes are written once in the pipeline rules; the direct lane
   commits to main through the host gate command with no spec and no branch; `/git:merge`'s
   review-row refusal applies to spec branches only. DELETE rows for every retired file;
   zero-hit grep AC for `design_source`, `designed:`, `stage-design`, `spec:sketch` outside
   docs/ history.
2. **The design contract is code** (spec 02) — `/spec:init` and `/spec:doctor` require and
   verify, in a host with a UI stack: a token file (`@theme` for Tailwind 4 or the stack's
   equivalent), a kit directory, a `DESIGN.md`-class auto-loaded rule surface holding the
   intent-to-pattern table (one row per intent: edit one record, confirm destructive, quick
   inline fix, …) and the naming-convention table (one section per workspace: code
   identifiers, schema objects, API routes, and the wire format at the boundary), and
   intent-named composite components for every pattern row. `/spec:enforce` gains a category
   for it. ADR-0030 (b) binds: no doctrine prose enforces this; the doctor check and the gates
   do. Both tables are authored at genesis by brief 30; this spec only requires and verifies
   them.
3. **Gates, per workspace** (spec 03) — via `/spec:enforce`'s discovery, once per workspace
   (verify at plan time whether discovery assumes one stack per repo; if so, make it
   per-workspace here): shadcn's own lint rules (`no-raw-colors`, `no-arbitrary-values`,
   `no-restyle`) or the hand-written equivalent from the 2026-09-23 spike
   (`token-discipline.js`, in docs/spikes/20260923-design-retool/), a primitive-import ban
   (`@/components/ui` importable only from the kit directory), the `--color-*: initial` reset
   so the existing Tailwind lint sees palette colours, Impeccable's deterministic detectors
   where available, a state-story presence check (every intent-named component has a fixture
   story per declared state), and a **naming gate** per layer: the stack's own naming linter
   for code (typescript-eslint `naming-convention`, ruff `N`), a small script over the schema
   definition (Drizzle / Prisma / SQLAlchemy / migrations) and one over the route table, each
   driven by the host's naming table; the boundary's wire-format rule is checked by Spectral
   when an OpenAPI document exists, else by one script over the generated client types.
   Restyle is **blocked** after the host folds its existing overrides into variants (host work,
   one spec per host, not this brief). ADR-0030 (c) binds: gates are deterministic scripts wired
   into the host gate command; the reviewer's rubric cites the tables but never scores them
   alone.

## Out of scope

- The prototype command, freeze, the harden branch, RefDiff — brief 28.
- The walkthrough service and the plugin's HTTP client — brief 29.
- Genesis's design stage, the design brief, the naming tables' authorship, Storybook journey
  stories — brief 30.
- Voice-spec linting, root-cause grouping of diffs, Storybook agentic review, a restyle
  ratchet, rubric calibration — cut by JJ on 2026-09-24; each returns only on a measured need.

## Grounding

- docs/adr/0030-the-kit-is-the-contract.md — the ruling, the evidence, and (a)–(d).
- docs/adr/0028-the-mock-is-the-app.md — superseded by ADR-0030; its approval record stops
  being a gate here, and the mock app itself retires with brief 29.
- .claude/rules/spec-pipeline.md § Worker Rules — dependency-free scripts; a lint rule is
  hand-written unless the host already carries the tool.
- spec/doctrine/core.md § Incident Policy — a standing guard is a deterministic script.
- docs/spikes/20260923-design-retool/spike-tokenlint.md and token-discipline.js — the counts
  and the hand-written rule; spike-structdiff.md — the structural diff on one screen.

## Open questions for planning

- Whether `surfaces` blocks stay in roadmap briefs once nothing gates on them, or move into
  the seed's journey grammar only. Default: stay, as structure genesis and prototypes read.
- The doctor check shape for "table present and every pattern row has a composite": parse
  the markdown table and grep the kit directory, or require a machine-readable sidecar.
  Default: parse the markdown table; no sidecar.
- How the direct lane is recognised at commit time: a flag on `/git:commit`, or the absence
  of a spec branch. Default: absence of a spec branch; the commit-time escape offer (brief 25)
  still runs.
