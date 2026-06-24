# 555-tools

A Claude Code plugin marketplace. It ships two plugins: **spec** — the full project lifecycle,
from an optional greenfield **genesis** stage that picks your stack and design direction *before*
the pipeline starts (see [below](#starting-from-scratch-the-genesis-stage)) through the spec-driven
plan → design → build → review pipeline; and **git** — a fast add-all-and-commit flow and a guided
merge.

The short version of the pipeline: you write a plan once with the strongest model, other agents attack the
plan to find holes, cheap models do the typing, and an independent review has to sign off
before the work counts as done. The steps in between run as a script, not as model
improvisation — so a crashed build resumes instead of restarting.

## How it fits together

There are only two things to learn: you **set a repo up once**, then run a **short loop for
every feature**. Everything else is optional or automatic.

```
  SET UP ONCE (per repo)                 PER FEATURE (repeat for each change)
  ──────────────────────                 ────────────────────────────────────
  spec:genesis-architect ┐               spec:plan ─▶ spec:design ─▶ spec:build ─▶ spec:review
  spec:genesis-design     ├─▶ spec:init    write      (optional UI)   implement      sign off
    (new projects only) ┘       └─▶ spec:enforce

  Anytime:  spec:doctor  — read-only health check  ·  a hook auto-warns when generated files go stale
```

1. **Set up the repo once.** Run `/spec:init` — it studies your repo, writes its config + rules,
   and then runs `/spec:enforce` to turn those rules into real checks in your gate command. After
   this, the pipeline is ready. (Brand-new project with no code yet? Run the **genesis** stage
   *first* — it picks your stack and design direction and scaffolds the repo. See
   [the genesis stage](#starting-from-scratch-the-genesis-stage). Existing repos skip it.)
2. **Build each feature with the loop.** `plan → build → review` (with an optional `design` step
   for UI). This is the part you run over and over.
3. **Forget the rest until you need it.** `/spec:enforce` is re-runnable when your rules or
   tooling change; `/spec:doctor` is a read-only health check when something feels stale; a hook
   warns you automatically if a plugin update makes your generated files outdated.

## Install

```
/plugin marketplace add 555ventures/claude-plugins
/plugin install spec@555-tools           # the full lifecycle — genesis + the pipeline
/plugin install git@555-tools            # optional — fast commit + guided merge
```

## 1. Set up the repo (once)

**Existing repo** — the only required step:

```
/spec:init          # profiles the repo, writes config + rules, then runs /spec:enforce for you
```

**Brand-new project** (no code yet) — run the genesis layer first, then init:

```
/spec:genesis-architect "a trading simulator for retail traders in Japan"  # picks stack + scaffolds
/spec:genesis-design "..."                                                 # picks the design direction
/spec:init                                                                 # grounds the now-real repo
```

Until `/spec:init` has run, every other `spec` command refuses to start.

## 2. Build a feature (the loop you repeat)

```
/spec:plan "move tickSize from symbol to dataset"     # write + harden the spec (asks you the hard questions)
/spec:design specs/20260612/01-tick-size.md           # OPTIONAL: approve the UI visually (catalog repos only)
/spec:build  specs/20260612/01-tick-size.md           # implement it, test-first, in parallel batches
/spec:review specs/20260612/01-tick-size.md           # independent check; flips the spec to "done"
```

`plan` prints the spec's path — paste it into the commands that follow. `design` only appears in
repos with a component catalog (Storybook for web, Widgetbook for Flutter); skip it everywhere
else. Small, low-risk changes don't need the pipeline at all — `plan` will tell you when a change
is too small to bother and to just ask for it directly.

## 3. Keep it healthy (occasional)

- **`/spec:enforce`** — re-run when you add/change rules or your linters/tooling move; it
  re-discovers and re-wires the deterministic checks. (You don't run it the first time — `init`
  does.)
- **`/spec:doctor`** — a cheap, read-only check that your generated files still match the plugin
  and the codebase. It recommends a targeted patch, a full `/spec:init` refresh, or a
  `/spec:enforce` re-run — it never changes things on its own.
- **Automatic drift warning** — a hook compares a contract hash on every command and warns you
  the moment a plugin update makes your grounding files stale. No bookkeeping on your part.

## Command reference

| Command | What it does | How often |
|---|---|---|
| `/spec:genesis-architect` | Picks stack + structure for a brand-new project and scaffolds it | Once, new projects only |
| `/spec:genesis-design` | Picks the UX/visual direction and writes the design canon | Once, new projects only |
| `/spec:init` | Profiles the repo, generates config + rules + agents, then runs `/spec:enforce` | Once per repo (re-run to refresh) |
| `/spec:enforce` | Turns the repo's rules into deterministic checks wired to the gate | On rule/tooling drift |
| `/spec:plan` | Writes and hardens one spec — explores, drafts, lets refuters attack it | Per feature |
| `/spec:design` | Approve the UI visually before logic is written (catalog repos); the expensive model plans + reviews, Sonnet implements every component; optionally seeded read-first by a Claude Design mockup (`design_source`) | Per UI feature (optional) |
| `/spec:build` | Implements the spec test-first, in parallel, resumably | Per feature |
| `/spec:review` | Independent review; flips the spec to `done` | Per feature |
| `/spec:doctor` | Read-only drift check of the generated files | When something feels stale |
| `/spec:import-design` | Pulls a finished Claude Design mockup into the repo as real tokens + components (no spec) | Anytime you have a mockup |
| `/git:commit`, `/git:merge` | Fast add-all-commit; guided branch merge | Anytime |
| `/git:enter-worktree` | Enter (or re-enter) the isolated worktree for a spec — idempotent, owns `build_base` | Before `/spec:build` (or `/spec:design`) for isolation |

## Starting from scratch: the genesis stage

The spec pipeline assumes a repo that already exists and already made its big choices —
`/spec:init` *profiles* a stack, it doesn't *pick* one. The **genesis** stage of `spec` is the
part that picks. It runs two interactive sessions before the pipeline, for a brand-new
project, and hands a real, scaffolded, design-grounded repo to `/spec:init`:

```
/spec:genesis-architect → /spec:genesis-design → /spec:init → (the pipeline below)
```

**`/spec:genesis-architect`** decides the stack, structure, and project shape, then scaffolds it.
**`/spec:genesis-design`** decides the UX and visual direction and writes the design canon
(doctrine + tokens + enforceable design rules). Both work the same way, and it's deliberately
not "ask one model and hope":

- **It researches first.** Parallel web-enabled agents study current best practice for *your*
  case — the latest framework combos, what to include vs deliberately leave out, and UI/UX norms
  that shift with the audience (a global app and a Japan-only app differ in typography, cultural
  color meaning, and density, not just translated strings).
- **Then a panel proposes, blind.** Three independent proposers (cheap models, distinct roles)
  take positions without seeing each other — no debate round, because debate makes models
  converge toward agreement instead of toward correct. A top-tier aggregator merges them into a
  decision matrix, a list of the genuinely hard-to-reverse forks, and the *minority* positions
  it would otherwise have buried.
- **You decide the forks.** Every hard-to-reverse choice (persistence, rendering, auth,
  component library, …) comes back to you as a question with the conflicting positions verbatim
  and a recommendation first — never silently averaged away. The losing-but-reasonable option is
  recorded in the decision record, so the *why* survives.
- **It's archetype-aware.** Web app, mobile app, AI bot, backend service, trading sim, CLI,
  data pipeline — the archetype drives which stacks are candidates, which research runs, and
  whether there's a visual design stage at all (a headless bot gets conversation/persona
  guidelines, not a component catalog).

The handoff is all on disk, and the division of labor is sharp: genesis **decides** the
design rules (as plain categories — "no raw color", "i18n keys required", "respect feature
boundaries"); `/spec:enforce` **implements** them — and the rest of the repo's rule set — as
deterministic checks wired to your gate, discovering and verifying the right tool at runtime for
whatever stack genesis chose (no tool is ever hardcoded in the plugin). One enforcement brain,
no rules stranded as prose nobody runs.

Like the pipeline, this is heavy machinery — it's for the start of a real project, not a
weekend spike. Existing repos skip it entirely and go straight to `/spec:init`.

## Importing a Claude Design mockup (no spec)

Designed something in [Claude Design](https://claude.ai/design) and just want it in the repo?
**`/spec:import-design`** is the spec-free shortcut — no `plan`, no `build`, no state machine.
Paste the mockup URL and it translates the `.dc.html` into real code in *this* repo: design
tokens, base components in your framework, and a one-page design doctrine.

```
/spec:import-design https://claude.ai/design/p/<id>?file=<Name>.dc.html
```

- **Read-only on Claude Design** — it only fetches the mockup; it never writes back.
- **Greenfield or brownfield.** Empty repo → it bootstraps the whole design foundation from the
  mockup. Existing tokens/doctrine → it *extends* them, never overwrites; a real conflict (same
  token role, different value) stops and asks you to rule on it.
- **No `/spec:init` required.** It runs in a bare repo, and what it writes is ordinary repo canon
  — a later `/spec:init` picks it up as normal brownfield design, and `/spec:design` + `/spec:build`
  consume the same tokens and components.
- **Re-runnable.** Add screens to the same Claude Design project and re-invoke with the same URL;
  it skips components already on disk and only translates the new `.dc.html` files. Pass
  `?file=<name>` to re-import a *revised* screen on purpose.

It needs the Claude Design connector enabled (run `/design-login` if the fetch fails). This is the
one-shot "I have a mockup, put it in the repo" path; for ongoing UI work with review gates and spec
discipline, use `/spec:design` instead. To pick a visual *direction* from scratch with no mockup yet,
that's `/spec:genesis-design`.

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

**Design** (optional, repos with a component catalog — Storybook, Widgetbook) — the one
stage where the top-tier model does the typing, because here taste *is* the work. A Fable
designer session builds the stateless components inside the repo's design canon (design
tokens plus a one-page doctrine doc, bootstrapped by init), you iterate visually until
approved, then the spec is reconciled to the approved design and reusable taste rulings are
promoted into the doctrine for future specs. Build treats those components as finished
inputs: your eyes gate pixels, tests gate behavior.

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
| Fable | Planning sessions, the UI design stage, design forks, build-time consultant, mandatory checkpoints on risky surfaces (money, auth, migrations) |
| Opus | Build orchestration, gate triage |
| Sonnet | Implementation, tests, refuters, reviewers, design-stage plumbing (foundation files, catalog entries) |
| Haiku | Lookups, searches, narrow file reads |

The one exception to "Sonnet works" is the optional design stage: visual taste is the
product there, so the expensive model writes the components itself — and earns it back in
fewer human iteration rounds.

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

Workflow scripts in this repo guard against two Claude Code harness behaviors:

- **`args` is a control channel, not a data bus.** Pass only paths, ids, enums, booleans, and
  the gate command — never free text. Prose (spec/batch notes, role doctrine, project briefs)
  lives in files the agents Read. Free text corrupts the `args` JSON — its quotes and
  backslashes break against the harness's **version-inconsistent** encoding, which sometimes
  delivers the object verbatim and sometimes JSON-encoded as a string. The naive
  `if (typeof args === 'string') args = JSON.parse(args)` crashes cryptically when reality
  differs from the version you tested, so every script starts with the shared `normalizeArgs()`
  helper instead — it passes an object through, JSON-parses a string and unwraps up to two
  layers of accidental double-encoding, and throws a named diagnostic on `"[object Object]"`
  coercion or a parse failure — followed by shape validation. Copy it from
  `spec/workflows/wf-build.js` or `spec/workflows/wf-panel.js`.
- **Workflow `agent()` resolves only built-in and plugin agent types** — host
  `.claude/agents/*.md` are invisible to it. Host role doctrine and other prose travel as a
  **path** (`args.doctrinePaths`, `args.briefPath`, …) that the worker Reads, dispatching on
  `general-purpose`.

New workflow scripts need the same prologue and dispatch pattern.
