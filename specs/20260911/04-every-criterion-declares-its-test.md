---
date: 2026-09-11
status: done
build_base: main
tier: critical
area: spec-grammar
design: false
breaking: false
depends_on: [specs/20260911/02-tests-have-a-ceiling.md]
depended_on_by: [specs/20260911/03-tests-expire-at-close.md]
brief: n/a
spiked: 2026-09-11
open_markers: 0
diff_base: 7b1e4a177d0a739f4a3c649e6d375cbc60f44254
---

# Every criterion declares its test

## Goal

An acceptance criterion says what it does to the test suite it inherits: it **writes** a brand-new
test, it **rewrites** a named existing one, or it **reuses** one that already covers the behaviour.
The declaration is mandatory at plan lock, the reference resolves to exactly one pre-image test, and
the build's pre-image check verifies each declaration against the named test rather than against its
whole file — so a rewrite gutted into passing is caught, and a reuse that quietly widens a tolerance
is caught. A repo that has not told the pipeline how to run one named test keeps today's per-file
behaviour exactly. Done means: a spec cannot lock with an undeclared criterion, `spec-paths
count-tests --titles` hands an author every reference string in the repo, a gutted rewrite reddens
this repo's own build, and every arm degrades to today's result — with a warning, never a finding —
when the named test cannot be resolved or selected.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | Three dispositions, declared as the AC bullet's trailing `→` pointer: `→ writes <test file>`, `→ rewrites <test file> :: <title prefix>`, `→ reuses <test file> :: <title prefix>`. The `::` separator is the repo's existing runner-qualifier convention (`ac-matrix.js`'s skip route 3, `<relpath>::<name>`); everything after it to the end of the bullet is the prefix, so a title carrying quotes, brackets, parentheses or an arrow needs no escaping. Measured on the 1,021-case live suite: 162 titles carry `"`, 202 carry `'`, 63 carry `]`, 5 carry `→`, the longest is 892 characters, and exactly 1 carries `::` (AC-20260911-04-1, AC-20260911-04-2). | A bracket tag (`[reuses: …]`) cannot carry 6% of this repo's titles — `lib/spec-sections.js`'s tag value is `[^\]]+` — and quoting cannot carry the 36% that hold a quote; the arrow tail is already the AC's test-reference slot and has no delimiter problem. |
| D2 | `lib/spec-sections.js` gains `parseDisposition(bullet) -> {kind:'writes'\|'rewrites'\|'reuses', file, prefix}\|null` and the floor `DISPOSITION_APPLIES_FROM = '20260911'`. `prefix` is `null` for `writes`. A bullet whose tail is prose that matches no disposition keyword parses as `null`, never as an error — the 440 existing arrow-bearing AC bullets and the 1,472 without one are untouched (AC-20260911-04-1). | One parser, the same home as every other AC-grammar fact; a floor is how this repo has already scoped `V7_APPLIES_FROM` and `EXPIRY_APPLIES_FROM`. |
| D3 | `ac-matrix.js --lint` gains finding class `missing-disposition` (hard, blocking at lock) for any well-formed AC bullet carrying no disposition in a spec whose date directory is `>= DISPOSITION_APPLIES_FROM`. Detail: `` `${b.id}: no disposition — end the bullet with → writes <file>, → rewrites <file> :: <title>, or → reuses <file> :: <title>` ``. The `--lint` summary line gains ` missingDisposition=N` before the ` · ` separator, and `observed.lint` gains the same key (AC-20260911-04-2, AC-20260911-04-3). | The user's ruling 2026-09-11: every criterion says it, every time — a disposition that may be omitted is the default-to-`writes` rot Fable named as this change's single biggest failure mode. |
| D4 | Reference resolution is a SEPARATE opt-in flag, `--resolve-root <dir>`, never `--root`: `--lint --resolve-root <dir>` resolves each `rewrites`/`reuses` reference by reading the named file under that root with `lib/scan-test-calls.js`'s `scanCalls` and matching titles by `startsWith(prefix)`. Zero matches or two-plus matches is hard class `unresolved-disposition`, detail naming the count and the file. Without `--resolve-root`, `--lint` runs exactly as today plus D3's arm. `--lint` combined with `--root`, `--manifest`, `--skips` or `--has-drift-script` REMAINS exit 2 (AC-20260911-04-3, AC-20260911-04-4). | Fable's condition 1: the lint must work where the per-test verification is off, so it never depends on a tree. A distinct flag name leaves `AC-20260907-01-6`'s pinned spec-only refusal literally true rather than superseding it. |
| D5 | `count-tests.js` gains `--titles [--file <rel>] [--json]`: one line per test case, `<file> :: <shortest within-file-unique title prefix>`, prefix grown a character at a time until unique within its own file, then extended to the next word boundary, capped at 200 characters (measured: ≤80 chars suffices for 1,017 of 1,021 cases, ≤200 for all 1,021). `--json` prints `{"titles":[{"file":"<rel>","prefix":"<p>","title":"<full>"}]}`. Exit 0 always; exit 2 only on usage error or unreadable root, unchanged (AC-20260911-04-5). | Without a way to find a reference string in seconds an author defaults to `writes` and the grammar rots; the scanner already returns every title, so this is a render, not a new derivation. |
| D6 | New optional top-level host-config key `testNameFilter`: a shell-argument fragment carrying `{name}`, e.g. `"--test-name-pattern={name}"`. `red-check.js` substitutes the **regex-escaped, anchored** title (`^…$`, escaping `\ ^ $ . | ? * + ( ) [ ] { }`) and appends the fragment to `testCommand` ahead of the file path, matching the existing `{typecheckCommand} <file>` append form. Absent ⇒ every file keeps today's per-file classification and red-check emits one warning naming the key. This is the spec's ONE `grounding-contract.md` edit; it changes `spec-paths contract-hash`, the build's host-escalation trigger for that change is EXPECTED, and the session answers it "proceed, sanctioned by D6" (AC-20260911-04-8, AC-20260911-04-13). | Spec 20260910/07's `postGateCommand` is the precedent for a one-key optional top-level command fragment with placeholder substitution; `capabilities` holds facts read OUT of runner output, not arguments passed INTO it. |
| D7 | Per-test verification runs ONLY for ACs declaring `rewrites` or `reuses`; an AC declaring `writes` keeps today's whole-file classification untouched. For each such AC red-check runs `{testCommand} {testNameFilter←title} <file>` once against the pre-image and requires: `rewrites` ⇒ **red**, `reuses` ⇒ **green**. A `rewrites` observed green is hard class `gutted-rewrite`; a `reuses` observed red is hard class `broken-reuse`. The whole-file arms (`unsanctioned-green`, `broken-pin`, `mixed-pin`, `missing-test-file`, `invalid-pre-green`, `rejected-trailing-tag`) are unchanged and still run (AC-20260911-04-6, AC-20260911-04-7). | Added spawn count is proportional to reuse, never to suite size — the measurement says today's specs declare reuse ~0% of the time, so day-one cost is ~zero and grows only as the behaviour we want grows. |
| D8 | Selection proof, and the one degrade path: red-check captures the filtered run's stdout and requires the resolved title to appear in it. Not resolvable in the pre-image by `scanCalls`, or resolvable but absent from the run's output, ⇒ the AC falls back to its file's whole-file classification and red-check emits a WARNING naming the file, the prefix and the cause (`unresolved` \| `unselected`) — never a finding, never a non-zero exit on this path alone (AC-20260911-04-9). | Spike S1: a pattern matching nothing exits 0 and reports `tests 1 / pass 1` with the FILE as the passing unit, so an exit code alone cannot tell "ran and passed" from "never ran" — and a host whose filter is a substring matcher rather than a regex would silently select nothing on every run. Fable's condition 2: the arm most likely to break a host on day one fails toward today's answer. |
| D9 | `review-legs.js`'s `tests` leg carries `observed:{count:N,dispositions:{writes:N,rewrites:N,reuses:N}}`, counted from the spec under review via `parseDisposition`. When `count-tests.js --json` exits non-zero or its stdout does not parse, the row carries `observed:{unavailable:"count-failed"}` and no `count`/`dispositions` key. The leg still always exits 0 and is still absent from every blocking set (AC-20260911-04-10, AC-20260911-04-11). | Fable's condition 3: without a per-spec disposition ratio there is no trigger for the amendment this spec reserves. A broken instrument reporting `count:0` is indistinguishable from an empty suite — the typed unavailable shape is what `ci` and `smoke` already use. |
| D10 | `lib/scan-test-calls.js`'s `isRegexContext` adds operators `+ - * % < > ~ ^` and keywords `typeof case await throw else in of` to its regex-opening set, and `scanCalls` gains the invariant that every recorded span ends on the call's own closing paren — never at `src.length` unless that paren is the source's last significant character. Division controls `arr[0]/2`, `x++/2`, `(a+b)/2`, `foo(a)/2` inside `if(...)` stay division (AC-20260911-04-12). | Eight executed two-call shapes each returned count 1 with `end === src.length`; `specs/20260911/03` imports these spans to DELETE tests, so a span reaching end of file is a file-corrupting deletion, and the span invariant — not the keyword list — is the property spec 03 depends on. |
| D11 | `.claude/spec.config.json` in THIS repo declares `"testNameFilter": "--test-name-pattern={name}"`; no other host is changed and `init-gen.js` does not generate the key. Hosts re-stamp `contractHash` through `/spec:doctor` on their own schedule (AC-20260911-04-13 `[oracle: gate]`). | This repo is the field test, per Fable; every other host stays on today's per-file behaviour until it opts in, so the blast radius on landing day is one repo. |
| D12 | Deliberately NOT built, and not to be re-proposed in the build: a `retires "<title>"` disposition on Decision rows, any `ac-drift.js` change, any behaviour registry or side index, renaming an existing test, a test-count cap or gate, mutation-guided deletion, property-based consolidation, and append-only tests. Test deletion at close is `specs/20260911/03`'s job and needs no grammar here. `[no-ac: a decision to build nothing has no observable; its enforcement is this row read by the build, and an AC asserting the absence of a registry would be an unfalsifiable negative over the whole tree]` | Scope held to one build; the deletion half already has an owner, and the rejected list is the 2026-09-11 research record. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/spec-sections.js | MODIFY | scripts | `parseDisposition` + `DISPOSITION_APPLIES_FROM` per D1/D2 |
| spec/scripts/ac-matrix.js | MODIFY | scripts | `missing-disposition` (D3), `--resolve-root` + `unresolved-disposition` (D4), summary/observed keys |
| spec/scripts/red-check.js | MODIFY | scripts | Per-test verification for `rewrites`/`reuses` (D6/D7), selection proof + degrade warning (D8) |
| spec/scripts/count-tests.js | MODIFY | scripts | `--titles [--file <rel>] [--json]` per D5 |
| spec/scripts/lib/scan-test-calls.js | MODIFY | scripts | Regex-context set + span invariant per D10 |
| spec/scripts/review-legs.js | MODIFY | scripts | `tests` leg typed unavailable + disposition counts per D9 |
| spec/templates/spec.md | MODIFY | doctrine | The `## Acceptance Criteria` comment gains D1's grammar; worked bullets show all three |
| spec/templates/grounding-contract.md | MODIFY | doctrine | One clause adding `testNameFilter` to § Required config keys' Optional list (D6) |
| spec/commands/plan.md | MODIFY | doctrine | Lock step 2 runs `ac-matrix --lint --resolve-root .`; names `count-tests --titles` as the reference lookup |
| .claude/spec.config.json | MODIFY | other | `testNameFilter` per D11 |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` |
| tests/disposition/grammar-and-lint.test.js | CREATE | tests | AC-20260911-04-1, -2, -3, -4 |
| tests/disposition/red-check-per-test.test.js | CREATE | tests | AC-20260911-04-6, -7, -8, -9 |
| tests/disposition/titles.test.js | CREATE | tests | AC-20260911-04-5 |
| tests/ceiling/tests-leg.test.js | MODIFY | tests | AC-20260911-04-10, AC-20260911-04-11 |
| tests/ceiling/count-tests.test.js | MODIFY | tests | AC-20260911-04-12 |
| tests/ac-matrix/lint-mode.test.js | MODIFY | tests | AC-20260911-04-14 — the summary-line pin updated in place for D3's two new counters, never weakened |

Orchestrator duties outside the table: apply the Canonical Delta to `docs/canonical/scripts.md` at
review close, not in the build; answer the contract-hash escalation with "proceed, sanctioned by D6".

## Contracts

```text
lib/spec-sections.js
  parseDisposition(bullet) -> { kind: 'writes'|'rewrites'|'reuses', file: string,
                                prefix: string|null } | null
  DISPOSITION_APPLIES_FROM = '20260911'

