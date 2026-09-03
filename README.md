# 555-tools

A Claude Code plugin marketplace with two plugins:

- **spec** — the full project lifecycle: optional greenfield **genesis** (picks your stack and
  design direction), then the spec-driven **plan → run** loop per feature, and a **release**
  gate per milestone.
- **git** — fast add-all-commit and a guided merge.

The idea in one sentence:

> **The expensive model authors the contract; cheap models execute it behind deterministic
> gates; the expensive model is consulted, not resident; an uncorrelated model reviews the
> result.**

Fable writes and hardens the plan, Sonnet workers do the typing test-first behind gates, and an
independent review has to *demonstrate* its verdicts — executed tests, an observed app boot —
before work counts as done. The steps run as a script, not model improvisation, so a crashed
build resumes instead of restarting.

## Install

```
/plugin marketplace add 555ventures/claude-plugins
/plugin install spec@555-tools
/plugin install git@555-tools            # optional
```

## Set up a repo (once)

**Existing repo** — one required step:

```
/spec:init          # profiles the repo, writes config + rules, then runs /spec:enforce for you
```

**Brand-new project** (no code yet) — mock the product first, then run genesis and enforce:

```
/spec:mocks                                                               # seed → shapes → wireframes → theme → skin → review → approved mocks
/spec:genesis         "a trading simulator for retail traders in Japan"  # stack + scaffold + roadmap briefs, grounded in the approved mocks
/spec:enforce
```

Chain: `/spec:mocks → /spec:genesis → /spec:enforce → /spec:plan`.

`/spec:mocks` is optional but recommended for any product with a UI: a driver-stepped design
session derives its state from disk, gates every advance on a provenance ledger, and ends with
an approved set of screens genesis can ground its stack pick in. Genesis researches live (web
agents), has one proposer — the planning session itself — write the decision record from that
research, and brings every hard-to-reverse fork back to you as a question — nothing is
silently decided without you. It ends with a scaffolded repo and `docs/roadmap/` briefs, so
setup never ends without a next command. Existing repos skip both entirely.

Until `/spec:init` has run, every other `spec` command refuses to start.

## Build a feature (the loop you repeat)

```
/spec:sketch docs/roadmap/01-*.md            # optional, UI briefs: mock + brainstorm, ratify
/spec:plan   docs/roadmap/01-*.md            # write + harden the spec (asks the hard questions)
/spec:run    specs/20260716/01-foo.md        # hardened → done: build driver, then review driver
```

- `plan` prints the spec path — paste it into the commands that follow. It also tells you when a
  change is too small to bother; small work should just be asked for directly.
- `sketch` only matters for UI-bearing work. It mocks ONE brief before planning and triages every
  brainstorm change into its binding home (mock / brief / scope / ADR); plan warns if you skipped
  it, never blocks.
- `/spec:run` carries a hardened spec the rest of the way itself: design when due, then
  test-first implementation behind the host gate, then independent executed review. It stops
  only for decisions — design approval, findings the disposition agent wants to let stand,
  merge strategy, and the step out of the worktree before merge — and never for a `/clear`.
- Requirement changed mid-build? Write the ruling into the spec's Decisions table — that is
  where workers read it — and re-run `/spec:run`; it resumes by skipping File Plan rows the
  diff already shows landed.

Each stage refuses to run out of order (`draft → hardened → implementing → done` is enforced by
a hook); `/spec:run` itself is admitted on `hardened`, `implementing`, and `done` since one
invocation now spans design through review. A wrong command still costs you an error message,
not a mess.

## Ship a milestone

```
/spec:release       # staging deploy → executed checks against the deployed product → confirmed promote
```

Per-spec review proves a diff works on a dev boot; release proves the milestone works as a
*deployed product*. Run it every few briefs so cross-spec seams get executed continuously.

## Keep it healthy (occasional)

- **`/spec:doctor [--fix]`** — drift + ledger health check; run after plugin updates or when
  something feels stale. A hook also auto-warns when generated files go stale.
- **`/spec:enforce`** — re-mechanize your rules into deterministic checks when rules or tooling
  change (init runs it the first time).
- **`/spec:escape`** — record a defect that slipped past review; `/git:commit` offers to capture
  one automatically on fix-shaped commits. This keeps the review layer honest.
- **`/spec:atlas`** — whole-product design view: every mock at device size, arranged by journey,
  gap cards for unmocked surfaces. Zero tokens, never required.

## Command reference

