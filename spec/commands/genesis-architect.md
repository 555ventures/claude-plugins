---
description: Greenfield architecture genesis — research-driven stack/structure decisions, recorded as ADRs, then scaffold the project and hand off to /spec:init
argument-hint: <project idea — what you want to build, for whom>
---

# Genesis Architect: Decide the Stack, Scaffold the Project

The first greenfield stage. Establishes the project **archetype** and **audience**, runs a
research-backed decision record over the hard-to-reverse architecture decisions, records them as
ADRs, and scaffolds a compiling skeleton with a runnable gate — so `/spec:init` has a real repo to
ground. Heavily interactive: the session owns every `AskUserQuestion` and every file write and is
itself the proposer over the research fan-out (see genesis.md § Genesis: Decision Record (one
proposer)).

**Intended model: Opus** (the genesis judgment concentration point).

**Setup:** run `spec-paths shared-for genesis-architect` and read its output (the shared
invariants scoped to this command), then run
`spec-paths shared-genesis` and Read that too — the genesis-stage supplement covers the archetype
registry, the decision-record doctrine, discovery interview, the genesis state machine and
on-disk handoff. Also run `spec-paths wf-research` once and keep the printed absolute path — it
is the `scriptPath` for the `Workflow` calls below. v1 is **greenfield-only**: if the target
directory already has a real codebase (source files beyond config/scaffold), STOP and tell the user
to run `/spec:init` directly — genesis is for new projects.

## Input

