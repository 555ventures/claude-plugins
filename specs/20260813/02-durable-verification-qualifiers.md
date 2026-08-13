---
date: 2026-08-13
status: done
diff_base: 21fded1769ec2050b66c36428cdd1a51a0e287ad
open_markers: 0
risk: T3
area: review-integrity
design: false
breaking: false
depends_on: ["specs/20260813/01-review-self-report-integrity.md", "specs/20260813/03-gate-script-mechanics.md"]
depended_on_by: []
brief: n/a
---

# Durable Verification Qualifiers

## Goal

Qualifiers that today live only in transient console output become durable, machine-readable
facts in the artifacts that outlive the run: the review ledger row's `testsSkipped` splits
sanctioned (`[env:]`-declared) from unsanctioned skips; a release whose required CI leg
structurally never delivered a verdict records the distinct milestone word
`CLEAN-with-qualifier` instead of an unqualified `CLEAN` beside `ci:"unavailable"`; and a spec
can declare a non-test oracle for an AC (`[oracle: <leg>]`, sibling of `[env:]`) so the
coverage matrix stops reporting a legitimately gate-verified AC identically to one nobody
checked. Done = the three qualifier pins run green, with the derivation-pin suite updated to
the new shapes and every unrelated derivation untouched.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | The `skip-reconcile` leg's pinned observed format widens to `skipped=<N> sanctioned=<M>` — `M` = skipped tests attributable to `[env:]`-declared ACs, computed by the orchestrator in review.md Phase 0 step 6 (which already maps each skip to its AC and checks the declaration). The legacy `skipped=<N>` form stays parseable (`sanctioned` absent → 0). | The orchestrator is the only party that already holds the skip↔AC↔declaration mapping; widening the observed string it already writes is the zero-new-machinery carrier. |
| D2 | `verdict.js` derives `row.testsSkipped` as an object `{"total":<gate skips+todos>,"sanctioned":<M from skip-reconcile>,"unsanctioned":max(0, total−M)}` — always the object shape; a legacy manifest without `sanctioned=` derives `{"total":N,"sanctioned":0,"unsanctioned":N}` (a skip with no declared gate is unsanctioned by definition, the conservative reading). review.md's documented ledger row shape updates to match. | hearwell: `testsSkipped:5` was written identically for five `[env:]`-tagged ACs and five undeclared skips; every downstream consumer re-opened specs to tell them apart. Conservative default: undeclared = unsanctioned, never silently sanctioned. |
| D3 | Release profile: when the derivation would reach `CLEAN` but the `ci` leg's observed ∈ {`unavailable`, `unavailable-transient`, `in-progress`} (a required leg resolved without ever delivering a verdict), the word is `CLEAN-with-qualifier` — printed on stdout line 1, recorded in `row.verdict`, exit code 0 (CLEAN family: it gates nothing extra; it refuses to let the pair be read past). **Three release.md/verdict.js sites, all in scope:** (i) release.md's word enum and promote step — `CLEAN-with-qualifier` is promotable exactly as CLEAN is, with the already-mandated ⚠️ line accompanying it; (ii) release.md's Phase 4 report template gains a qualifier rendering — when the word is `CLEAN-with-qualifier` the headline reads `✅ **milestone green (qualified: CI never delivered a verdict) — promoted**` and a `⚠️` slot line names the unresolved leg (the fixed add-nothing-else template otherwise prints the unqualified green headline, reproducing in the client-facing report the exact scrollback ambiguity this spec fixes); (iii) release.md's documented ledger-row JSON gains the `"verdict"` key **net-new** — verdict.js already emits `row.verdict` on release rows, the documented shape simply never listed it; the doc catches up and pins the enum. Also explicit: the final exit line (verdict.js:224 `word === 'CLEAN'`) becomes a CLEAN-family check (`word.startsWith('CLEAN')`) — it sits outside `derive()` and would otherwise exit 1 on the new word. Scope: the `ci` leg only — the one structurally-absent-leg class on record; extension to other legs waits for a second observed class (recorded reopen condition). | hearwell's first release: `verdict:"CLEAN"` beside `ci:"unavailable"`, the ⚠️ living only in console scrollback; never-push hosts land here structurally, and the pre-empted erosion is hosts starting to push just to quiet the leg. Sites (ii)/(iii) and the exit-line edit are refuter findings folded in — the report template and the undocumented row key were out of the original scope, and the exit check is a fourth edit site a `derive()`-only patch would miss. |
| D4 | AC oracle declaration: an AC line may carry `[oracle: <manifest leg>]` — the value is a **manifest leg name only** (`gate`, `smoke`, `drift`, `ci`, …; the closed set the evidence manifest actually carries), sibling syntax to `[env: VAR]`, documented in the spec template's AC comment block. Free-form command text is **not** admitted: an oracle with no manifest row has no mechanical carrier to check redness against, so the "named gate command" form would be a coverage-laundering route (refuter finding) — an AC whose oracle isn't a manifest leg writes a test or declares `[env:]`. Handling applies in **both drift modes** (the `[env:]` precedent): (a) step 5's grep matrix (no-driftScript hosts) treats an `[oracle:]`-tagged AC as covered by declaration — excluded from `uncovered`, reported as a named warning line ("AC-x: oracle = gate leg"), counted in the leg's observed as `uncovered=<N> oracle=<M>`; (b) the **Drift gate** section — which restates the uncovered-AC rule for both modes and currently contradicts any step-5-only edit (refuter finding) — gains the same carve-out sentence for both the driftScript branch (an `[oracle:]`-tagged AC reported uncovered by the host's driftScript is adjudicated against the manifest leg, not the test grep) and the no-driftScript branch. In every mode: an `[oracle:]` naming a manifest leg that is red or absent is a **hard** finding (the declared oracle never ran — identical standing to an uncovered AC). | upwell 20260811/01: an AC whose honest oracle is the typecheck/gate leg reads as uncovered, indistinguishable from an unchecked AC — so authors either fake a test or eat a standing hard finding. Declaration-with-consequences mirrors `[env:]`, whose carve-out runs in both drift modes — the parity this Decision now actually delivers. |
| D5 | `tests/review/verdict.test.js` updates to the new shapes as a declared behavior change: AC-20260805-02-5's assertion becomes the object shape (its total-summing claim survives as the `total` key); release-profile CLEAN pins that used a non-`conclusion=` ci observed update to expect `CLEAN-with-qualifier`. Every other pin stays byte-identical. | Tests here are pinned invariants — changing them is a doctrine change, which this spec is; the change is recorded here so the build's red-check reads it as sanctioned, not as test-weakening. |
| D6 | Version bump target 6.61.0 (target, not a pin). | Standing discipline. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/verdict.js | MODIFY | scripts | D2 `testsSkipped` object derivation (parse `sanctioned=` from skip-reconcile, missing-row guard); D3 `CLEAN-with-qualifier` release derivation **and the final exit line → CLEAN-family check**; header updates |
| spec/commands/review.md | MODIFY | doctrine | D1 step 6 observed format; D2 ledger row shape text; D4 step 5 matrix `[oracle:]` handling + observed format **and the Drift gate section's carve-out in both branches** |
| spec/commands/release.md | MODIFY | doctrine | D3 word enum, promote-step wording, **Phase 4 report template qualifier rendering, ledger row shape text incl. the net-new `"verdict"` key** |
| spec/templates/spec.md | MODIFY | doctrine | D4 `[oracle: <manifest leg>]` syntax in the AC comment block + example line |
| spec/doctrine/scaffold-ledger.md | MODIFY | doctrine | amend the "Verdict derivation" row for the `CLEAN-with-qualifier` word (dated note, re-tune condition: retire the qualifier word if two quarters of release rows never carry it); add the `[oracle:]` exemption to the skipped-test-reconciliation row's declaration-path sentence (same retire logic as `[env:]` — a per-AC exemption, never a retirement) |
| spec/doctrine/claims-baseline.json | MODIFY | doctrine | ratchet re-stamp for the three doctrine files' line-count deltas (same commit) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D6 version bump + changelog description |
| tests/verification-qualifier-durability.test.js | MODIFY | tests | AC-20260813-02-3, AC-20260813-02-4, AC-20260813-02-6 (tag existing red pins) |
| tests/review/verdict.test.js | MODIFY | tests | AC-20260813-02-1, AC-20260813-02-2, AC-20260813-02-5 (new exec pins for the object shape + qualifier word), AC-20260813-02-7, AC-20260813-02-8 (updated pins per D5 — regression pins on `total` and on plain CLEAN with `conclusion=success`) |
| tests/run-ledger.test.js | MODIFY | tests | AC-20260813-02-7 (tag: review schema still carries `"testsSkipped"` — the key survives the shape change) |
| spec/INTAKE.md | MODIFY | doctrine | flip CROSS-20260813-03 to the fixing version with `mechanism(<path>)` citations |

## Contracts

```js
// verdict.js (D2) — replaces deriveTestsSkipped's scalar return
function deriveTestsSkipped(gateRow, skipReconcileRow) // → {total, sanctioned, unsanctioned}
// gateRow.observed pinned 'skips=N todos=M'  → total = N+M (missing/unparseable → 0, as today)
// skipReconcileRow.observed 'skipped=K sanctioned=S' → sanctioned = S
//                          'skipped=K' (legacy)      → sanctioned = 0
//   skipReconcileRow missing entirely (partial/STOP-path manifest) → sanctioned = 0
//   (both parameters null-tolerant — the current deriveTestsSkipped's `row &&` guard survives)
// unsanctioned = Math.max(0, total - sanctioned)

// verdict.js (D3) — release branch of derive()
// ...blocking-leg red checks unchanged, then:
// if (profile === 'release') {
//   const ci = legRows.get('ci')
//   const unresolved = ci && /^(unavailable|in-progress)$/.test(ci.observed || '')
//   //   ^ release.md's ci enum is {conclusion=<value>, unavailable, in-progress} —
//   //     'unavailable-transient' is review-profile-only vocabulary, deliberately absent
//   return unresolved ? 'CLEAN-with-qualifier' : 'CLEAN'
// }
// AND the standalone final exit line (verdict.js:224, OUTSIDE derive()):
//   process.exit(word === 'CLEAN' ? 0 : 1)  →  process.exit(word.startsWith('CLEAN') ? 0 : 1)
```

Ledger row deltas (documented shapes in review.md / release.md update to match):

```
review:  "testsSkipped":{"total":<n>,"sanctioned":<n>,"unsanctioned":<n>}
release: "verdict":"<CLEAN|CLEAN-with-qualifier|GATE_RED|UNVERIFIED>"
```

AC tag grammar (template): `[oracle: <manifest leg name>]` — a leg name from the evidence
manifest's closed set, never free-form command text (no manifest row = no mechanical redness
check = a laundering route); one oracle per AC; an AC never carries both a test mapping and an
`[oracle:]` tag (the tag exists precisely because no test is the oracle).

