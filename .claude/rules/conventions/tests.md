---
paths:
  - "tests/**"
---

# Test conventions

- `node:test` + `node:assert`, flat `test('full sentence stating the invariant', () => {})` — no `describe`.
- Use `tests/helpers.js` (`read`, `tmpdir`, `runNode`, `runBash`, `gitRepo`) — never reimplement them inline.
- Every assert carries a third-arg message stating the consequence of failure, not the expectation.
- Header comment cites the owner id the test pins — spec path, AC-ID, or escape row id — in one line; pipeline-authored tests cite AC-IDs in test names; never dates, people, hosts, versions, or prior behavior.
- Mode: behavioral — exec-a-script in a `tmpdir()` synthetic host. Prose pins only for references and protocol tokens (core § Doctrine Authoring), sliced by heading (`section`) with reflow-safe literals (`phrase`); never the wording of a rule. Retiring wording is checked once at review through `[oracle: literals]`, never a test. Fixtures only for realistic multi-file inputs.
- Never weaken an existing assertion to make a change pass — that is a doctrine change, escalate.
- Agent: `plugin-tests` · exemplars: `tests/merge-back.test.js` (exec-a-script), `tests/consistency/dead-stops.test.js` (prose pins).