`$ARGUMENTS` — a free-form description of what to build and for whom. May be terse ("a trading
simulator", "a Japanese-market mobile app", "an AI support bot"); intake fills the gaps.

## Phase 0 — Re-entry

If `.claude/genesis/status.json` exists, read it and **verify the named artifacts physically
exist** (stack-descriptor, ADRs, scaffold dir, gate, `docs/roadmap/00-overview.md`) — never trust
the phase enum alone. Resume from the last *verified* phase; report what was found and what is
being resumed. The roadmap has no status enum of its own: `architect: scaffold-complete` with no
`docs/roadmap/00-overview.md` means resume at Phase C.

## Phase 1 — Discovery interview (interactive)

Run intake as a **structured discovery interview**, not a form (genesis.md § Genesis: Discovery
Interview): funnel-shaped (broad vision → narrow constraints), every `AskUserQuestion` batch
lens-tagged and carrying an **"Other / not sure"** escape hatch (your one open
lane). The exception: vision/taste dimensions may stay neutral — everywhere else the derived pick
leads (the research-woven loop's recommended-first rule below governs).

0. **Reflect back first.** Restate `$ARGUMENTS` in your words — what you think is being built, for
   whom, the core job it does — and run one `AskUserQuestion` to confirm/correct *before* any
   elicitation. The confirmed restatement seeds the verbatim goal (anti-drift).

Then batch, broad → narrow — each batch tagged **cold** (user-contextual; the options are yours to
author) or **research-backed** (options built live by `wf-research`):

1. **[Product lens] — cold.** the job & success — the problem solved, and what success looks like in
   ~6 months as an **outcome** (a named behavior change, not a feature). Never embed a metric or
   solution in an option. **Close the measurement loop:** once the outcome is named, one follow-up
   option set — how will we know? (product analytics / a manual proxy / "not measured in v1") — the
   answer is a recorded decision either way; an unmeasured outcome must be chosen, not defaulted
   into. A measured pick becomes an ops-conventions row in Phase A.
2. **[User lens] — cold.** audience & locale scope — global / region / single-country (+ primary
   locale), and the primary user's core need. Sets the locale research context for later batches.
3. **[Scope lens] — cold.** non-goals — present plausible adjacent features; the user marks each
   **In / Later / Won't-this-time**. Recorded exclusions are a focusing device, not a parking lot.
4. **[Architect lens] — archetype cold, the stack research-backed.** First settle the archetype
   (genesis.md § Genesis: Archetype Registry — web-app / mobile-app / conversational-bot / backend-api /
   realtime-trading / cli-devtool / data-ml / desktop-app; for `web-app` the FE/BE/fullstack split),
   hard constraints (must-use services, compliance, performance/budget targets — **never staffing**),
   and any pre-decided pieces — all structural and user-owned. Then run the **research-woven loop**
   over every still-open stack dimension the archetype opens (framework, persistence, component
   library, hosting, …): the options are the current menu, not your prior.

**Research-woven loop** (genesis.md § Genesis: Discovery Interview — the woven loop). For each open
dimension a prior answer opens:

1. Call `wf-research` (`Workflow {scriptPath: <spec-paths wf-research output>}`) with `args` =
   `{stage: "architect", dimensionKeys: [...], briefPath: ".claude/genesis/brief.md", contextPaths:
   [<prior interview-research/*.json>], verifyKeys: [<the version-bearing subset>]}` —
   paths/keys/booleans only. Batch all dimensions one answer opens into a single call.
2. On return, write each menu to `.claude/genesis/interview-research/{dimension}.json`, **stamping
   `fetchedAt`** yourself (the workflow can't — read the date via Bash `date`).
3. Present an `AskUserQuestion` built from the menu: 2–4 options recommended-first by `rank`, each
   option's `tradeoff` + recency in its description ("current as of `<fetchedAt>`"), neutral
   phrasing, the **"Other / not sure"** escape hatch; the rank-1 option is labeled "(Recommended)"
   with the menu's `why_recommended` as the stated reason. **Drop or demote** any option the Haiku
   pass marked `still_current: false`.
4. Record the pick **and its `sources`** to the brief, and mark that dimension **constrained** — it
   then skips the Phase-3 hard-fork ask (genesis.md § Genesis: Discovery Interview — Discovery→Decision bridge).

**Probe once.** When a batch returns "Other / not sure" or an answer is too thin to drive research,
fire **one** focused follow-up batch whose options are the pre-laddered "why does that matter /
which specifically" rungs for that pick. One probe round, never a recursion. If a research call
returns nothing in good time, fall back to a model-knowledge menu stamped `unverified` — never block
the interview.

**Read back for sign-off.** Assemble the answers into a short discovery brief and run a final
confirm `AskUserQuestion` (the read-back gate) before Phase 3 decides. Write
`.claude/genesis/brief.md` incrementally as the interview proceeds and finalize it here: the goal
(verbatim from the confirmed restatement, for anti-drift), the intake answers, the recorded
non-goals, **each research-backed pick with its `sources` and `fetchedAt`**, and the two
machine-keyed sections — `## Research Angles`, `## Open Dimensions` — populated in
Phase 2. Initialize `.claude/genesis/status.json` (`architect: pending`, archetype, localeScope)
from `$(spec-paths templates)/status.json`.

**Discovery is product / user / business / legal only.** Team skill, headcount, ownership, ops
staffing are never asked — Claude is always the implementer, so "team skill" collapses to a silent
default (favor boring, typed, testable stacks Claude implements reliably; a Phase-2 tiebreaker, not
a question).

## Phase 2 — Derive the dimension set (Opus pass)

From the archetype registry + audience scope:

- Select the **research-angle keys** (archetype angles + cross-cutting `scope-discipline`,
  `competitive-teardown`, `accessibility`, and the locale bundle if non-global). Expand each into
  a focus paragraph under `## Research Angles` in the brief.
- List the **hard-to-reverse dimensions** (shared list) under `## Open Dimensions`, each marked
  *constrained* (user pre-decided **or settled in the Phase-1 research-woven loop**) or *open*, and
  flagged hard-to-reverse. A dimension the user picked from a research-backed menu is constrained —
  its ADR may carry a `minority_position` sourced from the menu's non-picked ranks but is never
  reopened as a hard fork.
- For each still-*open* dimension, keep the Phase-1 `.claude/genesis/interview-research/*.json`
  files on hand as `contextPaths` — Phase 3's decision record reads them directly, and any second
  perspective on a hard fork is a fresh `wf-research` call over a **different** `dimensionKeys`
  slice (partitioned evidence) passing them so the new call builds on prior research instead of
  re-fetching.

## Phase 3 — Decide (one proposer)

The session is the proposer (genesis.md § Genesis: Decision Record (one proposer)). Repeat until
no open hard forks remain:

1. Read every open dimension's `.claude/genesis/interview-research/{dimension}.json` (plus any
   partitioned second leg) and write the decision record directly into that dimension's ADR:
   `## Options considered` copied from the menu's ranked options, `## Decision` the pick.
2. For each dimension that is a **hard fork** — two menu options within one rank of each other, or
   a user hesitation signal — run `AskUserQuestion`: options **verbatim** from the menu, each
   option's `tradeoff` in its description, rank 1 first labeled "(Recommended)" with
   `why_recommended` as the stated reason. Record the ruling and every non-picked ranked option,
   every `is_minority` option, and the user's rejection into the brief's decisions notes (they
   become ADR `## Dissents`). Dismissed → STOP.
3. If a ruling opens a deeper dimension, start a **fresh** `wf-research` round scoped to only the
   new `dimensionKeys` (prior results via `contextPaths`) before resuming this loop.

## Phase A — Decide & commit (reversible)

1. Write `docs/adr/NNNN-*.md` per `$(spec-paths templates)/adr.md` for each hard-to-reverse
   decision — one reason per decision, `## Dissents` **required** (non-empty or the explicit "None"
   line).
2. **Write the ops-conventions ADR** (`docs/adr/NNNN-operational-conventions.md`, one ADR, one
   table). Robust software is mostly conventions-under-load, and in a greenfield repo nobody else
   ever decides them — `/spec:init` can only extract what exists. Rows (a floor, not a ceiling —
   add any convention-under-load the research surfaces): **error taxonomy** (the error shape/base
   classes and user-facing vs internal split — binding for **every process entrypoint** (workers,
   queue handlers, seeds, scheduled/sync tasks), never only the serving path, and exception text
   persisted anywhere — DB columns, event payloads, stdout — goes through the taxonomy, never a
   raw exception string; measured 3-for-3 across audited hosts: the request path got the
   discipline, every background path hand-rolled its own), **logging** (structured or not, shape,
   what is never logged — same every-entrypoint scope: a worker or seed script rolling its own
   logger without the redaction list violates this row, it is not a local style choice),
   **naming & identifiers** (casing and plurality for tables/columns/indexes/
   constraints; primary-key strategy AND id-minting — one generator module + prefix registry;
   per-surface casing ownership — DB vs wire vs logs vs analytics tags — with the boundary
   stated, and per surface the file globs that constitute it plus its decided spelling
   exemplars, so a later reader can tell a boundary crossing from a typo),
   **wire representations** (decided once at the contracts seam: non-JSON-native types
   such as bigint/decimal money, timestamp form on the wire — UTC-only vs offsets tolerated —
   and the discriminator field name), **cross-plane constants** (any literal referenced on
   both sides of a language/process seam — env var names, header and auth-scheme names,
   queue/topic names, redaction key lists — lives in the generated contracts surface or
   carries a test that pins both sides to one source; a value mirrored by hand and "kept in
   sync by comment" is a silent-outage class, banned; checker-enforceable — the same seam the wire row decides,
   applied to identifiers instead of types), **env/config management** (file layout, secrets never in
   git, the sanctioned secret store), **CI** (the gate runs on every push — wired in Phase B),
   **background/async work** (in-process, queue, or none-in-v1), and **success-metric
   instrumentation** (the Phase 1 measurement pick — the analytics seam, or "not measured in v1").
   These are boring-default rows the session fills from the research; `AskUserQuestion` only on
   a genuine fork (e.g. a paid observability vendor, or the concrete id scheme — ULID vs nanoid
   and the prefix table are a product-owner pick; that one generator module exists is not). A
   DECIDED row in a category `/spec:enforce` can mechanize is stated **checker-enforceable** — no
   taste clauses ("strict plural", never "plural where natural reads better"); the rejected taste
   variant goes in Dissents. Each row is DECIDED or DEFERRED-with-reason — same ledger
   discipline as the design canon. The rows above are samples of one **generating question**
   — *"what will two context-free executors, weeks apart, decide differently unless a row
   decides it now: every value class crossing a surface boundary, every name a second writer
   will mint, every operational behavior a spec will assume but never state?"* After filling
   the dictated rows, run one **derive pass** against that question — walk the research and
   the archetype's value-crossing boundaries (its API seams, storage, logs, external
   integrations: the same axis the casing-ownership row enumerates) and propose rows the
   floor missed; derived rows follow the same fill discipline as dictated ones (boring
   defaults, `AskUserQuestion` only on a genuine fork). Then the **coverage check**: a
   second same-session read of the finished table against the generating question, whose
   only outputs are added rows or nothing — it writes no certification and asks nothing
   new. Both passes are **advisory** — the coverage checker shares the deriver's blind
   spots (same-model correlation, the reason review doctrine forbids same-context
   verification), so derivation can add rows but its silence never certifies completeness.
3. Write `.claude/genesis/stack-descriptor.json` (template via `spec-paths templates`): archetype,
   localeScope, language, framework, packageManager, testRunner, linter, typechecker,
   componentLibrary, designCatalog, `enforceEngines`, the resolved **`gateCommand`**, the
   `scaffoldCommand`, and `decisionRecords`.
4. Commit (the session owns git). Set `status.architect: decisions-recorded`, stamp `lastUpdated`.

## Phase B — Scaffold & gate (irreversible, idempotent)

1. Run the `scaffoldCommand` (the chosen `create-*` tool) into the project root.
2. **Land the test + CI skeleton** — the enforcement half of the ops ADR, day zero:
   - one **example test per declared layer** (trivial but real — it exercises the runner and
     shows the convention the `tests`-kind agent will follow), and the **e2e harness stub** when
     the archetype warrants one (web/mobile/desktop): installed, one smoke test, wired into a
     script — so `/spec:build`'s TDD never meets a repo where the harness itself is missing;
   - a **CI workflow** for the repo's forge (detect from the remote; **no remote → ask the
     user now**: connect one, or explicitly record CI-inert in the descriptor — a written
     workflow with no remote executes zero times, and "authored but never activated" is the
     failure class this stage must not seed; `/spec:init`'s manifest check verifies whichever
     was chosen) that runs `setupCommand` then `gateCommand` on every push/PR. An enforcement
     rule that only runs on a developer's machine is advisory, not enforced;
   - the **runtime substrate the archetype implies** — a health/liveness route (bootable
     archetypes), a seed entry point stub, and local service provisioning (compose file or
     script) wherever the scaffold's `.env.example` references services nothing creates. These
     are what `/spec:init`'s runtime block, verify skill, and smoke leg will bind to — cheaper
     to land here, while the scaffold tool's conventions are hot, than to retrofit at init.
