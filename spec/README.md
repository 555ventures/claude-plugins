# Spec Pipeline Plugin

One pipeline for all spec'd work — features, migrations, bugfixes, cross-cutting changes.
A new product surface is a normal spec (usually a `depends_on` series), planned in the same
Fable session. The plugin ships the **process layer**; each repo supplies its own
**grounding layer**, bootstrapped once by `/spec:init`.

## Greenfield genesis (the optional first stage)

Brand-new project with no code yet? The two **genesis** commands run *before* `/spec:init` and
decide *what to build with and how it should look*, then scaffold a real repo for `/spec:init` to
ground:

```
/spec:genesis-architect   stack + structure decisions (ADRs) → scaffold the project
/spec:genesis-design      UX/visual/voice canon: doctrine + tokens + category-only design rules
        ↓
/spec:init → /spec:plan → /spec:design → /spec:build → /spec:review   (the pipeline below)
```

Both are highly interactive Opus sessions that own every `AskUserQuestion` and every file write;
the heavy lifting runs in two workflows they call between question rounds — `wf-research` (live,
web-enabled option-menu research *during* the discovery interview) and `wf-panel` (a
Mixture-of-Agents panel, 3 blind Sonnet proposers → Opus aggregator, that adjudicates the
hard-to-reverse forks). Every cross-stage handoff is a file in `.claude/genesis/` or `docs/adr/`;
the workflow `args` carry only paths, enum keys, and booleans. Genesis is **greenfield-only**:
pointed at a populated repo, `/spec:genesis-architect` defers to `/spec:init`. Full contract in
`doctrine/genesis.md` (the genesis-stage supplement the two genesis commands read alongside
`doctrine/shared.md`).

## Install

From the `555-tools` marketplace: add the marketplace, then install the `spec` plugin. Then,
in each repo that will use the pipeline, run **`/spec:init`** once — it profiles the repo and
generates `.claude/spec.config.json`, `.claude/rules/spec-pipeline.md`, project-grounded
implementer agents, and `scripts/spec-patterns.sh`, then ends by invoking **`/spec:enforce`**
(below). The pipeline commands refuse to run without them.

**`/spec:enforce`** mechanizes the repo's rules into deterministic checks wired to the gate
command. It classifies each rule into a stable, language-neutral category (`module-boundary`,
`naming`, `forbidden-symbol`, `structural-pattern`, `datetime`, `schema-validation`, `format`),
then for each `(stack × category)` cell **discovers** an enforcer against live sources (with
citations, never training memory) and **verifies** it installs and runs against the repo before
adopting it — so no plugin file ever names a specific linter or arch-tool. It records its choices
in `.claude/rules/enforcement.json` (stamped by `rulesEnforcementHash`) and is independently
re-runnable whenever rules or tooling drift. The only rule-check left to an LLM is `/spec:plan`
reading a draft spec; everything a tool can check, a tool checks.

Drift detection is automatic: the grounding-layer contract lives in one plugin file
(`templates/grounding-contract.md`), init stamps its hash into the config (`contractHash`),
and the hook recomputes the hash on every pipeline command — any plugin update that touches
the contract warns on the next command, with zero version bookkeeping. Run **`/spec:doctor`**
for a cheap read-only drift check (plugin contracts + codebase reality vs the generated
files) — it recommends targeted patches, or re-running `/spec:init` when drift is structural.

## The Flow

```
┌───────────┐    ┌─────────────┐    ┌────────────┐    ┌─────────────┐
│ spec:plan │ →  │ spec:design │ →  │ spec:build │ →  │ spec:review │
│ Fable:    │    │ optional:   │    │ Opus +     │    │ independent │
│ explore → │    │ Fable       │    │ workflow:  │    │ gate;       │
│ spike →   │    │ designs,    │    │ TDD →      │    │ refutation  │
│ draft →   │    │ user        │    │ batches →  │    │ filter;     │
│ refute →  │    │ iterates in │    │ integrate  │    │ flips done  │
│ lock      │    │ the catalog │    │ → gate     │    │             │
└───────────┘    └─────────────┘    └────────────┘    └─────────────┘
 draft→hardened   sets designed:     →implementing      →done
```

