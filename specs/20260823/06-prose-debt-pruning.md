---
date: 2026-08-23
status: done
diff_base: 9e626d2da2960587418c1ce0e30f5a1f8168aa87
tier: standard            # additive spec-paths keys follow 20260823/01's precedent; no critical-trigger file gets a behavioral edit; worst failure is a false exit 1 at review close, repaired by re-running the script
area: scripts
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
open_markers: 0
---

# Prose-debt pruning — capped Gotchas, relevance-triggered memory disposition

## Goal

Two prose surfaces are append-only by construction: the host rules' § Gotchas section (23
entries accreted in 23 days, including two that cite machinery deleted at v7.0.0) and
`.claude/agent-memory/` (29 notes, re-examined only when a diff happens to touch the note
file itself). Both violate core § Incident Policy as practiced — standing prose guards
minted on first occurrence, nothing pruning them. This spec makes both surfaces
self-pruning: a hard entry cap on Gotchas enforced by a script wired into the gate and the
review close, an evict-on-append duty for its two writers, a relevance/TTL sweep that
surfaces memory notes for the existing disposition duty, and a one-time triage that pays
the current debt down (23 → 10 entries, six durable truths promoted to a canonical doc).
Done means: the suite goes red on a 16th Gotchas entry with no eviction, and a stale memory
note can no longer outlive its subject silently.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | New `spec/scripts/prose-cap.js`: counts entry bullets in one named section of a markdown file; over `--cap` → exit 1 naming count, cap, and the eviction duty (AC-20260823-06-1, AC-20260823-06-2) | A cap converts "should we prune?" into arithmetic; rejected: a staleness heuristic (age/citation liveness) — judgment belongs to the session at fold time, not a script |
| D2 | Cap value **15**, default in the script, `--cap` overridable per host (AC-20260823-06-1) | JJ blessed 15 on 2026-08-23; post-triage count is 10, so the cap won't bite for weeks |
| D3 | Enforcement is dual: a live-file test runs prose-cap against this repo's own rules file every suite run (AC-20260823-06-3), and `/spec:review` CLOSE + `/spec:escape` step 6 run/name it at append time (AC-20260823-06-4) | Close-time is where the evicting session has context; the suite is the deterministic backstop when a fold skips the duty |
| D4 | Eviction fates are a closed enum stated in doctrine: **delete** (wrong, dead-cited, or mechanized — the script header owns the history), **merge** (durable engineering truth → `docs/canonical/{area}.md`), **mechanize** (recurring class → script per core § Incident Policy, prose dies) (AC-20260823-06-4) | An open-ended "clean it up" collapses to no-op; three fates make every eviction a recorded ruling |
| D5 | New `spec/scripts/memory-sweep.js`: surfaces agent-memory notes for disposition when (a) a note's body cites a path in the spec's changed set (**diff-hit**) or (b) ≥10 review-close ledger rows postdate the note's last git commit (**ttl-expired**), oldest-first, max 3 ttl notes per run; scope `.claude/agent-memory/*/*.md` minus `MEMORY.md`; JSON out (AC-20260823-06-5..8) | The disposition trigger today is "diff touched the note file" — wrong subject; "diff touched what the note is about" catches same-build falsification systematically (it was caught by luck at the 20260823/03 review), and TTL bounds notes citing nothing concrete |
| D6 | No frontmatter retrofit, no note-writing contract change: relevance is derived by grepping note **bodies** for path-shaped tokens and matching them against the changed set by repo-relative path or basename (AC-20260823-06-5) | Notes already cite their subjects in prose; deriving beats legislating a `subjects:` field onto 29 existing notes and every future worker — a false positive costs one cheap disposition, a false negative falls to TTL |
| D7 | TTL is **10 review closes**, derived as: count of `"stage":"review"` rows in `.claude/spec-runs.jsonl` whose `ts` postdates the note's last git commit date (`git log -1 --format=%cI -- <note>`); a **carry** disposition resets it by writing `reviewed: YYYY-MM-DD` into the note's `metadata:` block (a commit, hence a fresh git date) (AC-20260823-06-6) | Ledger + git already record everything needed — no new state file; the reset rides the disposition edit that close commits anyway |
| D8 | `/spec:review` CLOSE disposal duty widens from "every agent-memory file this spec's diff touched" to that set **union the sweep's output**; the existing wording obligations survive verbatim (AC-20260823-06-9 pin) | The duty, its three fates, and its no-§-citation rule are pinned by AC-20260821-02-10; this spec widens the trigger, never the duty |
| D9 | One-time triage locked in § Behavior: **7 deletes, 6 merges into new `docs/canonical/scripts.md`, 10 keeps** — build applies the table mechanically, no worker judgment (AC-20260823-06-3 goes green exactly when it lands) | The adjudication is this plan session's work, with the evidence in hand (dead citations verified by `ls`, duplicates verified against Test Rules); deferring it to build re-pays the context cost |
| D10 | `docs/canonical/scripts.md` created as the script/test engineering canon; each merged entry rewritten to ≤4 lines of timeless truth, keeping its spec citation, dropping incident narrative `[no-ac: reference prose; content adjudicated at review via the reconcile leg]` | The six merged entries are Node/git API truths, not pipeline incidents — plan-time discovery reads canonical docs, which is exactly where they were never findable |
| D11 | `spec/bin/spec-paths` gains keys `prose-cap`, `memory-sweep` (AC-20260823-06-10) | Doctrine invokes scripts only via spec-paths; additive key edits shipped standard-tier in 20260819/02, 20260820/05, 20260823/01 |
| D12 | Version bump: spec plugin → next free 7.x (target 7.24.0 — a target, not a pin, per the version-race gotcha) with `description` changelog line `[no-ac: enforced by host Review Checks — doctrine change without a bump is a hard finding]` | Standing discipline |
| D13 | This spec reopens and partially reverses 20260821/02 D10's "no memory lint" ruling: the sweep is a **disposition-trigger widener**, never a verdict input — it exits 0 whenever it ran, findings or not, and nothing feeds `verdict.js` (AC-20260823-06-8) | D10's rejection was correct at recurrence count 1; the reopen condition (a second false-memory incident) was met 2026-08-23 when a note was falsified by the same diff that shipped it; the admission bar is filled in § Rationale |
| D14 | **Build ruling (JJ, 2026-08-23):** `spec/entrypoints.json` joins the File Plan — the two new scripts each get a declaration row (`prose-cap.js` → `spec/commands/review.md`, `spec/commands/escape.md`; `memory-sweep.js` → `spec/commands/review.md`) `[no-ac: the existing entry-point conformance guard `tests/consistency/entrypoints.test.js` is the covering test — it goes red on an undeclared script]` | The § Rationale collision-closure waive assumed the guard auto-inventories new scripts; it inventories scripts by location but diffs them against hand-maintained declarations, so an undeclared script is red (`docs/canonical/gate-integrity.md`: "Adding, deleting, or renaming a script must update the manifest in the same diff"). Options put to JJ: add to scope / file separately / pause — add chosen |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/prose-cap.js | CREATE | scripts | D1/D2: section-entry cap lint; header per Worker Rules (usage, incident, non-goals, exit codes) |
| spec/scripts/memory-sweep.js | CREATE | scripts | D5–D7: diff-hit + ttl-expired surfacing, JSON contract, `--root`-anchored (never cwd) |
| spec/bin/spec-paths | MODIFY | scripts | D11: add `prose-cap` and `memory-sweep` keys, nothing else |
| tests/prose-debt/prose-cap.test.js | CREATE | tests | AC-20260823-06-1, AC-20260823-06-2, AC-20260823-06-3, AC-20260823-06-10 |
| tests/prose-debt/memory-sweep.test.js | CREATE | tests | AC-20260823-06-5, AC-20260823-06-6, AC-20260823-06-7, AC-20260823-06-8 |
| tests/prose-debt/doctrine-pins.test.js | CREATE | tests | AC-20260823-06-4 |
| tests/run-ledger.test.js | MODIFY | tests | AC-20260823-06-9: tag the existing AC-20260821-02-10 test as this spec's regression pin (add the AC-ID; assertions unchanged, never weakened) |
| spec/commands/review.md | MODIFY | doctrine | D3/D4/D7/D8: CLOSE step gains the prose-cap invocation + at-cap evict duty (three fates) and the memory-sweep union + `reviewed:` carry-reset |
| spec/commands/escape.md | MODIFY | doctrine | D3/D4: step 6 `doctrine` branch — an append into a section at cap names its eviction in the same severable approval ask |
| .claude/rules/spec-pipeline.md | MODIFY | other | D9: apply the § Behavior triage table verbatim (7 deletes, 6 removals-after-merge, 10 keeps; section comment gains one line naming the cap and prose-cap.js) |
| docs/canonical/scripts.md | CREATE | other | D9/D10: the six merged truths, rewritten per D10's contract |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D12: semver bump + description changelog |
| spec/entrypoints.json | MODIFY | other | D14: declare the two new scripts and their call sites |