3. Run the **zero-day gate** — the descriptor's `gateCommand` (typecheck + lint + the example
   tests, lint at `--max-warnings 0` where supported). Fix scaffold-level issues only; do not
   start feature work.
4. On green, commit. Set `status.architect: scaffold-complete`, write `gateCommand` into
   `status.json`. A failed Phase B re-runs Phase B only, against the committed decisions.

## Phase C — Roadmap: decompose into planning briefs

Runs immediately after the zero-day gate is green, **while the interview, decision, and ADR
context is still hot** — this decomposition is half-formed in the session already; a later session would
pay full price to reconstruct it worse. The roadmap is what makes the pipeline invocable after
setup: without it, genesis ends and the user has no unit to hand `/spec:plan`.

The two format contracts are templates: `$(spec-paths templates)/roadmap-overview.md` and
`$(spec-paths templates)/roadmap-brief.md` — Read both first. The governing principle: **briefs
are stable intent; specs are perishable execution detail.** Briefs cite ADRs (also stable) and
are hydrated into specs lazily, one `/spec:plan` session at a time, when "Current state" can be
written against real code. Never pre-plan the whole roadmap into specs.

1. **Decompose.** Slice the confirmed goal + ADRs into ordered briefs, each sized to one
   planning session (1–4 specs; a brief whose Scope can't be told in ~1 page splits). Slice by
   **landing unit** (each brief leaves the system green and demonstrable), never by layer.
   **An ops-conventions row records a choice, never scaffolds its mechanism:** the
   facade/runtime an ops decision implies (queue wrapper, enqueue helper, analytics seam)
   lands in the same brief as its **first consumer** — never as a standalone infrastructure
   brief, and never wired into boot for an empty registry (measured: two audited hosts each
   carried a well-tested dead queue facade every review re-flagged).
   Wire `depends_on` as a DAG; assign phases (P0 = walking skeleton → first milestone → …);
   derive milestone gates from the Phase-1 success outcome (observable states, not feature
   lists). Design column: `yes` only for user-facing briefs in archetypes whose design stage
   isn't `none` — and every `yes` brief carries a `## Surfaces` fenced block (screen labels +
   journey edges, names and arrows only; the template documents the grammar) so the design
   atlas can render the whole-product journey and its gaps. Seed the **ops track** with external clocks (OAuth registrations, hosting
   provisioning, partner asks) and the **parking lot** with the Phase-1 "Later / Won't-this-time"
   answers — recorded so they stop leaking into briefs; promotion out requires an amendment
   ADR applying to the receiving brief.
