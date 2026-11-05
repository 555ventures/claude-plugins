# v8 Interface Contract

This is the user-visible surface of the `spec` and `git` plugins as of `claude-plugins` main @ 23ac13f9. v8 may rewrite everything behind it, but it must keep what is listed here: the commands, arguments, printed state names, `--mark` verbs, host files, stop points and reports. Internal mechanics are left out.

## 1. Commands

| Command | Arguments / flags | Purpose |
|---|---|---|
| `/spec:init` | `[notes about the repo]` | Bootstraps the grounding layer, then runs `/spec:enforce` |
| `/spec:doctor` | `[focus area] [--fix]` | Checks for drift. `--fix` applies cited patches, each one approved |
| `/spec:enforce` | `[category or rule-doc path]` | Turns rules into deterministic checks wired into the gate |
| `/spec:connect` | `[--project <id>] [--name <text>] [--base-url <url>]` | Links the project to the hosted review service |
| `/spec:genesis` | `<project idea — what, for whom>` | Greenfield only. Goes from idea to grounded repo |
| `/spec:mocks` | none | Wireframe design stage |
| `/spec:prototype` | `<idea words \| docs/roadmap/NN-*.md \| stem> [--stem <name>]` | Throwaway pin-loop prototype that ends in a behaviour contract |
| `/spec:plan` | `<feature description \| spec path \| roadmap brief path \| design/prototypes/<stem>/contract.json>` | Writes and locks a spec |
| `/spec:run` | `<spec path> [--in-place]` | Takes a spec from build through review to merge |
| `/spec:fanout` | `[--pick] [<spec path>…]` | Runs several lanes from one session |
| `/spec:fix` | `[symptom in plain words]` (bare = taken from the conversation) | Root-cause repair in the Direct lane |
| `/spec:queue` | `[next\|list\|add\|move\|done\|show\|groom] [args…]` (bare = `next`) | Session work queue |
| `/spec:status` | `[NN] [--all]` | Dashboard |
| `/spec:release` | `[milestone note or version tag]` (recorded, never parsed) | Staging → checks → promote to production. Only the user starts it; no `Next:` ever suggests it |
| `/git:commit` | none | `git add -A` and commit, with two approvals |
| `/git:enter-worktree` | `<spec path>` | Creates or re-enters `.claude/worktrees/spec-<stem>` on branch `spec/<stem>` |
| `/git:merge` | `[source branch]` | Guided merge: inspect, derive strategy, repair conflicts, clean up the worktree |

Every driver also accepts `--state`, which prints only the state name, and `--root <dir>`. A refusal exits 2 and its stderr names the remedy.

## 2. Driver states and `--mark` verbs

The session runs `node {driver} …`, does exactly the one step printed, runs the printed `--mark` line, and re-runs the driver. Every accepted mark prints `✅ checkpoint — <x> state saved (<prev> → <next>); safe to /clear and re-run /spec:<cmd> <arg>`.

