# 555-tools

A Claude Code plugin marketplace with two plugins:

- **spec** — the full project lifecycle: optional greenfield **genesis** (picks your stack and
  design direction), then the spec-driven **plan → design → build → review** loop per feature,
  and a **release** gate per milestone.
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

**Brand-new project** (no code yet) — run genesis first, then init:

```
/spec:genesis-architect "a trading simulator for retail traders in Japan"  # stack + scaffold + roadmap briefs
/spec:genesis-explore   "..."   # rendered design candidates in your browser → your pick
/spec:genesis-design    "..."   # ratifies the pick into tokens + design canon
/spec:init
```

Genesis researches live (web agents), has a blind proposer panel argue the stack in front of
you, and brings every hard-to-reverse fork back to you as a question — nothing is silently
averaged away. It ends with a scaffolded repo and `docs/roadmap/` briefs, so setup never ends
without a next command. Existing repos skip it entirely.

Until `/spec:init` has run, every other `spec` command refuses to start.

## Build a feature (the loop you repeat)

```
/spec:sketch docs/roadmap/01-*.md            # optional, UI briefs: mock + brainstorm, ratify
/spec:plan   docs/roadmap/01-*.md            # write + harden the spec (asks the hard questions)
/spec:design specs/20260716/01-foo.md        # optional, UI specs: mock → components → your approval
/spec:build  specs/20260716/01-foo.md        # implement test-first, in parallel, resumably
/spec:review specs/20260716/01-foo.md        # independent executed verification; flips to done
```

- `plan` prints the spec path — paste it into the commands that follow. It also tells you when a
  change is too small to bother; small work should just be asked for directly.
- `sketch` and `design` only matter for UI-bearing work. Sketch mocks ONE brief before planning
  and triages every brainstorm change into its binding home (mock / brief / scope / ADR); plan
  warns if you skipped it, never blocks.
- Small specs (one batch, ≤4 files) take a fast path automatically — no workflow machinery.
- Requirement changed mid-build? Write the ruling into the spec's Decisions table, salt the
  affected batch's `resolutions` token, resume — finished batches come back from cache.

Each stage refuses to run out of order (`draft → hardened → implementing → done` is enforced by
a hook), so a wrong command costs you an error message, not a mess.

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

## Autopilot (optional daemon)

`autopilot/` runs the spec pipeline unattended from a Telegram supergroup — the daemon relays
checkpoint questions to a topic, waits for a tap, and drives `/spec:plan` (and later stages) on
your behalf. It ships no README of its own; this section is the whole runbook.

1. **Install dependencies**: `cd autopilot && npm install` (the daemon needs the Claude Agent
   SDK, which this repo does not vendor at the root).
2. **Enroll this machine**: paste the hub's Telegram `/enroll` line —
   `autopilot/bin/autopilot enroll --hub <url> --code <code>` — to exchange the one-time code
   for a spoke identity; credentials save to a separate, machine-written file under
   `~/.config/autopilot/`, 0600, and the success line never prints the token.
3. **Ground the target repo**: run `/spec:init` on the repo you want the daemon to drive — an
   ungrounded repo is a no-op, so a throwaway repo needs this before any lane can touch it.
4. **Create a config file** at `~/.config/autopilot/config.json` (or pass `--config <path>`)
   naming the bot token, the forum-enabled supergroup, its per-project topic ids, and the
   allowed user ids.
5. **Start the daemon**: `autopilot/bin/autopilotd`. Use `--check` for an offline preflight
   (validates config, resolves the SDK, asserts the oracle script exists — no network, no
   state written) before trusting a real run.
6. **Stop the daemon**: send `SIGTERM` (or `SIGINT`) — it tears down in place.

Only one process may long-poll a given bot token at a time (Telegram allows a single
`getUpdates` consumer per token) — never run the daemon and the opt-in live test suite
(`tests/autopilot/live.test.js`, gated on `AUTOPILOT_LIVE=1`) against the same token
concurrently.

## Command reference

| Command | What it does | When |
|---|---|---|
| `/spec:genesis-architect` / `-explore` / `-design` | Stack + scaffold + roadmap; design funnel; ratify the pick | Greenfield only, before init |
| `/spec:init` | Profile the repo, generate the grounding layer, run enforce | Once per repo |
| `/spec:sketch` | Mock + brainstorm one roadmap brief; ratify mock↔brief agreement | Before planning a UI-bearing brief |
| `/spec:plan` | Author + adversarially harden a spec | Per feature |
| `/spec:design` | Mock → components → your catalog approval | UI specs, catalog repos only |
| `/spec:build` | TDD implementation via gated workflow; fast path for small specs | Per feature |
| `/spec:review` | Independent executed verification; commits, merges, flips `done` | Per feature |
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
- **Genesis argues in front of you.** Live-researched, blind-proposer stack and design panels
  with hard forks surfaced as questions — not a template questionnaire.
- **It's shaped by daily production use.** 555 Ventures LLC runs this pipeline internally every
  day across multiple projects. Features here were promoted or retired on evidence from real
  builds — the scaffold ledger records why each guard exists and what would remove it.

Honest trade-off: this buys rigor with ceremony and maintenance surface (generated workflows,
grounding layers, doctor checks). If you want a lightweight spec loop, Spec Kit or OpenSpec is
less to carry. This is for when the failure you fear is *plausible-looking work that was never
actually verified*.

## When *not* to use it

This is heavy machinery. Use the pipeline only when the work needs **delegation** (big enough
that workers should type while the strong model plans), **durability** (spans sessions), or
**gates** (blast radius that warrants refuters and executed review). A one-file fix in an
established pattern never gets a spec — the plugin will tell you the same.

## Notes for plugin authors

- **`args` is a control channel, not a data bus.** Workflow args carry only paths, ids, enums,
  booleans, and the gate command — never free text. Prose lives in files agents `Read`. Every
  script starts with the shared `normalizeArgs()` guard.
- **Workflow `agent()` resolves only built-in and plugin agent types.** Host `.claude/agents/*.md`
  are invisible to it — pass doctrine file paths via `args` and dispatch on `general-purpose`.
- **Never hand-edit a committed `wf-*.js`.** They're generated from `spec/workflows/src/*.body.js`
  plus shared fragments by `npm run build:workflows`; `npm test` fails on drift.
- **Every guard earns its keep.** Each gate/advisory is registered in
  `spec/doctrine/scaffold-ledger.md` with the evidence that justified it and the condition that
  retires it; `/spec:doctor` audits the ledger. Guards without evidence get retired.
- **Doctrine hygiene:** state a fact once (highest common ancestor in `doctrine/shared.md`,
  everywhere else points); never name a derived case.