2. **Confirm the sequence.** One `AskUserQuestion` round presenting the proposed sequence table
   (brief names, phases, dependencies, milestone gates) before writing files. Dismissed → STOP.
3. **Write** `docs/roadmap/00-overview.md` + one `NN-{kebab}.md` per brief. Post-genesis
   product-shape decisions are amendment ADRs whose effects are edited into the briefs they
   name at decision time (the overview states the rule; adr.md template § Applies to) — no
   side-channel amendment dir exists. **Never write a status column** —
   per-brief status is derived from specs' `brief:` frontmatter (`/spec:status`), not tracked.
4. **Self-check (checklist, not a workflow):** no `depends_on` cycles; every ADR is carried by
   ≥1 brief's Grounding or is genuinely cross-cutting (note which); no two briefs claim the same
   scope; each milestone gate is satisfiable by the briefs sequenced before it; brief 01 depends
   on nothing and is plannable immediately after `/spec:init` + `/spec:enforce`.
5. Commit.

## Phase D — Report & hand off

Assemble the slots object (shared § Console Output Style — `report-render.js` is the sole
render authority; commands assemble slots and print its output verbatim):

- `outcome`: `✅ architected — scaffold green, {N} ADRs, roadmap of {M} briefs` when Phase C
  commits; `⚠️ {what needs the user}` when it stops short.
