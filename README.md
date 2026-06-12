# 555-tools

A Claude Code plugin marketplace. It currently ships one plugin: **spec** — a spec-driven
development pipeline for Claude Code.

The short version: you write a plan once with the strongest model, other agents attack the
plan to find holes, cheap models do the typing, and an independent review has to sign off
before the work counts as done. The steps in between run as a script, not as model
improvisation — so a crashed build resumes instead of restarting.

## Quick start

```
/plugin marketplace add 555ventures/claude-plugins
/plugin install spec@555-tools
```

Then, once per repo:

```
/spec:init          # profiles the repo, generates config + rules; everything else refuses to run without it
```

And for each piece of work:

```
/spec:plan "move tickSize from symbol to dataset"     # writes and hardens the spec
/spec:build specs/20260612/01-tick-size.md            # implements it, test-first, in parallel batches
/spec:review specs/20260612/01-tick-size.md           # independent check; flips the spec to done
```

Repos with Storybook get an optional `/spec:design` stage between plan and build, where you
approve the UI visually before any logic is written.

## Why bother?

Letting one agent session "just build the feature" works — until the work gets big. Then it
fails in predictable ways:

- **Expensive models doing cheap work.** A frontier model spends most of a large build on
  mechanical edits a cheaper model handles fine, while file dumps crowd out its judgment.
- **Plans nobody pushed back on.** A spec written in one pass has blind spots. The
  implementation inherits them — and so does a reviewer running on the same model. Real
  example: a test author mislabeled half-up rounding as ceiling, the implementer bent the
  code to pass the wrong test, and every gate went green around a real money bug. Only an
  independent review caught it.
- **No way to resume.** When the model improvises the orchestration, a crash at 80% means
  paying for the same 80% again.
- **Parallel agents colliding.** One worker once ran a repo-wide `git checkout .` and wiped
  its siblings' uncommitted work. (Workers are now banned from git entirely.)
- **Scope creep nobody notices.** A "fix" touches a file no one planned to touch, and
  nothing flags it.

The pipeline is a fix for each of these, wired together.

## The four stages

```
┌───────────┐    ┌─────────────┐    ┌────────────┐    ┌─────────────┐
│ spec:plan │ →  │ spec:design │ →  │ spec:build │ →  │ spec:review │
└───────────┘    └─────────────┘    └────────────┘    └─────────────┘
 draft→hardened   optional, UI       →implementing      →done
```

**Plan** — one session with the top-tier model: explore the codebase, draft the spec, then
send independent "refuter" agents to attack it. Holes get fixed before the spec locks. Open
questions are never guessed at — they're marked `[NEEDS CLARIFICATION]` inline, and the
pipeline refuses to proceed until every marker is resolved. The locked spec contains a
decisions table workers must follow verbatim, explicit assumptions with fallbacks, and
acceptance criteria written as `WHEN x THE SYSTEM SHALL y` with literal input → output
examples, so a test author can't misread them.

**Design** (optional, Storybook repos only) — build the stateless components and stories
first, iterate visually with the human until approved, then reconcile the spec to the
approved design. Build treats those components as finished inputs: your eyes gate pixels,
tests gate behavior.

**Build** — a deterministic workflow script takes over. Test authors write failing tests
from the spec alone (never from the implementation), a red-check confirms the tests actually
fail, then implementation batches run in parallel. Anything surprising — a wrong assumption,
an unplanned design fork, a failure outside the planned files — stops the worker and
escalates: first to a high-tier consultant agent, then to you. Your ruling is written into
the spec and the workflow resumes; finished batches come back from cache, so you only pay
for the changed work.

**Review** — independent reviewers (never the model that wrote the plan) check the diff
against the spec. Every serious finding then faces refuter agents that see only the claim;
a finding dies only if all refuters kill it, and killed findings are still reported. For
repos without their own drift checker, review also greps every acceptance-criterion ID
against the test files — an AC with no test is an automatic hard finding. Review is the only
stage that flips a spec to `done`.

The state machine `draft → hardened → implementing → done` is enforced by a hook — running
a command against a spec in the wrong state is blocked before the model even sees it.

## Which model does what

