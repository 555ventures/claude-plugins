# Spec Pipeline

**Plan it once, build it hands-off, trust the review.**

You know the failure mode: you ask an agent for a big change, it confidently produces
2,000 lines, and now *you're* the reviewer for work you never scoped. This plugin flips
that. An expensive model does the thinking up front and writes a hardened spec; cheap
fast models do the typing behind deterministic gates; an independent reviewer that
actually *executes* the code decides whether it's done. You spend your attention where
it matters — deciding what to build and approving what shipped.

One pipeline covers all spec'd work: features, migrations, bugfixes, cross-cutting
changes, whole new product surfaces. And when a project doesn't exist yet, the genesis
commands will interview you, research the options live, argue about the stack in front
of you, and scaffold the repo — before the first spec is ever written.

## The 30-second version

```
/spec:plan "move tickSize from symbol to dataset"     ← think (expensive model, one session)
/spec:build specs/20260716/01-tick-size.md            ← type (Sonnet workers, TDD, gated)
/spec:review specs/20260716/01-tick-size.md           ← verify (independent, execution-grounded)
```

That's the whole loop. Plan writes and adversarially hardens a spec. Build implements
it test-first in an isolated worktree. Review runs the gates, boots the app, verifies
every finding by *executing* it, then commits and merges. Each stage refuses to run
until the previous one signed off — a hook enforces the state machine before the model
even sees your prompt.

## When to use it (and when not to)

Honest answer: **most changes don't need a spec.** Just do the work and run the gate
command. Reach for the pipeline when you'd gain one of three things:

| Reach for it when… | Because… |
|---|---|
| **The change is big enough to delegate** | Sonnet workers implement in parallel batches while you do something else |
| **The work spans sessions** | The spec is durable intent; any future session can pick it up cold |
| **The blast radius is scary** (T3 risk) | You want executed verification, not "looks good to me" |

A one-file fix in an established pattern never gets a spec file. The plugin will tell
you the same thing if you try.

## Install

1. Add the `555-tools` marketplace and install the `spec` plugin.
2. In each repo that will use it, run **`/spec:init`** once.

Init profiles your repo and generates the **grounding layer** — the plugin ships the
*process*, your repo supplies the *ground truth*:

- `.claude/spec.config.json` — gate/test commands, how to boot the app, layer groups
- `.claude/rules/spec-pipeline.md` — your repo's rules, plus an evidence-cited
  **Gotchas** section that real runs fold deviations into
- Implementer agents grounded in *your* patterns, a mechanical pattern sweep, and a
  `spec-verify` skill (how to launch, seed, and observe this specific app)

Init won't stamp itself complete until `scripts/manifest-check.sh` proves every
generated file exists **and activates** — authored ≠ activated. It finishes by invoking
**`/spec:enforce`**, which turns your written rules into deterministic checks: each rule
is classified into a language-neutral category (`module-boundary`, `naming`,
`forbidden-symbol`, `structural-pattern`, `datetime`, `schema-validation`, `format`),
and for each (stack × category) cell it *discovers* a real enforcer from live sources —
with citations, never training memory — and verifies it runs against your repo before
adopting it. Everything a tool can check, a tool checks; the only rule-check left to an
LLM is `/spec:plan` reading a draft.

Later, if the plugin updates or your repo drifts, **`/spec:doctor`** catches it — the
grounding contract is hash-stamped into your config and rechecked on every pipeline
command, so drift warns you instead of silently rotting. `doctor --fix` applies
evidence-cited repairs with per-patch approval.

## The everyday flow

```
┌───────────┐    ┌─────────────┐    ┌────────────┐    ┌─────────────┐
│ spec:plan │ →  │ spec:design │ →  │ spec:build │ →  │ spec:review │
│ think     │    │ (optional,  │    │ type       │    │ verify      │
│ explore → │    │ UI repos)   │    │ TDD →      │    │ gates +     │
│ spike →   │    │ mock →      │    │ batches →  │    │ executed    │
│ draft →   │    │ components →│    │ integrate  │    │ checks;     │
│ refute →  │    │ your eyes   │    │ → gate     │    │ flips done  │
│ lock      │    │             │    │            │    │             │
└───────────┘    └─────────────┘    └────────────┘    └─────────────┘
 draft→hardened   sets designed:     →implementing      →done
```

**`/spec:plan`** is one expensive-model session, because spec quality concentrates all
downstream spend. It explores the codebase, spikes anything brownfield-unclear, drafts,
then turns adversarial refuters loose on its own draft and fixes what they find before
locking. Anything genuinely unknown becomes an inline `[NEEDS CLARIFICATION]` marker —
and the state gate refuses to let a spec with markers proceed, so planning never papers
over a guess.

