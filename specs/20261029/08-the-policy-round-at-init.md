---
date: 2026-10-29
status: draft
tier: critical           # edits spec/templates/grounding-contract.md (hash-stamped into every host) and spec/scripts/init-gen.js's permission writes
area: bootstrap
breaking: false
depends_on: [specs/20261029/04-the-four-questions-that-did-not-exist.md]
brief: n/a
---

# The policy round at init

## Goal

The standing policies the plugin imposes on a host today without asking — how git is used, whether
spec tests expire, whether run history is committed, whether the hosted review service is used,
which model runs each seat, what counts as high-risk — are asked once at `/spec:init` in two
rounds of up to four questions, stored in `.claude/spec.config.json` under a `policy` block, and
read by the commands that act on them. A host that never answers keeps today's defaults. Done
means every policy below has one config key, one default, one reader, and one place it is asked.

Source: docs/audit/question-points-and-model-placement-2026-10-29.md Part 3 rows 4, 9, 10, 11, 12, 16, 17, 18, 21, 22.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | The grounding contract gains an optional `policy` block with these keys and defaults: `worktreePerSpec: true`, `directLaneToMain: true`, `mergeStrategy: "derived" \| "merge-commit" \| "squash" \| "rebase-ff"` (default `"derived"`), `testExpiry: "classify" \| "off"` (default `"classify"`), `ledgerCommitted: true`, `reviewService: "terminal" \| "hosted"` (default `"terminal"`), `models: {planner, workers, reviewer, disposer, lookups}` each `{model: <alias>, effort: <level>}` (defaults = core § Model Placement table), `riskTiers: [<strings>]` (default: the Risk Tiers section's bullets). One contract edit (AC-20261029-08-1) | One block, one hash bump, every policy in the audit's init column. |
| D2 | `/spec:init` Phase 3 asks the block in two `AskUserQuestion` rounds of four, every question pre-filled with the derived default as the recommended option and a consequence per option; round 1: git workflow (worktree, direct lane, merge shape) and test expiry; round 2: ledger committed, review service, model mix (one question: "defaults from the plugin's seat table (Recommended)" / "cheaper: Sonnet reviews too" / "I will edit the block"), risk tiers (multi-select over the derived list plus `auth`, `money`, `migrations`, `data deletion`, `public API`, `PII`). A dismissed round keeps the defaults and prints `📌 policy defaults kept — edit .claude/spec.config.json policy to change (veto anytime)` (AC-20261029-08-2, AC-20261029-08-3) | Asked once per repo, in the command that already profiles it. A dismissal must not stop init (unlike a mid-run question). |
| D3 | Readers: `/spec:run` Step 0 reads `policy.worktreePerSpec` (false → in place without `--in-place`); `core.md` § Pipeline Entry's Direct lane reads `policy.directLaneToMain` (false → every change takes a branch through `/spec:plan` or `/spec:fix` on a branch); the review MERGE step and `/git:merge` read `policy.mergeStrategy` (`derived` → `inspect`'s RECOMMEND, else the named strategy); the review CLOSE step reads `policy.testExpiry` (`off` → no classification line, `/spec:doctor` check 20 reports `disabled by policy`); `/git:commit` and the drivers read `policy.ledgerCommitted` (false → `.claude/spec-runs.jsonl` and `.claude/spec-runs/` are added to `.gitignore` at init and never staged); `/spec:mocks` reads `policy.reviewService` (`terminal` → never prints the connect suggestion); every dispatch line reads `policy.models.<seat>` (absent → the doctrine table) (AC-20261029-08-4 … AC-20261029-08-9) | A key nobody reads is not a policy. |
| D4 | `/spec:init` Phase 5 prints the permission allowlist it will merge into `.claude/settings.json` and the host files it will create (health endpoint, seed script, README section, `.worktreeinclude`) as one `Confirm before writing: N permissions, M files` `AskUserQuestion`, mirroring `/spec:enforce` Phase 4 (AC-20261029-08-10) | Writing permissions and application source from a bootstrap is the one init action the audit marked as security-relevant. |
| D5 | `/spec:doctor` check 23: the `policy` block's keys are all known, values in range, and each reader's surface agrees (e.g. `ledgerCommitted: false` with a tracked ledger → drift) (AC-20261029-08-11) | Drift is how a policy silently stops being true. |
| D6 | `spec/.claude-plugin/plugin.json` and `git/.claude-plugin/plugin.json` bumped via `node scripts/plugin-bump.js --bump --plugin <name> --changelog "<paragraph>"`. `[no-ac: reviewer-held]` | Two plugin directories. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/templates/grounding-contract.md | MODIFY | doctrine | `policy` block (the one contract edit) (D1) |
| spec/scripts/lib/host-config.js | MODIFY | scripts | `policy()` accessor with defaults; validation (D1, D5) |
| spec/commands/init.md | MODIFY | doctrine | Phase 3 two rounds (D2); Phase 5 confirm (D4) |
| spec/scripts/init-gen.js | MODIFY | scripts | writes the `policy` block from answers or defaults; `ledgerCommitted:false` → gitignore lines; prints the permission/file manifest for D4 |
| spec/commands/run.md | MODIFY | doctrine | reads `worktreePerSpec` (D3) |
| spec/doctrine/core.md | MODIFY | doctrine | § Pipeline Entry reads `directLaneToMain`; § Model Placement: "a host `policy.models` overrides a seat" (D3) |
| spec/doctrine/stages/stage-review.md | MODIFY | doctrine | MERGE reads `mergeStrategy`; CLOSE reads `testExpiry` (D3) |
| spec/scripts/spec-review-driver.js | MODIFY | scripts | MERGE/CLOSE step texts read policy (D3) |
| spec/scripts/spec-build-driver.js | MODIFY | scripts | wave step prints `policy.models.workers` (D3) |
| git/commands/merge.md | MODIFY | doctrine | reads `mergeStrategy` (D3) |
| git/commands/commit.md | MODIFY | doctrine | reads `ledgerCommitted` (D3) |
| spec/commands/mocks.md | MODIFY | doctrine | reads `reviewService` (D3) |
| spec/scripts/mocks-driver.js | MODIFY | scripts | connect suggestion gated on policy (D3) |
| spec/commands/doctor.md | MODIFY | doctrine | check 23 (D5) |
| spec/.claude-plugin/plugin.json | MODIFY | other | bump (D6) |
| git/.claude-plugin/plugin.json | MODIFY | other | bump (D6) |
| tests/host-config/policy-block.test.js | CREATE | tests | AC-20261029-08-1, AC-20261029-08-11 |
| tests/init-gen/policy-round.test.js | CREATE | tests | AC-20261029-08-2, AC-20261029-08-3, AC-20261029-08-10 |
| tests/consistency/policy-readers.test.js | CREATE | tests | AC-20261029-08-4 … AC-20261029-08-9 |