State machine `draft → hardened → implementing → done` is enforced by the plugin's
`spec-state-gate.sh` (UserPromptSubmit hook) before the model even sees a wrong-state
invocation; the same hook blocks any spec still carrying `[NEEDS CLARIFICATION]` markers —
planning writes them inline instead of guessing, and lock requires zero. `/spec:design` never moves `status` — it sets the `designed:` date field — and
only exists in repos whose config declares a component catalog (`design` block — e.g.
Storybook for web, Widgetbook for Flutter).

A second, always-on guard `block-cross-worktree-writes.sh` (PreToolUse on `Write|Edit|NotebookEdit`)
mechanically backs `/spec:build`'s worktree isolation: it blocks any write whose absolute path
escapes the current worktree into another working tree of the same repo (the "isolated worktree,
but the edit landed on `main`" pollution). It is topology-based and fail-open — inert for ordinary
single-checkout work, and silent outside a worktree or on any git error.

Shared invariants (risk tiers, model placement, escalation contract, MCP policy):
`doctrine/shared.md` (run `spec-paths shared` for its absolute path); the genesis-only supplement
is `doctrine/genesis.md` (`spec-paths shared-genesis`). Spec template:
`templates/spec.md`. Deterministic orchestration: `workflows/wf-build.js`,
`workflows/wf-design.js` (design-stage authoring: comprehend | foundation | implement | stories |
reconcile), `workflows/wf-review.js` — commands locate them via the bundled `spec-paths` helper, since
`${CLAUDE_PLUGIN_ROOT}` is not substituted inside command bodies.

## Process layer vs grounding layer

| Ships in the plugin | Generated per repo by `/spec:init` + `/spec:enforce` |
|---|---|
| Commands `/spec:plan` `design` `build` `review` `init` `enforce` `doctor` | `.claude/spec.config.json` (gate/test/setup commands, layerGroups, agentMap, `contractHash` drift stamp, optional driftScript, optional `enforcementManifest`/`rulesEnforcementHash`) |
| `wf-build.js`, `wf-design.js`, `wf-review.js`, `wf-enforce.js` workflows (+ genesis `wf-panel.js`, `wf-research.js`) | `.claude/rules/spec-pipeline.md` (T3 triggers, planning checklist, build duties, worker/test rules, review checks) |
| Generic read-only `reviewer` agent | Implementer agents in `.claude/agents/` (one per batch kind) |
| State-gate hook, spec template, grounding-contract file | `scripts/spec-patterns.sh` (mechanical sweep) + `.claude/rules/enforcement.json` (enforcer provenance) + generated enforcer configs/contracts wired to the gate |

Repo differences are configuration, never forks: the build workflow takes the agent roster
via `args.agentMap`, the gate via `args.gate.command`, and worker/test rules as strings the
orchestrator reads from the host's pipeline rules file.

## When to use the pipeline at all

The default is direct work gated by the host's `gateCommand`. Enter the pipeline only for
**delegation** (big enough for Sonnet workers), **durability** (spans sessions), or **gates**
(T3 risk). T1 work — single area, established pattern, no cross-area contract change — never
gets a spec file.

## Recipes

### Standard change

```
/spec:plan "move tickSize from symbol to dataset"
  → tier applied; spike if brownfield-unclear; draft; refuters; locked hardened
/spec:build specs/YYYYMMDD/01-tick-size.md
  → TDD → layered batches → host integration → gate; status: implementing
/spec:review specs/YYYYMMDD/01-tick-size.md
  → deterministic gates + reviewer panel + refutation filter + drift gate; flips done,
    commits, merges the build branch back (strategy asked, conflicts repaired, no push)
```

### UI-bearing change (design-capable hosts, design: true)

```
/spec:plan "portfolio breakdown panel"
  → plan embeds registry/library references in the spec's UI section; design: true
/spec:design specs/YYYYMMDD/01-portfolio-panel.md [optional claude.ai/design URL]
  → if the spec set design_source (or you pass a mockup URL), it is fetched read-only and
    distilled into an on-disk design digest FIRST (the read-first sequencing invariant) —
    binding canon above tokens/doctrine; components become a faithful translation of it
  → foundation files → Fable PLANS (adjudicates digest forks, or authors the spec UI plan)
    → Sonnet IMPLEMENTS every component via wf-design (Fable writes no component code)
    → catalog entries → mandatory visual review (Fable reads renders, issues notes)
  → you: run the catalog (Storybook, Widgetbook, …) — iterate as many rounds as you want
    (Fable judges each note; Sonnet applies the edit)
  → approve → spec reconciled, reusable taste rulings promoted into the doctrine
    → designed: YYYY-MM-DD
/spec:build …   # skips approved components; TDD covers logic, not pixels
/spec:review …
```

Seeding from a Claude Design mockup is **strictly opt-in**: only a spec that sets `design_source`
(recorded by `/spec:plan`, or passed as the second arg on the first `/spec:design` run and then
persisted to frontmatter) engages it. With no `design_source` nothing is fetched and the stage is
byte-for-byte unchanged — same three-layer canon (tokens + doctrine + showcase) as before.

The design stage's model split: the expensive model (Fable→Opus) is confined to *judgment* — the
plan, fork adjudication, the iteration loop, and the mandatory visual review (it issues notes, it
writes no component code); **Sonnet implements 100% of components** via `wf-design`. A green
implement gate is structural only — the visual review is the gate that clears it before you see it.

The design stage's bet: the catalog + your eyes gate UI rendering; TDD gates behavior.
Components built in design are real and kept — build wires them, it doesn't rebuild them.
Cross-spec consistency lives in repo artifacts, not session memory: design tokens in code,
a one-page doctrine doc (read at preflight, promoted into at reconcile), and a living
showcase catalog entry where every spec's surfaces sit side by side — drift is visible, not
inferred. The catalog tool is host config, not plugin code: Storybook hosts declare
`{"tool": "storybook", "command": "bun storybook", "storyFormat": "CSF3 stories"}`; Flutter
hosts declare Widgetbook with `@UseCase` builders as the story format.

### Import a Claude Design mockup (spec-free)

```
/spec:import-design https://claude.ai/design/p/<id>?file=<Name>.dc.html
  → fetch the .dc.html (read-only) → extract :root into token files → translate <x-dc>
    surfaces into real components + catalog entries → write/extend the doctrine
```

Standalone and one-shot: no spec, no `status`, no state gate, no reconcile. Greenfield repos get
the full design foundation bootstrapped from the mockup; repos that already have tokens/doctrine
get them *extended* (a same-role/different-value conflict prompts, never overwrites). What it lands
is ordinary repo canon — a later `/spec:init` extracts it as brownfield design, and `/spec:design`
+ `/spec:build` consume the same tokens and components. Re-invoke with the same URL to add screens;
it skips components already on disk. For ongoing UI work with reconciliation and review gates,
graduate to `/spec:design`; to pick a direction with no mockup yet, use `/spec:genesis-design`.

### Mid-build requirement change

No separate cascade command. Update the spec's Decisions table, add the ruling to
`resolutions[batchId]`, resume the build workflow (`resumeFromRunId`) — finished batches
return from the journal cache; only affected batches re-run.

## Key design decisions

- **Plan is one Fable session.** Spec quality concentrates all downstream spend, so judgment
  concentrates there too; refuters run inside the same session and findings are fixed before
  lock.
- **Design is a stage, not a checkpoint inside build.** Active design iteration changes the
  spec; doing it before build means build implements against settled truth, and the
  (potentially long, multi-session) visual loop never bloats the build orchestrator's context.
- **In design, taste is the work — so Fable does it.** The pipeline's one exception to
  "Sonnet works": a Fable designer session writes the components itself, in coherence groups
  rather than maximal fan-out, because visual coherence is a system property no parallel
  per-cluster dispatch can produce. It earns the cost back in fewer human iteration rounds —
  and where the host provides a `design.screenshot` command, the designer critiques its own
  renders once before asking for yours.
- **Build is a deterministic workflow** (`wf-build.js`): batching, TDD-red enforcement,
  gate + repair caps live in code; judgment (blocked items, scope changes) escalates to the
  main loop → Fable retainer → user.
- **Review is independent and refutation-filtered** (`wf-review.js`): Sonnet reviewers run
  as the plugin's read-only `spec:reviewer` agent (never the planning model), claim-only
  refuters, hard findings die only on unanimous refutation. Killed findings are reported,
  never silently dropped. On CLEAN, review closes the loop: commit, then merge the build
  branch back into its originating branch (strategy via one ask; conflict repair reads both
  sides; worktree cleaned up; never pushed).
- **Drift is config-decided.** Repos with an AC-drift script declare it (`driftScript`) and
  review runs it; repos without get a mechanical grep matrix at review — every AC-ID must hit
  at least one File Plan test file or it's an automatic hard finding — with the reviewer's
  coverage check as the semantic backstop. There is no separate drift command.
