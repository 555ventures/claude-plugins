# 05 — /spec:audit: hotspot-targeted debt intake with a disposition ledger

Phase: P2
Depends on: none

> **Superseded by v7.0.0 (2026-08-17).** `/spec:audit` and `hotspot.js` died in the v7 delete layer. The cross-spec-debt concern is real but currently unowned; reopen if a post-v7 escape names cross-spec accretion the per-spec path structurally could not see.

## Why this brief

Every check in the pipeline is spec-scoped; smells that emerge *across* specs — accreted
helpers, boundary erosion, layering drift — are structurally invisible to it ("codify or it
doesn't exist"). The 2026-08-10 research session grounded the fix pattern: continuous ratchet
gates carry the load (specs/20260810/06), a per-review advisory lens catches the judgment
residue (brief 04), and a **slower whole-repo judgment layer** handles what neither can —
but only if it is targeted (uniform sweeps don't scale and mostly return noise) and only if
every finding is dispositioned (CMU data: agent-authored complexity compounds ~30–40% by
month three; findings that expire un-adjudicated just get re-found). Churn × complexity
hotspot targeting is the one empirically backed prioritizer (CodeScene/Tornhill lineage), and
it is computable from git alone. The pipeline already owns the disposition pattern: the
intake model (sweep → verify → disposition → baseline) — this brief is that organ pointed at
the host's own code instead of at pipeline feedback.

## Scope

- **`/spec:audit` command.** Cadence: on demand plus offered at `/spec:release` (the
  milestone seam). Targeting: a deterministic hotspot derivation (git churn × a cheap
  complexity proxy) selects the top-N files/areas; the audit reads only those. Judgment: a
  small fan-out over the selected hotspots hunting cross-spec smells — duplication clusters,
  boundary erosion, dead seams, error-masking accretion — each finding verified against live
  code before it reaches the user.
- **Hotspot derivation script.** One deterministic script (churn window, complexity proxy,
  ranking) — a new sole derivation, never duplicated elsewhere; `/spec:audit` is its only
  consumer at first.
- **Disposition ledger.** Every accepted finding gets exactly one fate, recorded in a ledger
  the next audit reads first: **refactor brief** (structural fix → `docs/roadmap/NN-*.md`),
  **rule row** (judgment rule → pipeline rules / reviewer severity), or **enforcer**
  (mechanizable → a `/spec:enforce` cell, entering the ratchet baseline). Rejected findings
  are recorded with reasons — the audit's analogue of the intake ledger's discipline, so
  re-finds are free.
- **Recurrence promotion.** A smell class dispositioned ≥2 times as a refactor brief or rule
  row must be re-adjudicated for promotion to a deterministic enforcer — the ledger makes
  this mechanical (count by class), never a memory exercise.

## Grounding

- `spec/INTAKE.md` + `docs/canonical/intake.md` — the disposition-ledger discipline this
  transplants (every row: finding → fate → citation; repeat classes escalate).
- specs/20260810/06-ratchet-enforcers.md — the enforcer fate's landing surface (a promoted
  class becomes an enforce cell with a ratchet baseline).
- `spec/commands/release.md` — the milestone seam where the audit is offered.
- `spec/scripts/spec-status.js` / `scope-reconcile.js` headers — the sole-derivation script
  conventions the hotspot script must follow (usage header, exit codes, remedy-naming).
- 2026-08-10 research session: hotspot = churn×complexity as the only empirically backed
  debt prioritizer; disposition-or-it-recurs; periodic-only cadence rejected (the audit is
  the slow layer over the continuous ratchet, never the primary defense).

## Out of scope

- Auto-fixing anything — the audit produces dispositions, never edits host source.
- Gating any pipeline stage on audit findings; it is a judgment organ, not a gate.
- Mechanical clone/cycle detection in the gate — owned by specs/20260810/06.
- Per-diff smells — owned by brief 04's review lens; the audit ingests that lens's accepted
  findings rather than re-deriving them.
- Cross-host aggregation (fleet-level debt views) — future work, needs fleet evidence first.

## Open questions

- Complexity proxy choice for the hotspot script (indentation-based vs line-count vs
  cyclomatic-via-existing-tooling) — resolved at plan time; must stay dependency-free.
- Ledger home and format (a `docs/debt/` ledger vs extending `spec/INTAKE.md`'s model with a
  host-side analogue) — decided at plan time against the intake authoring contract.
- Whether audit findings feed `/spec:release`'s feedback brief or stay a separate surface.
