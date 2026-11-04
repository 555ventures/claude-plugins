---
date: 2026-11-03
status: done
tier: standard           # per ADR-0039 D3 the tier is a property of files touched: the spec-status.js and grounding-contract.md rows are § Risk Tiers surfaces, so every AC carries a literal example; the spec as a whole is standard
area: fanout
breaking: false
depends_on: []
brief: n/a
open_markers: 0
diff_base: 15a0c61480e37b6a7c817471c055640e8bedb8b8
---

# Shared files land by rebase

## Goal

Shared files alone no longer serialize fan-out lanes. Today every briefless pair whose File Plans share one
path is held `waiting: File Plan overlap`, a spec touching a pipeline self-surface runs alone, and a critical
spec sharing a § Risk Tiers path ends the batch — in this repo every spec touches a central script, so five
hardened specs degrade to one lane at a time. After this spec the fan-out predicts nothing: every startable
spec is dispatched in parallel up to the four-lane cap, and the overlap is resolved where merge queues resolve
it — at landing. The MERGE step rebases the lane onto main and fast-forwards; a textual conflict sends the lane
back to its own worker to resolve by intent and return; the host gate runs on main after every landing as
today, and only a conflict the worker cannot resolve stops the lane. The only holds left are the ones a brief
declares: a shared brief and a `depends on` path. Done means: five hardened briefless specs that all name
`spec-status.js` and `fanout-driver.js` dispatch four lanes at once with the fifth planned and none waiting;
`spec-status.js` serializes nothing on File Plan overlap; `policy.fanout` and both batch boundaries are gone;
and a lane whose branch conflicts with a moved main is handed back to its worker with the rebase in progress.

## Users

