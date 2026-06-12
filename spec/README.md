# Spec Pipeline Plugin

One pipeline for all spec'd work — features, migrations, bugfixes, cross-cutting changes.
A new product surface is a normal spec (usually a `depends_on` series), planned in the same
Fable session. The plugin ships the **process layer**; each repo supplies its own
**grounding layer**, bootstrapped once by `/spec:init`.

## Install

From the `555-tools` marketplace: add the marketplace, then install the `spec` plugin. Then,
in each repo that will use the pipeline, run **`/spec:init`** once — it profiles the repo and
generates `.claude/spec.config.json`, `.claude/rules/spec-pipeline.md`, project-grounded
implementer agents, and `scripts/spec-patterns.sh`. The pipeline commands refuse to run
without them.

## The Flow

```
┌───────────┐    ┌─────────────┐    ┌────────────┐    ┌─────────────┐
│ spec:plan │ →  │ spec:design │ →  │ spec:build │ →  │ spec:review │
│ Fable:    │    │ optional:   │    │ Opus +     │    │ independent │
│ explore → │    │ components  │    │ workflow:  │    │ gate;       │
│ spike →   │    │ + stories,  │    │ TDD →      │    │ refutation  │
│ draft →   │    │ iterate in  │    │ batches →  │    │ filter;     │
│ refute →  │    │ Storybook   │    │ integrate  │    │ flips done  │
│ lock      │    │ with user   │    │ → gate     │    │             │
└───────────┘    └─────────────┘    └────────────┘    └─────────────┘
 draft→hardened   sets designed:     →implementing      →done
```

State machine `draft → hardened → implementing → done` is enforced by the plugin's
`spec-state-gate.sh` (UserPromptSubmit hook) before the model even sees a wrong-state
invocation. `/spec:design` never moves `status` — it sets the `designed:` date field — and
only exists in repos whose config declares Storybook.

Shared invariants (risk tiers, model placement, escalation contract, MCP policy):
`commands/shared.md` (run `spec-paths shared` for its absolute path). Spec template:
`templates/spec.md`. Deterministic orchestration: `workflows/spec-build.js`,
`workflows/spec-review.js` — commands locate them via the bundled `spec-paths` helper, since
`${CLAUDE_PLUGIN_ROOT}` is not substituted inside command bodies.

## Process layer vs grounding layer

| Ships in the plugin | Generated per repo by `/spec:init` |
|---|---|
| Commands `/spec:plan` `design` `build` `review` `init` | `.claude/spec.config.json` (gate/test/setup commands, layerGroups, agentMap, optional driftScript) |
| `spec-build.js`, `spec-review.js` workflows | `.claude/rules/spec-pipeline.md` (T3 triggers, planning checklist, build duties, worker/test rules, review checks) |
| Generic read-only `spec-reviewer` agent | Implementer agents in `.claude/agents/` (one per batch kind) |
| State-gate hook, spec template | `scripts/spec-patterns.sh` (mechanical sweep) |

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
  → deterministic gates + reviewer panel + refutation filter + drift gate; flips done
```

### UI-bearing change (Storybook hosts, storybook: true)

```
/spec:plan "portfolio breakdown panel"
  → plan embeds registry/library references in the spec's UI section; storybook: true
/spec:design specs/YYYYMMDD/01-portfolio-panel.md
  → foundation files → stateless components + stories
  → you: run Storybook — iterate as many rounds as you want (notes → fresh workers)
  → approve → spec reconciled to the design → designed: YYYY-MM-DD
/spec:build …   # skips approved components; TDD covers logic, not pixels
/spec:review …
```

The design stage's doctrine: Storybook + your eyes gate UI rendering; TDD gates behavior.
Components built in design are real and kept — build wires them, it doesn't rebuild them.

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
- **Build is a deterministic workflow** (`spec-build.js`): batching, TDD-red enforcement,
  gate + repair caps live in code; judgment (blocked items, scope changes) escalates to the
  main loop → Fable retainer → user.
- **Review is independent and refutation-filtered** (`spec-review.js`): Sonnet reviewers run
  as the plugin's read-only `spec:spec-reviewer` agent (never the planning model), claim-only
  refuters, hard findings die only on unanimous refutation. Killed findings are reported,
  never silently dropped.
- **Drift is config-decided.** Repos with an AC-drift script declare it (`driftScript`) and
  review runs it; repos without rely on the reviewer's AC ↔ test coverage check, where a
  missing test is a hard finding. There is no separate drift command.
