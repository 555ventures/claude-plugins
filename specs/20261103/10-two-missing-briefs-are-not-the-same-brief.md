---
date: 2026-11-03
status: implementing
tier: critical           # spec/scripts/spec-status.js — the --next/--lanes derivation changes shape internally (§ Risk Tiers: the sole "what's next" derivation; its --json surfaces are frozen); spec/bin/spec-paths gains a key
area: pipeline
breaking: false
depends_on: [specs/20261103/06-the-fan-out-drains-the-queue.md]
brief: n/a
open_markers: 0
diff_base: 3b00a591b1213d3db7a765ebd80274b705011352
---

# Two missing briefs are not the same brief

## Goal

A spec's `brief:` stamp becomes a two-variant value inside the scripts — `{ kind: 'briefed', num }` or
`{ kind: 'adhoc' }` — instead of a string that collapses to `null`, and one helper, `relateBriefs`,
is the only place two briefs are compared: it answers `same`, `different` or `unknown`, and every
`unknown` carries the reason the caller prints. A new deterministic lint, `variant-lint.js`, runs in
every suite run and fails on any `.brief` read in a boolean, coalescing or equality position under
`spec/scripts/**` outside the helper, so the defect class cannot return through review. The test
fixtures default to ad-hoc specs with briefed ones opt-in, and one standing smoke runs `--next --json`
and `--lanes --json` over a copy of this repo's own `specs/` tree in every suite run. Done means no
script anywhere asks "is the brief truthy" or "are these two briefs `===`", the external `--json`
shapes are byte-identical, and the fan-out report never claims an ad-hoc lane "waited on" a lane it
never waited on.

## Users

- The maintainer running the fan-out over ad-hoc specs: When a lane stops and another lane was held
  back by File Plan overlap, I want the report to say what it waited on and nothing it did not, so I
  can restart the right spec. First run / empty: a report with no waiting lane prints no "waited on"
  line at all.
- The script author adding a brief-keyed site: When I write `if (e.brief)` or `a.brief === b.brief`
  anywhere under `spec/scripts/`, I want the suite to go red with the file, line and position class,
  so I route the comparison through the helper before review sees it. First run / empty: a clean tree
  prints one sentinel line with zero findings and exits 0.
- The test author writing a new pipeline test: When I stand a fixture spec up with no opinion about
  briefs, I want it to be an ad-hoc spec by default, so the ad-hoc path is the one every new test
  exercises and a briefed spec is a deliberate opt-in. First run / empty: a fixture with no `brief`
  argument writes `brief: n/a`.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | New `spec/scripts/lib/brief.js` (pure, no I/O): `parseBrief(raw)` → `{ kind: 'briefed', num }` when `raw` is a non-empty string not matching `/^(n\/a\|none\|-\|—)$/i` after trim (`num` = `normBrief(raw)`), else `{ kind: 'adhoc' }` (undefined, null, `''`, `n/a`, `none`, `-`, `—`); `relateBriefs(a, b)` → `{ relation: 'same' \| 'different' \| 'unknown', reason: string \| null }` — both briefed and `a.num === b.num` → `same`; both briefed otherwise → `different`; else `unknown` with reason exactly `both ad-hoc`, `left ad-hoc` or `right ad-hoc`, and `reason` is `null` for `same`/`different`; `briefNum(v)` → `num` or `null`; `briefOrd(v)` → the sortable number for a briefed value, `Infinity` for ad-hoc; `normBrief(raw)` moves here from `lib/queue.js`, which re-exports it unchanged. The module throws `TypeError('relateBriefs: expected a parsed brief, got <typeof>')` when either argument lacks a `kind` (AC-20261103-10-1, AC-20261103-10-2) | "Parse, don't validate": the discriminant is decided once at the parse boundary; a comparison that can be `unknown` says so with its reason instead of letting two `null`s compare equal. |