**`/spec:build`** is a Sonnet-orchestrated deterministic workflow: test authors write
failing tests first, workers implement in layered batches, and a gate + repair loop
holds the line. A Fable retainer is consulted only on genuine surprises — no checkpoint
rituals. Small specs (single batch, ≤4 files) skip the workflow entirely via a fast
path. Builds run in an isolated worktree, and an always-on hook mechanically blocks any
write that escapes it into another checkout — no more "isolated build, but the edit
landed on `main`."

**`/spec:review`** is independent and execution-verified — never the model that wrote
the plan. A diff-scaled reviewer panel files findings; every non-soft finding then gets
an execution-grounded verifier, and a finding dies only on a failed repro, a quoted spec
sanction, or a plain miscitation — never by argument. **No verdict rests on static
analysis alone**: CLEAN requires an observed boot (`scripts/smoke.sh` runs your config's
`runtime` contract), and the AC↔test matrix counts *executed* tests — a skipped test is
a hard finding unless the AC declares its environment gate. On CLEAN, review commits,
merges the build branch back (strategy asked, conflicts repaired, never pushed), and
flips the spec to `done`.

**Requirement changed mid-build?** No cascade command. Write the ruling into the spec's
Decisions table, salt the affected batch's `resolutions` token, and resume the workflow
— finished batches return from cache, only the salted ones re-run.

## Starting from nothing: genesis

Brand-new project, empty directory? Three commands run *before* `/spec:init` and decide
what to build with and how it should look:

```
/spec:genesis-architect   stack + structure decisions, recorded as ADRs → scaffolded repo
                          → docs/roadmap/ briefs (so setup never ends without a next command)
/spec:genesis-explore     fresh UX research → 6–8 rendered style tiles you judge in a
                          browser → cull to 2 interactive prototypes → your design PICK
/spec:genesis-design      ratifies the pick: the winner's tokens.css verbatim as canon,
                          plus design doctrine and enforceable design rules
        ↓
/spec:init → /spec:plan docs/roadmap/01-*.md → /spec:design → /spec:build → /spec:review
        ↓ (per milestone)
/spec:release             deploy to staging → executed checks against the deployed
                          product → journey walks → confirmation-gated production promote
```

These are deliberately the fun, interactive sessions: between your answers, live
web-research agents build ranked option menus (`wf-research`), and the hard-to-reverse
forks go to a Mixture-of-Agents panel — three blind Sonnet proposers, an Opus aggregator
— that returns a decision matrix with recorded minority positions (`wf-panel`). Every
handoff between stages is a file in `.claude/genesis/` or `docs/adr/`, so nothing lives
only in a chat transcript.

Design taste is decided **before it is locked**: each explore candidate is born with its
own `tokens.css` (tokens-as-code from birth), persona-walkthrough agents file friction
findings against the finalists, and genesis-design adopts the winner's tokens verbatim —
no extraction step to drift. Rejected directions become recorded Dissents, not lost
arguments.

Genesis is greenfield-only: point it at a populated repo and it politely defers to
`/spec:init`. Brownfield repos hand-author the same roadmap shape from the bundled
templates.

## UI work: the design stage

`/spec:design` only exists in repos whose config declares a component catalog
(Storybook, Widgetbook, …). It's a separate stage — *before* build — because active
design iteration changes the spec, and the visual loop shouldn't bloat a build
orchestrator's context.

The stage is **mock-first**: the taste artifact is a local HTML mock — cheap to iterate,
never framework code. One responsive file covers your declared matrix (themes ×
viewports from `design/targets.json`); you iterate direction on the cheapest framing,
and the full matrix is expanded mechanically only after you approve — rejected
directions never pay the matrix bill.

The model split is the plugin's core bet, applied to pixels: **taste is judgment, not
typing.** The expensive model extracts the mock deterministically, authors per-surface
*skeletons* (structure, token bindings, states) and adjudicates forks — it writes no
component code. Sonnet expands 100% of the components in one gated run. Then the mock
becomes a fail-closed contract: the driver greps the built code against the mock's
strings, order, and layout at every green, and any divergence needs an evidence-backed
delta row — taste yields to the mock. You iterate in your own catalog for as many rounds
as you like; on approval the spec is reconciled, reusable taste rulings are promoted
into the doctrine, and build later *wires* the approved components — it never rebuilds
them.

Two escape hatches for Claude Design (claude.ai/design), both strictly opt-in:

- **`/spec:import-design <URL>`** — spec-free, one-shot: translate a mockup into real
  tokens, components, and doctrine in this repo. Re-invoke with the same URL to add
  screens; it skips what's already on disk.
- **`/spec:design-brief <spec>`** — the reverse courier: compile paste-ready Claude
  Design prompts from a spec (and, with `--drift`, fix-at-source prompts from recorded
  drift, so the mock gets re-aligned instead of rotting).