## Contracts

```json
"policy": {
  "worktreePerSpec": true,
  "directLaneToMain": true,
  "mergeStrategy": "derived",
  "testExpiry": "classify",
  "ledgerCommitted": true,
  "reviewService": "terminal",
  "models": {
    "planner":  {"model": "fable",  "effort": "high"},
    "workers":  {"model": "sonnet", "effort": "medium"},
    "reviewer": {"model": "opus",   "effort": "high"},
    "disposer": {"model": "opus",   "effort": "medium"},
    "lookups":  {"model": "haiku",  "effort": "low"}
  },
  "riskTiers": ["auth", "money", "migrations", "data deletion", "public API", "PII"]
}
```

`host-config.js` exports `policy(root)` → the block with defaults filled; `validatePolicy(block)` → `[]` or finding strings (unknown key, out-of-enum value, non-alias model).

## Acceptance Criteria

- **AC-20261029-08-1**: WHEN `policy(root)` reads a config with no `policy` block THE SYSTEM SHALL return the full default block above; with `{"mergeStrategy":"squash"}` it SHALL return the defaults with `mergeStrategy: "squash"`; `validatePolicy({"mergeStrategy":"rebase"})` SHALL return one finding naming `mergeStrategy` → writes tests/host-config/policy-block.test.js
- **AC-20261029-08-2**: WHEN `spec/commands/init.md` Phase 3 is read THE SYSTEM SHALL contain exactly two `AskUserQuestion` rounds for the policy block, the first naming `worktree`, `direct`, `merge` and `expiry`, the second naming `ledger`, `review service`, `model` and `risk`, each with `(Recommended)` → writes tests/init-gen/policy-round.test.js
- **AC-20261029-08-3**: WHEN `init-gen.js generate` runs with no `policy` answers THE SYSTEM SHALL write the default block and print `📌 policy defaults kept`; with answers `{"ledgerCommitted": false}` it SHALL write that value and append `.claude/spec-runs.jsonl` and `.claude/spec-runs/` to `.gitignore` → writes tests/init-gen/policy-round.test.js
- **AC-20261029-08-4**: WHEN `spec/commands/run.md` Step 0 is read THE SYSTEM SHALL contain `policy.worktreePerSpec` and the sentence that `false` runs in place → writes tests/consistency/policy-readers.test.js
- **AC-20261029-08-5**: WHEN `spec/doctrine/core.md` § Pipeline Entry is read THE SYSTEM SHALL contain `policy.directLaneToMain` → writes tests/consistency/policy-readers.test.js
- **AC-20261029-08-6**: WHEN the review driver's MERGE step prints for a host with `mergeStrategy: "squash"` THE SYSTEM SHALL print `📌 Auto-picked squash — host policy (veto anytime)` and SHALL NOT print `RECOMMEND:`; with `"derived"` it SHALL print `RECOMMEND:` → writes tests/consistency/policy-readers.test.js
- **AC-20261029-08-7**: WHEN the review driver's CLOSE step prints for a host with `testExpiry: "off"` THE SYSTEM SHALL NOT print the `🧹` retirable-tests line and SHALL print `test expiry: off by policy` → writes tests/consistency/policy-readers.test.js
- **AC-20261029-08-8**: WHEN the mocks driver's terminal SCREENS step prints for a host with `reviewService: "terminal"` THE SYSTEM SHALL NOT print `/spec:connect connects it`; with `"hosted"` and no `walkthrough` block it SHALL → writes tests/consistency/policy-readers.test.js
- **AC-20261029-08-9**: WHEN the build driver's wave step prints for a host with `policy.models.workers = {"model":"opus","effort":"medium"}` THE SYSTEM SHALL print `Agent {model: opus, effort: medium}`; without the block it SHALL print `Agent {model: sonnet, effort: medium}` → writes tests/consistency/policy-readers.test.js
- **AC-20261029-08-10**: WHEN `init-gen.js generate --dry-run` runs on a host with 3 new permissions and 2 files to create THE SYSTEM SHALL print `Confirm before writing: 3 permissions, 2 files` followed by each item, and `spec/commands/init.md` Phase 5 SHALL contain an `AskUserQuestion` on that line → writes tests/init-gen/policy-round.test.js
- **AC-20261029-08-11**: WHEN `/spec:doctor` check 23 runs on a host with `ledgerCommitted: false` and a tracked `.claude/spec-runs.jsonl` THE SYSTEM SHALL report `policy drift: ledgerCommitted=false but .claude/spec-runs.jsonl is tracked` → writes tests/host-config/policy-block.test.js

