---
name: scope-reconcile-degenerate-stems
description: gitRepo() pre-seeds a committed root .gitignore, and node --test --test-name-pattern lets a mutant-direction proof run without duplicating fixtures into a second file
metadata:
  type: feedback
---

`tests/helpers.js`'s `gitRepo(dir)` (default, `opts.empty` unset) already writes AND commits a
root `.gitignore` (content `.claude/worktrees/\n`) plus `a.txt` as its init commit. A test that
needs "the only changed file between base and change is `.gitignore`" should let gitRepo seed it,
then `fs.appendFileSync` + commit as the change — no need to fs.writeFileSync a fresh .gitignore
before the base commit.

**Why:** discovered authoring AC-20260815-02-15 (empty-stem bug in scope-reconcile.js's
stemsFor(): `'.gitignore'.replace(/\.[^./]+$/, '')` → `''`, and `content.includes('')` is true for
every file). Writing my own .gitignore in the fixture would have been redundant/confusing against
gitRepo's existing behavior.

**How to apply:** when a fixture's "changed file" is `.gitignore` (or any file gitRepo already
seeds), build on the existing seed rather than re-creating it.

Mutation-proof technique for a single spec-pipeline worker without a scratch test file: `cp` the
real script to `<name>.mutant.js` beside it, apply the reviewer-described mutation with a small
inline python/sed edit, temporarily point the test file's `SCRIPT` const at the mutant (sed swap +
`.bak`, `mv` back after), run just the one test via
`node --test --test-name-pattern="<AC-ID>" tests/<file>.test.js`, then delete the mutant and
restore the original test file content from `.bak`. Confirmed clean afterward with
`git status --porcelain` scoped to the touched paths. This avoids ever leaving a `.mutant.js`
file or a stray `SCRIPT` pointer committed.

See also [[doctrine-regex-linewrap]] for a different pinning-fragility class in this same repo.
