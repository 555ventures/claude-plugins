---
date: 2026-08-10
status: done
diff_base: a33476f3586b571faa1bfccc6d00d59fad6c3b24
risk: T3                 # touches spec/scripts/spec-state-gate.sh (hook surface — T3 trigger per pipeline rules § Risk Tiers), header/claim text only
area: cross-cutting
design: false
breaking: false
depends_on: [20260810/09-stale-reference-sweep]   # overlapping files: shared.md, review.md, release.md, build.md
depended_on_by: []
brief: n/a               # audit-driven fix wave (command-surface audit 2026-08-10), slice 3 of 3
open_markers: 0
---

# Drift-duplicate reconcile: restated rules that now disagree with their originals

## Goal

Slice 3 of the 2026-08-10 command-surface audit fix wave: ten places where a rule was
restated and the copies have drifted into disagreement — within one file, across a
command/agent pair, or between a hook's claim and its behavior. Per shared.md § Doctrine
Authoring, sanctioned duplication is fine; *disagreeing* duplication is the defect. After
this spec each drifted pair has exactly one full statement (the home) and the other site
either cites it or is deleted. Done means no two passages state the same rule with different
consequences.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | shared.md's flat restatement "the doctor itself never rewrites either layer" (§ Grounding Drift region, ~line 79) is aligned to the canonical carve-out three paragraphs up (§ Host Grounding, Regeneration ownership): never rewrites either layer **wholesale**; `--fix` is the sanctioned line-item repair path — restated as a one-line citation of that home, not a second full statement. | The restatement contradicts the carve-out; an orchestrator reading only the restatement would refuse a sanctioned `--fix`. |
| D2 | The dc-extract model claims are reconciled to **verified reality**: the script runs no model and is **fail-closed** — every parse failure dies loud with the remedy (dc-extract.js's `die()` paths); no Sonnet fallback exists anywhere (refuter-executed grep over design.md, spec-design-driver.js, workflows). The home statement in § Design Binding Pipeline ("no model") stays. The stale parenthetical "(Sonnet only as fallback)" — which lives in § Workflows Encode Shape, Not Judgment, a section served to build/review/enforce readers who never load the design section — is replaced with the short true form "(deterministic, no model — fail-closed on unparseable mocks)", a deliberate aligned restatement rather than a bare citation, because that section's readers don't receive § Design Binding Pipeline via `shared-for`. | The original draft canonized the fallback parenthetical; the refuter demonstrated the fallback is fabricated — the reconcile must delete the false claim, not average the two. |
| D3 | reviewer.md's "your coverage check IS the drift gate" (no-driftScript arm) is rewritten to match review.md's canonical ownership: the Phase 0 grep matrix IS the deterministic drift gate (an AC-ID with zero test hits is an automatic hard finding, no reviewer claim needed); the reviewer's AC↔test check is the **semantic backstop** — a test that names an AC-ID without testing the behavior is still hard. review.md's text is the home — untouched EXCEPT its false parenthetical "(The workflow's reviewer prompt already calibrates this via `hasDriftScript`)", which is corrected (the flag only toggles the note's presence). **The same stale claim lives in the runtime reviewer prompt**: wf-review.body.js's `DRIFT_NOTE` ("THIS check is the drift gate; a missing test is hard") is rewritten to the backstop framing ("the Phase 0 grep matrix is the deterministic drift gate; your AC↔test check is the semantic backstop — a test that names an AC-ID without testing the behavior is still hard"), then `npm run build:workflows` regenerates wf-review.js (source + generated committed together; the generated file is never a File Plan row). | Refuter-demonstrated: fixing only reviewer.md leaves a T3 panel's second reviewer holding a system prompt saying "backstop" and a task prompt saying "THIS check is the drift gate" — the exact disagreement this decision exists to kill, relocated instead of removed. |
| D4 | The two circular canonicity pairs in shared.md are given single homes: the consult-free-T3 rule's full statement lives in § Model Placement (retainer bullet); the § Escalation Contract (build) copy becomes a one-line citation. The standalone-design seat rule's full statement lives in § Model Placement (the named exception bullet); the § Design Binding Pipeline copy cites it. Each citation names its home's actual `## ` heading (satisfying spec 09's checker). | Two passages each claiming the other is the home means neither can be safely edited; pick the placement section both rules are about. |
| D5 | shared.md's "the only sanctioned runtime LLM rule-check is `/spec:plan` reading a draft spec" (§ Rule Enforcement — served to doctor/enforce readers) gains the design-harness carve-out stated **in place, self-contained**: "...and the design harness's per-mock checklist walk — a prose surface with no deterministic checker (full mechanism in § Design Binding Pipeline)". The carve-out sentence must stand alone for doctor/enforce readers, whose `shared-for` scope never loads the design section — the § pointer is provenance, not the load-bearing text. | The flat "only" is falsified later in the same file by the mandatory Sonnet checklist walk it requires; the fix must not strand its readers on a citation to a section they never receive. |
| D6 | Within-file duplicate procedures collapse to one statement + one citation: git/merge.md's **three-step** worktree-cleanup sequence (Step 7's numbered statement stays the home; the near-verbatim prose restatement in NON-NEGOTIABLE RULES rule 4 becomes "follow Step 7's sequence exactly"); build.md's no-free-text-in-args invariant (the canonical block with the full alphabet — `paths/ids/enums/booleans` plus commands — is the home; the narrower restatement around build.md line 96 becomes a citation of it — the alphabets currently differ, which is the defect). The audit's third candidate, release.md's `--milestone`/`--briefs` flag contract, is **dropped from scope**: refuter-verified, the two copies agree and the second already cross-references the first — sanctioned duplication, not drift. | Same-file drift is unsanctioned duplication by definition (§ Doctrine Authoring); the two surviving pairs have measurably diverged, the dropped one hasn't. |
| D7 | spec-state-gate.sh's header comment and shared.md's companion claim state the literal command list the gate actually matches (the worker reads the script's own case/match pattern and writes that list in both places), replacing "every pipeline command". Behavior untouched — this is a claim correction, not a gate change; the hook file's edit is comment-only. | A hook that fires on four commands while doctrine promises "every" teaches false coverage — the dangerous direction of drift. |
| D8 | scaffold-ledger.md's stray blank line inside the guard-registry table (~line 48) is deleted so rows 49–73 render as table rows again. Grep-audit behavior is unchanged (it never depended on rendering). | One-character fix; the registry is read by humans at promote/retire time. |
| D9 | spec plugin version bumps by one minor at build time — **expected 6.53.0 → 6.54.0** assuming the 07→08→09→10 landing order; the binding rule is *then-current version + one minor*, because sibling specs 06 and 07 (both hardened, no mutual ordering) each claim 6.50.0 → 6.51.0 and whichever lands second shifts the whole chain (refuter-found, pre-existing collision — flagged to JJ, not repaired here). Description gains the drift-reconcile clause. | A literal number a sibling spec can invalidate is not executable verbatim; the bump is the discipline, the number is derived at build. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/doctrine/shared.md | MODIFY | doctrine | D1 doctor-authority alignment; D2 dc-extract split; D4 canonical homes; D5 carve-out; D7 gate-scope claim |
| spec/agents/reviewer.md | MODIFY | doctrine | D3: coverage check reworded to semantic backstop |
| spec/commands/review.md | MODIFY | doctrine | D3: false "already calibrates this" parenthetical corrected |
| spec/workflows/src/wf-review.body.js | MODIFY | workflows | D3: DRIFT_NOTE reworded to backstop framing; regenerate via `npm run build:workflows` (generated wf-review.js committed together, never its own row) |
| git/commands/merge.md | MODIFY | doctrine | D6: cleanup sequence single statement |
| spec/commands/build.md | MODIFY | doctrine | D6: args alphabet single home |
| spec/scripts/spec-state-gate.sh | MODIFY | scripts | D7: header comment states the literal gated-command list (comment-only) |
| spec/doctrine/scaffold-ledger.md | MODIFY | doctrine | D8: table-breaking blank line removed |
| tests/consistency/drift-reconcile.test.js | CREATE | tests | AC-20260810-10-1 … AC-20260810-10-8 |
| spec/doctrine/claims-baseline.json | MODIFY | other | claims ratchet after doctrine edits |
| spec/.claude-plugin/plugin.json | MODIFY | other | D9: bump 6.53.0 → 6.54.0 + description clause |

## Acceptance Criteria

- **AC-20260810-10-1**: WHEN tests read shared.md THE SYSTEM SHALL find exactly one full
  statement of the doctor-rewrite rule (the § Host Grounding carve-out with "wholesale" and
  `--fix`) and SHALL NOT find a flat "never rewrites either layer" claim without the
  wholesale qualifier or a citation → tests/consistency/drift-reconcile.test.js
- **AC-20260810-10-2**: WHEN tests read shared.md's two dc-extract sites THE SYSTEM SHALL
  find zero occurrences of "Sonnet only as fallback" and SHALL find "fail-closed" in the
  § Workflows Encode Shape, Not Judgment site's parenthetical (e.g. the literal fragment
  `no model — fail-closed`) → tests/consistency/drift-reconcile.test.js
