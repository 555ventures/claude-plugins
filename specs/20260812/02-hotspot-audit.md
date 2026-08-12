---
date: 2026-08-12
status: done
diff_base: d0242d8d09751bc40cfeedeae546b127925ad6d4
risk: T3
open_markers: 0
area: spec-audit
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: 05
---

# /spec:audit — hotspot-targeted debt intake with a disposition ledger

## Goal

The pipeline gains its slow whole-repo judgment layer: a `/spec:audit` command that targets
the host's churn×complexity hotspots, hunts cross-spec smells over only those files, verifies
every finding against live code, and forces exactly one recorded fate per finding into a
disposition ledger the next audit reads first. Done means: the command ships, the hotspot
derivation exists as one deterministic script behind `spec-paths`, the ledger discipline
(including ≥2-recurrence promotion) is doctrine, release offers the audit at the milestone
seam, and all of it is test-pinned.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | New command `spec/commands/audit.md` (`/spec:audit`), **intended model: Opus** (user ruling this session), recorded as a named-exception bullet in `spec/doctrine/shared.md` § Model Placement alongside the `/spec:enforce` bullet; Sonnet does all reading and verifying | Judgment-adjacent work outside the build/review loop — the exact placement rationale enforce already carries; session-model rejected (audit quality would vary with the invoking model) |
| D2 | The fan-out is **inline parallel `Agent` dispatches** (`model: sonnet`) from the audit session — no new `wf-audit` workflow; reopen and promote to a workflow only if real audits exceed ~12 agents or need resume | The audit is a judgment organ over a small fan-out (top-10 hotspots); a sixth generated workflow is heavy surface the scale doesn't justify — plan-phase refuters are the precedent |
| D3 | Hotspot derivation is one new sole-derivation script `spec/scripts/hotspot.js` (`spec-paths hotspot`): score = `commits × (1 + complexity)` per file over a `--since <days>` window (default 90), ranked desc, ties broken by path ascending; flags `--root <dir> --since <days> --top <n> --json`; never duplicated anywhere else, `/spec:audit` its only consumer at first | Brief mandate: deterministic targeting, computable from git alone, sole-derivation per the spec-status/scope-reconcile convention |
| D4 | Complexity proxy = **indentation**: per non-blank line, `ceil(leadingWhitespaceColumns / 4)` with tab = 4 columns; file complexity = sum over lines; measured at HEAD | The CodeScene/Tornhill whitespace-complexity lineage the brief cites; dependency-free and language-agnostic; line-count rejected (rewards flat config files), cyclomatic rejected (needs per-language tooling — violates dependency-free) |
| D5 | Churn = count of commits touching the path in the window, from `git log --no-renames --since="<N> days ago" --numstat` — the `--no-renames` flag is REQUIRED (executed at plan time: default rename detection emits combined `{old => new}` rows — 15 in this repo's own history — which a naive parser silently drops; `--no-renames` splits them into ordinary add/delete rows); a numstat row that still fails the `<added>\t<deleted>\t<path>` shape exits 2 quoting the observed line — never silently skipped. Excluded from ranking: binary paths (numstat `-`), paths absent at HEAD, paths matching the host config's `pipelineOwnedPaths` globs (config read optional — absent config/field skips this), and the same additive pipeline-noise baseline scope-reconcile uses (`specs/**`, `.claude/spec-runs.jsonl`) via the shared lib (D17) | Deleted files can't be complexity-read; generated surfaces would rank as false hotspots exactly where the host declared them pipeline-owned; the rename shape was the refuters' top finding — silent churn loss on the exact derivation that targets the whole audit |
| D6 | Disposition ledger lives at **`docs/audit/debt-ledger.md`** in the host repo — co-located with brief 04's `docs/audit/advisory-findings.md`; one table row per adjudicated finding: `| Date | Class | Location | Finding | Fate | Reference |`; Fate enum literal: `refactor-brief(NN)` \| `rule-row` \| `enforcer` \| `rejected(<reason>)`; Class is a kebab-case slug — canonical four: `duplication`, `boundary-erosion`, `dead-seam`, `error-masking`; new slugs allowed | The `docs/audit/` home is already the host-side smell surface (spec 20260812/01); extending `spec/INTAKE.md`'s model rejected — that ledger ships with the plugin and carries a failing-test contract that host debt can't satisfy |
| D7 | Audit reads the ledger **first**: prior `rejected` rows suppress re-reporting the same finding (same class + same location file); recurrence promotion is mechanical — a class slug with ≥2 ledger rows dispositioned `refactor-brief` or `rule-row` (cumulative, all time) MUST be re-adjudicated for promotion to `enforcer` via `AskUserQuestion` before new findings are presented | Brief mandate: disposition-or-it-recurs; count-by-class from the ledger, never a memory exercise |
| D8 | Fates execute in-session: `refactor-brief(NN)` writes `docs/roadmap/NN-*.md` following the host roadmap's stated conventions (audit.md cites `/spec:plan`'s lock-step brief-writing home and `docs/roadmap/00-overview.md` rather than restating the recipe — drift-duplicate discipline), with NN = max existing NN + 1 (never fill gaps — appending at the end is also what keeps `spec-status`'s sequence-order skip anomaly quiet) and a Sequence-table row appended when the overview carries one; create `docs/roadmap/` + a minimal overview if absent. `rule-row` appends the user-approved clause to the host's pipeline rules file (exact text shown before writing); `enforcer` records the proposed `/spec:enforce` cell (stack × category from the reserved taxonomy) in the ledger Reference and the report offers `/spec:enforce` next; `rejected(<reason>)` records the reason — no fate is ever silent or deferred to memory | Every accepted finding gets exactly one durable landing; an un-executed fate is the recurrence the brief exists to kill |
| D9 | `/spec:audit` ingests `docs/audit/advisory-findings.md` accepted rows as seed candidates (they enter Phase 3 disposition like verified findings, marked `source: review-lens`); the audit never re-derives per-diff smells | Brief Out-of-scope: per-diff smells are brief 04's lens; ingesting its accepted rows is the declared seam |
| D10 | `spec/commands/release.md` Phase 4 report gains one optional closing line offering `/spec:audit` (milestone seam, drop-when-not-applicable like other slots); `spec-status --next` never suggests the audit — pinned negatively (the derivation source contains no audit suggestion) | Brief cadence: on demand plus offered at release; the audit is user-judgment spend, so the derivation script stays silent about it (same reasoning as release itself; release's own never-suggested rule is the pin precedent) |
| D11 | The audit **never edits host source and never gates**: findings become dispositions only; no pipeline stage consumes audit output as a blocking input; concretely: no `spec-state-gate.sh` case (its four-command list is pinned and unchanged), no `spec/hooks/hooks.json` change | Brief Out-of-scope, binding; restated in audit.md as a hard rule with a claims-grammar tag; the explicit no-hook-change line saves review a hunt |
| D12 | No `spec/templates/grounding-contract.md` edit and no new config knobs — the audit derives everything from git, the ledger, and existing config fields. Command registration is file-creation only (`spec/commands/audit.md` + frontmatter) — no plugin/marketplace manifest enumerates commands; the marketplace blurb's command list is deliberately not updated (it is already a non-tracking short description) | Avoids flipping every host's contract hash for a feature that needs no host grounding; `pipelineOwnedPaths` already exists; the registration/marketplace declaration answers the reviewer's obvious question in place |
| D13 | `spec/bin/spec-paths` gains the `hotspot` key, the `audit` case in `shared-for` (sections: `Host Grounding\|Model Placement\|Decisions\|Question Style\|Console Output Style`), and the usage line update — one row, all hunks together | New-surface checklist: script key + shared-for list; T3 surface, so the edit is single-row and test-pinned |
| D14 | `spec/.claude-plugin/plugin.json` bumps 6.57.0 → 6.58.0 (next-free-version rule if raced) with a description delta; `spec/doctrine/claims-baseline.json` regenerates via `node spec/scripts/claims-lint.js --update-baseline` after all doctrine edits (last doctrine step) | Behavior change → semver; doctrine line counts change → claims-baseline hunk required in the same diff (Review Checks) |
| D15 | New blocking-consequence claims in audit.md/shared.md/release.md prose carry `<!-- enforcedBy: tests/audit/audit.test.js -->` where that test pins them, `<!-- unenforced: host-runtime judgment -->` otherwise | Claims-registry grammar applies to every new hard/STOP/NEVER claim |
| D16 | `spec/doctrine/scaffold-ledger.md` gains one row for the audit mechanism (hotspot targeting + disposition ledger + recurrence promotion), class `advisory`: PROMOTE when an audit-dispositioned class is actually mechanized into an enforce cell or an audit-authored refactor brief lands as a `done` spec; RETIRE if 3 consecutive audits across hosts produce zero accepted findings | Every new mechanism needs a ledger row with a promote/retire condition |
| D17 | Extract scope-reconcile's private `globMatch` plus the additive pipeline-noise baseline globs into `spec/scripts/lib/glob-match.js` (the established `lib/` home); `scope-reconcile.js` requires it with behavior unchanged (existing `tests/review/scope-reconcile.test.js` stays green — the regression pin); `hotspot.js` is the second consumer | Two private implementations of `pipelineOwnedPaths` glob semantics is exactly the sole-derivation drift this repo's T3 list exists to prevent — both refuters flagged it independently |
| D18 | Debt-ledger integrity gets **no doctor check** at first — the ledger is advisory-organ state; D7's promotion counting is model-performed against the stated row format and its claim is tagged `<!-- unenforced: advisory ledger, model-read -->`; reopen and add a doctor check only if a malformed ledger actually breaks a promotion count in practice | Matches advisory-findings.md precedent (no check); a doctor check for an organ that never gates is scaffold ahead of evidence |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/commands/audit.md | CREATE | doctrine | The `/spec:audit` command per D1, D2, D6–D11: frontmatter (`description`, `argument-hint: [--since <days>] [--top <n>], optional`); setup (shared-for audit, config read, no-config → STOP `/spec:init`); Phase 0 ledger-first read + recurrence-promotion check (D7) + advisory-findings ingestion (D9); Phase 1 hotspot derivation via `node "$(spec-paths hotspot)" --root . --json` (flags passed through); Phase 2 inline Sonnet reader fan-out over selected hotspots hunting the four canonical smell classes, structured findings with file:line evidence; Phase 3 one Sonnet verifier per finding against live code — unverified findings dropped with a note, never presented; Phase 4 disposition via batched outcome-phrased `AskUserQuestion` (one fate per finding, D8 fate execution, ledger rows appended); report template (Console Output Style skeleton, offers `/spec:enforce` when any `enforcer` fate landed); Rules: never edits host source, never gates (D11's no-hook-change line), dismissed question → STOP. Doctrine `§` citations carry a resolvable file word (`shared § Model Placement`, never a bare `§ Name`) — citations-check.js scans this file automatically |
| spec/scripts/hotspot.js | CREATE | scripts | Sole derivation per D3–D5: header comment (usage; why — dated: the 2026-08-10 research session ratified churn×complexity as the one empirically backed debt prioritizer, brief 05 + this spec; what it does NOT do — no content judgment, no second consumer, no auto-fix, no rename-following; `Exit codes:` 0 = success incl. empty ranking, 2 = usage error / not a git repo / unreadable root / unparseable numstat row (quoted)); `#!/usr/bin/env node` + `'use strict'`; hand-rolled `--flag value` parsing; `git log --no-renames` per D5; glob exclusion via `lib/glob-match.js` (D17); human render (ranked table) + `--json` (`{"window":{"sinceDays":N},"hotspots":[{"path","commits","complexity","score"}]}`); errors name the remedy |
| spec/scripts/lib/glob-match.js | CREATE | scripts | D17: `globMatch(glob, filePath)` moved verbatim from scope-reconcile.js plus the additive pipeline-noise baseline list (`specs/**`, `.claude/spec-runs.jsonl`) as a named export; no behavior change to the matcher itself |
| spec/scripts/scope-reconcile.js | MODIFY | scripts | D17: delete the private `globMatch` + inline baseline, require them from `lib/glob-match.js`; zero behavior change — `tests/review/scope-reconcile.test.js` must stay green untouched (AC-10) |
| spec/bin/spec-paths | MODIFY | scripts | D13: `hotspot)` key, `audit)` shared-for case with the D13 section list, usage string extended — all hunks in this one row |
| tests/terminal-observable-acs.test.js | MODIFY | tests | Append `hotspot` AND the already-missing `citations-check` to the closed spec-paths key-set list (the pin is red today from 20260810/09 drift; this spec syncs it to the true key set — AC-11) |
| README.md | MODIFY | doctrine | One row in the Command reference table + one bullet in the "Keep it healthy (occasional)" list for `/spec:audit` — terse, per the single-high-value-README rule |
| spec/commands/release.md | MODIFY | doctrine | D10: the Phase 4 report shape gains one optional line `🧹 next (optional): /spec:audit — hotspot debt audit for this milestone` (drop-when-empty semantics stated like the other slots) |
| spec/doctrine/shared.md | MODIFY | doctrine | D1: one named-exception bullet in § Model Placement — `/spec:audit` runs on Opus, same rationale class as `/spec:enforce`; no other shared.md edits |
| spec/doctrine/scaffold-ledger.md | MODIFY | doctrine | D16 row (advisory class, promote/retire as stated) |
| spec/doctrine/claims-baseline.json | MODIFY | doctrine | D14: regenerate via `node spec/scripts/claims-lint.js --update-baseline` after all doctrine edits land (last doctrine step) |
| tests/audit/audit.test.js | CREATE | tests | AC-20260812-02-1 … AC-20260812-02-9 (pipeline-authored tests live under `tests/<scope>/`; gate resolves `{testDirs}` to `'tests/audit/*.test.js'`; AC-10 is carried by the untouched `tests/review/scope-reconcile.test.js`, AC-11 by the `tests/terminal-observable-acs.test.js` MODIFY row) |
| spec/.claude-plugin/plugin.json | MODIFY | other | D14: 6.57.0 → 6.58.0 (next-free rule on race); description delta = the changelog line for the audit organ |

No workflow source is touched — no codegen step this spec (the `build-workflows.js --check` gate leg runs unchanged).

## Contracts

`hotspot.js --json` output (the only machine format; the human render is the only other):

```jsonc
{
  "window": { "sinceDays": 90 },          // the resolved --since value
  "hotspots": [                            // ranked desc by score; ties → path ascending
    { "path": "spec/scripts/verdict.js",   // repo-root-relative
      "commits": 14,                       // commits touching path in window
      "complexity": 213,                   // D4 indentation sum at HEAD
      "score": 2996 }                      // commits * (1 + complexity)
  ]
}
```

Debt-ledger row (host-side `docs/audit/debt-ledger.md`, created on first append with a header
comment naming this contract):

```
| Date | Class | Location | Finding | Fate | Reference |
| 2026-08-12 | duplication | src/a.ts:40 + src/b.ts:88 | <one-line claim> | refactor-brief(07) | docs/roadmap/07-dedupe-parsers.md |
```

Fate enum (literal, closed): `refactor-brief(NN)` | `rule-row` | `enforcer` | `rejected(<reason>)`.
Canonical class slugs: `duplication` | `boundary-erosion` | `dead-seam` | `error-masking`
(open set — new kebab-case slugs allowed; promotion counts by exact slug).

## Behavior

- **Phase 0 (ledger first):** read `docs/audit/debt-ledger.md` (absent = first audit, empty
  ledger). Suppress candidate findings whose class + location file match a prior `rejected`
  row. Count rows per class slug across fates `refactor-brief`/`rule-row`; any slug at ≥2
  triggers the promotion question (D7) before new findings are presented. Read
  `docs/audit/advisory-findings.md` accepted rows as seed candidates (D9).
- **Phase 1 (target):** run the hotspot script; present the top-N table (default 10) with one
  line of framing; the audit reads only these files (readers may pull directly-referenced
  neighbors for verification context, never for new findings).
- **Phase 2 (hunt):** parallel Sonnet readers (one per hotspot file, or per directory when
  hotspots cluster; cap ~10 agents) hunting the four canonical classes; each finding returns
  class, locations (file:line), and a one-line claim with quoted evidence.
- **Phase 3 (verify):** one Sonnet verifier per finding, blind to the reader's reasoning,
  checks the claim against live code (both locations exist, the duplication/masking is real,
  the seam is genuinely dead). Failed verification → dropped, one summary line, never shown
  as a finding.
- **Phase 4 (disposition):** surviving findings presented in batched `AskUserQuestion` calls
  (≤4 findings per call, one question each, outcome-phrased options for the four fates).
  Every answer executes immediately per D8 and appends its ledger row. Dismissed → STOP
  (rows already written stay written).
- **Report:** Console Output Style skeleton — outcome line (findings/dispositions counts),
  fate lines, 📦 ledger path, `Next:` `/spec:enforce` iff any `enforcer` fate landed, else
  nothing to suggest.

## Acceptance Criteria

- **AC-20260812-02-1**: WHEN `hotspot.js --json --since 365 --top 5` runs against a synthetic
  git repo (built in `tmpdir()`) where file `hot.js` has 3 commits in-window and body lines
  indented 8, 4, and 0 spaces (complexity = 2+1+0 = 3 per D4 → score 3×(1+3)=12) and file
  `cold.js` has 1 commit and complexity 1 (score 2), THE SYSTEM SHALL exit 0 and print JSON
  ranking `hot.js` before `cold.js` with exactly those `commits`/`complexity`/`score` values →
  tests/audit/audit.test.js
- **AC-20260812-02-2**: WHEN `hotspot.js` runs with `--root` pointing at a directory that is
  not a git repository THE SYSTEM SHALL exit 2 with a message naming the remedy (run inside a
  git repo / pass a repo root) → tests/audit/audit.test.js
- **AC-20260812-02-3**: WHEN the synthetic repo's `.claude/spec.config.json` declares
  `"pipelineOwnedPaths": ["gen/*.js"]` and `gen/wf-x.js` has in-window commits THE SYSTEM
  SHALL omit `gen/wf-x.js` from the ranking; WHEN the config file is absent THE SYSTEM SHALL
  still rank normally (exclusion silently skipped, exit 0) → tests/audit/audit.test.js
- **AC-20260812-02-4**: WHEN a file with in-window commits does not exist at HEAD (deleted)
  THE SYSTEM SHALL omit it from the ranking rather than erroring → tests/audit/audit.test.js
- **AC-20260812-02-5**: WHEN `spec/commands/audit.md` is read THE SYSTEM SHALL contain the
  load-bearing doctrine as literal phrases: the closed fate enum members `refactor-brief(NN)`,
  `rule-row`, `enforcer`, `rejected(`; the ledger path `docs/audit/debt-ledger.md`; a
  ledger-read-**first** rule; the ≥2-per-class promotion rule; the advisory-findings ingestion
  seam (`docs/audit/advisory-findings.md`); and the hard rules that the audit never edits host
  source and never gates any pipeline stage (regex pins on load-bearing phrases, not full
  sentences) → tests/audit/audit.test.js
- **AC-20260812-02-6**: WHEN `spec-paths hotspot` runs THE SYSTEM SHALL print the absolute
  path to `spec/scripts/hotspot.js`; WHEN `spec-paths shared-for audit` runs THE SYSTEM
  SHALL emit the `## Model Placement` section (and not, e.g., `## Rule Enforcement`); and
  WHEN the no-arg usage error prints THE SYSTEM SHALL list `hotspot` in the usage line (the
  components-check precedent) → tests/audit/audit.test.js
- **AC-20260812-02-7**: WHEN `spec/commands/release.md` and `spec/doctrine/shared.md` are read
  THE SYSTEM SHALL find the release Phase 4 report's optional `/spec:audit` offer line and a
  § Model Placement exception bullet naming `/spec:audit` on Opus; and WHEN
  `spec/scripts/spec-status.js` is read THE SYSTEM SHALL find no `/spec:audit` suggestion in
  it (D10's negative pin — the derivation never routes to the audit) →
  tests/audit/audit.test.js
- **AC-20260812-02-8**: WHEN `spec-paths spec-status` runs after this spec's `spec-paths`
  edit THE SYSTEM SHALL CONTINUE TO print the absolute path to `spec/scripts/spec-status.js`
  (pre-existing keys survive the case-statement edit; green pre-change by design) →
  tests/audit/audit.test.js
- **AC-20260812-02-9**: WHEN the synthetic repo renames a committed file (`git mv old.js
  new.js` + commit, content modified in the same window under both names) THE SYSTEM SHALL
  count the rename commit's churn as ordinary add/delete rows (the `--no-renames` split —
  e.g. `new.js` carries the rename commit in its `commits` count) and exit 0 — never drop
  the commit or emit a `{old => new}` parse failure → tests/audit/audit.test.js
- **AC-20260812-02-10**: WHEN `node --test tests/review/scope-reconcile.test.js` runs after
  the D17 extraction THE SYSTEM SHALL CONTINUE TO pass every existing assertion with the
  test file untouched (the extraction is behavior-neutral; green pre-change by design) →
  tests/review/scope-reconcile.test.js
- **AC-20260812-02-11**: WHEN `tests/terminal-observable-acs.test.js`'s spec-paths key-set
  assertion runs after this spec THE SYSTEM SHALL pass with the expected list containing
  both `hotspot` and `citations-check` (the pin is red today from 20260810/09 drift — this
  spec is the sanctioned sync; red→green here is the implementation of this AC, not a
  weakened assertion) → tests/terminal-observable-acs.test.js

## Assumptions (escalation triggers)

- A1: `git log --no-renames --since="<N> days ago" --numstat --format=<sentinel>` yields
  parseable `<added>\t<deleted>\t<path>` rows — **executed at plan time against this repo**
  (2026-08-12, two independent executions): the plain form printed clean rows over
  `spec/scripts/`, and the refuters demonstrated that WITHOUT `--no-renames` git's default
  rename detection emits combined `{old => new}` rows (15 in this repo's history; e.g.
  `spec/{commands => doctrine}/shared.md`) while `--no-renames` verifiably splits them back
  into ordinary rows — **if a numstat row still fails the shape on a host:** the script
  exits 2 quoting the observed line; escalate, never guess-parse (the deleted-file exclusion
  branch never swallows a malformed row — D5).
- A2: `.claude/spec.config.json` may be absent where the script runs (audit requires it, but
  the script is invocable standalone) — **if absent:** skip the `pipelineOwnedPaths`
  exclusion silently (AC-3 pins this); never require config.
- A3: `spec-paths shared-for` matches section names by prefix regex against `## ` headings —
  the `audit` case's five section names all exist verbatim in `spec/doctrine/shared.md`
  (verified: all five are current headings) — **if a heading renames:** the awk filter drops
  it silently; the AC-6 pin catches the Model Placement case.
- A4: The claims corpus is `spec/commands`, `spec/doctrine`, `spec/agents` only — audit.md
  (CREATE) and the shared.md/release.md edits all require the baseline regen; hotspot.js and
  spec-paths do not — **if claims-lint reports otherwise:** run `--check` and follow its
  remedy output.
- A5: 6.58.0 is free at build time — **if taken (concurrent session race):** bump to the next
  free version with the same changelog paragraph and log the deviation (pipeline rules
  § Gotchas version-race entry).
- A6: `docs/audit/advisory-findings.md` may not exist in a host (lens shipped 6.57.0, hosts
  may predate it or have zero accepted rows) — **if absent:** Phase 0 ingestion is a no-op,
  never an error.
- A7: `tests/terminal-observable-acs.test.js`'s closed spec-paths key-set pin is red at HEAD
  (missing `citations-check`, 20260810/09 drift) and this spec's key-list sync (AC-11) turns
  it green — **if other keys have drifted by build time:** sync the list to the true key set
  scraped from the live file and note the extras in the deviations sidecar.
- A8: `scope-reconcile.js`'s `globMatch` has no consumers outside its own file and its
  baseline globs are the literal additive pair — **if a third in-file consumer or a
  different baseline shape exists at build time:** extract exactly what exists; never change
  match semantics during the move.

## Rationale

The brief's three open questions resolved: **complexity proxy = indentation** because the
brief's own grounding (CodeScene/Tornhill) is the indentation-proxy lineage — cyclomatic
needs per-language tooling (violates dependency-free) and raw line count rewards flat
generated/config files; **ledger home = `docs/audit/debt-ledger.md`** because spec
20260812/01 already made `docs/audit/` the host-side smell surface and the audit ingests
that lens's log — extending `spec/INTAKE.md` was rejected since that ledger ships with the
plugin and its authoring contract (failing-test-first) cannot bind host debt; **release
feed = separate surface** because release's feedback brief is plugin-upstream signal by
definition and audit findings are host-owned debt.

The seat is Opus by user ruling (this session), matching enforce's judgment-adjacent
placement; Fable was declined as recurring spend too heavy for a per-milestone organ, and
session-model was declined because audit quality would vary invisibly with the invoking
model. No `wf-audit` workflow: the fan-out is ~10 readers + per-finding verifiers, inside
inline-dispatch scale; the workflow route reopens if real audits exceed ~12 agents or need
resume. No grounding-contract edit (D12) — deliberately, so this ships without flipping
every host's contract hash; the script degrades gracefully without config.

Fragile spots to watch: the ledger's Fate/Class literals are load-bearing for promotion
counting (AC-5 pins the enum in doctrine; the ledger contract block is the format's single
home), and the spec-paths edit touches a T3 surface — AC-6/AC-8 pin new and pre-existing
keys respectively.

Adversarial-check adjudication (two refuters + one blind-spot sweep, 2026-08-12): **fixed** —
(1) both refuters independently executed the numstat rename-row falsification (git's default
rename detection emits combined `{old => new}` rows; 15 in this repo's history) → D5 now
mandates `--no-renames` plus a shape-check that exits 2 instead of silently dropping churn,
pinned by AC-9; (2) both flagged a second private `pipelineOwnedPaths` glob matcher → D17
extracts `globMatch` + the baseline globs to `lib/glob-match.js` with a CONTINUE-TO pin
(AC-10); (3) the closed spec-paths key-set pin in `tests/terminal-observable-acs.test.js` is
already red (missing `citations-check`) and would go redder → File Plan row + AC-11 sync it;
(4) usage-line pin precedent → folded into AC-6; (5) README command reference + occasional
list rows added; (6) D8 now defers to plan.md/00-overview.md as the brief-recipe homes, pins
NN = max+1 with a Sequence-table append (avoiding spec-status's sequence-skip anomaly);
(7) audit.md's `§` citations must carry a file word (citations-check grammar) — File Plan row
states it; (8) explicit no-state-gate/no-hooks declaration paired with D11; (9) hotspot.js
header cites the dated 2026-08-10 research session (the convention wants a dated why; there
is no incident — this is proactive tooling, stated as such). **Rejected** — marketplace.json
description update (already a non-tracking blurb; declared in D12 instead of edited);
a doctor check for debt-ledger integrity (D18: advisory organ, scaffold ahead of evidence —
reopen on a real malformed-ledger promotion miss); a negative test that spec-status never
suggests the audit was DOWNGRADED to a cheap source regex folded into AC-7 rather than a
standalone behavioral pin. The merge-commit numstat blind spot (edits made only in
conflict-resolution commits are invisible to `git log --numstat`) is accepted as a known
narrow under-count — feature commits are walked individually; not worth `-m` row doubling.

**Build deviation (folded at review, 2026-08-12):** AC-6's "no-arg usage error" was a stale
assumption — `spec-paths` with no args prints the plugin root and exits 0; the usage line
fires on an unknown key (exit 1). The test triggers it via an unknown key, matching the cited
components-check precedent; the pinned behavior (usage line lists `hotspot`) is unchanged.
One-off spec-authoring slip, absorbed here.

## Canonical Delta

`docs/canonical/` gains no entry — the audit's canonical home is `spec/commands/audit.md`
itself plus the scaffold-ledger row; this repo's canonical docs cover cross-cutting
disciplines (intake), and the audit's discipline is fully stated in its command doc. If a
second consumer of the hotspot derivation ever appears, that is the moment an
`docs/canonical/audit.md` entry (sole-derivation registry) becomes warranted — note recorded
here so review doesn't hunt for a missing delta.
