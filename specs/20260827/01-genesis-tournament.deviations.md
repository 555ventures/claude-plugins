# Deviations — specs/20260827/01-genesis-tournament.md

- FINALISTS' step text (D4) prints `cost: roughly one mini-build per finalist (scaffold + gate +
  boot + probe slice)` and the `last measured: …` line as two SEPARATE lines, not the single
  " · "-joined line shown in the Contracts section's step-text excerpt. AC-20260827-01-1 pins
  both `/^cost: roughly one mini-build per finalist/m` and `/^last measured: no figure yet/m` —
  with `m`-flag `^` anchoring to a real line start, the excerpt's single-line rendering (cost
  text, then " · ", then "last measured: …" mid-line) can never satisfy the second regex. The
  tests are the executable contract per this repo's Test Rules; the Contracts excerpt is
  illustrative prose. No other step-text wording changed.
