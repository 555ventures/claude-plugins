---
date: 2026-11-07
status: done
area: queue
depends_on: []
brief: n/a
architecture: true
breaking: false
---

# A finished brief closes itself

## Intent
- You asked: "A finished brief closes itself: when a brief's last spec merges and the brief file lists no open non-spec step, the driver ticks its queue row and reports '📌 auto-closed brief NN (veto anytime)'; replaces spec 20261105/10 D6 'a brief closes when the user says so' (shop-bltr q172 case kept: a brief with open non-spec steps still asks)." (queue item q334)
- I will build:
  - A brief lists the work no spec builds as `- [ ]` boxes under one heading, `## Steps outside specs`; the roadmap template gains that section.
  - When `/spec:run` or `/spec:fanout` merges a brief's last spec and no box there is open, the driver ticks the brief's queue row and prints `📌 auto-closed brief NN (…) — … (veto anytime)`.
  - When a box is still open, the brief stays queued, the run or batch report says how many steps are open, and the queue list and status screen name them.
  - A brief nobody placed in the queue stays there too while a box is open, and leaves once the last box is ticked.
- I will not touch:
  - `reconcile`: it still never ticks a brief, so a brief finished any other way (an in-place run, a last spec superseded, a box ticked after the merge) keeps today's decide line.
  - Brief `status` (`done` = every spec done): the roadmap bar and `after: {brief}` gates read it unchanged (spec 20261105/10 A6).
  - Briefs already finished and still queued: nothing sweeps them; `/spec:queue done NN` closes them as today.
  - `groom`, `queue next`'s skip of a finished brief, `add`'s refusal of an already-queued brief.
- Users will notice: a brief whose last spec merges leaves the queue by itself with a 📌 line, unless its Steps outside specs list an open box; then the report, `/spec:queue list` and `/spec:status` say how many steps are left.
- You lose: the "Close it?" question after the last merge of a brief with no open step.
- Architecture or behaviour change: yes — the driver closes a finished brief, replacing spec 20261105/10 D6; no ADR records D6, so no ADR changes. Needs your yes.
- Client sign-off: whether a finished brief may leave the queue by itself when its last spec merges — JJ chose yes on 2026-11-07 (q334), with open non-spec steps still asking

## Goal

Merging a brief's last spec closes the brief when nothing outside specs is left, so a finished batch reports `nothing needs you`. A brief with an open step stays queued, says how many steps are open, and closes when the user says so, as it does today.

## Decisions

