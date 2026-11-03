---
date: 2026-11-03
status: done
tier: critical           # spec/templates/grounding-contract.md gains the policy.stops block (§ Risk Tiers: hash-stamped into every host)
area: pipeline
breaking: false
depends_on: []
brief: n/a
open_markers: 0
diff_base: 973d0c5ec371344bfbea884acf54562c73fe1c25
---

# Predictable stops become host policy

## Goal

The pipeline stops asking questions whose answer is the same every run. Today `/spec:fanout` opens with a
three-question standing sheet that dies with `spec-fanout.json` at `--mark reported`, so every fan-out
re-asks it; solo `/spec:run` asks the same stops at every STOPPED, ESCALATE and critical-tier RED_FINDINGS;
`/spec:fix` asks before committing a dirty tree that `/git:commit` already confirms twice. After this spec a
`policy.stops` block in the host config, written with safe defaults by `/spec:init` and shared by solo runs
and lanes, answers the predictable stops; each auto-pick prints one vetoable `📌 Auto-picked` line and is
listed in the run report; a stop keeps asking only where its policy value is `ask` (the default for
deleting a prototype) or where the answer genuinely depends on the user (waive dispositions, worker
`blocked` forks, `/spec:fix` decisions). Done means a fan-out on a default host reaches DISPATCH with no
question, a solo review on a default host repairs a red leg without asking, and every retired ask has a
policy value that brings it back.