| Command | What it does | When |
|---|---|---|
| `/spec:mocks` | Driver-stepped design entry point: seed → shapes → wireframes → theme → skin → review → approved mocks | Greenfield only, before genesis |
| `/spec:genesis` / `-design` | Stack + scaffold + roadmap + rendered design candidates in your browser; ratify the pick | Greenfield only, before init |
| `/spec:init` | Profile the repo, generate the grounding layer, run enforce | Once per repo |
| `/spec:sketch` | Mock + brainstorm one roadmap brief; ratify mock↔brief agreement | Before planning a UI-bearing brief |
| `/spec:plan` | Author + adversarially harden a spec | Per feature |
| `/spec:run` | Runs the whole feature: design when due, then test-first implementation behind the host gate, then independent executed review, commits/merges and flips `done`; resumable, stopping only for decisions | Per feature |
| `/spec:design` | Stage entry point: mock → components → your catalog approval | UI specs, catalog repos only |
| `/spec:build` | Stage entry point: test-first implementation behind the host gate, direct into the build driver alone | Per feature, if resuming the build stage alone |
| `/spec:review` | Stage entry point: re-enter the review driver directly (same driver `/spec:run` runs at `--via loop`) | Per feature, if resuming review alone |
| `/spec:release` | Staging deploy → executed checks → confirmed promote | Per milestone |
| `/spec:atlas` | Whole-product design view + annotation loop | Anytime |
| `/spec:doctor` | Drift + ledger check; `--fix` repairs with approval | When things feel off |
| `/spec:escape` | Record a defect that slipped past review | When one surfaces |
| `/spec:enforce` | Turn rules into deterministic checks | On rule/tooling change |
| `/git:commit`, `/git:merge` | Add-all-commit (with escape capture); guided merge | Anytime |
| `/git:enter-worktree` | Enter the isolated worktree for a spec | Before build/design isolation |

## What makes it different

This is not another specify → plan → implement template — that skeleton is commodity now
([GitHub Spec Kit](https://github.com/github/spec-kit), [OpenSpec](https://github.com/Fission-AI/OpenSpec),
Kiro, BMAD, and several Claude Code plugins all have one). This plugin was built around a
different question: **how do you trust work you didn't watch happen?** Its answers don't exist
elsewhere:

- **The review must execute, not read.** Elsewhere "review" is a model reading a diff; here the
  reviewer runs the tests and boots the app before a verdict counts. Independent testing of Spec
  Kit found exactly this gap — good planning artifacts, code that drifts from spec intent.
- **The review layer is falsifiable.** `/spec:escape` records defects that slipped past a CLEAN
  verdict, and guards that don't earn their keep on ledger evidence get retired. No other tool
  keeps score on its own review process.
- **Model economics are encoded.** Expensive model authors and judges, cheap models type behind
  deterministic gates, an uncorrelated model reviews. Others are single-model or model-agnostic.
- **Genesis writes the record in front of you.** Live-researched stack and design decisions,
  authored by one proposer — the session itself — with hard forks surfaced as questions — not
  a template questionnaire.
- **It's shaped by daily production use.** 555 Ventures LLC runs this pipeline internally every
  day across multiple projects. Features here were promoted or retired on evidence from real
  builds — the v7.0 redesign deleted every guard that stopped earning its keep.

Honest trade-off: this buys rigor with ceremony and maintenance surface (grounding layers,
deterministic gate scripts, doctor checks). If you want a lightweight spec loop, Spec Kit or OpenSpec is
less to carry. This is for when the failure you fear is *plausible-looking work that was never
actually verified*.

## When *not* to use it

This is heavy machinery. Use the pipeline only when the work needs **delegation** (big enough
that workers should type while the strong model plans), **durability** (spans sessions), or
**gates** (blast radius that warrants refuters and executed review). A one-file fix in an
established pattern never gets a spec — the plugin will tell you the same.

## Notes for plugin authors

- **Behavior lives in scripts; prose states contracts.** Deterministic checks are scripts with
  exit codes (`spec/scripts/`), pinned by behavioral tests that execute them — never regexes
  over prose. A standing guard is earned by a third recurrence of a class (core § Incident
  Policy), never by an incident memory written into doctrine.
- **The design family's `wf-*.js` files are frozen checked-in scripts** (the codegen seam was
  retired in v7.0); they change only under a spec that names them, pending the v7.1 design
  thinning (`docs/roadmap/08-design-thinning.md`).
- **Doctrine hygiene:** state a fact once (highest common ancestor in `doctrine/core.md` or
  `doctrine/design.md`, everywhere else points); never name a derived case.
