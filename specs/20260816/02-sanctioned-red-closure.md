---
date: 2026-08-16
status: implementing
diff_base: 097e2c1480be65ed3f507bccc4805245c167b798
open_markers: 0
risk: T3                 # touches verdict.js (sole-derivation surface, host T3 trigger)
area: spec-pipeline
design: false
breaking: false
depends_on: ["specs/20260816/01-gate-baseline-reconcile.md"]
depended_on_by: []
brief: n/a
---

# Sanctioned-red closure — at-risk adjudication, durable qualifier, intake JJ-20260816-03

## Goal

specs/20260816/01 lands the gate/baseline wrapper (`suite-baseline.js --gate`) at the gate
resolution seam. This sibling closes the rest of INTAKE JJ-20260816-03's surface, which 01
(planned before the intake row existed) does not cover: the review `at-risk` leg still
hand-waives sanctioned-red failures per review (paid on 4 of the last 4 full-scope reviews,
4/10 toward the leg's false noise-retirement); a green-by-subtraction gate is invisible in the
durable run ledger (legs rows carry name+exit only — 01's own D8 retire falsifier is
underivable as specced); and § Test Rules still states the falsified "scoped gate runs are
pin-free" premise. Done means: the at-risk leg adjudicates via the same wrapper, a
sanctioned-only green derives `CLEAN-with-qualifier` and records `sanctionedReds` in the
ledger's legs row, the premise is rewritten, and JJ-20260816-03's four pins are green with
their baseline rows removed and the intake row closed.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | review.md's `at-risk` leg executes through the wrapper: `node "$(spec-paths suite-baseline)" --gate "<testCommand> <at-risk files>" --root {root}` (same `--gate-file` escape as 01's D5 when the command carries `"` or `$`). Sanctioned-only red → wrapper exit 0, leg green, `observed:"files=<N> sanctionedReds=<K>"` (K from the `__SUITE_BASELINE__` sentinel, appended only when K>0). Residual → exit 1; the leg's ONE mechanical hard finding now cites exactly the `NEW-FAILING` residual lines. The "a pre-existing sanctioned red … is a five-second waive naming the pin" sentence is retired. This wraps a `testCommand` consumer, which 01's D5 forbade wholesale — D9 records the amendment that narrows D5 to its actual rationale; never apply D1 without D9's backlink in place. | The waive is per-review human judgment standing in for a derivation the wrapper already computes; 4/4 recent full-scope reviews paid it, marching a leg earned by a real escape (JJ-20260815-03) toward its 10-waive noise-retirement clause on false counts. Rejected: leaving at-risk hand-waived (the intake row's second carrier stays open). |
| D2 | verdict.js widens the review-profile `CLEAN-with-qualifier` derivation: when the disposition branch would reach plain CLEAN, a **green** `gate` or `at-risk` row whose `observed` matches `/ sanctionedReds=([1-9]\d*)/` derives `CLEAN-with-qualifier` — same branch and exit semantics as the existing `unavailable` check; blocking/red handling is untouched (a red gate still hits GATE_RED first). | JJ's ruling wording: a fully-sanctioned gate red "records as a qualifier instead of a fabricated green" — greenness resting on the baseline trust surface must be visible in the verdict word, exactly as structurally-absent CI is. Rejected: plain CLEAN with observed-only encoding (observed is stripped from the ledger; the qualifier would live only in a temp manifest). |
| D3 | verdict.js `--ledger` legs rows carry the count: a manifest row whose `observed` matches `/ sanctionedReds=([1-9]\d*)/` emits `{"leg":…,"exit":…,"sanctionedReds":<K>}`; every other row stays byte-identical `{leg, exit}`. | This is the durable encoding — it makes 01's D8 retire falsifier ("a ledger row shows a gate leg green with sanctionedReds>0 while the same iteration's suite leg reports newFailing>0") actually derivable from `.claude/spec-runs.jsonl`, and gives doctor's correlations the fact the wf_2222584b-9a8 row lost. Conditional key keeps the AC-20260805-02-5 legs-mirror `deepStrictEqual` pin green (its fixtures are suffix-free). |
| D4 | build.md gains one sentence at 01's wrap point stating the routing consequence: a gate red composed entirely of sanctioned baseline pins exits 0 through the wrapper and therefore never enters the repair loop — the repair loop is structurally incapable of fixing another intake item's open pin (the JJ-20260815-08 category error, second class). | The wrapper enforces the routing structurally; doctrine must also state the obligation so it survives as a testable claim (pin AC-2) rather than an emergent side effect nobody can cite. |
| D5 | `.claude/rules/spec-pipeline.md` § Test Rules: replace the sentence claiming the gate is protected because "pipeline-authored tests live under `tests/<scope>/` … so scoped gate runs are pin-free" with the true mechanism — scoping is for speed and relevance; every pin-closing spec MODIFIES a pre-existing top-level test file (measured: 405 tests / 17 failures / 17-of-17 baseline at run wf_2222584b-9a8), and pin subtraction is owned by the `--gate` wrapper at every gate site. The "Turning a pin green happens only by implementing its intake item" sentence stays. | A grounding file asserting a falsified premise re-teaches the defect to every future session; rewrite in place, never append a correction beside it (holistic rule). No AC pins this host-owned file — `/spec:init` regeneration must stay free to rewrite it. |
| D6 | Intake closure: `tests/gate-sanctioned-red-subtraction.test.js`'s four pins are retagged with AC-20260816-02-1..4 (header updated from "EXPECTED RED" to closed), their four rows come out of `.claude/suite-baseline.json` in the landing batch (the [host] pin-closing gotcha — planned in, so review's out-of-plan finding never fires), and `spec/INTAKE.md`'s JJ-20260816-03 row gets `Fixed in: <landed version>` + `Fix: mechanism(spec/scripts/suite-baseline.js)` — the enforced Fix-column grammar (`mechanism(<repo path>)`, per intake-discipline's green guard) naming the mechanism file, never a bare spec path. | "Turning a pin green happens only by implementing its intake item" — this spec is that item; the pins are the spec's doctrine coverage, not duplicates. |
| D7 | scaffold-ledger.md: the At-risk row's mechanism text gains "executes via `suite-baseline.js --gate`; sanctioned-only reds adjudicated by derivation, never by per-review waive" (its promote/retire condition is unchanged — mechanization stops the false noise-accrual, it does not change the falsifier); 01's new "Gate/baseline reconciliation (`suite-baseline.js --gate`)" row (created when 01 builds — A1 guarantees ordering) gains the at-risk leg as a second consumer, and its re-examine falsifier widens to "a **gate or at-risk** leg green with `sanctionedReds>0` while the same iteration's suite leg reports `newFailing>0`". | Ledger rows describe mechanisms as they exist; the at-risk leg consumes the `--gate` mode, so it belongs on 01's `--gate` row — rejected (refuter 2 #2): extending the old Suite-baseline row, which scopes itself to `--check`/`--update`/`--snapshot`. |
| D8 | Version bump target: spec plugin 6.86.0 (target, not a pin — build bumps to the next free per Gotchas), description = changelog sentence. | House rule. |
| D9 | specs/20260816/01 D5's sentence "`testCommand` — the red-check's per-file runner and every other `testCommand` consumer — is NEVER wrapped" is amended in place (backlink edit applied at plan time, 2026-08-16, by this spec's planning session): the prohibition is scoped to the red-check's per-file probe and any expected-red observation path; the review `at-risk` leg — an adjudication consumer whose whole purpose is sanctioned-set subtraction, never an expected-red probe — runs wrapped per this spec's D1. 01's D5 cell now carries "Amended by specs/20260816/02 D9". | 01's D5 rationale ("wrapping `testCommand` would blur the red-check's expected-red observations") does not reach the at-risk leg; leaving the contradiction unamended would hand workers two verbatim-binding Decisions that cannot both be applied. |

