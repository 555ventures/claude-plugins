---
date: 2026-11-03
status: implementing
tier: critical           # adds a key to spec/bin/spec-paths (rules § Risk Tiers: "a wrong key breaks commands silently")
area: build-stage
breaking: false
depends_on: []
brief: n/a
spiked: 2026-11-03
open_markers: 0
diff_base: 4e19cf5b20dabd3019d013a40435546a0426ac27
---

# The file decides, not the tier

## Goal

A gate failure in a file outside the File Plan is triaged by that file's own risk, never by the
spec's tier. Today stage-build's `blocked` returns rule asks the user whenever the spec is
`tier: critical`, so a critical spec stops for a test file whose own comment says "update the
expected set here in place" — seven recorded asks, seven answers of "add to scope". After this
spec a deterministic script answers the question from machine facts: a file named by the host's
§ Risk Tiers bullets or by `orchestratorOnly` earns the question; every other file is added to
scope with a printed auto-pick and a `[auto: out-of-plan-triage]` Decisions row the reviewer
checks. The build driver's REPAIR step and the doctrine both point at the script.

## Users

- The maintainer running a critical-tier build (in a lane or a session): When the gate reds on a
  test outside the File Plan that merely pins the list my spec extends, I want the build to add
  it to scope and move on, so I can answer only the questions whose answer depends on the file.
  First run / empty: a host whose § Risk Tiers section names no repo path sees every out-of-plan
  file auto-added and nothing asked.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | New `spec/scripts/out-of-plan-triage.js --spec <path> --file <repo-relative path> [--root <dir>] [--gate-line "<text>"] [--json]`. It reads the host config (`lib/host-config.js` `readConfig`/`readPipelineRules`), slices `## Risk Tiers` with `lib/spec-sections.js` `extractSection`, and takes as **surfaces** every backtick span on a bullet line of that section (a line opening `- ` or `* `, plus its indented continuation lines) that contains `/`, no whitespace and no leading `-`; a span with `*`, `?` or `[` matches via `lib/glob-match.js` `globMatch`, a span ending `/` matches by prefix, any other span matches exactly (a leading `./` is stripped). The config's `orchestratorOnly` globs are surfaces too. Verdict: the file is a concrete File Plan path or matches a glob row (`lib/file-plan.js` `parseFilePlanRows`) → `in-plan`, exit 0; it matches a surface → `ask`, exit 1; otherwise `auto`, exit 0. The spec's `tier` is read into `--json` and never changes the verdict. Config, rules file or `## Risk Tiers` section missing, or a usage error → exit 2 naming `/spec:doctor` (or the usage line). Output goes through `lib/sync-write.js` `writeOut`. (AC-20261103-07-1, AC-20261103-07-2, AC-20261103-07-5) | CODEOWNERS asks for review only on owned paths; the host already declares its risky paths in § Risk Tiers bullets (the grounding contract writes `riskTiers` there as bullets), so the file's risk is a path match, not a judgment. The spec's tier was the wrong key: it describes the spec's own work, not the collateral file. |
