---
date: 2026-11-03
status: hardened
tier: critical           # spec/templates/grounding-contract.md loses its `/spec:fanout --ask <key>` sentence (§ Risk Tiers: hash-stamped into every host) — one edit, contractHash restamped
area: fanout
breaking: true           # the user-facing flags --batch, --include-fixes, --override-serial, --ask and positional spec paths are refused after this lands (D1, asked: q39)
depends_on: [specs/20261103/06-the-fan-out-drains-the-queue.md, specs/20261103/08-queue-items-remember-their-origin.md, specs/20261103/09-an-executed-repro-answers-the-reject.md]
brief: n/a
open_markers: 0
---

# The fan-out has two modes

## Goal

`/spec:fanout` gets exactly two modes and nothing else. A bare run is AUTO: the derived batch in queue order,
every pending queued fix and red-CI row tabled as the serial fix group, one `📌` batch line, no question.
`/spec:fanout --pick` is SELF-PICK: one checkbox round (AskUserQuestion, `multiSelect`, at most four options per
question and four questions per call, so at most sixteen candidates) whose picks are routed through the same
boundary validation AUTO uses — self-surface, shared critical files, unmet dependencies, shared-brief holds —
never a bypass. The user-facing `--batch`, `--include-fixes`, `--override-serial`, `--ask`, `--lanes` and
positional spec paths are removed together with every line of code, state, fixture, test and prose that only
they reached. Done means: the driver accepts `--pick` and the marks and refuses every other flag with one usage
line; a grep for each removed flag and field finds nothing outside the plugin changelog; and the change deletes
more lines than it adds.

## Users

- The operator running the queue: When I have hardened specs queued and want them built, I want to type
  `/spec:fanout` and see the batch start, so I can stop reading veto flags and answering a question whose answer
  the queue already holds. First run / empty: with no startable spec and no pending fix the driver prints
  `no startable lanes — nothing to fan out` and writes nothing.
- The operator who wants a say: When the derived batch is not the batch I want today, I want
  `/spec:fanout --pick` to show me every startable spec as a checkbox list in plain words, so I can tick the
  ones to run and still be protected by the same boundary rules the automatic batch obeys. First run / empty:
  with one startable spec the driver tables it with a `📌` line instead of asking; with none it behaves as the
  bare run.
- A lane worker's driver: When a predictable stop is reached in a lane, I want the answer to come from the
  host's `policy.stops` alone, so I can never be surprised by a per-run overlay nobody can see from the host
  config. First run / empty: a host with no `policy` block reads the contract defaults.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `spec/scripts/fanout-driver.js` argv: `VALUE_FLAGS = ['--root', '--mark', '--lane', '--agent', '--stopped', '--id', '--label']`, `BOOL_FLAGS = ['--pick', '--state']`; `--label` is collected into `arg.labels` (an array; `--mark answered` takes exactly one and refuses more). Every other argument — `--batch`, `--include-fixes`, `--override-serial`, `--ask`, `--lanes`, `--spec`, a bare path — exits 2 with `unknown argument <a> — usage: fanout-driver.js [--root <dir>] [--pick] | --mark <m> [flags] | --state` and writes no state. `ASK_KEYS`, `arg.specs`, `arg.ask`, the `--spec`/`--batch`/`--ask` parse branches, the `--spec and --batch both pick the batch` refusal and the `--batch <id> matches no startable spec` refusal are deleted. No pipeline caller prints any removed flag: `spec-status --next` prints no `/spec:fanout` line at all and no command, agent, template or `git/` doc names them (grounded by grep at plan time, A2). `[breaking: a shell history or wrapper that passes --batch, --include-fixes, --override-serial, --ask or a spec path to the driver exits 2 with the usage line instead of planning] [asked: queue item q39 — the user asked for exactly two modes and the removal of these flags]` (AC-20261103-14-1) | The user asked for two modes; a flag kept "just in case" is the third mode. |