| Driver | States printed (driver-only states in parentheses) | `--mark` verbs |
|---|---|---|
| build (`/spec:run`) | (PREFLIGHT) → TESTS → (RED_CHECK) → RED_FINDINGS? → RED_ATTRIBUTION? → `WAVE:<label>`… → INTEGRATION → (GATE) → REPAIR? (cap 3) → ESCALATE (terminal) \| REPLAY? (prototype owner only) → COMMIT → DONE | `tests-authored`, `red-attributed`, `wave-done --wave <l> --workers <n>`, `integrated`, `repair-applied --continued <n> --spawned <n>`, `escalate-choice <re-arm\|cold\|park\|amend>`, `committed`, `replayed`, `looked`, `incident --class <id>` (allowed at any live step, never moves state) |
| review (`/spec:run`) | (LEGS) → STOPPED (red gate) \| SKIPS? → REVIEWER → DISPOSITIONS → FIX? (cap 2) → ESCALATE \| CLOSE → MERGE / CONFLICTS → DONE. A lane ends at MERGE_READY. Also printed: REVIEWER_FAILED, CLEAN, UNVERIFIED | `skips-extracted --file`, `reviewer-returned --file <json>`, `dispositions [--file] --waived N --rejected N --fix-dispatched N`, `fix-applied`, `repair-round`, `closed`, `merge-strategy <merge-commit\|ff-only\|squash\|rebase-ff> [--prototype delete\|keep]`, `conflicts-resolved`, `waiting --on <spec>` (lane only), `unmet --decision <id> --why <text>`, `escalate <retry\|park\|amend\|revert>` |
| fanout | PLAN → DISPATCH → WAIT → RELAY → MERGE (MERGE_RED) → REPORT | `planned`, `picked --label <title>…`, `dispatched`, `returned --lane <id> [--stopped "<reason>"]`, `resent`, `answered --lane <id> [--label <label>]`, `resumed`, `dismissed --lane <id>`, `waiting --lane <id> --on <spec>`, `gate-repaired`, `reported` |
| genesis | DISCOVERY → BRIEF → MENUS → [FINALISTS → (RACE) → PROBE → PICK] → DECIDE → (SCAFFOLD) → SKELETON → (GATE) → GATE_RED \| [DESIGN_BRIEF → DESIGN_KIT → DESIGN_JOURNEYS → AWAITING_DESIGN_APPROVAL] → ROADMAP → HANDOFF → GROUNDED. The status file also records DEFERRED and SCAFFOLD_RED. Bracketed states run only for tournament archetypes or visual Storybook archetypes | `discovery-done`, `brief-written`, `menu-written --file <f>`, `menus-done`, `finalists-written`, `finalists-skipped`, `probe-done`, `picked`, `decided`, `skeleton-landed`, `design-brief-written`, `kit-landed`, `journeys-drawn`, `design-approved`, `roadmap-written`, `profile-written --file <f> [--refresh]` |
| mocks | SEED → SCREENS → APPROVED | `seed-done`, `journey-drawn --journey <j>`, `journey-approved --journey <j> [--waive --reason <r>]`, `approved`. Also `round push`, `round pull`, `--reopen journey:<j>` |
| prototype | OPEN → ROUND → APPROVED → TESTS → CONTRACTED → CLOSED | `opened`, `round-done`, `approved`, `contracted`, `tests-derived`, `closed` (accepted from any resting state). Also `serve --port <n>`, `check [--json]` |

`/spec:run` Step 0 decides isolation and prints one of: skip (`--in-place`), `📌 Auto-picked in place — host policy worktreePerSpec: false`, or `📌 Auto-picked in place — this session already sits in a worktree on the spec's branch`. After build DONE it prints `✅ checkpoint — build complete; safe to /clear and re-run /spec:run <spec>`.

A lane (a sub-agent) never asks the user. It writes `.claude/pending-question.json`, prints `PENDING_QUESTION`, and stops.

## 3. Host files

