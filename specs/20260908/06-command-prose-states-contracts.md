---
date: 2026-09-08
build_base: main
status: done
tier: standard
area: doctrine-governance
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
open_markers: 0
diff_base: c7bb7245e8c29fa0faf7ecc2fca4cb2f7d8d7aea
---

# Command prose states contracts — drivers print the steps

## Goal

The four driver-stepped command files (`build`, `review`, `run`, `mocks`) stop restating what
their driver prints at runtime, every command loses the duplicate read of the host rules file
and the duplicate `AskUserQuestion` bullet, the two longest incident retellings become rules,
and the genesis brief is edited in place instead of rewritten and reprinted every interview
round. Done means the read-load test carries a lower budget per trimmed command, a bullet cap
on every `## Rules` section, and an exact pin of every `shared-for` section list, all green,
with every existing doctrine pin still green.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | **Driver-stepped files carry the loop contract, never the steps.** `build.md` and `review.md` keep a Protocol of at most eight lines each: run the driver, execute the printed step, mark it, re-run; the driver verifies artifacts and re-derives the true step. Everything the driver prints itself is deleted from the prose: build.md's ESCALATE exits, `--mark incident` usage, deviations-sidecar path, "keep the Agent" wave rule and REPAIR routing (lines 59–73, 90–102 today); review.md's STOPPED/ESCALATE narration (53–65), the REVIEWER and DISPOSITIONS dispatch envelopes (91–136), the CLOSE mechanics the driver enumerates (sidecar listing, cap arithmetic, ratchet remedy, hygiene listing, AC-drift line, close-commit exclusions), the MERGE relocation sentence, and the REPLAY step body; mocks.md's quoted checkpoint and sign-off lines (50–54, 130–131), the THEME "derive 2–3 then ask" instruction (75–84), and the look-stop hand-off narration that `mocks-driver.js` emits (97–117, keeping every literal AC-4 names). What stays is the judgment each step needs from the session and every literal an existing test pins (AC-4). (AC-20260908-06-1) | A session receives the driver's step text at every step; the prose copy is the second read of the same words (audit: review.md 53 %, build.md 36 %, mocks.md 29 % restated). genesis.md already works this way at 114 lines. Rejected: trimming wording in place — the words are correct, they are simply printed twice. |
| D2 | **`run.md` § Rules is one line**: "build.md § Rules and review.md § Rules apply verbatim on the loop path." The five bullets it carries today are byte-identical to build.md's (executed `diff`, A3). Its Build stage and Review stage paragraphs shrink to the `--via loop` differences only: the checkpoint line, the no-stop-before-dispositions rule, the relocation pointer at review.md — never a second copy of the relocation sentence. (AC-20260908-06-1) | core § Doctrine Authoring: one binding home per rule. |
| D3 | **The `AskUserQuestion dismissed → STOP` bullet is deleted** from the `## Rules` of every command whose `shared-for` list serves core § Decisions (atlas, build, design, genesis, mocks, plan, release, replay, run, sketch); core § Decisions already states it. Commands not served § Decisions (doctor, escape, init, enforce, queue, status) keep theirs. (AC-20260908-06-1, AC-20260908-06-2) | Ten copies of one sentence the shared doctrine already loads. |
| D4 | **The host rules file is never read twice.** core § Host Grounding gains: the pipeline-rules file is path-scoped — Claude Code injects it once, on the session's first `Read` of a file under its `paths:` (the config Read qualifies) — so a command never Reads it whole; when a host's rules did not arrive with the config (a `paths:` glob that matches nothing), Read them once. The Setup line of plan, build, run, review, replay, design and enforce becomes "Read the host's `.claude/spec.config.json` (its pipeline rules load with that Read — path-scoped, never re-read). Either missing → STOP: run `/spec:init` first." enforce.md's audit-time read of the full rule surface (its Phase that checks the rules file) is unchanged. `spec/templates/grounding-contract.md` is NOT edited (host § Planning: contract edits are critical-tier and rationed); its now-stale "pipeline commands Read it explicitly" clause is queued onto the next genuine contract change. `[no-ac: prose contract; a regex over prose is not a test (host § Test Rules) — the read-load budget AC-1 is the size pin and A1 records the executed trigger check]` | Executed this session (A1): the Read of the config injected the 19 KB rules file; a second matching Read did not re-inject; a Bash `cat` never triggers it. Every command then re-reads the same 19 KB on instruction — about 5 K tokens a session for nothing. |
| D5 | **Rules-section bullet cap = 8.** `tests/consistency/read-load.test.js` gains a test that runs `spec-paths prose-cap` with `--section Rules --cap 8` over every `spec/commands/*.md`; a file with no `## Rules…` heading (prose-cap exit 2, "no `## ` heading containing") passes; exit 1 fails naming the file. review.md's twelve bullets fold to at most eight by merging, never by moving a bullet elsewhere. (AC-20260908-06-2) | Measured today: review 12, genesis 8, enforce 7, everything else ≤ 6 — 8 holds every file but the one this spec rewrites anyway. Reuses the existing script; no new mechanism. |
| D6 | **Every `shared-for` list is pinned exactly.** The same test file gains a table `{cmd: [section names…]}` for all sixteen scoped commands plus `run-design`, asserted with `deepStrictEqual` against the `## ` headings `spec-paths shared-for <cmd>` prints (parenthetical suffixes stripped). A list change is a deliberate edit to that table. (AC-20260908-06-3) `[pre-green: predicate-in-test]` | The lists are the read surface for the expensive seat; today only a handful of sections are spot-checked in `tests/spec-paths.test.js`, so a section can be added to every list silently (exactly what the last commit did). |
| D7 | **Read-load budgets drop** for the trimmed commands; `RATCHET` in `read-load.test.js` becomes per-command budgets (test formula: `split('\n').length` of the command file + of the `shared-for` output): build ≤ 300, review ≤ 340, run ≤ 310, mocks ≤ 325, replay ≤ 450, design ≤ 490, plan ≤ 328, init ≤ 735; every other command keeps `CAP = 500`. The table may only shrink. (AC-20260908-06-1) | Measured today with the test's own formula: build 344, review 429, run 340, mocks 362, replay 474, design 500, plan 335, init 735. The numbers are the audit's restatement counts minus a safety margin; init is frozen at today's value, not cut. |
| D8 | **Incident retellings become rules.** replay.md's three narrated passages (the two blindness leak surfaces + `--overlay` history, the relocated-shell ledger loss, the scratch write-access incident) and init.md's vacuous-pass story each become the rule they were evidence for plus one owner citation, per specs/20260902/03 D2's grammar; the existing slice pins on replay.md's Phase headings and step anchors (AC-4) are untouched. (AC-20260908-06-1) | core § Incident Policy: doctrine text is for contracts, not incident memories. |
| D9 | **The brief is edited, not rewritten.** `spec/doctrine/genesis.md` "The brief is the interface" paragraph is rewritten: after every `AskUserQuestion` round the session edits in place only the lines the answers changed (the answered `## Coverage` key, any new `## Open Dimensions` or `## Picks` line) and prints those changed lines — one line per key; it prints `## What I think you're building` + `## Coverage` in full exactly once, at the end of discovery, immediately before `--mark discovery-done`; the no-separate-sign-off sentence stays, anchored to that single closing render. `genesis-driver.js`'s DISCOVERY step, when `brief.md` exists, prints one additional line `Before marking: print ## What I think you're building and ## Coverage once, in full — the user reads this render as the brief.` (AC-20260908-06-5) | User ruling this session (Edit in place, print the diff). A brief is 3–6 KB rewritten and partly reprinted 5–12 times per interview; nothing deterministic depends on the reprint (no test, no driver read). |
| D10 | **Not done here.** The `## Acceptance Criteria` lecture stays in `spec/templates/spec.md`: no real spec carries it (0 of 163) and only `/spec:plan` reads the template, so moving it into core would add ~50 lines to build/review/run loads. plan.md's own **ACs** bullet (lines 76–91) shrinks to two lines pointing at the template's comment for the grammar. The in-session mock-authorship rule (design.md § Design Atlas, ADR-0006) is kept by user ruling this session. `[no-ac: absence of change; plan.md's shrink is inside AC-1's plan budget]` | The premise "the lecture is copied into every spec" was measured false. |
| D11 | `spec/.claude-plugin/plugin.json` bumped with `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph naming the driver-restatement cut, the Rules cap, the shared-for pins and the brief edit-in-place>"`. `[no-ac: manifest; tests/consistency/plugin-bump.test.js is the oracle]` | Host § Planning. |
| D12 | **`design`'s budget is 510, not 490** (user ruling, 2026-09-09, recorded at build Phase 1). A4 measured design at 500 and D7 derived 490 from it; the true figure at `build_base` is 510 (own 217 + shared 293), and HEAD's pre-existing `RATCHET` already carried `design: 510`, granted by the recorded review-gate ruling in specs/20260907/09-atlas-index-and-note-navigation.md D13 — those ten lines are contracts, not procedure. design.md's File Plan authorizes only D3 and D4, which net to zero lines, so 490 is reachable only by cutting ~20 lines D13 protects and no File Plan row names. A4's escalation trigger fires as written: re-measure at build, never raise above the true ceiling. Every other budget lands as D7 specifies. (AC-20260908-06-1) | Restoring a ruled ceiling is not raising a budget; deleting prose to satisfy a number derived from a mismeasurement would be silent scope creep against a two-day-old ruling. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/commands/build.md | MODIFY | doctrine | D1: Protocol ≤ 8 lines; driver-printed paragraphs deleted; D3 |
| spec/commands/review.md | MODIFY | doctrine | D1: Protocol ≤ 8 lines; step bullets keep judgment only; D5: Rules ≤ 8 bullets; keeps every AC-4 literal |
| spec/commands/run.md | MODIFY | doctrine | D2: Rules one line; stage paragraphs = loop differences only; D3, D4 |
| spec/commands/mocks.md | MODIFY | doctrine | D1: driver-emitted lines and look narration removed; keeps every AC-4 literal; D3 |
| spec/commands/replay.md | MODIFY | doctrine | D8: three retellings → rule + citation; slice anchors untouched; D3, D4 |
| spec/commands/init.md | MODIFY | doctrine | D8: vacuous-pass story → rule + citation |
| spec/commands/plan.md | MODIFY | doctrine | D10: ACs bullet → two-line pointer at the template; D3, D4 |
| spec/commands/*.md | MODIFY | doctrine | D3 in atlas, design, genesis, release, sketch; D4 Setup line in design, enforce |
| spec/doctrine/core.md | MODIFY | doctrine | D4: § Host Grounding path-scoped sentence |
| spec/doctrine/genesis.md | MODIFY | doctrine | D9: "The brief is the interface" paragraph |
| spec/scripts/genesis-driver.js | MODIFY | scripts | D9: DISCOVERY step's closing-render line when brief.md exists |
| tests/consistency/read-load.test.js | MODIFY | tests | AC-20260908-06-1, AC-20260908-06-2, AC-20260908-06-3 |
| tests/genesis/genesis-driver.test.js | MODIFY | tests | AC-20260908-06-5 |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D11: bump via plugin-bump |

Orchestrator duty (AC-4): the final gate is the whole suite; every doctrine pin the audit
lists in Rationale must stay green with no test weakened — a red pin is a cut that went too
far, fixed by restoring the literal, never by editing the pin.

## Contracts

```
# tests/consistency/read-load.test.js — per-command budgets (may only shrink)
const CAP = 500
const BUDGET = { build: 300, review: 340, run: 310, mocks: 325, replay: 450, design: 490, plan: 328, init: 735 }

# Rules cap — one run per command file
node "$(spec-paths prose-cap)" --file spec/commands/<cmd>.md --section Rules --cap 8
  exit 0 → pass · exit 2 whose stderr matches /no "## " heading containing/ → pass (no Rules section) · anything else → fail naming the file

# shared-for map pin — headings printed by `spec-paths shared-for <cmd>`, parentheticals stripped
SHARED_FOR = { plan: [...], design: [...], …, init: [...], 'run-design': [...] }   // 17 keys, exact order

# genesis-driver DISCOVERY step, brief.md present — one extra printed line
Before marking: print ## What I think you're building and ## Coverage once, in full — the user reads this render as the brief.
```

## Behavior

A `/spec:build` or `/spec:review` session reads a command file that says: run the driver,
do the printed step, mark it, re-run — plus the judgments only the session can make. Every
envelope, exit, cap and remedy arrives from the driver at the step where it is needed, once.
`/spec:run` points at both files' Rules instead of copying build's. Each command's Setup reads
the config and receives the host rules with it; nothing re-reads the rules file. In genesis
discovery the user sees one line per changed brief key after each answer and the full brief
once at the end.

## Acceptance Criteria

- **AC-20260908-06-1**: WHEN `tests/consistency/read-load.test.js` measures each command's own
  file plus its `shared-for` output (both as `split('\n').length`) THE SYSTEM SHALL report
  build ≤ 300, review ≤ 340, run ≤ 310, mocks ≤ 325, replay ≤ 450, design ≤ 510, plan ≤ 328,
  init ≤ 735 and every other command ≤ 500 (e.g. review.md today: `429` → after: `≤ 340`) →
  per-command budget tests in `tests/consistency/read-load.test.js`
  - superseded at build Phase 1 by D12: this AC read `design ≤ 490`, derived from A4's
    mismeasurement of 500. design's true figure at `build_base` is 510, which is also the
    ceiling specs/20260907/09-atlas-index-and-note-navigation.md D13 granted by recorded
    ruling; A4's escalation clause fires and the literal is corrected, never the prose cut.
- **AC-20260908-06-2**: WHEN `spec-paths prose-cap --section Rules --cap 8` runs over every
  `spec/commands/*.md` THE SYSTEM SHALL exit 0 for every file that has a `## Rules` heading
  and treat a file with none (exit 2, stderr `no "## " heading containing`) as passing (e.g.
  `status.md` → pass; `review.md` with 12 bullets → fail; with 8 → pass) → Rules-cap test in
  `tests/consistency/read-load.test.js`
- **AC-20260908-06-3** `[pre-green: predicate-in-test]`: WHEN `spec-paths shared-for <cmd>`
  runs for each of the 17 scoped keys THE SYSTEM SHALL print exactly the `## ` headings the
  test's `SHARED_FOR` table lists for that key, in that order, parentheticals stripped (e.g.
  `status` → `['Host Grounding','State Machine','Question Style','Console Output Style','Session Execution']`)
  → shared-for map test in `tests/consistency/read-load.test.js`
- **AC-20260908-06-4** `[oracle: gate]`: WHEN the trimmed command and doctrine files land THE
  SYSTEM SHALL CONTINUE TO pass every existing doctrine pin unchanged — the look hand-off
  literals in mocks.md and sketch.md, the `↻ Storybook…` line in design.md, review.md's
  `evict`/`delete … merge … mechanize` CLOSE slice and its `never dates, people, hosts,
  versions, or prior behavior` literal, review.md's `` `diff_base` → `build_base` ``, replay.md's
  Phase and step anchors, the `spec-paths` call-site ↔ `spec/entrypoints.json` conformance,
  every `§` citation, genesis.md ≤ 120 lines and design.md ≤ 160 lines
- **AC-20260908-06-5**: WHEN `genesis-driver.js` prints the DISCOVERY step and
  `.claude/genesis/brief.md` exists THE SYSTEM SHALL print the line `Before marking: print ##
  What I think you're building and ## Coverage once, in full` and SHALL NOT print it when
  the brief does not yet exist (e.g. cold root → absent; brief written → present) →
  DISCOVERY closing-render test in `tests/genesis/genesis-driver.test.js`

## Assumptions (escalation triggers)

- A1: Claude Code injects a path-scoped rules file once per session, on the first `Read` of a
  matching file, and not on a Bash read. **Executed this session:** `cat .claude/spec.config.json`
  via Bash → no injection; `Read .claude/spec.config.json` → the full
  `.claude/rules/spec-pipeline.md` arrived as a system reminder; a later `Read
  specs/20260908/05-…md` → no second injection. — **if false:** D4's sentence already carries
  the fallback ("when the rules did not arrive with the config, Read them once"); nothing else
  moves.
- A2: `prose-cap.js` on a file without the named section exits 2 with stderr `no "## " heading
  containing "Rules"`. **Executed:** `--file spec/commands/status.md --section Rules` → exit 2,
  that message. — **if false:** the AC-2 test matches on the message text only.
- A3: `run.md` lines 109–117 and `build.md` lines 136–144 are byte-identical. **Executed:**
  `diff` of the two ranges → empty. — **if false:** D2 keeps the differing bullet in run.md.
- A4: today's read-load totals by the test's formula are build 344, review 429, run 340, mocks
  362, replay 474, design 500, plan 335, init 735. **Executed:** measured through
  `spec-paths shared-for` this session. — **if false:** D7's budgets are re-measured at build
  Phase 1 and lowered to (today − the audit's restated line count + 10), never raised.
  **FALSIFIED at build Phase 1 for `design` only:** its true total is 510 (own 217 + shared
  293), not 500 — the figure was already stale at lock, HEAD's `RATCHET` carrying `design: 510`
  from specs/20260907/09 D13. The clause fires: re-measured (510), restated count 0 (design is
  not a D1-audited file), so the budget is the true ceiling and no prose is cut. Every other
  command's total measured as recorded. See D12.
- A5: no script reads a command file's prose (the drivers print their own text; only tests
  pin literals). — **if false:** STOP, ask the user — a script-read literal is a contract.

## Rationale

The Fable 5.1 cost work landed its mechanical layers in 7.111.0 (section-scoped doctrine, the
style hook gone). What remains is prose written twice: the audit measured 118 of review.md's
223 lines, 52 of build.md's 144, 46 of mocks.md's 158 and 30 of run.md's 117 as text the
driver prints at the step where it matters. genesis.md is the counter-example (114 lines,
"never restate the driver") and works. D1 cuts to the same shape.

Three premises from the earlier session were measured false and are recorded so nobody
re-proposes them: the template's AC lecture is not copied into specs (0 of 163 carry it), so
it stays where only `/spec:plan` reads it; the host rules file cannot be sliced per command
because Claude Code injects it whole on the first matching Read regardless — the only waste
is the explicit second read, so D4 deletes that instruction and leaves the file alone; and the
Gotchas section is already capped at 15 by `prose-cap` at review close, so no new cap is
needed there.

The mock-authorship rule (every mock drawn in-session, ADR-0006) was put to the user as a
fork: relaxing it would cut the most expensive whole-file writes but reintroduces the
inconsistency it was ruled against six days ago and needs an ADR, five files, two test
rewrites and a provenance stamp. The user kept the rule. The brief loop was the other fork;
the user chose edit-in-place with one final render.

Fragile: the cut collides with dense literal pins (Rationale's list under AC-4). A worker who
removes a pinned literal sees the pin go red at the final gate; the fix is always to restore
the literal. `tests/prose-debt/doctrine-pins.test.js` slices review.md between `**Close (the
CLOSE step).**` and `**Merge strategy and non-trivial conflicts` — both bullet openers must
survive verbatim. `tests/comment-narration/comment-narration.test.js` needs review.md's
Gotchas grammar sentence. `tests/design-look-handoff.test.js` needs mocks.md's `## Look rule`,
`tracked background task`, `end the turn`, and the two-line hand-off block verbatim — D1's
mocks cut removes the narration around that block, never the block. The `spec/commands/*.md`
glob row overlaps the named rows on purpose: scope-reconcile matches globs
(specs/20260813/03 D2), and the glob names the five files whose only change is D3/D4.

D5's cap of 8 was auto-picked from the measurement (only review.md exceeds it, and review.md
is rewritten here anyway). D7's budgets are today's numbers minus the audited restatement
minus a margin; init is frozen, not cut — its 497 lines are generation procedure with no
driver, a separate landing unit if ever.

Collision-closure literals leg at lock (21 live-tree hits, 4 waived): every `AskUserQuestion\`
dismissed` hit is a File Plan row except doctor.md, escape.md and init.md, whose bullets D3
keeps on purpose (their lists do not serve § Decisions) — waived; `rewrites the file` in
`tests/genesis/genesis-driver.test.js` is the status.json v2→v3 sentence, unrelated to the
brief — waived. No `executes` hits.

Build departures, folded from the deviations sidecar at review close (both one-offs, neither a
recurring class): **the `shared-for` pin covers 18 keys, not the 17 D6 names** — `spec/commands`
holds 17 files and `spec-paths`'s `shared-for` case names all 17 plus `run-design`; the table
was derived by running the command, since pinning 17 would leave one command's list unguarded,
the exact hole D6 closes. **`design`'s budget is 510, not D7's 490** — A4's 500 was already
stale at lock (HEAD's `RATCHET` carried `design: 510` from
specs/20260907/09-atlas-index-and-note-navigation.md D13, a recorded ruling that those lines
are contracts), design.md's rows net to zero lines, and A4's escalation clause fired:
re-measured at build, restated count 0, budget set to the true ceiling. D12 records the user
ruling. Rejected alternatives: cutting ~20 lines of design.md prose no File Plan row names, and
trimming design's `shared-for` list — the latter changes which doctrine binds the design stage,
which AC-3 now pins deliberately.

Review waived one finding: the build-stage ledger row carries `deviations: 0` because it was
appended while the sidecar still used `## ` headings the `^- ` count cannot see. The row is not
corrected — ledger rows are append-only fleet-wide (specs/20260901/07-escape-class-contract.md
D3) and the build driver is the row's sole writer — and the true count of two reaches the
record through this fold. User ruled to leave it.

## Canonical Delta

`docs/canonical/doctrine-governance.md` gains under its read-surface section: a driver-stepped
command file states the loop contract and the session's judgments only — the driver prints
every step's envelope, exits, caps and remedies, and the command file never restates them
(build, review, run, mocks join genesis). Every `## Rules` section holds at most eight bullets
(`prose-cap`, pinned in `read-load.test.js`); every `shared-for` section list is pinned
exactly there. The host pipeline-rules file is path-scoped and arrives with the config Read;
no command re-reads it. The genesis brief is edited in place per answer and rendered in full
once, at discovery's end.