## Behavior

- Step 6's sanctioned count `M` counts skipped tests mapped to `[env:]`-declared ACs; skips
  with no AC mapping or no declaration are unsanctioned by construction. `M` can exceed
  nothing: `unsanctioned` clamps at 0 (gate and skip-reconcile count different populations —
  the clamp is the honest join).
- `CLEAN-with-qualifier` exits 0, so release.md's "verdict.js exit 0 gates the promote" flow
  is untouched; the word difference is what the durable row and the milestone report carry.
  `GATE_RED`/`UNVERIFIED` derivation order is unchanged and still wins first.
- The `[oracle:]` warning line mirrors the `[env:]` skip warning: named, never silent green,
  never a hard finding when the declared oracle leg is green in the manifest.
- Doctor check 12 needs no change: it never parses `testsSkipped` or the release word beyond
  the stage enum (verified during planning); mixed old/new rows coexist in append-only ledgers.

## Acceptance Criteria

- **AC-20260813-02-1**: WHEN the gate row reports `skips=2 todos=1` and the skip-reconcile row
  reports `skipped=3 sanctioned=2` THE SYSTEM SHALL derive
  `row.testsSkipped = {"total":3,"sanctioned":2,"unsanctioned":1}` → new exec pin in
  tests/review/verdict.test.js
