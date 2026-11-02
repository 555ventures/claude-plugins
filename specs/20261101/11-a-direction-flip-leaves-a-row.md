---
date: 2026-11-01
status: done
tier: critical
area: ledger
breaking: false
depends_on: []
brief: n/a
spiked: 2026-11-01
build_base: main
open_markers: 0
diff_base: 4644500a46bba8fa3899d08143ebb1811e5282cc
---

# A direction flip leaves a row

## Goal

When a decision upstream retires a spec or deletes code a done spec shipped, the pipeline
records nothing: the escape ledger is the one ground-truth signal the doctrine names, and
`fleet-reader` therefore counts the "direction flipped after work shipped" class at zero, so
core.md § Incident Policy can never earn a guard for the largest loss the 2026-11-01 audit found
(leak 1). Done means two events each append one escape row carrying a class and the superseding
id — a commit that flips a spec to `status: superseded`, and a review merge-back that deletes a
file a done spec's File Plan created — written through the one existing escape-row writer and
counted by `fleet-reader --json` under `escapes.byClass`. No doctrine paragraph, no refusal, no
threshold: rows only.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | Both events write a `stage:"escape"` row through `node "$(spec-paths escape-row)" --append` (the sole escape writer): `class` is `spec-superseded` for a retired spec and `shipped-file-deleted` for a deleted shipped file; `reviewRunId` is `null` on both; a new key `supersededBy` (string or `null`) carries the superseding id; `via` is `commit` for the retired-spec row and `review` for the deleted-file row. `lib/escape-row.js`'s `VIA` gains `'review'` and nothing else changes in the validator — `supersededBy` rides as an extra key the validator ignores by contract. (AC-20261101-11-7, AC-20261101-11-8) | `fleet-reader` derives `byClass` from `stage:"escape"` rows' own `class` (spiked, A4), so the class alone makes the rows countable with no reader change. `reviewRunId` stays null because the review that shipped the file was not wrong — joining it would raise the false-CLEAN rate for a direction change. Rejected: a new `stage` value (every reader's stage set would need widening; `byClass` would not see it). |
| D2 | New `spec/scripts/supersession-rows.js` (key `supersession-rows` in `spec/bin/spec-paths`, usage line included; a `spec/entrypoints.json` row naming `git/commands/commit.md` and `spec/scripts/spec-review-driver.js` as its entry points) with two modes. `--commit <sha> --root <dir>`: for every `specs/**/*.md` path named by `git show --format= --name-only <sha>` whose `<sha>`-side frontmatter `status` is `superseded` and whose parent-side status is not (a path absent in the parent counts as flipped), append one row: `spec` = that path, `files` = `[that path]`, `class` `spec-superseded`, `sha` = the resolved 40-hex sha, `via` `commit`, `supersededBy` = the spec's `superseded_by` frontmatter value (`lib/frontmatter.js`'s `fmValue`, trimmed) or `null`. Stdout: one line per row, `supersession spec=<path> class=spec-superseded supersededBy=<id|null>`; the writer's exit 3 (same spec, same file already recorded) prints `already recorded spec=<path>` and continues. No `.claude/spec-runs.jsonl` under `--root` → exit 0, nothing printed, nothing written. `--merge --root <dir> --target <ref> --source <ref> --by <spec path> --json`: the deleted set is `git -C <root> diff --name-status --diff-filter=D <target>...<source>` (a rename is not a deletion); every `specs/**/*.md` with `status: done` other than `--by`, parsed with `lib/file-plan.js`'s `parseFilePlanRows`, contributes its rows whose `action` matches `/^create$/i` and for which `isTestsRow` is false; each deleted path found on such a row yields, grouped per owning spec, one row `{spec: <owner>, files: [<its deleted paths, sorted>], class: "shipped-file-deleted", reviewRunId: null, sha: null, via: "review", supersededBy: <--by path>}`; printed as a JSON array (`[]` when none), nothing appended. Exit 2: usage, `--root` not a git repository, an unresolvable sha/ref. (AC-20261101-11-1, AC-20261101-11-2, AC-20261101-11-3, AC-20261101-11-4, AC-20261101-11-5, AC-20261101-11-6, AC-20261101-11-12) | One script owns both derivations so the commit command and the review driver never carry a second copy of "what counts as a flip" or "which spec shipped this file". The retired-spec row names the spec file as its one file because a never-built spec shipped nothing else, and the writer's duplicate refusal then makes a re-scan of the same commit idempotent (spiked, A5). Tests-layer rows are excluded because a deleted test is test expiry by design, not discarded product work; `MODIFY` rows are excluded because only the creator's work is what a deletion discards. |
| D3 | `git/commands/commit.md` gains `## Step 3b: Supersession Rows (every commit)` between Step 3 and Step 4: when `.claude/spec-runs.jsonl` exists at repo root, run `node "$(spec-paths supersession-rows)" --root . --commit HEAD` and print its stdout verbatim; a non-zero exit prints one `⚠️` line naming the exit code and the commit proceeds. No question is asked; nothing blocks; the appended line stays uncommitted until the next commit, exactly as Step 3's rows do. (AC-20261101-11-11) | A retirement is a hand edit of frontmatter and the commit is the moment it becomes durable, so the commit command is the one hook that sees every flip (user chose this over a dedicated retire command, [asked: commit-time scan via /git:commit]). A step in the command file is wiring, not a doctrine paragraph — core.md is untouched. |
| D4 | `spec-review-driver.js`'s `handleMergeStrategy` runs `supersession-rows.js --merge --root <mainRoot> --target <target> --source <source> --by <spec path, repo-relative> --json` once, before any merge-back subcommand, and stores the array in `marks.supersessions` (saved to the sidecar). `finishMerge` appends each stored row through `escape-row.js --append --root <mainRoot>` with `sha` set to `git -C <mainRoot> rev-parse HEAD`, as its first action, then sets `marks.supersessionRowsWritten = true` and saves; a row already present (`supersessions` absent or `supersessionRowsWritten` true) is never re-derived or re-appended, and the writer's exit 3 is printed as `already recorded spec=<path>` and skipped. Each appended row prints `supersession spec=<path> class=shipped-file-deleted files=<n>`. The step never fails a landed merge: a non-zero derivation exit prints one `⚠️ supersession rows skipped — exit <n>` line and the merge proceeds. (AC-20261101-11-9, AC-20261101-11-10) | The deleted set is only derivable while the source branch exists, and the row's `sha` only exists after the merge lands — so derive before, write after, with the sidecar carrying the rows across the CONFLICTS and already-landed re-entry paths `finishMerge` already serves. A refusal that failed a landed merge would wedge MERGE state for a bookkeeping line. |
| D5 | `supersededBy` carries the retiring spec's free-form `superseded_by` frontmatter for a `spec-superseded` row and the merging spec's repo-relative path for a `shipped-file-deleted` row; neither is validated or resolved. (AC-20261101-11-1, AC-20261101-11-5) | The merging spec is the one deterministic id in reach at merge time; its ADR sits one hop away through its brief. Resolving ADR ids across hosts whose decision files differ (`docs/adr/ADR-NNNN`, `docs/decisions.md` D49) would be a guess, and this spec writes rows, not judgments. |
| D6 | `node scripts/plugin-bump.js --bump --plugin spec --changelog "…"` `[no-ac: node scripts/plugin-bump.js --check in the gate is the oracle]` | Behaviour change under `spec/`. |
| D7 | The second plugin directory D3 edits gets its own bump: `git/.claude-plugin/plugin.json` minor bump with a changelog entry for Step 3b (build-time add, orchestrator auto-pick per pipeline rules § Gotchas "a spec whose Decisions edit a file under a SECOND plugin directory owes that plugin its own bump") `[no-ac: node scripts/plugin-bump.js --check in the gate is the oracle]` | `plugin-bump.js --check` reads the merge base, so the missing bump would only redden at the review gate. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/supersession-rows.js | CREATE | scripts | D2, D5: the two derivations, `--commit` appends through `escape-row.js --append`, `--merge --json` derives only; header names owner, modes, exit codes; no dependency change |
| spec/scripts/lib/escape-row.js | MODIFY | scripts | D1: `VIA` gains `'review'`; header note on the `supersededBy` extra key; no dependency change |
| spec/scripts/spec-review-driver.js | MODIFY | scripts | D4: derive `marks.supersessions` in `handleMergeStrategy` before merge-back, append in `finishMerge` with HEAD sha; no dependency change |
| spec/bin/spec-paths | MODIFY | scripts | D2: `supersession-rows` key and usage-line entry; no dependency change |
| spec/entrypoints.json | MODIFY | other | D2: `spec/scripts/supersession-rows.js` row naming its two entry points, `git/commands/commit.md` and `spec/scripts/spec-review-driver.js` |
| git/commands/commit.md | MODIFY | doctrine | D3: Step 3b runs the commit-mode scan on every commit when the ledger exists |
| spec/.claude-plugin/plugin.json | MODIFY | other | D6: `node scripts/plugin-bump.js --bump --plugin spec --changelog "…"` |
| git/.claude-plugin/plugin.json | MODIFY | other | D7: minor bump + changelog entry for the commit command's Step 3b |
| tests/escape/supersession-rows.test.js | CREATE | tests | AC-20261101-11-1, AC-20261101-11-2, AC-20261101-11-3, AC-20261101-11-4, AC-20261101-11-5, AC-20261101-11-6 |
| tests/spec-paths.test.js | MODIFY | tests | AC-20261101-11-12 — the new key joins the exhaustive documented-key pin and gets its own resolve assertion |
| tests/escape/escape-row.test.js | MODIFY | tests | AC-20261101-11-7 |
| tests/fleet-reader/slim-escapes.test.js | MODIFY | tests | AC-20261101-11-8 |
| tests/review/merge-supersession-rows.test.js | CREATE | tests | AC-20261101-11-9, AC-20261101-11-10 |
| tests/commit/escape-row-in-commit.test.js | MODIFY | tests | AC-20261101-11-11 |

