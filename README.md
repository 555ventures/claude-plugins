# 555-tools

A Claude Code plugin marketplace. It ships two plugins: **spec** — the full project lifecycle,
from an optional greenfield **genesis** stage that picks your stack and design direction *before*
the pipeline starts (see [below](#starting-from-scratch-the-genesis-stage)) through the spec-driven
plan → design → build → review pipeline and a per-milestone **release** gate; and **git** — a fast
add-all-and-commit flow and a guided merge.

The short version of the pipeline: you write a plan once with the strongest model, other agents
attack the plan to find holes, cheap models do the typing behind deterministic gates, and an
independent review has to *demonstrate* its verdicts — including booting the shipped code — before
the work counts as done. The steps in between run as a script, not as model improvisation — so a
crashed build resumes instead of restarting.

One rule generates the whole architecture:

> **The expensive model authors the contract; cheap models execute it behind deterministic
> gates; the expensive model is consulted, not resident; an uncorrelated model reviews the
> result.**

Everything else in this README is that sentence, applied.

## Anthropic Fable Design Principles

This project is inspired by the engineering principles behind Claude Fable and Claude Code:

- **Context over instructions** — provide rich runtime context instead of encoding behavior in large system prompts.
- **Objectives over procedures** — describe the desired outcome, not the implementation steps.
- **Unknowns over assumptions** — identify and clarify high-impact unknowns before implementation.
- **Keep only product invariants in the system prompt** — move project-specific guidance into dynamic context, repository inspection, or tools.
- **Use stronger models for high-leverage reasoning** (planning, architecture, guidance) and delegate token-heavy execution to lower-cost models where appropriate.
- **Optimize for total workflow cost**, not the cost of an individual request.

### References

- Thariq Shihipar, *A Field Guide to Claude Fable: Finding Your Unknowns*
  https://claude.ai/blog/a-field-guide-to-claude-fable-finding-your-unknowns

### How the principles show up in the pipeline

| Principle | Where it lives here |
|---|---|
| Context over instructions | Commands read repo-generated grounding files (`spec.config.json`, pipeline rules, per-host verify skill) instead of carrying host knowledge in the plugin; `spec-paths shared-for <cmd>` slices doctrine to only the sections a command consumes |
| Objectives over procedures | Plan's hardening moves (blind-spot pass, spikes, adversarial refuters) are *moves with reasons*, not mandatory phases; workers get the spec's contract, not step-by-step scripts |
| Unknowns over assumptions | `[NEEDS CLARIFICATION]` markers block the pipeline until resolved; genuine design forks always go to the user; empirical spikes answer unknowns in a throwaway worktree before the spec locks |
| Only invariants stay resident | Doctrine states each rule once in its highest common ancestor; everything host-specific is generated per repo by `/spec:init` |
| Strong models for leverage, cheap models for volume | Fable plans, judges taste, and adjudicates; Sonnet orchestrates, implements, and reviews; consults are surprise-driven, never a resident seat |
| Total workflow cost | The run ledger (`.claude/spec-runs.jsonl`) measures every stage; mechanisms that spend without signal get retired on that evidence (see [the scaffold ledger](#every-guard-earns-its-keep-the-scaffold-ledger)) |

## The v5 redesign: what the data made us change

v5 wasn't a taste refresh — it was a confrontation with our own run ledger. Months of
per-run rows from real host repos said, in numbers:

- **Review cost as much as build** (~5M tokens each across the measured window) — and **61% of
  review spend went to runs that found nothing**.
- **The refutation filter** — adversarial agents arguing findings to death — **killed only 4
  findings ever**, and when we execution-audited those kills, **2 of the 3 audited were wrong**:
  real defects, argued out of existence.
- **Mandatory T3 checkpoints returned PASS on 100% of measured runs.** A gate that never blocks
  isn't safety; it's spend.
- One spec burned **1.18M tokens on four full re-review iterations** — re-reading the whole
  codebase to check a 40-line fix, four times.

Each number forced a specific change:

1. **No finding dies by argument anymore.** The refuter layer is retired. Every serious finding
   now gets one *execution-grounded* verifier: it dies only on a failed reproduction, a verbatim-
   quoted spec sanction, or a plain miscitation. Models are good at sounding convincing —
   so conviction stopped being admissible evidence. Every failure path fails closed: a crashed
   verifier means the finding *survives*, flagged.
2. **Review panels scale to the diff.** A 197-loc diff once drew a 308K-token review. Now one
   reviewer is the default; two only for T3 specs with ≥300-loc diffs. Fix iterations re-review
   at `fix-delta` scope — one reviewer reads the fix diff and the prior findings, never the whole
   codebase again.
3. **Checkpoints became consults.** The build retainer (now Fable, Opus fallback) is summoned
   only when a worker hits a genuine surprise — a wrong assumption, an unplanned fork. The
   ritual check-ins that always passed are gone; the escalation path that catches real
   trouble stays.
4. **Small work skips the machinery.** A single-batch, ≤4-file spec runs a fast path: one test
   author, one implementer, the gate run in-session — no workflow, no orchestration overhead.

And one inversion the published evidence supported: Anthropic measured a **Sonnet worker with an
Opus advisor beating Opus-as-orchestrator** (+2.7pp on SWE-bench Multilingual at −11.9% cost).
So the expensive model moved out of the conductor's chair and into the author's: **Sonnet now
orchestrates build and review at every tier**, and the expensive model's tokens go where they
compound — the spec, the design judgments, the fork rulings, the surprise consults.

## The v6 turn: executed verification and the local design pipeline

v6 pushed the same "no claim without an observed execution" property into every place a stage
could still pass on paper:

- **CLEAN requires a boot.** Review's verdict no longer rests on gates and static reading:
  `scripts/smoke.sh` runs the host's declared `runtime` contract and observes the app actually
  start. No boot, no CLEAN.
- **Skipped tests are hard findings.** The AC↔test matrix counts *executed* tests; a skip only
  survives if the acceptance criterion declares its environment gate.
- **Init proves activation.** `/spec:init` won't stamp itself complete until
  `manifest-check.sh` shows every generated file exists *and activates* — authored ≠ activated.
- **`/spec:release` is the milestone gate.** Per-spec review proves a diff works on a dev boot;
  release proves the milestone works as a *deployed product* — staging deploy, executed checks
  against the deployed artifact, journey walks over the shipped briefs, then a
  confirmation-gated production promote. Run it per milestone so cross-spec seams get executed
  every few specs, not all at once at handover.
- **The design pipeline went fully local.** Mocks are plain HTML files in your repo, authored
  and iterated under a deterministic render harness — Claude Design (claude.ai/design) is now a
  strictly opt-in escape hatch, not the main path. Greenfield taste is decided in a rendered
  candidate funnel you judge in your own browser (`/spec:genesis-explore`), and the
  whole-product picture is a zero-token generated page (`/spec:atlas`).
- **The feedback loop closed across repos.** Run ledgers, `[plugin]`-tagged gotchas, and escape
  rows accumulate in each host as side effects of normal runs; release (or doctor) flushes them
  into a dated feedback brief; on the plugin side, `/intake` re-executes each finding's evidence
  before accepting it — and an accepted finding is a failing test first.

## Every guard earns its keep: the scaffold ledger

The most durable change from v5 isn't a mechanism — it's a rule about mechanisms. Every gate,
advisory, and structural guard in the pipeline is registered in
`spec/doctrine/scaffold-ledger.md` with the incident or measurement that justified it, the
model generation it was earned under, and **the condition that promotes or retires it**. A row
without a retire condition is an invalid row.

Why: every harness guard encodes an assumption about what the model can't do — and those
assumptions rot as models improve. The refutation filter and the mandatory checkpoints both
*seemed* prudent when added; the ledger is how "seemed prudent" gets replaced by "measured,
dated, and falsifiable." `/spec:doctor` audits it (check 13): a live mechanism missing from the
ledger, or a retired one still gating, is a finding. New advisory mechanisms (the behavioral
verify skill, the vision design review) ship as *advisory* and must earn gate status from
ledger data — the same bar that retired their predecessors.

The feedback loop closes at the commit line: when a defect surfaces *after* review passed it,
`/spec:escape` records it against the review that missed it — and `/git:commit` offers to
capture one automatically when a commit looks like a fix to spec-built code. Those escape rows
are the pipeline's ground truth for whether review is actually working.

## How it fits together

There are only two things to learn: you **set a repo up once**, then run a **short loop for
every feature**. Everything else is optional or automatic.

```
  SET UP ONCE (per repo)                    PER FEATURE (repeat for each change)
  ──────────────────────                    ────────────────────────────────────
  spec:genesis-architect ┐                  spec:plan ─▶ spec:design ─▶ spec:build ─▶ spec:review
  spec:genesis-explore    ├─▶ spec:init       write      (optional UI)   implement      sign off
  spec:genesis-design    ┘       └─▶ spec:enforce
    (new projects only)
                                            PER MILESTONE
                                            ─────────────
                                            spec:release — staging deploy ▶ executed checks ▶ promote

  Anytime:  spec:doctor — drift check (--fix repairs)  ·  spec:atlas — whole-product design view
            a hook auto-warns when generated files go stale
```

1. **Set up the repo once.** Run `/spec:init` — it studies your repo, writes its config + rules
   (including a per-host verify skill that knows how to launch and observe *your* app, and an
   evidence-cited Gotchas section that later runs fold real lessons into), proves every generated
   file activates before stamping itself complete, and then runs `/spec:enforce` to turn those
   rules into real checks in your gate command. (Brand-new project with no code yet? Run the
   **genesis** stage *first* — see
   [the genesis stage](#starting-from-scratch-the-genesis-stage). Existing repos skip it.)
2. **Build each feature with the loop.** `plan → build → review` (with an optional `design` step
   for UI). This is the part you run over and over.
3. **Ship each milestone with `/spec:release`.** When a roadmap brief (or coherent group) lands,
   release deploys to staging, executes the checks against the deployed product, and promotes
   behind your explicit confirmation.
4. **Forget the rest until you need it.** `/spec:enforce` is re-runnable when your rules or
   tooling change; `/spec:doctor` is a health check when something feels stale (`--fix` applies
   evidence-cited repairs with per-patch approval); a hook warns you automatically if a plugin
   update makes your generated files outdated.

## Install

```
/plugin marketplace add 555ventures/claude-plugins
/plugin install spec@555-tools           # the full lifecycle — genesis + the pipeline + release
/plugin install git@555-tools            # optional — fast commit + guided merge + escape capture
```

## 1. Set up the repo (once)

**Existing repo** — the only required step:

```
/spec:init          # profiles the repo, writes config + rules, then runs /spec:enforce for you
```

**Brand-new project** (no code yet) — run the genesis layer first, then init:

```
/spec:genesis-architect "a trading simulator for retail traders in Japan"  # picks stack + scaffolds + roadmap briefs
/spec:genesis-explore   "..."                                              # rendered design candidates → your pick
/spec:genesis-design    "..."                                              # ratifies the pick into design canon
/spec:init                                                                 # grounds the now-real repo
```

Until `/spec:init` has run, every other `spec` command refuses to start.

## 2. Build a feature (the loop you repeat)

```
/spec:plan "move tickSize from symbol to dataset"     # write + harden the spec (asks you the hard questions)
/spec:design specs/20260612/01-tick-size.md           # OPTIONAL: approve the UI visually (catalog repos only)
/spec:build  specs/20260612/01-tick-size.md           # implement it, test-first, in parallel batches
/spec:review specs/20260612/01-tick-size.md           # independent, execution-verified check; flips to "done"
```

`plan` prints the spec's path — paste it into the commands that follow (on a roadmap project,
`plan` takes the brief: `/spec:plan docs/roadmap/01-*.md`). `design` only appears in repos with a
component catalog (Storybook for web, Widgetbook for Flutter); skip it everywhere else. Small,
low-risk changes don't need the pipeline at all — `plan` will tell you when a change is too small
to bother and to just ask for it directly. And when a spec *is* warranted but small (one batch,
≤4 files), build takes the fast path automatically — no workflow machinery, just a test author,
an implementer, and the gate.

## 3. Ship a milestone (`/spec:release`)

Per-spec review proves a diff works on a dev boot; **release proves the milestone works as a
deployed product**. It derives what shipped since the last release (done specs grouped by roadmap
brief), deploys to staging with your host-declared commands (asked once, then recorded in
config — never invented), runs the executed checks and journey walks against the deployed
artifact, and promotes to production only behind your explicit confirmation. One ledger row and a
release report per run. Invoke it whenever a milestone lands — running it every few specs is what
keeps the final handover uneventful.

## 4. Keep it healthy (occasional)

- **`/spec:enforce`** — re-run when you add/change rules or your linters/tooling move; it
  re-discovers and re-wires the deterministic checks. (You don't run it the first time — `init`
  does.)
- **`/spec:doctor`** — a cheap, read-only check that your generated files still match the plugin
  and the codebase, that the run ledger is healthy, and that every guard mechanism still has the
  evidence it claims (the scaffold audit). `--fix` applies evidence-cited line-item repairs, each
  behind per-patch approval.
- **`/spec:escape`** — record a defect that got past review (or let `/git:commit` offer to
  capture it when you commit the fix). This is what keeps the review layer honest.
- **`/spec:atlas`** — the whole-product design picture, any time: every mock rendered at device
  size, arranged by your roadmap's journeys, with gap cards for declared-but-unmocked surfaces.
  `atlas sweep` fills the gaps with honest sketch-tier mocks; annotate the page and the loop
  routes each note to its root cause (mock detail vs product understanding).
- **Automatic drift warning** — a hook compares a contract hash on every command and warns you
  the moment a plugin update makes your grounding files stale. No bookkeeping on your part.

## Command reference

| Command | What it does | How often |
|---|---|---|
| `/spec:genesis-architect` | Picks stack + structure for a brand-new project, scaffolds it, writes the roadmap briefs | Once, new projects only |
| `/spec:genesis-explore` | Fresh UX research → rendered style tiles → interactive prototypes → your design pick | Once, new projects only |
| `/spec:genesis-design` | Ratifies the explore pick: winner's tokens verbatim + design doctrine + enforceable design rules | Once, new projects only |
| `/spec:init` | Profiles the repo, generates config + rules + agents + verify skill (activation-proved), then runs `/spec:enforce` | Once per repo (re-run to refresh) |
| `/spec:enforce` | Turns the repo's rules into deterministic checks wired to the gate | On rule/tooling drift |
| `/spec:plan` | Writes and hardens one spec — explores, drafts, lets refuters attack it | Per feature |
| `/spec:design` | Mock-first UI stage: author/bind a local HTML mock, Sonnet expands components behind fidelity checks, you approve in the catalog | Per UI feature (optional) |
| `/spec:build` | Implements the spec test-first, in parallel, resumably; fast path for ≤4-file specs | Per feature |
| `/spec:review` | Independent, execution-verified review — observed boot, executed tests; flips the spec to `done` | Per feature |
| `/spec:release` | Staging deploy → executed checks against the deployed product → confirmed promote | Per milestone |
| `/spec:atlas` | Whole-product design view: journey graph, gap sweep, annotation loop | Anytime |
| `/spec:escape` | Records a defect that surfaced after review passed it | When one surfaces |
| `/spec:doctor` | Drift + ledger + scaffold-evidence check; `--fix` repairs with approval | When something feels stale |
| `/spec:sketch` | Mock + brainstorm one roadmap brief before planning; ratifies mock↔brief agreement | Before planning a UI-bearing brief |
| `/git:commit`, `/git:merge` | Fast add-all-commit (with escape capture on fix-shaped commits); guided branch merge | Anytime |
| `/git:enter-worktree` | Enter (or re-enter) the isolated worktree for a spec — idempotent, owns `build_base` | Before `/spec:build` (or `/spec:design`) for isolation |

## Starting from scratch: the genesis stage

The spec pipeline assumes a repo that already exists and already made its big choices —
`/spec:init` *profiles* a stack, it doesn't *pick* one. The **genesis** stage of `spec` is the
part that picks. It runs three interactive sessions before the pipeline, for a brand-new
project, and hands a real, scaffolded, design-grounded repo — with a roadmap — to `/spec:init`:

```
/spec:genesis-architect → /spec:genesis-explore → /spec:genesis-design → /spec:init → the pipeline
```

**`/spec:genesis-architect`** decides the stack, structure, and project shape, records the
decisions as ADRs, scaffolds the repo — and writes `docs/roadmap/` briefs, so setup never ends
without a next command (`/spec:plan docs/roadmap/01-*.md`).

**`/spec:genesis-explore`** is the taste funnel. It runs a fresh UX research pass for *this*
project (never a frozen principle list), then a two-round rendered-candidate funnel: 6–8 style
tiles you judge in your own browser, culled to 2 interactive prototypes — each candidate born
with its own `tokens.css` (tokens-as-code from birth), persona-walkthrough agents filing
friction findings against the finalists. It ends with your recorded design pick.

**`/spec:genesis-design`** *ratifies* the pick instead of inventing a direction: the winner's
tokens become canon verbatim (no extraction step to drift), plus the design doctrine and
enforceable design rules. Rejected directions become recorded Dissents, not lost arguments.

All three work the same way, and it's deliberately not "ask one model and hope":

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
  guidelines, not a component catalog — explore politely skips itself).

Every handoff between stages is a file in `.claude/genesis/` or `docs/adr/`, so nothing lives
only in a chat transcript. The division of labor stays sharp: genesis **decides** the design
rules (as plain categories — "no raw color", "i18n keys required"); `/spec:enforce`
**implements** them — and the rest of the repo's rule set — as deterministic checks wired to
your gate, discovering and verifying the right tool at runtime for whatever stack genesis chose
(no tool is ever hardcoded in the plugin). One enforcement brain, no rules stranded as prose
nobody runs.

Like the pipeline, this is heavy machinery — it's for the start of a real project, not a
weekend spike. Existing repos skip it entirely and go straight to `/spec:init` (and can
hand-author the same roadmap shape from the bundled templates).

## UI work is local-first; Claude Design is the escape hatch

The design pipeline runs entirely in your repo: mocks are plain HTML files under
`design/mocks/`, consuming `design/tokens.css` by role, iterated under a deterministic render
harness that covers your declared theme × viewport matrix (`design/targets.json`). You judge
them in your own browser — via `/spec:design`'s catalog loop or `/spec:atlas`'s whole-product
page. No external canvas in the loop.

The atlas is the map; **`/spec:sketch <brief>`** is the workbench. Point it at one roadmap brief
(or a mock file, or a bare surface label) *before* you plan that brief: it mocks only that
brief's surfaces, then you brainstorm on them, and every change is triaged into its binding
home in the same round — pixels to the mock, structure to the brief's `surfaces` block, scope to
the brief's Scope, anything architecture-shaped to an open question or ADR delta. Sessions are
fully resumable from disk. It ends with a coherence readout; your confirmation ratifies the
mocks, and `/spec:plan` on that brief then reads mocks and brief that already agree (it's
optional — plan warns if you skipped it, but never blocks).

One escape hatch, strictly opt-in: a surface you prefer to design at Claude Design
(claude.ai/design) comes back as the spec's `design_source` URL — `/spec:design` fetches it
read-only and runs the same extract → skeletons → fidelity path as a local mock.

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
- **Reviews that argue instead of check.** Our own ledger caught the reverse failure too: an
  adversarial filter meant to kill false findings was killing *true* ones — models argue
  convincingly in both directions. Verdicts here now require a repro, a quote, or a citation —
  and a CLEAN requires an observed boot.
- **No way to resume.** When the model improvises the orchestration, a crash at 80% means
  paying for the same 80% again.
- **Parallel agents colliding.** One worker once ran a repo-wide `git checkout .` and wiped
  its siblings' uncommitted work. (Workers are now banned from git entirely.)
- **Scope creep nobody notices.** A "fix" touches a file no one planned to touch, and
  nothing flags it.

The pipeline is a fix for each of these, wired together — and each fix carries its own
evidence and expiry condition in the scaffold ledger, so the fixes themselves stay honest.

## The four stages (and the milestone gate after them)

```
┌───────────┐    ┌─────────────┐    ┌────────────┐    ┌─────────────┐    ┌──────────────┐
│ spec:plan │ →  │ spec:design │ →  │ spec:build │ →  │ spec:review │ →  │ spec:release │
└───────────┘    └─────────────┘    └────────────┘    └─────────────┘    └──────────────┘
 draft→hardened   optional, UI       →implementing      →done             per milestone
```

**Plan** — one session with the top-tier model: explore the codebase, hunt the blind spots
(the unknowns you didn't know to ask about), draft the spec, then send independent "refuter"
agents to attack it. When an unknown is empirical — "will this migration even work?" — a
throwaway worktree spike answers it with code instead of speculation. Holes get fixed before
the spec locks. Open questions are never guessed at — they're marked `[NEEDS CLARIFICATION]`
inline, and the pipeline refuses to proceed until every marker is resolved. The locked spec
contains a decisions table workers must follow verbatim, explicit assumptions with fallbacks,
and acceptance criteria written as `WHEN x THE SYSTEM SHALL y` with literal input → output
examples, so a test author can't misread them. This is where the expensive model's tokens
compound: every downstream stage executes this document.

**Design** (optional, repos with a component catalog — Storybook, Widgetbook) — **mock-always**:
the fork is where the mock comes from, not whether one exists. If the spec's surfaces have no
mock yet, the stage authors one first — a local HTML file under the render harness, drafted on
the most-constrained viewport and expanded to the full theme × viewport matrix only after you
approve the direction, so rejected directions never pay the matrix bill. Once a mock is bound,
the taste was spent upstream — so the work is faithful *transcription*, not re-design: a Sonnet
session authors skeletons against the mock (consulting the Fable retainer only at genuine
judgment points), Sonnet workers expand 100% of the components in one gated run, and a
deterministic fidelity check greps the code against the mock's strings, order, and layout,
fail-closed — "Send invite" cannot silently become "Send". You iterate visually in the catalog
until approved, then the spec is reconciled and reusable taste rulings are promoted into the
doctrine for future specs.

**Build** — a Sonnet orchestrator runs a deterministic workflow script. Test authors write
failing tests from the spec alone (never from the implementation), a red-check confirms the
tests actually fail, then implementation batches run in parallel. Anything surprising — a
wrong assumption, an unplanned design fork, a failure outside the planned files — stops the
worker and escalates: to the Fable retainer (the spec author's proxy, consulted only on
genuine surprises), then to you. Your ruling is written into the spec and the workflow
resumes; finished batches come back from cache, so you only pay for the changed work. Forced
departures a worker *can* absorb land in a deviations sidecar instead of vanishing — review
folds the recurring ones into the repo's Gotchas rules, so the next spec's map is already
corrected. Single-batch ≤4-file specs skip the workflow entirely.

**Review** — an independent reviewer panel (never the planning model), sized to the diff,
checks the work against the spec. Then the part that makes verdicts trustworthy: every
serious finding gets an execution-grounded verifier that must *demonstrate* its verdict — a
finding dies only on a failed reproduction, a verbatim-quoted spec sanction, or a plain
miscitation, never on a persuasive argument. Killed findings are still reported. **No verdict
rests on static analysis alone**: CLEAN requires an observed boot (`smoke.sh` runs the host's
declared runtime contract), and the AC↔test matrix counts *executed* tests — a skipped test is
a hard finding unless the AC declares its environment gate. Every failure path fails closed: a
crashed verifier or a hit verification cap means the finding survives, flagged. Fix iterations
re-review only the fix diff. Review is the only stage that flips a spec to `done` — and if a
defect escapes it anyway, `/spec:escape` records the miss against the review that made it.

**Release** — the per-milestone gate after review: deploy what shipped to staging with the
host's own declared commands, run the executed checks and e2e suite against the *deployed*
artifact, walk the shipped briefs' journeys, then promote to production only behind your
explicit confirmation. Every claim in the release report traces to an executed command —
release inherits the pipeline's core property: no stage may claim a protection it hasn't
observed executing.

The state machine `draft → hardened → implementing → done` is enforced by a hook — running
a command against a spec in the wrong state is blocked before the model even sees it.

## Which model does what

Every agent call names its model explicitly; nothing inherits. The placement rule from the
top of this README, cast as seats:

| Model | Role |
|---|---|
| Fable | Authors the contracts and holds the roadmap-level taste seat: planning sessions, genesis-explore judging, atlas direction rulings, design-fork adjudication; consulted (never resident) as the build/design retainer and the advisory vision review |
| Opus | The fallback seat wherever Fable is named, when Fable is unavailable |
| Sonnet | Orchestrates build and review at every tier; the resident `/spec:design` session on mock-bound work; implementation, tests, reviewers, execution verifiers, release orchestration, explore's tiles and prototypes |
| Haiku | Lookups, searches, narrow file reads |

Two things drove this placement, both evidence-driven. The orchestrator seat moved from Opus to
Sonnet (Anthropic's published measurement: Sonnet-with-an-Opus-advisor beat Opus-as-orchestrator
on quality *and* cost — the conductor's chair is not where expensive tokens compound). And the
expensive model's design tokens moved *upstream*: taste is decided at the roadmap level (the
explore funnel, the atlas), and by the time `/spec:design` runs against a bound mock, the work
is grounded transcription a Sonnet session handles — with the Fable retainer one consult away
when something genuinely surprising appears.

No Fable access? Put your strongest model in the judgment seats. The structure — author ≠
orchestrator ≠ worker, reviewer never the planning model — matters more than the tier names.

## When *not* to use it

This is heavy machinery, and the pipeline's own docs tell you to stay out of it by default.
Use it only when the work needs at least one of:

- **Delegation** — big enough that cheap workers should type while the strong model only plans
- **Durability** — spans multiple sessions; the spec is the state you re-enter from
- **Gates** — risky surfaces that warrant refuters, independent review, and execution-verified findings

Small single-area changes never get a spec at all. Risk tiers (T1/T2/T3) scale the number of
refuters and reviewers to what the change can actually break — and within a tier, the review
panel scales to the diff, not the fear.

## How it compares

- **One agent session ("just build it")** — fine for small work, and the pipeline says so.
  For big work you lose resumability, price discipline, and any pushback on the plan.
- **Plan mode / TODO-list agents** — a plan only its author reviewed is a draft. Here plans
  are attacked before they lock, and execution is a script with caps and caching, not the
  same model freestyling through a checklist.
- **Autonomous loops ("run until done")** — a green gate is necessary, not sufficient; loops
  happily bend code to a wrong test. This pipeline bounds the iteration (repair caps,
  escalation triggers) and adds the gates a loop lacks: red-check, independent review,
  execution-grounded verification, an observed boot behind every CLEAN.
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
| [GitHub Spec Kit](https://github.com/github/spec-kit) | CLI + slash commands (constitution → specify → clarify → plan → tasks) for Copilot, Claude Code, Cursor, Gemini | Runs on many agents and tools; biggest community; the constitution idea | Executable specs (file plan → parallel batches, resume from cache); refuters attack the plan; execution-verified review; tiers keep small work out entirely |
| [Kiro](https://kiro.dev/) (AWS) | Agentic IDE: prompt → requirements.md (EARS) / design.md / tasks.md | Integrated IDE, zero setup, EARS rigor end-to-end | Everything past document generation: enforced TDD-red, deterministic orchestration, execution-grounded verification, a measured feedback loop (run ledger + escapes) |
| [OpenSpec](https://github.com/Fission-AI/OpenSpec) | Lightweight spec layer: living specs + delta change proposals (propose → apply → archive) | Simplicity; clean brownfield change-tracking via deltas | Enforcement — the state machine is a hook, not a convention; TDD; model economics; review independence |
| [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) | Role-playing agent team (PM, Architect, Dev, QA) over an agile cycle | Rich role library; covers non-code planning; tool-portable | Deterministic control flow instead of improvised agent handoffs; its QA agent shares the author's blind spots — review here is cross-model and must demonstrate its verdicts |

Pick them when you need portability across tools or a team-readable methodology with low
ceremony. Pick this when the failure modes you care about live in *execution* — wrong tests
going green, plans nobody attacked, reviews that argue instead of check, builds that can't
resume.

The honest caveat: this is heavier than all of the above, and tightly coupled to Claude
Code. If the work doesn't need delegation, durability, or gates — don't use it.

## More detail

See [spec/README.md](spec/README.md) for the full flow, recipes (standard change, UI-bearing
change, mid-build requirement change), and the design decisions behind each stage.

## Notes for plugin authors

Workflow scripts in this repo guard against two Claude Code harness behaviors, and add one
maintenance rule of their own:

- **`args` is a control channel, not a data bus.** Pass only paths, ids, enums, booleans, and
  the gate command — never free text. Prose (spec/batch notes, role doctrine, project briefs)
  lives in files the agents Read. Free text corrupts the `args` JSON — its quotes and
  backslashes break against the harness's **version-inconsistent** encoding, which sometimes
  delivers the object verbatim and sometimes JSON-encoded as a string. The naive
  `if (typeof args === 'string') args = JSON.parse(args)` crashes cryptically when reality
  differs from the version you tested, so every script starts with the shared `normalizeArgs()`
  helper instead — it passes an object through, JSON-parses a string and unwraps up to two
  layers of accidental double-encoding, and throws a named diagnostic on `"[object Object]"`
  coercion or a parse failure — followed by shape validation.
- **Workflow `agent()` resolves only built-in and plugin agent types** — host
  `.claude/agents/*.md` are invisible to it. Host role doctrine and other prose travel as a
  **path** (`args.doctrinePaths`, `args.briefPath`, …) that the worker Reads, dispatching on
  `general-purpose`. (In-session `Agent` calls are different: host agents *do* resolve there,
  which is what build's fast path exploits.)
- **Never hand-edit a committed `wf-*.js`.** They are generated: each is assembled from a
  `spec/workflows/src/*.body.js` phase body plus shared `spec/workflows/fragments/*.frag`
  (arg normalization, group validation, dispatch) by `npm run build:workflows`. The shared
  helpers used to be enforced identical by "keep IDENTICAL" banners and hope; now there is one
  source of truth and a `--check` in `npm test` that fails on drift. Change the source or a
  fragment, rebuild, commit both.

New workflow scripts need the same prologue, dispatch pattern, and a `src/` body.
