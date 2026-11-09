# v8 Interface Contract

This is the user-visible surface of the `spec` and `git` plugins as of `claude-plugins` main @ 23ac13f9. v8 may rewrite everything behind it, but it must keep what is listed here: the commands, arguments, printed state names, `--mark` verbs, host files, stop points and reports. Internal mechanics are left out.

## 1. Commands

| Command | Arguments / flags | Purpose |
|---|---|---|
| `/spec:init` | `[--set key=value]…` | Detects the trunk, `testCommand` (lint and typecheck chained in front) and `setupCommand`, writes `.claude/spec.config.json` and the `.gitignore` entries, runs the gate once |
| `/spec:doctor` | `[--fix]` | Health check of the host: config, the gate, `.gitignore`, sidecars, worktrees, roadmap hygiene. Names a remedy per finding |
| `/spec:enforce` | none | Retired: the command is kept as a name only. Lint and typecheck reach `testCommand` through `/spec:init` |
| `/spec:connect` | `[--project <id>] [--name <text>] [--base-url <url>]` | Links the project to the hosted review service |
| `/spec:genesis` | `<project idea — what, for whom>` | Greenfield only. Goes from idea to grounded repo |
| `/spec:mocks` | none | Wireframe design stage |
| `/spec:prototype` | `<idea words \| docs/roadmap/NN-*.md \| stem> [--stem <name>]`; also `<stem> pin --kind behaviour\|look --route </route> [--given "<precondition>"] --note "<note>"` and `<stem> drop pN --why "<reason>"`; `--mark contracted --confirmed`, `--mark closed [--force]` | A throwaway app the user argues with in chat; each ruling is a pin sentence. It ends in a behaviour contract |
| `/spec:plan` | `<feature description \| spec path \| roadmap brief path \| design/prototypes/<stem>/contract.json>` | Writes and locks a spec |
| `/spec:run` | `<spec path> [--in-place]` | Takes a spec from build through review to merge |
| `/spec:fanout` | `[--pick] [<spec path>…]` | Runs several lanes from one session |
| `/spec:fix` | `[--root <dir>] [<spec> — <symptom> \| symptom in plain words]` (bare = taken from the conversation) | The only fix command. In a session it drives `run.js --fix "<symptom>" --in-place`; a leading `--root <dir>` means a fanout lane, driven as `run.js [<spec>] --fix "<symptom>" --root <dir>` with no `--in-place`, reading `commands/run.md` for the step and lane rules; a `<spec> — <symptom>` argument binds the fix to that spec in both forms. A fix is the same run as a spec on no spec file (`lib/spec.js` `fixDoc`: the symptom, the reproduce-first recipe, one criterion, no File Plan): the builder writes the cause and the regression test in `evidence.md`, the gate and a review follow, and the commit is `fix(<id>\|<slug>): <symptom>` with that evidence in its body. Outside a lane and without `--in-place` it exits 2 (`--fix works in place (--in-place) or as a fanout lane`); on a `prototype:` spec it is in place only. A cause that needs an architecture or behaviour change: the builder makes no edit, `needs-plan --why` ends the run STOPPED with `/spec:plan` queued. A spec-less fix keeps its run state in `specs/fix/<slug>.run/` of the checkout it runs in, which the `specs/**/*.run/` ignore line must cover or the run is refused (a lane's goes with its worktree). An in-place fix on a spec ticks the queued `type: fix` item with that spec and symptom |
| `/spec:queue` | `[next\|list\|groom\|add\|move\|done\|show] [args…]` (bare = `next`) | Session work queue |
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
| run (`/spec:run`, `/spec:fix`) | (OPEN) → BUILD → (GATE) → REPAIR? (cap 2) → REVIEW → FIX? (cap 1) \| ESCALATE \| LOOK (a `prototype:` spec) → (COMMIT) → (MERGE) → DONE, or STOPPED `{why}`. GATE runs a `prototype:` spec's pin tests (`prototype.e2eCommand` with `{file}` = `prototype.e2eFile` and `APP_URL`, against the app the driver boots on one port per run); red is a REPAIR. MERGE lands through `lib/land.js`: rebase, gate and merge in the worktree. A lane ends DONE in its worktree | `built`, `repaired`, `regate` (REPAIR only; once per tree), `reviewed --file <json>`, `fixed` (refused on an unchanged tree and unchanged `evidence.md`/`as-built.md`), `escalate <label>` (the question's own options), `dismissed`, `looked`, `look-failed --why "<the reply verbatim>"` (a FIX round not counted against the cap), `unmet --decision <id> --why <text>`, `unmet --assumption <id> [--why <text>]`, `after --on <spec>`, `needs-plan --why <text>` (a fix). A fanout lane never takes a spec with `prototype:`: it waits with `stops at LOOK for you — /spec:run it` |
| fanout | PLAN → DISPATCH → WAIT → RELAY → MERGE → REPORT. Bare takes every startable hardened spec, queued or not, in queue order (`lib/next.js` orders them; a queued brief stands for its specs): a shared brief waits for its sibling (`shared brief NN`), and a brief dependency waits and ends the batch (`brief X depends on Y`, then `the batch stops before <stem>`); PLAN prints the queue rows | `planned`, `picked --label <title>…`, `dispatched`, `returned --lane <id> [--stopped "<reason>"]`, `resent`, `answered --lane <id> [--label <label>]`, `resumed`, `dismissed --lane <id> [--discard]`, `reported`. One lane shape `{spec \| symptom, worktree, prompt}`: every queued `type: fix` item is a lane unless its spec has `prototype:`, after the runnable specs — bound `fix-<stem>`, branch `fix/<stem>`, prompt `/spec:fix --root <wt> <spec> — <symptom>`; spec-less `fix-<slug>`, prompt `/spec:fix --root <wt> <symptom>`. A spec lane's prompt stays `/spec:run <spec> --root <wt>`. A DONE lane lands as it returns through `lib/land.js`; a mark prints `lane N landed as <sha>`, or `lane N sent back — conflicts: <files>` / `lane N gate red after rebase: <line>` with that lane's Agent call (nothing extra under `--json`). A lane STOPPED `after` a spec is held on its queue item and re-picked on its kept worktree once that spec is done; a lane STOPPED `amend` is held on its kept worktree (no queue gate, `waits — its lane waits for the amended spec` at PLAN) and re-picked once the amended spec is locked; `dismissed` on a lane with a question parks it with a `decide` item; a mark whose effect is already in the state prints `mark <verb> was already applied` and exits 0 |
| genesis | DISCOVERY → BRIEF → MENUS → [FINALISTS → (RACE) → PROBE → PICK] → DECIDE → (SCAFFOLD) → SKELETON → (GATE) → GATE_RED \| [DESIGN_BRIEF → DESIGN_KIT → DESIGN_JOURNEYS → AWAITING_DESIGN_APPROVAL] → ROADMAP → HANDOFF → GROUNDED. The status file also records DEFERRED and SCAFFOLD_RED. Bracketed states run only for tournament archetypes or visual Storybook archetypes | `discovery-done`, `brief-written`, `menu-written --file <f>`, `menus-done`, `finalists-written`, `finalists-skipped`, `probe-done`, `picked`, `decided`, `skeleton-landed`, `design-brief-written`, `kit-landed`, `journeys-drawn`, `design-approved`, `roadmap-written`, `profile-written --file <f> [--refresh]` |
| mocks | SEED → SCREENS → APPROVED | `seed-done`, `journey-drawn --journey <j>`, `journey-approved --journey <j> [--waive --reason <r>]`, `approved`. Also `round push`, `round pull`, `--reopen journey:<j>` |
| prototype | OPEN → ROUND → APPROVED → CONTRACTED → CLOSED | `opened`, `round-done`, `approved`, `contracted --confirmed`, `closed [--force]`. `pin` and `drop` are subcommands, not marks. A v7 record in `design/prototypes/` stops every invocation with `run /spec:migrate` |

