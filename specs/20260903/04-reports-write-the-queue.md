---
date: 2026-09-03
status: implementing
tier: standard           # report-render.js + command/doctrine prose; no critical-trigger surface (spec-status.js untouched)
area: session-queue
design: false
breaking: false
depends_on: [specs/20260903/03-pipeline-queue-mechanics.md]
depended_on_by: []
brief: 24
open_markers: 0
diff_base: 09e8486f6114b795bf5e0b1ff667b57ca54a640e
---

# Reports write the queue — deferred work is an item, never a sentence

## Goal

Make the pipeline keep its own promises. Every command whose report would say "after X,
do Y" or "this new work goes first" writes that as a queue item **before** the report
renders, and the report shows what it wrote under a `queued` slot. The user reads
`/spec:status`; the Next line is right cold because nothing was left in prose. Done means:
`report-render.js` renders a `queued` slot, and the plan, review, escape, and shared
close-the-loop doctrine each name the exact `spec-queue add …` write they owe.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `report-render.js` gains an optional `queued: [string]` slot rendered as `📋 {text}` lines between `found` and `next`; `📋` joins the double-anchor glyph set; an empty array renders nothing (AC-20260903-04-1, AC-20260903-04-2, AC-20260903-04-3) | The report is the only place the user sees what a command did; a queue write that is not shown is a silent side effect |
| D2 | `spec/doctrine/core.md` § Console Output Style, the **Close the loop** bullet, gains one rule: a deferred action — anything the report would tell the user to do after the current run, or any new spec/brief the session judges must run before the current work — is written as a queue item via `node "$(spec-paths spec-queue)" add …` before the report renders, listed under `queued`, and never narrated as prose; "urgent" is `--top`, "after X" is `--after-spec <path>` / `--after-brief NN`, everything else appends [no-ac: doctrine prose; the observable is D1's slot, and the plan/review/escape sites below are the enforcement points the reviewer reads] | Brief 24 § Scope 3: "a deferred action that appears only as prose is a defect"; the rule lives once, in the shared doctrine, and each command cites it |
| D3 | `spec/commands/plan.md` Lock step 2's discovered-work sentence becomes: write the roadmap brief now (it queues last by itself); if it must run before the current work, `spec-queue add NN --top`; any follow-up that must wait for this spec (a re-mark, a backfill, a second sweep) is `spec-queue add "<paste-ready action>" --after-spec {spec path}`; the report's slots gain `queued` listing each line the script printed [no-ac: doctrine prose, see D2] | This is the session that discovers the most deferred work and today records it only in a memory file the user cannot see |
| D4 | `spec/commands/review.md`'s DONE report gains the same contract: follow-ups surfaced by the deviations fold or the Rationale (a staged fix spec, an owed re-run) are queued — `--top` for a defect fix, `--after-spec` for work gated on this spec's successor — and listed under `queued` [no-ac: doctrine prose, see D2] | Review close is where "next free minor", "owes a re-mark", "run the suite on main" have been narrated and lost |
| D5 | `spec/commands/escape.md` step 7 gains: when the session stages a fix spec or brief for the escaped defect, `spec-queue add <spec path \| NN> --top` and list it under `queued`; the `next` slot rule is unchanged [no-ac: doctrine prose, see D2] | A fix born from an escape is the canonical "ad-hoc high-priority spec" the user named |
| D6 | plugin.json bumps to the next free minor (target 7.74.0) with the changelog paragraph [no-ac: enforced by tests/consistency/plugin-version.test.js] | Behavior change (a new report slot) per § Planning version discipline |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/report-render.js | MODIFY | scripts | `queued` optional array slot: validated like the other arrays, rendered `📋 {text}` between `found` and `next`; `📋` added to `ANCHOR_GLYPHS`; header schema + render-order comment updated |
| spec/doctrine/core.md | MODIFY | doctrine | § Console Output Style "Close the loop" bullet: the deferred-action-is-a-queue-item rule (D2), citing `spec-paths spec-queue` and the `queued` slot |
| spec/commands/plan.md | MODIFY | doctrine | Lock step 2 discovered-work sentence + report slots per D3 |
| spec/commands/review.md | MODIFY | doctrine | DONE report slots + Close step follow-up rule per D4 |
| spec/commands/escape.md | MODIFY | doctrine | Step 7 staged-fix queue write + `queued` slot per D5 |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | Version bump (target 7.74.0, next-free rule) + changelog paragraph |
| tests/report/report-render.test.js | MODIFY | tests | AC-20260903-04-1, AC-20260903-04-2, AC-20260903-04-3 |

## Contracts

`report-render.js` slots schema delta (append-only):

```
queued:  [string]                                             optional, 📋-anchored
Render order (fixed): outcome → bullets → pins → warns → blocks → artifacts → found → queued → next.
```

The `queued` entries are the stdout lines `spec-queue add` printed (e.g. `added q9
(/spec:plan @docs/roadmap/26-x.md, after specs/20260903/04-reports-write-the-queue.md) at
position 2`), glossed in plain English if the command chooses; never pre-anchored.

Doctrine rule (core.md, verbatim target for the Close the loop bullet's addition):

> A deferred action — anything this report would tell the user to do after the current run,
> or a new spec/brief this session judges must run before the current work — is a queue item,
> never a sentence: write it with `node "$(spec-paths spec-queue)" add …` before rendering
> (`--top` when urgent, `--after-spec <path>` / `--after-brief NN` when it waits on something,
> plain otherwise) and list what the script printed under the report's `queued` slot. A
> deferred action that survives only as prose is a defect.

## Behavior

- A command assembles `queued` from the exact stdout of each `spec-queue add` it ran this
  session; zero writes → omit the slot (no blank line).
- The `next` slot is untouched: it still closes with `spec-status --next` verbatim, which now
  reflects the writes just made (the overlay is read live).
- Nothing here writes the queue from a hook or on session start (memory ruling 2026-08-30
  stands); every write is a command's explicit, reported act.

## Acceptance Criteria

- **AC-20260903-04-1**: WHEN a slots file carries `queued: ["added q9 (/spec:plan
  @docs/roadmap/26-x.md) at position 2"]` alongside `found` and `next` THE SYSTEM SHALL render
  `📋 added q9 (/spec:plan @docs/roadmap/26-x.md) at position 2` on its own line after the
  ✨ `found` line and before the `Next:` line (literal render order asserted by line index) →
  tests/report/report-render.test.js
- **AC-20260903-04-2**: WHEN `queued` is `[]` or absent THE SYSTEM SHALL render no 📋 line and
  no blank line (literal: stdout of a slots file with and without `queued: []` is
  byte-identical) → tests/report/report-render.test.js
- **AC-20260903-04-3**: WHEN a `queued` entry arrives pre-anchored (`"📋 added q9"`) or is not
  a string THE SYSTEM SHALL exit 2 naming `queued[0]` and the remedy (literal stderr contains
  `queued[0]`) → tests/report/report-render.test.js

## Assumptions (escalation triggers)

- A1: `report-render.js` treats every optional array slot uniformly through `arrayOf` and the
  anchor set `ANCHOR_GLYPHS`; adding `queued` is one array plus one glyph. **Verified by read
  2026-09-03** (spec/scripts/report-render.js). — **if false:** add a dedicated validator;
  the ACs are unchanged.
- A2: No existing slots file in the repo or a host already uses a `queued` key (it would be
  silently ignored today). **Executed 2026-09-03**: `grep -rn '"queued"' spec/ tests/` → zero
  hits. — **if false:** the key means the same thing; render it.
- A3: Spec 03's `spec-queue add` prints one line per write naming the id, the item, and its
  position — the line the `queued` slot carries. — **if false:** the commands gloss the write
  themselves; the slot contract is unchanged.

## Rationale

The plugin already has one render authority for reports (`report-render.js`) and one
derivation for "what's next" (`spec-status --next`). What it lacked was the bridge: the
moment a command decides something must happen *later*, that decision had nowhere to go but
a sentence in the report, which the next session never reads. This spec adds the smallest
bridge — a slot that shows the write, and a doctrine rule that requires it — and leaves the
mechanics (gates, positions, the `spec` item kind) to spec 03.

Doctrine rows carry `[no-ac]` deliberately: this repo's Test Rules forbid regexes over prose
as tests, and the reviewer's rule-surface read is the enforcement for command prose. The one
mechanical observable — the report line — has its ACs.

Rejected: a hook that scans reports for "after … run" phrasing (fuzzy, and a report-shape
guard is not where a missing write is caught); a `next.kind: 'queued'` variant (the close
must stay `spec-status --next` verbatim); writing the queue from `report-render.js` itself
(a renderer that writes state breaks the render-only contract and the sole-writer rule).

Why no regression pin: this spec adds one optional slot and prose; every existing
`report-render` test exercises slots files without `queued` and stays green by AC-2's
byte-identity, which is the pin.

## Canonical Delta

`docs/canonical/pipeline.md` gains one paragraph under its reporting section:

> Reports never defer work in prose. A command that decides something must happen after the
> current run writes it to the session queue (`spec-queue add …`, `--top` when urgent,
> `--after-spec`/`--after-brief` when gated) before rendering and lists the write under the
> report's `queued` slot; the `Next:` close is still `spec-status --next` verbatim and now
> reflects the write.
