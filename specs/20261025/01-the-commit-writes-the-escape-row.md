---
date: 2026-10-25
status: implementing
build_base: main
tier: critical           # spec-status.js's frozen --json action set changes (host rules § Risk Tiers)
area: cross-cutting
breaking: true           # the /spec:escape command is deleted; the escape row loses six fields
depends_on: []
brief: n/a
open_markers: 0
diff_base: 571def24b747360c067fd705c25dbd33d3d37744
---

# The commit writes the escape row; /spec:escape retires

## Goal

An escape row is the only record that a CLEAN review verdict was wrong, and today it is written
by a separate command behind a yes/no offer at commit time; the walkthrough host has one row
across about 111 runs, so the record is not being kept. After this spec, a fix commit that
touches lines a reviewed spec landed records the escape row itself, with no offer and at most
one question (the defect class); `/spec:escape`, its six derived fields (`foundBy`, `severity`,
`killedMatch`, `softMatch`, `preventedBy`, `unclassedReason`), its amendment and backfill
modes, and its Gotchas write are deleted. Done means: `/git:commit` step 3 appends the slim
row through `escape-row.js --append`, every reader of the escape ledger still runs, and no
command, doctrine or status line names `/spec:escape`.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | A fix commit (fix-shaped subject, or the user calling it a fix, or a `/spec:fix` invoker) whose `commit-coverage --commit HEAD --json` reports a non-empty `landed` list WRITES exactly one escape row — never offers it. `spec` and `reviewRunId` come from the landed file whose qualifying review row has the latest `reviewTs` (ties: the lexically smaller spec path); `files` is every landed file; `sha` is HEAD. (AC-20261025-01-4, AC-20261025-01-5) | One row per commit keeps the contradicted-CLEAN count a count of commits, not of touched files; the latest review is the one that most recently passed the lines. Rejected: one row per distinct landing spec (inflates the false-CLEAN floor on every multi-spec fix). |
| D2 | The defect class is the only question. With a root cause in session (a `/spec:fix` invoker, or the commit body) the session derives a class from `fleet-reader --json`'s `.escapes.registry` and prints `📌 Auto-picked class=<id> — <reason> (veto anytime)`; otherwise ONE skippable `AskUserQuestion` lists the registry's top entries plus "a new word" and "no class". Dismissed or "no class" → `class: null` and the row is still written. `unclassedReason` no longer exists. (AC-20261025-01-4) | Class is the one field a human must supply and the one the incident rule counts; everything else the row used to carry was derivable prose nobody read. |
| D3 | The escape row shape is `{ts, stage:"escape", spec, files:[…], reviewRunId: "rv_…"\|null, class: <kebab>\|null, sha: <40-hex>\|null, via: "commit"\|"spec-fix"\|"manual"}`. The validator accepts a legacy row (`file` string instead of `files`; any of the six dropped fields present) and ignores the dropped fields; it refuses a row with neither `file` nor `files`, an empty `files`, a non-string entry, a malformed `class`, a `sha` that is neither null nor 40 hex, or a `via` outside the enum. (AC-20261025-01-1) | The ledger is append-only fleet-wide; 20 legacy rows in this repo alone must stay in shape without a rewrite. |
| D4 | `escape-row.js` keeps `--check` and `--append` only; `--amend` is a usage error (exit 2). `--append` refuses (exit 3) when an existing escape row in the root's ledgers names the same `spec` and shares any file (its `file`, or any entry of its `files`) unless `--allow-duplicate`; success prints `appended spec=<spec> files=<n> reviewRunId=<id\|null>` with no `key=` suffix. (AC-20261025-01-2, AC-20261025-01-3) | One writer with a duplicate refusal is the part of the old command worth keeping; the `key=` suffix fed the owed query, which sibling 02 deletes. |
| D5 | `spec/commands/escape.md` is deleted. Every pointer to it moves: `spec-paths` loses its `escape` shared-for arm (the `escape-row` key stays); `entrypoints.json` drops every `spec/commands/escape.md` entry and lists `git/commands/commit.md` as `escape-row.js`'s entry point; the spec plugin's `description` lifecycle sentence names `/spec:fix` where it named `/spec:escape`; README's three mentions describe the automatic row. `[asked: JJ chose "Trim to an automatic row" over fold-and-delete and keep-as-is, 2026-10-25]` (AC-20261025-01-6, AC-20261025-01-7) | A command whose whole job the commit now does is a second entry point to the same row. |
| D6 | `spec-status.js`'s red-observation entry carries `action: '/spec:fix'` with the same path, `blockers: []`, `parallel: false`, `rank: -3` and the same `CI red on <branch> @<sha> — <url>` note; the `--json` action set becomes `/spec:plan \| /spec:run \| /spec:fix`. Every internal reference to the escape entry (lane exclusion, wait count, footer) keys on `/spec:fix` instead. (AC-20261025-01-8, AC-20261025-01-14, AC-20261025-01-15) | The entry recommends the lane that repairs the defect; its commit records the escape row. This changes a frozen API string, hence the critical tier. |
| D7 | The review driver's done-with-no-closeRunId refusal reads: `… use /spec:fix to repair a defect that escaped a review that already passed — its commit records the escape row — not another review run`; `stage-review.md`'s sentence describing that refusal names `/spec:fix` the same way. (AC-20261025-01-9, AC-20261025-01-12) | The remedy must name a command that exists. |
| D8 | `init-gen.js`'s generated Gotchas header says `Writers: the review stage's close step only.`; the escape flow writes no Gotchas entry and no Review Checks row. Hosts re-stamp with `/spec:doctor`. (AC-20261025-01-10) | The prevention-delta write was the old command's step 6; with the command gone the review close is the only Gotchas writer. |
| D9 | The `stage:"fix"` row is unchanged and is written exactly when `landed` is empty and the invoker is `/spec:fix`; a commit never earns both rows. `core.md` § Pipeline Entry's Direct-lane sentence reads "the commit-time escape row still lands", § Feedback Loop says a fix commit touching spec-landed lines records the escape row (`/git:commit` step 3) and keeps the sentence `The **escape ledger** is the pipeline's one ground-truth signal.` verbatim. (AC-20261025-01-11, AC-20261025-01-12) | Two rows for one commit would double-count a repair; the doctrine sentence is pinned by an existing test. |
| D10 | Readers of the escape ledger (`fleet-reader.js`, `commit-coverage.js`'s window and fleet modes, `doctor.md`'s preventedBy and backfill bullets, `release.md`'s prescription) are sibling spec `specs/20261025/02`'s File Plan; this spec leaves `lib/escape-row.js`'s `escapeKey`, `joinAmendments` and `validateAmendmentRow` exported so the reader keeps running until 02 lands. `[no-ac: the reader side is the sibling's deliverable; this row only states the landing-unit boundary]` | Writer first, reader second: each spec leaves the tree green. |
| D11 | With its arm deleted (D5), `spec-paths shared-for escape` falls open to the whole-doctrine output with exit 0, exactly like every other retired `shared-for` key (design, build, review, atlas, sketch); no bespoke retired arm is added. `tests/spec-paths.test.js` moves `escape` from the scoped roster into the fail-open group (roster 14 → 13) and its Incident Policy assert retires, so spec 20260820/05's CONTINUE-TO criterion 17 is tagged retired. `[asked: JJ said yes to "same as every other retired command" over "fail with an error", 2026-10-25, build stage]` (AC-20261025-01-6) | AC-6's original exit-non-zero clause contradicted D5 and the arm's own fail-open contract; no caller of `shared-for escape` survives this spec, so no runtime path depends on it. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/commands/escape.md | DELETE | doctrine | the command retires (D5) |
| git/commands/commit.md | MODIFY | doctrine | step 3 writes the escape row (D1, D2), fix row rule (D9), rule 7 wording |
| spec/commands/fix.md | MODIFY | doctrine | "its one ledger row" sentences name the fix row or the escape row (D9) |
| spec/doctrine/core.md | MODIFY | doctrine | § Pipeline Entry and § Feedback Loop sentences (D9); ground-truth sentence kept verbatim |
| spec/doctrine/stages/stage-review.md | MODIFY | doctrine | the done-spec refusal sentence names /spec:fix (D7) |
| spec/bin/spec-paths | MODIFY | doctrine | drop the `escape)` shared-for arm; keep the `escape-row` key (D5) |
| spec/entrypoints.json | MODIFY | doctrine | drop every `spec/commands/escape.md` entry; `escape-row.js` → `git/commands/commit.md` (D5) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | `node scripts/plugin-bump.js --bump --plugin spec --changelog "…"`; lifecycle sentence names /spec:fix (D5) |
| git/.claude-plugin/plugin.json | MODIFY | doctrine | `node scripts/plugin-bump.js --bump --plugin git --changelog "…"` |
| spec/scripts/lib/escape-row.js | MODIFY | scripts | slim `validateEscapeRow` (D3); `escapeFiles(row)` helper; amendment exports kept for 02 (D10) |
| spec/scripts/escape-row.js | MODIFY | scripts | `--check`/`--append` only, shared-file duplicate refusal, new stdout line (D4) |
| spec/scripts/init-gen.js | MODIFY | scripts | Gotchas header writers line (D8) |
| spec/scripts/spec-status.js | MODIFY | scripts | red-observation entry action `/spec:fix` and every internal key on it (D6) |
| spec/scripts/spec-review-driver.js | MODIFY | scripts | refusal text names /spec:fix (D7) |
| README.md | MODIFY | other | three mentions describe the automatic row (D5) |
| tests/escape/escape-row.test.js | MODIFY | tests | AC-20261025-01-1, AC-20261025-01-2, AC-20261025-01-3 |
| tests/commit/escape-row-in-commit.test.js | CREATE | tests | AC-20261025-01-4, AC-20261025-01-5, AC-20261025-01-6, AC-20261025-01-7, AC-20261025-01-10, AC-20261025-01-12 |
| tests/status/red-alarm.test.js | MODIFY | tests | AC-20261025-01-8 |
| tests/spec-status.test.js | MODIFY | tests | AC-20261025-01-14 |
| tests/queue/queue-overlay.test.js | MODIFY | tests | AC-20261025-01-15 |
| tests/review/review-driver.test.js | MODIFY | tests | AC-20261025-01-9 |
| tests/run-ledger.test.js | MODIFY | tests | AC-20261025-01-11 |
| specs/20260901/07-escape-class-contract.md | MODIFY | other | retired tag on spec 07 ACs 5 and 6 (amend cases deleted with `--amend`, D4) |
| specs/20260912/04-softs-get-a-reader.md | MODIFY | other | retired tag on spec 04 AC 1 (tri-state validation dropped, D3) |
| specs/20260820/05-fleet-evidence-reader.md | MODIFY | other | retired tag on spec 05 AC 17 (shared-for escape no longer scoped, D11) |
| tests/spec-paths.test.js | MODIFY | tests | escape joins the fail-open group, scoped roster 13 (D11) |
| tests/consistency/read-load.test.js | MODIFY | tests | drop the `escape` entry from the pinned SHARED_FOR section table (D11; gate-1 line "spec-paths shared-for escape printed a different doctrine-section list than SHARED_FOR pins") |

## Contracts

The escape row (D3), written by `escape-row.js --append` only:

```json
{"ts":"<ISO-8601>","stage":"escape","spec":"<repo-relative spec path>","files":["<repo-relative path>", "…"],"reviewRunId":"rv_…"|null,"class":"<kebab-case id>"|null,"sha":"<HEAD 40-hex>"|null,"via":"commit"|"spec-fix"|"manual"}
```

`lib/escape-row.js` (D3, D10):

```js
const CLASS_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const VIA = ['commit', 'spec-fix', 'manual', 'backfill']   // backfill: legacy amendment rows only
function escapeFiles(row)        // -> string[]: row.files when an array, else [row.file] when a string, else []
function validateEscapeRow(row)  // -> string[] reasons, closed set:
//   'files-missing'        neither a non-empty `files` array nor a string `file`
//   'files-entry-not-string'
//   'class-malformed'      class set, not null, and not CLASS_ID_RE
//   'sha-malformed'        sha set, not null, and not /^[0-9a-f]{40}$/
//   'via-out-of-enum'      via set and not in VIA
// legacy keys foundBy, severity, killedMatch, softMatch, preventedBy, unclassedReason: ignored.
// Kept exported until specs/20261025/02 lands: escapeKey, joinAmendments, validateAmendmentRow.
```

`escape-row.js` (D4):

```
escape-row.js --check (--row '<json>' | --file <path>)
escape-row.js --append --root <dir> --row '<json>' [--allow-duplicate]
exit 0  --check: no reasons · --append: one line appended, stdout
        `appended spec=<spec> files=<n> reviewRunId=<rv_…|null>`
