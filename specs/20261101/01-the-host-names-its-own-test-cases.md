---
date: 2026-11-01
status: implementing
build_base: main
tier: critical
area: test-scanning
breaking: false
depends_on: []
brief: n/a
open_markers: 0
diff_base: c6f833a7d10f4f87266ecbcf7638dee84685c368
---

# The host names its own test cases

## Goal

Test-file discovery is language-neutral, but the one reader of "a test case" understands only
line-start `test(`/`it(` JavaScript calls. On a host whose tests are not that shape (pytest, Go,
Rust, anything else), every test file is found and read as zero cases: `count-tests --titles`
prints nothing, `ac-matrix --lint --resolve-root` refuses every `→ reuses`/`→ rewrites` pointer
as `unresolved-disposition`, and the host can never pin an existing test. The plugin names no
language: a new optional grounding-contract key, `testCaseScanner`, lets the host declare the
command that lists its cases, and every consumer of "a test case" reads through one dispatch that
prefers the host's listing and falls back to the built-in JavaScript walker. Done means a host
that declares the key pins, counts, lints and expires its cases like a JavaScript host, a host
that declares nothing is byte-for-byte unchanged, and `/spec:init` and `/spec:doctor` know the key.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `spec/templates/grounding-contract.md` § Required config keys gains the optional key `testCaseScanner`: a shell command string run through `lib/host-run.js`'s `run` with cwd = the repo root, no placeholders, printing one case per stdout line — `<file> :: <title>` (file repo-relative POSIX, split at the first ` :: `) or a JSON object `{"file","title","start"?,"end"?}` (`start`/`end` 1-based inclusive line numbers bounding the case and any tag comment above it). Blank lines are skipped; any other line is malformed and never a case. Absent key = every test file is read by the built-in JavaScript walker, exactly as today. (AC-20261101-01-1, AC-20261101-01-2, AC-20261101-01-3, AC-20261101-01-16) | The repo supplies grounding, the plugin supplies process (core § Host Grounding); rejected: a built-in scanner per language (the plugin would then own a parser for every stack, against its language neutrality — the one that landed as `1814608a` was reset away before this plan) and a per-extension command map (a host command dispatches itself; one key, no extension vocabulary in the contract). |
| D2 | `lib/scan-test-calls.js` exports `scanCases(root, config, file, src)`: the host listing (`hostCases(root, config)`, run once per process per root, memoised) owns every file it names — the walker never runs on such a file; a file it does not name falls to `scanCalls(src)`. A host case with `start` and `end` carries char offsets `[start of line start, end of line end incl. its newline)`, `commentAbove` = that slice, `cuttable: true`; without a span `start = end = 0`, `commentAbove = ''`, `cuttable: false`. Every record carries `source: 'host' \| 'builtin'`. A scanner that exits non-zero, cannot spawn or exceeds 120 s yields zero host cases, one stderr line per process `testCaseScanner failed (exit <N>): <command>`, and every file falls to the walker. `resolveReference(root, file, prefix)` and `countCases(root, config)` read through `scanCases`; `scanCalls`/`scanDescribes` stay exported unchanged. (AC-20261101-01-1, AC-20261101-01-2, AC-20261101-01-4, AC-20261101-01-7) | One dispatch keeps the five consumers from disagreeing about what a case is; a failed scanner degrades to today's behaviour and is loud at lock through `unresolved-disposition`, never silently green. |
| D3 | `count-tests.js --titles` renders `scanCases` records; `--titles --file <rel>` that yields zero cases prints one stderr line `count-tests: 0 cases in <rel> (read by the built-in JavaScript walker)` or `… (read by testCaseScanner: <command>)`, exit still 0. New mode `--scanner-check [--json]`: absent key → `{"declared":false}` exit 0; declared → runs the scanner once and prints `{"declared":true,"command":"<cmd>","exit":N,"cases":N,"files":N,"malformed":N}`, exit 0 when `exit` is 0, `malformed` is 0 and `cases` ≥ 1, else exit 3 with one stderr line naming the failing field. `--json` on the plain count keeps printing exactly `{"count":N}`. (AC-20261101-01-5, AC-20261101-01-6, AC-20261101-01-14) | An empty `--titles` is today indistinguishable from "no scanner for this file"; the check is the one deterministic line `/spec:doctor` can print. |
| D4 | `ac-matrix.js --resolve-root`, `ac-drift.js` and `red-check.js` resolve a `rewrites`/`reuses` reference through `resolveReference`/`scanCases` (red-check's `matches` come from `scanCases`, never `scanCalls`); no consumer calls `scanCalls` with a filename in hand. (AC-20261101-01-2, AC-20261101-01-8) | The lock refusal and the pre-image colour must see the same case the author read off `--titles`. |
| D5 | `expire-tests.js` reads cases through `scanCases`. `unboundedReason` returns `its span is not known — the host scanner printed no start/end` first, before any other check, when `cuttable === false`; a host case with a span skips the JavaScript paren and indent checks and is cut by its lines after only the "holds a test that is not retired" check; a file whose cases came from the host listing is never deleted (`emptied` lists `builtin`-sourced files only), however many cases were cut. `[asked: JJ 2026-11-01 — a case without a span is never cut, and a host-named file is never deleted]` (AC-20261101-01-9, AC-20261101-01-10) | A span the host did not print cannot be cut safely; a span it did print is the host's own declaration, but deleting a whole file is the one irreversible step and stays the walker's alone. |
| D6 | `spec/commands/init.md` Phase 1 profiles the test runner's case shape and, when a stack's test files are not line-start `test(`/`it(` JavaScript calls, the profile's `config.testCaseScanner` is the stack's own listing piped into D1's line grammar (the runner's dry-run/collect-only output when it has one, else a grep over the stack's test-function convention; a pipeline longer than one line is written as `scripts/spec-test-cases.sh` and recorded in `manifestExtras`). `init-gen generate` validates a present key (non-empty string, else exit 2 naming `config.testCaseScanner`), adds the manifest row `{claim:"test-case scanner lists at least one case", kind:"exec", target:"<command> | grep -q ."}` and includes the command in `deriveAllowEntries`. (AC-20261101-01-11, AC-20261101-01-12, AC-20261101-01-13) | The pattern precedent is `patternsScript`/`testNameFilter`: the plugin names the contract, init writes the host's implementation and proves it runs before stamping. |
| D7 | `spec/commands/doctor.md` check 6 gains: `testCaseScanner` (if declared) — run `node "$(spec-paths count-tests)" --root . --scanner-check --json`; exit 3 → one ⚠️ line per failing field (`exit`, `malformed`, `cases`). (AC-20261101-01-14) | Doctor is the drift check of the grounding layer; a scanner that stopped listing cases is grounding drift. |
| D8 | `lib/invariants.js`'s `configCommandStrings` includes `testCaseScanner`. (AC-20261101-01-15) | Every host command string the config carries is in the one list the exec-recall sweep reads. |
| D9 | The library ships no language-specific scanner besides the JavaScript walker: `scanPythonCases` is not exported, and should the merge-back of `specs/20261031/01` re-land commit `1814608a`, the build removes `scanPythonCases` and `tests/ceiling/python-cases.test.js` as part of this spec. (AC-20261101-01-16) | The plugin is language-agnostic; that commit was reset off `main` on 2026-11-01 but survives on the open spec branch cut from it. |
| D10 | `node scripts/plugin-bump.js --bump --plugin spec --changelog "…"`. `[no-ac: node scripts/plugin-bump.js --check in the gate is the oracle]` | Behaviour change under `spec/` (pipeline rules § Planning). |
| D11 | A host case without a span is tagged by its `title` alone (A2: its `commentAbove` is `''`, and the file body outside a span is never read), so AC-20261101-01-9's fixture names the spanless case `AC-20260911-55-1 test_alpha` and its `unscannable` entry carries that title. `[auto-picked at build: resolves AC-9 against A2 — the bare title is untagged and skipped before the span check]` (AC-20261101-01-9) | AC-9 as locked could not hold without reading the file outside the span, which A2 forbids; citing the AC in the title is the only tag a spanless case has. |
| D12 | AC-20261101-01-8's stub `testCommand` is `node -e "process.exit(0)" --`: without the trailing `--`, node rejects the appended `--name=^test_gamma$` filter with `bad option: --name=^test_gamma$`, which names the title, so the run is read as selected-and-red and A6's premise (output never names the title) is not met. `[auto-picked at build: keeps A6's premise true rather than taking its if-false weakening]` (AC-20261101-01-8) | The trailing `--` makes node pass the filter as script argv and print nothing, so the leg exercises the unselected path the AC pins. |
| D13 | `spec/entrypoints.json` lists `spec/commands/doctor.md` as an entry point of `spec/scripts/count-tests.js`, because D7's check-6 line invokes `spec-paths count-tests`; added to the File Plan at build. Gate line: `tests/consistency/entrypoints.test.js` (AC-20260820-04-6). `[asked: JJ 2026-11-01 — add to scope]` | The entry-point registry must name every caller; the D7 doctor line is a new caller. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/templates/grounding-contract.md | MODIFY | doctrine | § Required config keys: the optional `testCaseScanner` paragraph (D1); `no dependency change` |
| spec/scripts/lib/scan-test-calls.js | MODIFY | scripts | `hostCases`, `scanCases(root, config, file, src)`, `source`/`cuttable` record fields, `resolveReference`/`countCases` through it, header rewritten (D2, D9) |
| spec/scripts/count-tests.js | MODIFY | scripts | `--titles` through `scanCases`, zero-case stderr note, `--scanner-check` (D3) |
| spec/scripts/ac-matrix.js | MODIFY | scripts | header prose: `resolveReference` reads the host listing when declared (D4) |
| spec/scripts/ac-drift.js | MODIFY | scripts | header prose as above (D4) |
| spec/scripts/red-check.js | MODIFY | scripts | per-test `matches` from `scanCases` (D4) |
| spec/scripts/expire-tests.js | MODIFY | scripts | cases through `scanCases`; `cuttable === false` refusal first; host-span cut path; host-scanned files never emptied (D5) |
| spec/scripts/lib/invariants.js | MODIFY | scripts | `testCaseScanner` in `configCommandStrings` (D8) |
| spec/scripts/init-gen.js | MODIFY | scripts | key validation, manifest exec row, `deriveAllowEntries` (D6) |
| spec/commands/init.md | MODIFY | doctrine | Phase 1 case-shape profiling and Phase 4 `config.testCaseScanner` bullet (D6) |
| spec/commands/doctor.md | MODIFY | doctrine | check 6 `--scanner-check` line (D7) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | `node scripts/plugin-bump.js --bump --plugin spec --changelog "…"` (D10) |
| .claude/spec.config.json | MODIFY | other | `contractHash` re-stamped to `$(spec-paths contract-hash)` after the D1 edit (the existing stamp pin in tests/consistency/contract-stamp.test.js) |
| spec/entrypoints.json | MODIFY | other | `spec/commands/doctor.md` added to `count-tests.js`'s entry points (D13) |
| tests/ceiling/host-scanner.test.js | CREATE | tests | AC-20261101-01-1, AC-20261101-01-2, AC-20261101-01-3, AC-20261101-01-4, AC-20261101-01-5, AC-20261101-01-6, AC-20261101-01-7, AC-20261101-01-8, AC-20261101-01-9, AC-20261101-01-10, AC-20261101-01-15, AC-20261101-01-16 |
| tests/init-gen/host-scanner-key.test.js | CREATE | tests | AC-20261101-01-11, AC-20261101-01-12, AC-20261101-01-13, AC-20261101-01-14 |

## Contracts

`.claude/spec.config.json` (D1):

```jsonc
"testCaseScanner": "<shell command>"   // optional; absent = built-in JavaScript walker for every file
```

Scanner stdout grammar (D1), one case per line:

```
<file> :: <title>                                   // file repo-relative POSIX; split at the FIRST " :: "
{"file":"<rel>","title":"<t>","start":12,"end":15}  // JSON object; start/end optional, 1-based inclusive lines
                                                    // blank line: skipped; anything else: malformed (counted, never a case)
```

`lib/scan-test-calls.js` (D2):

```js
hostCases(root, config)        // -> { ok: bool, exit: number|null, command: string|null, byFile: Map<rel, Case[]>, malformed: number }
                               //    memoised per root per process; absent key -> { ok: true, exit: null, command: null, byFile: empty, malformed: 0 }
scanCases(root, config, file, src) // -> Case[]; file is repo-relative POSIX; host listing owns a named file, else scanCalls(src)
resolveReference(root, file, prefix) // config = readConfig(root); through scanCases
countCases(root, config)           // through scanCases
// Case: { start, end, callText, title, commentAbove, cuttable: boolean, source: 'host' | 'builtin' }
//   builtin: today's fields, cuttable true, source 'builtin'
//   host with span: start = offset of line `start`, end = offset just past line `end`'s newline (or src.length),
//                   callText '', commentAbove src.slice(start, end), cuttable true
//   host without span: start 0, end 0, callText '', commentAbove '', cuttable false
```

Scanner failure (D2): spawn error, non-zero exit or 120 s timeout → `ok: false`, `byFile` empty,
stderr once per process: `testCaseScanner failed (exit <N>): <command>` (`exit` is `127` on a
spawn error, `null` printed as `timeout` on timeout).

`count-tests.js` (D3):

```
count-tests.js --root <dir> --titles --file <rel>      # zero cases -> stderr:
  count-tests: 0 cases in <rel> (read by the built-in JavaScript walker)
  count-tests: 0 cases in <rel> (read by testCaseScanner: <command>)
count-tests.js --root <dir> --scanner-check [--json]
  absent   -> {"declared":false}                                              exit 0
  declared -> {"declared":true,"command":"<cmd>","exit":N,"cases":N,"files":N,"malformed":N}
              exit 0 iff exit === 0 && malformed === 0 && cases >= 1, else exit 3 and one stderr line
              `count-tests: testCaseScanner <field> — <value>` for the first failing field
  human form prints the same fields one per line as `<field>: <value>`
```

`expire-tests.js` (D5): `unboundedReason` first line —
`if (rec.cuttable === false) return 'its span is not known — the host scanner printed no start/end'`;
a `source === 'host'` record with a span runs only the not-retired-inner-case check; `emptied`
never lists a file any of whose scanned cases is `source === 'host'`.

`init-gen.js` (D6): `validateProfile` — when `config.testCaseScanner` is present and is not a
non-empty string, exit 2 with `init-gen: profile field "config.testCaseScanner" must be a non-empty
shell command string`; `buildManifestObject` adds
`{ claim: 'test-case scanner lists at least one case', kind: 'exec', target: '<command> | grep -q .' }`;
`deriveAllowEntries` appends the command to `cmds`.

`spec/commands/doctor.md` check 6 (D7) gains the sentence:
`testCaseScanner` (if declared) — run `node "$(spec-paths count-tests)" --root . --scanner-check --json`; exit 3 prints one ⚠️ line per failing field.

## Behavior

Fixture host for the ACs (`tests/ceiling/host-scanner.test.js`): a `tmpdir` root with
`.claude/spec.config.json`, `tests/a.test.js` holding one JavaScript case `test('js case', …)`,
`tests/test_x.py` holding `# AC-20260911-55-1`, `def test_alpha():`, `def test_beta():` and
`class TestThing:` / `def test_gamma(self):` (never parsed by the plugin — the file is opaque
bytes), and a scanner that needs no interpreter beyond Node: `node scanner.js`, where
`scanner.js` prints a fixed listing. The declared listing is:

```
tests/test_x.py :: test_alpha
tests/test_x.py :: test_beta
{"file":"tests/test_x.py","title":"test_gamma","start":9,"end":11}
```

With that config: `--json` counts 4 (three host cases plus the walker's JavaScript case for the
unnamed `tests/a.test.js`); `--titles --file tests/test_x.py` lists the three titles; a spec AC
`→ reuses tests/test_x.py :: test_gamma` resolves to one match. Without the key: `--json` counts 1
and `--titles --file tests/test_x.py` prints nothing on stdout and the walker note on stderr.

Expiry over the fixture (`--spec specs/20260911/55-closing.md --apply --json`, the done spec
owning `AC-20260911-55-1`): `test_alpha` has no span → `unscannable` with the D5 reason, the file
byte-identical. A second listing where `test_alpha` carries `"start":5,"end":7` (the `# AC-…`
line through the body) → lines 5–7 are cut, `retired` holds it, the file is not deleted even if
no case remains.

Failure path: config `testCaseScanner: "exit 3"` → `--scanner-check` exits 3 with
`exit — 3`; `--json` count is 1 (every file fell to the walker); stderr carries
`testCaseScanner failed (exit 3): exit 3` once.

## Acceptance Criteria

- **AC-20261101-01-1**: WHEN `count-tests.js --root <fixture> --json` runs over the fixture host whose `testCaseScanner` prints the three-line listing above THE SYSTEM SHALL print exactly `{"count":4}` and exit 0 (three host cases plus `tests/a.test.js`'s one walker case) → writes tests/ceiling/host-scanner.test.js
- **AC-20261101-01-2**: WHEN `ac-matrix.js --spec <spec> --lint --resolve-root <fixture> --json` runs over a spec whose only AC ends `→ reuses tests/test_x.py :: test_gamma` THE SYSTEM SHALL report zero `unresolved-disposition` findings, `observed.lint.unresolvedDisposition` equal to `0`, and exit 0 (e.g. the same spec against the fixture with the key removed → one `unresolved-disposition` finding reading `resolved to 0 matches`) → writes tests/ceiling/host-scanner.test.js
- **AC-20261101-01-3**: WHEN the listing holds a blank line and the line `garbage without separator` THE SYSTEM SHALL skip the blank line and count the other as malformed (`--scanner-check --json` → `"malformed":1`, `"cases":3`), and WHEN a line reads `tests/test_x.py :: a :: b` THE SYSTEM SHALL read file `tests/test_x.py` and title `a :: b` → writes tests/ceiling/host-scanner.test.js
- **AC-20261101-01-4**: WHEN `testCaseScanner` is `exit 3` THE SYSTEM SHALL print `{"count":1}` for `--json` (every file fell to the built-in walker) and write exactly one stderr line `testCaseScanner failed (exit 3): exit 3` → writes tests/ceiling/host-scanner.test.js
- **AC-20261101-01-5**: WHEN `count-tests.js --root <fixture> --titles --file tests/test_x.py` runs THE SYSTEM SHALL print exactly `tests/test_x.py :: test_alpha`, `tests/test_x.py :: test_beta`, `tests/test_x.py :: test_gamma` on stdout and nothing on stderr; WHEN the same runs with the key absent THE SYSTEM SHALL print nothing on stdout, exit 0, and write the one stderr line `count-tests: 0 cases in tests/test_x.py (read by the built-in JavaScript walker)`; WHEN the key is declared but the listing never names `tests/nothing.py` THE SYSTEM SHALL write `count-tests: 0 cases in tests/nothing.py (read by testCaseScanner: node scanner.js)` → writes tests/ceiling/host-scanner.test.js
- **AC-20261101-01-6**: WHEN `count-tests.js --root <fixture> --scanner-check --json` runs THE SYSTEM SHALL print `{"declared":true,"command":"node scanner.js","exit":0,"cases":3,"files":1,"malformed":0}` and exit 0; with the key absent print `{"declared":false}` and exit 0; with `testCaseScanner` set to `exit 3` print `"exit":3` and exit 3 with stderr `count-tests: testCaseScanner exit — 3`; with a listing of only blank lines exit 3 with stderr `count-tests: testCaseScanner cases — 0` → writes tests/ceiling/host-scanner.test.js
- **AC-20261101-01-7**: WHEN `scanCases(root, config, 'tests/test_x.py', src)` is called THE SYSTEM SHALL return three records with `source` `host`, `test_gamma` carrying `cuttable` `true` and `commentAbove` equal to lines 9–11 of the file (e.g. the slice starting `class TestThing:` and ending after `pass\n`), and `test_alpha` carrying `cuttable` `false`, `start` `0`, `end` `0`; and WHEN called for `tests/a.test.js` THE SYSTEM SHALL return one record with `source` `builtin` and `cuttable` `true` → writes tests/ceiling/host-scanner.test.js
- **AC-20261101-01-8**: WHEN `red-check.js --spec <spec> --root <fixture> --base <sha> --json` runs with `testCommand` `node -e "process.exit(0)" --` (D12), `testNameFilter` `--name={name}` and an AC `→ reuses tests/test_x.py :: test_gamma` THE SYSTEM SHALL record a disposition for that AC with `prefix` `test_gamma` and `fallback` equal to `unselected` (the stub run's output never names the title), never `unresolved` → writes tests/ceiling/host-scanner.test.js
- **AC-20261101-01-9**: WHEN `expire-tests.js --root <fixture> --spec specs/20260911/55-closing.md --apply --json` runs with the case listed without a span as `AC-20260911-55-1 test_alpha` (D11) THE SYSTEM SHALL leave `tests/test_x.py` byte-identical, list `{file:"tests/test_x.py", title:"AC-20260911-55-1 test_alpha", reason:"its span is not known — the host scanner printed no start/end"}` under `unscannable`, `retired` empty and `emptied` `[]` → writes tests/ceiling/host-scanner.test.js
- **AC-20261101-01-10**: WHEN the same run uses a listing where `test_alpha` carries `"start":5,"end":7` THE SYSTEM SHALL cut exactly lines 5–7 of `tests/test_x.py` (the `# AC-20260911-55-1` line, `def test_alpha():` and its `    assert True`), list it under `retired`, and WHEN every case of the file is listed with a span and retired THE SYSTEM SHALL still leave the file on disk with `emptied` `[]` → writes tests/ceiling/host-scanner.test.js
- **AC-20261101-01-11**: WHEN `init-gen.js generate --root <host> --profile <p>` runs with `config.testCaseScanner` equal to `node scanner.js` and a `scanner.js` printing one listing line THE SYSTEM SHALL exit 0, write the key verbatim into `.claude/spec.config.json`, and `.claude/spec-manifest.json` SHALL hold the row `{"claim":"test-case scanner lists at least one case","kind":"exec","target":"node scanner.js | grep -q ."}` → writes tests/init-gen/host-scanner-key.test.js
- **AC-20261101-01-12**: WHEN the profile's `config.testCaseScanner` is `""` or `42` THE SYSTEM SHALL exit 2 with stderr containing `profile field "config.testCaseScanner" must be a non-empty shell command string` and write no config → writes tests/init-gen/host-scanner-key.test.js
- **AC-20261101-01-13**: WHEN generate succeeds with `config.testCaseScanner` `node scanner.js` THE SYSTEM SHALL write `Bash(node scanner.js:*)` into `.claude/settings.json`'s `permissions.allow` → writes tests/init-gen/host-scanner-key.test.js
- **AC-20261101-01-14**: WHEN `spec/commands/doctor.md`'s check 6 is read THE SYSTEM SHALL name `testCaseScanner` and the literal `--scanner-check`, and WHEN `spec/commands/init.md` is read THE SYSTEM SHALL name `config.testCaseScanner` in Phase 4 and `scripts/spec-test-cases.sh` → writes tests/init-gen/host-scanner-key.test.js
- **AC-20261101-01-15**: WHEN `configCommandStrings({ testCaseScanner: 'node scanner.js' })` is called THE SYSTEM SHALL include `node scanner.js` in its result → writes tests/ceiling/host-scanner.test.js
- **AC-20261101-01-16**: WHEN `require('spec/scripts/lib/scan-test-calls.js')` is read THE SYSTEM SHALL export no `scanPythonCases`, and WHEN no `testCaseScanner` is declared THE SYSTEM SHALL count `tests/test_x.py` as 0 cases (`--json` over the fixture → `{"count":1}`) → writes tests/ceiling/host-scanner.test.js
- **AC-20261101-01-17**: WHEN `count-tests.js --root <fixture> --json` runs over a host that declares no `testCaseScanner` and holds five line-start `test()`/`it()` calls beside a `"test("` string, a `// test(` comment, a `describe(` and a `t.test(` THE SYSTEM SHALL CONTINUE TO print `{"count":5}` and exit 0 → reuses tests/ceiling/count-tests.test.js :: AC-20260911-02-1:
- **AC-20261101-01-18**: WHEN a retired JavaScript case holds JSX text with an apostrophe or a URL and no `testCaseScanner` is declared THE SYSTEM SHALL CONTINUE TO leave its file byte-identical, report it under `unscannable` and apply the rest of the sweep → reuses tests/expiry/test-expiry.test.js :: WHEN a retired
- **AC-20261101-01-19**: WHEN a `rewrites` disposition's own named JavaScript case already passes against the pre-image on a host with `testNameFilter` and no `testCaseScanner` THE SYSTEM SHALL CONTINUE TO emit `gutted-rewrite` naming the AC and the prefix → reuses tests/disposition/red-check-per-test.test.js :: AC-20260911-04-6:

## Assumptions (escalation triggers)

- A1: `lib/host-run.js`'s `run(command, {cwd, timeout})` returns `spawnSync`'s result (`status`, `stdout`, `stderr`, `error`) and `spawnSync` reports a timeout as `error.code === 'ETIMEDOUT'` with `status null` (Node core, no third-party adjudicator — no spike) — **if false:** read the timeout from `signal === 'SIGTERM'` with `status null`; the printed word stays `timeout`.
- A2: `expire-tests.js`'s `citedAcIds` reads `title` and `commentAbove` only (checked this session, line 313) so a host case with a span whose lines include the `# AC-…` comment is tagged, and one without a span is untagged and skipped — **if false:** extend `citedAcIds` to read `callText` too; never read the file body outside the span.
- A3: `tests/ceiling/count-tests.test.js` pins `--json` with `deepStrictEqual(out, {count: 5})` (line 59), so `--scanner-check` must be a separate mode, never an added key — **if false:** keep the separate mode anyway; D3 is unchanged.
- A4: `manifest-check.sh`'s `exec` kind runs the target with `bash -c` from the repo root and requires exit 0 (line 52–54), so `<command> | grep -q .` is a valid proof of at least one listing line — **if false:** the row's target becomes a `count-tests --scanner-check` invocation through `spec-paths`.
- A5: No test outside the File Plan asserts the exact export set of `lib/scan-test-calls.js` or the exact stderr of `count-tests.js --titles` (grep this session: `tests/ceiling/count-tests.test.js` line 440 calls `scanCalls` directly, which stays) — **if false:** the hit enters the File Plan as a fix row, retagged, never weakened.
- A6: `red-check.js`'s per-test leg, given a `testCommand` whose output never names the title, records `fallback: 'unselected'` (lines 560–568) — **if false:** AC-8 asserts `fallback !== 'unresolved'` and whichever non-`unresolved` value the leg records.
- A7: The merge-back of `specs/20261031/01` lands before this spec builds and re-lands `1814608a` (`scanPythonCases`, `tests/ceiling/python-cases.test.js`) — **if false** (merged after, or the commit dropped from that branch): D9's removal is a no-op; AC-16 stays green by absence; nothing else changes.

## Rationale

The defect is a seam between two readers: discovery (`DEFAULT_TEST_GLOBS`) is neutral, the case
reader is JavaScript-only, and nothing between them says so. Three remedies were weighed. A
built-in scanner per language was built, tested and reverted in this session: it fixes pytest and
leaves Go, Rust, Ruby, PHP and every runner's `python_functions`-style override exactly as broken,
while making the plugin own a parser it can never keep current — the plugin is language-agnostic
by principle (core § Host Grounding), and nothing in `specs/20260911/02` or `04` ever decided
"JavaScript only". A per-extension map of commands puts an extension vocabulary into the contract
for no gain, since a host command can dispatch on its own. The chosen shape mirrors
`patternsScript` and `testNameFilter`: the plugin fixes a line grammar and a fallback, init
writes the host's implementation and proves it runs, doctor re-checks it.

The listing is whole-repo rather than per-file so a pytest-sized suite costs one interpreter
start per process, not one per file; the host's output owns the files it names so a polyglot
host's JavaScript files keep the walker's spans and cutting. Spans are optional because most
runners' listings carry none; a case without one is simply never cut (`unscannable`), which is
the conservative branch expiry already has. A host-named file is never deleted because the walker
cannot judge whether non-case content in an opaque file matters.

The failure path degrades to today's behaviour and prints once, so a broken scanner on a
JavaScript-only host costs nothing, while on a pytest host the lock refuses the pointer loudly
through `unresolved-disposition` — the same signal that reported this defect. Ledger check: no
`unresolved-disposition` row and no pytest host in any of the ten repos' ledgers, so this is a
first incident; the guard is the contract, not a new standing script.

Tier is critical because the grounding-contract edit re-stamps every host (pipeline rules § Risk
Tiers); the `.claude/spec.config.json` row is that re-stamp. D9 exists because the reverted commit
survives on the open `spec/01-the-escape-row-follows-the-diagnosed-file` branch and returns with
its merge-back.

Collision closure (lock, `--literal scanPythonCases`): zero literals-leg hits — the name exists on no
branch this plan reads. The 35 `executes` hits are the suites that run `count-tests.js`, `ac-matrix.js`,
`ac-drift.js`, `red-check.js`, `expire-tests.js` and `init-gen.js`; every one runs a host that declares no
`testCaseScanner`, the path D1 leaves byte-for-byte unchanged (AC-17, AC-18, AC-19 pin it), so they are
waived as visibility; the build-time suite check adjudicates.

## Canonical Delta

docs/canonical/scripts.md, the paragraph beginning "A repo's test count is instrumented, not
capped.": replace its second sentence through "and `count-tests.js` reports it" with
"`lib/scan-test-calls.js` is the one definition of a test case: when the host config declares
`testCaseScanner`, that command's listing (`<file> :: <title>` or JSON lines with optional 1-based
`start`/`end` lines) owns every file it names, and every other test-classified file is read by the
built-in JavaScript walker (a `test(`/`it(` call at line start, blind to strings, comments and regex
literals); `scanCases(root, config, file, src)` is the one dispatch that `count-tests.js`,
`ac-matrix.js`, `ac-drift.js`, `red-check.js` and `expire-tests.js` read through, and
`count-tests.js` reports the count". Append after "`--json` → `{"count":N}`)": "A host case without
a span is never cut by expiry and a host-named file is never deleted; `count-tests.js
--scanner-check` is `/spec:doctor` check 6's proof that a declared scanner still lists cases, and
`--titles --file` names on stderr which reader saw zero cases
(specs/20261101/01-the-host-names-its-own-test-cases.md)."
