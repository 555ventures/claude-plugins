---
date: 2026-08-21
status: done
diff_base: fda882b1f33a55eae0b2acd0974875193a678745
open_markers: 0
tier: standard           # merge-back.sh (critical) is read, never edited; the driver is not on the Risk Tiers list. Worst failure: a stop row written to the fallback location (today's behavior, printed loudly) or a failed drain (rows remain visible via the union-read either way) — recoverable, never destructive, and the clean-root precondition is respected by construction (executed spike: gitignored paths are invisible to `git status --porcelain`).
area: review-verification
design: false
breaking: false
depends_on: ["specs/20260820/07-review-driver.md"]
depended_on_by: []
brief: n/a
spiked: 2026-08-21
---

# Durable hard-stop rows — a worktree review's GATE_RED evidence survives an abandoned worktree

## Goal

Closes deferred ruling R3(1) of specs/20260820/07-review-driver.md. Today a review running
in a linked build worktree that hard-stops on `RED_BLOCKING` appends its `GATE_RED` ledger
row to the worktree's own `.claude/spec-runs.jsonl`; the row reaches the main root only if a
merge later lands. An abandoned worktree — or the `git worktree remove --force` remedy the
pipeline itself prints — destroys it permanently, so the stopped attempt is invisible to
`spec-status`, `replay --due`, and `/spec:escape`, violating the doctrine invariant "a
stopped attempt is never invisible". Done means: the hard-stop row is written durably at the
main root **at the moment of the stop**, without dirtying the main tree (writing it straight
into the tracked ledger was executed and failed — it trips `merge-back.sh`'s
`assert_clean_root`/`ff-only` preconditions, R3's recorded evidence), every existing ledger
reader sees it with zero changes, and a later successful close folds it into the tracked
ledger in the correct position.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | When `repoRoot !== mainRoot` (the driver's existing resolve-compare of `mainRootPath()`), `runHardStopVerdict()` appends verdict.js's ledger line (stdout line 2, verbatim) to `<mainRoot>/.claude/spec-runs.stopped.jsonl` INSTEAD of the worktree ledger; in-place reviews (`repoRoot === mainRoot`) keep today's `appendLedger()` path unchanged (AC-20260821-04-1, AC-20260821-04-8, AC-20260821-04-10) | durable at the instant of the stop; gitignored → invisible to `assert_clean_root`'s plain porcelain check (executed spike A2), so the failed write-to-tracked-ledger approach's breakage cannot recur |
| D2 | Ensure-ignored guard with self-heal: before the durable write, run `git -C <mainRoot> check-ignore -q .claude/spec-runs.stopped.jsonl`; on exit ≠ 0, append the line `.claude/spec-runs.stopped.jsonl` to `<git-common-dir>/info/exclude` (absolute path via `git -C <mainRoot> rev-parse --path-format=absolute --git-common-dir`) and re-check once (AC-20260821-04-2) | hosts adopt with zero manual setup — `info/exclude` is git's private, untracked per-repo ignore surface, shared by linked worktrees (executed spike A5); mirrors the `check-ignore -q` guard pattern `merge-back.sh create` already uses |
| D3 | If the path is STILL not ignored after the self-heal (e.g. a host `.gitignore` negation pattern, which outranks `info/exclude` in git's precedence), fall back loudly to today's worktree-local `appendLedger()` and include a one-line remedy in the STOPPED step text naming the `.gitignore` line to add (AC-20260821-04-3) | never trade the durability bug for a merge-refusal bug — an un-ignored file at the main root would trip `assert_clean_root` (executed spike A3); fallback is exactly today's behavior, so it can never be worse |
| D4 | The STOPPED step text names the absolute path of the file the row actually landed in (durable or fallback), persisted in the sidecar as `marks.stoppedLedgerPath` so a re-invocation re-prints it (AC-20260821-04-4) | the session/user must never guess where terminal-red evidence lives; the sidecar survives re-invocation but not cleanup, which is fine — the row itself is the durable artifact |
| D5 | Merge-time drain: `promoteEvidenceAndClean()` first moves rows whose `spec` field equals this spec's repo-relative path from `<mainRoot>/.claude/spec-runs.stopped.jsonl` into the tracked `<mainRoot>/.claude/spec-runs.jsonl`, THEN appends the worktree's ledger lines (existing exact-line dedup unchanged) — so drained `GATE_RED` rows sit before the run's CLEAN close row in read order; the rewrite of the stopped file removes ONLY lines whose parsed `spec` matches, preserving other specs' rows byte-for-byte, and deletes the file when empty (AC-20260821-04-5, AC-20260821-04-9) | `qualifyingObservation()` picks the LAST review row by read-order position, and `spec-runs.stopped.jsonl` sorts after `spec-runs.jsonl` in the reader's filename sort (executed spike A4) — an undrained stale row would sit positionally after the close row and poison observation forever |
| D6 | In-place close drain: `doCloseWork()` performs the same spec-scoped drain (same helper as D5) before appending the authoritative close row, covering the abandoned-worktree-then-rebuilt-in-place path (AC-20260821-04-6) | without it, a spec that stopped in a since-abandoned worktree and later closed CLEAN in-place would keep a stale GATE_RED row positioned after its close row — same observation-poisoning mechanism as D5's rationale |
| D7 | This repo's own `.gitignore` gains the line `.claude/spec-runs.stopped.jsonl` (AC-20260821-04-7) | dogfood: the tracked line documents the surface and makes D2's self-heal unnecessary here; host repos rely on D2 |
| D8 | `spec/commands/review.md`'s ledger sentence (§ Rules, "Every pass's ledger line lands in `.claude/spec-runs.jsonl`, appended by the driver at STOPPED and CLOSE") is corrected: a worktree review's STOPPED line lands durably in `.claude/spec-runs.stopped.jsonl` at the main root and is folded into the tracked ledger at close/merge; the § Protocol STOPPED sentence gains the durable-location clause [no-ac: prose accuracy edit; the behavioral surface is AC-1/AC-4/AC-5, and the collision sweep at lock enumerated the pinned phrases] | leaving the old sentence would make doctrine assert a location that is now false for the worktree path |
| D9 | `spec/.claude-plugin/plugin.json` bumps (target 7.15.0 — next free minor at build time, a target not a pin per the recorded concurrent-semver gotcha) with the changelog paragraph [no-ac: version metadata; review's version-bump check is the enforcing oracle] | every behavior change bumps the owning plugin's semver |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/spec-review-driver.js | MODIFY | scripts | D1–D6: durable hard-stop write + ensure-ignored self-heal + fallback + STOPPED path line + spec-scoped drain helper called from `promoteEvidenceAndClean()` and `doCloseWork()` |
| .gitignore | MODIFY | other | D7: add `.claude/spec-runs.stopped.jsonl` |
| spec/commands/review.md | MODIFY | doctrine | D8: correct the two ledger-location sentences (§ Rules verdict bullet, § Protocol STOPPED sentence) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D9: version bump + changelog description |
| tests/review/review-driver.test.js | MODIFY | tests | Retag only: existing hard-stop test gains AC-20260821-04-8, existing promotion test gains AC-20260821-04-9 (SHALL CONTINUE TO pins — no assertion changes) |
| tests/review/stopped-row-durability.test.js | CREATE | tests | AC-20260821-04-1 … -7, AC-20260821-04-10 |

## Contracts

```js
// New path constant (driver-internal; the filename is load-bearing for the reader glob):
const STOPPED_LEDGER = '.claude/spec-runs.stopped.jsonl'
// lib/observation.js readLedgerRows() already matches it via /^spec-runs.*\.jsonl$/ and
// union-merges in filename order (spec-runs.jsonl first, spec-runs.stopped.jsonl after) —
// ZERO reader changes anywhere (executed spike A4). spec-status, replay --due, and
// /spec:escape therefore see stopped rows with no edits.

// Ensure-ignored guard (D2/D3), run once per hard stop before the durable write:
//   git -C <mainRoot> check-ignore -q .claude/spec-runs.stopped.jsonl   → exit 0: proceed
//   exit != 0 → append '.claude/spec-runs.stopped.jsonl\n' to
//     <abs common dir>/info/exclude   where abs common dir =
//     git -C <mainRoot> rev-parse --path-format=absolute --git-common-dir
//   re-check once; still != 0 → fallback: appendLedger() (worktree-local, today's path)
//     and STOPPED text carries: remedy line naming the .gitignore addition.
// check-ignore verdicts a not-yet-existing path (executed spike A3) — the guard runs
// before the first append ever happens.

// Spec-scoped drain (D5/D6) — one helper, two callers:
// drainStoppedRows(mainRootDir, specRel) → { drained: [<verbatim lines>] }
//   reads <mainRootDir>/.claude/spec-runs.stopped.jsonl (absent → {drained: []}),
//   partitions lines by JSON.parse(line).spec === specRel (unparseable lines are KEPT in
//   the file — flagging malformed lines is doctor's job, mirroring readLedgerRows),
//   rewrites the file with only the non-matching lines (deletes it when none remain),
//   returns the matching lines verbatim for the caller to append to the tracked ledger
//   BEFORE any close/promotion lines. Callers: promoteEvidenceAndClean() (before src-line
//   append), doCloseWork() when repoRoot === mainRoot (before the close-row append).
```

## Behavior

Hard-stop lifecycle after this spec, end to end:

1. A worktree review's blocking leg goes red → `runHardStopVerdict()` runs verdict.js
   (unchanged), then: in-place → append line 2 to `<repoRoot>/.claude/spec-runs.jsonl` as
   today; worktree → ensure-ignored guard (D2), then append line 2 to
   `<mainRoot>/.claude/spec-runs.stopped.jsonl`; guard unrecoverable → fallback (D3).
2. The STOPPED step prints the red legs (unchanged) plus the absolute path the row landed
   in, and the `.gitignore` remedy line if and only if the fallback fired (D4).
3. The worktree is abandoned or force-removed → the row survives at the main root; every
   reader already union-merges it (zero reader changes). `replay --due`'s
   `reviewsSince` counts it; a fixed row is never double-counted because the drain MOVES
   lines, never copies them.
4. The spec is later fixed and its review closes CLEAN:
   - same or new worktree + merge lands → `promoteEvidenceAndClean()` drains this spec's
     stopped rows into the tracked ledger first, then appends the worktree ledger's lines
     (GATE_RED rows land before the CLEAN close row in read order) (D5);
   - rebuilt and reviewed in-place → `doCloseWork()` drains before appending the close
     row (D6).
   Other specs' stopped rows are untouched either way.
5. ESCALATE writes no ledger row today — a separate pre-existing gap, explicitly OUT of
   this spec's scope (see Rationale). Also out: any reader change, locking around the
   drain, and extending durable-write to the CLOSE row.

## Acceptance Criteria

- **AC-20260821-04-1**: WHEN a review running in a linked worktree hard-stops on
  `RED_BLOCKING` THE SYSTEM SHALL append verdict.js's ledger line (stdout line 2,
  byte-equal) to `<mainRoot>/.claude/spec-runs.stopped.jsonl` and SHALL NOT append it to
  the worktree's `.claude/spec-runs.jsonl` (fixture: main root whose `.gitignore` ignores
  the path; worktree ledger absent or unchanged after the run) → test in
  tests/review/stopped-row-durability.test.js
- **AC-20260821-04-2**: WHEN the stopped-ledger path is not ignored at the main root THE
  SYSTEM SHALL append `.claude/spec-runs.stopped.jsonl` to the main root's git
  `info/exclude` and proceed with the durable write (fixture: host with NO ignore entry →
  after the run, `info/exclude` contains the line, `git check-ignore -q` exits 0, and the
  row is in the stopped file) → test in tests/review/stopped-row-durability.test.js
- **AC-20260821-04-3**: WHEN the path cannot be made ignored (fixture: main-root
  `.gitignore` contains the negation `!.claude/spec-runs.stopped.jsonl`, which outranks
  `info/exclude`) THE SYSTEM SHALL append the row to the worktree's own
  `.claude/spec-runs.jsonl` (today's behavior) and the STOPPED step text SHALL include a
  remedy line naming the `.gitignore` entry to add → test in
  tests/review/stopped-row-durability.test.js
- **AC-20260821-04-4**: WHEN the driver prints the STOPPED step THE SYSTEM SHALL name the
  absolute path of the file the GATE_RED row landed in (durable case: the main-root
  stopped-file path; fallback case: the worktree ledger path), including on a bare
  re-invocation after the stop → test in tests/review/stopped-row-durability.test.js
- **AC-20260821-04-5**: WHEN a worktree review closes CLEAN and the merge lands THE SYSTEM
  SHALL move this spec's rows out of `spec-runs.stopped.jsonl` into
  `.claude/spec-runs.jsonl` positioned before that run's close row, leaving other specs'
  rows in the stopped file byte-for-byte (literal: stopped file holds one row with
  `"spec":"specs/a.md"` and one with `"spec":"specs/b.md"`; merging spec a → tracked
  ledger index of a's GATE_RED row < index of a's CLEAN row; stopped file contains exactly
  the b row) → test in tests/review/stopped-row-durability.test.js
- **AC-20260821-04-6**: WHEN an in-place review (`repoRoot === mainRoot`) closes CLEAN and
  the stopped file holds rows for this spec THE SYSTEM SHALL drain them into the tracked
  ledger before appending the close row (same ordering and other-spec preservation as
  AC-5) → test in tests/review/stopped-row-durability.test.js
- **AC-20260821-04-7**: WHEN `git check-ignore -q .claude/spec-runs.stopped.jsonl` runs at
  THIS repository's root THE SYSTEM SHALL exit 0 (the `.gitignore` line is present) → test
  in tests/review/stopped-row-durability.test.js
- **AC-20260821-04-8**: WHEN an in-place review hard-stops THE SYSTEM SHALL CONTINUE TO
  append exactly one GATE_RED line to `.claude/spec-runs.jsonl` at the repo root, byte-equal
  to verdict.js's own line → existing test (AC-20260820-07-2) in
  tests/review/review-driver.test.js, retagged
- **AC-20260821-04-9**: WHEN a worktree review closes CLEAN and merges THE SYSTEM SHALL
  CONTINUE TO promote the worktree's ledger and retained evidence into the main root
  (exact-line / filename dedup) and leave the worktree clean for a plain
  `git worktree remove` → existing promotion test in tests/review/review-driver.test.js,
  retagged
- **AC-20260821-04-10**: WHEN a worktree hard-stop's row has landed durably and the
  worktree is then force-removed THE SYSTEM SHALL still return the GATE_RED row from
  `readLedgerRows(<mainRoot>)` (the row's durability is the write location, not the
  reader — the reader half alone is green pre-change and is NOT the assertion; the test
  asserts the row survives `git worktree remove --force`) → test in
  tests/review/stopped-row-durability.test.js

## Assumptions (escalation triggers)

Executed micro-spikes, 2026-08-21 (scratch repos, run and observed; A-numbers cited by the
Decisions):

- A1: `readLedgerRows()` needs zero changes — **executed:** fixture root with
  `spec-runs.jsonl` (CLEAN row) + `spec-runs.stopped.jsonl` (GATE_RED row);
  `readLedgerRows(root)` returned both: `["CLEAN","GATE_RED"]`. **if false:** STOP — the
  design's zero-reader-change premise is gone; re-consult before touching readers.
- A2: a gitignored file is invisible to `assert_clean_root` — **executed:** scratch repo,
  `.gitignore` line, file written → `git status --porcelain` printed nothing;
  `check-ignore -q` exit 0. **if false:** STOP, the whole approach fails.
- A3: the failure modes are real and detectable — **executed:** untracked non-ignored
  `.claude/` file → porcelain printed `?? .claude/` (the rejected untracked-staging
  alternative WOULD trip the merge precondition); `check-ignore -q` on a non-ignored path
  exits 1, and verdicts a not-yet-existing path (exit 0 when ignored, file absent).
  **if false:** the guard is misdesigned; re-spike before build.
- A4: reader read-order — **executed:** same A1 fixture; rows returned in filename-sort
  order, `spec-runs.jsonl` lines first, `spec-runs.stopped.jsonl` after — which is why
  D5/D6 drain at close is mandatory (`qualifyingObservation` is position-based).
  **if false:** re-derive the drain ordering from the actual order observed.
- A5: `info/exclude` self-heal works and is worktree-shared — **executed:** scratch repo +
  linked worktree; appended the line to `<common>/info/exclude` → `check-ignore -q` exit 0
  from BOTH the main root and the worktree; porcelain clean with the file present.
  **if false:** D2 degrades to D3's loud fallback; the feature still lands, hosts need the
  manual `.gitignore` line.
- A6: the drain's read-modify-write window is acceptable — a concurrent session appending
  a stopped row for a DIFFERENT spec in the milliseconds between read and rewrite could be
  lost. Accepted: same-order-of-magnitude window as every other multi-session ledger race
  this repo records, and the drain filters by spec so only genuinely concurrent foreign
  appends are exposed. **if false** (an observed loss): escalate to an append-only
  tombstone design — never add locking ad hoc mid-build.
- A7: verdict.js stdout line 2 is the ledger line (unchanged contract from spec 07).
  **if false:** STOP — the driver's existing appends share the assumption; something
  upstream broke.

## Rationale

R3(1) was deferred at spec 07's review precisely because a rushed version inside a capped
fix loop risked trading a durability bug for a merge-refusal bug (ruling R10). The design
here came from a Fable 5 consult (2026-08-21) and every load-bearing claim was executed
before locking (A1–A5). Rejected alternatives, with reasons: writing the tracked ledger at
the main root at stop time (executed failure, R3's own evidence — dirties the tree);
untracked-but-not-ignored staging (A3 shows porcelain sees it); a git-notes/ref sink
(second derivation of the ledger read — this repo's rules treat that as a hard finding); a
next-command sweep of abandoned worktrees (leaves a destructible window, which is the bug);
promoting inside `cleanup` (abandoned worktrees never call cleanup). The `info/exclude`
self-heal (D2) was added during planning: without it every host repo hits the fallback
until a human edits `.gitignore`, which re-creates the gap for exactly the users least
likely to know about it; `info/exclude` is git's sanctioned private ignore surface and the
append is idempotent-enough (one line, guarded by a re-check). ESCALATE writing no ledger
row at all is a PRE-EXISTING gap deliberately out of scope — it deserves its own decision
(what row, what verdict word) rather than riding a durability fix; recorded here so the
scoping is visible, not silent. Locking around the drain is rejected as gold-plating (A6).
Build-order note: specs/20260821/02 (hardened) also modifies `spec-review-driver.js` —
build serially after it lands, or accept a mechanical merge; no semantic dependency.

Build deviation (folded at close, 2026-08-22): D9's literal version target `7.15.0` was
already taken at build time — `spec/.claude-plugin/plugin.json` read `7.15.1` at the diff
base — so the build bumped to **7.16.0** carrying D9's changelog paragraph verbatim. This is
the recorded `[host]` gotcha that a spec Decision's literal version number is a target, not a
pin; one-off application, no new rules entry.

Collision sweep at lock (2026-08-21, `collision-closure` — both literals hits are already
File Plan rows): two `likely`-tier paths WAIVED as synthetic-fixture false positives —
`tests/scope-reconcile-at-risk.test.js` writes a `.gitignore` inside its own `tmpdir()`
fixture (stem-derivation edge case), and `tests/consistency/entrypoints.test.js` authors
its own synthetic `spec/commands/review.md` content; neither pins the real files this spec
edits.

## Canonical Delta

In `docs/canonical/review.md`, amend the evidence-retention paragraph (the one beginning
"Every authoritative review verdict also retains its evidence") — after the sentence
ending "…makes `git worktree remove` refuse cleanup after the merge already landed.",
insert: "The exception is terminal-red evidence: a worktree review's `RED_BLOCKING`
hard-stop appends its `GATE_RED` line to the gitignored
`<main root>/.claude/spec-runs.stopped.jsonl` at the moment of the stop (self-provisioned
via git's `info/exclude` when the host lacks the ignore line), so a stopped attempt
survives an abandoned or force-removed worktree; every ledger reader union-merges
`spec-runs*.jsonl`, and the rows are drained into the tracked ledger — positioned before
the close row — when that spec later closes CLEAN, in-place or via merge promotion.
(specs/20260821/04-stopped-row-durability.md)"