- **AC-20260813-02-2**: WHEN the skip-reconcile row carries the legacy `skipped=2` form and the
  gate row reports `skips=2 todos=1` THE SYSTEM SHALL derive
  `{"total":3,"sanctioned":0,"unsanctioned":3}` (undeclared = unsanctioned) → new exec pin in
  tests/review/verdict.test.js
- **AC-20260813-02-3**: WHEN review.md documents the ledger row THE SYSTEM SHALL show the
  `testsSkipped` split (the row-shape line's `"testsSkipped":` value names sanctioned vs
  unsanctioned) → CROSS-20260813-03a in tests/verification-qualifier-durability.test.js
- **AC-20260813-02-4**: WHEN a release derivation is green but the ci leg observed is
  `unavailable` THE SYSTEM SHALL print `CLEAN-with-qualifier` on stdout line 1, record it in
  `row.verdict`, and exit 0 (e.g. seven green release legs + ci
  `{"leg":"ci","exit":0,"observed":"unavailable"}` → line 1 `CLEAN-with-qualifier`) →
  CROSS-20260813-03b in tests/verification-qualifier-durability.test.js plus a new exec pin in
  tests/review/verdict.test.js
- **AC-20260813-02-5**: WHEN the ci leg observed is `conclusion=success` on an otherwise green
  release THE SYSTEM SHALL print plain `CLEAN` (the qualifier fires only on structurally-absent
  verdicts, never on delivered ones) → exec pin in tests/review/verdict.test.js