## File Plan

<!-- Machine-consumed: /spec:build parses this table into workflow batches. -->

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/commands/review.md | MODIFY | doctrine | D1 at-risk wrapped invocation + observed grammar + retired waive sentence; D2's qualifier stated in the leg/verdict prose (sanctioned-only green → `CLEAN-with-qualifier`); ledger-row template's legs example shows the optional `sanctionedReds` key AND the adjacent "`legs` mirrors … name+exit pairs. Fixed shape" sentence is rewritten to admit the conditional third key (refuter 2 #1 — a live restatement D3 would otherwise falsify) |
| spec/commands/build.md | MODIFY | doctrine | D4: one routing sentence at the wrap point (sanctioned-only red never enters the repair loop) |
| spec/scripts/verdict.js | MODIFY | scripts | D2 qualifier widening + D3 ledger legs `sanctionedReds`; header incident note (wf_2222584b-9a8) |
| tests/review/verdict.test.js | MODIFY | tests | AC-20260816-02-5, AC-20260816-02-6, AC-20260816-02-7, AC-20260816-02-8 (8 = tag the two existing covering tests, never duplicate) |
| tests/gate-sanctioned-red-subtraction.test.js | MODIFY | tests | D6: retag the four pins as AC-20260816-02-1, AC-20260816-02-2, AC-20260816-02-3, AC-20260816-02-4; update header (pins green-expected once this spec's doctrine rows land, red before — see Behavior) |
| .claude/rules/spec-pipeline.md | MODIFY | other | D5 premise rewrite — no AC, no placeholder AC-IDs (host-owned grounding, deliberately unpinned) |
| .claude/suite-baseline.json | MODIFY | other | D6: remove the four `tests/gate-sanctioned-red-subtraction.test.js` rows (22 → 18) |
| spec/INTAKE.md | MODIFY | doctrine | D6: JJ-20260816-03 row → Fixed in + Fix pointer |
| spec/doctrine/scaffold-ledger.md | MODIFY | doctrine | D7: At-risk + Suite-baseline row text updates |
| spec/doctrine/claims-baseline.json | MODIFY | doctrine | claims ratchet — one whole-corpus regeneration at batch end covers the review.md/build.md/scaffold-ledger.md line-count changes |
| spec/.claude-plugin/plugin.json | MODIFY | other | D8: bump to 6.86.0 (or next free), description = changelog |

## Contracts

```text
# review.md at-risk leg — executed form (D1; quoting per 01's D5, --gate-file escape included):
node "$(spec-paths suite-baseline)" --gate "<testCommand> <at-risk file paths>" --root {root}
# observed grammar (extended; base forms unchanged):
observed: "files=<N>"                                  # ran, no subtraction
observed: "files=<N> sanctionedReds=<K>"               # wrapper sentinel reported sanctioned=<K>, K>0
observed: "unavailable — host declares no testCommand" # unchanged

# review.md gate leg observed grammar: owned by 01 (skips=<N> todos=<M>[ sanctionedReds=<K>]);
# this spec adds no gate-leg grammar, only the verdict/ledger consumption below.

# verdict.js (D2) — review profile, disposition branch reaching CLEAN:
#   green gate or at-risk row with observed matching / sanctionedReds=([1-9]\d*)/
#   → CLEAN-with-qualifier (exit 0, CLEAN-family; ordering after GATE_RED/UNVERIFIED unchanged)

# verdict.js (D3) — --ledger legs rows:
{"leg":"gate","exit":0,"sanctionedReds":17}   # only when observed matches the pattern above
{"leg":"gate","exit":0}                        # byte-identical otherwise (AC-20260805-02-5 pin)
```

## Behavior

- Review of a pin-touching diff, all failures sanctioned: gate leg green with
  `sanctionedReds=<K>` (01), at-risk leg green with `sanctionedReds=<K>` (D1), zero
  hand-waives, verdict `CLEAN-with-qualifier` (D2), ledger legs carry the counts (D3). Doctor
  and 01's D8 falsifier can correlate subtraction against the suite leg's whole-suite truth.
- Review with a genuinely new failure in an at-risk file: wrapper exits 1, the mechanical hard
  finding cites exactly the `NEW-FAILING` lines — sharper than today's whole-red digest.
- TDD sequencing at this spec's own build: the four retagged pins are red at build start
  (pins 3/4 assert doctrine only this spec writes; 1/2 may already be green once 01 lands —
  either way the FILE is red-expected while any pin is red, and all four must be observed
  green after the doctrine rows land, before the baseline rows come out).
- Cross-spec interaction, recorded for 01's reviewer: once 01's doctrine lands, pins 1/2 may
  flip green while their baseline rows still exist — 01's review suite leg then reports
  `fixedNotRemoved` on rows this spec owns removing. That is a five-second waive citing this
  spec; building and reviewing 01 → 02 back-to-back avoids it entirely.
- `.claude/rules/spec-pipeline.md` edit: rewrite-in-place of one § Test Rules passage; the
  worker touches nothing else in the file (host grounding, `/spec:init`-owned).

## Acceptance Criteria

<!-- Test authors derive tests from this spec alone. AC-1..4 retag the four existing intake
     pins in tests/gate-sanctioned-red-subtraction.test.js (D6) — their regexes are the tests;
     do not tighten or weaken them, only retag names/messages and update the header. -->

- **AC-20260816-02-1**: WHEN build.md's gate-resolution text is read THE SYSTEM SHALL state
  that a red gate's failures are adjudicated against the declared sanctioned-red set
  (suite-baseline subtraction) → retagged pin 1 in tests/gate-sanctioned-red-subtraction.test.js
- **AC-20260816-02-2**: WHEN build.md is read THE SYSTEM SHALL state that a gate red composed
  only of sanctioned/baseline pins never enters the repair loop → retagged pin 2 in
  tests/gate-sanctioned-red-subtraction.test.js
- **AC-20260816-02-3**: WHEN review.md's at-risk leg is read THE SYSTEM SHALL state that the
  leg's failures are adjudicated against the sanctioned-red set by derivation (suite-baseline
  subtraction), not by per-review waive → retagged pin 3 in
  tests/gate-sanctioned-red-subtraction.test.js
- **AC-20260816-02-4**: WHEN review.md is read THE SYSTEM SHALL define the durable encoding —
  sanctioned-only subtraction recorded as a qualifier → retagged pin 4 in
  tests/gate-sanctioned-red-subtraction.test.js
- **AC-20260816-02-5**: WHEN verdict.js (review profile) reads a manifest whose legs are all
  green, dispositions clean, and the gate row is
  `{"leg":"gate","exit":0,"observed":"skips=0 todos=0 sanctionedReds=17"}` THE SYSTEM SHALL
  print `CLEAN-with-qualifier` on line 1 and exit 0 (never plain `CLEAN`) — executed through
  the real binary via `runNode` on a produced manifest fixture → new test in
  tests/review/verdict.test.js
- **AC-20260816-02-6**: WHEN the same all-green manifest instead carries
  `{"leg":"at-risk","exit":0,"observed":"files=3 sanctionedReds=3"}` THE SYSTEM SHALL print
  `CLEAN-with-qualifier` identically → new test in tests/review/verdict.test.js
- **AC-20260816-02-7**: WHEN `--ledger` prints the row for a manifest whose gate row observed
  carries `sanctionedReds=17` THE SYSTEM SHALL emit that legs entry as
  `{"leg":"gate","exit":0,"sanctionedReds":17}` while every suffix-free row stays exactly
  `{"leg":…,"exit":…}` (literal: at-risk observed `files=0` → `{"leg":"at-risk","exit":0}`)
  → new test in tests/review/verdict.test.js
- **AC-20260816-02-8**: WHEN a manifest's green legs carry no `sanctionedReds` in any observed
  THE SYSTEM SHALL CONTINUE TO derive plain `CLEAN` (clean workflow, dispositions clean) with
  legs rows exactly `{leg, exit}` — tag the two existing covering tests
  (the six-green-legs CLEAN derivation and the AC-20260805-02-5 legs-mirror pin) in
  tests/review/verdict.test.js, never duplicate them

## Assumptions (escalation triggers)

- A1: specs/20260816/01 lands first (depends_on) with its specced vocabulary — `--gate` /
  `--gate-file`, the `__SUITE_BASELINE__ failing= sanctioned= residual=` sentinel, and the
  `sanctionedReds=<K>` observed suffix. This spec reuses that vocabulary verbatim. — **if
  false** (01's build deviated on any token): worker returns blocked; align this spec's
  strings to 01's landed form and log the deviation — never fork the vocabulary.
- A2: A file-list `node --test <files>` red run emits the same parseable `✖ failing tests:`
  trailer as a glob run. **Executed 2026-08-16:**
  `node --test tests/gate-sanctioned-red-subtraction.test.js` → trailer at output line 14 with
  four `test at <file>:<line>:<col>` pairs. — **if false** for a future runner: the wrapper's
  no-trailer passthrough keeps at-risk honestly red; never a false green.
- A3: No existing test fixture feeds a `sanctionedReds` suffix (grepped tests/ 2026-08-16:
  zero hits), so D2/D3 redden nothing; the legs-mirror `deepStrictEqual` pin stays green
  because the key is conditional. — **if false:** update the colliding pin in place and retag
  with this spec's AC-ID per Gotchas, never weaken.
- A4: The four pins' deliberately-loose regexes go green from 01's + this spec's doctrine
  prose. **Executed at plan time:** the wrap/subtraction mechanics the prose will describe
  were spike-verified against the live repo (scoped gate output parsed 21 failing pairs, all
  ⊆ the 22-row baseline; an injected new failure surfaced as a nameable `NEW-FAILING` row; a
  `build-workflows --check` red carries no trailer, so fail-closed passthrough is real). —
  **if false** (a pin still red after both doctrine rows land): the prose has a wording gap —
  fix the prose, never the pin.
- A5: No workflow-body (`wf-*.js` source) changes are needed: the gate and at-risk legs run
  session-side in review Phase 0, the fix-delta re-run list excludes at-risk, and 01's A4
  already covers the wave-gate seam via `args.gate.command`. — **if false:** STOP, consult
  the retainer — the seam assumption is load-bearing.

## Rationale

This spec exists because two sessions independently hit the same class on the same day:
the morning session (review of specs/20260815/01, 21/22 baseline reds, JJ's wrap ruling)
planned specs/20260816/01; the evening session (review of specs/20260815/05, 17/17, run
wf_2222584b-9a8) filed INTAKE JJ-20260816-03 with four red pins — unaware of each other.
01 is the core mechanism and is deliberately left untouched (hardened, refuter-checked,
another session's lineage); this sibling closes the intake surface 01 predates. The split is
also why AC-1/AC-2 may be green before this spec builds — they pin obligations 01's prose
likely satisfies; they are retagged here (not in 01) because the intake item, its pins, and
its baseline rows close as one unit (D6), and a pin-closing spec must own its baseline-row
removal per the [host] gotcha.

Choices made narrow deliberately: the qualifier rides the existing CLEAN-with-qualifier
word (never a new verdict word — the enum is closed and consumed downstream); the ledger
key is conditional (suffix-free rows stay byte-identical, so the legs-mirror pin and every
ledger consumer see no shape change); § Test Rules is rewritten in place with no test pin
(host grounding stays `/spec:init`-regenerable); the red-check/`testCommand` probe surface
is explicitly NOT wrapped here (01's D5 forbids it — a sanctioned-pin-in-mixed-file probe
misread remains possible; reopen as its own intake item on first observed occurrence rather
than pre-building a mechanism no incident has exercised). Fragile spots for build: D2's
regex must require K≥1 (`sanctionedReds=0` must not demote CLEAN); the qualifier check runs
only in the branch that already reached CLEAN — blocking-leg ordering is untouched; review.md's
ledger-row template line must show the optional key so the doctrine template and D3's output
cannot drift apart.

Adversarial check (2 blind refuters, 2026-08-16), all findings dispositioned:
refuter 1 #1 (HIGH, fixed) — D1 as first drafted silently contradicted 01's locked D5
("every other `testCommand` consumer — NEVER wrapped"); resolved by D9's explicit in-place
amendment with backlink, plus `depended_on_by` wiring on 01. refuter 1 #2 (HIGH, fixed) —
the intake `Fix` cell was a bare spec path, which the green intake-discipline guard's
`parseFixForms()` rejects (executed by the refuter: → null); D6 now uses
`mechanism(spec/scripts/suite-baseline.js)`. refuter 2 #1 (HIGH, fixed) — review.md's
ledger prose "`legs` mirrors … name+exit pairs. Fixed shape" is a live restatement D3 would
falsify; the review.md File Plan row now rewrites that sentence, not just the JSON example.
refuter 2 #2 (MEDIUM, fixed) — D7 had targeted the old Suite-baseline ledger row; the
at-risk leg consumes `--gate`, so the consumer note and the widened falsifier go on 01's new
gate-reconciliation row instead. refuter 2 #3 (MEDIUM, partially accepted) — the cross-spec
amendment lacked provenance; fixed by the `depended_on_by` wiring and this record. Its
demand for roadmap-ADR machinery (doctor check 17, ledger row) is **rejected**: that
machinery amends roadmap *briefs*; between sibling specs the analogous durable trace is
exactly the D9 backlink + dependency wiring now in place, and 01 is unbuilt, so no landed
behavior is being rewritten. Both refuters executed their falsifiable claims (multi-file
`node --test` trailer parse; `parseFixForms`; suffix-free fixture greps; verdict.js branch
ordering) and left the tree clean.

Collision closure (run at lock, `--literal pin-free --literal five-second`): literals hits
adjudicated — `.claude/rules/spec-pipeline.md` and `spec/commands/review.md` are File Plan
rows (the targets); `tests/gate-sanctioned-red-subtraction.test.js` quotes both phrases as
incident narration in comments/messages and is a File Plan row; `spec/INTAKE.md` quotes the
premise as the falsified claim (narration, row already planned); **waived**:
`tests/ac-matrix/ac-matrix.test.js:13` (comment-only restatement, no assertion — worker may
correct the comment in passing, no row owed), `.claude/spec-manifest.json:19` (the
parenthetical "pin-free suite" describes its own scoped one-file target, which carries no
pins — true independently of the retired premise), `spec/doctrine/shared.md:874`
("five-second veto", Question Style — unrelated phrase), `.claude/rules/spec-pipeline.md:232`
(the [host] gotcha's five-second waive concerns scope-reconcile's out-of-plan finding on
baseline-row removal, a different and still-valid waive; this spec follows that gotcha by
planning the removal in). `likely`-tier paths hits all resolve to File Plan rows or
conformance (intake-discipline: D6 conforms to the enforced grammar; claims-lint: ratchet
row planned; drift-reconcile/terminal-observable: consistency suites adjudicated by the
build-time whole-suite check per the sweep's own contract; scope-reconcile-at-risk: pins
`scope-reconcile.js` stem derivation, which this spec never touches).

## Canonical Delta

docs/canonical/gate-integrity.md, new section "Sanctioned-red subtraction" (after
"Environment preflight"): the sanctioned always-red set (`.claude/suite-baseline.json`) is
subtracted from every gate-site red by `suite-baseline.js --gate` (specs/20260816/01) — the
review gate leg, the build gates, the workflow wave gates, and the review at-risk leg all
adjudicate by that one derivation; no session hand-compares a red against the baseline. A
green-by-subtraction leg records `sanctionedReds=<K>` in its manifest observed and its run-
ledger legs row, and the review verdict derives `CLEAN-with-qualifier` — greenness resting
on the baseline trust surface is always visibly qualified. The baseline file is thereby a
blocking-gate trust surface: its edits ride only a pin-closing spec's File Plan or the
`--update` remedy after an adjudicated drift finding; review's out-of-plan hard finding on
the file is the enforcement. Provenance: INTAKE JJ-20260816-03 (run wf_2222584b-9a8),
specs/20260816/01, specs/20260816/02.
