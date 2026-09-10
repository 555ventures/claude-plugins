---
date: 2026-09-09
status: hardened
tier: critical           # spec-status.js is a named critical trigger (.claude/rules/spec-pipeline.md § Risk Tiers)
area: session-queue
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
open_markers: 0
---

# 🎯 Next carries every startable lane

## Goal

`/spec:status`'s default screen shows every command that can be started right now, not just
the first one. Today the fan-out derivation admits several runnable lanes but the default
`🎯 Next` block prints exactly one of them; the lanes, the `🚦 solo` affordance and the
merge-conflict heads-up only appear under `--all`, inside a `📋 All open work` block that
re-prints the top pick as its first row. After this spec the lane render IS the Next block,
the `📋` header is gone, and `--all` adds only what is genuinely not startable now
(`🕓 after that`, `⛔ blocked`) plus the hygiene catalogue. `--next`, `--next --json`,
`--json`, `--pretty` and `--brief NN` are byte-for-byte unchanged. Done means: a host with
two independent unblocked briefs shows both commands on the default screen, and no runnable
work is reachable only by typing a flag.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | The `🎯 Next` block renders, in this order, in BOTH the default render and `--all`: (a) every `/spec:escape` entry, one bare command line each, in derivation order; (b) the lane render from `laneAdmission(entries)` — when `lanes.length > 1` the `⚡ {n} parallel lanes — first stays on main, each other lane gets a worktree (/git:enter-worktree):` header, one bare command line per lane, then the `🔶` merge-conflict branch lines, all text unchanged from today's `--all` render; when `lanes.length === 1` the single command plus `   └─ 🚦 solo` when `later.length \|\| blocked.length`; (c) when neither (a) nor (b) printed anything and entries exist, `entries[0]`'s command plus its `⏳` blocker branch lines; (d) `   ✨ {nothingNextLine()}` when there are no entries at all. Every command line in (a), (b) and (c) renders through the existing one-line `cmd(e)` helper (AC-20260909-08-1, AC-20260909-08-2, AC-20260909-08-3, AC-20260909-08-4, AC-20260909-08-5, AC-20260909-08-9) | Every admitted lane is startable now, so hiding it behind a flag makes the screen answer a question the user did not ask; one derivation, one render, no second place that decides what "next" means |
| D2 | Lanes are never capped or truncated in the default render — every admitted lane prints (AC-20260909-08-1) | A cap re-creates the defect at a smaller scale: some runnable work visible only under a flag (JJ ruling 2026-09-09) |
| D3 | The `📋 All open work` header is deleted outright — it prints nowhere, under no flag. Under `--all` the `🕓 after that:` and `⛔ blocked:` sections (their branch-line text unchanged) print directly after the `🎯 Next` block's own lines and BEFORE the `⚠️` decide lines; `🧹 Hygiene` keeps its place after the decide lines, ahead of the footer. Nothing the `🎯 Next` block already printed re-prints below it: when branch (c) of D1 fired, `⛔ blocked:` omits that entry (`blocked.filter(e => e !== entries[0])`) and the section is skipped entirely when nothing survives the filter (AC-20260909-08-6, AC-20260909-08-10) | With the lanes in `🎯 Next`, the header would name a block whose first rows already printed above it; `--all` now adds only what is not startable, and the re-printed top pick is exactly the defect this spec exists to remove |
| D4 | Footer: the `· {m} could run in parallel (--all)` clause is deleted (the lanes are on screen). The wait clause keeps today's count `n` and its derivation exactly — only its wording changes: `· {n} more open` when `n > 0` (under every head — `🔴`, `🟠`, `🟢`, `⬜` — exactly as today), and `· nothing else open` in place of `nothing waits behind it` on the `🟢` head at `n === 0` (AC-20260909-08-5, AC-20260909-08-7) | The number stays a true total of open work below the top pick; calling a printed, startable lane "waiting" is the only part that became false (JJ ruling 2026-09-09) |
| D9 | A queue prompt entry (`path: null`) reaching the default `🎯 Next` block renders as the one-line `cmd(e)` row — queue id first, whitespace flattened, cut to the terminal width with a trailing `…` — the same row `--all` already prints for it today; the current default-render special case that prints the raw payload alone is deleted, and the `--next` render keeps that bare payload untouched (D5). `spec/commands/status.md`'s "prints its payload alone" sentence goes with it (AC-20260909-08-9) | A prose item's payload runs to hundreds of words: as a bare line it wraps the whole default screen away, and the `q7` handle is what `spec-queue move\|done\|show` takes; the one-line row already IS the contract everywhere else in the dashboard |
| D5 | Frozen surfaces are untouched: `--next`, `--next --json`, `--json`, `--pretty`, `--brief NN` keep their exact output and exit codes; `laneAdmission`, `deriveNext` and every entry field keep their shapes (AC-20260909-08-8) | .claude/rules/spec-pipeline.md § Risk Tiers: `spec-status.js` is a frozen API for external `--json` consumers; the drivers read `--next`/`--json` and none of them scrape the dashboard |
| D6 | This spec retires acceptance criteria a `done` spec locked, so it ships `docs/adr/0013-next-carries-the-lanes.md` (Applies to: specs/20260903/05-status-diet.md D1, D4, D5 — the "no `⚡`/`🚦` lane render by default" clause of AC-20260903-05-1, the "exactly one command line in the Next block" clause of AC-20260903-05-2, the `· {m} could run in parallel (--all)` and `nothing waits behind it` clauses of D4/AC-20260903-05-5, and the `📋 All open work` header of D5/AC-20260903-05-7 — every other clause of those criteria stands), and `specs/20260903/05-status-diet.md` plus `docs/roadmap/24-status-and-queue-diet.md` (whose acceptance picture quotes the retired footer wording) each gain one `Amended by: ADR-0013` line under their Goal/heading `[no-ac: the ADR and the backlink are planning-seat prose; review's citations-check and the doctrine leg are their oracle]` | ADR-0011 precedent: a criterion a landed spec locked is retired by an accepted record, never by a silent edit |
| D7 | `spec/commands/status.md` is rewritten to the new contract: the default screen's `🎯 Next` block description becomes the lane render (escapes, `⚡`/`🚦`, `🔶`, `⏳`), the "no `⚡`/`🚦` lane render" sentence drops those two glyphs, the footer clause list drops the parallel count and renames the wait clause, and the `--all` section loses the `📋 All open work` bullet and gains `🕓 after that:` / `⛔ blocked:` described as "what you cannot start yet". The rewrite is not limited to that clause list: every restatement of the retired contract anywhere in the file goes with it — the frontmatter `description` line, the narration steps in the Run section, the "no `⚡`/`🚦`/`🕓`/`⛔` lane render" sentence and the "only the lane render, the blocked list and the hygiene catalogue move behind `--all`" sentence, and the "prints its payload alone" queue-row sentence (D9). Grep the file for `📋`, `⚡`, `parallel`, `wait behind` and `payload alone` before calling the row done `[no-ac: doctrine prose, pinned by review's citations-check and the doctrine-without-bump hard check]` | New-surface checklist: the command doc is the human contract for the render and pins the retired block verbatim today |
| D8 | The `spec` plugin bumps via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"`; `size-baseline.json` is re-stamped in the same build with `node scripts/size-ratchet.js --root . --update` (the render change can leave `spec-status.js` under its ceiling, which the ratchet reports as `stale` and fails on) `[no-ac: both are gate-enforced — tests/consistency/plugin-bump.test.js and tests/consistency/size-ratchet-live.test.js are the oracles]` | .claude/rules/spec-pipeline.md § Planning (version discipline) and specs/20260908/01 D1: a shrink is a ratchet finding exactly like a growth |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/spec-status.js | MODIFY | scripts | D1/D3/D4: move the lane render into the `🎯 Next` block for both renders, delete the `📋 All open work` header, re-order `🕓`/`⛔` under Next in `--all`, drop the footer's parallel clause and reword the wait clause |
| spec/commands/status.md | MODIFY | doctrine | D7: default-screen `🎯 Next` contract, footer clause list, `--all` section |
| docs/adr/0013-next-carries-the-lanes.md | CREATE | doctrine | D6: amendment ADR — Applies to specs/20260903/05 D1/D4/D5 and the named AC clauses; Amended by: — |
| specs/20260903/05-status-diet.md | MODIFY | doctrine | D6: one `Amended by: ADR-0013` line only |
| docs/roadmap/24-status-and-queue-diet.md | MODIFY | doctrine | D6: one `Amended by: ADR-0013` line only — its acceptance-picture footer line `🟢 next is ready · 2 wait behind it` is retired wording |
| tests/status/status-diet.test.js | MODIFY | tests | AC-20260909-08-2, AC-20260909-08-5, AC-20260909-08-6, AC-20260909-08-7, AC-20260909-08-10 — retag the retired clauses of AC-20260903-05-1/-2/-5/-7; the default-render forbidden-glyph loop drops `⚡` and keeps `⛔`/`🕓`/`📡` |
| tests/spec-status.test.js | MODIFY | tests | AC-20260909-08-1, AC-20260909-08-3, AC-20260909-08-4, AC-20260909-08-8 — lane/`🔶`/escape assertions move to the default render; `🕓`/`⛔` assertions stay on `--all`; the two footer pins asserting `nothing waits behind it` become `nothing else open` (D4) |
| tests/queue/queue-overlay.test.js | MODIFY | tests | AC-20260909-08-9 — the default-render prompt row is the id-led one-line form (D9) |
| spec/.claude-plugin/plugin.json | MODIFY | other | D8: `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` |
| size-baseline.json | MODIFY | other | D8: `node scripts/size-ratchet.js --root . --update` after the script edit |

