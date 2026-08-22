---
date: 2026-08-21
status: done
diff_base: 4a06c5be1415890b4996f25c3798b77fc5ef862f
open_markers: 0
tier: standard           # no critical-trigger file gets a behavioral edit (ac-matrix.js, red-check.js, lib/spec-sections.js, smoke.sh, and the driver are not on the Risk Tiers list); worst failure is a wrong skip disposition, a false smoke red, or a wrong coverage verdict, all surfaced loudly at review
area: review-integrity
design: false
breaking: false
depends_on: ["specs/20260820/07-review-driver.md", "specs/20260821/01-red-check.md"]
depended_on_by: []
brief: n/a
spiked: 2026-08-21
---

# Cross-spec skip mapping reaches the owning-spec sanction; smoke fails closed on a stale-ready environment; AC-ID coverage matching is full-token

## Goal

Two review-evidence defects reported from UpWell 2026-08-21, both red-reproduced at plan
time. (1) The owning-spec `[env:]` sanction that specs/20260815/03 shipped is unreachable on
the realistic path: a skipped test owned by an earlier spec maps to an AC only via an AC-ID
embedded in the skip line or a content match against the spec-under-review's own File Plan
files, so a foreign test citing its AC in a docstring falls to `unmapped-skip` before the
owning-spec lookup runs (UpWell: the same four env-gated tests were `sanctioned=4` under
their own spec, `sanctioned=0` under every other). (2) `smoke.sh` trusts whatever answers
`readyCheck`: an orphaned server from a crashed prior run makes boot report ready instantly,
then the script SIGTERMs its own still-building process — observed as exit 143 /
`shutdown-unclean`. Done = a runner-qualified skip line maps through its own file's AC-ID
citations into the existing sanction logic with every edge failing closed, bare-name behavior
byte-identical, the driver's skip-extraction step preserves the runner's file qualifier, and
smoke refuses to boot into an environment whose ready predicate is already true.