| Path | What |
|---|---|
| `specs/YYYYMMDD/NN-slug.md` | Spec doc (§6) |
| `<spec>.build/`, `<spec>.review/` | Sidecar directories for driver state, next to the spec |
| `<spec>.deviations.md` | Bullets-only deviations. Folded into Gotchas at CLOSE; `closed` refuses while the file exists |
| `.claude/spec.config.json` | Config. Required keys: `generatedBy`, `contractHash`, `gateCommand` (with `{testDirs}`/`{scopeDirs}`/`{testFiles}` placeholders), `testCommand` (`{file}` optional), `setupCommand`, `patternsScript`, `layerGroups`, `agentMap` (must include `tests` and `default`), `pipelineRules`, `runtime` (`bootCommand` etc.). Optional: `postGateCommand`, `slowTestCommand`, `testEnv`, `testNameFilter`, `trunk`, `testCaseScanner`, `fileShapes`, `orchestratorOnly`, `typecheckCommand`, `driftScript`, `routing`, `design {kit,tokens,rules,app?}`, `release {deployCommand,stagingUrl,e2eCommand,promoteCommand?,rollbackCommand?,productionUrl?,healthPath?,migrationsCheck?}`, `prototype {url,bootCommand?,overlay,e2eFile,e2eList,e2eRun,picture,dbCreate?,dbDestroy?}`, `walkthrough {baseUrl,project,tokenEnv}`, `pictures {command,dir,widths?}`, `capabilities {forge,failCountPattern,skipReportPattern,testCountPattern,ciPoll}`, `policy` (below), `enforcementManifest`, `rulesEnforcementHash`, `genesisStackDescriptor` |
| `policy` block | `worktreePerSpec` (true), `directLaneToMain` (true), `mergeStrategy` (derived\|merge-commit\|ff-only\|squash\|rebase-ff), `testExpiry` (classify\|off), `closeSuite` (auto\|always), `ledgerCommitted` (true), `reviewService` (terminal\|hosted), `models.{workers,reviewer,disposer}.{model,effort}`, `riskTiers[]`, `stops.{repairRound: repair\|ask, buildEscalate: derived\|ask, reviewEscalate: queue\|ask, redFindings: remove-mention\|ask, prototypeClose: delete\|keep\|ask, rejectWithEvidence: accept\|ask}`, `fanout.{selfSurfaces[],overlapExempt[]}`. A missing key falls back to its default, key by key |
| `.claude/rules/spec-pipeline.md` | `paths:`-scoped to `specs/**`, `.claude/**`. Seven sections: Risk Tiers · Planning · Build · Worker Rules · Test Rules · Review Checks · Gotchas |
| `.claude/rules/conventions/*.md`, `.claude/agents/*.md`, `.claude/skills/{run,spec-verify}/SKILL.md`, `scripts/spec-patterns.sh`, `.claude/settings.json` `permissions`, `.claude/spec-manifest.json` | Written by init |
| `.claude/rules/enforcement.json` | Written by enforce. Entry ids `<workspace>:<stack>:<category>[/<layer>]` |
| `.claude/spec-runs.jsonl` (+ `.claude/spec-runs/<runId>.jsonl`) | Run ledger with plan/build/review/fix/escape/release rows. Gitignored when `ledgerCommitted:false` |
| `.claude/settings.local.json` `env` | Walkthrough token, written by `/spec:connect`. Never in a tracked file |
| `<git-common-dir>/spec-queue.json`, `spec-queue-done.json` | Queue and its archive (§7). Not in the checkout |
| `<git-common-dir>/spec-fanout.json` | Fan-out state. Deleting it resets the lane set |
| `.claude/worktrees/spec-<stem>`, `.claude/worktrees/proto-<stem>` | Worktrees. Must be gitignored; `.worktreeinclude` lists the files copied in |
| `.claude/genesis/` | `brief.md`, `status.json`, `conventions.json`, `stack-descriptor.json`, `init-profile.json`, `init-gen.log`, `tournament/` |
| `docs/roadmap/00-overview.md`, `docs/roadmap/NN-slug.md` | Brief header: `Phase: · Depends on: · Primary workspaces:`, `First light:`, `Journeys:`. Sections: Result, Current state, Scope, Surfaces, Out of scope, Grounding, Open questions for planning |
| `docs/adr/NNNN-slug.md` | ADRs (`Amended by ADR-NNNN`, superseded status) |
| `docs/design/{brief.md,catalog.md,approval.json}` | Genesis design stage |
| `docs/canonical/{area}.md` | Canonical docs. A spec's Canonical Delta is applied at CLOSE |
| `design/mocks/{seed.md,status.json,screens/}`, `design/rounds/<n>/approvals.json` | Mocks |
| `design/prototypes/<stem>/{status.json,states.json,pins.json,contract.json,captures/}` | Prototype files, committed on main. Branch `proto/<stem>` is never merged |
| `.claude/agent-memory/` | Worker memory. Each file is carried, corrected or deleted at close |

## 4. Questions and stop points

All questions go through `AskUserQuestion`: at most 4 per call, recommended option first, each option stating its consequence. A dismissed question stops the run. Anything the plugin can derive is printed as `📌 Auto-picked <choice> — <reason> (veto anytime)` and not asked.