## Contracts

Render order, default (unchanged blocks elided):

```
🗺️ Roadmap
   …

🎯 Next
{escape command lines, one per /spec:escape entry}
⚡ {n} parallel lanes — first stays on main, each other lane gets a worktree (/git:enter-worktree):
{lane command line}          ← one per admitted lane
   └─ 🔶 {merge-conflict risk lines}
{OR, when exactly one lane}
{lane command line}
   └─ 🚦 solo                ← only when later.length || blocked.length
{OR, when nothing is unblocked}
{entries[0] command line}
   └─ ⏳ {short blocker}

⚠️ {decide line}
   {ask}  {paste}

🟢 next is ready · {n} more open
```

`--all` inserts, between the `🎯 Next` block and the `⚠️` decide lines:

```
🕓 after that:
{command}
   └─ ⛓️|🤷 {reason}

⛔ blocked:
{command}
   └─ ⏳ {short blocker}
```

Footer clause list, in order, each only when non-zero, appended to whichever head the
existing derivation chose (`🔴` / `🟠` / `🟢` / `⬜`): `· {n} more open` (or
`· nothing else open`, printed only on the `🟢` head at `n === 0`), `· {k} more to decide
(--all)`, `· {h} hygiene finding(s) (/spec:doctor)`. Worked example, the mutual-block host:
`🟠 next is blocked · waiting on 01-inflight · 1 more open`.