## Contracts

```text
supersession-rows.js --commit <sha> --root <dir>
supersession-rows.js --merge --root <dir> --target <ref> --source <ref> --by <spec path> --json
  exit 0  derived (rows appended in --commit mode; JSON array printed in --merge mode; nothing is still 0)
  exit 2  usage; --root not a git repository; sha/ref unresolvable
```

```json
{"ts":"<ISO-8601>","stage":"escape","spec":"specs/20261004/01-x.md","files":["specs/20261004/01-x.md"],
 "reviewRunId":null,"class":"spec-superseded","sha":"<40-hex>","via":"commit","supersededBy":"D49"}
{"ts":"<ISO-8601>","stage":"escape","spec":"specs/20261001/05-zone-rules.md","files":["src/zones/rule.ts"],
 "reviewRunId":null,"class":"shipped-file-deleted","sha":"<40-hex>","via":"review",
 "supersededBy":"specs/20261017/03-workers-ingress.md"}
```

```js
// spec/scripts/lib/escape-row.js
const VIA = ['commit', 'spec-fix', 'manual', 'backfill', 'review']   // 'review': the merge-back writer
```

```json
// <spec>.review/review-state.json (sidecar) — two keys added by D4
{"marks": {"supersessions": [ /* rows from --merge --json, sha null */ ], "supersessionRowsWritten": true}}
```

