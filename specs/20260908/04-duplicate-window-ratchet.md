---
date: 2026-09-08
status: done
build_base: main
tier: standard
area: gate-integrity
design: false
breaking: false
depends_on: [specs/20260908/02-driver-dedupe-onto-lib.md, specs/20260908/03-test-fixture-dedupe.md]
depended_on_by: []
brief: n/a
open_markers: 0
spiked: 2026-09-08
diff_base: 29cb1f457090582d4e4bf7f0fafdf00a039d8a2a
---

# Duplicate-window ratchet — copy-paste detection that can only tighten

## Goal

Repeated code across `spec/scripts`, `scripts`, and `tests` is counted mechanically the way
jscpd and SonarQube count duplicated lines — identical windows of normalized lines — and the
per-file count is ratcheted in a tracked baseline with the same tight semantics as the size
ratchet: a stale count is red, `--update` only lowers, `--raise --cite` is the only way up.
Done means the repo's own suite runs it green on a baseline seeded after the two dedupe
siblings landed, and every red case is pinned on synthetic trees.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `scripts/dup-windows.js` inventories tracked `.js` files under `spec/scripts`, `scripts`, `tests` via `git ls-files`; normalizes each line by stripping a whole-line or trailing `//` comment and collapsing whitespace; a **window** is 8 consecutive normalized lines all non-empty; a window is a **duplicate** when its SHA-1 appears at any other (file, offset). A file's score is its count of duplicate windows. (AC-20260908-04-1, -2, -3) | Executed spike: W=8 over 209 files found 283 duplicate groups and ranked the known families first (conventions-handoff 47, generate 47, brief-state 37, review-legs 19, genesis-driver 12); W=12 halved the groups without changing the ranking. Comments are stripped so a differing owner citation cannot hide a copy. Rejected: token-level (AST) matching — needs a parser and this repo is dependency-free. |
| D2 | Baseline `dup-baseline.json` at repo root: `{window: 8, files: {path: score}, raises: [{path, from, to, cite}]}`. Check exits 1 on `over` (score > recorded), `stale` (score < recorded, or file untracked), or a new file with score > 0 (`new-dup`). Exit 0 only when every recorded score equals the actual and no unrecorded file has duplicates. (AC-20260908-04-3, -4) | Same tightness rule as spec 01 D2; a file with zero duplicates needs no entry, so the baseline lists only debt. |
| D3 | `--update` lowers stale scores, drops entries at 0 or untracked, and refuses (exit 1, baseline untouched) on any `over` or `new-dup`. `--raise <path> --to N --cite <spec>` with the same cite validation as spec 01 D4. (AC-20260908-04-5, -6) | Identical operator model to the size ratchet so one habit covers both. |
| D4 | Exit alphabet 0/1/2 and `--json` `{ok, window, findings:[{kind, path, actual, ceiling}]}` with `kind ∈ over \| stale \| new-dup`; text mode names each duplicate's first partner (`tests/a.test.js:120 ≡ tests/b.test.js:88`) on the finding line so the extraction target is visible without a second tool. (AC-20260908-04-2, -4) | The review rule "three near-identical blocks name the extraction" becomes arithmetic; the partner location is what a fixer needs. |
| D5 | Tests: `tests/dup-windows/dup-windows.test.js` on synthetic repos; `tests/consistency/dup-windows-live.test.js` runs the real script over this repo and asserts exit 0. Build seeds the baseline with `--update` at its last step (orchestrator duty). (AC-20260908-04-1..7) | Same two-suite shape as spec 01 D7/D8. |
| D6 | Host rules § Review Checks gains: a `dup-baseline.json` raise whose `cite` is not the spec under review is **hard**; § Worker Rules' size bullet from spec 01 gains the words "and `scripts/dup-windows.js`". `[no-ac: prose; the mechanism is pinned by AC-1..7]` | One duty, two meters. |
| D7 | Repo tooling only: no plugin file changes, no version bump, no `spec-paths` key. `[no-ac: absence of change]` | Same placement argument as spec 01 D12. |
| D8 | AC-20260908-04-2 drops the words `CONTINUE TO`: both of its clauses are new promises of a script this spec creates, so there is no prior behavior to carry. The AC keeps its ID and its two clauses; no AC is split. (user ruling, build-time) | `red-check.js` refused the pre-image with `mixed-pin` — a `SHALL CONTINUE TO` clause promises a green the pre-image cannot produce, and a new script has no pre-image behavior at all. Rejected: splitting the second clause into AC-8, which would add a permanent AC-ID for a phrasing slip. |
| D9 | The 14-line synchronous fd writer is deleted from `scripts/dup-windows.js` AND `scripts/size-ratchet.js`; both `require` `writeOut` from `spec/scripts/lib/driver-io.js` (resolved via `path.join(__dirname, '..', 'spec', 'scripts', 'lib', 'driver-io.js')`, never a cwd-relative string) and keep two one-line `writeOut`/`writeErr` shims. `scripts/size-ratchet.js` joins the File Plan. No file under `spec/` is edited, so D7 stands. (user ruling, build-time) `[no-ac: refactor; the extraction changes no observable behavior, and both scripts stay pinned by AC-1..7 and the size ratchet's own suite]` | The new ratchet's first run flagged its own author: the writer was its only duplication with the size ratchet, one contiguous block counted as 7 overlapping windows. A new `scripts/lib/` module would relocate the block rather than remove it (−7, plus a new file that itself scores 7 against the nine `spec/scripts/` copies); importing the existing shared writer is −14 with no new file. Rejected: creating `scripts/lib/`, editing any plugin file, and reshaping the writer to dodge the window hash. The nine `spec/scripts/` copies are a queued plugin spec, not this one. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| scripts/dup-windows.js | CREATE | scripts | D1–D4 |
| dup-baseline.json | CREATE | other | D5: seeded by `--update` at build's last step |
| tests/dup-windows/dup-windows.test.js | CREATE | tests | AC-20260908-04-1, -2, -3, -4, -5, -6 |
| tests/consistency/dup-windows-live.test.js | CREATE | tests | AC-20260908-04-7 |
| .claude/rules/spec-pipeline.md | MODIFY | other | D6 |
| scripts/size-ratchet.js | MODIFY | scripts | D9: writer deleted, imports the shared one |
| size-baseline.json | MODIFY | other | the new script and tests are new files under the size ratchet: `--update` records them |

