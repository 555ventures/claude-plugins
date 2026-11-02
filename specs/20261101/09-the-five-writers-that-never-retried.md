---
date: 2026-11-01
status: hardened
tier: standard
area: scripts
breaking: false
depends_on: []
brief: n/a
open_markers: 0
---

# The five writers that never retried

## Goal

Five gate scripts (`port-check`, `spec-number-check`, `workspace-scan`, `design-contract-check`,
`catalog-inventory`) still carry their own copy of the synchronous stdout writer, and these five
copies retry on nothing: a momentarily full non-blocking pipe (EAGAIN) throws, and a reader that
closed early (EPIPE, `script | head`) crashes the script with exit 1 and a stack trace, masking its
real verdict. The writer already lives once in `spec/scripts/lib/sync-write.js` with both cases
handled. Done means each of the five routes every byte through that module, keeps its own framing
and exit codes byte-for-byte, and a closed reader leaves its exit code untouched.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | Each of the five scripts keeps its local wrapper (`writeOut(fd, text)` — same name, same signature, same callers) and replaces the wrapper's `fs.writeSync` loop with one call to `lib/sync-write.js`'s `writeOut` (imported as `const { writeOut: syncWrite } = require('./lib/sync-write')`, the shape `count-tests.js` already uses); the wrapper owns framing, so every byte the open-stdout run prints today is printed unchanged. The retired loop's comment is replaced by one line citing `spec/scripts/lib/sync-write.js`'s header for the rationale. No other line in the five scripts changes. (AC-20261101-09-1, AC-20261101-09-2) | One writer, one rationale, one place to fix (the EPIPE fix recurred precisely because every script carried a copy). Rejected: calling the library directly at every call site — twenty-odd edits of framing for no behaviour gain, and the wrapper is where `+ '\n'`-style framing lives in the sibling scripts spec 10 migrates. |
| D2 | The regression test spawns each script with its stdout destroyed before the write (the `runWithClosedReader` shape of `tests/ceiling/count-tests.test.js`, written locally in the new file) and asserts the exit code equals the same invocation's exit code with stdout open, with no `EPIPE`, `Error:` or `at writeOut` on stderr. (AC-20261101-09-1) | A destroyed pipe throws EPIPE synchronously on the first write of any size (micro-spike A1), so the test needs no large fixture and no timing; comparing against the open run pins "exit code untouched" without hard-coding each script's verdict twice. |
| D3 | `node scripts/plugin-bump.js --bump --plugin spec --changelog "…"` `[no-ac: node scripts/plugin-bump.js --check in the gate is the oracle]` | Behaviour change under `spec/`. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/port-check.js | MODIFY | scripts | D1: wrapper body delegates to `lib/sync-write.js`; no dependency change |
| spec/scripts/spec-number-check.js | MODIFY | scripts | D1: wrapper body delegates to `lib/sync-write.js`; no dependency change |
| spec/scripts/workspace-scan.js | MODIFY | scripts | D1: wrapper body delegates to `lib/sync-write.js`; no dependency change |
| spec/scripts/design-contract-check.js | MODIFY | scripts | D1: wrapper body delegates to `lib/sync-write.js`; no dependency change |
| spec/scripts/catalog-inventory.js | MODIFY | scripts | D1: wrapper body delegates to `lib/sync-write.js`; no dependency change |
| spec/.claude-plugin/plugin.json | MODIFY | other | D3: `node scripts/plugin-bump.js --bump --plugin spec --changelog "…"` |
| tests/ceiling/sync-write-callers.test.js | CREATE | tests | AC-20261101-09-1, AC-20261101-09-2 |

## Contracts

No new or changed interfaces. The library call each wrapper makes:

```js
// spec/scripts/lib/sync-write.js (unchanged)
writeOut(fd: 1 | 2, text: string): void   // loops partial writes, retries EAGAIN, returns on EPIPE, throws anything else
```

## Behavior