## Data Model

`.claude/spec-runs.jsonl` gains two `class` values on `stage:"escape"` rows, one `via` value
(`review`), and one optional key (`supersededBy`). Append-only, as every ledger write is.
existing rows: unaffected

## Behavior

- A commit that flips two specs to `superseded` appends two rows, one per spec, in path order.
- A commit that touches a spec already `superseded` in its parent appends nothing — only the
  flip is the event.
- Re-running the commit scan over the same sha appends nothing: the writer refuses the second
  row (same spec, same file) and the script reports `already recorded`.
- A merge that deletes a file created by a done spec and modified by two later done specs yields
  exactly one row, for the creator.
- A merge that deletes only files no done spec's File Plan created (hand-added files, files from a
  `superseded` spec, files whose only rows are `MODIFY`) yields `[]`, and the driver prints
  nothing about supersession.
- `fleet-reader --json`: both classes appear in `escapes.byClass` and `escapes.registry`; both rows
  are counted in `escapesUnjoined` (reviewRunId null), never in `contradicted`; the drift census
  reports them in-shape.
- A host with no ledger (`.claude/spec-runs.jsonl` absent) sees no output from either path.

## Acceptance Criteria

- **AC-20261101-11-1**: WHEN `supersession-rows.js --commit <sha> --root <repo>` runs over a commit
  in which `specs/20261004/01-x.md` went from `status: hardened` to `status: superseded` with
  `superseded_by: D49` THE SYSTEM SHALL append exactly one `stage:"escape"` row with
  `spec: "specs/20261004/01-x.md"`, `files: ["specs/20261004/01-x.md"]`, `class: "spec-superseded"`,
  `reviewRunId: null`, `sha` = that commit's 40-hex id, `via: "commit"`, `supersededBy: "D49"`, print
  `supersession spec=specs/20261004/01-x.md class=spec-superseded supersededBy=D49` and exit 0
  (e.g. a spec flipped with no `superseded_by` line → `supersededBy: null` and `supersededBy=null`
  on stdout) → writes tests/escape/supersession-rows.test.js
