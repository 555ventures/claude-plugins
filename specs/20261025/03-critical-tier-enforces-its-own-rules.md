---
date: 2026-10-25
status: hardened
open_markers: 0
tier: standard
area: cross-cutting
breaking: false
depends_on: []
brief: n/a
---

# Critical tier enforces its own rules

## Goal

Core doctrine already says two things about a `tier: critical` spec that no gate checks: every
AC carries a literal example, and a skipped test is not a pass. A host ran a critical spec whose
definition of done rested on `[env:]`-gated end-to-end tests; the skip gate sanctioned the skip
on the tag alone, the review returned CLEAN, and the tests exposed a wrong assumption only after
merge. This spec makes the two rules mechanical where they already live: `ac-matrix.js`'s
skip-reconcile leg treats a critical spec's own env-gated skip as a hard finding, and its `--lint`
refuses to lock a critical AC with no backticked literal. Standard tier is byte-unchanged. Done
means both refusals are observed from the script and the doctrine sentences name them.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | In skip-reconcile, when the spec under review carries `tier: critical` and a skipped test maps (current-spec branch) to one of this spec's own ACs that declares `[env: VAR]`, the leg emits a hard finding of the new class `critical-env-skip` instead of the sanctioned warning — `sanctioned` is not incremented, `critical-env-skip` joins `SKIP_FINDING_CLASSES`, and the detail names the AC, the variable and the remedy `provision VAR and re-run the review legs — a critical spec's own gated test must execute`. (AC-20261025-03-1, AC-20261025-03-2) | § Runtime Verification says no verdict rests on static legs alone; a critical spec whose own runtime evidence never ran has none. Rejected: BLOCKED as a new verdict word — a red findings leg already derives `HARD_FINDINGS` and needs no second verdict path. |
| D2 | The owning-spec branch (a skip mapped to a foreign spec's `[env:]` AC) keeps the sanctioned warning on every tier, and standard or untiered specs keep today's behaviour on both branches byte-for-byte. (AC-20261025-03-3, AC-20261025-03-4) | A critical spec here would otherwise block on every `CHROME_BIN`-gated pin another spec owns; only this spec's own definition of done is at stake. |
| D3 | `--lint` gains the hard arm `missing-literal`: for a spec whose frontmatter `tier` is `critical` and whose `specs/<YYYYMMDD>/` date is on or after `CRITICAL_LINT_APPLIES_FROM` (`'20261025'`, exported from `lib/spec-sections.js` beside the two existing cutoffs), every well-formed AC bullet whose text — after removing the declaration-slot tag run, the trailing bare-tag run and the `→` disposition tail — contains no backtick span is refused, detail `<id>: critical-tier AC carries no literal example — add one backticked input → output pair`. `observed.lint` gains `missingLiteral: N` only when the arm applies; otherwise the key set is unchanged. (AC-20261025-03-5, AC-20261025-03-6) | The template's "critical-tier ACs always carry at least one literal example" has had no check since it was written; backticks are the shape the template prescribes, and a slot tag's own backticks must not count as one. |
| D4 | Tier is read in both modes by `fmValue(specText, 'tier')` from `lib/frontmatter.js`; a missing or unparseable value is `standard`. No new flag on `ac-matrix.js`; `review-legs.js` and the review driver are untouched. (AC-20261025-03-3, AC-20261025-03-6) | The spec file is already in hand; threading `--tier` through `review-legs.js` would touch a critical-tier surface for no gain. |
| D5 | `core.md` § Runtime Verification's skip sentence reads `a skipped mapped test is a hard finding unless the AC declares its environment gate — and on \`tier: critical\` the spec's own gated test must still execute, so its skip stays hard`; § Tiers reads `literal examples on every AC (refused at lock by \`ac-matrix --lint\`)`; the template's AC comment gains one sentence for each rule after the existing `[env:]` sentence. (AC-20261025-03-7) | One binding home per rule (§ Doctrine Authoring); the sentences point at the script rather than restating it. |
| D6 | `red-check.js`'s build-time env sanction is unchanged on every tier. [no-ac: no behaviour change — the build cannot execute a gated test either; the review leg is where the critical spec's own test must run] | A build refusal would stop a critical spec before any review evidence exists and give the orchestrator nothing to provision against. |
| D7 | The plugin manifest is bumped via `node scripts/plugin-bump.js --bump --plugin spec --changelog "…"`. (AC-20261025-03-8) | Behaviour change under `spec/`. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/ac-matrix.js | MODIFY | scripts | critical-env-skip in skip-reconcile (D1, D2), missing-literal lint arm (D3), tier read (D4), header `Exit codes`/classes updated |
| spec/scripts/lib/spec-sections.js | MODIFY | scripts | export `CRITICAL_LINT_APPLIES_FROM = '20261025'` (D3) |
| spec/doctrine/core.md | MODIFY | doctrine | § Runtime Verification and § Tiers sentences (D5) |
| spec/templates/spec.md | MODIFY | doctrine | AC comment: two sentences (D5) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | `node scripts/plugin-bump.js --bump --plugin spec --changelog "…"` (D7) |
| tests/ac-matrix/critical-tier.test.js | CREATE | tests | AC-20261025-03-1, AC-20261025-03-2, AC-20261025-03-4, AC-20261025-03-5, AC-20261025-03-6 |
| tests/ac-matrix/ac-matrix.test.js | MODIFY | tests | AC-20261025-03-3 (ID appended to the reused 4a title) |
| tests/consistency/critical-tier-doctrine.test.js | CREATE | tests | AC-20261025-03-7 |

