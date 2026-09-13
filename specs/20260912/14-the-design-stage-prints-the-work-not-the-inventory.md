---
date: 2026-09-12
status: implementing
build_base: main
tier: standard
area: design
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
spiked: 2026-09-12
open_markers: 0
diff_base: 726ad6297196de94fed28242f85777b82e87d937
---

# The design stage prints the work, not the inventory

## Goal

`design-atlas.js check` and `mocks-driver.js notes open` print output proportional to how
big the project is, not to what is wrong with it. A check run over a 6-screen fixture with a
kit family spends 1,811 bytes on 13 lines, of which one line is the verdict and twelve are a
per-screen inventory that repeats verbatim on every run; the same shape at 500 screens is
tens of kilobytes, and the check runs many times in a design session. `notes open` reprints
every question the project has ever answered, forever, plus every open note however many
there are. Done means: both commands print the verdict, the counts that are decided against,
and everything that is actually wrong — the per-screen detail and the full history stay
reachable behind one flag each, byte-identical to today's output. No consumer, gate, refusal
or served page changes behavior.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `design-atlas.js check` gains `--verbose` (added to the token filter that builds `paths`, beside `--matrix` and `--states`, so it is never read as a path). Without it, the `warnLines` array is not printed line by line; instead, when it is non-empty, exactly one line prints **in the same position warns print today** (before the `CHECK FAIL`/`CHECK PASS` block): `⚠️ <n> warn(s) — --verbose to list`. When it is empty nothing prints, exactly as today. With `--verbose`, every warn line prints exactly as today (AC-20260912-14-1, AC-20260912-14-3, AC-20260912-14-4) | The advisory lines are ~88% of a passing run's bytes and are the term that scales with screens, not with findings. They announce work the session is already doing and that the gates refuse on later; the count keeps the signal, the flag keeps the detail. |
| D2 | The per-label `  ⓘ <label>: <n> kit, <m> bespoke` lines (`kitInfoLines`) print **only** under `--verbose`. The final `  ⓘ unabsorbed total: <m> across <k> screen(s)` line is unchanged in every respect — same text, same `m > 0` condition, same position after the CHECK block on both the pass and the fail path. D15 of specs/20260907/04 (the reason leads, the statistic follows) is preserved verbatim (AC-20260912-14-2, AC-20260912-14-3) | The unabsorbed total is the running number the kit escape is approved against (specs/20260907/04 D6) and is one line whatever the project's size; the per-screen breakdown behind it is one line per screen and is read by nothing. |
| D3 | `mocks-driver.js notes open` gains `--all` (`cmdNotes` passes its `args` through to `cmdNotesOpen`, which reads `--all` from them; no other subcommand changes). Without it, `questionLines`'s answered block collapses to one line, `answered: <n> — --all to list`, printed in the same position the `answered:` header prints today, and only when `<n> > 0` — exactly today's emptiness condition. With `--all`, the block prints exactly as today (AC-20260912-14-6, AC-20260912-14-8) | An answered question is settled history that is never pruned, so this block only ever grows. It is the one term in `notes open` that is unbounded in project *history* rather than in open work. |
| D4 | Without `--all`, the journey → screen → state listing of plain notes stops after **20** note lines (`NOTE_LIST_CAP = 20` in `mocks-driver.js`): the walk breaks out of each of the three nested levels while `printed >= cap`, so a group header is never emitted without at least one note under it, and one tail line `… <n> more open note(s) — --all to list` prints after the listing and **before** the existing `⚠️ a project note is open …` line, where `<n>` is the number of journey-listed notes not printed. The questions block, the `📝 open notes:` counts line and the project-notes block are **never** capped. With `--all` the cap does not apply and no tail line prints (AC-20260912-14-7, AC-20260912-14-8, AC-20260912-14-9) | Open notes are real work, but they accumulate across a whole draw pass before any are resolved, so the listing needs a bound; a stateless cap gives one without storing what was last seen, without writing to a git-tracked file and without a path where a note can be hidden. Project notes block every other note by design, so capping them would hide the thing that gates the rest. |
| D5 | No consumer changes. All seven `runDesignAtlasCheck` call sites in `mocks-driver.js` and both `design-atlas.js check` spawns in `genesis-driver.js` keep reading `r.status` only, keep embedding `childOutput(r)` verbatim in their refusals, and pass **no** new flag; violations continue to print in full on the fail path, so every refusal still carries its whole reason (AC-20260912-14-5) | Nothing parses this stdout — the change is safe precisely because the verdict has always been the exit code. Passing `--verbose` from a gate would reinstate the inventory inside every refusal message. |
| D6 | Doctrine, one home: `spec/doctrine/mocks.md` § Mocks: Authoring Rules' kit bullet replaces "prints the running count, `ⓘ <label>: <n> kit, <m> bespoke`, on every run" with the running unabsorbed total on every run and the per-screen count under `--verbose`; § Mocks: Page Notes gains the read-back rule (the answered block and a long note list are summarised, `--all` prints them whole). **The file's total line count may not increase** — tighten adjacent prose in the same edit `[no-ac: prose contract; review's citations-check and doctrine legs are the oracle, and the read-load budget test is the mechanical one; the behaviors are AC-20260912-14-2 and AC-20260912-14-6]` | Core § Doctrine Authoring: the script is the mechanism, prose points at it. The line-count constraint is A5's measured budget, not a style preference. |
| D7 | Bump `spec/.claude-plugin/plugin.json` to the next free minor via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` — never a hand-edited version literal `[no-ac: review's version-bump check is the oracle]` | § Planning version discipline. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/design-atlas.js | MODIFY | scripts | D1 `--verbose` in the token filter and the warn-line collapse; D2 `kitInfoLines` gated on `--verbose` with the unabsorbed-total line untouched; the `check` usage line in the header comment gains `[--verbose]` |
| spec/scripts/mocks-driver.js | MODIFY | scripts | D3 `cmdNotes` passes `args` to `cmdNotesOpen`, which reads `--all`; `questionLines` gains the collapse; D4 `NOTE_LIST_CAP` and the capped three-level walk plus its tail line |
| spec/doctrine/mocks.md | MODIFY | doctrine | D6 the kit bullet reworded and the § Mocks: Page Notes read-back rule, at no net line cost |
| tests/mocks/bounded-output.test.js | CREATE | tests | AC-20260912-14-1, AC-20260912-14-2, AC-20260912-14-3, AC-20260912-14-6, AC-20260912-14-7, AC-20260912-14-8 |
| tests/mocks/bounded-output-pins.test.js | CREATE | tests | AC-20260912-14-4, AC-20260912-14-5, AC-20260912-14-9 — every criterion in this file is a `SHALL CONTINUE TO` pin, so the whole file is green against the pre-image by construction |
| spec/.claude-plugin/plugin.json | MODIFY | other | D7 bump via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` |

## Contracts

```
design-atlas.js check <file|dir>… [--matrix] [--states] [--verbose]
  Exit codes unchanged: 0 pass · 1 violations · 2 usage/precondition

  default, warns present, kit family present, some region unabsorbed:
    ⚠️ 6 warn(s) — --verbose to list
    CHECK PASS (6 file(s))
      ⓘ unabsorbed total: 3 across 2 screen(s)

  default, no warns, no kit family (byte-identical to today):
    CHECK PASS (2 file(s))

  default, violations present (violations always print in full):
    ⚠️ 6 warn(s) — --verbose to list
    CHECK FAIL (2 violation(s) across 22 file(s)):
      - signin.html: missing state(s) loading, error — every wireframe carries its …
      - invite.html: missing state(s) error — every wireframe carries its …
      ⓘ unabsorbed total: 3 across 2 screen(s)

  --verbose: byte-identical to the pre-change run on every path — every `  ⚠️ <f>: <text>`
  line, then the CHECK block, then every `  ⓘ <label>: <n> kit, <m> bespoke` line, then the
  unabsorbed total.
```

```
mocks-driver.js notes open [--all]
  Exit code unchanged: 0

  default:
    ❓ questions: 1 open
    onboarding
      signin
        W7 [N012] single-use link
    answered: 37 — --all to list
    📝 open notes: 31 (1 project · 30 mock) · addressed: 4
    project
      N005 [open] Ren · The direction is wrong — too much chrome for a phone-first product.
    onboarding
      signin
        default
          N004 [open] JJ · …            ← at most 20 note lines across all journey groups
    … 11 more open note(s) — --all to list
    ⚠️ a project note is open — answer it (canon change or new directions) before any mock note

  --all: byte-identical to the pre-change run — the full `answered:` block and every
  journey-listed note, with no tail line.
```

## Behavior

The check's warn collapse sits at exactly one place: the loop that writes `warnLines` to
stdout. Nothing upstream changes — findings are still collected, still tiered warn-vs-violation
by `data-status`/`--matrix` exactly as today, and `warnLines.length` is the count printed. A run
at `--matrix` promotes those same findings to violations, so a gate call sees few or no warns
and its refusal is unaffected in substance.

The note cap walks the existing `journeys` map (journey → screen → state → notes) in its
current order and stops emitting the moment 20 note lines have been written, breaking out of
each nested level rather than emitting an empty header. The omitted count is the total number
of notes in that map minus the number printed — project notes are outside the map and are
never counted or capped. Under `--all` the cap is not applied at all, so the walk and its
output are the pre-change walk and output.

Both flags are additive tokens with no value, parsed by the existing hand-rolled style: the
check filters `--verbose` out of its path list the way it already filters `--matrix` and
`--states`; `notes open` reads `--all` from the argv tail `cmdNotes` already receives and
currently discards.

## Acceptance Criteria

- **AC-20260912-14-1**: WHEN `check` runs over a directory of six labeled `data-status="sketch"` mocks that each carry one unmarked content region, with a `design/kit/` family resolving above them, THE SYSTEM SHALL print exactly one warn line, `⚠️ 6 warn(s) — --verbose to list`, print no line beginning `  ⚠️ `, and exit 0 → writes tests/mocks/bounded-output.test.js
- **AC-20260912-14-2**: WHEN `check` runs over that same fixture THE SYSTEM SHALL print no line matching `  ⓘ <label>: <n> kit, <m> bespoke`; and WHEN one mock carries a `data-bespoke="sheet: two-column body"` region so the unabsorbed total is non-zero, it SHALL still print `  ⓘ unabsorbed total: 1 across 1 screen(s)` after the `CHECK PASS (` line → writes tests/mocks/bounded-output.test.js
- **AC-20260912-14-3**: WHEN `check --verbose` runs over that same fixture THE SYSTEM SHALL print the six `  ⚠️ ` lines, then `CHECK PASS (6 file(s))`, then the six `  ⓘ <label>: <n> kit, <m> bespoke` lines — 13 lines total, the pre-change output — and SHALL NOT treat `--verbose` as a path (no `no such path` message, exit 0) → writes tests/mocks/bounded-output.test.js
- **AC-20260912-14-4**: WHEN `check` runs over two labeled token-consuming mocks in a tree with no `design/kit/` and no warn-producing finding THE SYSTEM SHALL CONTINUE TO write exactly `CHECK PASS (2 file(s))\n` to stdout, SHALL CONTINUE TO print no line containing `ⓘ`, and SHALL CONTINUE TO exit 0 → writes tests/mocks/bounded-output-pins.test.js
- **AC-20260912-14-5**: WHEN `check --states` runs over two labeled mocks that each declare only `data-state-btn="empty"` THE SYSTEM SHALL CONTINUE TO print the headline `CHECK FAIL (2 violation(s) across 2 file(s)):` followed by one `  - ` line per violation, each naming its file and `missing state(s) loading, error`, and SHALL CONTINUE TO exit 1 → writes tests/mocks/bounded-output-pins.test.js
- **AC-20260912-14-6**: WHEN `notes open` runs on a root whose notes hold one open question and three answered questions THE SYSTEM SHALL print `answered: 3 — --all to list` and SHALL NOT print any `  <id> [<ledgerId>] yes` or `  <id> [<ledgerId>] no → "…"` row; WHEN no question has been answered it SHALL print no `answered` line at all → writes tests/mocks/bounded-output.test.js
- **AC-20260912-14-7**: WHEN `notes open` runs on a root holding 25 open `scope:"mock"` notes spread over a journey's screens THE SYSTEM SHALL print exactly 20 note lines under the journey groups and then the line `… 5 more open note(s) — --all to list`, placed after the last note line and before the `⚠️ a project note is open` line when one is present, and SHALL print no journey, screen or state header that is followed by no note line → writes tests/mocks/bounded-output.test.js
- **AC-20260912-14-8**: WHEN `notes open --all` runs on that same 25-note root with three answered questions THE SYSTEM SHALL print all 25 note lines, print the full `answered:` block with one row per answered question, and print no line containing `more open note(s)` or `--all to list` → writes tests/mocks/bounded-output.test.js
- **AC-20260912-14-9**: WHEN `notes open` runs on a root with one open project note, two open mock notes on a seeded journey's screen, one addressed mock note and one open question THE SYSTEM SHALL CONTINUE TO print `❓ questions: 1 open` as its first line, SHALL CONTINUE TO print the counts line `📝 open notes: 4 (1 project · 3 mock) · addressed: 1`, SHALL CONTINUE TO print the `project` block with its note before any journey group, and SHALL CONTINUE TO end with `⚠️ a project note is open — answer it (canon change or new directions) before any mock note` → writes tests/mocks/bounded-output-pins.test.js

## Assumptions (escalation triggers)

- A1: The advisory lines, not the kit inventory, are the bulk of a passing check's output.
  **Executed 2026-09-12** against a generated 6-screen fixture with a resolving `design/kit/`
  family at `data-status="sketch"`: `check <dir>` exited 0 and wrote 1,811 bytes over 13
  lines — six `  ⚠️ … region 2 carries neither data-kit nor data-bespoke …` lines (~1,590 B),
  one `CHECK PASS (6 file(s))` line, and six `  ⓘ s<n>: 1 kit, 0 bespoke` lines (~150 B). The
  same fixture under D1+D2 prints two lines. — **if false:** the measured saving shrinks but
  no Decision moves; D1 and D2 are independent and each stands alone.
- A2: `--verbose` is an unknown token to the pre-image, so AC-3's test is genuinely red.
  **Executed 2026-09-12**: `design-atlas.js check --verbose <dir>` exited **2** with
  `[design-atlas] check: no such path: --verbose`. — **if false:** n/a, executed.
- A3: `cmdNotesOpen` takes no arguments today and `cmdNotes` discards the argv tail for the
  `open` subcommand, so `notes open --all` is **not** red against the pre-image on its own —
  it prints today's full output and exits 0. The redness for the notes half is carried by
  AC-6 and AC-7, whose subject is the **default** run. — **if false:** STOP, ask the user;
  the AC split is what makes the build's red-check honest.
- A4: Nothing in `tests/` asserts any string this spec changes. **Executed 2026-09-12**:
  `grep -rn` across `tests/` for `CHECK PASS`, `notes open`, `ⓘ `, `unabsorbed total` and
  `answered:` returned zero relevant hits (the only `answered:` hit is unrelated prose in a
  CI-query test), and `tests/consistency/design-doctrine.test.js` no longer exists — a prior
  close's expiry sweep removed it. — **if false:** every hit's file enters the File Plan as a
  fix row, updated in place and retagged, never weakened.
- A5: `/spec:mocks`'s read-load is **321 lines against a 325-line cap** (measured 2026-09-12:
  `spec/commands/mocks.md` plus `spec-paths shared-for mocks`). D6's doctrine edit therefore
  has at most four lines of slack and is specified as net-zero. — **if false:** tighten
  adjacent prose in the same edit; `tests/consistency/read-load.test.js` is the oracle, and a
  reflow must not split a literal another check greps whole.
- A6: Every consumer reads the exit code only. **Read 2026-09-12**: all seven
  `runDesignAtlasCheck` call sites in `mocks-driver.js` and both `design-atlas.js check`
  spawns in `genesis-driver.js` branch on `r.status` / `.status !== 0` and interpolate
  `childOutput(r)` (or `stdout || stderr`) verbatim into a refusal; none matches, splits or
  parses the text. — **if false:** that site gets its own File Plan row and passes
  `--verbose` so its parse sees the unchanged shape.

## Rationale

The four candidates the spike examined were not one problem. `check` prints an inventory
nothing reads; `notes open` prints a queue that is mostly the right thing plus two terms that
never prune. That split is why this spec prints less in two different ways rather than
applying one rule twice.

The `lastSeenNote` watermark was rejected on three grounds, all structural. `design/mocks/status.json`
is git-tracked, and `notes open` is today a pure reader — a watermark would make every read a
write to a tracked file, dirtying trees and colliding across parallel worktrees. Note ids are
minted as "highest existing + 1" from a snapshot, and the driver and the serve process write
`notes.json` without a lock by documented design; under a watermark the loser of an id race
never crosses it and the note becomes permanently invisible, where today a duplicate id is a
loud validation error. And mutating a note — answering it, addressing it — does not move its
id, so a watermark bounds output by hiding edits. A stateless cap buys the same bound with
none of that.

Journey scoping was rejected as redundant and unsafe: after D1 and D2 a passing whole-project
run is already two lines, and the spike demonstrated that breaking one shared kit primitive
produced hundreds of project-wide violations of which a journey-scoped run reported only the
handful inside its own screens.

What to watch during execution: the doctrine edit's line budget (A5) and the fact that the
`--all` path must be byte-identical, which means the cap and the collapse are both *skipped*,
never re-implemented with an infinite bound that reorders anything.

**Collision closure (executed 2026-09-12)** over the literals D1, D2, D3 and D6 narrow — `ⓘ`,
`unabsorbed total`, `CHECK PASS`, `answered:`, `notes open` — returns no live hit that needs a
File Plan row, and every one is **waived** here. Outside the stale `.claude/worktrees/` copies,
the live hits are: `spec/doctrine/mocks.md`, `spec/scripts/design-atlas.js` and
`spec/scripts/mocks-driver.js` (all three are File Plan rows); `docs/canonical/design.md` (the
Canonical Delta); `spec/commands/atlas.md`, `spec/commands/sketch.md` and
`spec/scripts/lib/mocks-notes.js`, which name the `notes open` command whose name does not
change; `spec/scripts/lib/shell-region.js`, a comment naming the caller's `ⓘ` line, which still
exists; `tests/review/ci-query.test.js`, unrelated prose; and the five `CHECK PASS` hits
(`spec/commands/doctor.md`, `manifest-check.sh`, `smoke.sh`, `spec-review-driver.js`,
`tests/genesis/tournament.fixtures.js`), none of which contains that literal on a re-grep — the
tier matched a stem, not the string. The `executes` hits were read for fixture repair and need
none: `tests/design-atlas.test.js`'s only stdout assertions are on violation text pushed
unconditionally to `violations` (viewport meta, dark-tokens block) plus one `doesNotMatch` on a
sketch-tier finding that this change only makes safer, and `tests/mocks/wire-register.test.js`
asserts a negative on a violation substring.

The three pins in `tests/mocks/bounded-output-pins.test.js` are deliberate. The literals they
hold — `CHECK PASS (2 file(s))`, the `CHECK FAIL` headline with every violation under it, and
`notes open`'s counts line and project block — were named in five closed specs and asserted by
no test at all, which is how they were free to drift. Those pins outlive this spec's close.
The new collapsed shapes cannot be pinned here: a `SHALL CONTINUE TO` bullet over behavior the
pre-image contradicts hard-stops the build at `broken-pin`, so their tests expire at close like
any other new promise. That gap is the repo's standing expiry question, not this spec's to
settle: queue item q216 already owns the sweep for deterministic legs in these two scripts with
no live test, and this spec re-pins three of them rather than duplicating that item.

`design/mocks/ledger.md` is deliberately out of scope. It was measured at 33KB over 52 rows on
the same host and is the remaining design-stage surface whose printed size tracks project
history, but nothing in it is a `check` or `notes open` concern and folding it in would make
this a three-surface spec. It is queued.

## Canonical Delta

In `docs/canonical/design.md`, the `KIT` paragraph's sentence about the check's output becomes:
`check` prints a running `ⓘ unabsorbed total: <n> across <m> screen(s)` after its CHECK
PASS/FAIL block on every run, and the per-screen `ⓘ <label>: <n> kit, <m> bespoke` breakdown
under `--verbose`; advisory findings at `sketch` collapse to one `⚠️ <n> warn(s) — --verbose to
list` line, while violations always print in full. The rest of the paragraph is unchanged: the
rule still warns at `sketch` and violates at `ratified`/`approved`/`--matrix`,
`journey-approved` still refuses on an unmarked region, and a tree with no `design/kit/` is
still unaffected.

In the same file's page-notes paragraph, add: `mocks-driver.js notes open` summarises what it
would otherwise repeat — answered questions collapse to a count and the journey-listed open
notes stop after twenty with a `… <n> more open note(s)` tail; `notes open --all` prints both
in full. The questions block, the open-notes counts line and the project-notes block are never
summarised, because a project note blocks every other note.
