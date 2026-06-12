# 555-tools

A Claude Code plugin marketplace. Currently ships one plugin: **spec**, a spec-driven
development pipeline (`plan → design → build → review`) where the expensive model does the
judging, cheap models do the typing, and the control flow between them is deterministic code
instead of model improvisation.

Built for and battle-tested on 555 Ventures projects; published because the failure modes it
guards against are universal.

## Why this exists

Letting one agent session "just build the feature" works right up until it doesn't, and the
ways it breaks are consistent:

- **Judgment and labor get the same price.** A frontier model spends most of a large build
  doing mechanical work a cheaper model does fine, and its context fills with file dumps until
  the actual decisions get worse. Spec quality concentrates all downstream spend — so judgment
  should concentrate there too, not be diluted across ten thousand lines of edits.
- **Plans that were never attacked.** A spec written in one pass encodes the author-model's
  blind spots. The implementation then shares them, and so does a same-model reviewer. (One
  real example from this pipeline's history: a test author mislabeled half-up rounding as
  ceiling, the implementer bent the code to satisfy the wrong test, and typecheck + lint +
  the full test suite went green around a real money bug. Only an independent high-tier
  review caught it.)
- **Orchestration by vibes.** When the model improvises the multi-agent choreography each
  run, you get different batching, different retry behavior, and no way to resume — a crash
  at 80% means paying for the same 80% again.
- **Parallel agents stepping on each other.** Hard-learned and now a hard rule: a worker once
  ran a repo-wide `git checkout .` and destroyed sibling workers' uncommitted edits. Workers
  never touch git; the orchestrator owns it.
- **Scope that silently widens.** A "fix" touches a file nobody planned to touch, nothing
  flags it, and the diff grows hair.

The pipeline is the systematized response: adversarially hardened specs, deterministic
execution with caching, mechanical escalation triggers, and an independent
refutation-filtered review gate.

## How it works

```
┌───────────┐    ┌─────────────┐    ┌────────────┐    ┌─────────────┐
│ spec:plan │ →  │ spec:design │ →  │ spec:build │ →  │ spec:review │
│ top tier: │    │ optional:   │    │ workflow:  │    │ independent │
│ explore → │    │ components  │    │ TDD →      │    │ reviewers + │
│ draft →   │    │ + stories,  │    │ batches →  │    │ refutation  │
│ refute →  │    │ iterate in  │    │ gate +     │    │ filter;     │
│ lock      │    │ Storybook   │    │ repair     │    │ flips done  │
└───────────┘    └─────────────┘    └────────────┘    └─────────────┘
 draft→hardened   sets designed:     →implementing      →done
```

**Plan** runs in a single top-tier session: explore the codebase, spike if the brownfield is
unclear, draft the spec, then run refuter agents against it and fix what they find *before*
locking. The output is a spec with an authoritative Decisions table, explicit Assumptions, a
File Plan sliced into layers, and acceptance criteria.

**Design** (optional, Storybook hosts) builds stateless components + stories and lets the
human iterate visually before any logic exists. Build later treats approved components as
done inputs — eyes gate pixels, TDD gates behavior.

**Build** hands the parsed File Plan to a deterministic workflow script: test authors write
failing tests derived from the spec only (never from implementation), a red-check verifies
they actually fail, implementation batches run in parallel within dependency layers, and a
host-defined gate command runs with a capped repair loop. Anything surprising — a stale
assumption, a design fork, a failure outside the File Plan — stops the worker and escalates:
first to a persistent high-tier "retainer" agent that accumulates the run's context, then to
the human, whose ruling is written into the spec and used to resume the workflow. Completed
batches return from a journal cache, so resuming costs only the changed work.

**Review** is an independent gate: reviewers (never the planning model — cross-model
independence beats raw capability, because a same-model reviewer shares the blind spots that
produced the bugs) check shape and correctness against the spec; every hard finding then
faces claim-only refuters and dies only on unanimous refutation. Killed findings are
reported, never silently dropped. Review owns the flip to `done`.

