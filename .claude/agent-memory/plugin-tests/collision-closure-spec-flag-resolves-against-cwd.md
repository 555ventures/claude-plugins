---
name: collision-closure-spec-flag-resolves-against-cwd
description: collision-closure.js's --spec is read via a bare fs.readFileSync(specPath), resolved against process.cwd() — unlike scope-reconcile.js, which does path.join(root, specPath) itself. A fixture test must pass { cwd: dir } or use an absolute --spec, or it silently ENOENTs (exit 2) even with --root set correctly.
metadata:
  type: project
  reviewed: 2026-09-04
---

specs/20260825/05-workflow-scripts-in-review-scope.md build (2026-08-27), authoring
tests/review/workflow-scripts-in-scope.test.js (AC-1/2/3, real-config fixture over
scope-reconcile.js + collision-closure.js).

The two entrypoints resolve `--spec` differently despite sharing a `--root` flag:
- `scope-reconcile.js`: `const specFull = path.join(root, specPath)` — `--root` participates in
  resolving `--spec`, so `runNode(SCRIPT, ['--root', dir, '--spec', specRel, ...])` (no `cwd`
  option) works, and every existing test of this script calls it that way
  (`tests/scope-reconcile-glob-rows.test.js`).
- `collision-closure.js`: `specText = fs.readFileSync(specPath, 'utf8')` — a bare read with no
  join against `root` at all. A relative `--spec` resolves against `process.cwd()` of the runNode
  child, which is the test-runner's own cwd unless overridden. Every existing test of this script
  passes `{ cwd: dir }` in the `runNode` options (`tests/collision-closure/collision-closure.test.js`)
  — copy that, not the scope-reconcile calling convention, even though the two scripts sit
  side-by-side in the same D2 fixture contract and both take `--root`/`--spec`.

Symptom if missed: `collision-closure: cannot read --spec spec.md — ... ENOENT`, exit 2, easy to
misread as "the fixture File Plan is malformed" rather than "the child process's cwd is wrong."

Proof technique used before trusting either calling convention or a Contracts-shown fixture
snippet against live scripts: build the exact fixture in a scratchpad Node script (real git repo,
real tracked `.claude/spec.config.json` copied verbatim, real entrypoints via `spawnSync`), run it
pre-change to confirm the expected RED shape, then hand-simulate the post-change config (delete
the key in the written file before the base commit, not by mutating after — mutating after adds a
spurious extra diff entry for `.claude/spec.config.json` itself) to confirm the exact expected
GREEN JSON shape before writing any assertion. See also
[[synthetic-repro-presented-as-real]]-adjacent discipline in the rules' own Gotchas: the spike here
was against the real scripts the whole time, just not through `node:test`.

See also [[new-spec-ac-green-pre-change]] for the broader "AC pins current real-config drift"
pattern this spec is an instance of.
