---
date: 2026-08-23
status: hardened
tier: standard
area: scripts
design: false
breaking: false
depends_on: []
depended_on_by: []
open_markers: 0
brief: n/a
---

# Silent-drop hardening: loud trailing-tag rejection, frontmatter comment strip, ledger repair, D8 archaeology

## Goal

Three verified defects from the 2026-08-21..23 upwell host incident, one bundle. (1) The
AC-tag parser's bare-only trailing rule (escape rv_640c582f4902) refuses a backticked
trailing tag **silently**, so a host that writes genuine declarations backticked sees them
misreported as `uncovered-ac` / `unsanctioned-skip` / `unsanctioned-green` with no hint of
the real cause — the refusal must become a loud, remedy-naming hard finding exactly where it
bites. (2) The two drivers' frontmatter reader captures YAML inline comments; seven live
review ledger rows carry a whole sentence inside `tier` — strip comments and repair the
rows. (3) specs/20260821/03 D8's post-land archaeology (escape rows for the four
prefix-collision-laundered ACs) never ran — execute it here. Done means: every refused
trailing tag that changes a verdict names itself and its remedy, ledger `tier` fields are
enum-clean (past and future), and the four escape rows exist.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | **Loud-when-it-bites, never unconditional.** A refused backticked trailing tag produces the new hard finding class `rejected-trailing-tag` ONLY when the refusal is causally relevant to a finding the consumer was about to emit: `uncovered-ac` with a refused trailing `[oracle:]` (AC-20260823-03-1), `unsanctioned-skip` with a refused trailing `[env:]` on the owning bullet (AC-20260823-03-2), red-check `unsanctioned-green` with a refused trailing `[pre-green:]` on a carried AC's bullet (AC-20260823-03-3). The new finding **replaces** the generic one (never both for one AC) and its message names the AC-ID, the refused tag, and both readings' remedies. A bullet whose refused run is mere illustration and whose AC is otherwise clean fires nothing (AC-20260823-03-4) | An unconditional finding would hard-fail the exact illustration bullets the bare-only ban was built to ignore (rv_640c582f4902's own case) with a remedy that is wrong for them; conditional emission is loud precisely when the silent drop caused a misreport |
| D2 | `parseAcBullets` exposes the refusal: each bullet gains `trailingRejected` — the backtick-tolerant trailing tag run's text when `trailingRun` refused it (i.e. tolerant run matches, bare-only run does not), else `null` (AC-20260823-03-7). Consumers detect relevance by tag name within that string | Consumers must not re-derive the trailing grammar; one authority stays in lib/spec-sections.js |
| D3 | The module-header and `slotRun`/`trailingRun` comments claiming "all 8 genuinely-declared tags in `specs/` sit in the declaration slot" are rescoped as a dated THIS-REPO census ("this repo's corpus as of 2026-08-22"), never a grammar claim — host corpora (upwell) demonstrably backtick trailing declarations [no-ac: comment-only edit, no behavioral surface; rides the spec-sections.js row] | A census stated as grammar is how the silent drop shipped: the fixture assumption looked like a language rule |
| D4 | **One shared frontmatter reader**: new `spec/scripts/lib/frontmatter.js` exports `fmVal(fmRaw, key)`; both `spec-review-driver.js` and `spec-design-driver.js` replace their local copies with it. Semantics: quoted value → content up to the matching closing quote, anything after (incl. comments) ignored (AC-20260823-03-9); unquoted value → strip `\s+#.*$` (YAML-correct: a comment requires preceding whitespace), so an unspaced `#` inside a value (URL fragment) survives (AC-20260823-03-8, -10). `spec-status.js` is NOT touched — its own reader already strips comments, and it is a frozen critical-tier API | Two identical buggy copies exist today; a third copy is the next incident — extraction is the holistic fix, while touching spec-status.js would pull critical tier for zero behavior change |
| D5 | **Repair the seven polluted ledger rows in place** (lines carrying `"tier":"<enum><spaces>#…"`, all `stage:"review"`: specs/20260821/02, 20260821/04, 20260821/01, 20260821/03, 20260822/01, 20260822/02, 20260823/01): truncate `tier` at the first whitespace, yielding `standard`×5 and `critical`×2 — a deterministic jq rewrite of exactly those rows, byte-identical elsewhere, verified by `grep -c '"tier":"[^"]*#'` = 0 before and after diff review [no-ac: one-time data repair on the live ledger — no test surface; the executed rewrite command and verification grep are recorded in the build deviations sidecar] | The ledger is the sole ground truth for materiality and tier economics; seven rows that fail a `tier === "critical"` comparison corrupt every downstream derivation |
| D6 | **Execute 20260821/03 D8's slipped archaeology in this build**: run the fixed ac-matrix (`--spec <owning spec> --root . --manifest <scratch> --json`) against specs/20260808/01, specs/20260813/03, specs/20260815/01, specs/20260816/01; for each AC-1 confirmed uncovered, append one `stage:"escape"` row per the escape.md schema with derived fields — `reviewRunId` from the ledger (wf_38e9474f-cb9, wf_5beb7951-8fc, wf_5ea3aad0-546, wf_e468156d-f2b respectively — the CLEAN/latest review row per spec), `file` = the owning spec path, `foundBy:"later-spec"`, `severity:"hard"`, `class:"prefix-collision-coverage-fail-open"`, `preventedBy:"enforcer"`, `killedMatch:null` (reviews predate artifact retention), `via:"manual"`. An AC that unexpectedly shows covered gets no row and a deviations note [no-ac: operator process — the deliverable is escape-ledger rows, no test surface in this repo's tree; mirrors 20260821/03 D8's own sanction] | D8's obligation had no post-`done` carrier and slipped for a day; a File Plan row in a spec that cannot close without it is the carrier this time |
| D7 | Version bump `spec/.claude-plugin/plugin.json` 7.21.0 → 7.23.0 (target, not pin — 7.21.0 was taken by specs/20260823/01 and 7.22.0 is the parallel lane of specs/20260823/02 — concurrent sessions race semver; build takes the next free minor) with the last-3-versions description update [no-ac: manifest bookkeeping; review's version-bump check is the enforcement] | Behavior change (new finding class, changed frontmatter semantics) mandates a minor bump |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/spec-sections.js | MODIFY | scripts | D2 `trailingRejected` on parseAcBullets bullets; D3 census-comment rescope |
| spec/scripts/ac-matrix.js | MODIFY | scripts | D1 `rejected-trailing-tag` replacing `uncovered-ac` (refused trailing oracle) and `unsanctioned-skip` (refused trailing env on owning bullet) |
| spec/scripts/red-check.js | MODIFY | scripts | D1 `rejected-trailing-tag` replacing `unsanctioned-green` when a carried AC's bullet has a refused trailing `[pre-green:]` |
| spec/scripts/lib/frontmatter.js | CREATE | scripts | D4 shared `fmVal(fmRaw, key)` — quote-aware, YAML-correct comment strip |
| spec/scripts/spec-review-driver.js | MODIFY | scripts | D4: local fmVal replaced by the lib import; no other behavior change |
| spec/scripts/spec-design-driver.js | MODIFY | scripts | D4: local fmVal replaced by the lib import; no other behavior change |
| tests/ac-matrix/rejected-trailing-tag.test.js | CREATE | tests | AC-20260823-03-1, AC-20260823-03-2, AC-20260823-03-4, AC-20260823-03-7 |
| tests/ac-matrix/ac-matrix.test.js | MODIFY | tests | Tag the existing bare-trailing and mid-sentence-null pins with AC-20260823-03-5, AC-20260823-03-6 (retag only, assertions untouched) |
| tests/red-check/red-check.test.js | MODIFY | tests | AC-20260823-03-3 |
| tests/frontmatter.test.js | CREATE | tests | AC-20260823-03-8, AC-20260823-03-9, AC-20260823-03-10 |
| tests/review/review-driver.test.js | MODIFY | tests | AC-20260823-03-11 |
| tests/design-driver.test.js | MODIFY | tests | AC-20260823-03-12 |
| .claude/spec-runs.jsonl | MODIFY | other | D5 six-row tier repair; D6 up-to-four appended escape rows |
| spec/.claude-plugin/plugin.json | MODIFY | other | D7 version bump + description changelog |

## Contracts

```js
// lib/spec-sections.js — parseAcBullets bullet shape gains one field
{
  id, token, malformed, raw,
  oracle, env, preGreen,          // unchanged
  trailingRejected: string|null,  // the backtick-tolerant trailing tag run's text when the
                                  // bare-only trailingRun refused it; null when there is no
                                  // trailing tag run at all, or the bare-only run accepted it
}
// Refusal predicate (the ONE authority — consumers never re-derive):
//   tolerantTrailingRun(raw) matches ((?:TAG_ITEM_SRC\s*)+)$ on trailing-whitespace-trimmed raw;
//   trailingRejected = (tolerant run !== null && trailingRun(raw) === null) ? tolerant run : null
// Note a mixed run (`[env: A] `[oracle: g]``) is refused WHOLE — bare members are inside
// trailingRejected too, because trailingRun's all-bare anchor already drops them all today.
```

```js
// ac-matrix.js / red-check.js — new finding class (hard), replacing the generic finding
{ severity: 'hard', class: 'rejected-trailing-tag', ac: '<AC-ID>',
  detail: /* names: the refused tag text; that it ended the bullet backticked so it was
             refused as a declaration (bare-only trailing rule, rv_640c582f4902); remedy
             both ways — "if this is a declaration: remove the backticks, or move it into
             the declaration slot (backticks allowed there); if it is a quote: <the
             underlying problem — no executed coverage / unsanctioned skip / green
             expected-red file> still stands and needs its own fix" */ }
// Relevance gate per consumer (D1): oracle ↔ uncovered-ac · env ↔ unsanctioned-skip ·
// pre-green ↔ unsanctioned-green. Tag-name match is a substring test against
// trailingRejected ('[oracle:', '[env:', '[pre-green:').
```

```js
// lib/frontmatter.js
module.exports = { fmVal }
// fmVal(fmRaw, key) -> string ('' when key absent)
//   quoted:   tier: "critical" # note        -> 'critical'   (content to matching close quote)
//   unquoted: tier: standard   # note        -> 'standard'   (strip /\s+#.*$/)
//   unspaced# survives: design_source: https://x/p?f=A#sec -> 'https://x/p?f=A#sec'
```

```
# D5 repair — exactly this shape, run at the repo root (verify, rewrite, re-verify):
grep -c '"tier":"[^"]*#' .claude/spec-runs.jsonl          # expect 7 before, 0 after
jq -c 'if (.stage=="review" and (.tier|type=="string") and (.tier|test("\\s#|\\s+#|#")))
       then .tier = (.tier | split(" ")[0]) else . end' …  # byte-identical on untouched rows

# D6 escape row shape (escape.md's schema; one per confirmed-uncovered AC):
{"ts":"<ISO-8601>","stage":"escape","spec":"<owning spec path>","file":"<owning spec path>",
 "reviewRunId":"<per D6>","foundBy":"later-spec","severity":"hard","killedMatch":null,
 "class":"prefix-collision-coverage-fail-open","preventedBy":"enforcer","via":"manual"}
```

## Behavior

- **Trailing-tag refusal, before → after.** Today a backticked trailing tag parses as
  no-tag and the consumer misreports the consequence with no cause: upwell saw 17 genuine
  declarations dropped and reported as `uncovered-ac`/`unsanctioned-skip`. After: the same
  inputs produce `rejected-trailing-tag`, which carries the cause and the remedy. The
  bare-only ban itself is untouched — nothing about what PARSES changes, only what is SAID
  when parsing refuses (AC-5/6 pin the grammar; AC-4 pins silence when the refusal is
  irrelevant).
- **Replacement, not addition.** For one AC, the consumer emits either the generic finding
  or `rejected-trailing-tag`, never both. Severity is identical (hard), so no verdict gets
  softer; the finding count per AC is unchanged, so verdict arithmetic and fix-loop caps see
  no delta.
- **Frontmatter reads.** Both drivers currently propagate everything after `key:` to
  consumers (`--tier` into verdict.js ledger rows — six polluted rows in the live ledger;
  the rv_e83659d49386 incident was the same mechanism via `build_base:`). After D4 an
  inline comment on ANY frontmatter key the drivers read is inert. The existing pipeline
  gotcha's workaround ("put the note on its own line") becomes unnecessary for driver-read
  keys — Canonical Delta updates the entry.
- **Ledger.** D5 rewrites exactly seven rows' `tier` to its leading enum token; every other
  byte of the ledger is preserved (the rewrite is refused if the before-count isn't 7 —
  STOP and re-derive). D6 appends up to four escape rows via the `printf '%s\n' >>`
  mechanism. Both happen in the build session, recorded in the deviations sidecar.

## Acceptance Criteria

- **AC-20260823-03-1**: WHEN ac-matrix evaluates an AC with no executed coverage whose
  bullet ends in a backticked oracle tag (e.g. bullet ending `` …SHALL y `[oracle: gate]` ``
  with zero test hits) THE SYSTEM SHALL emit hard finding class `rejected-trailing-tag`
  (not `uncovered-ac`) whose detail names the AC-ID, the refused tag text, and the
  un-backtick/move-to-slot remedy → tests/ac-matrix/rejected-trailing-tag.test.js
- **AC-20260823-03-2**: WHEN a skipped test maps to an AC whose owning bullet ends in a
  backticked env tag (e.g. `` …SHALL y `[env: FOO]` ``) THE SYSTEM SHALL emit
  `rejected-trailing-tag` (not `unsanctioned-skip`) naming the AC-ID and remedy →
  tests/ac-matrix/rejected-trailing-tag.test.js
- **AC-20260823-03-3**: WHEN red-check finds an expected-red file observed green and a
  carried AC's bullet ends in a backticked pre-green tag (e.g.
  `` …SHALL y `[pre-green: absence-invariant]` ``) THE SYSTEM SHALL emit
  `rejected-trailing-tag` (not `unsanctioned-green`) naming the AC-ID and remedy →
  tests/red-check/red-check.test.js
- **AC-20260823-03-4**: WHEN an AC's bullet ends in a backticked tag but the AC is
  otherwise clean (covered, unskipped, or not an expected-red carrier) THE SYSTEM SHALL
  CONTINUE TO report no finding for that AC — the rv_640c582f4902 illustration case stays
  silent → tests/ac-matrix/rejected-trailing-tag.test.js
- **AC-20260823-03-5**: WHEN an AC bullet ends in a BARE trailing tag THE SYSTEM SHALL
  CONTINUE TO parse it as a declaration → existing pin in tests/ac-matrix/ac-matrix.test.js,
  retagged
- **AC-20260823-03-6**: WHEN a tag run is quoted mid-sentence (neither slot nor trailing)
  THE SYSTEM SHALL CONTINUE TO parse every tag null → existing pin in
  tests/ac-matrix/ac-matrix.test.js, retagged
- **AC-20260823-03-7**: WHEN parseAcBullets parses a bullet whose raw text ends
  `` `[oracle: gate]` `` THE SYSTEM SHALL return that bullet with
  `trailingRejected === '`[oracle: gate]`'` and `oracle === null`; a bullet with a bare
  trailing tag or no trailing tag returns `trailingRejected === null` →
  tests/ac-matrix/rejected-trailing-tag.test.js
- **AC-20260823-03-8**: WHEN fmVal reads an unquoted value with an inline comment THE
  SYSTEM SHALL strip whitespace-preceded `#` to line end (`tier: standard   # note` →
  `standard`) → tests/frontmatter.test.js
- **AC-20260823-03-9**: WHEN fmVal reads a quoted value THE SYSTEM SHALL return the quoted
  content and ignore any trailer (`tier: "critical" # note` → `critical`) →
  tests/frontmatter.test.js
- **AC-20260823-03-10**: WHEN a value contains `#` with no preceding whitespace THE SYSTEM
  SHALL CONTINUE TO return it intact (`design_source: https://x/p?f=A#sec` →
  `https://x/p?f=A#sec`) → tests/frontmatter.test.js
- **AC-20260823-03-11**: WHEN the review driver processes a spec whose frontmatter reads
  `tier: standard   # any note` THE SYSTEM SHALL pass exactly `standard` as `--tier`, so
  the ledger row it produces carries `"tier":"standard"` with no `#` →
  tests/review/review-driver.test.js
- **AC-20260823-03-12**: WHEN the design driver reads frontmatter keys carrying inline
  comments (`design: true   # note`) THE SYSTEM SHALL behave as if the comment were absent
  (`design` flag true) → tests/design-driver.test.js

## Assumptions (escalation triggers)

- A1: All seven polluted `tier` values were written by spec-review-driver's `--tier`
  passthrough into verdict.js's ledger append (driver lines pass `tier` verbatim at its
  three `--ledger` call sites) — executed check: every polluted row is `stage:"review"`,
  and the pollution text matches each spec's own frontmatter comment byte-for-byte. —
  **if false** (another writer produces polluted rows after D4 lands): find that writer;
  do not widen this spec.