- Open stdout: every script prints exactly the bytes it prints today and exits with today's code.
- Closed stdout (reader gone before the first write): the write returns silently; the script
  reaches its own `process.exit(code)` / `process.exitCode = code` and exits with that code;
  stderr carries nothing from the writer.
- Closed stderr on a usage error: the usage line is lost (nobody is reading), the usage exit code
  (2) is kept — `spec-number-check` and `workspace-scan` route usage through the wrapper; the
  other three use `process.stderr.write` for usage, which is untouched by this spec.

## Acceptance Criteria

- **AC-20261101-09-1**: WHEN one of the five scripts is spawned with its stdout destroyed before
  it writes THE SYSTEM SHALL exit on its own with the exit code the same invocation produces with
  stdout open, and print no `EPIPE`, `Error:` or `at writeOut` on stderr (e.g. against an empty
  temp directory `D`: `spec-number-check.js --root D` → exit 0 both ways, the open run printing
  `inapplicable — no specs/`; `workspace-scan.js --root D` → 0, open run `(no workspaces found)`;
  `design-contract-check.js --root D` → 0, open run `skipped: no design block`;
  `catalog-inventory.js --root D --out catalog.md --check` → 1, open run `missing — run without
  --check first`; `port-check.js --root D --json` with an empty `D/tests/` → 0, open run
  `{"findings":[]}`) → writes tests/ceiling/sync-write-callers.test.js
- **AC-20261101-09-2**: WHEN the five script sources are read THE SYSTEM SHALL contain no
  `fs.writeSync(` call and exactly one `require('./lib/sync-write')` each (e.g.
  `spec/scripts/port-check.js` → `writeSync(` hits: 0, `require('./lib/sync-write')` hits: 1)
  → writes tests/ceiling/sync-write-callers.test.js

## Assumptions (escalation triggers)

- A1: `fs.writeSync` to a destroyed pipe throws `EPIPE` synchronously on the first write of any
  size, repeatedly, and a caught EPIPE leaves `process.exit(n)` in control — **checked** (Node
  v22.23.3 and v26.8.1, scratch spawn with `child.stdout.destroy()` then two `writeSync` calls of
  6 and 10 bytes followed by `process.exit(3)` → stderr `caught EPIPE` / `second EPIPE`, exit 3,
  no signal). **if false:** the test falls back to the >64 KiB fixture shape of
  `tests/ceiling/count-tests.test.js`.
- A2: the five open-stdout invocations in AC-1 print and exit as listed — **checked** by running
  each against an empty scratch directory on Node 26.8.1 (outputs and exit codes as quoted).
  **if false:** the test compares closed-run exit to open-run exit, so a changed literal only
  needs the example text updated; STOP and ask if an exit code differs.
- A3: `lib/sync-write.js`'s `writeOut(fd, text)` takes a string and appends nothing — true per its
  header. **if false:** blocked; the wrapper contract in D1 is wrong.

## Rationale

The prior fix (`fix(spec): sync writer treats EPIPE as done`) centralised the writer and moved two
callers; it queued the remaining eighteen. Those eighteen split naturally into the five that never
retried anything (this spec) and thirteen that already retried EAGAIN but still rethrow EPIPE
(spec 10, which also owns the repo-wide "no copies left" sweep, since that sweep can only go green
after the last migration). The split keeps each spec under the decomposition cap and lets the
riskier five land first with behavioural pins. D1 keeps wrappers rather than inlining the library
call because the wrapper is where each script's framing lives; changing call sites would be
unrequested churn with a real chance of altering output bytes that other tests pin. D2's
closed-reader harness is copied, not shared through `tests/helpers.js`, because moving it would
touch `count-tests.test.js` — outside scope. Fragile: `port-check` with an empty `tests/` prints
nothing in human mode, so the test must use `--json` to force a write (the literal in AC-1 does).

## Canonical Delta

None — no `docs/canonical/` area exists for this repo's scripts.