Every agent call names its model explicitly; nothing inherits. The rule of thumb:
**Fable judges; Opus conducts; Sonnet works; Haiku looks up.**

| Model | Role |
|---|---|
| Fable | Planning sessions, design forks, build-time consultant, mandatory checkpoints on risky surfaces (money, auth, migrations) |
| Opus | Build/design orchestration, gate triage |
| Sonnet | Implementation, tests, stories, refuters, reviewers |
| Haiku | Lookups, searches, narrow file reads |

No Fable access? Put your strongest model in the judgment seats. The structure — judge ≠
conductor ≠ worker, reviewer never the planning model — matters more than the tier names.

## When *not* to use it

This is heavy machinery, and the pipeline's own docs tell you to stay out of it by default.
Use it only when the work needs at least one of:

- **Delegation** — big enough that cheap workers should type while the strong model only plans
- **Durability** — spans multiple sessions; the spec is the state you re-enter from
- **Gates** — risky surfaces that warrant refuters, independent review, and checkpoints

Small single-area changes never get a spec at all. Risk tiers (T1/T2/T3) scale the number of
refuters, reviewers, and checkpoints to what the change can actually break.

## How it compares

- **One agent session ("just build it")** — fine for small work, and the pipeline says so.
  For big work you lose resumability, price discipline, and any pushback on the plan.
- **Plan mode / TODO-list agents** — a plan only its author reviewed is a draft. Here plans
  are attacked before they lock, and execution is a script with caps and caching, not the
  same model freestyling through a checklist.
- **Autonomous loops ("run until done")** — a green gate is necessary, not sufficient; loops
  happily bend code to a wrong test. This pipeline bounds the iteration (repair caps,
  escalation triggers) and adds the gates a loop lacks: red-check, independent review,
  refutation filters.
- **Ad-hoc multi-agent fan-out** — without deterministic control flow, the orchestration is
  re-improvised every run: batching drifts, failures restart from zero, agents collide.
  Here ordering, caps, and retries live in a versioned script, and workers can't touch git.

### Against the named SDD frameworks

The prominent spec-driven frameworks share one structural trait: they are *spec-document
generators*. They get you excellent documents, then execution is still one agent walking a
task list — no enforced test-first, no adversarial check on the plan or the diff, no resume.
This pipeline's bet is that the document is the easy half; the borrowable ideas they do have,
we took (EARS-style acceptance criteria from Kiro, clarification markers from Spec Kit's
`/clarify`).

| Framework | What it is | Its edge over this pipeline | This pipeline's edge over it |
|---|---|---|---|
| [GitHub Spec Kit](https://github.com/github/spec-kit) | CLI + slash commands (constitution → specify → clarify → plan → tasks) for Copilot, Claude Code, Cursor, Gemini | Runs on many agents and tools; biggest community; the constitution idea | Executable specs (file plan → parallel batches, resume from cache); refuters attack the plan; independent review; tiers keep small work out entirely |
| [Kiro](https://kiro.dev/) (AWS) | Agentic IDE: prompt → requirements.md (EARS) / design.md / tasks.md | Integrated IDE, zero setup, EARS rigor end-to-end | Everything past document generation: enforced TDD-red, deterministic orchestration, refutation-filtered review |
| [OpenSpec](https://github.com/Fission-AI/OpenSpec) | Lightweight spec layer: living specs + delta change proposals (propose → apply → archive) | Simplicity; clean brownfield change-tracking via deltas | Enforcement — the state machine is a hook, not a convention; TDD; model economics; review independence |
| [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) | Role-playing agent team (PM, Architect, Dev, QA) over an agile cycle | Rich role library; covers non-code planning; tool-portable | Deterministic control flow instead of improvised agent handoffs; its QA agent shares the author's blind spots — review here is cross-model |

Pick them when you need portability across tools or a team-readable methodology with low
ceremony. Pick this when the failure modes you care about live in *execution* — wrong tests
going green, plans nobody attacked, builds that can't resume.

The honest caveat: this is heavier than all of the above, and tightly coupled to Claude
Code. If the work doesn't need delegation, durability, or gates — don't use it.

## More detail

See [spec/README.md](spec/README.md) for the full flow, recipes (standard change, UI-bearing
change, mid-build requirement change), and the design decisions behind each stage.

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