exit 1  validation reasons, one per line on stdout, nothing appended
exit 2  usage (including --amend), unreadable --row/--file, --root not a directory
exit 3  --append: an escape row in <dir>'s live or archived ledgers names the same spec and
        shares a file with the new row, and --allow-duplicate is absent (stderr names the
        shared file and the remedy)
```

`git/commands/commit.md` step 3 (D1, D2, D9), replacing today's offer:

```
Runs only when .claude/spec-runs.jsonl exists at repo root AND the commit is plausibly a fix
(user said so, invoker is /spec:fix, or the subject's conventional type is fix/hotfix).
1. node "$(spec-paths commit-coverage)" --root . --commit HEAD --json   (non-zero → one ⚠️ line, skip)
2. landed empty  → invoker /spec:fix: append the stage:"fix" row (unchanged shape); else skip silently
3. landed non-empty → ONE escape row:
     spec, reviewRunId ← the landed entry whose specs[0].reviewTs is latest (tie: smaller spec path)
     files ← every landed[*].file · sha ← HEAD · via ← spec-fix | commit
     class ← derived from .escapes.registry when a root cause is in session (📌 line), else ONE
             skippable AskUserQuestion (registry top entries, "a new word", "no class"); dismissed → null
     node "$(spec-paths escape-row)" --append --root . --row '<json>'
       exit 3 → print the stderr line, append nothing, continue the commit
   The line stays uncommitted until the next commit. Never both rows for one commit.
```

`spec-status.js --json` entry for a red observation (D6):

```json
{"action":"/spec:fix","path":"<spec path>","status":"done","brief":"NN"|null,"blockers":[],"parallel":false,"parallel_reason":null,"note":"CI red on <branch> @<sha> — <url>","rank":-3}
```

## Behavior

- **Row derivation example (D1).** `commit-coverage` reports `landed: [{file:"a.js", specs:[{spec:"specs/x/01.md", reviewTs:"2026-10-01T…", reviewRunId:"rv_a"}]}, {file:"b.js", specs:[{spec:"specs/y/02.md", reviewTs:"2026-10-20T…", reviewRunId:"rv_b"}]}]` → one row `spec:"specs/y/02.md", reviewRunId:"rv_b", files:["a.js","b.js"]`.
- **Legacy ledgers.** This repo's 20 escape rows carry `file` plus the six dropped fields; `validateEscapeRow` returns `[]` for each of them. The three `stage:"escape-class"` rows are untouched here (sibling 02 decides their reading).
- **Dedupe example (D4).** Ledger holds `{spec:"specs/x/01.md", file:"a.js"}`; appending `{spec:"specs/x/01.md", files:["b.js","a.js"]}` → exit 3 naming `a.js`; appending `{spec:"specs/x/01.md", files:["c.js"]}` → exit 0.
- **Prose pins.** The plugin's tests pin doctrine prose by reading the markdown; `tests/init-gen/generate.test.js` shows how to render a host rules file from `init-gen.js` for AC-20261025-01-10.
- **Hosts.** The generated Gotchas header changes, so hosts owe a `/spec:doctor` re-stamp; nothing in `grounding-contract.md` changes.

## Acceptance Criteria

- **AC-20261025-01-1**: WHEN `escape-row.js --check` receives `{"ts":"2026-10-25T00:00:00Z","stage":"escape","spec":"specs/1.md","files":["a.js"],"reviewRunId":null,"class":null,"sha":null,"via":"commit"}` THE SYSTEM SHALL exit 0 printing nothing; WHEN it receives the legacy row `{"ts":"2026-09-01T00:00:00Z","stage":"escape","spec":"specs/1.md","file":"a.js","reviewRunId":null,"foundBy":"user","severity":"soft","killedMatch":"maybe","class":null,"unclassedReason":"no-fix-diff","preventedBy":"test","via":"manual"}` THE SYSTEM SHALL exit 0 (the dropped fields are ignored, whatever their values); WHEN `files` is `[]`, or both `file` and `files` are absent, or `class` is `"Bad Class"`, or `sha` is `"abc"`, or `via` is `"loop"` THE SYSTEM SHALL exit 1 printing exactly the reasons `files-missing`, `files-missing`, `class-malformed`, `sha-malformed`, `via-out-of-enum` respectively, one per line → rewrites tests/escape/escape-row.test.js :: AC-20260912-04-1
- **AC-20261025-01-2**: WHEN `escape-row.js --amend --root <dir> --escape-ts x --spec s --file f --class c` is run THE SYSTEM SHALL exit 2 with stderr containing `--check` and `--append` and no `--amend`, and append nothing → rewrites tests/escape/escape-row.test.js :: AC-20260901-07-5
- **AC-20261025-01-3**: WHEN the root's ledger holds `{"stage":"escape","spec":"specs/1.md","file":"a.js",…}` and `--append` receives `{…,"spec":"specs/1.md","files":["b.js","a.js"]}` THE SYSTEM SHALL exit 3, append nothing, and name `a.js` on stderr; WHEN `--allow-duplicate` rides along, or the new row's files are `["c.js"]`, THE SYSTEM SHALL exit 0, append exactly one line, and print `appended spec=specs/1.md files=2 reviewRunId=null` (respectively `files=1`) with no `key=` text → rewrites tests/escape/escape-row.test.js :: AC-20260901-07-6
- **AC-20261025-01-4**: WHEN `git/commands/commit.md` is read THE SYSTEM SHALL contain, inside its `## Step 3` section, the literal `spec-paths escape-row` followed by `--append`, the literal `one escape row`, exactly one `AskUserQuestion` mention whose sentence names `class`, and zero occurrences of `Escape of`, `/spec:escape`, `foundBy`, `severity`, `killedMatch`, `softMatch`, `preventedBy`, `unclassedReason` → writes tests/commit/escape-row-in-commit.test.js
- **AC-20261025-01-5**: WHEN `git/commands/commit.md` step 3 is read THE SYSTEM SHALL state the selection rule for `spec` and `reviewRunId` with the literal `latest` and `reviewTs`, state `sha` as `HEAD`, and state the `stage:"fix"` row is written when `landed` is empty and the invoker is `/spec:fix` (literal `landed` within three lines of `"fix"`) → writes tests/commit/escape-row-in-commit.test.js
- **AC-20261025-01-6**: WHEN the plugin tree is inspected THE SYSTEM SHALL have no file at `spec/commands/escape.md`; `spec/entrypoints.json` SHALL contain zero occurrences of `spec/commands/escape.md` and SHALL list `git/commands/commit.md` under `spec/scripts/escape-row.js`'s `entryPoints`; `spec-paths shared-for escape` SHALL print the fail-open whole-doctrine output an unknown command gets, exit 0 (D11) → writes tests/commit/escape-row-in-commit.test.js
- **AC-20261025-01-7**: WHEN `spec/.claude-plugin/plugin.json`'s `description` and `README.md` are read THE SYSTEM SHALL contain zero occurrences of `/spec:escape` and README SHALL contain the literal `escape row` at least once → writes tests/commit/escape-row-in-commit.test.js
- **AC-20261025-01-8**: WHEN a done spec's latest observation row is red (`{"stage":"observe","spec":"<path>","result":"red","branch":"main","sha":"abc1234","url":"https://ci/1"}` as the existing fixtures write it) THE SYSTEM SHALL emit as `--next --json`'s first entry `{"action":"/spec:fix","path":"<path>","blockers":[],"parallel":false,…}` with a note matching `/main/`, turn the headline red, and render the 🔴 footer → rewrites tests/status/red-alarm.test.js :: AC-20260807-01-7 / AC-20260903-05-6
- **AC-20261025-01-14**: WHEN `--next --json` runs over the two-host fixture (host A: a hardened spec, an implementing spec and a red-observation done spec; host B: a done spec and an unplanned ready brief) THE SYSTEM SHALL emit only `/spec:plan`, `/spec:run`, `/spec:fix` action values, host A's set containing `/spec:fix`, and never `/spec:escape`, `/spec:design`, `/spec:build` or `/spec:review` → rewrites tests/spec-status.test.js :: AC-20260901-10-6
- **AC-20261025-01-15**: WHEN a queue file positions other work first and a done spec carries a red observation THE SYSTEM SHALL place the `/spec:fix` entry for that spec at `next[0]` above every queue position and lane → rewrites tests/queue/queue-overlay.test.js :: AC-20260823-08-15 / AC-20260903-03-10
- **AC-20261025-01-9**: WHEN the review driver is invoked cold on a spec already `status: done` whose sidecar records no `closeRunId` THE SYSTEM SHALL exit 2 with stderr matching `/\/spec:fix/` and `/escape row/` and not matching `/\/spec:escape/`, appending no ledger line → rewrites tests/review/review-driver.test.js :: AC-20260820-07-15
- **AC-20261025-01-10**: WHEN `init-gen.js` renders a host rules file THE SYSTEM SHALL write a Gotchas header comment containing `Writers: the review stage's close step only.` and zero occurrences of `/spec:escape` → writes tests/commit/escape-row-in-commit.test.js
- **AC-20261025-01-11**: WHEN `spec/doctrine/stages/stage-build.md`, `spec/doctrine/stages/stage-review.md`, `git/commands/commit.md` and `spec/commands/release.md` are read THE SYSTEM SHALL CONTINUE TO reference `.claude/spec-runs.jsonl` in each → reuses tests/run-ledger.test.js :: AC-20260820-07-13 / AC-20260823-01-20
- **AC-20261025-01-12**: WHEN `spec/doctrine/core.md` is read THE SYSTEM SHALL contain the literal `The **escape ledger** is the pipeline's one ground-truth signal.` and the literal `commit-time escape row still lands`, and zero occurrences of `/spec:escape`; `spec/commands/fix.md` SHALL contain `escape row` and zero occurrences of `/spec:escape`; `spec/doctrine/stages/stage-review.md` SHALL contain `/spec:fix` and zero occurrences of `/spec:escape` → writes tests/commit/escape-row-in-commit.test.js
- **AC-20261025-01-13** `[oracle: gate]`: WHEN the gate runs THE SYSTEM SHALL pass `node scripts/plugin-bump.js --check` with both `spec` and `git` manifests bumped → reuses tests/spec-paths.test.js :: AC-20260901-07-15

## Assumptions (escalation triggers)

- A1: `commit-coverage --commit HEAD --json`'s `landed[*].specs[*]` carries `reviewTs` and `reviewRunId` today (verified by reading `classifyFile`, spec/scripts/commit-coverage.js) — **if false:** add the two fields to that script in this spec's File Plan; never derive them in prose.
- A2: No test pins the old `--json` action set beyond the three named in AC-8 (grep `spec:escape` over tests/ at plan time: red-alarm, spec-status, queue-overlay, review-driver, verdict assertion messages, run-ledger) — **if false:** the extra test is a `rewrites` target added to the File Plan, never a weakened assertion.
- A3: The escape ledger has no external `--json` consumer of the `/spec:escape` action string (none is recorded anywhere in this repo or the memory index) — **if false:** STOP, ask the user; the string is a frozen API.
- A4: `tests/consistency/replay-retired.test.js :: AC-20261024-05-8` keeps passing because the ground-truth sentence is kept verbatim (D9) — **if false:** the sentence was altered; restore it, never retag the test.
- A5: No third-party dependency adjudicates any claim here (git `show --name-only` and `log --format` are already in use by commit.md) — no micro-spike was shape-triggered; `spikes: 0`.

## Rationale

The decision was taken on 2026-10-25 after the walkthrough session reported one escape row across about 111 runs there. This repo tells a different story: 20 rows, whose class names feed the Incident Policy's recurrence count and keep class-pinned tests from expiring. So the cut keeps the row and its class and removes the ceremony around it: the standalone command, the yes/no offer, six fields that only the validator read (`killedMatch`/`softMatch` had no reader beyond two counters in the fleet reader's render; `preventedBy` fed the owed query, which sibling 02 deletes; `foundBy`/`severity` were aggregates nobody acted on), the amendment and backfill machinery (three amendment rows exist fleet-wide, all from one backfill run), and the prevention-delta Gotchas write.

