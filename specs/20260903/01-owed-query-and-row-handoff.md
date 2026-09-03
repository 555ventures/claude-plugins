---
date: 2026-09-03
status: implementing
tier: standard
area: feedback-loop
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: 23
open_markers: 0
build_base: main
diff_base: 841b3de18b61ec869fd560e27f4b3b4c1f51267f
---

# Owed query and row-as-handoff: hosts emit rows, the plugin reads them

## Goal

Close the open edge of the feedback loop without adding state. A host session that meets a
plugin defect records the ledger row it already knows how to write and its report ends with
the row's key — no handoff prompt is composed. In the plugin repo, one fleet-reader query
(`--owed`) lists every plugin-blaming row across this machine's checkouts — plugin-blaming
escape rows, missed replay rows, and unstamped findings in the legacy `docs/spec-feedback/`
briefs — grouped by class with the joined recurrence count, a pointer to the response
core § Incident Policy admits at that count, and a fixed-status derived from whether a
plugin spec or test already cites the row's key. Replay rows gain the same `via` provenance
build and review rows carry, so the manual retry path becomes a ledger count. Done means:
the three deliverables ship behind executed tests, every existing fleet-reader/replay/escape
pin stays exhaustive (updated in place, never loosened), and nothing stores state between runs.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `owed` is the ninth fixed fleet-reader question: always present in `--json` under the top-level key `owed`; `--owed` is a render selector only — the bare human render is byte-identical to today, `--owed` prints population then the owed render, `--owed --json` prints the full JSON (AC-20260903-01-1, AC-20260903-01-7, AC-20260903-01-8) | specs/20260820/05 D5 says a new question needs a spec, not a flag — this is that spec; a selector flag couples nothing and keeps `--json` the sole machine format. Rejected: a new command or a `/spec:status` section (brief 23's over-engineering list). |
| D2 | Owner is derived from `preventedBy` alone: `review-check` \| `runtime-leg` → plugin (an owed item); `enforcer` \| `test` → host (counted in `owed.hostOwned`, never listed); `doctrine` \| `none` → `owed.ambiguous` (listed, never grouped); any other value → `owed.ambiguous` too (AC-20260903-01-2) | Executed check: no host Gotchas line carries an escape-row key and no escape row carries a gotcha citation, so the brief's "resolve via the cited gotcha's tag" has no link to follow — a heuristic match would be a guess. Rejected: text-matching the row's spec path against Gotchas prose. |
| D3 | Escape rows in a self-repair repo (population `selfRepair: true`) never become owed items; `owed.selfRepairExcluded` counts them and `escapes.byClass` (hence every group's `recurrences`) still counts them (AC-20260903-01-3) | JJ ruling this session: the plugin's own rows are in-session incidents already visible in its own status; the list stays about defects hosts hit. Nothing vanishes silently — the counter line prints. |
| D4 | Item keys: escape → `escape:<repo>:<ts>:<file>` (repo = the population name, i.e. the checkout's directory name); replay → the `runId` literal (`rp_…`); feedback → the finding `id` literal (AC-20260903-01-5) | Executed check: `(repo, ts)` is shared by 12 fleet rows in 4 groups (one group holds two different classes with different owners), while `(repo, ts, file)` is unique fleet-wide — the file-qualified form is the shortest unique key. Replay run ids and feedback ids are already unique literals. Rejected: `escape:<repo>:<ts>` (conflates distinct defects). |
| D5 | Citation scan: every self-repair repo in the population is scanned recursively under `specs/`, `spec/`, `tests/` for each item's key as a literal substring; a hit under `spec/` or `tests/`, or under `specs/` in a file whose frontmatter `status:` is `done`, → `cited.status: fixed`; a hit only under `specs/` with any other status → `in-flight`; no hit → `uncited`; no self-repair repo in the population → `owed.citationScan: null` and every item `unknown` (AC-20260903-01-4) | No stored state: a fixed row stops appearing because its key is on disk in the fix. `tests/` is in the surface because a direct (no-spec) fix under core § Incident Policy lands as a test whose header cites the owner id — this repo's Test Rules already require exactly that. `docs/` is excluded: a roadmap brief mentioning a run id is a plan, not a fix (executed check: brief 23 mentions a missed replay's id). |
| D6 | `docs/spec-feedback/*.md` is read per repo with a hand-rolled frontmatter parser (Contracts); a finding is unstamped iff its `findings[]` entry has no `intake:` block; a file with no parseable frontmatter lists as `parsed: false` with zero findings; a repo without the directory contributes nothing (AC-20260903-01-6) | Executed check: the parser reproduces the hand count on all 7 real files (15 findings, 1 unstamped, 1 unparsed prune ledger). The format is neither revived nor deleted (brief 23 scope 2); retirement is a later one-line spec once the last unstamped finding is derived-fixed. |
| D7 | Owed render (Contracts): population first; per class group a header with the joined recurrence count and the literal policy pointer `core § Incident Policy (recurrences N; guard bar 3)` — a pointer, never a restatement; one line per item whose status is not `fixed`, carrying its key and its bracketed status/next action; `fixed` items are hidden behind one trailing `hidden:` count; an empty list prints `owed: none` (AC-20260903-01-7) | Brief 17's silent-absence rule: the population block and the hidden count keep every absence explicit. The per-item next action states ownership is claimed only after reproduction in `tests/fixtures/`. |
| D8 | `replay.js --record` gains `--via driver\|manual`: exactly `driver` stamps `via: "driver"`, absent or any other value stamps `"manual"`; the row key set becomes the Contracts set plus `via`; stdout becomes `recorded runId=<id> via=<value>`; the retained artifact carries the same field (AC-20260903-01-10, AC-20260903-01-15) | Mirrors build/review's D4/D5 rule (specs/20260901/02: anything but exactly `loop` is `direct`), so existing `--record` callers keep working and a missing flag is the honest `manual`. Rejected: a required flag (reddens every existing invocation for no measurement gain). |
| D9 | `replay.js --stats` prints one additional line `by-via driver=N manual=N unknown=N` (`unknown` = rows with no `via`), after the catch-rate line and before `per-class:` (AC-20260903-01-11) | Brief 23 scope 3's promise is that manual-path usage is a ledger *count*; one stats line makes it invocable cold instead of a jq exercise. Additive — existing stats regexes keep matching. |
| D10 | The review driver's REPLAY step body and its `replay-recorded` refusal remedy both spell `--via driver` in the `--record` command they print; `replay.md` Phase 4 states the rule (`--via driver` when the target came from the review driver's REPLAY step, `--via manual` when Phase 0 ran in this command) (AC-20260903-01-12, AC-20260903-01-14) | The driver is the only caller that knows the run was driver-handed; printing the flag where the session copies the command from is the cheapest correct stamp. |
| D11 | `escape-row.js --append` stdout gains a trailing ` key=escape:<basename(root)>:<ts>:<file>` on its existing confirmation line (AC-20260903-01-13) | The writer derives the key; the session copies it verbatim into the report — derive, don't hand-compose. The existing confirmation regex tolerates the suffix (executed check: it is unanchored). |
| D12 | Row as handoff: `escape.md` step 7 adds one bullet when `preventedBy` is `review-check` or `runtime-leg` — the row key and the sentence that the plugin repo's `fleet-reader --owed` consumes it, nothing to paste; `replay.md` Phase 5 adds the same bullet on `missed` with the run id; neither composes a handoff prompt (AC-20260903-01-14) | Brief 23 scope 2. The sentence that stops host sessions composing prompts lives in JJ's global instructions (outside this repo) — recorded as a user step in the lock report, never a spec deliverable. |
| D13 | No doctrine edit carries the citation convention; the owed render's per-item next action teaches it at the moment it is needed [no-ac: the deliverable is the absence of a doctrine edit; D7's AC pins the render line that carries the convention] | JJ's standing rule: doctrine prose only shrinks; the render is the surface where a planner meets the row, so it is where the convention belongs. |
| D14 | Precondition recorded, not blocked: the post-backfill fleet values are in Assumptions; the three never-replayed repos that hold reviews (autopilot-hub, zubu-menu, hiwora) get one queue item, run later [no-ac: queue entry, no code surface] | JJ ruling this session: nothing in this design changes with those results. |
| D15 | Plugin version bumps to the next free minor (target 7.69.0) with the plugin.json description's changelog line [no-ac: the version-bump omission is a hard review finding already; the literal number is a target, not a pin (Gotchas)] | Behavior change discipline in pipeline rules § Planning. |
| D16 | Build-time amendment (auto-picked by the build session 2026-09-03, veto anytime): AC-13 and AC-15 each mixed a new promise with a `SHALL CONTINUE TO` clause, and `red-check.js` classifies any AC carrying that phrase as a green pin — so their test files were expected green on the pre-image while genuinely red. The regression clauses moved to their own ACs (AC-20260903-01-16 for `--append`'s exit 0 / one row, AC-20260903-01-17 for `--record`'s exit 0 / one row) and the pre-existing tests carry the new tags; no promise changed (AC-20260903-01-16, AC-20260903-01-17) | The sanction lives in the spec's AC carriers by design (the build driver never accepts an "unsanctioned" colour itself); a mixed AC is a composition defect of the spec, not of the tests, and splitting it is the smallest reversible correction. Note for future specs: one AC never carries both a new promise and a CONTINUE TO clause. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/fleet-reader.js | MODIFY | scripts | Ninth fixed question `owed` (D1–D7): owner derivation, self-repair exclusion, key derivation, citation scan over self-repair repos' `specs/`/`spec/`/`tests/`, spec-feedback frontmatter parser, `--owed` render selector; header comment updated (nine questions, the flag's exact meaning, what the scan deliberately does NOT read) |
| spec/scripts/replay.js | MODIFY | scripts | `--record --via driver\|manual` (D8) stamping `via` on the row and artifact, stdout `recorded runId=… via=…`; `--stats` gains the `by-via` line (D9); usage/header updated |
| spec/scripts/escape-row.js | MODIFY | scripts | `--append` confirmation line gains ` key=escape:<repo>:<ts>:<file>` (D11); header exit-0 stdout description updated |
| spec/scripts/spec-review-driver.js | MODIFY | scripts | REPLAY step body and `replay-recorded` refusal remedy spell `--via driver` in the printed `--record` command (D10); no state or transition change |
| spec/commands/escape.md | MODIFY | doctrine | Step 7 report gains the plugin-blaming row-as-handoff bullet (D12); step 5 notes the `key=` suffix the append prints |
| spec/commands/replay.md | MODIFY | doctrine | Phase 4 `--record` line gains `--via driver\|manual` with the D10 rule; Phase 5 gains the `missed` row-as-handoff bullet (D12) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | Version bump to the next free minor (D15) and the description's changelog line |
| tests/fleet-reader/owed.test.js | CREATE | tests | AC-20260903-01-1, AC-20260903-01-2, AC-20260903-01-3, AC-20260903-01-4, AC-20260903-01-5, AC-20260903-01-6, AC-20260903-01-7, AC-20260903-01-9 |
| tests/fleet-reader/discovery.test.js | MODIFY | tests | AC-20260903-01-8 — the exhaustive top-level key pin updated in place to nine keys and retagged (never loosened) |
| tests/replay/replay.test.js | MODIFY | tests | AC-20260903-01-15, AC-20260903-01-17 — the `--record` row key-set pin updated in place to include `via` and retagged; the same no-`--via` invocation tagged as the CONTINUE TO pin |
| tests/replay/record-via.test.js | CREATE | tests | AC-20260903-01-10, AC-20260903-01-11 |
| tests/review/review-driver.test.js | MODIFY | tests | AC-20260903-01-12 — the REPLAY step body and the `replay-recorded` refusal name `--via driver` |
| tests/escape/escape-row.test.js | MODIFY | tests | AC-20260903-01-13, AC-20260903-01-16 — `--append` prints the derived key; the pre-existing append pin retagged as the CONTINUE TO pin |
| tests/fleet-reader/doctrine-pins.test.js | MODIFY | tests | AC-20260903-01-14 — escape.md step 7 bullet, replay.md Phase 4 rule and Phase 5 bullet |

## Contracts

### `fleet-reader.js --json` — new top-level key `owed`

```
owed: {
  citationScan: { roots: [<abs dir>…], surfaces: ['specs','spec','tests'], files: N } | null,
  selfRepairExcluded: N,          // D3 — plugin-blaming escape rows in selfRepair repos, not listed
  hostOwned: N,                   // D2 — preventedBy enforcer|test, never listed
  groups: [                       // escape (plugin) + replay (missed) items, by effective class
    { class: '<id>'|'unclassed', recurrences: N,          // escapes.byClass[class] || 0
      policy: 'core § Incident Policy (recurrences N; guard bar 3)',
      items: [ <item>… ] }        // class asc; items by repo asc then ts asc
  ],
  ambiguous: [ <item>… ],         // D2 — preventedBy doctrine|none|other; repo asc, ts asc
  feedback: {
    files: [ { repo, path, parsed: true|false, findings: N, unstamped: N } ],
    unstamped: [ { kind:'feedback', key:'<id>', repo, path, id, category, stage, severity,
                   cited: <cited>, next: <next> } ]
  }
}

<item> (escape) = { kind:'escape', key:'escape:<repo>:<ts>:<file>', repo, ts, spec, file,
                    class: '<id>'|null, preventedBy, reviewRunId, cited: <cited>, next: <next> }
<item> (replay) = { kind:'replay', key:'<runId>', repo, ts, spec, runId, class: '<id>'|null,
                    outcome:'missed', reviewRunId, cited: <cited>, next: <next> }
<cited> = { status: 'fixed'|'in-flight'|'uncited'|'unknown', by: [ '<repo-relative path>'… ] }
<next>  = status uncited  → 'reproduce in tests/fixtures/ before claiming; cite <key> in the fixing spec (Rationale or Decisions) or the fixing test header'
          status in-flight → 'cited by <path> (<status>) — lands when that spec closes'
          status fixed     → 'cited by <path>'
          status unknown   → 'no plugin checkout under <reposRoot> — fixed-status unknown'
```

Owner rule (D2): `preventedBy` ∈ {`review-check`,`runtime-leg`} → item; ∈ {`enforcer`,`test`} →
`hostOwned`; anything else (`doctrine`, `none`, missing, out-of-enum) → `ambiguous`. Effective
class = `joinAmendments` result when an amendment exists, else the row's own `class` (the same
join `escapes.byClass` uses). Replay items are `stage:"replay"` rows with `outcome:"missed"`,
from every repo including self-repair ones (a missed replay is a reviewer measurement, not the
plugin's own escape).

Citation scan (D5): for every population repo with `selfRepair: true`, walk `specs/`, `spec/`,
`tests/` recursively (`fs.readdirSync(dir, { recursive: true, withFileTypes: true })`, Node 26
verified), read every regular file as UTF-8, test `text.includes(key)`. Spec frontmatter status
is the first `^status:\s*(\S+)` line inside the leading `---` block. A missing surface directory
scans as zero files, never an error.

### `fleet-reader.js --owed` — human render

```
<population block, unchanged>

Owed — plugin-blaming rows across this machine's checkouts (citation scan: <roots joined by ", "> — <N> files)
  <class>: recurrences=<N> → core § Incident Policy (recurrences <N>; guard bar 3)
    <key>  preventedBy=<v> repo=<repo> spec=<spec>  [uncited → reproduce in tests/fixtures/ before claiming; cite this key in the fixing spec or test header]
    <runId>  outcome=missed repo=<repo> spec=<spec>  [in-flight: cited by <path> (<status>)]
  ambiguous owner (preventedBy doctrine|none — no cited gotcha links a row): <N> rows
    <key>  preventedBy=<v> repo=<repo> spec=<spec>  [<status …>]
  spec-feedback — files=<N> unstamped=<N>
    <repo>: <path> <id> category=<c> stage=<s> severity=<v>  [<status …>]
  hidden: <N> rows already cited by landed code or a done spec
  excluded: selfRepair=<N> hostOwned=<N>
```

- The citation-scan parenthetical reads `(no plugin checkout under <reposRoot> — fixed-status unknown)` when `citationScan` is null.
- A group with every item `fixed` still prints its header line; the `hidden:` count covers it.
- When `groups`, `ambiguous`, and `feedback.unstamped` are all empty: `owed: none — every plugin-blaming row on this machine is cited` replaces the class/ambiguous/feedback blocks; the `hidden:`/`excluded:` lines still print.
- Without `--owed`, the human render is byte-identical to the pre-change render (no owed block). `--json` output is unaffected by `--owed`.

### `docs/spec-feedback/*.md` frontmatter parser (D6)

Leading `---\n…\n---` block only. Inside it, a `findings:` line opens the list; the list ends at
the next non-indented line. Entries: `  - id: <token>` starts a finding; `    category:`,
`    stage:`, `    severity:` set fields (`\S+` tokens); a `    intake:` line marks the finding
stamped. No YAML library, no multi-line values, no other keys read.

### `replay.js --record` row (D8)

```
{ ts, stage:'replay', spec, runId, reviewRunId, class, files, legs, outcome, tokens, via }
via ∈ 'driver' | 'manual'   — `--via driver` exactly → 'driver'; absent or anything else → 'manual'
stdout: recorded runId=<rp_…> via=<driver|manual>
artifact .claude/spec-runs/<runId>.json = { ...row, patch, reviewer }  (via rides along)
```

`--stats` (D9) — new line after `catch-rate a/b`, before `per-class:`:
`by-via driver=N manual=N unknown=N` (`unknown` = replay rows without a `via` field).

### `escape-row.js --append` stdout (D11)

`appended spec=<spec> file=<file> key=escape:<basename(resolved --root)>:<ts>:<file>` — the
`key=` suffix is appended to the existing line; nothing before it changes.

### Review driver printed commands (D10)

REPLAY step body: `Phase 4 records the outcome via replay.js --record --review-run-id <id>
--via driver. …`; `replay-recorded` refusal remedy: the printed `--record` command carries
`--via driver` before `--legs`.

## Behavior

- **Reading the owed list cold.** From the plugin repo: `node "$(spec-paths fleet-reader)"
  --owed`. Population prints first (which checkouts the machine has, which have no ledger), then
  the owed block. A row disappears from the block only because its key is on disk in a landed
  test, a doctrine file, or a done spec — there is no other state.
- **Claiming a row.** The next-action text is the whole protocol: reproduce in `tests/fixtures/`
  first; then the spec that fixes it cites the key in Rationale or Decisions (or the direct fix's
  test header cites it). A spec citing the key while still `hardened`/`implementing` shows the
  row as in-flight with the spec path.
- **Host side, escape.** `/spec:escape` step 5's append prints the key; step 7's report carries
  it when the row blames the plugin (`review-check`/`runtime-leg`). No handoff prompt is written
  in any case; the session keeps working.
- **Host side, replay.** A `missed` replay's Phase 5 report carries the run id the same way. A
  replay run from the review driver's REPLAY step records with `--via driver`; a manual
  `/spec:replay` records with `--via manual`.
- **Edge cases.** Two escape rows in one repo sharing `ts` (four such groups exist today) get
  distinct keys because `file` differs. An `escape-class` amendment changes the group an item
  lands in, never its key (the key uses the escape row's own `ts`). A self-repair repo's missed
  replay rows ARE listed (reviewer measurements are fleet evidence); its escape rows are not
  (D3). A spec-feedback finding stamped `intake:` is consumed and never listed, whatever the
  disposition. Unreadable files inside a citation surface are skipped and counted in
  `citationScan.files` as scanned-zero — never a crash (the scan is read-only advisory).

## Acceptance Criteria

- **AC-20260903-01-1**: WHEN `fleet-reader.js --json` runs over a synthetic fleet holding, in a non-self-repair repo, an escape row with `preventedBy:"review-check"` and `class:"c-one"`, an escape row with `preventedBy:"runtime-leg"` and `class:null` amended by an `escape-class` row to `"c-one"`, and a `stage:"replay"` row with `outcome:"missed"` and `class:"c-two"` THE SYSTEM SHALL emit `owed.groups` = two groups: `{class:"c-one", recurrences:2, policy:"core § Incident Policy (recurrences 2; guard bar 3)", items:[<2 escape items>]}` and `{class:"c-two", recurrences:0, policy:"core § Incident Policy (recurrences 0; guard bar 3)", items:[<1 replay item>]}` (class asc), each escape item carrying `kind:"escape"`, `key`, `preventedBy`, `reviewRunId`, and each replay item `kind:"replay"`, `key` = its `runId`, `outcome:"missed"` → `owed.test.js`
- **AC-20260903-01-2**: WHEN escape rows carry `preventedBy` `doctrine`, `none`, `enforcer`, `test`, and `"bogus"` THE SYSTEM SHALL list the `doctrine`, `none`, and `"bogus"` rows under `owed.ambiguous` (repo asc, ts asc) and none of them under `groups`, and SHALL set `owed.hostOwned` = 2 with neither `enforcer` nor `test` row anywhere in `owed` → `owed.test.js`
- **AC-20260903-01-3**: WHEN a self-repair repo (`.claude-plugin/marketplace.json` present) holds two plugin-blaming escape rows of class `"c-one"` and a host repo holds one of the same class THE SYSTEM SHALL list exactly the host row in `owed.groups`, set `owed.selfRepairExcluded` = 2, and report that group's `recurrences` = 3 (the fleet-wide `escapes.byClass` count) → `owed.test.js`
- **AC-20260903-01-4**: WHEN the population's self-repair repo holds `spec/agents/x.md` containing key K1, `tests/t.test.js` containing key K2, `specs/20260901/01-a.md` with frontmatter `status: done` containing key K3, `specs/20260901/02-b.md` with `status: hardened` containing key K4, and nothing containing key K5 THE SYSTEM SHALL report `cited.status` `fixed` for K1, K2, K3 (`by` naming `spec/agents/x.md`, `tests/t.test.js`, `specs/20260901/01-a.md` respectively), `in-flight` for K4 (`by: ["specs/20260901/02-b.md"]`, `next` naming that path and `hardened`), `uncited` for K5 (`next` starting `reproduce in tests/fixtures/ before claiming`); and WHEN no self-repair repo is in the population THE SYSTEM SHALL emit `owed.citationScan: null` and `cited.status: "unknown"` on every item; a key placed only under `docs/roadmap/` SHALL remain `uncited` → `owed.test.js`
- **AC-20260903-01-5**: WHEN two escape rows in repo `host-a` share `ts:"2026-08-23T18:21:47Z"` with files `a.js` and `b.js` THE SYSTEM SHALL emit keys `escape:host-a:2026-08-23T18:21:47Z:a.js` and `escape:host-a:2026-08-23T18:21:47Z:b.js`; a missed replay with `runId:"rp_0123456789ab"` SHALL have key `rp_0123456789ab`; an unstamped feedback finding `id: HOST-20260815-01` SHALL have key `HOST-20260815-01` → `owed.test.js`
- **AC-20260903-01-6**: WHEN a repo holds `docs/spec-feedback/20260815-brief.md` whose frontmatter lists two findings, one with an `intake:` block and one without, plus `docs/spec-feedback/prune.md` with no frontmatter THE SYSTEM SHALL emit `owed.feedback.files` = `[{path:"docs/spec-feedback/20260815-brief.md", parsed:true, findings:2, unstamped:1}, {path:"docs/spec-feedback/prune.md", parsed:false, findings:0, unstamped:0}]` (path asc) and `owed.feedback.unstamped` = one entry carrying `id`, `category`, `stage`, `severity`, `key` = the id, and `cited`; a repo with no `docs/spec-feedback/` directory SHALL contribute no `files` entry and exit 0 → `owed.test.js`
- **AC-20260903-01-7**: WHEN `fleet-reader.js --owed` runs over the AC-1 fleet with K-style citations making one item `fixed` THE SYSTEM SHALL print the population block first, then a line starting `Owed — plugin-blaming rows across this machine's checkouts (citation scan:`, one header line per group of the exact form `  c-one: recurrences=2 → core § Incident Policy (recurrences 2; guard bar 3)`, one indented line per non-fixed item containing its key and a bracketed status beginning `[uncited → reproduce in tests/fixtures/ before claiming` or `[in-flight: cited by`, no line containing the fixed item's key, a trailing `  hidden: 1 rows already cited by landed code or a done spec` line, and `  excluded: selfRepair=0 hostOwned=0`; over an empty fleet it SHALL print `owed: none — every plugin-blaming row on this machine is cited`; and WHEN run without `--owed` THE SYSTEM SHALL CONTINUE TO print a human render containing no `Owed —` line and byte-identical to the pre-change render for the same fleet → `owed.test.js`
- **AC-20260903-01-8**: WHEN `fleet-reader.js --json` runs THE SYSTEM SHALL print exactly the nine top-level keys `cleanByVia, cleanContradicted, driftCensus, escapes, gate08, legRecency, owed, population, replayDebt` (sorted) → the exhaustive key pin in `discovery.test.js`, updated in place and retagged
- **AC-20260903-01-9**: WHEN `fleet-reader.js --owed` runs over a synthetic fleet whose self-repair repo holds spec, test, and spec-feedback files THE SYSTEM SHALL leave every file in the fleet byte-identical (read-only, no cache, no stored derived value) → `owed.test.js`
- **AC-20260903-01-10**: WHEN `replay.js --record … --via driver` runs THE SYSTEM SHALL append a row with `via:"driver"`, write the artifact with `via:"driver"`, and print `recorded runId=<rp_…> via=driver`; WHEN `--via` is absent or `--via anything-else` THE SYSTEM SHALL stamp `via:"manual"` and print `via=manual` → `record-via.test.js`
- **AC-20260903-01-11**: WHEN `replay.js --stats` runs over a ledger holding one replay row with `via:"driver"`, two with `via:"manual"`, and one with no `via` THE SYSTEM SHALL print the line `by-via driver=1 manual=2 unknown=1` after the `catch-rate` line and before `per-class:`, and SHALL CONTINUE TO print the existing `total`, five bucket, and `catch-rate` lines unchanged → `record-via.test.js`
- **AC-20260903-01-12**: WHEN the review driver enters REPLAY with a selected target THE SYSTEM SHALL print a step body whose `--record` sentence contains `--review-run-id <id> --via driver`; and WHEN `--mark replay-recorded` is refused for a missing row THE SYSTEM SHALL print a remedy command containing `--via driver` → `review-driver.test.js`
- **AC-20260903-01-13**: WHEN `escape-row.js --append --root <dir> --row '<json>'` succeeds with `<dir>` = `/tmp/x/host-a` and a row `ts:"2026-09-03T10:00:00.000Z"`, `spec:"specs/new.md"`, `file:"new.js"` THE SYSTEM SHALL print `appended spec=specs/new.md file=new.js key=escape:host-a:2026-09-03T10:00:00.000Z:new.js` → `escape-row.test.js`
- **AC-20260903-01-14**: WHEN the shipped doctrine is read THE SYSTEM SHALL carry, in `spec/commands/escape.md` step 7, a bullet naming `fleet-reader --owed` and the phrase `no handoff prompt`, gated on `review-check` and `runtime-leg`; in `spec/commands/replay.md`, a Phase 4 `--record` invocation carrying `--via driver|manual` with the sentence that `driver` applies when the target came from the review driver's REPLAY step, and a Phase 5 `missed` bullet naming `fleet-reader --owed`; and `spec/.claude-plugin/plugin.json` `version` SHALL differ from `7.68.0` → `doctrine-pins.test.js`
- **AC-20260903-01-15**: WHEN `replay.js --record` is invoked with the full pre-change argument set and no `--via` THE SYSTEM SHALL append a row whose keys are exactly `class, files, legs, outcome, reviewRunId, runId, spec, stage, tokens, ts, via` (sorted) and whose `via` is `"manual"` → the key-set pin in `replay.test.js`, updated in place and retagged
- **AC-20260903-01-16**: WHEN `escape-row.js --append --root <dir> --row '<json>'` succeeds with a valid row THE SYSTEM SHALL CONTINUE TO exit 0 with exactly one row appended and a confirmation line matching `appended spec=<spec> file=<file>` → `escape-row.test.js` (the pre-existing append pin, retagged)
- **AC-20260903-01-17**: WHEN `replay.js --record` is invoked with the full pre-change argument set and no `--via` THE SYSTEM SHALL CONTINUE TO exit 0 appending exactly one ledger row and writing the evidence artifact → `replay.test.js` (the same pre-existing record test, retagged)

## Assumptions (escalation triggers)

- A1: `(repo, ts, file)` is unique across every fleet escape row — **executed check** (jq over 7 ledgers, 38 rows): 4 `(repo, ts)` collision groups totalling 12 rows (claude-plugins ×4, salon-os ×2, upwell ×4, zubu-menu ×2), zero `(repo, ts, file)` collisions. **if false:** the query reports the shared key on each colliding item (`sharedKey: true`), never a silent merge; STOP and ask before changing the key shape.
- A2: No host Gotchas entry carries a linkable escape-row key and no escape row cites a gotcha — **executed check** over prax, salon-os, upwell, zubu-menu, autopilot-hub § Gotchas (61 entries): three loose "escape" mentions, none keyed. **if false:** D2 stays; a link-aware resolver is a later spec.
- A3: The hand-rolled frontmatter parser reproduces the hand count on the real corpus — **executed check** (scratch script over all 7 files): prax 1/3/3/6 findings all stamped, salon-os 1 unstamped (`SALONOS-20260815-01`, `workflow-defect`), upwell 1 stamped, `20260823-gotchas-prune.md` parsed=false. **if false:** the parser is wrong, not the format — fix the parser against the real file.
- A4: `fs.readdirSync(dir, { recursive: true, withFileTypes: true })` returns entries with `parentPath` on the installed Node — **executed check**: `node v26.0.0`, 127 `.md` files under `specs/`, `parentPath` present. **if false:** walk with a hand-rolled recursive `readdirSync` — same contract.
- A5: The existing `escape-row` confirmation regex is unanchored, so the `key=` suffix cannot redden it — **executed check**: `tests/escape/escape-row.test.js:100` matches `/appended spec=specs\/new\.md file=new\.js/` with no `$`. **if false:** update that pin in place under AC-13, never weaken.
- A6: Adding `via` to the `--record` row reddens exactly one pin (`replay.test.js`'s key-set `deepStrictEqual`) and the `--json` ninth key reddens exactly one pin (`discovery.test.js`'s eight-key `deepStrictEqual`) — both named in the File Plan as in-place retags. **if false (another exhaustive pin reddens):** update it in place under the matching AC and record the deviation; never loosen.
- A7: The baseline is green — **executed check**: `node --test 'tests/fleet-reader/*.test.js' 'tests/replay/*.test.js' 'tests/escape/*.test.js'` → 105 tests, 105 pass, 0 fail. **if false:** a concurrent session's regression — stop and report, never repair inside this build.
- A8: Post-backfill precondition values (fleet reader, this session): escapes 38, `unclassed` bucket 7 (all seven carry an `unclassedReason`; zero rows need a class), amendments 24; `neverReplayed` 6 repos — bwm-booking, cctop, zubu-ai hold zero reviews (nothing to replay against); autopilot-hub (18 reviews), zubu-menu (41), hiwora (36, all pre-v7) are queued for one replay each (D14). Plugin-blaming escape rows 15 (11 in host repos + 4 in claude-plugins), ambiguous 9 (doctrine 5, none 4), host-owned 14 (enforcer 13, test 1); missed replay rows 9 across 4 repos; replay rows 36, none with `via`; spec-feedback briefs 7 across 3 hosts, unstamped findings 1. **if false:** numbers only inform the render's shape, never a decision — re-run and update this line.
- A9: Commit-time escape coverage (brief 23 open question) is derivable and low — **executed check** since 2026-08-17: fix-shaped commits prax 9, salon-os 16, upwell 15, zubu-menu 0, autopilot-hub 0 (40 total) vs escape rows `via:"commit"` in that window: 2 (both upwell). An upper-bound share ≈ 5%. Recorded as brief 25's subject (Rationale). **if false:** nothing in this spec depends on it.

## Rationale

**Why a ninth question and not a new command.** Brief 17 fixed the query list and said a
seventh needs a spec; brief 18 added the seventh that way, this spec adds the ninth (`owed`)
the same way. `--owed` is a render selector because the bare render already runs long and the
owed block is the one people will paste; `--json` keeps carrying everything so a reader with
`jq` needs no flag. A new command was rejected in the brief's over-engineering check.

**Why owner comes from `preventedBy` alone.** The brief hoped `doctrine`/`none` rows could be
resolved through the gotcha line they led to. Nothing links them: gotcha lines cite specs, not
rows, and rows cite nothing. Guessing by spec-path text would put a wrong owner on a row with
no error, which is exactly what core § Feedback Loop forbids. Those nine rows stay visible as
`ambiguous` — a human can still read them.

**Why the key carries the file.** Four real collision groups on `(repo, ts)` exist, one of
them (salon-os, 2026-08-27) holding two different classes with different owners. A shared key
would let one citation "fix" two defects. The file-qualified form is unique fleet-wide today and
is produced by the writer, so nobody types it.

**Why `tests/` and `spec/` are citation surfaces.** A direct fix under core § Incident Policy
has no spec; it lands as a test whose header cites the owner id (Test Rules already say so) or
as a doctrine line. The salon-os missed replay the brief names is already cited that way in the
reviewer agent contract, so it will show as fixed on day one — the brief's stated expectation.
`docs/` is excluded because a roadmap brief mentioning a run id is a plan, not a fix.

**Why self-repair rows are excluded but self-repair missed replays are not.** An escape in the
plugin repo is the plugin's own in-session incident, already visible in its own status. A
missed replay anywhere is a reviewer measurement — fleet evidence by definition.

**Why `via` defaults to `manual`.** Mirrors build/review's rule; a required flag would redden
every existing `--record` call for no gain. The review driver is the only caller that knows a
run is driver-handed, so it prints the flag in the command the session copies.

**What is fragile.** The frontmatter parser reads exactly one shape; a host that reformats its
brief (multi-line values, a different indent) silently yields `parsed:false` — visible in
`feedback.files`, never a crash. The citation scan is a substring test: a key quoted in a spec
that *discusses* the row without fixing it counts as a citation. Acceptable because the spec
must be `done` (or the mention must be in landed code) to count as fixed, and the row then
stops appearing only for a reader who chose to cite it.

**Discovered, not in scope.** (1) Commit-time escape coverage is derivable and low (A9) — the
next brief's subject (roadmap brief 25 staged this session). (2) Brief 23 was missing from
`docs/roadmap/00-overview.md`'s table — the row was added this session. (3) The sentence that
stops host sessions composing handoff prompts lives in JJ's global instructions, outside this
repo — a user step in the lock report. (4) `fleet-reader.js`'s header still says "six" and
"seven" questions in places — the worker rewrites the header to nine as part of its row.

**Collision closure (lock-time, advisory).** Literals leg for the retired "eight contracted" /
"exactly the eight" key-count wording: `tests/fleet-reader/discovery.test.js` is the planned
in-place retag (AC-8); `tests/collision-closure/collision-closure.test.js` names collision-closure's
own eight-key `--json` shape, unrelated to the fleet reader — waived. Paths leg `executes` hits:
every test that runs `fleet-reader.js`, `replay.js`, `escape-row.js`, or the review driver was
read; none anchors on the changed observables (`recorded runId=` is matched unanchored once, in a
comment; the bare human render and every non-`--record`/`--stats` replay mode are unchanged), so
no fixture repair is owed beyond the two named pins.

**Regression pins.** The bare human render, existing `--record` invocations, `--stats` lines,
and the `--append` confirmation line each carry a `SHALL CONTINUE TO` clause (AC-7, AC-11,
AC-13, AC-15).

## Canonical Delta

`docs/canonical/pipeline.md`, after the paragraph that names the fleet reader's `cleanByVia`
scoring: add — "The fleet reader's `owed` question (`--owed` for the human render) lists every
plugin-blaming row across this machine's checkouts: escape rows whose `preventedBy` is
`review-check` or `runtime-leg`, missed replay rows, and unstamped `docs/spec-feedback/`
findings, grouped by effective class with the joined recurrence count and a pointer to core
§ Incident Policy. Fixed-status is derived, never stored: an item's key (`escape:<repo>:<ts>:<file>`,
a replay run id, or a feedback finding id) cited in a landed test, a doctrine file, or a `done`
spec marks it fixed; a citation in an unfinished spec marks it in-flight. Host reports end with
the row key and nothing else — no handoff prompt is composed; the owed query is the consumer.
Replay rows carry `via` (`driver` when the review driver's REPLAY step handed the target,
`manual` otherwise), so `replay.js --stats`'s `by-via` line counts the manual path."