The state machine `draft → hardened → implementing → done` is enforced by a hook before the
model even sees a wrong-state command. Model placement is fixed and explicit: the top tier
judges, a mid tier conducts, cheap workers implement, the cheapest looks things up.

**Process vs grounding.** The plugin ships only the process layer. Each repo runs
`/spec:init` once, which profiles the codebase and generates the grounding layer: gate/test
commands, layer groupings, an agent roster with role doctrines, prose rules for workers and
reviewers. Repo differences are configuration, never forks of the pipeline itself.

**Proportionality.** The pipeline is opt-in heavy machinery, not the default. Work enters it
only when it needs delegation (big enough for workers), durability (spans sessions; the spec
is the re-entrant state), or gates (high-risk surfaces). Trivial single-area changes never
get a spec at all, and risk tiers (T1/T2/T3) scale the number of refuters, reviewers, and
mandatory high-tier checkpoints to what the change can actually break.

## How it compares

**vs. a single agent session ("just build it").** Fine for T1 work — and the pipeline
explicitly tells you to stay out of it for that. For multi-session, multi-file work you trade
away durability (no re-entrant state), price discipline (frontier tokens spent on mechanical
edits), and any adversarial check on the plan or the diff.

**vs. plan-then-execute (plan mode, TODO-list agents).** A plan reviewed only by its author
is a draft, not a spec. This pipeline's plans are attacked by refuters before lock, decisions
are recorded in a table workers must apply verbatim, and execution is a script with caps and
caching — not the same model freestyling through its own checklist.

**vs. spec-document generators (spec-kit-style requirements/design/tasks flows).** Those
produce artifacts; execution remains a single agent walking a task list. Here the spec is
*executable*: the File Plan parses into parallel worker batches, acceptance criteria become
failing tests before implementation exists, and the spec doubles as the resume state and the
review contract. Grounding is also per-repo and generated, not a generic template.

**vs. autonomous loops (Ralph-style "run until done").** Brute-force iteration converges on
*something*, but a green gate is necessary, not sufficient — loops happily bend code to a
wrong test. This pipeline puts the iteration inside hard bounds (repair cap, escalation
triggers, out-of-scope detection) and adds gates a loop lacks: red-check before
implementation, independent review, refutation filters, mandatory high-tier checkpoints on
risky surfaces.

**vs. ad-hoc multi-agent fan-out.** Parallelism without deterministic control flow
re-improvises the orchestration every run: batching drifts, failures restart from zero,
agents collide on shared files. Here batching, ordering, caps, and retries live in a
versioned script; parallel batches own disjoint file sets; workers are banned from git and
from anything outside their batch.

The honest caveat: this is heavier than all of the above. If the work doesn't need
delegation, durability, or gates, the pipeline's own docs say don't use it.

## Install

```
/plugin marketplace add 555ventures/claude-plugins
/plugin install spec@555-tools
```

Then, in each repo that will use the pipeline, run `/spec:init` once. The commands refuse to
run without the grounding it generates.

See [spec/README.md](spec/README.md) for the full flow, recipes (standard change, UI-bearing
change, mid-build requirement change), and design decisions.

## Notes for plugin authors

Workflow scripts in this repo guard against two Claude Code harness behaviors (verified
2026-06-12):

- `Workflow` `args` arrive in the script **JSON-encoded as a string** on both the `name:`
  and `scriptPath:` channels — every script starts with
  `if (typeof args === 'string') args = JSON.parse(args)` plus shape validation.
- Workflow `agent()` resolves only **built-in and plugin** agent types; host
  `.claude/agents/*.md` are invisible to it. Host role doctrine travels through
  `args.doctrines` and dispatches on `general-purpose`.

New workflow scripts need the same prologue and dispatch pattern.