## Behavior

`laneAdmission(entries)` is unchanged and stays the single fan-out derivation; the render is
the only thing that moves. Its `unblocked` set already excludes `/spec:escape` entries, and
`deriveNext()`'s comparator sorts every blocked entry after every unblocked one — so
`entries[0].blockers.length > 0` implies the whole entry list is blocked, which implies
`lanes` is empty. Branch (b) and branch (c) of D1 are therefore mutually exclusive by
construction: a blocked top pick can never render a lane header under it, and no guard
condition is needed beyond "print (c) only when (a) and (b) printed nothing".

An escape entry and lane one can be different entries (the escape ranks first but never
enters the fan-out). Printing (a) then (b) is what keeps the escape from being either
duplicated inside the lane list or dropped when a lane exists.

Branch (c) is the one place the `🎯 Next` block can print an entry that a later `--all`
section would also list: `⛔ blocked:` is built from the same `blocked` array the top pick
came from. D3's filter removes it there, not in the Next block — the top pick keeps its
position, and `⛔` disappears entirely on a single-blocked-entry host rather than printing an
empty header.

A queue prompt entry has `path: null` and no lane claim, so it can only reach the block as
the top pick (branch b's single-lane form or branch c). Both go through `cmd(e)`, which is
what makes its row one line with the `q7` handle in front; the old default-render special
case that printed `top.action` raw is deleted with D9.

The `🚦 solo` line moves with the lanes: its condition (`later.length || blocked.length`)
is evaluated the same way in the default render even though those two sections only print
under `--all` — otherwise the absence of the `⚡` header would silently mean "not
parallelable" again.

## Acceptance Criteria

- **AC-20260909-08-1**: WHEN the default render (no `--all`) runs on a host with three
  hardened specs under three briefs where brief 03 depends on 01 THE SYSTEM SHALL print,
  between `🎯 Next` and the next blank line, exactly `["⚡ 2 parallel lanes — first stays on
  main, each other lane gets a worktree (/git:enter-worktree):", "/spec:run
  @specs/20260701/01-a.md", "/spec:run @specs/20260701/02-b.md"]` and SHALL print no line
  containing `📋` anywhere in its output → tests/spec-status.test.js
- **AC-20260909-08-2**: WHEN the default render runs on a host with one `implementing` and
  two `hardened` briefless specs THE SYSTEM SHALL print, between `🎯 Next` and the next blank
  line, exactly `["/spec:run @specs/20260701/01-billing.md", "   └─ 🚦 solo"]` →
  tests/status/status-diet.test.js
- **AC-20260909-08-3**: WHEN the default render runs on a host whose two admitted lanes share
  a File Plan path THE SYSTEM SHALL print the `⚡ 2 parallel lanes` header, both lane
  commands, and a `   └─ 🔶 merge-conflict risk: {path}` branch line under them, all inside
  the `🎯 Next` block (literal: the `🔶` line is the last line of the block) →
  tests/spec-status.test.js
- **AC-20260909-08-4**: WHEN the default render runs on a host with one red-observation done
  spec and two independent unblocked hardened specs THE SYSTEM SHALL print the
  `/spec:escape @{path}` line as the FIRST line of the `🎯 Next` block, the `⚡ 2 parallel
  lanes …` header and both lane commands after it, and SHALL print the `/spec:escape` line
  exactly once in the whole output → tests/spec-status.test.js
- **AC-20260909-08-5**: WHEN the default render runs on a host where every open entry is
  blocked THE SYSTEM SHALL print the top entry's command followed by `   └─ ⏳ 01-inflight`
  and no line containing `⚡` or `🚦`, with the footer exactly `🟠 next is blocked · waiting on
  01-inflight · 1 more open` as the last non-empty line →
  tests/status/status-diet.test.js
- **AC-20260909-08-6**: WHEN `--all` runs on a host with two parallel-ok briefs, one serial
  runner-up, one briefless spec and one blocked spec THE SYSTEM SHALL print the `🕓 after
  that:` section and then the `⛔ blocked:` section after the `🎯 Next` block's lane lines and
  before the first `⚠️ ` decide line, with their branch-line text unchanged, and SHALL print
  no `📋 All open work` line (literal: line index of `🕓 after that:` > line index of the last
  lane command, and < line index of the first `⚠️ ` line) → tests/status/status-diet.test.js
- **AC-20260909-08-7**: WHEN the default render runs on a host with an unblocked top pick and
  two other open specs THE SYSTEM SHALL print the footer `🟢 next is ready · 2 more open`, and
  WHEN it runs on a host with a single open spec and one hygiene finding THE SYSTEM SHALL
  print the footer `🟢 next is ready · nothing else open · 1 hygiene finding (/spec:doctor)`,
  and SHALL print no `could run in parallel` text in either output →
  tests/status/status-diet.test.js
- **AC-20260909-08-8**: WHEN `--next`, `--next --json`, `--json`, `--pretty` and `--brief NN`
  run THE SYSTEM SHALL CONTINUE TO emit the lean single-pick `--next` render (literal:
  `🎯 Next\n/spec:run @specs/20260701/02-ready.md`), the `["next"]` and
  `["anomalies","briefs","specs","superseded"]` top-level key sets, the `--pretty` no-op
  identity, and the `--brief` preflight exit codes → tests/spec-status.test.js
- **AC-20260909-08-9**: WHEN the default render runs on a host whose top pick is an undone
  free-text queue item (`id: q7`, `kind: prompt`, payload `Backfill the escape ledger`) THE
  SYSTEM SHALL print that row inside the `🎯 Next` block as the one-line id-led form (literal:
  the row matches `/^q7 +Backfill the escape ledger$/`, and no line of the output is the bare
  payload without its id) → tests/queue/queue-overlay.test.js
- **AC-20260909-08-10**: WHEN `--all` runs on a host where every open entry is blocked THE
  SYSTEM SHALL print the top entry's command exactly once in the whole output (literal: the
  count of lines equal to that command is 1) and SHALL print the `⛔ blocked:` section only
  when a blocked entry other than the top one exists → tests/status/status-diet.test.js

