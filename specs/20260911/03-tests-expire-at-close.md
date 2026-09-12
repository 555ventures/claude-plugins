---
date: 2026-09-11
status: implementing
build_base: main
tier: critical
area: review-close
design: false
breaking: false
depends_on: [specs/20260911/02-tests-have-a-ceiling.md]
depended_on_by: []
brief: n/a
open_markers: 0
diff_base: b8673741aaa1713b7ab91b7fc68338a5cf85da4a
---

# Tests expire at close

## Goal

A spec's tests die when the spec does. When `/spec:review` flips a spec to `done`, every test
tagged with that spec's AC-IDs is deleted unless it cites a ledger escape class, exercises a
script the pipeline itself runs, or pins an opt-in `SHALL CONTINUE TO` criterion. The close
ledger row records `tests:{born,kept,retired}`. The same rule runs once over every done spec
in a host through `/spec:doctor`, so prax and salon-os shed their closed specs' tests the same
way this repo did by hand on 2026-09-11. Done means: a review close in a fixture host deletes
the expired tests and stamps the row, the doctor dry run reports zero retirable tests in this
repo at HEAD, and untagged tests are never touched by either path.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `spec/scripts/lib/invariants.js` exports `deriveInvariants(root, config)` → `{roots, scripts, edges}`: the universe is every `.js/.mjs/.cjs/.ts/.sh` file under the root outside the skip dirs and outside test-classified files; roots are the script basenames named in the host config's command strings (`gateCommand`, `testCommand`, `postGateCommand`, `setupCommand`, `patternsScript`, every `runtime.*`, `design.*` and `testEnv[].provision` string), in hook commands (`.claude/settings.json` `hooks` and every `*/hooks/hooks.json` at depth ≤ 2), and the four pipeline entrypoints `review-legs.js`, `spec-review-driver.js`, `spec-build-driver.js`, `verdict.js` where present; edges are comment-stripped `name.ext` mentions resolved by basename plus relative `require('./x')` / `import … from './x'` paths resolved with `.js`/`.cjs`/`.mjs`/`.ts`/`/index.js`; the set is the transitive closure — never a hand list, never a checked-in file (AC-20260911-03-1, AC-20260911-03-2). | A hand list of ten scripts dropped coverage for `red-check.js`, `ac-matrix.js` and the build driver; a stored derived file is the ratchet baseline again. |
| D2 | A test is *tagged* when an AC-ID (the `AC_ID_RE_GLOBAL` grammar) occurs in its title or in the contiguous comment block directly above the call (`lib/scan-test-calls.js`'s `commentAbove`); untagged tests are never read for anything else and never modified (AC-20260911-03-3). | The 2026-09-11 sweep rule that survived contact; a tag anywhere else in the file is another test's tag. |
| D3 | A tagged test is *retired* when every AC-ID it cites belongs to a spec whose `status` is `done` (in `--spec` mode the closing spec counts as done) and none of: (a) its call text contains an escape class id collected from every `class` key on the host's `.claude/spec-runs.jsonl` rows (top-level or nested in `incidents[]`); (b) its file's text contains the basename of a script in the invariants set; (c) any cited AC bullet, read whole with `normalizeForPinCheck`, contains `SHALL CONTINUE TO` and its spec is dated ≥ `20260911`. A cited AC-ID whose spec file cannot be found, or whose spec is not done, keeps the test (AC-20260911-03-3, AC-20260911-03-5). | Fail-safe in every unknown: a test is only deleted when its whole reason to exist is proven expired. |
| D4 | `spec/scripts/expire-tests.js --root <r> (--spec <path> \| --all-done) [--apply] [--json]`; `--invariants` prints D1's set and exits. Dry run by default; `--apply` removes each retired test from `start` to `end` (comment through trailing `;`/newline), collapses runs of three-plus blank lines, deletes a file left with zero calls and any directory left empty. `--json` prints `{scope, scanned, tagged, kept:{class,invariant,pin,open}, retired:[{file,acIds,title}], emptied:[…], applied}`; exit 0 on success, 2 on usage error or unreadable root (AC-20260911-03-4, AC-20260911-03-6). | One script, two scopes; the driver and the doctor call the same derivation. |
| D5 | `spec-review-driver.js`'s `doCloseWork()` runs `expire-tests.js --root <repoRoot> --spec <specRel> --apply --json` after the authoritative verdict and before `appendLedger`; the review row gains `tests:{born,kept,retired}` (`born` = tagged tests in scope, `retired` = `retired.length`, `kept` = born − retired); a non-zero exit or unparseable output refuses the close (`die`, status unchanged) naming `node "$(spec-paths test-expiry)" --root . --spec <spec>` as the remedy (AC-20260911-03-7; refusal `[no-ac: forcing the plugin's own script to fail needs a broken plugin tree, not a fixture]`). | The row is the only durable record of what died; a skipped expiry is the vacuous-green class close enforcement exists to refuse. |
| D6 | The CLOSE step text prints one line `🧹 expired <retired> tests (<n> files removed) — part of the close commit` when `retired > 0` and nothing otherwise; the deleted files ride the existing close commit and `--mark closed`'s gate re-run proves the tree green without them (AC-20260911-03-7). | A deletion the gate re-run cannot see would be an unverified write; the close mark already re-runs the gate last. |
| D7 | `/spec:doctor` check 20 "Expired tests still present" runs `node "$(spec-paths test-expiry)" --root . --all-done` (dry run) and reports the retirable count and files; the remedy is the same command with `--apply`, run only after one `AskUserQuestion` that names the count and the files it will delete — never under `--fix`'s line-item path and never silently (AC-20260911-03-8 `[oracle: gate]`). | Bulk deletion of a host's tests is a product decision; a doctor patch batch of ≤4 cannot carry it. |
| D8 | `spec/bin/spec-paths` gains `test-expiry`; `spec/entrypoints.json` gains a row for `expire-tests.js` (entry points: `spec-review-driver.js`, `doctor.md`) — and NOT one for `lib/invariants.js`, because the manifest's own scan excludes `spec/scripts/lib/` by construction (`tests/consistency/entrypoints.test.js` asserts one key per scanned executable, and no other `lib/` module carries a row); the plugin version bumps via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` (AC-20260911-03-8 `[oracle: gate]`). | Same manifest and version discipline as every executable. |
| D9 | Live-repo pin: `expire-tests.js --root . --all-done --json` at HEAD reports `retired: []`, and `--invariants` lists `review-legs.js`, `red-check.js`, `ac-matrix.js`, `spec-build-driver.js` and `lib/driver-io.js` (AC-20260911-03-2, AC-20260911-03-9). | The hand sweep already ran here; a non-empty result at HEAD is a rule drift, and the lib row proves the extension-less-require gap is closed. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/invariants.js | CREATE | scripts | `deriveInvariants(root, config)` per D1 |
| spec/scripts/expire-tests.js | CREATE | scripts | CLI per D3/D4; uses `lib/scan-test-calls.js`, `lib/invariants.js`, `lib/spec-sections.js` (`parseAcBullets`, `normalizeForPinCheck`, `AC_ID_RE_GLOBAL`), `lib/frontmatter.js`, `lib/host-config.js` |
| spec/scripts/spec-review-driver.js | MODIFY | scripts | `doCloseWork()` expiry call + `tests` row key (D5); CLOSE step 🧹 line (D6) |
| spec/commands/doctor.md | MODIFY | doctrine | Check 20 per D7 (fits the 500-line read-load budget: doctor loads 420 today) |
| spec/bin/spec-paths | MODIFY | scripts | Key `test-expiry`; usage line updated (D8) |
| spec/entrypoints.json | MODIFY | other | Row for expire-tests.js (D8) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` (D8) |
| tests/expiry/invariants.test.js | CREATE | tests | AC-20260911-03-1, AC-20260911-03-2 |
| tests/expiry/test-expiry.test.js | CREATE | tests | AC-20260911-03-3, AC-20260911-03-4, AC-20260911-03-5, AC-20260911-03-6, AC-20260911-03-9 |
| tests/review/review-driver-close-expiry.test.js | CREATE | tests | AC-20260911-03-7 |

Orchestrator duty outside the table: `docs/canonical/review-close.md` gains the Canonical
Delta paragraph at review close, not in the build.

## Contracts

```text
node spec/scripts/expire-tests.js --root <r> --spec <spec path>  [--apply] [--json]
node spec/scripts/expire-tests.js --root <r> --all-done          [--apply] [--json]
node spec/scripts/expire-tests.js --root <r> --invariants        [--json]
  exit 0 success (dry run or applied); exit 2 usage / unreadable root or specs dir
  --json:
  {"scope":"spec:<rel>"|"all-done","scanned":N,"tagged":N,
   "kept":{"class":N,"invariant":N,"pin":N,"open":N},
   "retired":[{"file":"<rel>","acIds":["AC-…"],"title":"…"}],
   "emptied":["<rel>"],"applied":true|false}
  --invariants --json: {"roots":["<rel>"],"scripts":["<rel>"],"edges":{"<rel>":["<rel>"]}}
  human render: one line per retired test `retire <file> — <title>`, then
  `expiry: scanned N tagged N kept N retired N (dry run | applied)`; `--invariants` prints one
  path per line.

