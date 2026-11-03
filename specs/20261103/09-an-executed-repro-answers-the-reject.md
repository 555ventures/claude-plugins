---
date: 2026-11-03
status: implementing
tier: critical           # spec/templates/grounding-contract.md gains a policy.stops key (§ Risk Tiers: hash-stamped into every host)
area: pipeline
breaking: false
depends_on: []
brief: n/a
open_markers: 0
diff_base: 4e19cf5b20dabd3019d013a40435546a0426ac27
---

# An executed repro answers the reject

## Goal

The review stops asking the user to confirm a disposer `reject` the disposer already proved. Today every
`waive` and every `reject` recommendation goes to the user, even when the disposer's reason is a repro it
ran whose output contradicts the finding — the one disposition that is evidence, not judgment. After this
spec the disposer's return carries a `repro` field (the command it ran and what it observed) on a `reject`
that rests on execution; a host's `policy.stops.rejectWithEvidence` (`accept` by default, `ask` to bring the
question back) lets `--mark dispositions` accept such a reject itself, printing one vetoable
`📌 Auto-picked` line and recording the pick in the sidecar exactly as spec 20261103/04's stops do. A
`waive`, and a `reject` with no repro (a miscitation argued from quotes), still go to the user — only the
user waives. Done means a default host's review with one repro-backed reject and no waive reaches FIX or
CLOSE with no question, in-session and in a lane, and the fan-out's `--ask rejectWithEvidence` relays it for
one run.

## Users

- The review owner: When the disposer rejects a finding on a repro it ran, I want the review to accept that
  reject without asking me, so I can spend my attention on waives and on rejects that are only argued.
  First run / empty: a host with no `policy.stops` accepts repro-backed rejects; `ask` on the key brings
  today's question back.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `spec/scripts/lib/host-config.js`: `STOP_ENUMS` gains `rejectWithEvidence: ['accept', 'ask']` and `POLICY_DEFAULTS.stops` gains `rejectWithEvidence: 'accept'`; `mergePolicy` and `validatePolicy` need no code change — they iterate the two tables (`validatePolicy({ stops: { rejectWithEvidence: 'always' } })` → `['stops.rejectWithEvidence: expected one of accept\|ask']`) (AC-20261103-09-1) | One reader for every stop (spec 20261103/04 D1); the default is `accept` because a rejected finding stays on the record (`rejected` in the ledger row, the return file in the sidecar) and is reversible through `/spec:fix`, unlike a prototype delete. |
