# Deviations — 01-the-prototype-command-and-the-pin-overlay

- red-check crashed on EISDIR at the tests-authored step: it read the File Plan's directory row
  `tests/fixtures/prototype/host/` as one file. JJ ruled "fix it in this spec". The fix (a
  directory row expands like `<dir>/**`) plus its behavioural test landed as their own commit
  98db1571 on this branch, and `diff_base` moved from 8d7f83ed to 98db1571 so this spec's
  pre-image is checked by the fixed tool — the red-check pre-image purity check refuses any
  non-tests change, so the fix could not sit inside this spec's judged range.
- The test author added `tests/prototype/fixture.js`, a shared setup helper for the five new
  prototype test files, outside the File Plan's tests rows. It is not a `*.test.js` file, so
  node:test never runs it on its own.
- D3's overlay-import check ("grep -rl over the worktree minus node_modules") also excludes `.git`,
  `.claude`, and the two copied template files themselves. `.claude/spec.config.json` always
  carries `prototype.overlay`'s path by construction (D1), and each copied template names its own
  basename in its header, so the literal grep would make the missing-import refusal unreachable.
