---
date: 2026-09-01
status: implementing
build_base: main
tier: standard
area: feedback-loop
design: false
breaking: false
depends_on: [specs/20260901/07-escape-class-contract.md]
depended_on_by: []
brief: 19
open_markers: 0
diff_base: 90a60ab25d10cea09d5b3df97ad92be167aa6b0b
---

# Corpus derivation and the kill-match input — replay classes grown from escapes

## Goal

The replay corpus gains a derived section fed by the joined escape count sibling 07 produces:
the fleet reader names every class with two or more fleet recurrences and no corpus entry, the
corpus file grows a `## Derived classes` region whose first member is the one class already past
the bar, and `replay.js` refuses a class id the corpus does not carry while a script picks the
next class to replay (under-replayed derived classes first). Reviewer returns carry a location
on every killed claim, so future `killedMatch` derivations can match on file. Done means a
reviewer change (model, effort, legs) is measurable per escape-derived class, and an escape
recorded today can tell whether the review had already seen and dismissed it.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | New module `spec/scripts/lib/replay-corpus.js`: `corpusPath()` (the plugin's own `doctrine/replay-corpus.md`, resolved from `__dirname`), `CORPUS_BAR = 2`, `parseCorpus(text)` → `[{id, derived, section}]` in file order under the grammar in Contracts — a `` ## `id` `` heading before `## Derived classes` is hand-authored, a `` ### `id` `` heading after it is derived; any other heading is not a class (AC-20260901-08-1) | One parser for replay.js and the fleet reader; the grammar keeps AC-20260819-02-9's six `##` headings byte-unchanged and gives derived classes their own region as the brief specifies |
| D2 | `replay.js --apply --class <id>` and `--record --class <id>` refuse an id absent from `parseCorpus(corpusPath())` — exit 2, stderr names the corpus path and lists the valid ids, nothing committed/appended; `--stats` is untouched and still renders a historical out-of-corpus value verbatim (AC-20260901-08-2, AC-20260901-08-3) | The brief's "`--class` accepts any string"; an unvalidated class silently splits the per-class catch-rate; `--stats` stays D11-style verbatim so history is never coerced |
| D3 | New mode `replay.js --pick-class [--root <dir>]`: counts **measurement** replay rows (`caught`/`missed`/`leg-caught`, D5 of 20260819/03) per corpus class in the root's ledger, picks the class with the fewest rows; ties → derived before hand-authored, then corpus order; prints `class=<id> derived=<true\|false> rows=<n>`, exit 0; exit 2 when the corpus parses to zero classes (AC-20260901-08-4) | The brief's "selection prefers derived classes with the fewest replay rows"; a load-bearing measurement input must be script-derived, never a session reading `--stats` prose (core § Incident Policy, the 20260826/01 scratch-path lesson) |
| D4 | `replay.md` Phase 1 step 3 runs `--pick-class` and reads the printed `class=`; the `--stats` fewest-rows prose and its tie rule are deleted, not kept alongside; the step stays line-neutral or shorter (replay's read-load is 450 of 500) (AC-20260901-08-5) [no-ac for the prose: doctrine choreography — the reviewer verifies the file against this row] | Two selection rules (script + prose) would be the exact "two sessions derive two answers" defect |
| D5 | `replay-corpus.md`: the preamble's "v1 hand-authored … 2026-08-19" paragraph is amended (not deleted) with the derived policy — a class with ≥ `CORPUS_BAR` fleet recurrences on the joined count and no entry is a corpus gap; its section is authored from the escape's own fix diff, cites its ledger rows (repo · ts · spec), and lives under `## Derived classes` as a `### `; the six hand-authored classes stay until a derived class supersedes one by name; new region `## Derived classes` with the first derived section, `prefix-collision-coverage-fail-open`, copied verbatim from Contracts (AC-20260901-08-1, AC-20260901-08-10) | The one class already past the bar (4 rows) has a complete fix diff (20260821/03 D7) — authored here so the region is never empty and the parser's derived arm is exercised by the shipped file |
| D6 | `fleet-reader.js` gains `escapes.corpusGaps` (`[{class, count}]`: effective classes other than `unclassed` with `count ≥ CORPUS_BAR` and no corpus id, sorted class asc) and `escapes.registry` (`[{class, count, inCorpus}]` over every effective class other than `unclassed`, sorted count desc then class asc); corpus ids via D1 from the plugin's own file; the eight `--json` top-level keys stay (AC-20260901-08-6, AC-20260901-08-7) | Brief scope 3's "the fleet reader prints classes with ≥2 recurrences and no corpus entry"; `registry` is the derived-never-stored class list escape.md's step 4 reads |
| D7 | Reviewer return contract (`reviewer.md` § Return contract, `review.md`'s mirror line): `killed: [{claim, file, line, evidence}]` — claims the reviewer investigated and dismissed on executed evidence; `file`/`line` are where the claim was checked, explicit `null` when a claim has no location; the keys are never omitted [no-ac: doctrine contract — D8 is its enforcement] | Brief scope 4: killed entries with no location cannot be matched by `/spec:escape`; 2 of 52 retained artifacts carry a non-empty `killed[]` and none carries a location |
| D8 | `spec-review-driver.js` `--mark reviewer-returned`: `killed` must be an array and every entry an object with a string `claim` and both `file` (string or null) and `line` (number or null) keys present; otherwise the mark dies (exit 2) naming the offending index and the required shape, writing no reviewer-return file and leaving marks unchanged; `killed: []` stays accepted (AC-20260901-08-8, AC-20260901-08-9) | A contract only prose states is the "reminder measured to fail" shape; the driver already validates `survivors`, so this is the same seam one field wider |
| D9 | `escape.md` step 4 `killedMatch`, artifact path: compare `file` first — an entry whose `file` equals the defect file is the candidate, then claim/behavior decide; `file:null` entries compare by claim as today; the no-artifact fallback is unchanged. Step 4's registry now reads `escapes.registry` (07's `byClass` keys stay valid). Step 7 `warns` gains `corpus gap: <class> has <N> fleet recurrences and no replay-corpus section — author it in the plugin repo from this fix` when, after the append, the fleet reader lists this row's effective class in `corpusGaps` [no-ac: doctrine choreography; reviewer verifies against this row] | The warn is the moment-of-evidence carrier: the escape session holds the fix diff the recipe is derived from; the corpus file lives in the plugin repo, so the authoring is direct doctrine work there, never a host-side write into an installed plugin |
| D10 | Bump spec plugin to the next free version (target 7.53.0), last-3-versions description [no-ac: changelog surface — review's version-bump hard check] | Version-bump discipline; literal is a target (host Gotchas) |
| D11 | Derived-section authorship is the planning seat (the session that runs 07's backfill authors the initial set from `corpusGaps`; later gaps are direct doctrine work in this repo prompted by D9's warn and D6's render) — never a build worker, never a host session [no-ac: model placement; carriers are D6's render line and D9's warn] | core § Model Placement: the expensive model authors contracts; a corpus recipe is a contract the blind measurement depends on |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/replay-corpus.js | CREATE | scripts | D1: `corpusPath`, `CORPUS_BAR`, `parseCorpus`; header per Worker Rules |
| spec/scripts/replay.js | MODIFY | scripts | D2/D3: corpus-validated `--class` on `--apply`/`--record`; `--pick-class` mode; usage + header exit-code list updated |
| spec/scripts/fleet-reader.js | MODIFY | scripts | D6: `corpusGaps`, `registry`, render lines |
| spec/scripts/spec-review-driver.js | MODIFY | scripts | D8: `killed[]` shape validation in `handleReviewerReturned` |
| spec/commands/replay.md | MODIFY | doctrine | D4: Phase 1 step 3 → `--pick-class`, line-neutral |
| spec/commands/escape.md | MODIFY | doctrine | D9: file-first `killedMatch`, registry from `escapes.registry`, corpus-gap warn |
| spec/agents/reviewer.md | MODIFY | doctrine | D7: `killed` entry shape in § Return contract |
| spec/commands/review.md | MODIFY | doctrine | D7: the reviewer-return mirror line |
| spec/doctrine/replay-corpus.md | MODIFY | doctrine | D5: preamble amendment, `## Derived classes`, first derived section verbatim from Contracts |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D10: version bump + description |
| tests/replay/replay-corpus.test.js | CREATE | tests | AC-20260901-08-1 |
| tests/replay/replay.test.js | MODIFY | tests | AC-20260901-08-2, AC-20260901-08-3, AC-20260901-08-4; tag the existing AC-20260819-02-9 test with AC-20260901-08-10 |
| tests/fleet-reader/corpus-gaps.test.js | CREATE | tests | AC-20260901-08-6, AC-20260901-08-7 |
| tests/review/reviewer-return-killed.test.js | CREATE | tests | AC-20260901-08-8 |
| tests/review/escalate-row.test.js | MODIFY | tests | AC-20260901-08-9 — tag the existing `reviewer-returned` acceptance (no assertion change) |

## Contracts

```js
// spec/scripts/lib/replay-corpus.js
const CORPUS_BAR = 2              // fleet recurrences (joined count) at which a class owes a corpus section
function corpusPath()             // path.join(__dirname, '..', '..', 'doctrine', 'replay-corpus.md')
function parseCorpus(text)        // -> [{ id, derived, section }] in file order
// Grammar (line-anchored):
//   ^## `id`$           before the first ^## Derived classes$ line  -> { derived: false }
//   ^## Derived classes$                                            -> opens the derived region
//   ^### `id`$          after that line                             -> { derived: true }
//   id must match /^[a-z0-9]+(?:-[a-z0-9]+)*$/ (escape-row's CLASS_ID_RE); any other heading
//   is not a class. `section` = the text from the heading to the next heading of the same or
//   higher level. A ### before the Derived heading, or a ## after it, is ignored.
module.exports = { CORPUS_BAR, corpusPath, parseCorpus }
```

```
replay.js --pick-class [--root <dir>]
  stdout: class=<id> derived=true|false rows=<n>
  rows   = stage:"replay" rows in <root>'s ledger with outcome in {caught, missed, leg-caught}
           and class === <id>; every corpus class starts at 0
  pick   = min rows; tie -> derived:true first; tie -> corpus file order
Exit codes (additions to the header): --pick-class exits 2 when the corpus parses to zero
classes; --apply/--record exit 2 when --class is not a corpus id (stderr: the corpus path and
the comma-joined valid ids, in corpus order).
```

```js
// reviewer return (reviewer.md § Return contract; review.md mirror line)
{ verdict: "CLEAN" | "REVIEWER_FAILED",
  survivors: [{ severity, claim, file, line, impact, evidence }],
  killed:    [{ claim, file: <string> | null, line: <number> | null, evidence }],
  reviewerCount: 1, scope: "full" | "fix-delta", tokens: <n> }
// spec-review-driver.js handleReviewerReturned: Array.isArray(json.killed) and, for every i,
// typeof killed[i].claim === 'string' && 'file' in killed[i] && 'line' in killed[i]
// && (killed[i].file === null || typeof killed[i].file === 'string')
// && (killed[i].line === null || typeof killed[i].line === 'number'); else die(...) naming
// `killed[<i>]` and the shape above.
```

```
fleet-reader.js --json, escapes additions (top-level keys unchanged):
  corpusGaps: [{ class, count }]            // effective class != unclassed, count >= CORPUS_BAR, not a corpus id; class asc
  registry:   [{ class, count, inCorpus }]  // every effective class != unclassed; count desc, then class asc
human render, query 3, after the recurrentUnguarded block:
  corpusGaps: <class> (<count> recurrences) — author its section under ## Derived classes in spec/doctrine/replay-corpus.md
  corpusGaps: none                          // when empty
```

The first derived section — copied verbatim into `replay-corpus.md` under `## Derived classes`:

```markdown
### `prefix-collision-coverage-fail-open`

**Derived from:** claude-plugins escape rows `2026-08-23T18:21:47Z` × 4 (specs 20260808/01,
20260813/03, 20260815/01, 20260816/01 — `preventedBy: enforcer`); fix specs/20260821/03 D7
(`acIdOccurs`, landed 2026-08-22).

**Recipe:** Find an identifier match that is full-token today — a boundary-checked helper
(`acIdOccurs`-style), an `===` on a key, an anchored regex — at a call site inside the target
spec's File Plan files, whose pinned fixtures never contain a shorter id that is a prefix of a
longer one. Loosen it to a bare substring test (`includes`, `indexOf(...) !== -1`,
`startsWith`) so a shorter id matches inside a longer sibling. Mutate a call site, never the
helper's own unit test.

**Leg-invisibility requirement:** every pinned fixture the loosened site reads must be
prefix-free (ids of equal length, or fewer than ten per namespace), so the substring match
returns byte-identical results on every fixture and the suite stays green; the only failing
input is a prefix-colliding pair no pinned test constructs. If the target's fixtures already
carry `-1` beside `-12`, this class does not apply to that site — pick another.

**Worked example (the real escape):** `ac-matrix.js` attributed an AC to a test file with
`readTestFile(f).includes(b.id)`, so `AC-20260808-01-1` matched inside `AC-20260808-01-12`
and the `uncovered-ac` hard finding was suppressed — four ACs across 78 specs reported covered
with no test anywhere, and every review passed. Caught only by a paired-fixture probe (`-2`
beside `-12`); the intended catch is a reviewer reading the coverage grep against the AC-ID
grammar rather than trusting the green matrix.
```

## Behavior

**Selection.** `--pick-class` replaces the session's reading of `--stats`. With the shipped
corpus (six hand-authored + one derived) and an empty ledger every class has 0 rows; the tie
resolves derived-first, so `prefix-collision-coverage-fail-open` is picked. Once it has one
measurement row and any hand-authored class still has 0, that hand-authored class wins: fewest
rows is the primary key; the derived preference only breaks ties. `setup-failed` and
`unresolved` rows never count (no truth value, 20260819/03 D5).

**Validation seam.** `--apply` validates before `git apply`; `--record` validates before any
read of `--patch`/`--workflow` beyond the D7 matrix, so a rejected class leaves the worktree
and ledger untouched. `--record --outcome setup-failed` refuses `--class` already and is
unchanged.

**Killed-claim location.** The reviewer writes `file`/`line` for every killed claim it
checked at a place in the tree; a process-level claim ("the dependency-free pin could be
vacuous") carries `file: null, line: null`. The driver refuses a return that omits the keys,
so the choice between a location and `null` is always made, never skipped. `/spec:escape`
matches on `file` first.

**Corpus gap loop.** Fleet reader prints gaps → the escape session that pushes a class over
the bar sees the warn with the fix in hand → the recipe is authored in this repo under
`## Derived classes` with the ledger rows cited → `--pick-class` starts preferring it at 0 rows
→ its catch/miss lands per class in `--stats`. A derived class that supersedes a hand-authored
one by name replaces the `##` heading with a `###` under the derived region (parser: the id
appears once).

## Acceptance Criteria

- **AC-20260901-08-1**: WHEN `parseCorpus` reads the shipped `replay-corpus.md` THE SYSTEM SHALL
  return seven classes in file order — the six Contracts ids of 20260819/02 with `derived:false`
  followed by `prefix-collision-coverage-fail-open` with `derived:true` — and WHEN it reads a
  synthetic corpus with `` ## `a-b` ``, `## Derived classes`, `` ### `c-d` ``, `` ### `e-f` ``,
  and a stray `` ### `g-h` `` placed BEFORE the Derived heading THE SYSTEM SHALL return
  `[a-b:false, c-d:true, e-f:true]` and ignore `g-h` → `tests/replay/replay-corpus.test.js`
- **AC-20260901-08-2**: WHEN `--apply --dir D --patch P --patch-out O --class not-a-class` runs
  THE SYSTEM SHALL exit 2 with stderr naming `replay-corpus.md` and the valid ids, leave D's
  HEAD unchanged, and write no `--patch-out`; `--class silent-fallback` on the same inputs
  SHALL CONTINUE TO commit the mutation (the existing AC-20260819-02-4 fixture) →
  `tests/replay/replay.test.js`
- **AC-20260901-08-3**: WHEN `--record --spec S --review-run-id R --legs green --outcome caught
  --class not-a-class --patch P --workflow W` runs THE SYSTEM SHALL exit 2 and append nothing
  (pre-image executed 2026-09-01: exit 0 and a row appended); `--class
  prefix-collision-coverage-fail-open` on the same inputs appends the row →
  `tests/replay/replay.test.js`
- **AC-20260901-08-4**: WHEN `--pick-class --root R` runs over an empty ledger THE SYSTEM SHALL
  print `class=prefix-collision-coverage-fail-open derived=true rows=0`; over a ledger holding
  `prefix-collision-coverage-fail-open` caught×1 and every hand-authored class ≥1 except
  `doc-contract-lie` at 0 THE SYSTEM SHALL print `class=doc-contract-lie derived=false rows=0`;
  a `setup-failed` row for `doc-contract-lie` SHALL NOT change that answer; ties among
  hand-authored classes resolve to corpus order (`promise-carried-not-delivered` first) →
  `tests/replay/replay.test.js`
- **AC-20260901-08-5** `[oracle: gate]`: WHEN replay.md's Phase 1 step 3 is rewritten THE
  SYSTEM SHALL keep `/spec:replay`'s read-load (own + `shared-for replay`) ≤ 500 — the read-load
  budget test in the gate is the oracle
- **AC-20260901-08-6**: WHEN the fleet's effective classes are `a-b`×2 (one native, one via
  amendment), `c-d`×1, `silent-fallback`×3, and one `unclassed` THE SYSTEM SHALL return
  `escapes.corpusGaps = [{class:"a-b", count:2}]` and `escapes.registry = [{silent-fallback,3,true},
  {a-b,2,false}, {c-d,1,false}]` in that order, with `unclassed` in neither →
  `tests/fleet-reader/corpus-gaps.test.js`
- **AC-20260901-08-7**: WHEN the human render runs over AC-6's fleet THE SYSTEM SHALL print
  `  corpusGaps: a-b (2 recurrences) — author its section under ## Derived classes in spec/doctrine/replay-corpus.md`
  inside query 3, and `  corpusGaps: none` over a fleet with no gap →
  `tests/fleet-reader/corpus-gaps.test.js`
- **AC-20260901-08-8**: WHEN `--mark reviewer-returned --file F` reads a return whose `killed` is
  `[{"claim":"x"}]` (no `file`/`line` keys), or `[{"claim":"x","file":"a.js"}]` (no `line`), or
  is missing, or is not an array THE SYSTEM SHALL exit 2 with stderr naming `killed[0]` (or the
  missing array) and the `{claim, file, line, evidence}` shape, write no `reviewer-return-*.json`
  into the sidecar, and leave the marks unchanged; a return with
  `[{"claim":"x","file":null,"line":null,"evidence":"e"}]` is accepted →
  `tests/review/reviewer-return-killed.test.js`
- **AC-20260901-08-9**: WHEN a return carries `killed: []` and a survivors array THE SYSTEM SHALL
  CONTINUE TO accept the `reviewer-returned` mark → the existing mark in
  `tests/review/escalate-row.test.js`, tagged
- **AC-20260901-08-10**: WHEN the corpus gains the derived region THE SYSTEM SHALL CONTINUE TO
  carry all six 20260819/02 class ids as their own headings with a recipe → the existing
  AC-20260819-02-9 test in `tests/replay/replay.test.js`, tagged

## Assumptions (escalation triggers)

- A1: The corpus grammar parses the shipped file to exactly the six ids with no derived entry —
  **executed 2026-09-01** (a 9-line scratch parser over `replay-corpus.md` → 6 ids, `derived:false`,
  all level 2). **if false:** the file, not the grammar, is corrected.
- A2: `--record` accepts a non-corpus class today — **executed 2026-09-01** in a scratch root:
  `--class not-a-corpus-class … --outcome caught` → exit 0, `recorded runId=rp_…`, and `--stats`
  rendered `not-a-corpus-class caught=1`. This is AC-3's red. **if false:** nothing changes.
- A3: Every existing replay test passes `--class` a corpus id — **executed 2026-09-01** (grep:
  `boundary-shift` ×1, `self-consistent-polarity` ×8, `silent-fallback` ×6). **if false:** the
  colliding test is updated in place to a corpus id, never weakened.
- A4: replay read-load headroom is 50 lines (own 292 + shared 158 = 450 of 500) — **executed
  2026-09-01** through the real binary. **if false (step 3 grows):** delete the `--stats`
  reading prose rather than adding; the tie rule lives in the script only.
- A5: `handleReviewerReturned` validates only `verdict` and `survivors` today (code-read).
  **if false:** D8 extends the existing check rather than adding a second.
- A6: The fleet reader can read the plugin's own corpus relative to `__dirname` (the file is
  bundled, `spec-paths replay-corpus` resolves it the same way) (code-read). **if false:** STOP,
  ask the user — a corpus outside the plugin tree is a design change.
- A7: Historical `killed[]` entries carry `{severity, claim, impact}` and sometimes
  `{file, line, status, note}` — **executed 2026-09-01** (`jq` over 65 artifacts; 2 non-empty).
  The keys are absent, not null, so D8 binds new returns only; escape.md's old-artifact fallback
  is unchanged. **if false:** nothing changes.
- A8: `prefix-collision-coverage-fail-open` is the only class at or past the bar today
  (**executed**: fleet `byClass` 2026-09-01 — 4 rows; every other class 1). Sibling 07's
  backfill may push more classes over; their sections are authored in that run (D11).
  **if false:** more sections at build time is out of scope — they wait for the backfill run.
- A9: The review driver reaches replay only through `--due`/`--select` (code-read);
  `--pick-class` is invoked from replay.md Phase 1 in-session. **if false:** the driver's
  REPLAY step body names the new mode, one line.

## Rationale

This is the corpus half of brief 19, sequenced after 07 because both the gap list and the
count it thresholds are the joined count 07 introduces. JJ set the bar at 2 (2026-09-01):
the corpus should grow fast; the standing-guard bar stays at 3.

**Why validate `--class` in the script (D2).** The class value keys `--stats`'s per-class
catch-rate; one typo forks a class's history into two rows nobody joins. The refusal names the
valid ids so the remedy is on screen.

**Why a `--pick-class` mode (D3).** The session picked from `--stats` prose with a tie rule
written in doctrine — exactly the shape 20260826/01 found leaking (a value copied by a session
drifts). Fewest-measurement-rows-first with derived tie preference keeps the six hand-authored
classes exercised while every new derived class is measured immediately.

**Why the first derived section ships here (D5).** The `prefix-collision-coverage-fail-open`
class is past the bar with a complete fix diff and a paired-fixture repro on record; authoring
it now means the parser's derived arm and `--pick-class`'s derived preference are exercised by
the shipped file, not a fixture. Its recipe generalizes to "boundary-loosened match", which is a
shape a reviewer can hunt on any stack.

**Why the location contract is driver-enforced (D8).** Prose contracts on reviewer returns have
already been measured to fail (the printed replay reminder); the driver already validates
`survivors`, so `killed` is the same seam. Explicit `null` keeps process-level claims honest
rather than forcing a fabricated location.

**Where corpus authoring happens (D11).** The corpus lives in this repo; a host session must
never write into an installed plugin. The escape-time warn carries the signal to the moment the
fix diff is in hand; authoring is direct doctrine work here.

**Fragile.** replay.md has 50 lines of read-load headroom — step 3 must shrink or stay flat.
The entrypoints and spec-paths pins do not move (no new script, no new key).

**Collision closure (lock, 2026-09-01, `--literal fewest`).** D4 deletes replay.md's
"fewest recorded rows" selection prose. Literals leg: 2 hits — `spec/commands/replay.md` is in
the File Plan; `docs/roadmap/19-escape-seeded-replay.md` restates the old rule as the brief's
current-state description and is **waived** (roadmap prose is not a live surface). The
`executes` hits on `replay.js` and `spec-review-driver.js` name the suites the File Plan already
touches (`tests/replay/replay.test.js`, `tests/review/*`); the driver change is additive at one
seam, so no fixture repair is planned beyond AC-8/AC-9. `likely` hits (4) owe nothing.

## Canonical Delta

Append to `docs/canonical/review.md` after sibling 07's paragraph:

- The replay corpus has two regions: hand-authored `## ` classes and a `## Derived classes`
  region of `### ` classes grown from the escape ledger — a class with two or more fleet
  recurrences (joined count) and no corpus entry is a `corpusGaps` line in the fleet reader,
  and its section is authored from the escape's fix diff with its ledger rows cited.
  `lib/replay-corpus.js` is the one parser; `replay.js` refuses a `--class` outside the corpus
  and `--pick-class` selects the next class (fewest measurement rows, derived first on ties).
  Reviewer returns carry `file`/`line` (or explicit null) on every killed claim, enforced at the
  `reviewer-returned` mark, so `/spec:escape` matches dismissed claims by location.
  (specs/20260901/08-corpus-derivation-and-kill-match.md)
