# Review — canonical decisions

- Review scope is derived, not predicted: the reviewer diff is unscoped from base;
  `scope-reconcile.js` reconciles it against the File Plan; out-of-plan files are hard
  findings and reviewed content; `pipelineOwnedPaths` (config, additive over `specs/**` +
  the run ledger) is the only sanctioned exclusion. (specs/20260805/01-review-scope-reconciliation.md)
- A rename's new path is in-plan only when its old path was planned (or pipeline-owned);
  an unplanned file's rename is an ordinary out-of-plan hard finding, still reported in
  `renamed` for visibility. (same spec, review fix 2026-08-06, AC-20260805-01-9)
