---
date: 2026-10-29
status: draft
tier: critical           # touches spec/scripts/spec-review-driver.js (prototype close) and git/commands/commit.md (staging of secrets)
area: doctrine
breaking: false
depends_on: []
brief: n/a
---

# The four questions that did not exist

## Goal

The pipeline stops to ask the owner at the four places where a wrong silent default cannot be
undone, and nowhere else new: a commit that would stage a secret, a production verification that
failed with no rollback path, a critical-tier spec about to lock, and a prototype whose database
and branch are about to be deleted. Done means each of the four has one question with a
recommended default, each fires only when its trigger is present, and a run that never hits a
trigger sees no new prompt.

Source: docs/audit/question-points-and-model-placement-2026-10-29.md Part 3 rows 1, 2, 3, 8.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `/git:commit` step 1 runs a deterministic secrets scan over the files `git add -A` would stage: path patterns (`.env`, `.env.*`, `*.pem`, `*.key`, `*.p12`, `id_rsa*`, `*credentials*`, `*secret*`) plus content patterns (`AKIA[0-9A-Z]{16}`, `-----BEGIN [A-Z ]*PRIVATE KEY-----`, `ghp_[A-Za-z0-9]{36}`, `sk-[A-Za-z0-9]{20,}`, `xox[baprs]-`). Any hit → ONE `AskUserQuestion` naming the files: "exclude these from the commit (Recommended)" / "stage anyway". The rule "warn but still stage them" is deleted (AC-20261029-04-1, AC-20261029-04-2) | A secret in history is the one commit mistake that cannot be undone by a later commit. The scan is a script (`spec/scripts/secrets-scan.js`, exit 0 clean / 1 hits / 2 usage) so the question fires on evidence, never on a model's guess. |
| D2 | `/spec:release` Phase 3.3 gains a rollback step: when production verification fails, ONE `AskUserQuestion` — "roll back to the previous build (Recommended)" / "leave production as is and investigate" — where the rollback runs the config's optional `release.rollbackCommand` (added to the grounding contract's `release` block, `{build}` placeholder = the previous release row's build id) and records `production rolled back` on the release row; a host without `rollbackCommand` gets the question with the first option reading "no rollback command is configured — add `release.rollbackCommand`" and the run still STOPs GATE_RED (AC-20261029-04-3, AC-20261029-04-4) | Today the release records GATE_RED and stops with production unhealthy and no path back. The command is host-declared, never invented (core § Release Stage). |
| D3 | `/spec:plan` Lock gains step 2b for `tier: critical`: after every lint is green and before the ledger row, ONE `AskUserQuestion` presenting the spec path, the Risk Tiers trigger that made it critical, the Decision count and the AC count, with "lock (Recommended)" / "keep as draft". `spec-state-gate.sh` is unchanged; the step is the command's, enforced by a test on plan.md's Lock section (AC-20261029-04-5) | core § Tiers already says "the user confirms the lock" on critical; plan.md never implemented it, so critical specs locked silently (audit PLAN-05). |
| D4 | The review driver's prototype close (the last citing spec's merge) prints a notice before deleting: the stem, the branch, the database hook it will run, and the count of commits on `proto/<stem>` not reachable from the target branch. Zero unreachable commits → proceed (notify only); one or more → ONE `AskUserQuestion` "delete the prototype (Recommended) — its contract and pictures are kept under design/prototypes/" / "keep the worktree and branch; close later with `--mark closed`" (AC-20261029-04-6, AC-20261029-04-7) | A prototype's unmerged commits are the only artifact the close destroys that nothing else holds; the contract and captures survive regardless. Notify-and-proceed where nothing is lost, ask where something is. |
| D5 | Every question above passes `question-style-gate.js` tier 1 as authored: option descriptions ≥ 25 chars carrying the consequence, the recommended option first with its reason, no two backticked identifiers in the question text. `[no-ac: enforced by the existing hook; the four questions' texts are pinned by AC-1, -3, -5, -6]` | core § Question Style. |
| D6 | `spec/.claude-plugin/plugin.json` and `git/.claude-plugin/plugin.json` are each bumped through `node scripts/plugin-bump.js --bump --plugin <name> --changelog "<paragraph>"`. `[no-ac: reviewer-held check against the merge base]` | Two plugin directories are touched (rules § Gotchas, fourth surface). |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/secrets-scan.js | CREATE | scripts | D1 scanner: `--root <dir> [--staged|--paths <file>] --json`; exit 0/1/2; header lists the patterns |
| spec/bin/spec-paths | MODIFY | scripts | `secrets-scan` key |
| spec/entrypoints.json | MODIFY | other | row for the new script and its caller |
| git/commands/commit.md | MODIFY | doctrine | step 1 runs the scan, step 2 asks on hits; rule 5 "warn … but still stage them" deleted (D1) |
| spec/commands/release.md | MODIFY | doctrine | Phase 3.3 rollback question; Phase 0.1 interview includes `rollbackCommand` when a `promoteCommand` exists (D2) |
| spec/scripts/release-legs.js | MODIFY | scripts | `rollback` leg runs `release.rollbackCommand` with `{build}` and records the outcome (D2) |
| spec/templates/grounding-contract.md | MODIFY | doctrine | `release.rollbackCommand` optional field (one contract edit — the cap) (D2) |
| spec/commands/plan.md | MODIFY | doctrine | Lock step 2b critical confirm (D3) |
| spec/scripts/spec-review-driver.js | MODIFY | scripts | prototype close prints the notice and refuses to delete while unreachable commits exist and no `--mark prototype-delete-confirmed` was recorded (D4) |
| spec/doctrine/stages/stage-review.md | MODIFY | doctrine | MERGE step: prototype close notice / question (D4) |
| spec/.claude-plugin/plugin.json | MODIFY | other | bump (D6) |
| git/.claude-plugin/plugin.json | MODIFY | other | bump (D6) |
| tests/commit/secrets-scan.test.js | CREATE | tests | AC-20261029-04-1, AC-20261029-04-2 |
| tests/release-legs/rollback.test.js | CREATE | tests | AC-20261029-04-3, AC-20261029-04-4 |
| tests/consistency/critical-tier-doctrine.test.js | MODIFY | tests | AC-20261029-04-5 |
| tests/review/prototype-close-notice.test.js | CREATE | tests | AC-20261029-04-6, AC-20261029-04-7 |