review ledger row (close) gains, after `gotchas` when present:
  "tests":{"born":N,"kept":N,"retired":N}

lib/invariants.js
  deriveInvariants(root, config) -> { roots: string[], scripts: string[], edges: {[rel]: rel[]} }
  (repo-relative POSIX paths, sorted)
```

## Behavior

- Scope: `--spec` reads the spec's `## Acceptance Criteria` bullets and scans only tests that
  cite one of its AC-IDs; `--all-done` scans every tagged test in the host's test-classified
  files. Both classify each tagged test exactly once as `class`, `invariant`, `pin`, `open`
  (a cited AC of a spec that is not done, or whose spec file is missing), or `retired`.
- A test citing AC-IDs of two specs is retired only when both specs are done and no clause
  keeps it; with `--spec` on one of them while the other is `implementing` the test is `open`.
- Pins: `- **AC-20260912-01-1**: WHEN a THE SYSTEM SHALL\n  CONTINUE TO b` is a pin (bullet read
  whole); the same bullet in `specs/20260901/…` is not (pre-floor pins expired with the hand
  sweep); `SHALL CONTINUE TO` in a spec's prose outside an AC bullet is nothing.
- Removal: a retired test's span runs from the start of the comment block directly above it
  (or its line) through its closing `)` plus a trailing `;` and newline; a neighbouring test whose
  body holds `/atlas\)" stop open/` stays byte-identical and the file still parses
  (`node --check`).