- **AC-20260813-02-6**: WHEN a spec author's AC has a non-test oracle THE SYSTEM SHALL provide
  the `[oracle: <manifest leg>]` declaration syntax (template AC comment block) and review.md
  SHALL treat it as covered-by-declaration **in both drift modes** (step 5 matrix and the Drift
  gate section) with a named warning, hard when the declared oracle leg is red or absent →
  CROSS-20260813-03c in tests/verification-qualifier-durability.test.js, extended with two
  doctrine assertions: the red/absent-oracle hard clause and the Drift gate section carrying
  the carve-out in both branches
- **AC-20260813-02-7**: WHEN the gate row reports `skips=N todos=M` THE SYSTEM SHALL CONTINUE TO
  count total skipped as N+M (surviving as the object's `total`; the row key `"testsSkipped"`
  survives in the documented schema) → updated AC-20260805-02-5 pin in
  tests/review/verdict.test.js and the schema pin in tests/run-ledger.test.js
- **AC-20260813-02-8**: WHEN review-profile derivations run THE SYSTEM SHALL CONTINUE TO derive
  every existing word unchanged (GATE_RED/UNVERIFIED precedence, disposition math,
  REVIEWER_FAILED) — the qualifier word exists only on the release profile →
  tests/review/verdict.test.js

## Assumptions (escalation triggers)

- A1: No ledger consumer does arithmetic on `testsSkipped` as a scalar — verified during
  planning: doctor check 12 and the observation derivation don't parse it; hosts' jq anomaly
  queries (`grep -v '"testsSkipped":0'`) still match the object form's absence-of-zero only
  loosely. **if false (a consumer breaks):** that consumer updates in the same wave — never
  revert to the ambiguous scalar.
- A2: Spec 03's verdict.js changes land first (`depends_on`) — this spec edits the same file's
  ledger branch and derive() release branch; building out of order risks a merge collision on
  `derive()`. **if false:** STOP; build 03 first.