## Assumptions (escalation triggers)

- A1: `deriveNext()`'s comparator sorts blocked entries last unconditionally, so a blocked
  `entries[0]` implies an empty `lanes` set (executed 2026-09-09: the comparator's first key
  is `(a.blockers.length ? 1 : 0) - (b.blockers.length ? 1 : 0)`) — **if false:** branch (c)
  of D1 gains an explicit `lanes.length === 0` guard; the AC-20260909-08-5 literal is
  unchanged either way.
- A2: The eight existing lane assertions in `tests/spec-status.test.js` pass unchanged when
  their `--all` argument is dropped, because `--all` now adds nothing to the lane render
  itself — **if false:** the failing assertion moves back to an `--all` run and the AC it
  covers is split, never weakened.
- A3: Executed 2026-09-09 against the real script on two synthetic hosts: the multi-lane
  header/lane lines and the `🚦 solo` line render exactly as the AC literals above quote them
  under today's `--all` — **if false:** re-derive the literals from a fresh run before build.
- A4: Re-executed 2026-09-10 at re-lock against the unchanged `spec-status.js` (no commit touched it
  since the draft) on three synthetic hosts (two-lane, mutual-block, solo): the `⚡ 2 parallel
  lanes — …` header, `   └─ 🚦 solo`, the `📋 All open work` header, the `⛔ blocked:` re-print of
  the blocked top pick, and the `· {n} wait behind it · {m} could run in parallel (--all)` footer
  clauses all render exactly as D1–D4 and the AC literals quote them — **if false:** same fallback
  as A3.