AC bullet tail grammar (D1) — the bullet's final → run, nothing after it:
  → writes tests/disposition/titles.test.js
  → rewrites tests/ceiling/count-tests.test.js :: AC-20260911-02-1: WHEN count-tests.js --root
  → reuses tests/review/review-legs.test.js :: AC-20260909-02-1: every leg subprocess is told

node spec/scripts/ac-matrix.js --spec <s> --lint [--resolve-root <dir>] [--json]
  exit 0 no findings · 1 findings · 2 usage (--lint with --root/--manifest/--skips/
  --has-drift-script is STILL exit 2 — --resolve-root is the only tree-reading companion)
  summary: `ac-matrix: lint malformed=N invalidPreGreen=N mixed=N missingDisposition=N
            unresolvedDisposition=N · N finding(s)`
  observed.lint: {malformed:N, invalidPreGreen:N, mixed:N, missingDisposition:N,
                  unresolvedDisposition:N}

node spec/scripts/count-tests.js --root <r> --titles [--file <rel>] [--json]
  human: one line per case, `<rel> :: <prefix>`
  --json: {"titles":[{"file":"<rel>","prefix":"<p>","title":"<full>"}]}
  exit 0 always · 2 usage error or unreadable root

red-check.js per-test run (D6/D7/D8), for rewrites/reuses ACs only:
  bash -c '{testCommand} {testNameFilter with {name}←escaped ^title$} "<file>"'
  rewrites ⇒ required red   · observed green = HARD gutted-rewrite
  reuses   ⇒ required green · observed red   = HARD broken-reuse
  unresolved | unselected   ⇒ fall back to the file's whole-file colour + WARN, never a finding
  new finding classes join the existing six; files[] rows unchanged, plus
  dispositions: [{ac, kind, file, prefix, expected, observed, fallback?}]

