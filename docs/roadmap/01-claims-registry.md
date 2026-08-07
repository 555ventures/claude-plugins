# 01 — Claims registry: every normative claim names its enforcement carrier

Phase: P1

## Why deferred

Deliberately deferred from the 2026-08-05 planning session (specs/20260805/01–04, the
derived-not-asserted series): plan this brief only after all four land, so the lint is
designed against the real mechanisms (scope-reconcile, verdict manifest, observation rows,
intake Fix column) instead of guesses. Do not start while any of the four is open.

## Scope

- Every normative claim ("must", "never", "always", hard-finding definitions) in
  `spec/commands/*.md` and `spec/doctrine/*.md` gets a required `enforcedBy:` pointer — a
  script, gate, hook, or test — or an explicit unenforced-sanction with a stated reason.
- `/spec:doctor` derives the claims inventory and flags orphan normative prose (extends
  `scaffold-ledger.md`'s model from guards to claims; the ledger's promote/retire column is
  the precedent).
- A normative-prose lint (deterministic, sanction-escapable) that keeps new orphan claims
  out; the intake `Fix` column's `mechanism(<path>)` pointers seed the registry.
- Hard constraint carried over from the series: doctrine net line count goes DOWN as claims
  convert — each converted claim deletes the prose the mechanism replaces.

## Grounding

- specs/20260805/01–04 (the mechanisms the registry will bind to) and their Rationale
  sections.
- `spec/doctrine/scaffold-ledger.md` (guard registry — the shape being generalized) and
  doctor check 13 (its consumer).
- The 2026-08-05 diagnosis session: ~4,900 lines of command/doctrine prose; measured
  prose-patch-before-mechanism pattern (5 patches/3 days on the dashboard seam) — the
  incident class this brief exists to end.
- The honor-system line budget already failed 3-for-3: specs/20260805/01, /02, and /03 each
  promised "net doctrine lines down" and each broke it (review.md alone grew 317→404 across
  the series), with every breach waived in review ("line-count predictions are estimates,
  not contracts"). The registry's net-lines-down constraint must be a mechanical check, not
  another prose promise.

## Out of scope

- Reviewer insight quality, panel sizing, and verifier kill criteria (explicitly frozen at
  the reporter's request, 2026-08).
- Rewriting doctrine content — this brief adds carriers and deletes redundancy; it does not
  re-litigate decisions.

## Open questions

- Sanction syntax and where it lives (inline HTML comment vs a registry file).
- Whether the lint runs as a repo test, a doctor check, or both.
- Migration order across the ~4,900 lines (likely: touched-file-only conversion, never a
  sweep — per shared.md § Doctrine Authoring).
