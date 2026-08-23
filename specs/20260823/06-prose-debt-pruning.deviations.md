# Deviations — specs/20260823/06-prose-debt-pruning.md

- D12 named 7.24.0 as the version-bump target (explicitly "a target, not a pin, per the
  version-race gotcha"). At doctrine-layer edit time (2026-08-23) `spec/.claude-plugin/plugin.json`
  was already at 7.25.0 (landed by a concurrent spec), so the bump was applied to the next free
  version, 7.26.0, per the version-race gotcha's own remedy. The `description` changelog's
  last-3-versions window now reads 7.26.0 / 7.25.0 / 7.24.0, dropping 7.23.0.
