# Deviations — 01-mixed-pin-guard-and-drift-line

- The File Plan row for `tests/consistency/entrypoints.test.js` (AC-20260907-01-13) said
  "header comment cites the two new invoker rows; no assert change." red-check refused the
  pre-image on that basis (`unsanctioned-green` — the file passed green today with no red-
  expected assertion for a carried AC). D8 (the governing Decision) is unchanged: the file
  gains a real executable assertion instead of a comment-only note — it reads
  `spec/entrypoints.json` directly and asserts `spec/commands/plan.md` is a declared entry
  point of `spec/scripts/ac-matrix.js` and `spec/scripts/spec-review-driver.js` is a declared
  entry point of `spec/scripts/ac-drift.js`. Both rows are absent today, so the assertion is
  genuinely red until D8's manifest rows land.
- D9 targeted `7.96.0`; the pipeline rules' Gotchas entry on this class ("a spec Decision
  naming a literal version-bump target can be stale by build time — concurrent sessions in
  this repo race the same semver … the build bumps to the next free version") governs.
  `spec/.claude-plugin/plugin.json` on this worktree's pre-image already carried `"version":
  "7.100.0"` (landed by commit 1ff8dc5, after this spec was drafted), so the next free version
  is `7.101.0` — that is what shipped, with the changelog paragraph naming `pinShape`,
  `mixed-pin` at lock/build/review, and the advisory drift line, prepended ahead of the
  existing `7.100.0` entry with the oldest (`7.98.0`) paragraph trimmed to hold the "last 3"
  window.
- D1/D2's `pinShape`, implemented verbatim (AC-20260907-01-3's seven Contracts worked examples
  all pass byte-for-byte), correctly classifies `tests/red-check/red-check.test.js`'s
  pre-existing AC-20260821-01-4 hard-wrap fixture — `WHEN x THE SYSTEM SHALL y, AND SHALL\n
  CONTINUE TO require the existing pin check in the same step` — as `mixed`, not `pin`: it
  deliberately mirrors the real `specs/20260810/02-terminal-observable-acs.md` AC-20260810-02-4
  bullet's hard-wrap shape, and that real bullet genuinely mixes a promise ("SHALL extend the
  red-capable-AC trace…") with a pin ("SHALL CONTINUE TO require the existing…") — it is one of
  Assumptions A1's 51 mixed bullets, not a pure pin. The fixture test (authored by
  specs/20260821/01-red-check.md, no File Plan row in this spec) asserts `exit 0`/no findings
  for it and now goes red — a genuine test-fixture collision the guard is supposed to catch, not
  an implementation defect. Scripts-layer scope forbids editing `tests/`, and this file is
  outside this spec's File Plan; left for a tests-layer pass to retag in place (drop the
  fixture's extra "SHALL y" promise clause so the hard-wrap-normalization case it actually tests
  stays a pure pin, or change its expectation to `mixed-pin` if the promise+pin wrap shape is
  meant to stay covered) — never weakened, never silently left red.
- Resolved (tests-layer repair round 1, D11 — build-pass ruling, `AskUserQuestion`): the prior
  bullet's collision is fixed in place per D11, not merely retagged. The scope named by this
  spec's File Plan (five listed test files) is widened by this one additional pre-existing file,
  `tests/red-check/red-check.test.js`, whose AC-20260821-01-4 hard-wrap fixture is edited to drop
  its incidental `SHALL y,` promise clause, leaving `WHEN x THE SYSTEM SHALL\n  CONTINUE TO
  require the existing pin check in the same step` — still hard-wrapped mid-marker, now a pure
  pin under D1's pinShape rule (shalls === pins === 1). The test's assertions (exit 0, empty
  findings) and its AC-20260821-01-4 tag are unchanged, per the pipeline rules' Gotchas entry on
  this class ("a colliding test pin is updated in place and retagged with the new AC-ID, never
  weakened, never left red") — here the guarantee is unchanged so the tag stays as-is. Verified
  green: `node --test 'tests/red-check/*.test.js'`.
- Resolved (review-stage repair, D12 — review-pass ruling, `AskUserQuestion`): scope is widened
  by one more pre-existing file outside this spec's File Plan,
  `tests/provenance/provenance.test.js`. Its AC-20260901-02-1 "jq is unavailable on PATH"
  fixture faked a missing `jq` with `env: { PATH: '/bin' }` and a comment claiming "/bin carries
  bash itself but not jq on this platform" — false on merged-`/usr` Linux (Debian here), where
  `/bin` is a symlink to `/usr/bin`, so `jq` still resolves at `/bin/jq`, the hook succeeds, and
  the "writes no stamp file" assertion fails. Fixed per D12: the test now builds an empty
  directory under `tmpdir()` holding only a symlink to the real `bash` binary (resolved via
  `command -v bash`, never a hardcoded path) and passes that directory as `PATH` — `bash`
  resolves, `jq` genuinely does not, matching what the fixture's own comment always claimed to
  be testing. Both assertions, their consequence messages, and the `AC-20260901-02-1` tag are
  unchanged; only the platform-assumption comment and the PATH-construction lines were replaced.
  The real `jq` binary this repo's own hooks and the rest of the suite depend on is never
  touched. Verified green: `node --test 'tests/provenance/*.test.js'` (17 pass, 0 fail).
- Review repair round 2 (disposed `fix`, HARD): `acPinDriftLine()` (`spec/scripts/spec-review-
  driver.js`) called `JSON.parse(r.stdout)` unconditionally on a 0/1 exit, but `ac-drift.js
  --json` prints the plain `inapplicable — no specs/` sentinel (not JSON) and exits 0 when
  `--root` has no `specs/` directory — `makeHost()`'s fixture always seeds `specs/20260820/`, so
  AC-20260907-01-9's original test never exercised that arm. Fixed per D6 ("when 0 or
  inapplicable print nothing"): the `JSON.parse` is now guarded (`try`/`catch` → `''`), gating
  the advisory line on `findings.length` alone once parsed. A second AC-20260907-01-9 test is
  added to `tests/review/review-driver-close-drift-line.test.js` (in this spec's File Plan
  already, so no scope widening) driving the real driver to CLOSE against a synthetic host whose
  git top level holds no `specs/` directory at all (the spec under review sits at the repo root
  instead, with `pipelineOwnedPaths` covering its own path/sidecar the way `specs/**` covers
  `makeHost()`'s) — confirmed to genuinely crash the pre-fix code before the guard was added.
  Editing `tests/` is outside scripts-layer scope; done here only because the coordinator
  explicitly directed it as part of applying this disposed finding.
- Review repair round 2 (disposed `fix`, SOFT): `ac-matrix.js`'s new `--lint` branch was
  `console.log(...)` followed by `process.exit(...)` — the 64 KiB pipe-truncation shape
  `.claude/rules/spec-pipeline.md` § Gotchas names. Fixed: both the plain and `--json` `--lint`
  output now route through a local synchronous `writeOut` (byte-identical in shape to
  `ac-drift.js`'s own local copy — `lib/driver-io.js`'s export is scoped to the two drivers).
  The pre-existing full-mode output path is untouched, per the disposition's own scope note.
- Correction (review repair round 3, disposed `fix`, SOFT): the bullet immediately above claimed
  "`lib/driver-io.js`'s export is scoped to the two drivers" — factually wrong. Four scripts
  already import it: `commit-coverage.js:35`, `mocks-driver.js:112`, `spec-build-driver.js:60`,
  `spec-review-driver.js:177`. Fixed: the local `writeOut` this spec added to `ac-matrix.js` is
  replaced with an import of `lib/driver-io.js`'s `writeOut`. That shared `writeOut(fd, text)`
  appends no trailing newline of its own (unlike the local copies this repo's other scripts
  carry, which each add one per call) — not a drop-in — so every `--lint` call site now passes
  `\n` explicitly, keeping the printed bytes byte-identical to the local-copy version (diffed
  against a `console.log`-based reference for both the plain and `--json` renders: zero bytes of
  difference). Verified against a synthetic 400-AC spec that a `--lint --json` run's ~96.7 KB
  payload — well past the 65,536-byte pipe buffer the pre-fix `console.log`+`process.exit` shape
  truncated at — parses complete with all 400 findings, and a 499-AC plain-mode run's ~74.8 KB
  payload prints all 499 `HARD` lines plus the summary line intact. The ten other scripts
  carrying their own local `writeOut` are untouched — out of scope for this diff (the
  duplication rule fires at three-or-more near-identical blocks WITHIN one diff; this diff adds
  exactly one local copy, now zero).