- **AC-20261101-11-2**: WHEN the commit touches a spec whose parent-side status was already
  `superseded`, or touches only non-spec files, THE SYSTEM SHALL append nothing, print nothing and
  exit 0 (e.g. a commit editing only `src/a.js` → ledger byte-identical, stdout empty) → writes
  tests/escape/supersession-rows.test.js
- **AC-20261101-11-3**: WHEN `--commit` is run a second time over the same sha THE SYSTEM SHALL
  append nothing, print `already recorded spec=specs/20261004/01-x.md` and exit 0 (e.g. ledger line
  count 1 before and after the second run) → writes tests/escape/supersession-rows.test.js
- **AC-20261101-11-4**: WHEN `--commit` runs against a `--root` with no `.claude/spec-runs.jsonl`,
  or `--root` is not a git repository, or the sha does not resolve, THE SYSTEM SHALL respectively
  exit 0 writing and printing nothing, exit 2, and exit 2 (e.g. `--commit deadbeef` in a repo
  without that object → exit 2, stderr names the sha; a flipped spec in a repo whose `.claude/`
  has no ledger → exit 0 and no `.claude/spec-runs.jsonl` created) → writes
  tests/escape/supersession-rows.test.js
- **AC-20261101-11-5**: WHEN `--merge --root <repo> --target main --source spec/x --by specs/d/02-x.md --json`
  runs where `spec/x` deleted `src/zones/rule.ts` and `src/zones/index.ts`, `specs/d/01-y.md`
  (`status: done`) has File Plan rows `src/zones/rule.ts | CREATE | scripts` and
  `src/zones/index.ts | CREATE | scripts`, THE SYSTEM SHALL print
  `[{"spec":"specs/d/01-y.md","files":["src/zones/index.ts","src/zones/rule.ts"],"class":"shipped-file-deleted","reviewRunId":null,"sha":null,"via":"review","supersededBy":"specs/d/02-x.md"}]`
  (plus a `ts` key; the ledger untouched) and exit 0 (e.g. the same deletions with `01-y.md` at
  `status: superseded` → `[]`) → writes tests/escape/supersession-rows.test.js