| D2 | AUTO (a bare run with no state file): `plan()` derives the batch with `deriveBatch` exactly as today, tables the members through `tableRun`, then **always** appends the fix group — every `--lanes --json` `fixes` entry, queued items (`queue_id`) first then red-CI rows, as `F1…`, a gated item (`blocker !== null`) tabled `waiting` on its blocker — and writes `st = { version: 1, startedAt, admitted: false, batch: { members, stopBefore, by: 'derived' }, notes, queued: [], lanes, lastGate: null }`: no `options` key, no `ask` key. The `📌` line becomes `📌 Auto-picked batch: <stems> — <stops before <stem> (<reason>) \| the whole queue> (veto: /spec:fanout --pick)`. `rolling()`'s waiting-promotion predicate becomes `e && !e.worktree` (the `overrideSerial` clause is deleted); a `shared brief` hold is never overridden in either mode. `[asked: q39 — "queued and red-CI fixes always included as the serial fix group"]` (AC-20261103-14-2, AC-20261103-14-3) | The fix group was opt-in only because a flag existed to opt in; the queue already says the fixes are wanted. |
| D3 | SELF-PICK, step PICK: `--pick` with no state file (or an un-admitted one, which it replaces) computes the candidates — the `--next --json` entries with `action === '/spec:run'` and no `blockers`, minus any spec whose `spec/<stem>` branch lives in a linked worktree (its `⏸ … parked in <wt> — finish it there in-session` line prints instead), in queue order — and writes `st = { version: 1, startedAt, admitted: false, batch: null, pick: { candidates: [{ path, brief, label }], shown: N, startable: M }, notes, queued: [], lanes: [], lastGate: null }`. `shown = min(M, 16)`; the first 16 are the chunk. Label = the stem minus its `NN-` prefix with `-` → space (`06-the-fan-out-drains-the-queue` → `the fan-out drains the queue`; fixture `03-x` → `x`); two candidates with one label both use their full stem. The step prints `## Step: pick the batch`, then `Ask ONE AskUserQuestion:` and one `AskUserQuestion <json>` block of `ceil(shown / 4)` questions whose option counts differ by at most one (5 → 3 + 2; 6 → 3 + 3; 16 → 4 × 4), each `{ question: 'Which of these specs should this fan-out run? Tick any — group <i> of <g>.', header: 'Pick <i>/<g>', multiSelect: true, options: [{ label, description }] }` with `description` = `<path> — brief <NN or —>; <in the derived batch \| waits: <serialized reason> \| the derived batch stops here: <stopBefore.reason> \| after the derived boundary>` (the derived batch is computed once for these notes), then `Then: node <driver> --root <root> --mark picked --label "<label>" [--label "<label>"…]` and, when `startable > 16`, `<shown> of <startable> startable specs shown — the rest come after this run`, then `(to switch to the derived batch, delete <STATE_FILE> and run bare)`. A bare run on a PICK-state file re-prints the same step and changes nothing. With exactly one candidate no question is printed: the step tables it as the batch with `📌 Auto-picked the one startable spec <stem> — nothing else to choose (veto anytime)` and continues as D4's post-image; with none, the fix group alone is tabled under `📌 Auto-picked the fix group alone — no startable spec (veto anytime)`, or the bare run's `no startable lanes` line prints and no file is written. (AC-20261103-14-4, AC-20261103-14-5, AC-20261103-14-9, AC-20261103-14-10) | The tool caps a call at 4 × 4; plain-word labels come from the stem the user already reads in the queue; a question with one answer is a question with a safe default. |
| D4 | `--mark picked` (`MARKS` becomes `['planned', 'picked', 'dispatched', 'returned', 'answered', 'dismissed', 'resumed', 'merged', 'gate-repaired', 'reported']`) requires a PICK-state file (`st.pick && !st.batch`), at least one `--label`, and every label among `st.pick.candidates[].label` — else exit 2 (`nothing picked — tick at least one box, or delete <STATE_FILE> and run bare for the derived batch` / `label "<l>" matches no candidate — labels are: <labels>`) with the file unchanged. The picked entries, in candidate (queue) order whatever the label order, go through the **same** `deriveBatch(entries, startable, serialized)` AUTO runs (its first argument is the picked entries; its second the picked paths): a self-surface pick after another member, a critical pick sharing a § Risk Tiers path with an earlier member, and a pick whose brief depends on a member's brief each end the batch with today's reason; members are tabled through `tableRun`, so a shared-brief pick is tabled `waiting: shared brief NN`, never planned beside its sibling. Picks past the boundary are not tabled and print `⏭ left for a later run: <stems>`. The fix group is appended as in D2. `st.batch = { members, stopBefore, by: 'pick' }`, `st.pick.chosen = <labels>`; the PLAN step then prints with `✅ Picked batch: <stems> — <stops before <stem> (<reason>) \| the whole pick>` in the `📌` line's place and ends `Then: … --mark planned`. `--mark planned` on a PICK-state file exits 2 with `the batch is not picked yet — answer the pick question, then run --mark picked`. `[asked: q39 — "routed through the same boundary checks as auto, never a bypass"]` (AC-20261103-14-6, AC-20261103-14-7, AC-20261103-14-8) | One validation function, two callers: a pick can choose less than the queue, never more than the rules allow. |
| D5 | `deriveState`: no file → `PLAN`; `!st.admitted` → `PICK` when `st.pick && !st.batch`, else `PLAN`; the rest unchanged. `--state` prints `PICK` accordingly. `--pick` on an admitted table exits 2 with `a fan-out is already running — delete <STATE_FILE> to start over` (today's line); `main` replaces `planFlags` with `arg.pick`. (AC-20261103-14-8, AC-20261103-14-10) | PICK is a step like any other: re-derived from disk, /clear-safe. |
| D6 | `--ask` and its overlay go: `spec/scripts/pending-question.js` `stopPolicy(root)` returns `{ ...policy(root).stops }`; `readFanoutTable` is deleted; the header's overlay sentences are rewritten (one reader of `policy.stops`; `stop-policy` stays its query form); `isDelegated`'s own read of `spec-fanout.json` is untouched. `policyPick`, `stop-policy` and every caller in the build and review drivers are unchanged. A host that wants a stop asked sets that `stops` key to `ask` — the one mechanism. (AC-20261103-14-11) | Nothing but the fan-out wrote `ask`; with the flag gone the overlay is a reader of a key no writer sets. |
| D7 | `spec/templates/grounding-contract.md` § Policy: the sentence `Any `stops` key set to `ask` brings its question back; `/spec:fanout --ask <key>` brings it back for one fan-out.` becomes `Any `stops` key set to `ask` brings its question back.` — the one contract edit; this repo's `.claude/spec.config.json` `contractHash` is restamped to `spec-paths contract-hash` of the edited file in the same change. (AC-20261103-14-12, AC-20261103-14-13) | The contract must not promise a flag that no longer exists; the hash moves once so every host sees the staleness once. |
| D8 | Prose: `spec/commands/fanout.md` `argument-hint` becomes `"[--pick]"`; § Input becomes two bullets — the bare run (AUTO: derived batch in queue order, boundaries, the fix group always, one `📌` line, no question) and `--pick` (SELF-PICK: the checkbox round, up to four boxes per question and four questions, plain-word labels, one `--label` per ticked box on the printed mark, the same boundary validation, never a bypass); § Rules' never-line drops the `--ask <key>` parenthetical, and the fix bullet opens `the pending queued fixes and red-CI rows are tabled at PLAN as the fix group in both modes;`. `spec/doctrine/core.md` § Delegated Stops: `the fan-out's `--ask <key>` relays that stop for one run` becomes `a host that wants that stop asked sets the key to `ask``. `docs/roadmap/32-one-session-runs-the-lanes.md`'s Lane dispatch bullet names `/spec:fanout [--pick]`. `fanout-driver.js`'s header drops `--ask`, `--batch`, `--spec`, `the retired --lanes` and gains the PICK step and the `picked` mark. `[no-ac: wording — read by review]` | The command doc is the user's only manual; it must describe exactly the two modes. |
| D9 | Tests are re-hosted, never weakened — every retired flag's pin becomes the matching two-mode pin: `tests/fanout/fixture.js` `h.plan(args)` runs bare when `args` carries `--pick` or a state file exists, else `h.pick([S03, S04])`; new `h.pick(paths)` runs `--pick`, parses the printed block with `askBlocks`, takes the label of each option whose description starts with the path, runs `--mark picked` with those `--label`s and returns that result (the default pair keeps `L1 = 03-x`, `L2 = 04-z`); new opt `many: n` writes `n` hardened specs `20-m01…` each on its own brief; the fixture's comments name no retired flag. In `tests/fanout/fanout-driver.test.js`: the `--lanes` refusal pin probes `--batch all` and reads `--pick` in the usage line (AC-14-1); the `--include-fixes` pin becomes the bare-run fix-group pin (AC-14-2); the `--override-serial` pins (`AC-20261102-03-7: --override-serial admits`, `AC-20261102-03-21: --override-serial lets`) are deleted — their surviving clause, "never a spec whose brief depends on a running one", lives in AC-14-7; the `--spec` list pin becomes the pick-order pin (AC-14-7); `--batch all`/`<ids>` becomes the pick-all / unknown-label pin (AC-14-6, AC-14-7); `by: 'spec-flags'` becomes `by: 'pick'` (AC-14-8); the `--include-fixes` setups of AC-20261103-08-22 and AC-20261103-08-23 become bare runs; `fixMergedHost` marks `03-x`, `04-z`, `06-y` done before its bare run (the fix group alone); the `bornFix` host's pre-existing items are tabled at PLAN — `q108` waiting on `after specs/20261102/03-x.md (hardened)`, `q109`, `q110`, `q111` planned — so AC-20261103-06-15, AC-20261103-06-16, AC-20261103-08-9, AC-20261103-08-10, AC-20261103-08-11, AC-20261103-08-24 and AC-20261103-08-25 assert fix-lane sets that include them and `q108` joins at the landing that meets its gate by promotion (AC-14-3); `h.dispatchedPair`, `mergeReadyHost` and every `h.plan(['--spec', …])` caller use `h.pick`; the `AC-20261102-03-9 / AC-20261103-04-12 / AC-20261103-09-8` pin drops its `--ask bogus` clause (AC-14-1 owns the unknown-argument refusal) and its marks regex reads `marks are planned, picked, dispatched`; the reused tests named by AC-14-15 (`AC-20261103-06-9`) and AC-14-16 (`AC-20261103-08-22`) carry the new AC-ID in their titles after the resolving prefix, as does `AC-20261103-04-2` in `tests/host-config/contract-keys.test.js` for AC-14-13. `tests/delegated/pending-question.test.js`: the overlay clauses of `AC-20261103-04-3: stopPolicy`, `AC-20261103-09-9` and `stop-policy prints` flip to "the host value wins whatever the table says" (AC-14-11); `policyHost`'s third argument stays (it still seeds `isDelegated`'s table). `tests/consistency/prose-pins.test.js` `fanout.md` guard pins `--pick` in place of the three flags and drops the `--lanes` absence clause (an untagged standing guard for the protocol token); `tests/consistency/policy-readers.test.js` drops the two `fanout § Input must name --ask / list rejectWithEvidence` assertions. `[no-ac: test-maintenance rows; each file is named in the File Plan with the pins it re-hosts]` | A test that only pinned a flag dies with the flag; one that pinned behaviour keeps the behaviour under the new entry. |
| D10 | Net-negative diff, reviewer-run: `git diff --shortstat <build_base>..HEAD -- . ':!specs' ':!.claude'` must report more deletions than insertions (`15 files changed, 141 insertions(+), 35 deletions(-)` is the shape, S2); the build's Final gate and the reviewer both run it and a non-negative result is a hard finding, repaired by deleting dead code or duplicated test setup — never by dropping an AC. `[no-ac: reviewer-run shortstat — no manifest leg counts lines]` | The user's acceptance; cleanup that adds lines is not cleanup. |
| D11 | Removed-token sweep: the retired flags and fields are absent from every File Plan non-tests file through AC-14-14's `[oracle: literals]` stems (context-shaped so the plugin changelog prose never trips them), and the reviewer runs the repo-wide grep in § Behavior → Review checks, which must print nothing. `[no-ac: the literals oracle and the reviewer grep are the checks; see AC-20261103-14-14]` | "Finds nothing outside the changelog entry" is the user's acceptance, stated as a command. |
| D12 | `spec-fanout.json` keeps `version: 1`: the keys this spec drops (`options`, `ask`) were read only by code this spec deletes, the keys it adds (`pick`, `batch.by: 'pick'`) are read only by the driver that writes them, and the file dies at `--mark reported`; no reader keys on `version`. `[no-ac: no observable — an old-shape file mid-run is read without error because its readers are gone]` | A version bump with no reader is ceremony. |
| D13 | `spec/.claude-plugin/plugin.json` is bumped via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` naming the two modes, `--pick`, the always-on fix group, the removed flags (`--batch`, `--include-fixes`, `--override-serial`, `--ask`, `--lanes`, positional spec paths — bare or backticked, never single-quoted) and the retired `ask` overlay; `no dependency change`. `[no-ac: plugin-bump.js --check in the gate is the oracle]` | Pipeline rules § Planning version-bump discipline; the changelog is the one place the old names may live. |
| D14 | Out-of-scope neighbours, named and not touched: q33 (`inspectReturned` marks a `/spec:fix` lane `stopped — returned without a recognised stop` when its merge classification is missed) and q32 (lane worktrees cut from a stale base). Both stay queued as `/spec:fix` items; this spec changes neither `inspectReturned` nor the worker prompt's branch line. `[no-ac: scope note — the queue items q32 and q33 carry the work]` | The user asked that they stay out; naming them stops a worker from "fixing" them in passing. |
| D15 | Critical-tier lock confirm: `📌 Auto-picked lock — the planner seat was told to lock and commit; the only critical trigger is D7's one-sentence contract deletion with its hash restamp (veto anytime: flip status back to draft)`. `[no-ac: process ruling recorded for the cold reader]` | The parent session relays the user's standing instruction to lock; the critical confirm's safe default is the instruction itself. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/fanout-driver.js | MODIFY | scripts | D1 argv and usage line; D2 unconditional fix group, `options`/`ask` gone, `📌` veto text, `rolling` predicate; D3 PICK step (`candidates`, labels, chunking, block, notes); D4 `--mark picked` and the `--mark planned` guard; D5 `deriveState`/`main`; header per D8 |
| spec/scripts/pending-question.js | MODIFY | scripts | D6: `stopPolicy` = host stops, `readFanoutTable` deleted, header sentences on the overlay rewritten |
| spec/commands/fanout.md | MODIFY | doctrine | D8: `argument-hint "[--pick]"`, § Input two bullets, § Rules never-line and fix bullet |
| spec/doctrine/core.md | MODIFY | doctrine | D8: § Delegated Stops sentence |
| spec/templates/grounding-contract.md | MODIFY | doctrine | D7: § Policy drops the `/spec:fanout --ask <key>` clause — the one contract edit |
| .claude/spec.config.json | MODIFY | other | D7: `contractHash` restamped over the edited contract |
| docs/roadmap/32-one-session-runs-the-lanes.md | MODIFY | other | D8: Lane dispatch bullet names `/spec:fanout [--pick]` |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | `node scripts/plugin-bump.js --bump --plugin spec --changelog "…"` (D13); no dependency change |
| tests/fanout/fixture.js | MODIFY | tests | D9: `h.pick(paths)`, `h.plan` default via `h.pick`, opt `many`, comments without retired flags |
| tests/fanout/fanout-driver.test.js | MODIFY | tests | AC-20261103-14-1, AC-20261103-14-2, AC-20261103-14-3, AC-20261103-14-4, AC-20261103-14-5, AC-20261103-14-6, AC-20261103-14-7, AC-20261103-14-8, AC-20261103-14-9, AC-20261103-14-10, AC-20261103-14-15, AC-20261103-14-16; D9 re-hosts and deletions |
| tests/delegated/pending-question.test.js | MODIFY | tests | AC-20261103-14-11; D9 |
| tests/consistency/prose-pins.test.js | MODIFY | tests | D9: `fanout.md` guard pins `--pick` |
| tests/consistency/policy-readers.test.js | MODIFY | tests | D9: the two fanout `--ask` assertions dropped |
| tests/host-config/contract-keys.test.js | MODIFY | tests | AC-20261103-14-13 (pin reuse; the title gains the AC-ID) |

## Contracts

`fanout-driver.js` command line after this spec (the header's usage line, byte for byte):

```
fanout-driver.js [--root <dir>] [--pick] [--state]
fanout-driver.js --root <dir> --mark <planned|picked|dispatched|returned|answered|dismissed|resumed|merged|gate-repaired|reported> [--lane <id>] [--agent <name>] [--stopped "<reason>"] [--id <qid>] [--label "<label>"]…
```

`<git-common-dir>/spec-fanout.json` after this spec (keys this spec adds or changes; the lane shape is unchanged):

```json
{
  "version": 1,
  "startedAt": "<ISO>",
  "admitted": false,
  "batch": { "members": ["specs/…/03-x.md"], "stopBefore": { "path": "…", "reason": "…" } , "by": "derived" },
  "pick": { "candidates": [{ "path": "specs/20261102/03-x.md", "brief": "32", "label": "x" }], "shown": 4, "startable": 4, "chosen": ["x", "z"] },
  "notes": [], "queued": [], "lanes": [], "lastGate": null
}
```

- `batch` is `null` while the step is PICK; `batch.by ∈ {'derived', 'pick'}`.
- `pick` is absent on a bare run; `pick.chosen` is written by `--mark picked`.
- Gone: `options` (`includeFixes`, `overrideSerial`, `specs`) and `ask`.

The PICK step's printed block (one candidate per option; `g = ceil(shown / 4)`):

```
AskUserQuestion {
  "questions": [{
    "question": "Which of these specs should this fan-out run? Tick any — group 1 of 1.",
    "header": "Pick 1/1",
    "multiSelect": true,
    "options": [
      { "label": "x", "description": "specs/20261102/03-x.md — brief 32; in the derived batch" },
      { "label": "y", "description": "specs/20261102/06-y.md — brief 32; waits: shared brief 32" },
      { "label": "z", "description": "specs/20261102/04-z.md — brief 33; in the derived batch" },
      { "label": "s", "description": "specs/20261102/08-s.md — brief 35; the derived batch stops here: touches pipeline self-surface spec/scripts/fanout-driver.js" }
    ]
  }]
}
Then: node <driver> --root <root> --mark picked --label "<label>" [--label "<label>"…]
```

`pending-question.js` module surface: unchanged export list; `stopPolicy(root)` ≡ `{ ...policy(root).stops }`.

## Data Model

`<git-common-dir>/spec-fanout.json` (transient per run, deleted at `--mark reported`): keys `options` and `ask`
are no longer written; key `pick` and the value `batch.by: 'pick'` are added; `MARKS` gains `picked`.
existing rows: a table written by the previous driver mid-run is read without error — the two readers of
`options.overrideSerial` and `ask` are deleted, no migration, `version` stays `1` (D12).

## Behavior

**AUTO (bare run).** `plan()` as today up to the table, then the fix group unconditionally, then save and the
PLAN step: `📌 Auto-picked batch: 03-x, 06-y, 04-z — the whole queue (veto: /spec:fanout --pick)`, the table,
`Then: … --mark planned`, `(to change the set, delete <STATE_FILE> and re-run)`. No AskUserQuestion is ever
printed before DISPATCH.

**SELF-PICK (`--pick`).**
1. PICK: candidates, block, mark line (D3). Control specified three ways (pipeline rules § Planning): SUCCESS —
   the PLAN step prints with `✅ Picked batch: …` and the table; PATH BACK — `(to change the set, delete
   <STATE_FILE> and re-run)` until `--mark planned`, and `--mark reported` after; farthest ARTIFACT — the state
   file only, until `--mark planned` admits the table (then lanes and merges as in every fan-out). Rendered by
   `fanout-driver.js` `printPick`, posted by the session as one `AskUserQuestion`.
2. `--mark picked --label …`: validate, order by queue, `deriveBatch` over the picks, `tableRun`, `⏭ left for a
   later run` line for picks past the boundary, fix group, save, print PLAN.
3. `--mark planned` → DISPATCH as today.

Worked boundary cases (fixture `tests/fanout/fixture.js`; queue order `03-x`, `06-y` (brief 32), `04-z` (brief 33),
then brief 35's `08-s` / `08-c` / `07-d` as the opt provides):

| Picks (labels) | Table | `batch` |
|---|---|---|
| `z`, `x` | `L1 03-x planned`, `L2 04-z planned` | `members [S03, S04], stopBefore null, by 'pick'` |
| `x`, `y` | `L1 03-x planned`, `L2 06-y waiting: shared brief 32` | `members [S03, S06], stopBefore null` |
| `x`, `s` (opt `selfSurface`) | `L1 03-x planned`; `⏭ left for a later run: 08-s` | `stopBefore { path: S08S, reason: 'touches pipeline self-surface spec/scripts/fanout-driver.js' }` |
| `s` alone | `L1 08-s planned` | `members [S08S], stopBefore null` — `the whole pick` |
| `x`, `c` (opt `critical`) | `L1 03-x planned`; `⏭ left for a later run: 08-c` | `stopBefore { path: S08C, reason: 'critical: shares Risk Tiers path src/db.js with 03-x' }` |
| `x`, `d` (opt `dependent`) | `L1 03-x planned`; `⏭ left for a later run: 07-d` | `stopBefore { path: specs/20261102/07-d.md, reason: 'blocked: brief 34 depends on 32' }` |

**Review checks (reviewer-run, both hard findings when red):**

```
git grep -nE -- "--batch <ids|--include-fixes|--override-serial|includeFixes|overrideSerial|--ask <key|ASK_KEYS|readFanoutTable|table\.ask|arg\.specs|options\.specs|batch-flag|spec-flags|retired --lanes|\[--lanes N\]|fanout \[--lanes" -- . ':!specs/**' ':!.claude/spec-runs*' ':!spec/.claude-plugin/plugin.json'
```
must print nothing (the removed-flag grep, D11; `--batch` and `--lanes` are matched with their fan-out context
because `docs/adr/0007` names a walkthrough `--batch` and `spec-status --lanes --json` is a live flag), and

```
git diff --shortstat <build_base>..HEAD -- . ':!specs' ':!.claude'
```
must show `deletions(-)` greater than `insertions(+)` (D10).

**Canonical Delta surface.** `docs/canonical/pipeline.md`'s three sentences naming `--ask <key>`,
`--batch <ids|all>` and `under --include-fixes` are rewritten by the review stage from § Canonical Delta; they
are outside the File Plan and outside the literals oracle, inside the reviewer grep once the delta lands.

## Acceptance Criteria

- **AC-20261103-14-1**: WHEN the driver is run with any retired or unknown argument THE SYSTEM SHALL exit 2
  with stderr carrying `unknown argument <a> — usage: fanout-driver.js [--root <dir>] [--pick] | --mark <m> [flags] | --state`
  and write no state file (e.g. `--batch all` → `unknown argument --batch — usage: …[--pick]…`;
  `--include-fixes`, `--override-serial`, `--ask repairRound`, `--lanes 1` and the bare path
  `specs/20261102/03-x.md` each → exit 2, `fs.existsSync(stateFile) === false`)
  → rewrites tests/fanout/fanout-driver.test.js :: AC-20261102-03-7: --lanes is refused
- **AC-20261103-14-2**: WHEN a bare run plans on the fixture with opt `fixes` THE SYSTEM SHALL table the derived
  batch and then the fix group with no flag, print the `📌` line naming `--pick` as the veto and no
  AskUserQuestion block, and write a state file without `options` or `ask` (e.g. lanes
  `[['L1', S03, 'planned'], ['L2', S06, 'waiting'], ['L3', S04, 'planned'], ['F1', 'fix/q107'], ['F2', 'fix/ci-deadbee']]`;
  stdout contains `📌 Auto-picked batch: 03-x, 06-y, 04-z — the whole queue (veto: /spec:fanout --pick)`;
  `'options' in state === false && 'ask' in state === false`)
  → rewrites tests/fanout/fanout-driver.test.js :: AC-20261102-03-7: --include-fixes appends
- **AC-20261103-14-3**: WHEN a bare run plans on the fixture with opt `bornFix` THE SYSTEM SHALL table every
  pending fix item at PLAN — the gated one waiting — and promote it at the landing that meets its gate while a fix
  born during the run still joins by provenance (e.g. after PLAN the fix lanes, in `--lanes --json` order, are
  `[['F1', 'q109', 'planned'], ['F2', 'q110', 'planned'], ['F3', 'q111', 'planned'], ['F4', 'q108', 'waiting', 'after specs/20261102/03-x.md (hardened)']]`;
  after `03-x` lands, `q108` is `planned` and a fix born through `h.born('fix export after x', BORN)` is appended
  once as `F5`, so the fix queue ids are `['q109', 'q110', 'q111', 'q108', <born>]`)
  → rewrites tests/fanout/fanout-driver.test.js :: AC-20261103-06-15 / AC-20261103-08-9
- **AC-20261103-14-4**: WHEN `--pick` runs on the fixture with opts `selfSurface` and `blocked` THE SYSTEM SHALL
  write a PICK-state file and print one AskUserQuestion block with one `multiSelect: true` question of four
  options in queue order, plain-word labels and path-led descriptions, followed by the `--mark picked` line
  (e.g. `--state` → `PICK`; `askBlocks(stdout)[0].questions[0]` has `header 'Pick 1/1'`,
  `question 'Which of these specs should this fan-out run? Tick any — group 1 of 1.'`, labels `['x', 'y', 'z', 's']`,
  descriptions `['specs/20261102/03-x.md — brief 32; in the derived batch', 'specs/20261102/06-y.md — brief 32; waits: shared brief 32', 'specs/20261102/04-z.md — brief 33; in the derived batch', 'specs/20261102/08-s.md — brief 35; the derived batch stops here: touches pipeline self-surface spec/scripts/fanout-driver.js']`;
  the blocked `08-k` is no option; stdout matches `/Then: node .*fanout-driver.* --mark picked --label "<label>"/`;
  `state.pick.candidates.map(c => c.path)` is `[S03, S06, S04, S08S]` and `state.batch === null`)
  → writes tests/fanout/fanout-driver.test.js
- **AC-20261103-14-5**: WHEN `--pick` runs with more than four candidates THE SYSTEM SHALL split them over
  `ceil(n / 4)` questions whose option counts differ by at most one, show at most sixteen and say how many it
  left out (e.g. opts `selfSurface` + `critical` (five startable: `03-x`, `06-y`, `04-z`, `08-s`, `08-c`) → two
  questions with headers `Pick 1/2`, `Pick 2/2` and `3` then `2` options; opt `many: 17` → four questions of four
  options, `state.pick.shown === 16`, `state.pick.startable === 20` and stdout contains
  `16 of 20 startable specs shown — the rest come after this run`)
  → writes tests/fanout/fanout-driver.test.js
- **AC-20261103-14-6**: WHEN `--mark picked` is run with no `--label`, with a label matching no candidate, or
  `--mark planned` is run on a PICK-state file THE SYSTEM SHALL exit 2 naming the remedy and leave the file
  byte-identical (e.g. `--mark picked` → stderr `nothing picked — tick at least one box, or delete <STATE_FILE> and run bare for the derived batch`;
  `--mark picked --label nope` → `label "nope" matches no candidate — labels are: x, y, z`;
  `--mark planned` → `the batch is not picked yet — answer the pick question, then run --mark picked`;
  `bytes(stateFile)` unchanged in all three)
  → rewrites tests/fanout/fanout-driver.test.js :: AC-20261103-06-13: --batch all
- **AC-20261103-14-7**: WHEN `--mark picked` names picks THE SYSTEM SHALL table them in queue order through the
  same boundary validation as the bare run — a shared-brief pick waits, a self-surface, critical-sharing or
  brief-dependent pick after another member ends the batch and prints the picks it left out — and never admit a
  pick the bare run would refuse (e.g. labels `z`, `x` → lanes `[['L1', S03, 'planned'], ['L2', S04, 'planned']]`;
  `x`, `y` → `[['L1', S03, 'planned'], ['L2', S06, 'waiting']]` with `waitingOn 'shared brief 32'`;
  opt `selfSurface`, `x`, `s` → lanes `[['L1', S03, 'planned']]`, stdout contains `⏭ left for a later run: 08-s`,
  `batch.stopBefore` is `{ path: S08S, reason: 'touches pipeline self-surface spec/scripts/fanout-driver.js' }`;
  `s` alone → `[['L1', S08S, 'planned']]` and `stopBefore null`; opt `critical`, `x`, `c` → `stopBefore.reason`
  `'critical: shares Risk Tiers path src/db.js with 03-x'`; opt `dependent`, `x`, `d` → `stopBefore.reason`
  `'blocked: brief 34 depends on 32'` and `07-d` never tabled)
  → rewrites tests/fanout/fanout-driver.test.js :: AC-20261102-03-21: an explicit --spec list
- **AC-20261103-14-8**: WHEN a pick is recorded THE SYSTEM SHALL print the PLAN step with the picked line and the
  planned mark, record `by: 'pick'` and the chosen labels, append the fix group, and move `--state` through
  `PICK` → `PLAN` → `DISPATCH` (e.g. opt `fixes`, labels `x` → stdout contains
  `✅ Picked batch: 03-x — the whole pick` and `Then: … --mark planned`; lanes `[['L1', S03], ['F1', 'fix/q107'], ['F2', 'fix/ci-deadbee']]`;
  `state.batch` is `{ members: [S03], stopBefore: null, by: 'pick' }`, `state.pick.chosen` is `['x']`;
  `--state` before the mark → `PICK`, after → `PLAN`, after `--mark planned` → `DISPATCH`; REPORT's slots carry no
  batch-stopped warn)
  → rewrites tests/fanout/fanout-driver.test.js :: AC-20261102-03-18 / AC-20261103-04-15 / AC-20261103-06-19
- **AC-20261103-14-9**: WHEN `--pick` finds fewer than two candidates THE SYSTEM SHALL not print a question (e.g.
  with `03-x` and `06-y` marked done → no AskUserQuestion block, stdout contains
  `📌 Auto-picked the one startable spec 04-z — nothing else to choose (veto anytime)`, lanes `[['L1', S04, 'planned']]`,
  `state.batch.by === 'pick'`; opt `fixes` with all three specs done → `📌 Auto-picked the fix group alone — no startable spec (veto anytime)`
  and lanes `[['F1', 'fix/q107'], ['F2', 'fix/ci-deadbee']]`; no fixes and all done → stdout contains
  `no startable lanes — nothing to fan out` and no state file)
  → writes tests/fanout/fanout-driver.test.js
- **AC-20261103-14-10**: WHEN a bare run meets a PICK-state file, or `--pick` meets an admitted table THE SYSTEM
  SHALL re-print the pick step unchanged, or refuse (e.g. bare run after `--pick` → the same block,
  `bytes(stateFile)` unchanged; `--pick` after `--mark planned` → exit 2,
  stderr `a fan-out is already running — delete <STATE_FILE> to start over`)
  → writes tests/fanout/fanout-driver.test.js
- **AC-20261103-14-11**: WHEN `stopPolicy(root)` or `stop-policy --key <k>` reads a host whose
  `spec-fanout.json` carries an `ask` list THE SYSTEM SHALL return the host's own value with no overlay (e.g.
  `policyHost('pq-stops-ask', { repairRound: 'repair' }, { version: 1, lanes: [], ask: ['repairRound'] })` →
  `stopPolicy(root).repairRound === 'repair'` and `policyPick(root, 'repairRound', REPAIR, marks)` returns the
  `📌 Auto-picked run one in-session repair round — host policy stops.repairRound: repair (veto anytime)` line;
  `stop-policy --key rejectWithEvidence` on a host with `rejectWithEvidence: 'accept'` and a table listing it →
  stdout `accept`)
  → rewrites tests/delegated/pending-question.test.js :: AC-20261103-04-3: stopPolicy
- **AC-20261103-14-12** `[oracle: literals]`: WHEN the doctrine is read THE SYSTEM SHALL carry no per-run ask
  overlay: `--ask <key>` and `--ask <key|all>`
- **AC-20261103-14-13**: WHEN `spec/templates/grounding-contract.md` is edited THE SYSTEM SHALL CONTINUE TO carry
  a `contractHash` in `.claude/spec.config.json` equal to `spec-paths contract-hash` of the edited file (e.g.
  `JSON.parse(read('.claude/spec.config.json')).contractHash === runBash('bin/spec-paths', ['contract-hash']).stdout.trim()`
  after D7's edit and restamp)
  → reuses tests/host-config/contract-keys.test.js :: AC-20261103-04-2
- **AC-20261103-14-14** `[oracle: literals]`: WHEN the File Plan's non-tests files are read THE SYSTEM SHALL
  carry none of the retired flag and field names: `'--batch'`, `'--include-fixes'`, `'--override-serial'`,
  `'--ask'`, `'--spec'`, `includeFixes`, `overrideSerial`, `arg.specs`, `ASK_KEYS`, `readFanoutTable`,
  `table.ask`, `--batch <ids|all>`, `[--include-fixes]`, `[--override-serial]`, `[<spec path>…]`,
  `retired --lanes`, `[--lanes N]`, `batch-flag`, `spec-flags`
- **AC-20261103-14-15**: WHEN a bare run derives the batch THE SYSTEM SHALL CONTINUE TO stop before a
  self-surface spec, a critical spec sharing a § Risk Tiers path, a blocked entry and a planning item with
  today's reasons and tabled order (e.g. opt `selfSurface` → `L1 03-x planned, L2 06-y waiting, L3 04-z planned`,
  `stopBefore { path: S08S, reason: 'touches pipeline self-surface spec/scripts/fanout-driver.js' }`)
  → reuses tests/fanout/fanout-driver.test.js :: AC-20261103-06-9
- **AC-20261103-14-16**: WHEN a fix item names files THE SYSTEM SHALL CONTINUE TO run it beside the run lanes it
  does not overlap and after the one it does, and a fix naming none after every lane (e.g. opt `fixFiles` bare
  run → `## Step: dispatch 3 lanes` naming `03-x`, `04-z` and `fix q113`, never `fix q114` or `fix q107` first)
  → reuses tests/fanout/fanout-driver.test.js :: AC-20261103-08-22

## Assumptions (escalation triggers)

- A1: AskUserQuestion accepts 1–4 `questions` per call, 2–4 `options` per question, `header` ≤ 12 characters,
  `multiSelect: true` returns the chosen labels — doc-checked at plan time (S1:
  `https://code.claude.com/docs/en/agent-sdk/user-input.md` — "each AskUserQuestion call supports 1-4 questions",
  "Array of 2-4 choices", "max 12 characters"; label length is not documented). D3's chunking (≤ 16, balanced
  groups, no question under two candidates) follows from these numbers. — **if false:** the harness refuses the
  block at the session's AskUserQuestion; the orchestrator re-reads the doc and amends D3's `4`/`16` constants
  in Decisions before any worker edits.
- A2: No pipeline caller prints a removed flag: `grep -rn 'spec:fanout' spec/scripts spec/commands git spec/doctrine
  spec/templates spec/agents README.md docs/canonical` at plan time hits only `fanout-driver.js`'s header,
  `grounding-contract.md:305` (D7), `docs/canonical/status.md` (names the driver, no flag) and `pipeline.md`
  (Canonical Delta); `spec-status.js` prints no `/spec:fanout` line. — **if false:** the caller is added to the
  File Plan as a `doctrine`/`scripts` row and its printed text changed to `/spec:fanout` or `/spec:fanout --pick`.
- A3: The `question-style-gate.js` tier-1 floor passes D3's block: every description is ≥ 25 characters (the
  shortest shape `specs/20261102/03-x.md — brief 32; in the derived batch` is 55), no option is labelled
  `(Recommended)`, and the question text carries no backticked identifier. — **if false:** the gate's stderr names
  the failing check; the description grammar in D3 is amended, never the gate.
