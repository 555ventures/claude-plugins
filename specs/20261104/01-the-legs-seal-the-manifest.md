---
date: 2026-11-04
status: done
tier: standard           # 📌 auto-picked (D0); the host's § Risk Tiers names verdict.js and review-legs.js — every AC carries a literal example so a mid-build upgrade costs nothing
area: gate-integrity
breaking: false
depends_on: [specs/20261103/12-one-suite-run-per-tree.md]
brief: n/a
spiked: 2026-11-04
open_markers: 0
diff_base: 15a0c61480e37b6a7c817471c055640e8bedb8b8
---

# The legs seal the manifest

## Goal

The review evidence manifest (`<spec>.review/manifest-N.jsonl`) has two readers that disagree:
the review driver's disposition pool takes every red non-blocking row, while `verdict.js` keeps
only the last row per leg. Any leg script re-run by hand with `--manifest` pointing at the live
file appends rows nothing notices, and the two readers then deadlock `--mark dispositions`
(observed on 20261103/13 round 2: "2 dispositions exceed pool of 1" against "does not cover
leg:ac-matrix"). Done means one shared manifest reader for every script that reads a manifest, a
duplicate leg row surfacing as invalid evidence rather than being resolved by either reader, the
driver recording a digest of each manifest the moment its legs run wrote it and refusing every
later invocation on drift with a remedy that names the cause, and the reviewer and disposer
prompts telling those agents to re-run a leg only against a scratch copy.

## Users

- Orchestrating session: When a legs run has written a manifest and I later mark a step, I want
  the driver to refuse if the manifest's bytes changed since, naming what appended to it and how
  to recover, so I can never reach a deadlock that only hand-truncating the file unblocks. First
  run / empty: no manifest exists yet; the first legs run writes and seals one.
- Reviewer or disposer agent: When I want to re-run `ac-matrix.js` or another leg script to check
  a finding, I want my prompt to tell me to copy the manifest first, so I can gather evidence
  without changing the evidence the verdict derives from. First run / empty: the live manifest
  is the only copy; the copy is mine to make.
- Release operator or script author: When any script reads a manifest, I want every one of them
  to see the same rows, validity and per-leg map, so I can trust that a red leg can never be
  erased by a later green row in the same file. First run / empty: a missing manifest reads as
  absent in every caller, never as an empty green file.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D0 | 📌 Auto-picked `tier: standard` — the precedent is specs/20261103/12 (same surfaces, standard); the `verdict.js` change is a reader swap under its existing pins. The host's § Risk Tiers names `verdict.js`, `review-legs.js` and `spec-review-driver.js`'s evidence, so the build upgrades on the first mid-build evidence per core § Tiers; every AC below carries a literal example so the upgrade costs nothing. `[no-ac: frontmatter — read by the drivers]` | The tier is the owner's call (veto anytime); the trigger is recorded so the upgrade path is visible. |
| D1 | New `spec/scripts/lib/manifest.js` exports one function, `readManifest(p)`: returns `null` when `p` cannot be read; otherwise `{ rows, byLeg, valid, cause, digest }` where `rows` is every JSON-parseable non-blank line in file order, `byLeg` is a `Map` from `leg` to the FIRST row carrying that `leg` string, `digest` is the sha256 hex of the file's bytes, and `valid` is `false` with `cause` set by the first of: a line that does not parse or lacks a string `leg` / numeric `exit` (`row N unparseable`), a row whose `observed` is not a non-null non-array object (`row N observed must be a non-null JSON object`), a second row for a leg already seen (`duplicate leg <name> (rows i, j)`). A later row never replaces an earlier one. (AC-20261104-01-1, AC-20261104-01-2, AC-20261104-01-3) | One reader, one validity rule, one per-leg map; a duplicate is evidence of a second run, which no reader may resolve by choosing a row. Rejected: last-in-file wins (erases a red leg with a green hand re-run) and dedupe-in-driver (same erasure). |
| D2 | `verdict.js` deletes its inline manifest loop and reads `readManifest(manifestPath)`: `null` keeps today's exit 2 naming `--manifest`; `legRows` is `byLeg`; `!valid` sets `manifestValid = false` with `invalidCause = cause`, so a duplicate leg derives `UNVERIFIED` with the stderr line `verdict.js: UNVERIFIED — manifest invalid: duplicate leg ac-matrix (rows 6, 9)`; every other derivation (required legs, scope carriers, pools, ledger/retain rows from `legRows`) is byte-identical. (AC-20261104-01-4, AC-20261104-01-5) | The sole verdict derivation stops holding a private reader; "manifest invalid" already fails closed, so a duplicate joins it instead of adding a verdict word. |
| D3 | `spec-review-driver.js` deletes `readManifestRows()` and reads every manifest through `readManifest`: `rowsOf(n)` returns `rows` (or `[]` for `null`) for the blocking, skips, scope, reuse and flaky reads; `dispositionPools(n)` enumerates `byLeg.values()`, so the driver's `leg:<name>` refs are exactly the rows `verdict.js` pools. `ac-matrix.js` deletes its `readManifestRows()` and reads oracle standing from `byLeg` (a string-`observed` row still counts as standing — `byLeg` admits every row with a `leg`); `release-legs.js` deletes `readManifestRows()` and `manifestHasRows()` for `readManifest` (`rows.length > 0` is "has rows"); `review-legs.js`'s summary reads `byLeg` from the same module. (AC-20261104-01-9, AC-20261104-01-10, AC-20261104-01-11, AC-20261104-01-12) | Five private readers become one; each caller keeps its own semantics by picking `rows` or `byLeg`, never by re-parsing. |
| D4 | `runLegs(n)` seals the manifest: after `review-legs.js` returns, when `manifest-<n>.jsonl` exists, the driver records `marks.manifestDigest[String(n)] = readManifest(...).digest` and saves the sidecar — on hard stops too, since STOPPED re-reads the file. On EVERY invocation (bare, `--state`, any `--mark`), before `handleMark()`/`deriveState()` run, the driver reads `n = liveIteration()`; when `marks.manifestDigest[n]` is recorded and the file exists and its digest differs, it exits 2 with a message that names the file, `changed after the legs run that sealed it`, the cause — `leg:<name> appears <k> times — a leg script was re-run with --manifest pointing at the live file` when `readManifest` reports a duplicate, else `edited by hand` — the rule `re-run a leg only against a copy: cp <manifest> <scratch> then --manifest <scratch>`, and the remedy `rm <manifest>` then re-run `node <driver> <spec>` (legs regenerate at iteration `n`; the run cache reuses a green gate/suite over the same tree). A missing file is never drift (it is the remedy's own state and `deriveState()` regenerates it); a sidecar with no recorded digest for `n` is unchecked. `verifyManifestWritten()` is unchanged. (AC-20261104-01-6, AC-20261104-01-7, AC-20261104-01-8) `[guards: spec/scripts/verdict.js — the sole derivation of the review/release verdict word; spec/scripts/review-legs.js — runs every deterministic review leg and writes the evidence manifest verdict.js derives from]` | Terraform's saved plan carries the state serial and `apply` refuses "Saved plan is stale" rather than re-planning; the manifest is the review's saved plan. Rejected: sealing lazily at the next invocation (would bless a file that already drifted). |
| D5 | `tests/review/disposer-gate.fixtures.js` gains `appendSealedRow(host, n, row)` — appends the row to `manifest-<n>.jsonl` and writes the file's fresh sha256 into `review-state.json`'s `manifestDigest[String(n)]` — and `makeTwoSurvivorPoolHost` and `tests/review/disposer-gate-refusals.test.js`'s `makeFiveFileReconcileHost` call it in place of their raw `appendFileSync`. Every test that today lands DISPOSITIONS through those fixtures continues to. (AC-20261104-01-9) | The fixtures' job is the pool's shape, not the leg's behaviour; a synthetic row sealed by the fixture is the one sanctioned seam and lives in test code only. |
| D6 | `spec/agents/reviewer.md` § The evidence standard and `spec/agents/disposer.md` § What you are handed each gain one sentence, and `spec/doctrine/stages/stage-review.md` § Rules gains one bullet, all saying: the manifest is sealed by the legs run — the driver refuses every later mark when its bytes change — so a leg script is re-run only against a copy (`cp <manifest> <scratch>`, then `--manifest <scratch>`), never the live file. `[no-ac: wording — read by review]` | The two agents and the session are the three parties that re-ran legs by hand on 20261103/13; each reads exactly one of these files. |
| D7 | `spec-review-driver.js`'s header comment describes the seal (one paragraph: `marks.manifestDigest[n]`, the drift refusal, the remedy) and `verdict.js`'s header drops "last-in-file wins" for "one row per leg; a duplicate invalidates the manifest"; `lib/manifest.js` opens with the house header (usage, owner citation `specs/20261104/01-the-legs-seal-the-manifest.md D1`, what it does not do: it never resolves a duplicate, never writes). The retired phrases are checked by AC-20261104-01-13. (AC-20261104-01-13) | A reader that still documents last-wins would be read as sanctioning it. |
| D5′ | 📌 Auto-picked at build (A6's if-false arm, read against D1): `appendSealedRow(host, n, row)` writes ONE row per leg — when `manifest-<n>.jsonl` already holds a row for `row.leg`, that line is replaced in place; otherwise the row is appended; either way the fresh sha256 is sealed into `manifestDigest[String(n)]`. A fixture that overrides a real leg (`reconcile`, `gate`) therefore yields a valid sealed manifest instead of a D1 duplicate. Every fixture that appended to a sealed manifest — the two D5 names plus `tests/review/escalate-row.fixtures.js` `overrideLeg`, `tests/review/soft-floor.test.js` and `tests/review/review-driver-fix-cycle.test.js` (A6 was false) — routes through it; no assertion changes. (AC-20261104-01-9) | D1 forbids any reader resolving a duplicate, so the fixture seam must not manufacture one; replacing the row keeps the fixture's job (the pool's shape) and leaves D1 whole. Rejected: tolerating synthetic duplicates (re-opens the erasure D1 closes). |
| D9 | Scope widened at build: `tests/review/escalate-row.fixtures.js` enters the File Plan; the pin is updated in place, never weakened. [auto: out-of-plan-triage — its source names no File Plan path] [no-ac: the gate line is the oracle] | The file's risk decides, never the spec's tier. |
| D10 | Scope widened at build: `tests/review/soft-floor.test.js` enters the File Plan; the pin is updated in place, never weakened. [auto: out-of-plan-triage — its source names no File Plan path] [no-ac: the gate line is the oracle] | The file's risk decides, never the spec's tier. |
| D11 | Scope widened at build: `tests/review/review-driver-fix-cycle.test.js` enters the File Plan; the pin is updated in place, never weakened. [auto: out-of-plan-triage — its source names no File Plan path] [no-ac: the gate line is the oracle] | The file's risk decides, never the spec's tier. |
| D8 | `spec/.claude-plugin/plugin.json` is bumped via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"`; `node scripts/plugin-bump.js --check` in the gate is the oracle. `[no-ac: version bump — plugin-bump-gate is the standing guard]` | Pipeline rules § Planning: every change under a plugin directory bumps that plugin. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/manifest.js | CREATE | scripts | D1/D7: `readManifest(p)` → `{rows, byLeg, valid, cause, digest}` or `null`; house header; no dependency change |
| spec/scripts/verdict.js | MODIFY | scripts | D2/D7: inline loader deleted; `legRows = byLeg`; duplicate leg → `manifest invalid: duplicate leg …`; header reworded |
| spec/scripts/spec-review-driver.js | MODIFY | scripts | D3/D4/D7: `readManifestRows` deleted for `readManifest`; `dispositionPools` over `byLeg`; `marks.manifestDigest[n]` sealed in `runLegs`; drift refusal before every mark/derivation; header paragraph |
| spec/scripts/ac-matrix.js | MODIFY | scripts | D3: private reader deleted; oracle standing from `byLeg` |
| spec/scripts/release-legs.js | MODIFY | scripts | D3: `readManifestRows`/`manifestHasRows` deleted for `readManifest` |
| spec/scripts/review-legs.js | MODIFY | scripts | D3: summary `byLeg` from `lib/manifest.js` |
| spec/agents/reviewer.md | MODIFY | doctrine | D6: one sentence — re-run legs only against a copy |
| spec/agents/disposer.md | MODIFY | doctrine | D6: one sentence — re-run legs only against a copy |
| spec/doctrine/stages/stage-review.md | MODIFY | doctrine | D6: one Rules bullet — the manifest is sealed; copy before re-running a leg |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D8: `node scripts/plugin-bump.js --bump --plugin spec --changelog "…"` |
| tests/manifest-reader.test.js | CREATE | tests | AC-20261104-01-1, AC-20261104-01-2, AC-20261104-01-3, AC-20261104-01-4, AC-20261104-01-12 |
| tests/review/manifest-seal.test.js | CREATE | tests | AC-20261104-01-6, AC-20261104-01-7, AC-20261104-01-8 |
| tests/review/disposer-gate.fixtures.js | MODIFY | tests | D5: `appendSealedRow`; `makeTwoSurvivorPoolHost` uses it |
| tests/review/disposer-gate-refusals.test.js | MODIFY | tests | D5: `makeFiveFileReconcileHost` uses `appendSealedRow`; AC-20261104-01-9 tags the existing pool pin |
| tests/review/escalate-row.fixtures.js | MODIFY | tests | gate line — updated in place, never weakened [auto: out-of-plan-triage] |
| tests/review/soft-floor.test.js | MODIFY | tests | gate line — updated in place, never weakened [auto: out-of-plan-triage] |
| tests/review/review-driver-fix-cycle.test.js | MODIFY | tests | gate line — updated in place, never weakened [auto: out-of-plan-triage] |
| tests/review/verdict.test.js | MODIFY | tests | AC-20261104-01-5 tags the existing invalid-manifest pin |
| tests/review/review-driver.test.js | MODIFY | tests | AC-20261104-01-10 tags the existing no-side-effects pin |
| tests/ac-matrix/ac-matrix.test.js | MODIFY | tests | AC-20261104-01-11 tags the existing oracle-standing pin |
| tests/release-legs/release-legs.test.js | MODIFY | tests | AC-20261104-01-12 tags the existing duplicate-append pin; its assert message stops describing verdict.js as last-in-file-wins (collision-closure literals hit) |

## Contracts

```js
// spec/scripts/lib/manifest.js
// readManifest(p) -> null                       // p unreadable (ENOENT, EACCES, …)
//               -> { rows, byLeg, valid, cause, digest }
//   rows   : Array<object>   every JSON-parseable non-blank line, file order
//   byLeg  : Map<string,row> leg -> FIRST row whose `leg` is a string
//   valid  : boolean         every line parses, has string leg + numeric exit + object observed,
//                            and no leg appears twice
//   cause  : string|null     first failure: 'row N unparseable'
//                                           | 'row N observed must be a non-null JSON object'
//                                           | 'duplicate leg <name> (rows i, j)'   (1-based line numbers)
//   digest : string          sha256 hex of the file bytes
module.exports = { readManifest }
```

```jsonc
// <spec>.review/review-state.json — additive key, written by runLegs(n)
{ "manifestDigest": { "1": "<64-hex sha256 of manifest-1.jsonl>", "2": "<64-hex>" } }
```

Driver refusal (exit 2, stderr), literal shape:

```
spec-review-driver: <sidecar>/manifest-2.jsonl changed after the legs run that sealed it
  (sealed 3fa8db57…, now 0db3678f…): leg:ac-matrix appears 3 times — a leg script was re-run
  with --manifest pointing at the live file. Re-run a leg only against a copy:
  cp <sidecar>/manifest-2.jsonl <scratch> && node "$(spec-paths ac-matrix)" … --manifest <scratch>
  To recover: rm <sidecar>/manifest-2.jsonl and re-run `node <driver> <spec>` — legs regenerate at
  iteration 2 (a green gate/suite over the same tree is reused from the run cache).
```

The non-duplicate variant replaces the cause clause with `edited by hand`.

## Behavior

- Sequence that deadlocked (20261103/13 round 2): legs write manifest-2 (ac-matrix red) → the
  reviewer re-runs `ac-matrix.js --manifest <live>` (appends red) → the disposer re-runs it
  (appends green) → `--mark dispositions`. After this spec: the reviewer's append changes the
  digest; `--mark reviewer-returned` exits 2 with the refusal above; the session copies the
  manifest aside for re-runs (D6) or removes it and re-runs the driver, which regenerates
  iteration 2 and reseals.
- `--mark repair-round` copies the manifest aside and deletes it before re-running legs; the
  drift check runs before the mark (file intact), the re-run reseals. `--mark skips-extracted`,
  `fix-applied` and `repair-round` write iteration `n+1`; `runLegs` seals it.
- A sidecar from a review that started before this lands carries no `manifestDigest` for its
  live iteration: nothing is checked, nothing is printed; its next legs run seals.
- `verdict.js` run by hand over a manifest with a duplicate leg prints `UNVERIFIED` and the cause
  line; the driver's dispositions pre-check already refuses on `UNVERIFIED`, so even an unsealed
  sidecar can no longer deadlock — the two readers agree that the file is not evidence.

## Acceptance Criteria

- **AC-20261104-01-1**: WHEN `readManifest(p)` reads a file of three valid rows
  (`{"leg":"gate","exit":0,"observed":{"skips":0}}`, `{"leg":"ac-matrix","exit":1,"observed":{"uncovered":1}}`,
  `{"leg":"promise-sweep","exit":0,"observed":{"orphans":0}}`) THE SYSTEM SHALL return `rows.length` 3,
  `byLeg.size` 3, `valid` `true`, `cause` `null` and `digest` equal to
  `crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')`; and for a path that does not
  exist SHALL return `null` → writes tests/manifest-reader.test.js
- **AC-20261104-01-2**: WHEN the file holds `{"leg":"ac-matrix","exit":1,"observed":{"uncovered":0}}` on
  line 6 and `{"leg":"ac-matrix","exit":0,"observed":{"uncovered":0}}` on line 9 (other lines valid and
  distinct) THE SYSTEM SHALL return `valid` `false`, `cause` `duplicate leg ac-matrix (rows 6, 9)`,
  `rows.length` 9 and `byLeg.get('ac-matrix').exit` `1` — the first row, never the last
  → writes tests/manifest-reader.test.js
- **AC-20261104-01-3**: WHEN line 2 is `not json` THE SYSTEM SHALL return `valid` `false` and `cause`
  `row 2 unparseable` while `rows` holds every other parsed row; WHEN line 2 is
  `{"leg":"gate","exit":0,"observed":"skips=0"}` THE SYSTEM SHALL return `valid` `false`, `cause`
  `row 2 observed must be a non-null JSON object`, and `byLeg.has('gate')` `true`
  → writes tests/manifest-reader.test.js
- **AC-20261104-01-4**: WHEN `verdict.js --manifest <m> --workflow <clean return>` reads a fix-delta
  manifest whose 8 rows are green except `ac-matrix` exit 1, followed by a second `ac-matrix` row with
  exit 0 (the 20261103/13 shape) THE SYSTEM SHALL print `UNVERIFIED` on line 1, exit 1, and print the
  stderr line `verdict.js: UNVERIFIED — manifest invalid: duplicate leg ac-matrix (rows 6, 9)`; never
  `CLEAN` → writes tests/manifest-reader.test.js
- **AC-20261104-01-5**: WHEN a row's `observed` is the string `"skips=2 todos=1"` THE SYSTEM SHALL
  CONTINUE TO print a stderr line beginning `verdict.js: UNVERIFIED — manifest invalid: ` (e.g.
  `… manifest invalid: row 1 observed must be a non-null JSON object`) → reuses
  tests/review/verdict.test.js :: AC-20260902-05-7 (invalid manifest)
- **AC-20261104-01-6**: WHEN the driver's first invocation on a green synthetic host runs legs and
  prints REVIEWER THE SYSTEM SHALL have written `review-state.json` with `manifestDigest["1"]` equal to
  the sha256 hex of `manifest-1.jsonl`'s bytes (e.g. `manifestDigest: {"1": "b15b006a…"}`, 64 hex
  chars) → writes tests/review/manifest-seal.test.js
- **AC-20261104-01-7**: WHEN, after that run, a line `{"leg":"ac-matrix","exit":0,"observed":{"uncovered":0,"oracle":0,"preGreen":0}}`
  is appended to `manifest-1.jsonl` THE SYSTEM SHALL exit 2 on a bare invocation, on `--state`, and on
  `--mark reviewer-returned --file <clean return>` alike, with stderr containing
  `manifest-1.jsonl changed after the legs run that sealed it`, `leg:ac-matrix appears 2 times`,
  `--manifest pointing at the live file`, `cp `, and `rm ` naming `manifest-1.jsonl`, writing no
  `reviewer-return-1.json` and leaving `review-state.json` byte-identical; and WHEN instead the
  appended line is `{"leg":"zzz","exit":0,"observed":{}}` (no duplicate) THE SYSTEM SHALL name the
  cause `edited by hand` → writes tests/review/manifest-seal.test.js
- **AC-20261104-01-8**: WHEN `manifest-1.jsonl` is removed after the AC-7 refusal and the driver is
  re-invoked THE SYSTEM SHALL regenerate it at iteration 1 (`manifest-1.jsonl` exists again, no
  `manifest-2.jsonl`), record a new `manifestDigest["1"]` equal to the new bytes' sha256, and print
  REVIEWER → writes tests/review/manifest-seal.test.js
- **AC-20261104-01-9**: WHEN a fixture appends a synthetic red row through `appendSealedRow` (e.g.
  `{"leg":"reconcile","exit":3,"observed":{"outOfPlan":5,"files":["a","b","c","d","e"]}}`) THE SYSTEM
  SHALL CONTINUE TO land DISPOSITIONS and print `leg:reconcile exit=3 count=5` once → reuses
  tests/review/disposer-gate-refusals.test.js :: disposition-pool unit / AC-20260909-04-12 (SHALL CONTINUE TO, specs
- **AC-20261104-01-10**: WHEN the driver is re-invoked with no mark THE SYSTEM SHALL CONTINUE TO leave
  `manifest-1.jsonl` byte-identical (e.g. the same sha256 before and after) and append no ledger line
  → reuses tests/review/review-driver.test.js :: AC-20260820-07-9
- **AC-20261104-01-11**: WHEN an `[oracle: gate]` AC's declared leg is red or absent from the manifest
  (e.g. `{"leg":"gate","exit":1,"observed":{}}`) THE SYSTEM SHALL CONTINUE TO emit a hard
  `oracle-red-or-absent` finding → reuses tests/ac-matrix/ac-matrix.test.js :: AC-20260814-01-3b
- **AC-20261104-01-12**: WHEN `release-legs.js append --leg journeys` targets a manifest that already
  holds a `journeys` row THE SYSTEM SHALL CONTINUE TO refuse at exit 2 without appending (e.g. the file
  keeps exactly one `journeys` line) → reuses tests/release-legs/release-legs.test.js :: AC-20260823-01-11
- **AC-20261104-01-13** `[oracle: literals]`: WHEN the spec lands THE SYSTEM SHALL carry none of
  `last-in-file wins`, `function readManifestRows`, `function manifestHasRows` in the File Plan's
  non-tests files

## Assumptions (escalation triggers)

- A1: The two readers disagree on the 20261103/13 shape. **Executed 2026-11-04** (scratch
  `spike1/run.js` against this tree): a 12-row manifest with `ac-matrix` red at row 6, red again at
  row 9 and green at row 11 → `verdict.js --workflow <clean>` prints `CLEAN` exit 0 (last wins; 0 leg
  findings), `--fixDispatched 2` exits 2 "total 2 > hard pool 0", while the driver's
  `dispositionPools` filter yields `["leg:ac-matrix","leg:ac-matrix"]` — the deadlock reproduced.
  **if false:** STOP; the defect is elsewhere and the spec is withdrawn.
- A2: `release-legs.js append` already refuses a duplicate leg row (executed: exit 2 "already has a
  journeys row — append refuses a duplicate"), so D1's duplicate rule introduces no new refusal on the
  release path. **if false:** keep D1; add the release row to the duplicate test.
- A3: sha256 of the file bytes changes on any append (executed: `b15b006a372d` → `16a80f6208bd`
  after one appended row). **if false:** impossible for a cryptographic hash; STOP.
- A4: No legitimate flow writes the same leg twice into one review manifest — `review-legs.js`
  appends one row per leg, `ac-matrix.js` two distinct legs, `promise-sweep.js` one; `--reuse-from`
  copies a prior row in place of running the leg. **if false:** the duplicate rule is wrong for that
  flow — return `blocked` naming it; never dedupe.
- A5: `ac-matrix` fixtures write gate rows whose `observed` is a string, and read oracle standing
  from them. D1's `byLeg` admits every row with a `leg`, so those tests stay green. **if false
  (a red ac-matrix test):** the lib's `byLeg` dropped a row — fix the lib, never the fixture.
- A6: Only two fixtures append to a sealed manifest (`makeTwoSurvivorPoolHost`,
  `makeFiveFileReconcileHost`); `grep -rn "appendFileSync.*manifest-" tests` shows nothing else.
  **if false:** route the third through `appendSealedRow` too.

## Rationale

The user's strong prior was verified against the code: `dispositionPools()` (driver line 225)
filters every row; `verdict.js` (lines 264–293) keys a `Map` by `leg` with last-in-file wins;
`ac-matrix.js` appends unconditionally and nothing after `verifyManifestWritten()` looks at the
file again (`marks.legsTree` records the working tree, not the manifest). Dedupe-in-driver was
rejected because a green hand re-run would then erase a real red leg in both readers at once —
the exact failure the shared reader must make impossible. The shared reader keeps the FIRST row
per leg and marks the file invalid, so the first run's evidence is what any caller that ignores
validity still sees, and verdict's fail-closed `UNVERIFIED` path carries the cause.

Prior art: Terraform saves the state serial into a plan file and `apply` refuses with "Saved plan
is stale" when the serial moved, rather than re-planning or merging
([HashiCorp Discuss 52912](https://discuss.hashicorp.com/t/question-on-error-saved-plan-is-stale/52912));
in-toto link metadata hashes every product and verification refuses a mismatch. Both refuse and
name the cause; neither repairs. The digest is sha256 of the bytes because the manifest is
append-only JSONL, so any legitimate change is a new iteration, never an edit.

Trim: five private readers (verdict ~30 lines, driver 6, ac-matrix 20, release-legs 12, review-legs
1) are deleted for one ~40-line module; the seal is ~25 lines in the driver; no flag is added. The
fixture seam (D5) is the one place that writes a digest outside `runLegs`, and it lives in test
code. The tier stays standard by precedent and the user's veto; every AC carries a literal example
so a mid-build upgrade (host § Risk Tiers names `verdict.js`) changes nothing in the spec.

Collision closure (literals `readManifestRows`, `manifestHasRows`, `last-in-file`): every script
hit is a File Plan row; `tests/release-legs/release-legs.test.js:231` names last-in-file-wins in an
assert message and is folded into its existing row; `docs/audit/advisory-findings.md` is a dated
audit record of the very duplication this spec removes — waived, never edited.

Fragile: `byLeg` must keep admitting string-`observed` rows (A5), or three ac-matrix tests go red
for a reason unrelated to this spec. Watch: a sidecar that predates the seal is unchecked by
design — its next legs run seals it.

Build deviation (2026-11-04, one-off): the drift refusal's copy-and-re-run line prints
`node "$(spec-paths <leg script>)" … --manifest <scratch>` rather than the Contracts block's literal
`spec-paths ac-matrix` — a literal key in the driver reads as an undeclared invocation to the
entrypoints manifest pin, and the refusal fires for any leg. AC-7's asserted tokens are unchanged.

### Advisory debt (review rv_9d65a168efd8)
- a0 /home/jj/projects/claude-plugins/.claude/worktrees/agent-a0c71fae32d3e3d10/spec/scripts/review-legs.js:465 — review-legs.js summary destructures readManifest(manifest) with no null guard; an absent manifest at that point raises a bare TypeError ('Cannot destructure property byLeg of null') instead of a message naming the file. Pre-image threw an equally unnamed ENOENT from readFileSync, so this is not a regression, but the new reader's null contract makes a one-line named refusal cheap.
- a1 /home/jj/projects/claude-plugins/.claude/worktrees/agent-a0c71fae32d3e3d10/spec/scripts/verdict.js:270 — verdict.js's cannot-read refusal dropped the underlying error message (`: ${e.message}`) when the inline loader was replaced by readManifest, so ENOENT vs EACCES are no longer distinguishable on stderr. The remedy sentence ('confirm the evidence manifest was created') is retained, so the host's error-path rule is still met.

## Canonical Delta

docs/canonical/review.md, under the review-driver section (the paragraph beginning "A manifest's
number is a storage key"), add:

- **The legs seal the manifest.** `runLegs(n)` records `marks.manifestDigest[n]` (sha256 of
  `manifest-<n>.jsonl`'s bytes); every later driver invocation refuses at exit 2 when the live
  iteration's bytes differ, naming the duplicated leg when one exists ("a leg script was re-run
  with `--manifest` pointing at the live file") or "edited by hand", the copy-first rule, and the
  remedy (`rm` the manifest; the driver regenerates that iteration). Every manifest reader —
  `verdict.js`, the review driver, `ac-matrix.js`, `release-legs.js`, `review-legs.js` — goes
  through `spec/scripts/lib/manifest.js`'s `readManifest`, which keeps the first row per leg and
  reports a duplicate as `manifest invalid: duplicate leg <name> (rows i, j)` → `UNVERIFIED`; no
  reader resolves a duplicate by choosing a row. Reviewer and disposer re-run a leg only against a
  scratch copy. (specs/20261104/01-the-legs-seal-the-manifest.md)
