---
name: git-show-name-only-tree-sort-order
description: git show --name-only orders files by git's tree sort (byte-compare, directory as prefix), not insertion/write order or plain string alphabetical — verify empirically before hardcoding a files array.
metadata:
  type: feedback
  reviewed: 2026-09-08
---

`git show --format= --name-only <sha>` lists touched files in git's tree-sort order, not the
order `fs.writeFileSync` created them in. For paths `src/a.js, src/b.js, src/gen/x.js, src/c.js`
(written in that order), the real order git prints is `src/a.js, src/b.js, src/c.js,
src/gen/x.js` — `c.js` sorts before `gen/` because git compares byte-wise with directories
effectively suffixed `/`, and `'c' < 'g'`.

**Why:** caught while repairing spec 20260904/01's `commit-mode.test.js` AC-4 fixture — a
dispatch prompt suggested hardcoding a `files` literal in "git's order," but the prose-narrated
order (from the spec's own AC text) was the write order, not git's real order. Trusting the
prose would have shipped a red (or vacuously-reordered) pin.

**How to apply:** whenever a test hardcodes an exact `git show --name-only` (or similar
tree-ordered git listing) result instead of comparing against a live `execFileSync` call,
build the same fixture in a scratch repo first (bash git commands one-at-a-time — multi-line
compound bash git invocations can get denied in this harness's permission model) and read the
actual output before writing the literal array. Related: [[spec-ac-example-vs-shipped-refusal]].
