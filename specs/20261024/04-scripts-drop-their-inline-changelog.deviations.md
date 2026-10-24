# Deviations — 04-scripts-drop-their-inline-changelog

- AC-6/A2: `ac-drift.js` has no `--all-done` flag (it exits 2 with a usage error on it); the test runs `ac-drift.js --root <ROOT>`, which already scans every done spec.
- AC-3/D2: `comment-narration.js --code-identical` scans `tests/` and `scripts/` as well as `spec/scripts` and `spec/bin`, so the D3 deletions and the read-load rewrite make its raw exit status 1 permanently; the test runs it with `--json` and requires zero `differ` entries under `spec/scripts/` and `spec/bin/` (the swept trees).