| D2 | `spec/scripts/spec-status.js`: `allSpecs[].brief` = `parseBrief(fm.brief)`; the local `normBrief`, `BRIEFLESS` and `briefOrd` are replaced by the `lib/brief.js` exports. Every brief-keyed site routes through the helper: brief membership (`relateBriefs(s.brief, parseBrief(b.num)).relation === 'same'`), orphan-stamp and draft-dependency blockers and queue blockers by brief (`s.brief.kind === 'briefed'` then `briefNum`), the note suffix ` (brief NN)` only for briefed, the sort tier `briefOrd(a.brief) - briefOrd(b.brief)`, `queuePos` by `briefNum`, the top-pick and runner-up guard in the annotation loop, and (post spec 06) `pairSerialReason`'s opening branch: `relateBriefs` `same` → `shared brief NN`, `different` → the brief dependency path or `null`, `unknown` → spec 06's File Plan rule, and when that rule makes no claim the entry carries `parallelUnknown: '<relateBriefs reason>; no File Plan rows'` (internal, stripped from `--json`). The `--all` branch line becomes `🤷 no brief — parallelism unknown (<parallelUnknown>)`, consecutive identical reasons still collapsing onto one line. Every external surface serializes `brief: briefNum(v)`: `--next --json` entries, the queue prompt entry's 7-key shape, `--lanes --json` `lanes[]` and `serialized[]`, `--json`'s `specs[]` and `briefs[].specs` — key sets and values byte-identical to today (AC-20261103-10-3, AC-20261103-10-4, AC-20261103-10-5, AC-20261103-10-6, AC-20261103-10-7) `[asked: user pre-decided via independent review 2026-11-03 — the discriminant is internal; an external brief field that is null today for ad-hoc stays null]` | One parse, one comparison, one serializer; the frozen `--json` consumers (the fan-out driver, the review close-out, external dashboards) see no change. |
| D3 | `spec/scripts/fanout-driver.js`: the state file keeps `lane.brief` as the `--lanes --json` string-or-null (no on-disk shape change); the two read sites parse at read: `printPlan`'s tail becomes `` `brief ${briefNum(parseBrief(l.brief)) \|\| '—'}` `` written as `briefLabel(l.brief)` (a one-line local helper over `parseBrief`/`briefNum`), and `printReport`'s dependency lookup becomes `relateBriefs(parseBrief(d.brief), parseBrief(l.brief)).relation === 'same' \|\| String(l.waitingOn).includes(d.spec)` — an ad-hoc waiting lane whose `waitingOn` names no stopped lane's spec prints `not started — waited on <waitingOn>` and never `, which stopped` (AC-20261103-10-8, AC-20261103-10-9) | Today `d.brief === l.brief` is `null === null` for any two ad-hoc lanes, so the first stopped lane is blamed; `unknown` is not `same`. |
| D4 | `spec/scripts/spec-queue.js` and `spec/scripts/lib/queue.js`: the four brief-keyed sites route through the helper — `resolveRef`'s brief match and `add`'s duplicate check compare `relateBriefs(parseBrief(i.brief), parseBrief(ref)).relation === 'same'` inside their existing `i.kind === 'brief'` guard; `isItemReady`'s `if (item.after.brief)` becomes `parseBrief(item.after.brief).kind === 'briefed'`; `lib/queue.js` imports `normBrief` from `./brief` and re-exports it. Queue item and `after` shapes on disk are unchanged. Queue seeding of ad-hoc specs and `verdict.js`'s `--briefs NN[a]` parsing are out of scope — a parallel plan owns them; `verdict.js` stays inside the lint's scope and has no finding today (AC-20261103-10-10, AC-20261103-10-11) `[asked: user pre-decided via independent review 2026-11-03 — scope excludes queue seeding and verdict --briefs]` | The queue's `kind` is already a discriminant; the comparison still goes through the one helper so the lint stays uniform and a future `after.brief: 'n/a'` cannot read as a gate. |
| D5 | New `spec/scripts/variant-lint.js [--root <dir>] [--field <name>] [--json]`: a field table `FIELDS = [{ field: 'brief', helper: 'spec/scripts/lib/brief.js', scope: 'spec/scripts/**', foreign: { 'spec/scripts/genesis-driver.js': '`status.brief` is the genesis status record (ratified-brief object), not a spec stamp', 'spec/scripts/prototype-driver.js': '`status.brief`, `input.brief` and `contract.brief` are the prototype record (a roadmap brief path), not a spec stamp' } }]`. For every `.js`/`.sh` file under `scope` except the helper and the `foreign` files, every non-comment line (`//` tails and whole `#`/`//` lines stripped) is matched against eight position regexes over `\.<field>\b(?![\w$.\[(])` — `boolean-not` (`!x.brief`), `boolean-and-or` (`.brief &&`, `.brief \|\|`), `boolean-ternary` (`.brief ?` not `??`/`?.`), `boolean-if` (`if (x.brief)`, `while (x.brief)`), `coalescing` (`.brief ??`, `.brief?.`), `coalescing-rhs` (`&& x.brief`, `\|\| x.brief`, `?? x.brief`), `equality` (`.brief ===`/`!==`/`==`/`!=`), `equality-rhs` (`=== x.brief` …), equality classes tested first. `.briefs`, `.brief.kind`, `.brief[`, `brief: e.brief` and `fn(e.brief)` never match. Output: one line per finding `<path>:<line> <class> | <code>`, one `skip <path> — <reason>` line per foreign file, then the sentinel `VARIANT_LINT fields=<n> files=<n> findings=<n>`; `--json` prints `{ fields, findings: [{ path, line, field, class, code }], skipped }`. `--field` with no value prints the table (one line per field: `<field> → <helper> (scope <glob>; foreign: <paths>)`) and exits 0; `--field <name>` lints that field only; an unknown name exits 2 naming the known fields. Exit 0 no findings, 1 findings, 2 usage or unreadable root. Adding a later axis (`queued`, `worktree`) is one `FIELDS` entry (AC-20261103-10-12, AC-20261103-10-13, AC-20261103-10-14) `[asked: user pre-decided via independent review 2026-11-03 — the allowlist is the helper file only; no per-line annotation comments]` | Yuan et al. (OSDI '14): most catastrophic failures were in error-handling code a pattern-derived static check could have caught; reviewer vigilance did not. The grammar is the exact shape of the 20 sites the executed sweep found (A3). |
| D6 | `spec/bin/spec-paths` gains the `variant-lint)` arm and usage entry beside `decision-lint`; `spec/entrypoints.json` gains the row `spec/scripts/variant-lint.js` with entry point `tests/consistency/variant-lint-gate.test.js`; `tests/spec-paths.test.js`'s key loop gains `variant-lint` (AC-20261103-10-15, AC-20261103-10-16) | Pipeline rules § Planning new-surface checklist: a script ships with a key and a manifest row. |
| D7 | Gate wiring: `tests/consistency/variant-lint-gate.test.js` is an untagged standing guard (the `plugin-bump-gate` precedent) that runs `variant-lint.js --root <ROOT>` against this checkout and asserts exit 0 with `findings=0`, and runs it against a `tmpdir()` root holding `spec/scripts/x.js` with `if (e.brief) {}` asserting exit 1 — a silently no-op'd lint cannot pass as green. The host gate (`gateCommand` over `tests/**`) runs it in every suite run `[no-ac: standing guard — untagged by design so the close sweep never retires the gate wiring; the lint's grammar is AC-tested on fixtures in D5]` `[asked: user pre-decided via independent review 2026-11-03 — the lint runs in every suite run, not only at release]` | An AC-tagged test expires at close (escape `invariant-tested-not-enforced` class); the guard is the enforcement, the AC tests are the specification. |
| D8 | `tests/fanout/fixture.js`: `fanoutHost(opts)` gains `briefed` (default `false`). Default: `03-x`, `06-y`, `04-z` (and every opt spec) are written `brief: n/a` with File Plan tables — `03-x` rows `src/x.js`, `src/shared.js`; `06-y` rows `src/y.js`, `src/shared.js`; `04-z` rows `src/z.js`; opt specs keep their spec-06 rows — so the lane topology is unchanged (L1 `03-x`, L2 `06-y` waiting on `File Plan overlap: src/shared.js`, L3 `04-z`); roadmap briefs 31–35 are still written (harmless). `briefed: true` writes today's `brief: 32/32/33` stamps (opt specs: brief 34/35/31 as today) and no File Plan rows. Opt `dependent` (a brief-level dependency) requires `briefed: true` and throws `fixture: dependent needs briefed: true (the ad-hoc analogue is opt blocked)` otherwise; opt `fixes` under the default writes queue items `{ kind: 'spec', spec: 'specs/20261102/03-x.md' }`, `{ kind: 'spec', spec: 'specs/20261102/04-z.md' }` in place of the two brief items. Every existing `fanoutHost(` call whose test asserts a brief literal (`brief 3[1-5]`, `shared brief`), passes opt `dependent`, or runs `--override-serial`, gains `briefed: true`; every other existing call keeps the default; a call that goes red on the flip for another reason is also given `briefed: true` and listed in the build's deviations, never rewritten. `tests/spec-status.test.js`: `host()` and `lanesHost()` append `brief: n/a` to any spec frontmatter lacking a `brief:` line before writing it (AC-20261103-10-17, AC-20261103-10-18) | The ad-hoc path is the one 16 of 40 escapes took; it must be the one every new test walks by default. |
| D9 | New `tests/host-run/real-specs-smoke.test.js`, an untagged standing guard: it copies this checkout's `specs/`, `docs/roadmap/`, `.claude/spec.config.json` and the config's `pipelineRules` file into a `gitRepo(tmpdir())` (never the ledger, never the queue file; the real tree is read-only), appends two ad-hoc hardened sentinels `specs/20991231/01-smoke-a.md` (File Plan row `tests/host-run/smoke-a.txt`) and `specs/20991231/02-smoke-b.md` (row `tests/host-run/smoke-b.txt`), then runs `spec-status --next --json` and `--lanes --json` from that root and asserts: exit 0 for both; every spec whose on-disk `status` is `hardened` or `implementing` appears in exactly one of `lanes[]`, `serialized[]` (non-empty `reason`) or the set of `--next` entries with non-empty `blockers`; every `--next` entry's `brief` is `null` or a `/^\d{2}[a-z]?$/` string; both sentinels are in `lanes[]` (the parallel-ok ad-hoc pair); `lanes[0]`'s keys are exactly `action, branch, brief, note, path, status, worktree` and the top-level keys exactly `fixes, lanes, serialized` `[no-ac: standing guard — untagged by design so it runs in every suite run after this spec closes]` `[asked: user pre-decided via independent review 2026-11-03 — the smoke runs in every suite run over this repo's own specs/ tree, read-only]` | `--lanes` refuses a linked worktree (A2), and the real tree's membership changes with every merge — a copy with two sentinels makes the pair claim deterministic while the real specs still drive every bucket. |
| D10 | `spec/.claude-plugin/plugin.json` is bumped via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` naming the discriminated brief, `relateBriefs`, `variant-lint` and the ad-hoc fixture default. `[no-ac: plugin-bump.js --check in the gate is the oracle]` | Pipeline rules § Planning version-bump discipline. |
| D11 | This spec builds on spec 06's post-image: the File Plan rows it shares with spec 06 (`spec-status.js`, `fanout-driver.js`, `tests/spec-status.test.js`, `tests/fanout/fanout-driver.test.js`, `tests/fanout/fixture.js`) are edited after 06 merges — rebase onto 06 after it merges; never build on the pre-image (A1). Spec 08 (also `depends_on` 06) shares `spec-queue.js`, `lib/queue.js`, `spec-status.js`, `fanout-driver.js` and the two fanout test files; whichever of 08 and this spec lands second rebases and re-runs `variant-lint` — any `.brief` site 08 adds is this lint's finding and is routed through D1's helper in the rebase `[no-ac: ordering statement — the dependency and the rebase rule carry no testable surface of their own]` | Two specs editing one derivation must land in series; the lint makes the second landing's obligations mechanical. |
| D12 | Scope widened at build: `specs/20261102/01-the-host-names-its-runner-grammar.md` enters the File Plan; the pin is updated in place, never weakened. [auto: out-of-plan-triage — not a test file] [no-ac: the gate line is the oracle] | The file's risk decides, never the spec's tier. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/brief.js | CREATE | scripts | `parseBrief`, `relateBriefs`, `briefNum`, `briefOrd`, `normBrief` (D1); header per rules § Worker Rules; no dependency change |
| spec/scripts/spec-status.js | MODIFY | scripts | parser → `parseBrief`; every brief-keyed site through the helper; `pairSerialReason` opening branch; `parallelUnknown` and the 🤷 reason; `briefNum` at every `--json` serializer (D2) |
| spec/scripts/fanout-driver.js | MODIFY | scripts | `briefLabel` in `printPlan`, `relateBriefs` in `printReport`'s dependency lookup (D3) |
| spec/scripts/spec-queue.js | MODIFY | scripts | `resolveRef` and `add` duplicate check through `relateBriefs` (D4) |
| spec/scripts/lib/queue.js | MODIFY | scripts | `normBrief` imported from `./brief` and re-exported; `isItemReady`'s `after.brief` through `parseBrief` (D4) |
| spec/scripts/variant-lint.js | CREATE | scripts | the field table, the eight position classes, `--field`, `--json`, the sentinel, exit codes 0/1/2 (D5); header per rules § Worker Rules; no dependency change |
| spec/bin/spec-paths | MODIFY | scripts | `variant-lint)` arm and usage entry (D6) |
| spec/entrypoints.json | MODIFY | other | row for `spec/scripts/variant-lint.js` → `tests/consistency/variant-lint-gate.test.js` (D6) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | `node scripts/plugin-bump.js --bump --plugin spec --changelog "…"` (D10) |
| tests/brief/relate-briefs.test.js | CREATE | tests | AC-20261103-10-1, AC-20261103-10-2 |
| tests/spec-status.test.js | MODIFY | tests | AC-20261103-10-3, AC-20261103-10-5, AC-20261103-10-7, AC-20261103-10-18; AC-20261103-10-4 and AC-20261103-10-6 (reuse, retagged in the titles); `host()`/`lanesHost()` default `brief: n/a` (D8) |
| tests/fanout/fanout-driver.test.js | MODIFY | tests | AC-20261103-10-8, AC-20261103-10-9, AC-20261103-10-17; `briefed: true` on the calls D8 names |
| tests/fanout/fixture.js | MODIFY | tests | `briefed` opt, File Plan bodies for the ad-hoc default, `dependent` refusal, spec-kind queue items under the default (D8) |
| tests/queue/spec-queue.test.js | MODIFY | tests | AC-20261103-10-10 (reuse, retagged in the title) |
| tests/queue/queue-overlay.test.js | MODIFY | tests | AC-20261103-10-11 (reuse, retagged in the title) |
| tests/variant-lint/grammar.test.js | CREATE | tests | AC-20261103-10-12, AC-20261103-10-13, AC-20261103-10-14 |
| tests/spec-paths.test.js | MODIFY | tests | AC-20261103-10-15 |
| tests/consistency/entrypoints.test.js | MODIFY | tests | AC-20261103-10-16 (reuse, retagged in the title) |
| tests/consistency/variant-lint-gate.test.js | CREATE | tests | untagged standing guard — the gate wiring and one synthetic red (D7) |
| tests/host-run/real-specs-smoke.test.js | CREATE | tests | untagged standing guard — the real-tree smoke with two sentinels (D9) |
| specs/20261102/01-the-host-names-its-runner-grammar.md | MODIFY | other | gate line — updated in place, never weakened [auto: out-of-plan-triage] |

## Contracts

`spec/scripts/lib/brief.js` (pure):

```js
parseBrief(raw)        // string|undefined|null -> { kind: 'briefed', num: '04b' } | { kind: 'adhoc' }
relateBriefs(a, b)     // parsed, parsed -> { relation: 'same'|'different'|'unknown', reason: null|'both ad-hoc'|'left ad-hoc'|'right ad-hoc' }
                       //   reason !== null  <=>  relation === 'unknown'; throws TypeError on an unparsed argument
briefNum(v)            // parsed -> '04b' | null
briefOrd(v)            // parsed -> 4.02 | Infinity          (04 < 04a < 04b < 05; ad-hoc sorts last)
normBrief(raw)         // '4b-auth' -> '04b'                 (moved from lib/queue.js, re-exported there)
```

`spec-status.js` (module-private): `allSpecs[].brief`, `entries[].brief` are parsed values; `entries[].parallelUnknown`
is internal and stripped like `parallelReason`. External shapes unchanged: `--next --json` entry `brief: '32' | null`;
queue prompt entry's 7 keys; `--lanes --json` `lanes[]` 7 keys, `serialized[]` `{ path, brief, reason }`; `--json`
`specs[].brief`, `briefs[].specs`.

`--all` branch line: `🤷 no brief — parallelism unknown (<reason>; no File Plan rows)` with `<reason>` from `relateBriefs`.

`fanout-driver.js` REPORT bullet for a waiting lane: `<spec>: not started — waited on <dep spec>, which stopped` only when
`relateBriefs` says `same` or `waitingOn` names the stopped lane's spec; otherwise `<spec>: not started — waited on <waitingOn>`.

`variant-lint.js`:

```
variant-lint.js [--root <dir>] [--field [<name>]] [--json]
FIELDS[0] = { field: 'brief', helper: 'spec/scripts/lib/brief.js', scope: 'spec/scripts/**',
              foreign: { 'spec/scripts/genesis-driver.js': '…', 'spec/scripts/prototype-driver.js': '…' } }
classes:   boolean-not · boolean-and-or · boolean-ternary · boolean-if · coalescing · coalescing-rhs · equality · equality-rhs
finding:   <path>:<line> <class> | <code>
skip:      skip <path> — <reason>
sentinel:  VARIANT_LINT fields=<n> files=<n> findings=<n>
--json:    { fields: [{ field, helper, scope, foreign }], findings: [{ path, line, field, class, code }], skipped: [{ path, reason }] }
--field:   brief → spec/scripts/lib/brief.js (scope spec/scripts/**; foreign: spec/scripts/genesis-driver.js, spec/scripts/prototype-driver.js)
exit:      0 no findings · 1 findings · 2 usage, unknown --field name, unreadable --root
```

`tests/fanout/fixture.js`: `fanoutHost({ briefed = false, … })`; default specs are `brief: n/a` with File Plan rows
(`03-x`: `src/x.js`, `src/shared.js` · `06-y`: `src/y.js`, `src/shared.js` · `04-z`: `src/z.js`); `briefed: true`
restores `brief: 32/32/33`.

## Behavior

Parsing: `brief: 32` → briefed `32`; `brief: 4b-auth` → briefed `04b`; `brief: n/a`, `none`, `-`, `—`, an empty
value or no line → ad-hoc. Nothing downstream reads the raw string again.

Comparison: the roadmap bar for brief 32 lists the specs whose brief is `same` as `32`; an ad-hoc spec is `unknown`
against every brief and so belongs to none, earns no orphan-stamp anomaly, and takes no brief-level blocker. In the
sort, ad-hoc entries tie at `Infinity` and fall to path order after every briefed entry at the same rank, as today.

Parallelism (on spec 06's post-image): `pairSerialReason(a, b)` first asks `relateBriefs(a.brief, b.brief)` — `same` →
`shared brief 32`; `different` → the roadmap dependency path, else `null`; `unknown` → the File Plan rule. When the
File Plan rule makes no claim, the entry remembers `right ad-hoc; no File Plan rows` (or `both ad-hoc; …`) and the
dashboard's `--all` branch prints `🤷 no brief — parallelism unknown (right ad-hoc; no File Plan rows)`. `--next --json`
still prints `parallel: null` and `brief: null` for that entry.

Fan-out report: lanes `L1 03-x` stopped, `L2 06-y` waiting on `File Plan overlap: src/shared.js` → the report bullet is
`specs/20261102/06-y.md: not started — waited on File Plan overlap: src/shared.js`; with `briefed: true` and
`waitingOn: shared brief 32` it stays `… waited on specs/20261102/03-x.md, which stopped`.

Lint: on this checkout after the build, `node spec/scripts/variant-lint.js --root .` prints two `skip` lines and
`VARIANT_LINT fields=1 files=<n> findings=0`, exit 0. Re-introducing `if (s.brief && …)` in `spec-status.js` prints
`spec/scripts/spec-status.js:<line> boolean-and-or | if (s.brief && …)` and exits 1 — the suite goes red through
`tests/consistency/variant-lint-gate.test.js`.

## Acceptance Criteria

- **AC-20261103-10-1**: WHEN `parseBrief` is called THE SYSTEM SHALL return `{ kind: 'briefed', num: '32' }` for `'32'`,
  `{ kind: 'briefed', num: '04b' }` for `'4b-auth'`, and `{ kind: 'adhoc' }` for each of `'n/a'`, `'NONE'`, `'-'`,
  `'—'`, `''`, `undefined` and `null`; `briefNum` SHALL return `'04b'` for the briefed value and `null` for the ad-hoc one;
  `briefOrd` SHALL return `4.02` for `parseBrief('04b')` and `Infinity` for `parseBrief('n/a')`; and `normBrief('4b-auth')`
  SHALL equal `'04b'` both from `lib/brief.js` and from `lib/queue.js` → writes tests/brief/relate-briefs.test.js
- **AC-20261103-10-2**: WHEN `relateBriefs` is called THE SYSTEM SHALL return `{ relation: 'same', reason: null }` for
  `(parseBrief('32'), parseBrief('32'))`, `{ relation: 'different', reason: null }` for `('32', '33')`,
  `{ relation: 'unknown', reason: 'both ad-hoc' }` for `('n/a', 'n/a')`, `{ relation: 'unknown', reason: 'left ad-hoc' }`
  for `('n/a', '32')`, `{ relation: 'unknown', reason: 'right ad-hoc' }` for `('32', 'n/a')`, and SHALL throw a
  `TypeError` whose message starts `relateBriefs: expected a parsed brief` for `relateBriefs('32', '32')` → writes
  tests/brief/relate-briefs.test.js
- **AC-20261103-10-3**: WHEN `--next --json` runs on a host with hardened `specs/20260710/05-adhoc.md` (`brief: n/a`,
  no File Plan) and hardened `specs/20260710/06-also.md` (`brief: n/a`, no File Plan) THE SYSTEM SHALL print both
  entries with `brief === null`, `parallel === null`, `parallel_reason === null` and the key list exactly
  `['action', 'blockers', 'brief', 'note', 'parallel', 'parallel_reason', 'path', 'status']`, and the bare `--all`
  render SHALL print `└─ 🤷 no brief — parallelism unknown (both ad-hoc; no File Plan rows)` once under the runner-up →
  rewrites tests/spec-status.test.js :: --next makes no parallel claim
- **AC-20261103-10-4**: WHEN `--lanes --json` runs on the `lanesHost()` fixture THE SYSTEM SHALL CONTINUE TO print
  `lanes[0]` keys exactly `['action', 'branch', 'brief', 'note', 'path', 'status', 'worktree']`, `lanes[].brief` as
  `'32'` and `'33'`, and `serialized` exactly `[{ path: 'specs/20261102/06-y.md', brief: '32', reason: 'shared brief 32' }]`
  → reuses tests/spec-status.test.js :: AC-20261102-03-1 / AC-20261103-08-8: --lanes --json prints
- **AC-20261103-10-5**: WHEN `--json` runs on a host with brief file `02-billing.md`, hardened `specs/20260710/01-b.md`
  (`brief: 02`) and hardened `specs/20260710/02-a.md` (`brief: n/a`) THE SYSTEM SHALL print `briefs` entry `02` with
  `specs` exactly `[{ path: 'specs/20260710/01-b.md', status: 'hardened' }]`, `specs[]` carrying `brief: '02'` and
  `brief: null` respectively, and zero `orphan-stamp` anomalies; and WHEN `02-a.md` instead carries `brief: 99` THE
  SYSTEM SHALL print one `orphan-stamp` anomaly naming `specs/20260710/02-a.md` → writes tests/spec-status.test.js
- **AC-20261103-10-6**: WHEN a spec carries `brief: n/a`, `brief: none` or `brief: -` THE SYSTEM SHALL CONTINUE TO
  derive `brief: null` in `--json` with no `orphan-stamp` anomaly (e.g. `brief: n/a` → `specs[0].brief === null`) →
  reuses tests/spec-status.test.js :: brief: n/a (and none/-) is deliberately briefless
- **AC-20261103-10-7**: WHEN `--next --json` runs with no queue file on a host holding hardened `specs/20260710/03-z.md`
  (`brief: n/a`) and hardened `specs/20260710/04-y.md` (`brief: 02`, brief file `02-billing.md` with `Depends on: —`)
  THE SYSTEM SHALL print `next[0].path === 'specs/20260710/04-y.md'` and `next[1].path === 'specs/20260710/03-z.md'`
  (briefed before ad-hoc at equal rank), and WHEN both are ad-hoc THE SYSTEM SHALL order them by path
  (`03-z.md` first) → writes tests/spec-status.test.js
- **AC-20261103-10-8**: WHEN a bare `fanoutHost()` plan (ad-hoc default) tables L1 `03-x` and L2 `06-y` waiting on
  `File Plan overlap: src/shared.js`, L1 is returned `--stopped "worker gone"` and L3 `04-z` merged THE SYSTEM SHALL
  reach REPORT with the bullet exactly `specs/20261102/06-y.md: not started — waited on File Plan overlap: src/shared.js`
  and no bullet containing `, which stopped` → writes tests/fanout/fanout-driver.test.js
- **AC-20261103-10-9**: WHEN the same run uses `fanoutHost({ briefed: true })` with L2 `06-y` waiting on `shared brief 32`
  and L1 `03-x` stopped THE SYSTEM SHALL CONTINUE TO print the bullet
  `specs/20261102/06-y.md: not started — waited on specs/20261102/03-x.md, which stopped` → reuses
  tests/fanout/fanout-driver.test.js :: AC-20261102-03-22: a waiting
- **AC-20261103-10-10**: WHEN `spec-queue add 32` runs on a host whose queue already holds brief 32 THE SYSTEM SHALL
  CONTINUE TO exit non-zero naming `brief 32` and its pending position and write nothing (e.g. stderr contains
  `brief 32` and `position 1`) → reuses tests/queue/spec-queue.test.js :: AC-20260903-03-6 / AC-20261013-02-10: spec-queue add refuses a brief already queued
- **AC-20261103-10-11**: WHEN a queued brief item is gated with `after: { brief: '01' }` and brief 01 is not done THE
  SYSTEM SHALL CONTINUE TO carry the blocker on its spec entry (e.g. a blocker string naming `brief 01`) and drop it once
  brief 01 is fully done → reuses tests/queue/queue-overlay.test.js :: AC-20260903-03-3
- **AC-20261103-10-12**: WHEN `variant-lint.js --root <tmp>` runs over `spec/scripts/a.js` holding, one per line,
  `if (!e.brief) x()`, `const t = e.brief && 1`, `const u = e.brief ? 1 : 2`, `if (e.brief) {}`, `const v = e.brief ?? 0`,
  `const w = e.brief?.num`, `const y = 1 && e.brief`, `if (a.brief === b.brief) {}`, `if ('32' !== e.brief) {}` and
  `// if (e.brief) comment` THE SYSTEM SHALL exit 1 and print exactly nine finding lines in file order —
  `spec/scripts/a.js:1 boolean-not | if (!e.brief) x()`, `:2 boolean-and-or`, `:3 boolean-ternary`, `:4 boolean-if`,
  `:5 coalescing`, `:6 coalescing`, `:7 coalescing-rhs`, `:8 equality`, `:9 equality-rhs` — then
  `VARIANT_LINT fields=1 files=1 findings=9`; `--json` SHALL print `findings.length === 9` with `findings[7]` equal to
  `{ path: 'spec/scripts/a.js', line: 8, field: 'brief', class: 'equality', code: 'if (a.brief === b.brief) {}' }` →
  writes tests/variant-lint/grammar.test.js
- **AC-20261103-10-13**: WHEN the tmp root's `spec/scripts/b.js` holds only `const n = x.briefs.length`,
  `if (e.brief.kind === 'adhoc') {}`, `const o = { brief: e.brief }`, `fn(e.brief)`, `const k = e.brief[0]` and
  `spec/scripts/lib/brief.js` holds `return a.brief === b.brief` and `spec/scripts/genesis-driver.js` holds
  `if (status.brief && status.brief.mocks) {}` THE SYSTEM SHALL exit 0, print
  `skip spec/scripts/genesis-driver.js — \`status.brief\` is the genesis status record (ratified-brief object), not a spec stamp`
  and `VARIANT_LINT fields=1 files=2 findings=0` (the helper and the foreign file are not counted) → writes
  tests/variant-lint/grammar.test.js
- **AC-20261103-10-14**: WHEN `variant-lint.js --field` runs THE SYSTEM SHALL exit 0 and print exactly
  `brief → spec/scripts/lib/brief.js (scope spec/scripts/**; foreign: spec/scripts/genesis-driver.js, spec/scripts/prototype-driver.js)`;
  WHEN `--field nope` runs THE SYSTEM SHALL exit 2 with stderr containing `unknown field nope` and `brief`; and WHEN
  `--root <missing dir>` runs THE SYSTEM SHALL exit 2 with stderr naming the directory → writes
  tests/variant-lint/grammar.test.js
- **AC-20261103-10-15**: WHEN `spec-paths variant-lint` runs THE SYSTEM SHALL print a path ending
  `scripts/variant-lint.js` that exists, and the usage line SHALL name `variant-lint` → rewrites tests/spec-paths.test.js :: AC-20260926-03-8: every documented key resolves
- **AC-20261103-10-16**: WHEN `spec/entrypoints.json` is checked against the live repo THE SYSTEM SHALL CONTINUE TO find
  an entry for every executable under `spec/scripts/` (now including `spec/scripts/variant-lint.js` with entry point
  `tests/consistency/variant-lint-gate.test.js`) → reuses tests/consistency/entrypoints.test.js :: AC-20260820-04-1: every executable
- **AC-20261103-10-17**: WHEN `fanoutHost()` is stood up with no `briefed` opt THE SYSTEM SHALL write
  `specs/20261102/03-x.md` with `brief: n/a` and a File Plan row `src/shared.js`, and `spec-status --lanes --json` on it
  SHALL print `lanes` paths `['specs/20261102/03-x.md', 'specs/20261102/04-z.md']` and `serialized` exactly
  `[{ path: 'specs/20261102/06-y.md', brief: null, reason: 'File Plan overlap: src/shared.js' }]`; WHEN
  `fanoutHost({ briefed: true })` is stood up THE SYSTEM SHALL write `brief: 32` into `03-x.md` and print `serialized[0].reason === 'shared brief 32'`;
  and WHEN `fanoutHost({ dependent: true })` is stood up without `briefed` THE SYSTEM SHALL throw with a message containing
  `dependent needs briefed: true` → writes tests/fanout/fanout-driver.test.js
- **AC-20261103-10-18**: WHEN `host({ specs: { '20260710/01-a.md': 'date: 2026-07-10\nstatus: hardened' } })` is stood up
  THE SYSTEM SHALL write a file whose frontmatter contains the line `brief: n/a`, and WHEN the frontmatter already carries
  `brief: 02` THE SYSTEM SHALL write it unchanged with no second `brief:` line → writes tests/spec-status.test.js

## Assumptions (escalation triggers)

- A1: This spec builds on spec 06's post-image (`pairSerialReason`, `fixes[].after`, the fixture's `{ fm, body }`
  `writeSpec`), which is `hardened` and being built in another worktree while this plans; the File Plan rows shared with
  06 — `spec-status.js`, `fanout-driver.js`, `tests/spec-status.test.js`, `tests/fanout/fanout-driver.test.js`,
  `tests/fanout/fixture.js` — conflict at merge with 06's branch. Rule: rebase onto 06 after it merges; `depends_on`
  blocks the build until 06 is `done`. **If false** (06 superseded before this builds): `pairSerialReason` does not
  exist — D2's opening branch lands in `briefSerialReason` instead, the ad-hoc fixture default serializes nothing
  (no File Plan rule), and AC-8/AC-17's `File Plan overlap` literals become `queued behind the top pick`; STOP and re-plan.
- A2: Executed check — `node spec/scripts/spec-status.js --root . --lanes --json` run from this linked worktree prints
  `spec-status: --lanes runs from the main worktree — cd /home/jj/projects/claude-plugins` and exits 2, so a suite run
  inside a fan-out lane cannot query `--lanes` on the checkout itself; D9's smoke therefore copies the tree into a
  `gitRepo(tmpdir())` and runs from there. **If false** (the refusal is lifted): the copy still works; keep it — the
  copy is also what keeps the real tree read-only.
- A3: Executed check — a scratch implementation of D5's eight classes over `spec/scripts/**` on this checkout finds 20
  sites: `spec-status.js` 10 (lines 198, 306, 424, 581, 591, 595, 632, 640, 665, 667), `fanout-driver.js` 2 (208, 357),
  `spec-queue.js` 2 (345, 568), `lib/queue.js` 1 (106), `prototype-driver.js` 4 (230, 656, 733, 839),
  `genesis-driver.js` 1 (2220); `verdict.js` 0 (its only `.brief` token is `row.briefs`, excluded by `\b`). The 15 in the
  five named files are D2–D4's sites; the 5 in the two foreign files read another record and are D5's `foreign` skips.
  **If false** (spec 06 or 08 lands more sites before this builds): each new finding is routed through D1's helper in
  the rebase (D11); the lint's grammar is unchanged.
- A4: Executed check — `briefSerialReason(null, null)` evaluates to `'shared brief null'` (the `a === b` arm), and
  `--next --json` on this checkout prints `brief: null, parallel: null` for both ad-hoc entries (`06-…` and the blocked
  `08-…`) — the root cause is as stated. **If false:** D3's fix is still correct; only the Goal's incident sentence is dropped.
- A5: `node --test 'tests/host-run/*.test.js'` runs the files under `tests/host-run/` on this host's Node 26 (executed:
  `ℹ skipped 0`, exit 0), so D9's new file joins the scoped run and the gate's `tests/**` glob without wiring.
  **If false:** the gate's glob in `.claude/spec.config.json` is the fix, never a test-side move.
- A6: `tests/consistency/entrypoints.test.js`'s forward check accepts a `tests/` path as an entry point (the non-`.md`,
  non-`hooks.json` branch only requires the file to exist and to carry the quoted literal `'scripts/variant-lint.js'`
  on a non-comment line, which `runNode('scripts/variant-lint.js', …)` is). **If false:** the entry point becomes
  `spec/commands/doctor.md` naming `spec-paths variant-lint` in a one-line check, a doctrine row added to the File Plan.
- A7: No test outside the File Plan asserts on a `--all` 🤷 line beyond the prefix `🤷 no brief — parallelism unknown`
  (`tests/queue/queue-overlay.test.js:423` filters by `includes`, `tests/spec-status.test.js:667` matches the prefix), so
  D2's appended `(<reason>)` keeps spec 06's AC-20261103-06-5 pin green. **If false:** the hit is a D2 collision —
  enter it as a fix row and retag, never weaken.
- A8: The queue item shapes on disk (`{ kind: 'brief', brief: '32' }`, `after: { brief: '01' }`) are never parsed into
  the variant on disk; D4 parses at read only, so `.git/spec-queue.json` files written by older versions read unchanged.
  **If false** (a site needs the variant persisted): STOP — that is a queue schema change owned by the parallel plan.

## Rationale

The escape shape is one line long: `brief: n/a` parses to `null`, and `null` is falsy and `null === null`. Every site
that asked "does this entry have a brief" or "is this the same brief" was correct for briefed specs and silently
wrong for ad-hoc ones — the fan-out blamed the first stopped lane for any ad-hoc wait, the dashboard sorted every
ad-hoc entry into one tie, and no reviewer saw it because each site read naturally. Sixteen of the last forty ledger
escapes are this shape and all followed a CLEAN review; Gonçalves et al. (2022, *Empirical Software Engineering*,
"Do explicit review strategies improve code review performance?") found checklists do not move reviewer detection
on exactly this kind of defect, while Yuan et al. (OSDI '14, "Simple Testing Can Prevent Most Critical Failures")
found that most catastrophic failures sat in trivially wrong error-handling a pattern-derived static check would
have caught. So the fix is deterministic, per core.md's standing-guard rule: a parser that cannot produce the ambiguous
value ("parse, don't validate" — King 2019), one comparison helper whose third answer carries its reason, and a lint
that fails the suite on the pattern itself.

The discriminant stays internal (D2). The `--json` shapes are a frozen API for the fan-out driver and external
dashboards; `brief: null` is what they read today and what they keep reading. The lint's allowlist is the helper file
only; the two `foreign` entries are not an allowlist of sites but a statement that `genesis-driver.js` and
`prototype-driver.js` read a *different* record whose field happens to be named `brief` — the lint prints each skip
so the exemption is visible on every run, and a third foreign file is one table entry, never a comment. Per-line
annotations were rejected: an annotation is a reviewer-held decision the lint cannot see through.

The lint grammar (D5) is a line regex, not an AST walk: zero dependencies forbid a parser, and the eight classes are
the exact shapes the executed sweep found (A3). Known blind spots, recorded rather than closed: a destructured
`const { brief } = e` followed by `brief &&` and a two-line expression with `.brief` ending one line and `&&` opening
the next. Neither occurs in the tree today; the sweep that finds either is one more class.

The real-tree smoke (D9) copies rather than runs in place because `--lanes` refuses a linked worktree (A2) and
because the sentinel pair is what makes "at least one parallel-ok ad-hoc pair" true on every day, not only on days the
real tree happens to hold two disjoint hardened specs. The fixture default (D8) flips to ad-hoc because the ad-hoc
path is the one the escapes took; the lane topology is preserved by File Plans so spec 06's tests keep their shape,
and `briefed: true` is an opt-in, not a rewrite.

Out of scope, by the parallel plan's ownership: seeding the queue with ad-hoc specs and `verdict.js`'s `--briefs`
parsing (D4). Both AskUserQuestion forks (the critical-tier lock and the four design forks) were pre-decided by
independent review on 2026-11-03 and are recorded as `[asked:]` tags on D2, D4, D5, D7 and D9.

Collision closure (lock-time, advisory; literals `shared brief`, `parallelism unknown`, `briefSerialReason`,
`fanoutHost`, `normBrief`, `brief 32`): 26 unplanned hits, all waived. Literals outside the plan —
`docs/roadmap/33-every-question-is-a-driver-stop.md` and `spec/commands/fanout.md` (prose; `shared brief` stays a
live reason string), `tests/genesis/tournament.fixtures.js` ("shared brief writer" is English, not the reason),
`spec/scripts/prototype-driver.js:267` (a comment naming `normBrief`'s shape; the function is re-exported unchanged).
Executes-tier hits outside the plan (`tests/ceiling/*`, `tests/frontmatter/*`, `tests/review/*`, `tests/status/*`,
`tests/queue/queue-hygiene.test.js`, `tests/prototype/contract.test.js`, `tests/consistency/*`, `tests/doctor/*`,
`tests/init-gen/*`, `tests/mocks/*`, `tests/commit/*`, `tests/ac-matrix/*`, `tests/host-config/*`,
`tests/prose-debt/*`) read `spec-status`, `spec-queue` or `spec-paths` output whose external shape D2 and D4 keep
byte-identical and whose fixtures hold no two ad-hoc specs beside each other; the build's whole-suite check adjudicates.

## Canonical Delta

`docs/canonical/status.md`, after the `--lanes --json` paragraph: append — "A spec's `brief:` stamp is parsed once by
`spec/scripts/lib/brief.js` into `{ kind: 'briefed', num }` or `{ kind: 'adhoc' }`; `relateBriefs(a, b)` is the one
comparison (`same`, `different`, or `unknown` with a printed reason), and every external `--json` surface serializes
the stamp back to `'NN'` or `null`. The `--all` `🤷` line names the reason parallelism is unknown.
(specs/20261103/10-two-missing-briefs-are-not-the-same-brief.md)"

`docs/canonical/scripts.md`, after the `lib/file-shapes.js` bullet: append — "**`spec/scripts/variant-lint.js` is the
one sweep over discriminated fields.** Its `FIELDS` table names each field, its helper module and the files whose
same-named field is another record; it fails on any `.<field>` read in a boolean, coalescing or equality position
under `spec/scripts/**` outside the helper, printed as `<path>:<line> <class> | <code>` with the sentinel
`VARIANT_LINT fields= files= findings=`. `tests/consistency/variant-lint-gate.test.js` runs it against the checkout in
every suite run; a later axis is one table entry. (specs/20261103/10-two-missing-briefs-are-not-the-same-brief.md D5, D7)"