- `bullets`: `{archetype} for {audience}; gate: {resolved gate command}`; one
  `{decision made — ADR path}` entry per decision; a `Chain: genesis-explore → genesis-design
  → /spec:atlas sweep + your holistic atlas review → /spec:init → /spec:enforce → /spec:plan
  docs/roadmap/01-*.md` entry — the chain is a bullet, rendered above the close (never below
  it), so the whole sequence is visible before the one recommended next step. For an
  archetype whose design stage is `none` (backend-api, data-ml) the chain bullet shrinks to
  `Chain: /spec:init → /spec:enforce → /spec:plan docs/roadmap/01-*.md`, noting explore +
  design are skipped. The atlas review step (design-capable archetypes only) is where the
  whole product's sketches are audited before any UI brief is planned — shared § Design Atlas.
- `warns`: one `dissent recorded: {one-phrase summary}` entry per dissent (drop if none).
- `next`: `{kind: 'command', text: '/spec:genesis-explore {same idea}'}` — for a design-stage-
  `none` archetype, `{kind: 'command', text: '/spec:init'}` instead.

Write the slots file and run `node "$(spec-paths report-render)" --slots <file>`; print stdout
verbatim. Filled example:

```report
✅ **architected — scaffold green, 3 ADRs, roadmap of 6 briefs**
- web-app for solo creators; gate: npm run typecheck && npm run lint && npm test
- framework: Next.js 15 (App Router) — docs/adr/0001-framework.md
- persistence: Postgres via Neon — docs/adr/0002-persistence.md
- Chain: genesis-explore → genesis-design → /spec:atlas sweep + your holistic atlas review → /spec:init → /spec:enforce → /spec:plan docs/roadmap/01-*.md
⚠️ dissent recorded: SQLite rejected — no managed backup story for a solo operator

Next: /spec:genesis-explore a trading simulator for solo creators
```

## Rules

- **Never Read `wf-research.js`.** Its `args` contract is in the phase that invokes it —
  `{stage, dimensionKeys, briefPath, contextPaths, verifyKeys}`. Invoke it by `scriptPath` and act
  on its return; its source is never orchestrator context.
- Greenfield-only (v1): a populated repo → STOP, point to `/spec:init`.
- `AskUserQuestion` dismissed → STOP; never invent the declined answer.
- Hard-to-reverse forks always go to the user; never synthesized away.
- `args` to `wf-research` is a control channel — paths, enum keys, booleans only.
- Every `Agent`/workflow `model:` is explicit (Opus session is the sole proposer — shared §
  Model Placement — Sonnet research).