- **AC-20260810-10-3**: WHEN tests read reviewer.md, review.md, and
  spec/workflows/src/wf-review.body.js THE SYSTEM SHALL find "semantic backstop" in
  reviewer.md's no-driftScript arm and in the body.js `DRIFT_NOTE`, SHALL find zero
  occurrences of "THIS check is the drift gate" in body.js and generated wf-review.js
  (regenerated in the same diff), SHALL find no "already calibrates this" parenthetical in
  review.md, and review.md SHALL CONTINUE TO carry "the Phase 0 grep matrix IS the drift
  gate" unchanged → tests/consistency/drift-reconcile.test.js
- **AC-20260810-10-4**: WHEN tests read shared.md THE SYSTEM SHALL find exactly one
  passage containing both "consult-free" full-rule markers ("first surprise" AND "that's a
  pass, not a coverage gap") — in § Model Placement — with the § Escalation Contract copy
  reduced to a line citing `§ Model Placement`; and likewise exactly one full statement of
  the standalone-design seat rule (the literal "Opus is the cost-rational default" sentence)
  in § Model Placement, with the § Design Binding Pipeline copy citing it →
  tests/consistency/drift-reconcile.test.js
- **AC-20260810-10-5**: WHEN tests read shared.md's runtime-LLM-rule-check sentence THE
  SYSTEM SHALL find the design-harness checklist walk named as a sanctioned case alongside
  `/spec:plan` → tests/consistency/drift-reconcile.test.js
- **AC-20260810-10-6**: WHEN tests read git/merge.md THE SYSTEM SHALL find exactly one
  numbered statement of the cleanup sequence (the `ExitWorktree` → merge → remove-worktree
  steps appear once; the rules-section site contains "Step 7" as a citation), and WHEN tests
  read build.md THE SYSTEM SHALL find exactly one enumeration of the args alphabet (exactly
  one line matching the `paths/ids/enums/booleans` family; the other former site cites it) →
  tests/consistency/drift-reconcile.test.js
- **AC-20260810-10-7**: WHEN tests read spec-state-gate.sh's header and shared.md's
  companion claim THE SYSTEM SHALL find both stating the same literal command list the
  script's match pattern implements (test derives the list from the script's pattern and
  asserts both texts contain it), and the script SHALL CONTINUE TO pass
  `bash -n` → tests/consistency/drift-reconcile.test.js
