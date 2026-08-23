---
date: 2026-08-23
status: done
tier: standard
area: scripts
design: false
breaking: false
depends_on: []
depended_on_by: []
open_markers: 0
brief: n/a
# pinned at build close 2026-08-23 from the moving ref `main`, which advanced 3x during this
# build (spec 02's merge + two ledger promotions). This sha is the true pre-image: everything
# in 4b8c837..HEAD is this spec's own work. See the semver-race / stale-diff_base gotchas.
build_base: 4b8c83797b8816e20a920ca0d3e5bb925ae8bd63
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
| D8 | **Blocked-return ruling (build, 2026-08-23): AC-20260823-03-3's fixture is retargeted; D2's anchor is NOT widened.** The authored fixture placed the backticked `[pre-green:]` tag BEFORE a `→ tests/x3.test.js` reference suffix, so the tag is not the bullet's last content and no trailing run — tolerant or bare — matches it (executed check: `parseAcBullets` returns `trailingRejected: null` for that text with AND without backticks). AC-20260823-03-3's own literal example ends with the tag; the fixture drops the suffix to match it. D2's `((?:TAG_ITEM_SRC\s*)+)$` end-anchor stands unchanged [no-ac: fixture correction inside an existing AC's own test — AC-20260823-03-3 already says "bullet ends in a backticked pre-green tag"] | Widening the anchor would change what the trailing position PARSES, which D1 forbids outright ("nothing about what PARSES changes, only what is SAID when parsing refuses"); `trailingRun`'s bare path carries the identical end-anchor today, so a suffix-tolerant tolerant-run would report refusals the bare run never even considered — a new silent-drop class, not a fix for one |
| D9 | **Leg exits partition by EMISSION SITE, not by finding class.** `ac-matrix.js` derives its two manifest leg exits (`ac-matrix`, `skip-reconcile`) by testing each finding's `class` against two class sets. `rejected-trailing-tag` is emitted from BOTH loops, so adding it to both sets makes either emission redden both legs. Executed repro (build, 2026-08-23): a spec with one uncovered AC carrying a refused trailing `[oracle:]` and ZERO skip lines wrote `{"leg":"skip-reconcile","exit":1,"observed":{"skipped":0,"sanctioned":0}}` — a leg reporting red having observed nothing. Fix: each of the three `rejected-trailing-tag` emission sites records which leg it belongs to, and the two exits are computed from that origin; `rejected-trailing-tag` is removed from both class sets. The `--json` findings array and every finding's own shape stay byte-identical — origin is internal bookkeeping, never an emitted field (AC-20260823-03-13) | This spec exists to stop silent misreports; shipping one into the evidence manifest that verdict.js reads would be self-refuting. D1's Behavior clause already promises "verdict arithmetic sees no delta" — a falsely-red leg is exactly such a delta |
| D10 | **The `rejected-trailing-tag` remedy text is ONE authority, exported from `lib/spec-sections.js`.** The first implementation landed a byte-identical `rejectedTrailingTagDetail(acId, trailingRejected, underlying)` in both `ac-matrix.js` and `red-check.js`. It is exported from `lib/spec-sections.js` — the module that already owns the refusal predicate D2 defines — and imported by both consumers; the per-consumer `underlying` clause stays a parameter. Pure refactor, message bytes unchanged, already pinned by the AC-1/-2/-3 detail assertions [no-ac: behavior-preserving extraction covered by the existing detail assertions on AC-20260823-03-1/-2/-3] | This spec's own D4 rationale is that two identical copies are how one buggy regex reached both drivers and that extraction is the holistic fix — shipping two copies of the remedy text in the same spec would refute it, and the remedy belongs beside the grammar whose refusal it explains |
| D11 | **Refusal = what is SAID minus what PARSED; position-blind, JJ-approved amendment (2026-08-23), supersedes D8's rationale and D2's predicate formula.** Live evidence: specs/20260823/01 AC-20260823-01-18 and AC-20260823-01-20 each end `` `[pre-green: predicate-in-test]` → tests/… `` — genuine declarations at NEITHER recognized position, so they neither parse nor set `trailingRejected` (that spec's own review row rv_6825fa48c98d recorded `preGreen:0` with both present): the same silent-drop class this spec exists to close. Fix, all inside lib/spec-sections.js's authority: (a) a WIDENED tolerant run `((?:TAG_ITEM_SRC\s*)+)(?:→[^→]*)?$` — built from the same `TAG_ITEM_SRC`, tolerating exactly one final `→ <tail containing no second →>` File-Plan-reference suffix, capture trimmed of trailing whitespace; (b) the predicate GENERALIZES to a said-vs-parsed comparison: `trailingRejected = (wide !== null && wide !== trailingRun(raw)) ? wide : null` (trimmed captures) — this subsumes D2's formula (bare-run null ≠ non-null wide) AND catches a backticked tag standing beside an accepted bare one at the true end, which D2's null-test missed (AC-20260823-03-16); (c) each bullet also gains `trailingRejectedCause`: `'backticked-at-end'` when the UNWIDENED end-anchored tolerant run matches and equals the wide capture, else `'not-at-end'` (AC-20260823-03-14); (d) `rejectedTrailingTagDetail` gains the cause parameter and forks its middle sentences — the backticked-at-end message stays byte-identical to D10's pinned text, and the not-at-end message says the tag sits before the bullet's final `→` reference (not a recognized declaration position) with remedy "move it into the declaration slot (backticks allowed there)" — NEVER "remove the backticks", which is false there (a bare tag before the arrow still does not parse) (AC-20260823-03-15, -17); (e) the four `rejectedTrailingTagDetail` call sites (ac-matrix ×3, red-check ×1) pass the bullet's cause — the relevance gates themselves are unchanged substring tests. What PARSES is untouched: `slotRun`/`trailingRun`/`extractTag` keep their exact grammar, so D1's parse-freeze holds. **D8's ruling (fixture retarget) stands as a build-time act, but its rationale was factually wrong and is corrected here**: D1 freezes what PARSES; the tolerant run is on the "what is SAID" side, which D2 built precisely so it could see more than the parser accepts — and D8's "refusals the bare run never considered would be a new silent-drop class" objection has it backwards: a tag that was SAID and did not PARSE is exactly what refusal reporting exists to surface. AC-20260823-03-3's before-the-arrow fixture shape is re-legitimized (AC-20260823-03-17 pins it end-to-end). **Out-of-plan repair, JJ-approved explicitly**: specs/20260823/01's two bullets move their tag into the declaration slot so the shipped declarations actually parse (File Plan row added; deviations sidecar records it). Evidence: executed corpus run over all 843 AC bullets in specs/ — the generalized predicate fires on exactly the 2 known drops (both `not-at-end`), zero prose false positives, zero delta elsewhere; 10 synthetic edge shapes verified (bare-at-end, slot-only, mid-prose illustration, tag before first-of-two arrows, arrow-tail parenthetical, mixed runs) | A hardening spec that ships still-silent drops of its own target class refutes itself; the said-vs-parsed comparison is the principled predicate the null-test only approximated, and Fable's independent regex review plus the executed corpus run ground the widening in observation, not assumption |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/spec-sections.js | MODIFY | scripts | D2 `trailingRejected` on parseAcBullets bullets; D3 census-comment rescope; D11 widened run, said-vs-parsed predicate, `trailingRejectedCause`, forked remedy |
| spec/scripts/ac-matrix.js | MODIFY | scripts | D1 `rejected-trailing-tag` replacing `uncovered-ac` (refused trailing oracle) and `unsanctioned-skip` (refused trailing env on owning bullet); D9 leg exits partition by emission site; D11 cause threaded to the detail builder |
| spec/scripts/red-check.js | MODIFY | scripts | D1 `rejected-trailing-tag` replacing `unsanctioned-green` when a carried AC's bullet has a refused trailing `[pre-green:]`; D11 cause threaded to the detail builder |
| spec/scripts/lib/frontmatter.js | CREATE | scripts | D4 shared `fmVal(fmRaw, key)` — quote-aware, YAML-correct comment strip |
| spec/scripts/spec-review-driver.js | MODIFY | scripts | D4: local fmVal replaced by the lib import; no other behavior change |
| spec/scripts/spec-design-driver.js | MODIFY | scripts | D4: local fmVal replaced by the lib import; no other behavior change |
| tests/ac-matrix/rejected-trailing-tag.test.js | CREATE | tests | AC-20260823-03-1, AC-20260823-03-2, AC-20260823-03-4, AC-20260823-03-7, AC-20260823-03-13, AC-20260823-03-14, AC-20260823-03-15, AC-20260823-03-16 |
| tests/ac-matrix/ac-matrix.test.js | MODIFY | tests | Tag the existing bare-trailing and mid-sentence-null pins with AC-20260823-03-5, AC-20260823-03-6 (retag only, assertions untouched) |
| tests/red-check/red-check.test.js | MODIFY | tests | AC-20260823-03-3, AC-20260823-03-17 |
| tests/frontmatter.test.js | CREATE | tests | AC-20260823-03-8, AC-20260823-03-9, AC-20260823-03-10 |
| tests/review/review-driver.test.js | MODIFY | tests | AC-20260823-03-11 |
| tests/design-driver.test.js | MODIFY | tests | AC-20260823-03-12 |
| .claude/spec-runs.jsonl | MODIFY | other | D5 six-row tier repair; D6 up-to-four appended escape rows |
| spec/.claude-plugin/plugin.json | MODIFY | other | D7 version bump + description changelog |
| specs/20260823/01-release-legs.md | MODIFY | other | D11 JJ-approved repair: move the two before-the-arrow `[pre-green: predicate-in-test]` declarations (AC-20260823-01-18, -20) into the declaration slot so they parse |

## Contracts

```js
// lib/spec-sections.js — parseAcBullets bullet shape gains two fields (D2 as amended by D11)
{
  id, token, malformed, raw,
  oracle, env, preGreen,            // unchanged — what PARSES never changes (D1)
  trailingRejected: string|null,    // the tolerant reading's tag run when it differs from what
                                    // the bare-only trailingRun accepted; null when there is no
                                    // near-trailing tag run, or the bare rule accepted it whole
  trailingRejectedCause:            // 'backticked-at-end' | 'not-at-end' | null (null iff
    string|null,                    // trailingRejected is null)
}
// Refusal predicate (the ONE authority — consumers never re-derive), D11:
//   wide = widened tolerant run: ((?:TAG_ITEM_SRC\s*)+)(?:→[^→]*)?$ on trailing-whitespace-
//          trimmed raw — tolerates exactly one final `→ <tail with no second →>` reference
//          suffix; capture trimmed of trailing whitespace
//   trailingRejected = (wide !== null && wide !== trailingRun(raw)) ? wide : null
//   trailingRejectedCause: 'backticked-at-end' when the UNWIDENED end-anchored tolerant run
//          ((?:TAG_ITEM_SRC\s*)+)$ matches and equals wide; else 'not-at-end'
// Note a mixed run (`[env: A] `[oracle: g]``) is refused WHOLE — bare members are inside
// trailingRejected too; a backticked tag beside an ACCEPTED bare tag at the true end is also
// refused (wide ≠ bare capture) while the bare tag itself keeps parsing (AC-20260823-03-16).
```

```js
// ac-matrix.js / red-check.js — new finding class (hard), replacing the generic finding
{ severity: 'hard', class: 'rejected-trailing-tag', ac: '<AC-ID>',
  detail: /* rejectedTrailingTagDetail(acId, trailingRejected, cause, underlying) — forked on
             cause (D11). backticked-at-end: byte-identical to D10's pinned text — names the
             refused tag text, that it ended the bullet backticked (bare-only trailing rule,
             rv_640c582f4902), remedy "remove the backticks, or move it into the declaration
             slot (backticks allowed there)". not-at-end: names that the tag sits before the
             bullet's final `→` reference, which is not a recognized declaration position;
             remedy "move it into the declaration slot (backticks allowed there)" — NEVER
             "remove the backticks" (false there: a bare tag before the arrow still does not
             parse). Both end: "if it is a quote: <the underlying problem — no executed
             coverage / unsanctioned skip / green expected-red file> still stands and needs
             its own fix" */ }
// Relevance gate per consumer (D1, unchanged by D11): oracle ↔ uncovered-ac ·
// env ↔ unsanctioned-skip · pre-green ↔ unsanctioned-green. Tag-name match is a substring
// test against trailingRejected ('[oracle:', '[env:', '[pre-green:').
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
- **Position-blind refusal (D11).** A genuine declaration written just before the bullet's
  final `→ tests/…` reference — the shape two shipped criteria in specs/20260823/01 actually
  used — is at neither recognized position, so before D11 it neither parsed nor set
  `trailingRejected`: still silent. After: the tolerant reading tolerates that one reference
  suffix and refusal is defined as tolerant-reading ≠ bare-accepted, with a cause
  (`backticked-at-end` / `not-at-end`) forking the remedy so it never prescribes the wrong
  fix. What PARSES is still untouched.
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
- **AC-20260823-03-13**: WHEN ac-matrix emits `rejected-trailing-tag` from ONE of its two loops
  THE SYSTEM SHALL redden only that loop's manifest leg — a coverage-loop emission on a spec
  with zero skip lines writes `{"leg":"skip-reconcile","exit":0,…}` alongside
  `{"leg":"ac-matrix","exit":1,…}`, and a skip-loop emission on a spec whose every AC is
  covered writes `{"leg":"ac-matrix","exit":0,…}` alongside
  `{"leg":"skip-reconcile","exit":1,…}` → tests/ac-matrix/rejected-trailing-tag.test.js
- **AC-20260823-03-14**: WHEN parseAcBullets parses a bullet whose tag run sits immediately
  before the bullet's final `→` reference (e.g.
  `` …SHALL y `[pre-green: predicate-in-test]` → tests/a.test.js ``) THE SYSTEM SHALL return
  `trailingRejected` = that run's text and `trailingRejectedCause === 'not-at-end'` with
  `preGreen === null`, while a backticked run at the true end returns
  `trailingRejectedCause === 'backticked-at-end'` →
  tests/ac-matrix/rejected-trailing-tag.test.js
- **AC-20260823-03-15**: WHEN rejectedTrailingTagDetail renders a `not-at-end` refusal THE
  SYSTEM SHALL name the position problem and the move-into-the-declaration-slot remedy and
  SHALL NOT contain the phrase "remove the backticks"; a `backticked-at-end` refusal SHALL
  CONTINUE TO render D10's exact message bytes →
  tests/ac-matrix/rejected-trailing-tag.test.js
- **AC-20260823-03-16**: WHEN a bullet ends with a backticked tag followed by an accepted
  bare tag (e.g. `` …SHALL y `[oracle: gate]` [env: FOO] ``) THE SYSTEM SHALL set
  `trailingRejected` to the tolerant run's text while `[env: FOO]` SHALL CONTINUE TO parse
  as a declaration (`env === 'FOO'`) → tests/ac-matrix/rejected-trailing-tag.test.js
- **AC-20260823-03-17**: WHEN red-check finds an expected-red file observed green and the
  carried AC's bullet carries a refused pre-green tag before its final `→` reference THE
  SYSTEM SHALL emit `rejected-trailing-tag` (not `unsanctioned-green`) whose detail carries
  the `not-at-end` remedy → tests/red-check/red-check.test.js

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

**Review waive (2026-08-23, JJ):** reconcile exit=3, `outOfPlan:6` — all six paths are
`.claude/agent-memory/**` worker-memory writes (four lesson notes plus the two persona
`MEMORY.md` index lines pointing at them). Worker memory is a build side-effect, never a
File Plan deliverable, and CLOSE's own disposition duty — not the File Plan — is its
governing surface; planning it into the File Plan would require predicting at lock which
lessons workers will learn. **Waived.** Disposition executed at close after a Fable consult:
`leg-exit-origin-tracking-not-class-set` and `predicate-widening-no-collision-proof`
**carried** (both teach a trap that generalizes past this diff — a finding class emitted from
two loops reddening both leg exits, and hand-tracing an amended regex against every
pre-existing fixture before claiming no collision); `d11-said-vs-parsed-trailing-tag-widening`
and `trailing-tag-anchor-vs-arrow-suffix` **deleted** (the first restates shipped code in a
named file, which git and the suite already hold and which drifts on the next edit to it; the
second's central claim — a tag before a `→ {test file}` suffix can never be recognized as
trailing — was falsified by D11 inside this same diff). The rule the split derives, offered
as a candidate CLOSE default and NOT adopted as doctrine here: a note describing shipped code
never carries, because the repo is already that memory; a note teaching a generalizing trap
can. Noted for a future guard, deliberately unbuilt (core § Incident Policy — count 1): the
per-persona memory corpus (11 and 17 notes) accretes with no eviction and no gate that can
observe whether a note ever helped, and this spec supplies the first recorded instance of a
memory falsified inside its own build.

**Deviations fold (close, 2026-08-23 — sidecar deleted; one entry promoted to pipeline rules
§ Gotchas as `[plugin]`, the rest recorded here as one-offs):**

- *Colliding test pin retagged in place.* `tests/ac-matrix/ac-matrix.test.js` carried a third,
  unlisted pin on the fixture D1 retires (`AC-20260822-71-1`, zero literal test hits, bullet
  ending in a backticked `[oracle:]`): it asserted `uncovered-ac`, which D1 replaces with
  `rejected-trailing-tag`, so it would have flipped from correct-green to false-red with no File
  Plan row authorized to fix it. Updated in place and retagged to AC-20260823-03-1 per the
  standing Gotchas convention; no assertion weakened — the expected class changed because D1
  changes the correct behavior for that fixture shape. No new Gotcha: the existing entry already
  states this convention and carried the resolution unaided.
- *Trailing-tag position vs the `→ {test file}` suffix (the D8 → D11 arc).* A declaration placed
  just before the AC grammar's own reference suffix sits at neither recognized position and
  parsed as nothing. D8 ruled the fixture retargeted and the anchor frozen; D11 (JJ-approved
  amendment) then found two LIVE instances in specs/20260823/01 whose own review had recorded
  `preGreen:0`, widened the tolerant side only, generalized the refusal predicate to
  said-vs-parsed, and forked the remedy text on `trailingRejectedCause` so "remove the backticks"
  is never emitted where it is false. Corpus evidence: all 843 AC bullets in `specs/`, exactly
  the 2 known drops fire, zero false positives; both live bullets repaired in this diff.
  **Deliberately no Gotcha entry** — the trap now announces itself at the moment it bites,
  naming the AC, the refused tag, and the move-into-the-declaration-slot remedy. A prose twin of
  a self-naming deterministic mechanism is the additive incident-memory text core § Incident
  Policy bans, and it would become a second source of truth about parser positions that diverges
  the day anyone touches the anchor. Residual gap, noted and unaddressed: findings fire on
  instances, so a future session evolving the AC grammar or the spec template itself gets no
  signal at design time; if that is ever worth closing, the carrier is one in-place sentence in
  the template's own declaration-slot text, never a Gotchas paragraph.
- *`rejectedTrailingTagDetail` extraction (D10).* Two byte-identical copies in `ac-matrix.js` and
  `red-check.js` moved into `lib/spec-sections.js`, which already owns the refusal predicate the
  remedy text explains. Pure move — no body line edited, message bytes unchanged and still pinned
  by the AC-1/-2/-3 detail assertions; both scripts' header comments corrected where they called
  the builder local. Recorded for accounting only; there is no lesson here.

## Canonical Delta

Pipeline rules § Gotchas, the `[plugin]` frontmatter-inline-comment entry
(rv_e83659d49386): append — "Closed for driver-read keys 2026-08-23 by
specs/20260823/03 (shared lib/frontmatter.js strips whitespace-preceded comments; seven
polluted ledger `tier` rows repaired). The own-line-comment habit remains good style;
spec-status.js always stripped." No other canonical docs change.