- A2: No consumer depends on the polluted `tier` text (the only live comparison is
  `tier === 'critical'` / `--tier` echo). — **if false:** STOP, ask the user before D5.
- A3: The four archaeology ACs confirm uncovered under the fixed ac-matrix (their code —
  autopilot, claims-lint.js, suite-baseline.js, advisory-append — is deleted or retired).
  — **if false** for any AC: no escape row for it; record the covered evidence in the
  deviations sidecar (D6 already sanctions this).
- A4: Existing driver tests do not pin fmVal's comment-capturing behavior. — **if false:**
  the colliding pin is updated in place and retagged (collision rule), never weakened.
- A5: Executed micro-spike (2026-08-23, this session): a backticked trailing tag parses
  silently today — `parseAcBullets` on `` - **AC-…-1**: …SHALL y `[oracle: gate]` ``
  returned `{oracle: null}` with no error, while the bare variant returned
  `{oracle: 'gate'}` and a backticked slot tag returned `{env: 'FOO'}`. Executed ledger
  scan (re-derived 2026-08-23 after specs/20260823/01's review appended a seventh
  polluted row — `tier: critical` with a multi-line inline comment, the same mechanism
  D4 closes): exactly seven rows match `"tier":"[^"]*#`, all `stage:"review"`, enums
  standard×5/critical×2. — **if false:** re-derive the repair set; the count-guard in
  Behavior refuses the rewrite.