- The maintainer draining a queue of ad-hoc specs: When five hardened specs are startable and every one touches the same central scripts, I want `/spec:fanout` to run four of them at once and settle the shared files when each lands, so I can get the batch done in one session instead of five serial ones. First run / empty: with no startable spec the bare run prints `no startable lanes — nothing to fan out`, as today.
- The lane worker whose branch no longer applies to main: When another lane landed first and my rebase stops on a conflict, I want the rebase left in progress in my own worktree with the conflicted files named and the gate to re-run, so I can resolve by intent with the spec in context and report MERGE_READY again. First run / empty: a lane whose branch applies cleanly is rebased and fast-forwarded without any message to its worker.
- The operator reading the report: When a lane needed a rebase round, I want the report to say so, so I can see where the shared files actually collided. First run / empty: a batch with no conflict reports exactly as today.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | No conflict prediction, of any kind. Parallelism between two startable specs is decided by git at landing, never by a File Plan comparison and never by a model judge: of the three shapes weighed — (a) always parallel, rebase plus gate at MERGE as the exact check; (b) a haiku/sonnet judge reading two specs' File Plans and Decisions; (c) parallel by default with the judge only ordering landings — (a) is locked because it deletes every prediction rule and adds no seat; (b) and (c) are rejected in Rationale. `[asked: the user's criterion, relayed 2026-11-03 — "prefer the option that deletes the most rules"; a judge was weighed and declined]` (AC-20261103-15-1, AC-20261103-15-6) | A judge is a second, inexact derivation of what `git rebase` answers exactly; prior art (GitHub merge queue, Zuul, GitLab merge trains, bors) builds in parallel and resolves at landing. |
| D2 | `spec/scripts/spec-status.js` `pairSerialReason(a, b)`: both briefed → `briefSerialReason(a.brief, b.brief)` unchanged; any other pair → `null` (parallel), whatever the File Plans share and whether either has File Plan rows. `exemptSet` and its cache are deleted; `shownFiles` stays (the 🔶 heads-up still reports raw overlap between admitted lanes, unchanged). `laneAdmission` is unchanged in code — its clash branch now fires only for briefed pairs. The `🤷 no brief — parallelism unknown` branch of `--all`'s `reasonOf` is deleted (no entry can reach it: a briefless runner-up is `parallel: true`). `--next --json` entry keys and `--lanes --json` top-level and `lanes[]` keys are unchanged; a briefless spec reaches `serialized` only behind a `depends on` or `shared brief` reason it carries itself. (AC-20261103-15-1, AC-20261103-15-2, AC-20261103-15-3, AC-20261103-15-4, AC-20261103-15-5) | The file's own comment says File Plan overlap can predict a collision but must not decide parallelism; the one derivation keeps the brief rules and drops the file rule. |
| D3 | `spec/scripts/fanout-driver.js` `deriveBatch`: the self-surface boundary (`touches pipeline self-surface <path>` / `self-surface runs alone`) and the critical boundary (`critical: shares Risk Tiers path <f> with <stem>`) are deleted with `riskTierPaths`, `readSpec` and every import only they used (`globMatch`, `parseFilePlan`, `extractSection`, `fmValue`, `readPipelineRules`; an import another function still uses stays). The walk keeps exactly two boundaries: an unblocked entry `--lanes --json` serializes with `brief <N> depends on <M>` → `blocked: <that reason>`, and the trailing boundary (a queue item, a blocked entry or a non-run action heads the queue), both with today's reasons. `tableMember` and `rolling()` are unchanged: a `shared brief` member is still tabled `waiting` and promoted after its sibling lands. The critical boundary goes with the self-surface one because no strong reason survives: the host gate runs on main after every landing, a conflict on a § Risk Tiers file is resolved by the lane's worker with the spec in context, and serial order gave the second spec's build the first's change no earlier than the rebase does. (AC-20261103-15-6, AC-20261103-15-7, AC-20261103-15-8) | On this host the lanes run the installed plugin, so a lane editing the driver never changes the driver running the lanes; the self-surface rule was the single biggest serializer and protected nothing. |
| D4 | MERGE lands the lane. On a bare run at MERGE, after today's dirty-root refusal, the driver takes the first merge-ready lane `l` (under a red main, the repair lane) and runs `bash <merge-back.sh> merge --root <root> --target <git symbolic-ref --short HEAD of the root> --source <l.branch> --strategy rebase-ff --worktree <l.worktree>` (a lane with no recorded worktree exits 2 naming `--mark returned --lane <id>`). Exit 0 → the step prints `## Step: merge <id>`, merge-back's own note line (`rebased <branch> onto <target> and fast-forwarded`), `git worktree unlock <wt>`, then for a run lane `run from <mainRoot>: node "$(spec-paths review-driver)" <wt>/<spec> — its MERGE step finds <branch> already landed; mark merge-strategy rebase-ff (promotion and cleanup)` and for a fix lane nothing more (the `/git:merge <branch>` line is gone), then `then: <driver> --mark merged --lane <id>`. Any exit other than 0 or 3 → exit 2 with merge-back's output and `fix the cause, then re-run the driver bare`. A mark that reaches MERGE runs no git: it prints `## Step: merge <id>` and `Then: <driver bare> — lands <branch> (rebase onto <target>, fast-forward)`. `--mark merged`, `doMerged`, `runGate`, MERGE_RED and `tickGateRed` are unchanged: the gate still runs on main once per landing. (AC-20261103-15-9, AC-20261103-15-10, AC-20261103-15-14) | Merge-queue shape: rebuild on the new main, land by fast-forward, test the landed main; `merge-back.sh rebase-ff` already does the rebase and the ff and leaves a conflict in the lane's own worktree, and the review driver's already-landed arm finishes promotion and cleanup. |
| D5 | Exit 3 → the lane goes back to its worker. The driver sets `l.state = 'conflicted'`, `l.conflicts = <paths with status U in git -C <wt> status --porcelain, sorted>`, `l.rebases = (l.rebases \|\| 0) + 1`, `l.rebaseHead = <root HEAD sha>`, saves, and prints `## Step: send <id> back to rebase` with one `SendMessage {to: "<l.agent>", message: "<the Contracts text>"}` and `Then: <driver> --mark resumed --lane <id>`. `deriveState`: a `conflicted` lane → `REBASE`, ranked after RELAY and before MERGE (under a red main, only the repair lane: `repairLane(st, 'conflicted')` → `REBASE` before the merge-ready check); `--state` prints it; a bare run on a REBASE state re-prints the same step and changes nothing. `--mark resumed` accepts `pending` or `conflicted` and sets `dispatched` (`question` and `conflicts` cleared). `ACTIVE` gains `conflicted` (it holds a cap slot and keeps WAIT listing it). The rebase is left in progress in the worktree on purpose — the worker continues it. (AC-20261103-15-11, AC-20261103-15-12) | The parent session resolving on main would dirty the main root mid-batch and judge a conflict without the spec in context; the worker has both. |
| D6 | One repair round per main. On exit 3 with `l.rebaseHead === <root HEAD sha>` (the lane came back conflicting against the same main), the driver runs `git -C <wt> rebase --abort`, sets `l.state = 'stopped'`, `l.stoppedReason = rebase conflict unresolved twice on <sha7> — resume by hand: cd <wt> && git rebase <target>`, runs `rolling(st)`, saves and prints the next step. A main that moved since the last round is a new round. The REPORT bullet for a merged lane with `l.rebases > 0` reads `<spec>: merged (gate <colour>, rebased ×<n>)`; a stopped lane reports its reason as today, and the next bare run after `--mark reported` lists its worktree as parked. (AC-20261103-15-13) | A lane that cannot land after one honest round is the serial case: its worktree stays, the others land, and a person finishes it — no third mechanism. |
| D7 | `policy.fanout` is deleted: `spec/scripts/lib/host-config.js` loses `POLICY_DEFAULTS.fanout`, the `fanout` arm of `mergePolicy` (the returned object has no `fanout` key) and the `fanout` arm of `validatePolicy` (a host block carrying `fanout` reports `unknown key fanout`, the generic finding — advisory, nothing refuses the host). `spec/templates/grounding-contract.md` loses the `fanout` object of its policy example, the `fanout.selfSurfaces and fanout.overlapExempt arrays of non-empty glob strings` sentence and the two `fanout.selfSurfaces → …` / `fanout.overlapExempt → …` lines — the one contract edit — and this repo's `.claude/spec.config.json` `contractHash` is restamped to `spec-paths contract-hash` of the edited file in the same change, re-derived (never hand-merged) after any rebase. (AC-20261103-15-15, AC-20261103-15-16, AC-20261103-15-17) | A policy key no reader consults is the dead code the user named; the contract must not promise globs nothing reads. |
| D8 | `spec/commands/fanout.md`: the bare-run sentence of § Input drops `stopping before a spec that touches a pipeline self-surface (policy.fanout.selfSurfaces), a critical spec sharing a § Risk Tiers file with an unmerged lane,` and keeps `a dependency the batch cannot meet, or a planning item`; § Rules replaces `Two briefless specs that share only policy.fanout.overlapExempt paths run in parallel.` with `Lanes run in parallel whatever their File Plans share; the MERGE step rebases the lane onto main and fast-forwards it, a conflict sends the lane back to its worker to resolve by intent (the rebase stays in progress in its worktree) and it lands on the next pass, and a second conflict against the same main stops the lane for a person.`, and the `Workers never land on main` bullet gains `the driver's MERGE step runs merge-back's rebase-ff itself`. `[no-ac: wording — read by review]` | The command doc is the operator's manual; it must describe the landing it now performs. |
| D9 | `spec/.claude-plugin/plugin.json` is bumped via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` naming parallel lanes over shared files, the rebase-ff landing with the send-back on conflict, the deleted batch boundaries and the deleted policy fanout block (self-surface globs and the exempt list, named in words — never the retired identifiers); `no dependency change`. `[no-ac: plugin-bump.js --check in the gate is the oracle]` | Pipeline rules § Planning version-bump discipline; the changelog is prose, so it must not trip the literals oracle. |
| D10 | Spec 14 is amended, not contradicted — `specs/20261103/14-the-fan-out-has-two-modes.md` is a File Plan row here: its frontmatter `depends_on` gains this spec's path (so it builds on this post-image); D2's `derives the batch with deriveBatch exactly as today` becomes `with deriveBatch as spec 15 leaves it (a brief-dependency boundary and the trailing queue-item boundary; no self-surface or critical boundary)`; D4's `a self-surface pick after another member, a critical pick sharing a § Risk Tiers path with an earlier member, and a pick whose brief depends on a member's brief each end the batch with today's reason` becomes `a pick whose brief depends on a member's brief ends the batch with today's reason`; the `08-s` option in D3's prose, the Contracts block and AC-14-4 reads `specs/20261102/08-s.md — brief 35; in the derived batch`; the Behavior table rows `x, s` and `x, c` become `L1 03-x planned, L2 08-s planned` / `L1 03-x planned, L2 08-c planned` with `stopBefore null`; AC-14-7's `selfSurface` and `critical` examples follow those rows (no `⏭` line, `stopBefore null`); AC-14-15's text becomes `stop before a blocked entry and a planning item with today's reasons and table a shared-brief member waiting (e.g. opt selfSurface → L1 03-x planned, L2 06-y waiting, L3 04-z planned, L4 08-s planned, stopBefore null)`, its pointer unchanged. Everything else in 14 stands. `[no-ac: spec-doc amendment — read by review]` | 14 locked the boundaries as worked examples, not as its goal; amending the examples before its build costs one edit, re-hosting its pins after would cost a build. |
| D11 | Untouched neighbours: `--override-serial`, `--batch`, `--spec`, `--include-fixes`, `--ask` and the PLAN-side `options`/`ask` keys stay exactly as they are — spec 14 D1/D2 owns their removal; `spec/scripts/merge-back.sh` is not edited (`rebase-ff` and its exit alphabet already exist); `spec/scripts/spec-review-driver.js` is not edited (its `handleMergeStrategy` already-landed arm, `rev-list --count <target>..<source>` = 0, finishes promotion and cleanup after the fan-out's fast-forward); spec 11's and spec 12's files are not touched; the parked-worktree note and q32/q33 stay as they are. `[no-ac: scope boundary — no code changes]` | Two specs deleting one flag two ways collide at build; the critical scripts stay critical by not being touched. |
| D12 | Tests are re-hosted, never weakened: `tests/spec-status.test.js` AC-20261103-06-2 becomes the negative pin (an overlapping briefless pair is parallel), AC-20261103-06-3's no-File-Plan case flips to `parallel: true`, AC-20261103-06-4's `10-c` becomes a third lane, AC-20260909-08-1's `🤷` assertion becomes `no parallelism-unknown line and 05-adhoc listed under the ⚡ lanes`; `tests/queue/queue-overlay.test.js` AC-20261103-06-5 keeps its subject (one shared branch line for a run of identical reasons) over three briefed siblings of the top pick's brief (`⛓️ shared brief 02`); `tests/host-config/policy-block.test.js` AC-20261103-06-7 becomes the unknown-key pin; `tests/host-config/contract-keys.test.js` drops its `selfSurfaces`/`overlapExempt` loop; in `tests/fanout/fanout-driver.test.js` AC-20261103-06-9 tables `08-s` as `L4 planned` with `the whole queue`, AC-20261103-06-10 and AC-20261103-06-11 are deleted (their subject is gone — tagged `[retired: specs/20261103/15-shared-files-land-by-rebase.md]` in spec 06), AC-20261103-06-18 uses opt `dependent` (`batch stopped before 07-d — blocked: brief 34 depends on 32`), AC-20261102-03-15's MERGE assertions follow D4's print, `SELF_REASON`/`SELF_SURFACE` constants go with their last use; `tests/fanout/fixture.js` gains opt `overlap: n` (n hardened `brief: n/a` specs `20-o01…20-o0n` whose File Plan names `spec/scripts/spec-status.js` and `spec/scripts/fanout-driver.js`) and `h.moveMain(file, text)` (one commit on main in the root), keeps `selfSurface`/`critical`/`dependent` (spec 14 reads them) and `mergeLane` (merging an already-landed branch is a no-op and the cleanup still applies). `[no-ac: test-maintenance rows; each file is named in the File Plan with the pins it re-hosts]` | A test that pinned a boundary dies with the boundary; one that pinned the batch keeps the batch. |
| D13 | Scope widened at build: `tests/status/status-diet.test.js` enters the File Plan; the pin is updated in place, never weakened. [auto: out-of-plan-triage — its source names no File Plan path] [no-ac: the gate line is the oracle] | The file's risk decides, never the spec's tier. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/spec-status.js | MODIFY | scripts | D2: `pairSerialReason` briefless → `null`, `exemptSet` deleted, the `🤷` branch deleted, header comment; no dependency change |
| spec/scripts/fanout-driver.js | MODIFY | scripts | D3 boundaries and imports deleted; D4 MERGE lands via merge-back rebase-ff; D5 `conflicted`/REBASE/`--mark resumed`; D6 cap and REPORT suffix; header (usage, exit codes name the merge-back refusal); no dependency change |
| spec/scripts/lib/host-config.js | MODIFY | scripts | D7: `POLICY_DEFAULTS.fanout`, the `mergePolicy` and `validatePolicy` fanout arms deleted; no dependency change |
| spec/templates/grounding-contract.md | MODIFY | doctrine | D7: the policy fanout example object and its three sentences deleted — the one contract edit |
| .claude/spec.config.json | MODIFY | other | D7: `contractHash` restamped over the edited contract |
| spec/commands/fanout.md | MODIFY | doctrine | D8: § Input bare-run sentence, § Rules landing bullet, workers-never-land bullet |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | `node scripts/plugin-bump.js --bump --plugin spec --changelog "…"` (D9); no dependency change |
| specs/20261103/14-the-fan-out-has-two-modes.md | MODIFY | other | D10: `depends_on`, D2/D3/D4 clauses, Contracts block, Behavior rows, AC-14-4/-7/-15 examples |
| specs/20261103/06-the-fan-out-drains-the-queue.md | MODIFY | other | D12: AC-20261103-06-10 and AC-20261103-06-11 tagged `[retired: specs/20261103/15-shared-files-land-by-rebase.md]` |
| tests/fanout/fixture.js | MODIFY | tests | D12: opt `overlap: n`, `h.moveMain` |
| tests/fanout/fanout-driver.test.js | MODIFY | tests | AC-20261103-15-6, AC-20261103-15-7, AC-20261103-15-8, AC-20261103-15-9, AC-20261103-15-10, AC-20261103-15-11, AC-20261103-15-12, AC-20261103-15-13, AC-20261103-15-14, AC-20261103-15-18; D12 re-hosts and deletions |
| tests/spec-status.test.js | MODIFY | tests | AC-20261103-15-1, AC-20261103-15-2, AC-20261103-15-3, AC-20261103-15-4 |
| tests/queue/queue-overlay.test.js | MODIFY | tests | AC-20261103-15-5 |
| tests/host-config/policy-block.test.js | MODIFY | tests | AC-20261103-15-15 |
| tests/host-config/contract-keys.test.js | MODIFY | tests | AC-20261103-15-17 (pin reuse; the title gains the AC-ID); D12 loop deletion |
| tests/status/status-diet.test.js | MODIFY | tests | gate line — updated in place, never weakened [auto: out-of-plan-triage] |

## Contracts

`fanout-driver.js` states after this spec: `PLAN, DISPATCH, RELAY, REBASE, MERGE, MERGE_RED, WAIT, REPORT`. Lane states:
`planned, waiting, dispatched, pending, conflicted, merge-ready, merged, done, stopped`. Marks are unchanged.

Lane keys this spec adds to `<git-common-dir>/spec-fanout.json` (absent until first set):

```json
{ "id": "L1", "state": "conflicted", "conflicts": ["x.txt"], "rebases": 1, "rebaseHead": "<40-hex sha of the root HEAD at the conflict>" }
```

The REBASE step, byte for byte (`<gate>` is the string `runGate` resolves for the lane, or `the host gate, by hand` when it resolves none; `<again>` is `` run `/spec:run <spec>` again and report its MERGE_READY line verbatim `` for a run lane and `report MERGE_READY` for a fix lane):

```
[fanout-driver] state: REBASE  root: <root>
## Step: send L1 back to rebase
SendMessage {to: "lane-one", message: "Lane L1: main moved and spec/03-x conflicts with it in x.txt — a rebase is in progress in your worktree. Resolve each conflicted file by intent (never a mechanical pick), `git add` it and `git rebase --continue` until the rebase ends; then run the gate `<gate>` and repair what it reds; then <again> — or STOPPED with the reason when the conflict cannot be resolved by intent."}
Then: node <driver> --root <root> --mark resumed --lane L1
```

The MERGE step on a bare run after a clean landing:

```
[fanout-driver] state: MERGE  root: <root>
## Step: merge L1
rebased spec/03-x onto main and fast-forwarded
git worktree unlock <wt>
run from <mainRoot>: node "$(spec-paths review-driver)" <wt>/specs/20261102/03-x.md — its MERGE step finds spec/03-x already landed; mark merge-strategy rebase-ff (promotion and cleanup)
then: node <driver> --root <root> --mark merged --lane L1
```

The MERGE step reached by a mark:

```
## Step: merge L1
Then: node <driver> --root <root> — lands spec/03-x (rebase onto main, fast-forward)
```

`spec-status.js` `pairSerialReason(a, b)`: `string` (serial, briefed pairs only) | `null` (parallel). `--next --json` and
`--lanes --json` shapes are unchanged.

`host-config.js` `policy(root)` keys: `models`, `stops`, the booleans, enums and `riskTiers` — no `fanout`.

## Data Model

`<git-common-dir>/spec-fanout.json` (transient per run, deleted at `--mark reported`): lane keys `conflicts`,
`rebases`, `rebaseHead` and the lane state `conflicted` are added; nothing is removed.
changes: additive-only
existing rows: unaffected

## Behavior

**PLAN.** Unchanged in shape. With opt `overlap: 5` (five briefless hardened specs over the same two scripts)
the bare run prints `📌 Auto-picked batch: 20-o01, 20-o02, 20-o03, 20-o04, 20-o05 — the whole queue (veto: …)`
and tables `L1…L5` all `planned`; `--mark planned` prints `## Step: dispatch 4 lanes` (`L1`–`L4`), `L5` stays
`planned` and is dispatched by the first bare run after a landing.

**Landing queue.** Lanes return merge-ready in any order; the driver lands them one at a time in table order.
For each: rebase onto main → fast-forward → (the review driver's promotion/cleanup for a run lane) →
`--mark merged` → the host gate on main. Red main → MERGE_RED and the repair lane, as today.

| main since the lane branched | `merge-back rebase-ff` | lane | printed step |
|---|---|---|---|
| unchanged, or moved on other files | exit 0 | merge-ready → merged at the mark | `## Step: merge L1` with the landed note |
| moved on a file the lane also changed, textual conflict | exit 3 | `conflicted`, `rebases 1` | `## Step: send L1 back to rebase` |
| the worker resolved and returned MERGE_READY | exit 0 | merge-ready → merged | `## Step: merge L1`; REPORT says `rebased ×1` |
| the worker returned MERGE_READY with the conflict unresolved against the same main | exit 3 again | `stopped`, rebase aborted | the next step; REPORT names the reason |
| the worker returned STOPPED | — | `stopped` | as today |

Control specified three ways (pipeline rules § Planning) for the send-back: SUCCESS — the next bare run after the
worker's return prints `## Step: merge L1` and the REPORT bullet carries `rebased ×1`; PATH BACK — the worker
reports STOPPED (or the operator runs `--mark returned --lane L1 --stopped "<reason>"`) and the lane is stopped
with its worktree parked, nothing landed; farthest ARTIFACT — the lane branch in its own worktree, until the
fast-forward lands it on main. Rendered by `fanout-driver.js` `printRebase`, posted by the session as one
`SendMessage`.

**Review checks (reviewer-run):** `git grep -nE "selfSurfaces|overlapExempt|riskTierPaths|exemptSet|parallelism unknown|File Plan overlap:|touches pipeline self-surface|shares Risk Tiers path" -- . ':!specs/**' ':!.claude/spec-runs*' ':!spec/.claude-plugin/plugin.json' ':!docs/canonical/**'`
must print nothing; `docs/canonical/` is rewritten from § Canonical Delta.

## Acceptance Criteria

- **AC-20261103-15-1**: WHEN `--next --json` ranks a briefless runner-up whose File Plan shares paths with a briefless top pick THE SYSTEM SHALL mark it parallel with no reason, whatever `policy` says (e.g. the AC-06-2 fixture — `01-a` and `02-b` sharing `src/a.js, src/shared.js, lib/x.js, lib/y.js, .claude/rules/pipe.md` — → `n[1].parallel === true`, `n[1].parallel_reason === null`; with `policy: { fanout: { overlapExempt: ['lib/**'] } }` written, the same)
  → rewrites tests/spec-status.test.js :: AC-20261103-06-2:
- **AC-20261103-15-2**: WHEN a briefless runner-up has no File Plan rows beside a briefed top pick THE SYSTEM SHALL mark it parallel too (e.g. the AC-06-3 fixture → `by['specs/20260710/06-bare.md'].parallel === true` and `by['specs/20260710/05-adhoc.md'].parallel === true`)
  → rewrites tests/spec-status.test.js :: AC-20261103-06-3:
- **AC-20261103-15-3**: WHEN `--lanes --json` runs over three briefless specs of which the third shares `src/shared.js` with the second THE SYSTEM SHALL admit all three as lanes with the frozen key sets (e.g. the AC-06-4 fixture → `out.lanes.map(l => l.path)` is `['specs/20261102/08-a.md', 'specs/20261102/09-b.md', 'specs/20261102/10-c.md']`, `out.serialized` is `[]`, `Object.keys(out).sort()` is `['born', 'fixes', 'lanes', 'serialized']`, `Object.keys(out.lanes[0]).sort()` is `['action', 'branch', 'brief', 'note', 'path', 'status', 'worktree']`, and the bare render still prints a `🔶` line naming `README.md`)
  → rewrites tests/spec-status.test.js :: AC-20261103-06-4 / AC-20261103-08-8:
- **AC-20261103-15-4**: WHEN `--all` renders a briefless runner-up THE SYSTEM SHALL list it under the `⚡` lanes and print no parallelism-unknown branch (e.g. the AC-20260909-08-1 fixture → stdout matches `/⚡ \d+ parallel lanes[\s\S]*\/spec:run @specs\/20260710\/05-adhoc\.md/` and contains no `🤷`; `02-billing-b` still sinks under `🕓 after that:` with `⛓️ shared brief 02`)
  → rewrites tests/spec-status.test.js :: AC-20260909-08-1: default
- **AC-20261103-15-5**: WHEN `--all` meets a run of consecutive after-that entries with one reason THE SYSTEM SHALL CONTINUE TO print that reason on one shared branch line (e.g. a top pick on brief 02 and three hardened siblings `02-b`, `03-c`, `04-d` on brief 02 → exactly one line containing `⛓️ shared brief 02`)
  → reuses tests/queue/queue-overlay.test.js :: --all collapses a run of identical after-that reasons
- **AC-20261103-15-6**: WHEN a bare run plans over five hardened briefless specs whose File Plans all name `spec/scripts/spec-status.js` and `spec/scripts/fanout-driver.js` THE SYSTEM SHALL table all five planned, dispatch four and hold none waiting (e.g. opt `overlap: 5` → lanes `[['L1', '20-o01', 'planned'], …, ['L5', '20-o05', 'planned']]` by stem, `batch.stopBefore === null`, `--lanes --json`'s `serialized` is `[]`; `--mark planned` → stdout contains `## Step: dispatch 4 lanes`, names `20-o01`…`20-o04` and not `20-o05`; `h.lane('L5').state === 'planned'`; after `L1` lands the next bare run dispatches `L5`)
  → writes tests/fanout/fanout-driver.test.js
- **AC-20261103-15-7**: WHEN the derived batch meets a spec whose File Plan names the driver, or a critical spec sharing a § Risk Tiers path with a member THE SYSTEM SHALL table it like any other (e.g. opt `selfSurface` → lanes `[['L1', S03, 'planned'], ['L2', S06, 'waiting'], ['L3', S04, 'planned'], ['L4', S08S, 'planned']]`, `batch` is `{ members: [S03, S06, S04, S08S], stopBefore: null, by: 'derived' }`, stdout contains `📌 Auto-picked batch: 03-x, 06-y, 04-z, 08-s — the whole queue`; opt `critical` → `S08C` among the members and `stopBefore === null`)
  → rewrites tests/fanout/fanout-driver.test.js :: AC-20261103-06-9:
- **AC-20261103-15-8**: WHEN the derived batch meets a brief dependency, a blocked entry or a planning item THE SYSTEM SHALL CONTINUE TO end there with today's reason, and REPORT SHALL CONTINUE TO name it (e.g. opt `dependent` → `stopBefore` is `{ path: specs/20261102/07-d.md, reason: 'blocked: brief 34 depends on 32' }` and REPORT's warns include `batch stopped before 07-d — blocked: brief 34 depends on 32; the next bare run starts the next batch`; opt `blocked` → `{ path: S08K, reason: 'blocked: specs/20261102/03-x.md (hardened)' }`)
  → rewrites tests/fanout/fanout-driver.test.js :: AC-20261103-06-18:
- **AC-20261103-15-9**: WHEN a bare run reaches MERGE for a run lane whose branch applies cleanly to a main that moved THE SYSTEM SHALL rebase it onto main, fast-forward, and print the landing step (e.g. `mergeReadyHost()` then `h.moveMain('other.txt', 'o\n')` then `h.must([])` → stdout contains `## Step: merge L1`, `rebased spec/03-x onto main and fast-forwarded`, `git worktree unlock <wt>`, `node "$(spec-paths review-driver)" <wt>/specs/20261102/03-x.md — its MERGE step finds spec/03-x already landed; mark merge-strategy rebase-ff` and `--mark merged --lane L1`, never `strategy derived` nor `/git:merge`; `git merge-base --is-ancestor spec/03-x HEAD` exits 0; `git status --porcelain` in the root is empty; then `--mark merged --lane L1` → `h.lane('L1')` is `{ state: 'merged', gate: 'green' }` by those keys)
  → rewrites tests/fanout/fanout-driver.test.js :: AC-20261102-03-15:
- **AC-20261103-15-10**: WHEN a mark reaches MERGE THE SYSTEM SHALL print the merge step with the land-it line and run no git (e.g. `mergeReadyHost()`'s `--mark returned` output contains `## Step: merge L1` and `— lands spec/03-x (rebase onto main, fast-forward)`; `git merge-base --is-ancestor spec/03-x HEAD` exits 1 afterwards)
  → rewrites tests/fanout/fanout-driver.test.js :: AC-20261102-03-16: --mark
- **AC-20261103-15-18**: WHEN `--mark merged` is run on a lane the MERGE step has not landed THE SYSTEM SHALL CONTINUE TO refuse it naming the MERGE step (e.g. `mergeReadyHost()` then `--mark merged --lane L1` → exit 2, stderr `fanout-driver: lane L1 is not merged — run the MERGE step first`, `h.lane('L1').state === 'merge-ready'`)
  → rewrites tests/fanout/fanout-driver.test.js :: AC-20261102-03-16: --mark
- **AC-20261103-15-11**: WHEN a bare run reaches MERGE for a lane whose branch conflicts with the moved main THE SYSTEM SHALL leave the rebase in progress in the lane's worktree, record the conflict and print the send-back step (e.g. `mergeReadyHost()` then `h.moveMain('x.txt', 'main\n')` then `h.must([])` → stdout contains `## Step: send L1 back to rebase`, `SendMessage {to: "lane-one", message: "Lane L1: main moved and spec/03-x conflicts with it in x.txt`, `` run `/spec:run specs/20261102/03-x.md` again `` and `--mark resumed --lane L1`; `h.lane('L1')` has `state 'conflicted'`, `conflicts ['x.txt']`, `rebases 1`, `rebaseHead` equal to `git rev-parse HEAD`; `git -C <wt> status --porcelain` contains `UU x.txt`; the root's `git status --porcelain` is empty; `--state` → `REBASE`; a second bare run leaves the state file byte-identical and prints the same step)
  → writes tests/fanout/fanout-driver.test.js
- **AC-20261103-15-12**: WHEN the worker resolves the rebase and returns THE SYSTEM SHALL land the lane on the next bare run and say it was rebased (e.g. after AC-15-11's state: `--mark resumed --lane L1` → `state 'dispatched'`, `conflicts` absent or `null`; the test writes `x.txt` as `both\n` in the worktree, `git -C <wt> add x.txt`, `GIT_EDITOR=true git -C <wt> rebase --continue`; `--mark returned --lane L1` → `merge-ready`; `h.must([])` → `## Step: merge L1` and `git merge-base --is-ancestor spec/03-x HEAD` exits 0; `h.mergeLane('03-x')` then `--mark merged --lane L1` then REPORT's bullets include `specs/20261102/03-x.md: merged (gate green, rebased ×1)`)
  → writes tests/fanout/fanout-driver.test.js
- **AC-20261103-15-13**: WHEN a lane returns MERGE_READY with its conflict unresolved against the same main THE SYSTEM SHALL abort the rebase and stop the lane naming the hand remedy (e.g. after AC-15-11's state: `--mark resumed`, then `git -C <wt> rebase --abort` by the test and `--mark returned --lane L1` → `merge-ready`; `h.must([])` → `h.lane('L1').state === 'stopped'`, `stoppedReason` matches `/^rebase conflict unresolved twice on [0-9a-f]{7} — resume by hand: cd .* && git rebase main$/`, `git -C <wt> status --porcelain` is empty and `git -C <wt> log --oneline -1` still names the lane's commit; the run reaches REPORT with that bullet)
  → writes tests/fanout/fanout-driver.test.js
- **AC-20261103-15-14**: WHEN a bare run reaches MERGE for a merge-ready fix lane THE SYSTEM SHALL land it the same way and print only the merged mark after the landing note (e.g. opt `fixes`, `--include-fixes` planned, `F1` dispatched, `h.startFixLane('q107')` with one commit and `--mark returned --lane F1` → `merge-ready`; `h.must([])` → stdout contains `## Step: merge F1`, `rebased fix/q107 onto main and fast-forwarded`, `--mark merged --lane F1`, and neither `/git:merge` nor `review-driver`)
  → writes tests/fanout/fanout-driver.test.js
- **AC-20261103-15-15**: WHEN `policy(root)` is read or `validatePolicy` meets a `fanout` block THE SYSTEM SHALL carry no fanout key and report the block as unknown (e.g. `'fanout' in policy(root) === false`; `validatePolicy({ fanout: { selfSurfaces: [] } })` → `['unknown key fanout']`; `policy(root).stops.repairRound === 'repair'` still)
  → rewrites tests/host-config/policy-block.test.js :: AC-20261103-06-7:
- **AC-20261103-15-16** `[oracle: literals]`: WHEN the File Plan's non-tests files are read THE SYSTEM SHALL carry none of the retired code names `riskTierPaths` and `exemptSet`; the six retired policy keys and printed reasons (the self-surface glob key, the exempt-list key, the parallelism-unknown branch, the File-Plan-overlap reason, the self-surface reason and the Risk-Tiers-sharing reason) are checked by the Review checks grep above, over live surfaces only, because spec 06 — a File Plan row for its retire tags — keeps them as its history
- **AC-20261103-15-17**: WHEN `spec/templates/grounding-contract.md` is edited THE SYSTEM SHALL CONTINUE TO carry a `contractHash` in `.claude/spec.config.json` equal to `spec-paths contract-hash` of the edited file (e.g. `JSON.parse(read('.claude/spec.config.json')).contractHash === runBash('bin/spec-paths', ['contract-hash']).stdout.trim()` after D7's edit and restamp)
  → reuses tests/host-config/contract-keys.test.js :: AC-20261103-04-2

## Assumptions (escalation triggers)

- A1: `merge-back.sh merge --strategy rebase-ff --worktree <wt>` exits 0 after rebasing and fast-forwarding a clean lane, exits 3 on a conflict leaving the rebase in progress in the worktree (`UU <file>` in its porcelain status, the root clean), lands on a re-run after the worker's `git rebase --continue`, and `git -C <wt> rebase --abort` restores the branch tip with a clean worktree — executed at plan time (S1, git 2.47.3, scratch repo with a linked worktree: `exit 0 … ancestor: 0 … root dirty lines: 0`; `CONFLICT (content): Merge conflict in f … exit 3 … UU f … rebase in progress: yes … root dirty lines: 0`; after `rebase --continue`: `rebased spec/03-x onto main and fast-forwarded exit 0`; `abort exit 0; wt dirty: 0; branch tip kept`). — **if false:** D4 names the failing exit in its refusal and the build stops at the first MERGE test; the mechanics move to a driver-side `git -C <wt> rebase` with the same contract, never into merge-back.sh.
- A2: `SendMessage` to a lane's completed background agent continues it with its context, exactly as RELAY's answer resume relies on today. — **if false:** the session re-dispatches the lane with its original worker prompt plus the REBASE step's message; the driver's print is unchanged.
- A3: A lane whose review closed carries no `spec-wave-open` marker (`syncWaveMarker` removes it on every non-dispatching state print), so the worker's `git add`/`git rebase --continue` pass `block-worker-git.sh`. — **if false:** the hook's stderr names `node <build-driver> <spec>` as the remedy and the REBASE message gains that line.
- A4: The review driver's `handleMergeStrategy`, run from the main root after the fan-out's fast-forward, finds `rev-list --count <target>..<source>` = 0 and resumes at promotion/cleanup (grounded by reading the arm at plan time). — **if false:** `--mark merge-strategy rebase-ff` re-runs merge-back's rebase-ff, which is a no-op rebase plus an `Already up to date` fast-forward, exit 0, then finishes the same way.
- A5: A spec with `brief: n/a` reads as `brief: null` in `--next --json` (today's `adhoc` fixtures in `tests/spec-status.test.js`); spec 10 may change the parse — **if false:** opt `overlap` writes whatever frontmatter spec 10 defines for an ad-hoc spec; the assertion set is unchanged.
- A6: Rows this spec shares with specs 10, 12, 13 and 14 (`spec-status.js`, `fanout-driver.js`, `grounding-contract.md`, `.claude/spec.config.json`, the fanout tests) land by this spec's own rule — rebase at MERGE; the contract hash is re-derived after the rebase, never hand-merged. — **if false (a conflict the lane cannot resolve):** D6's stop; the lane is finished by hand after the others land.
- A7: `lib/glob-match.js`, `lib/file-plan.js`, `lib/spec-sections.js` and `lib/frontmatter.js` keep callers outside the driver (`spec-status.js`, the build and review drivers), so dropping the driver's imports deletes no library. — **if false:** the import is dropped and the library stays (libraries are not entry points); nothing else changes.
- A8: The tests citing a retired boundary are exactly AC-20261103-06-9, -06-10, -06-11, -06-18 and 14's `--batch all` case (owned by spec 14's re-host); a prediction — **if false:** any further hit is re-hosted in the same batch under D12's rule, never weakened.

## Rationale

**Prior art.** Every merge queue builds in parallel and resolves overlap at landing, not by predicting it.
GitHub's merge queue creates a temporary branch per queued PR combining the base with every PR ahead of it,
runs CI on that, and merges first-in first-out; a failed check or an unresolvable conflict removes that PR and
the queue rebuilds the rest without it
(docs.github.com/…/managing-a-merge-queue). Zuul's dependent pipeline "assumes that all jobs will succeed and
tests them in parallel accordingly"; "if one fails, then changes that were expecting it to succeed are
re-tested without the failed change" (zuul-ci.org/docs/zuul/latest/gating.html). GitLab merge trains test
each MR "against the combined changes of every merge request ahead of it in the queue"; a conflict drops the
MR from the train and the author rebases and re-adds it (docs.gitlab.com/ci/pipelines/merge_trains). bors-ng
batches approved PRs onto a staging branch, bisects a failing batch, and "when a batch cannot be bisected
(because it only contains one PR), it gets kicked back to the creator" (github.com/bors-ng/bors-ng). None of
them reads a plan to decide who may run; all of them hand a conflict back to its author. This spec is that
model with the fan-out's existing parts: the worktree is the temporary branch, `merge-back.sh rebase-ff` is
the rebuild-on-new-main, `--mark merged`'s gate on main is the post-landing check, MERGE_RED is the removal
of a failing landing, and the send-back is "kicked back to the creator".

**The three options.** (a) always parallel, git plus gate at MERGE as the exact check; (b) a cheap model judge
over two specs' File Plans and Decisions; (c) parallel by default with the judge ordering landings or flagging
risk. (b) was declined because a judge is inexact where git is exact, costs one agent call per pair (ten for
five lanes, every batch), and would re-create the serialization the user complains of whenever it says
"collides" — a prediction is only useful if it blocks, and blocking is the defect. (c) was declined because
landing order is already the table order and a non-blocking flag is the 🔶 heads-up `spec-status` already
prints. (a) deletes two deriveBatch boundaries, the overlap verdict, the exempt set, two policy keys and three
contract sentences, and adds one state and one step. The REPORT's `rebased ×n` count is the measurement:
if conflict rounds turn out frequent, a landing-order hint is the next spec, never a gate.

**Why the critical boundary goes too.** The user allowed it to stay for a strong reason; none was found.
Serial order gave the second critical spec's build the first's landed change, which the rebase also gives,
one step later; the gate on main after every landing is the same check in both orders; and a conflict on a
§ Risk Tiers file is resolved by the lane's worker with its spec in context, the same hands that wrote the
change the review judged. Keeping it would have kept the batch at one lane for 10 and 11 in this very queue.

**Why the worker resolves, not the parent.** The review driver's CONFLICTS state resolves on main from the
parent session — a dirty main root blocks every other landing, and the parent judges a conflict without the
spec. `rebase-ff` already leaves the conflict in the lane's own worktree, which is exactly where the worker and
its spec are. `--mark resumed` and `SendMessage` are RELAY's existing resume path, reused. The rebase stays in
progress on purpose: aborting and asking the worker to redo it would reproduce the same conflict a second
time for nothing.

**Why the gate stays after landing.** A pre-landing gate in the worktree would be a second suite run per
landing (the user's standing complaint); MERGE_RED and the repair lane already handle a green-alone,
red-together landing. Spec 12's post-merge gate cache, when it lands, makes the fast-forwarded main tree a
cache hit of the lane's own review run — this spec neither depends on it nor duplicates it.

**Why one round.** A second conflict against an unchanged main means the worker returned without resolving;
a third message would be the same message. The stop names the hand command and parks the worktree, and the
other lanes land meanwhile — that is the serial fallback, with no new mechanism.

**Spec 14.** It locked the boundaries as worked examples (D2 "exactly as today", D4, AC-14-7, AC-14-15). This
spec lands first (14's `depends_on` gains it) and amends those examples in place (D10); 14's two modes, its
argv deletions and its fix group are untouched. Spec 11's D8 reasoned about serialization between 10 and 11
on `spec-status.js`; under this spec that is a merge-time rebase, not a hold, and 11 needs no change.

**Fragile.** The fixture's `landLane`/`mergeLane` helpers simulate the review driver's merge with a plain
`git merge`; after a bare run has already fast-forwarded the branch that merge is a no-op and the helpers'
cleanup still applies — a test that asserts "not merged" right after a bare run at MERGE is now wrong by
design (AC-15-10 pins the mark-reached print instead). Collision-closure at lock (literals
`selfSurfaces`, `overlapExempt`, `self-surface`, `File Plan overlap`, `parallelism unknown`,
`strategy derived`, `exemptSet`): every literals hit is a File Plan row except four recorded waives —
`docs/canonical/pipeline.md` and `docs/canonical/status.md` are rewritten by the review stage from
§ Canonical Delta; `docs/roadmap/32-one-session-runs-the-lanes.md` and `docs/roadmap/33-every-question-is-a-driver-stop.md`
name `File Plan overlap` as history in Out-of-scope prose (roadmap briefs are never a live surface); and
`tests/host-config/policy-block.test.js`'s `strategy derived` is the `mergeStrategy` enum's default, untouched
here. Of the paths leg's `executes` hits outside the File Plan, `tests/status/status-diet.test.js` is the only
one reading a parallelism word, and it pins the absence of a retired footer — unaffected.

2026-11-04, review 1 fix: AC-20261103-15-16's literals oracle scans every non-tests File Plan row,
and spec 06 is one (its retire tags) that keeps six of the retired words as history, so the AC as
locked could never go green. The oracle keeps the two code names no spec doc spells; the six policy
keys and reasons are covered by the Review checks grep, which already leaves `specs/**` out, and the
review-1 reviewer ran that grep over the live surfaces with zero hits.

Build deviations, folded at close (each already a class in pipeline rules § Gotchas, so no new entry):
AC-15-11/12/13 use a conflict host whose base already holds `x.txt`, because an add/add conflict shows
`AA`, never the `UU x.txt` the AC pins, and AC-15-13 checks the aborted worktree with
`--untracked-files=no` since the fixture's review sidecar is untracked; AC-20261103-10-8, AC-20261103-10-17,
AC-20261102-03-17, AC-20261102-03-21 and the `--next makes no parallel claim` test were re-hosted to D2/D4
(path order `[03-x, 04-z, 06-y]`, a briefed fixture for the shared-brief hold, `cleanup: false` /
`mergeLane` so the landing finds or clears the worktree), and contract-keys drops its `"fanout"` object
match with D7; at RED_FINDINGS AC-15-5's pointer verb was amended `rewrites` → `reuses` (a CONTINUE-TO
criterion) and AC-15-9's assertions were folded into the 03-15 case its pointer names; at REPAIR the
lock-time closure's "unaffected" call on `tests/status/status-diet.test.js` proved wrong and it entered
scope as D13, its fixture moved onto a shared brief so the solo branch stays pinned.

### Advisory debt (review rv_044ec6bc2788)
- a0 /home/jj/projects/claude-plugins/.claude/worktrees/agent-ac2dacd5a85444ad4/specs/20261103/15-shared-files-land-by-rebase.md:151 — The § Behavior Review-checks grep does not exclude `tests/**`, yet AC-20261103-15-1 and AC-20261103-15-15 require fixtures that spell `overlapExempt` and `selfSurfaces`; run as written it prints three lines. The review-1 fix re-routed the six policy keys/reasons from the oracle onto this grep ('over live surfaces only'), so the spec's only remaining check for them is one whose literal instruction cannot be satisfied. Add `':!tests/**'` (or word the check as live-surface-only) so the check matches the ACs that sanction those fixtures.
- a1 /home/jj/projects/claude-plugins/.claude/worktrees/agent-ac2dacd5a85444ad4/spec/scripts/fanout-driver.js:412 — D4 says a mark that reaches MERGE 'runs no git', but printMerge evaluates `targetBranch()` (`git symbolic-ref --short HEAD`) before the `!apply` branch, so the mark path does run one read-only git command to print `<target>`. Harmless but the Decision wording and the code disagree.

## Canonical Delta

`docs/canonical/status.md`, the `--lanes --json` paragraph: replace from `Parallelism between two entries is one
derivation` to `The 🔶 heads-up keeps reporting raw overlap.` with `Parallelism between two entries is one derivation,
`pairSerialReason`: briefed pairs by brief (shared brief, dependency path); every other pair is parallel — File
Plan overlap decides nothing, the 🔶 heads-up reports it and the fan-out's MERGE step resolves it by rebase.
(specs/20261103/15-shared-files-land-by-rebase.md)`.

`docs/canonical/pipeline.md`, the fan-out paragraphs: replace `serialized merge through the review driver's MERGE
step with the gate re-run on main after each.` with `one landing at a time: the fan-out's MERGE step rebases the
lane onto main and fast-forwards it (merge-back's rebase-ff), the review driver's MERGE step finds the landed branch
and finishes promotion and cleanup, and the gate re-runs on main after each; a rebase conflict hands the lane
back to its worker with the rebase in progress in its worktree, and a second conflict against the same main
stops the lane for a person (specs/20261103/15-shared-files-land-by-rebase.md).`; replace `up to the first
self-surface spec per `policy.fanout.selfSurfaces`, critical spec sharing a § Risk Tiers file with an
unmerged lane, blocked entry or planning item` with `up to the first brief dependency, blocked entry or planning
item — shared files hold nothing back`.