- Close: after the verdict pass the driver applies expiry, appends the row with `tests`, flips
  `status: done`; the step text shows the 🧹 line; the close commit carries the deletions;
  `--mark closed` re-runs the gate over that tree.
- Doctor: check 20 prints `expired tests present: N in M files` (or `none`); the remedy line is
  the `--apply` command; the session asks once before running it.

## Acceptance Criteria

- **AC-20260911-03-1**: WHEN `deriveInvariants` runs over a fixture host whose config declares
  `gateCommand: "bash scripts/gate.sh"`, where `gate.sh` runs `node scripts/a.js` and mentions
  `d.js` only in a `#` comment, `a.js` has `require('./lib/b')`, and `scripts/c.js` is referenced
  by nothing THE SYSTEM SHALL return `scripts` = `["scripts/a.js","scripts/gate.sh",
  "scripts/lib/b.js"]` (no `c.js`, no `d.js`) → test in tests/expiry/invariants.test.js
- **AC-20260911-03-2**: WHEN `expire-tests.js --root . --invariants` runs over this repository
  THE SYSTEM SHALL list `spec/scripts/review-legs.js`, `spec/scripts/red-check.js`,
  `spec/scripts/ac-matrix.js`, `spec/scripts/spec-build-driver.js` and
  `spec/scripts/lib/driver-io.js`, and SHALL NOT list `spec/scripts/memory-sweep.js` → test in
  tests/expiry/invariants.test.js
