---
date: 2026-09-07
status: done
tier: standard
area: pipeline-gates
design: false
breaking: false
depends_on: []
depended_on_by: [specs/20260907/02-ac-drift-backfill.md]
brief: n/a
spiked: 2026-09-07
open_markers: 0
build_base: spec/20260907-01-02-03
diff_base: 59a2dedacfefca44483a3737d198715e19472c0c
---

# Mixed-pin guard (`pinShape`) at lock, build and review, plus the advisory AC-drift line at review close

## Goal

An acceptance criterion that carries both a new promise (`THE SYSTEM SHALL …`) and a
regression pin (`SHALL CONTINUE TO …`) in one bullet is read by build's red-check as a pin,
so the file that should prove the new promise red-first is sanctioned green and the promise
ships untested. Three build sessions found and split such bullets by hand
(specs/20260903/01 D16, specs/20260906/01, specs/20260906/04 AC-3/AC-8); the corpus spike
in Assumptions A1 shows the class is 51 bullets wide across 148 specs. Done means: one
predicate in `lib/spec-sections.js` classifies every AC bullet as `promise`, `pin`, or
`mixed`; `ac-matrix.js --lint` refuses a mixed bullet at `/spec:plan` lock; `red-check.js`
refuses it at build Phase 1 with a named split remedy instead of sanctioning the file; the
review's full `ac-matrix` run warns on it without reddening a leg. Separately, the review
driver's close step prints one advisory line with the repo's current AC-pin drift count so
drift is seen at the moment it is created rather than at the next doctor run (JJ ruling
2026-09-06: advisory, never a leg).

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `lib/spec-sections.js` exports `normalizeForPinCheck(raw)` (red-check.js's local function lifted byte-for-byte: strip inline code spans to a space, collapse whitespace runs, trim) and `pinShape(raw)` → `'promise' \| 'pin' \| 'mixed'`: on the normalized text, `pins` = matches of `/\bSHALL CONTINUE TO\b/g`, `shalls` = matches of `/\bSHALL\b/g`; `promise` when `pins === 0`, `pin` when `shalls === pins`, else `mixed`. red-check.js and ac-drift.js import it and drop their local copies (AC-20260907-01-3, AC-20260907-01-10) | Three scripts already normalize the same way (red-check.js, ac-drift.js, and the lint this spec adds); a third copy is the duplication calibration's own finding. Rejected: a per-clause parser — the SHALL count is the whole rule |
| D2 | `red-check.js`: a carried, well-formed AC whose `pinShape` is `mixed` is never sanctioned. The file gets exactly one hard finding `mixed-pin` (`{severity:'hard', class:'mixed-pin', path, acs:[<mixed ids>], detail}`, detail naming each AC-ID and the remedy `split the SHALL CONTINUE TO clause into its own AC, then re-run`), its colour is not classified (no `unsanctioned-green`/`broken-pin` for that file), and the run exits 1; header exit-code alphabet gains the class (AC-20260907-01-1, AC-20260907-01-2) | The harm site: the sanction is what let three promises ship green. A refusal with the split remedy is what all three sessions did by hand. Rejected: flipping the expectation to red and letting `unsanctioned-green` speak — the cause would be invisible again |
| D3 | `ac-matrix.js` gains `--lint`: `ac-matrix.js --spec <path> --lint [--json]` runs only the AC-line lint (`malformed-ac`, `invalid-pre-green`, and the new `mixed-pin`) — no `--root`, no File Plan read, no manifest append; exit 1 on any finding, 0 clean; combining `--lint` with `--root`, `--manifest`, `--skips` or `--has-drift-script` is usage (exit 2). Plain output: `HARD  <class>` lines then `ac-matrix: lint malformed=N invalidPreGreen=N mixed=N · K finding(s)`; `--json`: `{findings, warnings, observed:{lint:{malformed,invalidPreGreen,mixed}}}`. In the full review mode a mixed bullet prints as a **warning** (`WARN  mixed-pin <id> — split …`), never a finding: exit, manifest rows, and summary segments stay as today (AC-20260907-01-4, AC-20260907-01-5, AC-20260907-01-6, AC-20260907-01-7, AC-20260907-01-11) | Lock is where the author is; the full mode also runs inside `/spec:replay` on the last CLEANed spec (whose bullets may be mixed — 20260906/03 AC-5/AC-6 are), so a red leg there would be a false catch. Rejected: a new script — the AC-line lint already lives here |
| D4 | `spec/commands/plan.md` lock step 2 opens with `node "$(spec-paths ac-matrix)" --spec {spec path} --lint` — zero findings to lock (a `mixed-pin` is fixed by splitting the bullet, never by rewording the pin away); step 3's ledger row gains `"acLint":{"mixed":N}` where N is the `mixed=` counter the FIRST lint run of this lock printed (0 when clean first time) [no-ac: doctrine line plus a session-copied ledger field with no script writer; the lint itself is AC-4..6's surface] | The first-run count is the removability number core § Incident Policy asks for (Rationale) — a final-run count is 0 by construction and measures nothing |
| D5 | `spec/templates/spec.md` AC comment, after the regression-pin sentence: "A pin bullet carries only `SHALL CONTINUE TO` clauses — every `SHALL` in it is a `SHALL CONTINUE TO`; a bullet that mixes a new promise with a pin is refused at lock (`ac-matrix --lint`) and at build (red-check `mixed-pin`): split it." [no-ac: contract prose; D2/D3 are the enforcement and carry the ACs] | The template is the AC grammar's one home (the reviewer/disposer cite it); the guard without the rule reads as a mystery |
| D6 | `spec-review-driver.js` CLOSE step: after the hygiene listing, run `node <plugin>/scripts/ac-drift.js --root <repoRoot> --json` via `runChild`; when `findings.length > 0` print `⚠️ AC-pin drift (advisory): {N} criteria across {M} done spec(s) have no citing test — node "$(spec-paths ac-drift)" --root . names each` (M = distinct `spec` values); when 0 or `inapplicable` print nothing; when the script exits other than 0/1 print `⚠️ AC-pin drift check could not run (exit {code}) — see /spec:doctor check 17`. The line never touches the verdict, the ledger row, or mark acceptance (AC-20260907-01-8, AC-20260907-01-9, AC-20260907-01-12) | JJ 2026-09-06: doctor-only first, advisory at review, never a `review-legs.js` leg (critical tier). The close step is the one screen every review ends on |
| D7 | `spec/commands/build.md` (the red-expected sentence near "unsanctioned-green") gains "or a file whose carried AC mixes a promise with a pin (`mixed-pin` — split the AC, then re-run)"; `spec/commands/review.md` § Close gains one sentence naming the advisory drift line and that it never affects the verdict [no-ac: pointer prose; the review's doctrine leg reads it] | Cold readers of the build/review commands meet the new finding class and the new line where they happen |
| D8 | `spec/entrypoints.json`: `spec/scripts/ac-matrix.js` gains `spec/commands/plan.md`; `spec/scripts/ac-drift.js` gains `spec/scripts/spec-review-driver.js` (AC-20260907-01-13) | The entrypoints conformance sweep derives invokers from the tree; an unlisted invoker is its red |
| D9 | `spec/.claude-plugin/plugin.json` bumps to the next free minor (target 7.96.0 — next free at build time per Gotchas) with a changelog paragraph naming `pinShape`, `mixed-pin` at lock/build/review, and the advisory drift line [no-ac: version discipline; `tests/consistency/plugin-version.test.js` covers the changelog form] | Behaviour change → owning plugin bumps (pipeline rules § Planning) |
| D10 | Planning-pass amendment, done by the planning session at this lock and NOT a File Plan row: `specs/20260906/05-gray-states-on-every-wireframe.md` AC-3 (mixed — Assumptions A1) is split into AC-3 (the promise) and a new AC-20260906-05-5 (the `SHALL CONTINUE TO` pin), File Plan test row updated [no-ac: another spec's file, edited before this spec builds; recorded here for the cold reader] | 05 builds before this guard ships; without the split its Phase 1 sanctions the states-check test green (the exact class) |
| D11 | Build-pass ruling (JJ 2026-09-08, `AskUserQuestion`): `tests/red-check/red-check.test.js`'s AC-20260821-01-4 fixture bullet is edited in place to drop its `SHALL y,` promise clause, leaving `WHEN x THE SYSTEM SHALL\nCONTINUE TO require the existing pin check in the same step` — still hard-wrapped mid-marker, now a pure pin under D1. The test's assertions (exit 0, no findings) and its stated guarantee are unchanged; scope is widened by this one file [no-ac: a pre-existing fixture repaired to match the grammar D5 now states; AC-20260907-01-1/-3 already pin the guard] | The fixture's own comment names its subject as hard-wrap normalisation of the marker; the promise clause was incidental copy from the real AC-20260810-02-4 bullet. Rejected: flipping the expectation to `mixed-pin` — nothing would then prove a wrapped genuine pin is still sanctioned, which is the escape that fixture exists for. Rejected: pausing — the gate cannot go green, so the guard could not ship |
| D12 | Review-pass ruling (JJ 2026-09-08, `AskUserQuestion`): `tests/provenance/provenance.test.js`'s AC-20260901-02-1 fakes a missing `jq` with `env:{PATH:'/bin'}`, which is false on merged-`/usr` Linux (`/bin` → `/usr/bin`, so `jq` still resolves and the hook writes the stamp). The test instead builds an empty dir in `tmpdir()` holding only a `bash` symlink and uses that as `PATH`; assertions and the AC-ID are unchanged. Scope is widened by this one file [no-ac: a pre-existing platform-assumption defect repaired in place; the AC it pins is unchanged] | The suite leg is blocking and the assumption is wrong on every merged-`/usr` distro, not only this host — a real defect the review surfaced, fixed in the session it was understood (core § Incident Policy). Rejected: parking — the leg blocks every future review in this repo, not just this spec |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/spec-sections.js | MODIFY | scripts | D1: export `normalizeForPinCheck` and `pinShape` beside `PRE_GREEN_REASONS` |
| spec/scripts/red-check.js | MODIFY | scripts | D2: import both from lib; delete the local `normalizeForPinCheck`; `mixed-pin` finding + no colour classification for that file; header alphabet gains the class |
| spec/scripts/ac-drift.js | MODIFY | scripts | D1: the inline backtick-strip/whitespace-collapse at the sanction predicate becomes `normalizeForPinCheck(bullet.raw)`; behaviour unchanged |
| spec/scripts/ac-matrix.js | MODIFY | scripts | D3: `--lint` mode (arg parse, usage line, lint-only path, plain + `--json` output, exit); `mixed-pin` hard finding in lint mode, warning in full mode; header usage/exit codes |
| spec/scripts/spec-review-driver.js | MODIFY | scripts | D6: CLOSE step's advisory AC-pin drift line via `runChild` on `scripts/ac-drift.js --json` |
| spec/commands/plan.md | MODIFY | doctrine | D4: lock step 2 opens with the `--lint` run; step 3 ledger row gains `acLint` |
| spec/commands/build.md | MODIFY | doctrine | D7: `mixed-pin` clause in the red-expected sentence |
| spec/commands/review.md | MODIFY | doctrine | D7: one sentence in § Close naming the advisory drift line |
| spec/templates/spec.md | MODIFY | doctrine | D5: the pin-only sentence in the AC comment |
| spec/entrypoints.json | MODIFY | other | D8: two invoker additions |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D9: version bump (target 7.96.0) + changelog paragraph |
| tests/red-check/mixed-pin.test.js | CREATE | tests | AC-20260907-01-1, AC-20260907-01-2, AC-20260907-01-3 |
| tests/ac-matrix/lint-mode.test.js | CREATE | tests | AC-20260907-01-4, AC-20260907-01-5, AC-20260907-01-6, AC-20260907-01-7, AC-20260907-01-11 |
| tests/review/review-driver-close-drift-line.test.js | CREATE | tests | AC-20260907-01-8, AC-20260907-01-9, AC-20260907-01-12 |
| tests/doctor/ac-drift.test.js | MODIFY | tests | AC-20260907-01-10 — retag the existing AC-20260906-01-3 sanction test (title + assert message), never weakened |
| tests/consistency/entrypoints.test.js | MODIFY | tests | AC-20260907-01-13 — header comment cites the two new invoker rows; no assert change |

## Contracts

`lib/spec-sections.js` (D1):

```js
// normalizeForPinCheck(raw): raw.replace(/`[^`]*`/g, ' ').replace(/\s+/g, ' ').trim()
// pinShape(raw): 'promise' | 'pin' | 'mixed'
pinShape('WHEN a THE SYSTEM SHALL b')                                        // 'promise'
pinShape('WHEN a THE SYSTEM SHALL CONTINUE TO b')                            // 'pin'
pinShape('WHEN a THE SYSTEM SHALL b; WHEN c THE SYSTEM SHALL CONTINUE TO d') // 'mixed'
pinShape('WHEN a THE SYSTEM SHALL CONTINUE TO b and SHALL CONTINUE TO c')    // 'pin'
pinShape('WHEN a THE SYSTEM SHALL\n  CONTINUE TO b')                         // 'pin'  (hard-wrap)
pinShape('WHEN a THE SYSTEM SHALL emit the literal `SHALL CONTINUE TO`')     // 'promise' (code span stripped)
pinShape('WHEN a THE SYSTEM SHALL NOT b and SHALL CONTINUE TO c')            // 'mixed' (SHALL NOT is a promise)
```

`red-check.js` (D2) — finding shape and exit alphabet:

```
1 = findings emitted (unsanctioned-green | broken-pin | missing-test-file |
    invalid-pre-green | rejected-trailing-tag | mixed-pin)
{ severity: 'hard', class: 'mixed-pin', path: 'tests/x.test.js', acs: ['AC-20260907-99-1'],
  detail: 'tests/x.test.js: AC-20260907-99-1 mixes a new promise with a SHALL CONTINUE TO pin — ' +
          'split the SHALL CONTINUE TO clause into its own AC, then re-run' }
```

A file with ≥1 mixed carried AC: one `mixed-pin` finding listing every mixed id, the
`{testCommand} <file>` run is still executed and logged, and no other finding class is emitted
for that file in that run.

`ac-matrix.js` (D3):

```
usage: ac-matrix.js --spec <path> --root <dir> --manifest <path> [--skips <file>] [--has-drift-script] [--json]
       ac-matrix.js --spec <path> --lint [--json]        (spec-only: no --root/--manifest/--skips/--has-drift-script)
lint plain:  HARD  mixed-pin            AC-20260907-99-1 mixes a new promise with a SHALL CONTINUE TO pin — split the SHALL CONTINUE TO clause into its own AC
             ac-matrix: lint malformed=0 invalidPreGreen=0 mixed=1 · 1 finding(s)
lint --json: { "findings": [ {severity:'hard', class:'mixed-pin', ac:'AC-…', detail} ], "warnings": [],
               "observed": { "lint": { "malformed": 0, "invalidPreGreen": 0, "mixed": 1 } } }
full mode:   WARN                       mixed-pin AC-20260907-99-1 — split the SHALL CONTINUE TO clause into its own AC
             (warnings array; findings, exit, manifest rows, summary line unchanged)
```

`spec-review-driver.js` CLOSE step (D6), printed after the hygiene listing and before the
close-commit line:

```
⚠️ AC-pin drift (advisory): 41 criteria across 13 done spec(s) have no citing test — node "$(spec-paths ac-drift)" --root . names each
```

Plan ledger row (D4) — one added key, everything else as today:

```
{"ts":"…","stage":"plan","spec":"…","tier":"standard","brief":"n/a","spikes":N,
 "promiseSweep":{…},"acLint":{"mixed":0},"verdict":"locked"}
```

## Behavior

- Lock: the session runs the lint first; a `mixed-pin` hit is split by the author (promise
  bullet keeps the id; the pin becomes a new id whose covering test is the existing one,
  retagged). The first run's `mixed=` counter goes into the ledger row.
- Build Phase 1: red-check meets a mixed carried AC in a spec hardened before this guard (or
  amended mid-build) → `mixed-pin`, run exits 1, the build driver's normal red-check failure
  path shows the finding; the orchestrator splits the AC and re-runs. No file colour is
  guessed while the bullet is ambiguous.
- Review: the full matrix run prints the warning; the reviewer sees it in `ac-matrix.txt`; no
  leg changes colour. Replay on an older spec with mixed bullets stays a fair measurement.
- Close: one advisory line, or nothing. The count is the same `ac-drift.js` derivation doctor
  check 17 runs; the remedy command is the doctor's.

## Acceptance Criteria

- **AC-20260907-01-1**: WHEN `red-check.js --spec <s> --root <h> --base <pre>` runs against a synthetic host whose File Plan tests row carries `AC-20260907-99-1` whose bullet reads `WHEN x runs THE SYSTEM SHALL print the new banner; WHEN y runs THE SYSTEM SHALL CONTINUE TO exit 0` and whose test file is green on the pre-image THE SYSTEM SHALL exit 1 with exactly one finding for that file, `class: 'mixed-pin'`, `acs: ['AC-20260907-99-1']`, detail containing `split the SHALL CONTINUE TO clause into its own AC`, and no `unsanctioned-green` finding (today: exit 0, 0 findings — Assumptions A2) → tests/red-check/mixed-pin.test.js
- **AC-20260907-01-2**: WHEN red-check runs against a host whose carried AC bullet reads `WHEN y runs THE SYSTEM SHALL CONTINUE TO exit 0 and SHALL CONTINUE TO print usage` with a green test file THE SYSTEM SHALL CONTINUE TO exit 0 with no finding, and a carried AC quoting the phrase only inside a code span with a green file SHALL CONTINUE TO be reported `unsanctioned-green` → tests/red-check/mixed-pin.test.js
- **AC-20260907-01-3**: WHEN `pinShape` and `normalizeForPinCheck` are required from `spec/scripts/lib/spec-sections.js` THE SYSTEM SHALL return, for the seven Contracts inputs in order, `promise`, `pin`, `mixed`, `pin`, `pin`, `promise`, `mixed`, and `normalizeForPinCheck('a  \`x\`\n b')` → `'a b'`; `red-check.js`'s source SHALL contain no `function normalizeForPinCheck` of its own → tests/red-check/mixed-pin.test.js
- **AC-20260907-01-4**: WHEN `ac-matrix.js --spec <mixed spec> --lint` runs (no `--root`, no `--manifest`, the spec holding no `## File Plan` section at all) THE SYSTEM SHALL exit 1, print a `HARD  mixed-pin` line naming `AC-20260907-99-1` and the split remedy, create no manifest file anywhere under the spec's directory, and with `--json` print one object whose `observed.lint` equals `{"malformed":0,"invalidPreGreen":0,"mixed":1}` → tests/ac-matrix/lint-mode.test.js
- **AC-20260907-01-5**: WHEN `--lint` runs on a spec whose bullets are one promise, one pin, and one two-clause pin THE SYSTEM SHALL exit 0 and print exactly `ac-matrix: lint malformed=0 invalidPreGreen=0 mixed=0 · 0 finding(s)` as its last stdout line → tests/ac-matrix/lint-mode.test.js
- **AC-20260907-01-6**: WHEN `--lint` is passed together with `--root <d>`, or `--manifest <p>`, or `--skips <f>`, or `--has-drift-script` THE SYSTEM SHALL exit 2 printing the usage line that names `--lint` as spec-only; WHEN `--lint` runs on a spec with no `## Acceptance Criteria` section THE SYSTEM SHALL exit 2 naming the missing section → tests/ac-matrix/lint-mode.test.js
- **AC-20260907-01-7**: WHEN the full mode (`--spec --root --manifest`) runs on a spec with one mixed AC whose cited test file exists THE SYSTEM SHALL print `WARN` followed by `mixed-pin` and the AC-ID on one stdout line, and the `--json` `warnings` array SHALL contain that string while `findings` contains no `mixed-pin` entry → tests/ac-matrix/lint-mode.test.js
- **AC-20260907-01-8**: WHEN the review driver prints the CLOSE step in a fixture host that also holds `specs/20260901/01-x.md` (`status: done`, one well-formed AC no test file cites) THE SYSTEM SHALL include the line `⚠️ AC-pin drift (advisory): 1 criteria across 1 done spec(s) have no citing test — node "$(spec-paths ac-drift)" --root . names each` in the step text → tests/review/review-driver-close-drift-line.test.js
- **AC-20260907-01-9** `[pre-green: absence-invariant]`: WHEN the CLOSE step prints in the fixture host as built today (no `specs/` drift) THE SYSTEM SHALL print no line containing `AC-pin drift` → tests/review/review-driver-close-drift-line.test.js
- **AC-20260907-01-10**: WHEN `ac-drift.js` runs over a done spec whose only AC bullet is hard-wrapped as `THE SYSTEM SHALL\n  CONTINUE TO …` THE SYSTEM SHALL CONTINUE TO count it sanctioned (zero findings, exit 0) → tests/doctor/ac-drift.test.js (the existing AC-20260906-01-3 test, retagged)
- **AC-20260907-01-11**: WHEN the full mode runs on a promise-only spec whose cited test exists THE SYSTEM SHALL CONTINUE TO append exactly two manifest rows (`ac-matrix`, `skip-reconcile`) with `observed` keys exactly `uncovered/oracle/preGreen` and `skipped/sanctioned`, and SHALL CONTINUE TO print the `uncovered=… oracle=… preGreen=… · skipped=… sanctioned=…` summary segments byte-unchanged → tests/ac-matrix/lint-mode.test.js
- **AC-20260907-01-12**: WHEN the CLOSE step has printed the advisory line THE SYSTEM SHALL CONTINUE TO accept `--mark closed` and write the same close ledger row keys it writes today (no `acDrift` key, no verdict change) → tests/review/review-driver-close-drift-line.test.js
- **AC-20260907-01-13** `[oracle: gate]`: WHEN the host gate runs THE SYSTEM SHALL pass the entrypoints conformance sweep with `spec/commands/plan.md` invoking `ac-matrix.js` and `spec-review-driver.js` invoking `ac-drift.js` (both rows added to `spec/entrypoints.json`)

## Assumptions (escalation triggers)

- A1: **Executed corpus spike (2026-09-07)** — a scratch script parsed every `specs/**/*.md` AC bullet with `lib/spec-sections.js` and applied D1's rule: 148 specs, 1495 well-formed bullets, 295 carry `SHALL CONTINUE TO`, **51 are mixed** (17% of pin bullets), including hardened-not-built `specs/20260906/05` AC-3 (D10) and done `specs/20260906/03` AC-5/AC-6 (why D3's full mode warns instead of failing). — **if false** (a build after this lands reports `mixed-pin` on a bullet a human reads as a pure pin): the bullet has a `SHALL` that is not `SHALL CONTINUE TO`; reword every clause as a pin or split — never widen the predicate.
- A2: **Executed trip (2026-09-07)** — `red-check.js` against a scratch git host (`testCommand: node --test`, one green test citing a mixed AC): `red-check: 1 file(s) classified · 0 finding(s), 0 warning(s)`, exit 0. This is the Falsifiability red for the admission bar (Rationale). — **if false** (red-check already emits a finding here at build time): a sibling landed the guard; fold onto it, do not duplicate.
- A3: `acIdOccurs` is full-token — `AC-20260823-03-13a` does not cite `AC-20260823-03-13` (executed 2026-09-07: `false` / bare `true`); `ac-matrix --lint` reuses `parseAcBullets` unchanged, so the lint sees exactly the bullets the full mode sees. — **if false:** STOP, the coverage grammar changed under us.
- A4: `fleet-reader.js` reads plan rows for `stage`, `ts`, `spec` only (line ~286), so D4's `acLint` key is inert to every consumer; `tests/consistency/retired-flags.test.js` and `tests/fleet-reader/drift.test.js` read `promiseSweep`, not the row's key set. — **if false** (a test pins the plan row's key set): extend that pin in place with `acLint`, never drop the key.
- A5: The review driver's CLOSE step already has `runChild` and `repoRoot`; `ac-drift.js` prints `inapplicable — no specs/` and exits 0 for the review fixtures' host (no `specs/` dir), so AC-9's absence holds without a special case. — **if false:** gate the line on `findings.length` only, as D6 says.
- A6: New test files stay far under the per-file 45 s budget (each spawns ≤6 script runs); `tests/review/review-driver-close-drift-line.test.js` reuses `review-driver.fixtures.js`'s `makeHost/toReviewer/CLEAN_RETURN` and adds the done spec file before reaching CLOSE. — **if false** (budget reporter reddens): split the file, never raise the budget.

## Rationale

**Why a guard now (core § Incident Policy admission bar).** *Portability:* the predicate reads
spec text only; no host stack is involved. *Generality:* three recorded members —
specs/20260903/01 D16 (AC-13/AC-15 split at build), specs/20260906/01 (second instance, split
at build), specs/20260906/04 (AC-3/AC-8 → AC-9/AC-10, build commit 878e40e) — two of them not
the triggering incident. *Materiality:* the fleet escape ledger carries **0** rows in this
class (`fleet-reader --json` `escapes.byClass` has no mixed-pin key; the three catches were
build-time amendments, never escapes), so the number that justifies the guard is the corpus
prevalence measured in A1: 51 of 295 pin bullets, each one a file red-check sanctioned green
at its build. *Falsifiability:* A2 is the executed red — the current script passes the exact
fixture AC-1 will refuse. *Removability:* "over the last 30 `stage: plan` ledger rows, what is
the sum of `acLint.mixed`?" — 0 for 30 consecutive locks means authors no longer write the
shape and the lint can be demoted to a warning; a jq one-liner answers it.

**Why three sites, one predicate.** Lock is where the author still holds the context; build is
where the harm happens (and where specs hardened before this guard — 05, 06, 20260905/03 —
arrive); review's full run also feeds `/spec:replay` against older specs, whose mixed bullets
are history, so it warns and never reddens. The predicate is a SHALL count, deliberately
simple: a bullet is a pin only when every SHALL continues.

**Why the drift line is advisory and lives in the driver.** JJ's 2026-09-06 ruling: doctor
first, then an advisory review-time line; a `review-legs.js` leg is critical tier and was
rejected. The driver already prints the close screen every review ends on. Until
specs/20260907/02 lands the line will read 41/13 on this repo — one line, not 41 rows.

**Rejected.** A new lint script (the AC-line lint already lives in ac-matrix); recording
`acLint` only when non-zero (a missing key is indistinguishable from an old row); reporting
mixed bullets from `ac-drift.js` (done specs' mixed bullets are history, and the retro count
is A1's job, done once).

**Fragile.** `red-check.js`'s header exit-code list is a test-pinned contract — add the class,
do not reorder. `ac-matrix.js` exits via `process.exit` at argv parse; the lint path must
return before the `--root`/`--manifest` requirement check, not after it.

**Build/review departures (folded from the deviations sidecar, one-offs).** D8's own File Plan
row for `tests/consistency/entrypoints.test.js` proposed a comment-only note; red-check refused
that pre-image as `unsanctioned-green` (a carried AC with no red-expected assertion), so the
file gained a real executable assertion instead — D8 itself is unchanged, only how it is
proven. D9's literal target (`7.96.0`) was stale by build time — the pipeline rules' Gotchas
entry on exactly this class ("a spec Decision naming a literal version-bump target can be
stale by build time … the build bumps to the next free version", citing
specs/20260810/02-terminal-observable-acs.md D11 and
specs/20260901/08-corpus-derivation-and-kill-match.md D10) already governs it; this build's
pre-image already carried `7.100.0` (landed after this spec was drafted), so the build bumped
to `7.101.0`. A concurrent session spent that same number and `7.102.0` before merge-back, and
the merge conflicted on the manifest exactly as that Gotchas entry predicts; the resolution
re-bumped through `scripts/plugin-bump.js --bump`, so `7.103.0` is what shipped. D11 and D12
are recorded in full in the Decisions
table above; in brief, D11 fixed a genuine test-fixture collision `pinShape` correctly
surfaced (`tests/red-check/red-check.test.js`'s pre-existing AC-20260821-01-4 hard-wrap
fixture mirrored a real mixed bullet and read as `mixed`, not `pin`), and D12 fixed an
unrelated, pre-existing platform-assumption bug found while widening scope for D11
(`tests/provenance/provenance.test.js` faked "no `jq` on PATH" with `PATH=/bin`, which still
resolves `jq` on merged-`/usr` Linux). Two further one-off repairs from review's own rounds:
`spec-review-driver.js`'s `acPinDriftLine()` called `JSON.parse` unconditionally on
`ac-drift.js --json`'s output, which is the plain `inapplicable — no specs/` sentinel (not
JSON) when `--root` has no `specs/` directory — guarded with `try`/`catch`, gating the
advisory line on `findings.length` alone once parsed, per D6; and `ac-matrix.js`'s new
`--lint` branch first shipped a local `console.log`+`process.exit` writer (the pipe-truncation
shape the pipeline rules' Gotchas entry already names), corrected to import
`lib/driver-io.js`'s shared `writeOut` (four other scripts already import it — a first-round
repair's claim that the export was "scoped to the two drivers" was itself wrong and is
corrected here) rather than carry a fourth near-duplicate local copy; every `--lint` call site
now passes `\n` explicitly since the shared `writeOut` adds no trailing newline of its own,
keeping the printed bytes byte-identical to the pre-fix render.

## Canonical Delta

`docs/canonical/build-integrity.md` § Mechanized red-check: after the sentence ending "…the
plan-time tag count rides review's ac-matrix manifest row as `observed.preGreen` into every
ledger row, making the class fleet-countable." and before "The kill condition and the
rejected per-AC mutation mandate…", insert: "Every carried AC's regression-pin bullet is also
classified by `pinShape(raw)` (`spec/scripts/lib/spec-sections.js`'s `normalizeForPinCheck`
plus a `SHALL`-count rule, shared with `ac-drift.js` and `ac-matrix.js --lint`) as `promise`,
`pin`, or `mixed` — a bullet stating both a new promise and a `SHALL CONTINUE TO` pin in one
place. A file carrying a `mixed` AC is never colour-classified: red-check reports a single
hard `mixed-pin` finding naming every mixed AC-ID and the split-the-bullet remedy, and the run
exits 1 without emitting `unsanctioned-green` or `broken-pin` for that file. The same
predicate is a hard lint finding at `/spec:plan` lock (`ac-matrix --lint`) and a warning,
never a finding, in review's full `ac-matrix` run against already-built specs, so replay
against older specs whose bullets predate the guard stays a fair measurement.
(specs/20260907/01-mixed-pin-guard-and-drift-line.md D1/D2/D3)"

`docs/canonical/review-close.md`: after the last standing-rules bullet ("**Cost is accepted
by contract.** …never a silent skip."), append a new bullet to that list: "- **The close
screen carries an advisory drift signal, never a gate.** After the hygiene listing and before
the close commit, the driver prints one line naming the repo's current count of AC-pin `SHALL
CONTINUE TO` bullets no test cites (`ac-drift.js --json` over `--root`; zero or `inapplicable`
prints nothing) — informational only, it never touches the verdict, the ledger row, or mark
acceptance. `/spec:doctor` check 17 is the same derivation's authoritative, browsable form;
review's line only surfaces it at the moment new drift is created.
(specs/20260907/01-mixed-pin-guard-and-drift-line.md D6)"