Prior art: Renovate's per-rule `automerge`, Dependabot auto-merge with branch protection as the veto,
merge-queue policy kept in repo config instead of a per-run prompt.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `spec/scripts/lib/host-config.js` gains `policy.stops`, a closed sub-block beside `mergeStrategy`: `repairRound` `repair \| ask` (default `repair`), `buildEscalate` `derived \| ask` (default `derived`), `reviewEscalate` `queue \| ask` (default `queue`), `redFindings` `remove-mention \| ask` (default `remove-mention`), `prototypeClose` `ask \| keep \| delete` (default `ask`). `POLICY_DEFAULTS.stops` holds the defaults; `mergePolicy` merges `stops` key by key over them (a partial block keeps the other defaults, exactly as `models`); `validatePolicy` reports `stops: expected an object`, `unknown key stops.<k>` and `stops.<k>: expected one of <enum>` (AC-20261103-04-1) | One reader for every stop (spec 20261029/08 D2's rule); a per-repo persisted answer was rejected because it still re-asks on every new machine and user. |
| D2 | `spec/templates/grounding-contract.md` § Policy: the JSON block gains `"stops": {"repairRound": "repair", "buildEscalate": "derived", "reviewEscalate": "queue", "redFindings": "remove-mention", "prototypeClose": "ask"}`, the Enums paragraph lists the five enums, and the Semantics paragraph gains one sentence per key naming the stop it answers and the `📌 Auto-picked <label> — host policy stops.<key>: <value> (veto anytime)` line it prints. One edit; this repo's `.claude/spec.config.json` `contractHash` is restamped to `spec-paths contract-hash` in the same change (AC-20261103-04-2) | The contract is the host-facing enumeration of the block; the hash moves, so every host's grounding is flagged stale exactly once. |
| D3 | `spec/scripts/pending-question.js`: `BY` becomes `['user']` and `KINDS` becomes `['repair-round', 'dispositions', 'review-escalate', 'red-findings', 'build-escalate', 'fix-decisions', 'fix-dispositions']` (`fix-dirty-tree` retired with D11; no `prototype-close` kind — the prototype question is asked only at MERGE, which a lane never runs). Two new module exports: `stopPolicy(root)` returns `policy(root).stops` overlaid by the fan-out table's `ask` list (`<git-common-dir>/spec-fanout.json`'s top-level `ask`: each listed key → `'ask'`, the word `all` → every key `'ask'`; absent table or list → the host block as is); `policyPick(root, key, labelByValue, marks)` returns `null` when the effective value is `'ask'` or `labelByValue` has no label for it, else `{ value, label, line }` with `line` = `📌 Auto-picked <label> — host policy stops.<key>: <value> (veto anytime)` and appends `{ key, value, label, at }` to `marks.policyPicks` (created when absent). `answer --by` accepts only `user` (AC-20261103-04-3) | The module is already the one reader of the fan-out table (`isDelegated`), so the per-run override lives beside the delegation signal; `by: standing` is retired because a policy pick never writes a pending file — the driver prints and continues. |
| D4 | `spec/scripts/spec-review-driver.js` STOPPED with the repair round unspent: `policyPick(repoRoot, 'repairRound', { repair: 'run one in-session repair round' }, marks)` non-null → the step prints the 📌 line, the repair instruction (the host's agentMap, the workers seat, commit, `--mark repair-round`) and no `AskUserQuestion` text; a delegated run writes no pending file and prints no `PENDING_QUESTION`; the sidecar is saved with `policyPicks`. `ask` → today's text in-session and today's pending file delegated. The round-spent two exits are unchanged in text and additionally record `marks.laneExit` per D10 (AC-20261103-04-4, AC-20261103-04-5, AC-20261103-04-18, AC-20261103-04-19) | The driver already recommends the repair round; a second red still returns as a stop, so the cap bounds the cost of a wrong pick. |
| D5 | `spec/scripts/spec-build-driver.js` ESCALATE with no `escalateChoice`: `policyPick(repoRoot, 'buildEscalate', { derived: <label> }, marks)` where `<label>` is `re-arm one more round` when `escalateRecommendation().pick` is `re-arm` and `park and queue a /spec:fix` when it is `park` → the driver sets `marks.escalateChoice` to that pick, saves, prints the 📌 line with `rec.text` appended in parentheses, then the same body the explicit `--mark escalate-choice <pick>` prints (re-arm: the next repair step labelled past the cap; park: the parked block with its queue line), then `To answer differently: node <driver> <spec> --mark escalate-choice <re-arm\|cold\|park\|amend>`. Never `cold` or `amend`. `ask` → today's question in-session and today's pending file delegated (AC-20261103-04-6, AC-20261103-04-7, AC-20261103-04-20) | The recommendation already derives from the failure trend; the two derived picks are the two reversible ones. |
| D6 | `spec/scripts/spec-review-driver.js` ESCALATE: `policyPick(repoRoot, 'reviewEscalate', { queue: 'abandon and queue /spec:fix' }, marks)` non-null → the step prints the open-findings listing, the 📌 line, `delete <sidecarDir>`, the queue-add line, the escalate-row line, and `To answer differently:` naming the disposer route (`--mark dispositions --file <return.json>`) and the re-plan queue line; no question, no pending file; `marks.laneExit` per D10. `ask` → one question whose options are, in this order and identical in-session and delegated: `abandon and queue /spec:fix (Recommended)` (resume `stop`, then delete the sidecar and the queue add), `waive or reject everything through the disposer` (resume `--mark dispositions --file <return.json>`), `abandon without queuing` (resume `stop`, then delete the sidecar), `re-plan` (resume `stop`, then the re-plan queue add) (AC-20261103-04-8, AC-20261103-04-9) | The delegated arm today recommends mass waive/reject with no evidence while the solo arm recommends the queue; one list, queue first, ends the contradiction. |
| D7 | `spec/scripts/spec-build-driver.js` RED_FINDINGS, `unsanctioned-green` on `tier: critical`: `policyPick(repoRoot, 'redFindings', { 'remove-mention': 'remove the AC-ID mention' }, marks)` non-null → the step prints the 📌 line followed by the standard-tier known-cause paragraph; no question, no pending file. `ask` → today's question in-session and today's pending file delegated. Standard tier is unchanged (AC-20261103-04-10, AC-20261103-04-21) | The red check re-runs after the edit, so a wrong pick resurfaces as the same finding; the known cause is the fix on every tier. |
| D8 | `spec/scripts/spec-review-driver.js` MERGE with `prototypeAtRisk` N > 0: `policyPick(repoRoot, 'prototypeClose', { delete: 'Delete it', keep: 'Keep it for now' }, marks)` non-null → the step prints `prototype <stem>: N unmerged commits on proto/<stem>`, the 📌 line, and the mark line pre-filled `--prototype <value>`; no question. `ask` (the default) → today's question. N = 0 is unchanged (AC-20261103-04-11, AC-20261103-04-22) `[asked: user 2026-11-03 — a prototype is never auto-deleted by default; delete is opt-in per host]` | Deleting unmerged work is the one stop whose wrong answer is unrecoverable, so the default stays a question. |
| D9 | `spec/scripts/fanout-driver.js`: the PREFLIGHT state, `printPreflight`, `STOPS`, `KINDS`, `ASK_ME`, `checkLabel`, the `--repair-round`/`--build-escalate`/`--prototype-close` flags, `--mark standing`, `st.standing` and `l.standingApplied` are removed; `MARKS` loses `standing`; `--mark planned` moves `--state` from PLAN to DISPATCH. The planning run accepts a repeatable `--ask <repairRound\|buildEscalate\|reviewEscalate\|redFindings\|all>` written to the state file as `ask: [...]` (an unknown key exits 2 naming the five words). RELAY applies nothing: every open question is relayed as it is today. MERGE's narration reads `policy(root).stops.prototypeClose` (`a prototype question is answered by host policy: "<value>"` for `keep`/`delete`, else `a prototype question is asked of the user`). `--mark returned` reads `policyPicks` from the lane's build and review sidecars into `l.policyPicks` (replaced on every return) and, when either sidecar carries `laneExit`, lands the lane `stopped` with `laneExit.reason` and appends `laneExit.queued` (when present) to `st.queued`. REPORT's `warns` carries one line per entry of every lane's `policyPicks`: `policy applied — stops.<key>: <label> (<lane id>, <spec>)` (AC-20261103-04-12, AC-20261103-04-13, AC-20261103-04-14, AC-20261103-04-15) | The sheet asked what the host policy now answers; with N concurrent lanes the 📌 lines scroll past, so the REPORT trail stays. `--ask` is the one per-run override that cannot be a config edit. |
| D10 | A lane-ending exit is recorded, never guessed: the build driver writes `marks.laneExit = { reason: 'build parked at the repair cap', queued: '<the queue subject it printed>', at }` when ESCALATE lands `park` (by mark or by D5); the review driver writes `{ reason: 'review stopped, repair round spent', queued, at }` at the round-spent two exits and `{ reason: 'review escalated at the fix cap — <n> open findings', queued, at }` at D6's queue pick; `pending-question.js`'s `bareRun` writes `{ reason: '<chosen label>', at }` when an answered file's chosen option resumes with `stop`. Solo runs print nothing new for it (AC-20261103-04-14) | Today a lane that parks, spends its round or takes a `stop` answer returns "without a recognised stop" and is resumed by hand. |
| D11 | `spec/commands/fix.md` step 1: the dirty-tree `AskUserQuestion` and its delegated `fix-dirty-tree` branch are deleted. Any `git status --porcelain` output → in-session run `/git:commit` first (its two approvals are the stop; one fix per checkout still holds), then continue; delegated → print the files and stop with the reason `dirty tree in a fix lane` (the parent records it with `--mark returned --stopped`). § Rules reads `at most THREE AskUserQuestion calls: the step-3 decisions stop, the step-4 waive/reject and the Input fallback` and the kinds sentence names `fix-decisions` and `fix-dispositions` (AC-20261103-04-16) | The commit command already confirms what to add and the message; a third approval for the same act is the question this spec exists to remove. |
| D12 | Doctrine reads the block: `spec/doctrine/core.md` § Delegated Stops — `by: user` is the only writer and one added sentence: `A stop whose answer the host's policy.stops names is never written — the lane's own driver prints 📌 Auto-picked <label> — host policy stops.<key>: <value> (veto anytime) and continues; the fan-out's --ask <key> relays that stop for one run.` `spec/commands/fanout.md` — § Input gains `--ask <key\|all>`; § Rules' first never-line reads `Never answer a lane's question yourself — every question the driver relays is asked of the user; the only answers never relayed are the host's policy.stops auto-picks, printed by the lane's own driver (--ask <key> relays them for one run)`; the non-goals line drops `beyond the user's own PREFLIGHT sheet` for `beyond the host's policy.stops`; § Run step 2's `ask (the AskUserQuestion block, once, as printed)` becomes `relay (…)` only. `spec/doctrine/stages/stage-build.md` § Build stage — the critical-tier green and ESCALATE sentences each gain `(policy.stops.<key> answers it unless ask — stage prints the 📌 line)`. `spec/doctrine/stages/stage-review.md` § Protocol — the STOPPED/ESCALATE paragraph gains the `repairRound`/`reviewEscalate` arms and lists D6's four options in order; § Rules' MERGE bullet gains the `prototypeClose` arm. `spec/commands/init.md` Policy round 2 gains one sentence after its questions: `policy.stops is written with its defaults (repairRound repair, buildEscalate derived, reviewEscalate queue, redFindings remove-mention, prototypeClose ask) and never asked — edit .claude/spec.config.json to change a stop.` (AC-20261103-04-17) | Every policy key has a prose reader naming it (spec 20261029/09's rule); init keeps eight questions. |
| D13 | `spec/.claude-plugin/plugin.json` is bumped via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` naming `policy.stops`, the retired PREFLIGHT sheet and the retired fix dirty-tree question. `[no-ac: plugin-bump.js --check in the gate is the oracle; reviewer-held against the merge base]` | One plugin directory is touched. |
| D14 | Existing pins on the retired ask text are kept green by hosting them under `policy: { stops: { <key>: 'ask' } }` in their synthetic config, never by weakening the assertion: `tests/review/stopped-repair-round.test.js` (AC-20261029-07-5, -07-6), `tests/review/delegated-stops.test.js` (AC-20261102-02-6, -02-8, -02-17), `tests/build/delegated-stops.test.js` (AC-20261102-02-11, -02-12, -02-19), `tests/build/escalate-choice.test.js` (AC-20261029-07-2 in-session asks, -07-3 critical ask), `tests/review/escalate-row-step.test.js` (AC-20260822-01-12 when its route assertions need the question text). `tests/consistency/prose-pins.test.js`'s fix.md kinds pin names two kinds. `[no-ac: test-maintenance rows; each file is listed in the File Plan with the pins it re-hosts]` | The default changed; the invariant each pin guards (the ask exists and is well-formed) did not. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/host-config.js | MODIFY | scripts | `POLICY_DEFAULTS.stops`, stop enums, merge and validate (D1); no dependency change |
| spec/scripts/pending-question.js | MODIFY | scripts | `BY` user-only, `KINDS` without fix-dirty-tree, `stopPolicy`, `policyPick`, `bareRun` laneExit (D3, D10) |
| spec/scripts/spec-review-driver.js | MODIFY | scripts | STOPPED repair pick (D4), ESCALATE queue pick and unified options (D6), MERGE prototype pick (D8), laneExit (D10) |
| spec/scripts/spec-build-driver.js | MODIFY | scripts | ESCALATE derived pick (D5), critical RED_FINDINGS pick (D7), laneExit on park (D10) |
| spec/scripts/fanout-driver.js | MODIFY | scripts | PREFLIGHT, standing, STOPS and the three label flags removed; `--ask`; returned reads policyPicks/laneExit; REPORT policy trail; MERGE narration (D9) |
| spec/templates/grounding-contract.md | MODIFY | doctrine | § Policy `stops` block, enums, semantics — the one contract edit (D2) |
| spec/doctrine/core.md | MODIFY | doctrine | § Delegated Stops: `by: user` only, the policy sentence (D12) |
| spec/commands/fanout.md | MODIFY | doctrine | `--ask` input, never-line, non-goals, step 2 wording (D12) |
| spec/commands/fix.md | MODIFY | doctrine | step 1 dirty tree → `/git:commit`; Rules cap THREE; two kinds (D11) |
| spec/commands/init.md | MODIFY | doctrine | Policy round 2 `stops` defaults sentence (D12) |
| spec/doctrine/stages/stage-build.md | MODIFY | doctrine | § Build stage policy arms for red findings and ESCALATE (D12) |
| spec/doctrine/stages/stage-review.md | MODIFY | doctrine | § Protocol STOPPED/ESCALATE arms and option list; § Rules MERGE prototype arm (D12) |
| spec/.claude-plugin/plugin.json | MODIFY | other | bump via plugin-bump.js (D13) |
| .claude/spec.config.json | MODIFY | other | `contractHash` restamped over the edited contract (D2) |
| tests/host-config/policy-block.test.js | MODIFY | tests | AC-20261103-04-1 |
| tests/host-config/contract-keys.test.js | MODIFY | tests | AC-20261103-04-2 |
| tests/consistency/contract-stamp.test.js | MODIFY | tests | AC-20261103-04-2 (reuses the contractHash restamp pin, retagged in its title) |
| tests/delegated/pending-question.test.js | MODIFY | tests | AC-20261103-04-3, AC-20261103-04-14 (bareRun laneExit) |
| tests/review/stopped-repair-round.test.js | MODIFY | tests | AC-20261103-04-4, AC-20261103-04-8, AC-20261103-04-18 (reuse, retagged); re-hosts AC-20261029-07-5, AC-20261029-07-6 under stops ask (D14) |
| tests/review/delegated-stops.test.js | MODIFY | tests | AC-20261103-04-5, AC-20261103-04-9, AC-20261103-04-19 (reuse, retagged); re-hosts AC-20261102-02-6, AC-20261102-02-8, AC-20261102-02-17 under stops ask (D14) |
| tests/build/escalate-choice.test.js | MODIFY | tests | AC-20261103-04-6, AC-20261103-04-10, AC-20261103-04-14 (park laneExit), AC-20261103-04-21 (reuse, retagged); re-hosts AC-20261029-07-2 and AC-20261029-07-3 asks under stops ask (D14) |
| tests/build/delegated-stops.test.js | MODIFY | tests | AC-20261103-04-7, AC-20261103-04-10 (delegated arm), AC-20261103-04-20 (reuse, retagged); re-hosts AC-20261102-02-11, AC-20261102-02-12, AC-20261102-02-19 under stops ask (D14) |
| tests/review/escalate-row-step.test.js | MODIFY | tests | re-hosts AC-20260822-01-12 under stops ask only if its assertions need the question text (D14) |
| tests/review/prototype-close.test.js | MODIFY | tests | AC-20261103-04-11, AC-20261103-04-22 (reuse, retagged) |
| tests/fanout/fanout-driver.test.js | MODIFY | tests | AC-20261103-04-12, AC-20261103-04-13, AC-20261103-04-14, AC-20261103-04-15; AC-20261102-03-5, -03-9, -03-12, -03-18 rewritten in place |
| tests/fanout/fixture.js | MODIFY | tests | `h.standing` removed; `h.dispatchedPair` plans and dispatches only; `h.sidecar` unchanged |
| tests/consistency/dead-stops.test.js | MODIFY | tests | AC-20261103-04-16 (rewrites the fix.md half of AC-20261029-07-10 in place; merge.md half unchanged) |
| tests/consistency/prose-pins.test.js | MODIFY | tests | fix.md kinds pin names fix-decisions and fix-dispositions only (D14) |
| tests/consistency/policy-readers.test.js | MODIFY | tests | AC-20261103-04-17 |

## Contracts

`policy.stops` (host config, `spec/templates/grounding-contract.md` § Policy):

```json
"stops": {
  "repairRound": "repair",
  "buildEscalate": "derived",
  "reviewEscalate": "queue",
  "redFindings": "remove-mention",
  "prototypeClose": "ask"
}
```

Enums: `repairRound` `repair | ask`; `buildEscalate` `derived | ask`; `reviewEscalate` `queue | ask`;
`redFindings` `remove-mention | ask`; `prototypeClose` `ask | keep | delete`.

`pending-question.js` module additions:

```js
stopPolicy(root)                     // -> { repairRound, buildEscalate, reviewEscalate, redFindings, prototypeClose }
                                     //    host block overlaid by <git-common-dir>/spec-fanout.json `ask: [...]`
policyPick(root, key, labelByValue, marks)
                                     // -> null | { value, label, line }; pushes { key, value, label, at } onto marks.policyPicks
BY = ['user']
KINDS = ['repair-round', 'dispositions', 'review-escalate', 'red-findings', 'build-escalate', 'fix-decisions', 'fix-dispositions']
```

The 📌 line, byte-for-byte: `📌 Auto-picked <label> — host policy stops.<key>: <value> (veto anytime)`.

Sidecar records (build-state.json / review-state.json, additive):

```js
marks.policyPicks = [{ key, value, label, at }]              // every pick the driver made in this run
marks.laneExit   = { reason, queued?: '<queue subject>', at } // set once when the run ends the lane
```

Fan-out state (`<git-common-dir>/spec-fanout.json`, additive): top-level `ask: ['repairRound', …] | ['all']`;
`standing` and every lane's `standingApplied` no longer exist; each lane carries `policyPicks: []`.

Fan-out REPORT `warns` line: `policy applied — stops.<key>: <label> (<lane id>, <spec>)`.

## Behavior

**Solo review, default host, red gate leg.** STOPPED prints the red legs, the GATE_RED ledger line, then
`📌 Auto-picked run one in-session repair round — host policy stops.repairRound: repair (veto anytime)`,
the repair instruction and `Then: node <driver> <spec> --mark repair-round`. The session repairs and marks.
A second red prints `repair round spent (1 of 1) — two exits:` exactly as today.

**Lane review, default host, red gate leg.** Same output; no pending file, no `PENDING_QUESTION`; the
worker repairs in its worktree and continues. The parent sees the pick only in the REPORT warns trail.

**Lane build, default host, cap reached, failures 9 → 4 → 2.** ESCALATE prints
`📌 Auto-picked re-arm one more round — host policy stops.buildEscalate: derived (recommended: re-arm (failures shrank 9 → 4 → 2)) (veto anytime)`,
then the round-4 repair step. Flat trend: the park block and its queue line; the worker runs the queue
line (the store is `<git-common-dir>/spec-queue.json`, shared with main) and returns; the parent's
`--mark returned` lands the lane `stopped — build parked at the repair cap` and the report's `queued`
slot lists the subject.

**Fan-out, default host.** PLAN → `--mark planned` → DISPATCH. No sheet. `--ask repairRound` on the planning
run makes every lane's STOPPED write its pending file as today, relayed in RELAY.

**/spec:fix on a dirty tree.** Step 1 runs `/git:commit` (two approvals) and continues; no third question.

**Veto surface.** Every 📌 line ends `(veto anytime)`; the mark that answers differently is printed under
it (`--mark escalate-choice …`, `--mark dispositions --file …`, `--prototype keep|delete`); a host that
wants the question back sets the key to `ask`; a single fan-out gets it back with `--ask <key>`.

## Acceptance Criteria

- **AC-20261103-04-1**: WHEN `policy(root)` reads a config with no `policy` block THE SYSTEM SHALL return
  `stops` equal to `{ repairRound: 'repair', buildEscalate: 'derived', reviewEscalate: 'queue', redFindings: 'remove-mention', prototypeClose: 'ask' }`;
  WHEN the block is `{ stops: { prototypeClose: 'keep' } }` THE SYSTEM SHALL return `prototypeClose: 'keep'`
  with the other four at their defaults; WHEN `validatePolicy({ stops: { repairRound: 'always', bogus: 1 } })`
  runs THE SYSTEM SHALL return exactly `['stops.repairRound: expected one of repair|ask', 'unknown key stops.bogus']`,
  and `validatePolicy({ stops: 'repair' })` SHALL return `['stops: expected an object']`
  → writes tests/host-config/policy-block.test.js
- **AC-20261103-04-2**: WHEN `spec/templates/grounding-contract.md` is read THE SYSTEM SHALL carry, inside the
  § Policy JSON block, the five keys `repairRound`, `buildEscalate`, `reviewEscalate`, `redFindings`,
  `prototypeClose` under `"stops"` with the literal defaults of D2, and an Enums sentence naming
  `prototypeClose` `ask | keep | delete`; and this repo's `.claude/spec.config.json` `contractHash` SHALL equal
  the first 12 characters of the SHA-256 of the edited contract (e.g. not `4a008a392b20`)
  → writes tests/host-config/contract-keys.test.js
  → reuses tests/consistency/contract-stamp.test.js :: AC-20260912-15-8
- **AC-20261103-04-3**: WHEN `pending-question.js answer --by standing` runs THE SYSTEM SHALL exit 2 naming
  `user` as the only accepted value; WHEN `write` is given `kind: 'fix-dirty-tree'` THE SYSTEM SHALL exit 2
  with `kind "fix-dirty-tree" is not in the closed set`; WHEN the host policy is `{ stops: { repairRound: 'repair' } }`
  and `<git-common-dir>/spec-fanout.json` carries `ask: ['repairRound']` THE SYSTEM SHALL return
  `stopPolicy(root).repairRound === 'ask'` and `policyPick(root, 'repairRound', { repair: 'run one in-session repair round' }, marks)`
  SHALL return `null` with `marks.policyPicks` absent; WHEN the table carries no `ask` THE SYSTEM SHALL return
  `{ value: 'repair', label: 'run one in-session repair round', line: '📌 Auto-picked run one in-session repair round — host policy stops.repairRound: repair (veto anytime)' }`
  and `marks.policyPicks[0]` SHALL be `{ key: 'repairRound', value: 'repair', label: 'run one in-session repair round', at: <ISO-8601> }`
  → writes tests/delegated/pending-question.test.js
- **AC-20261103-04-4**: WHEN an in-session review on a host with no `policy.stops` hits STOPPED with the round
  unspent THE SYSTEM SHALL print `📌 Auto-picked run one in-session repair round — host policy stops.repairRound: repair (veto anytime)`
  and `--mark repair-round`, print no `AskUserQuestion`, and record `marks.policyPicks[0].key === 'repairRound'`
  in review-state.json
  → writes tests/review/stopped-repair-round.test.js
- **AC-20261103-04-5**: WHEN a delegated review on a default host hits STOPPED with the round unspent THE SYSTEM
  SHALL print the same 📌 line, write no `.claude/pending-question.json` and print no `PENDING_QUESTION`
  → writes tests/review/delegated-stops.test.js
- **AC-20261103-04-6**: WHEN an in-session build on a default host reaches ESCALATE with gate logs `Failed: 9`,
  `Failed: 4`, `Failed: 2` THE SYSTEM SHALL print
  `📌 Auto-picked re-arm one more round — host policy stops.buildEscalate: derived (recommended: re-arm (failures shrank 9 → 4 → 2)) (veto anytime)`,
  then `round 4 (re-armed past the cap of 3)`, then `--mark escalate-choice <re-arm|cold|park|amend>`, print
  no `AskUserQuestion`, and the sidecar SHALL carry `escalateChoice: 're-arm'`; WHEN the logs are flat
  (`fail 5` four times) THE SYSTEM SHALL print `📌 Auto-picked park and queue a /spec:fix — host policy stops.buildEscalate: derived (recommended: park (failures did not shrink: 5 → 5 → 5)) (veto anytime)`,
  the `spec-queue)" add` line with `--lane fix --top`, and leave `--state` at ESCALATE
  → writes tests/build/escalate-choice.test.js
- **AC-20261103-04-7**: WHEN a delegated build on a default host reaches ESCALATE THE SYSTEM SHALL write no
  pending file (e.g. `fs.existsSync('<lane>/.claude/pending-question.json')` → `false`) and print the 📌 line of
  AC-20261103-04-6
  → writes tests/build/delegated-stops.test.js
- **AC-20261103-04-8**: WHEN an in-session review on a default host reaches ESCALATE with two open hard findings
  THE SYSTEM SHALL list both, print `📌 Auto-picked abandon and queue /spec:fix — host policy stops.reviewEscalate: queue (veto anytime)`,
  the `delete <sidecarDir>` line, a `spec-queue)" add` line containing `review escalated at the fix cap — 2 open findings` and `--lane fix --top`,
  and a `To answer differently:` block naming `--mark dispositions --file`, and print no `AskUserQuestion`;
  WHEN the host sets `stops.reviewEscalate: 'ask'` THE SYSTEM SHALL print one `AskUserQuestion` whose first
  option is `abandon and queue /spec:fix (Recommended)` followed by `waive or reject everything through the disposer`,
  `abandon without queuing`, `re-plan`
  → writes tests/review/stopped-repair-round.test.js
- **AC-20261103-04-9**: WHEN a delegated review on a host with `stops.reviewEscalate: 'ask'` reaches ESCALATE
  THE SYSTEM SHALL write a review-escalate file whose options' labels are exactly
  `['abandon and queue /spec:fix (Recommended)', 'waive or reject everything through the disposer', 'abandon without queuing', 're-plan']`
  with the first resuming `stop` and its `then` naming `--lane fix --top`; WHEN the host has no `policy.stops`
  THE SYSTEM SHALL write no file and print the 📌 line of AC-20261103-04-8
  → writes tests/review/delegated-stops.test.js
- **AC-20261103-04-10**: WHEN an in-session build of a `tier: critical` spec on a default host finds an
  `unsanctioned-green` at RED_FINDINGS THE SYSTEM SHALL print `📌 Auto-picked remove the AC-ID mention — host policy stops.redFindings: remove-mention (veto anytime)`
  and no `AskUserQuestion`; WHEN the same build is delegated on a default host THE SYSTEM SHALL write no pending
  file and print the same 📌 line
  → writes tests/build/escalate-choice.test.js
  → writes tests/build/delegated-stops.test.js
- **AC-20261103-04-11**: WHEN the review MERGE step runs with 2 unmerged proto commits on a host with
  `stops.prototypeClose: 'keep'` THE SYSTEM SHALL print `prototype <stem>: 2 unmerged commits on proto/<stem>`,
  `📌 Auto-picked Keep it for now — host policy stops.prototypeClose: keep (veto anytime)`, a mark line ending
  `--prototype keep`, and no `AskUserQuestion`
  → writes tests/review/prototype-close.test.js
- **AC-20261103-04-12**: WHEN the fan-out driver runs bare with no state file THE SYSTEM SHALL print PLAN,
  write every lane `planned` with `policyPicks: []` and no `standing` key, and `--mark planned` SHALL move
  `--state` from PLAN to DISPATCH; WHEN `--mark standing` is given THE SYSTEM SHALL exit 2 listing the marks
  without `standing`; WHEN `--ask bogus` is given on the planning run THE SYSTEM SHALL exit 2 naming
  `repairRound`, `buildEscalate`, `reviewEscalate`, `redFindings`, `all`; WHEN `--ask repairRound` is given
  THE SYSTEM SHALL write `ask: ['repairRound']` into the state file
  → rewrites tests/fanout/fanout-driver.test.js :: AC-20261102-03-5
  → rewrites tests/fanout/fanout-driver.test.js :: AC-20261102-03-9
- **AC-20261103-04-13**: WHEN a lane returns pending with a repair-round question (the host set `--ask repairRound`)
  THE SYSTEM SHALL relay it in RELAY under the lane-prefixed header and answer nothing itself (no `📌` line, no
  `--by standing` call)
  → rewrites tests/fanout/fanout-driver.test.js :: AC-20261102-03-12
- **AC-20261103-04-14**: WHEN `--mark returned` finds the lane's build-state.json carrying
  `laneExit: { reason: 'build parked at the repair cap', queued: '03-x: build parked at the repair cap — gate-3.log', at: … }`
  THE SYSTEM SHALL land the lane `stopped` with `stoppedReason` equal to that reason and append the `queued`
  string to `st.queued`; WHEN `bareRun` consumes an answered file whose chosen option resumes `stop` THE SYSTEM
  SHALL set `marks.laneExit.reason` to the chosen label; WHEN the build driver lands `--mark escalate-choice park`
  THE SYSTEM SHALL write `marks.laneExit.reason === 'build parked at the repair cap'` and `laneExit.queued`
  starting with the spec's relative path
  → writes tests/fanout/fanout-driver.test.js
  → writes tests/delegated/pending-question.test.js
  → writes tests/build/escalate-choice.test.js
- **AC-20261103-04-15**: WHEN REPORT renders after a lane whose review-state.json carried
  `policyPicks: [{ key: 'repairRound', value: 'repair', label: 'run one in-session repair round', at: … }]`
  THE SYSTEM SHALL write `slots.warns` equal to `['policy applied — stops.repairRound: run one in-session repair round (L1, 03-x)']`
  and no `standing answer applied` line
  → rewrites tests/fanout/fanout-driver.test.js :: AC-20261102-03-18
- **AC-20261103-04-16**: WHEN `spec/commands/fix.md` step 1 is read THE SYSTEM SHALL name `/git:commit` as the
  dirty-tree remedy, contain no `AskUserQuestion` and no `fix-dirty-tree` between `1. **Root-cause` and `2. **`,
  and § Rules SHALL read `at most THREE` (the rewritten test keeps its merge.md Step 2 assertions byte-identical)
  → rewrites tests/consistency/dead-stops.test.js :: AC-20261029-07-10
- **AC-20261103-04-17**: WHEN the doctrine is read THE SYSTEM SHALL find `by: user` and no `by: standing` in
  `spec/doctrine/core.md` § Delegated Stops together with the phrase `policy.stops`; `--ask` in `spec/commands/fanout.md`
  § Input and `policy.stops` in its § Rules with no `PREFLIGHT`; `policy.stops.redFindings` and
  `policy.stops.buildEscalate` in `spec/doctrine/stages/stage-build.md` § Build stage; `policy.stops.repairRound`,
  `policy.stops.reviewEscalate` and `abandon and queue /spec:fix (Recommended)` in `spec/doctrine/stages/stage-review.md`
  § Protocol and `policy.stops.prototypeClose` in its § Rules; and `policy.stops` with `never asked` in
  `spec/commands/init.md`'s Policy round 2 section
  → writes tests/consistency/policy-readers.test.js
- **AC-20261103-04-18**: WHEN the host sets `stops.repairRound: 'ask'` and an in-session review hits STOPPED with
  the round unspent THE SYSTEM SHALL CONTINUE TO print the three-option ask naming `run one in-session repair round (Recommended)`
  and `--mark repair-round` (e.g. the `.gate-red` host of the existing pin, its config gaining `policy.stops.repairRound: "ask"`)
  → reuses tests/review/stopped-repair-round.test.js :: AC-20261029-07-5: a red gate leg prints STOPPED
- **AC-20261103-04-19**: WHEN the host sets `stops.repairRound: 'ask'` and a delegated review hits STOPPED with the
  round unspent THE SYSTEM SHALL CONTINUE TO write the repair-round pending file with its three options and print
  `PENDING_QUESTION` (e.g. `kind: "repair-round"`, `questions[0].options.length === 3`)
  → reuses tests/review/delegated-stops.test.js :: AC-20261102-02-6
- **AC-20261103-04-20**: WHEN the host sets `stops.buildEscalate: 'ask'` and a delegated build reaches ESCALATE with
  no choice THE SYSTEM SHALL CONTINUE TO write the four-option build-escalate file resuming through
  `--mark escalate-choice` (e.g. `questions[0].options.length === 4`)
  → reuses tests/build/delegated-stops.test.js :: AC-20261102-02-11
- **AC-20261103-04-21**: WHEN the host sets `stops.redFindings: 'ask'` and an in-session build of a `tier: critical`
  spec finds an `unsanctioned-green` THE SYSTEM SHALL CONTINUE TO print one `AskUserQuestion` with
  `remove the AC-ID mention (Recommended)` first (e.g. the 42-returning green test of the existing pin)
  → reuses tests/build/escalate-choice.test.js :: AC-20261029-07-3: the same unsanctioned-green
- **AC-20261103-04-22**: WHEN the host has no `policy.stops` and the review MERGE step runs with 2 unmerged proto
  commits THE SYSTEM SHALL CONTINUE TO print the `Delete the prototype now?` question and refuse
  `--mark merge-strategy` without `--prototype` (e.g. exit 2 naming `--prototype delete|keep`)
  → reuses tests/review/prototype-close.test.js :: AC-20261029-04-7: WHEN the proto branch carries 2

## Assumptions (escalation triggers)

- A1: Every synthetic test host used by the re-hosted pins (D14) has no `policy.stops`, so the new defaults
  apply to them and each pin that asserts the ask text must set its key to `ask` — **if false:** the pin already
  carries a policy block; add `stops` to it, never a second config file.
- A2: `spec-queue.js` stores the queue at `<git-common-dir>/spec-queue.json`, so a lane worker running the
  printed queue line writes the same store the parent reads (executed check S2) — **if false:** the parent
  runs the add at `--mark returned` from `laneExit.queued` and the lane prints the line only.
- A3: A delegated review never reaches the MERGE step (it ends at MERGE_READY; the parent merges from the
  main root), so `prototypeClose` needs no pending-question kind — **if false:** add `prototype-close` to
  `KINDS` and relay it; the policy pick still applies first.
- A4: `spec-paths contract-hash` prints the first 12 hex characters of the SHA-256 of the contract file and this
  repo's config stamps `4a008a392b20` today (executed check S1), so any byte change to the contract moves the
  stamp and the restamp is mandatory — **if false:** STOP, the hash is not what the contract-stamp pin says.
- A5: `escalateRecommendation()` returns only `re-arm` or `park` — **if false:** D5 maps any other value to
  `park` (the reversible pick).

Executed checks (2026-11-03):

- S1 `spec-paths contract-hash` → `4a008a392b20`; `grep contractHash .claude/spec.config.json` → `"contractHash": "4a008a392b20"`. Equal, so D2's edit moves the stamp.
- S2 `grep -n spec-queue.json spec/scripts/spec-queue.js` → line 144 `const QUEUE_PATH = path.join(common, 'spec-queue.json')` where `common` is `git rev-parse --git-common-dir`. Shared across worktrees.

## Rationale

The user's complaint was precise: the fan-out's PREFLIGHT sheet asks three questions with one obvious answer
each, and persisting the answers per repo was rejected outright ("even on other machines or users?"). The
same three stops, plus the critical-tier red-findings question and the review-escalate question, fire in solo
runs with the same obvious answer. The fix is the pattern the repo already has for the merge strategy: a
closed policy enum in the host config, applied as a printed, vetoable auto-pick, with `ask` as the escape
hatch per key and `--ask <key>` as the per-run escape for one fan-out.

Defaults were chosen by reversibility. A repair round costs one gate run and is capped at one. The derived
build escalation picks only re-arm (one more gate run) or park (the queue). The review escalation queues
`/spec:fix` rather than mass-waiving — the delegated arm's "waive or reject everything (Recommended)" was
a contradiction with the solo arm and with stage-review's "only the user waives". Removing an AC-ID mention is
re-checked by the red check. Deleting a prototype is the one irreversible pick, so its default stays `ask`
and `delete` is opt-in per host.

Rejected: `by: policy` on the pending file. A policy pick never writes a file — the driver prints and
continues — so the value would never be written; `BY` shrinks to `user`. Rejected: three per-run label flags on
the fan-out; `--ask <key>` is the only override that cannot be a config edit, and forcing a different auto-answer
for one run is a config edit. Deferred (queued below): `rejectWithEvidence` — auto-accepting a disposer `reject`
that carries an executed repro needs a return-shape change in the disposer agent and sits next to "only the
user waives"; it gets its own spec. Deferred: `/spec:fix`'s delegated dirty-tree stop becomes a plain stop with
a reason; a fix lane's worktree is clean by construction.

Collision closure (lock, literals `mark standing`, `standingApplied`, `by: standing`, `fix-dirty-tree`,
`PREFLIGHT`, `prototype-close`, `standing sheet`, `standing answer`): every mechanical hit under `tests/`
(`tests/fanout/fanout-driver.test.js`, `tests/fanout/fixture.js`, `tests/delegated/pending-question.test.js`,
`tests/review/delegated-stops.test.js`, `tests/consistency/prose-pins.test.js`) and every plugin or canonical
file is a File Plan row or the Canonical Delta; `tests/build/build-driver-preflight-resume.test.js` and
`tests/env-preflight.test.js` name the build driver's own PREFLIGHT state, untouched — waived; the bare stem
`standing` matches ordinary prose (`long-standing`, `standing guard`) across ADRs, roadmap briefs and rules —
waived as unrelated words.

Fragile: every existing test host inherits the new defaults, so pins on the ask text flip to the 📌 line
unless re-hosted under `ask` (D14). The fan-out fixture's `h.standing` is called by most fan-out tests; its
removal is a fixture rewrite, not a behaviour change.

### Build deviations (folded at close, review rv_eb0ebc010d60 — one-offs)

- D6 replaced the review ESCALATE options, so the re-hosted spec 20261029/07 AC 6 pin lost its two assertions
  on the retired option texts (the new four-option order is pinned by AC-20261103-04-8), and spec 20261102/02
  AC 8 was rewritten in place to D6's labels and order; a `by: 'standing'` seed became `by: 'user'` (D3), and
  the `--by robot` refusal assertion now matches `user` instead of `standing`.
- Re-hosted review hosts add their `policy.stops` edit to the synthetic spec's File Plan, or the reconcile leg
  reports the config off-plan.
- `fanout-driver.js`: `--mark planned` on an already-admitted table re-prints the current step instead of
  refusing (a fan-out test plans twice); the REPORT policy trail names a lane by its spec stem.
- Both drivers record a policy pick once per key; the build driver clears `escalateChoice` when a re-armed
  round trips the cap again and clears a stale `laneExit` on re-arm/amend.
- The printed veto after a derived `buildEscalate` re-arm pick is admitted at REPAIR while `escalateChoice` is
  `re-arm` and the cap has tripped (review fix round, reviewer finding s0), pinned in
  `tests/build/escalate-choice.test.js`.
- Test-layer repairs: the fan-out fixture keeps a file-local `REPAIR` label; the RELAY header pin expects
  `L1 · q1` (lane id plus question id, the existing convention); the reused contract-stamp pin's AC-ID mention
  was removed at RED_FINDINGS (user answer); the contract spells enums with their key path
  (`stops.prototypeClose`), and the contract-keys pin spells the same.

### Advisory debt (review rv_eb0ebc010d60)
- a0 /home/jj/projects/claude-plugins/.claude/worktrees/agent-a388a3f1b19777880/spec/scripts/spec-review-driver.js:2788 — The review ESCALATE queue pick records marks.laneExit into review-state.json and in the same step instructs `delete <sidecarDir>`; a lane worker that follows the printed step deletes the only file the fan-out's `--mark returned` reads laneExit from, so the lane still lands `returned without a recognised stop` for exactly the exit D10 set out to record. Spec-level (D6 prescribes the delete, D9/D10 the read) rather than an implementation deviation.
- a1 /home/jj/projects/claude-plugins/.claude/worktrees/agent-a388a3f1b19777880/spec/scripts/fanout-driver.js:310 — `--ask <key>` is accepted on every invocation but only read by plan(); on a resume or a `--mark` run it is silently ignored with exit 0.

## Canonical Delta

`docs/canonical/pipeline.md`, the paragraph opening `Every terminal stop in build and review is a question
with a recommended default` gains, after its `/spec:fix` included. (specs/20261029/07)` sentence: `The
predictable stops are answered by the host's `policy.stops` block (`repairRound`, `buildEscalate`,
`reviewEscalate`, `redFindings`, `prototypeClose`), written with safe defaults at init and shared by solo runs
and lanes; each pick prints one `📌 Auto-picked <label> — host policy stops.<key>: <value> (veto anytime)` line
and is listed in the run report; `ask` on a key brings the question back, and deleting a prototype stays a
question by default. `/spec:fix` no longer asks before committing a dirty tree — `/git:commit`'s own two
approvals are the stop. (specs/20261103/04)`

The next paragraph's `records the answer (`by: user` or `by: standing`)` reads `records the answer (`by: user`;
a stop the host policy answers is never written — the lane's own driver prints the 📌 line and continues)`.

The `/spec:fanout` paragraph's `standing answers for `repair-round`/`build-escalate`/`prototype-close`,` reads
`no standing sheet — the host's `policy.stops` answers the predictable stops and `--ask <key>` relays one for a
run; a lane's parked build, spent repair round or `stop` answer lands as a recorded `laneExit`,`.