- **AC-20261101-11-6**: WHEN the deleted file's only File Plan rows in done specs are `MODIFY`
  rows, or its `CREATE` row has Layer `tests`, or the row belongs to the `--by` spec itself, or
  the file was renamed rather than deleted, THE SYSTEM SHALL print `[]` and exit 0 (e.g.
  `tests/zones/rule.test.js | CREATE | tests` deleted → `[]`; `git mv src/a.js src/b.js` on the
  source branch → `[]`) → writes tests/escape/supersession-rows.test.js
- **AC-20261101-11-7**: WHEN `escape-row.js --check` receives a row with `via: "review"` and an
  extra key `supersededBy` THE SYSTEM SHALL exit 0 with no reasons (e.g.
  `{"stage":"escape","spec":"specs/x.md","files":["a"],"class":"shipped-file-deleted","via":"review","supersededBy":"specs/y.md"}`
  → exit 0; `via: "merge"` → exit 1, `via-out-of-enum`) → rewrites tests/escape/escape-row.test.js
  :: AC-20261025-01-1: escape-row.js --check accepts
- **AC-20261101-11-8**: WHEN `fleet-reader.js --repos-root <dir> --json` reads a host ledger holding
  one `spec-superseded` row and one `shipped-file-deleted` row, both `reviewRunId: null` THE SYSTEM
  SHALL report `escapes.byClass` as `{"shipped-file-deleted":1,"spec-superseded":1}`,
  `escapes.total` 2, both classes in `escapes.registry`, `falseClean.fleet.escapesUnjoined` 2,
  `contradicted` 0, and the host's drift census `inShape` 2 with an empty `drift` object
  (e.g. the exact two Contracts rows above, sha `"a"×40`) → writes
  tests/fleet-reader/slim-escapes.test.js
- **AC-20261101-11-9**: WHEN a review on a real build worktree is driven to `--mark merge-strategy
  squash` and the spec branch deleted `src/old.js`, which `specs/20260820/98-sibling.md`
  (`status: done`) lists as `src/old.js | CREATE | scripts`, THE SYSTEM SHALL end at state DONE
  with the main root's ledger holding exactly one `stage:"escape"` row `spec:
  "specs/20260820/98-sibling.md"`, `files: ["src/old.js"]`, `class: "shipped-file-deleted"`,
  `via: "review"`, `supersededBy` = the reviewed spec's repo-relative path, `sha` equal to
  the landed merge commit on the target branch (the commit that deleted the file — HEAD when
  `finishMerge` starts, before the ledger-record commit), the row committed inside that
  ledger-record commit, and print
  `supersession spec=specs/20260820/98-sibling.md class=shipped-file-deleted files=1` (e.g. the
  sidecar at MERGE carries `marks.supersessions` with that one row and `sha: null` before the mark)
  → writes tests/review/merge-supersession-rows.test.js
- **AC-20261101-11-10**: WHEN the same merge is driven where the spec branch deletes nothing a done
  spec created THE SYSTEM SHALL end at DONE with no `stage:"escape"` row added and no
  `supersession` line printed (e.g. the pre-image fixture that only edits `src/foo.js` → ledger
  gains exactly the review rows it gains today) → writes
  tests/review/merge-supersession-rows.test.js
- **AC-20261101-11-11**: WHEN `git/commands/commit.md` is read THE SYSTEM SHALL carry a
  `## Step 3b` section that invokes `node "$(spec-paths supersession-rows)" --root . --commit HEAD`,
  conditions it on `.claude/spec-runs.jsonl` existing, never mentions `AskUserQuestion`, and
  states that a non-zero exit never blocks the commit (e.g. the section text contains
  `--commit HEAD` and `⚠️`, and contains `AskUserQuestion` zero times) → writes
  tests/commit/escape-row-in-commit.test.js
