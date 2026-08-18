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
2. **Ground every repo you want driven**: run `/spec:init` on each target repo before bootstrap —
   an ungrounded repo is a no-op, so a throwaway repo needs this first.
3. **Config file location**: identity lives in `~/.config/autopilot/hub.json`, written by enroll —
   nothing to hand-edit there. Optional per-project/host overrides, if you ever need one, go in
   `~/.config/autopilot/config.json` at the same directory (`--config` to point elsewhere); most
   setups never touch it.
4. **One-command machine setup**: paste the hub's Telegram `/enroll` line as
   `autopilot/bin/autopilot bootstrap --hub <url> --code <code> [--repos-root <dir>]`. It
   sequences enroll → discover → plugin-enable (wires `autopilot@555-tools` into
   `~/.claude/settings.json`) → service install → doctor, stopping at the first hard failure
   with that step's own remedy; re-running is safe — an already-enrolled box skips straight to
   the next step instead of burning a second code. **On Linux** (the fleet) this also installs
   and starts a `systemd --user` service (`Restart=always`, survives reboot once
   `loginctl enable-linger` is set — bootstrap does this for you). **On macOS** (JJ's machine is
   the only one) there is no service: bootstrap prints the reminder to run
   `autopilot/bin/autopilotd` inside `tmux` instead and continues, stopped with `SIGTERM`
   (`Ctrl-C` sends the equivalent `SIGINT`) — launchd support is a recorded deferral, not a
   blocker.
5. **Log in**: run `claude` once on the box so the daemon's SDK sessions have credentials — it's
   the one step bootstrap can't do for you. Until it's done, lanes halt with the phone-visible
   🔑 checkpoint.
6. **Check health anytime**: `autopilot doctor` runs the full offline runbook (hub.json,
   discovery, plugin-enable, Node floor, daemon liveness, and — on Linux — the service checks)
   plus a network-tolerant hub reachability/clock-skew check; every line degrades gracefully and
   names its own remedy on failure.
7. **Manage the service** (Linux): `autopilot service status|logs|uninstall` — `uninstall`
   stops the unit (equivalent to `SIGTERM`) before removing it; `logs` passthroughs
   `journalctl --user -u autopilot -f`.

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
