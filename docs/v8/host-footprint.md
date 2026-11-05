# v1–v7 host footprint: what `/spec:migrate` finds and does with it

Sources: the plugin at `/home/jj/projects/claude-plugins` (main, `spec@7.268.0`), read without changes. That repo is also a host of the plugin, so the counts below come from its own tree. Target layout: `docs/v8/design.md` § State on disk (`.claude/spec/{config,queue,questions}.json`, `.claude/spec/runs/<spec-id>.json`).

Verdicts:
- **KEEP**: leave the file as it is.
- **CONVERT**: rewrite it into the v8 shape.
- **ARCHIVE**: move it to `.claude/spec/archive/v7/` or a git tag, and take it out of the working tree.
- **DELETE**: remove it.
- **LEAVE**: v8 ignores the file and does not touch it.

---

## 1. Config and rules

### 1.1 `.claude/spec.config.json`

- Writer: `init-gen.js generate`, the sole writer. `/spec:enforce` stamps `enforcementManifest` and `rulesEnforcementHash`; `/spec:connect` (`walkthrough-connect.js`) writes `walkthrough`.
- Readers: every script, through `spec/scripts/lib/host-config.js` (`readConfig` / `readConfigStrict` / `policy()`). `spec-state-gate.sh` and `smoke.sh` also read it directly.
- Contract: `spec/templates/grounding-contract.md` § Required config keys.

