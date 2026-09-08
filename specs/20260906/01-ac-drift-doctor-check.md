---
date: 2026-09-06
status: done
tier: standard
area: doctor
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
spiked: 2026-09-06
open_markers: 0
diff_base: c5460825b63d7992f000126c42b90317e5283aed
---

# Post-close AC-pin drift as a doctor check (`ac-drift.js`), plus the dead-flag and untested-script sweep

## Goal

The AC↔test coverage matrix (`ac-matrix.js`) runs once, at review, against the spec under
review. Nothing re-derives it after a spec closes, so a later test split, a fix-cap waive, or a
retired surface silently leaves a done spec's acceptance criteria with no test citing them —
measured today at 42 criteria across 20 done specs dated after the v7 cutover (Assumptions A5).
Done means: a new `ac-drift.js` derives, repo-wide and statelessly, every done spec's
acceptance criterion that no test-classified file cites and no sanction covers, and
`/spec:doctor` runs it as check 17 (advisory, one finding line per row, remedy named). Two
sibling hygiene findings from the same audit land here because each is a one-row change:
`ci-gate-parity.js` (doctor check 14's script) gains its first behavioural pins, and four
command-line flags no command, test, or doc ever passes are deleted; the one flag that fills a
doctrine-documented ledger column stays and is documented at its driver.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | New `spec/scripts/ac-drift.js --root <dir> [--json]`: walk `specs/**/*.md`; for every spec whose frontmatter `status:` is `done` and whose date directory is ≥ the v7 floor (D2), parse `## Acceptance Criteria` via `lib/spec-sections.js` (`extractSection`, `parseAcBullets`, `acIdOccurs`) and report each well-formed AC that (a) no test-classified file cites as a full token and (b) carries no sanction (D3) — one stderr line per row `ac-drift: <spec path> <AC-ID> — no test cites it; remedy: tag the covering test with the id, or mark the bullet [retired: <spec path or docs/adr path that retired it>]`; exit 1 with findings, exit 0 clean with one stdout line `ac-drift: clean — <N> specs, <M> criteria` (AC-20260906-01-1, AC-20260906-01-2) | Same grammar and full-token check as review's matrix, so a row here is exactly what review would have flagged had it re-run; a separate script rather than an `ac-matrix.js` mode because ac-matrix is per-spec and manifest-writing and this is repo-wide, read-only, and manifest-free |
| D2 | The v7 floor: `promise-sweep.js`'s local `APPLIES_FROM = '20260817'` lifts to `lib/spec-sections.js` as the exported `V7_APPLIES_FROM`; promise-sweep imports it (its not-applicable behaviour byte-unchanged) and `ac-drift.js` skips every spec dated before it, printing one summary line `ac-drift: skipped <N> pre-v7 specs (dated before 20260817)` when N > 0 — never a per-row finding for those (AC-20260906-01-5, AC-20260906-01-10) | The v7 retool deleted the prose-pin tests of every earlier spec on purpose (commit 61e2e5a); 265 of the 361 uncovered rows today are that debris and would nag forever; the floor already exists in the plugin for the promise sweep, so the same date is reused, never a second literal |
| D3 | Sanctions, checked on the bullet's raw text: `SHALL CONTINUE TO` after the same backtick-strip + whitespace-collapse normalisation red-check.js uses (a hard-wrapped `SHALL\n  CONTINUE TO` counts); an `[oracle: …]` or `[pre-green: …]` tag as parseAcBullets already returns them; and the new `[retired: <citation>]` tag, read with the same `extractTag` grammar (slot or bare trailing position; a backticked tag is a worked example, not a declaration) — sanctioned only when the citation contains a `specs/` path ending in `.md` or a `docs/adr/` path; an empty or uncited value is the finding `retired-uncited` (`ac-drift: <spec> <AC-ID> — [retired:] must cite the specs/ or docs/adr/ path that retired it`), never a silent pass (AC-20260906-01-3, AC-20260906-01-4) | A retired surface (the hub daemon, `session-queue.sh`) legitimately has no test; the honest way to say so is a citation the reader can follow, and a free-text or empty tag would be a coverage-laundering route identical to the one `[oracle:]` closes |
| D4 | Test classification = the host config's `testGlobs` when it is an array, else `DEFAULT_TEST_GLOBS` newly exported from `lib/host-config.js` with scope-reconcile.js's exact literal `['tests/**', 'test/**', '**/*.test.*', '**/*.spec.*', '**/*_test.*']`; the walk skips `.git`, `node_modules`, `fixtures`, `__fixtures__` (a citation inside a fixture never counts). scope-reconcile.js keeps its local copy untouched this spec; a consistency pin asserts the two literals are equal (AC-20260906-01-8) | Reuses the at-risk leg's own classification so "a test file" means one thing across the pipeline; scope-reconcile is a critical-tier surface and the fold-in is queued for the next spec that touches it rather than raising this spec's tier for a one-line import |
| D5 | `--json` prints `{ "floor": "20260817", "scanned": N, "criteria": M, "skippedPreFloor": K, "findings": [ { "spec", "ac", "class": "uncovered-ac" \| "retired-uncited", "detail" } ] }` with the same exit code as the human render; no `specs/` directory under `--root` prints `inapplicable — no specs/` and exits 0; an unknown flag or a missing `--root` value exits 2 with the usage line (AC-20260906-01-6, AC-20260906-01-7) | The doctor is the consumer today; `--json` is the only machine format (doctor check 13 convention); inapplicability is a sentinel, never an error, matching ci-gate-parity's own advisory contract |
| D6 | `spec/commands/doctor.md` gains check 17 **AC-pin drift** (deterministic, advisory): run `node "$(spec-paths ac-drift)" --root .`; each printed row is a finding whose remedy the row already names; `spec/bin/spec-paths` gains the `ac-drift` key; `spec/entrypoints.json` gains the row naming `spec/commands/doctor.md` (AC-20260906-01-9) | JJ ruling 2026-09-06: doctor-only now (cheapest to reverse); an advisory review leg is a later spec once the backlog is zero — queued after this spec |
| D7 | `tests/doctor/ci-gate-parity.test.js` pins the six behaviours the script has today, all as `SHALL CONTINUE TO` regression pins executed against scratch hosts (AC-20260906-01-15) | The script runs in every host's doctor and had zero test coverage (`npm run test:coverage`, 2026-09-06); the pins are the spiked observations in A4, never a re-derivation of its algorithm |
| D8 | Delete four parsed-but-never-passed flags: `render-gate.js --no-boot` (with the `noBoot` gate on the boot spawn), `promise-sweep.js --applies-from` (with its 8-digit validation; D2's constant is the only floor), `registry-check.js --timeout-ms` (the `timeoutMs` default 8000 stays as the sole value, plumbed as today), `design-atlas.js stop open --question` (the usage line and the `flagArg` read; `lib/mocks-picks.js`'s `openStop` keeps accepting an optional `question` so `picks.json`'s shape and its existing pins are untouched — the field is simply always `null` from the CLI) (AC-20260906-01-11, AC-20260906-01-12, AC-20260906-01-13, AC-20260906-01-14) | Each was grep-verified referenced nowhere outside its own file (commands, doctrine, tests, README); a flag nobody can reach is dead scope, and `--question` was stored but never rendered on the atlas page |
| D9 | Keep `mocks-driver.js ledger add --dependents`: the `dependents` column is doctrine (`spec/doctrine/mocks.md` § Assumptions table) and the flag is its only writer; the driver's header usage block gains the `ledger add` line listing every flag it accepts, `--dependents` included [no-ac: a header comment line in a script; the review's doctrine leg reads it, and a source-grep pin would be a regex over prose] | The mocks session authors ledger rows by hand through the driver; an undocumented flag on a documented column is the defect, not the flag |
| D10 | `spec/.claude-plugin/plugin.json` bumps to the next free minor (target 7.89.0 — next free at build time per Gotchas) with a changelog paragraph naming ac-drift, doctor check 17, the ci-gate-parity pins and the four flag deletions [no-ac: version discipline; `tests/consistency/plugin-version.test.js` covers the changelog form] | Behaviour change → owning plugin bumps (pipeline rules § Planning) |
| D11 | Review-time ruling (JJ, build 2026-09-06): the whole-suite leg was red only on the per-file 45 s budget guard — `tests/mocks/mocks-driver.test.js` and `tests/mocks/mocks-driver-look-stops.test.js` (pre-existing 23–30 s alone, 57 s under full-suite load) — so both are split into sibling `*.test.js` files with no test-logic change, added to this File Plan [no-ac: a mechanical split of files this spec does not otherwise touch; the budget guard (specs/20260903/07) is the executed oracle and the whole-suite leg re-runs it] | The guard's own printed remedy is the split; every test passes, and a queued split would leave this review parked on a red the spec's own added load tipped over |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/ac-drift.js | CREATE | scripts | D1/D3/D4/D5: repo-wide done-spec AC drift derivation; header with usage, owner citation, does-not list, exit codes 0/1/2 |
| spec/scripts/lib/spec-sections.js | MODIFY | scripts | D2: export `V7_APPLIES_FROM = '20260817'` beside `PRE_GREEN_REASONS` |
| spec/scripts/lib/host-config.js | MODIFY | scripts | D4: export `DEFAULT_TEST_GLOBS` (scope-reconcile.js's literal, verbatim) |
| spec/scripts/promise-sweep.js | MODIFY | scripts | D2/D8: import `V7_APPLIES_FROM`; delete `--applies-from` parsing, its validation, and the usage/header mentions; unknown-flag path unchanged (usage, exit 2) |
| spec/scripts/render-gate.js | MODIFY | scripts | D8: delete `--no-boot` from the usage line and the `noBoot` variable; boot spawn gated on `renderConfig.boot` alone |
| spec/scripts/registry-check.js | MODIFY | scripts | D8: delete `--timeout-ms` from USAGE, header and the parser; `timeoutMs: 8000` stays |
| spec/scripts/design-atlas.js | MODIFY | scripts | D8: delete `[--question <q>]` from the `stop open` usage comment and the `flagArg(args, '--question')` read; `openStop` call passes `question: null` |
| spec/scripts/mocks-driver.js | MODIFY | scripts | D9: header usage block gains `mocks-driver.js --root <dir> ledger add --id <i> --step <s> --kind <k> --claim <c> [--tag <t>] [--status <st>] [--rejected <r>] [--dependents <d>] [--note <n>]` |
| spec/bin/spec-paths | MODIFY | scripts | D6: `ac-drift)` key → `$ROOT/scripts/ac-drift.js`; usage list gains `ac-drift` |
| spec/entrypoints.json | MODIFY | other | D6: `spec/scripts/ac-drift.js` row with `entryPoints: ["spec/commands/doctor.md"]` |
| spec/commands/doctor.md | MODIFY | doctrine | D6: check 17 **AC-pin drift** after check 16, same advisory shape as 14/15/16 |
| tests/doctor/ac-drift.test.js | CREATE | tests | AC-20260906-01-1, AC-20260906-01-2, AC-20260906-01-3, AC-20260906-01-4, AC-20260906-01-5, AC-20260906-01-6, AC-20260906-01-7, AC-20260906-01-8, AC-20260906-01-9 |
| tests/doctor/ci-gate-parity.test.js | CREATE | tests | AC-20260906-01-15 |
| tests/review/promise-sweep.test.js | MODIFY | tests | AC-20260906-01-10 — retag the existing AC-20260820-03-7 not-applicable pin (collision-closure literals hit on `APPLIES_FROM`, comment + assert-message mentions), add the `--applies-from` refusal and the `V7_APPLIES_FROM` equality |
| tests/consistency/retired-flags.test.js | CREATE | tests | AC-20260906-01-11, AC-20260906-01-12, AC-20260906-01-13, AC-20260906-01-14 |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D10: version bump (target 7.89.0) + changelog paragraph |
| tests/mocks/mocks-driver.test.js | MODIFY | tests | D11: split — half the test blocks move verbatim to a sibling file |
| tests/mocks/mocks-driver-2.test.js | CREATE | tests | D11: the moved half of mocks-driver.test.js, logic unchanged |
| tests/mocks/mocks-driver-look-stops.test.js | MODIFY | tests | D11: split — half the test blocks move verbatim to a sibling file |
| tests/mocks/mocks-driver-look-stops-2.test.js | CREATE | tests | D11: the moved half of mocks-driver-look-stops.test.js, logic unchanged |

## Contracts

`ac-drift.js` (D1–D5):

```
Usage: node ac-drift.js --root <dir> [--json]
Exit codes: 0 = derived, no findings (incl. `inapplicable — no specs/`)
            1 = derived, findings printed (advisory in doctor — never a script failure)
            2 = usage error (unknown flag, --root without a value, --root not a directory)
```

Per spec: read frontmatter via `lib/frontmatter.js`'s `fmBlock`; `status:` must equal `done`;
the date is the 8-digit directory segment matched by `/specs\/(\d{8})\//` on the
repo-relative path (a spec outside a dated directory is skipped and counted nowhere). A done
spec with no `## Acceptance Criteria` section contributes zero criteria and no finding (the
matrix's exit-2 there is a review-time contract, not a hygiene one).

Test-classified files: every regular file under `--root` (walk skipping `.git`,
`node_modules`, `fixtures`, `__fixtures__`) whose repo-relative posix path matches any of
`testGlobs` via `lib/glob-match.js`'s `globMatch`. Files read once into a joined haystack;
coverage = `acIdOccurs(haystack, id)`.

Sanction predicate, in order: `/SHALL CONTINUE TO/.test(raw.replace(/`[^`]*`/g, ' ').replace(/\s+/g, ' '))`
→ `bullet.oracle !== null` → `bullet.preGreen !== null` → `retired` (the `extractTag('retired', firstLine, raw)`
grammar, lifted verbatim as a call into `lib/spec-sections.js` — export `extractTag`) with
`/(^|\s)specs\/\S+\.md/.test(v) || /(^|\s)docs\/adr\//.test(v)`. A covered AC is never
reported; `retired-uncited` fires only on an uncovered AC whose sole claimed sanction is an
uncited `[retired:]`.

Human render (stderr for findings, stdout for the summary and the sentinels):

```
ac-drift: skipped 41 pre-v7 specs (dated before 20260817)          # only when > 0
ac-drift: specs/20260823/08-derived-session-queue.md AC-20260823-08-11 — no test cites it; remedy: tag the covering test with the id, or mark the bullet [retired: <spec path or docs/adr path that retired it>]
ac-drift: specs/20260905/02-design-review-hub-and-look-stops.md AC-20260905-02-1 — [retired:] must cite the specs/ or docs/adr/ path that retired it
ac-drift: 2 finding(s) across 2 done spec(s) — 20 specs, 231 criteria scanned
```

Clean: `ac-drift: clean — 20 specs, 231 criteria` (exit 0). `--json`:

```json
{ "floor": "20260817", "scanned": 20, "criteria": 231, "skippedPreFloor": 41,
  "findings": [
    { "spec": "specs/20260823/08-derived-session-queue.md", "ac": "AC-20260823-08-11",
      "class": "uncovered-ac", "detail": "no test cites it" },
    { "spec": "specs/20260905/02-design-review-hub-and-look-stops.md", "ac": "AC-20260905-02-1",
      "class": "retired-uncited", "detail": "[retired:] must cite the specs/ or docs/adr/ path that retired it" } ] }
```

The `[retired:]` tag (D3) — sibling syntax to `[env:]`/`[oracle:]`/`[pre-green:]`, slot or
bare-trailing position:

```
- **AC-20260823-08-11** [retired: docs/adr/0009-session-queue-hook-removed.md]: WHEN … THE SYSTEM SHALL …
- **AC-20260905-02-1**: WHEN … THE SYSTEM SHALL … [retired: specs/20260905/04-per-project-look-server.md D1]
```

`lib/spec-sections.js` exports gain `V7_APPLIES_FROM` and `extractTag`; `lib/host-config.js`
exports gain `DEFAULT_TEST_GLOBS`. All other export names and values are unchanged.

`doctor.md` check 17 (D6), verbatim shape:

```
17. **AC-pin drift** (deterministic, advisory) — run `node "$(spec-paths ac-drift)" --root .`.
    It re-derives, for every `done` spec dated on or after the v7 cutover, the acceptance
    criteria no test-classified file cites and no `SHALL CONTINUE TO` / `[oracle:]` /
    `[pre-green:]` / cited `[retired:]` sanction covers. Each printed row is a finding whose
    remedy the row names (tag the covering test, or mark the bullet `[retired: <citation>]`);
    `inapplicable — no specs/` is not a finding.
```

## Behavior

Nothing changes in any command flow except `/spec:doctor`, which prints one more check. A
host running check 17 the first time sees its backlog (here: 42 rows across 20 specs); the
backlog clean-up is queued after this spec and is not part of it. A spec that legitimately
retires an earlier spec's surface marks the orphaned criteria `[retired: <its own path>]`
in the earlier spec — the only edit to a done spec this pipeline sanctions, and the doctor
row names it. `promise-sweep.js` behaves byte-identically for every caller (plan lock,
review leg) — only the never-passed override is gone. `render-gate.js` boots whenever
`design.render.boot` is declared and readiness fails, with no opt-out flag.
`registry-check.js` probes with its 8-second default as before. `stop open` writes stops with
`question: null` as every caller already did.

## Acceptance Criteria

- **AC-20260906-01-1**: WHEN `ac-drift.js --root R` runs on a scratch host whose
  `specs/20260901/01-x.md` is `status: done` with `- **AC-20260901-01-1**: WHEN a THE SYSTEM
  SHALL b` and whose only test-classified file `tests/x.test.js` contains no `AC-20260901-01-1`
  THE SYSTEM SHALL exit 1 and print on stderr the line
  `ac-drift: specs/20260901/01-x.md AC-20260901-01-1 — no test cites it; remedy: tag the covering test with the id, or mark the bullet [retired: <spec path or docs/adr path that retired it>]`
  → test in tests/doctor/ac-drift.test.js
- **AC-20260906-01-2**: WHEN the same host's `tests/x.test.js` contains `AC-20260901-01-1`
  THE SYSTEM SHALL exit 0 printing `ac-drift: clean — 1 specs, 1 criteria`; WHEN the test
  file contains only `AC-20260901-01-12` THE SYSTEM SHALL still report `AC-20260901-01-1`
  uncovered (full-token, never prefix); WHEN the only citation lives in
  `tests/fixtures/spec.md` THE SYSTEM SHALL still report it uncovered → tests in
  tests/doctor/ac-drift.test.js
- **AC-20260906-01-3**: WHEN an uncovered AC bullet carries any one of: the words `SHALL
  CONTINUE TO` (including hard-wrapped as `SHALL\n  CONTINUE TO`), a bare `[oracle: gate]`, a
  bare `[pre-green: absence-invariant]`, or `[retired: specs/20260830/01-removal.md D2]` in
  the slot or bare trailing position THE SYSTEM SHALL emit no finding for it and count it in
  `criteria` → tests in tests/doctor/ac-drift.test.js
- **AC-20260906-01-4**: WHEN an uncovered AC bullet ends in `[retired: ]` or `[retired:
  superseded by the hub rewrite]` (no `specs/…md` or `docs/adr/` path) THE SYSTEM SHALL exit 1
  with the line `ac-drift: <spec> <AC-ID> — [retired:] must cite the specs/ or docs/adr/ path that retired it`
  and `--json` class `retired-uncited`; WHEN the bullet ends in a backticked
  `` `[retired: specs/a/b.md]` `` THE SYSTEM SHALL treat it as unsanctioned (plain
  `no test cites it`) → tests in tests/doctor/ac-drift.test.js
- **AC-20260906-01-5**: WHEN the host also has `specs/20260810/01-old.md` (`status: done`,
  one uncovered AC) and `specs/20260902/01-open.md` (`status: hardened`, one uncovered AC)
  THE SYSTEM SHALL report neither, print `ac-drift: skipped 1 pre-v7 specs (dated before 20260817)`
  on stdout, and count `scanned` without them → test in tests/doctor/ac-drift.test.js
- **AC-20260906-01-6**: WHEN `--json` is passed THE SYSTEM SHALL print exactly one JSON
  object with keys `floor`, `scanned`, `criteria`, `skippedPreFloor`, `findings` (each finding
  `{spec, ac, class, detail}`), `floor` equal to `"20260817"`, and the same exit code as the
  human render → test in tests/doctor/ac-drift.test.js
- **AC-20260906-01-7**: WHEN `--root` names a directory with no `specs/` THE SYSTEM SHALL
  print `inapplicable — no specs/` and exit 0; WHEN an unknown flag `--fleet` is passed, or
  `--root` has no value, THE SYSTEM SHALL exit 2 printing a usage line containing
  `ac-drift.js --root <dir> [--json]` → tests in tests/doctor/ac-drift.test.js
- **AC-20260906-01-8**: WHEN the host config declares `"testGlobs": ["checks/**"]` and the
  citation lives in `checks/a.js` THE SYSTEM SHALL report clean; WHEN
  `lib/host-config.js`'s `DEFAULT_TEST_GLOBS` is required THE SYSTEM SHALL deep-equal the
  array literal `spec/scripts/scope-reconcile.js` declares as `defaultTestGlobs` (read from
  source) → tests in tests/doctor/ac-drift.test.js
- **AC-20260906-01-9**: WHEN `spec-paths ac-drift` runs THE SYSTEM SHALL print one path
  ending in `spec/scripts/ac-drift.js` naming an existing file; WHEN `spec/commands/doctor.md`
  is read THE SYSTEM SHALL contain `spec-paths ac-drift` inside a check numbered `17.`; WHEN
  `spec/entrypoints.json` is read THE SYSTEM SHALL carry a `spec/scripts/ac-drift.js` row
  whose `entryPoints` includes `spec/commands/doctor.md` → tests in tests/doctor/ac-drift.test.js
- **AC-20260906-01-10**: WHEN `promise-sweep.js --spec <a spec at specs/20260810/01-x.md>`
  runs THE SYSTEM SHALL CONTINUE TO print `not-applicable spec=20260810 appliesFrom=20260817`
  and exit 0, and `require('lib/spec-sections').V7_APPLIES_FROM` SHALL equal `'20260817'`;
  WHEN `--applies-from 20260101` is passed THE SYSTEM SHALL exit 2 with the usage line →
  tests in tests/review/promise-sweep.test.js (the existing AC-20260820-03-7 pin retagged)
- **AC-20260906-01-11**: WHEN `render-gate.js --mocks <mock> --no-boot` runs on a host
  whose `design.render.boot` writes a pid file and whose `ready` succeeds only after it (the
  AC-20260824-01-12 fixture idiom) THE SYSTEM SHALL start boot exactly as without the flag —
  the pid file exists after the run → test in tests/consistency/retired-flags.test.js
- **AC-20260906-01-12**: WHEN `registry-check.js --menu <m> --timeout-ms 5` runs THE SYSTEM
  SHALL exit 2 with a usage line containing `unknown argument "--timeout-ms"` and containing
  no `--timeout-ms <n>` segment → test in tests/consistency/retired-flags.test.js
- **AC-20260906-01-13**: WHEN `design-atlas.js stop open --root R --kind approve --key k
  --title t --candidates a=mocks/a.html --question "which?" --port <free port with the atlas
  served>` runs THE SYSTEM SHALL write the stop with `question: null` in `design/mocks/picks.json`
  → test in tests/consistency/retired-flags.test.js
- **AC-20260906-01-14**: WHEN `render-gate.js` with no arguments prints its usage THE SYSTEM
  SHALL print a line containing `[--json]` and no `--no-boot`; WHEN `promise-sweep.js` prints
  its usage THE SYSTEM SHALL print no `--applies-from`; WHEN `design-atlas.js` runs with no
  arguments THE SYSTEM SHALL print a usage containing `stop open` and no `--question` → tests
  in tests/consistency/retired-flags.test.js
- **AC-20260906-01-15**: WHEN `ci-gate-parity.js --root R` runs THE SYSTEM SHALL CONTINUE
  TO: exit 2 with stderr containing `cannot read/parse` and `check --root` when
  `.claude/spec.config.json` is absent; print `inapplicable — no gateCommand` exit 0 when
  `gateCommand` is `""`; print `inapplicable — no .github/workflows` exit 0 when no workflow
  file exists; exit 1 with stderr `segment not found in any .github/workflows/*.yml|*.yaml: "node --test" — remedy: make one CI step run the gateCommand verbatim`
  when `gateCommand` is `node --test {testDirs}` and the only workflow runs `npm test`; print
  `ci-gate-parity: parity — 1 segment(s) found in ci.yml` exit 0 when that workflow runs
  `node --test tests/`; and exit 2 printing `usage: ci-gate-parity.js --root <dir>` with no
  `--root` → tests in tests/doctor/ci-gate-parity.test.js

## Assumptions (escalation triggers)

- A1: `parseAcBullets` accepts an unknown tag name at the bare trailing position without
  marking it `trailingRejected`, and rejects the backticked form with cause
  `backticked-at-end`. **Executed 2026-09-06:** `- **AC-…-11**: … → test [retired: specs/20260830/01-session-queue-removal.md D2]`
  → `trailingRejected: null`; the backticked form → `trailingRejected: "`[retired: …]`", cause: "backticked-at-end"`;
  slot position `- **AC-…-11** [retired: specs/…-x.md]: …` → `trailingRejected: null`. **if false:**
  extend `TAG_ITEM_SRC` in lib/spec-sections.js under this spec (one more row) rather than a
  private grammar.
- A2: red-check's normalisation finds a hard-wrapped pin. **Executed:** AC-20260901-08-9's raw
  (`SHALL\n  CONTINUE TO`) → `/SHALL CONTINUE TO/.test(raw.replace(/`[^`]*`/g,' ').replace(/\s+/g,' '))` → `true`.
  **if false:** STOP, ask the user — the floor of D3 would silently under-sanction.
- A3: `acIdOccurs` is full-token. **Executed:** `acIdOccurs('cites AC-20260901-05-12 only', 'AC-20260901-05-1')` → `false`; exact → `true`. **if false:** the D7-of-20260821/03 guarantee is broken repo-wide — STOP.
- A4: ci-gate-parity's six behaviours (D7). **Executed 2026-09-06 against scratch hosts:** no
  config → exit 2 `cannot read/parse … — fix the config or check --root`; `gateCommand: ""` →
  `inapplicable — no gateCommand` exit 0; no workflows dir → `inapplicable — no .github/workflows`
  exit 0; `run: npm test` vs `node --test {testDirs}` → exit 1 `segment not found in any
  .github/workflows/*.yml|*.yaml: "node --test" — remedy: make one CI step run the gateCommand
  verbatim`; `run: node --test tests/` → exit 0 `ci-gate-parity: parity — 1 segment(s) found in
  ci.yml`; no args → exit 2 `ci-gate-parity: usage: ci-gate-parity.js --root <dir>`. **if false:**
  the pin is wrong, not the script — fix the test to the observed line.
- A5: The backlog. **Executed 2026-09-06** with D1–D4's exact predicate (default globs, fixtures
  skipped, floor 20260817, done only): 42 uncovered criteria across 20 specs; 361 without the
  floor; 265 of those dated 20260810–20260816. **if false** (build measures a materially
  different number): record the number in the deviations file; the queued clean-up reads the
  script's own output, never this figure.
- A6: `registry-check.js` refuses an unknown argument with `die(2, 'usage: ' + USAGE + ' — unknown argument "…"')`
  (read at source, lines 112–114) so deleting `--timeout-ms` makes AC-12 observable without a
  new code path. **if false:** add the unknown-argument branch under D8.
- A7: `flagArg` in design-atlas.js ignores unknown flags (`argv.indexOf` read only), so
  AC-13's observable is the stored `question: null`, red on the pre-image (which stores
  `"which?"`). **if false:** STOP — the AC needs a different observable.
- A8: No test, command, doctrine file, or README references `--no-boot`, `--applies-from`,
  `--timeout-ms`, or `stop open … --question` outside the defining script. **Executed
  2026-09-06:** grep over `spec/`, `tests/`, `scripts/`, `git/`, `README.md`, `package.json` →
  zero hits outside each defining file. **if false:** that reference is a caller — keep the
  flag, record the deviation, and drop its AC.

## Rationale

The audit that produced this spec started as "can dead code and dead tests be found
systematically". knip (import-reachability) fits nothing here — every script is a filename
entry point spawned by a command or a test; Stryker (in-process mutation) is blind to the
spawned children that carry most coverage. What survived: `node --test
--experimental-test-coverage` follows the spawned scripts (landed 2026-09-06 as
`npm run test:coverage`, 94.5% lines), and the one genuine structural gap is that the
pipeline's AC↔test matrix has no life after review. Every other "dead test" signal in this repo
is a symptom of that gap: pins deleted in a split, waived at the fix cap, or orphaned when a
surface was retired, with nothing that ever asks again.

**Why a doctor check and not a review leg.** JJ's ruling (2026-09-06): the cheapest option to
reverse, no critical-tier surface touched, and the 42-row backlog would ride every review
until the clean-up landed. The advisory review leg is queued after this spec, gated on the
clean-up.

**Why `[retired:]` needs a citation.** An uncited sanction is the exact laundering route the
`[oracle:]` grammar was hardened against (specs/20260823/03 D1). The cited path is the reader's
pointer to the decision that retired the behaviour; the check does not verify the path exists
(a free `fs.existsSync` would make a deleted spec un-retire an AC — the citation is provenance,
not a live link).

**Why lift the two constants.** Two copies of `'20260817'` or of the test-glob array are the
identical-copies shape the silent-drop spec's D4/D10 exist to remove; `promise-sweep.js` is a
standard-tier script and takes the import now, `scope-reconcile.js` is critical-tier and takes
it in its next spec (queued), with AC-8's equality pin holding the two literals together until
then.

**Why not delete `--dependents`.** Its column is doctrine; the flag is the only path to fill
it. The finding was "undocumented", so the remedy is the usage line.

**Rejected.** A `--fleet` mode on `ac-matrix.js` (per-spec, manifest-writing — wrong shape); a
`fleet-reader.js` query (cross-repo ledgers, not one repo's specs); a `spec-status.js` hygiene
anomaly (the status script is critical-tier and would read every test file on every status
call); a config key for the floor (a host knob for a plugin-wide fact, and a grounding-contract
edit for a date). No neighbour needs a `SHALL CONTINUE TO` pin beyond AC-10, AC-11 (boot),
AC-15: the deletions remove code, and each script's existing suites cover the default paths.

**Collision closure at lock** (literals `no-boot`, `noBoot`, `applies-from`, `timeout-ms`,
`APPLIES_FROM`, `question`): every hit but two is a File Plan script row; `APPLIES_FROM` also
hits `tests/review/promise-sweep.test.js` (comments and assert messages naming the constant —
now a File Plan row, retagged under AC-10); the `question` stem is waived as too generic (the
question-style gate, ADRs, roadmap briefs — 60+ files); the real literal is `--question`,
which the sweep's flag parser cannot take and A8's grep found only in design-atlas.js. The
File Plan lands at 16 rows, one over the guideline, because the retag row is a closure
obligation, not new scope.

**Build and review deviations (folded at close, 2026-09-06).** Seven one-offs, none recurring
enough for a Gotchas entry (the section sits at its 15-entry cap):

- AC-14's design-atlas clause names a bare no-argument run, whose usage never contains `stop
  open`; the reachable sibling (`design-atlas.js stop open` with no flags, which dies naming
  `stop open`) is what tests/consistency/retired-flags.test.js pins.
- AC-10 mixes a `SHALL CONTINUE TO` clause with two new promises, so red-check classified
  tests/review/promise-sweep.test.js green-expected and the new-promise test raised
  `broken-pin`; the retagged pin stays there and the two new-promise assertions live in
  tests/consistency/retired-flags.test.js, still citing AC-10. Second recorded instance of the
  class (first: specs/20260903/01 D16) — an AC never mixes a new promise with `SHALL CONTINUE
  TO`; a third earns a lock-time guard.
- D10's 7.89.0 target was stale (7.90.1 current at build); the build bumped to 7.91.0, then a
  sibling session's direct commit (c546082) swept the working-tree plugin.json into its own
  commit, kept the 7.91.0 number for its 7.90.2 entry and dropped this spec's paragraph — this
  spec re-bumped to 7.92.0. The same commit carried D9's mocks-driver.js header line.
- The comment-narration sweep was red on the pre-image (a person + date in design-atlas.js's
  card-height comment, from a direct commit); reworded here since the file is a File Plan row,
  and the new ci-gate-parity test header's date was reworded the same way.
- A5 re-measured with the shipped script: 41 findings across 13 done specs (84 scanned, 884
  criteria, 52 pre-v7 skipped) against the spike's 42; the clean-up reads the script's output.
- `diff_base` corrected from 2f4affc to c546082 (the sibling commit, true parent of the
  checkpoint) and review restarted cold so the panel diffs only this spec.
- D11 (review-time ruling): the whole-suite leg was red only on the per-file 45 s budget guard
  for two pre-existing mocks-driver test files (23–30 s alone, 57 s under full-suite load once
  this spec's tests were added); both split into siblings with no logic change.

## Canonical Delta

`docs/canonical/pipeline.md` gains, after § Reports never defer work in prose, a section
headed **Pins are re-derived after close (2026-09-06, specs/20260906/01)** reading:

The AC↔test matrix runs at review against one spec; `ac-drift.js` re-derives it on demand for
every done spec dated on or after the v7 cutover (`V7_APPLIES_FROM` in `lib/spec-sections.js`,
shared with the promise sweep) and `/spec:doctor` check 17 prints each criterion no
test-classified file cites. Sanctions are the review-time ones — `SHALL CONTINUE TO`,
`[oracle:]`, `[pre-green:]` — plus `[retired: <specs/… or docs/adr/… path>]`, the one edit a
done spec accepts: the citation of the decision that retired the behaviour. An uncited
`[retired:]` is itself a finding. Test classification is the host's `testGlobs` or
`DEFAULT_TEST_GLOBS` (`lib/host-config.js`), the same set the at-risk leg walks; fixture
directories never count as citations.