- **AC-20260911-03-3**: WHEN `expire-tests.js --spec <done spec> --json` (dry run) runs over a
  fixture host holding one test per outcome — cites an escape class (`kept.class`), lives in a
  file naming an invariant script (`kept.invariant`), cites a `SHALL CONTINUE TO` AC of a spec
  dated `20260912` (`kept.pin`), also cites an AC of an `implementing` spec (`kept.open`), and a
  plain tagged test (`retired`) — plus one untagged test THE SYSTEM SHALL print
  `{"tagged":5,"kept":{"class":1,"invariant":1,"pin":1,"open":1},"retired":[<the one>]…,
  "applied":false}` and leave every file byte-identical → test in tests/expiry/test-expiry.test.js
- **AC-20260911-03-4**: WHEN the same run adds `--apply` THE SYSTEM SHALL remove the retired
  test and its comment block, leave the four kept tests and the untagged test byte-identical,
  delete a file whose only test was retired together with its now-empty directory, and list it
  under `emptied` (e.g. `tests/old/gone.test.js` → absent, `tests/old/` → absent) → test in
  tests/expiry/test-expiry.test.js
- **AC-20260911-03-5**: WHEN a cited AC bullet wraps its pin onto a continuation line
  (`SHALL\n  CONTINUE TO`) THE SYSTEM SHALL classify the test as `pin`; WHEN the identical
  bullet sits in a spec dated `20260901` THE SYSTEM SHALL classify it `retired` → test in
  tests/expiry/test-expiry.test.js
- **AC-20260911-03-6**: WHEN `--apply` retires a test whose neighbour holds a regex literal with
  a quote and a paren (`/atlas\)" stop open/`) THE SYSTEM SHALL leave the neighbour byte-identical
  and the file SHALL pass `node --check` → test in tests/expiry/test-expiry.test.js
- **AC-20260911-03-7**: WHEN the review driver reaches CLOSE for a fixture spec whose two tagged
  tests are one pin and one plain test THE SYSTEM SHALL delete the plain test before the ledger
  append, write `"tests":{"born":2,"kept":1,"retired":1}` on the review row, flip
  `status: done`, and print `🧹 expired 1 tests (0 files removed)` in the CLOSE step; WHEN nothing
  is retired THE SYSTEM SHALL write `{"born":N,"kept":N,"retired":0}` and print no 🧹 line → test
  in tests/review/review-driver-close-expiry.test.js
- **AC-20260911-03-8** `[oracle: gate]`: WHEN the gate runs THE SYSTEM SHALL resolve
  `spec-paths test-expiry`, find the literal `spec-paths test-expiry` at each declared entry
  point (`spec/commands/doctor.md` check 20 and the review driver), find a `spec/entrypoints.json`
  row for every new file, and pass `scripts/plugin-bump.js --check`
- **AC-20260911-03-9**: WHEN `expire-tests.js --root . --all-done --json` runs over this
  repository at HEAD THE SYSTEM SHALL report `"retired":[]` and `"applied":false` → test in
  tests/expiry/test-expiry.test.js

## Assumptions (escalation triggers)

- A1: The scanner and pin rules are spec 02's `lib/scan-test-calls.js` and the executed spike recorded
  there (2 calls counted past a quoted regex literal; a wrapped pin reads as a pin only after
  collapsing continuation lines) — **if false:** fix the shared scanner in this build as an
  out-of-plan row, never a second scanner here.
- A2: The hand sweep of 2026-09-11 applied D3 minus the `open` clause and with an invariants set
  that missed extension-less `lib/` requires, both of which only widen `kept`; so `--all-done`
  at HEAD retires nothing (AC-9) — **if false:** the reported tests are expired by construction:
  apply in the build, list them in the deviations sidecar, keep AC-9 as written.
