# Deviations — 20260910/08-gate-sees-created-files

- Repair round 1: the gate reddened on `tests/tracked-text-purity.test.js`, an out-of-plan
  repo-wide pin, because `specs/.DS_Store` (macOS Finder metadata, raw NUL bytes) had been
  swept into this spec's own plan commit `a9134b8`. Escalated to the user per build.md
  § `blocked` returns; the user chose to widen scope rather than pause. Recorded as D12 with
  two new File Plan rows (`.gitignore` MODIFY, `specs/.DS_Store` DELETE). No feature promise
  changed and no assertion was weakened.
