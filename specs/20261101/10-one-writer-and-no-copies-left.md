---
date: 2026-11-01
status: hardened
tier: critical
area: scripts
breaking: false
depends_on: [specs/20261101/09-the-five-writers-that-never-retried.md]
brief: n/a
open_markers: 0
---

# One writer, and no copies left

## Goal

Thirteen gate scripts still carry their own copy of the synchronous stdout writer. Each copy
retries EAGAIN but rethrows EPIPE, so any of them piped to a reader that closes early (`| head`)
exits 1 with a stack trace instead of its own verdict — the exact defect the shared
`spec/scripts/lib/sync-write.js` was written to end, and which recurs for as long as copies exist.
Done means every script under `spec/scripts/` that writes a payload routes it through that one
module, byte-for-byte output and exit codes unchanged, and one standing test walks the directory
and fails the moment a new copy appears.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | Each of the thirteen scripts keeps its local wrapper — same name (`writeOut`, `writeAll`, `writeFd`, `syncWrite`, `out`), same signature, same callers — and replaces the wrapper's `fs.writeSync` loop with one call to `lib/sync-write.js`'s `writeOut`, imported as `const { writeOut: syncWrite } = require('./lib/sync-write')` (as `count-tests.js` does). The wrapper owns framing (`+ '\n'`, the hard-coded fd 1 in `spec-status.js`, the `Buffer` argument in `fleet-reader.js` and `red-check.js`, which the wrapper converts with `buf.toString('utf8')` or by taking the string before `Buffer.from`), so the open-stdout bytes and exit codes are unchanged. Each retired loop's comment becomes one line citing `spec/scripts/lib/sync-write.js`'s header; every comment that today points at `spec/scripts/lib/driver-io.js`'s `writeOut` for the rationale is repointed to `lib/sync-write.js`. No other line changes. (AC-20261101-10-1, AC-20261101-10-2, AC-20261101-10-3) | One writer, one rationale; the wrapper keeps each script's framing where it already is, so the migration cannot change output bytes that other tests pin (e.g. `spec-status.js --json`'s >64 KiB pipe pin). Rejected: inlining the library call at every call site (dozens of framing edits for no behaviour gain). |
| D2 | A standing sweep test walks `spec/scripts/` recursively (location, never a name filter — every file found is read), strips `//` line comments and `/* */` block comments, and asserts that the substring `writeSync(` occurs in exactly one file, `spec/scripts/lib/sync-write.js`. The test prints every offending path in its failure message. (AC-20261101-10-1) | The library exists so copies stop recurring; a sweep is the only guard that fails on the NEXT copy, not just on today's eighteen. Comments are stripped first so a citation like "no `fs.writeSync` here" never trips it (host gotcha: normalize before you parse). |
| D3 | `spec-status.js` (a § Risk Tiers surface) gets its own closed-reader pin in `tests/ceiling/sync-write-callers.test.js`: `--root <empty dir> --json` with stdout destroyed exits 0 with no `EPIPE`/`Error:` on stderr, the open run printing `{"briefs": [], "specs": [], "superseded": [], "anomalies": []}` (the pretty-printed form). The two existing pipe pins — `count-tests.js`'s EPIPE pair and `spec-status.js --json` over a >64 KiB pipe — keep covering the unchanged behaviour and carry this spec's pin IDs in their titles. (AC-20261101-10-2, AC-20261101-10-3, AC-20261101-10-4) | Critical tier owes an executed literal on the frozen `--json` surface, and the predecessors' pins are the cheapest proof that the migration changed no bytes; the IDs go in the titles because `ac-matrix` counts ID occurrences, not `reuses` pointers. |
| D4 | `node scripts/plugin-bump.js --bump --plugin spec --changelog "…"` `[no-ac: node scripts/plugin-bump.js --check in the gate is the oracle]` | Behaviour change under `spec/`. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/ac-drift.js | MODIFY | scripts | D1: wrapper delegates to `lib/sync-write.js`; no dependency change |
| spec/scripts/comment-narration.js | MODIFY | scripts | D1: `syncWrite` wrapper delegates; no dependency change |
| spec/scripts/coverage-scope.js | MODIFY | scripts | D1: wrapper delegates; no dependency change |
| spec/scripts/expire-tests.js | MODIFY | scripts | D1: wrapper delegates; no dependency change |
| spec/scripts/fleet-reader.js | MODIFY | scripts | D1: `writeAll(fd, buf)` delegates, Buffer → string inside the wrapper; no dependency change |
| spec/scripts/pictures.js | MODIFY | scripts | D1: `writeFd` wrapper delegates; no dependency change |
| spec/scripts/red-check.js | MODIFY | scripts | D1: `writeAll(fd, buf)` delegates, Buffer → string inside the wrapper; no dependency change |
| spec/scripts/registry-check.js | MODIFY | scripts | D1: wrapper delegates; no dependency change |
| spec/scripts/release-legs.js | MODIFY | scripts | D1: `writeAll(fd, str)` delegates; no dependency change |
| spec/scripts/spec-queue.js | MODIFY | scripts | D1: `out(text)` delegates (its own EPIPE arm retired with the loop); no dependency change |
| spec/scripts/spec-status.js | MODIFY | scripts | D1: `writeOut(str)` keeps fd 1 and `+ '\n'`, delegates; no dependency change |
| spec/scripts/walkthrough-connect.js | MODIFY | scripts | D1: `writeFd` wrapper delegates; no dependency change |
| spec/scripts/walkthrough.js | MODIFY | scripts | D1: wrapper delegates; no dependency change |
| spec/.claude-plugin/plugin.json | MODIFY | other | D4: `node scripts/plugin-bump.js --bump --plugin spec --changelog "…"` |
| tests/ceiling/sync-write-callers.test.js | MODIFY | tests | AC-20261101-10-1 (D2 sweep), AC-20261101-10-2 (D3 spec-status closed-reader pin) |
| tests/ceiling/count-tests.test.js | MODIFY | tests | AC-20261101-10-3 — ID appended to the two existing EPIPE test titles, assertions unchanged |
| tests/queue/queue-overlay.test.js | MODIFY | tests | AC-20261101-10-4 — ID appended to the existing `spec-status.js --json survives a real pipe` title, assertions unchanged |

## Contracts

No new or changed interfaces. The library call each wrapper makes:

```js
// spec/scripts/lib/sync-write.js (unchanged)
writeOut(fd: 1 | 2, text: string): void   // loops partial writes, retries EAGAIN, returns on EPIPE, throws anything else
```

## Behavior

- Open stdout: every migrated script prints exactly today's bytes and exits with today's code.
- Closed stdout before the first write: the write returns; the script reaches its own exit
  (`process.exit(code)`, `process.exitCode = code`, or falling off the end for `fleet-reader.js`
  and `red-check.js`) and exits with that code; the writer puts nothing on stderr.
- `spec-queue.js`'s `out()` already returned on EPIPE; after D1 it does so through the library,
  observably identical.
- The sweep (D2) reads sources only; it spawns nothing and judges no git ref (a working-tree
  walk, so it never goes red on unrelated later commits).

## Acceptance Criteria

- **AC-20261101-10-1**: WHEN every file under `spec/scripts/` (recursively, by location) is read
  with `//` and `/* */` comments stripped THE SYSTEM SHALL contain the substring `writeSync(` in
  exactly one file, `spec/scripts/lib/sync-write.js` (e.g. on the pre-image the sweep lists 13
  other files, `spec/scripts/ac-drift.js` … `spec/scripts/walkthrough.js`; after the build the
  offending-path list is `[]`) → writes tests/ceiling/sync-write-callers.test.js
- **AC-20261101-10-2**: WHEN `spec-status.js --root <empty dir> --json` is spawned with its stdout
  destroyed before it writes THE SYSTEM SHALL exit 0 on its own with no `EPIPE`, `Error:` or
  `at writeOut` on stderr, matching the open run's exit 0 and its payload
  `{"briefs": [], "specs": [], "superseded": [], "anomalies": []}` printed pretty (e.g. pre-image:
  exit 1 and a stack trace naming `EPIPE`; post-image: exit 0, empty stderr) → writes
  tests/ceiling/sync-write-callers.test.js
- **AC-20261101-10-3**: WHEN `count-tests.js --titles` meets a closed stdout over a >64 KiB
  payload, or `count-tests.js` with a missing `--root` meets a closed stderr, THE SYSTEM SHALL
  CONTINUE TO exit 0 (e.g. 2000 generated test titles, `| head`-style closed reader → exit 0, no
  trace) and SHALL CONTINUE TO exit 2 (e.g. `--root <missing>` with stderr destroyed → exit 2)
  → reuses tests/ceiling/count-tests.test.js :: count-tests.js treats
- **AC-20261101-10-4**: WHEN `spec-status.js --json` is run over a real pipe against a host whose
  payload exceeds the 64 KiB pipe buffer THE SYSTEM SHALL CONTINUE TO deliver the full payload
  with exit 0 (e.g. the 320-brief fixture whose file-redirect run proves the size; pipe run
  byte-identical to the file run) → reuses tests/queue/queue-overlay.test.js :: spec-status.js --json

## Assumptions (escalation triggers)

- A1: `fs.writeSync` to a destroyed pipe throws `EPIPE` synchronously on the first write of any
  size, and a caught EPIPE leaves the script's own exit in control — **checked** in spec 09's A1
  (Node v22.23.3 and v26.8.1: two small writes after `child.stdout.destroy()` → `caught EPIPE` /
  `second EPIPE`, then `process.exit(3)` → exit 3, no signal). **if false:** the D3 pin falls
  back to the >64 KiB fixture shape already in `tests/queue/queue-overlay.test.js`.
- A2: `spec-status.js --root <empty dir> --json` on the pre-image prints the pretty four-key empty
  object and exits 0 — **checked** on Node 26.8.1 against an empty scratch directory. **if
  false:** keep the closed-vs-open exit comparison and update the literal; STOP and ask if the
  exit differs.
- A3: the pre-image has `writeSync(` in exactly 13 files under `spec/scripts/` besides the library
  (spec 09 having landed first) — **checked**: `grep -rl "writeSync(" spec/scripts` lists 18 +
  the library today, five of which spec 09 owns. **if false:** the extra file is a new copy; it
  enters this spec's File Plan as a D1 row (record the deviation), never a sweep exemption.
- A4: the two reused pins resolve to exactly one pre-image test each by the prefixes
  `count-tests.js treats` and `spec-status.js --json` — **checked** via `count-tests --titles`.
  **if false:** grow the prefix until unique; never duplicate the test.
- A5: `lib/sync-write.js`'s `writeOut(fd, text)` takes a string and appends nothing — true per its
  header. **if false:** blocked; D1's wrapper contract is wrong.

## Rationale

This is the second half of the eighteen-caller migration the EPIPE fix queued; spec 09 took the
five writers that retried nothing, this spec takes the thirteen that retried EAGAIN and owns the
sweep, because the sweep can only go green once the last copy is gone. Thirteen source rows is one
over the ~12 guideline; splitting again would put a third spec between the fix and its guard for
no landing-unit gain, so the overage is accepted and noted. Critical tier comes from
`spec-status.js`, a § Risk Tiers surface with a frozen `--json` API — D3 pins it directly with a
closed-reader run and keeps the existing >64 KiB pipe pin as proof that bytes did not move.
Wrappers stay (D1) because that is where each script's framing lives; `fleet-reader.js` and
`red-check.js` pass Buffers today, so their wrappers convert rather than their call sites changing.
The sweep (D2) classifies by location and strips comments first — both host gotchas about evadable
guards — and judges the working tree, never a git ref. `spec-queue.js` already handled EPIPE
locally; it still migrates so the sweep has no exemption list. Fragile: the `reuses` pointers
cover nothing in `ac-matrix` until the IDs sit in the reused titles, hence the two tests-layer
MODIFY rows that change titles only — red-check reads them as sanctioned green pins.

## Canonical Delta

None — no `docs/canonical/` area exists for this repo's scripts.
