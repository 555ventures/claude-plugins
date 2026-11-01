---
date: 2026-10-31
status: implementing
build_base: main
tier: standard           # readers only: driver step text, doctrine sentences; no contract, hook, merge-back or verdict edit
area: pipeline
breaking: false
depends_on: [specs/20261029/08-the-policy-round-at-init.md]
brief: n/a
open_markers: 0
diff_base: e2e79bed16d8104222addaddbf773a17e00011a9
---

# The commands read the policy block

## Goal

Every key of the `policy` block spec 08 lands gets its reader: `/spec:run` honours
`worktreePerSpec`, the Direct lane honours `directLaneToMain`, the review MERGE step and
`/git:merge` honour `mergeStrategy`, the review CLOSE step and `/spec:doctor` check 20 honour
`testExpiry`, the plan lock commit tolerates an ignored ledger (`ledgerCommitted`), the
wireframe command honours `reviewService`, and every driver dispatch line prints the model and
effort `policy.models` names for that seat. A host with the default block sees today's output
on every line except one: the `/spec:connect` hint is no longer printed unless the host opted
into the hosted service. Done means each reader has a test that observes the changed output
with the key set and the default output without it.

Source: docs/audit/question-points-and-model-placement-2026-10-29.md Part 3 rows 9, 10, 12,
18, 21 (the reader half). Sibling: specs/20261029/08-the-policy-round-at-init.md.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `spec/commands/run.md` Step 0 reads `policy.worktreePerSpec` through the config: `false` → the loop runs in place exactly as with `--in-place`, printing `📌 Auto-picked in place — host policy worktreePerSpec: false (veto anytime)`; `--in-place` on the command line keeps its meaning; `true` or absent → today's isolation (AC-20261029-09-1) | The isolation default was fixed in doctrine; the policy makes it the host's. The flag stays the per-run override. |
| D2 | `spec/doctrine/core.md` § Pipeline Entry's Direct-lane sentence gains: "where the host's `policy.directLaneToMain` is `false`, a Direct change lands through a branch and `/git:merge`, never a commit on main — still no spec, the escape row still lands at commit time" (AC-20261029-09-2) `[asked: user 2026-10-31 — branch + /git:merge, no spec, for a host that forbids direct-to-main]` | The lightest rule that still keeps main merge-only; the heavier "always a spec" reading was offered and declined. |
| D3 | The review driver's MERGE step and `git/commands/merge.md` Step 3 read `policy.mergeStrategy`. Driver: `derived` → today's step text verbatim (inspect's output including its `RECOMMEND:` line, the derive paragraph); a named strategy → inspect's output with every line starting `RECOMMEND:` removed, then one line `📌 Auto-picked <strategy> — host policy (veto anytime)`, then the mark line pre-filled with that strategy (`--mark merge-strategy <strategy>`, `--prototype` operand unchanged). `merge.md` Step 3: a named policy strategy skips the RECOMMEND read and prints the same 📌 line; `derived` is today's text. `spec/doctrine/stages/stage-review.md`'s merge-strategy bullet states both arms (AC-20261029-09-3, AC-20261029-09-4) | The policy is a standing veto of the heuristic; the step text stays one derive-and-mark paragraph so the session never asks. `inspect`'s history summary is still printed (it is the evidence for the conflict repair). |
| D4 | The review driver's `doCloseWork` reads `policy.testExpiry`: `off` → `expire-tests.js` is not run, `marks.testsExpiry = {off: "policy"}`, the review ledger row carries no `tests` key, and the printed CLOSE step carries the line `test expiry: off by policy` in place of the 🧹 line; `classify` → today's path. `spec/commands/doctor.md` check 20 gains: "when `policy.testExpiry` is `off`, print `⚠️ test expiry: disabled by policy` and skip both dry runs". `stage-review.md`'s close bullet names the off arm (AC-20261029-09-5) | A host that never retires tests should not see a retirable count every close. The row omits `tests` rather than writing zeros so fleet readers never sum an invented classification. |
| D5 | `spec/commands/plan.md` § Lock step 5 reads "`git add` the spec, `.claude/spec-runs.jsonl` (only when it is tracked — on a `policy.ledgerCommitted: false` host the ledger is ignored and `git add` refuses it) and any brief step 2 wrote"; the `git commit -- <paths>` list follows the same rule (AC-20261029-09-6) | Spec 08's S1: `git add -- <ignored path>` exits 1. The review driver's `commitPromotedEvidence` and `/git:commit`'s `git add -A` already skip ignored paths, so this is the one explicit ledger add left. |
| D6 | `spec/scripts/mocks-driver.js`'s SCREENS terminal-confirm block prints the `(this project is not connected to the review service — /spec:connect connects it, and the screens are then drawn and sent)` line only when there is no `walkthrough` block AND `policy(root).reviewService === "hosted"`; `terminal` (the default) prints no such line (AC-20261029-09-7) | Audit row 12: an upload service is opted into, never nudged. A host that answered `hosted` at init and has not connected yet is the one case the hint helps. |
| D7 | Every driver dispatch line prints the seat from `policy(root).models`: the build driver's wave header reads `spawn one long-lived Agent {model: <workers.model>, effort: <workers.effort>} per layer above and KEEP it`; the review driver's REVIEWER step (both the first pass and the fix-delta pass) reads `Dispatch ONE Agent {subagent_type: "spec:reviewer", model: <reviewer.model>, effort: <reviewer.effort>}`, its DISPOSITIONS step and the ESCALATE re-dispatch read `Agent {subagent_type: "spec:disposer", model: <disposer.model>, effort: <disposer.effort>}`, and the fix-dispatch sentence's `(the host's agentMap; sonnet at effort: medium)` reads `(the host's agentMap; <workers.model> at effort: <workers.effort>)`. With the default block these print `sonnet`/`medium`, `fable`/`low`, `opus`/`medium`. `stage-review.md`'s reviewer and disposer dispatch bullets say the printed model and effort come from the host policy, defaulting to the seat table (AC-20261029-09-8, AC-20261029-09-9) | A dispatch line that names its seat is the only place a host override can act: an `Agent` call with `model`/`effort` outranks the agent file's frontmatter. Reading through `policy()` keeps the defaults in one place (spec 08 D2). |
| D8 | `spec/.claude-plugin/plugin.json` and `git/.claude-plugin/plugin.json` are each bumped via `node scripts/plugin-bump.js --bump --plugin <name> --changelog "<paragraph>"` naming the policy readers. `[no-ac: plugin-bump.js --check in the gate is the oracle; reviewer-held against the merge base]` | Two plugin directories are touched (`git/commands/merge.md`; rules § Gotchas fourth surface). |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/commands/run.md | MODIFY | doctrine | Step 0 reads `worktreePerSpec` (D1) |
| spec/doctrine/core.md | MODIFY | doctrine | § Pipeline Entry reads `directLaneToMain` (D2) |
| spec/doctrine/stages/stage-review.md | MODIFY | doctrine | merge-strategy bullet both arms (D3); close bullet off arm (D4); dispatch bullets cite policy (D7) |
| spec/scripts/spec-review-driver.js | MODIFY | scripts | MERGE reads `mergeStrategy` (D3); `doCloseWork`/CLOSE read `testExpiry` (D4); dispatch lines read `models` (D7) |
| spec/scripts/spec-build-driver.js | MODIFY | scripts | wave header reads `models.workers` (D7) |
| spec/scripts/mocks-driver.js | MODIFY | scripts | connect hint gated on `reviewService` (D6) |
| git/commands/merge.md | MODIFY | doctrine | Step 3 reads `mergeStrategy` (D3) |
| spec/commands/plan.md | MODIFY | doctrine | § Lock step 5 ledger-when-tracked (D5) |
| spec/commands/doctor.md | MODIFY | doctrine | check 20 off-by-policy line (D4) |
| spec/.claude-plugin/plugin.json | MODIFY | other | bump via plugin-bump.js (D8) |
| git/.claude-plugin/plugin.json | MODIFY | other | bump via plugin-bump.js (D8) |
| tests/consistency/policy-readers.test.js | CREATE | tests | AC-20261029-09-1, AC-20261029-09-2, AC-20261029-09-4, AC-20261029-09-6 |
| tests/review/review-driver-policy.test.js | CREATE | tests | AC-20261029-09-3, AC-20261029-09-5, AC-20261029-09-9 |
| tests/build/build-driver-policy.test.js | CREATE | tests | AC-20261029-09-8 |
| tests/consistency/model-placement.test.js | MODIFY | tests | AC-20261029-09-8 (rewrites spec 01's wave-line source pin to an output pin) |
| tests/mocks/connect-hint-policy.test.js | CREATE | tests | AC-20261029-09-7 |

## Contracts

Printed lines (exact):

```
📌 Auto-picked in place — host policy worktreePerSpec: false (veto anytime)        (run.md Step 0)
📌 Auto-picked squash — host policy (veto anytime)                                  (MERGE step / merge.md, strategy from policy)
test expiry: off by policy                                                          (CLOSE step)
⚠️ test expiry: disabled by policy                                                  (doctor check 20)
## Step: wave 1 — spawn one long-lived Agent {model: sonnet, effort: medium} per layer above and KEEP it
Dispatch ONE Agent {subagent_type: "spec:reviewer", model: fable, effort: low} with the spec path, …
Dispatch ONE Agent {subagent_type: "spec:disposer", model: opus, effort: medium} with the spec path, …
```

`marks.testsExpiry` on `off`: `{"off": "policy"}`; the review ledger row then has no `tests` key.

## Behavior

Every reader calls `policy(root)` from `spec/scripts/lib/host-config.js` (spec 08 D2) at the
moment it prints, never caching across marks; doctrine readers name the key in prose and the
drivers print the derived line. No reader asks a question: a policy value is a standing answer,
so every arm is a `📌` auto-pick line or a plain sentence. Absent block = defaults = today's
text, byte for byte, except the connect hint (D6) and the dispatch lines, which now carry
`model`/`effort` explicitly where they named only the subagent type.

## Acceptance Criteria

- **AC-20261029-09-1**: WHEN `spec/commands/run.md` Step 0 is read THE SYSTEM SHALL contain `policy.worktreePerSpec` and the literal `📌 Auto-picked in place — host policy worktreePerSpec: false (veto anytime)` → writes tests/consistency/policy-readers.test.js
- **AC-20261029-09-2**: WHEN `spec/doctrine/core.md` § Pipeline Entry is read THE SYSTEM SHALL contain `policy.directLaneToMain` and, in the same sentence, `/git:merge` and `still no spec` → writes tests/consistency/policy-readers.test.js
- **AC-20261029-09-3**: WHEN the review driver prints the MERGE step on a two-branch fixture host whose config has `policy.mergeStrategy: "squash"` THE SYSTEM SHALL print `📌 Auto-picked squash — host policy (veto anytime)` and `--mark merge-strategy squash` and SHALL NOT print any line starting `RECOMMEND:`; on the same fixture with `"derived"` (or no block) it SHALL print the `RECOMMEND:` line and no `host policy` line → writes tests/review/review-driver-policy.test.js
- **AC-20261029-09-4**: WHEN `git/commands/merge.md` Step 3 and `spec/doctrine/stages/stage-review.md` are read THE SYSTEM SHALL each contain `policy.mergeStrategy` and the literal `host policy (veto anytime)` → writes tests/consistency/policy-readers.test.js
- **AC-20261029-09-5**: WHEN the review driver reaches CLOSE on the close-expiry fixture (one pin, one plain tagged test) with `policy.testExpiry: "off"` THE SYSTEM SHALL print `test expiry: off by policy`, print no `🧹` line, leave both test files byte-identical, write a review ledger row with no `tests` key, and still flip `status: done`; with `"classify"` it SHALL print the 🧹 line naming 1 retirable test as today → writes tests/review/review-driver-policy.test.js
- **AC-20261029-09-6**: WHEN `spec/commands/plan.md` § Lock step 5 and `spec/commands/doctor.md` check 20 are read THE SYSTEM SHALL contain, respectively, `policy.ledgerCommitted` with `only when it is tracked`, and `policy.testExpiry` with `⚠️ test expiry: disabled by policy` → writes tests/consistency/policy-readers.test.js
- **AC-20261029-09-7**: WHEN the mocks driver prints the terminal SCREENS confirm step on a root with no `walkthrough` block and no `policy` block THE SYSTEM SHALL NOT print `/spec:connect connects it`; with `policy.reviewService: "hosted"` and still no `walkthrough` block it SHALL print `(this project is not connected to the review service — /spec:connect connects it, and the screens are then drawn and sent)` → writes tests/mocks/connect-hint-policy.test.js
- **AC-20261029-09-8**: WHEN the build driver prints a wave step on a fixture host with `policy.models.workers = {"model":"opus","effort":"medium"}` THE SYSTEM SHALL print the header `spawn one long-lived Agent {model: opus, effort: medium} per layer above and KEEP it`; without a `policy` block it SHALL print `Agent {model: sonnet, effort: medium}` in that header → rewrites tests/consistency/model-placement.test.js :: AC-20261029-01-8
- **AC-20261029-09-9**: WHEN the review driver prints the REVIEWER step on a fixture host with `policy.models.reviewer = {"model":"opus","effort":"high"}` and `policy.models.disposer = {"model":"sonnet","effort":"high"}` THE SYSTEM SHALL print `Agent {subagent_type: "spec:reviewer", model: opus, effort: high}`, and its DISPOSITIONS step SHALL print `Agent {subagent_type: "spec:disposer", model: sonnet, effort: high}`; without a `policy` block the same steps SHALL print `model: fable, effort: low` and `model: opus, effort: medium` respectively → writes tests/review/review-driver-policy.test.js

## Assumptions (escalation triggers)

- A1: Spec 08 is `done` before this spec builds, so `policy()` and `POLICY_DEFAULTS` exist in `host-config.js` and the reviewer default is `fable`/`low`. — **if false:** blocked; build 08 first (the state gate's `depends_on` check).
- A2: The review ledger row's `tests` key is optional for every consumer (`verdict.js`, `fleet-reader`, `tests/review/review-driver-close-expiry.test.js` asserts it only on the classify path). — **if false:** write `tests: {"born": 0, "kept": 0, "retired": 0, "off": "policy"}` and amend D4 and AC-20261029-09-5.
- A3: `tests/consistency/model-placement.test.js`'s AC-20261029-01-8 is the only pin that greps the driver SOURCE for the literal `Agent {model: sonnet, effort: medium}`; `tests/build/build-driver-orchestrator-only.test.js` asserts the printed wave step and keeps passing because the default output is unchanged. — **if false:** the build rewrites the additional pin against the printed default and records the deviation.
- A4: `mocks-driver.js` reads the config through `readConfig` on every call (`walkBlock()`), so adding a `policy()` read beside it needs no cache invalidation. — **if false:** read `policy(root)` inside `printScreensStep` directly.
- A5: `merge-back.sh inspect` prints its `RECOMMEND:` line at the start of a line (`note "RECOMMEND: …"`), so a line filter removes exactly it. — **if false:** filter on the substring `RECOMMEND:` anywhere in the line.

## Rationale

Spec 08 made the block exist; this spec makes it true. The split follows the decomposition cap
(fourteen source rows between them) and lands in order because every reader imports the
accessor 08 adds. Each reader is a one-line arm on an existing print site: no new state, no
new question, no new step. The two defaults that visibly change output are deliberate and
named in the Goal: the connect hint goes quiet unless the host opted into the hosted service
(the audit's reason for row 12), and the dispatch lines now spell `model`/`effort` explicitly,
which is what lets a host override the agent file's frontmatter at all.

`mergeStrategy` strips `RECOMMEND:` rather than ignoring it so the step text cannot carry two
answers; the inspect history stays because conflict repair reads it. `testExpiry: off` omits
the ledger `tests` key rather than writing zeros so a fleet reader never sums an invented
classification. The plan-lock commit is the one explicit `git add` of the ledger the spike in
08 showed would refuse an ignored path; every other staging site already skips ignored paths.

Rejected: reading the policy in `spec-state-gate.sh` to enforce `directLaneToMain` at commit
time (the gate is a hook surface — critical tier — and the lane is told apart at commit by
branch presence, which doctrine already states); a `policy` read in `merge-back.sh` (critical
surface; the driver and the command are the two callers and both read it before invoking).

## Canonical Delta

docs/canonical/pipeline.md, one paragraph under the run paragraph: "`policy.worktreePerSpec`
is read by `/spec:run` Step 0, `policy.mergeStrategy` by the review MERGE step and `/git:merge`,
`policy.testExpiry` by the review CLOSE step and doctor check 20, `policy.reviewService` by the
wireframe driver's connect hint, and `policy.models` by every driver dispatch line; absent keys
print today's lines." The reviewer/disposer dispatch sentences add "the printed model and effort
come from the host policy, defaulting to the seat table".
docs/canonical/review-close.md: one sentence that `testExpiry: off` skips classification and
omits the row's `tests` key.
