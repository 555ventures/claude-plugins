---
date: 2026-08-24
status: done
tier: critical
area: review
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
open_markers: 0
diff_base: 354e2c1c6e236518b3d9fc7e4191e9cbc8507e24
---

# Review range identity — every review row names the code it judged

## Goal

A review ledger row records the verdict word but not the code the verdict was rendered on: no
row in the 118 on record carries a commit range (only `diff.loc`), and the reconcile leg
reduces its out-of-plan files to an integer at emission, so a CLEAN row cannot be traced to
the commits it covered or the files it found off-plan. After this lands, every review row
`verdict.js` prints — hard-stop, escalate, and close — carries the resolved base sha, the
HEAD sha at the moment of that pass, and whether the working tree was dirty, and the reconcile
leg's manifest row carries the out-of-plan paths beside the count. The retained per-run
artifact carries the same. Historical rows are never rewritten; readers already tolerate rows
that predate a field, and continue to. Done means `/spec:escape`'s runId backlink lands on a
row that names a range, and a review's out-of-plan paths survive in the ledger rather than only
in reviewer prose.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `verdict.js` gains `--base-sha <sha>` and `--head-sha <sha>` (review profile only). Both present → the printed row's `diff` object carries `base` and `head` verbatim, and `dirty` (D3), after `loc`: `{"loc":N,"base":"<40hex>","head":"<40hex>","dirty":false}`; with no `--diff-loc` the object is `{"base":…,"head":…,"dirty":…}`. Neither present → the row is byte-identical to today's (`diff: {loc}` or no `diff` key). (AC-20260824-06-1, AC-20260824-06-4) | The row schema lives in one place and the driver appends verdict.js's own printed line, so the identity must flow through verdict.js flags — never a driver-side splice. Rejected: a `range` sibling key (a second object describing the same diff). |
| D2 | `verdict.js` refuses (exit 2, stderr naming the remedy `git rev-parse --verify <ref>^{commit}`) a `--base-sha`/`--head-sha` value that is not exactly 40 lowercase hex characters, one flag passed without the other, or either flag on `--profile release`. Refusals happen at arg-parse time, before the manifest is read, printing no verdict word and no ledger line. (AC-20260824-06-2) | A symbolic or abbreviated ref in a durable row is the replay moving-ref defect (rv_387d84a3b424) reintroduced; the row must be a pin or absent, never a name that drifts. Rejected: accept-and-copy (the ledger's "copier, never validator" rule covers leg observations emitted by sibling scripts, not identity a caller could get wrong). |
| D3 | `verdict.js` gains `--dirty` (valid only alongside D1's pair; otherwise exit 2). Present → `diff.dirty: true`; absent with the pair present → `diff.dirty: false`. The retained artifact (`--retain`) gains a top-level `diff` key equal to the printed row's `diff` object, verbatim. (AC-20260824-06-1, AC-20260824-06-3) | The close row is written before the close commit, so fix-worker edits may be uncommitted at pass time — `head` alone would then under-describe the judged tree; `dirty: true` tells a reader the range's true upper bound is the close commit that follows. Rejected: reordering the row after the commit (the row rides the close commit by design, specs/20260819/01). |
| D4 | `spec-review-driver.js` resolves `base` (its existing `build_base → diff_base → merge-base` derivation) to a full sha once via `git rev-parse --verify <base>^{commit}` — a failure is `die` naming the remedy (`add diff_base: <sha> to the spec frontmatter`) — and `HEAD` via `git rev-parse HEAD` freshly at each verdict pass. It passes `--base-sha`, `--head-sha`, and `--dirty` (when `git status --porcelain --untracked-files=no` is non-empty) to all three ledger passes: hard-stop, escalate, and authoritative close. The diff_base frontmatter stamp reuses the same resolved sha. (AC-20260824-06-5, AC-20260824-06-6, AC-20260824-06-7, AC-20260824-06-11, AC-20260824-06-12) | The identity already exists in-process (the diff_base stamp resolves the same ref at close) and was simply never passed; HEAD is re-read per pass because fix iterations can add commits between passes. The stamp's former tolerate-and-warn path becomes a die: a base that cannot resolve already broke every leg's diff, so the row must not pretend otherwise. |
| D5 | `review-legs.js` emits the reconcile leg's observed as `{"outOfPlan":N,"files":[…]}` — `files` is `scope-reconcile.js`'s `outOfPlan` path array verbatim and in its order, always present (`[]` when N is 0), capped at 40 entries; when N exceeds 40, `files` holds the first 40 and `filesOmitted: N-40` is added. `countLegFinding` continues to read `outOfPlan`, never `files.length`. The reconcile row copies into the ledger row and the retained artifact through the existing verbatim-legs path, unchanged. (AC-20260824-06-8, AC-20260824-06-9, AC-20260824-06-10) | The paths are in scope at emission and discarded; every historical out-of-plan finding (counts 1–6 on record) lost its filenames, and today's survived only because the reviewer wrote it into prose. Bound at the emitter, never the copier (specs/20260820/06 D2/D11). Rejected: a separate `reconcile.json` retention (a second evidence home to keep in sync). |
| D6 | No waive cap: `derive()` keeps CLEAN derivable at any user-adjudicated waive count; no new verdict word, no threshold, no status anomaly in this spec. `[no-ac: a ruling that no code changes — the absence has no observable to assert beyond the existing CLEAN-at-any-count behavior already pinned by verdict.test.js's disposition arithmetic]` | 24 of 118 reviews carry waivers (max 12; that run was legFindings-only with zero reviewer survivors — reconcile's File-Plan strictness on a sweep-shaped spec, not verdict laxity). A cap would second-guess an adjudication the doctrine deliberately routes to the user; precedent says the escalation fact is a typed row field, never a verdict word. Surfacing high-waive runs in `/spec:status` is deferred — see Rationale. |
| D7 | `spec/commands/escape.md` step 3 gains one sentence: when the correlated row carries `diff.base`/`diff.head` (rows from 7.32.0 on), those name the reviewed range and `diff.dirty: true` means the close commit that follows the row completes it; older rows carry neither and the step proceeds exactly as today. `[no-ac: doctrine prose; the row fields themselves are pinned by AC-1/AC-5]` | The falsifiability contract should say what its backlink now lands on; non-retroactivity mirrors escape.md's existing tolerance for rows predating `runId`. |
| D8 | `spec/.claude-plugin/plugin.json` bumps to 7.32.0 (target, not pin — this repo's next-free-version Gotcha applies) with a changelog paragraph in the last-3 form (7.29.0 drops off). `[no-ac: version discipline is a review check, not a behavior]` | Every behavior change bumps the owning plugin's semver (pipeline rules § Planning). |
| D10 | AC-20260824-06-5's bullet no longer carries the literal `SHALL CONTINUE TO`. The byte-equal re-run property it describes is AC-20260820-07-2's pin, carried forward unweakened in both carriers; AC-5 itself is a NEW promise (the row's `diff.base`/`head`/`dirty`), so `tests/review/stopped-row-durability.test.js` — whose only carried AC is AC-5 — is red pre-image by construction. (AC-20260824-06-5) | `red-check.js` resolves a tests-layer file's expected colour as `carriedAcs.every(isSanctioned)`; a single bullet that both pins a continuing property and promises a new one is unclassifiable, and the marker made the file green-expected, reporting its correct red as `broken-pin`. Orchestrator ruling at build Phase 1, 2026-08-24; no promise added, removed, or weakened — the same two behaviors stay asserted by the same two tests. |
| D9 | Historical ledger rows and retained artifacts are never rewritten or backfilled; `replay.js --select` and `spec-status.js` are untouched and keep reading frontmatter `diff_base` as today. (AC-20260824-06-4, AC-20260824-06-11) | Backfilling would fabricate identity the runs never recorded; readers already degrade on absent optional fields. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/verdict.js | MODIFY | scripts | D1–D3: `--base-sha`/`--head-sha`/`--dirty` parsing + refusal matrix at arg-parse time; `diff` object gains `base`/`head`/`dirty` after `loc`; retained artifact gains `diff`; usage line and header incident paragraph updated |
| spec/scripts/spec-review-driver.js | MODIFY | scripts | D4: one `resolveBaseSha()` helper (die on failure, reused by the diff_base stamp), per-pass `git rev-parse HEAD` + porcelain dirty check, the three flags threaded into `runHardStopVerdict`, `writeEscalateRow`, `doCloseWork`; header paragraph |
| spec/scripts/review-legs.js | MODIFY | scripts | D5: reconcile row emits `files` (verbatim paths, cap 40, `filesOmitted`); header row-shape comment updated |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D8: version 7.32.0 target + changelog paragraph (last-3 form) |
| spec/commands/escape.md | MODIFY | doctrine | D7: one sentence in step 3 on `diff.base`/`diff.head`/`diff.dirty`, older rows unchanged |
| tests/review/verdict.test.js | MODIFY | tests | AC-20260824-06-1, AC-20260824-06-2, AC-20260824-06-3, AC-20260824-06-4, AC-20260824-06-10 |
| tests/review/review-legs.test.js | MODIFY | tests | AC-20260824-06-8, AC-20260824-06-9; the green-host reconcile pin at the `{ outOfPlan: 0 }` deepStrictEqual is updated in place to `{ outOfPlan: 0, files: [] }` and retagged with AC-20260824-06-8, never weakened |
| tests/review/review-driver.test.js | MODIFY | tests | AC-20260824-06-5, AC-20260824-06-6, AC-20260824-06-11, AC-20260824-06-12; the AC-20260820-07-2 byte-equal re-run gains `--base-sha`/`--head-sha`/`--dirty` from the appended row's `diff`, retagged additionally with AC-20260824-06-5 |
| tests/review/stopped-row-durability.test.js | MODIFY | tests | AC-20260824-06-5 (worktree carrier): the byte-equal re-run gains the three flags from the appended row's `diff`, retagged additionally, never weakened |
| tests/review/escalate-row.test.js | MODIFY | tests | AC-20260824-06-7 |

Orchestrator duty (outside the table): `docs/canonical/review.md` is touched only by `/spec:review` applying the Canonical Delta below — no worker edits it.

## Contracts

Review ledger row (`verdict.js --ledger`, review profile) — additive; every other key unchanged:

```jsonc
{
  "ts": "…", "spec": "…", "stage": "review", "tier": "…", "runId": "rv_…", "verdict": "…",
  "scope": "full", "iteration": 1,
  "diff": {
    "loc": 3166,                                        // present iff --diff-loc (unchanged)
    "base": "354e2c1c6e236518b3d9fc7e4191e9cbc8507e24", // present iff --base-sha/--head-sha (D1)
    "head": "9b1d0c4e7a2f5b3c8d6e1f0a4b7c2d9e8f3a6b5c", // HEAD at this pass
    "dirty": false                                      // --dirty present → true; pair present, flag absent → false
  },
  "smoke": "…", "testsSkipped": {…}, "legs": [ … ], "tokens": {…}, "findings": {…}
}
```

Key order inside `diff` is fixed: `loc`, `base`, `head`, `dirty` (omit `loc` when no `--diff-loc`).

`verdict.js` flag matrix (review profile):

| Flags | Result |
|-------|--------|
| neither `--base-sha` nor `--head-sha` | row unchanged from today; `--dirty` alone → exit 2 |
| both, each `/^[0-9a-f]{40}$/` | `diff.base`/`diff.head`/`diff.dirty` emitted |
| exactly one of the pair | exit 2: `verdict.js: --base-sha and --head-sha travel together — pass both (git rev-parse --verify <ref>^{commit}) or neither` |
| a value not 40 lowercase hex (e.g. `main`, `354e2c1`, uppercase) | exit 2: `verdict.js: --base-sha/--head-sha must be a full 40-hex commit sha, got "<v>" — resolve it with git rev-parse --verify <ref>^{commit}` |
| either flag with `--profile release` | exit 2: `verdict.js: --base-sha/--head-sha are not valid with --profile release — a release row describes a milestone, not a diff` |

Refusals print no verdict word and no ledger line (arg-parse time, like the existing `--retain`/`--escalated` matrix).

Retained artifact (`.claude/spec-runs/<runId>.json`) — one added top-level key, inserted after `dispositions`:

```jsonc
{ "runId", "ts", "spec", "tier", "iteration", "scope", "verdict", "dispositions": {…},
  "diff": { "loc": N, "base": "…", "head": "…", "dirty": false },   // the printed row's diff object verbatim; absent when the row has no diff key
  "legs": […], "reviewer": … }
```

Reconcile manifest row (`review-legs.js`, full scope only — unchanged in `--fix-delta`, which emits no reconcile row):

```jsonc
{"leg":"reconcile","exit":0,"observed":{"outOfPlan":0,"files":[]}}
{"leg":"reconcile","exit":3,"observed":{"outOfPlan":1,"files":["docs/roadmap/10-genesis-tournament.md"]}}
{"leg":"reconcile","exit":3,"observed":{"outOfPlan":41,"files":["<first 40 paths in scope-reconcile order>"],"filesOmitted":1}}
```

`files` entries are scope-reconcile's `outOfPlan` strings verbatim (repo-relative paths). `filesOmitted` is present only when `outOfPlan > 40`.

Driver → verdict.js argument additions (all three passes): `--base-sha <resolved base sha> --head-sha <git rev-parse HEAD> [--dirty]`.

## Behavior

- **Driver resolution.** `resolveBaseSha()` runs `git rev-parse --verify <base>^{commit}` in `repoRoot` once, at startup right after `resolveBase()` — so an unresolvable base dies before the first manifest or leg (AC-12), not at the first verdict pass; status ≠ 0 or empty stdout → `die('spec-review-driver: base "<base>" does not resolve to a commit — add diff_base: <sha> to the spec frontmatter (git rev-parse --verify <ref>^{commit})')`. `stampDiffBaseIfAbsent` calls the same helper instead of its own rev-parse; its former warn-and-continue branch is removed (the die precedes it). Per pass, `headSha()` runs `git rev-parse HEAD` (die on failure, same shape) and `treeDirty()` runs `git status --porcelain --untracked-files=no` in `repoRoot` — any output line → `--dirty`. Untracked files never count: the sidecar and scratch artifacts are expected on disk at every pass.
- **Which HEAD.** The head recorded is HEAD at the moment the pass runs: the hard-stop row's head is the tree the red leg ran on; the escalate row's head is the tree after the capped fix iterations; the close row's head is the tree the authoritative pass judged — the close commit itself lands after and is not in the range (the `dirty` flag plus the close commit found by `git log -1 -- <spec>` — replay's own method — complete it).
- **Reconcile emission.** `appendRow('reconcile', r.code, { outOfPlan: n, files: paths.slice(0, 40), ...(n > 40 ? { filesOmitted: n - 40 } : {}) })` where `paths = reconcileJson ? reconcileJson.outOfPlan : []`. An unparseable scope-reconcile JSON keeps today's `n = 0` path and emits `files: []`.
- **Re-run reproducibility** (the existing driver-test proof that the driver appends verdict.js's own line, never a hand-composed one) continues to hold: re-invoking verdict.js with the row's recorded `diff.base`/`diff.head` (+ `--dirty` when `diff.dirty`) reproduces the row byte-for-byte aside from `ts`.
- **Consumers.** `/spec:escape` step 3 reads the new fields when present (D7). `replay.js --select`, `spec-status.js`, `verdict.js countLegFinding`, and every ledger reader are unchanged; rows without `diff.base` behave exactly as before.

## Acceptance Criteria

- **AC-20260824-06-1**: WHEN `verdict.js --ledger --workflow <clean> --retain <dir> --base-sha 354e2c1c6e236518b3d9fc7e4191e9cbc8507e24 --head-sha 9b1d0c4e7a2f5b3c8d6e1f0a4b7c2d9e8f3a6b5c --diff-loc 12` runs against a green manifest THE SYSTEM SHALL print a row whose `diff` deep-equals `{"loc":12,"base":"354e2c1c6e236518b3d9fc7e4191e9cbc8507e24","head":"9b1d0c4e7a2f5b3c8d6e1f0a4b7c2d9e8f3a6b5c","dirty":false}` with keys in exactly that order, and write `<dir>/<runId>.json` whose top-level `diff` deep-equals the same object; with `--dirty` added, both carry `"dirty":true`; with the pair but no `--diff-loc`, `diff` is `{"base":…,"head":…,"dirty":false}` → tests in `tests/review/verdict.test.js`
- **AC-20260824-06-2**: WHEN `verdict.js` receives `--base-sha main --head-sha <40hex>`, or `--base-sha 354e2c1 --head-sha <40hex>`, or `--base-sha <40hex>` alone, or `--dirty` with neither, or `--profile release --base-sha <40hex> --head-sha <40hex>` THE SYSTEM SHALL exit 2 with stderr naming `git rev-parse --verify` (the resolution remedy) and print neither a verdict word nor a ledger line on stdout (e.g. `--base-sha main …` → exit 2, stdout `""`) → tests in `tests/review/verdict.test.js`
- **AC-20260824-06-3**: WHEN the retained artifact is written with the sha pair present THE SYSTEM SHALL place `diff` immediately after `dispositions` in key order, and WHEN written without the pair and without `--diff-loc` THE SYSTEM SHALL write no `diff` key at all (e.g. `Object.keys(artifact)` → `["runId","ts","spec","tier","iteration","scope","verdict","dispositions","legs","reviewer"]`) → tests in `tests/review/verdict.test.js`
- **AC-20260824-06-4**: WHEN `verdict.js --ledger` runs with neither `--base-sha` nor `--head-sha` THE SYSTEM SHALL CONTINUE TO print a row whose `diff` is exactly `{"loc":N}` when `--diff-loc N` is passed and which has no `diff` key otherwise, and whose retained artifact has no `diff` key (e.g. today's `rv_441558867ece` flag set → `"diff":{"loc":3166}`) → tests in `tests/review/verdict.test.js`
- **AC-20260824-06-5**: WHEN the driver hard-stops on a red gate in the synthetic host THE SYSTEM SHALL append a GATE_RED row whose `diff.base` equals `git rev-parse --verify <resolved base>^{commit}` of the fixture, whose `diff.head` equals `git rev-parse HEAD` of the fixture at that moment, and whose `diff.dirty` is `false` on a clean fixture tree — and re-invoking `verdict.js` with the row's recorded `--base-sha`/`--head-sha`(/`--dirty`) SHALL reproduce the row byte-for-byte aside from `ts`, in-place and in the worktree (stopped-ledger) carrier alike (the byte-equality property itself is AC-20260820-07-2's, carried forward unweakened; this AC is a NEW promise about the row's fields, so both carriers are red pre-image — see D10) → the AC-20260820-07-2 test in `tests/review/review-driver.test.js` and its worktree mirror in `tests/review/stopped-row-durability.test.js`, both updated in place and retagged
- **AC-20260824-06-6**: WHEN a clean run reaches CLOSE with one uncommitted tracked-file edit in the fixture tree THE SYSTEM SHALL append a close row with `diff.dirty: true`, `diff.head` equal to the fixture's HEAD before the close commit, and a retained artifact whose `diff` deep-equals the row's; WHEN the tree is clean apart from untracked files (the sidecar) THE SYSTEM SHALL record `diff.dirty: false` (e.g. an untracked `scratch.txt` alone → `false`; a modified tracked `README.md` → `true`) → tests in `tests/review/review-driver.test.js`
- **AC-20260824-06-7**: WHEN a third `fix-applied` lands ESCALATE THE SYSTEM SHALL write an escalate row carrying `diff.base` and `diff.head` as 40-hex shas (`/^[0-9a-f]{40}$/` both) and `diff.dirty` as a boolean → tests in `tests/review/escalate-row.test.js`
- **AC-20260824-06-8**: WHEN `review-legs.js` runs full scope against a host where one changed file `src/stray.js` is outside the File Plan THE SYSTEM SHALL append `{"leg":"reconcile","exit":3,"observed":{"outOfPlan":1,"files":["src/stray.js"]}}`, and against the all-in-plan green host SHALL append `observed` deep-equal to `{"outOfPlan":0,"files":[]}` → tests in `tests/review/review-legs.test.js` (the green-host pin updated in place)
- **AC-20260824-06-9**: WHEN 41 changed files are outside the File Plan THE SYSTEM SHALL emit `files` of length 40 holding the first 40 of scope-reconcile's `outOfPlan` array in its order, `outOfPlan: 41`, and `filesOmitted: 1`; WHEN exactly 40 are outside THE SYSTEM SHALL emit all 40 and no `filesOmitted` key → tests in `tests/review/review-legs.test.js`
- **AC-20260824-06-10**: WHEN a manifest's reconcile row is `{"exit":3,"observed":{"outOfPlan":2,"files":["a.js","b.js","c.js"]}}` (a deliberately mismatched count) THE SYSTEM SHALL CONTINUE TO count exactly 2 leg findings — `--waived 2` derives CLEAN and `--waived 3` exits 2 on the contradiction check (the pool reads `outOfPlan`, never `files.length`) → tests in `tests/review/verdict.test.js`
- **AC-20260824-06-11**: WHEN the driver flips a spec to `status: done` THE SYSTEM SHALL CONTINUE TO stamp `diff_base: <sha>` into the frontmatter, and that sha SHALL equal the close row's `diff.base` (one resolution, two carriers; e.g. row `diff.base` `"<40hex>"` → frontmatter line `diff_base: <same 40hex>`) → the AC-20260823-05-7 stamp test in `tests/review/review-driver.test.js`, extended in place with the row equality and retagged
- **AC-20260824-06-12**: WHEN the spec's base ref does not resolve to a commit THE SYSTEM SHALL exit 2 before any leg or verdict pass runs, with stderr naming `diff_base` and `git rev-parse --verify`, appending no ledger line and writing no manifest (e.g. `build_base: no-such-branch` → exit 2, `.claude/spec-runs.jsonl` unchanged, no `manifest-1.jsonl`) → tests in `tests/review/review-driver.test.js`

## Assumptions (escalation triggers)

- A1: `verdict.js` accepts an array-valued sub-field inside `observed` and copies it verbatim into the row's `legs` — **executed 2026-08-24**: a manifest whose reconcile row read `{"outOfPlan":1,"files":["docs/roadmap/10-x.md"]}` derived `GATE_RED` (gate deliberately red) and printed the row with `"observed":{"outOfPlan":1,"files":["docs/roadmap/10-x.md"]}` intact; exit 1. — **if false:** D5 STOPs; the manifest validator (specs/20260820/06 D1) would need a Decision here first.
- A2: `countLegFinding` reads `observed.outOfPlan` and ignores `files` — **executed 2026-08-24**: same manifest with gate green, a zero-survivor workflow, `--waived 1` → `CLEAN` exit 0; `--waived 2` → exit 2 `… exceeds the workflow file's 0 survivors + the manifest's 1 legFindings (sum 1)`. — **if false:** AC-10 is the tripwire; fix in `countLegFinding`, never by dropping `files`.
- A3: the pre-image rejects the new flags, so the new-flag tests are honestly red before D1 — **executed 2026-08-24**: `verdict.js --manifest <m> --ledger --base-sha abc` → usage line, exit 2. — **if false:** nothing to do (the tests would be green for the wrong reason; red-check catches it).
- A4: `git rev-parse --verify <ref>^{commit}` prints exactly one 40-hex line on success and exits 128 with `fatal: Needed a single revision` on an unknown ref; `git rev-parse HEAD` prints 40 hex — **executed 2026-08-24** against git in this repo (`main^{commit}` and `HEAD` both → `354e2c1c6e236518b3d9fc7e4191e9cbc8507e24`; `nonexistent-ref^{commit}` → exit 128). — **if false:** D4's helper checks status ≠ 0 OR non-40-hex stdout, so a different shape still dies rather than stamping garbage.
- A5: `git status --porcelain --untracked-files=no` prints zero lines on a tree whose only changes are untracked files — **executed 2026-08-24**: clean checkout → 0 lines. — **if false:** AC-6's untracked case is the tripwire; switch to `git diff-index --quiet HEAD --` and record the deviation.
- A6: the two byte-equal re-run tests (review-driver, stopped-row-durability) are the only existing pins that rebuild verdict.js flags from an appended row — grep `reArgs` 2026-08-24: those two files only. — **if false:** the build's whole-suite check surfaces the third; update in place and retag, never weaken.
- A7: `tests/review/review-legs.test.js:165` is the only existing deepStrictEqual on the emitted reconcile `observed` shape (fixtures in verdict.test.js/escalate-row.test.js are *inputs* to verdict.js and stay valid as older-shape rows) — **if false:** same rule as A6.

## Rationale

**Why now.** Closing specs/20260824/01 (CLEAN, 2 waived) traced its one survivor to an
unrelated commit that landed three minutes after the build commit and rode into the review
range. The finding was correct and the waiver was right — but the row that recorded the CLEAN
verdict says nothing about which commits it judged, and the out-of-plan filename that made the
diagnosis possible survived only because the reviewer agent quoted it in prose. Measured across
the ledger: 0 of 118 review rows carry a range; 5 of 12 retained artifacts with a reconcile
record have `outOfPlan > 0` and none names a file. `/spec:escape`'s backlink — the mechanism
that makes CLEAN falsifiable — currently lands on a row that cannot say what it covered.

**Why the range fix also explains waivers.** An unrelated commit riding the range *creates*
out-of-plan findings; with `diff.base`/`diff.head` on the row, a later reader can test that
hypothesis mechanically (`git log base..head` against the build commit) instead of from memory.

**D6 — no cap, and why status surfacing is deferred.** The Fable consult (2026-08-24) judged the
20% waive rate not pathological and a cap as second-guessing user adjudication; it also floated
surfacing high-waive runs as a `/spec:status` anomaly prioritized by replay. That is deferred
here, not rejected: it needs a threshold (any number is arbitrary until an escape row correlates
with a high-waive review), a window (anomalies are current-state lines, not history), and a
third critical-tier file (`spec-status.js`). The reopen condition is grep-answerable: an
`escape` row whose `reviewRunId` points at a review row with `findings.waived ≥ 3`. No roadmap
brief is written — the evidence that would justify one does not exist yet.

**D2's validation vs "copier, never validator".** verdict.js copies *leg observations* verbatim
because their emitters own their grammar. The sha pair is different: it is identity the caller
supplies, and a wrong value silently poisons forensics forever. The 40-hex check is the whole
validation — no ancestry, no repo access — so verdict.js stays a pure function of its inputs.

**D3's `dirty` flag.** The close row is written by `doCloseWork` before the close commit exists;
fix-worker edits committed only at close would be outside `base..head`. Recording the row after
the commit is not an option (the row rides the commit, specs/20260819/01), so the row states
the caveat instead. Untracked files are excluded deliberately: the sidecar is always present.

**D5's cap of 40.** The largest count on record is 6; a sweep-shaped spec could plausibly reach
the teens. 40 bounds a tracked-ledger row to roughly 2 KB of paths while keeping the honest
signal (`filesOmitted`) when the bound bites.

**Collision closure at lock (2026-08-24, `--literal "outOfPlan: 0" --literal unstamped --literal
reArgs`; 11 hits, 6 waived).** Literals leg: `outOfPlan: 0` in `tests/review/escalate-row.test.js`,
`tests/review/verdict.test.js`, `tests/verdict-gatered-no-workflow.test.js` — waived: those
literals are manifest *inputs* fed to verdict.js, which stays valid for older-shape rows (D9);
only the emitter-side pin in `review-legs.test.js` changes, and it is in the File Plan.
`unstamped` in `docs/canonical/bootstrap.md`, `spec/scripts/init-gen.js`, and the minimal-host
fixture — waived: an unrelated sense (config stamping), not the driver's retired warn path;
`reArgs` hits are both in-plan. Paths leg `likely` hits (`tests/scope-reconcile-at-risk.test.js`,
`tests/consistency/entrypoints.test.js`) are fixture path strings and the exhaustive entrypoints
pin — no new entrypoint lands, and per this repo's Gotcha a `likely` hit at lock owes no waive.

**Fragile spots.** The two byte-equal re-run tests will go red the moment D1 lands unless the
flags are threaded (A6) — that is the intended collision, update in place. The driver's base
resolution moving from warn to die (D4) changes one error path's shape; AC-11 pins it. No
`SHALL CONTINUE TO` pin is needed on the release profile beyond AC-2's refusal: the release
row's shape is untouched.

**Deviation folded at close (2026-08-24, one-off).** The Contracts "verdict.js flag matrix"
table quoted an exact stderr message for the "either flag with `--profile release`" row that
did not itself contain `git rev-parse --verify`, while D2 and AC-20260824-06-2 require every
`--base-sha`/`--head-sha` refusal — that row included — to name that remedy. The two could not
both be satisfied verbatim, so the shipped message keeps the table's string as an exact prefix
and appends `(git rev-parse --verify <ref>^{commit})`. Reviewed and accepted as a disclosed
resolution of a spec-internal conflict, not a rule violation. One-off: an illustrative quoted
string drifting from its own Decision's blanket rule is a per-spec authoring slip, not a
recurring class.

## Canonical Delta

Append to `docs/canonical/review.md` after the retention paragraph ("Every authoritative review
verdict also retains its evidence…"):

  Every review row names the code it judged (specs/20260824/06-review-range-identity.md, done
  YYYY-MM-DD): `spec-review-driver.js` resolves its base ref to a full sha once (a base that
  does not resolve is a `die` naming the `diff_base` remedy — never a warn-and-continue) and
  re-reads `HEAD` at every verdict pass, passing `--base-sha`/`--head-sha`/`--dirty` to all
  three ledger passes; `verdict.js` copies the pair into the row's `diff` object
  (`{loc, base, head, dirty}`, key order fixed) and the retained artifact's top-level `diff`,
  refusing (exit 2, before any derivation) anything but a 40-hex pair, one flag without the
  other, or either on the release profile. `dirty: true` means uncommitted tracked edits were
  present at pass time, so the close commit that follows completes the range. The reconcile
  leg's row carries its out-of-plan paths beside the count — `{"outOfPlan":N,"files":[…]}`,
  verbatim from `scope-reconcile.js`, capped at 40 with `filesOmitted` when the cap bites —
  and `countLegFinding` still reads the number. Rows and artifacts from before this landed are
  never backfilled; `/spec:escape` reads the range when present and proceeds as before when
  absent. No waive cap exists by ruling: CLEAN stays derivable at any user-adjudicated waive
  count, and high-waive surfacing waits for an escape row that correlates with one.
