---
date: 2026-08-15
status: implementing
diff_base: 2b8dd3b0d8b378c425efe5135d759c9f92076150
open_markers: 0
risk: T3
area: authoring-integrity
design: false
breaking: false
depends_on: ["specs/20260814/05-collision-closure.md"]
depended_on_by: []
brief: n/a
---

# Recurrence carriers — two ledgered classes stop depending on authoring-time memory

## Goal

Two defect classes the pipeline detects correctly, records durably, and then re-commits
anyway — because the record's only enforcement is a model remembering it at authoring time —
get deterministic carriers. (1) Review's advisory-smell capture drops its keep/drop
`AskUserQuestion` (a fork review.md itself declares consequence-free, which the question-style
judge therefore correctly blocks — three rewordings bounced 2026-08-15) in favor of
derive-and-announce through a new `advisory-append.js` that appends, dedupes, and 📌-announces
mechanically. (2) The private-config-read class (four ledgered rows in
`docs/audit/advisory-findings.md`; census at plan time found **four live offenders**, two never
ledgered) is paid down — `lib/host-config.js` gains the strict-read variant its own advisory
row prescribed, all four call sites swap to the lib — and pinned closed by a suite test that
reddens on any future private read. Done = the append script's exec pins run green, the
review.md and scaffold-ledger pins run green, the closure pin runs green with zero offenders,
and every retargeted pin (`keep`/`drop`, `{M} accepted`, spec-paths key set) is updated in
place, never weakened.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `spec/commands/review.md`'s **Advisory smell presentation** paragraph is rewritten: the batched keep/drop `AskUserQuestion` is **deleted**. The session still prints one plain-language line per `smells` entry, then writes the `smells` array to a fresh `mktemp` JSON file and runs `node "$(spec-paths advisory-append)" --root {root} --spec {spec path} --run-id {wf id} --smells <file>`, printing its output verbatim — the script appends the rows (creating the ledger with its header comment on first append), suppresses duplicates of still-open rows, and announces the auto-keep with its 📌 line. One clause records the derivation: keep is the conservative option per shared.md § Question Style (a row is later-rejectable at audit via `rejected(<reason>)`; a dropped signal is unrecoverable). Deleted with the question: the "keep —…" / "drop — no record kept" option sentences, "Dismissed findings get no record", the dismissed-question STOP sentence and its `<!-- unenforced: model-judgment step -->` marker, the "the question-style hook gates this like any other question" sentence (it asserted a compatibility shared.md § Question Style contradicts), and the stale "header comment shown in the Contracts section" pointer (review.md has no Contracts section; the header template now lives in the script — its only executable home). The paragraph's opening invariant ("this group can never change the verdict word or block Phase 3") and the `lensFailed` line are untouched. | The judge's three bounces were structural, not phrasing: review.md itself declares the fork consequence-free, and shared.md's two-lenses filter already rules "don't ask — take the option cheapest to reverse and announce it". A question that can only pass the judge by inflating its stakes should not pass; rewording a fourth time or carving a gate exemption were both rejected as gate erosion (2026-08-15 Fable consult). |
| D2 | CREATE `spec/scripts/advisory-append.js` (repo script conventions: header with usage / dated incident / does-NOT-do / `Exit codes:` list, hand-rolled `--flag value` parsing, remedy-naming errors, `#!/usr/bin/env node` + `'use strict'`). Registered as `spec-paths advisory-append`. It is the sole review-time writer of `docs/audit/advisory-findings.md` — the append never rides session prose again. **Dedupe key: `(class, file-without-line, counterpart-file-without-line-or-empty)`.** An entry whose key matches an existing row NOT marked `RESOLVED` is suppressed (counted, reported); a key whose only matches are `RESOLVED` rows appends fresh — that is the recurrence signal, deliberately preserved (the four-row config-read history is the designed-for case: same class, new file ⇒ new key ⇒ new row; same file recurring after a paydown ⇒ RESOLVED-only match ⇒ new row). `--date YYYY-MM-DD` overrides today's date (deterministic tests); the first-append header is byte-identical to the live artifact's two header lines. `suggestion` fields are not persisted (they live in the workflow journal). | The workflow already returns everything the row grammar needs (`{file, line, class, claim, counterpart?}` + session-held spec path, runId, date); prose-executed appends and hand-judged dedupe were the last model-dependent steps in the capture chain. Fable's consult flagged unbounded re-append as the one new hole auto-keep opens; the dedupe rule closes it without losing recurrence. |
| D3 | `tests/review/smell-lens.test.js` pins are retargeted **in place, never weakened** (the colliding-pin Gotcha): the keep/drop halves of AC-20260812-01-6 become pins that the advisory paragraph invokes `spec-paths advisory-append` and contains **no** `AskUserQuestion` (retagged AC-20260815-01-7); AC-20260813-07-7's literal `{M} accepted` becomes `{M} recorded` (retagged AC-20260815-01-8). Untouched in the same file: the return-shape pins, the never-enters-verdict pin (now also this spec's regression pin AC-20260815-01-9), and the `/first[- ]append/` pin — D1's rewritten sentence keeps the "first append" phrasing so that assertion stands as-is. | These are the only two corpus loci asserting the retired wording (stem-grep executed 2026-08-15, A4); updating them in the same File Plan is what keeps the suite green through the doctrine change. |
| D4 | `spec/doctrine/scaffold-ledger.md`: the **Review smell lens** row is rewritten in place — mechanism now names derive-and-announce via `advisory-append.js`, and RETIRE re-anchors to signals that still exist under auto-keep: *retire if 10 consecutive ledgered full-scope reviews across hosts emit zero smells, or if two consecutive audits `rejected(…)` every review-lens row they ingested* (the lens records only noise). PROMOTE keeps its shape with `accepted rows` → `recorded rows`. Two rows are **added**: `advisory-append.js` (structural; retires with the smell-lens row — the carrier dies with its signal source) and the config-read closure pin (gate; already blocking via the suite so no promote path; retires only if `lib/host-config.js` is itself dissolved). No blank line enters the table region (the drift-reconcile blank-line pin counts them). | The old RETIRE counted "zero **accepted** findings", which measures nothing once acceptance is automatic — the signal moves to emission volume and audit-side fate, exactly where adjudication now lives. Every new mechanism owes a ledger row (doctor check 13; hard review check). |
| D5 | `spec/scripts/lib/host-config.js` gains `readConfigStrict(root)`: **throws** `Error('cannot read/parse <configPath> (<cause>)')` on an absent, unreadable, or unparsable config; on a **successful parse it returns the parsed value verbatim** — object, array, scalar, or null — with **no shape coercion and no non-object throw**: every caller's existing guard (`typeof config.gateCommand === 'string'`, `config.design && …`) already owns shape handling, and that verbatim return is precisely what preserves each script's current behavior on odd-but-valid JSON (adversarial check: a config containing `3` makes `ci-gate-parity` exit 0 `inapplicable — no gateCommand` today, and `spec-design-driver` fall through to its no-design-block die — a non-object throw would have silently rewritten `ci-gate-parity`'s locked exit contract). `readConfig` is byte-untouched. The header's "deliberately does NOT surface read/parse errors" clause narrows to name `readConfig` specifically, and the header cites this spec as the strict variant's origin (the 2026-08-15 advisory row prescribed exactly this shape: the divergence across readers was always the ERROR POLICY, never the read). Exports become `{ readConfig, declaredForge, readConfigStrict }`. | The lib's "sole reader" claim was aspirational — strict-flavored consumers (`ci-gate-parity`, `spec-design-driver`) structurally could not call it, so they read privately. Serving both error policies removes the last legitimate reason for a private read, which is what makes D7's closed pin fair. |
| D6 | Four call-site swaps, **exit codes, degrade paths, and remedy phrases preserved; message assembly goes through the lib**: the two strict callers catch and die with `e.message` **plus their own remedy suffix, never re-wrapping** (re-wrapping would nest the lib's already-formatted `cannot read/parse …` string). `ci-gate-parity.js`: `try { config = readConfigStrict(root) } catch (e) { die(e.message + ' — fix the config or check --root') }` — the final stderr text is byte-identical to today's. `spec-design-driver.js`: same pattern with `die(e.message + ' — run /spec:init first')` — exit code and remedy preserved; the message's clause order changes from today's hand-rolled string (unpinned anywhere — adversarial check confirmed no test asserts either script's literal error text; recorded as the one deliberate text delta). `design-atlas.js`'s `atlasRoutes` read becomes `((readConfig(root).design || {}).atlasRoutes) || {}` (same `{}` degrade); `fidelity-check.js:114` becomes `const config = readConfig(repoRoot)` (its local `readJson` stays — its two sidecar reads are not this class). Non-object valid-JSON configs behave exactly as today in all four scripts via D5's verbatim return. Each file requires the lib via its existing relative-path convention. | Call-site swaps with pinned identical behavior are the cheapest reversible form of the paydown; the strict/swallow split lands exactly where each script's locked contract already put it. |
| D7 | CREATE `tests/host-config/config-read.test.js`: (a) exec pins for `readConfigStrict` (AC-10) and the `readConfig` degrade regression (AC-11); (b) **the closure pin** (AC-12): walk every `.js` under `spec/scripts/` except `lib/host-config.js` and assert **no line pairs `spec.config.json` with `readFileSync` or `path.join`** — the assert message names the offending file:line and the remedy (`require lib/host-config.js — readConfig for degrade-to-{} semantics, readConfigStrict for fail-loud`). Comment and error-message mentions stay green by construction (executed A2: the predicate flags exactly the four real reads today and neither prose mention). The pin is authored red-first: it fails on the four live offenders until D6's swaps land. | This is the class's deterministic carrier — the thing four ledger rows, an extraction with a self-describing header, and a one-day recurrence prove prose cannot be. Lexical scope is `spec/scripts/**/*.js` because that is the ledgered population; repo-root `scripts/` measured clean (A2). |
| D8 | Report surface: review.md Phase 3's `artifacts` slot description and report template line change `{M} accepted` → `{M} recorded` (M = rows the script actually appended, read from its output; suppressed-duplicate counts stay in the script's stdout, not the slot). `spec/doctrine/claims-baseline.json` is re-stamped via the standard remedy — `node "$(spec-paths claims-lint)" --update-baseline`, a **full-corpus rescan** — in the same commit, covering **both** doctrine files whose line counts move (review.md AND scaffold-ledger.md; the baseline carries a live per-file entry for each, and `tests/claims/`' corpus `totalLines` assert reddens outside this spec's scoped gate if either entry is hand-edited in isolation). `spec/.claude-plugin/plugin.json` bumps with a changelog description naming both carriers — target 6.77.0 (target, not a pin: specs 20260814/03 and /05 are hardened-unbuilt targeting 6.75.0/6.76.0 and concurrent sessions race semver; build takes the next free number). | "Accepted" implied an adjudication that no longer happens at review; audit is where fate is decided now. Version/claims discipline per host rules; full-corpus re-stamp per the adversarial check (a review.md-only hand edit strands scaffold-ledger.md's entry). |
| D9 | v1 deliberately does NOT: add a meta-doctrine rule ("every recurring ledger class must be mechanized") — audit's ≥2-per-class enforcer promotion and the intake class-discipline row already own that policy, and this spec is that policy being applied, not restated; touch `scripts/question-style-gate.js` or shared.md § Question Style (the gate correctly caught the class — the filter clause is the ruling, not the defect); touch `wf-review` source or `verdict.js` (the `smells`/`lensFailed` return contract is untouched; advisory stays advisory by construction); touch `spec/commands/audit.md` (its ingest contract reads the same row grammar the script preserves). Reopen conditions: a second doctrine-mandated question the judge blocks structurally → sweep command doctrine for mandated asks; a fifth config-read recurrence that evades the lexical predicate → widen it and record the measurement, mirroring the collision-closure tier reopen. | Fencing to the two live classes keeps the blast radius at one doctrine paragraph, one lib addition, four one-line swaps, and two test files; every exclusion carries its reopen condition. |
| D10 | **Build-time ruling (2026-08-16, retainer; A2's refine branch exercised).** The AC-12 closure predicate is specified exactly, and D7's one-line lexical sketch is superseded by it: the pin walks `spec/scripts/` recursively with a pure `fs.readdirSync` walk — **never a shell grep** (`fidelity-check.js` carries a stray NUL byte at line 136 that makes grep classify the file binary and silently drop its hits, which is how the plan-time census mis-measured) — collects `*.js`, skips exactly `lib/host-config.js`, reads each file `utf8`, splits on `\n`, and applies per line **in this order**: (1) line lacks the literal `spec.config.json` → green; (2) line contains `readFileSync` → **offender, unconditionally** (checked first so no later clause can exempt a read); (3) line contains `path.join` → **offender**, unless the line matches the display-join exemption `/\$\{\s*path\.join\([^()]*['"`][^'"`]*spec\.config\.json['"`][^()]*\)\s*\}/` — the pairing occurs as a template-literal interpolation consisting solely of one `path.join(...)` call with no nested parentheses and the filename as a quoted literal argument, i.e. a path rendered for display and structurally incapable of reading; (4) otherwise → green. The assert names `file:line` plus the D7 remedy string, unchanged. | A2's escalation clause authorized exactly this ("a prose mention trips it → refine the predicate so prose mentions stay green — never exempt a real read"). `suite-baseline.js:150` renders the config path inside an error message while its real read goes through the lib three lines above; it is a prose mention, not a fifth offender, so swapping it would be cosmetic churn on a T3 script that the next remedy message would re-redden. The worker's blocking claim — that any predicate catching the two cross-line offenders must also catch `:150` — was refuted by execution: the offenders' joins are plain-code expressions, `:150`'s is an interpolation-only display join, and clause 2's unconditional read check keeps a real read inside an interpolation flagged. D9's reopen condition is unchanged: the one evasion shape this adds (capture a display join, read it later) already falls under "evades the lexical predicate → widen it and record the measurement", and enumerating shapes there would be the additive-prose move the spec rejects. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/advisory-append.js | CREATE | scripts | D2: append + dedupe + first-append header + 📌 announce; full contract below |
| spec/scripts/lib/host-config.js | MODIFY | scripts | D5: `readConfigStrict` + header narrowing; `readConfig` byte-untouched |
| spec/scripts/ci-gate-parity.js | MODIFY | scripts | D6: swap inline read → `readConfigStrict` in try/catch → existing `die` |
| spec/scripts/spec-design-driver.js | MODIFY | scripts | D6: swap inline read → `readConfigStrict` in try/catch → existing `die` |
| spec/scripts/design-atlas.js | MODIFY | scripts | D6: `atlasRoutes` read → `readConfig` chain, same `{}` degrade |
| spec/scripts/fidelity-check.js | MODIFY | scripts | D6: config read → `readConfig(repoRoot)`; local `readJson` stays for sidecars |
| spec/bin/spec-paths | MODIFY | scripts | D2: `advisory-append` key + usage-line entry |
| spec/commands/review.md | MODIFY | doctrine | D1: advisory paragraph rewrite (question deleted, invocation line in); D8: `{M} recorded` in slot description + template |
| spec/doctrine/scaffold-ledger.md | MODIFY | doctrine | D4: smell-lens row rewritten in place + two new rows; no blank lines in table |
| spec/doctrine/claims-baseline.json | MODIFY | doctrine | D8: full-corpus `--update-baseline` re-stamp (review.md + scaffold-ledger.md deltas, same commit) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D8: bump + changelog description |
| tests/review/smell-lens.test.js | MODIFY | tests | D3: AC-20260815-01-7, AC-20260815-01-8, AC-20260815-01-9, AC-20260815-01-15 |
| tests/review/ci-gate-parity.test.js | MODIFY | tests | AC-20260815-01-13: NET-NEW regression cases (none exist today) — config-error exit 2 + scalar-config degrade, green pre-change |
| tests/advisory-append/advisory-append.test.js | CREATE | tests | AC-20260815-01-1 … AC-20260815-01-6 |
| tests/host-config/config-read.test.js | CREATE | tests | AC-20260815-01-10, AC-20260815-01-11, AC-20260815-01-12 |
| tests/terminal-observable-acs.test.js | MODIFY | tests | AC-20260815-01-14: `advisory-append` added to the spec-paths key-set `expected` array + retag |

## Contracts

```
# spec/scripts/advisory-append.js
node advisory-append.js --root <dir> --spec <path> --run-id <id> --smells <file> [--date YYYY-MM-DD]
# --smells <file>: JSON array [{file, line, class, claim, counterpart?, suggestion?}] — the
#   wf-review return's `smells` field written verbatim to a mktemp file by the session.
#   class is the closed enum duplication|error-masking; a duplication entry without a
#   counterpart is exit 2 (the workflow's D6 code filter already drops those — reaching the
#   script means the contract broke upstream). suggestion is never persisted.
# Exit codes:
#   0 = appended N rows and/or suppressed M duplicates (N or M may be 0); empty array is a
#       no-op line ("no advisory findings this run"), ledger untouched (absent stays absent)
#   2 = usage error / unreadable or invalid smells JSON / entry missing file|class|claim /
#       duplication entry missing counterpart / unwritable ledger path — stderr names the remedy
# Ledger: <root>/docs/audit/advisory-findings.md. First append creates it with the live
#   artifact's two header lines byte-identical:
#     # Advisory smell findings — accepted at review
#     <!-- appended by /spec:review (smell lens); ingested wholesale by the hotspot audit (roadmap brief 05) -->
# Row grammar (matches every live row; audit.md's ingest reads this file wholesale):
#   - <date> <class> <file>:<line> duplicates <counterpart> — <claim> (spec <spec>, runId <id>)
#   (error-masking without counterpart omits the ` duplicates <counterpart>` clause)
# Dedupe key: (class, file-without-:line, counterpart-file-without-:line-or-empty).
#   Existing rows parse via: ^- \d{4}-\d{2}-\d{2} <class> <file>:<line>( duplicates <cp>:<line>)?
#   A key matching any existing row lacking the literal RESOLVED → suppressed (counted).
#   A key whose matches are all RESOLVED → appended fresh (recurrence signal).
# Stdout: one line per appended row, then exactly one summary:
#   📌 Auto-kept <N> advisory row(s) — <M> duplicate(s) suppressed → docs/audit/advisory-findings.md (veto: delete the row)

# spec/scripts/lib/host-config.js (additive; readConfig/declaredForge byte-untouched)
readConfig(root)        -> object   # absent/unreadable/unparsable/non-object → {} (unchanged)
readConfigStrict(root)  -> any      # throws Error('cannot read/parse <path> (<cause>)') on
                                    # absent/unreadable/unparsable; a SUCCESSFUL parse returns
                                    # the parsed value VERBATIM (object/array/scalar/null — no
                                    # shape coercion, no non-object throw: callers' guards own
                                    # shape handling; preserves today's degrade paths)
module.exports = { readConfig, declaredForge, readConfigStrict }
# Strict-caller swap pattern (D6 — die with e.message + own remedy suffix, never re-wrap):
#   try { config = readConfigStrict(root) } catch (e) { die(e.message + ' — <remedy>') }

# review.md D1 invocation line (shape, inside the rewritten advisory paragraph):
node "$(spec-paths advisory-append)" --root {root} --spec {spec path} --run-id {wf id} --smells <mktemp file>
```

## Behavior

- Script flow: parse args → read + JSON.parse the smells file (invalid → exit 2 remedy) →
  validate entries (closed class enum; file/class/claim required; duplication requires
  counterpart) → read the ledger if present, extract dedupe keys per the row-grammar regex
  (rows that don't parse are ignored for dedupe — never rewritten, never fatal) → partition
  entries into append/suppress → create-with-header if absent **and** appends exist → append
  rows in input order → print per-row lines + the 📌 summary → exit 0.
- The ledger is append-only from this script's perspective: it never edits, reorders, or
  deletes existing rows (RESOLVED annotations stay a human/paydown-session act; `rejected`
  fates stay in audit's own ledger).
- review.md session flow after D1: print the plain-language finding lines → write
  `smells` to a fresh mktemp JSON file → run the invocation line → print its output verbatim.
  `lensFailed` and empty-`smells` paths are unchanged except the empty case may simply skip
  the invocation (the script's empty-input no-op makes either choice equivalent).
- The closure pin walks `spec/scripts/` recursively (pure `fs`, no shell-out), collects
  `.js` files, and asserts per line. Prose mentions (comments, error-message strings) pass
  because they never pair the filename with `readFileSync`/`path.join` on one line —
  executed against the live tree at plan time (A2).

## Acceptance Criteria

- **AC-20260815-01-1**: WHEN advisory-append runs against a root with no
  `docs/audit/advisory-findings.md` and a smells file holding one duplication entry with a
  counterpart THE SYSTEM SHALL create the ledger with the two byte-identical header lines and
  append exactly one row matching the row grammar (literal fixture: `--date 2026-08-15`,
  entry `{file:"spec/scripts/a.js", line:9, class:"duplication", claim:"re-reads X",
  counterpart:"spec/scripts/lib/b.js:12"}` → row `- 2026-08-15 duplication
  spec/scripts/a.js:9 duplicates spec/scripts/lib/b.js:12 — re-reads X (spec specs/x.md,
  runId wf_test)`), exit 0 → tests/advisory-append/advisory-append.test.js
- **AC-20260815-01-2**: WHEN an entry's dedupe key matches an existing row not marked
  `RESOLVED` THE SYSTEM SHALL append nothing for that entry and count it suppressed (literal
  fixture: run AC-1 twice with differing `line` numbers — second run appends 0, summary says
  `1 duplicate(s) suppressed`, ledger byte-identical to after run 1) →
  tests/advisory-append/advisory-append.test.js
- **AC-20260815-01-3**: WHEN an entry's dedupe key matches only rows containing `RESOLVED`
  THE SYSTEM SHALL append a fresh dated row (literal fixture: seed the ledger with a
  `— RESOLVED 2026-08-14:` row for the key, re-run → `1` appended, both rows present) →
  tests/advisory-append/advisory-append.test.js
- **AC-20260815-01-4**: WHEN an error-masking entry carries no counterpart THE SYSTEM SHALL
  append its row without a ` duplicates ` clause; AND WHEN a duplication entry carries no
  counterpart THE SYSTEM SHALL exit 2 naming the workflow's counterpart filter as the remedy
  → tests/advisory-append/advisory-append.test.js
- **AC-20260815-01-5**: WHEN at least one row is appended or suppressed THE SYSTEM SHALL
  print exactly one `📌 Auto-kept <N> advisory row(s) — <M> duplicate(s) suppressed →
  docs/audit/advisory-findings.md (veto: delete the row)` summary line; and WHEN the smells
  array is empty THE SYSTEM SHALL exit 0 printing a no-findings line and SHALL NOT create
  the ledger file → tests/advisory-append/advisory-append.test.js
- **AC-20260815-01-6**: WHEN invoked with an unknown flag, an unreadable or non-array smells
  file, or an entry missing `file`, `class`, or `claim` (or an unknown class) THE SYSTEM
  SHALL exit 2 with a stderr line naming the remedy; and WHEN `spec-paths advisory-append`
  runs THE SYSTEM SHALL print the script's path (the key-registration carrier) →
  tests/advisory-append/advisory-append.test.js
- **AC-20260815-01-7**: WHEN review.md's advisory smell paragraph is read THE SYSTEM SHALL
  name the `spec-paths advisory-append` invocation with `--smells`, SHALL contain no
  `AskUserQuestion` between the paragraph's opening bold phrase and the `## Phase 3` heading,
  and SHALL NOT contain the literals `drop — no record kept` or `Dismissed findings get no
  record` anywhere → tests/review/smell-lens.test.js
- **AC-20260815-01-8**: WHEN review.md Phase 3's `artifacts` slot description and report
  template are read THE SYSTEM SHALL carry `smells: {N} advisory — {M} recorded →
  docs/audit/advisory-findings.md` and SHALL NOT carry `{M} accepted` (retarget of
  AC-20260813-07-7's literal, updated in place) → tests/review/smell-lens.test.js
- **AC-20260815-01-9**: WHEN review.md is read THE SYSTEM SHALL CONTINUE TO state that
  `smells` never enters verdict.js or the ledger row, and SHALL CONTINUE TO document the
  workflow return shape ending `tokens, smells, lensFailed` in both locations (existing
  pins, untouched — regression declared here) → tests/review/smell-lens.test.js
- **AC-20260815-01-10**: WHEN `readConfigStrict(root)` is called with the config absent,
  with the config path occupied by a directory (an unreadable read), and with garbage JSON
  THE SYSTEM SHALL throw an Error whose message contains the config path and `cannot
  read/parse`; and WHEN the parse succeeds it SHALL return the parsed value verbatim with no
  shape coercion (literals: `{"gateCommand":"true"}` round-trips; file content `3` returns
  the number `3`; file content `null` returns `null` — the verbatim return is what keeps
  every D6 caller's odd-but-valid-JSON behavior byte-identical) →
  tests/host-config/config-read.test.js
- **AC-20260815-01-11**: WHEN `readConfig(root)` is called with the config absent and with
  garbage JSON THE SYSTEM SHALL CONTINUE TO return `{}` without throwing (regression pin,
  green pre-change) → tests/host-config/config-read.test.js
- **AC-20260815-01-12**: WHEN any `.js` file under `spec/scripts/` other than
  `lib/host-config.js` contains a line that **D10's ordered clause predicate** classifies an
  offender — the literal `spec.config.json` paired with `readFileSync` (unconditional), or
  with `path.join` outside the display-join interpolation exemption — THE SYSTEM SHALL fail
  the suite naming that file:line and the lib remedy (authored red-first: red on exactly the
  four D6 offenders at build time — A2, re-measured under D10 — and green only once D6's
  swaps land; the mentions at `scope-reconcile.js:13`, `spec-design-driver.js`'s catalog
  warning, and `suite-baseline.js:150`'s error-message display join stay green by
  construction) → tests/host-config/config-read.test.js
- **AC-20260815-01-13**: WHEN `ci-gate-parity.js` runs with `.claude/spec.config.json`
  missing, and separately with it unparsable, THE SYSTEM SHALL CONTINUE TO exit 2 with a
  stderr line containing `cannot read/parse` and the remedy; and WHEN the config parses to
  the valid-JSON scalar `3` THE SYSTEM SHALL CONTINUE TO exit 0 printing `inapplicable — no
  gateCommand` (**net-new regression cases, green pre-change** — both adversarial refuters
  confirmed no test anywhere exercises the config-error path today, so these are authored,
  not retagged; the scalar case pins the degrade a non-object throw would have broken) →
  tests/review/ci-gate-parity.test.js
- **AC-20260815-01-14**: WHEN `spec/bin/spec-paths`'s complete key set is scraped from its
  live case statement THE SYSTEM SHALL CONTINUE TO deep-equal the pinned `expected` array,
  with `advisory-append` present in both (regression pin: D2's new key breaks the closed
  `deepStrictEqual` by construction — the fourth spec in two days to hit this exact
  collision, caught at plan time by the hand-run paths sweep) →
  tests/terminal-observable-acs.test.js
- **AC-20260815-01-15**: WHEN `spec/doctrine/scaffold-ledger.md` is read THE SYSTEM SHALL
  name `advisory-append` in the Review-smell-lens row's mechanism text, SHALL anchor that
  row's RETIRE condition to emission volume and audit-side fate (the literal `zero accepted
  findings` clause is gone), and SHALL carry rows for `advisory-append.js` and the
  config-read closure pin, each with a promote-or-retire condition →
  tests/review/smell-lens.test.js

## Assumptions (escalation triggers)

- **A1** (executed 2026-08-15): the dedupe row-grammar regex round-trips all four live
  ledger rows — keys `(duplication, hotspot.js, scope-reconcile.js)` RESOLVED,
  `(duplication, ci-query.js, observe-ci.js)` RESOLVED, `(duplication, ac-matrix.js,
  verdict.js)` open, `(duplication, ci-gate-parity.js, lib/host-config.js)` open — with
  `RESOLVED` detected on exactly the first two. **if false at build** (a live row stops
  parsing): adjust the regex to what the rows actually are; never reformat the ledger to fit
  the parser.
- **A2** (executed 2026-08-15): the closure predicate (line pairs `spec.config.json` with
  `readFileSync|path.join`) flags exactly four files — `ci-gate-parity.js:40`,
  `design-atlas.js:367`, `fidelity-check.js:114`, `spec-design-driver.js:77` — and zero
  files under repo-root `scripts/`; the prose mentions (`scope-reconcile.js:13` comment,
  `spec-design-driver.js` catalog-warning string) are not flagged. **if false at build** (a
  fifth offender appeared, or a prose mention trips it): swap the new offender too, or
  refine the predicate so prose mentions stay green — never exempt a real read.
  **FALSIFIED AT BUILD, refine branch taken (2026-08-16).** The plan-time census was measured
  with a grep that silently dropped hits: `spec/scripts/fidelity-check.js` carries a stray NUL
  byte at line 136, so grep classified the file binary. Re-measured with a pure `fs` walk, the
  literal one-line predicate flags a fifth non-exempt line — `spec/scripts/suite-baseline.js:150`,
  a `path.join` rendered inside an error-message template literal, whose real config read goes
  through the lib at `suite-baseline.js:37`/`:147`. That is a prose mention, not an offender, so
  A2's refine branch applies and D10 states the resulting predicate exactly. Amended measurement:
  D10's predicate flags exactly `ci-gate-parity.js:40`, `design-atlas.js:367`,
  `fidelity-check.js:114`, `spec-design-driver.js:77` and nothing else; `scope-reconcile.js:13`,
  `spec-design-driver.js:317`, `fidelity-check.js:17/:47/:120/:569` and `suite-baseline.js:150`
  are green by classification.
- **A3** (read at HEAD): the wf-review return's `smells` entries carry
  `{file, line, class, claim, counterpart?, suggestion?}` (review.md's documented shape +
  the workflow's LENS schema), sufficient for the row grammar with session-supplied
  date/spec/runId. **if false**: blocked — the append contract is missing a field; consult
  the user, never invent row content.
- **A4** (executed 2026-08-15, corpus + tests stem-grep): the retired wording (`keep —`,
  `drop — no record kept`, `advisory log for the future audit`, `Dismissed findings`) is
  asserted only by `tests/review/smell-lens.test.js` and stated only in
  `spec/commands/review.md`; shared.md's mention of the "advisory-findings convention" is
  narrative (a header-comment precedent citation) and untouched. **if false at build**: the
  extra locus enters the File Plan as fix or recorded waive per the colliding-pin Gotcha.
- **A5** (read at HEAD): `fidelity-check.js`'s `readJson` is parse-or-null and the config
  call site is `readJson(...) || {}` with a `config.design && Array.isArray(...)` guard —
  byte-equivalent observable behavior to `readConfig`'s `{}` degrade for this call site;
  `readJson` has two other (sidecar) call sites and stays. **if false**: STOP the swap for
  that file and consult — behavior preservation is the whole D6 contract.
- **A6** (read at HEAD): `tests/consistency/drift-reconcile.test.js` counts blank lines
  between scaffold-ledger's table separator and last data row — D4's rewritten row and two
  new rows must introduce no blank line (build formatting constraint, recorded waive not a
  File Plan row; the pin is shape-only and stays green for correctly-formatted rows).
- **A7**: version target 6.77.0 assumes hardened-unbuilt specs 20260814/03 (6.75.0) and /05
  (6.76.0) land first (now also the declared `depends_on` ordering); concurrent sessions
  race semver. **at build**: bump to the next free version, keep the changelog paragraph,
  log a deviation only if the number moved.
- **A8** (executed 2026-08-15, adversarial check): `ci-gate-parity.js` against a root with
  no config exits 2 printing `cannot read/parse … — fix the config or check --root`; against
  a config containing the scalar `3` it exits 0 printing `inapplicable — no gateCommand`
  (the scalar parses, `config.gateCommand` is `undefined` on a number, the script degrades).
  Both observed by direct execution — they are the byte-truth AC-13 pins and the reason D5
  returns verbatim instead of throwing on non-objects. **if false at build**: re-observe and
  pin what the script actually does; never adjust the script to fit the spec's prediction.

## Rationale

**One spec, not three follow-ups.** The review of specs/20260814/02 surfaced three instances
of one thesis — the pipeline detects a class, records it, then depends on a model to act at
authoring time. Instance three (the untrustworthy red gate forcing hand-derived
base-vs-HEAD failing-name diffs) was found already closed at plan level by hardened specs
20260814/03 (`suite-baseline.js` — its D1 explicitly retires the hand-run recipe) and /05
(`collision-closure.js`), so this spec carries the remaining two. They share one governing
move: the recorded class gets a deterministic carrier, and the prose that carried it shrinks.

**Why the question dies instead of being reworded (D1).** The Haiku question-style judge
blocked three successive rewordings of the keep/drop ask on 2026-08-15. The Fable consult
ruled the collision structural: review.md itself declares the fork consequence-free ("this
group can never change the verdict word or block Phase 3"), and shared.md § Question Style
already resolves consequence-free forks — take the option cheapest to reverse, announce it,
don't ask. Keep is maximally cheaper: a kept row is later-rejectable at audit
(`rejected(<reason>)` is a first-class fate with recurrence suppression); a dropped row
destroys a signal only that run's lens ever saw. Rejected alternatives, recorded: a fourth
rewording or `SPEC_QUESTION_JUDGE=off` (teaches the session to prompt-game its own gate — a
wording that finally slips past Haiku is gate erosion, not a fix; also the user's standing
"no hot patches" ruling); a shared.md/gate exemption (additive prose patching an incident,
weakening the gate for exactly the question class it correctly caught). Mechanizing the
append (D2) was the consult's named natural follow-up and rides here because it removes the
last two model-dependent steps (hand-append fidelity, hand-judged dedupe) and closes the one
new hole auto-keep opens (unbounded re-append until audited). The deletion also dissolves
review.md's `<!-- unenforced: model-judgment step -->` dismissed-question carrier and a
latent stale pointer ("header comment shown in the Contracts section" — review.md has no
Contracts section; the header's only executable home is now the script).

**Why a suite pin and not another extraction sermon (D5–D7).** The config-read class has
been paid down twice (2026-08-12 into `glob-match.js`, 2026-08-14 into `host-config.js` —
whose header narrates the recurrence as its reason for existing) and recurred within one day
of the second paydown. Plan-time census found the class **larger than the ledger knows**:
four live private reads, two (`fidelity-check.js`, `spec-design-driver.js`) never ledgered —
hand-enumeration under-counts even when the enumerator is looking for exactly this. The
recurring divergence was always error policy, never the read (the ledger's own ac-matrix/
verdict row states the same shape), so the lib gains the strict variant its advisory row
prescribed, all four call sites swap behavior-preserved, and the closed pin makes the fifth
recurrence a red suite instead of a fifth ledger row. The pin is deliberately lexical and
narrow (one-line pairing, `spec/scripts/**/*.js` only) — measured green on prose mentions,
red on all four real reads; its reopen condition (D9) covers evasion.

**Why no meta-rule (D9).** A doctrine sentence "recurring ledger classes must be mechanized"
would itself be the disease: prose recording a class and hoping a model acts on it. The
repo already owns that policy deterministically where it can (`intake-discipline.test.js`
forces `mechanism(<path>)` on repeated intake classes) and judgmentally where it must
(audit's ≥2-per-class enforcer promotion). This spec is those policies being applied to the
two classes currently bleeding.

**Regression posture.** Declared behavior-preserving refactor on four scripts: pins ride on
`ci-gate-parity` (AC-13 — net-new, green pre-change: its locked exit-2 contract and its
scalar-config degrade had **zero** existing coverage, a gap both refuters confirmed),
`readConfig` (AC-11), the review
return-shape/never-ledgered doctrine (AC-9), and the spec-paths key set (AC-14).
`design-atlas`/`fidelity-check`/`spec-design-driver` carry no dedicated new pins: their
config paths are exercised by their existing exec suites (driver's fixture-config tests,
fidelity's catalog tests), and the swapped semantics are themselves pinned at the lib level
by AC-10/AC-11 — a dedicated per-script pin would duplicate the lib pin through a pass-through.

**File Plan is 16 rows against the ~15 guideline**: four of them are one-line swaps under a
single Decision (D6); splitting the swaps into a sibling spec would leave D7's closure pin
red in this spec's own gate (the pin and the swaps are one landing unit by construction).

**Adversarial-check adjudication (2026-08-15, two blind refuters, both executing against the
live tree).** ACCEPTED and folded: (i) the draft's `readConfigStrict` non-object throw would
have silently rewritten `ci-gate-parity`'s locked exit contract — a config parsing to the
scalar `3` exits 0 `inapplicable` today (executed) and would have flipped to exit 2; D5 now
returns the parsed value verbatim and AC-13 pins the scalar degrade. (ii) AC-13's "retag the
existing case" premise was false — no test anywhere exercises either script's config-error
path (both refuters, independently); AC-13 is now authored net-new, green pre-change. (iii)
the naive try/catch-rewrap swap would nest the lib's pre-formatted message; D6 now specifies
`die(e.message + ' — <remedy suffix>')`, byte-identical for `ci-gate-parity`, a recorded
clause-order delta for `spec-design-driver` (unpinned text). (iv) D8's claims re-stamp named
only review.md while scaffold-ledger.md's line count also moves and both carry live baseline
entries — the re-stamp is now the full-corpus `--update-baseline`. (v) `depends_on` now names
specs/20260814/05 (transitively /03): the three specs share three closed surfaces (the
spec-paths case statement + usage line, the key-set `deepStrictEqual`, the scaffold-ledger
table) — a merge-order dependency, not a semantic one; each spec is independently green at
HEAD, but parallel worktree builds off a shared base would collide on those literal lines.
Everything else survived both refuters' independent re-execution: the closure predicate's
exact four offenders, the dedupe regex against all four live ledger rows, the corpus stem
sweep (no third locus of the retired wording), the LENS schema shape, the sorted key-set
edit, and the scaffold-ledger RETIRE/PROMOTE quotes.

**Derived picks (announced, not asked)** — per shared.md § Question Style every fork here
had a derivable answer: 📌 mechanized append over prose-only auto-keep (repo preference
order: deterministic enforcement > in-place edit > prose); 📌 dedupe suppresses only
still-open rows, recurrence after RESOLVED re-appends (the ledger's own four-row history is
the signal being preserved); 📌 strict variant as a second export, not an options flag (two
small named exports match the lib's existing style; callers keep their own remedies);
📌 closure scope `spec/scripts/**/*.js` (the ledgered population; repo-root `scripts/`
measured clean); 📌 one spec over two siblings (user's stated hypothesis; fits one build);
📌 ledger header text kept byte-identical to the live artifact ("accepted at review" —
byte-stability for the dedupe parser and audit ingest outweighs retitling; rows are still
accepted into the ledger, by derivation).

## Canonical Delta

None — plugin doctrine edits are the delta itself (repo precedent).