## Rationale

The unifying root cause (upwell incident, 2026-08-21..23) is fixture-only evidence: this
repo's parser hardenings are proven against same-session synthetic fixtures, and the
fixtures encode a this-repo census ("all 8 declared tags sit in the slot") as if it were
grammar. D1 deliberately keeps the bare-only ban — upwell agreed the ban is right — and
changes only the failure mode from silent misreport to remedy-naming finding. The
conditional (loud-when-it-bites) emission was chosen over an unconditional lint because the
unconditional variant hard-fails the illustration bullets the ban exists to ignore, with a
remedy that would be wrong for them; the cost is that a refused genuine declaration on an
AC that happens to be otherwise clean stays silent, which is acceptable because nothing was
misreported. D4 extracts rather than patching twice: two identical buggy copies are how the
same regex reached both drivers, and spec-status.js's third, already-correct reader is left
alone because it is a frozen critical-tier surface and unification there buys no behavior.
D5/D6 ride this spec because both are ledger writes whose slip already happened once —
20260821/03 D8 lived in prose past `done` and evaporated; a File Plan row in an unclosed
spec is the carrier that cannot slip. Fragile to watch: the tolerant-trailing regex must
not diverge from TAG_ITEM_SRC (single authority, D2), and the D5 jq rewrite must be
byte-identical outside the six rows — the count-guard plus diff review covers it.