| Command | Asks / ends the turn |
|---|---|
| init | Interview (only what the code can't answer). Substrate question. testCommand vacuous-pass and at-risk disclosures. Slow-tier question. Policy round 1 (Worktrees, Direct lane, Merge shape, Test expiry). Policy round 2 (Run history, Review service, Model mix, High-risk areas — multi-select). Write confirm (`Stop here` → nothing written). A dismissed policy round keeps its defaults |
| plan | Real forks while drafting. Critical tier only: "This spec is critical tier because it touches <trigger>. Lock it now?" → Lock it / Keep it as a draft |
| run/build | RED_FINDINGS on a critical tier (remove mention / rewrite red / pause). ESCALATE (re-arm / restart cold / park and queue /spec:fix / amend), unless `stops.buildEscalate` answers. REPLAY look stop: only a literal `close enough` advances. Out-of-plan files and unwritten-fallback forks |
| run/review | STOPPED (repair round, then queue /spec:fix / abandon). DISPOSITIONS: only the user waives. ESCALATE (abandon+queue fix / waive-reject via disposer / abandon / re-plan). MERGE: strategy is derived and never asked; conflicts are asked; "The prototype has N commits that were never merged. Delete the prototype now?" |
| fanout | RELAY: every lane question in one batch, and the dependency stop (a lane that needs another spec done first: `waiting --lane <id> --on <spec>`, or `answered`, or `dismissed`). MERGE_RED stops the queue until `gate-repaired` |
| fix | Missing symptom. One decisions stop listing authored strings and policy choices. One waive/reject stop. At most 3 calls |
| genesis | Discovery interview rounds with research menus. Hard-to-reverse forks. DESIGN_BRIEF. Literal `approve` at AWAITING_DESIGN_APPROVAL |
| mocks | Asks for the idea only when `.claude/genesis/brief.md` is missing. Service mode: prints `🎨 ready for review — <link>` and ends the turn. Terminal mode: ends on `approve all, or name the ones to change` |
| prototype | Each ROUND prints `🎨 ready for pins — <url>` and ends the turn. `approve` → approved; any other reply is a change |
| queue groom | Asks only about `keep`/ambiguous items. Clear evidence of done is ticked with a 📌 |
| release | Phase 0 grounding fields. Promote to production? Rollback question. Seed-data question |
| doctor `--fix`, enforce | Per-patch approval batches. Enforcer choice. `Confirm before writing: {N} files will be…`. Rules are proposed, never auto-authored |
| git:commit | Approval 1 (gather), approval 2 (commit). Secrets hit: "Keep them out of this commit?". Defect class for the escape row |
| git:merge | Source branch when ambiguous. Dirty tree: commit / stash / abort. Non-trivial conflicts. A `proto/*` source is refused |

## 5. What "done" looks like

Every command ends with one report rendered by `report-render`. Fixed order: **bold outcome** (✅/⚠️/🚫), bullets, 📌 pins, ⚠️ warns, 🚫 blocks, 📦 artifacts, ✨ found, 📋 queued, then `Next: <command>` or `Next: nothing needs you — <reason>` or the verbatim `spec-status --next` output. A `Next:` never ends in `?`.

| Command | Done = |
|---|---|
| plan | `✅ spec hardened & locked — {path}`; `status: hardened`; commit `chore(spec): lock {YYYYMMDD/NN}` |
| run | Spec `done`, Canonical Delta applied, close commit, branch merged into `build_base`, worktree removed (never pushed). Next = status --next |
| fanout | Each lane lands one at a time, as it returns, with the gate green on main; a spec whose `depends_on` is not done waits. One REPORT, then the next bare run starts the next batch |
| fix | `✅ fixed — {symptom}`: root cause, regression test, findings disposed, fix/escape row appended |
| genesis | `✅ architected + grounded — scaffold green, {N} ADRs, {P} convention probes, roadmap of {M} briefs`, `Chain: …`, `Next: /spec:enforce` |
| mocks | `✅ wireframe approved — {N} journeys`, `Next: /spec:genesis` |
| prototype | Contract committed on main, `/spec:plan <contract>` queued. `--mark closed` removes worktree, branch and DB |
| init | `initialized — {N} files, gate verified, stamped` |
| git:commit | `✅ committed — {subject} ({N} files)`; Next `/git:merge — land it on {base}` on a `spec/*` branch |
| git:merge | `✅ merged {source} into {target}` |
| git:enter-worktree | `✅ worktree created at …` / `re-entered at …` / `attached at …`; writes `build_base` unless pinned |

`/spec:status` prints a fenced block with four parts: `🗺️ Roadmap` (one row per brief with its `Phase:`, consecutive done / unplanned / superseded briefs collapsed to a range such as `✅ 01–02  P0  done (2 briefs, 8 specs)`, an implementing brief as `🔨 02a <slug>  P0  ▓▓▓▓▓▓▓▓░░ 24/29`), `🎯 Next` (a `qNN` row per pending prompt item, then the `/spec:run @<spec>` top pick, or `⚡ N parallel lanes ready — /spec:fanout` with one `/spec:run @<spec>` line per lane and `🔶 merge-conflict risk` lines for lanes whose File Plans share a path, or `└─ 🚦 solo` when one lane runs among other open work; a blocked pick carries `⏳` branches), `⚠️` pending questions, and a footer (`🟢 next is ready · N more open · M hygiene findings (/spec:doctor)`). `--all` adds `🕓 after that:` (startable but not a lane, each with its `⛓️`/`🤷` reason), `⛔ blocked:` (specs whose `depends_on` is not done) and `🧹 Hygiene (N) — /spec:doctor` (doctor findings without running the host test command). `NN` checks one brief's dependency readiness (`brief NN (slug): all N dependencies met`, exit 0; `UNMET dependencies — 03 (open)`, exit 1; unknown brief, exit 2). `--json` keeps `roadmap`, `next`, `lanes`, `questions`, `verdict` and adds `prompts`, `top`, `after`, `blocked`, `hygiene`, `open` (roadmap rows also carry `phase`, `done`, `total`, `name`). There is no ledger behind the screen: no `📈` lines, no misunderstandings line, no CI-red footer, no done-since-release count. The command drivers and `plan.js lock` accept the printed `@path` form of a spec argument.

## 6. Spec document format

Frontmatter fields: `date`, `status` (draft→hardened→implementing→done, or `superseded` [+`superseded_by`]), `tier` (standard\|critical), `area`, `breaking`, `depends_on: []`, `brief: NN|n/a`, plus optional `prototype: <stem>`, `spiked: YYYY-MM-DD`, `open_markers: N` (0 to lock), `build_base`, `diff_base`, and host-declared flags.

Sections, in order: `## Goal`, `## Users` (job stories `- who: When …, I want …, so I can …. First run / empty: …`), `## Decisions (locked — workers apply verbatim, never override)`, `## File Plan`, `## Contracts`, `## UI`, `## Data Model` (requires `existing rows:`; non-empty means critical unless `changes: additive-only`), `## Behavior`, `## Acceptance Criteria`, `## Assumptions (escalation triggers)` (`A1: … — **if false:** …`), `## Rationale` (may hold `### Advisory debt (review <runId>)`), `## Canonical Delta`. Contracts, UI and Data Model can be left out.

- **Decisions:** `| ID | Decision | One-line rationale |`, rows `D1…`. Each row cites at least one of its own AC-IDs or carries `[no-ac: <reason>]`. Other tags: `[guards: …]`, `[asked: …]`, `[breaking: …]`, `q<id>` for deferrals.
- **File Plan:** `| Path | Action | Layer | Summary |`. Action is CREATE/MODIFY/DELETE. Layer is one of the host's layerGroups or `tests`/`other`/`baseline`. Tests rows list their AC-IDs. Dependency changes are named in backticks, or the row says `no dependency change`.
- **ACs:** `- **AC-YYYYMMDD-NN-k**: WHEN … THE SYSTEM SHALL …` with literal `input → output` examples (required on critical tier), ending with `→ writes <file>`, `→ rewrites <file> :: <title prefix>` or `→ reuses <file> :: <title prefix>`. Optional tags: `[env: VAR]`, `[oracle: <leg>|literals|contract]`, `[pre-green: fallback-rejection|absence-invariant|predicate-in-test]`. Pins use `SHALL CONTINUE TO`. `[NEEDS CLARIFICATION: …]` marks an open gap during drafting.

Trimmed real example (`specs/20261103/05-tests-that-earn-their-keep.md`):

```markdown
---
date: 2026-11-03
status: done
tier: standard
area: test-expiry
breaking: false
depends_on: []
brief: n/a
spiked: 2026-11-03
open_markers: 0
diff_base: 4e19cf5b20dabd3019d013a40435546a0426ac27
---

# Tests that earn their keep

## Goal

The pipeline writes a permanent test for every acceptance criterion, including criteria about
doc and command prose, and its close-time expiry classifies a test by the text of its whole file. …

## Users

- …

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `[oracle: literals]` is the one in-process oracle: `ac-matrix.js` evaluates a bullet carrying it itself … (AC-20261103-05-1) | … |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/ac-matrix.js | MODIFY | scripts | D1: `[oracle: literals]` in-process evaluation; no dependency change |
| spec/scripts/lib/case-reach.js | CREATE | scripts | D4: `topLevelDecls`, `caseReach`; no dependency change |
| spec/templates/spec.md | MODIFY | doctrine | D2: § Acceptance Criteria comment |

## Acceptance Criteria

- **AC-20261103-05-1**: WHEN `ac-matrix.js --spec <s> --root <r> --manifest <m>` runs on a spec whose
  bullet carries `[oracle: literals]` with stems `gone phrase` … THE SYSTEM SHALL … → writes tests/ac-matrix.test.js

## Assumptions (escalation triggers)
## Rationale
## Canonical Delta
```

## 7. Queue

An item is `{id: "qN", kind: brief|spec|prompt, brief?|spec?|payload?, lane? (plan|prototype|fix|decide, prompt only), added, after?: {spec|brief}, when?: {brief-state:NN:STATE | spec-exists:PATH | ledger-count:STAGE:MIN | manual}, origin?: {spec, stage}, trigger?: red-leg|repair-separate|close-followup|stopped|gate-red|gap, batch?, ticked?}`. The file is `{version:1, seq, items[]}`. How a payload is classified: `NN` or a roadmap path is a brief, `specs/*.md` is a spec, anything else is a prompt. A `<ref>` can be an id, a brief number, a spec path or unique basename, or a unique prompt substring.

| Subcommand | Effect |
|---|---|
| `next` (default) | Reconciles, then prints the pick (`🛣️ <lane>` + paste line) |
| `list` | Pending items as `n  id  age  payload  flags` (`📎 cites done`, `⏳ gate met`, `⌛ stale`), footer `— N done · move: … · full text: …` |
| `add <payload> [--lane] [--top\|--at n] [--after-spec p\|--after-brief NN] [--when t:a] [--distinct] [--origin s --stage build\|review\|fanout\|plan] [--trigger …]` | Refuses a duplicate brief/spec and near-duplicate prompts |
| `move <ref> <n>` / `done <ref>` / `show <ref>` | Reorder / tick by hand / print the full payload |
| `groom` | Read-only buckets: duplicates, cites-done, gate-met, stale |

## 8. Shared vocabulary

| Term | Meaning to the user |
|---|---|
| lane | (a) The path a change travels: Direct, Behaviour (prototype) or Structural (spec). (b) One fan-out unit, a worktree sub-agent running one spec or fix. (c) A queue item's `--lane` |
| leg | One executed review check (gate, smoke, drift, ci, tests, literals, at-risk, slow). Named in findings and `[oracle: <leg>]` |
| pin | (a) An AC bullet using `SHALL CONTINUE TO`, whose test survives close. (b) A prototype overlay note on a screen (`pin <id>`) |
| mark | `--mark <verb>`: the session reporting a step done to a driver |
| soft | An advisory review finding. Recorded under Advisory debt, never dispositioned (hard findings `s<i>` are dispositioned) |
| escape row | Ledger row written by `/git:commit` when a fix touches lines a reviewed spec landed |
| seat | A model role (planner, workers, reviewer, disposer, research, lookups) with model and effort, overridable via `policy.models` |
| tier | `standard` or `critical`, decided by the files a spec touches. Critical requires literal examples and lock confirmation |
| 📌 Auto-picked … (veto anytime) | A derived decision, printed instead of asked |
| checkpoint | Line printed after a mark, meaning it is safe to `/clear` and re-run |