| D2 | `spec/templates/grounding-contract.md` § Policy: the JSON block's `stops` gains `"rejectWithEvidence": "accept"` after `prototypeClose`; the Enums paragraph gains `stops.rejectWithEvidence` `accept \| ask`; the Semantics paragraph gains one sentence: `stops.rejectWithEvidence` `accept` → `--mark dispositions` accepts a disposer `reject` whose `repro` names the command it ran and the output it observed, printing `📌 Auto-picked accept reject on executed repro: <refs> — host policy stops.rejectWithEvidence: accept (veto anytime)`, while a `waive` and a repro-less `reject` are asked whatever the value. One edit; this repo's `.claude/spec.config.json` `contractHash` is restamped to the SHA-256 prefix of the edited file in the same change (AC-20261103-09-2) | The contract is the host-facing enumeration of the block; the hash moves, so every host's grounding is flagged stale exactly once. |
| D3 | `spec/agents/disposer.md`: the `reject` rule splits its two grounds — an executed repro is written into a new optional entry field `repro: { command: "<the command you ran, verbatim>", observed: "<the output that contradicts the finding>" }` (both non-blank strings), a demonstrated miscitation carries no `repro` and quotes both lines in `reason` as today; the § Return contract names the field; one added sentence states that a host's policy may accept a `repro`-bearing `reject` without a question, so `repro` is written only for a command the disposer actually ran in this dispatch, never for a check it reasoned about (AC-20261103-09-10) | The driver cannot re-execute the repro — the disposer is the seat that ran it and the field is the seat's attestation; naming that consequence in the agent's own rule is the one guard the shape can carry. |
| D4 | `spec/scripts/spec-review-driver.js` `handleDispositions`, before the delegated-open filter and before any write: every entry carrying `repro` must hold an object with non-blank string `command` and `observed`, else exit 2 naming the entry's `ref`, the key `repro` and the shape `{ command, observed }`, review-state.json byte-identical and no `disposer-return-<n>.json` written; an entry carrying `acceptedBy` whose `recommended` is not `reject`, whose `repro` is absent, or whose `final` is not `reject` is refused the same way naming `acceptedBy`. The header comment's refusal list gains both (AC-20261103-09-4) | The field is a sanction, so a malformed one fails closed exactly as a blank `reason` does; `acceptedBy` is the driver's own stamp and never arrives from the disposer. |
| D5 | Same function, after D4's checks: the policy pool is every entry with `recommended: 'reject'`, a valid `repro` and `final === undefined`. When it is non-empty, `pq.policyPick(repoRoot, 'rejectWithEvidence', { accept: 'accept reject on executed repro: ' + refs.join(', ') }, marks)` (the refs in pool order; `policyPick`, never `pickOnce` — one record per accepting mark) non-null → each pool entry gets `final: 'reject'` and `acceptedBy: 'policy'` (no `overriddenBy`, `overrides` unchanged), the return file is rewritten in place as the delegated arm already does, and the mark's stdout opens with the 📌 line followed by `To answer differently: set final to fix or waive on that entry in <file> with overriddenBy "user" and overrideReason, and re-run this mark before the next one.`; the delegated `open` filter then sees no such entry, so a return whose only open recommendations were repro-backed rejects writes no pending file and prints no `PENDING_QUESTION`. `ask` (or `--ask rejectWithEvidence` on the fan-out table) → `policyPick` returns null and the entry is handled exactly as today: asked in a lane, trusted as the session wrote it in-session (AC-20261103-09-3, AC-20261103-09-5, AC-20261103-09-6, AC-20261103-09-7, AC-20261103-09-12) | `final === recommended` already needs no override marker, so the stamp rides the existing tally; the veto is the same `final` edit the user makes today, and a re-run of the mark is the driver's existing idempotent path. |
| D6 | The DISPOSITIONS step text (in-session arm only): under `accept` the sentence reads `Fix recommendations dispatch without a question; a reject whose repro names the command the disposer ran and its observed output is accepted at the mark (host policy stops.rejectWithEvidence: accept — the mark prints the 📌 line); every other waive/reject recommendation goes to the user (AskUserQuestion; record the answer as final with overriddenBy:"user" when it differs).`; under `ask` it is today's sentence byte-for-byte. The delegated arm's text is unchanged (AC-20261103-09-11) | The session asks before it marks, so the step must say which entries it need not ask about; the lane never asks, so its text has nothing to drop. |
| D7 | `spec/scripts/fanout-driver.js` `ASK_KEYS` gains `rejectWithEvidence` before `all`; the `--ask` refusal names six words; `spec/commands/fanout.md` § Input's `--ask` bullet lists it. `stopPolicy`'s overlay and the REPORT `policy applied — stops.<key>: <label> (<lane>, <spec>)` trail need no change (AC-20261103-09-8, AC-20261103-09-9) | A dispositions stop is a lane stop (`KINDS` already carries `dispositions`), so the per-run relay must reach it. |
| D8 | Doctrine readers: `spec/doctrine/stages/stage-review.md` § Protocol's Dispositions bullet gains, after its `Every waive/reject goes to the user` sentence, `A reject carrying an executed repro is accepted at the mark by policy.stops.rejectWithEvidence accept (the default), the driver printing the 📌 line; ask sends it to the user as before.` and keeps `only the user waives` unchanged; `spec/commands/init.md`'s Policy round 2 defaults sentence gains `rejectWithEvidence accept` after `prototypeClose ask`. `spec/doctrine/core.md` § Delegated Stops is already generic over every `policy.stops` key and is not edited (AC-20261103-09-10) | Every policy key has a prose reader naming it (spec 20261103/04 D12's rule); init keeps eight questions. |
| D9 | `spec/.claude-plugin/plugin.json` is bumped via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` naming `policy.stops.rejectWithEvidence` and the disposer's `repro` field. `[no-ac: plugin-bump.js --check in the gate is the oracle; reviewer-held against the merge base]` | One plugin directory is touched. |
| D10 | Existing pins on the five-key stops set are rewritten in place to six keys, never weakened: `tests/host-config/policy-block.test.js`'s `STOP_DEFAULTS` and both AC-20261103-04-1 cases, `tests/host-config/contract-keys.test.js`'s key loop, `tests/fanout/fanout-driver.test.js`'s `--ask` refusal word loop. `[no-ac: test-maintenance rows; each file is a File Plan row naming the pins it extends]` | The pins assert the closed set; extending the set is the change, so the pins move with it. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/host-config.js | MODIFY | scripts | `STOP_ENUMS.rejectWithEvidence`, `POLICY_DEFAULTS.stops.rejectWithEvidence` (D1); no dependency change |
| spec/scripts/spec-review-driver.js | MODIFY | scripts | `repro`/`acceptedBy` shape refusals, the policy pool, the stamp, the 📌 and veto lines, the step sentence, the header refusal list (D4, D5, D6) |
| spec/scripts/fanout-driver.js | MODIFY | scripts | `ASK_KEYS` gains `rejectWithEvidence` (D7) |
| spec/templates/grounding-contract.md | MODIFY | doctrine | § Policy `stops.rejectWithEvidence` default, enum, semantics — the one contract edit (D2) |
| spec/agents/disposer.md | MODIFY | doctrine | `reject` rule split, `repro` field, § Return contract (D3) |
| spec/doctrine/stages/stage-review.md | MODIFY | doctrine | § Protocol Dispositions bullet policy sentence (D8) |
| spec/commands/fanout.md | MODIFY | doctrine | § Input `--ask` key list (D7) |
| spec/commands/init.md | MODIFY | doctrine | Policy round 2 defaults sentence (D8) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | bump via plugin-bump.js (D9) |
| .claude/spec.config.json | MODIFY | other | `contractHash` restamped over the edited contract (D2) |
| tests/host-config/policy-block.test.js | MODIFY | tests | AC-20261103-09-1 (rewrites both AC-20261103-04-1 cases in place to six keys, D10) |
| tests/host-config/contract-keys.test.js | MODIFY | tests | AC-20261103-09-2 (rewrites the AC-20261103-04-2 key loop in place, D10) |
| tests/consistency/contract-stamp.test.js | MODIFY | tests | AC-20261103-09-2 (reuses the contractHash restamp pin, retagged in its title) |
| tests/review/reject-with-evidence.test.js | CREATE | tests | AC-20261103-09-3, AC-20261103-09-4, AC-20261103-09-5, AC-20261103-09-11, AC-20261103-09-12 |
| tests/review/delegated-stops.test.js | MODIFY | tests | AC-20261103-09-6, AC-20261103-09-7 |
| tests/fanout/fanout-driver.test.js | MODIFY | tests | AC-20261103-09-8 (rewrites the AC-20261102-03-9 `--ask` case in place, D10) |
| tests/delegated/pending-question.test.js | MODIFY | tests | AC-20261103-09-9 |
| tests/consistency/policy-readers.test.js | MODIFY | tests | AC-20261103-09-10 |

## Contracts

`policy.stops` (host config, `spec/templates/grounding-contract.md` § Policy) — the block after this spec:

```json
"stops": {
  "repairRound": "repair",
  "buildEscalate": "derived",
  "reviewEscalate": "queue",
  "redFindings": "remove-mention",
  "prototypeClose": "ask",
  "rejectWithEvidence": "accept"
}
```

Enum: `stops.rejectWithEvidence` `accept | ask`.

Disposer return entry (`spec/agents/disposer.md` § Return contract), additive:

```js
{ ref, recommended, reason,
  repro?: { command: '<the command the disposer ran, verbatim>', observed: '<the output that contradicts the finding>' },
  //          ^ only on a reject grounded in execution; both strings non-blank; absent on a miscitation reject
  final?, overriddenBy?, overrideReason?,      // the user's answer, as today
  acceptedBy?: 'policy' }                      // written by the driver, only with final === recommended === 'reject' and a valid repro
```

The 📌 line, byte-for-byte: `📌 Auto-picked accept reject on executed repro: <ref>[, <ref>…] — host policy stops.rejectWithEvidence: accept (veto anytime)`
(refs in pool order, joined by `, `).

The veto line, byte-for-byte: `To answer differently: set final to fix or waive on that entry in <file> with overriddenBy "user" and overrideReason, and re-run this mark before the next one.`

Sidecar (`review-state.json`, additive): `marks.policyPicks` gains `{ key: 'rejectWithEvidence', value: 'accept', label: 'accept reject on executed repro: <refs>', at }` once per accepting mark.

Fan-out: `ASK_KEYS = ['repairRound', 'buildEscalate', 'reviewEscalate', 'redFindings', 'rejectWithEvidence', 'all']`.

## Behavior

**In-session review, default host, pool `s0`, `s1`, `leg:drift`.** The DISPOSITIONS step prints D6's `accept`
sentence. The disposer returns `s0 reject` with `repro`, `s1 fix`, `leg:drift fix`. The session asks nothing
(no waive, no repro-less reject) and marks. The mark's stdout opens
`📌 Auto-picked accept reject on executed repro: s0 — host policy stops.rejectWithEvidence: accept (veto anytime)`,
then the veto line, then the FIX step. `disposer-return-1.json`'s `s0` carries `final: 'reject'`,
`acceptedBy: 'policy'`; `marks.dispositions` is `{ waived: 0, rejected: 1, fixDispatched: 2, word }`;
`marks.disposer.overrides` is 0.

**Same, with a waive beside it.** `s1 waive` → the session asks about `s1` only, writes its `final`, marks;
`s0` is stamped as above.

**Veto.** The user edits `s0` to `final: 'fix'`, `overriddenBy: 'user'`, `overrideReason: 'the repro ran
against the wrong fixture'` and re-runs the mark: no 📌 line, `overrides` 1, `fixDispatched` 3.

**Lane review, default host.** Same return → no `.claude/pending-question.json`, no `PENDING_QUESTION`, the
📌 line, the run proceeds; the parent's REPORT trails
`policy applied — stops.rejectWithEvidence: accept reject on executed repro: s0 (L1, 03-x)`. With `s1 waive`
beside it, the pending file's questions list `s1` only.

**`ask`, or `--ask rejectWithEvidence` on the fan-out.** A lane writes the dispositions question for the
reject as today; in-session the step prints today's sentence and the mark stamps nothing.

**ESCALATE's waive/reject exit.** Unchanged route; a repro-backed reject in that return is accepted the same
way, a waive is still asked.

**Malformed field.** `repro: "ran it"` or `repro: { command: "x", observed: "" }` → exit 2 naming the ref,
`repro` and `{ command, observed }`, nothing written. A disposer return arriving with `acceptedBy` set → exit 2
naming `acceptedBy`.

## Acceptance Criteria

- **AC-20261103-09-1**: WHEN `policy(root)` reads a config with no `policy` block THE SYSTEM SHALL return
  `stops` equal to `{ repairRound: 'repair', buildEscalate: 'derived', reviewEscalate: 'queue', redFindings: 'remove-mention', prototypeClose: 'ask', rejectWithEvidence: 'accept' }`;
  WHEN the block is `{ stops: { rejectWithEvidence: 'ask' } }` THE SYSTEM SHALL return `rejectWithEvidence: 'ask'`
  with the other five at their defaults; WHEN `validatePolicy({ stops: { rejectWithEvidence: 'always' } })` runs
  THE SYSTEM SHALL return exactly `['stops.rejectWithEvidence: expected one of accept|ask']`, and the six-key
  default block SHALL validate to `[]`
  → rewrites tests/host-config/policy-block.test.js :: AC-20261103-04-1: policy(root)
  → rewrites tests/host-config/policy-block.test.js :: AC-20261103-04-1: validatePolicy
- **AC-20261103-09-2**: WHEN `spec/templates/grounding-contract.md` is read THE SYSTEM SHALL carry, inside the
  § Policy JSON block, `"rejectWithEvidence": "accept"` under `"stops"` beside the five keys of spec 04, and an
  Enums sentence naming `stops.rejectWithEvidence` `accept | ask`; and this repo's `.claude/spec.config.json`
  `contractHash` SHALL equal the first 12 characters of the SHA-256 of the edited contract (e.g. not
  `e3fb765dadad`)
  → rewrites tests/host-config/contract-keys.test.js :: AC-20261103-04-2:
  → reuses tests/consistency/contract-stamp.test.js :: AC-20260912-15-8
- **AC-20261103-09-3**: WHEN an in-session review on a host with no `policy.stops` marks dispositions over the
  pool `s0`, `s1`, `leg:drift` with a return `[{ ref: 's0', recommended: 'reject', reason: 'executed: the pin passes', repro: { command: 'node --test tests/x.test.js', observed: 'ℹ pass 1' } }, { ref: 's1', recommended: 'fix', reason: 'D1' }, { ref: 'leg:drift', recommended: 'fix', reason: 'D2' }]`
  THE SYSTEM SHALL exit 0 with stdout opening
  `📌 Auto-picked accept reject on executed repro: s0 — host policy stops.rejectWithEvidence: accept (veto anytime)`
  followed by the veto line of § Contracts, write `disposer-return-1.json` whose `s0` carries `final: 'reject'`
  and `acceptedBy: 'policy'` and no `overriddenBy`, record `marks.dispositions` equal to
  `{ waived: 0, rejected: 1, fixDispatched: 2 }` plus its `word`, `marks.disposer.overrides === 0` and
  `marks.policyPicks[0]` equal to `{ key: 'rejectWithEvidence', value: 'accept', label: 'accept reject on executed repro: s0' }`
  plus `at`, and derive `--state` `FIX`
  → writes tests/review/reject-with-evidence.test.js
- **AC-20261103-09-4**: WHEN the same mark is given a return whose `s0` carries `repro: 'ran it'`, or
  `repro: { command: 'x', observed: '' }`, or `recommended: 'waive'` with `acceptedBy: 'policy'` THE SYSTEM
  SHALL exit 2 naming `s0` and `repro` with `{ command, observed }` (the first two) or `acceptedBy` (the third),
  leave `review-state.json` byte-identical and write no `disposer-return-1.json`
  → writes tests/review/reject-with-evidence.test.js
- **AC-20261103-09-5**: WHEN the host sets `stops.rejectWithEvidence: 'ask'` and the in-session mark of
  AC-20261103-09-3 runs THE SYSTEM SHALL CONTINUE TO exit 0 with no `📌` line, `s0` left without `final` or
  `acceptedBy` in the written return, and no `marks.policyPicks` (e.g. `marks.dispositions.rejected === 1`
  from the recommendation alone)
  → writes tests/review/reject-with-evidence.test.js
- **AC-20261103-09-6**: WHEN a delegated review on a default host marks dispositions with the return of
  AC-20261103-09-3 THE SYSTEM SHALL write no `.claude/pending-question.json`, print no `PENDING_QUESTION`,
  print the 📌 line of AC-20261103-09-3 and derive `--state` `FIX`; WHEN `s1` is instead
  `{ ref: 's1', recommended: 'waive', reason: 'D2 sanctions' }` THE SYSTEM SHALL write a `dispositions` pending
  file whose `questions` ids are exactly `['s1']`
  → writes tests/review/delegated-stops.test.js
- **AC-20261103-09-7**: WHEN a delegated review on a host with `stops.rejectWithEvidence: 'ask'` marks
  dispositions with the return of AC-20261103-09-3 THE SYSTEM SHALL CONTINUE TO write a `dispositions`
  pending file whose `questions` ids are exactly `['s0']` and print `PENDING_QUESTION`
  → writes tests/review/delegated-stops.test.js
- **AC-20261103-09-8**: WHEN `--ask bogus` is given on the fan-out planning run THE SYSTEM SHALL exit 2 naming
  `repairRound`, `buildEscalate`, `reviewEscalate`, `redFindings`, `rejectWithEvidence`, `all`; WHEN
  `--ask rejectWithEvidence` is given THE SYSTEM SHALL write `ask: ['rejectWithEvidence']` into the state file
  → rewrites tests/fanout/fanout-driver.test.js :: AC-20261102-03-9
- **AC-20261103-09-9**: WHEN the host policy has no `stops` and `<git-common-dir>/spec-fanout.json` carries
  `ask: ['rejectWithEvidence']` THE SYSTEM SHALL return `stopPolicy(root).rejectWithEvidence === 'ask'` and
  `policyPick(root, 'rejectWithEvidence', { accept: 'accept reject on executed repro: s0' }, marks)` SHALL
  return `null`; WHEN the table carries no `ask` THE SYSTEM SHALL return
  `{ value: 'accept', label: 'accept reject on executed repro: s0', line: '📌 Auto-picked accept reject on executed repro: s0 — host policy stops.rejectWithEvidence: accept (veto anytime)' }`
  → writes tests/delegated/pending-question.test.js
- **AC-20261103-09-10**: WHEN the doctrine is read THE SYSTEM SHALL find `repro` together with `command` and
  `observed` in `spec/agents/disposer.md` § Return contract and the phrase `actually ran` in its
  § Recommendation rules; `policy.stops.rejectWithEvidence` and `only the user waives` in
  `spec/doctrine/stages/stage-review.md` § Protocol; `rejectWithEvidence` in `spec/commands/fanout.md` § Input;
  and `rejectWithEvidence accept` in `spec/commands/init.md`'s Policy round 2 section
  → writes tests/consistency/policy-readers.test.js
- **AC-20261103-09-11**: WHEN an in-session review on a host with no `policy.stops` prints the DISPOSITIONS
  step over a non-empty pool THE SYSTEM SHALL print `host policy stops.rejectWithEvidence: accept` and
  `accepted at the mark`; WHEN the host sets `stops.rejectWithEvidence: 'ask'` THE SYSTEM SHALL print
  `waive/reject recommendations go to the user` and no `rejectWithEvidence`
  → writes tests/review/reject-with-evidence.test.js
- **AC-20261103-09-12**: WHEN, after the mark of AC-20261103-09-3, the return's `s0` is edited to
  `final: 'fix', overriddenBy: 'user', overrideReason: 'the repro ran against the wrong fixture'` and the same
  mark is re-run THE SYSTEM SHALL exit 0 with no `📌` line, record `marks.dispositions.fixDispatched === 3`,
  `marks.dispositions.rejected === 0` and `marks.disposer.overrides === 1`, and leave `s0` without
  `acceptedBy`
  → writes tests/review/reject-with-evidence.test.js

## Assumptions (escalation triggers)

- A1: `handleDispositions` already rewrites the return file in place on the delegated arm and tolerates an
  explicit re-run of `--mark dispositions --file` (the header: "re-runs the same zero-disposition verdict
  pass and overwrites marks.dispositions"), so the stamp and the veto re-run need no new write path —
  **if false:** write the stamped file to the sidecar copy only and name that path in the veto line.
- A2: `policyPick` reads `stopPolicy(root)`, which overlays the fan-out table's `ask` list over
  `policy(root).stops`, so a new key in `POLICY_DEFAULTS.stops` reaches `--ask` with no change to
  `pending-question.js` (executed check S2) — **if false:** add the key to `stopPolicy`'s overlay loop in
  the same batch.
- A3: The pre-image drops an unknown `stops` key in `mergePolicy`, so a synthetic host with
  `rejectWithEvidence: 'ask'` behaves as today before the build — which is why AC-20261103-09-5 and -09-7 are
  CONTINUE-TO pins and AC-20261103-09-3/-09-6 are the red ones — **if false:** the two pins become plain ACs.
- A4: The in-tree contract hashes to `e3fb765dadad` and the config stamps the same (executed check S1), so
  D2's byte change moves the stamp and the restamp is mandatory — **if false:** STOP, the stamp is not what
  the contract-stamp pin says.
- A5: `tests/review/disposer-gate.fixtures.js`'s `makeTwoSurvivorPoolHost` yields exactly the pool `s0`, `s1`,
  `leg:drift` and `returnFileWith` writes an arbitrary return — **if false:** the new test builds its own
  pool with the same fixture primitives; the ACs' literals do not change.
- A6: Specs 20261103/06 and /08 are locked and unbuilt and overlap this File Plan (06: `host-config.js`,
  `grounding-contract.md`, `spec.config.json`, `fanout-driver.js`, `fanout.md`, `policy-block`,
  `contract-keys`, `contract-stamp`, `policy-readers`, `plugin.json`; 08: `spec-review-driver.js`,
  `stage-review.md`, `fanout.md`, `fanout-driver.js`, `plugin.json`). The fan-out serializes overlapping
  lanes and each lands through the gate; whichever of 06 and this spec merges second restamps
  `contractHash` over the merged contract and takes the next free plugin version — **if false** (built
  concurrently in one tree): build this one after 06 lands.

Executed checks (2026-11-03):

- S1 `sha256(spec/templates/grounding-contract.md)[0:12]` in-tree → `e3fb765dadad`;
  `grep contractHash .claude/spec.config.json` → `"contractHash": "e3fb765dadad"`. Equal, so D2's edit moves
  the stamp. (The installed `spec-paths contract-hash` at plugin cache 7.316.0 prints `4a008a392b20` — it
  hashes its own stale copy; every lock-time lint below runs the in-tree scripts.)
- S2 `spec/scripts/pending-question.js` lines 89-105: `stopPolicy` iterates `Object.keys(policy(root).stops)`
  and `policyPick` reads `stopPolicy(root)[key]` — key-agnostic.
- S3 `spec/scripts/spec-review-driver.js` line 1614: the delegated `open` filter is
  `(d.recommended === 'waive' || d.recommended === 'reject') && d.final === undefined` — stamping `final`
  first removes the entry from it with no filter change.
- S4 `grep -rn "five stops\|STOP_DEFAULTS" tests/` → `tests/host-config/policy-block.test.js:66,68` and
  `tests/host-config/contract-keys.test.js:31`: the `deepStrictEqual` on `STOP_DEFAULTS` reddens on a sixth
  key (D10's rewrite rows); the contract-keys loop is additive but its title says five, so it is rewritten too.
- S5 `grep -n ASK_KEYS spec/scripts/fanout-driver.js` → line 33 the array, line 56 the refusal joining it;
  `tests/fanout/fanout-driver.test.js:166` loops the five words plus `all` (D10's rewrite row).

## Rationale

Spec 20261103/04 deferred this key on purpose: it "sits next to only the user waives". The line this spec
draws is evidence versus judgment. A `waive` is a judgment that a trade-off is acceptable — the user's call,
always. A `reject` on a miscitation is an argument from quotes — still a judgment, still asked. A `reject` on a
repro the disposer ran is the review's own evidence standard applied to the finding ("no finding dies by
argument — dismissed only on executed contrary evidence"); asking the user to re-confirm it is asking them to
re-read output a fresh-context agent already observed. So the field is `repro`, not a generic `evidence`
kind: only the executed ground qualifies, and the agent's own rule says why it must be written honestly.

Default `accept` follows spec 04's reversibility rule. A rejected finding is not deleted: the return file
lands in the sidecar, the ledger row counts it under `rejected`, and the finding's `file:line` and claim stay
in the reviewer artifact — a wrong accept is one `/spec:fix` away, and the `📌` line plus the REPORT trail make
it visible. The alternative default, `ask`, would ship the feature as a config opt-in that no host discovers;
the user queued this item to stop a question, not to document one.

Rejected: the driver re-executing `repro.command` to verify it. It would run arbitrary shell text from a
JSON file at the driver, in the same trust domain the disposer already ran it in, and could not compare
outputs without a second oracle. Rejected: a ledger-row field counting policy-accepted rejects — the review
row shape is pinned by the provenance tests and the sidecar's `policyPicks` already answers the query.
Rejected: `pickOnce` for the record — a fix-delta pass can accept a second reject in iteration 2, and the
REPORT should trail both. Out of scope: `/spec:fix`'s own step-4 dispositions, which read the disposer's
return in prose with no driver mark to stamp the file; its cap of three questions stands.

Fragile: the stamp and the veto both ride the one return file. A session that edits `final` after the state
has moved past FIX is re-marking a consumed iteration; the veto line says "before the next one" and the
driver's existing re-run path is what honours it.

Collision closure (lock, literals `rejectWithEvidence`, `acceptedBy`, `STOP_DEFAULTS`, `ASK_KEYS`,
`five stops`, `go to the user`): every hit under `tests/` is a File Plan row (`policy-block`, `contract-keys`,
`fanout-driver.test.js`) or the source the Decision edits (`fanout-driver.js`); `spec/commands/plan.md` and
`genesis.md`'s `go to the user` are about planning forks, unrelated — waived; `spec/commands/fix.md:58`'s
`waive/reject go to the user` is the out-of-scope fix command — waived; `docs/adr/0005`, `docs/audit/…` and
`docs/roadmap/18b` are dated records — waived.

## Canonical Delta

`docs/canonical/pipeline.md`, the sentence `Fix recommendations dispatch without a question; waive and reject
recommendations go to the user, and the user's answer is recorded as final with overriddenBy: "user".` reads:
`Fix recommendations dispatch without a question; a reject whose repro names the command the disposer ran and
its observed output is accepted at the mark by policy.stops.rejectWithEvidence accept (the default — the
driver stamps final: "reject", acceptedBy: "policy" and prints the 📌 line; ask brings the question back);
every other waive and reject recommendation goes to the user, and the user's answer is recorded as final with
overriddenBy: "user". Only the user waives. (specs/20261103/09)`

The `policy.stops` paragraph's key list `(repairRound, buildEscalate, reviewEscalate, redFindings,
prototypeClose)` gains `rejectWithEvidence`.