And for the whole-product view at any time, **`/spec:atlas`** renders every mock at
device size, arranged as a journey graph from your roadmap, with gap cards for declared
but unmocked surfaces — zero tokens, deterministic. `atlas sweep` fills every gap with
an honest sketch-tier mock so the whole picture always exists.

## Command cheat sheet

| Command | What it does | When |
|---|---|---|
| `/spec:init` | Bootstrap the grounding layer | Once per repo |
| `/spec:enforce` | Mechanize your rules into deterministic checks | Init runs it; re-run when rules/tooling change |
| `/spec:plan` | Author + adversarially harden a spec | Start of every spec'd change |
| `/spec:design` | Mock → components → your catalog approval | UI-bearing specs, design-capable repos |
| `/spec:build` | TDD implementation via gated Sonnet workflow | After a spec is `hardened` |
| `/spec:review` | Independent executed verification; flips `done`, commits, merges | After build |
| `/spec:release` | Staging deploy → executed checks → confirmed promote | Per milestone |
| `/spec:doctor` | Drift check (`--fix` to repair) | Whenever things feel off, or after plugin updates |
| `/spec:escape` | Record a defect that slipped past review | The moment you find one |
| `/spec:atlas` | Whole-product design picture + annotation loop | Any time |
| `/spec:genesis-architect` / `-explore` / `-design` | Stack, taste funnel, design canon | Greenfield only, before init |
| `/spec:import-design` | One-shot Claude Design import, no spec | Have a mockup URL, want real code |
| `/spec:design-brief` | Compile Claude Design prompts from a spec | Designing that surface remotely |

## How it keeps itself honest

Most pipelines claim quality; this one keeps receipts.

- **`/spec:escape`** records any defect that slipped past a review — one ledger row
  pointing at the review run that passed it (`/git:commit` offers to capture one
  automatically when a fix-shaped commit touches spec-landed lines). Escape rows make
  CLEAN verdicts *falsifiable*: doctor aggregates them into contradicted-CLEAN signals.
- **The scaffold ledger** (`doctrine/scaffold-ledger.md`) registers every gate and guard
  with the incident that justified it and the condition that retires it. Doctor audits
  live mechanisms against it — an unregistered gate, or a retired one still gating, is a
  finding. Guards have actually died this way: the review stage's refutation filter was
  retired when ledger measurement showed it killed almost nothing, and got 2 of 3
  audited kills wrong.
- **The feedback loop** runs on evidence, not memory: run ledgers, `[plugin]`-tagged
  Gotchas, and escape rows accumulate in each host as side effects of normal runs;
  `/spec:release` (or doctor) flushes them into a dated feedback brief. On the plugin
  side, `/intake` re-executes each finding's evidence in the host repo before accepting
  it — and *an accepted finding is a failing test first*. The ledger ships with the
  plugin, so a host's doctor can name the workarounds it gets to retire by upgrading.

## Under the hood

For the curious, and for anyone editing this plugin:

- **Process layer vs grounding layer.** The plugin ships commands, workflows, the
  reviewer agent, the state-gate hook, and templates. Everything repo-specific — config,
  rules, implementer agents, enforcer provenance — is generated per repo. Repo
  differences are configuration, never forks: the build workflow takes the agent roster
  and gate command via `args`, and workers `Read` the host's rules from a path. `args`
  is a control channel of paths/ids/enums, never a data bus of prose (the no-free-text
  invariant).
- **State machine** `draft → hardened → implementing → done`, enforced by
  `spec-state-gate.sh` (a UserPromptSubmit hook) before the model sees a wrong-state
  invocation. `/spec:design` never moves `status`; it sets the `designed:` date.
- **Workflows are generated, not hand-edited.** Each committed `workflows/wf-*.js` is
  assembled from a `workflows/src/*.body.js` phase body plus shared fragments by
  `npm run build:workflows`. Change the source and rebuild; never patch the output.
  Commands locate them via the bundled `spec-paths` helper.
- **Shared invariants** (risk tiers, model placement, escalation contract, MCP policy)
  live in `doctrine/shared.md` (`spec-paths shared`); the genesis supplement is
  `doctrine/genesis.md`. Spec template: `templates/spec.md`.

### Doctrine hygiene (authoring this plugin)

The command and doctrine docs are read by LLM agents as binding instructions, so their
cost is paid on every run — which makes accretion the standing failure mode. Two rules
keep density essential:

1. **State a fact once.** A rule lives in its highest common ancestor
   (`doctrine/shared.md`); every other site *points* (`shared § Name`), never restates.
   Two copies of one constraint is accidental complexity and a drift hazard.
   `commands/import-design.md` is the model: it cites and stays lean.
2. **Don't name a derived case.** Before adding a tag / enum / `kind`, prove no existing
   field already determines it. Name only what carries information the field doesn't —
   never the field re-projected.
