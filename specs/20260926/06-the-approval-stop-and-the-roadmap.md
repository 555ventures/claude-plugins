---
date: 2026-09-26
status: implementing
build_base: design-retool
tier: standard
area: genesis
breaking: false
depends_on: [specs/20260926/05-the-kit-and-the-journey-stories.md]
depended_on_by: []
brief: 30
spiked: 2026-09-26
open_markers: 0
diff_base: 3c076c7612c3d3705164cc1d378160308e3c1fea
---

# The approval stop and the roadmap

## Goal

Genesis stops for JJ once the journey stories exist: the driver verifies that Storybook is serving
every journey story, prints one look stop with a verified URL per journey, and resumes on JJ's
literal `approve`, which freezes the designed set into `docs/design/approval.json`. The roadmap
then derives from that designed set — the ROADMAP step lists the approved journeys and their
screens, and `roadmap-written` places every designed screen in exactly one brief — and the
wireframe's approval record is never read again after the design brief. Journey stories are a
genesis artifact: frozen at approval, never gated afterwards; the composites' state stories are
the living showcase. Done means: on the fixture host, the approval stop refuses to print a URL
while Storybook is down, prints the stop once the index serves the journeys, `design-approved`
writes the record, and ROADMAP's placement check reads screens from it.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | New state `AWAITING_DESIGN_APPROVAL` in `genesis-driver.js`, derived while `marks.journeysDrawn && !marks.designApproved` (or `docs/design/approval.json` has vanished); mark `design-approved`; `journeys-drawn`'s next state becomes `AWAITING_DESIGN_APPROVAL`. (AC-20260926-06-1) | Brief 30 scope 3: one approval stop for JJ, no client gate. |
| D2 | The step probes the live Storybook: `probeIndex(url)` runs `curl -sf -m 3 <url>` through `runChild` where `url` is `design-paths.storybook.indexUrl` when set, else `http://127.0.0.1:<port>/index.json`; the probe succeeds when the exit is 0, the body parses as an index (`entries`) and every id in `status.designStage.journeys.stories` is present. On success the step prints the look stop (Contracts): `🎨 ready for review — http://localhost:<port>/?path=/story/<first journey id>`, one `journey: <j> → http://localhost:<port>/?path=/story/<id>` line per journey in seed order, `composites: <N> state stories`, the fixed reply line, and `Then:` naming `--mark design-approved`. On failure it prints `Storybook is not serving the journey stories on port <port>` plus the reason (`unreachable` \| `index unparseable` \| `missing story <id>`), the session line `Session: start it in the background and re-run the driver: <pm> exec storybook dev -p <port> --ci --no-open` and never a URL. (AC-20260926-06-2, AC-20260926-06-3) | Spiked 2026-09-26: story URLs return 200 for ids that do not exist, so only `/index.json`'s content proves a story is served; one verified URL per look stop (standing rule). The command is for the session, never for JJ. |
| D3 | `--mark design-approved` runs only on the user's literal `approve` (doctrine; the driver cannot see the conversation). It requires `marks.journeysDrawn`, re-runs spec 05's `runStorybookBuild()` and `journeyStoriesCheck` + `stateStoriesCheck` against the fresh index, then writes `docs/design/approval.json` (Contracts): `schemaVersion 1`, `approvedAt`, `storybook.port`, per journey `{ story, file, beats: <beatHash>, screens: [<labels in beat order>] }` from the beats files, and `composites: { <C>: [<states>] }` from the brief. No per-file hash is recorded. On success `marks.designApproved = true`, `status.designStage.approvedAt`, checkpoint `(AWAITING_DESIGN_APPROVAL → ROADMAP)`. (AC-20260926-06-4, AC-20260926-06-5) | The record freezes what JJ approved (which journeys, which beats, which screens) and deliberately carries nothing a later gate could compare a story file against — ADR-0030 (g): frozen after approval, never gated later. |
| D4 | ROADMAP derives from the designed set. The ROADMAP step text adds `Read only:` `docs/design/approval.json`, `docs/design/brief.md` and prints `approved: <j> — <n> beats · screens: <a, b, c> · story: <id>` per approved journey; `handleRoadmapWritten`'s placement check reads its label set from `docs/design/approval.json`'s `screens` when that file exists, and from the seed only when it does not (legacy and skipped-stage hosts). The refusal messages keep their wording (`label(s) not placed …`). (AC-20260926-06-6, AC-20260926-06-7) | Brief 30: the roadmap derives from the designed set after JJ's approval; ADR-0006 narrowed. The doctrine drift (§ Roadmap Decomposition says the step lists journeys; the driver never did) closes here. |
| D5 | After `DESIGN_BRIEF`'s print, no driver code path reads the mock app's `design/approval.json`: `DESIGN_KIT`, `DESIGN_JOURNEYS`, `AWAITING_DESIGN_APPROVAL`, `ROADMAP` and `HANDOFF` succeed with that file deleted. BRIEF (before the design stage) is unchanged. (AC-20260926-06-8) | Brief 30 scope 3: read one last time at DESIGN's entry, never after. |
| D6 | No PNG round is pushed from this stop. Brief 29's spec 03 already owns "genesis's design stop can push a PNG sequence as a `screenshots` round, optional, never a gate"; until that client exists there is no consumer, and a hook with no caller is a mis-slice (plan doctrine § Draft). The doctrine sentence records the option as brief 29's. [no-ac: nothing to build; recorded so the brief's clause is not read as dropped] | Facade-with-no-consumer rule. |
| D7 | Doctrine: `spec/doctrine/genesis.md` § Genesis: Design Stage gains the approval stop (the probe, the look stop shape, `approve` as the one word that marks, the record's fields, "frozen after approval, never gated later", the PNG-round pointer to brief 29), § State Machine names `AWAITING_DESIGN_APPROVAL`, § Roadmap Decomposition says the roadmap derives from `docs/design/approval.json`'s journeys and screens, and § On-disk Handoff gains the record. `spec/doctrine/design.md` § Design Canon gains: JJ approves the designed set in Storybook; no client gate; journey stories are frozen at approval. `spec/commands/genesis.md`'s HANDOFF `bullets` gain `designed set: {J} journeys approved <date>` when the record exists (≤120 lines, read-load ≤500). [no-ac: prose; `citations-check`, the line pins and the read-load pin are the oracles] | Doctrine follows the driver. |
| D4a | Build-time user ruling (2026-09-27): the ROADMAP print prefix is `approved:`, not the lock's `designed:` — spec 20260926/01's retired-literal sweep bans that word across `spec/` and `tests/` (it was the retired frontmatter stamp), and the sweep stays at full strength. D4, the Contracts block, Behavior and AC-20260926-06-6 are amended in place. (AC-20260926-06-6) | JJ picked keeping the ban over narrowing it; only this spec's wording moves. |
| D4b | Build-time user ruling (2026-09-28): `tests/genesis/design-stage-kit.test.js` joins the File Plan. Spec 05's three pins on the old `journeys-drawn → ROADMAP` hand-off (its AC 1, 17 and 18) are updated to expect `(DESIGN_JOURNEYS → AWAITING_DESIGN_APPROVAL)` and, where they assert ROADMAP or HANDOFF, to mark `design-approved` first; nothing they check is loosened and no AC of this spec is added to that file. [no-ac: fixture currency for D1's reshaped chain] | State-machine reshaping strands predecessor pins (pipeline rules Gotchas); JJ chose to fix them here. |
| D8 | Bump via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"`. [no-ac: bump — `plugin-bump.js --check` is the oracle] | Version discipline. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/genesis-driver.js | MODIFY | scripts | D1 state + mark; D2 probe + look-stop text; D3 approval record; D4 ROADMAP text + placement source; D5 (no new reads of the wireframe record); usage list gains `design-approved`; header comment updated |
| spec/doctrine/genesis.md | MODIFY | doctrine | D7 — Design Stage approval rules, chain, Roadmap Decomposition source, on-disk row |
| spec/doctrine/design.md | MODIFY | doctrine | D7 — JJ approves in Storybook, frozen stories; ≤160 lines, AC-20260926-01-8 literals kept |
| spec/commands/genesis.md | MODIFY | doctrine | D7 — HANDOFF bullet for the designed set; ≤120 lines |
| spec/.claude-plugin/plugin.json | MODIFY | other | D8 — `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` |
| tests/genesis/design-stage-approval.test.js | CREATE | tests | AC-20260926-06-1, AC-20260926-06-2, AC-20260926-06-3, AC-20260926-06-4, AC-20260926-06-5, AC-20260926-06-6, AC-20260926-06-7, AC-20260926-06-8 |
| tests/fixtures/genesis/storybook-index/served-index.json | CREATE | tests | a bare `index.json` body (the `kit-and-journeys` entries) served to the probe through a `file:` `indexUrl` |
| tests/genesis/design-stage-kit.test.js | MODIFY | tests | D4b — spec 05 pins re-targeted through the approval stop |