## Contracts

```
prose-cap.js — cap lint for one markdown section's entry count
Usage: node prose-cap.js --file <path> --section <heading substring> [--cap N]   (default cap 15)
Entry = a line matching  ^-   (any top-level `- ` bullet) inside the section; indented
continuation lines never count. Section = from the first `## ` heading containing
<heading substring> to the next `## ` or EOF.
(Amended 2026-08-23: the original bracket-first entry shape was fail-open against real
tag-at-end hosts — see Rationale.)
stdout: single line  <count>/<cap> entries in "<section>" of <file>
Exit codes:
  0  count <= cap
  1  count > cap  (stderr names the overage and the remedy: "evict before appending —
     delete / merge into docs/canonical/ / mechanize (core § Incident Policy)")
  2  bad invocation: missing/unreadable --file, section heading not found (stderr names it)
```

```
memory-sweep.js — surfaces agent-memory notes owed a disposition at review close
Usage: node memory-sweep.js --root <repo root> --diff <file with one changed path per line>
       [--ledger <path>]   (default: <root>/.claude/spec-runs.jsonl)
Scope: <root>/.claude/agent-memory/*/*.md, excluding MEMORY.md index files.
diff-hit:    a path-shaped token in the note body ([A-Za-z0-9_./-]+\.(js|mjs|cjs|sh|md|json))
             equals a changed path, or its basename equals a changed path's basename.
ttl-expired: count of ledger rows with "stage":"review" whose ts > the note's last git
             commit date (git log -1 --format=%cI -- <note>, run with cwd=<root>) is >= 10.
             At most 3 ttl-expired notes per run, oldest git date first. diff-hits are
             never capped and never count against the 3.
stdout (always, sole output): {"notes":[{"path":"...","reason":"diff-hit"|"ttl-expired",
  "matched":"<token or ISO date>"}]}
Exit codes:
  0  sweep ran — with or without findings (NEVER a verdict input; nothing reads this exit
     but the close-step session)
  2  bad invocation: unreadable --root/--diff/ledger, or git not answering (stderr names
     the remedy)
```

`spec-paths` additions (exact case lines, alongside the existing script keys):

```
  prose-cap)      echo "$ROOT/scripts/prose-cap.js" ;;
  memory-sweep)   echo "$ROOT/scripts/memory-sweep.js" ;;
```

## Behavior

**Review CLOSE additions (review.md, exact duties — wording is the doctrine worker's).**
After the deviations fold: run prose-cap against the host rules file; exit 1 → evict before
the close commit (delete / merge into `docs/canonical/{area}.md` / mechanize), recording
each eviction as one Rationale line in the spec under review. Memory disposal: run
memory-sweep with the spec's changed set; dispose the union of diff-touched and surfaced
notes — carry now writes `reviewed: YYYY-MM-DD` into the note's `metadata:` block. The
existing sentences pinned by AC-20260821-02-10 stay intact.

**Escape addition (escape.md step 6, `doctrine` branch).** When the target section is at
cap, the drafted one-line entry is presented **together with the eviction it displaces**
in the same severable `AskUserQuestion`; declining either leaves the section unchanged.

**One-time triage (authoritative; build applies verbatim to `.claude/rules/spec-pipeline.md`,
entries identified by their citing spec + opening words).**

DELETE — 7 entries (wrong, duplicate, dead-cited, or mechanized; history survives in the named artifact):

| Entry (citation) | Reason |
|---|---|
| `[plugin]` {testDirs} glob on Node 26 (20260801/02) | Duplicate: the rule already lives in this file's § Test Rules ("Scoped runs" line) |
| `[plugin]` frontmatter inline comments, marked CLOSED (20260822/02, closed by 20260823/03) | Mechanized; `spec/scripts/lib/frontmatter.js` header owns the full history |
| `[plugin]` skipped-test reconciliation, marked CLOSED (20260815/03) | Mechanized 2026-08-16; `ac-matrix.js` + its tests own the class lesson |
| `[host]` intake-closed worked examples + JJ-20260815-03 contrast (2026-08-15) | Meta-entry recording two closures; the obligation→carrier sweep it defers to is the mechanism |
| `[host]` suite-baseline out-of-plan on pin closure (20260815/03) | Dead citation: `suite-baseline.js` and `.claude/suite-baseline.json` were deleted at v7.0.0 (verified 2026-08-23) |
| `[plugin]` suite-baseline snapshot concurrency / preNewFailing (20260816/03) | Same dead machinery |
| `[plugin]` vacuous-pin pointer to red-check (20260821/01) | Pure pointer; `red-check.js`'s incident header is the named owner |

MERGE → `docs/canonical/scripts.md` — 6 entries (timeless Node/git/testing truths; rewrite per D10, then remove from Gotchas):

| Entry (citation) | Truth to carry |
|---|---|
| `[host]` injected-transport poll loop (20260801/01) | A synchronously-resolving fake starves the macrotask queue; loops over injected transports need an explicit `setImmediate` yield |
| `[host]` flush() vs child process (20260801/03) | No microtask drain observes a real spawn; assertions after a spawn need a bounded real-time `waitFor` |
| `[host]` porcelain untracked collapse (20260805/01) | File-level consumers of `git status --porcelain` need `--untracked-files=all` |
| `[host]` spawnSync vs in-process stub (20260808/01) | `spawnSync` blocks the loop the stub lives on; CLI-against-stub tests use awaited `spawn` |
| `[host]` spawnSync null status / maxBuffer / stdout truncation (20260816/01) | `status` is null on signal/spawn-fail/maxBuffer and `process.exit(null)` exits 0; default maxBuffer 1MB eats the failing-tests trailer; `stdout.write` before `exit` truncates at 64KB — `fs.writeSync(1, …)` |
| `[host]` contiguous regex pin vs split literals (20260816/01) | A prose pin requiring a contiguous sentence cannot see text split across concatenated string literals; keep pinned sentences whole in one literal |

KEEP — 10 entries, unchanged: name-shape guard evasion (20260820/04); red-check AC-ID-in-comments (20260822/02); version-bump race (20260810/02); retired-literal collisions (20260813/07 + 09, 20260814/01); ac-matrix prime-suffix amendment (20260814/04); placeholder AC-ID (20260815/05); stale diff_base under concurrency (20260816/03); orchestrator-compensation recurrence counter (20260821/02); collision-closure inherited-not-retired literals (20260820/08); leg-exit emission-site partition (20260823/03).

The section's trailing HTML comment gains one line: entries are capped at 15, enforced by
`prose-cap.js` at review close and in this repo's suite; appending at cap requires an
eviction (delete / merge / mechanize).

## Acceptance Criteria

- **AC-20260823-06-1**: WHEN prose-cap.js runs against a file whose named section holds more
  entry bullets than the cap THE SYSTEM SHALL exit 1 and print count, cap, and the eviction
  remedy (e.g. fixture section with 16 top-level `- ` entry bullets — tag-first or
  tag-at-end — `--cap 15` → exit 1, stderr contains `16/15` and `evict`) → tests/prose-debt/prose-cap.test.js
- **AC-20260823-06-2**: WHEN the count is at or under the cap THE SYSTEM SHALL exit 0
  (15 entries in either tag position, `--cap 15` → exit 0; indented continuation lines
  inside a wrapped entry never count: a 3-line wrapped entry counts once) → tests/prose-debt/prose-cap.test.js
- **AC-20260823-06-3**: WHEN this repo's suite runs THE SYSTEM SHALL execute prose-cap.js
  against `.claude/rules/spec-pipeline.md` section `Gotchas` at cap 15 and assert exit 0 —
  red against the pre-image (23 entries) and green exactly when the D9 triage lands; this
  test IS the standing enforcement → tests/prose-debt/prose-cap.test.js
- **AC-20260823-06-4**: WHEN review.md and escape.md are read THE SYSTEM SHALL state the
  at-cap eviction duty with the three fates (delete / merge / mechanize) in review's CLOSE
  step and in escape's step-6 `doctrine` branch → tests/prose-debt/doctrine-pins.test.js
- **AC-20260823-06-5**: WHEN memory-sweep runs with a diff list containing a path whose
  repo-relative form or basename appears as a path-shaped token in a note's body THE SYSTEM
  SHALL surface that note as `diff-hit` (e.g. note body citing `ac-matrix.js`, diff line
  `spec/scripts/ac-matrix.js` → `{"path":".claude/agent-memory/…","reason":"diff-hit",
  "matched":"ac-matrix.js"}`) → tests/prose-debt/memory-sweep.test.js
- **AC-20260823-06-6**: WHEN ≥10 review-stage ledger rows postdate a note's last git commit
  THE SYSTEM SHALL surface it as `ttl-expired`, oldest git date first, at most 3 per run
  (e.g. 5 expired notes → exactly the 3 oldest listed; a 6th note at 9 rows → not listed)
  → tests/prose-debt/memory-sweep.test.js
- **AC-20260823-06-7**: WHEN no note intersects the diff and none is expired THE SYSTEM
  SHALL print `{"notes":[]}` and exit 0 → tests/prose-debt/memory-sweep.test.js
- **AC-20260823-06-8**: WHEN invoked with an unreadable `--root`, `--diff`, or ledger THE
  SYSTEM SHALL exit 2 naming the remedy; WHEN the sweep completes THE SYSTEM SHALL exit 0
  regardless of finding count (never a verdict input) → tests/prose-debt/memory-sweep.test.js
- **AC-20260823-06-9**: WHEN review.md's CLOSE step is widened by D8 THE SYSTEM SHALL
  CONTINUE TO name `.claude/agent-memory/` disposal with the fates "carry, correct, or
  delete" and cite no `§ Feedback Loop` — the existing AC-20260821-02-10 test in
  tests/run-ledger.test.js is the covering test, tagged with this AC-ID
- **AC-20260823-06-10**: WHEN `spec-paths prose-cap` or `spec-paths memory-sweep` runs THE
  SYSTEM SHALL print a path to an existing file → tests/prose-debt/prose-cap.test.js

## Assumptions (escalation triggers)

- A1: The entry-head regex `^- \`?\[` counts exactly the 23 current Gotchas entries and no
  continuation lines — **executed 2026-08-23**: `grep -cE '^- \`?\[(host|plugin)\]'
  .claude/rules/spec-pipeline.md` → `23`. **if false:** adjust the regex in D1's contract
  and recount before the triage lands.
- A2: `git log -1 --format=%cI -- <note>` yields the note's last-commit ISO date —
  **executed 2026-08-23** against `doctrine-regex-linewrap.md` → `2026-08-14T11:44:10-07:00`.
  **if false:** memory-sweep exits 2 (git not answering).
- A3: Review closes are countable as `"stage":"review"` rows in `.claude/spec-runs.jsonl` —
  **executed 2026-08-23**: `grep -c` → `111` rows. **if false:** memory-sweep exits 2.
- A4: No test pins a literal from the 13 evicted entries — **executed 2026-08-23**:
  `rg "suite-baseline" tests/` → one hit, inside an assert *message* in
  tests/review/verdict.test.js (historical mention, not a pin); stems for the other evicted
  entries hit only fixtures and unrelated files. **if false:** update the colliding pin in
  place and retag with this spec's AC-ID (per the retired-literal gotcha, which stays).
- A5: The dead-machinery claim behind two deletions — **executed 2026-08-23**:
  `ls spec/scripts/suite-baseline.js .claude/suite-baseline.json` → both `No such file`.
  **if false:** those two entries move from DELETE to KEEP and the post-triage count is 12.
- A6: AC-3's live-file test is red on the pre-image by arithmetic (23 > 15), satisfying
  build's red check without a `[pre-green:]` tag. **if false:** STOP — the triage table was
  applied before the test batch; re-run the batch order per build doctrine.

## Rationale

The cap trades a truth problem for a scarcity problem, and that trade is accepted with open
eyes: staleness and importance are uncorrelated, so a rare-but-fatal trap is exactly what a
pressured evictor might delete. The accepted asymmetry: a re-bitten trap produces an escape
ledger row and re-enters § Gotchas at higher confidence; a stale entry misleading a planner
produces nothing, ever. Two entries citing machinery deleted at v7.0.0 sat unnoticed for
six days — the strongest single piece of evidence that nothing reads untouched entries.

D13 reopens 20260821/02 D10 ("no memory-review gate, no lint" at recurrence count 1)
legitimately: the class recurred 2026-08-23 when a gate-scripts note was falsified by the
same diff that shipped it and was caught only because the diff happened to touch the note's
own file. Admission bar for the pair of standing guards, class *stale entry retained on a
read path*: **Portability** — entry counting and path/date intersection are stack-agnostic.
**Generality** — members: the CLOSED-but-retained skipped-test entry (2026-08-16), the
CLOSED-annotated frontmatter entry (2026-08-23), the false memories of 20260821/02, the
falsified note of 20260823/03; at least two are not this spec's trigger. **Materiality** —
23 entries in 23 days; 2 dead-cited for 6 days; counted from the file and git history, not
claimed. **Falsifiability** — AC-3 is deliberately red on the pre-image; the build's red
check records the red run. **Removability** — kill question, ledger-answerable: "of the
last 20 review closes, how many evictions were re-added by escape rows?" (near all →
the cap deletes what reality keeps re-teaching; retire it).

Collision-closure waive (2026-08-23, lock): the one `likely` hit,
`tests/consistency/entrypoints.test.js`, is the entry-point conformance guard doing its job —
it auto-inventories the two new scripts by location; conformance (Worker Rules header, exit
codes) and callers (spec-paths keys + review.md invocation) are build deliverables already in
the File Plan, so the guard needs no edit and would flag only a build defect.

Known cosmetic drift accepted: comments in `red-check.js` and `fleet-reader.js` cite "the
spec-pipeline.md [host] gotcha" for the spawnSync-null truth, which moves to
`docs/canonical/scripts.md`; the comments stay (unchecked prose, history intact). Roadmap
brief 13 (deviations-sidecar shape validation) is adjacent and untouched — this spec governs
what accumulates *after* a fold, brief 13 governs the fold's inputs. Cap 15 and TTL 10 were
put to JJ with an override offer on 2026-08-23 and taken as blessed; the burst cap of 3 and
the body-grep-not-frontmatter simplification are this plan's derivations.

**Deviation folded at review close (2026-08-23).** D12 named 7.24.0 as the version-bump
target ("a target, not a pin, per the version-race gotcha"). By doctrine-layer edit time
`spec/.claude-plugin/plugin.json` was already at 7.25.0 from a concurrent spec, so the bump
landed on the next free version, 7.26.0, and the `description` changelog's last-3-versions
window now reads 7.26.0 / 7.25.0 / 7.24.0, dropping 7.23.0. One-off: the host rules' Gotchas
section already carries the stale-version-target entry that predicted and prescribed exactly
this remedy, so no new Gotchas entry is minted.

**Memory disposition at this close (2026-08-23), the sweep's first live run.** `memory-sweep.js`
surfaced nine notes (six diff-hit, three ttl-expired) beyond the two files this spec's own diff
touched. Eight were carried with a `reviewed:` stamp; one — `gate-scripts-parallel-batch-corpus-landing`
— was **corrected**: it named the retired `wf-build` workflow as the dispatcher behind the parallel
batches it describes, where `/spec:build` now dispatches workers directly per layer wave. The
concurrency lesson stood; only the machinery name was stale. That is exactly the falsification the
TTL arm exists to catch, and no diff would have surfaced it. Gotchas measured 10/15 after the fold,
so no eviction was owed.

**Contracts amendment (2026-08-23, same-day incident fix per core § Incident Policy).** The
original entry shape `` ^- `?\[ `` required a bullet to OPEN with a bracket tag — a position
no doctrine ever mandated (review.md, escape.md, and the init-generated section comment all
say entries "carry"/"are tagged with" `[host]`/`[plugin]`, positionless). Measured against a
real host, Upwell's `.claude/rules/spec-pipeline.md`: 138 entries, 0 matched — the cap had
never fired there and nothing was ever evicted, while this repo's own tag-first file kept
AC-3 green (authored ≠ activated; second recorded member of the silent-matcher fail-open
class after the AC-ID prefix-collision coverage fail-open, 2026-08-22). Entry is now any
top-level `- ` bullet — the same shape the review driver's sidecar grammar and build.md's
ledger count already use, ending the asymmetry where the fold moved entries from a loose
counter into a strict one. Overcounting fires the cap early, where a human judges at fold
time; undercounting was the defect. Fixed in place with tag-at-end regression and
deliberate-trip tests; no new spec and no standing guard yet (that needs a third class
recurrence). D1 locked only "counts entry bullets" — the regex was a Contracts-level detail,
so no locked Decision is contradicted. A1's executed record above deliberately keeps the
original regex: it is history of what was measured at plan time.

## Canonical Delta

`docs/canonical/scripts.md` (created by this spec's File Plan) closes with a **Prose
budgets** note: the host rules' § Gotchas section is capped at 15 entries, enforced by
`prose-cap.js` (review CLOSE + this repo's suite); appending at cap requires an eviction —
delete, merge here, or mechanize. Agent-memory notes are disposed when a spec's diff touches
what they are *about* (memory-sweep diff-hit) or after 10 undisposed review closes
(ttl-expired); a carry records `reviewed:` in the note's metadata.
