---
date: 2026-08-15
status: done
diff_base: 96e4c2e1e1eb1b52da371cdaa74a31edf84e6ac6
open_markers: 0
risk: T2
area: review-integrity
design: false
breaking: false
depends_on: ["specs/20260815/02-at-risk-pins.md"]
depended_on_by: ["specs/20260815/04-runtime-shutdown-leg.md"]
brief: n/a
---

# ac-matrix fail-closed — the coverage denominator and the owning-spec sanction

## Goal

Two holes in `spec/scripts/ac-matrix.js`, both found by this repo's own review of
20260814/04 and pinned red at intake (JJ-20260815-01, JJ-20260815-02; two defects bundled
for economics, not one class). (1) A malformed AC bullet is dropped from the coverage
denominator, so the durable manifest row records `uncovered=0` while an unswept AC exists —
waive the one `malformed-ac` finding and the coverage claim is permanently false. (2) The
skipped-test reconciliation resolves `[env:]` only from the spec under review, so a
declaration living in the AC's *owning* spec is unreachable and a correctly-declared
env-gated suite reads as an unsanctioned HARD finding on every review touching that area —
the cry-wolf path back into this leg's founding incident. Done = unparseable counts as
uncovered in both drift modes, the owning-spec lookup resolves sanctions with fail-closed
edges, both intake pins run green, observed grammars are byte-unchanged, and both INTAKE
rows are stamped fixed.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | **Unparseable = unknown = uncovered.** Every malformed bullet increments `uncovered` — in BOTH drift modes (a bullet no ID grammar can parse is equally opaque to a host driftScript). The `malformed-ac` hard finding stays exactly as-is (one finding per bullet, never a second `uncovered-ac` finding for the same bullet — the count moves, the findings don't double). The observed grammar `uncovered=N oracle=M` is byte-unchanged. | Fail closed on the denominator exactly as the skip reconciliation already does; the durable row must not out-claim what was actually swept. Grammar stability = no downstream parser moves (verdict.js parses only gate/skip-reconcile observed strings — verified against source). |
| D2 | **Owning-spec sanction lookup — consulted ONLY on an `acById` miss.** Skip reconciliation resolves an AC's `[env:]`/sanction as: (1) `acById.get(primary)` **hits** → that bullet is final, exactly as today — with `[env:]` it sanctions, without `[env:]` it is `unsanctioned-skip`, and the owning spec is **never consulted on this branch** (a re-declared bullet that dropped its gate is authoritative — the AC-20260815-03-6 edge); (2) `acById.get(primary)` **misses** → derive the owner from the AC-ID grammar: `AC-{YYYYMMDD}-{NN[a-z]?}-{k}` → the single file matching `^{NN[a-z]?}-.*\.md$` under `{root}/specs/{YYYYMMDD}/` — read it, `extractSection('Acceptance Criteria')` + `parseBullets` (the same two functions, no parallel parser), find the bullet whose id equals the AC-ID, honor its `[env:]`. **Fail closed at every edge of branch (2):** date dir absent, zero or ≥2 filename matches, file unreadable, no AC section, AC not found in it, or AC found without `[env:]` — each yields today's `unsanctioned-skip` hard finding (with the edge named in the detail). Owning-spec reads are cached per file within one run. | The AC-ID grammar already mechanically encodes its owner; the hit-is-final rule (refuter-tightened — an earlier draft's "or the hit lacks env" fall-through contradicted the pinned edge) keeps a stale local bullet from laundering a skip through a farther file. Residual hole of CROSS-20260813-03: 6.61.0 added `[env:]` sanctioning but never widened WHERE the declaration is read from. |
| D3 | An owning-spec sanction **counts and reports like a same-spec sanction**: `sanctioned++`, and the warning line names the source — `"{AC-ID}: skipped test sanctioned by [env: {VAR}] (declared in {owning spec path})"`. Observed grammar `skipped=N sanctioned=M` byte-unchanged. | The intake pin asserts `sanctioned=1` for the cross-spec case; naming the declaring file keeps the sanction auditable (never silent green). |
| D4 | `spec/commands/review.md` step 6's sanction sentence widens truthfully: "unless the AC carries an explicit environment-gating declaration in the spec" → "…on its AC line **in the spec under review or in the AC's owning spec (derived from the AC-ID)**". No other doctrine moves. | review.md must not under-describe the mechanism it cites (miscitation is this repo's own hard-finding class). |
| D5 | v1 deliberately does NOT: resolve `[oracle:]` from the owning spec (the hole was `[env:]`; a cross-spec oracle has no observed case — reopen on a real one); search beyond `{root}/specs/` or tolerate renamed date dirs (fail closed IS the contract); fuzzy-match AC-IDs (exact `AC_ID_RE` only); change exit codes, finding classes, or the `--json` shape beyond the counts D1 moves. | Every exclusion carries its reopen condition; the fenced scope is two accounting paths in one script plus one truthful doctrine clause. |
| D6 | `spec/.claude-plugin/plugin.json` bumps — target 6.79.0 (target, not a pin; build takes the next free number). `spec/doctrine/claims-baseline.json` re-stamped via `node "$(spec-paths claims-lint)" --update-baseline` in the same commit (review.md's line count moves). `spec/INTAKE.md` rows JJ-20260815-01 and JJ-20260815-02 flip to fixed @ landed version, same commit. | Version/claims/intake discipline per host rules and the intake header contract. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/ac-matrix.js | MODIFY | scripts | D1: malformed→uncovered both modes; D2/D3: owning-spec `[env:]` lookup, fail-closed edges, cached reads |
| spec/commands/review.md | MODIFY | doctrine | D4: one truthful clause in step 6's sanction sentence |
| spec/doctrine/claims-baseline.json | MODIFY | doctrine | D6: full-corpus re-stamp, same commit |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D6: bump + changelog description (target 6.79.0) |
| spec/INTAKE.md | MODIFY | other | D6: JJ-20260815-01, JJ-20260815-02 → fixed @ landed version |
| tests/ac-matrix-coverage-holes.test.js | MODIFY | tests | AC-20260815-03-1, AC-20260815-03-2: tag the two intake pins (green on D1/D2 landing) AND extend the JJ-20260815-02 case with the D3 observable — assert stdout matches `/declared in .*specs\/20260808\/01/` (extend, never weaken; refuter catch: the warning's owner-naming promise had no asserting test) |
| tests/ac-matrix/owning-spec-env.test.js | CREATE | tests | AC-20260815-03-3 … AC-20260815-03-6 (red-first, synthetic host trees) |
| tests/ac-matrix/ac-matrix.test.js | MODIFY | tests | AC-20260815-03-1 second carrier: RETARGET the "observed counts only the well-formed ACs" assertion (`uncovered=0` → `uncovered=1`, message rewritten to the fail-closed rule, **test NAME renamed** — the old title asserts the retired behavior and host Test Rules require names stating the live invariant); ADD the AC-20260815-03-9 drift-mode case (red-first); AC-20260815-03-7/-8 CONTINUE TO tags on the covered/sanctioned pins |

## Contracts

```
# ac-matrix.js — no CLI change; accounting and lookup semantics only.
# D1: uncovered = (well-formed ACs with zero test hits and no green oracle) + (ALL malformed bullets)
#     — the malformed term applies in --has-drift-script mode too.
# D2 owning-spec derivation (exact, fail-closed):
#     AC-20260808-01-12 → {root}/specs/20260808/ → exactly one file matching ^01-.*\.md$
#     letter-suffixed: AC-20260810-03a-2 → ^03a-.*\.md$
#     resolution: acById HIT → final (env → sanctioned; no env → unsanctioned, owner NEVER read)
#                 acById MISS → owning spec (env → sanctioned; every edge → unsanctioned)
# D3 warning line (cross-spec sanction):
#     "{AC-ID}: skipped test sanctioned by [env: {VAR}] (declared in specs/20260808/01-autopilot-enroll.md)"
# unchanged: observed grammars `uncovered=N oracle=M` / `skipped=N sanctioned=M`, exit codes 0/1/2,
#     finding classes {malformed-ac, uncovered-ac, oracle-red-or-absent, missing-test-file,
#     unsanctioned-skip, unmapped-skip}, manifest row shapes.
```

## Behavior

- D1 seam: the malformed loop already iterates all bullets to emit `malformed-ac`; it now also
  increments the same `uncovered` counter step 5 uses (declared before both branches so the
  drift-mode path shares it). `uncovered-ac` findings still come only from well-formed bullets.
- D2 seam: in the skip loop, the owner derivation runs **only when `acById.get(primary)`
  returns undefined** — a hit, with or without `env`, terminates resolution on the current
  spec's bullet (D2 branch 1; the refuter-caught contradiction lived here). When the derived
  owner IS the spec under review (same resolved file), the miss already answered it — fail
  closed. A malformed `primary` can't occur (ids come from `AC_ID_RE_GLOBAL` matches or
  `fileAcMap`, both grammar-bound).
- Edge pinned: an AC present in the spec under review WITHOUT `[env:]` whose owning spec HAS
  `[env:]` — the current-spec hit wins and the skip is **unsanctioned** (the spec under review
  re-declared the AC and dropped the gate; trusting the re-declaration is the conservative
  read, and the fix is a one-line edit to that spec). Literal in AC-20260815-03-6.

## Acceptance Criteria

- **AC-20260815-03-1**: WHEN a spec's AC section contains a malformed bullet THE SYSTEM SHALL
  count it in `uncovered` while still emitting the `malformed-ac` hard finding (literal: one
  malformed bullet + one covered AC → manifest row `observed:"uncovered=1 oracle=0"`, findings
  = [`malformed-ac`], no `uncovered-ac` row for the malformed bullet) →
  tests/ac-matrix-coverage-holes.test.js (intake pin, tagged) + the retargeted assertion in
  tests/ac-matrix/ac-matrix.test.js
- **AC-20260815-03-2**: WHEN a skipped test maps to an AC declared `[env:]` in its owning spec
  (a different file than `--spec`) THE SYSTEM SHALL sanction it (literal:
  `AC-20260808-01-12` with `[env: AUTOPILOT_ENROLL_LIVE]` in `specs/20260808/01-*.md` →
  `observed:"skipped=1 sanctioned=1"`, warning names the owning spec path, zero
  `unsanctioned-skip` findings) → tests/ac-matrix-coverage-holes.test.js (intake pin, tagged)
- **AC-20260815-03-3**: WHEN the owning spec's date dir or file is absent THE SYSTEM SHALL
  fail closed with `unsanctioned-skip` naming the missing owner (literal: skip mapping to
  `AC-20260101-99-1` with no `specs/20260101/` → finding detail contains `owning spec`) →
  tests/ac-matrix/owning-spec-env.test.js (red-first)
- **AC-20260815-03-4**: WHEN two files match the owner pattern `^{NN}-.*\.md$` THE SYSTEM
  SHALL fail closed with `unsanctioned-skip` naming the ambiguity → 
  tests/ac-matrix/owning-spec-env.test.js (red-first)
- **AC-20260815-03-5**: WHEN the owning spec exists but its matching AC bullet has no `[env:]`
  THE SYSTEM SHALL fail closed with `unsanctioned-skip` →
  tests/ac-matrix/owning-spec-env.test.js (red-first)
- **AC-20260815-03-6**: WHEN the spec under review re-declares the AC without `[env:]` while
  the owning spec declares it THE SYSTEM SHALL treat the skip as unsanctioned (current-spec
  hit wins; literal in Behavior) → tests/ac-matrix/owning-spec-env.test.js (red-first)
- **AC-20260815-03-7**: WHEN a spec's ACs are all well-formed and covered THE SYSTEM SHALL
  CONTINUE TO record `uncovered=0` and exit 0 → existing tests/ac-matrix/ suite (tagged)
- **AC-20260815-03-8**: WHEN a skipped test's AC carries `[env:]` in the spec under review THE
  SYSTEM SHALL CONTINUE TO sanction it with today's warning form → existing tests/ac-matrix/
  suite (tagged)
- **AC-20260815-03-9**: WHEN `--has-drift-script` is passed and the spec contains a malformed
  bullet THE SYSTEM SHALL still count it in `uncovered` (literal: one malformed bullet + one
  well-formed AC, drift mode → manifest row `observed:"uncovered=1 oracle=0"`; today drift
  mode structurally records `uncovered=0`) → new red-first case in
  tests/ac-matrix/ac-matrix.test.js (refuter catch: D1's "both modes" claim previously had no
  carrier — the least-invasive implementation would have passed every other AC while leaving
  the drift-mode hole open)

## Assumptions (escalation triggers)

- A1: verdict.js is the only parser of the two observed grammars, and it parses only
  `gate`/`skip-reconcile` rows (read against source at plan time) — **if false** (another
  consumer surfaces): grammars are unchanged anyway; nothing moves.
- A2: the plan-time hand sweep (grep tests/ for `ac-matrix`, `uncovered=`, `sanctioned=` —
  spec 02's at-risk class applied by hand, since its leg is unbuilt) found exactly ONE
  colliding pin: the `uncovered=0`-with-malformed assertion in
  `tests/ac-matrix/ac-matrix.test.js`, now a File Plan retarget row; the drift-mode tests
  carry no malformed bullets and verdict.js never parses the ac-matrix observed string —
  **if a further pin reddens at build**: it joins the File Plan in-flight, recorded as a
  deviation.
- A3: AC-ID grammar (`AC_ID_RE` in ac-matrix.js) is the single authority and
  `tests/ac-id-lint` lifts it from source — **if false**: STOP, the grammar has forked;
  consult before widening.
- A4: intake pin tests' synthetic trees already model the exact literals in AC-1/AC-2
  (written red-first at intake, 2026-08-15, both observed failing for the stated reason) —
  **if false**: the pin drifted; extend the pin, never weaken.

## Rationale

Both defects are fail-open accounting in a script whose entire purpose is fail-closed
accounting; the fixes move counts, not shapes. D1's "both drift modes" fell out of the
holistic check: a driftScript can't parse a malformed bullet either, so exempting drift-mode
hosts would re-open the hole exactly where the plugin can't see it. D2's resolution order
preserves every green behavior byte-for-byte (same-spec declarations short-circuit before
any new I/O) and the D5 exclusions keep the lookup exact — fuzzy matching or multi-match
tolerance would convert a ledger of sanctions into a guess. The Behavior-pinned edge
(current-spec re-declaration without `[env:]` beats an owning-spec declaration) was decided
conservative-side: a re-declared AC line is closer to the reviewed change, and honoring the
farther file would let a stale local bullet silently launder a skip. The adversarial check
(1 refuter, execution-grounded) found five defects, all fixed in place: the resolution
algorithm's general wording contradicted this very edge (tightened to hit-is-final);
D1's drift-mode claim had no carrier (AC-9 added); the owner-naming warning had no asserting
test (pin extended); the Canonical Delta cited a paragraph that doesn't exist (re-anchored);
the retargeted test's title would have asserted the retired behavior (rename mandated).
Rejected at plan time:
extending the lookup to `[oracle:]` (no observed case; D5 reopen), and a shared
"spec-resolver" lib (one call site today — extraction earns its keep at the second consumer,
per this repo's duplication calibration).

**Review dispositions (2026-08-16, run `wf_041e15f4-0f1`).** One hard defect was found and
**fixed** before close, by a Fable retainer consult the single-reviewer panel had missed:
`owningSpecCache` keyed by `date/ordinal` but stored a per-AC-ID *resolution*, so two skipped
ACs sharing one owning spec poisoned each other — reproduced in both directions (gated AC
first → the ungated AC silently sanctioned, `skipped=2 sanctioned=2` exit 0, violating D2's
fail-closed contract and AC-20260815-03-5's SHALL; ungated first → the correctly gated AC
drew a hard `unsanctioned-skip` whose detail falsely denied its declaration, reopening this
leg's founding cry-wolf incident). D2's text said "owning-spec **reads** are cached per file";
the implementation cached the resolution. Fixed by caching the owning spec's parsed bullets
and resolving the AC-ID per call, with a two-ACs-one-owner regression case in both skip orders
extending AC-20260815-03-2/-5 to the fixture shape every prior fixture missed (each gave its
AC a distinct owning spec, which is why the suite was blind).

Three findings **waived**:
- `.claude/suite-baseline.json` out-of-plan (mechanical, scope-reconcile). Demanded by the
  owning contract — specs/20260814/03 Contracts, `fixedNotRemoved>0 → WARN: --update remedy;
  the update rides the batch` — since this spec turns both pins green; recorded in the
  deviations sidecar, and the two row swaps are that contract's sort normalization (its D2).
- At-risk leg red on three `JJ-20260816-02` tests (mechanical). All three present verbatim in
  `.claude/suite-baseline.json`, committed as red intake carriers at this spec's own
  `diff_base`; `newFailing=0` corroborates. Sanctioned per § Test Rules' red-pin baseline.
- Fourth literal AC-ID grammar copy (`AC_ID_PARTS_RE`) unreached by the lift-and-execute pin
  (soft, advisory). A3's STOP-and-consult on grammar forking is the live guard, and the
  reviewer's "silently breaking" consequence was refuted on execution — a PARTS_RE miss
  returns an `error` the caller converts to a hard `unsanctioned-skip`, i.e. it fails loud.
  **Reopen condition:** compose it from `AC_ID_RE.source` the next time this file is opened
  for other reasons.

## Canonical Delta

`docs/canonical/review.md` — the leg-classification paragraph (the file's only `ac-matrix`
mention today, inside the verdict.js blocking-vs-dispositionable sentence; there is no
standalone ac-matrix paragraph — anchor refuter-verified) gains two sentences after it:
unparseable AC bullets count as uncovered (fail-closed denominator, both drift modes); skip
sanctions resolve on the spec under review's bullet when present, else from the AC's owning
spec derived from the AC-ID, failing closed at every edge.