| Key | Readers (main) | Example (plugin's own file) | v8 |
|---|---|---|---|
| `generatedBy` | state-gate, doctor | `"spec@7.268.0"` | DROP (no version stamp) |
| `contractHash` | state-gate (drift warn), doctor | `"4561fc4fc5a6"` | DROP |
| `trunk` | review driver, merge-back, fanout | `"main"` | CONVERT → `config.trunk` |
| `gateCommand` (`{testDirs}`/`{scopeDirs}`/`{testFiles}`) | build driver, review-legs | `node --test … {testFiles}` | CONVERT → `config.testCommand` (the v8 gate is the host test command). Keep the scoped form only if v8 scopes. |
| `testCommand` (optional `{file}`) | review-legs, red-check, at-risk, release | `node --test … --test-reporter=spec` | CONVERT → `config.testCommand` |
| `postGateCommand` | build driver | `"{testCommand}"` | DROP. If set, fold it into testCommand with `&&`. |
| `setupCommand` | init, worktree setup | `"npm install"` | CONVERT → `config.setupCommand` (lane worktree bootstrap) |
| `testNameFilter` | red-check | `"--test-name-pattern={name}"` | DROP |
| `slowTestCommand` | review close, release | absent | DROP. Name it in the migrate report. |
| `testEnv[]` `{var,provision}` | env-preflight | absent | DROP. Report it. |
| `testCaseScanner` | expire-tests | absent | DROP (no test expiry in v8) |
| `fileShapes` | glob-match, file-shapes | absent | DROP |
| `orchestratorOnly` | build driver | absent | DROP |
| `patternsScript` | build driver, settings allow | `"scripts/spec-patterns.sh"` | DROP the key. LEAVE the host script. |
| `layerGroups`, `agentMap`, `routing` | build driver (waves), init | `agentMap.tests:"plugin-tests"` | DROP (one builder per spec) |
| `pipelineRules` | host-config `readPipelineRules`, plan, review | `.claude/rules/spec-pipeline.md` | DROP (see 1.2) |
| `runtime` `{bootCommand,readyCheck,seedCommand,…}` or `{inert}` | smoke.sh, prototype, release | `{"inert":"marketplace of CLI plugins…"}` | CONVERT → `config.runtime` only if boot/ready are present. Drop `inert`. |
| `capabilities` `{forge,failCountPattern,skipReportPattern,testCountPattern,ciPoll}` | ci-query, review-legs, release | `forge:"github"`, `testCountPattern:"ℹ tests (\\d+)"` | CONVERT `forge` → `config.forge`. Drop the rest. |
| `policy` (`worktreePerSpec`, `directLaneToMain`, `mergeStrategy`, `testExpiry`, `closeSuite`, `ledgerCommitted`, `reviewService`, `models.{workers,reviewer,disposer,lanes}`, `riskTiers`, `stops.*`, `fanout.{selfSurfaces,overlapExempt}`) | `host-config.js` POLICY_DEFAULTS / `policy()`, pending-question `stopPolicy` | `{"closeSuite":"always"}` | CONVERT `models.*` → `config.seats` only if they differ from the v8 defaults. Fold `mergeStrategy` into the merge choice. Drop everything else. |
| `design` `{kit,tokens,rules,app}` | mocks, enforce, genesis | absent | CONVERT as-is → `config.design` (mocks and prototype keep it) |
| `prototype` `{url,bootCommand,overlay,e2eFile,e2eList,e2eRun,picture,dbCreate,dbDestroy}` | prototype-driver, build REPLAY | absent | KEEP the block verbatim → `config.prototype` |
| `walkthrough` `{baseUrl,project,tokenEnv}` | mocks-driver, walkthrough.js | absent | KEEP verbatim → `config.walkthrough` |
| `pictures` `{command,dir,widths}` | pictures.js | absent | KEEP verbatim only if the v8 prototype uses it. Otherwise DROP. |
| `release` `{deployCommand,stagingUrl,e2eCommand,promoteCommand,rollbackCommand,productionUrl,healthPath,migrationsCheck}` | release-legs | absent | KEEP verbatim → `config.release` |
| `enforcementManifest`, `rulesEnforcementHash` | doctor, enforce | `.claude/rules/enforcement.json`, `f333e8050707` | KEEP the path. DROP the hash. |
| `genesisStackDescriptor` | init | absent | DROP the key. Leave the descriptor file (§4). |
| `driftScript`, `base`, `typecheckCommand`, `pipelineOwnedPaths` | doctor, review-legs (`config.typecheckCommand` 4 reads) | absent | DROP. Fold typecheck into testCommand if it is set. |

**Migrate action:** write `.claude/spec/config.json` from the CONVERT/KEEP rows, then delete `.claude/spec.config.json`. Print every dropped key that had a non-default value.

### 1.2 Rules, agents, skills, settings

| Path | Writer | Readers | Shape | v8 |
|---|---|---|---|---|
| `.claude/rules/spec-pipeline.md` | `init-gen.js generate`, from profile fields under the `grounding-contract.md` § Required pipeline-rules sections | plan, build, review (Read explicitly); ambient load via `paths: ["specs/**", ".claude/**"]` | Seven required `##` sections: Risk Tiers · Planning · Build · Worker Rules · Test Rules · Review Checks · Gotchas (evidence-cited). The plugin's own copy is 598 lines. | ARCHIVE, then DELETE. Before deleting, migrate extracts `## Gotchas` and the `## Risk Tiers` bullets into an `architecture:`-trigger hint in config, or a short host `CLAUDE.md` note. This is host knowledge, not doctrine. |
| `.claude/rules/conventions/<kind>.md` | init-gen | ambient (`paths:` globs) | Per-layer convention bullets | KEEP. These are ordinary Claude Code rules and still useful. |
| `.claude/rules/enforcement.json` (+ baseline files at `entries[].baseline.path`) | `/spec:enforce` | doctor, gate wiring | One entry per `<ws>:<stack>:<category>` | KEEP. The enforcers live in the host gate. |
| `.claude/rules/design.md` | genesis / design brief | mocks, enforce | Intent→pattern and naming tables | KEEP |
| `.claude/agents/<name>.md` | init-gen (persona + byte-identical Worker Contract block + tests addendum) | build driver via `agentMap`. Frontmatter is `model: sonnet`, `permissionMode: acceptEdits`, `memory: project`. | Plugin examples: `gate-scripts.md`, `doctrine-author.md`, `plugin-tests.md` | DELETE only files whose body carries the `## Worker Contract (spec pipeline)` block (generated). Leave any others. |
| `.claude/agent-memory/<agent>/*.md` | the agents (`memory: project`); `memory-sweep.js` prunes | the agents | 48 tracked files, 224K here | LEAVE. Archive if the agent was deleted. |
| `.claude/skills/run/SKILL.md`, `.claude/skills/spec-verify/SKILL.md` | init-gen | interactive sessions | Generated skills with `allowed-tools` | KEEP. These are host-useful; v8 does not regenerate them. |
| `.claude/spec-manifest.json` | init-gen | `manifest-check.sh`, doctor | `{checks:[{claim,kind:file\|exec\|smoke\|remote\|inert,target}]}` | DELETE |
| `.claude/settings.json` `permissions` | init-gen `mergeSettings`, merge-preserving | Claude Code | allow `Bash(<gate/test/setup/patterns/boot base>:*)`; deny `Bash(rm -rf:*)`, `Read(.env*)` | KEEP. These are the user's entries now, so never remove them. Optionally add v8's allow lines. |
| `.claude/settings.local.json` `env.<tokenEnv>` | `walkthrough-connect.js` (also appends `.gitignore` line) | walkthrough client | `{"env":{"WALKTHROUGH_TOKEN":"…"}}` | KEEP untouched. Never print the token. Note: this file is tracked in the plugin repo even though `.gitignore` lists it, so migrate should warn when `git ls-files` shows it. |
| `.claude/spec-session.json` | `spec-session-stamp.sh` hook (UserPromptSubmit), written to both the worktree and the main root | `lib/session-stamp.js` (ledger `model`/`sessionTokens`) | `{session_id,transcript_path,cwd,ts}` | DELETE. It is gitignored. |
| `.claude/spec-preimage/` | nothing in v7. Retired, last seen in `4817a9d2` (v7 stage 2). A `.gitignore` line remains. | none | — | DELETE if present. Drop the ignore line. |
| `.claude/release-manifest.json` | `release-legs.js:165` | release | Per-release check manifest | ARCHIVE |
| `scripts/spec-patterns.sh` (path from `patternsScript`) | init-gen (harness) | build driver | Host pattern sweep | LEAVE. Report it as orphaned. |
| `.gitignore` lines | init-gen `IGNORE_ENTRIES` (`init-gen.js:120`) | git | `.claude/worktrees/`, `specs/**/*.review/`, `specs/**/*.build/`, `.claude/spec-session.json`. When `ledgerCommitted:false`, also `.claude/spec-runs.jsonl` and `.claude/spec-runs/`. Also seen: `.claude/spec-preimage/`, `.claude/spec-runs.stopped.jsonl`. | CONVERT. Keep `.claude/worktrees/`, add `.claude/spec/runs/`, remove the rest. |
| `.gitattributes` | init-gen `ensureGitattributes` | git | `.claude/spec-runs.jsonl merge=union` | DELETE the line |

---

## 2. Work records

### 2.1 Specs: `specs/YYYYMMDD/NN-slug.md`

- Writer: `/spec:plan` (draft and lock). The build driver stamps `diff_base`. `/git:enter-worktree` stamps `build_base`. The review driver writes `status: done`.
- Readers: `spec-state-gate.sh`, `spec-status.js`, both drivers, `lib/frontmatter.js`.
- Census: 60 date dirs, 299 specs.

| Field | Count / 299 | Values seen | v8 |
|---|---|---|---|
| `date` | 299 | `2026-11-03` | KEEP |
| `status` | 299 | **done 285, superseded 11, hardened 3**. The enum also allows `draft` and `implementing` (0 here). | CONVERT `hardened`→`locked`, `implementing`→`building`. Leave `draft` as-is. `done` and `superseded` stay terminal. |
| `tier` | 242 | standard 137, critical 105 (many carry a trailing `# reason` comment) | CONVERT `critical` → `architecture: true` only when it is on a pending spec. Drop it otherwise. |
| `risk` | 57 | T3 39, T2 18 (older specs) | DROP |
| `area` | 299 | free text | KEEP |
| `breaking` | 299 | bool + comment | KEEP (it feeds the "ask before behaviour change" rule) |
| `depends_on` | 299 | list of spec paths | KEEP |
| `depended_on_by` | 235 | list | DROP (derivable) |
| `brief` | 293 | `n/a` 194, `22a` 19, `22` 6, … | KEEP. This is the roadmap link. |
| `design` | 220 | `false` | DROP |
| `design_source` | 9 | path | KEEP when it is on a pending spec |
| `prototype` | template only | `<stem>` | KEEP |
| `open_markers` | 298 | `0` | DROP. v8 can grep `[NEEDS CLARIFICATION`. |
| `spiked` | 122 | date | DROP |
| `diff_base` | 259 | sha | DROP on done specs. On pending specs, copy it into the run state file. |
| `build_base` | 149 | branch | Same as `diff_base` |
| `superseded_by` / `supersedes` | 6 / 1 | free-form | KEEP |

Body sections (`spec/templates/spec.md`): Goal · Users · Decisions · File Plan · Contracts · UI · Data Model · Behavior · Acceptance Criteria · Assumptions · Rationale · Canonical Delta.

**Migrate:**
- Pending specs (`draft`, `hardened`, `implementing`; three here: `20261103/14`, `20261103/15`, `20261104/01`): KEEP in place with the status mapped. The body is unchanged, because v8 reads Goal, Decisions and Acceptance Criteria as the intent block.
- `done` and `superseded` specs (8.5M here): ARCHIVE. Either `git mv specs/ → specs/archive/` (preserves NN numbering for `spec-number-check`), or leave them in place and have v8 status ignore terminal statuses. **Recommend leaving them in place.** They are small, cited by ADRs, briefs and tests, and v8 status already filters on `status:`.

### 2.2 Sidecars

| Path | Writer | Contents | v8 |
|---|---|---|---|
| `specs/**/<stem>.build/` (gitignored) | `spec-build-driver.js` (`loadSidecar`/`saveSidecarLib`) | `build-state.json` marks: `testsAuthored, redAttributed, redCheck*, waves, integrated, gateRuns{exit,log,tree,cached}, repairs, capEverTripped, incidents, escalateChoice, decisionsAtLock, replayRuns, tokensAtStart, via`. Also `gate-*.log`, `gate-cap`, `red-check-*`, `reconcile.json`, `replay-state.json`, `replay-port.json`. | For a pending spec with a sidecar, CONVERT to `.claude/spec/runs/<id>.json` = `{stage:"building", base: build_base\|diff_base, branch, worktree}`. Discard the marks. Then DELETE the sidecar. |
| `specs/**/<stem>.review/` (gitignored) | `spec-review-driver.js` | `review-state.json` (`iteration, legsMode, reviewerReturnFile, dispositions{waived,rejected,fixDispatched,word}, runId, closeRunId, closed, judgedTree, mergeCtx, …`), `manifest-N.jsonl`, `legs-N/`, `reviewer-return-N.json`, `close-overlay.txt`. One stale example: `specs/20260823/01-release-legs.review/`. | A pending spec with an unclosed review → run state `{stage:"review"}`. DELETE every sidecar of a done spec. |
| `specs/**/<stem>.design/` | retired (init-gen comment, line 26) | — | DELETE if found |

### 2.3 Ledger and run records

`.claude/spec-runs.jsonl` (tracked, `merge=union`, 1020 rows / 620K here). Writers are listed by stage:

| `stage` | Rows here | Writer | Row keys |
|---|---|---|---|
| `plan` | 243 | session per `commands/plan.md` | `ts, spec, tier, brief, spikes, promiseSweep{rows,carried,sanctioned,orphans}, collisions{hits,waived}, acLint, decisionLint, verdict:"locked"` |
| `build` | 287 | `spec-build-driver.js` DONE | `ts, spec, tier, runId(rp_…), diff, gate, deviations, redCheck, workers, incidents, fastPath, retainer, tokens, sessionTokens, model, via:"loop"` |
| `review` | 388 | `spec-review-driver.js` / `review-legs.js` close | `ts, spec, tier, runId(rv_…), verdict, scope, iteration, diff, smoke, testsSkipped, legs, findings, gotchas, checkpoint, tests, verify, escalated, softSweep, tokens, model, via` |
| `escape` / `escape-class` | 45 / 3 | `escape-row.js` | `spec, file(s), reviewRunId, foundBy, severity, class, killedMatch, preventedBy, sha, supersededBy` |
| `replay` | 38 | review driver (escape replay) | `runId, reviewRunId, class, files, legs, outcome, tokens` |
| `fix` | 8 | `/git:commit` after `/spec:fix` | `ts, sha, files, reviewed, via:"spec-fix"` |
| `observe` | 8 | old CI observe | `spec, branch, ci, sha, url, runAt` |
| `release`, `prototype`, supersession | 0 here | `release-legs.js`, `prototype-driver.js` (tests-derived), `supersession-rows.js` | — |

Related run records:
- `.claude/spec-runs/` (tracked, 289 files / 1.9M): `rp_<12hex>.json[l]` (build), `rv_<12hex>.json[l]` (review), and `rp_*.manifests/replay-manifest-N.jsonl`. Each is a full per-run record: legs, observed counts, diff `{loc,base,head,dirty}`.
- `.claude/spec-runs.stopped.jsonl` (gitignored): `STOPPED_LEDGER`, `spec-review-driver.js:119`.
- Readers: `spec-status.js` (hygiene), doctor, queue `when:{type:"ledger",stage,min}` (`lib/queue.js:37`), `memory-sweep.js`, `supersession-rows.js`, `expire-tests.js`. `lib/run-cache.js` excludes these files from the cache tree.

**v8: ARCHIVE all three** (`git mv` → `.claude/spec/archive/v7/`, or a single `git rm` after tagging `v7-final`), then remove the `.gitattributes` line. Queue items with a `when.type:"ledger"` predicate lose their predicate. Convert them to plain prompt items and report them.

### 2.4 Queue, fan-out, questions, lane markers (all in the git dir, untracked)

| Path | Writer | Schema | v8 |
|---|---|---|---|
| `<git-common-dir>/spec-queue.json` | `spec-queue.js` (sole writer). `spec-status.js` reads it as an overlay. | `{version:1, seq:N, items:[…]}`. Item kinds: `{id:"qN", kind:"brief", brief:"33"}` · `{id, kind:"spec", spec:"specs/…md"}` · `{id, kind:"prompt", lane:"plan\|prototype\|fix\|decide", payload, added, after?:{spec\|brief}, when?:{type:brief\|spec-exists\|ledger,…}, batch?, origin?, stage?, trigger?, ticked?}`. 9 pending items here. | CONVERT → `.claude/spec/queue.json`, keeping order, `id`, `kind`, `lane`, `payload`, `after`, `spec`, `brief`. Drop `when.ledger`, `batch`, `origin`, `stage`, `trigger`. **Must survive.** |
| `<git-common-dir>/spec-queue-done.json` | spec-queue.js (archive on every write) | `{version:1, items:[…+archived:ts]}` | ARCHIVE (copy into the archive dir), then DELETE |
| `<git-common-dir>/spec-fanout.json` | `fanout-driver.js` (`STATE_FILE`, line 108) | Lane table: lanes with branch, worktree, state (planned→dispatched→returned→answered→merged→reported), batch id, `ask` overlay | Refuse to migrate while one is live: finish or abandon the fan-out first. Otherwise DELETE. |
| `<lane private git dir>/spec-delegated` | `pending-question.js mark` | Empty marker (2 present, under `.git/worktrees/agent-*/`) | DELETE |
| `<lane private git dir>/spec-lane-exit.json` | `pending-question.js recordLaneExit` | Lane exit record | DELETE |
| `<private git dir>/spec-wave-open` | build driver (line 1183). Read by the `block-worker-git.sh` hook. | Marker | DELETE. A stale one blocks git. |
| `<worktree>/.claude/pending-question.json` | `pending-question.js write`. Read by fanout-driver:618. | `{kind, id, question, options[…]}` | CONVERT any unanswered one → `.claude/spec/questions.json` |
| `<git-common-dir>/spec-run-cache/<sha256>.json` | `lib/run-cache.js record` | `{exit, observed{testsExecuted}}` keyed by cmd+tree | DELETE |
| `refs/spec-review/<runId>/{judged,close}` | review driver (line 830, best-effort) | Git refs pinning judged/close trees | DELETE (`git update-ref -d`) |

---

## 3. Docs

| Path | Writer | Readers | Format | v8 |
|---|---|---|---|---|
| `docs/adr/NNNN-slug.md` (40 here) | genesis, plan, session; template `spec/templates/adr.md` | plan, `ac-drift.js`, genesis-driver, prototype-driver | No YAML. The H1 is `# NNNN. Title`, followed by bullets `- Status:`, `- Date:`, `- Archetype: · Audience:`, `- Deciders:`, then the sections Context · Options considered · Decision · Consequences · Applies to (per-brief rows for amendment ADRs). Status values seen: accepted 38, proposed 1, `superseded by ADR-0030 (reason)` 1. Supersession is written in prose ("superseded by ADR-NNNN") in Status, and specs/briefs cite `ADR-NNNN Dn`. | KEEP as-is. **Must survive.** |
| `docs/roadmap/00-overview.md` | genesis / plan (template `roadmap-overview.md`) | humans, status | Intro, conventions, a `## Sequence` table `\| Brief \| Name \|` with italic notes (*superseded by v7*, *successor: …*). Status is never tracked by hand. | KEEP |
| `docs/roadmap/NN-slug.md` (38 briefs; ids like `10a`, `18b`, `22a`) | genesis / session (template `roadmap-brief.md`) | `spec-status.js`, `lib/brief.js`, `lib/queue.js`, plan | `# NN — Title`, then a header line `Phase: P0–P3 · Depends on: NN\|— · Primary workspaces: … · Risk: · Design stage: · Expected specs:` (plus `First light:` and `Journeys:` lines), then the sections Result · Current state · Scope · Out of scope (binding). Brief state is **derived**: specs stamped `brief: NN` and their statuses; a body blockquote `> Superseded by` marks it superseded. | KEEP as-is. v8 status must keep the brief↔`brief:` stamp derivation. A brief whose specs are all done is "delivered"; no file edits are needed. **Must survive.** |
| `docs/canonical/<area>.md` (15) | review close, which applies the spec's `## Canonical Delta` verbatim on CLEAN | plan (grounding) | Prose per area | KEEP as reference docs. v8 stops auto-applying deltas, and they will go stale. Recommend a note at the top of each. |
| `docs/design/brief.md`, `catalog.md`, `approval.json` | genesis DESIGN_BRIEF (`design-brief.md` template) | mocks, enforce | Design brief; `approval.json` is the retired provenance record (ADR-0030) | KEEP `brief.md`. DELETE `approval.json` (already non-gating). |
| `docs/spikes/<YYYYMMDD-slug>/` (3) | `/spec:plan` micro-spikes | humans | Notes and scripts. `*.png` is gitignored. | LEAVE |
| `docs/audit/`, `docs/handoff/` | this repo's own sessions, not the plugin | — | — | Not plugin footprint. LEAVE. |

---

## 4. Design stage

| Path | Writer | Readers | Schema | v8 |
|---|---|---|---|---|
| `design/mocks/status.json` | `mocks-driver.js` | mocks, genesis, plan | `{schemaVersion:3, state:"SEED\|SCREENS\|APPROVED", marks:{seedDone,approved, journeys…}, app?}`. Each journey approval stores a story hash (`lib/surfaces.js beatHash`). | KEEP. The v8 mocks reader accepts schemaVersion 3, and migrate leaves it untouched. |
| `design/mocks/seed.md` | copied from `templates/mocks-seed.md`, then authored | mocks-driver (`### <journey>` blocks, job-story first line, `@first-run`/`@empty` beats) | — | KEEP |
| `design/mocks/screens/` | session (json-render gray screens) | walkthrough round push | One file per screen | KEEP |
| `design/rounds/<n>/approvals.json`, `round.json` | `round pull` | mocks-driver | Service approvals | KEEP while mocks are not APPROVED. Otherwise ARCHIVE. |
| `design/mocks/ledger.md` | retired | none | — | DELETE |
| `design/prototypes/<stem>/` | `prototype-driver.js` (main tree) | prototype, plan (`prototype:` stamp), build REPLAY, review close | `status.json` (`marks{opened,roundDone,approved,contracted,testsDerived,closed}`, `appPort`), `pins.json`, `states.json`, `contract.json`, pictures (one per route × state), a copy of the derived e2e test | KEEP verbatim. **Must survive.** An unclosed prototype keeps its `proto/<stem>` branch and its `.claude/worktrees/proto-<stem>` worktree. |
| Host overlay file (`prototype.overlay`) and `prototype.e2eFile` (`{stem}`) | prototype-driver (copies `proto-overlay.js` and `proto-stable-id.js`) | host dev entry | — | LEAVE |
| `.claude/genesis/status.json` | `genesis-driver.js` | genesis-state-gate hook | `{schemaVersion:3, architect, design, archetype, localeScope, brief, stackDescriptorPath, gateCommand, marks, menus, scaffold, …}` | KEEP if genesis is in progress (`architect` or `design` ≠ done). Otherwise ARCHIVE. |
| `.claude/genesis/stack-descriptor.json`, `tournament/benchmark.md`, `finalists.json`, menus, `storybook-static/` | genesis | init, ADRs cite `benchmark.md` | — | KEEP the files ADRs cite. DELETE `storybook-static/` (build output). |
| `walkthrough` config block, plus `.claude/settings.local.json` token | `/spec:connect` | mocks | See §1 | KEEP |

---

## 5. Git level

| Item | Source | Pattern / example | v8 |
|---|---|---|---|
| Spec branch | `merge-back.sh create`, `/git:enter-worktree` | `spec/<NN-slug>`, worktree `.claude/worktrees/spec-<NN-slug>` (e.g. `spec-01-release-legs`) | KEEP the naming. Migrate refuses, or lists, an unmerged `spec/*` whose spec is `implementing` and maps it into the run state file. |
| Plan branch | plan delegated to a worktree agent | `plan/<slug>` (e.g. `plan/fanout-two-modes`) | LEAVE. List any unmerged ones. |
| Fix branch | fanout fix lanes | `fix/q<N>` (e.g. `fix/q29`, `fix/q31`) | LEAVE. List them. |
| Prototype branch | prototype-driver | `proto/<stem>`, worktree `.claude/worktrees/proto-<stem>` | KEEP. **Must survive.** |
| Harness worktrees | Agent `isolation:worktree` | `.claude/worktrees/agent-<hex>`, branch `worktree-agent-<hex>` (7 live and 23 branches here) | LEAVE. Report the stale ones and offer `git worktree prune`. Never auto-delete unmerged work. |
| `.claude/worktrees/` | merge-back.sh (refuses if not ignored) | gitignored | KEEP |
| Commit conventions | drivers print, `/git:commit` writes | `build(spec): YYYYMMDD/NN — …`, `chore(spec): lock YYYYMMDD/NN`, `chore(spec): close YYYYMMDD/NN — canonical delta, deviations folded`, `chore(ledger): record YYYYMMDD/NN build and review rows`, `chore(ledger): record fix qN row`, `fix(spec): review round N fixes for …`, `Merge branch 'spec/…'`, and plugin bumps like `fix(spec): 6.76.1 — …`. About 55% of recent commits are `chore(spec)` or `chore(ledger)`. | DROP lock/close/ledger commits. v8 makes one commit per spec plus a merge. History is untouched. |
| Refs | review driver | `refs/spec-review/rv_*/{judged,close}` | DELETE (§2.4) |
| Tags | none plugin-written (only `atlas-html-final`, manual) | — | Migrate may add `spec-v7-final` before archiving, as the restore point. |

---

## 6. Recommended `/spec:migrate` order

1. **Preflight refusals:** a dirty main tree, a live `spec-fanout.json`, a `spec-wave-open` marker, or an unanswered `pending-question.json` that cannot be converted.
2. Tag `spec-v7-final`.
3. Write `.claude/spec/config.json` (§1.1). Convert the queue (§2.4) and the pending questions.
4. For each pending spec, map its status (§2.1). If it has a sidecar or a `spec/*` branch, write `.claude/spec/runs/<id>.json`.
5. Archive the ledger, run records and queue-done file. Delete the sidecars, session stamp, run cache, git-dir markers, refs, manifest, generated agents and pipeline rules (after extracting Gotchas and Risk Tiers).
6. Rewrite the `.gitignore` and `.gitattributes` lines.
7. Leave ADRs, roadmap, canonical docs, conventions rules, enforcement, skills, settings, design/ and prototypes untouched.
8. Print a report: every dropped non-default key, every unmerged branch or worktree, and every queue item that lost a predicate.