## Contracts

`ac-matrix.js` after this spec:

```
skip-reconcile finding classes (hard): unsanctioned-skip | unmapped-skip | critical-env-skip
  critical-env-skip detail:
    "<AC-ID>: skipped test gated by [env: <VAR>] on a tier: critical spec — <skip line> — provision <VAR> and re-run the review legs — a critical spec's own gated test must execute"
--lint finding classes (hard): malformed-ac | invalid-pre-green | mixed-pin | missing-disposition | unresolved-disposition | missing-literal
  missing-literal detail:
    "<AC-ID>: critical-tier AC carries no literal example — add one backticked input → output pair"
--json observed.lint keys:
  always:                      malformed, invalidPreGreen, mixed
  spec dated ≥ 20260911:       + missingDisposition, unresolvedDisposition
  tier critical ∧ dated ≥ 20261025: + missingLiteral
manifest row skip-reconcile observed: {skipped, sanctioned}   (unchanged shape; a critical-env-skip is counted in skipped, never in sanctioned)
```

`lib/spec-sections.js` exports gain `CRITICAL_LINT_APPLIES_FROM` (`'20261025'`).

Literal detection (D3), applied to a bullet's `raw`:

```
text = raw
  minus the declaration-slot run (slotRun(firstLine))
  minus the trailing bare-tag run (trailingRun(raw))
  minus the disposition tail from its `→` (parseDisposition's match)
hasLiteral = /`[^`\n]+`/.test(text)
```

## Behavior

- **Review on a critical spec.** Skipped test → maps to this spec's AC with `[env: E2E_BASE_URL]` → `critical-env-skip` (hard) → skip-reconcile exit 1 → `verdict.js` derives `HARD_FINDINGS` with the leg's finding in the undispositioned pool and `testsSkipped {total:1, sanctioned:0, unsanctioned:1}`. The disposer may still waive it with a stated reason; that is a recorded decision, never a tag-sanctioned silence.
- **Review on a standard spec.** Identical to today: warning `sanctioned by [env: …]`, `sanctioned` incremented, exit 0.
- **Lock on a critical spec.** `--lint` prints one `HARD  missing-literal` line per literal-free bullet; the plan session adds the example and re-runs. A bullet whose only backticks wrap its `[env: X]` slot tag is still refused. Pin bullets (`SHALL CONTINUE TO`) are not exempt — a literal pins what must keep holding.
- **Existing specs.** The 77 critical specs dated before 2026-10-25 are outside the arm; no done spec re-lints. Tmpdir fixtures without a `specs/<date>/` segment keep today's `observed.lint` key set exactly.

## Acceptance Criteria

- **AC-20261025-03-1**: WHEN `ac-matrix.js --spec <critical spec> --root <dir> --manifest <m> --skips <f> --json` runs with a spec whose frontmatter has `tier: critical`, one AC `AC-20261025-09-4 [env: E2E_BASE_URL]` mapped to `tests/e2e.test.js`, and a skips file holding `skipped e2e for AC-20261025-09-4` THE SYSTEM SHALL exit 1 with one finding `{severity:"hard", class:"critical-env-skip", ac:"AC-20261025-09-4"}` whose detail contains `E2E_BASE_URL` and `provision`, zero `unsanctioned-skip` findings, zero warnings matching `sanctioned by`, and `observed.skipReconcile` exactly `{skipped:1, sanctioned:0}` → writes tests/ac-matrix/critical-tier.test.js
- **AC-20261025-03-2**: WHEN the manifest AC-20261025-03-1's run appended to (plus a green `gate` row) is fed to `verdict.js --manifest <m> --ledger` THE SYSTEM SHALL print a ledger row with `verdict` `HARD_FINDINGS` and `testsSkipped` exactly `{total:1, sanctioned:0, unsanctioned:1}` → writes tests/ac-matrix/critical-tier.test.js
- **AC-20261025-03-3**: WHEN the same fixture as AC-20261025-03-1 is run with a spec whose frontmatter has `tier: standard` or no `tier` line THE SYSTEM SHALL CONTINUE TO exit 0 with a warning containing `sanctioned by [env: TEST_DB]`, zero findings, and `observed.skipReconcile` exactly `{skipped:1, sanctioned:1}` → reuses tests/ac-matrix/ac-matrix.test.js :: AC-20260814-01-4a
- **AC-20261025-03-4**: WHEN a `tier: critical` spec under review has no AC for `AC-20260814-01-4` and the skipped line `skipped test for AC-20260814-01-4` resolves through the owning spec `specs/20260814/01-*.md` whose bullet declares `[env: TEST_DB]` THE SYSTEM SHALL CONTINUE TO exit 0 with a warning containing `sanctioned by [env: TEST_DB] (declared in` and `observed.skipReconcile` exactly `{skipped:1, sanctioned:1}` → writes tests/ac-matrix/critical-tier.test.js
- **AC-20261025-03-5**: WHEN `ac-matrix.js --spec specs/20261025/09-x.md --lint --json` runs on a `tier: critical` spec with bullets `- **AC-20261025-09-1**: WHEN x THE SYSTEM SHALL y → writes tests/a.test.js` and ``- **AC-20261025-09-2** `[env: FOO]`: WHEN x THE SYSTEM SHALL y → writes tests/a.test.js`` and ``- **AC-20261025-09-3**: WHEN `a` THE SYSTEM SHALL emit `b` → writes tests/a.test.js`` THE SYSTEM SHALL exit 1 with exactly two findings of class `missing-literal` (acs `AC-20261025-09-1` and `AC-20261025-09-2`), each detail containing `literal example`, and `observed.lint.missingLiteral` exactly `2` → writes tests/ac-matrix/critical-tier.test.js
- **AC-20261025-03-6**: WHEN the literal-free bullet of AC-20261025-03-5 is linted (a) in a `tier: standard` spec at `specs/20261025/09-x.md`, (b) in a `tier: critical` spec at `specs/20261024/09-x.md`, and (c) in a `tier: critical` spec at `<tmpdir>/spec.md` with no `specs/<date>/` segment THE SYSTEM SHALL exit 0 with zero findings in all three, `Object.keys(observed.lint)` exactly `["malformed","invalidPreGreen","mixed","missingDisposition","unresolvedDisposition"]` in (a) and (b) and exactly `["malformed","invalidPreGreen","mixed"]` in (c) → writes tests/ac-matrix/critical-tier.test.js
- **AC-20261025-03-7**: WHEN `spec/doctrine/core.md` and `spec/templates/spec.md` are read THE SYSTEM SHALL find in core's `## Runtime Verification` section the literal `the spec's own gated test must still execute`, in core's `## Tiers` section the literal `refused at lock by \`ac-matrix --lint\``, and in the template's Acceptance Criteria comment both `critical` and `missing-literal` → writes tests/consistency/critical-tier-doctrine.test.js
- **AC-20261025-03-8** `[oracle: gate]`: WHEN the gate runs THE SYSTEM SHALL pass `node scripts/plugin-bump.js --check` with the `spec` manifest bumped → reuses tests/spec-paths.test.js :: AC-20260901-07-15

## Assumptions (escalation triggers)

- A1: `fmValue(text, 'tier')` from `lib/frontmatter.js` accepts full document text (header: "widened to accept EITHER full document text … or a pre-extracted raw block") — **if false:** pass `fmBlock(specText)` first; never a local regex.
- A2: A red `skip-reconcile` row with no disposition derives `HARD_FINDINGS` in `verdict.js` (read at plan: `undispositioned > 0 → 'HARD_FINDINGS'`, `REVIEW_BLOCKING` excludes it) — **if false:** AC-2's verdict word is corrected to what the derivation prints; the derivation itself is never edited here (critical surface).
- A3: No test pins the exact sentence `unless the AC declares its environment gate` or `literal examples on every AC` in `core.md` (plan-time grep over `tests/`: zero hits) — **if false:** that test enters the File Plan as a MODIFY row, updated in place.
- A4: Executed at plan, in-repo (not a spike — no third party adjudicates): `ac-matrix --lint --json` on a `tier: critical` tmpdir spec dated `20261025` with one literal-free bullet exits 0 with five lint keys and zero findings — the pre-image AC-5 must turn red against. `spikes: 0`.

## Rationale

The reporter's suggestion was a new verdict word, BLOCKED, when an env-gated test cited by the
spec's definition of done did not run. Two things shrink that. First, "cited by Done" cannot be
read mechanically — the template has no Done field tied to ACs, and the Goal is prose — while
tier can, and the reporter's spec was critical. Second, a red findings leg already derives
`HARD_FINDINGS`, so the gate only has to stop calling the skip sanctioned; the verdict follows.

The hardening applies only to the spec's own ACs (D2). This repo has `CHROME_BIN`-gated pins
owned by done specs; a critical spec reviewed here would otherwise block on every one of them,
which is noise, not evidence. A critical spec's definition of done is its own ACs.

The literal lint enforces a sentence that has sat in the template since the terminal-observable
spec with no check behind it. Backtick spans are the shape the template itself prescribes for
examples, and the detection strips the slot and trailing tag runs first because `[env: X]` is
conventionally backticked in the slot. The arm is dated so none of the 77 existing critical specs
re-lints; this spec is standard tier and so carries literals by habit, not by refusal.

Rejected for now, with its reopen condition: a per-AC spike declaration on critical tier (every
AC tags the Assumption that records its executed check, or declares none applies). It is the only
shape that would have caught the reporter's two wrong assumptions — a route guard the framework
does not give, a markup string the renderer cannot emit — but the fleet ledger has zero rows of
that class and Incident Policy earns a standing rule at three. Reopen when
`fleet-reader --json`'s `escapes.byClass` shows a class for an unspiked third-party assertion at
3 or more. The user chose this cut on 2026-10-25.

Also out of scope, recorded for the reply to the reporter: the session-pointer file is ignored
by `/spec:init` since 2026-09-01 (`/spec:doctor --fix` repairs an older host); the ready check is
arbitrary shell and `testEnv` already runs as a hard precondition, so a config-blind health route
is host grounding, not a plugin gap.

## Canonical Delta

`docs/canonical/review.md`, the skip-reconcile paragraph: after the sentence describing the
current-spec branch as final with or without `[env:]`, add: on a `tier: critical` spec the
current-spec `[env:]` sanction is withdrawn — the skip is a hard `critical-env-skip` finding and
is never counted as sanctioned; the owning-spec branch is unchanged on every tier.

`docs/canonical/build-integrity.md`, the AC-grammar paragraph: `ac-matrix --lint` refuses a
critical-tier AC dated on or after 2026-10-25 that carries no backticked literal
(`missing-literal`); `observed.lint` carries `missingLiteral` only when that arm applies.