- **AC-20261101-11-12**: WHEN `spec-paths supersession-rows` runs THE SYSTEM SHALL print the
  absolute path of an existing executable `spec/scripts/supersession-rows.js` and exit 0, and the
  usage line printed on an unknown key SHALL name `supersession-rows` (e.g. `spec-paths nope` →
  exit 1, stderr contains `supersession-rows`; the key joins the exhaustive documented-key list)
  → rewrites tests/spec-paths.test.js :: AC-20260926-03-8: every documented key

## Assumptions (escalation triggers)

- A1: `git diff --name-status --diff-filter=D <target>...<source>` lists exactly the files the
  source branch deleted since the merge base, one `D\t<path>` line each — **checked** (git
  2.x, scratch repo: `D\ta.txt`, exit 0, with a file added on `main` after the fork not listed).
  **if false:** derive from `git diff-tree -r --diff-filter=D $(git merge-base T S) S`; STOP and
  ask if neither lists the deletion.
- A2: a status flip is detectable from the commit alone: `git show --format= --name-only <sha>`
  names the spec, `git show <sha>^:<path>` yields the parent text (exit 128 when the file is new in
  that commit) and `git show <sha>:<path>` the new text — **checked** (scratch repo: parent
  `done`, head `superseded`, `superseded_by: ADR-0012` read back; a file new in the commit → parent
  lookup exit 128). **if false:** blocked; D2's commit mode has no derivation.
- A3: `escape-row.js --check` refuses `via: "review"` today with `via-out-of-enum` (exit 1) and
  accepts an unknown extra key — **checked** (exit 1 with that reason; the same row with
  `via: "commit"` and `supersededBy` present → exit 0). **if false:** `VIA` already carries it;
  D1's lib row becomes a header-note-only edit.
- A4: `fleet-reader --json` counts a `stage:"escape"` row with `class: "spec-superseded"` and
  `reviewRunId: null` under `escapes.byClass` and `registry` with no reader change, provided the
  host carries a `spec.config.json` — **checked** (scratch fleet root with one host:
  `byClass {"spec-superseded":1}`, `total 1`, drift census `inShape 1`, `drift {}`). **if false:**
  add the class-reading change to `fleet-reader.js` as a D1 row; never a second reader.
- A5: `escape-row.js --append` refuses a second row naming the same spec and a shared file with
  exit 3 and a stderr line — **checked** (first append exit 0 `appended spec=specs/x.md files=1
  reviewRunId=null`; second exit 3). **if false:** D2 and D4 dedupe by reading
  `lib/observation.js`'s `readLedgerRows` before appending.
- A6: `merge-back.sh merge --strategy squash` commits on the target, so `git rev-parse HEAD` in
  `finishMerge` is the landed merge commit — true per `merge-back.sh` line 286 (`git commit -m
  "merge: squash …"`); the same holds for the other three strategies by construction.
  **if false:** `sha` is set to `null` for that strategy and the row still lands.
- A7: `lib/file-plan.js`'s `parseFilePlanRows` returns `{paths, action, layer, summary}` and
  `isTestsRow` reads the Layer cell — true per its exports. **if false:** blocked; D2's merge
  mode names a parser that does not exist.
- A8: the review fixtures in `tests/review/merge-reentry.test.js` build a real linked worktree
  and reach MERGE with `marks.closed === true`; AC-9/10 reuse that construction with one extra
  done sibling spec and one deletion on the branch. **if false:** build the fixture inline in the
  new test file; never assert on prose.

## Rationale

The audit's largest loss is upstream direction flips, and the doctrine's own rule for earning a
guard (§ Incident Policy) needs a ledger count that is today structurally zero. This spec adds
the count and nothing else: the queue item asked for rows, no prose, no guard, and the host
rules say guards are scripts earned by recurrence. The queue payload named `spec-state-gate` as
the writer for the retired-spec row; exploration showed nothing mechanical flips a spec to
`superseded` — it is a hand edit — so the user chose the commit command as the hook, which sees
every flip that lands through it. A plain `git commit` typed outside the command is missed, the
same gap the existing fix and escape rows accept.