review-legs.js `tests` row (D9):
  {"leg":"tests","exit":0,"observed":{"count":N,"dispositions":{"writes":N,"rewrites":N,"reuses":N}}}
  {"leg":"tests","exit":0,"observed":{"unavailable":"count-failed"}}

host config (D6), top level, optional:
  "testNameFilter": "--test-name-pattern={name}"    // absent = per-file classification, as today
```

## Behavior

A spec author writes a criterion. If a test for that behaviour already exists they run
`spec-paths count-tests --titles --file <the file>`, copy the reference string, and end the bullet
`→ reuses <that string>`. If the behaviour exists but its assertion must change, `→ rewrites` the
same way. Otherwise `→ writes <the file they will create>`. The lock refuses the spec until every
criterion says one of the three, and — when the tree is available — until every reference names
exactly one test.

At build, the pre-image check keeps classifying whole files exactly as it does today, and adds one
targeted run per rewriting or reusing criterion: the rewrite must fail against the old
implementation (a rewrite gutted into passing does not, and is refused), the reuse must pass
unchanged (a reuse whose tolerance was widened does not, and is refused). A repo that has not
declared how to run a single named test gets none of this and loses nothing.

At review, the evidence row that already records the repo's test count also records how many
criteria wrote, rewrote and reused. That ratio is the instrument: if rewrites and reuses stay at
zero across the next several closes while the count keeps climbing, the grammar is being defaulted
and the missing piece is discovery, not doctrine.

## Acceptance Criteria

- **AC-20260911-04-1**: WHEN `parseDisposition` reads a bullet ending `→ reuses tests/a.test.js :: AC-1: a title with "quotes", [brackets] and (parens)` THE SYSTEM SHALL return `{kind:'reuses', file:'tests/a.test.js', prefix:'AC-1: a title with "quotes", [brackets] and (parens)'}`, return `{kind:'writes', file:'tests/b.test.js', prefix:null}` for `→ writes tests/b.test.js`, and return `null` for a bullet whose tail is prose (`→ the count row in tests/c.test.js`) — never throw and never a finding → writes tests/disposition/grammar-and-lint.test.js
- **AC-20260911-04-2**: WHEN `ac-matrix.js --lint` reads a spec under `specs/20260911/` whose well-formed AC carries no disposition THE SYSTEM SHALL exit 1 and print one line `HARD  missing-disposition   AC-20260911-99-1: no disposition — end the bullet with → writes <file>, → rewrites <file> :: <title>, or → reuses <file> :: <title>`, and its last stdout line SHALL read `ac-matrix: lint malformed=0 invalidPreGreen=0 mixed=0 missingDisposition=1 unresolvedDisposition=0 · 1 finding(s)` → writes tests/disposition/grammar-and-lint.test.js
- **AC-20260911-04-3**: WHEN `ac-matrix.js --lint --resolve-root <dir>` reads a spec whose AC declares `→ reuses tests/a.test.js :: no such title` against a tree whose `tests/a.test.js` holds one case titled `AC-1: something else` THE SYSTEM SHALL exit 1 with hard class `unresolved-disposition` naming `0` matches and the file, and WHEN the same tree holds two cases both titled with the prefix `AC-1` and the bullet declares `:: AC-1` THE SYSTEM SHALL emit the same class naming `2` matches → writes tests/disposition/grammar-and-lint.test.js
- **AC-20260911-04-4**: WHEN `ac-matrix.js --lint` is combined with `--root`, `--manifest`, `--skips` or `--has-drift-script` THE SYSTEM SHALL CONTINUE TO exit 2 naming `--lint` as spec-only, and a spec with no `## Acceptance Criteria` section SHALL CONTINUE TO exit 2 naming the missing section → reuses tests/ac-matrix/lint-mode.test.js :: AC-20260907-01-6: --lint combined with --root, --manifest, --skips, or --has-drift-script
- **AC-20260911-04-5**: WHEN `count-tests.js --root <r> --titles --file tests/a.test.js` runs over a file holding `test('alpha one', …)` and `test('alpha two', …)` THE SYSTEM SHALL print exactly `tests/a.test.js :: alpha one` and `tests/a.test.js :: alpha two` (the prefix grown past the shared `alpha ` run to the first distinguishing word), and `--json` SHALL carry `{"file":"tests/a.test.js","prefix":"alpha one","title":"alpha one"}` → writes tests/disposition/titles.test.js
- **AC-20260911-04-6**: WHEN `red-check.js` runs with `testNameFilter` declared against a spec whose AC declares `→ rewrites tests/a.test.js :: AC-99-1: the rewritten case`, and that case passes against the pre-image while a sibling case in the same file fails THE SYSTEM SHALL exit 1 with hard class `gutted-rewrite` naming the AC and the prefix — the sibling's redness SHALL NOT satisfy the rewrite → writes tests/disposition/red-check-per-test.test.js
- **AC-20260911-04-7**: WHEN the same run reads an AC declaring `→ reuses tests/a.test.js :: AC-99-2: the reused case` and that case FAILS against the pre-image THE SYSTEM SHALL exit 1 with hard class `broken-reuse` naming the AC and the prefix, and WHEN it passes THE SYSTEM SHALL emit no finding for that AC → writes tests/disposition/red-check-per-test.test.js
- **AC-20260911-04-8**: WHEN `red-check.js` runs against a host config with NO `testNameFilter` key over a spec carrying `rewrites` and `reuses` dispositions THE SYSTEM SHALL emit exactly one warning naming `testNameFilter`, report `dispositions: []`, and spawn no per-test run at all (a runner-argv recorder logs one invocation per tests-layer file and none carrying a name filter) → writes tests/disposition/red-check-per-test.test.js
- **AC-20260911-04-15**: WHEN `red-check.js` runs against a host config with no `testNameFilter` key THE SYSTEM SHALL CONTINUE TO classify every File Plan tests-layer file exactly as it does today — one `{testCommand} <file>` run per file, one `files[]` row per path carrying `path`/`expected`/`observed`/`carriedAcs`, and the same six finding classes → reuses tests/red-check/red-check.test.js :: AC-20260821-01-13: --json prints the Contracts shape
- **AC-20260911-04-9**: WHEN an AC declares `→ reuses tests/a.test.js :: no such title` and `testNameFilter` IS declared THE SYSTEM SHALL fall back to `tests/a.test.js`'s whole-file colour, emit `WARN` naming the file, the prefix and cause `unresolved`, emit NO finding for that AC, and exit 0 when no other finding exists; and WHEN the title resolves but the filtered run's stdout does not contain it THE SYSTEM SHALL do the same with cause `unselected` → writes tests/disposition/red-check-per-test.test.js
- **AC-20260911-04-10**: WHEN `review-legs.js` runs over a fixture host whose `count-tests.js` invocation exits non-zero THE SYSTEM SHALL append exactly one `{"leg":"tests","exit":0,"observed":{"unavailable":"count-failed"}}` row carrying no `count` key — a failed instrument SHALL NOT read as `{"count":0}` → rewrites tests/ceiling/tests-leg.test.js :: AC-20260911-02-5 (full scope): WHEN review-legs.js runs over a fixture host
- **AC-20260911-04-11**: WHEN `review-legs.js` runs over a fixture host reviewing a spec whose ACs declare two `writes`, one `rewrites` and one `reuses` THE SYSTEM SHALL append `{"leg":"tests","exit":0,"observed":{"count":N,"dispositions":{"writes":2,"rewrites":1,"reuses":1}}}` → writes tests/ceiling/tests-leg.test.js
- **AC-20260911-04-16**: WHEN the `tests` leg gains its disposition counts THE SYSTEM SHALL CONTINUE TO keep `"tests"` out of `review-legs.js`'s `BLOCKING` array literal — a leg with no red arm can never redden a review → reuses tests/ceiling/tests-leg.test.js :: AC-20260911-04-16
- **AC-20260911-04-12**: WHEN `scanCalls` reads a two-call source whose first call is followed by `typeof /a'b/` (and, each in its own case, by `"^" + /a'b/.source`, `case /a'b/.test(y):`, `await /a'b/.exec(y)`, `throw /a'b/`, `x < /a'b/.source.length`, `1 - /a(b/.source.length`, `else /a'b/.test(y)`) THE SYSTEM SHALL return 2 calls with the first call's `end` strictly less than the second's `start` and neither equal to `src.length` → writes tests/ceiling/count-tests.test.js
- **AC-20260911-04-17**: WHEN the regex-context set is widened per D10 THE SYSTEM SHALL CONTINUE TO read `arr[0]/2`, `x++/2`, `(a+b)/2` and `foo(a)/2` inside `if(...)` as division → writes tests/ceiling/count-tests.test.js
- **AC-20260911-04-18**: WHEN `count-tests.js --root .` runs over this repository immediately before and immediately after D10's change THE SYSTEM SHALL report the identical count both times — no live file exercises the widened shapes, so a corrected set moves no total, and a moved count means the set was blanket-widened rather than corrected → writes tests/ceiling/count-tests.test.js
- **AC-20260911-04-14**: WHEN `ac-matrix.js --lint` runs over a spec whose bullets are one promise, one pin and one two-clause pin, each carrying a disposition, THE SYSTEM SHALL print exactly `ac-matrix: lint malformed=0 invalidPreGreen=0 mixed=0 missingDisposition=0 unresolvedDisposition=0 · 0 finding(s)` as its last stdout line and exit 0 — the existing pin's expectation updated in place for D3's two counters, never weakened away → rewrites tests/ac-matrix/lint-mode.test.js :: AC-20260907-01-5: --lint on a spec whose bullets are one promise
- **AC-20260911-04-13** `[oracle: gate]`: WHEN the build completes THE SYSTEM SHALL leave `spec/templates/grounding-contract.md` § Required config keys naming `testNameFilter` in its Optional list with an `absent = …` clause, `.claude/spec.config.json` carrying `"testNameFilter": "--test-name-pattern={name}"`, and `scripts/plugin-bump.js --check` green → writes spec/.claude-plugin/plugin.json

