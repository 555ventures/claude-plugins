---
date: 2026-11-05
status: hardened
area: queue
depends_on: []
brief: n/a
architecture: false
breaking: false
---

# Groom comes back

## Intent
- You asked: Restore v7's `/spec:queue groom` on v8, as a port and not a rebuild, proven byte-identical against v7 on the same queue data.
- I will build:
  - `queue.js groom`: v7's four buckets, row format, footer and empty line, ported from `spec-v7-final` onto v8 queue state
  - v7's duplicate and cites-done helpers in `lib/queue.js`
  - groom's view of v7's pending work, including briefs and ad-hoc specs nobody queued
  - v7's session flow in `commands/queue.md`: one haiku check per flagged item, 📌 tick on hard evidence, a question for the rest
  - a test that runs v7's own script beside v8's and compares bytes
  - the reversal of spec 20261105/07's groom removal in the contract and its test
- I will not touch:
  - the stored queue format, so no `/spec:migrate` step
  - `list`, `add`, `next`, `move`, `done`, `show` output or behaviour
  - the other lost queue hygiene: duplicate refusal on `add`, `list` flags, the archive file, `--at`, `--when`; these belong to the parity audit
  - v8's queue model: the file still holds only what was added; groom works out the unqueued work itself
  - `docs/canonical/status.md`, whose hygiene section the audit will correct as a whole
- Architecture or behaviour change: no — it brings back v7 behaviour you named; no architecture or stored-format change
- Client sign-off: none

## Goal

`/spec:queue groom` works again. The script prints exactly what v7 printed on the same queue data and writes nothing. The session then checks each flagged item with a haiku agent, ticks items with hard evidence and asks about the rest, as v7 did.

## Decisions

| ID | Decision | Why |
|----|----------|-----|
| D1 | Port, never rebuild. The source is `spec-v7-final:spec/scripts/spec-queue.js` (`case 'groom'`, `ageDays`, `ageText`, `isStale`, `gateMet`, `dupPairs`, `itemDesc`, `oneLine`, `ROW_WIDTH`) and `spec-v7-final:spec/scripts/lib/queue.js` (`promptTokens`, `jaccard`, `isPathPayload`, `pathIdentity`, `promptDupScore`, `citesDoneSpec`). Constants stay: duplicate threshold 0.35, stale at 14 days, width `process.stdout.columns \|\| 100`. | The standing rule for "same as v7": port the old code onto the new state and diff it against the old output. ADR-0041 sets this pattern. |
| D2 | Output is v7's byte for byte, including the footer's literal `spec-queue done <ref>` words and groom's own `Nd` age, which differs from v8 `list`'s `m/h/d`. | The acceptance test is byte identity. Age in `list` is the audit's question. |
| D3 | The text-bearing helpers read `Q.text(it)`, not `it.payload`: v8 moved a bound fix's spec path into `spec`, where v7 held it in the payload. `itemDesc` prints `brief NN (name)` with `work.normBrief` of the payload and the name from `work.readBriefs`, `spec <payload>`, or `Q.paste` for a prompt. | A bound fix must score and cite exactly as it did in v7. A brief payload may be a path in v8. |
| D4 | Groom's pending set is v7's `isItemDone` on v8 state: an item leaves when `done` is set; a brief item when `work.readBriefs` says `done`; a spec item when its status is `done` or `superseded` or its file is absent. Duplicate brief and spec items keep their first occurrence. Spec status comes from `work.readSpecs`, so a live run reads `implementing`. | v8's `Q.open` keeps a finished brief and a spec whose file vanished open; v7 did not count them. |
| D5 | Groom then adds v7's unqueued work in memory, in v7's order: on-disk briefs with no item, not `done` and no `Superseded by` banner, then ad-hoc specs (no brief) with no item, not `done` or `superseded`, sorted by path. These items are never flagged, because every bucket needs a prompt or an `after` gate, so they change only the `N pending` count on the empty line. | This is all v7's self-filling queue contributed to groom. Filling the queue itself is the audit's first item. |
| D6 | Gate met is `!!it.after && !work.gateWhy(root, it.after, cache)`. | `gateWhy` is v8's port of v7's readiness rule, proven by the status oracle. |
| D7 | Groom writes nothing, including the in-memory ticks `Q.reconcile` makes. Exit is 0 whenever it prints buckets or the empty line. | v7's contract: read-only, the session decides fates through `done`. |
| D8 | v7 refused every `--flag` on groom. v8 keeps that, except `--root`, which every v8 script takes: `groom` with `--json`, `--top`, `--type`, `--after` or any other `--x` exits 2 with `queue: groom: unknown flag <flag>` and writes nothing. | v8's parser pushes an unknown flag into the positionals, so without this check it would be ignored. |
| D9 | `commands/queue.md` gains v7's "groom checks before it proposes" section, with v7's rules unchanged: one `Agent {model: "haiku"}` per flagged item in one message, each only reading the repo, flagged = presumed `done`, `keep` only with the missing piece quoted, `📌 Auto-picked done — <evidence> (veto anytime)` on hard evidence, `AskUserQuestion` at most 4 per call for keep or ambiguous items, never tick without a yes, no agent means no proposal. Each agent gets the repo root and `show <id> --json`, which carries the id, kind and gate that v7's `show` printed. The fates run as `queue.js done <ref>`. `allowed-tools` gains `Agent` and `AskUserQuestion`; the argument hint gains `groom`. | You asked for v7's session flow. v8's plain `show` prints only the text. |
| D10 | `spec/doctrine.md`'s seat table gains v7's row: `queue groom checks \| haiku \| low`. | v7 listed this seat in its table, and a dispatch the table omits would contradict it. |
| D11 | Reverse spec 20261105/07's groom removal: `/spec:queue` in contract § 1 and the § 7 subcommand table list `groom`, the AC-20261105-07-15 test keeps its other assertions and drops the absence check, and the § 4 row stays. | The code is the bug when a doc lists a v7 feature the code lacks. Spec 07 D11, AC-15 and roadmap 36 are tagged at plan time. |
| D12 | `v1Queue` in `tests/helpers.js` writes a bound fix's v7 payload as `Q.text(it)`. Add the groom oracle to `tests/queue.test.js` through `v7Scripts` and `v1Queue`; a missing tag fails it, never skips it. | v7 needs the v1 twin of the same data, and the twin drops the spec path today. |