## Contracts

```
secrets-scan.js --root <dir> (--staged | --paths <file>) [--json]
  stdout (--json): {"hits":[{"path":"...","reason":"path:<pattern>"|"content:<pattern>","line":N|null}]}
  exit 0 = no hits · 1 = hits · 2 = usage / unreadable root
```

Grounding contract, `release` block, new optional field:

```
"rollbackCommand": "<shell, {build} = previous release row's build id>"   // optional
```

Release row gains `rollback: "not-needed" | "rolled-back" | "declined" | "unavailable"` when Phase 3.3 ran.

## Behavior

- Commit: scan → hits → question → on "exclude", the named paths are left unstaged and listed in
  the commit report; on "stage anyway", the commit proceeds and the report names them.
- Release: production verify red → rollback question → `rollback` leg → row field → STOP GATE_RED
  either way (a rolled-back production is still a failed release).
- Plan: critical lock → confirm → "keep as draft" leaves `status: draft`, prints the re-run.
- Prototype close: notice always; question only with unreachable commits.

## Acceptance Criteria

- **AC-20261029-04-1**: WHEN `secrets-scan.js --root <r> --staged --json` runs over a tree whose index holds `.env` (any content) and `src/a.js` containing `AKIAABCDEFGHIJKLMNOP` THE SYSTEM SHALL exit 1 and print hits for both (e.g. `{"path":".env","reason":"path:.env"}` and `{"path":"src/a.js","reason":"content:AKIA…","line":1}`); over a tree with neither it SHALL exit 0 with `{"hits":[]}` → writes tests/commit/secrets-scan.test.js
- **AC-20261029-04-2**: WHEN `git/commands/commit.md` is read THE SYSTEM SHALL contain `spec-paths secrets-scan`, an `AskUserQuestion` whose first option label contains `exclude` and `(Recommended)`, and SHALL NOT contain `but still stage them` → writes tests/commit/secrets-scan.test.js
- **AC-20261029-04-3**: WHEN `release-legs.js` runs the `rollback` leg with `release.rollbackCommand` = `echo rolled {build}` and a previous release row whose build id is `b-7` THE SYSTEM SHALL execute `echo rolled b-7`, record `{"leg":"rollback","exit":0,"observed":{"build":"b-7"}}` in the manifest, and the release row SHALL carry `rollback: "rolled-back"`; without `rollbackCommand` the leg SHALL record `{"leg":"rollback","exit":4,"observed":{"reason":"unavailable"}}` and the row `rollback: "unavailable"` → writes tests/release-legs/rollback.test.js
- **AC-20261029-04-4**: WHEN `spec/commands/release.md` is read THE SYSTEM SHALL contain, inside Phase 3.3, an `AskUserQuestion` whose first option label contains `roll back` and `(Recommended)`, and the grounding contract SHALL list `rollbackCommand` under the `release` block (e.g. the line `"rollbackCommand"` present → pass) → writes tests/release-legs/rollback.test.js
- **AC-20261029-04-5**: WHEN `spec/commands/plan.md`'s `## Lock` section is read THE SYSTEM SHALL contain a step that applies only to `tier: critical`, names `AskUserQuestion`, and offers `lock (Recommended)` and `keep as draft` (e.g. the substring `tier: critical` within 400 chars before `AskUserQuestion` → pass) → writes tests/consistency/critical-tier-doctrine.test.js
- **AC-20261029-04-6**: WHEN the review driver reaches the prototype close for a `proto/<stem>` branch with 0 commits unreachable from the target THE SYSTEM SHALL print `prototype <stem>: 0 unmerged commits — deleting worktree, branch and database` and proceed; with 2 unreachable commits it SHALL print `prototype <stem>: 2 unmerged commits` plus the instruction to ask, and refuse the deletion until `--mark prototype-delete-confirmed` is recorded (exit 2 naming the mark) → writes tests/review/prototype-close-notice.test.js
- **AC-20261029-04-7**: WHEN `--mark prototype-delete-confirmed --keep` is recorded THE SYSTEM SHALL leave the worktree and branch in place, print the `--mark closed` paste for later, and the review SHALL still reach DONE → writes tests/review/prototype-close-notice.test.js

