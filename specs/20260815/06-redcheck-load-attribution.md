---
date: 2026-08-15
status: hardened
open_markers: 0
risk: T3                 # rewrites wf-build.body.js through the codegen seam (named T3 trigger) — a defect here corrupts the TDD red-first evidence floor for every host
area: build-integrity
design: false
depends_on: ["specs/20260815/05-env-preflight.md"]
depended_on_by: ["specs/20260815/07-release-migrations-leg.md"]
breaking: false
brief: n/a
---

# Red-check load attribution: a file that never ran proves nothing

## Goal

wf-build's TDD red-check validates a new test by "fails before, passes after" — but a test
file whose import crashes at load time is "failing" while executing zero assertions, and a
spec's first act is overwhelmingly a new export, so the vacuous case is the *common* case.
Measured consequence (hearwell, INTAKE JJ-20260815-07): deleting the six words implementing a
spec's headline guarantee left 9/9 tests green through a two-reviewer CLEAN panel. Done means:
a red observation is **attributed** — "an assertion ran and failed" satisfies a red
expectation, "the file crashed before running anything" fails closed as unverified exactly
like every other uncertain path in `crossCheckSentinels()` — and the probe has a sanctioned,
tree-clean route (inert stubs) to *demonstrate* that a load-blocked carrier's assertions are
real. Compile-time-only carriers (the 20260813/10 deadlock class) stay classifiable red.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | The `RED.sentinels` schema in `spec/workflows/src/wf-build.body.js` gains one required field: `assertionsRun` (integer ≥ 0) — the count of assertions that actually executed in that file's probe run; 0 when the file failed to load/collect. The schema's `required` list gains it, so an agent omitting it fails schema validation and re-emits. | "Did any assertion in this file actually run" is answerable on every runner by the agent that just ran the file; parsing vitest/jest/go-test output formats was rejected as runner-specific. |
| D2 | `crossCheckSentinels()` attribution rule: a **runtime-red** observation satisfies `expect: 'red'` only when `assertionsRun ≥ 1`; runtime-red with `assertionsRun` 0, absent, or non-numeric against a red expectation fails CLOSED as `observed: 'not-collected'` with a detail naming the load-shaped red and the stub re-probe remedy. Legs compose by **OR** (stated explicitly — refuter finding): an attributed non-resolution typecheck red independently satisfies a red expectation even when the same sentinel's runtime leg is unattributed red (`AUDIT_RED` + `assertionsRun: 0`) — the typecheck leg's proof does not require the runtime leg's. Scope guard: the requirement applies only where it would *satisfy* a red expectation — a **green-expected** file observed runtime-red stays a `'red'`/`leg: 'runtime'` mismatch whatever its `assertionsRun` (a broken pin is broken either way), and green observations never consult the field. | The pinned contract (tests/redcheck-load-failure-attribution.test.js, all three cases) plus the narrowest possible blast radius: only the vacuous-satisfaction path changes. |
| D3 | Typecheck-leg hardening (the typed-host escape route): a `typecheckRed` whose `typecheckEvidence` is **resolution-shaped** — matches the closed marker set `/cannot find module|cannot resolve|module_not_found|modulenotfounderror|TS2307|TS2305|has no exported member/i` — does NOT satisfy `expect: 'red'`; it fails CLOSED as `not-collected` with a detail naming the stub re-probe. Non-resolution typecheck diagnostics (type-assertion failures, `expectTypeOf` errors) keep satisfying red exactly as today — the 20260813/10 deadlock class survives. | Without this, a typed host's missing-module import reds the typecheck leg with attribution and the vacuous class walks straight back in through the other door; the marker set inspects evidence text the cross-check already requires verbatim, so it is not new runner-output parsing. Fails closed, never open: a false marker hit costs a consult, not an escape. **Amended 2026-08-16 via A3's first-observed-miss route (one edit + one pin), NOT a re-plan:** the set gains `TS2305`/`has no exported member`. Measured at prax spec 20260815/07's build — 4 of its 6 red-expected carriers were load-blocked, and only 2 were TS2307; the other 2 imported a not-yet-written NAMED EXPORT from an existing module (`TRUSTED_PROXY_RANGES` from `#/lib/auth`, `truncateForLog` from `#/lib/logger`). That case is exactly as vacuous — under ESM the import throws `SyntaxError: The requested module does not provide an export named …` at LOAD, before any assertion runs — yet TS2305 is not resolution-shaped under the original set, so D2's OR-composition would have let the typecheck leg satisfy red alone and walked the vacuous class back in through the door D3 exists to close. A spec's first act is more often adding an export to an existing module than adding a module, so this is the commoner half of the class, not an edge. |
| D4 | Probe protocol (the demonstration route), in the RED dispatch prompt + build.md: for a red-expected file whose probe run fails to **load** on a specifier the spec's own File Plan CREATEs, the probe agent writes an inert stub at that File-Plan path (minimal module, inert placeholder exports), re-runs the file's probe leg(s), reports the **post-stub** sentinel + `assertionsRun`, then deletes the stub(s) and verifies **no stub path survives** — the residue check is scoped to the stub paths the agent created, NEVER whole-tree `git status` emptiness (refuter finding, adopted: the just-authored test files of this same build are legitimately untracked at probe time, so a literal empty-tree demand would spuriously fail every real invocation). Post-stub red with `assertionsRun ≥ 1` = demonstrated red (passes D2). Post-stub green, still-load-red, or a specifier no CREATE row names → report `assertionsRun: 0` honestly → fails closed → `tdd-red-check` handling. **The prompt's closing instruction changes with it** (refuter finding, both refuters, adopted): the current blanket "Do not edit any file." directly forbids this protocol; it is replaced by a scoped form — "Do not edit any file, with exactly one exception: the stub protocol above (create the named stub paths, delete them before returning)." — so the prompt is never self-contradictory. | The stub is what converts "plausibly red" into "demonstrated red": a vacuous carrier goes green under a stub, a real one stays red — exit-code deterministic, and the cross-check needs no new machinery because the agent reports the post-stub observation through the existing contract. |
| D5 | The sanction that currently blesses the vacuous class is **replaced in place, in all THREE loci** (refuter finding — the original "both loci" undercounted the most dangerous one): (i) the `RED.sentinels` schema comment in wf-build.body.js (~line 231); (ii) **the live RED dispatch prompt string itself** (~line 454) — the agent-facing instruction that literally tells the probe this class "can never be runtime-red"; (iii) build.md's `tdd-red-check` row. Each drops "a test importing a module the implementation has not created yet" from the compile-time-only-carrier example list (that file is not erased at runtime — it *crashes* at runtime; listing it there was the misclassification) and routes load-shaped red to D4's stub protocol. build.md's fast-path step 1 carries no copy of the example list today — there the change is purely **additive**: the orchestrator runs the probe itself, so it gains the same stub/re-run/clean discipline by hand. | This is the TRADOYO-20260813-01 conflict named at intake: the example was the incident class; replacing it is the fix — annotating around it would leave live doctrine sanctioning the hole, and leaving the prompt copy (the one the probe agent actually reads at runtime) would leave the hole fully open whatever the pure function refuses. |
| D6 | Colliding pins updated in place, retagged, never weakened (the sanctioned mid-build collision path): in tests/redcheck-sentinel-dual-leg.test.js, (i) the deadlock test's `TYPE_DIAG` — today literally `TS2307: Cannot find module` — becomes a genuine type-assertion diagnostic (e.g. `error TS2344: Type 'string' does not satisfy the constraint …`) so the deadlock pin keeps pinning the deadlock fix without embodying the newly-refused class; (ii) the "ordinary runtime-red carrier" case gains `assertionsRun: 1`; (iii) the header comment's example list drops the missing-module item mirroring D5; (iv) the schema-required pin extends to `assertionsRun`. | The dual-leg suite is the load-bearing pin surface for this exact function; every change here is a retag that preserves each test's original invariant with a truthful example. |
| D7 | Scaffold-ledger: **extend** the existing "Red-check sentinel cross-check" row (~line 85 — the row whose retire condition reads "Retire never — it is the TDD red-first evidence floor"; refuter finding: the draft cited the neighboring classification row, whose retire condition is unrelated re-tune language). Attribution (`assertionsRun`), the D3 resolution-marker refusal, and the stub protocol join that row's mechanism description; JJ-20260815-07 joins its evidence — never a new row. | The mechanism being hardened IS the sentinel cross-check; a second row would fork its promote/retire condition, and citing the wrong neighbor would leave the Behavior section's quoted retire text unmatched to the edited row. |
| D9 | The `tdd-red-check` row's pre-existing "strictly redder than red" exception is **disambiguated in the same edit** (refuter finding, adopted — without this, that clause silently re-swallows D2's fail-closed result): the exception is explicitly scoped to **collection-level absence** — the runner collected zero files because the collecting home (workspace package, config registration, harness) the spec itself creates does not exist yet (HEARWELL-20260804-02's class) — and explicitly does NOT cover a file the runner collected and attempted whose **load** failed: load-shaped `not-collected` always takes D4's stub route or the `tdd-red-check` consult, never "proceed on the spec's authority". The clause's pinned literals ("strictly redder than red", "the spec itself creates" — tests/redcheck-new-package.test.js) survive verbatim; the scoping sentence is added around them. | The two clauses share the `not-collected` word and near-identical "spec creates it" language; without an explicit boundary, the pre-existing pass-through converts the new fail-closed result back into a pass — precisely the vacuous class this spec closes. |
| D8 | Version bump target `6.80.0` (target, not pin — next-free rule on race). | Version-bump discipline. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/workflows/src/wf-build.body.js | MODIFY | workflows | D1 schema field + required; D2/D3 crossCheckSentinels attribution (OR-composition); D4 stub protocol in the RED dispatch prompt INCLUDING the scoped replacement of the closing "Do not edit any file." sentence; D5 replacement in BOTH in-file loci — schema comment (~231) and prompt string (~454). Orchestrator duty (not a row): `npm run build:workflows` regenerates wf-*.js, committed together |
| spec/commands/build.md | MODIFY | doctrine | D5: fast-path step 1 additive load-red stub discipline + `tdd-red-check` row example-list replacement; D9: scope the "strictly redder than red" exception to collection-level absence, keeping its pinned literals verbatim |
| tests/redcheck-load-failure-attribution.test.js | MODIFY | tests | Tag the three existing carrier tests AC-20260815-06-1/2/3; add new asserts — D3 resolution-shaped typecheck evidence fails closed (AC-20260815-06-7), D4 prompt source pins (AC-20260815-06-8), D5 doctrine pins (AC-20260815-06-9), D3's amended missing-export marker fails closed (AC-20260815-06-10) |
| tests/redcheck-sentinel-dual-leg.test.js | MODIFY | tests | D6 retags: TYPE_DIAG swap (AC-20260815-06-4), assertionsRun on the ordinary-red case (AC-20260815-06-5 tag), header-comment example fix, schema pin extension (AC-20260815-06-6) |
| spec/doctrine/scaffold-ledger.md | MODIFY | doctrine | D7: extend the red-check row in place |
| spec/doctrine/claims-baseline.json | MODIFY | other | Re-baseline for build.md/scaffold-ledger line-count changes |
| spec/.claude-plugin/plugin.json | MODIFY | other | D8 bump + description changelog line |
| .claude/suite-baseline.json | MODIFY | other | Regenerate — the three carrier pins leave the sanctioned-red set |
| spec/INTAKE.md | MODIFY | doctrine | Row JJ-20260815-07: `Fixed in` = landed version, `Fix` = mechanism(spec/workflows/src/wf-build.body.js), same commit |

## Contracts

```jsonc
// RED.sentinels item — one new required field (D1); existing fields unchanged
{
  "path": "src/lib/price-feed.test.ts",
  "sentinel": "AUDIT_RED:src/lib/price-feed.test.ts",   // runtime leg, verbatim
  "typecheckRed": false,
  "typecheckEvidence": "",
  "assertionsRun": 3        // NEW, required: assertions that actually EXECUTED in the probe
                            // run this sentinel reports (post-stub run when D4 stubbed);
                            // 0 = the file loaded nothing / crashed before asserting
}
```

`crossCheckSentinels(expectations, sentinels, hasTypecheckLeg)` — decision table for
`expect: 'red'` (green expectations and green observations are unchanged):

| runtime | assertionsRun | typecheck | result |
|---------|--------------|-----------|--------|
| AUDIT_RED | ≥ 1 | any | red satisfied (today's match, now demonstrated) |
| AUDIT_RED | 0 / absent / non-numeric | not attributed-red | `not-collected` fail-closed (load-shaped; detail names stub re-probe) |
| AUDIT_GREEN | any | attributed, non-resolution evidence | red satisfied (deadlock class, unchanged) |
| AUDIT_GREEN | any | attributed, resolution-shaped evidence (D3 markers) | `not-collected` fail-closed (detail names stub re-probe) |
| AUDIT_GREEN | any | clean / no leg | `green` mismatch (unchanged) |

## Behavior

- **Probe flow with a load-blocked carrier (D4):** probe runs file → load failure on
  `@/lib/price-feed` → File Plan has `CREATE src/lib/price-feed.ts` → agent writes inert stub
  there → re-runs probe leg(s) → assertions now execute and fail → reports
  `AUDIT_RED`, `assertionsRun: 4` → deletes stub → verifies the stub paths are gone (scoped
  residue check — the build's own untracked test files are legitimately present) → cross-check
  passes. Had the assertions passed under the stub, the honest report is `AUDIT_GREEN` post-stub
  → red-expected mismatch → `tdd-red-check` consult names the vacuous carrier.
- **Fast path (D5):** the orchestrator runs the probe itself, so it applies the same
  stub/re-run/clean discipline manually; build.md's fast-path step 1 states it.
- **Ledger row (D7 extension):** evidence gains "hearwell 2026-08-14: headline-guarantee
  deletion survived 9/9 green through a CLEAN panel — load-failure red accepted as satisfied
  red"; mechanism gains "runtime red demonstrates via `assertionsRun ≥ 1`; load-blocked
  carriers demonstrate via the inert-stub re-probe; resolution-shaped typecheck evidence never
  satisfies red"; retire condition unchanged ("retire never — TDD red-first evidence floor").
- **Honest limits (recorded, not solved here):** (i) `assertionsRun` is agent-reported, like
  typecheck attribution — the structure forces an active claim where silence fails closed, but
  a fabricating agent defeats it as it defeats every reading; (ii) weak-assertion vacuity (a
  file that runs one trivial assert while the guarantee's real seam is untested) is a
  plan-stage rule (guarantee ACs name their seam), out of scope; (iii) stub quality on
  compiled hosts — a stub that itself fails to compile reports still-load-red → fails closed
  (a consult, never an escape).

## Acceptance Criteria

<!-- AC-IDs namespaced AC-20260815-06-N. The three intake-carrier tests are red today by
     construction; the dual-leg retags are the sanctioned colliding-pin path. -->

- **AC-20260815-06-1**: WHEN a red-expected carrier's sentinel reports runtime red with
  `assertionsRun: 0` THE SYSTEM SHALL yield one mismatch with `observed: 'not-collected'`
  (literal example: `{path: P, expect: 'red'}` × `{sentinel: 'AUDIT_RED:'+P, assertionsRun: 0}`
  → `[{observed: 'not-collected', …}]`) → existing carrier test 1 in
  tests/redcheck-load-failure-attribution.test.js (tag)
- **AC-20260815-06-2**: WHEN the same carrier reports `assertionsRun: 3` THE SYSTEM SHALL
  return `[]` (ordinary TDD red still matches) → existing carrier test 2 (tag)
- **AC-20260815-06-3**: WHEN the sentinel omits `assertionsRun` entirely THE SYSTEM SHALL fail
  closed as `not-collected` (silence is never "assertions ran") → existing carrier test 3 (tag)
- **AC-20260815-06-4**: WHEN a compile-time-only carrier is classified red — runtime green,
  `typecheckRed: true` with a **non-resolution** diagnostic naming the file (literal example:
  `P + "(5,32): error TS2344: Type 'string' does not satisfy the constraint 'Feed'."`) THE
  SYSTEM SHALL CONTINUE TO return `[]` (the 20260813/10 deadlock class stays classifiable) →
  dual-leg deadlock test, TYPE_DIAG retagged per D6 (existing test, updated in place)
- **AC-20260815-06-5**: WHEN a green-expected carrier is observed runtime-red THE SYSTEM SHALL
  CONTINUE TO report a `'red'` mismatch with `leg: 'runtime'` regardless of `assertionsRun`
  (a broken pin never silently becomes "unverified") → dual-leg broken-pin test (tag; stays
  green through the change)
- **AC-20260815-06-6**: WHEN the RED schema's `sentinels.required` list is read THE SYSTEM
  SHALL include `assertionsRun` alongside `typecheckRed`/`typecheckEvidence` → dual-leg schema
  pin extended (red until D1 lands)
- **AC-20260815-06-7**: WHEN a red-expected carrier's only red is `typecheckRed` with
  resolution-shaped evidence **that names the file** (literal example — the evidence string
  MUST be path-prefixed exactly like the dual-leg suite's TYPE_DIAG idiom, or it trips the
  pre-existing evidence-must-name-the-file branch instead of D3, refuter-verified by
  execution: `P + "(5,32): error TS2307: Cannot find module '@/lib/price-feed'."`) THE SYSTEM
  SHALL fail closed as `not-collected` with a detail matching `/stub/i`; AND WHEN the same
  sentinel additionally carries unattributed runtime red (`AUDIT_RED` + `assertionsRun: 0`)
  alongside an attributed **non-resolution** typecheck red THE SYSTEM SHALL return `[]` (the
  D2 OR-composition: the typecheck leg's proof stands alone) → new asserts in
  tests/redcheck-load-failure-attribution.test.js
- **AC-20260815-06-10**: WHEN a red-expected carrier's only red is `typecheckRed` whose
  path-prefixed evidence is a MISSING-EXPORT diagnostic rather than a missing-module one
  (literal, same path-prefixed idiom as AC-7 so it reaches D3 and not the
  evidence-must-name-the-file branch:
  `P + "(3,10): error TS2305: Module '\"#/lib/logger\"' has no exported member 'truncateForLog'."`)
  THE SYSTEM SHALL fail closed as `not-collected` with a detail matching `/stub/i` — the D3
  amendment's pin, so the commoner half of the vacuous class cannot satisfy red through the
  typecheck leg → new assert in tests/redcheck-load-failure-attribution.test.js
- **AC-20260815-06-8**: WHEN the RED dispatch prompt in wf-build.body.js is read THE SYSTEM
  SHALL instruct reporting `assertionsRun` per file AND the stub-re-probe-then-delete protocol
  for load-blocked red-expected files AND SHALL NOT contain the unqualified sentence
  `Do not edit any file.` — the no-edit rule must carry the stub-protocol exception in the
  same sentence (source regex pins: `/assertionsRun/` and `/stub/i` within the RED prompt
  region; `assert.doesNotMatch` on `/Do not edit any file\./` paired with a match on an
  exception form naming stubs) → new asserts in tests/redcheck-load-failure-attribution.test.js
- **AC-20260815-06-9**: WHEN the compile-time-only-carrier example lists are read — in
  build.md AND in wf-build.body.js (schema comment and RED prompt string alike) — THE SYSTEM
  SHALL NOT contain "importing a module the implementation has (not created yet|yet to
  create)" (the retired sanction; red today in all three loci, green after D5) AND build.md's
  fast-path step SHALL name the load-red stub discipline → new doctrine + source pins in
  tests/redcheck-load-failure-attribution.test.js
- **AC-20260815-06-10**: WHEN build.md's `tdd-red-check` row is read THE SYSTEM SHALL scope
  the "strictly redder than red" exception to collection-level absence and SHALL state that a
  load-shaped `not-collected` never proceeds on the spec's authority (regex pin: the pinned
  literals `strictly redder than red` and `the spec itself creates` still present — the
  existing tests/redcheck-new-package.test.js pins stay green — plus a
  `/(load|loaded)[\s\S]{0,300}(never|not)[\s\S]{0,80}(proceed|authority)/i`-shaped pin) → new
  doctrine pin in tests/redcheck-load-failure-attribution.test.js

## Assumptions (escalation triggers)

- A1: Every runner the plugin meets lets the probe agent honestly answer "did ≥ 1 assertion
  execute" from the run it just performed — **if false:** the agent reports 0 → fails closed →
  `tdd-red-check` consult; never a silent green. The bar is ≥ 1, not an exact count, precisely
  so no runner-format parsing is needed.
- A2: An inert stub at the File-Plan CREATE path un-blocks loading on the host's runtime —
  **if false** (compiled host needing typed stubs, deep re-export chains): post-stub run is
  still load-red → agent reports 0 → fails closed; the consult decides. The fallback is a
  consult, never acceptance.
- A3: The D3 marker set covers the resolution-diagnostic vocabulary of the runtimes actually in
  fleet (Node/TS/vitest/jest/python) — **if false** (a runtime with novel wording): that
  host's vacuous class satisfies via typecheck as today; extend the marker set on first
  observed miss (the set is a closed list precisely so extending it is one edit + one pin).
  **Exercised 2026-08-16** — prax spec 20260815/07 was the first observed miss (TS2305
  missing-export); D3 amended, AC-20260815-06-10 is the pin. The route works as designed.
- **Honest limit of D4, stated not fixed (2026-08-16):** the inert-stub demonstration route is
  scoped to specifiers the spec's File Plan **CREATEs**. The TS2305 half of the class imports a
  not-yet-written export from a **MODIFY** target, which no stub path names — so those carriers
  report `assertionsRun: 0`, fail closed, and land in the `tdd-red-check` consult with no
  mechanical route to demonstrated red. That is safe (loud, never an escape) but it was 4 of 6
  files on the measured run, so the common case ends in a consult rather than a demonstration.
  Extending D4 to MODIFY-named exports (append an inert export, re-probe, restore byte-identical)
  is real design work on a locked T3 decision and is deliberately NOT taken here; let field data
  after this spec lands decide whether the consult volume earns it.
- A4: No other test file executes `crossCheckSentinels` with red-satisfying sentinels beyond
  the two named in the File Plan (verified at plan time: repo-wide grep found only
  redcheck-sentinel-dual-leg and redcheck-load-failure-attribution) — **if false:** the
  colliding pin is updated in place and retagged per the established collision rule.
- A5: Version 6.80.0 free at build time — else next free, log deviation.

## Rationale

The red-check exists to prove a pin is falsifiable; a red that executed nothing proves only
that the file crashes. The design splits the fix into an **attribution** (D1/D2/D3 — pure,
pinned, deterministic) and a **demonstration route** (D4 — agent protocol, prompt-pinned),
because the pure function can refuse vacuous evidence but only the probe, which has the tree,
can manufacture genuine evidence for a load-blocked carrier.

D3 exists because the intake carrier alone would fix untyped hosts while leaving every TS host
— including hearwell, the measured incident — vacuously satisfiable through the typecheck leg:
`TS2307` names the importing file, which is exactly the attribution the current check demands.
The marker set inspects evidence strings the contract already requires verbatim; it is a
refusal list for one known-vacuous diagnostic class, not runner-output parsing (the rejected
alternative — counting collected tests from runner stdout — needs a per-runner grammar; this
needs five case-insensitive substrings). It fails closed: the worst false positive is a
consult on a genuinely type-level carrier whose diagnostic mentions resolution, which no
observed carrier does.

Rejected: making `assertionsRun ≥ 1` a universal demand on all red (would re-deadlock
compile-time carriers, which are erased at runtime and legitimately execute zero assertions —
their proof is the typecheck leg). Rejected: a new verdict word for load-red (`not-collected`
is the established fail-closed shape; a new word forks every consumer). Rejected (refuter
finding, adopted as narrowing): validating `assertionsRun ≥ 1` on green observations — a
passing file with zero collected tests is real but is UPWELL-20260718-01's class, already
covered at collection level.

Adversarial round (2 refuters): six findings adopted, each marked in Decisions — the
unqualified "Do not edit any file." prompt sentence that would have forbidden D4's own
protocol (caught independently by both refuters), the THIRD sanction locus in the live RED
prompt string (the agent-facing copy — the most dangerous of the three), the
"strictly redder than red" clause that would have re-swallowed the fail-closed result (now
D9), the wrong scaffold-ledger row citation (D7 now names the sentinel cross-check row), the
AC-7 literal example that demonstrably exercised the wrong branch (now path-prefixed per the
TYPE_DIAG idiom), and the whole-tree-vs-stub-paths residue ambiguity (D4 rescoped). One
finding waived rather than fixed: spec/INTAKE.md's TRADOYO-20260813-01 row restates the
retired phrase in its historical incident description — INTAKE rows are append-only history
by that file's own contract and are never edited retroactively; the phrase there describes
the incident, it does not sanction the class. No finding was rejected.

Collision sweep (lock obligation, `collision-closure --literal TS2307 --literal created`):
`TS2307` lives only in the planned dual-leg test (D6 retags it) and this spec's own carrier
additions; `created` is a low-signal stem — its mention-tier hits were skimmed and none
restates the retired sanction outside the planned loci (wf-build.body.js, build.md, the
dual-leg header, INTAKE.md's append-only history row, and generated wf-build.js which
regenerates). Likely-tier pins (tests/consistency/drift-reconcile.test.js,
tests/claims-lint-baseline-path.test.js) verified not to close over the touched phrases —
waived; the build Phase 4 whole-suite check adjudicates any miss.

Collision sweep re-run for the 2026-08-16 D3 amendment (`--literal TS2305 --literal "has no
exported member"`): both literals are absent from `spec/` and `tests/` entirely, except
INTAKE.md's own append-only history row JJ-20260816-02 — the same disposition TS2307's sweep
reached. Nothing to retag; AC-20260815-06-10 introduces both literals at their only pin site.

Highest-risk item of the three specs: D4 is agent behavior, unit-unpinnable — its pins are
prompt-text regexes plus the fail-closed default. The build should exercise the hearwell shape
against a synthetic host (spec-verify skill) before review; a probe agent that skips the stub
protocol leaves carriers `not-collected`, which blocks loudly rather than passing silently —
the failure mode of an unfollowed prompt is noise, not escape.

## Canonical Delta

docs/canonical/build-integrity.md (create if absent): add a section "Red attribution" — a
runtime red satisfies a red expectation only demonstrated (`assertionsRun ≥ 1`); load-blocked
carriers demonstrate via the inert-stub re-probe (stub at the File-Plan CREATE path, re-run,
report post-stub, delete, tree clean); resolution-shaped typecheck evidence never satisfies
red; compile-time-only carriers satisfy via attributed non-resolution typecheck diagnostics.