## File Plan

| Path | Action | Summary |
|------|--------|---------|
| spec/scripts/queue.js | MODIFY | `groom` subcommand: pending view, buckets, rows, flag refusal (D1–D8). |
| spec/scripts/lib/queue.js | MODIFY | Port the six duplicate and cites-done helpers and export them (D1, D3); stays within 200 LOC. |
| spec/commands/queue.md | MODIFY | Groom line, session flow, `allowed-tools`, argument hint (D9). |
| spec/doctrine.md | MODIFY | Seat row (D10). |
| docs/v8/interface-contract.md | MODIFY | § 1 row and § 7 table list `groom` (D11). |
| docs/v8/architecture.md | MODIFY | `queue.js` and `lib/queue.js` lines name groom and the helpers. |
| tests/helpers.js | MODIFY | `v1Queue` keeps a bound fix's text (D12). |
| tests/queue.test.js | MODIFY | Groom oracle and the behaviour ACs (D12). |
| tests/fanout.test.js | MODIFY | AC-20261105-07-15 drops the absence check (D11). |

## Acceptance Criteria

- **AC-20261105-13-1**: WHEN one fixture host queues a prompt citing a done spec by full path, a prompt citing one by bare `specs/YYYYMMDD/NN`, a prompt citing a superseded spec, a brief-gated and a spec-gated item with met gates, an item with an unmet gate, a 20-day-old ungated prompt, a 20-day-old gated prompt, a Jaccard pair, an identical path pair, a differing path pair, a prompt over 100 columns, a `decide` item, a note, a bound fix and an open brief and spec THE SYSTEM SHALL print from `queue.js groom` the same stdout, byte for byte, as v7's `spec-queue.js groom` on the host's v1 twin, with exit 0 from both.
- **AC-20261105-13-2**: WHEN nothing is flagged and the host holds an unqueued open brief, an unqueued banner-superseded brief, an unqueued done brief, an unqueued open ad-hoc spec, a queued brief whose specs are all done and a queued spec whose file is gone THE SYSTEM SHALL print the same `✨ nothing to groom · N pending` line as v7, byte for byte.
- **AC-20261105-13-3**: WHEN `groom` runs on a host where a queued spec is done and a flagged item exists THE SYSTEM SHALL leave `spec-queue.json` byte-identical and create no other file in the git dir.
- **AC-20261105-13-4**: WHEN two bound fixes on one spec have overlapping words, or a bound fix is bound to a done spec THE SYSTEM SHALL pair or cite them as v7 did, proven by the same byte comparison.
- **AC-20261105-13-5**: WHEN `groom` gets `--json`, `--distinct` or `--top` THE SYSTEM SHALL exit 2 with `queue: groom: unknown flag <flag>` and leave the queue file unchanged; AND WHEN it gets `--root <dir>` THE SYSTEM SHALL groom that repo's queue.
- **AC-20261105-13-6**: WHEN a test reads `spec/commands/queue.md` THE SYSTEM SHALL find `Agent` and `AskUserQuestion` in `allowed-tools` and `groom` in the argument hint, and in `spec/doctrine.md` a seat row naming groom with `haiku`.
- **AC-20261105-13-7**: WHEN a test reads `docs/v8/interface-contract.md` THE SYSTEM SHALL find `groom` in the § 1 `/spec:queue` row and in the § 7 subcommand table; AND the AC-20261105-07-15 test SHALL assert no absence of `groom`.
- **AC-20261105-13-8**: WHEN the `spec-v7-final` tag cannot be read THE SYSTEM SHALL fail the groom oracle, never skip it.
- **AC-20261105-13-9**: WHEN the build is done THE SYSTEM SHALL record in `<spec>.run/evidence.md` the stdout of `queue.js groom` run on this repo's real queue and the queue file's checksum before and after, which must match.

## Assumptions

- A1: v7's `spec-status.js --json` and v8's `work.js` agree on spec and brief status for the fixture cases, as the status oracle already shows for its hosts — if false: the byte comparison fails, and the builder ports the missing rule into groom's view; a difference that needs v8's state changed is a question.
- A2: v7's `brief.name` equals v8's slug name — if false: same remedy.
- A3: A builder has no Agent tool, so the session flow cannot run in a lane. The real end-to-end run happens after merge, in the session: `/spec:queue groom` on a repo with flagged items, confirming the haiku checks, a 📌 tick and a question. This repo's queue is empty today — if no repo has flagged items: add a real flagged item for the run.