| D2 | On `auto` the script prints, in order: `📌 Auto-picked add to scope — <file> (veto anytime)`; `triage: auto — <file> is not a § Risk Tiers surface; <strength>`; `File Plan row:` then `\| <file> \| MODIFY \| <layer> \| gate line — updated in place, never weakened [auto: out-of-plan-triage] \|`; `Decisions row:` then `\| D<n> \| Scope widened at build: \`<file>\` enters the File Plan<gate clause>; the pin is updated in place, never weakened. [auto: out-of-plan-triage — <reason>] [no-ac: the gate line is the oracle] \| The file's risk decides, never the spec's tier. \|`. `<strength>` is `its source names File Plan row <p1>, <p2> — an in-place update of a pin on planned work` when the file is test-classified (`lib/file-shapes.js` `isTestClassified` over the host's `fileShapes`) and its text contains a concrete File Plan path as a substring; `its source names no File Plan path` for a test naming none; `not a test file` otherwise. `<layer>` is `tests` for a test-classified file, else the Layer of the File Plan row sharing the longest leading directory run (≥1 segment) with the file (first row on a tie), else `other`. `D<n>` is one past the highest `D\d+` id in `## Decisions`. `<gate clause>` is ` (gate line: <--gate-line text>)` when given, empty otherwise. `<reason>` repeats the strength. On `ask` it prints `triage: ask — <file> is a § Risk Tiers surface (\`<span>\`) — ask: add to scope / file separately / pause` (or `matches orchestratorOnly \`<glob>\``); on `in-plan`, `triage: in-plan — <file> is already a File Plan row; dispatch its owning worker`. `--json` prints one object `{verdict, file, tier, surface, namesPlanned, layer, nextDecision, reason}` and nothing else. (AC-20261103-07-1, AC-20261103-07-2, AC-20261103-07-3, AC-20261103-07-4) | The session pastes rows, never composes them; the `[auto:]` tag is what the reviewer greps. The strength line turns the test's own "update in place" comment into a machine fact (the test names the planned file it pins). |
| D3 | `spec/doctrine/stages/stage-build.md` § `blocked` returns: the sentence beginning "A gate failure implicating a file outside the File Plan widens scope" through "§ Risk Tiers trigger." is replaced by: the failure is triaged by the file's risk, never the spec's tier — run `node "$(spec-paths out-of-plan-triage)" --spec <spec> --file <path>`; exit 0 widens scope (paste the File Plan row and the `[auto: out-of-plan-triage]` Decisions row it prints, naming the gate line, then dispatch the owning worker; the script prints the `📌 Auto-picked add to scope — <file> (veto anytime)` line); exit 1 means the file is a host § Risk Tiers surface or an `orchestratorOnly` path — ask (add to scope / file separately / pause). The phrase `tier: critical` leaves this section. The `if false` fallback sentence and the ONE-`AskUserQuestion` batching sentence stay as they are. [no-ac: wording — read by review; the call site is pinned by the entrypoints manifest row in D5] | The doctrine sentence was the defect; the script is now its mechanism and the prose only names it. |
| D4 | `spec/scripts/spec-build-driver.js` `repairStepBody()` prints, after the orchestrator-owned line (when present) and before "Route each failing file", the line `a failing file outside the File Plan: node "$(spec-paths out-of-plan-triage)" --spec <specPath> --file <path> — exit 0 prints the two rows to paste, exit 1 asks (add to scope / file separately / pause)` with the driver's own spec path argument substituted for `<specPath>` and the literal text `<path>` kept. No other REPAIR line changes. (AC-20261103-07-6) | The REPAIR step is what a lane reads at the moment the gate reds; a rule only in doctrine was followed to the letter today and still relayed the question. |
| D5 | `spec/bin/spec-paths` gains the arm `out-of-plan-triage) echo "$ROOT/scripts/out-of-plan-triage.js" ;;` beside `scope-reconcile)` and the usage line names `out-of-plan-triage` after `scope-reconcile`. `spec/entrypoints.json` gains the row `"spec/scripts/out-of-plan-triage.js": {"entryPoints": ["spec/doctrine/stages/stage-build.md", "spec/scripts/spec-build-driver.js", "spec/agents/reviewer.md"]}`. (AC-20261103-07-7, AC-20261103-07-8) | Every bundled script resolves through a key (rules § Planning new-surface checklist); the forward check needs every caller declared. |
| D6 | `spec/agents/reviewer.md` § The promise sweep gains one residue bullet: a Decisions row tagged `[auto: out-of-plan-triage]` is a scope widening the build took without asking — re-run `node "$(spec-paths out-of-plan-triage)" --spec <spec> --file <that file>`; exit 1 is **hard** (the file is a § Risk Tiers surface or `orchestratorOnly` path, so the triage was bypassed), and the named file's diff must be an in-place update of the pin — a weakened assertion stays hard under the host's § Review Checks. [no-ac: wording — read by review; the call site is pinned by the entrypoints manifest row in D5] | The auto-pick is safe only because a fresh reader re-derives it; the reviewer is that reader. |
| D7 | `spec/.claude-plugin/plugin.json` is bumped with `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"`. (AC-20261103-07-8) | Doctrine and script changes ship as one version; the gate's `--check` is the oracle. |
| D8 | The script decides at build time only. It is not a lock-time guard: `collision-closure.js` stays advisory and the exhaustive-pin class keeps its one review waive line (rules § Gotchas: "do not re-propose one"); `question-style-gate.js` is untouched. [no-ac: a non-change — nothing to test] | The recorded rejection was of a lock-time guard that predicts collisions; this script reacts to an observed gate line, which is the only moment the file is known. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/out-of-plan-triage.js | CREATE | scripts | D1, D2: verdict from § Risk Tiers bullet spans + `orchestratorOnly`; prints the two rows; `--json`; `writeOut`; header per rules § Worker Rules; no dependency change |
| spec/doctrine/stages/stage-build.md | MODIFY | doctrine | D3: § `blocked` returns — the out-of-plan sentence names the script; `tier: critical` leaves the section |
| spec/scripts/spec-build-driver.js | MODIFY | scripts | D4: one REPAIR line naming `spec-paths out-of-plan-triage` |
| spec/bin/spec-paths | MODIFY | scripts | D5: `out-of-plan-triage)` arm and usage entry |
| spec/entrypoints.json | MODIFY | other | D5: row for `spec/scripts/out-of-plan-triage.js` with its three entry points |
| spec/agents/reviewer.md | MODIFY | doctrine | D6: `[auto: out-of-plan-triage]` residue bullet |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D7: `node scripts/plugin-bump.js --bump --plugin spec --changelog "…"` |
| tests/build/out-of-plan-triage.test.js | CREATE | tests | AC-20261103-07-1, AC-20261103-07-2, AC-20261103-07-3, AC-20261103-07-4, AC-20261103-07-5 |
| tests/build/build-driver-repair.test.js | MODIFY | tests | AC-20261103-07-6 |
| tests/spec-paths.test.js | MODIFY | tests | AC-20261103-07-7 |

## Contracts

```
# spec/scripts/out-of-plan-triage.js
usage: out-of-plan-triage.js --spec <path> --file <repo-relative path> [--root <dir>] [--gate-line "<text>"] [--json]
exit 0 = auto (scope widened: rows printed) or in-plan (nothing to add)
exit 1 = ask — the file is a § Risk Tiers surface or an orchestratorOnly path
exit 2 = usage (missing --spec/--file, unreadable spec), or config / pipelineRules / `## Risk Tiers` missing (remedy: /spec:doctor)

surfaces = backtick spans on `## Risk Tiers` BULLET lines (`- `/`* ` + indented continuations)
           where span.includes('/') && !/\s/.test(span) && !span.startsWith('-'), leading './' stripped
         + config.orchestratorOnly globs
match    = /[*?[]/.test(span) ? globMatch(span, file) : span.endsWith('/') ? file.startsWith(span) : file === span
in-plan  = concrete File Plan path === file, or a glob row globMatch(row, file)   (lib/file-plan.js parseFilePlanRows)
layer    = test-classified ? 'tests' : Layer of the row with the longest shared leading directory run (>=1 segment; first wins) : 'other'
namesPlanned = test-classified ? concrete File Plan paths occurring as substrings of the file's text : []
nextDecision = 'D' + (max D\d+ in ## Decisions + 1)      (D1 when the table is empty or absent)

stdout, auto:
  📌 Auto-picked add to scope — <file> (veto anytime)
  triage: auto — <file> is not a § Risk Tiers surface; <strength>
  File Plan row:
  | <file> | MODIFY | <layer> | gate line — updated in place, never weakened [auto: out-of-plan-triage] |
  Decisions row:
  | D<n> | Scope widened at build: `<file>` enters the File Plan<gate clause>; the pin is updated in place, never weakened. [auto: out-of-plan-triage — <reason>] [no-ac: the gate line is the oracle] | The file's risk decides, never the spec's tier. |
stdout, ask:
  triage: ask — <file> is a § Risk Tiers surface (`<span>`) — ask: add to scope / file separately / pause
  triage: ask — <file> matches orchestratorOnly `<glob>` — ask: add to scope / file separately / pause
stdout, in-plan:
  triage: in-plan — <file> is already a File Plan row; dispatch its owning worker
--json (sole output): {"verdict":"auto|ask|in-plan","file":"<file>","tier":"<frontmatter tier or ''>",
  "surface":null|"<span>"|"orchestratorOnly <glob>","namesPlanned":[…],"layer":"<layer>"|null,
  "nextDecision":"D<n>"|null,"reason":"<strength or ask reason>"}
  (layer and nextDecision are null unless verdict is auto)

# spec-build-driver.js REPAIR body — one added line, between the orchestrator-owned line and "Route each failing file"
a failing file outside the File Plan: node "$(spec-paths out-of-plan-triage)" --spec <specPath> --file <path> — exit 0 prints the two rows to paste, exit 1 asks (add to scope / file separately / pause)

# spec/entrypoints.json
"spec/scripts/out-of-plan-triage.js": { "entryPoints": ["spec/doctrine/stages/stage-build.md", "spec/scripts/spec-build-driver.js", "spec/agents/reviewer.md"] }
```

## Behavior

- Today's case, replayed: spec 20261103/03 (`tier: critical`, File Plan row `spec/hooks/hooks.json`)
  reds `tests/consistency/entrypoints.test.js`, whose text contains `spec/hooks/hooks.json`.
  `out-of-plan-triage.js --spec specs/20261103/03-workers-never-run-git.md --file tests/consistency/entrypoints.test.js`
  → exit 0, `📌 Auto-picked add to scope — tests/consistency/entrypoints.test.js (veto anytime)`,
  strength `its source names File Plan row spec/scripts/spec-build-driver.js, spec/hooks/hooks.json, spec/doctrine/core.md, spec/entrypoints.json — an in-place update of a pin on planned work`,
  layer `tests`, `D<n>` one past the spec's last row. No question reaches the user.
- The same spec reds `spec/scripts/spec-state-gate.sh` (not in its File Plan): the file is a
  § Risk Tiers bullet span → exit 1, the session asks (add to scope / file separately / pause).
- A `tier: standard` spec reds `spec/bin/spec-paths` out of plan → exit 1 all the same: the
  file's risk, not the spec's tier.
- A host whose § Risk Tiers holds only prose bullets (no backtick path) and no `orchestratorOnly`:
  every out-of-plan file is `auto`. A trigger that exists only as prose ("boot-path code") never
  matches — the host names the path in a bullet to make it ask; the script's header says so.
- The session's flow at REPAIR: read the gate log, name the failing file, run the printed
  command, paste the two rows into the spec (the driver's `decision-added-at-build` incident
  records the row as it does any build-time Decision), dispatch the layer's worker, `--mark
  repair-applied`. The reviewer later re-runs the command on every `[auto: out-of-plan-triage]`
  row (D6).

## Acceptance Criteria

- **AC-20261103-07-1**: WHEN a synthetic host under `--root <r>` holds `.claude/spec.config.json` (`pipelineRules: ".claude/rules/spec-pipeline.md"`), a rules file whose `## Risk Tiers` section is `- **Hook surfaces**: \`hooks/hooks.json\`,\n  \`scripts/gate.sh\` — a broken hook blocks every session.\n- **\`bin/\`** — launchers.\n\nStandard-tier-shaped direct work: edits to \`scripts/patterns.sh\`.`, a spec `spec.md` with `tier: critical`, a `## Decisions` table with rows `D1` and `D2`, and a File Plan with rows `| hooks/hooks.json | MODIFY | other | … |` and `| src/a.js | MODIFY | scripts | … |`, and `tests/pins.test.js` whose text contains `hooks/hooks.json` THE SYSTEM SHALL, for `out-of-plan-triage.js --spec spec.md --file tests/pins.test.js --root <r> --gate-line "pins the hook list"`, exit 0 and print exactly these lines in order: `📌 Auto-picked add to scope — tests/pins.test.js (veto anytime)`, `triage: auto — tests/pins.test.js is not a § Risk Tiers surface; its source names File Plan row hooks/hooks.json — an in-place update of a pin on planned work`, `File Plan row:`, `| tests/pins.test.js | MODIFY | tests | gate line — updated in place, never weakened [auto: out-of-plan-triage] |`, `Decisions row:`, and a line starting `| D3 | Scope widened at build: \`tests/pins.test.js\` enters the File Plan (gate line: pins the hook list); the pin is updated in place, never weakened. [auto: out-of-plan-triage — its source names File Plan row hooks/hooks.json` and containing `[no-ac: the gate line is the oracle]`; and with `--json` print only `{"verdict":"auto","file":"tests/pins.test.js","tier":"critical","surface":null,"namesPlanned":["hooks/hooks.json"],"layer":"tests","nextDecision":"D3","reason":"its source names File Plan row hooks/hooks.json — an in-place update of a pin on planned work"}` → writes tests/build/out-of-plan-triage.test.js
- **AC-20261103-07-2**: WHEN the same host's spec reads `tier: standard` THE SYSTEM SHALL, for `--file scripts/gate.sh`, exit 1 and print `triage: ask — scripts/gate.sh is a § Risk Tiers surface (\`scripts/gate.sh\`) — ask: add to scope / file separately / pause`; for `--file bin/tool`, exit 1 naming `(\`bin/\`)`; for `--file scripts/patterns.sh` (named only in the non-bullet paragraph), exit 0 with verdict `auto`; and WHEN the config adds `"orchestratorOnly": ["ops/**"]` THE SYSTEM SHALL, for `--file ops/deploy.sh`, exit 1 and print `triage: ask — ops/deploy.sh matches orchestratorOnly \`ops/**\` — ask: add to scope / file separately / pause`, its `--json` carrying `"verdict":"ask","surface":"orchestratorOnly ops/**","layer":null,"nextDecision":null` → writes tests/build/out-of-plan-triage.test.js
- **AC-20261103-07-3**: WHEN `tests/other.test.js` exists whose text names no File Plan path THE SYSTEM SHALL, for `--file tests/other.test.js`, exit 0 with the line `triage: auto — tests/other.test.js is not a § Risk Tiers surface; its source names no File Plan path` and `--json` `"namesPlanned":[]`; and WHEN `--file tests/missing.test.js` names a file absent from disk THE SYSTEM SHALL still exit 0 with `"namesPlanned":[]` → writes tests/build/out-of-plan-triage.test.js
- **AC-20261103-07-4**: WHEN the file is not test-classified THE SYSTEM SHALL print `triage: auto — src/lib/b.js is not a § Risk Tiers surface; not a test file` for `--file src/lib/b.js` with the File Plan row's Layer `scripts` (the planned `src/a.js` shares the leading directory `src`), and Layer `other` for `--file docs/x.md` (no planned path shares a leading directory) → writes tests/build/out-of-plan-triage.test.js
- **AC-20261103-07-5**: WHEN `--file src/a.js` names a File Plan path THE SYSTEM SHALL exit 0 and print `triage: in-plan — src/a.js is already a File Plan row; dispatch its owning worker` (`--json` `"verdict":"in-plan"`); WHEN a File Plan row is the glob `src/gen/*.js` THE SYSTEM SHALL treat `--file src/gen/z.js` as `in-plan`; WHEN `--file` is absent THE SYSTEM SHALL exit 2 and print the usage line on stderr; WHEN the rules file has no `## Risk Tiers` section, or the config has no `pipelineRules` key THE SYSTEM SHALL exit 2 with stderr naming `/spec:doctor`; WHEN `--spec` names a missing file THE SYSTEM SHALL exit 2 → writes tests/build/out-of-plan-triage.test.js
- **AC-20261103-07-6**: WHEN a `makeNoTestsHost()` build reaches REPAIR (a `FAIL_FLAG` keeps the gate red after `--mark integrated`) and the driver prints the step THE SYSTEM SHALL print the line `a failing file outside the File Plan: node "$(spec-paths out-of-plan-triage)" --spec <the spec path the driver was invoked with> --file <path> — exit 0 prints the two rows to paste, exit 1 asks (add to scope / file separately / pause)` between the File Plan rows-by-layer block and the `Route each failing file` line → writes tests/build/build-driver-repair.test.js
- **AC-20261103-07-7**: WHEN `spec-paths out-of-plan-triage` runs THE SYSTEM SHALL print a path ending `scripts/out-of-plan-triage.js`, and the usage line printed for an unknown key SHALL name `out-of-plan-triage` → rewrites tests/spec-paths.test.js :: AC-20260926-03-8: every documented key resolves to an existing path
- **AC-20261103-07-8** `[oracle: gate]`: WHEN the gate runs THE SYSTEM SHALL pass `scripts/plugin-bump.js --check`, the entrypoints manifest checks in both directions (the new row's three entry points each carry the literal `spec-paths out-of-plan-triage`; every `spec-paths out-of-plan-triage` call site is declared) and the citations check for every `§` this spec's doctrine edits cite → reuses tests/consistency/plugin-bump-gate.test.js :: gate wiring: scripts/plugin-bump.js --check at this repo root

## Assumptions (escalation triggers)

- A1: Micro-spike 2026-11-03 (scratch script over this repo's libs, deleted): `extractSection(rules, 'Risk Tiers')` + the D1 bullet-span rule yields exactly twelve surfaces — `spec/templates/grounding-contract.md`, the five hook surfaces, `merge-back.sh`, `spec-status.js`, `scope-reconcile.js`, `verdict.js`, `review-legs.js`, `spec/bin/spec-paths` — and excludes `scripts/spec-patterns.sh` (the non-bullet standard-tier sentence) and `--root/--next/--json` (leading `-`); a whole-section span scan had included both. `tests/consistency/entrypoints.test.js` matches none; `spec/hooks/hooks.json` and `spec/bin/spec-paths` match themselves. **if false** (a host's § Risk Tiers lists its paths outside bullets): the worker returns blocked naming the host; the rule stays bullet-scoped and the header says so — the grounding contract writes `riskTiers` as bullets.
- A2: Same spike: `isTestClassified('tests/consistency/entrypoints.test.js', fileShapes(cfg))` is `true` and `spec/hooks/hooks.json` is `false`; `globMatch('spec/scripts/*.js', 'spec/scripts/x.js')` is `true` and `…/lib/x.js` is `false`; `parseFilePlanRows` on spec 20261103/03 returns 12 rows with `{paths, action, layer, summary}`; that test's text contains four of the spec's planned paths (`spec/scripts/spec-build-driver.js`, `spec/hooks/hooks.json`, `spec/doctrine/core.md`, `spec/entrypoints.json`) and is not itself a row. **if false:** the worker returns blocked naming the lib; no second parser or classifier is written.
- A3: Micro-spike 2026-11-03: a Decisions row carrying `[auto: out-of-plan-triage — …]` and `[no-ac: the gate line is the oracle]` added to a copy of spec 20261103/05 passes the installed plugin's `decision-lint` (restrictions=0, findings=0) and `promise-sweep` (sanctioned, orphans=0); "never weakened" does not match decision-lint's `RESTRICT_RE`. **if false:** change the row's wording in D2, never the lints.
- A4: `tests/consistency/entrypoints.test.js`'s forward check accepts the literal `spec-paths <key>` in a `.md` entry point and in a JS entry point's non-comment text (read 2026-11-03; `spec-build-driver.js` is already a declared entry point of `spec-queue.js` on exactly that shape); its reverse check walks `spec/agents` and `spec/doctrine/stages`, so D6's reviewer call site must be declared (D5 does). **if false:** the worker returns blocked naming the violation line; the manifest row is corrected, never the check.
- A5: No test pins the REPAIR body byte-for-byte; the only substring pin spans the rows-by-layer block through the orchestrator-owned line (`tests/build/build-driver-orchestrator-only.test.js`), which D4's insertion point leaves intact (grep 2026-11-03). **if false:** extend that pin in place in the same wave, never move the line above the orchestrator-owned one.
- A6: Ledger evidence (`fleet-reader --json`, 2026-11-03): `decision-added-at-build` counts 50 across 8 repos; seven Decisions rows across this repo's specs record the ask (specs 20260823/06, 20260911/01, 20261029/02, 20261101/01, 20261101/02, 20261102/02 and today's 20261103/03 lane), every one answered "add to scope"; two further rows record the auto-pick. **if false:** nothing in the build changes; the Rationale's admission numbers are corrected at review.
- A7: The review of this spec runs the installed plugin's scripts (`spec-paths` resolves to the plugin cache, 7.316.0 at plan time), so AC-8's gate oracle is the existing `plugin-bump-gate` wiring, as spec 20261103/05 AC-8 used it. **if false** (review runs the worktree's scripts): nothing changes.
- A8: `out-of-plan-triage.js` matches none of node's default test-discovery patterns (`**/*.test.js`, `**/*-test.js`, `**/*_test.js`, `**/test-*.js`, `**/test.js`, `**/test/**`), so the path-less post-gate never executes it as a test. **if false:** STOP, ask the user — the name is a locked Decision.

## Rationale

The rule in stage-build § `blocked` returns had two clauses: ask when the spec is critical, or
when the file is a § Risk Tiers trigger. The first clause keys on the wrong object. A critical
spec's collateral is usually a test that pins the list the spec extends — hooks.json's script
set, a `shared-for` section list, an entrypoints row — and that test's own comment prescribes the
in-place update. Four critical specs in the last week asked (20261029/02, 20261101/01, 20261101/02,
20261102/02), two standard ones before them, and today's 20261103/03 lane relayed the same three
options through the fan-out; the answer was "add to scope" every time. The user's standing
feedback is that a question with one answer is a cost with no value.

Incident Policy admission. Portability: the script reads only the host's config, its
`pipelineRules` file and the spec — no stack assumption. Generality: the seven asks above are
distinct ledger-recorded members (`decision-added-at-build` rows name their D-ids), six of them
not the triggering incident. Materiality: `decision-added-at-build` = 50 across the fleet (A6);
the ask subset is the seven rows. Falsifiability: the build's red-first run of AC-1 against the
pre-image (no script) is the deliberately red run; AC-2 trips the ask arm on a standard spec.
Removability: "how many `[asked: … add to scope]` Decisions rows landed on builds after this
version shipped?" — zero across twenty builds means the ask arm never fires on this fleet and
the question can go; a non-zero count of `[auto:]` rows the reviewer reversed (D6 hard findings)
means the surface rule is too narrow and must widen, not the script go.

Prior art. GitHub CODEOWNERS requires a review only for paths an owner claims — unowned paths
merge on the ordinary check — and its known failure is a glob so wide everything asks; D1 takes
exact spans and prefixes from bullets the host already writes, so the breadth is the host's own
§ Risk Tiers. Renovate `packageRules` and Mergify conditions act on declared matchers over
machine facts (path, label, author) rather than a judgment per event; their failure mode is a
rule evaluated over stale facts, which here cannot happen — the facts are the live rules file
and the live File Plan at the moment the gate reds. The `[auto:]` row is Sonar-style
provenance: the auto-pick is visible where a reviewer looks, and D6 makes a fresh reader
re-derive it.

Rejected: reading the spec's tier at all (the whole defect); a `riskTiers` config array as the
match source (those are prose labels, not paths — the contract says so); prose-only matching of
"boot path" (not a machine fact; a host names the path); writing the rows into the spec from the
script (only the session edits the Decisions table — stage-build Worker Contract); a lock-time
prediction (rules § Gotchas records that rejection; D8 keeps it); a second test-reference
derivation shared with `scope-reconcile.js`'s at-risk stem scan (that script is critical tier
and its derivation is stem-based over a changed set; D2's substring check over the one failing
file is a different, smaller question, stated in the header). Tier is critical because D5 adds
a `spec-paths` arm; the doctrine, driver and reviewer edits are standard-shaped.

Collision closure at lock (2026-11-03, literals `file separately`, `add to scope`,
`out-of-plan-triage`, `tier: critical`). Literals leg: `file separately` and `add to scope` occur
only in `spec/doctrine/stages/stage-build.md`, a File Plan row (D3 keeps both phrases). `tier:
critical` occurs in fifteen files, all about the tier itself (frontmatter grammar, the lock
confirm, structural triggers) — none spells the retired clause "only when the spec is `tier:
critical`", so none is a collision; waived. `tests/consistency/dead-stops.test.js` pins
`📌 Auto-picked` and `if false` in the same section, both kept by D3. Paths leg `executes` hits:
fifteen tests spawn `spec/bin/spec-paths` and the build tests spawn `spec-build-driver.js`; D5
adds an arm and a usage entry (no existing key resolves differently; `tests/spec-paths.test.js`'s
usage pin asserts named keys are present, which an addition keeps) and D4 adds one REPAIR line
after the only substring pin (A5) — additive on every observed string; waived. The `likely` hits
on `entrypoints.json`/`plugin.json` are the exhaustive-pin class the build's whole-suite check
adjudicates (D8).

## Canonical Delta

`docs/canonical/build-integrity.md` § Build driver gains, after the orchestrator-only paragraph:

> A gate failure in a file outside the File Plan is triaged by the file's risk, never by the
> spec's tier. `out-of-plan-triage.js` (`spec-paths out-of-plan-triage`) takes the backtick path
> spans on the host rules' § Risk Tiers bullet lines plus the config's `orchestratorOnly` globs
> as the surfaces that earn a question (exit 1: add to scope / file separately / pause); every
> other file is added to scope (exit 0) with a printed auto-pick, a File Plan row and a
> Decisions row tagged `[auto: out-of-plan-triage]` whose reason names the planned paths the
> failing test's source cites. The REPAIR step prints the command; the reviewer re-runs it on
> every tagged row and treats exit 1 as hard.
