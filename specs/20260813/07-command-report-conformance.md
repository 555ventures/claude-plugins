---
date: 2026-08-13
status: implementing
diff_base: e73193298027348bfe497cf6a3bb17702103ba1d
open_markers: 0
risk: T2
area: doctrine-reports
design: false
breaking: false
depends_on: ["specs/20260813/06-report-renderer.md", "specs/20260813/06a-return-envelope-corrections.md"]
depended_on_by: ["specs/20260813/08-question-contract.md"]
brief: n/a
---

# Command report conformance — every command adopts the rendered skeleton, one test pins all of them

## Goal

Migrate every command's end-of-run report and failure path onto the spec-06 renderer and pin
the whole surface with one consistency test, closing audit Class A (8 of 16 spec commands
end off-contract, findings commands don't stage the fix, failure paths are ungoverned free
prose) and Class D2 (the git plugin is a contract-free zone). Done means: every non-exempt
command file carries a conforming ```report template + the renderer invocation, every STOP
path uses the shared two-line STOP shape, and the new test fails on any future drift.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | Report templates get the fence info-string `report` (```report). A command's report step becomes: slot-assembly instructions (what goes in each slot, command-specific) → renderer invocation line (`node "$(spec-paths report-render)" --slots <file>`, output printed verbatim) → one ```report fenced example showing a filled render. The spec-status-verbatim close is represented in templates by the literal placeholder line `{spec-status --next, verbatim}` (the runtime output is the script's own 🎯 lines — a template never fakes them). Old per-command skeleton-mechanics prose is deleted. | The fence tag makes the surface mechanically findable — the precondition for D2's test; the placeholder form reconciles the `Next:`-close rule with the sole-derivation rule (spec-status's output starts `🎯 Next`, never `Next:` — refuter-verified collision). |
| D2 | New `tests/consistency/report-shape.test.js`: (a) every ```report block across `spec/commands/*.md` + `git/commands/*.md`: first line matches `^(✅\|⚠️\|🚫) \*\*` and last non-empty line matches `^Next:` OR is the literal placeholder `{spec-status --next, verbatim}`; (b) every command file in the migrating set (all spec commands except status.md, plus all three git commands) contains ≥1 ```report block AND the `report-render` invocation; (c) anchors appearing in ```report blocks come from the fixed set (✅⚠️🚫📌📦✨). status.md is exempt (its script renders itself — doctrine-sanctioned). | Exactly one command's report ending is test-pinned today (the root cause line of the whole audit); one test over a tagged surface pins all 18 at once. |
| D3 | Class A fixes land per file with these rulings: non-CLEAN review closes with `Next: /spec:build {specPath} — fix the N hard findings` (sanctioned same-spec literal chain, A1) and the one-line verdict re-prints contiguous with the close after the merge-back sequence (A2); escape.md leads `✅ **escape logged — …**` (A3 ruling: record-completion is an outcome; the closed anchor set wins over a bespoke 📦 lead) and ends `Next:` with the step-6 prevention-delta command else the spec-status placeholder (A3); audit.md's Next is unconditional — enforcer fate → `/spec:enforce`, else the spec-status placeholder (A4); atlas.md gains a terminal ```report with a Next arm (A5); init.md collapses the identifier dump to two plain lines and closes with the spec-status placeholder — NOT `Next: /spec:enforce`, because init's own Phase 8 auto-chains /spec:enforce in the same run (refuter-caught: suggesting a step that is about to run automatically misleads) (A6); release.md's `🧹 next (optional)` becomes an unconditional branched `Next:` (A7); enforce.md prints the resolved `gateCommand` verbatim in its Next (A9); bespoke glyphs retire per spec 06's mapping — review.md's `🔍 smells:` line becomes a 📦 artifacts entry, enforce.md's `🔒 ratchet baseline:` line becomes a plain bullet (the fixed anchor set is closed); the A11 minor list (build.md duplicate Next at :285 folded into the fenced template, genesis chain-below-Next ordering, doctor clean-arm slot, sketch/status/plan endings) lands as one-line fixes each. | Each ruling is the audit's minimal fix corrected by refuter evidence; the sanctioned literal same-spec chains are already doctrine (§ Console Output Style close-the-loop clause). |
| D4 | Every STOP/failure path in the migrating set adopts the shared STOP shape via the renderer (`outcome.anchor: 🚫`, required `next` naming the remedy): review.md/release.md leg-failure STOPs get the two-line template with the failed leg's plain consequence (A8); git merge's dirty-tree STOP stages `/git:commit` (recommended) with `git stash -u` as the alternative inside the same line (A10); enter-worktree ends with a ```report (not "Done.") (A10); commit.md — which today has NO report shape at all (refuter-verified: zero anchor glyphs in git/commands/) — gains a net-new minimal terminal ```report: `✅ **committed — {subject} ({N} files)**` + `Next: nothing needs you — commit landed` (worktree branch case: `Next: /git:merge — land it on {base}`). | Failure paths are where close-the-loop matters most and were systematically ungoverned; commit.md's row is authoring, not tagging — sized accordingly. |
| D5 | Git plugin doctrine wiring (audit D2): each git command file opens its report section with a one-line contract citation ("report contract: spec shared.md § Console Output Style — rendered via `spec-paths report-render`") rather than a new `shared-for` arm. | The three files are small and stable; a full shared-for plumbing arm for one section is additive machinery the citation line buys for free. |
| D6 | review.md/release.md conformance edits preserve verbatim the verdict/qualifier semantics landed by specs 20260813/01–03 (testsSkipped object, CLEAN-with-qualifier word, `[oracle:]` matrix handling): this spec relocates their rendering into slots, it never rewords the semantics. | Three specs landed on these files today; the conformance pass must be shape-only there or it re-opens reviewed behavior. |
| D7 | Scaffold-ledger row for the report-shape test (gate; retire: only with the console contract itself). Version bump target **6.69.0** (orchestrator-refreshed 2026-08-14: the spec's original 6.65.0 target was consumed by concurrent sessions — plugin.json is at 6.68.0 at this build's base commit; per the host pipeline rules' stale-version gotcha the literal is a target, not a pin). | Doctor check 13; repo discipline. |
| D8 | **Build-time ruling (2026-08-14, user-approved).** D3's 🔍→📦 retirement on review.md's smells line breaks a pre-existing regression pin outside this spec's File Plan: `tests/review/smell-lens.test.js` AC-20260812-01-6 asserts the retired 🔍 glyph literally. The pin is **updated in place** to assert the 📦 artifacts entry (`artifacts` slot text `smells: {N} advisory — {M} accepted → docs/audit/advisory-findings.md`) and retagged `AC-20260813-07-7`, keeping its AC-20260812-01-6 provenance comment — the identical treatment the File Plan already sanctioned for the genesis-design pin (AC-20260813-07-5). The lensFailed ⚠️ half of the same pin is unchanged. Scope widens by exactly one test file, recorded here rather than silently. | Never weaken a locked Decision to keep an old test green, and never leave the repo carrying a red pin that contradicts a Decision this spec locked; the pin tracks the contract, it does not outrank it. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/commands/review.md | MODIFY | doctrine | A1 non-CLEAN Next chain, A2 verdict re-print, A8 STOP templates, 🔍→📦 mapping, D1 renderer adoption, D6 semantics-preserving |
| spec/commands/release.md | MODIFY | doctrine | A7 unconditional branched Next, A8 STOP templates, D1, D6 |
| spec/commands/escape.md | MODIFY | doctrine | A3 ✅ lead + terminal Next + plain ✨ line, D1 |
| spec/commands/audit.md | MODIFY | doctrine | A4 unconditional Next, D1 |
| spec/commands/atlas.md | MODIFY | doctrine | A5 terminal ```report + Next arms; step-1-of-5 print cites the same template, D1 |
| spec/commands/init.md | MODIFY | doctrine | A6 inventory collapse + spec-status placeholder close (Phase 8 auto-chain respected), D1 |
| spec/commands/enforce.md | MODIFY | doctrine | A9 resolved gateCommand in Next; 🔒→bullet mapping, D1 |
| spec/commands/build.md | MODIFY | doctrine | A11 duplicate-Next fold, D1 |
| spec/commands/doctor.md | MODIFY | doctrine | A11 clean-arm droppable slot; stale/broken lists → warns/blocks slots, D1 |
| spec/commands/sketch.md | MODIFY | doctrine | A11 bound-surface STOP reroute payload, D1 |
| spec/commands/plan.md | MODIFY | doctrine | A11 T1/T2 rejection endings get a staged ask-me line, D1 |
| spec/commands/design.md | MODIFY | doctrine | D1 renderer adoption (already contract-clean content) |
| spec/commands/genesis-design.md | MODIFY | doctrine | A11 two-command Next split, D1; existing conflict-fixes pin unaffected (startsWith('Next:') survives the fence tag — refuter-verified) |
| spec/commands/genesis-architect.md | MODIFY | doctrine | A11 Chain-below-Next reorder, D1 |
| spec/commands/genesis-explore.md | MODIFY | doctrine | D1 renderer adoption (content clean) |
| git/commands/enter-worktree.md | MODIFY | doctrine | A10 terminal ```report replacing "Done.", D5 citation line |
| git/commands/merge.md | MODIFY | doctrine | A10 dirty-tree STOP staging /git:commit, D5 citation line |
| git/commands/commit.md | MODIFY | doctrine | D4 net-new minimal terminal ```report (authoring, not tagging) + D5 citation line |
| tests/consistency/report-shape.test.js | CREATE | tests | AC-20260813-07-1 … AC-20260813-07-4 |
| tests/consistency/conflict-fixes.test.js | MODIFY | tests | AC-20260813-07-5 (retag the genesis-design ending pin with this AC-ID — regression pin, stays green) |
| tests/review/smell-lens.test.js | MODIFY | tests | AC-20260813-07-7 (D8 build-time ruling: the 🔍-glyph half of AC-20260812-01-6 retargets to the 📦 artifacts entry; lensFailed ⚠️ half unchanged) |
| spec/doctrine/scaffold-ledger.md | MODIFY | doctrine | D7 row |
| spec/doctrine/claims-baseline.json | MODIFY | doctrine | ratchet re-stamp for all doctrine deltas (same commit) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D7 bump + changelog |

## Behavior

- The migration is mechanical per file: find the report step → rewrite as slots + invocation
  + ```report example → apply that file's Class-A content ruling (D3/D4) inside the example
  → delete superseded mechanics prose. Files marked "content clean" change shape only;
  commit.md is the one authoring row.
- File Plan size note: 18 doctrine rows exceeds the ~15 guideline deliberately — the D2 test
  asserts over the *whole* tagged surface, so partial migration cannot land green; the test
  and the last migrated file are one landing unit. Rows are one-template swaps executing the
  same recipe.
- `Next:` derivation rules are untouched: the spec-status placeholder is the only cross-spec
  routing form; sanctioned literal chains stay literal. This spec only guarantees the close
  exists and lands last.
- Chain note: spec 08 later edits 12 of these files (refuter-counted) at question sites —
  disjoint sections from the report/STOP shapes here; AC-4's phrase pins were checked
  against 08's planned rewrites for collision (none).
- This spec's scoped gate includes `tests/consistency/*.test.js` AND
  `tests/claims/claims-lint.test.js` — the live-corpus ratchet test is otherwise outside
  every scoped dir, and 18 doctrine files change line counts here (blind-spot-verified
  safety-net gap; including it makes the re-stamp failure visible in-run, not only at
  review).

## Acceptance Criteria

- **AC-20260813-07-1**: WHEN report-shape.test.js scans all ```report blocks THE SYSTEM
  SHALL find first line matching `^(✅|⚠️|🚫) \*\*` and last non-empty line matching
  `^Next:` or equal to the literal placeholder `{spec-status --next, verbatim}` (literal
  failing example the test must catch: a block ending `🧹 next (optional): /spec:audit`) →
  tests/consistency/report-shape.test.js
- **AC-20260813-07-2**: WHEN the migrating set is scanned THE SYSTEM SHALL find ≥1 ```report
  block AND a `report-render` invocation in every file, with status.md exempt by name →
  tests/consistency/report-shape.test.js
- **AC-20260813-07-3**: WHEN any ```report block uses an anchor outside the fixed set
  (✅⚠️🚫📌📦✨) THE TEST SHALL fail naming file and line (literal: a `🧹`- or `🔍`-anchored
  line fails) → tests/consistency/report-shape.test.js
- **AC-20260813-07-4**: WHEN review.md's non-CLEAN arm and merge.md's dirty-tree STOP are
  read THE SYSTEM SHALL contain `Next: /spec:build` (with the findings-count phrase) and
  `Next: /git:commit` respectively (doctrine pins for the two highest-traffic rulings) →
  tests/consistency/report-shape.test.js
- **AC-20260813-07-5**: WHEN the existing genesis-design ending pin runs THE SYSTEM SHALL
  CONTINUE TO pass (the one pre-existing report pin survives the migration; retagged with
  this AC-ID) → tests/consistency/conflict-fixes.test.js
- **AC-20260813-07-7**: WHEN review.md's Phase 3 report slots are read THE SYSTEM SHALL carry
  the smells summary as a 📦 artifacts entry (`smells: {N} advisory — {M} accepted →
  docs/audit/advisory-findings.md`) and no longer as a 🔍-anchored line, while the
  `⚠️ smell lens failed` warns entry survives unchanged (D8 build-time ruling; supersedes the
  🔍 half of AC-20260812-01-6) → tests/review/smell-lens.test.js
- **AC-20260813-07-6** `[oracle: gate]`: WHEN the scoped gate runs THE SYSTEM SHALL keep
  `tests/claims/claims-lint.test.js` green — the migration's claims-baseline re-stamp is
  verified in-run because this spec's scoped gate explicitly includes that file (see
  Behavior; without the inclusion this oracle would be vacuous).

## Assumptions (escalation triggers)

- The ```report info-string renders as a plain fence in every surface that displays command
  markdown. If false → fall back to an HTML comment marker line above the fence; test keys
  on the marker.
- review.md/release.md can adopt slots without touching the 01–03 semantics text (D6). If a
  conformance edit cannot avoid rewording a reviewed sentence → STOP and escalate.
- Multi-arm templates (release.md's `✅ … (or: 🚫 …)` style) pass D2's test because only
  first and last lines are inspected (refuter-verified against every current template).

## Rationale

Audit provenance: Class A (A1–A11), Class D1/D2/D3. Tier T2, not T3: no T3 trigger surface
is touched. Pipeline entry via delegation (18 mechanical file edits are Sonnet work) and
durability (the wave spans sessions).

Refuter-driven corrections (2026-08-13): the `^Next:` last-line rule gained the
spec-status-placeholder alternative (the script's output starts `🎯 Next` — forcing a
hand-written `Next:` paraphrase would have recreated the second-derivation incident the
v6.20.0 rule exists to prevent); init.md's A6 ruling flipped from `Next: /spec:enforce` to
the spec-status placeholder (init's Phase 8 already auto-chains enforce — the audit ruling
predated checking that); commit.md's row was re-sized from "tag existing template" to
"author minimal template" (no report shape exists in any git command today); the 🔍/🔒
bespoke glyphs got explicit retirement mappings (they would have tripped AC-3 on day one);
escape.md keeps the ✅ lead per the audit's A3 ruling — the refuter's case for a 📦 lead was
considered and rejected: a fourth outcome anchor buys one command's semantics at the cost of
the closed-set contract every reader learns once.

Rejected: a `shared-for` arm for the git plugin (D5 — one citation line suffices); folding
B-class question fixes into this pass (spec 08 owns questions; chain serializes the shared
files). The A11 sketch/status/plan items that are question-shaped move to spec 08.

## Canonical Delta

None — the report-shape test is the durable record.
