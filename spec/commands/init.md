---
description: One-time bootstrap — profile this repo and generate the spec pipeline's grounding layer (config, rules, implementer agents, pattern sweep)
argument-hint: [notes about the repo, optional]
---

# Spec Init: Bootstrap the Grounding Layer

The spec plugin ships the **process layer** (commands, workflows, state gate, reviewer,
template). This command generates the **grounding layer** — everything repo-specific — so the
pipeline can run here. It is a one-time deep session (re-runnable to refresh); budget real
exploration time. Everything you write must be verified against actual code in this repo:
real paths, real exports, real naming, real commands. An invented reference is worse than a
missing one — workers trust these files blindly.

**Intended model: Fable or Opus.** Run `spec-paths shared` and Read that file first to
understand what the process layer expects from the grounding layer.

## Deliverables (all in the host repo)

**Authoring rule (governs every phase below, including Phase 1's skill generation):** any
generated file's prose about a **volatile enumerable fact** — routes, table lists, package
inventories, token homes — must name the derivation, the command or location that yields the
fact (e.g. "`ls apps/web/src/routes/` is the surface list"), never inline the enumeration
itself. A sentence that can go stale independently of the derivation it summarizes is a defect
at generation time (PRAX-20260813-06: a generated run skill said routes are "currently `/` and
`/api/health`" while 37 existed).

1. `.claude/spec.config.json` — machine-readable knobs
2. `.claude/rules/spec-pipeline.md` — prose grounding, seven sections, `paths:`-scoped so it
   ambient-loads only for spec/pipeline work (commands Read it explicitly regardless)
3. `.claude/rules/conventions/*.md` — per-layer **path-scoped convention rules**: small rule
   files whose `paths:` globs mirror `routing`, so any session touching a matching file gets
   that layer's hard rules without pipeline machinery (Phase 3)
4. `.claude/agents/*.md` — project-grounded implementer agents (one per batch kind)
5. `scripts/spec-patterns.sh` — mechanical shortcut sweep adapted to this repo
6. `.claude/settings.json` `permissions` block — allow entries for the exact toolchain
   commands the config declares, deny entries for destructive ops and secrets reads; merged
   into any existing block, never clobbered (Phase 2.5)
7. Design-capable hosts only: the **design foundation** — token files verified/landed, a
   one-page design doctrine doc, the living showcase catalog entry (Phase 6)
8. `.claude/skills/spec-verify/SKILL.md` and `.claude/skills/run/SKILL.md` — the per-host
   **verify** and **run** skills: how to launch, seed, and observe this app, both derived
   from Phase 1's profiling, both with `allowed-tools` frontmatter
9. The **runtime substrate** where the repo lacks it (Phase 1.5): health endpoint, seed entry
   point, local DB provisioning, quickstart — the things the verify skill and the smoke leg
   presuppose
10. `.claude/spec-manifest.json` — the **deliverable manifest**: every deliverable above plus
    the activation each claims, verified by `manifest-check.sh` **before** the config is
    stamped (Phase 7). Init is the one LLM in the pipeline whose output would otherwise ship
    unverified — this closes that recursion.
11. A short report: what was generated, what was verified, what needs the user's eyes

## Phase 1 — Profile the repo

Launch parallel Explore agents (`model: sonnet`) and read key files yourself:

- **Stack & toolchain:** language(s), framework, package manager, test runner, linter,
  typechecker, codegen tools. Extract the real commands from `package.json` scripts /
  `Makefile` / `pyproject.toml` — never guess (`make check`? `bun typecheck && bun lint &&
  bun test:run`? `uv run pytest`?).
- **Component catalog:** present? A component-preview host (e.g. Storybook — web: `.storybook/`
  config, `storybook` script — or Widgetbook — Flutter: `widgetbook` in `pubspec.yaml`, a
  widgetbook entrypoint/sub-package — or an equivalent like Ladle or Histoire).
  This decides the config `design` block and whether `/spec:design` ever runs here. If
  design-capable, also profile the **design language**: existing theme/token files, a base
  design system in the dependencies (shadcn/Radix, MUI, Material 3, Cupertino, …), and how
  consistently real screens follow it — input to Phase 6.
- **Architecture:** how is code organized (features? domains? modules?), what are the layer
  boundaries, which surfaces are generated/managed (codegen outputs, lockfile-like catalogs,
  translation files), what CI enforces (import linters, purity checks).
- **Conventions:** read 3–5 representative source files per layer; extract naming patterns,
  canonical exemplar files, the rules docs that already exist (`.claude/rules/`,
  `docs/standards/`, `docs/rules/`, `AGENTS.md`, `CLAUDE.md`).
- **High-risk surfaces:** money paths, auth, migrations, cross-area contracts — what here
  would be T3?
- **Runtime & observability:** how to launch the app locally — dev command, ports, required
  env vars/secrets stubs; how to seed a testable state — test user/credentials, fixtures, seed
  script, db reset; how to observe behavior once it's running — URLs/routes, CLI invocations,
  log locations, and whether the observable surface is browser, API, or both. Derive every
  answer from `package.json` scripts, the README, `docker-compose.yml`, Playwright/Cypress
  config, seed scripts — never guess. This is the profiling input to the verify skill below.

Interview the user via `AskUserQuestion` only for what the code cannot answer — glossed in plain
English, recommended-first, with one line of consequence per option (e.g. "which surfaces should
get the extra T3 scrutiny — the ones where a bad change is expensive to fix after it ships?
(Recommended: money/auth/migration paths, if this repo has any — missing one lets a risky change
through at routine speed; naming too many slows every ordinary edit down with T3's extra
build/review overhead)", with the real candidate paths as informed options).

**Ensure `.claude/worktrees/` is gitignored** (idempotent): `/git:enter-worktree`'s worktree
provisioning and the harness's own `EnterWorktree` both create trees there, and an un-ignored worktree path
makes the root tree read dirty — which trips `/spec:review`'s clean-root merge gate and makes
`merge-back.sh create` refuse. If `git check-ignore -q .claude/worktrees` fails, append
`.claude/worktrees/` to the repo's `.gitignore` and tell the user to commit it.

**Also gitignore the design-stage sidecar dirs** (idempotent, same routine): `/spec:design`
writes a per-spec sidecar dir `specs/YYYYMMDD/##-name.design/` (`extract.json`, `slice-*.html`,
`skeletons.json`) that is the within-run plan + resume cache, deleted at reconcile — but a
mid-run checkpoint-commit must not carry it. If `git check-ignore -q specs/00000000/00-x.design/x`
fails, append `specs/**/*.design/` to `.gitignore`. (Also clean up the retired digest-era patterns
`*.design-digest.json` / `*.design-digest.raw.html` if a prior init added them.) This does not
break resume (resume reads the working-tree files); the reconcile step's `rm` is what clears the tree.

**Set the union merge driver for the run ledger** (idempotent): `.claude/spec-runs.jsonl` is
append-only, and two specs building in parallel worktrees both append at EOF — a default merge
conflicts there on merge-back, when the only correct resolution is "keep both lines." If
`git check-attr merge -- .claude/spec-runs.jsonl` doesn't report `union`, append
`.claude/spec-runs.jsonl merge=union` to the repo's `.gitattributes` (create it if missing) and
commit it with the other init changes. Never gitignore the ledger itself.

**Write the generated skills** from the runtime & observability findings above — deliverables,
not incidental notes. Two skills, one profiling pass:

- **`.claude/skills/spec-verify/SKILL.md`** — frontmatter: `name: spec-verify`, `description`
  written as a trigger condition (e.g. "Use when exercising a spec-pipeline finding or an
  acceptance criterion against the running app instead of just reading code — launching it,
  seeding a test state, and observing real behavior"). Body: how to launch the app locally
  (dev command, ports, env), how to seed a testable state (test user, fixtures, db reset —
  whatever this repo reveals), and how to observe behavior (URLs/routes, CLI invocations, log
  locations, browser vs API surfaces). Every instruction must trace to a real file in this
  repo — `package.json` scripts, the README, `docker-compose.yml`, Playwright/Cypress config,
  a seed script; where the repo is silent, write `[NEEDS CLARIFICATION: <question>]` rather
  than guess. State its consumers in the body: `/spec:review`'s verifiers use it to exercise
  findings; T3 builds may use it for advisory behavioral checks of acceptance criteria —
  advisory only, it gates nothing until the run ledger (`.claude/spec-runs.jsonl`) shows its
  verdicts track real escapes.
- **`.claude/skills/run/SKILL.md`** — the session-facing sibling: frontmatter `name: run`,
  `description` as a trigger ("Use when launching this app locally to see it working — dev
  server, ports, env, seed, and where to look once it serves"). Body: the launch command,
  ready check, seed entry point, and observation URLs — a distilled subset of the same
  profiling, ≤30 lines, pointing at `spec-verify` for the deeper seeding/observability
  detail rather than duplicating it. This is the file the harness's built-in `/run` and
  `/verify` behaviors discover, so it pays off outside the pipeline too.

**Frontmatter hardening (both skills):** declare `allowed-tools` pre-authorizing exactly the
Bash commands the body instructs (boot, ready check, seed) so invoking the skill doesn't burn
permission prompts on its own documented commands. Any generated skill whose body carries side
effects beyond local launch/seed (deploys, remote writes, messaging) must declare
`disable-model-invocation: true` — user-invoked only; launch/seed skills normally don't
qualify.

## Phase 1.5 — Runtime substrate (generate what verification presupposes)

The verify skill, the smoke leg, and any DB-gated test suite all presuppose a runnable
substrate. Where Phase 1's profiling found gaps, **create the substrate — don't just record
the gap** (measured cost of not doing this: UpWell shipped 10 days with no seed, no health
endpoint, no DB provisioning, no remote — "can I run this?" took a full investigation and the
answer was no). Each item is small, and each is skippable only by an explicit `inert`
manifest row with a reason:

- **Health endpoint** — if the app serves HTTP and has no cheap liveness route, add one
  (e.g. `/api/health` returning 200 + version). It is the `runtime.readyCheck` target, the
  deploy healthcheck, and the e2e webServer wait, all in one ~10-line file.
- **Local DB/service provisioning** — if `.env.example` points at databases nothing creates,
  add the missing compose file or provisioning script so `TEST_DATABASE_URL`-style gates can
  actually be satisfied locally. An env-gated test suite whose env costs "hand-provision two
  databases" never runs — and a skip is not a pass.
- **Seed entry point** — a script that produces an observable post-signup state (test
  tenant/user, minimal fixtures). Without it, "launch, seed, observe" fails at step two.
- **Worktree env manifest** — if gitignored runtime config exists (`.env*`, local override
  files), write `.worktreeinclude` at the repo root listing those patterns (gitignore
  syntax; Claude Code's native format). `merge-back.sh create` copies matching gitignored
  files into every build worktree — without it, worktree builds boot env-less and the
  smoke leg fails on a config artifact, not the code under review.
- **Quickstart** — a root README section (or file) answering "how do I run this?" in five
  lines, citing the real commands.
- **Git remote / CI activation** — check `git remote -v`. If empty, ask the user
  (`AskUserQuestion`, glossed in plain English with a consequence per option): "this repo has no
  git remote, so generated CI config would never run — connect one now (Recommended: CI then
  catches drift on every push, and it's a one-time setup cost) or declare CI inert for now
  (cheaper today, but nothing checks this repo until a remote exists)." Generated CI config with
  no remote executes zero times; the manifest records whichever the user chooses — never an
  undeclared limbo.

## Phase 2 — Write `.claude/spec.config.json`

All keys consumed by the plugin's commands/workflows:

```jsonc
{
  // Drift stamps — both computed at init time, never hand-picked.
  // generatedBy: "spec@" + `spec-paths version` (human-readable provenance).
  // contractHash: `spec-paths contract-hash` — hash of the plugin's grounding-contract
  // file. The state-gate hook recomputes and compares it on every pipeline command and
  // warns on mismatch; any plugin contract change fires it automatically.
  "generatedBy": "spec@1.0.0",
  "contractHash": "<output of spec-paths contract-hash>",
  // Deterministic gate. {testDirs}/{scopeDirs} placeholders are substituted by
  // /spec:build and /spec:review from the spec's File Plan dirs (omit if not needed).
  "gateCommand": "bun typecheck && bun lint && bun test:run {testDirs}",
  // Test-runner prefix; file paths are appended (red check, scoped runs).
  "testCommand": "bun test:run",
  // Workspace bootstrap for worktrees/spikes.
  "setupCommand": "bun install",
  // REQUIRED: the executed-boot contract (shared invariants § Runtime Verification), from
  // Phase 1's runtime profiling. bootCommand starts the app; readyCheck exits 0 once it
  // observably serves. /spec:review's smoke leg runs this on every review — a config without
  // it makes every review's boot leg a hard finding. Hosts with nothing to boot (libraries,
  // pure CLIs) declare {"inert": "<reason>"} instead — explicit, never omitted.
  "runtime": {
    "bootCommand": "bun dev",
    "readyCheck": "curl -sf http://localhost:3000/api/health",
    "seedCommand": "bun db:seed",     // OPTIONAL: seeds an observable state
    "readyTimeout": 120,              // OPTIONAL: seconds (default 120)
    "stopSignal": "SIGTERM"           // OPTIONAL: signal to stop the booted process (default SIGTERM)
  },
  // Mechanical sweep script (generated in Phase 5); dirs appended, DIFF_BASE env honored.
  "patternsScript": "scripts/spec-patterns.sh",
  // OPTIONAL: AC-drift checker; spec path appended. Omit entirely if the repo has none —
  // then the reviewer's AC ↔ test coverage check is the drift gate.
  "driftScript": "uv run python scripts/spec_drift.py --spec",
  // OPTIONAL: the repo's test-file universe (glob array), read only by scope-reconcile.js's
  // at-risk derivation (specs/20260815/02-at-risk-pins.md D1/D5) — covers dir-rooted and
  // colocated test conventions across stacks. Default when absent (= this value):
  "testGlobs": ["tests/**", "test/**", "**/*.test.*", "**/*.spec.*", "**/*_test.*"],
  // OPTIONAL: component-catalog design stage (/spec:design). Omit entirely if the repo has
  // no catalog. tool: "storybook" (web) | "widgetbook" (Flutter) | any catalog; command
  // launches it; storyFormat is what stories-kind workers author.
  "design": {
    "tool": "storybook",
    "command": "bun storybook",
    "storyFormat": "CSF3 stories",
    // Written by Phase 6 — binding canon for /spec:design.
    "doctrine": "docs/design/doctrine.md",
    // OPTIONAL: renders catalog entries to image files — enables the designer's visual
    // self-review round. Omit if the host has no such command; never invent one.
    "screenshot": "bun storybook:screenshot",
    // REQUIRED when the repo routes copy through an i18n stack (Paraglide/inlang, i18next,
    // react-intl, next-intl, lingui, …): the source-language message catalog(s). The
    // /spec:design fidelity gate accepts mock copy as catalog VALUES — without this key the
    // gate would demand literals the host's i18n lint forbids. Detect the stack from the
    // dependency tree and point at the real catalog files; omit only when there is no i18n.
    "copyCatalogs": ["app/messages/en.json"]
  },
  // Ordered File Plan layer groups; layers inside one inner array run in parallel
  // (their file sets must be disjoint by construction of the repo's structure).
  "layerGroups": [["foundation"], ["ui", "data", "logic"], ["wiring"]],
  // Batch kind → agent name (the agents generated in Phase 4). 'tests' and 'default'
  // are required keys; the rest mirror this repo's layers/file kinds.
  "agentMap": {
    "tests": "testing",
    "types": "types",
    "queries": "data-layer",
    "forms": "forms",
    "mocks": "mock-data",
    "tables": "data-table",
    "components": "ui-components",
    "stories": "storybook",
    "default": "general-purpose"
  },
  // Routing hints: which File Plan rows map to which kind (prose, for the orchestrator).
  "routing": {
    "tests": "*.test.ts(x) rows",
    "types": "types.ts, constants.ts",
    "queries": "api.ts, queries.ts, data hooks"
  },
  "pipelineRules": ".claude/rules/spec-pipeline.md",
  // OPTIONAL: capabilities block (grounding-contract.md § Capabilities) — stack-shaped facts
  // detected at init time instead of hardcoded by consuming commands/scripts. forge: "github"
  // iff the origin remote is a GitHub URL AND `gh` resolves, else "none" (a real GitLab/
  // Bitbucket host earns an adapter later — this repo declares honest inertness now).
  // skipReportPattern: name the test runner Phase 1 already detected, propose its known
  // skip-count regex as a recommended-first AskUserQuestion default, and let the user confirm
  // or override — probe silence is never evidence (many runners print a skip line only when
  // skips are nonzero, so a quiet probe run at init time would wrongly write "none" on a
  // perfectly capable host). "none" only when no format is derivable or the user says so.
  // ciPoll: optional override of /spec:release's 30s/600s poll interval/timeout defaults.
  "capabilities": {
    "forge": "github",
    "skipReportPattern": "none",
    "ciPoll": { "intervalSeconds": 30, "timeoutSeconds": 600 }
  }
}
```

(Backend-flavored example: `"gateCommand": "make check"`, `"testCommand": "uv run pytest -q
--no-header --tb=line"`, `"setupCommand": "unset VIRTUAL_ENV && uv sync --frozen --extra
dev"`, no `design` block, `"layerGroups": [["foundation"], ["persistence"], ["logic"],
["orchestration"]]`, `"agentMap": {"tests": "domain-tests", "models": "domain-models",
"contracts": "domain-contracts", "persistence": "domain-persistence", "handlers":
"domain-handlers", "default": "general-purpose"}`. Flutter-flavored `design` block:
`{"tool": "widgetbook", "command": "flutter run -d chrome -t widgetbook/lib/main.dart",
"storyFormat": "Widgetbook @UseCase builders"}` — extract the real entrypoint path and run
target from the repo, never guess.)

## Phase 2.5 — Generate `.claude/settings.json` permissions

A checked-in team artifact derived from the toolchain Phase 1 discovered — it makes every
autonomous loop in this repo (pipeline or interactive) faster *and* safer than the
flip-to-permissive alternative:

- **Allow** — one exact entry per command the config declares: `gateCommand`, `testCommand`,
  `setupCommand`, `patternsScript`, `runtime.bootCommand`/`readyCheck`/`seedCommand`, plus the
  package manager's read-only ops. Derive each entry from the real command string (e.g.
  `Bash(bun test:run *)`, `Bash(bash scripts/spec-patterns.sh *)`) — never a broad `Bash(*)`
  and never a command you didn't verify resolves.
- **Deny** — destructive ops (`Bash(rm -rf:*)`) and secrets reads (`Read(.env*)`, plus
  whatever secret-file shapes this repo actually has — key files, credential dirs).
- **Merge discipline** — if `.claude/settings.json` exists, merge into its `permissions`
  block preserving every user entry; where an existing deny covers a command you would allow,
  keep the deny and surface the conflict in the report — never silently override.
  `.claude/settings.local.json` is user territory: never touch it.

## Phase 3 — Write `.claude/rules/spec-pipeline.md`

Seven sections, all grounded in Phase 1 findings. This file is read by every pipeline command;
§ Worker Rules and § Test Rules are inlined verbatim into worker prompts by `/spec:build`.

**Open the file with `paths:` frontmatter** scoping its ambient load to `specs/**` and
`.claude/**`: pipeline commands Read it explicitly (via the config's `pipelineRules` key), so
they lose nothing — but ordinary sessions in the host stop paying its full context cost on
every turn, which is what keeps its rules followed rather than skimmed.

- **`## Risk Tiers`** — the concrete T3 trigger list for THIS repo (e.g. "order/position/trade
  mutation paths or money math (`src/lib/decimal.ts` call sites)"; "anything touching the
  `billing` or `identity` domain's write paths; migrations beyond pure-additive"), and what
  T1-shaped work looks like here. **Always include the process-boundary trigger with this
  repo's concrete boot-path files named** (entry point, plugin/process registration, env
  schema, signal handling) — shared invariants § Risk Tiers makes it universal; this section
  grounds it in real paths.
- **`## Planning`** — discovery surfaces (generated contract files to ground against),
  pre-emptive MCP/registry lookups to run at plan time (e.g. Shadcn registry for new UI
  surfaces, Context7 for the libraries this repo leans on), decomposition caps beyond the
  generic ≤15 rows (e.g. "at most one migration"), and the new-surface checklist: the
  requirements interview shape, data-shape design steps, cross-area contract mapping, and the
  registration/wiring File Plan rows this repo's structure demands (with real paths).
- **`## Build`** — orchestrator-only integration duties with exact commands (e.g. route
  codegen, translation fill via its script, Alembic migration generation + review steps, app
  boot check), and host escalation triggers (e.g. divergent migration heads).
- **`## Worker Rules`** — repo-specific hard rules appended to every worker prompt: the
  read-only/generated surfaces and their sanctioned change routes, logging/number/i18n
  discipline, import-boundary rules, the scoped self-verify commands workers may run.
- **`## Test Rules`** — this repo's test conventions: file placement, naming, AC-ID reference
  style (docstring? test name? comment?), fixture rules, what is exempt from TDD (e.g. pure-UI
  **appearance** in repos with a design-stage catalog — **reachability is never exempt**: a
  prop or field whose absence collapses a promised observable is behavior and owes an AC).
  **Workspace monorepos (more than one test-collecting package/module exists — e.g. `pnpm-workspace.yaml`, Cargo workspaces, Nx/Turborepo, `go.work`, mix umbrella apps): record the
  test runner's path-filtering semantics unconditionally** — e.g. whether paths filter
  against the workspace root or the package dir,
  and what the wrong form does (vitest exits 1 "No test files found") — this is knowable at
  init time from the workspace manifest and is otherwise re-discovered by every worker.
  **Environment-gated suites** (`skipIf(!ENV_VAR)` shapes): name each gating variable and the
  provisioning command that satisfies it (Phase 1.5) — review treats a skipped AC-mapped test
  as a hard finding, so a suite that can't run locally is a defect, not a convention.
- **`## Review Checks`** — repo-specific severity calibrations for the reviewer (the plugin's
  generic `reviewer` reads this repo's `.claude/rules/` — this section is where checks
  like "runtime import from a feature barrel in `stores.ts` or `*.test.ts` is **hard**",
  "raw `parseFloat` on prices is **hard**", "user-facing strings not wrapped in i18n macros",
  or "imports from `other_domain.logic` targeting anything but `types.py` is **hard**" live,
  each with file:line-verifiable phrasing). **Always include the duplication calibration:**
  three or more near-identical blocks in one diff is a finding naming the extraction —
  batch-scoped workers never see the third repetition, so the reviewer is the first eye
  that can (measured 3-for-3 across audited hosts: 5× copy-pasted auth-submit, 4× clone
  provider handlers, 4× hand-rolled loggers, all through CLEAN reviews). Cross-file semantic
  duplication and error masking are plugin-owned advisory smell-lens output, never a blocking
  reviewer finding.
- **`## Gotchas (evidence-cited)`** — write this section EMPTY, carrying nothing but a
  one-line header comment stating its contract: one line per entry; every entry must cite
  either a ledger row (spec path + runId) or a dated incident; and every entry carries a
  **provenance tag** — `[host]` (a lesson about this repo/stack) or `[plugin]` (the failure
  traces to a spec-plugin template, command, or generated artifact). Nothing else populates it
  at init time. `/spec:review`'s close (deviation fold-in) and `/spec:escape` are the only
  writers that append to it; `/spec:doctor` prunes entries whose citation no longer resolves
  and **rolls `[plugin]`-tagged entries up as an upstream bug list** — a plugin defect living
  as host folklore is an unfiled bug report every other host pays for independently. Workers
  and reviewers pick this up for free as part of the rules file they already inherit — no new
  loading mechanism.

**Also write `.claude/rules/conventions/*.md`** — one small path-scoped rule file per routing
kind that has hard conventions worth ambient enforcement (queries, types, components — skip
kinds with nothing beyond generic style). Frontmatter: `paths:` globs derived from the same
evidence as the config `routing`, each verified to match ≥1 tracked file — a zero-match glob
is a rule that silently never loads (`/spec:doctor` flags it). Body: that layer's
would-be-caught-by-review hard rules as imperative one-liners with the sanctioned alternative,
≤15 lines, citing the matching generated agent and one exemplar file rather than duplicating
its tables. These serve every session in the host — a stray interactive edit to a data-layer
file gets the queries rules with zero pipeline machinery; pipeline workers still get the full
doctrine via inlined § Worker Rules plus their agent, as before.

## Phase 4 — Generate implementer agents

One agent per `agentMap` kind (except `default`), written to the host's `.claude/agents/`.
**Study real code first**: for each kind, read the canonical files of that layer and extract
naming tables, exemplar paths, and constraints. Every path and export you cite must exist —
verify with Glob/Read before writing it down.

Frontmatter (host-repo agents — unlike plugin agents — MAY declare these):

```yaml
---
name: data-layer
description: "<what it owns + when to use, one sentence>"
model: sonnet            # haiku acceptable for narrow kinds (e.g. types)
permissionMode: acceptEdits
memory: project
---
```

Body skeleton — this is the structure both source ecosystems converged on; follow it exactly:

1. **Persona paragraph** (under an `# {Kind} Specialist` heading) — what this agent owns in
   THIS repo, in this repo's vocabulary; what it never does.
2. **`## Your Expertise`** — the concrete files/surfaces it owns, as bullets with real paths.
3. **`## Reference Material`** — verified pointers: the rule docs governing this layer, 1–3
   canonical exemplar files ("read this before writing"), generated files to grep rather than
   guess. Every path verified against the repo.
4. **`## Critical Constraints`** — the hard rules of this layer (the ones CI or review would
   catch), each stated imperatively with the sanctioned alternative. Naming-convention tables
   with **real examples from the repo** earn their keep here.
5. **`## Library Docs (MCP)`** — only if the layer leans on third-party APIs: the Context7 /
   registry queries to run when invoked interactively, followed by this carve-out line:
   > **Pipeline carve-out:** the lookups above apply to interactive invocations only. As a
   > spec-pipeline worker you never query MCPs — `/spec:plan` embeds the needed references
   > into the spec's UI/Contracts sections.
6. **`## Worker Contract (spec pipeline)`** — byte-identical across ALL generated agents.
   The canonical text lives in the plugin's grounding-contract file: Read
   `$(spec-paths contract)` and use its § Worker Contract block exactly, substituting only
   the parenthesized self-verify examples with this repo's scoped commands (from
   `gateCommand`/`testCommand`), the same way in every agent. The `tests`-kind agent
   additionally appends the contract file's § Tests-kind addendum, verbatim.

Examples of well-grounded agents to emulate (structure, not content): a frontend repo's
`data-layer` agent citing `src/features/catalog/queries.ts` as canonical and a naming table
verified against real hooks; a backend repo's `domain-models` agent citing the ORM rules doc
and the `lazy="raise"` constraint with its CI enforcement. Content like `src/features/...` or
`src/prax/domains/...` paths are examples for YOU — generate equivalents from THIS repo.

## Phase 5 — Generate `scripts/spec-patterns.sh`

A mechanical shortcut sweep: pure report, always exits 0, counts are leads not verdicts.
Reuse this harness verbatim and write repo-specific `sweep` calls grounded in the rules from
Phase 3 (suppression markers, deferred-work comments, discipline bypasses, boundary
violations, generated-surface edits vs `DIFF_BASE`):

```bash
#!/usr/bin/env bash
# Mechanical shortcut-pattern sweep — deterministic input to /spec:review.
# Usage: [DIFF_BASE=<ref>] scripts/spec-patterns.sh [dir ...]    (defaults to <repo source root>)
# Pure report: always exits 0. Sanctioned exceptions exist — the reviewer judges; this only counts.
set -u
DIRS=("$@")
[ ${#DIRS[@]} -eq 0 ] && DIRS=(<repo source root>)
echo "## Mechanical pattern sweep"; echo "Scope: ${DIRS[*]}"; echo
sweep() {
  local name="$1"; shift
  local out; out=$(rg -n "$@" "${DIRS[@]}" 2>/dev/null || true)
  local count=0
  [ -n "$out" ] && count=$(printf '%s\n' "$out" | wc -l | tr -d ' ')
  echo "### ${name}: ${count}"
  if [ -n "$out" ]; then
    printf '%s\n' "$out" | head -15 | sed 's/^/    /'
    [ "$count" -gt 15 ] && echo "    ... (${count} total)"
  fi
  echo
}
# sweep "<name>" -e '<regex>' [-g '!<glob>' ...]   ← repo-specific calls go here
echo "Sweep complete. Counts are leads, not verdicts — sanctioned exceptions exist."
exit 0
```

End with a generated-surface section when the repo has one: `git diff --name-only
"${DIFF_BASE:-main}" -- <generated paths>` with a note naming the sanctioned tools.
`chmod +x` the result and run it once to confirm it executes cleanly.

## Phase 6 — Design foundation (design-capable hosts only)

Skip unless Phase 2 wrote a `design` block. Goal: a **design foundation, not a design
system** — the binding canon `/spec:design` reads (tokens + doctrine). The system itself
grows later by extraction through specs; do not invent components or tokens no planned
surface needs yet.

**Precedence — check for a genesis canon first.** If `.claude/genesis/status.json` exists
(the genesis stage seeded this repo), branch four ways on its `design` value:

- `rules-locked` or `skipped` → **consume, never re-prompt.** The canon already exists:
  `/spec:genesis-design` authored the doctrine + token files and `.claude/genesis/design-rules.json`.
  Do NOT run the adopt/craft `AskUserQuestion` below — extract from what's there (treat it like
  brownfield), and record `genesisStackDescriptor` + `design.rulesManifest` in the config
  (enforcement is generated later by `/spec:enforce`, Phase 8). On `skipped`
  (headless archetype) write no `design` block at all. Report mode `genesis` in Phase 7.
- `doctrine-drafted` / `tokens-landed` → **partial canon: STOP.** Tell the user to finish
  `/spec:genesis-design` (lock its rules) first; the state gate also blocks this. Do not
  half-adopt.
- `pending`, or any value outside the three arms above → **warn and proceed** — matching
  genesis.md's own gate for this state ("warned, proceeds"). Write **no** `design` block (the
  canon isn't ready to consume, and adopt/craft here would mint a second canon that
  `/spec:genesis-design` later contradicts); name `/spec:genesis-design` as the pending
  finisher in both the warning and the Phase 7 report. Never run the adopt/craft
  `AskUserQuestion` below for this arm.
- (no `.claude/genesis/` at all) → the greenfield adopt/craft path below.

**Enforcement is generated by `/spec:enforce`, not here.** Init does NOT emit linters, contracts,
or hooks for the design rules (or any other rules). It records the consume-side keys
(`genesisStackDescriptor`, `design.rulesManifest`, `designRulesHash`) and leaves the actual
category→enforcer selection — discovered and verified at runtime, never from a hardcoded mapping —
to the dedicated command. Init **ends by invoking `/spec:enforce`** (Phase 8), which mechanizes
the design rules together with the rest of the host's rule set in one pass. This keeps a single
enforcement brain on its own cadence (rules/tooling drift, not repo re-profiling).

**Brownfield (the repo has real UI):** extract, don't invent. Locate the theme/token files;
read representative screens; write the doctrine doc as a description of what is **already
true** — type scale, spacing rhythm, color roles, density, dialog-vs-page habits,
empty-state tone. List the inconsistencies you found; do not resolve them. **Detect an existing
base dir / barrel** (a directory of overlay shells — Sheet/Dialog/Popover/Drawer — behind an
`index.*`); if one exists, **name it and the import-only rule in the doctrine** (the cross-session
memory `/spec:design` imports from). If none exists, **record the gap** — do not scaffold one here;
the set is seeded by genesis or grows by extraction through specs.

**Greenfield (no genesis canon, no real UI yet):** `AskUserQuestion` first — **adopt** a base design system
(recommended; offer the real candidates for this stack, e.g. shadcn/Radix or Material on
web, Material 3 / Cupertino on Flutter) or **craft** a custom direction.

- *Adopt:* doctrine = "«base system» defaults except …" plus the deviation list (brand
  palette, radius, density); land the matching minimal theme/token overrides.
- *Craft:* author 2–3 distinct directions, each as a north-star composition rendered as a
  catalog entry (type scale, color temperature, density, motion feel); the user picks with
  their eyes; land the chosen direction's token skeleton, delete the losers. Crafting is
  Fable work — taste is the product here.

Both modes also:

- Create the **living showcase** catalog entry (composes real surfaces; every later design
  run extends it — the visible cross-spec drift detector) and name its path in the doctrine
  doc, along with the token-file paths.
- Record the design rules (ban raw colors / magic values in UI files, etc.) as
  `targetCategory`-tagged entries so `/spec:enforce` can mechanize them; where no enforcer will
  fit, they fall to pipeline rules § Review Checks — `/spec:enforce` owns that decision, not init.
- Keep the doctrine doc to **one page**; record its path as `design.doctrine` in the config.

## Phase 7 — Verify, prove activation, then stamp

1. Re-read every generated file; spot-check 10 cited paths/exports at random against the repo.
2. Confirm `agentMap` names exactly match the generated agent filenames' `name:` fields.
3. **Write `.claude/spec-manifest.json`** — one `{claim, kind, target}` entry per deliverable
   and activation claim (contract file § Deliverable manifest). Minimum rows: config parses
   (`file`), pipeline rules exist (`file`), each convention rule file (`file` — or one `inert`
   row when no kind earned one), each generated agent (`file`), patterns script executes
   (`exec`), verify skill written (`file`), run skill written (`file`), settings permissions
   block parses (`exec` — `jq -e '.permissions' .claude/settings.json`), the boot smoke
   (`smoke`), the git remote / CI activation (`remote` — or `inert` with the user's declared
   reason from Phase 1.5), plus `file` rows for any substrate Phase 1.5 landed (seed script,
   provisioning, health route). Every skip is an `inert` row with a reason — never an omitted
   row.
4. **Run `bash $(spec-paths manifest-check)` and require exit 0.** Failures mean the grounding
   layer is authored but not activated — fix and re-run. **Only after it passes**, stamp the
   config: `generatedBy` = `spec@$(spec-paths version)`, `contractHash` =
   `$(spec-paths contract-hash)`. The stamp asserts "mechanically verified," not "generated."
5. Report — assemble the slots below and write them to a scratch JSON file, then print
   `node "$(spec-paths report-render)" --slots <file>` verbatim (shared § Console Output
   Style — the script is the sole render authority; never hand-format the output):
   - `outcome`: ✅ anchor (⚠️ if something needs the user), text
     `initialized — {N} files, gate verified, stamped`
   - `bullets`: two plain-language lines, replacing the old `{kind → name}`/glob dumps with
     meaning (§ Console Output Style's "meaning over dumps") — (1) what was generated: agent
     count, the verify + run skills, convention-file count, the T3 triggers chosen, and the
     permissions entries landed; (2) runtime + design-foundation state: boot/ready commands
     or a declared-inert reason, and the design foundation status — genesis / extracted /
     adopted / crafted / pending (name `/spec:genesis-design` as the finisher when pending) —
     with its doctrine path
   - `warns`: one line per unresolved item — a Phase 2.5 merge conflict, a manifest-check
     failure, anything Phase 7 step 1 couldn't verify; the manifest-check result is a pass/fail
     mention only, its full table stays in the run output
   - `next`: `{kind: 'status-verbatim', text: <captured output of
     node "$(spec-paths spec-status)" --next>}` — never a hand-written `Next: /spec:enforce`:
     Phase 8 auto-chains enforcement in this same run, so naming it as a next step would
     misleadingly suggest a manual action that is about to happen automatically

   ```report
   ✅ **initialized — 14 files, gate verified, stamped**
   - generated 6 implementer agents, the verify + run skills, 3 convention rule files, and the T3/permissions grounding this repo needs to run the pipeline safely
   - runtime ready (`bun dev`, health-checked) · design foundation adopted — docs/design/doctrine.md
   ⚠️ manifest-check found one unverified row — settings.json permissions merge kept an existing deny in place, surfaced for review
   {spec-status --next, verbatim}
   ```

## Phase 8 — Generate enforcement (invoke `/spec:enforce`)

The grounding layer is now in place but the rules are not yet mechanized. **End by invoking
`/spec:enforce`** so a fresh repo leaves init with its rule set deterministically enforced in one
shot. Enforcement is a separate command by design — different cadence (rules/tooling drift, not
repo re-profiling) and expensive, flaky work (live research + install-and-verify) — so init does
not inline it; it hands off. Tell the user enforce is running and that it is independently
re-runnable later when rules or tooling change.

## Rules

- Never write a reference you did not verify against this repo's actual code.
- Plugin agents cannot declare `permissionMode`/`memory`; the host agents you generate here
  CAN and DO (`permissionMode: acceptEdits`, `memory: project`).
- The Worker Contract section is byte-identical across all generated agents (one repo-wide
  substitution of the self-verify command examples).
- Re-running `/spec:init` refreshes the grounding layer: diff against existing files and
  preserve user hand-edits where they don't contradict fresh findings — surface conflicts,
  don't overwrite silently. A refresh always re-stamps `generatedBy` and `contractHash`.
  (To check for drift without regenerating, the user runs `/spec:doctor` — read-only, much
  cheaper.)
- `AskUserQuestion` dismissed → STOP.