- A3: The review row's key set tolerates `tests` — `tests/run-ledger.test.js` pins no review-row
  key list (grep executed: no `stage:"review"` key assertion) — **if false:** extend that pin in
  the same build as an out-of-plan row.
- A4: Hosts' tests are TypeScript `it(`/`test(` under `describe(` blocks (prax 239 files, salon-os
  182, both `**/*.test.*`/`**/*.spec.*`-classified — executed count); the scanner is
  language-agnostic at line start — **if false** (a host uses `test.each` or decorators for
  AC-tagged tests): those tests are untagged to the scanner and simply survive; never widen the
  call grammar without a spec.
- A5: `doctor.md` has 80 lines of read-load headroom (420/500 measured) — **if false:** condense
  check 20 to three lines; never raise the budget.

## Rationale

The pipeline guaranteed test birth (red-check, the AC matrix) and nothing guaranteed death, so
`SHALL CONTINUE TO` became the default fate of every closed spec — 445 pins here, 352 in prax —
and the suites grew to 25,000 lines of tests nobody would ever read again. The direct batch
cut this repo by hand; this spec makes the cut a close-time mechanism (D5) and hands hosts the
same rule once through doctor (D7). The rule is deliberately fail-safe (D3): a test survives on
any doubt — an unresolvable AC-ID, an open sibling spec, a cited escape class, a pinned
criterion, a file that exercises something the pipeline itself runs.

"Something the pipeline itself runs" is derived, not listed (D1). The first attempt at a hand
list of ten scripts silently dropped `red-check.js`, `ac-matrix.js` and the build driver; the
derivation from the real entrypoints found 23, and following extension-less `require('./lib/x')`
paths — which the hand sweep did not — reaches the `lib/` modules those tests pin. The set is
never written to disk: a checked-in derived file is exactly the baseline pattern the size
ratchet died of. `spec/entrypoints.json` was considered as the source and rejected: it is
hand-authored and lists command files as entry points, so it cannot separate "a gate runs it"
from "a command mentions it".

Deletion at close is safe because the close is already gate-enforced: `--mark closed` re-runs
the host gate over the committed tree, so a deleted file that something still required refuses
the mark with the remedy named. The doctor path never deletes without one question naming the
count and the files (D7) — a host sheds hundreds of tests in one run, and that is the human's
call, never a `--fix` line item. No `SHALL CONTINUE TO` pin: the untouched-untagged promise is a
new script's own contract (AC-3/4), not a neighbour behaviour this spec could break.

Watch during build: the driver test must fixture a done-flip in a `tmpdir` host with a real
`.claude/spec-runs.jsonl`; the `[a-z]?` suffix in the AC-ID grammar (`AC-…-02a-3`) is a real
host shape and must ride `AC_ID_RE_GLOBAL`, never a local regex.

## Canonical Delta

`docs/canonical/review-close.md` — append to the standing rules:

- **Tests expire at close.** The driver's close work runs `expire-tests.js --spec <spec> --apply`
  after the authoritative verdict and before the ledger append: every test tagged with the
  closing spec's AC-IDs is deleted unless its call text cites a ledger escape class, its file
  names a script in the derived invariants set (`lib/invariants.js`: the transitive closure of
  scripts reachable from the host's config commands, hook commands and the pipeline's four
  entrypoints), a cited AC is a `SHALL CONTINUE TO` pin in a spec dated on or after 20260911, or
  a cited AC belongs to a spec that is not done. Untagged tests are never touched. The review row
  records `tests:{born,kept,retired}`; the CLOSE step prints one 🧹 line when anything was
  retired; the deletions ride the close commit that `--mark closed`'s gate re-run certifies. A
  failing expiry refuses the close. `/spec:doctor` check 20 runs the same rule as a dry run over
  every done spec and applies it only after one question naming what it will delete.