## Contracts

The look stop (D2), rendered:

```
## Step: JJ approves the designed set in Storybook
Read only: docs/design/brief.md, .claude/genesis/design-paths.json
Doctrine: spec/doctrine/genesis.md § Genesis: Design Stage
🎨 ready for review — http://localhost:6006/?path=/story/journeys-first-visit--default
journey: first-visit → http://localhost:6006/?path=/story/journeys-first-visit--default
journey: daily-check → http://localhost:6006/?path=/story/journeys-daily-check--default
composites: 5 state stories
Reply `approve` to record the approval; anything else is a note for this session to act on, then re-run the driver.
Then (only on the literal `approve`):
  node <driver> --root <root> --mark design-approved
```

The refusal print (D2), Storybook down:

```
## Step: JJ approves the designed set in Storybook
Storybook is not serving the journey stories on port 6006 — unreachable
Session: start it in the background and re-run the driver: npm exec storybook dev -p 6006 --ci --no-open
```

`docs/design/approval.json` (D3):

```json
{ "schemaVersion": 1, "approvedAt": "2026-09-26T10:12:00.000Z", "storybook": { "port": 6006 },
  "journeys": {
    "first-visit": { "story": "journeys-first-visit--default", "file": "src/journeys/first-visit.journey.stories.tsx",
                     "beats": "3f9a1c2b4d5e", "screens": ["home", "booking"] },
    "daily-check": { "story": "journeys-daily-check--default", "file": "src/journeys/daily-check.journey.stories.tsx",
                     "beats": "8c0d2e4f6a1b", "screens": ["home", "day"] } },
  "composites": { "BookingSheet": ["Idle", "Saving", "Error"], "DestructiveConfirmDialog": ["Idle", "Confirming"] } }
```