- A4: `spec-status --next --json` lists a shared-brief sibling (`06-y`) as an unblocked `/spec:run` entry and
  `--lanes --json` carries it under `serialized` with reason `shared brief 32` (true today: AC-20261103-06-9's
  pin tables it waiting). — **if false:** D3's candidate list filters on `serialized` membership explicitly.
- A5: The net-negative diff (D10) is reachable: the driver loses the three-way selection, the `--ask` parsing
  and the overlay (~70 lines) and the tests lose six flag-only pins and every `--spec` setup list, against a PICK
  step of ~45 lines and a fixture helper of ~15. — **if false:** the build trims duplicated test setup through
  the fixture helpers and keeps every AC; a still-positive count at review is a hard finding on D10, repaired in
  the review's repair round, never waived.
- A6: `ac-matrix`'s literals oracle scans File Plan non-tests files only, so the plugin changelog (prose, bare or
  backticked names) never matches AC-14-14's quoted/bracketed stems; `plugin.json`'s current changelog carries
  `--ask overlay)` which matches no stem. — **if false:** the changelog paragraph is reworded, never the stems.

## Rationale

The fan-out grew four knobs in three specs: `--lanes` (retired by spec 06), `--batch` as the veto of the derived
batch, `--include-fixes` and `--override-serial` from spec 20261102/03, and `--ask` from spec 04 as the per-run
stop override. Each is a safe default dressed as a question: the queue already orders the work, the fixes are
queued because they are wanted, a shared-brief hold exists because two specs of one brief collide, and a host
that wants a stop asked has `policy.stops.<key>: ask`. The user's standing rule — never ask a question with a
safe default — leaves one real choice: "do I want the derived batch, or do I want to choose?" So two modes.