## Rationale

The defect is discovery, not derivation. The fan-out already decides correctly which specs
can run at once; the render then throws that answer away unless the user knows to type a
flag. A user who does not already believe parallelism exists never finds it — which is the
same as not having it. JJ's framing settles the naming question too: if a lane is admissible
it is startable, and everything startable is "next".

Two alternatives were rejected. Capping the lane list at a few rows keeps the one-screen
promise but re-creates the same hidden-work defect one level down (D2). Re-deriving the wait
count so it excludes printed lanes was rejected in favour of rewording the clause (D4): the
count stays a true "how much open work is left below the top pick", and only the word
"waiting" — false the moment a lane prints above it — is what changes.

The fragile parts at build time are all orderings. The escape entries must print before the
lane block or they are duplicated inside it; the `🚦 solo` line must move with the lanes or
the absence of `⚡` silently reverts to meaning "not parallelable"; and `🕓`/`⛔` must sit
between the lane lines and the decide lines under `--all`, which is a different position from
the block they used to live in. The retired-literal risk is concentrated in two files that
pin the old text verbatim, both enumerated in the File Plan.

An adversarial read of the draft against the live render (Fable, 2026-09-09) surfaced four
gaps, all folded in rather than rejected: the default screen's raw-payload special case for a
queue prompt row (now D9), the `⛔` re-print of a blocked top pick under `--all` (now D3's
filter), a footer literal that omitted the wait clause the `🟠` head also carries (AC-5), and
two footer pins in `tests/spec-status.test.js` spelled `nothing waits behind it` — a string
the literal sweep below cannot match on the stem `wait behind it`, which is why the sweep
alone is never the closure. It also confirmed A1 against the comparator and found no
uncovered render state among escape-only, zero-entry, unplanned-brief and prompt-entry hosts.

Collision closure at lock (2026-09-09, literals `All open work`, `could run in parallel`,
`wait behind it`): every literals hit is in the File Plan — `spec/commands/status.md`,
`spec/scripts/spec-status.js`, `tests/status/status-diet.test.js` and
`docs/roadmap/24-status-and-queue-diet.md`. The `executes` hits on `spec-status.js` were read
rather than waived: `tests/status/red-alarm.test.js` asserts the `🔴`/`⬜` footer heads and the
`--next --json` escape shape, none of which this spec touches; `tests/queue/queue-overlay.test.js`
and `tests/queue/spec-queue.test.js` assert the `--next` render, frozen by D5;
`tests/replay/*`, `tests/review/review-driver.test.js` and `tests/frontmatter/frontmatter.test.js`
consume `--json`, also frozen. No fixture repair is owed outside the File Plan.

Re-lock 2026-09-10. The 2026-09-09 lock wrote its ledger row but was interrupted before
the status flip, so the spec stayed `draft` behind a `locked` row. On re-open the spec was
renumbered `03` → `08` (`git mv`): `specs/20260909/03-atlas-test-port-and-deadlines.md` (done)
already owns `AC-20260909-03-1..9` and its tests cite those ids, so this spec's identical
prefix would have let the coverage leg count the atlas tests as covering these ACs (the
fail-open class in memory `ac-id-prefix-collision-coverage-fail-open`). Every AC id here is
now `AC-20260909-08-N`; nothing outside this file referenced the old path. The collision sweep
re-run today lists the same four File Plan files in the main tree (8 hits, 0 waived); its
extra hits under `.claude/worktrees/spec-07-…/` are a stale worktree copy of the repo, not
collision sites, and the tool's lack of a worktree exclusion is queued as tooling work.

Nothing was queued at this lock: the change is self-contained in one render plus its two
doc/test pin sites, and the consult found no follow-on work that this spec defers.

## Canonical Delta

No `docs/canonical/` area covers the status render — the command doc (`spec/commands/status.md`,
D7) is its canon and is edited in this spec's File Plan. No delta.