ROADMAP step lines (D4), appended after the existing text:

```
approved: first-visit — 2 beats · screens: home, booking · story: journeys-first-visit--default
approved: daily-check — 2 beats · screens: home, day · story: journeys-daily-check--default
```

`design-paths.storybook.indexUrl` (D2, optional): when present the probe fetches it instead of the port URL — tests set `file:///<fixture>/served-index.json`; `curl -sf` reads `file:` URLs natively.

## Behavior

The session runs Storybook in the background (tracked, stopped before the session ends — the
standing no-resident-daemons rule), re-runs the driver, and prints the look stop verbatim, ending
its turn. JJ walks each journey in the Interactions panel. On `approve` the session marks; on
anything else it acts on the note, re-runs the driver and prints the stop again. The mark rebuilds
the static export once more, checks the same index invariants spec 05 checked, and writes the
record. ROADMAP then reads the record: each `approved:` line is a candidate brief slice; the
placement check requires every designed screen in exactly one brief's `surfaces` block.

## Acceptance Criteria

- **AC-20260926-06-1**: WHEN `--mark journeys-drawn` is accepted THE SYSTEM SHALL print `(DESIGN_JOURNEYS → AWAITING_DESIGN_APPROVAL)` and `--state` SHALL print `AWAITING_DESIGN_APPROVAL\n`; WHEN `design-approved` has been accepted and `docs/design/approval.json` is deleted THE SYSTEM SHALL derive `AWAITING_DESIGN_APPROVAL` again → writes tests/genesis/design-stage-approval.test.js
- **AC-20260926-06-2**: WHEN the bare run prints `AWAITING_DESIGN_APPROVAL` with `storybook.port` set to a closed port and no `indexUrl` THE SYSTEM SHALL print `Storybook is not serving the journey stories on port <port> — unreachable`, a `Session:` line containing `storybook dev -p <port> --ci --no-open`, and no line containing `http://localhost`; WHEN `indexUrl` is a `file:` URL to an index lacking `journeys-daily-check--default` THE SYSTEM SHALL print `missing story journeys-daily-check--default` and no `🎨` line → writes tests/genesis/design-stage-approval.test.js
- **AC-20260926-06-3**: WHEN `indexUrl` serves the `served-index.json` fixture holding both journey ids THE SYSTEM SHALL print `🎨 ready for review — http://localhost:6006/?path=/story/journeys-first-visit--default`, the two `journey:` lines in seed order, `composites: 5 state stories`, the reply line containing `approve`, and `--mark design-approved` → writes tests/genesis/design-stage-approval.test.js
- **AC-20260926-06-4**: WHEN `--mark design-approved` runs before `journeys-drawn` THE SYSTEM SHALL exit 2 naming `journeys-drawn`; WHEN it runs with a build stub serving `journey-untagged.json` THE SYSTEM SHALL exit 2 with stderr containing `journey daily-check` and write no `docs/design/approval.json` → writes tests/genesis/design-stage-approval.test.js
- **AC-20260926-06-5**: WHEN `--mark design-approved` runs with the build stub serving `kit-and-journeys.json` THE SYSTEM SHALL exit 0, write `docs/design/approval.json` with `journeys["first-visit"].screens` equal to `["home","booking"]`, `.beats` equal to the beats file's `beatHash`, `.story === "journeys-first-visit--default"`, `composites.BookingSheet` equal to `["Idle","Saving","Error"]`, an ISO `approvedAt`, no key named `hash` or `sha` anywhere in the file, set `marks.designApproved === true`, and print `(AWAITING_DESIGN_APPROVAL → ROADMAP)` → writes tests/genesis/design-stage-approval.test.js
- **AC-20260926-06-6**: WHEN the bare run prints `ROADMAP` on a host with `docs/design/approval.json` THE SYSTEM SHALL print `approved: first-visit — 2 beats · screens: home, booking · story: journeys-first-visit--default` and a `Read only:` line naming `docs/design/approval.json`; on a host whose stage was skipped it SHALL print no `approved:` line → writes tests/genesis/design-stage-approval.test.js
- **AC-20260926-06-7**: WHEN `--mark roadmap-written` runs on a host with `docs/design/approval.json` whose screens are `home, booking, day` and briefs whose `surfaces` blocks place `home` and `booking` only THE SYSTEM SHALL exit 2 with stderr containing `not placed` and `day`; WHEN `day` is added to one brief THE SYSTEM SHALL exit 0 even though the seed file names a fourth label `archive` that no brief places (the seed is no longer the source) → writes tests/genesis/design-stage-approval.test.js
- **AC-20260926-06-8**: WHEN `app/design/approval.json` (the wireframe's record) is deleted after `design-brief-written` THE SYSTEM SHALL still accept `kit-landed`, `journeys-drawn`, `design-approved` and `roadmap-written` and print `HANDOFF` (e.g. `--state` prints `HANDOFF\n` after the four marks with the file absent) → writes tests/genesis/design-stage-approval.test.js

## Assumptions (escalation triggers)

- A1 (executed 2026-09-26, storybook 10.6.0 dev server and 10.5.8 on salon-os): `storybook dev -p <port> --ci --no-open` answers 200 on `/` in about 2 s; `/index.json` serves the same entries and tags as the static build; `/?path=/story/<id>` and `/iframe.html?id=<id>` return 200 for ids that do not exist. — **if false:** unchanged — the probe reads `/index.json`'s content, never a story URL's status.
- A2: `curl` is on PATH on every host this plugin runs on (macOS ships it; the pipeline rules already assume `jq`). — **if false:** the probe falls back to `node -e` with the global `fetch` and the same timeout; record the deviation.
- A3: `curl -sf` reads `file:` URLs (exit 0, body on stdout). — **if false:** the driver reads `file:` URLs with `fs` before calling curl for anything else.
- A4: the fixture build stub and index fixtures from spec 05's File Plan exist when this spec builds (the series lands in order; `depends_on` is enforced at run). — **if false:** STOP — spec 05 has not landed.
- A5: `journeyPlacementCheck`'s callers assert only the refusal wording, not the label source, so swapping the source to the approval record when present leaves the seed-based pins green. — **if false:** the hit is a fix row here, never a weakened pin.

## Rationale

The stop verifies by content, not by status. The spike showed Storybook answering 200 for any
story id, so a URL check would have pointed JJ at a page that may show nothing; the index is the
one thing that proves a story is served. The word `approve` is the same contract the mocks stage
used for the client's screens — the driver cannot hear it, so doctrine binds the session to run
the mark only on that literal.

The record carries no file hashes on purpose. "Frozen after approval, never gated later" means
nothing may later compare a story to what JJ saw; recording a hash would invite exactly that
gate. What is recorded is what the roadmap needs: the journeys, their beats hash and their screens.

The PNG round stays with brief 29: its spec 03 already names this stop as an optional caller.
Building a push hook now would be a facade with no consumer.

Rejected: probing through the plugin's look server (retired with brief 27); a static-export
review URL served by the driver (a second server; the dev server already runs for the session);
approval by editing a file (the literal reply is the one control JJ already knows).

## Canonical Delta

docs/canonical/genesis.md § Driver: after `DESIGN_JOURNEYS` the driver enters
`AWAITING_DESIGN_APPROVAL`, probes `/index.json` on the paths file's port (or `indexUrl`) for every
journey story id and prints one verified URL per journey; `--mark design-approved`, run only on
the user's literal `approve`, rebuilds the static export, re-checks the index and writes
`docs/design/approval.json` (journeys with story id, file, beats hash and screens; composites with
their states; no file hashes). ROADMAP lists the designed journeys and the placement check reads
screens from that record when it exists. The wireframe's `design/approval.json` is never read
after `DESIGN_BRIEF`'s print. No PNG round is pushed from genesis until brief 29's client exists.

docs/canonical/design.md § The design contract is code: JJ approves the designed set in
Storybook; there is no client gate; journey stories are frozen at approval and never gated later.