Amended 2026-08-22 — D5's pre-registered reopen condition fired (a live hit): the coverage
grep's bare-substring AC-ID matching lets `AC-…-1` match inside `AC-…-12`, so ac-matrix
fails OPEN (a phantom prefix hit suppresses `uncovered-ac` — 4 laundered ACs on a 78-spec
scan) and red-check fails CLOSED (a green pin phantom-carrying a shorter red-expected AC is
a false `unsanctioned-green` — it stopped specs/20260822/02's build the same day). Done
additionally means: both call sites match full tokens through one exported helper, and a
prefix hit neither launders coverage nor stops a build.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | **Third mapping route in `ac-matrix.js` step 6, tried only after both existing routes miss.** A skip line containing `::` splits at the FIRST `::`; the prefix is a root-relative path. When `path.resolve(root, prefix)` stays inside `--root` AND the file exists, read it (via the existing `readTestFile` cache) and take its full-token AC-ID citations (`matchAll(AC_ID_RE_GLOBAL)`, deduped in file order) as `mappedIds`; flow into the existing `acById` / owning-spec logic untouched. Fail closed at every edge: no `::`, prefix resolving outside `--root`, file missing/unreadable, or zero citations → today's `unmapped-skip` stands (AC-20260821-03-1, AC-20260821-03-2, AC-20260821-03-3, AC-20260821-03-4, AC-20260821-03-7) | The file the runner itself names is the most precise mapping evidence available; feeding the EXISTING sanction logic (never a parallel one) keeps 20260815/03's hit-is-final and fail-closed edges authoritative. Rejected: mapping via a repo-wide content search — unbounded reads and ambiguous multi-hit attribution |
| D2 | **Monotonic widening only.** Route 3 runs solely where today's outcome is `unmapped-skip`: the embedded-AC-ID route keeps absolute precedence (a qualified line embedding an ID never reads the file), the content-match route is byte-unchanged, and bare-name lines (no `::`) never enter route 3 (AC-20260821-03-5, AC-20260821-03-6) | Every currently-mapped skip keeps its exact disposition; only lines that were dead ends can change, and only to a mapped disposition — no re-litigating 20260815/03's precedence rules |
| D3 | **The driver's SKIPS step instructs qualifier retention.** `spec-review-driver.js`'s SKIPS prompt adds: keep the runner's own file qualifier (`<relpath>::<name>`) on each line when the runner emits one (pytest-style `path::name` as the example); bare names only when the runner reports no path (AC-20260821-03-8) | Route 3 consumes the qualifier; a prompt that trims to bare names starves the fix. The existing driver test pins the prompt only as `/skip/i`, so this is additive, no collision |
| D4 | **`smoke.sh` pre-boot staleness probe.** Immediately before spawning `bootCommand`, run `readyCheck` once; if it ALREADY passes, print `__SMOKE_FAIL__ stale-ready` naming the remedy (find and stop the orphaned process / clean the stale ready state, then re-run) and exit **7** — a new documented code — without spawning boot. Header usage/exit-code list updated in the same edit (AC-20260821-03-9, AC-20260821-03-10) | A ready predicate that is true before boot cannot attribute readiness to this run's process — fail closed with a named remedy. Rejected: port-identity via lsof — unportable by design (readyCheck is arbitrary shell: file probes and CLI checks have no port), and smoke.sh's own header already declares file-probe hosts in scope |
| D5 | v1 deliberately does NOT: ~~fix the coverage grep's bare-substring AC-ID prefix collision~~ (reopened 2026-08-22 as D7 — the named live-hit condition fired: red-check's false `unsanctioned-green` stopped specs/20260822/02's build, and the historical scan found 4 laundered ACs; superseded 20260817/05's intake trail terminates here); redesign `mappedIds[0]` primary-pick arbitrariness (20260817/05 D2's accepted residual, unchanged); attempt owning-spec mapping for bare-name skip lines (no evidence to map from — the gap remains for runners that emit no qualifier, reopen when a host observes it); pin review-legs' exit-7→`"fail"` mapping with an AC (pre-existing generic `code!==0&&!==4` branch — a rejection AC here is the vacuous-pin class with five Gotcha-recorded occurrences) [no-ac: pure scope fence — each exclusion names its reopen condition or its resolution] | Fenced scope = one mapping route, one prompt sentence, one pre-boot probe, one anchored matcher; every exclusion is re-openable on evidence, not memory |
| D6 | `spec/.claude-plugin/plugin.json` bumps — target 7.18.0 (target, not a pin; build takes the next free number per the concurrent-semver gotcha — the original 7.15.0 target was already taken at HEAD by the time this spec was amended), description updated as the changelog surface [no-ac: process row — version discipline is review's own hard check, no test surface] | Host rules: every behavior change bumps the owning plugin's semver |
| D7 | **Full-token AC-ID occurrence at both bare-substring call sites, via one exported helper.** `lib/spec-sections.js` exports `acIdOccurs(text, id)`: true iff `id` occurs at a position whose preceding char is absent or outside `[A-Za-z0-9]` AND whose following char is absent or outside `[0-9A-Za-z]` — the 20260817/05 discipline `promise-sweep.js` already applies inline to Decision-row citations; an `indexOf` scan, no per-call RegExp. `ac-matrix.js`'s coverage grep (`readTestFile(f).includes(b.id)`) and `red-check.js`'s carried-AC classifier (`content.includes(b.id)`) each become `acIdOccurs(…)`. Every `matchAll(AC_ID_RE_GLOBAL)` site (route 1, route 3, promise-sweep) is full-token by greedy `\d+` (A1) and stays untouched; route 2's line-content match compares the skip LINE, not an AC-ID, and stays byte-unchanged — it now reads a phantom-free `fileAcMap`, and a disposition that existed only through a prefix phantom changing IS this fix, not a D2 violation. promise-sweep's inline filter stays as-is: same discipline, different operation (enumeration with indexes), zero behavior delta in consolidating (AC-20260821-03-11, AC-20260821-03-12, AC-20260821-03-13) | ac-matrix fails OPEN (phantom hit suppresses `uncovered-ac` — an AC with no test anywhere reports covered) and red-check fails CLOSED (false `unsanctioned-green`, the 2026-08-22 build stop). Rejected: a per-ID `(?!\d)` lookahead — no leading boundary, admits letter-after, and a THIRD spelling of a discipline the repo already carries |
| D8 | **Historical audit is separate, recorded work.** The four scan-flagged ACs whose only apparent coverage is a longer AC-ID (specs/20260808/01 AC-1, specs/20260813/03 AC-1, specs/20260815/01 AC-1, specs/20260816/01 AC-1) are re-checked AFTER this spec lands by running the fixed ac-matrix against each owning spec; every confirmed uncovered AC gets a `/spec:escape` row against the review run that passed it — the escape ledger is the durable record, never an intake note. All four target code since deleted or retired (autopilot, `claims-lint.js`, `suite-baseline.js`, advisory-append), so no live coverage hole is expected; the rows record the escape, not a repair [no-ac: operator process — the deliverable is escape-ledger rows, no test surface in this repo's tree] | The fix and the archaeology have different blast radii; escape rows are the repo's existing mechanism for "review passed what it shouldn't", so nothing rides on memory |
| D9 | **Build-time disposition (2026-08-22, user-confirmed): the pre-image red-check's `unsanctioned-green` on `tests/smoke-shutdown-behavior.test.js` is D7's own defect self-firing; the build proceeds past it for THAT ONE FILE ONLY.** Executed evidence at base 4a06c5b: the file's full-token AC-ID set is `{AC-20260815-04-1..4, AC-20260821-03-10}` — `AC-20260821-03-1` occurs at no token boundary; AC-20260821-03-10's bullet says SHALL CONTINUE TO, so `isSanctioned` is true; the file runs 4/4 green; and its entire diff since 4a06c5b is a header comment plus a test-title tag, with zero assertion or fixture changes. Under D7's `acIdOccurs` the classifier yields `carriedAcs = ['AC-20260821-03-10']` → expected green, observed green, no finding. The per-file manifest confirms Phase 1's red evidence is real: the other five tests-layer files are all expected-red / observed-red. **This ruling disposes one finding on one file, never the finding class** — any later `unsanctioned-green` in this build (which prints an identical console line) gets a fresh diagnosis, and "red-check is buggy here" is never a standing waiver [no-ac: build-time disposition — the terminal observable already exists as AC-20260821-03-12, whose synthetic fixture is this incident's isomorph] | Proceeding on a general "the tool under repair is wrong" argument would launder a real red-first miss; proceeding on this file's executed counterfactual does not. Doctrine requires user confirmation on `unsanctioned-green` — given 2026-08-22 |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/ac-matrix.js | MODIFY | scripts | D1/D2: qualified-line mapping route before the unmapped-skip fallthrough; fail-closed edges; existing sanction logic untouched. D7: coverage grep uses `acIdOccurs`; header defect note (dated) |
| spec/scripts/lib/spec-sections.js | MODIFY | scripts | D7: export `acIdOccurs(text, id)` — anchored full-token occurrence (the 20260817/05 discipline); header note |
| spec/scripts/red-check.js | MODIFY | scripts | D7: carried-AC classifier uses `acIdOccurs`; header defect note (dated) |
| spec/scripts/spec-review-driver.js | MODIFY | scripts | D3: SKIPS prompt gains the qualifier-retention instruction |
| spec/scripts/smoke.sh | MODIFY | scripts | D4: pre-boot readyCheck probe, `stale-ready` sentinel, exit 7, header exit-code list |
| tests/ac-matrix/qualified-skip-mapping.test.js | CREATE | tests | AC-20260821-03-1 … AC-20260821-03-7 (red-first for 1/4; CONTINUE-TO pins for 2/3/5/6; synthetic host trees, sibling to owning-spec-env.test.js) |
| tests/review/review-driver.test.js | MODIFY | tests | AC-20260821-03-8: SKIPS prompt asserts the qualifier-retention instruction (red-first) |
| tests/smoke-stale-ready.test.js | CREATE | tests | AC-20260821-03-9 (red-first: pre-boot-true config → exit 7 + sentinel) |
| tests/smoke-shutdown-behavior.test.js | MODIFY | tests | AC-20260821-03-10: tag the existing green boot→ready→clean-stop pin (CONTINUE TO; tag, never duplicate) |
| tests/ac-matrix-coverage-holes.test.js | MODIFY | tests | AC-20260821-03-11 (red-first), AC-20260821-03-13 (green boundary pin) — Hole 3 in this file's incident family; header extended |
| tests/red-check/red-check.test.js | MODIFY | tests | AC-20260821-03-12 (red-first: a phantom prefix carry no longer forces red-expected on a green pin) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D6: bump + changelog description (target 7.18.0 — stale 7.15.0 cell corrected 2026-08-22 per D9; HEAD was 7.17.0 at build) |

## Contracts

```js
// ac-matrix.js step 6 — mapping route order (D1/D2). Routes 1 and 2 byte-unchanged.
//   route 1: AC-IDs embedded in the skip line          (line.matchAll(AC_ID_RE_GLOBAL))
//   route 2: line content-matched against fileAcMap    (spec-under-review File Plan files)
//   route 3 (NEW, only when 1 and 2 both yield nothing AND line contains '::'):
//     rel  = line.slice(0, line.indexOf('::'))
//     eligible ⇔ path.resolve(root, rel) is strictly inside resolve(root) AND the file exists
//     mappedIds = dedup-in-file-order of readTestFile(rel).matchAll(AC_ID_RE_GLOBAL) tokens
//     (matchAll's greedy \d+ returns full tokens — executed evidence A1; no anchoring pass
//      exists or is needed here)
//   any route-3 edge failing → the existing unmapped-skip finding, byte-identical detail.
// Observed objects, finding classes, exit codes: all unchanged.
```

```bash
# smoke.sh — one new exit code, one new sentinel (D4); codes 0–6 byte-unchanged.
#   7  environment already ready before boot   (__SMOKE_FAIL__ stale-ready: readyCheck passed
#      before bootCommand was spawned — a process from a previous run is likely still
#      answering; stop it (or clean the stale ready state) and re-run)
# Probe runs after config validation/inert handling (codes 3/4/5 unreachable changes: none),
# immediately before the `bash -c "$BOOT" &` spawn. review-legs.js needs no change: its
# observed mapping (code!==0 && code!==4 → "fail") already covers 7.
```

```js
// lib/spec-sections.js — new export (D7). Pure, no I/O, sibling to AC_ID_RE.
//   acIdOccurs(text, id) -> boolean
//   true iff `id` occurs in `text` at a full-token position: preceding char absent or
//   outside [A-Za-z0-9], following char absent or outside [0-9A-Za-z]. indexOf scan —
//   no per-call RegExp. 'AC-…-1' never hits inside 'AC-…-12'; a quoted, backticked,
//   parenthesized, or file-edge citation always hits.
```

## Behavior

The UpWell repro, end to end after this spec: reviewing any spec in a repo where
`dataplane/tests/test_sandbox_e2b.py`'s four tests (docstrings citing specs/20260820/02's
`[env:]`-declared ACs) are skipped, the driver's SKIPS step now writes
`dataplane/tests/test_sandbox_e2b.py::test_name` lines; ac-matrix resolves each file, reads
the cited AC-IDs, misses `acById`, derives the owning spec, finds `[env:]`, and reports
`{"skipped":4,"sanctioned":4}` with four warnings naming the owning spec — matching what
spec 02's own review already recorded (rv_41039b1acb2b). A foreign file citing nothing, a
qualifier pointing outside the repo, and every bare-name line all land exactly where they
land today.

Smoke, after this spec: a crashed run's orphaned server makes the next review's smoke leg
fail in seconds with `stale-ready` + the remedy, instead of killing its own half-built boot
and reporting the misleading `shutdown-unclean`.

## Acceptance Criteria

- **AC-20260821-03-1**: WHEN a skip line is runner-qualified and unmapped by routes 1–2, and
  its resolved file cites an AC declared `[env:]` in its owning spec THE SYSTEM SHALL
  sanction the skip via the existing owning-spec lookup (skip line
  `dataplane/tests/test_x.py::test_gated`, file docstring citing `AC-20260810-01-1`, owning
  spec declaring `[env: E2B_LIVE_API_KEY]` → observed `{"skipped":1,"sanctioned":1}`, zero
  skip findings, warning matching `/declared in .*specs\/20260810\/01/`) → red-first in
  tests/ac-matrix/qualified-skip-mapping.test.js
- **AC-20260821-03-2**: WHEN a qualified line's resolved file cites no AC-ID THE SYSTEM
  SHALL CONTINUE TO report the `unmapped-skip` hard finding for that line
- **AC-20260821-03-3**: WHEN the qualifier's path is absent under `--root` or resolves
  outside it THE SYSTEM SHALL CONTINUE TO report `unmapped-skip` and SHALL never read a file
  outside `--root` (`../outside.py::t` → `unmapped-skip`)
- **AC-20260821-03-4**: WHEN a qualified line's resolved file cites only a
  spec-under-review AC whose bullet has no `[env:]` THE SYSTEM SHALL report
  `unsanctioned-skip` naming that AC (route 3 feeding the same-spec branch) → red-first
- **AC-20260821-03-5**: WHEN a skip line contains no `::` THE SYSTEM SHALL CONTINUE TO map
  it only via the existing content-match route (bare foreign name → `unmapped-skip`; bare
  own-file name → today's disposition, byte-identical)
- **AC-20260821-03-6**: WHEN a qualified line itself embeds an AC-ID THE SYSTEM SHALL
  CONTINUE TO map via the embedded route without reading the file (line
  `x.py::test_a cites AC-20260821-09-1` with the file citing a different AC → disposition
  follows the embedded ID)
- **AC-20260821-03-7**: WHEN a qualified line's resolved file cites several ACs THE SYSTEM
  SHALL take the first citation in file order as the primary (file citing
  `AC-20260810-01-14` then `AC-20260810-01-1` → primary `AC-20260810-01-14`; repeats deduped)
- **AC-20260821-03-8**: WHEN the driver prints the SKIPS extraction step THE SYSTEM SHALL
  instruct preserving the runner's file qualifier (prompt text names the
  `<relpath>::<name>` form and says bare names only when the runner reports no path) →
  red-first in tests/review/review-driver.test.js
- **AC-20260821-03-9**: WHEN `readyCheck` passes before `bootCommand` is spawned THE SYSTEM
  SHALL print `__SMOKE_FAIL__ stale-ready` with the remedy and exit 7 without spawning boot
  (config `{"bootCommand":"sleep 30","readyCheck":"true"}` → exit 7, sentinel printed, run
  completes without waiting on the 30s child) → red-first in tests/smoke-stale-ready.test.js
- **AC-20260821-03-10**: WHEN `readyCheck` fails before boot and passes after it, followed
  by a clean stop on the declared signal THE SYSTEM SHALL CONTINUE TO print `__SMOKE_PASS__`
  and exit 0 (existing covering pin in tests/smoke-shutdown-behavior.test.js, tagged)
- **AC-20260821-03-11**: WHEN a well-formed AC's ID appears in the File Plan's test files
  only as a prefix of a longer AC-ID THE SYSTEM SHALL report it `uncovered-ac` (spec
  declaring `AC-20260101-01-1` and `AC-20260101-01-12`, one test file citing only
  `AC-20260101-01-12` → hard `uncovered-ac` naming `AC-20260101-01-1`, manifest
  `observed.uncovered` = 1, exit 1; pre-image at 090b45a observes uncovered 0, exit 0) →
  red-first in tests/ac-matrix-coverage-holes.test.js
- **AC-20260821-03-12**: WHEN a red-check tests-layer file's only citation is a longer
  AC-ID sharing a shorter red-expected AC's prefix THE SYSTEM SHALL classify the file by
  the full-token citation alone (spec declaring red-first `AC-20260101-01-1` and pin
  `AC-20260101-01-12` whose bullet says SHALL CONTINUE TO; a passing file citing only
  `AC-20260101-01-12` → `carriedAcs` `["AC-20260101-01-12"]`, expected green, zero
  findings, exit 0; pre-image phantom-carries `AC-20260101-01-1` and reports a false
  `unsanctioned-green`, exit 1) → red-first in tests/red-check/red-check.test.js
- **AC-20260821-03-13**: WHEN an AC-ID is cited at ordinary delimited positions THE SYSTEM
  SHALL CONTINUE TO count the citing file covered (a citation directly after a quote as
  `'AC-20260101-01-1 …'`, one inside backticks, and one as the file's final token all
  count as hits — anchoring rejects only `[A-Za-z0-9]` neighbours, never punctuation or
  file edges) → tests/ac-matrix-coverage-holes.test.js

## Assumptions (escalation triggers)

- A1: `matchAll(AC_ID_RE_GLOBAL)` yields full tokens, never prefixes — **executed** 2026-08-21:
  `'Cites AC-20260810-01-14 and (AC-20260810-01-1).'` → `["AC-20260810-01-14","AC-20260810-01-1"]`.
  **if false:** anchoring becomes necessary — STOP, widen D1.
- A2: The defect reproduces at HEAD — **executed** 2026-08-21 (red repro): synthetic tree with a
  foreign qualified skip citing an owning spec's `[env:]` AC → `unmapped-skip`,
  `{"skipped":1,"sanctioned":0}`, exit 1. **if false:** the route already exists — STOP, re-derive scope.
- A3: The smoke defect reproduces at HEAD — **executed** 2026-08-21 (red repro): config
  `{"bootCommand":"sleep 30","readyCheck":"true"}` → `__SMOKE_FAIL__ shutdown-unclean: exit
  status 143`, exit 6 (the script killed its own child after crediting a ready state it never
  produced). **if false:** STOP, re-derive scope.
- A4: Exit 7 is unclaimed in smoke.sh (header documents 0–6) and review-legs.js maps any
  non-0/non-4 code to observed `{"result":"fail"}` — both read from source 2026-08-21.
  **if false:** pick the next free code and record the deviation.
- A5: One extra `readyCheck` execution pre-boot is side-effect-safe — the existing poll loop
  already executes it repeatedly per run. **if false (a stateful readyCheck surfaces):**
  blocked, ask the user.
- A6: Runners that emit no file qualifier keep byte-identical (bare-name) behavior; the
  cross-spec gap remains for them by D5's fence. **if false is the wrong call for a real
  host:** reopen via D5's named condition, not mid-build.
- A7: The bare-substring class has exactly two call sites — ac-matrix.js's coverage grep
  and red-check.js's carried-AC classifier (grep evidence 2026-08-22; every other AC-ID
  consumer is `matchAll` over `AC_ID_RE_GLOBAL`, full-token per A1, or promise-sweep's
  inline anchored filter). **if false:** STOP, widen D7 — never patch a third site
  un-specced.

## Rationale

Provenance: an external UpWell agent report (2026-08-21), verified against this repo before
planning — the red repros in A2/A3 are this session's own executions, not the report's word.
The reporter prescribed "reuse the 20260817/05 anchored matcher"; that spec was superseded
unbuilt at the v7 freeze and no anchored matcher exists — irrelevant here because route 3
extracts citations by `matchAll`, which is full-token by construction (A1). The prescriber's
other miss: port-identity checking for smoke assumes a port-shaped readyCheck; the script's
own contract admits file probes, so the portable invariant is "ready must be false before
boot", which also catches every other flavor of dirty environment for free. The pre-boot
probe deliberately fails closed even for hosts whose ready state legitimately persists
across runs (e.g. a probe file never cleaned): such a predicate cannot distinguish this
run's readiness from history, which is exactly the defect class — the remedy line tells the
operator what to clean. Sequencing: `depends_on` pins this spec behind the driver spec
(07 — the SKIPS prompt file is its unreviewed diff) and behind red-check (01 — concurrent
`ac-matrix.js` edits); sibling 20260821/02 also edits the driver but only adds a REPLAY
state, disjoint from the SKIPS prompt — parallel risk accepted and noted rather than
chained. No INTAKE row exists for either defect (external report, not an intake pin), so no
suite-baseline update rides this spec.

D7's provenance: D5's reopen condition fired 2026-08-22 with an executed repro at HEAD
090b45a — two ac-matrix fixtures identical except AC ids 1,12 vs 1,2, each with a test
naming only the second AC: the 1,12 fixture reported uncovered 0 / exit 0, the 1,2 fixture
the `uncovered-ac` hard finding / exit 1 — plus the live red-check stop of
specs/20260822/02's build the same day. The defect shipped 2026-08-14 with ac-matrix.js
itself (552d80d); 20260821/01 inherited it knowingly (its D2: same literal grep) and its
review fixed a different unanchored-substring bug (tag-position anchoring in
`parseAcBullets`) while leaving this one to D5's fence. Fixing red-check.js here is
in-family: one class, one helper, and this spec already sits behind 20260821/01 in
`depends_on`. promise-sweep is deliberately untouched (D7): consolidating its inline filter
is a zero-behavior-delta cleanup, not this defect. This amendment takes the spec past its
own ≥10-AC threshold. The plan-time trace claimed every new or modified test file that
phantom-carries the red-first `AC-…-1` under the PRE-image red-check is genuinely red for
its own reasons, so build Phase 1 would see expected red / observed red and no false stop.
**That trace was wrong; corrected 2026-08-22 from build's own executed manifest:** it holds
for `tests/ac-matrix-coverage-holes.test.js` and `tests/red-check/red-check.test.js` (both
phantom-carry `AC-…-1`, both observed red), but it missed this spec's own instance of the
very shape the sequencing note records next for specs/20260822/01 —
`tests/smoke-shutdown-behavior.test.js` carries the CONTINUE-TO tag `AC-20260821-03-10`,
which substring-contains `AC-…-1`, and is green. Phase 1 therefore stopped on a false
`unsanctioned-green`; D9 records the executed counterfactual and the user-confirmed
disposition. Sequencing
consequence recorded for the roadmap: specs/20260822/01 (its `AC-…-10` pin file
substring-contains `AC-…-1`) and specs/20260822/02 trip the pre-fix red-check by
construction — this spec builds first, and both gain it in `depends_on`.

Collision closure (run at the 2026-08-22 amendment; the original lock recorded none —
closed here). Paths leg, two `likely` hits, both WAIVED: `tests/consistency/entrypoints.test.js`
is data-driven over `spec/entrypoints.json` and the live command files, and this spec adds no
new script or entry point (ac-matrix.js, red-check.js, and lib/spec-sections.js are all
already wired), so it needs no edit — residual redness at build would be a wiring defect in
this spec, never a reason to edit the checker. `tests/ac-matrix/owning-spec-env.test.js` pins
the owning-spec `[env:]` lookup that D1's route 3 feeds; D2's monotonic-widening rule keeps
every currently-mapped disposition byte-identical, and the file's fixture AC-IDs all carry
single-digit ordinals (verified 2026-08-22), so D7's anchoring cannot change a single one of
its hits. `mentions`-tier hits owe no waive; note that `tests/ac-matrix-coverage-holes.test.js`
and `tests/red-check/red-check.test.js` appear there and are both planned File Plan rows.

## Canonical Delta

None — no `docs/canonical/` area covers review-leg scripts; the scripts' own header
comments (updated in-plan for smoke.sh) remain the canonical surface.