- A3: Spec 01's review.md changes land first (`depends_on`) — both specs edit review.md's
  row-shape prose. **if false:** STOP; build 01 first.
- A4: The existing release-profile pins in tests/review/verdict.test.js use
  `observed:"conclusion=success"` on their green ci rows, or will be updated per D5 where they
  don't — the planning read found the release fixtures near line 297. **if false (a pin
  deliberately asserted plain CLEAN on `unavailable`):** that assertion is the incident class
  itself; update it under D5's sanction and note it in the deviations log.
- A5: `[oracle:]` needs no `verdict.js` change — the ac-matrix leg feeds the derivation by exit
  code only; observed-string widening (`uncovered=N oracle=M`) is parse-free. **if false:**
  extend `parseCounts` usage in the same File Plan row.

## Rationale

T3: `verdict.js` is a named T3 trigger and the ledger row is the artifact every downstream
consumer (doctor, escape correlation, release flush, future staged-review evidence) reads.
The class fix is one principle — *a qualifier that exists at run time must survive into the
durable artifact* — applied to the three corroborated shapes (hearwell ×2, upwell ×1, plus the
cross-host anomaly sweep: 13/25 prax and 9/20 upwell post-08-10 review rows carry undifferentiated
skips, and one hard escape rode a review recording 35 unqualified skips). Alternatives rejected:
a separate `qualifiers:[]` row array (a second free-form channel invites prose leaks — the
ledger is counts/enums only; each qualifier instead lands in the field it qualifies); blocking
the release on `ci:unavailable` (structurally punishes never-push discipline — the exact erosion
hearwell's brief warned of); a distinct word like `CLEAN_UNVERIFIED_CI` per leg (a word per leg
explodes the enum — one qualifier word plus the row's existing `ci` field carries which leg).
`[oracle:]` deliberately does NOT exempt the AC from having an oracle — it names one the
manifest can check, and a red/absent declared oracle is hard, so the tag cannot become a
coverage laundering route; the nearest-neighbor risk (authors tagging `[oracle: gate]` on
everything) is bounded by review's existing semantic backstop (a declared oracle that cannot
in fact decide the AC is the reviewer's AC↔test check, unchanged). Sequenced after specs 01
and 03 because all three touch `verdict.js`/review.md — serialization by `depends_on` beats a
merge-conflict lottery. D5 records the sanctioned test updates so the red-check reads them as
declared behavior change, not weakening.

Adversarial-check adjudications (2026-08-13, two blind refuters): ACCEPTED and folded — the
`[oracle:]` driftScript-mode gap and the Drift gate section's contradicting restatement (D4
now covers both modes and both text sites); the release report template's unqualified green
headline (D3 site ii); the net-new `"verdict"` key in release.md's documented row (D3 site
iii); the exit line outside `derive()` (D3, Contracts); the missing scaffold-ledger File Plan
row (a hard review check in this repo — now amending the Verdict-derivation row and the
skipped-test-reconciliation row); the free-form-command half of the oracle grammar (narrowed
to manifest leg names — the unenforceable half was itself the laundering route); the
missing-skip-reconcile-row guard; the dead `unavailable-transient` regex branch (release's ci
enum is narrower than review's). PARTIALLY ACCEPTED: "red/absent declared oracle has no
executable coverage" — a doctrine pin is added (AC-6's extension); an execution harness is
rejected because the adjudication is session-executed prose mechanics with no script carrier,
the same standing as the ac-matrix and skip-reconcile mechanics themselves.

Build deviation (folded 2026-08-13, one-off): run-ledger.test.js's `/exactly ONE line/` pin
broke on release.md's incidental markdown line-wrap ("exactly\nONE line"); the test batch
could not touch release.md, so the regex was widened to `/exactly\s+ONE line/` — the
exactly-one-line-append invariant is asserted unchanged, minus the formatting dependence.

## Canonical Delta

None — plugin doctrine edits are the delta itself (repo precedent).