## Assumptions (escalation triggers)

- A1: The grounding contract has had no edit in this spec's sibling set (04–07 touch it only in 04, for `rollbackCommand`); the ordering `depends_on: 04` keeps one contract edit per spec and one hash bump each. — **if false:** fold `rollbackCommand` into this spec's single edit and record the deviation.
- A2: `/spec:doctor`'s next free check ordinal is 23 (22 is the catalogue re-run). — **if false:** take the next free ordinal and amend every mention (rules § Gotchas, third surface).
- A3: `[NEEDS CLARIFICATION: `directLaneToMain: false` semantics — does a Direct-lane change then require a spec (heaviest) or a branch + `/git:merge` (lightest)? Default here: branch + merge, no spec.]`
- A4: `[NEEDS CLARIFICATION: the model-mix question's "cheaper" option — Sonnet reviewer at high, or Opus reviewer at medium? The audit's cost section argues effort first; default: Opus at medium.]`
- A5: `[NEEDS CLARIFICATION: is `riskTiers` a list of strings the plan reads as triggers, or does it rewrite the host rules file's § Risk Tiers bullets at init? Default: it is written INTO § Risk Tiers at init and the config key is provenance only.]`

## Rationale

The audit's deepest finding was that the plugin mixes policy (what the pipeline guarantees) with
preferences (how this team works), and hard-codes both. The six-spec plan separates them: this
spec moves every preference into one config block with a default equal to today's behaviour, so an
owner who answers nothing sees no change, and an owner who answers once never sees the question
again. Model mix lands here rather than in doctrine because the audit's cost analysis showed the
single biggest lever is which model the owner's own session runs, which only the owner can set.

The two rounds are asked at init because that is the one moment the owner is already answering
repo questions and because every reader is a command that runs later. The confirm-before-writing
step copies `/spec:enforce`'s existing pattern rather than inventing a new one.

Rejected: a `/spec:policy` command. A new command needs frontmatter, a spec-paths key and a
`shared-for` list; editing the block by hand plus `/spec:doctor` check 23 covers the re-answer
case at no new surface.

## Canonical Delta

docs/canonical/bootstrap.md: new section "Policy block" describing the keys, defaults, the two
init rounds, the readers, and `/spec:doctor` check 23.
docs/canonical/pipeline.md: one sentence under the run paragraph: "`policy.worktreePerSpec`,
`policy.mergeStrategy` and `policy.testExpiry` are read by run, merge and close respectively."