Orchestrator duty (D5): run `node scripts/dup-windows.js --root . --update` and then
`node scripts/size-ratchet.js --root . --update` after the last worker returns, before the
final gate.

## Contracts

```
node scripts/dup-windows.js --root <dir> [--baseline <file>] [--json] [--window N]
node scripts/dup-windows.js --root <dir> --update
node scripts/dup-windows.js --root <dir> --raise <path> --to <n> --cite <spec path>
Exit: 0 tight & clean · 1 findings / refused · 2 bad invocation
```

```jsonc
// dup-baseline.json
{ "window": 8, "files": { "tests/genesis/registry-check.test.js": 30 }, "raises": [] }
```

Normalization: `line.replace(/\/\/.*$/, '').replace(/\s+/g, ' ').trim()`; a window with any
empty normalized line is skipped; the hash is SHA-1 of the eight lines joined by `\n`.

## Acceptance Criteria

- **AC-20260908-04-1**: WHEN two tracked files each contain the same eight consecutive
  non-blank lines (after comment stripping and whitespace collapse) THE SYSTEM SHALL score
  each file 1, and WHEN they share only seven THE SYSTEM SHALL score both 0 → test in
  tests/dup-windows/dup-windows.test.js
- **AC-20260908-04-2**: WHEN the two copies differ only in trailing `// comments` or
  indentation THE SYSTEM SHALL count them as duplicates, and the text finding SHALL
  name the partner as `<path>:<line> ≡ <path>:<line>` → test in tests/dup-windows/dup-windows.test.js
- **AC-20260908-04-3**: WHEN the same eight lines appear twice within one file at different
  offsets THE SYSTEM SHALL score that file 2 → test in tests/dup-windows/dup-windows.test.js
- **AC-20260908-04-4**: WHEN a file's actual score exceeds its recorded score THE SYSTEM SHALL
  exit 1 with `{kind:"over"}`; WHEN it is below THE SYSTEM SHALL exit 1 with `{kind:"stale"}`;
  WHEN an unrecorded file scores above 0 THE SYSTEM SHALL exit 1 with `{kind:"new-dup"}`; WHEN
  every recorded score matches and no unrecorded file scores THE SYSTEM SHALL exit 0 → test in
  tests/dup-windows/dup-windows.test.js
