---
date: 2026-10-29
status: done
build_base: main
tier: critical           # touches spec/scripts/verdict.js and spec/templates/grounding-contract.md (rules § Risk Tiers), spec/bin/spec-paths, and the review driver's prototype close
area: doctrine
breaking: false
depends_on: []
brief: n/a
open_markers: 0
spiked: 2026-10-29
diff_base: ff4eb9c15102f012eeeb80e79a648a9c0c43e0f7
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
| D1 | `/git:commit` Step 1's parallel batch gains `node "$(spec-paths secrets-scan)" --root . --worktree --json` beside `git add -A` (the scanner reads the working tree, never the index, so order inside the batch is irrelevant). Exit 1 → ONE `AskUserQuestion` naming every hit path (text and options in Contracts), first option "Exclude them (Recommended)"; on exclude the session runs `git reset -q -- <hit paths>` and the commit report's `warns` slot lists them as `kept out of this commit: <paths>`; on "Stage them anyway" the commit proceeds and `warns` lists them as `staged on your say-so: <paths>`. Exit 2 (usage, not a git repo) prints one `⚠️ secrets scan skipped — <stderr line>` and the commit proceeds; `spec-paths` absent on PATH (git plugin installed alone) prints `⚠️ secrets scan skipped — the spec plugin is not installed` and proceeds. Rule 5 "Warn about sensitive files (.env, credentials) but still stage them" is replaced by "**Secrets never stage silently** — a scan hit is a question; staging anyway is the user's explicit answer, never a default" (AC-20261029-04-1, AC-20261029-04-2) `[asked: docs/audit/question-points-and-model-placement-2026-10-29.md Part 3 row 1 — the audit chose a hard stop "exclude (Recommended) / stage anyway" over the warn-and-stage rule]` | A secret in history is the one commit mistake a later commit cannot undo. The scan is a script (exit 0 clean / 1 hits / 2 usage) so the question fires on evidence, never on a model's guess; parallel placement keeps Step 1 at one approval. Fail-open on exit 2 is deliberate: a broken scanner must not wedge every commit in every host, and the ⚠️ line keeps the skip visible. |
| D1a | `spec/scripts/secrets-scan.js` (`spec-paths secrets-scan`; `spec/entrypoints.json` row with entry point `git/commands/commit.md`): `--root <dir> (--worktree \| --paths <file>) [--json]`. `--worktree` = every path `git status --porcelain -z --untracked-files=all` lists under `--root` that still exists on disk (deletions skipped; ignored files never listed — the same set `git add -A` stages); `--paths` = one repo-relative path per line. Two detectors, both over the basename / the file text: **path** — `.env`, `.env.*` except `.env.example`, `.env.sample`, `.env.template`; `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.jks`; `id_rsa`, `id_rsa.*`, `id_ed25519`, `id_ed25519.*`; `credentials.json`, `service-account*.json`, `secrets.json`, `secrets.yml`, `secrets.yaml`, `.netrc`, `.pgpass`. **content** (first 1 MiB; a file whose first 8 KiB holds a NUL byte is binary and skipped; a line containing `secrets-scan:allow` is skipped) — `AKIA[0-9A-Z]{16}`, `-----BEGIN [A-Z ]*PRIVATE KEY-----`, `gh[pousr]_[A-Za-z0-9]{36}`, `github_pat_[A-Za-z0-9_]{22,}`, `sk-[A-Za-z0-9_-]{20,}`, `xox[baprs]-[A-Za-z0-9-]{10,}`, `(sk\|rk)_live_[A-Za-z0-9]{20,}`, `AIza[0-9A-Za-z_-]{35}`, `_authToken\s*=\s*\S+`. The list is closed and lives in the script header; no host configuration. A path hit short-circuits that file's content scan (AC-20261029-04-1) `[guards: spec/bin/spec-paths — every command resolves scripts through it; a wrong key breaks commands silently]` | Basename matching keeps this repo's own `secrets-scan.js` and its test out of the path detector (a `*secret*` glob would flag them on every commit). The allow marker follows gitleaks (`gitleaks:allow`) and detect-secrets (`pragma: allowlist secret`): the one escape for a documented false positive, on the line, in the diff. |
| D2 | `/spec:release` Phase 3 gains step 4, **rollback**, entered only after step 3 appended `production` = `failed`. With `release.rollbackCommand` configured: ONE `AskUserQuestion` (text in Contracts), first option "Roll back (Recommended)" → `node "$(spec-paths release-legs)" rollback --root . --manifest {manifestPath} --decision run`; "Leave production as it is" → `--decision decline`. Without it: no question; print `⚠️ no release.rollbackCommand configured — production stays on the failed build` and run `--decision run` (which records `unavailable`). Every arm then STOPs GATE_RED to Phase 4 exactly as today; the `next` slot on the unavailable arm reads `add release.rollbackCommand to .claude/spec.config.json, then re-run /spec:release`. Phase 0.1 lists `rollbackCommand` beside `promoteCommand` as an optional field to derive or confirm (AC-20261029-04-3, AC-20261029-04-4) | Today the release records GATE_RED and stops with production unhealthy and no path back. The command is host-declared, never invented (core § Release Stage); a host with nothing to run gets a visible gap line, not a one-option question. |
| D2a | `release-legs.js rollback --root <dir> --manifest <path> --decision run\|decline [--out-dir <dir>]` is the sole emitter of the `rollback` row (grammar in Contracts). It refuses (exit 2) when the manifest has no `production` row or its result is not `failed`, and refuses a duplicate `rollback` row like `append`. `run` with a configured command executes it through the script's existing `sh()` discipline with cwd = `--root`, no placeholder substitution, retaining output under `--out-dir` when given, and records `rolled-back` (exit 0) or `failed` (command non-zero, exit 1); `run` without a configured command records `unavailable` (exit 1); `decline` records `declined` (exit 0). `verdict.js --profile release` copies a present rollback row's `observed.result` onto the release ledger row as `rollback`, placed after `production`; an absent row adds no key (AC-20261029-04-3, AC-20261029-04-5) `[guards: spec/scripts/verdict.js — the sole derivation of the review/release verdict word; never a second place that computes or asserts CLEAN]` | One emitter per session-observed leg is the existing rule (journeys, production); the spike shows verdict.js already tolerates the extra row and the word stays GATE_RED. No `{build}` placeholder: release ledger rows carry no build id, so the host's command must know its own previous build (`vercel rollback`, `fly releases rollback`, a tag re-push). |
| D2b | `spec/templates/grounding-contract.md` § Release gains `rollbackCommand` as an optional field: "a host command that returns production to the previous build; run with cwd = the repo root, no placeholders" — the one contract edit this spec makes (AC-20261029-04-4) `[guards: spec/templates/grounding-contract.md — its hash is stamped into every host's spec.config.json; edit only when the contract genuinely changes]` | Rules § Planning caps a spec at one contract edit; this is it. |
| D3 | `spec/commands/plan.md` § Lock gains step 2b, **Critical confirm**, applying only to `tier: critical`, after decision-lint and collision-closure are green and before the ledger row: ONE `AskUserQuestion` (text in Contracts) stating the spec path, the Risk Tiers trigger that made it critical, the Decision count and the AC count; "Lock it (Recommended)" continues to step 3; "Keep it as a draft" leaves `status: draft`, writes no ledger row, prints `re-run: /spec:plan {spec path}` and stops. `spec-state-gate.sh` is unchanged (AC-20261029-04-6) | core § Tiers already says "the user confirms the lock" on critical; plan.md never implemented it, so critical specs locked silently (audit PLAN-05). |
| D4 | The review driver's MERGE step owns the prototype question. When the closing spec carries `prototype: <stem>`, `design/prototypes/<stem>/status.json` exists without `marks.closed`, and every citing spec is `done`, the printed MERGE step computes `N = git rev-list --count <target>..proto/<stem>` and appends `prototype <stem>: N unmerged commits on proto/<stem>`. N = 0 → the line ends `— the close proceeds with the merge (notify only)`. N > 0 → the step prints the question to ask (text in Contracts) and the mark form `--mark merge-strategy <strategy> --prototype delete\|keep`; `--mark merge-strategy` without `--prototype` exits 2 naming `--prototype` before any merge runs. The decision persists as `marks.prototypeClose = {unmerged: N, decision}`. `finishMerge` on `keep` deletes nothing and prints `prototype <stem> kept — N unmerged commits on proto/<stem>; close later: node <prototype-driver.js> <stem> --root <root> --mark closed`; on `delete` or N = 0 it prints `prototype <stem>: N unmerged commits — deleting worktree, branch and database` and closes through the prototype driver exactly as today. A missing `proto/<stem>` branch takes today's "still open" warning path unchanged. `spec/doctrine/stages/stage-review.md`'s MERGE bullet states the rule (AC-20261029-04-7, AC-20261029-04-8, AC-20261029-04-9) `[guards: spec/scripts/merge-back.sh — runs destructive git ops against host repos; exit-code alphabet is load-bearing for the review stage]` | A prototype's unmerged commits are the only artifact the close destroys that nothing else holds; the contract and captures survive regardless. Asking at the MERGE step (before the merge) keeps "a refusal never fails a landed merge" true and adds no driver state; `/git:merge` refuses `proto/*` outright and deletes nothing, so the question lives where the deletion is. |
| D5 | Every question above passes `question-style-gate.js` tier 1 as authored: option descriptions ≥ 25 chars carrying the consequence, the recommended option first with its reason, no two backticked identifiers in the question text. The four texts in Contracts are the ones the commands carry verbatim. `[no-ac: enforced by the existing PreToolUse hook at run time; the texts are spiked (S4) and pinned by AC-20261029-04-2, -4, -6, -9]` | core § Question Style. |
| D6 | `spec/.claude-plugin/plugin.json` and `git/.claude-plugin/plugin.json` are each bumped through `node scripts/plugin-bump.js --bump --plugin <name> --changelog "<paragraph>"`; the release-legs.js header's "two session-observed legs" becomes three and docs/canonical/release-pipeline.md follows (Canonical Delta). `[no-ac: plugin-bump.js --check in the gate is the oracle; reviewer-held against the merge base]` | Two plugin directories are touched (rules § Gotchas, fourth surface). |
| D7 | Build ruling (user, 2026-10-29): AC-20261029-04-8 no longer asserts `marks.prototypeClose` in the sidecar after DONE. The sidecar is deleted at DONE by design (`printDoneNow`), so the post-DONE read can never succeed; D4's `marks.prototypeClose` stays as MERGE-step working state written before the merge. The keep decision's lasting evidence is the kept branch and worktree, `marks.closed` unset, and the printed `--mark closed` paste — all still asserted (AC-20261029-04-8) | The scripts worker returned `blocked`: the AC promised a read of a file the existing DONE rule deletes. Recording the decision durably (a review ledger field) was offered and declined as extra scope. |
| D8 | Build ruling (user, 2026-10-29): `.claude/spec.config.json`'s `contractHash` is restamped to `spec-paths contract-hash` over the D2b contract edit, the same restamp every prior contract-editing spec made; `spec/entrypoints.json`'s D1a row is landed by the orchestrator (orchestrator-only file). `[no-ac: tests/consistency/contract-stamp.test.js's existing restamp pin is the oracle]` | D2b changes the contract hash by construction; the stale stamp reddened the existing pin, a file outside the File Plan on a critical-tier spec, so the scope widening was asked rather than auto-picked. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/secrets-scan.js | CREATE | scripts | D1a scanner: `--root <dir> (--worktree \| --paths <file>) [--json]`; exit 0/1/2; header lists the closed pattern list and the `secrets-scan:allow` marker |
| spec/bin/spec-paths | MODIFY | scripts | `secrets-scan` key + usage line (D1a) |
| spec/entrypoints.json | MODIFY | other | `spec/scripts/secrets-scan.js` → `git/commands/commit.md` (D1a) |
| .claude/spec.config.json | MODIFY | other | `contractHash` restamped over the D2b contract edit (D8) |
| git/commands/commit.md | MODIFY | doctrine | Step 1 batch gains the scan; Step 1b question on hits; rule 5 rewritten (D1) |
| spec/commands/release.md | MODIFY | doctrine | Phase 3 step 4 rollback; Phase 0.1 lists `rollbackCommand` (D2) |
| spec/scripts/release-legs.js | MODIFY | scripts | `rollback` subcommand, row grammar in the header, "three session-observed legs" (D2a, D6) |
| spec/scripts/verdict.js | MODIFY | scripts | release row copies `rollback` from the manifest row (D2a) |
| spec/templates/grounding-contract.md | MODIFY | doctrine | § Release: `rollbackCommand` optional field (D2b) |
| spec/commands/plan.md | MODIFY | doctrine | § Lock step 2b critical confirm (D3) |
| spec/scripts/spec-review-driver.js | MODIFY | scripts | MERGE step prints the unmerged count and question; `--prototype delete\|keep` operand; `marks.prototypeClose`; finishMerge keep/delete arms (D4) |
| spec/doctrine/stages/stage-review.md | MODIFY | doctrine | MERGE bullet: prototype notice / question rule (D4) |
| spec/.claude-plugin/plugin.json | MODIFY | other | bump via plugin-bump.js (D6) |
| git/.claude-plugin/plugin.json | MODIFY | other | bump via plugin-bump.js (D6) |
| tests/commit/secrets-scan.test.js | CREATE | tests | AC-20261029-04-1, AC-20261029-04-2 |
| tests/release-legs/rollback.test.js | CREATE | tests | AC-20261029-04-3, AC-20261029-04-4, AC-20261029-04-5 |
| tests/consistency/critical-lock-confirm.test.js | CREATE | tests | AC-20261029-04-6 |
| tests/review/prototype-close.test.js | MODIFY | tests | AC-20261029-04-7, AC-20261029-04-8, AC-20261029-04-9 (reuses the file's `driveToMerge` harness) |

## Contracts

```
secrets-scan.js --root <dir> (--worktree | --paths <file>) [--json]
  stdout (--json): {"hits":[{"path":"<repo-relative>","reason":"path:<pattern>"|"content:<pattern>","line":N|null}]}
  stdout (plain):  one line per hit `<path>  <reason>[:<line>]`; `no secrets found` on 0 hits
  exit 0 = no hits · 1 = ≥1 hit · 2 = usage, --root not a git work tree, or --paths unreadable
```

```
release-legs.js rollback --root <dir> --manifest <path> --decision run|decline [--out-dir <dir>]
  row: {"leg":"rollback","exit":0|1,"observed":{"result":"rolled-back"|"failed"|"declined"|"unavailable"}}
       rolled-back 0 · declined 0 · failed 1 · unavailable 1
  exit 2 = usage, no production row, production result ≠ failed, duplicate rollback row
release ledger row (verdict.js --profile release): "rollback":"<result>" after "production", only when the manifest row exists
```

Grounding contract § Release, new optional field (the one contract edit):

```
"rollbackCommand": "<host command that returns production to the previous build; cwd = repo root, no placeholders>"
```

Review driver, MERGE step:

```
--mark merge-strategy <merge-commit|ff-only|squash|rebase-ff> [--prototype delete|keep]
  printed line: prototype <stem>: N unmerged commits on proto/<stem>[ — the close proceeds with the merge (notify only)]
  N > 0 and --prototype absent → exit 2: "--mark merge-strategy needs --prototype delete|keep — proto/<stem> carries N unmerged commits"
  sidecar: marks.prototypeClose = {"unmerged": N, "decision": "delete"|"keep"|null}
```

The four questions (verbatim; spiked green against question-style-gate tier 1, S4):

```
Q1 commit  — "These staged files look like secrets. Keep them out of this commit?"  (+ the hit paths as context)
   Exclude them (Recommended): They stay on disk but out of history, which is the only place a leaked secret cannot be removed from later
   Stage them anyway:          They go into the commit and into history, where a later commit cannot unpublish them
Q2 release — "Production is not serving the new build. Roll back to the previous build?"
   Roll back (Recommended):    Runs the host's configured rollback command now, so production serves the last good build while you investigate
   Leave production as it is: Production stays on the failed build until you act by hand; the release still records as failed
Q3 plan    — "This spec is critical tier because it touches <trigger>. Lock it now?"  (+ spec path, Decision count, AC count as context)
   Lock it (Recommended):      Every lint passed; locking makes the decisions binding for the build and the review
   Keep it as a draft:         Nothing changes; you can re-run the plan command after editing the spec
Q4 merge   — "The prototype has N commits that were never merged. Delete the prototype now?"
   Delete it (Recommended):    The worktree, branch and database go; its contract, pictures and tests stay under the design folder
   Keep it for now:            The worktree and branch stay; close it later by hand with the printed command
```

## Behavior

- Commit: Step 1 batch (add, status, diff, log, scan) → exit 1 → Q1 → exclude: `git reset -q --`
  the hit paths, report `warns` names them; stage anyway: commit proceeds, report `warns` names
  them. Exit 0: nothing new on screen.
- Release: production verify `failed` → configured command: Q2 → `rollback --decision run|decline`;
  no command: ⚠️ line + `--decision run` (records `unavailable`) → STOP GATE_RED either way (a
  rolled-back production is still a failed release).
- Plan: every lint green → `tier: critical` → Q3 → lock continues; keep leaves `status: draft`,
  no ledger row, prints the re-run.
- Merge: last citer of a prototype → the MERGE step prints the unmerged count; 0 → notify, merge
  closes the prototype as today; > 0 → Q4 → `--prototype delete` closes, `--prototype keep`
  leaves worktree and branch and prints the `--mark closed` paste. Either way the review reaches
  DONE.

## Acceptance Criteria

- **AC-20261029-04-1**: WHEN `secrets-scan.js --root <r> --worktree --json` runs in a git work tree whose uncommitted set holds `.env` (any content), `id_rsa`, `src/a.js` whose first line is `AKIA` immediately followed by the 16 uppercase letters `ABCDEFGHIJKLMNOP`, `.env.example`, and `src/ok.js` whose only such line ends in `secrets-scan:allow` THE SYSTEM SHALL exit 1 and print exactly three hits (e.g. `{"path":".env","reason":"path:.env","line":null}`, `{"path":"id_rsa","reason":"path:id_rsa","line":null}`, `{"path":"src/a.js","reason":"content:AKIA[0-9A-Z]{16}","line":1}`); over a work tree whose uncommitted set is only `src/b.js` containing `hello` it SHALL exit 0 printing `{"hits":[]}`; with `--root` pointing at a directory that is not a git work tree it SHALL exit 2 → writes tests/commit/secrets-scan.test.js
- **AC-20261029-04-2**: WHEN `git/commands/commit.md` is read THE SYSTEM SHALL contain `spec-paths secrets-scan` inside the `## Step 1` section, an `AskUserQuestion` whose first option label is `Exclude them (Recommended)`, the line `git reset -q -- `, the phrase `Secrets never stage silently`, and SHALL NOT contain `but still stage them` (e.g. `grep -c "but still stage them" git/commands/commit.md` → 0) → writes tests/commit/secrets-scan.test.js
- **AC-20261029-04-3**: WHEN `release-legs.js rollback --root <r> --manifest <m> --decision run` runs with `release.rollbackCommand` = `echo rolled > rolled.txt` and a manifest whose `production` row has result `failed` THE SYSTEM SHALL create `rolled.txt` under `<r>`, append `{"leg":"rollback","exit":0,"observed":{"result":"rolled-back"}}` and exit 0; with the command `exit 3` it SHALL append `{"leg":"rollback","exit":1,"observed":{"result":"failed"}}` and exit 1; without `rollbackCommand` it SHALL append `{"leg":"rollback","exit":1,"observed":{"result":"unavailable"}}` and exit 1; `--decision decline` SHALL append `{"leg":"rollback","exit":0,"observed":{"result":"declined"}}` and exit 0; over a manifest whose `production` row has result `verified` (or no production row) it SHALL exit 2 appending nothing; a second `rollback` call on a manifest already carrying a rollback row SHALL exit 2 appending nothing → writes tests/release-legs/rollback.test.js
- **AC-20261029-04-4**: WHEN `spec/commands/release.md` is read THE SYSTEM SHALL contain, inside `## Phase 3`, `release-legs)" rollback` and an `AskUserQuestion` whose first option label is `Roll back (Recommended)`; inside `## Phase 0` the literal `rollbackCommand`; and `spec/templates/grounding-contract.md` SHALL contain `rollbackCommand` inside its `## Release` section (e.g. `grep -c rollbackCommand spec/templates/grounding-contract.md` ≥ 1) → writes tests/release-legs/rollback.test.js
- **AC-20261029-04-5**: WHEN `verdict.js --manifest <m> --profile release --ledger` runs under a `--root` whose manifest carries every release leg green except `production` = `failed` followed by `{"leg":"rollback","exit":0,"observed":{"result":"rolled-back"}}` THE SYSTEM SHALL print `GATE_RED` and append a ledger row whose `production` is `"failed"` and whose `rollback` is `"rolled-back"` (e.g. the row's key order places `rollback` immediately after `production`); over the same manifest without the rollback row the appended row SHALL carry no `rollback` key → writes tests/release-legs/rollback.test.js
- **AC-20261029-04-6**: WHEN `spec/commands/plan.md`'s `## Lock` section is read THE SYSTEM SHALL contain a step that names `tier: critical` within 400 characters before `AskUserQuestion`, offers `Lock it (Recommended)` and `Keep it as a draft`, and places that step before the text `Ledger row` (e.g. `section.indexOf('Keep it as a draft') < section.indexOf('**Ledger row')` → true) → writes tests/consistency/critical-lock-confirm.test.js
- **AC-20261029-04-7**: WHEN a closed spec citing prototype `28-functional-prototype` as its only citer reaches MERGE with `proto/28-functional-prototype` carrying 0 commits unreachable from the target THE SYSTEM SHALL print `prototype 28-functional-prototype: 0 unmerged commits` in the MERGE step and, on `--mark merge-strategy ff-only` with no `--prototype` operand, print `prototype 28-functional-prototype: 0 unmerged commits — deleting worktree, branch and database`, close the prototype (branch gone, `marks.closed` set) and reach DONE; with 2 unreachable commits on the proto branch the MERGE step SHALL print `prototype 28-functional-prototype: 2 unmerged commits on proto/28-functional-prototype` and `--mark merge-strategy ff-only` without `--prototype` SHALL exit 2 with stderr containing `--prototype delete|keep`, leaving the proto branch, worktree and target branch unchanged (e.g. `git rev-list --count main..proto/28-functional-prototype` still 2) → writes tests/review/prototype-close.test.js
- **AC-20261029-04-8**: WHEN the same 2-unmerged-commit fixture is marked `--mark merge-strategy ff-only --prototype keep` THE SYSTEM SHALL land the merge, reach DONE, print `prototype 28-functional-prototype kept — 2 unmerged commits` and `--mark closed`, and leave `proto/28-functional-prototype` and its worktree in place with `marks.closed` unset (D7: `marks.prototypeClose` is MERGE working state, deleted with the sidecar at DONE, so it is not asserted after DONE); marked `--prototype delete` instead it SHALL print `prototype 28-functional-prototype: 2 unmerged commits — deleting worktree, branch and database`, delete the branch (e.g. `git branch --list 'proto/*'` → empty) and set `marks.closed` → writes tests/review/prototype-close.test.js
- **AC-20261029-04-9**: WHEN `spec/doctrine/stages/stage-review.md` is read THE SYSTEM SHALL contain, in the MERGE bullet, `unmerged commits`, `--prototype delete|keep`, and an `AskUserQuestion` whose first option label is `Delete it (Recommended)` (e.g. the substring `Delete it (Recommended)` present → pass) → writes tests/review/prototype-close.test.js

## Assumptions (escalation triggers)

- A1 (spiked S1, 2026-10-29): `git status --porcelain --untracked-files=all` lists exactly the paths `git add -A` stages (untracked, modified, deleted; ignored files absent), and the listing is the same before and after the add — so the scanner can run in Step 1's parallel batch reading the working tree. Observed: before add ` D .env / M src/a.js / ?? id_rsa / ?? newfile.txt`; after `git add -A`, `git diff --cached --name-only` = `id_rsa newfile.txt src/a.js`; `git reset -q -- id_rsa` left `?? id_rsa` with the rest staged. — **if false:** switch D1a to an index mode (`git diff --cached --name-only` + `git show :<path>`) run as a Step 1b after the add.
- A2 (spiked S3, 2026-10-29): `verdict.js --profile release` tolerates a manifest row whose leg is outside `RELEASE_LEGS` and the word is unchanged. Observed: production `failed` + rollback exit 1 → `GATE_RED` exit 1; rollback exit 0 → `GATE_RED` exit 1; `release-legs.js append --leg rollback` today → exit 2 `--leg must be journeys or production`, which is why D2a adds a subcommand rather than widening `append`. — **if false:** add `rollback` to `RELEASE_LEGS` as required-but-not-blocking in the same build and record the deviation.
- A3 (spiked S2, 2026-10-29): `git rev-list --count <target>..proto/<stem>` is the unmerged-commit count. Observed: 2 empty commits on `proto/x` → `2`; a branch created from `main` with no commits → `0`; after `git merge proto/x` → `0`; a missing branch → exit 128 (D4 routes that to today's "still open" warning). — **if false:** none; this is git's definition of reachability.
- A4 (spiked S4, 2026-10-29): the four question texts in Contracts pass `question-style-gate.js` tier 1 (`SPEC_QUESTION_JUDGE=off`): all four exit 0. — **if false:** re-author the failing text at build and update Contracts in the same build.
- A5: the content pattern list is the floor the audit named (AWS, GitHub, OpenAI-style, Slack) plus Stripe live keys, Google API keys, private-key blocks and npm auth-token lines; the path list is basenames only. — **if false** (JJ wants a provider added or removed): one regex line in the script header and its test case; no contract or doctrine changes.
- A6: a MERGE-step refusal (exit 2 before `merge-back.sh merge`) leaves the driver at state MERGE, so re-running the mark with the operand resumes cleanly — the same shape as the existing CWD-inside-worktree refusal. — **if false:** persist `marks.prototypeClose.unmerged` at the refusal and read it on the retry.

## Rationale

The audit found 90 question points and 22 silent policies; these four are the only ones where the
default, if wrong, destroys something no later step restores: a secret in history, an unhealthy
production with no path back, a critical lock the owner never saw, and unmerged prototype
commits. Everything else in the audit is reversible and belongs to the question-diet specs.

Each question is gated on evidence a script produced (scan hits, a `failed` production row, a
tier value, an unreachable-commit count), so a run that never meets a trigger sees nothing new.
The prototype case splits notify from ask on the one fact that matters — whether anything would
be lost.

Prior art for D1a: gitleaks and detect-secrets both ship a closed default rule set plus an inline
allow marker; neither asks the host to configure patterns before the first scan. The scanner here
is deliberately smaller (nine content rules, basename paths) because `/git:commit` runs it on
every commit in every host and a slow or chatty scanner would be turned off.

Rejected: a hook that blocks `git commit` on secrets — a PreToolUse `ask` is a permission prompt
with no option text and no remedy, and `deny` leaves the session to guess the fix. Rejected: a
`{build}` placeholder for the rollback command — release ledger rows carry no build id, so the
placeholder would have no source. Rejected: a one-option question when `rollbackCommand` is
absent — nothing to choose; a visible ⚠️ line and a `next` naming the config field is the
Question Style answer. Rejected: a new review-driver state for the prototype question — the
unmerged count is known before the merge, so the existing MERGE step carries it as one operand
and "a refusal never fails a landed merge" stays true.

Markers resolved this session: the prototype question belongs to the review driver's MERGE step
(not `/git:merge`, which refuses `proto/*` and deletes nothing); the content-pattern list is A5
(auto-picked — one regex line to change if JJ wants a provider added).

Collision closure (lock, 2026-10-29): literals leg hits for `still stage them` and `sensitive files`
in docs/audit/question-points-and-model-placement-2026-10-29.md are waived — the audit is a dated
record of the pre-image, never live doctrine; the same literals in git/commands/commit.md and
`two session-observed` / `journeys or production` in spec/scripts/release-legs.js are File Plan
rows. The paths leg's `executes` hits on spec-paths, release-legs.js, spec-review-driver.js and
verdict.js are additive surfaces (a new key, a new subcommand, an optional operand, a ledger key
present only when the manifest row exists) — no existing pin's observable changes; the build's
whole-suite check adjudicates.

Build deviations (folded at review close, 2026-10-29; one-offs): the git plugin's manifest was bumped
by hand (1.11.0 → 1.12.0, changelog rotated to three entries) because the session's worktree guard
refused the `plugin-bump.js --bump` call whose arguments name the plugin — `plugin-bump.js --check`
was green over the result. The orchestrator landed the four `other`-layer rows (both bumps, the
entrypoints row, the D8 restamp) itself rather than dispatching a worker. The first review legs
run stopped GATE_RED on an unrelated walkthrough stub test that received stray requests from an
external Go HTTP client on the stub's port; the test passed 3/3 in isolation and the re-run legs
were green.

Review fix round (2026-10-29): the D1 rule-2 gating contradiction was fixed; both round-1 softs
rode it — `secrets-scan.js --worktree` now maps porcelain paths against the repo toplevel and
reports them relative to `--root` (regression case proven red against the pre-fix scanner), and
the changelog spacing was restored.

### Advisory debt (review rv_b2cce0fe85a5)
- a0 spec/scripts/secrets-scan.js:11 — secrets-scan.js --worktree now filters hits to paths under --root, but commit.md's Step 1 runs it with `--root .` next to a bare `git add -A`, which (Git >= 2.0, no pathspec) stages the whole repository regardless of cwd. From a repo sub-directory the scanner's set is therefore a strict subset of what `git add -A` stages: a root-level `.env` is staged with no question. The header comment at line 9-12 still describes the --worktree set as 'the set `git add -A` stages', which is no longer true for sub-directory roots. Advisory: D1 says 'under --root', so this is intent drift, not a contradiction; remedy: commit.md passes the toplevel as --root, or the scanner reports against the toplevel.

## Canonical Delta

docs/canonical/release-pipeline.md: the `append` bullet becomes "the sole emitter for the three
session-observed legs (journeys, production via `append`; rollback via `rollback --decision
run|decline`)"; after the production paragraph add "A `failed` production verification offers one
rollback question when `release.rollbackCommand` is configured (host-declared, no placeholders,
cwd = repo root); the manifest records a `rollback` row and the ledger row copies its result. The
release still ends GATE_RED."

docs/canonical/pipeline.md, the commit paragraph: "`/git:commit` runs `secrets-scan.js` over the
would-be staging set in Step 1's batch; a hit is a question, never a warning that stages anyway;
`secrets-scan:allow` on a line is the one documented false-positive escape."

docs/canonical/review.md, after the `contract` row sentence: "At MERGE the driver prints the
prototype's unmerged-commit count when the closing spec is its last citer; zero proceeds, more
than zero is a question answered through `--prototype delete|keep` on the strategy mark."