`/spec:run` builds in `.claude/worktrees/spec-<stem>` on `spec/<stem>`; only `--in-place` builds in the checkout it is in (`📌 Auto-picked in place — --in-place`), and off trunk without it the run exits 2 naming `--in-place`.

A lane (a sub-agent) never asks the user. It writes `.claude/pending-question.json`, prints `PENDING_QUESTION`, and stops.

## 3. Host files

| Path | What |
|---|---|
| `specs/YYYYMMDD/NN-slug.md` | Spec doc (§6) |
| `<spec>.build/`, `<spec>.review/` | Sidecar directories for driver state, next to the spec |
| `<spec>.deviations.md` | Bullets-only deviations. Folded into Gotchas at CLOSE; `closed` refuses while the file exists |
| `.claude/spec.config.json` | Config (keys in architecture §3). `testCommand` is required, the whole gate. Optional: `testCountPattern` (one capture group; set, a gate that exits 0 but counts 0 tests or matches nothing is red, never cached), `testFileCommand`, `setupCommand`, `trunk`, `lanes`, `gateConcurrency` (default 2), `seats`, `worktreePerSpec`, `mergeStrategy` (`merge-commit`\|`ff-only`\|`squash`), `doctorProbeMs`, `walkthrough {baseUrl,project,tokenEnv}`, `prototype {url, bootCommand, publicUrl?, picture?, e2eFile?, e2eCommand?}` (`url` and `publicUrl` take `{port}`; `e2eFile` takes `{stem}`; `e2eCommand` takes `{file}` and runs with `APP_URL`), `release {deployCommand,stagingUrl,e2eCommand,promoteCommand?,rollbackCommand?,productionUrl?,healthPath?,migrationsCheck?,testCountPattern?}` (`testCountPattern` optional; `/spec:migrate` fills it from v7's `capabilities.testCountPattern`), `design`, `forge` |
| `policy` block | v7 only. `/spec:migrate` folds `mergeStrategy` and `worktreePerSpec` and the model seats into the v8 keys and drops the block |
| `.claude/rules/spec-pipeline.md` | `paths:`-scoped to `specs/**`, `.claude/**`. Seven sections: Risk Tiers · Planning · Build · Worker Rules · Test Rules · Review Checks · Gotchas |
| `.claude/rules/conventions/*.md` | Repo-owned. Read by the host's own tests and lint messages; `/spec:init` writes nothing under `.claude/rules/` |
| `.claude/rules/enforcement.json` | v7 only. `/spec:migrate` archives it to `docs/archive/v7/rules/`; nothing reads it |
| `.claude/spec-runs.jsonl` (+ `.claude/spec-runs/<runId>.jsonl`) | Run ledger with plan/build/review/fix/escape/release rows. Gitignored when `ledgerCommitted:false` |
| `.claude/settings.local.json` `env` | Walkthrough token, written by `/spec:connect`. Never in a tracked file |
| `<git-common-dir>/spec-queue.json` | Queue (version 3, owned by `lib/queue.js`): what a user or an agent placed, ticked rows included; the fill is derived on every read and never stored (§7, ADR-0044). Not in the checkout |
| `<git-common-dir>/spec-fanout.json` | Fan-out state. Deleting it resets the lane set; with it missing and fanout lane markers open, `/spec:fanout` refuses and names the newest `spec-v7-backup/*/spec-fanout.json` to `cp` back |
| `.claude/worktrees/spec-<stem>`, `.claude/worktrees/proto-<stem>` | Worktrees. Must be gitignored; `.worktreeinclude` lists the files copied in |
| `.claude/genesis/` | `brief.md`, `status.json`, `conventions.json`, `stack-descriptor.json`, `init-profile.json`, `init-gen.log`, `tournament/` |
| `docs/roadmap/00-overview.md`, `docs/roadmap/NN-slug.md` | Brief header: `Phase: · Depends on: · Primary workspaces:`, `First light:`, `Journeys:`. Sections: Result, Current state, Scope, Surfaces, Out of scope, Grounding, Open questions for planning |
| `docs/adr/NNNN-slug.md` | ADRs (`Amended by ADR-NNNN`, superseded status) |
| `docs/design/{brief.md,catalog.md,approval.json}` | Genesis design stage |
| `docs/canonical/{area}.md` | Canonical docs. A spec's Canonical Delta is applied at CLOSE |
| `design/mocks/{seed.md,status.json,screens/}`, `design/rounds/<n>/approvals.json` | Mocks |
| `design/prototypes/<stem>/{status,pins,contract}.json`, `pictures/` | Prototype files, committed on main. `pins.json` is an array of `{id, kind, route, given?, note, round, status, at}`; `contract.json` is `{stem, rounds, pins:[{id, kind, route, given?, note, sentence, round, status}]}`. Branch `proto/<stem>` is never merged |
| `.claude/agent-memory/` | Worker memory. Each file is carried, corrected or deleted at close |

## 4. Questions and stop points

All questions go through `AskUserQuestion`: at most 4 per call, recommended option first, each option stating its consequence. A dismissed question stops the run. Anything the plugin can derive is printed as `📌 Auto-picked <choice> — <reason> (veto anytime)` and not asked.

| Command | Asks / ends the turn |
|---|---|
| init | One question, only when no test command is detected: `What single command runs your whole test suite?` (answered with `--set testCommand=<cmd>`) |
| plan | Real forks while drafting. Critical tier only: "This spec is critical tier because it touches <trigger>. Lock it now?" → Lock it / Keep it as a draft |
| run | Three questions only, in the agent's own words: a false Assumption (its `ask` arm options), a choice the reviewer says the spec did not make (keep / fix / amend), a Decision the build cannot keep (amend / retry / park; retry only until Opus has run, and a question left with one answer is a rule: park, as a 📌 line). `amend` stops the run waiting, not ended: it resumes by itself once the amended spec is locked. LOOK (prototype specs): only a literal `close enough` advances; any other reply is a FIX round with the reply as the symptom. Everything else is a rule printed as a 📌 line: a cap reached stops with a fix queued, a build's spec edits are reverted, a secret stays out of the commit, advisories become one fix item (a fix that is itself a queued advisories item queues none: they print as 📌 lines), a merge conflict is resolved in the spec's worktree |
| fanout | RELAY: every lane question in one batch, verbatim (`answered`, or `dismissed`: a decide item, no label recorded). REPORT ends the turn: the user runs `/spec:fanout` again after `/clear` |
| fix | The run's questions on a bound spec's Decisions and Assumptions; none for a spec-less fix. A cause that needs an architecture or behaviour change ends the fix with `/spec:plan` queued |
| genesis | Discovery interview rounds with research menus. Hard-to-reverse forks. DESIGN_BRIEF. Literal `approve` at AWAITING_DESIGN_APPROVAL |
| mocks | Asks for the idea only when `.claude/genesis/brief.md` is missing. Service mode: prints `🎨 ready for review — <link>` and ends the turn. Terminal mode: ends on `approve all, or name the ones to change` |
| prototype | The OPEN, ROUND and APPROVED (with a picture) bodies, and the run's LOOK body, print the boot line `cd <worktree> && export PORT=<port> && <bootCommand>`, so a `$PORT` in `bootCommand` expands; with a fixed `prototype.url` (no `{port}`) the line is `cd <worktree> && <bootCommand>`. `prototype.bootCommand` has no default: when it is unset OPEN makes no worktree and asks the user once for the app's start command (the session sets `prototype.bootCommand` in `.claude/spec.config.json` and re-runs), and every boot line (`prototype.js`, `run.js`) refuses, naming `prototype.bootCommand`, rather than print `undefined`. Each ROUND prints `🎨 ready for pins — <url>` and ends the turn, only when the app answers. A literal `approve` → approved; any other reply is a ruling the session pins. APPROVED prints every active sentence by route and waits for the user's yes before `contracted --confirmed` |
| queue groom | Asks only about `keep`/ambiguous items. Clear evidence of done is ticked with a 📌 |
| release | Phase 0 grounding fields. Promote to production? Rollback question. Seed-data question |
| doctor `--fix` | Per-patch approval batches |
| git:commit | Approval 1 (gather), approval 2 (commit). Secrets hit: "Keep them out of this commit?". Defect class for the escape row |
| git:merge | Source branch when ambiguous. Dirty tree: commit / stash / abort. Non-trivial conflicts. A `proto/*` source is refused |

### Pending-question kinds

Every question a lane writes to `.claude/pending-question.json` carries one of three kinds (fanout's RELAY orders by it, `answered` keys on labels). A lane never answers; the orchestrator relays every question verbatim and never answers for the user.

| Kind | Writer (step) | Options |
|---|---|---|
| `assumption` | `unmet --assumption <id>` (BUILD, REPAIR, FIX, REVIEW) when the Assumption's arm is `ask` | the arm's `ask: a \| b` options with `amend` last, else `amend`, `retry` (until Opus has run), `park`. A picked option is a ruling: the commit message and the next brief carry `<id>: <label>` |
| `decision` | `reviewed` with a `needs-decision` finding and nothing blocking (ESCALATE) | `keep` (a ruling `kept: <summary>`, then COMMIT), `fix` (a FIX round not counted against the cap), `amend` |
| `unmet` | `unmet --decision <id> --why <text>` (ESCALATE) | `amend`, `retry` (until Opus has run), `park` |

Reviewer finding severities are `blocking`, `advisory` and `needs-decision` (a choice the diff made that the client would sign off, or a plausible departure from a Decision); blocking findings win, and a `needs-decision` finding beside one rides along in the run state.

## 5. What "done" looks like

Every command ends with one report rendered by `report-render`. Fixed order: **bold outcome** (✅/⚠️/🚫), bullets, 📌 pins, ⚠️ warns, 🚫 blocks, 📦 artifacts, ✨ found, 📋 queued, then `Next: <command>` or `Next: nothing needs you — <reason>` or the verbatim `spec-status --next` output. A `Next:` never ends in `?`.

| Command | Done = |
|---|---|
| plan | `✅ spec hardened & locked — {path}`; `status: hardened`; commit `chore(spec): lock {YYYYMMDD/NN}` |
| run | Spec `done` in the build commit, branch landed on trunk through the worktree (rebased, gated, merged per `mergeStrategy`), worktree removed (never pushed); the report lists `📌 Users will notice:` and every decided line. Next = the queue head |
| fanout | Each lane lands as it returns through the same landing path, trunk getting exactly the tree its worktree gate passed; a spec whose `depends_on` is not done waits. One REPORT ends the turn (`N spec(s) and M fix(es) left — /clear, then /spec:fanout to continue`) with every answered question and every lane's 📌 lines, and the next bare run starts the next batch. A fix item is a lane; a spec with frontmatter `prototype:`, and a fix item bound to one, is held for `/spec:run` (`stops at LOOK for you — /spec:run it`) |
| fix | `✅ fixed — {symptom}`: one `fix(<id>\|<slug>): <symptom>` commit carrying the cause and the regression test |
| genesis | `✅ architected + grounded — scaffold green, {N} ADRs, {P} convention probes, roadmap of {M} briefs`, `Chain: …`, `Next: /spec:plan` |
| mocks | `✅ wireframe approved — {N} journeys`, `Next: /spec:genesis` |
| prototype | `✅ contract written`: `contract.json` committed on main (`committed on trunk`), `/spec:plan <contract>` queued. `--mark closed` removes the worktree and branch, reports a failed removal, and commits its status |
| init | `✅ initialized — config written, gate verified` (exit 0 of `testCommand`); any other exit prints `config written — gate not verified` and a `testCommand exited N` warning; no detected command prints `config written — answers needed` |
| git:commit | `✅ committed — {subject} ({N} files)`; Next `/git:merge — land it on {base}` on a `spec/*` branch |
| git:merge | `✅ merged {source} into {target}` |
| git:enter-worktree | `✅ worktree created at …` / `re-entered at …` / `attached at …`; writes `build_base` unless pinned |

`/spec:status` prints v7's screen: `🗺️ Roadmap` (one row per brief with its `Phase:`; consecutive done / unplanned / superseded briefs collapse to a range such as `✅ 01–02  P0  done (2 briefs, 8 specs)`; an in-flight brief is `🔨 02a <slug>  P0  ▓▓▓▓▓▓▓▓░░ 24/29`), `🎯 Next` (a `qNN` row per pending prompt item, typed `/spec:plan`, `/spec:prototype`, `/spec:fix` or `📌 decide:`, each led by its type mark 🏃 run, 📝 plan, 🧪 prototype or 🔧 fix after the id (a decide row keeps its one 📌, a plain note has none) and ended by `  🔨 in progress` when it is being worked on; then `⚡ N parallel lanes — first stays on main, each other lane gets a worktree (/git:enter-worktree):` with one `🏃 /spec:run @<spec>` line per lane and `🔶 <a> × <b>: merge-conflict risk: …` for lanes whose File Plans share a path; or `└─ 🚦 solo` when one lane runs among other open work; or, with nothing startable, the blocked top pick with `⏳` branches such as `⏳ after brief 03`; or `✨ nothing next …`), up to three `⚠️` decide lines (`Brief 03 (slug) moved on, but its dependency 02 (slug) was never planned.` / `Plan it now?  /spec:plan @docs/roadmap/02-slug.md`, the unplanned-while-later-moved form, and `brief-done-queued`: `Brief 03 (slug) has every spec done but is still queued.` / `Close it?  /spec:queue done 03`, or `Brief 03 (slug) has every spec done; N step(s) outside specs are still open.` with the same ask while its `## Steps outside specs` lists an open box; and, for a queue file of an old version, `The queue file is an old version, so this screen ignores it.` / `Migrate it?  /spec:migrate`), and a footer: `🟢 next is ready`, `🟠 next is blocked · waiting on <blocker>` or `⬜ nothing waits`, then `· N more open` (`nothing else open` at zero on 🟢), `· N more to decide (--all)` and `· N hygiene findings (/spec:doctor)`. Lanes are pairwise-admitted with no cap and mean "independent now"; `/spec:fanout` prints the batch it starts at PLAN. `--all` adds `🕓 after that:` (startable but not a lane, each with `⛓️ shared brief NN` or `⛓️ brief A depends on B`), `⛔ blocked:` (specs and prompt rows with `⏳` branches: `depends_on`, a brief's dependencies, `after` gates), every `⚠️` decide line and `🧹 Hygiene (N) — /spec:doctor` with the derivation's own kinds (`queue-unparseable`, `queue-orphan`, `unknown-status`, `orphan-stamp`, `unparsed-dependency`, `unknown-dependency`, `skipped-spec`, `hand-tracked-status`). `NN` checks one brief's dependency readiness (`brief NN (slug): all N dependencies met`, exit 0; `UNMET dependencies — 02 (unplanned)`, exit 1; `no docs/roadmap/NN-*.md found`, exit 2). `--json` is `{briefs, specs, superseded, anomalies, next}` (`briefs[].status` is `unplanned|in-flight|done|superseded`, `specs[].status` the derived state, `next` the top entry's command or `null`). The script prints the raw screen starting with a blank line (no fence, no ledger lines, no footer for runs or fan-outs); the `/spec:status` command wraps it in a fenced block and narrates. A refused flag (`--next`, `--lanes`, `--pretty`, `--brief`, `NN` with `--all`) prints the usage line, exit 2. The command drivers and `plan.js lock` accept the printed `@path` form of a spec argument.

## 6. Spec document format

Intent block lines: `- You asked:`, `- I will build:`, `- I will not touch:`, `- Users will notice:`, `- You lose:`, `- Architecture or behaviour change:` and `- Client sign-off: none | <what was asked> — <what the user chose>`. `plan.js lock` refuses (exit 2, `client sign-off needed: …`) when the line says `none` and the frontmatter says `breaking: true` or a Decisions row restricts users without `[asked:]` or `[guards:]`.

Frontmatter fields: `date`, `status` (draft→hardened→implementing→done, or `superseded` [+`superseded_by`]), `tier` (standard\|critical), `area`, `breaking` (boolean), `depends_on: []`, `brief: NN|n/a`, plus optional `prototype: <stem>` (the spec is built from that prototype's contract: the lock needs an AC ending `(pin pN)` per active behaviour pin, and `/spec:run` runs its pin tests in GATE and stops at LOOK), `spiked: YYYY-MM-DD`, `open_markers: N` (0 to lock), `build_base`, `diff_base`, and host-declared flags.

Sections, in order: `## Goal`, `## Users` (job stories `- who: When …, I want …, so I can …. First run / empty: …`), `## Decisions (locked — workers apply verbatim, never override)`, `## File Plan`, `## Contracts`, `## UI`, `## Data Model` (requires `existing rows:`; non-empty means critical unless `changes: additive-only`), `## Behavior`, `## Acceptance Criteria`, `## Assumptions (escalation triggers)` (`A1: … — **if false:** …`), `## Rationale` (may hold `### Advisory debt (review <runId>)`), `## Canonical Delta`. Contracts, UI and Data Model can be left out.

- **Decisions:** `| ID | Decision | One-line rationale |`, rows `D1…`. Each row cites at least one of its own AC-IDs or carries `[no-ac: <reason>]`. Other tags: `[guards: …]`, `[asked: …]`, `[breaking: …]`, `q<id>` for deferrals.
- **File Plan:** `| Path | Action | Layer | Summary |`. Action is CREATE/MODIFY/DELETE. Layer is one of the host's layerGroups or `tests`/`other`/`baseline`. Tests rows list their AC-IDs. Dependency changes are named in backticks, or the row says `no dependency change`.
- **ACs:** `- **AC-YYYYMMDD-NN-k**: WHEN … THE SYSTEM SHALL …` with literal `input → output` examples (required on critical tier), ending with `→ writes <file>`, `→ rewrites <file> :: <title prefix>` or `→ reuses <file> :: <title prefix>`. Optional tags: `[env: VAR]`, `[oracle: <leg>|literals|contract]`, `[pre-green: fallback-rejection|absence-invariant|predicate-in-test]`. Pins use `SHALL CONTINUE TO`. `[NEEDS CLARIFICATION: …]` marks an open gap during drafting.

- **A done or superseded spec is a stub:** at the merge `lib/land.js` rewrites it to its frontmatter (every key kept) plus `text: <sha>` and `acs: [<every AC-ID, each with its (pin pN) cites>]`, a blank line, the `# ` title and the `## Goal` section, in one `chore(spec): stub <id>` (or `stub <n> specs`) commit after the merge commit. `text:` is trunk's HEAD after the merge, which holds the full text: `git show <text>:<path>` prints it. A fix on a stub reads that text (`lib/stub.js` `readFull`).
- **Departures and rulings:** the driver never writes the spec beyond its status line: what the build did differently (`<spec>.run/as-built.md`), and the user's rulings, go into the build commit message.
- **Table cells:** a row splits on `|` outside backtick code spans only; a pipe inside a span stays in the cell, and `\|` outside a span reads `|`.

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

An item is `{id: "qN", kind: brief|spec|prompt, payload, added, done?, type?, spec?, after?}` in `{version: 3, seq, items[]}`. `type` is only on a prompt item: `plan | prototype | fix | decide`; it is the only carrier of the prompt's command, and a prompt with no `type` is a plain note. `payload` is bare text, never a `/spec:<type> ` prefix. `spec?` is only on `type: fix`: the root-relative `specs/…md` the fix is bound to; absent = a spec-less fix. Typed text is parsed once, at the door (`queue add`, `/spec:migrate`), never on read. A queue file of any other version is refused with `queue file is version <n> — run /spec:migrate` (exit 2) by `queue`, `run` and `fanout`, and the status screen prints `⚠️ The queue file is an old version, so this screen ignores it.` / `Migrate it?  /spec:migrate` (a decide line; a file that is not valid JSON stays a `queue-unparseable` hygiene finding), and a version 3 file with no `items` list is refused too. `after` is `{brief: "NN"}` (zero-padded, suffix lowercase: `3` → `03`, `4B` → `04b`) or `{spec: "specs/…md"}` (root-relative). How a payload is classified: `NN[a-z]` or `docs/roadmap/NN…-…` is a brief (`3` and `2026` are prose), `specs/*.md` is a spec, anything else is a prompt. A `<ref>` can be an id, a brief number (`3` and `07` both), a spec path or basename, a unique prompt substring, or a row position; two matches exit 2 naming both ids.

**The fill** (ADR-0044). The file holds what was placed, by a user or an agent. Every reader (`next`, `list`, `show`, `groom`, the status screen, fanout) sees the file plus the fill, worked out on every read by `lib/queue.js` and never stored: later duplicates of a brief or spec drop out, then every on-disk brief that is not done (or is done with an open box under `## Steps outside specs`) and has no `> **Superseded by` banner, then every ad-hoc spec (no brief) that is not done or superseded, by path, joins at the end as an item with no id, unless an open item holds it. A done row holds nothing, so a ticked unfinished brief or spec comes back last with no id and no `after`. Only the main checkout fills or retires a spec item whose file is gone (a lane may predate the spec). `move` or `done` on a filled item stores that one item as `qN` (`move` prints the position it reached; `done` prints `⚠️ <ref> is still open work, so it stays in the list`); `add` stores after the stored open items, so ahead of filled work. `lib/queue-rows.js` renders `list`, `show` and `groom` and writes nothing.

The paste line of a prompt item: `/spec:plan <text>`, `/spec:prototype <text>` or `/spec:fix <text>` for those three types, where `<text>` is the payload, or `<spec> — <payload>` for a bound fix (`<spec>` alone when the payload is empty); `📌 decide: <payload>` for `decide`; the payload verbatim when the item has no `type`. A spec item pastes `/spec:run <path>` once hardened, else `/spec:plan <path>`; a brief item pastes `/spec:plan <roadmap path>`.

An item is ready without `after`; with `{brief}` when that brief's specs are all done; with `{spec}` when that spec is `done` or `superseded`; a target with no file or no brief is never ready. `next` prints the first pending ready item that is not a finished brief: a prompt's paste line alone, else the derivation's top pick (`<action> @<path>` then its `⏳` branches, never a blocked spec while an unblocked one exists), or `✨ queue empty — nothing left undone`, or `nothing ready — N waiting on after gates or finished briefs` (exit 0); it writes nothing. Fanout waits a spec whose item is not ready. A brief item is closed by `done`, or by `lib/land.js` when its last spec merges and its `## Steps outside specs` lists no open box (`📌 auto-closed brief NN …`): reconcile never ticks it, `next` skips a brief whose specs are all done (or that is superseded), and the status screen raises `brief-done-queued`. Reconcile ticks a spec item once its spec is done or superseded and no run sidecar (in the root or the spec's lane worktree) is live.

| Subcommand | Effect |
|---|---|
| `next` (default) | Reconciles and fills in memory, then prints the first ready item as above; `--json` adds `paste` |
| `list` | Pending items as `n  id  age  type  text`: `id` is `—` for a filled item, `age` is `Nd` or `?`, the type column is the emoji and word (🏃 run, 📝 plan, 🧪 prototype, 🔧 fix, 📌 decide; blank for a plain note), the text is `brief NN (name)`, the spec path or the item's words (a bound fix reads `<spec> — <payload>`). The tail, never cut: `  🔨 in progress` (a spec `implementing`, a brief holding one, or a fix item whose live lane is `dispatched` or `sent-back`), `  ⏳ gate met` or `  ⏳ after <target> (<state>)`, `  📎 cites done <stem>`, `  ⌛ stale`, then `  ✔ specs done — /spec:queue done NN` (`  ✔ specs done, N step(s) open — /spec:queue done NN` while the brief's `## Steps outside specs` lists an open box; `  ⛔ superseded — …`). Footer `— N done · move: /spec:queue move <ref> <n> · full text: /spec:queue show <ref>`; empty `✨ nothing pending · N done`. `--json` is `{items, done}`, each item gaining `type`, `ref` (its `qN`, else the brief number, else the spec path) and `inProgress` |
| `add <payload> [--top] [--type plan\|prototype\|fix\|decide] [--after <NN\|roadmap path\|spec path>]` | Refuses a spec path with no file (`no such spec file`), a brief that is already open, stored or filled, however spelled (`brief 03 is already queued at position 1 — /spec:queue move 03 <n> to reorder it`), an exact duplicate (same kind, type, spec and payload; near-duplicates are `groom`'s), and `--type`/`--after` with no value (`needs a value`, exit 2). An ad-hoc spec that is only filled is stored where asked. A prose payload is typed `plan`; a payload starting `/spec:fix `, `/spec:plan ` or `/spec:prototype ` is stored bare with that type (a prefix that disagrees with `--type` stays as text), and a fix whose text is `specs/….md — <words>` is stored bound to that spec; `--type` on a spec or brief item, or outside the four, exits 2. `--after` needs an existing `docs/roadmap/NN-*.md` or `specs/…md`, else exits 2 |
| `move <ref> <n>` / `done <ref>` / `show <ref>` | Reorder / tick by hand / print v7's `<id>  <kind>[ · done]`, the gate line, a blank line and the full text (`--json` prints the item). An unresolved or ambiguous ref, or `done`/`move` on a done id, exits 2 naming the remedy. Every subcommand refuses a flag it does not take before any read or write: `queue: <sub>: unknown flag <flag>` (exit 2; `add` takes `--json --top --type --after`, `groom` none, the rest `--json`, all `--root`) |
| `groom` | Read-only, v7's report byte for byte: buckets `duplicates` (Jaccard ≥ 0.35 between prompts; two path payloads pair only when identical), `cites done` (a prompt naming a done or superseded spec), `gate met` (an `after` gate that is met) and `stale` (an ungated prompt 14 days old), each row `id  Nd  text`, then the `fates:` footer; else `✨ nothing to groom · N pending`. The pending count includes open briefs and ad-hoc specs nobody queued. Takes no flag but `--root` (`queue: groom: unknown flag <flag>`, exit 2). The `/spec:queue` session checks each flagged item with a haiku agent, ticks hard evidence with a 📌 and asks about the rest |

The `/spec:queue` session follows v7's rules: a refusal's stderr is shown verbatim and then it stops; stdout is shown verbatim plus one sentence; it never edits the file and never works a row's position out by hand; a small fix lands in-session and another repo's work is never queued here.

Fanout's PLAN with no lane to pick prints `⏸️ nothing runnable — N open item(s)`, the `<spec> waits — <why>` lines, a `Held (not hardened, …)` line, then the queue rows exactly as `list` prints them (every open item once, its type and tail saying why it needs you), and `Next: nothing runnable — /spec:queue list`; a PLAN that picks lanes prints the same rows after its batch. `queue drained` is printed only when no item is open; an explicit-path run says `nothing runnable — N named spec(s) wait`. REPORT ends `nothing runnable — N open item(s) need you: /spec:queue list` when items are open and none is runnable, and its outcome opens `⚠️` instead of `✅` when a lane stopped, was held or was dismissed.

## 8. Shared vocabulary

| Term | Meaning to the user |
|---|---|
| lane | (a) The path a change travels: Direct, Behaviour (prototype) or Structural (spec). (b) One fan-out unit, a worktree sub-agent running one spec or fix |
| leg | One executed review check (gate, smoke, drift, ci, tests, literals, at-risk, slow). Named in findings and `[oracle: <leg>]` |
| pin | (a) An AC bullet using `SHALL CONTINUE TO`, whose test survives close. (b) A ruling from a prototype round, recorded as a sentence (`On <route>[, given …]: <note>`); behaviour pins become ACs ending `(pin pN)` and pin tests, look pins are checked at LOOK |
| mark | `--mark <verb>`: the session reporting a step done to a driver |
| soft | An advisory review finding. Recorded under Advisory debt, never dispositioned (hard findings `s<i>` are dispositioned) |
| escape row | Ledger row written by `/git:commit` when a fix touches lines a reviewed spec landed |
| seat | A model role (planner, workers, reviewer, disposer, research, lookups) with model and effort, overridable via `policy.models` |
| tier | `standard` or `critical`, decided by the files a spec touches. Critical requires literal examples and lock confirmation |
| 📌 Auto-picked … (veto anytime) | A derived decision, printed instead of asked |
| checkpoint | Line printed after a mark, meaning it is safe to `/clear` and re-run |