| ID | Decision | Why |
|----|----------|-----|
| D1 | `lib/work.js` `readBriefs` adds `open` to every row: the text of each unchecked task line (`- [ ] x`, also `*`, `+` or `1.` bullets) between a `## Steps outside specs` heading (any case) and the next `## ` heading, with HTML comments stripped first. `[x]` or `[X]` is a closed box. No section gives `[]`. `status` is unchanged. | The brief has no field for work outside specs: Result, Scope and Out of scope all describe spec work. A box anywhere does not work: 11 finished prax briefs each have 4 to 6 open `Design acceptance` boxes and would all go back on the queue. |
| D2 | `lib/land.js` `land()`: when `o.spec` is set and `o.inPlace` is not, it reads the spec's `brief:` before the merge. After its own tick it reads `work.readBriefs(main)`. If that brief is now `done` or `superseded` with `open` empty, it calls `Q.tick(main, (i) => i.kind === 'brief' && work.normBrief(i.payload) === num)`. It returns `brief: {num, name, file, open, closed}` whenever the brief is `done` or `superseded` after the merge. `closed` is true when the tick hit a row, or when the brief is `done` with no open step, because the fill drops it at the same moment. This replaces spec 20261105/10 D6 for a merge; reconcile is untouched. [asked: yes — a finished brief closes itself, 2026-11-07] | Run and fanout both land through `land.js`, and it already ticks the spec row there. Readers write nothing (ADR-0044), so the close belongs to the merge, not to reconcile. |
| D3 | `run.js` `merge()`: when `r.brief.closed`, it calls `decide(state, 'auto-closed brief NN (<name>) — its last spec merged and <file> lists no open step (veto anytime)')`. When `r.brief.open` is not empty, it pushes `brief NN (<name>) has every spec done; N step(s) outside specs still open in <file> — tick them there, then /spec:queue done NN` onto `state.commitWarns`. | The doctrine's 📌 rule line, and the run report's existing warn channel. |
| D4 | `fanout.js` `mergeLane` appends `r.brief` to `s.briefs`. REPORT prints each closed brief once, as a batch pin `📌 auto-closed …` (D3's words, with no `lane N` prefix), and each brief with open steps as a D3 warn. The REPORT `opens` count (`N open item(s) need you`) drops the closed brief with no count change, because `land` ticks before `Q.pending` is read. | Closing a brief is a fact about the queue, not something a lane decided, so it reads as a batch line. Fanout already never runs two specs of one brief in a batch (`waits — shared brief`). |
| D5 | `lib/queue.js` `fill` also adds a brief that is `done` with open steps (the brief condition becomes `(b.status !== 'done' or b.open.length)` and not superseded), so a brief that was never placed stays queued while a box is open. `queue next` still skips it through `finished`. | Without this, an unplaced brief drops out of the fill at its last merge whatever its steps say. That is q172's loss by another route, and 20261106/01 D24 makes every genesis brief unplaced. |
| D6 | `lib/queue-rows.js` `list`: the row of a `done` brief with open steps ends `  ✔ specs done, N step(s) open — /spec:queue done NN`; with none, it ends `  ✔ specs done — /spec:queue done NN` as today. `lib/next.js` `brief-done-queued`: with open steps, `line` and `detail` are `Brief NN (<name>) has every spec done; N step(s) outside specs are still open.`, with the same `ask` and `paste`; with none, today's line. | The question comes up only when there are steps left, so it says how many. Rows and lines without steps, and the goldens, stay byte-identical. |
| D7 | Prose. `spec/templates/roadmap-brief.md` gains `## Steps outside specs` after Out of scope, holding only an HTML comment: one `- [ ] <step>` line per piece of work no spec builds (a vendor account, a cutover, a data load), ticked `[x]` when done; with none open, the brief closes itself when its last spec merges; delete the section if there are none. `spec/commands/queue.md` replaces "closed only by `done`: the driver never ticks it…" with the D2 rule, the 📌 line and the veto (add an open box and the fill brings it back, or `/spec:queue add NN`). In `docs/v8/interface-contract.md`, the `list` row gains the D6 tail and the status paragraph the D6 line. `docs/v8/architecture.md` line 328 says `land` ticks a finished brief with no open step and that `brief-done-queued` asks otherwise. | Genesis writes briefs from this template (genesis.js:66), and queue.md is what operators read. |
| D8 | Tests run every criterion. `tests/work.test.js` covers D1, `tests/run.test.js` covers D2 and D3, `tests/fanout.test.js` covers D4, `tests/queue.test.js` covers D5, D6's tail and the D7 greps, and `tests/status.test.js` covers D6's line. The `AC-20261105-04-6 AC-20261105-10-15` case in queue.test.js is retitled from "never ticked by the driver" to "never ticked by a read", keeping both IDs and its assertions. No test is deleted. | The old title would state a rule this spec retires. |

## File Plan

| Path | Action | Summary |
|------|--------|---------|
| spec/scripts/lib/work.js | MODIFY | `open` steps on each brief row (D1) |
| spec/scripts/lib/land.js | MODIFY | tick a finished brief, return `brief` (D2) |
| spec/scripts/run.js | MODIFY | 📌 line or open-steps warn after `land` (D3) |
| spec/scripts/fanout.js | MODIFY | `s.briefs`, REPORT pin and warn (D4) |
| spec/scripts/lib/queue.js | MODIFY | fill keeps a done brief with open steps (D5) |
| spec/scripts/lib/queue-rows.js | MODIFY | `list` tail with the open count (D6) |
| spec/scripts/lib/next.js | MODIFY | `brief-done-queued` line with the open count (D6) |
| spec/templates/roadmap-brief.md | MODIFY | `## Steps outside specs` section (D7) |
| spec/commands/queue.md | MODIFY | brief close rule, 📌 line, veto (D7) |
| docs/v8/interface-contract.md | MODIFY | `list` tail, status decide line (D7) |
| docs/v8/architecture.md | MODIFY | queue note at line 328 (D7) |
| tests/work.test.js | MODIFY | step parsing (AC-1) |
| tests/run.test.js | MODIFY | solo close, open-steps warn, in-place no tick (AC-2 to AC-4) |
| tests/fanout.test.js | MODIFY | batch pin and Next (AC-5) |
| tests/queue.test.js | MODIFY | fill, tail, doc greps, retitle (AC-6, AC-7) |
| tests/status.test.js | MODIFY | decide line with open steps (AC-6) |

## Acceptance Criteria

- **AC-20261107-05-1**: WHEN a brief's `## Steps outside specs` holds `- [ ] a`, `- [x] b`, `1. [ ] c` and a commented `- [ ] d`, and a `- [ ] e` sits under another heading, THE SYSTEM SHALL give that `readBriefs` row `open: ['a', 'c']`, give a brief without the section `open: []`, and leave both rows' `status` as before.
- **AC-20261107-05-2**: WHEN a solo run merges the last open spec of brief 03 (`rounds`), stored as `q1`, whose file has no open step, THE SYSTEM SHALL write `done` on `q1` and print `📌 auto-closed brief 03 (rounds) — its last spec merged and docs/roadmap/03-rounds.md lists no open step (veto anytime)` in the report; AND the same line SHALL print when brief 03 is not stored (nothing is ticked, and `queue list` no longer shows it), and when the merge leaves a stored brief `superseded` (its row is ticked).
- **AC-20261107-05-3**: WHEN that merge happens with one open box in the brief's Steps outside specs, THE SYSTEM SHALL leave `q1` with no `done`, print no `auto-closed` line, and warn `brief 03 (rounds) has every spec done; 1 step(s) outside specs still open in docs/roadmap/03-rounds.md — tick them there, then /spec:queue done 03`; AND a merge that leaves another spec of brief 03 open SHALL tick no brief item and print neither line.
- **AC-20261107-05-4**: WHEN an in-place run finishes the last spec of a stored brief, THE SYSTEM SHALL tick no brief item and print no `auto-closed` line.
- **AC-20261107-05-5**: WHEN a fanout lane lands the last spec of a stored brief with no open step and nothing else is open, THE SYSTEM SHALL tick the item, print one `📌 auto-closed brief NN` pin with no `lane` prefix in REPORT, and print Next `nothing needs you — queue drained`; AND with one open step it SHALL print the AC-3 warn and Next `nothing runnable — 1 open item(s) need you: /spec:queue list`.
- **AC-20261107-05-6**: WHEN brief 03 is not stored, every spec is done and one box is open, THE SYSTEM SHALL list it as a `—` row ending `  ✔ specs done, 1 step(s) open — /spec:queue done 03`, skip it on `queue next`, and have `status` print `⚠️ Brief 03 (rounds) has every spec done; 1 step(s) outside specs are still open.` then `   Close it?  /spec:queue done 03`; AND once the box reads `[x]` the brief SHALL leave the list and raise no decide line; AND a stored done brief with no open step SHALL keep the `  ✔ specs done — /spec:queue done 03` tail and `Brief 03 (rounds) has every spec done but is still queued.`
- **AC-20261107-05-7**: WHEN `spec/templates/roadmap-brief.md`, `spec/commands/queue.md`, `docs/v8/interface-contract.md` and `docs/v8/architecture.md` are read, THE SYSTEM SHALL find `## Steps outside specs` in the template and in queue.md, `auto-closed brief` in queue.md and architecture.md, and `step(s) open` in the contract's `list` row; AND, with whitespace collapsed, neither queue.md nor architecture.md SHALL contain `the driver never ticks it` or `never ticked by the driver`.

## Assumptions

- A1: No host brief has a `## Steps outside specs` heading today (none of this repo's 39 briefs or prax's 21), so nothing already queued changes until a brief gains the section — if false: that brief stays queued while a box is open, which is the intent.
- A2: Q.tick stays the one way to close a row; 20261106/01 changes how a done brief is stored (its D16), not the call, so the two specs can land in either order — if false: rebase onto it, no Decision changes.
- A3: `lib/queue.js` stays within its 200-line cap, since D5 edits one condition — if false: move the predicate into `lib/work.js` as a `queued` field.