`--pick` is a checkbox, not a bypass, because the boundary rules are not preferences: a self-surface spec rewrites
the driver running the other lanes, a critical spec sharing a § Risk Tiers file with an unmerged lane merges
into a file that lane is changing, a brief dependency means building on an unmerged result. `deriveBatch`
already encodes them for the bare run; D4 feeds it the picks instead of the queue and keeps everything else. The
one capability that dies with `--override-serial` — two specs of one brief in parallel — was a bypass of the
shared-brief hold by definition, and D2 drops it in both modes.

Labels come from the stem, not the H1: the stem is what the queue prints and what the user types elsewhere,
it is unique by construction, and it costs no file read. `--mark picked --label` reuses `--mark answered`'s
label grammar so the session has one way to carry a user's choice back to the driver.

The `--ask` overlay is deleted rather than kept dormant because a reader of a key no writer sets is the dead
code the user named; `stopPolicy` and `stop-policy` stay as the one reader so no build or review caller moves.

Rejected: keeping `--batch <ids>` as a non-interactive pick (a third mode); a `pick` state flag instead of a
`picked` mark (the mark grammar is the driver's protocol and the fixture's); a `version: 2` state file (D12);
asking the user to confirm the pick before `--mark planned` (the PLAN step is already the confirm).

The pre-existing-fix rule shifts spec 08's tests: items another run bore are "waiting for the next batch" in
spec 08's words, and this is that batch — they are tabled at PLAN and the provenance rule governs only births
during the run. Fragile: the bornFix host's lane ids and the dispatch order of file-less fix lanes; D9 names
every test to re-host so the worker never guesses.