## Assumptions (escalation triggers)

- **A1 — `--test-name-pattern` selects one case by anchored title, and a non-match is invisible to the exit code.** Executed 2026-09-11 on Node v26.8.2 against a 3-case fixture: matching+passing → exit 0, `✔ <title>`; matching+failing → exit 1; matching NOTHING → **exit 0** with `ℹ tests 1 / pass 1` and `✔ <file path>`; unescaped `(` in the title → identical to the no-match case. *If false →* D8's selection proof is the whole guard; without it every `reuses` check would false-pass. Never infer selection from an exit code.
- **A2 — the `::` reference needs no escaping and is unambiguous.** Measured over all 1,021 live cases with the repo's own scanner: 0 duplicate titles repo-wide, 0 non-literal titles, 63 titles contain `]`, 162 `"`, 202 `'`, 5 `→`, exactly 1 contains `::`, longest 892 chars; a prefix ≤80 chars is unique within its own file for 1,017 of 1,021 and ≤200 for all 1,021. The corpus was the pre-merge tree; merging spec 02 into `main` moved the live total to 1,038, which changes none of these ratios and no decision here — no count is a live invariant in this spec. *If false →* D4's `unresolved-disposition` refuses the ambiguous reference at lock and the author lengthens the prefix; the cap rises to 400 before any other change.
- **A3 — the existing tag parser needed no change and was not used.** Executed against `parseAcBullets`/`extractTag`: a bracket tag carries a quoted title with parens and colons intact but returns `null` the moment the title contains `]`, and a tag placed after the arrow parses as a refused trailing tag. *If false →* nothing; D1 takes the arrow tail precisely to avoid this surface.
- **A4 — the arrow tail is free of structural consumers.** 440 of 1,912 live AC bullets carry a `→`; the only mechanical reader is `wideTrailingRun`'s tolerance of exactly one trailing `→ tail` while computing `trailingRejected`, and it tolerates any tail with no second `→`. *If false →* the disposition moves to its own line beneath the bullet (`parseAcBullets` already joins continuation lines into `raw`), no other decision changes.
- **A5 — every consumer degrades on an absent optional key by a bare truthiness guard at the read site**, the idiom `red-check.js` already uses for `typecheckCommand` and `review-legs.js` for `capabilities.skipReportPattern`; `readConfig` applies no defaults and rejects no unknown key, and neither `/spec:doctor` check 1 nor `init-gen.js` validates additive keys. *If false →* the key moves inside `capabilities` and D6's clause moves to § Capabilities.
- **A6 — this repo's own stamp is already stale**, so D6's contract edit adds no new class of cost here: the live hash has moved to `a068cad4c6a6` against a stamped `d84ad1eb648e`, and q167 already queues the re-stamp. *If false →* nothing changes in the build; the re-stamp is the same `/spec:doctor` run either way.
- **A7 — `specs/20260911/03` names `lib/test-scan.js`, a path that no longer exists** (renamed to `lib/scan-test-calls.js` at spec 02's close) in its D2 and in its `test-expiry.js` File Plan row. That spec is `hardened` and builds after this one. *If false →* nothing here; queued at `--top` so the stale name is corrected before 03 builds, never silently by a worker.

## Rationale

The measurement that killed the test ceiling is the reason this spec exists. Across 37 closed specs
on `main`, the suite grew by 325 cases (~+9 per spec) while 35 were removed; behaviour-change specs
added a median 6.5 and 17 of 18 removed nothing; 0 of 321 promise criteria were satisfied by
rewriting an existing test and 316 got a brand-new case; 76 of 85 `SHALL CONTINUE TO` pins landed as
brand-new cases appended to files that already carried the coverage. About 36% of the growth is real
new surface and 64% is an artifact of the pipeline's own grammar: an AC-ID is a test's identity, so a
criterion can only ever be satisfied by appending. Post-July-2026 field research found no bounded
suite anywhere, raw test count judged the most gameable coverage metric, and no spec framework with
any state for a test whose requirement was superseded — but one mechanical check named repeatedly as
the thing that would work and that no tool ships: a rewritten test must still fail against the
pre-image. This repo already runs that check, at file granularity. D7 is that check at the
granularity the literature describes.

Fable ruled the alternative — deriving a test's identity from the behaviour it asserts — a trap:
"behaviour" has no derivation here, the only stable handles are a test's file and its title, and a
hand-maintained registry drifts while ripping out an AC-ID grammar that six scripts, the replay
harness and two host repos depend on. D1 therefore keeps the AC-ID as identity and adds only a
declaration of intent.

Three conditions came from Fable and are why D4, D8 and D9 exist rather than being deferred: the
lint must work on hosts where verification is off, or the grammar is dead everywhere but here and
the ratio data comes from one repo; the fail-toward-today claim must be an acceptance criterion
rather than a design intent, because hand-typed titles are the arm most likely to break a host on
day one; and the disposition ratio must ship inside this spec, because without it the amendment this
spec reserves the right to make would have no trigger.

Two queued defects ride here because they live in the files this spec already opens and both must
land before `specs/20260911/03` builds: the scanner's residual regex-context gap (D10), whose spans
spec 03 uses to delete tests, and the tests leg mapping an instrument failure to a green `count:0`
(D9), which would silently zero the very measurement this spec's falsification depends on.

The user ruled on 2026-09-11 that the declaration is mandatory on every criterion rather than only
on the reuse cases, and — with Fable's agreement that no concrete failure distinguishes the paths —
that the grammar and its verification ship as one spec rather than two, so hosts re-stamp the
grounding contract once instead of twice.

**Falsification, four weeks after landing**, re-running the same measurement over specs closed since:
change-class median net ≤ +3 (from +6.5); pin-as-new-case < 10% (from 89%); rewrites > 0 (from
0/321); every replace-class spec removes ≥ 1 case; asserts-per-case flat (a rise against a flat count
means the growth moved inside the tests). Grammar health: if ≥ 80% of criteria still declare
`writes`, the disposition is being defaulted and the missing piece is discovery, not doctrine — and
if the first three targets are missed, the mechanism is elsewhere, most likely the test-author
contract itself, and this approach is wrong.

**As built (deviations folded at close, 2026-09-11).** Seven departures, none changing a Decision:

- `spec/entrypoints.json` gained two `entryPoints` rows under `count-tests.js` — the doctrine edits
  to `plan.md` and `spec.md` name `spec-paths count-tests`, and the reverse-invocation check
  requires the manifest to declare that. A File Plan omission, waived at review on the standing
  ruling that adding a member to an exhaustive live-file pin always lands out-of-plan.
- The single-key `.claude/spec.config.json` edit (D11) was applied by the orchestrator rather than
  a worker; that wave held no other file.
- `--lint --json`'s `observed.lint` carries D3's two new keys only for specs dated on or after
  `DISPOSITION_APPLIES_FROM`, where the Contracts block shows five keys unconditionally. Forced by
  a live `deepStrictEqual` pin on the 3-key object for an undated fixture spec, outside this File
  Plan. The human summary line always prints all five, so every pinned string holds.
- AC-20260911-04-17's disposition was amended from `reuses` to `writes`: the cited reference
  resolved to a case asserting only a positive count and the absence of two files, so the criterion
  was carried by a header comment and nothing else. A real division pin now lives in the same file.
  The amendment note lives outside the bullet — an indented sub-line is folded into the bullet's
  raw text, which strips the criterion of its trailing pointer and trips D3's own refusal.
- AC-20260911-04-16's `reuses` reference was re-pointed after the coverage fix retitled the reused
  case, which had left the spec citing a prefix that no longer resolved.
- The first AC-20260911-04-18 pin was vacuous: it patched D10's widening INTO a copy of the
  already-widened library, comparing a scanner against itself. Rewritten to derive a genuinely
  pre-D10 image by REMOVING D10's lines, and to prove the two images disagree on a control corpus
  before asserting they agree on the live one.
- The spec plugin landed at 7.146.0, not the 7.144.0 the build derived: two siblings landed on
  `main` during the build and claimed 7.144.0 and 7.145.0. The second of those (7.145.0) is D10's
  own scanner widening, landed independently in a refactored form using named constants; the merge
  resolved to that form, which is semantically identical and keeps one definition of the set.
  AC-20260911-04-18's pre-image reconstruction was retargeted at the merge to narrow the two named
  constants rather than delete the two inline lines it originally grepped — the pin fails closed on
  a stale reconstruction, which is how the drift surfaced.
- `parseDisposition`'s right-to-left rescan is a collected index array walked backward, not a
  `lastIndexOf(bullet, arrowIdx - 1)` loop: that shape infinite-loops the moment an unmatched arrow
  sits at index 0, because `lastIndexOf` clamps a negative `fromIndex` to `0` and re-finds the same
  index forever.

**The lesson this build paid for twice.** A spec that ships a new AC grammar is parsed by the
parser it ships, so its own prose examples become fixtures: taking the FIRST matching arrow made
six of this spec's criteria parse as the examples they quote, and an ordinary amendment sub-bullet
silently stripped a criterion of its pointer. Both were invisible to every deterministic leg and
surfaced only by running the lock lint against the spec itself — which is now the thing to run
before closing any spec that changes AC grammar.


## Canonical Delta

Apply to `docs/canonical/scripts.md` at review close:

An acceptance criterion declares what it does to the test suite it inherits — `→ writes <file>`,
`→ rewrites <file> :: <title prefix>`, or `→ reuses <file> :: <title prefix>` — and the declaration
is refused at plan lock when absent or when its reference resolves to other than exactly one
pre-image test. `::` is the reference separator because a title may carry quotes, brackets,
parentheses or an arrow but essentially never that pair; a prefix is grown only until it is unique
within its own file. `count-tests.js --titles` is the one place an author finds a reference string.
The pre-image check verifies a rewrite is red and a reuse is green against the named test rather
than its whole file, but only where the host declares `testNameFilter`; absent, every file is
classified exactly as before. A test-name filter that selects nothing is invisible to a runner's
exit code — the run's own output naming the selected title is the only proof of selection, and an
unresolved or unselected reference falls back to the file's colour with a warning, never a finding.