- **AC-20260908-04-5**: WHEN `--update` runs with no `over` or `new-dup` THE SYSTEM SHALL
  rewrite the baseline so a following check exits 0 and drop entries at 0; WHEN any file is
  `over` THE SYSTEM SHALL exit 1 and leave the baseline byte-for-byte unchanged → test in
  tests/dup-windows/dup-windows.test.js
- **AC-20260908-04-6**: WHEN `--raise <path> --to N --cite <existing specs/YYYYMMDD/NN-*.md>`
  runs THE SYSTEM SHALL set the score and append to `raises[]`; an invalid or missing `--cite`
  SHALL exit 2 with the baseline unchanged → test in tests/dup-windows/dup-windows.test.js
- **AC-20260908-04-7**: WHEN this repository's suite runs THE SYSTEM SHALL run
  `scripts/dup-windows.js --root <repo>` and observe exit 0 → test in
  tests/consistency/dup-windows-live.test.js

## Assumptions (escalation triggers)

- A1: An 8-line normalized window is discriminating enough on this tree — **executed
  2026-09-08** (scratch script, deleted): 209 tracked `.js` files, 283 duplicate groups, the top
  files matching the fixture families spec 03 extracts; W=12 gave 127 groups with the same top
  two. **if false:** `--window` is a flag and the baseline records it; raise to 12 by editing the
  baseline's `window` in the same commit as an `--update`.
- A2: Whole-repo hashing stays far under the 45-second per-file test budget — **executed**: the
  spike ran in under two seconds on the full tree. **if false:** scope the live test to the
  three roots only (already the case) and cache nothing.
- A3: Siblings 02 and 03 land first so the seeded baseline does not enshrine the debt they
  remove (`depends_on`). **if false:** seed anyway; the next `--update` after they land lowers
  the scores.

## Rationale

The host rules' review check says three near-identical blocks in one diff is a finding naming
the extraction, but batch-scoped workers never see the third repetition and a reviewer sees
only one diff — the four families spec 03 extracts accumulated across seven diffs. A whole-tree
meter that can only tighten is how SonarQube's duplicated-lines gate and jscpd's threshold work;
the ratchet form is how Betterer and Type Ratchet make such a meter adoptable on an existing
tree without boiling the ocean.

The baseline lists only files with debt, so its normal state is short and its diff in any spec
is legible. Deliberately not measured: comment density (the narration gate holds the code
group at zero; mechanism explanations are allowed on their merits) and cross-repo duplication.
Fragile: hashing is exact after normalization, so a renamed variable defeats it — that is
accepted; the target is copy-paste, not clone detection.

Folded from the build's deviations sidecar, both one-offs:

- `--update` scopes D3's `new-dup` refusal to an EXISTING baseline. With no `dup-baseline.json`
  present yet, `--update` is the seeding command: every tracked file's actual score is written
  as-is and `new-dup` cannot refuse it, because "new" means absent from a baseline that already
  exists. This is the same seed carve-out `scripts/size-ratchet.js`'s `doUpdate` already carries
  (`isSeed`), which D2 and D3 incorporate by reference. Without it the two Decisions cannot both
  hold: D5 makes `--update` the build's own seeding step, and every file in a first run is
  unrecorded.
- D9 brought `scripts/size-ratchet.js` into the File Plan mid-build, after the new ratchet's
  first run reported its own author. Both scripts lost their local copy of the synchronous fd
  writer in favor of importing `writeOut` from `spec/scripts/lib/driver-io.js`, resolved through
  `__dirname` so the exec-a-script tests still resolve it from a `tmpdir()` root. The nine
  remaining copies under `spec/scripts/` are plugin-side and queued, not in this spec.

## Canonical Delta

docs/canonical/scripts.md § Prose budgets — append: `scripts/dup-windows.js` keeps
`dup-baseline.json` tight over duplicate 8-line windows across the same three roots; the same
`--update` / `--raise --cite` model as the size ratchet; the live check is
`tests/consistency/dup-windows-live.test.js`.
