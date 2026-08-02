---
paths:
  - "tests/**"
---

# Test conventions

- `node:test` + `node:assert`, flat `test('full sentence stating the invariant', () => {})` — no `describe`.
- Use `tests/helpers.js` (`read`, `tmpdir`, `runNode`, `runBash`, `gitRepo`, `extractFn`) — never reimplement them inline.
- Every assert carries a third-arg message stating the consequence of failure, not the expectation.
- Header comment cites the incident/escape (dated) the test pins; pipeline-authored tests cite AC-IDs in test names.
- Modes: exec-a-script in a `tmpdir()` synthetic host; doctrine regex pins over `read()` content; workflow source-shape pins via `extractFn`/`evalFns`. Fixtures only for realistic multi-file inputs.
- Never weaken an existing assertion to make a change pass — that is a doctrine change, escalate.
- Agent: `plugin-tests` · exemplar: `tests/merge-back.test.js`.