- **AC-20260810-10-8**: WHEN tests parse scaffold-ledger.md's guard registry THE SYSTEM
  SHALL find no blank line between the table header and its last row (every registry line
  matches the `|`-row shape) → tests/consistency/drift-reconcile.test.js

## Assumptions (escalation triggers)

- A1: spec-state-gate.sh's gated-command list is derivable from a single match pattern —
  **refuter-verified 2026-08-10**: one case-pattern site gating exactly
  `/spec:plan|/spec:design|/spec:build|/spec:review`. **if false** (a future edit spreads
  it): the test pins the header claim against a hand-derived list; never guess.
- A2: No existing test pins the drifted copies this spec deletes (plan-time grep: the
  claims-baseline tracks line counts, not these sentences; no `tests/` hit pins reviewer.md's
  drift-gate sentence or build.md's line-96 alphabet). **if false:** the pinning test moves
  to the surviving home in the same row pair; incident-headered pins escalate per pipeline
  rules § Build.
- A3: Collapsing duplicates shrinks doctrine line counts, so the claims ratchet moves
  downward — sanctioned direction; `--update-baseline` records it. **if false** (a deleted
  line was a registered claim's only carrier): re-home the claim marker onto the surviving
  statement before updating the baseline.
- A4: Spec 09 lands first (`depends_on`), so D4's citations are written against 09's
  checker and pass its `MISS=0` bar. **if false:** the citations still follow the
  byte-for-byte prefix rule review enforces today.

## Rationale

Slice 3 of the three-spec fix wave (shape in 08's Rationale). The governing rule is
shared.md § Doctrine Authoring: repetition across files is sanctioned; *drift* is the
defect, and the fix is picking a home, not deleting all copies. Homes were chosen by
ownership, not age: the placement rules live in § Model Placement because that section is
what a model-seat question loads; review.md keeps the drift-gate text because review owns
the gate's execution. D7 corrects the claim to match the hook rather than extending the
hook to match the claim — the audit found no incident traceable to the gate's actual
four-command scope, and widening a UserPromptSubmit hook's firing surface is a behavior
change this prose-wave deliberately avoids (holistic rule: deterministic enforcement over
prose, but never a mechanism change smuggled into a wording fix). The hook-file edit is
comment-only, which is also why T3 here carries no spike: nothing executable changes.

Adversarial check (2 refuters, T3): nine findings, eight accepted and folded, one candidate
dropped from scope. Accepted: the dc-extract "Sonnet fallback" I had drafted as the
reconciled truth is fabricated (dc-extract.js is fail-closed with no fallback anywhere —
D2 now deletes the false claim instead of averaging the two); the "§ v6 delta" location
name was wrong (the stale parenthetical lives in § Workflows Encode Shape, Not Judgment);
the runtime reviewer prompt (wf-review.body.js `DRIFT_NOTE`) carries the same stale
drift-gate claim D3 was fixing in reviewer.md only, and review.md's "already calibrates
this" parenthetical is false — both now in D3 with a File Plan row and AC-3 coverage; D2's
and D5's citation sites are served by `shared-for` scopes that never load the chosen homes,
so both sites now keep self-contained short forms instead of bare citations; merge.md's
sequence is three steps, not four; the "three sections later" count was wrong; ACs 4/6
lacked the literal anchors T3 ACs require (now anchored). Dropped: release.md's
`--milestone`/`--briefs` pair — refuter-verified as agreeing, already-cross-referenced
sanctioned duplication, not drift. Flagged upward, not repaired here: hardened siblings 06
and 07 both claim the 6.50.0 → 6.51.0 bump with no mutual ordering — this spec's version
instruction is now order-resilient (D9), and the 06/07 collision is reported to JJ in the
planning session's wrap-up.

## Canonical Delta

None — the plugin's doctrine files are the canonical surface and are edited directly.
