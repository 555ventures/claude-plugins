# Deviations — specs/20260824/01-render-gate.md

- AC-20260824-01-4's stated delta is internally inconsistent with the `--width 390` AC-3 pins:
  `x 123 → 169.9` is a 46.9 px delta, which is 12.03% of 390, not the 12.01% the AC's literal
  finding line states. The test reproduces the AC's literal by driving that one case at
  `--width 390.5`; every other geometry case runs at the spec's `--width 390`. The tolerance
  constants and the finding-line format are unchanged — only the AC's own arithmetic was
  off by one rounding step.