## Assumptions (escalation triggers)

- A1: `git add -A`'s staging set is derivable before staging as `git status --porcelain` untracked + modified paths; the scan runs over that set, not the index. — **if false:** scan after `git add -A` and `git reset -- <path>` on "exclude".
- A2: The release manifest's leg name set is open to a new `rollback` member without breaking `verdict.js`'s closed oracle set (it reads legs by name from the manifest; `[oracle:]` tags are a separate closed set). — **if false:** add `rollback` to the oracle enum in the same spec and record the deviation.
- A3: `[NEEDS CLARIFICATION: does the prototype close question belong to the review driver (one more mark) or to /git:merge's proto/* refusal path? The driver is assumed.]`
- A4: `[NEEDS CLARIFICATION: content patterns — JJ to confirm the provider token shapes worth scanning for beyond AWS, GitHub, OpenAI-style and Slack; the path list is the floor.]`

## Rationale

The audit found 90 question points and 22 silent policies; these four are the only ones where the
default, if wrong, destroys something no later step restores: a secret in history, an unhealthy
production with no path back, a critical lock the owner never saw, and unmerged prototype
commits. Everything else in the audit is reversible and belongs to the question-diet specs.

Each question is gated on evidence a script produced (scan hits, a red verify, a tier value, an
unreachable-commit count), so a run that never meets a trigger sees nothing new. The prototype
case splits notify from ask on the one fact that matters — whether anything would be lost.

Rejected: a hook that blocks `git commit` on secrets. Hooks cannot ask a question (Claude Code
docs); a PreToolUse `ask` is only a permission prompt with no option text, and `deny` would leave
the session to guess the remedy.

## Canonical Delta

docs/canonical/release-pipeline.md: after the production verification paragraph, add "A failed
production verification offers one rollback question; `release.rollbackCommand` (optional,
host-declared) runs with `{build}` = the previous release row's build id and the row records
`rollback`. The release still ends GATE_RED."

docs/canonical/pipeline.md, the commit paragraph: "`/git:commit` scans the would-be staging set
with `secrets-scan.js`; a hit is a question, never a warning that stages anyway."