Both rows are `stage:"escape"` because that is the only row kind `byClass` reads; the cost is
that `escapesUnjoined` grows by every direction flip, which is honest (an unjoined escape is
never folded into either side of the false-CLEAN rate). The retired-spec row lists the spec file
as its one file, which makes the writer's duplicate refusal the idempotency mechanism for a
re-scanned commit. The deleted-file row attributes to the creator only, excludes tests-layer
rows (test expiry is by design), and names the merging spec as `supersededBy` — the ADR behind
it is one hop away through the spec's brief, and resolving decision ids across hosts with
different decision files would be a guess.

Critical tier: `spec/bin/spec-paths` is a § Risk Tiers surface (a new key), and the review
driver's merge step sits beside `merge-back.sh`'s exit-code alphabet. D4 therefore never fails
a landed merge and keeps `finishMerge` the single idempotent tail: derive before merge (the
source branch still exists), write after (the sha exists), rows carried in the sidecar across
the CONFLICTS and already-landed re-entry paths. Fragile to watch: the review-driver test needs
the full synthetic worktree fixture; `supersededBy` is an extra key the validator ignores, so a
future slim-row tightening must list it.

Build departures (folded from the deviations sidecar, 2026-11-02): AC-10 is a negative pin and
was green on the pre-image, with AC-9 as its red sibling in the same file. AC-9's first test
pinned `sha` to the final HEAD, which contradicted D4's "append as `finishMerge`'s first
action"; the build kept D4 verbatim, so the row is written before the evidence promotion, rides
the ledger-record commit, and carries the squash commit's sha. The test and AC-9's text were
tightened to that. `--merge` rows omit `stage` to match AC-5's exact shape, and the driver adds
`stage:"escape"` on append. The driver passes `--by` relative to the build worktree, because the
session's spec path carries the `.claude/worktrees/…` prefix. D7, a git plugin bump, was added
at build because D3 edits a second plugin directory. The fix-delta suite also required the
entry-point manifest to declare `supersession-rows.js` as a caller of `escape-row.js`.

### Advisory debt (review rv_dc2893789319)
- a0 /home/jj/projects/claude-plugins/.claude/worktrees/spec-11-a-direction-flip-leaves-a-row/spec/scripts/supersession-rows.js:93 — The new remedy text splices `JSON.stringify(row)` inside single quotes (`--check --row '${JSON.stringify(row)}'`). `row.supersededBy` is free-form frontmatter (`superseded_by`), so a value containing an apostrophe would produce a copy-paste remedy that the shell cannot parse; a spec path or sha never carries one, so only that one field is exposed. Hygiene only — the operator still sees the writer's own stderr and the row content.
- a1 /home/jj/projects/claude-plugins/.claude/worktrees/spec-11-a-direction-flip-leaves-a-row/tests/escape/supersession-rows.test.js:102 — No test pins the repaired writer-refusal path (escape-row.js --append exiting other than 0/3): neither the header's new exit-2 cause nor the remedy text in the stderr message is asserted anywhere, so a future edit could drop the remedy silently.

## Canonical Delta

Add to `docs/canonical/review-close.md`'s standing rules:

- **A merge-back that deletes shipped work records it.** Before the first `merge-back.sh`
  subcommand, the driver derives the files the spec branch deleted that a done spec's File Plan
  created (`supersession-rows.js --merge`, creator rows only, tests layer excluded) and stores
  them in the sidecar; after the merge lands, `finishMerge` appends one `stage:"escape"` row per
  owning spec (`class: shipped-file-deleted`, `via: review`, `supersededBy` = the merged spec,
  `sha` = the landed HEAD) through `escape-row.js --append`. A derivation failure prints one
  `⚠️` line and never fails the merge. The retired-spec sibling (`class: spec-superseded`) is
  written by `/git:commit` Step 3b when a commit flips a spec to `status: superseded`.
  (specs/20261101/11-a-direction-flip-leaves-a-row.md D2, D4)