Why one row per commit (D1) rather than per landing spec: a repair that touches two specs' files would otherwise charge two reviews with one defect, and the false-CLEAN rate — already called a floor — would stop meaning anything. The latest review is the deterministic pick because it is the one that most recently looked at those lines. Why the class stays a question (D2): nothing on disk can name a defect class; the human or the root-cause statement can. Why `/spec:fix` inherits the CI-red entry (D6): status must name a command that exists, and the fix lane's commit now writes the row that `/spec:escape` used to write. This is the one frozen-API change and the reason for the critical tier.

Collision closure (literals `spec:escape`, `escape.md`; 40 hits, 21 files outside the File Plan, each waived here): `docs/adr/*`, `docs/audit/*`, `docs/roadmap/*` are history and are never edited; `docs/canonical/pipeline.md`, `review.md`, `status.md` change through the Canonical Delta at review close; `.claude/rules/spec-pipeline.md` is the host-generated rules file, re-stamped by `/spec:doctor` after D8; `spec/commands/doctor.md`, `spec/commands/release.md`, `spec/scripts/fleet-reader.js`, `spec/scripts/spec-build-driver.js`, `spec/scripts/verdict.js` are sibling 02's File Plan rows (D10); `tests/fleet-reader/queries.test.js`, `tests/review/verdict.test.js`, `tests/review/stopped-row-durability.test.js`, `tests/spec-paths.test.js` carry the name in comments and assertion messages only — no behaviour, adjudicated by the suite at build.

Fragile: `commit.md` is prose executed by a model; the tests pin its literals, not its behaviour. The real check is the next fix commit on a spec-landed file in any host: the ledger must gain a row with no question except the class. Sibling 02 must land soon after, or the fleet reader keeps counting fields no writer produces.

## Canonical Delta

`docs/canonical/pipeline.md`: the frozen `--json` action set sentence reads `/spec:plan | /spec:run | /spec:fix` (a red observation surfaces as a `/spec:fix` entry; this spec). The "Commit-time escape coverage" paragraph: the commit-time offer is gone — a fix commit touching spec-landed lines writes one escape row itself (`/git:commit` step 3, `escape-row.js --append`), one row per commit, spec and review taken from the latest-reviewed landed file, class the one question; the window and fleet share numbers are retired with sibling 02.

`docs/canonical/status.md`: the red-observation entry is a `/spec:fix` entry; rank supremacy unchanged.

`docs/canonical/review.md`: `/spec:escape` no longer exists; the review run id remains the backlink an escape row's `reviewRunId` carries. The `killedMatch` derivation paragraph is historical: the field is no longer written.