Collision-closure (run at lock over `include-fixes`, `override-serial`, `includeFixes`, `overrideSerial`,
`ASK_KEYS`, `stopPolicy`, `spec-fanout.json`, `Auto-picked batch`, `veto: --batch`): every literals hit is a
File Plan row except three recorded waives — `spec/scripts/spec-queue.js` and `tests/queue/spec-queue.test.js`
read `spec-fanout.json`'s `lanes` and `startedAt`, keys this spec leaves byte-identical;
`spec/scripts/spec-review-driver.js` calls `stopPolicy`, whose signature and return shape are unchanged (D6);
`docs/canonical/pipeline.md` is rewritten by the review stage from § Canonical Delta.

## Canonical Delta

`docs/canonical/pipeline.md`, the fan-out paragraphs:

- Replace `the host's `policy.stops` answers the predictable stops and `--ask <key>` relays one for a run` with
  `the host's `policy.stops` answers the predictable stops; a host that wants one asked sets that key to `ask``.
- Replace `prints it as one `📌 Auto-picked batch` line (`--batch <ids|all>` is the veto, four lanes run at
  once)` with `prints it as one `📌 Auto-picked batch` line (`/spec:fanout --pick` is the veto — a checkbox over
  the startable specs, at most sixteen per round, routed through the same boundary rules; four lanes run at once)`.
- Replace `A gated fix under `--include-fixes` waits in the table until its gate is met.` with `Every pending
  queued fix and red-CI row is tabled at PLAN as the serial fix group in both modes; a gated one waits in the
  table until its gate is met.`
- Append after the spec 08 paragraph: `The driver has two modes and no other flag: a bare run (AUTO) and
  `--pick` (SELF-PICK, the `PICK` step and the `picked` mark); the former veto, fix-group, serial-override and
  stop-override flags and positional spec paths are refused with the usage line, and the per-run overlay on
  `policy.stops` is gone — `stopPolicy` reads the host block alone. (specs/20261103/14-the-fan-out-has-two-modes.md)`
  The retired names are elided on purpose: `docs/canonical/` is a live surface the reviewer grep walks
  (pipeline rules § Gotchas, the Canonical Delta entry).
