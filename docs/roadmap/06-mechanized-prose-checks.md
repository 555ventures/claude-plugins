# 06 — Mechanize the prose-executed checks: extract scripts for hand-computed verdict legs and doctor algorithms

Phase: P2
Depends on: none

## Why this brief

The 2026-08-13 style/workflow audit (docs/audit/style-audit-2026-08-13.md, Class C) found a
family the 20260813/05–10 wave deliberately deferred: deterministic algorithms written as
prose that the model hand-executes at run time. The pipeline's own § Rule Enforcement calls
this the "strict downgrade" — a checker-enforceable rule carried as prose — and the review
verdict currently *depends* on two such legs: `ac-matrix` (regex lint + grep joins over ACs
and tests) and `skip-reconcile` are LLM-hand-computed, then fed to `verdict.js` as if they
were mechanical. A hand-executed leg drifts per session and per model; the fix class is the
same every time — one sole-derivation script behind a `spec-paths` key, doctrine shrinking
to an invocation line. These were fenced out of the audit wave because each is new-script
work JJ's approved wave didn't include; they are one coherent slice.

## Scope

- **`ac-matrix.js`** (audit C1): the AC↔test grep matrix behind `/spec:review` Phase 0 —
  AC-ID extraction, test-hit joins, executed-vs-skipped counting, `[env:]`/`[oracle:]`
  handling per specs 20260813/02's vocabulary. Review.md's hand-computed steps 5–6 shrink to
  an invocation; the leg's input to `verdict.js` becomes script output.
- **Doctor check-19 script** (audit C4): the split/trim/≥10-char-substring algorithm doctor
  currently hand-executes, as a ~30-line script; the test then pins behavior, not paragraph.
- **`merge-back.sh branch-for <spec>`** (audit C9): branch derivation lives once in the
  script; enter-worktree.md and doctor check 11 both call it (today: two prose copies, each
  claiming the script owns it — it doesn't).
- **Doctor legacy-migration gating** (audit C10/C12): checks 16/17 gated on `generatedBy`
  version (or deleted per the one-major-version window); check 12's ~1000-char threshold
  demoted to secondary tripwire behind a schema/shape check.
- **`fidelity-check.js` regionRef over-claim detection** (audit C7): the mechanically
  detectable class behind design.md's `<surface>-screen` naming taboo; the incident-shaped
  prose rule collapses to one class-level sentence once the script detects the class.

## Grounding

- docs/audit/style-audit-2026-08-13.md — Class C rows C1/C4/C7/C9/C10/C12 with loci.
- spec/doctrine/shared.md § Rule Enforcement — the strict-downgrade doctrine this brief
  applies to the pipeline itself.
- spec/scripts/verdict.js, scope-reconcile.js headers — sole-derivation conventions
  (usage header, exit codes, remedy-naming, never a second derivation).
- specs/20260813/02-durable-verification-qualifiers.md — the `[oracle:]`/skip vocabulary
  ac-matrix.js must speak.
- specs/20260813/10-host-capabilities.md — the capabilities block ac-matrix's runner
  interactions must respect (skipReportPattern, not assumed formats).

## Out of scope

- The report renderer and question/model/capability surfaces — landed by 20260813/05–10.
- Forge adapters beyond `forge:"none"` honesty — separate evidence-driven brief if a
  GitLab/Bitbucket host materializes.
- Any change to verdict.js's derivation itself — it stays the sole verdict authority;
  this brief only mechanizes its *inputs*.

## Open questions

- Slice into one spec or two (ac-matrix.js is the big one; the doctor/merge-back items are
  small) — decided at plan time by the File Plan cap.
- Whether ac-matrix.js emits the review report's matrix rendering too, or data only
  (report-render.js exists by then — data-only is the default posture).
