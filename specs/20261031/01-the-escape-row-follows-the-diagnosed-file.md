---
date: 2026-10-31
status: done
build_base: main
tier: standard
area: commit-escape
breaking: false
depends_on: []
brief: n/a
open_markers: 0
diff_base: 1814608ae4695db594defedc3e888e7a7ef92f68
---

# The escape row follows the diagnosed file

## Goal

A fix commit's escape row names the spec that landed the file the diagnosis blames, not the
spec that most recently bumped a file every spec bumps. Today `/git:commit` step 3 picks the
landed entry with the latest `reviewTs`; `spec/.claude-plugin/plugin.json` is landed by 236
specs, so every version-bumping fix selects the newest spec, `escape-row.js` exits 3 on the
duplicate, and the commit records nothing (observed on `32b5af64`). Done means: the pick is
derived by `commit-coverage.js` from the file the session names (falling back to a rule that
ignores files every spec lands), step 3 reads that pick, a refused escape row yields the
`stage:"fix"` row instead of silence, and the missed row for `32b5af64` is in the ledger.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `commit-coverage.js` accepts a repeatable `--primary <repo-relative path>` and emits `pick` in `--json`: the landed entry whose file is a primary path, with the latest `specs[0].reviewTs` when several primaries landed (tie: lexically smaller spec path), shaped `{file, spec, reviewRunId, reviewTs, reason:"primary"}`. `--primary` with no value is a usage error (exit 2, remedy names `--primary <path>`). (AC-20261031-01-1, AC-20261031-01-2) | The file the root cause names is the only signal that identifies the escaped spec; rejected: ranking by how many touched files a spec landed, which picks broad-glob sweep specs (checked, Rationale). |
| D2 | Without `--primary`, or when no primary path is landed, `pick` is the landed entry with the latest `specs[0].reviewTs` (tie: lexically smaller spec path) after excluding **ubiquitous** files, with `reason:"latest-review"`. A landed file is ubiquitous when, for every other landed entry, that entry's `specs[0].spec` also appears in the file's own `specs`; when the exclusion would leave no entry, nothing is excluded. `--json` carries `ubiquitous: string[]` (the excluded files, `[]` when none) and `pick: null` when `landed` is empty. The human render prints one `pick:` line (`pick: <file> ← <spec> (<reason>)`, or `pick: none`). (AC-20261031-01-3, AC-20261031-01-4, AC-20261031-01-8) | A file every candidate spec also landed carries no information about which spec escaped; rejected: a count threshold (magic number) and a host path list (grounding-contract edit, critical tier). |
| D3 | `git/commands/commit.md` step 3 takes `spec` and `reviewRunId` from `pick`; it passes `--primary <path>` for every file the root cause names (the `/spec:fix` statement or the commit body) and none when no file is named. Step 3 states no ordering rule of its own — the script owns it. (AC-20261031-01-5) | Two derivations of one pick drift; the prose rule is what mis-picked. |
| D4 | When `escape-row.js --append` exits 3, step 3 prints its stderr line, appends the `stage:"fix"` row (step 4's shape, `via` and `reviewed` as there) and prints `📌 escape row refused — fix row recorded (veto anytime)`. A commit still never earns both rows. (AC-20261031-01-6) | A refused escape row left the commit unrecorded; the fix row is the shape the ledger has for a fix that attributes to no spec. |
| D5 | The build appends one escape row for `32b5af640c43465058373a6fcf5039df4021ba80` to `.claude/spec-runs.jsonl`: `spec` `specs/20261026/01-one-runner-for-host-commands.md`, `reviewRunId` `rv_50d84ff2d88f`, `files` the commit's six paths (Behavior), `class` `null`, `via` `spec-fix`, `ts` the time of writing. `[no-ac: a ledger data row; escape-row.js --append --check validates it and the row is the executed evidence]` | The observed miss is the one row the new rule would have written; `class` stays null because no class was chosen in that session and the row never invents one. |
| D6 | Both touched plugins bump: `node scripts/plugin-bump.js --bump --plugin spec --changelog "…"` and `--plugin git`. `[no-ac: node scripts/plugin-bump.js --check in the gate is the oracle]` | Two plugin directories are edited (pipeline rules § Planning, fourth surface). |
| D7 | `landed[*].specs[0]` keeps `reviewRunId`, `reviewTs` and the `offer` boolean unchanged; `pick` and `ubiquitous` are additive keys. (AC-20261031-01-7) | Existing consumers of the landed shape keep working. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/commit-coverage.js | MODIFY | scripts | `--primary` (repeatable), `pick`, `ubiquitous`, `pick:` render line, header cites this spec (D1, D2, D7); `no dependency change` |
| git/commands/commit.md | MODIFY | doctrine | step 3 reads `pick`, passes `--primary`, exit 3 → fix row + 📌 line (D3, D4) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | `node scripts/plugin-bump.js --bump --plugin spec --changelog "…"` (D6) |
| git/.claude-plugin/plugin.json | MODIFY | doctrine | `node scripts/plugin-bump.js --bump --plugin git --changelog "…"` (D6) |
| .claude/spec-runs.jsonl | MODIFY | other | one appended escape row for 32b5af64 via `escape-row.js --append` (D5) |
| tests/commit-coverage/commit-coverage.test.js | MODIFY | tests | AC-20261031-01-1, AC-20261031-01-2, AC-20261031-01-3, AC-20261031-01-4, AC-20261031-01-7, AC-20261031-01-8 |
| tests/commit/escape-row-in-commit.test.js | MODIFY | tests | AC-20261031-01-5, AC-20261031-01-6 |

## Contracts

`commit-coverage.js --commit <sha> [--root <dir>] [--primary <path>]… [--json]` (D1, D2):

```
// additive keys on the existing --json object
pick: null | {
  file: string,          // the landed file the row is attributed through
  spec: string,          // that file's specs[0].spec
  reviewRunId: string|null,
  reviewTs: string,
  reason: "primary" | "latest-review"
}
ubiquitous: string[]     // landed files excluded by D2's rule; [] when none or when --primary chose
```

Ranking (D1 then D2):

```
primaries = landed entries whose file ∈ --primary set
if primaries non-empty: pick = max by specs[0].reviewTs, tie min spec path; reason "primary"; ubiquitous []
else:
  U = landed files F where every other landed entry E has E.specs[0].spec ∈ F.specs
  pool = landed minus U; if pool empty: pool = landed, U = []
  pick = max over pool by specs[0].reviewTs, tie min spec path; reason "latest-review"; ubiquitous = U
landed empty → pick null, ubiquitous []
```

Human render adds one line after the offer line: `  pick: <file> ← <spec> (<reason>)` or `  pick: none`.

`git/commands/commit.md` step 3 (D3, D4) — the `landed` non-empty branch reads:

- `spec` and `reviewRunId` come from the output's `pick`; the run passes `--primary <path>` for
  every file the root cause names (the `/spec:fix` statement or the commit body), none otherwise.
- exit 3 from `escape-row.js --append` → print the stderr line, append the `stage:"fix"` row
  (step 4's shape), print `📌 escape row refused — fix row recorded (veto anytime)`.

## Behavior

Observed commit `32b5af64` under the new rule: the root cause names the review driver's patterns
leg, so step 3 passes `--primary spec/scripts/review-legs.js`; `pick` is
`specs/20261026/01-one-runner-for-host-commands.md` (`rv_50d84ff2d88f`, reviewed
2026-10-26T14:56:54.081Z), which has no prior escape row, so the row appends. Without
`--primary`, `spec/.claude-plugin/plugin.json` is ubiquitous (every other entry's top spec also
lands it) and the pick is the latest remaining review, `spec/scripts/init-gen.js` →
`specs/20261029/08-the-policy-round-at-init.md` — a weaker answer, which is why D3 passes the
primary whenever a file is named.

The six files of `32b5af64` (D5): `scripts/spec-patterns.sh`, `spec/.claude-plugin/plugin.json`,
`spec/scripts/init-gen.js`, `spec/scripts/review-legs.js`, `spec/scripts/scope-reconcile.js`,
`tests/review/review-legs-patterns-scope.test.js`.

Fixture for the ACs: a git repo whose `specs/a.md` File Plan lists `src/x.js` and
`CHANGELOG.md`, `specs/b.md` lists `CHANGELOG.md`; ledger review rows `a` at
`2020-01-01T00:00:00Z` (`wf_cc1`) and `b` at `2021-01-01T00:00:00Z` (`wf_cc2`); HEAD is
`fix(x): …` touching both files. `landed` is then `src/x.js` → `[a]` and `CHANGELOG.md` →
`[b, a]`.

## Acceptance Criteria

- **AC-20261031-01-1**: WHEN `--commit HEAD --root <fixture> --primary src/x.js --json` runs THE SYSTEM SHALL exit 0 with `pick` equal to `{"file":"src/x.js","spec":"specs/a.md","reviewRunId":"wf_cc1","reviewTs":"2020-01-01T00:00:00Z","reason":"primary"}` and `ubiquitous` equal to `[]` → writes tests/commit-coverage/commit-coverage.test.js
- **AC-20261031-01-2**: WHEN `--primary src/none.js` names a file that is not landed THE SYSTEM SHALL fall back to D2 (`pick.reason` `latest-review`, `pick.file` `src/x.js`); WHEN `--primary` is the last argument with no value THE SYSTEM SHALL exit 2 with stderr naming `--primary <path>` → writes tests/commit-coverage/commit-coverage.test.js
- **AC-20261031-01-3**: WHEN the fixture runs with no `--primary` THE SYSTEM SHALL emit `ubiquitous` equal to `["CHANGELOG.md"]` and `pick` naming `src/x.js`, `specs/a.md`, `wf_cc1`, reason `latest-review` (not `specs/b.md`, whose review is later) → writes tests/commit-coverage/commit-coverage.test.js
- **AC-20261031-01-4**: WHEN `landed` is empty (HEAD touches only an unlisted file) THE SYSTEM SHALL emit `pick` `null` and `ubiquitous` `[]`; WHEN the only landed entries are two files both listed by `a` and `b` (every file ubiquitous) THE SYSTEM SHALL emit `ubiquitous` `[]` and pick the later review (`specs/b.md`) → writes tests/commit-coverage/commit-coverage.test.js
- **AC-20261031-01-5**: WHEN `git/commands/commit.md`'s `## Step 3` section is read THE SYSTEM SHALL name `pick` as the source of `spec` and `reviewRunId`, name `--primary`, state `sha` is `HEAD`, keep the fix row for empty `landed`, and contain neither `reviewTs` nor the word `latest` → rewrites tests/commit/escape-row-in-commit.test.js :: AC-20261025-01-5
- **AC-20261031-01-6**: WHEN that section's exit 3 branch is read THE SYSTEM SHALL state the `stage:"fix"` row is appended, carry the literal `📌 escape row refused — fix row recorded (veto anytime)`, and keep the sentence `A commit never earns both rows` → writes tests/commit/escape-row-in-commit.test.js
- **AC-20261031-01-7**: WHEN `--commit HEAD --json` runs on the fixture THE SYSTEM SHALL CONTINUE TO exit 0 with `mode:"commit"`, a `landed` entry carrying `specs[0].reviewRunId` and `specs[0].reviewTs`, and a boolean `offer` → reuses tests/commit-coverage/commit-coverage.test.js :: AC-20261025-02-14
- **AC-20261031-01-8**: WHEN the fixture runs without `--json` THE SYSTEM SHALL print a line matching `pick: src/x.js ← specs/a.md (latest-review)`, and with `landed` empty a line `pick: none` → writes tests/commit-coverage/commit-coverage.test.js

## Assumptions (escalation triggers)

- A1: `commit-coverage.js`'s `landed[*].specs` is already sorted latest-first (checked: `classifyFile` sorts by epoch desc then path) — **if false:** sort in the pick derivation; never change the landed order.
- A2: The scratch ranking run against `32b5af64` (this session, `node … --commit 32b5af64 --json`) shows `review-legs.js`'s top spec is `specs/20261026/01-one-runner-for-host-commands.md` (`rv_50d84ff2d88f`) and that spec has no escape row in the ledger — **if false at build:** D5's row still names that spec; a duplicate refusal means the row already exists and D5 is dropped as a deviation.
- A3: `scope-reconcile.js` treats `.claude/spec-runs.jsonl` as a planned MODIFY like any other row — **if false** (ledger excluded from the changed set): drop the File Plan row as a deviation and append D5's row through `escape-row.js --append` at the build's close step instead.
- A4: `tests/helpers.js`'s `gitRepo` fixture template commits cleanly with a `fix(x):` subject and `git show --name-only` lists both touched files (existing test does this for one file) — **if false:** STOP, ask the user.
- A5: No test outside the two File Plan tests rows asserts the `--json` key set of `commit-coverage.js` or the word `latest` in `commit.md` (grep this session: only `escape-row-in-commit.test.js` lines 40–41) — **if false:** the hit enters the File Plan as a fix row, retagged, never weakened.

## Rationale

The escape row attributes a defect to the spec that shipped it. The current rule "latest review among landed files" was sound when a fix touched one or two files, but every fix in this repo also bumps the plugin manifest, and the manifest is landed by every spec, so the pick is always the newest spec and the duplicate guard (same spec, shared file) fires on the second fix after each release. Three ranking rules were checked against the observed commit: latest review (current) picks spec 09, wrong; most-landed-files picks `20260902/02-plugin-code-sweep` because its `spec/scripts/**` glob lands everything, wrong; the file the diagnosis names picks `20261026/01`, the spec that last changed the patterns leg. Only the third identifies the spec, so D1 makes the named file the first-rank signal and D3 has the session pass it, since it holds the root cause when it writes the commit body.

D2 exists for a fix-typed commit whose body names no file. Its ubiquity test is structural, not a threshold: a file is uninformative when every other landed entry's winning spec also landed it. On the observed commit it correctly drops the manifest, but it still picks `init-gen.js`'s spec, which the Behavior section records as a weaker answer; it is a fallback, never the rule. D4 turns a refused escape row into a fix row so the commit is recorded somewhere, keeping "never both rows". D5 backfills the one observed miss with `class: null` rather than inventing a class after the fact. The fix row shape and `escape-row.js` itself are untouched.


Collision closure (lock, `--literal latest --literal reviewTs`): every `reviewTs` hit is in the File Plan. The `latest` literal is an ordinary English word; its 31 out-of-plan hits (ADR 0032, canonical docs, spikes, doctor/genesis/mocks prose, drivers, status scripts and their tests) use it for unrelated orderings and are waived as false positives. The one hit that restates the retired rule, `docs/canonical/pipeline.md`, is rewritten by the Canonical Delta at review close; the `likely`/`mentions` paths-leg hits owe no waive line.

### Advisory debt (review rv_f53e53a22d08)
- a0 spec/scripts/commit-coverage.js:208 — `--primary` values are matched against landed file paths byte-for-byte, with no normalization and no signal when a primary matches nothing. A primary written as `./spec/scripts/review-legs.js` (or as an absolute path) quietly falls back to the latest-review rule and attributes the row to a different spec. D1 says the value is a repo-relative path, so this is within contract, but `commit.md` has the session copy the path out of free prose (the /spec:fix statement or the commit body), where such spellings are likely.
- a1 spec/scripts/commit-coverage.js:64 — `--primary` followed by another flag takes that flag as its path. `--primary --json` exits 0, records the primary as `--json`, and prints the human render instead of JSON. D1's usage error only fires when `--primary` is the very last argument. `--commit` and `--root` already parse values the same way, so this follows the existing convention.
- a2 tests/commit-coverage/commit-coverage.test.js:71 — No test exercises D1's several-primaries clause (latest review wins, tie goes to the lexically smaller spec path) or D2's tie-break. AC-1 passes one primary, and no fixture has two entries with equal review timestamps. I ran the multi-primary path by hand and it behaves as specified, so the gap is in test coverage, not in behavior.
- a3 tests/commit-coverage/commit-coverage.test.js:91 — Some asserts in the new tests use raw output (`r.stderr`) or a restated expectation as their message instead of a consequence-of-failure line. Examples: AC-3 and AC-8 `assert.strictEqual(r.status, 0, r.stderr)`, and AC-4 `'empty landed has nothing to exclude'`.
- a4 spec/scripts/review-legs.js:429 — This review's patterns leg did not sweep any of the diff's code paths. `patterns.txt` shows `Scope: .claude specs/20261031`, but the range edits spec/scripts, git/commands, tests/commit-coverage and tests/commit. The `reconcile.json` the driver wrote has no `changed` key, so review-legs.js:429 got an empty changed set. The likely cause is that the driver ran an installed scope-reconcile.js older than the one that emits `changed` (7.293.0); I did not confirm this. review-legs.js predates the range, so this is not a defect of this spec. I swept the four directories by hand: no hit falls on a line the diff touches.

## Canonical Delta

docs/canonical/pipeline.md, the "Commit-time escape coverage" paragraph: replace "`spec` and `reviewRunId` taken from the landed file with the latest qualifying review" with "`spec` and `reviewRunId` taken from `commit-coverage.js`'s `pick` — the landed file the root cause names (`--primary`), else the latest qualifying review among files not landed by every other entry's winning spec; a duplicate refusal from `escape-row.js` records the `stage:"fix"` row instead (specs/20261031/01-the-escape-row-follows-the-diagnosed-file.md)".