**Collision-closure waives (lock, 2026-08-23, executed run recorded in the plan ledger
row):** the paths leg's `likely` hits on `.claude/spec-runs.jsonl` (five test files) were
each inspected — all build synthetic ledgers in `tmpdir()` fixtures and never read the
live ledger, so the D5 repair cannot touch them: waived. `tests/ac-matrix/owning-spec-env.test.js`
and `tests/consistency/entrypoints.test.js`: existing tests use properly-declared tags and
the conformance walk admits the new lib file authored to convention — no edit expected;
waived (A4 governs if a pin collides mid-build). Literals-leg out-of-plan hits: the
gate-scripts agent-memory note asserts the "all 8" census as a this-repo observation,
which stays TRUE after D3's rescope (only the grammar framing changes): waived. The
`.claude/worktrees/spec-01-release-legs/**` copies belong to the in-flight spec-01
worktree and reconcile at its own merge-back: waived.

## Canonical Delta

Pipeline rules § Gotchas, the `[plugin]` frontmatter-inline-comment entry
(rv_e83659d49386): append — "Closed for driver-read keys 2026-08-23 by
specs/20260823/03 (shared lib/frontmatter.js strips whitespace-preceded comments; seven
polluted ledger `tier` rows repaired). The own-line-comment habit remains good style;
spec-status.js always stripped." No other canonical docs change.
