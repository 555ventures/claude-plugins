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
generates `.claude/spec.config.json`, `.claude/rules/spec-pipeline.md` (including an
initially-empty, evidence-cited **Gotchas** section later spec runs fold real deviations into),
project-grounded implementer agents, `scripts/spec-patterns.sh`, and a per-host
`.claude/skills/spec-verify/SKILL.md` (how to launch, seed, and observe this app, derived from
init's own profiling), then ends by invoking **`/spec:enforce`** (below). The pipeline commands
refuse to run without them.

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
Doctor's check 13 audits the pipeline's own distrust mechanisms against
`doctrine/scaffold-ledger.md` — the registry of every gate/advisory/structural guard, each row
naming the incident or measurement that justified it, the model generation it was earned under,
and the condition that promotes or retires it; a live mechanism missing from the ledger, or a
ledger-marked-retired one still gating, is a finding. When a defect surfaces later in spec-built
code, record it with **`/spec:escape`** — one run-ledger row pointing back at the review that
passed it (`/git:commit` offers to capture one automatically on a fix-shaped commit when the
ledger exists). Those rows are the pipeline's ground truth: doctor aggregates them into
contradicted-CLEAN and verifier-killed-a-finding-that-later-escaped signals.

## The Flow

```
┌───────────┐    ┌─────────────┐    ┌────────────┐    ┌─────────────┐
│ spec:plan │ →  │ spec:design │ →  │ spec:build │ →  │ spec:review │
│ Fable:    │    │ optional:   │    │ Sonnet +   │    │ independent │
│ explore → │    │ Fable       │    │ workflow:  │    │ gate;       │
│ spike →   │    │ designs,    │    │ TDD →      │    │ verified    │
│ draft →   │    │ user        │    │ batches →  │    │ panel;      │
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
`workflows/wf-design.js` (design-stage authoring: the `author` stage only — comprehend is the `dc-extract` script, reconcile is inlined by `/spec:design`),
`workflows/wf-review.js` — commands locate them via the bundled `spec-paths` helper, since
`${CLAUDE_PLUGIN_ROOT}` is not substituted inside command bodies. The committed `wf-*.js` files
are **generated, not hand-edited**: each is assembled from a `workflows/src/*.body.js` phase
body plus shared `workflows/fragments/*.frag` (arg normalization, group validation, dispatch) by
`npm run build:workflows`; change the source or a fragment and rebuild, never patch the
generated file directly.

## Process layer vs grounding layer

| Ships in the plugin | Generated per repo by `/spec:init` + `/spec:enforce` |
|---|---|
| Commands `/spec:genesis-architect` `genesis-design` `plan` `design` `build` `review` `init` `enforce` `doctor` `import-design` | `.claude/spec.config.json` (gate/test/setup commands, layerGroups, agentMap, `contractHash` drift stamp, optional driftScript, optional `enforcementManifest`/`rulesEnforcementHash`) |
| `wf-build.js`, `wf-design.js`, `wf-review.js`, `wf-enforce.js` workflows (+ genesis `wf-panel.js`, `wf-research.js`) | `.claude/rules/spec-pipeline.md` (T3 triggers, planning checklist, build duties, worker/test rules, review checks) |
| Generic read-only `reviewer` agent | Implementer agents in `.claude/agents/` (one per batch kind) |
| State-gate hook, spec template, grounding-contract file | `scripts/spec-patterns.sh` (mechanical sweep) + `.claude/rules/enforcement.json` (enforcer provenance) + generated enforcer configs/contracts wired to the gate |

Repo differences are configuration, never forks: the build workflow takes the agent roster
via `args.agentMap`, the gate via `args.gate.command`, and the host's worker/test rules as a
**path** (`pipelineRulesPath`) each worker Reads itself — `args` is a control channel of
paths/ids/enums, never a data bus of prose (the no-free-text invariant).

## Doctrine hygiene (authoring this plugin)

The command + doctrine docs are read by LLM agents as binding instructions, so their cost is paid
on every run — which makes accretion the standing failure mode (each past fix tended to add *a
paragraph and a named tag*). Two rules keep density essential rather than accretive:

1. **State a fact once.** A rule lives in its highest common ancestor doc (`doctrine/shared.md`);
   every other site **points** (`shared § Name`), never restates. If you find the same constraint
   in two files, the second copy is accidental complexity — and a drift hazard, since copies diverge.
   `commands/import-design.md` is the model (it cites `shared §` and stays lean); a command doc keeps
   only its *procedural specifics*, not the shared rule it executes.
2. **Don't name a derived case.** Before adding a tag / enum / `kind`, prove no existing field
   already determines it. If you add a field (e.g. a rule's `grounding`), do **not** also add tags
   that are functions of that field — the resolver switches on the field. Name only what carries
   information the field doesn't (e.g. *which* rule a tension touches), never the field re-projected.

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
  → deterministic gates + diff-scaled reviewer panel + execution-grounded verification +
    drift gate; flips done, commits, merges the build branch back (strategy asked, conflicts
    repaired, no push)
```

### UI-bearing change (design-capable hosts, design: true)

```
/spec:plan "portfolio breakdown panel"
  → plan embeds registry/library references in the spec's UI section; design: true
/spec:design specs/YYYYMMDD/01-portfolio-panel.md [claude.ai/design URL | local mockup file/dir]
  → if the spec set design_source (or you pass a mockup URL / local handoff bundle), it is
    extracted FIRST by the deterministic dc-extract script — extract.json (tokens + each
    surface's fidelity contract: visible strings, layout primitives) + verbatim per-surface
    slices on disk before any authoring (the read-first sequencing invariant)
  → the expensive model authors skeletons.json and adjudicates token forks — it writes no
    framework code. Mock bound: a BINDING MAP per surface (tokenMap, props, states,
    bind-vs-author; the slice is the authority for structure/copy/order/layout — no tree).
    No mock: per-surface tree with token-ROLE bindings (the skeleton IS the design)
  → Sonnet EXPANDS the skeletons via wf-design: foundation + components + catalog entries
    in one gated run → screenshot visual review when configured (notes, never edits)
  → mock bound: the driver greps code against the mock's strings/order/layout FAIL-CLOSED
    at author-green and every round-green; divergences need an evidence-gated deltas.json
    row (verbatim slice quote, mechanically verified + impossibility proof) — taste yields
    to the mock
  → mock bound, before each round: advisory vision review — one vision-capable consult
    (Fable, Opus fallback) compares a render screenshot against the bound mock slice,
    region by region; notes only, it never fail-closes a mark
  → you: run the catalog (Storybook, Widgetbook, …) — iterate as many rounds as you want
    (the designer judges each note; Sonnet applies the edit)
  → approve → spec reconciled, reusable taste rulings promoted into the doctrine
    → designed: YYYY-MM-DD
/spec:build …   # skips approved components; TDD covers logic, not pixels
/spec:review …
```

Seeding from a Claude Design mockup is **strictly opt-in**: only a spec that sets `design_source`
(recorded by `/spec:plan`, or passed as the second arg on the first `/spec:design` run and then
persisted to frontmatter) engages it. With no `design_source` nothing is fetched and the stage is
byte-for-byte unchanged — same three-layer canon (tokens + doctrine + showcase) as before.

The design stage's model split: the expensive model is confined to *judgment* — the skeletons,
fork adjudication, the iteration loop, and the screenshot visual review when one is configured
(it issues notes, it writes no component code); **Sonnet expands 100% of components** via
`wf-design`. A green author gate is structural only — the screenshot review (if configured) or
your catalog loop is the visual gate that clears it.

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

No separate cascade command. Write the ruling into the spec's Decisions table (the worker
reads it there), set `resolutions[batchId]` to a fresh opaque token — never the ruling prose —
and resume the build workflow (`resumeFromRunId`): finished batches return from the journal
cache; only the salted batches re-run.

## Key design decisions

- **Plan is one Fable session.** Spec quality concentrates all downstream spend, so judgment
  concentrates there too; refuters run inside the same session and findings are fixed before
  lock.
- **Design is a stage, not a checkpoint inside build.** Active design iteration changes the
  spec; doing it before build means build implements against settled truth, and the
  (potentially long, multi-session) visual loop never bloats the build orchestrator's context.
- **In design, taste is judgment, not typing — the expensive model authors skeletons, never
  components.** Warm on the mockup extract and the canon, it authors `skeletons.json` (the
  per-surface structural authority: tree, token-role bindings, states, bind-vs-author) and
  adjudicates every fork; Sonnet expands 100% of the components, in coherence groups rather
  than maximal fan-out, because visual coherence is a system property no per-component
  dispatch can produce. Where the host provides a `design.screenshot` command, the designer
  critiques the renders once before asking for your eyes.
- **Build is a Sonnet-orchestrated deterministic workflow** (`wf-build.js`), all tiers: batching,
  TDD-red enforcement, gate + repair caps live in code; judgment (blocked items, scope changes)
  escalates to the main loop → **Fable retainer** (Opus fallback), consulted only on genuine
  surprises — there is no mandatory checkpoint ritual — → user. A single-batch, ≤4-file spec
  skips the workflow entirely via a fast path (one test-author dispatch, one implementation
  dispatch, the gate run in-session). Forced-but-unblocking departures workers can't resolve
  land in a `<spec>.deviations.md` sidecar; review's close folds recurring ones into the host
  rules' Gotchas section, then deletes the sidecar.
- **Review is independent and execution-verified** (`wf-review.js`): a diff-scaled reviewer
  panel — one `spec:reviewer` agent by default, two only for a T3 spec with a ≥300-loc diff
  (blind to each other) — never the planning model. Every non-soft finding then gets one
  execution-grounded Sonnet verifier; a finding dies only on a failed repro, a quoted spec
  sanction, or a plain miscitation — never by argument (the claim-only refutation filter and
  kill-by-unanimous-refutation are retired: a 2026-07 ledger measurement found refuters killed
  almost nothing, and 2 of the 3 audited kills were wrong). Killed findings are reported, never
  silently dropped. Fix→re-review iterations re-invoke the workflow at `fix-delta` scope: one
  reviewer reads only the fix diff and the prior findings, never the whole codebase again. On
  CLEAN, review closes the loop: commit, then merge the build branch back into its originating
  branch (strategy via one ask; conflict repair reads both sides; worktree cleaned up; never
  pushed).
- **Drift is config-decided.** Repos with an AC-drift script declare it (`driftScript`) and
  review runs it; repos without get a mechanical grep matrix at review — every AC-ID must hit
  at least one File Plan test file or it's an automatic hard finding — with the reviewer's
  coverage check as the semantic backstop. There is no separate drift command.
