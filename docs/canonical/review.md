# Review — canonical decisions

- Review scope is derived, not predicted: the reviewer diff is unscoped from base;
  `scope-reconcile.js` reconciles it against the File Plan; out-of-plan files are hard
  findings and reviewed content; `pipelineOwnedPaths` (config, additive over `specs/**` +
  the run ledger) is the only sanctioned exclusion. (specs/20260805/01-review-scope-reconciliation.md)
- A rename's new path is in-plan only when its old path was planned (or pipeline-owned);
  an unplanned file's rename is an ordinary out-of-plan hard finding, still reported in
  `renamed` for visibility. (same spec, review fix 2026-08-06, AC-20260805-01-9)

- The verdict word and the ledger row are both emitted by `verdict.js` from the
  per-iteration evidence manifest (fresh mktemp file; legs re-executed each iteration) +
  workflow return + dispositions; survivor counts come from the workflow file, never flags;
  `UNVERIFIED` = required leg missing, `GATE_RED` = blocking leg red; only `gate`/`smoke`/`ci`
  block — `reconcile`/`ac-matrix`/`skip-reconcile` emit dispositionable findings; CI status
  flows through `ci-query.js` (also used by observe-ci) — red blocks pre-panel, unavailable
  never blocks; verdict.js exit 0 is the only door to Phase 3 close.
  (specs/20260805/02-review-evidence-manifest.md, done 2026-08-06)

- `ac-matrix`'s coverage denominator fails closed: an AC bullet no ID grammar can parse counts
  as **uncovered** — unparseable = unknown, never absent — in both drift modes, since a host
  `driftScript` cannot parse a malformed bullet either. The `malformed-ac` hard finding is
  unchanged and never doubled by a second `uncovered-ac` row; the observed grammar
  `uncovered=N oracle=M` is byte-unchanged.

- Skip sanctions resolve on the **spec under review's** bullet when it declares that AC (a hit
  is final, with or without `[env:]` — a re-declared bullet that dropped its gate is
  authoritative), else from the AC's **owning spec**, derived mechanically from the AC-ID
  grammar `AC-{YYYYMMDD}-{NN[a-z]?}-{k}` → the single file matching `^{NN[a-z]?}-.*\.md$`
  under `specs/{YYYYMMDD}/`. Every edge fails closed to `unsanctioned-skip` naming the edge
  that fired: date dir absent, zero or ≥2 filename matches, unreadable, no AC section, AC not
  found, or found without `[env:]`. A cross-spec sanction counts as `sanctioned` and names its
  declaring file in the warning. The per-file read is cached; the **per-AC-ID resolution never
  is** — caching the resolution let two skipped ACs sharing one owning spec answer for each
  other, silently sanctioning an ungated AC in one order and falsely flagging a gated one in
  the other (found by retainer consult at this spec's own review, 2026-08-16).
  (specs/20260815/03-ac-matrix-fail-closed.md, done 2026-08-16)

- The Phase 0 leg inventory carries **`at-risk`**: required on full scope, skipped on
  fix-delta (mirroring `reconcile`), never blocking. `scope-reconcile.js` derives it as an
  additive `atRisk` field — path-stem matching, deliberately language-agnostic — naming the
  test files outside the spec's File Plan whose content references a changed source file;
  review then **runs** them via the host's `testCommand` and turns failures into ordinary
  dispositionable findings. Listing alone was rejected: a listed-only at-risk file is how the
  founding escape survived two process layers. Stems must discriminate — never the empty
  string (a root dotfile strips to `''` and matches every candidate) and never a bare
  single-segment basename; the full repo-relative path always survives so a root-level file
  stays matchable. (specs/20260815/02-at-risk-pins.md, done 2026-08-16; the stem-degeneracy
  clause added by that spec's own review, AC-20260815-02-15)
