---
date: 2026-08-30
diff_base: 83b9383619de1bf79f527d5b122fba4648be0f3b
status: done
tier: standard
area: collision-closure
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
open_markers: 0
---

# Collision-closure sees the tests that execute a script

## Goal

`collision-closure.js`'s paths leg exists to answer one question at plan lock: which tests
outside the File Plan will feel this spec's edits? Today it cannot see the strongest possible
answer — "this test *runs* the script you are changing" — because it matches File Plan paths
as literal substrings while this repo's test helpers spawn scripts by a root-stripped path
(`runNode('scripts/foo.js')`, never `spec/scripts/foo.js`). Measured 2026-08-30: 88 of 115
test→script execution edges (77%) are invisible to the leg. Done means: a test that names a
runnable File Plan target by its two-segment suffix is listed under a new `executes` tier, in
both the human listing and `--json`; the tier is advisory and owes the planner nothing; every
existing behavior of the sweep (exit codes, basename rejection, literals leg, proximity tiering
for prose targets) is pinned and survives; and the sweep's printed remedy stops contradicting
the repo's own 2026-08-24 ruling that `likely` hits owe no waive line.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | **Suffix match key.** For each paths-leg target, the match key is the target's last two `/`-segments when it has ≥2 segments, else the target itself (`spec/scripts/foo.js` → `scripts/foo.js`; `src/a.js` → `src/a.js`). A test file hits when its content includes the key; the same key drives `isLikely`'s mention lines. One normalization at target construction, no second pass, no host-specific prefix. (AC-20260830-01-1, AC-20260830-01-2, AC-20260830-01-3) | Subsumes today's behavior (a full-path spelling contains its own suffix); generic for any host whose helpers join against an intermediate root. Rejected: parsing `tests/helpers.js` for the real join root — host-specific, and the suffix rule already captures 115/115 measured edges. |
| D2 | **Runnable classification, by content not name-shape alone.** A target is *runnable* iff its extension is one of `.js`, `.mjs`, `.cjs`, `.sh`, **or** the file exists under `--root` and its first two bytes are `#!`. Non-existent targets (CREATE rows) classify by extension only. (AC-20260830-01-4, AC-20260830-01-5) | An extension-only rule misses `spec/bin/spec-paths` — extensionless, shebang'd, and the single most-executed entrypoint in the corpus (12 execers, 11 invisible). § Gotchas' first entry is exactly this trap. |
| D3 | **Third tier `executes`.** Every paths-leg hit on a runnable target tiers `executes`; hits on non-runnable targets keep the existing `likely`/`mentions` proximity tiering unchanged (`PROXIMITY_LINES = 25`, `deepStrictEqual`). Per target, the human listing prints `executes:` before `likely:`/`mentions:`. `--json` gains a top-level `executes` array — sorted, filtered to `unplanned` exactly as `likely` is — making the shape **eight** keys: `executes, likely, literals, paths, planned, spec, testRoots, unplanned`. A file that hits both a runnable and a non-runnable target may appear in both `executes` and `likely`. (AC-20260830-01-1, AC-20260830-01-4, AC-20260830-01-6) | Fixing the match alone is insufficient: the incident file declares its script constant at line 24 and its nearest `deepStrictEqual` at line 277, so it would still tier `mentions` ("owes nothing"). A tier that names the call-graph fact is the deliverable. |
| D4 | **`executes` owes nothing.** No block, no waive line, no File Plan row obligation. Exit-code semantics are untouched: 0 when every hit is planned or there are none, 1 when any hit is unplanned (advisory), 2 on usage/unreadable. An `executes` hit that is itself a File Plan row still prints under `executes:` and does not count toward `unplanned`. (AC-20260830-01-7) | A waive duty on exec hits recreates the tax that sank the rejected lock-time guard: `verdict.js` alone would owe 10 dispositions per spec that touches it. Visibility with a concrete action hint is the whole value. |
| D5 | **Contract lines reworded.** `HONESTY_LINE` keeps the literal substring `lexical proxy` but scopes it: `likely/mentions tier is a lexical proxy; mentions may contain closed pins; an executes hit names a runnable file the test spawns, loads, or cites — not distinguished; the build-time suite check adjudicates`. `REMEDY_LINE` becomes: ``remedy: add each literals hit as a File Plan row, or record the waive in the spec's Rationale; an `executes` hit names a test that runs a script you are changing — if the change alters that script's observable behavior, widen the File Plan or plan the fixture repair now; `likely` and `mentions` hits are visibility only and owe no waive line``. (AC-20260830-01-8) | The honesty line must not call an exec edge a proxy, and the remedy line must stop instructing the planner to waive `likely` hits — that duty was measured at 3% precision and retracted on 2026-08-24 (§ Gotchas), but the script never caught up. |
| D6 | **Plan command's lock sentence aligned.** In `spec/commands/plan.md` § Lock step 2, the sentence "and enumerates every `likely`-tier hit in the File Plan as fix or recorded waive" becomes "and enumerates every literals-leg hit in the File Plan as fix or recorded waive; `executes` hits are read for fixture repair to plan now; `likely`/`mentions` hits owe nothing (measured 2026-08-24, host § Gotchas)". No other doctrine prose changes. `[no-ac: single-sentence doctrine alignment; the review diff is the evidence — the host's Test Rules reject regex-over-prose as a test]` | Two shipped surfaces contradicted the repo's own ruling; the auto-pick to reconcile is derivable from that ruling (announced in the planning session, veto open). Adding a third paragraph explaining the contradiction would be the doctrine-prose fix this repo forbids. |
| D7 | **Existing pins updated in place, never weakened.** `tests/collision-closure/collision-closure.test.js`'s seven-key `--json` shape assertion (AC-20260814-05-8) is updated to the eight-key set and retagged `AC-20260814-05-8 / AC-20260830-01-6`; the basename-rejection test (AC-20260814-05-7) and the honesty-line test (AC-20260814-05-13) are retagged as this spec's `CONTINUE TO` carriers without changing their assertions. (AC-20260830-01-3, AC-20260830-01-6, AC-20260830-01-9) | The key-set pin is the one pre-existing test this change reddens by construction; updating it in the same File Plan row is the § Gotchas prescription. |
| D8 | **Header + version.** `collision-closure.js`'s header comment gains a dated paragraph citing this incident (spec 20260827/04's build, 2026-08-29: two out-of-plan genesis test files, 7 tests, invisible because both spawn `scripts/genesis-driver.js`). `spec/.claude-plugin/plugin.json` bumps to the next free minor (target `7.41.0`) with a changelog paragraph in the last-3 form. `[no-ac: manifest bump and comment; review's diff and the version-discipline check are the evidence]` | Behavior change → semver bump per host § Planning; the literal number is a target, not a pin (§ Gotchas). |
| D10 | **`executes` is additive, not exclusive** (build ruling 2026-08-30). `isLikely` runs unconditionally on every paths-leg hit, keyed on the D1 suffix, exactly as before this spec; a runnable target's hit that also sits within `PROXIMITY_LINES` of a `deepStrictEqual` therefore appears under BOTH `executes:` and `likely:`. Only the `mentions:` catch-all is suppressed for runnable targets, whose every hit is already printed under `executes:`. (AC-20260814-05-13 / AC-20260830-01-9) | D3's ordering clause and Contracts' "may appear in both `executes` and `likely`" already imply it; the exclusive reading reddens the AC-20260814-05-13 carrier (target `src/b.js` is runnable by extension and pins `likely`), which D7 forbids weakening. No new observable promise — the carrier already pins it. |
| D9 | **Not in scope.** No blocking; no exit-code change; no parsing of `tests/helpers.js`; no new lock-time guard for the exhaustive-key-set-pin class (stays build-adjudicated per the 2026-08-24 measurement); no new § Gotchas entry; no change to the literals leg. `[no-ac: exclusion list — the CONTINUE TO pins above are its positive form]` | Keeps this spec inside the retraction's boundary — see Rationale. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/collision-closure.js | MODIFY | scripts | D1 suffix key; D2 runnable classification; D3 `executes` tier in listing + `--json`; D4 unchanged exits; D5 contract lines; D8 header paragraph |
| spec/commands/plan.md | MODIFY | doctrine | D6: one sentence in § Lock step 2 |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D8: version → 7.41.0 (next free), changelog paragraph |
| tests/collision-closure/collision-closure.test.js | MODIFY | tests | AC-20260830-01-1, AC-20260830-01-2, AC-20260830-01-3, AC-20260830-01-4, AC-20260830-01-5, AC-20260830-01-6, AC-20260830-01-7, AC-20260830-01-8, AC-20260830-01-9, AC-20260830-01-10; D7 retags |

## Contracts

`--json` output shape (eight keys, sorted order as `Object.keys(json).sort()` sees it):

```json
{
  "spec": "spec.md",
  "testRoots": ["tests"],
  "planned": ["spec/scripts/foo.js", "tests/new.test.js"],
  "paths": [{ "target": "spec/scripts/foo.js", "hits": ["tests/a.test.js"] }],
  "literals": [],
  "unplanned": ["tests/a.test.js"],
  "likely": [],
  "executes": ["tests/a.test.js"]
}
```

Human listing, per target (blocks omitted when empty; `executes` first):

```
paths leg:
  spec/scripts/foo.js:
    executes:
      tests/a.test.js
  spec/doctrine/x.md:
    likely:
      tests/near.test.js
    mentions:
      tests/far.test.js

likely/mentions tier is a lexical proxy; mentions may contain closed pins; an executes hit names a runnable file the test spawns, loads, or cites — not distinguished; the build-time suite check adjudicates

unplanned=3 likely=1
remedy: add each literals hit as a File Plan row, or record the waive in the spec's Rationale; an `executes` hit names a test that runs a script you are changing — if the change alters that script's observable behavior, widen the File Plan or plan the fixture repair now; `likely` and `mentions` hits are visibility only and owe no waive line
```

Match-key derivation (D1) and runnable test (D2), as the worker should implement them:

```js
function matchKey(target) {            // D1
  const seg = target.split('/')
  return seg.length >= 2 ? seg.slice(-2).join('/') : target
}
function isRunnable(target, root) {    // D2
  if (/\.(js|mjs|cjs|sh)$/.test(target)) return true
  try { const fd = fs.openSync(path.join(root, target), 'r'); const b = Buffer.alloc(2)
        fs.readSync(fd, b, 0, 2, 0); fs.closeSync(fd); return b.toString() === '#!' }
  catch { return false }
}
```

The `unplanned=N likely=N` summary line keeps its exact two-counter form (pinned by existing
tests); `executes` is not added to it.

## Behavior

- Paths-leg walk is unchanged (test roots from tests-layer rows or `--tests`; the spec's own
  path skipped). Per (target, file): `content.includes(matchKey(target))` decides the hit;
  runnable targets push the file into that target's `executes` set, non-runnable targets run
  `isLikely(content, matchKey(target))` as today.
- Top-level `executes` = union of per-target executes sets, filtered to `unplanned`, sorted —
  the identical derivation `likely` uses. `unplanned` remains the union of all hits minus
  planned minus the spec's own path; exit code remains `unplanned.length ? 1 : 0`.
- Literals leg: untouched.
- Edge: a two-segment target's key equals itself — zero delta from today for `src/a.js`-style
  paths. Edge: two real files sharing a two-segment suffix (this repo: `.claude-plugin/plugin.json`
  ×3, `hooks/hooks.json` ×2, `rules/spec-pipeline.md` ×2 incl. a fixture copy) can cross-hit;
  all are non-runnable, so they land in `likely`/`mentions` and owe nothing (measured delta ≤5
  test files for the widest such suffix — A4).

## Acceptance Criteria

- **AC-20260830-01-1**: WHEN a spec's File Plan has a non-tests row `spec/scripts/foo.js` and a
  tests row, and `tests/a.test.js` contains `runNode('scripts/foo.js', [])` with the string
  `spec/scripts/foo.js` appearing nowhere in it, THE SYSTEM SHALL exit 1, print
  `tests/a.test.js` under `    executes:` beneath `  spec/scripts/foo.js:` in the human
  listing, and in `--json` include it in both `executes` and `unplanned` (`executes:
  ["tests/a.test.js"]`) → new test in tests/collision-closure/collision-closure.test.js
- **AC-20260830-01-2**: WHEN a test file spells the full path `spec/scripts/foo.js` and the
  File Plan names that same path THE SYSTEM SHALL CONTINUE TO count it as a paths-leg hit
  (subsumption: `--json` `paths[0].hits` = `["tests/a.test.js"]`) `[pre-green: predicate-in-test]`
  → new test in tests/collision-closure/collision-closure.test.js (verified green against
  the pre-image: the full path contains its own suffix and today's `includes` matches it)
- **AC-20260830-01-3**: WHEN the only mention is the basename (`a.js` for target
  `src/deep/a.js`) THE SYSTEM SHALL CONTINUE TO report no hit, exit 0, `unplanned=0` → the
  existing AC-20260814-05-7 test, retagged `AC-20260814-05-7 / AC-20260830-01-3`
- **AC-20260830-01-4**: WHEN a non-runnable target `spec/doctrine/x.md` is referenced only
  by its suffix `doctrine/x.md`, in one file within 25 lines of a `deepStrictEqual` and in
  another file ~60 lines from any assert, THE SYSTEM SHALL tier the first `likely` and the
  second `mentions` and list neither under `executes` (`--json` `executes: []`, `likely:
  ["tests/near.test.js"]`) → new test in tests/collision-closure/collision-closure.test.js
- **AC-20260830-01-5**: WHEN an extensionless target `spec/bin/tool` exists under `--root`
  with first bytes `#!` and a test names `bin/tool`, THE SYSTEM SHALL tier the hit
  `executes`; WHEN an extensionless target `spec/bin/data` exists without a shebang (content
  `plain\n`) and a test names `bin/data` within 25 lines of a `deepStrictEqual`, THE SYSTEM
  SHALL tier it `likely`, never `executes` → new test in
  tests/collision-closure/collision-closure.test.js
- **AC-20260830-01-6**: WHEN `--json` is passed THE SYSTEM SHALL emit exactly the eight
  top-level keys `["executes","likely","literals","paths","planned","spec","testRoots","unplanned"]`
  (sorted), `executes` always an array → the existing AC-20260814-05-8 test, its seven-key
  assertion updated in place and retagged `AC-20260814-05-8 / AC-20260830-01-6`
- **AC-20260830-01-7**: WHEN the file hitting a runnable target by suffix is itself a
  tests-layer File Plan row THE SYSTEM SHALL exit 0 with `unplanned=0`, `--json`
  `executes: []`, and still print the file under `    executes:` in the human listing
  (visibility survives planning, as `likely` does today) → new test in
  tests/collision-closure/collision-closure.test.js
- **AC-20260830-01-8**: WHEN any paths-leg hit exists THE SYSTEM SHALL print an honesty line
  matching `/lexical proxy/` **and** `/executes hit/`, and WHEN the run prints its remedy line
  THE SYSTEM SHALL match `/`likely` and `mentions` hits are visibility only and owe no waive line/`
  and NOT match `/add each `likely` hit/` → new test in
  tests/collision-closure/collision-closure.test.js
- **AC-20260830-01-9**: WHEN a paths-leg hit exists THE SYSTEM SHALL CONTINUE TO print a
  line containing `lexical proxy` → the existing AC-20260814-05-13 test, retagged
  `AC-20260814-05-13 / AC-20260830-01-9`
- **AC-20260830-01-10**: WHEN run against this repository's real tree (`--root` = repo root)
  with a synthetic spec whose File Plan names `spec/scripts/collision-closure.js` and a
  tests-layer row under `tests/`, THE SYSTEM SHALL list
  `tests/collision-closure/collision-closure.test.js` in `--json` `executes` (that file spawns
  the script via `runNode('scripts/collision-closure.js', …)`; its header comment spells the
  full path, so it is a paths-leg hit today, but only the new tier names it as an executor —
  the incident shape, on the real route) → new test in
  tests/collision-closure/collision-closure.test.js

## Assumptions (escalation triggers)

- A1: **Executed 2026-08-30 — corpus measurement.** Script over `tests/**/*.test.js` ×
  `spec/scripts/**` + `spec/bin/*`: an edge = the test quotes the root-stripped path
  (`'scripts/x.js'`) and uses `runNode`/`runBash`/`spawnSync`/`execFileSync`/`require(`.
  Observed: `edges=115 invisible=88 (77%) scriptsWithExecer=39 median=2`; top invisible:
  `spec/bin/spec-paths 12/11` (extensionless, shebang `#!` confirmed), `verdict.js 10/10`,
  `merge-back.sh 6/6`, `review-legs.js 6/6`, `scope-reconcile.js 6/6`, `spec-review-driver.js
  6/6`, `spec-status.js 6/5`, `smoke.sh 5/5`, `genesis-driver.js 5/4`, `ac-matrix.js 7/4`. The
  two-segment suffix matched 115/115 edges. (An earlier session's looser count read 123/75;
  the method above is the reproducible one.) — **if false** (a host where helpers join
  against a deeper root, so two segments are not enough): the rule stays two segments; the
  spec does not chase a third — STOP, ask the user.
- A2: **Executed 2026-08-30 — blindness repro.** Synthetic host: File Plan row
  `spec/scripts/foo.js`, `tests/a.test.js` = `runNode('scripts/foo.js', [])` + a
  `deepStrictEqual`. Pre-image output: `spec/scripts/foo.js: — none`, `unplanned=0 likely=0`,
  exit 0. This is AC-1's red. — **if false** (the test is green at Phase 1): D1 already
  landed elsewhere; STOP and diff.
- A3: **Executed 2026-08-30 — incident file geometry.** `tests/genesis/tournament.test.js`:
  `const SCRIPT = 'scripts/genesis-driver.js'` at line 24; first `deepStrictEqual` at line
  277. Confirms D3's premise that a match-only fix would tier it `mentions`. — **if false**:
  D3 still stands on the 77% figure; nothing to change.
- A4: **Executed 2026-08-30 — suffix-collision surface.** Tracked files sharing a
  two-segment suffix (excluding `specs/`, `docs/`): `.claude-plugin/plugin.json` ×3,
  `rules/spec-pipeline.md` ×2, `hooks/hooks.json` ×2, `.claude/spec.config.json` ×2,
  `.claude/spec-runs.jsonl` ×2 (the last two are two-segment, so no delta). All non-runnable.
  Widest new advisory delta: ≤5 test files for `rules/spec-pipeline.md`. — **if false** (a
  runnable suffix collision appears): it tiers `executes` and owes nothing; acceptable, note
  it in the deviations sidecar.
- A5: The existing pin on `/lexical proxy/` (AC-20260814-05-13) and the two-counter summary
  line `unplanned=N likely=N` are the only prose-shape pins on this script's stdout outside
  the seven-key test — checked by grep over `tests/` for `lexical proxy`, `owe no waive`,
  `visibility only`, `remedy:`. — **if false**: update the pin in place, retag, never weaken.
- A6: `parseFilePlanRows` (`lib/file-plan.js`) keeps returning `paths` as literal strings; a
  glob row's `paths` entry is not expanded, so `matchKey` runs on the glob text as today's
  `includes` does. — **if false**: apply `matchKey` after whatever normalization the lib now
  performs.
- A7: `7.41.0` is free at build time. — **if false**: bump to the next free version, same
  changelog paragraph, log the deviation (§ Gotchas).

## Rationale

**Why this is not the guard that was rejected on 2026-08-24.** That measurement (38 specs,
71 `likely` hits, 2 real, five sharper lexical rules at 1–3% precision) targeted a *semantic
prediction*: "this spec will add a member to an exhaustive live-file pin". Its rejection
stands, and D9 leaves that class to the build's whole-suite check. This spec does something
categorically different: it repairs the **recall of a mechanism that already ships** —
the paths leg was written to find tests that touch a File Plan path and, by an accident of
how this repo's helpers join paths, could not see 77% of the strongest such relation. No
new lock obligation is introduced anywhere (D4, D6 remove one); the exit-code alphabet is
untouched; the sole output delta is a tier that says "this test runs your script", which is
a call-graph fact rather than a proximity guess. The advisory nature is what keeps it cheap:
`verdict.js` will list 10 executing tests on every spec that touches it, and the planner's
only duty is to read the list and decide whether the change is observable to them.

**Why a tier rather than folding into `likely`.** The `likely` tier is defined by assertion
proximity and its contract is "lexical proxy, may be noise". An exec edge is neither
proximate nor noisy — the incident file's assertion sits 253 lines from its script
constant. Folding would either dilute `likely`'s definition or mis-tier the very file the
incident was about.

**Why shebang sniffing (D2).** The repo's own § Gotchas leads with a guard evaded by a
name-shape allowlist. `spec/bin/spec-paths` is extensionless and the most-executed
entrypoint in the corpus; an extension-only rule would ship the fix blind to it. Reading
two bytes of a file that must exist anyway is the cheapest location-independent test.

**Why the remedy-line reconciliation rides along (D5/D6).** The line being reworded is the
same line; leaving "waive every `likely` hit" in it while adding `executes` would ship a
third contradiction. The auto-pick was announced in the planning session as derivable from
JJ's own 2026-08-24 ruling; the veto is a one-line revert of D6.

**Collision-closure at lock (2026-08-30, `unplanned=4 likely=1`).** Both literals hits (the
retired remedy phrasing) are File Plan rows. `likely`: `tests/consistency/genesis-doctrine.test.js`
on `spec/.claude-plugin/plugin.json` — waived: it is the retired-command-name sweep over the
changelog text, so the D8 paragraph must simply not name `/spec:genesis-design` or
`/spec:genesis-explore` (worker note). `mentions`: `tests/consistency/plugin-version.test.js`,
`tests/doctrine-review.test.js`, `tests/spec-status.test.js` — visibility only.

**Fragility to watch.** The eight-key pin (D7) is the one test this change reddens by
construction — the build updates it in the same row. The real-tree AC-10 depends on the
collision-closure test file continuing to spawn its own subject through `runNode`; if a
future refactor spells the full path in code, the AC's premise (suffix-only spelling)
weakens but the assertion still holds by subsumption.

## Canonical Delta

Append to `docs/canonical/scripts.md` (the library-facts list):

- **A path-substring sweep over a test corpus is blind to root-stripped spellings.** When
  test helpers join script paths against an intermediate root (`path.join(SPEC, 'scripts/x.js')`),
  no test ever spells the repo-relative path the sweep searches for; measured 77% of
  test→script execution edges invisible in this repo (2026-08-30). Match the target's
  two-segment suffix — it subsumes the full spelling and needs no host-specific prefix — and
  classify runnable targets by extension *or* shebang, never extension alone.
  (specs/20260830/01-collision-closure-exec-recall.md)
