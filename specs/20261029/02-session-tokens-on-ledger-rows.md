---
date: 2026-10-29
status: implementing
open_markers: 0
tier: critical           # touches spec/scripts/verdict.js (rules § Risk Tiers: sole verdict derivation)
area: provenance
breaking: false
depends_on: [specs/20261029/01-model-placement-refresh.md]
brief: n/a
build_base: main
diff_base: 10b44102054967fe9ceebf0a37734d68327e0914
---

# Session token usage on build and review ledger rows

## Goal

Build and review ledger rows record how many tokens the orchestrating session spent during that
stage, read from the same transcript `sessionModel()` already reads, so the cost of a model or
effort change can be measured from the ledger instead of estimated. The field is a per-stage
delta of the session's own usage, deduplicated by message id, named `sessionTokens` so nobody
mistakes it for a total that includes subagents. Done means a build row and a review row carry
the field with the four token counters and a turn count, every pre-existing field keeps its
value and position, and every failure to read degrades to `null`, never an error.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `lib/session-stamp.js` exports `sessionUsage(root)` → `{input, cacheCreate, cacheRead, output, turns}` or `null`: it streams the WHOLE stamped transcript line by line, keeps the FIRST line per `message.id` among `type:"assistant"` lines, and sums that line's `message.usage.input_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, `output_tokens` (missing counters count 0); `turns` = distinct ids. `null` when the stamp, the file, or any assistant line with a `usage` object is absent (AC-20261029-02-1, AC-20261029-02-2) | Spiked: one message is written as several transcript lines carrying identical usage (34 lines, 20 ids; raw output sum 20048 vs deduped 10088), so a naive sum double-counts. Whole-file read, not the 512 KiB tail, because the tail is a window, not a session. Rejected: reading `iterations[]` — not present on every line. |
| D2 | The build driver stores `marks.tokensAtStart = sessionUsage(repoRoot)` when it creates the sidecar, and at DONE appends `sessionTokens` as the LAST key of the row: the counter-wise difference `sessionUsage(repoRoot) − marks.tokensAtStart`, or `null` when either side is `null` or any difference is negative (AC-20261029-02-3) | A delta is the stage's own spend; the snapshot at sidecar creation is the only moment that is "before the build". Negative means the stamp moved to another transcript (last-writer-wins), which is unknowable, so `null`. Last key keeps the pinned `tier, via, model` order intact. |
| D3 | `verdict.js` accepts `--sessionTokens <json>` on the review profile only: the value must parse to a JSON object or the literal `null`; it is written as the LAST key of the row; absent flag → no key (byte-identity pin preserved); unparseable value, or any value with `--profile release`, → exit 2 with stderr naming `--sessionTokens` and no row printed (AC-20261029-02-4, AC-20261029-02-5, AC-20261029-02-6) | Mirrors the `--via`/`--model` refusal matrix verbatim so the release row stays untouched. Last key keeps `ts, spec, stage, tier, via, model, runId` and `checkpoint`-after-`verdict` pins intact. |
| D4 | The review driver stores `marks.tokensAtStart` when it creates its sidecar and `viaModelArgs()` appends `--sessionTokens <json>` with the D2-style delta (or `null`) on every verdict pass, read fresh at each call (AC-20261029-02-7) | Same "read at row-write time, never cached" rule the model id follows; one shared arg-builder already exists, so the flag lands in all three passes identically. |
| D5 | Subagent spend is out of scope: the field counts the orchestrating session's transcript only, and its name says so. `[no-ac: a naming decision; AC-20261029-02-3 and -02-4 pin the key name]` | Subagents write separate transcripts the stamp does not name. A field called `tokens` would be read as the whole run's cost. |
| D6 | `spec/.claude-plugin/plugin.json` is bumped via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` naming `sessionTokens` on build and review rows. `[no-ac: the reviewer runs plugin-bump.js --check against the merge base; a test judging the tree against main is a hard finding per rules § Review Checks]` | Rules § Planning version-bump discipline. |
| D7 | Scope widened at build (asked, critical tier; JJ chose "add to scope" 2026-10-29): `tests/review/stopped-row-durability.test.js` enters the File Plan. Its two byte-equality reconstruction cases re-run `verdict.js` from the appended row's recorded flags; the re-run builder now threads the observed row's own `sessionTokens` into the re-invocation (`if ('sessionTokens' in appended) reArgs.push('--sessionTokens', JSON.stringify(appended.sessionTokens))`) — never a hardcoded value, never a weakened comparison. Gate line: `stopped-row-durability.test.js` "WHEN the synthetic gate fails…" and "WHEN a review running in a linked worktree hard-stops…" deep-equal failures on a row carrying `sessionTokens: null`. `[asked: add to scope — fix the two tests in this build]` | Rules § Gotchas: a reconstruction test inherits the script's untouched default, so it must be fed the observed row's field (the changed-default trigger). |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/session-stamp.js | MODIFY | scripts | `sessionUsage(root)` (D1); header comment gains the dedupe rule |
| spec/scripts/spec-build-driver.js | MODIFY | scripts | `tokensAtStart` snapshot at sidecar creation; `sessionTokens` last key on the DONE row (D2) |
| spec/scripts/spec-review-driver.js | MODIFY | scripts | `tokensAtStart` snapshot; `viaModelArgs()` passes `--sessionTokens` (D4) |
| spec/scripts/verdict.js | MODIFY | scripts | `--sessionTokens <json>` flag, review-profile only, last key (D3) |
| spec/.claude-plugin/plugin.json | MODIFY | other | `node scripts/plugin-bump.js --bump --plugin spec --changelog "…"` (D6) |
| tests/provenance/provenance.test.js | MODIFY | tests | AC-20261029-02-1, AC-20261029-02-2, AC-20261029-02-4, AC-20261029-02-5, AC-20261029-02-6 |
| tests/build/build-driver-commit.test.js | MODIFY | tests | AC-20261029-02-3 |
| tests/review/review-driver.test.js | MODIFY | tests | AC-20261029-02-7 |
| tests/review/stopped-row-durability.test.js | MODIFY | tests | D7 — re-run builder threads the observed row's `sessionTokens` (no AC: pre-existing pins, unchanged assertions) |

## Contracts

```js
// lib/session-stamp.js
sessionUsage(root) // → { input, cacheCreate, cacheRead, output, turns } | null
// first line per message.id among type:"assistant" lines; counters from message.usage:
//   input      += usage.input_tokens               || 0
//   cacheCreate+= usage.cache_creation_input_tokens|| 0
//   cacheRead  += usage.cache_read_input_tokens    || 0
//   output     += usage.output_tokens              || 0
//   turns      = number of distinct ids counted
// null: no stamp · no transcript file · zero assistant lines carrying a usage object
```

```
verdict.js … [--sessionTokens <json>]      review profile only
  <json> ∈ { "null", a JSON object }       else exit 2, stderr contains "--sessionTokens"
  with --profile release                    exit 2, stderr contains "--sessionTokens"
  row: … existing keys unchanged …, "sessionTokens": <parsed>   (always the last key)
```

Build DONE row: `…, "sessionTokens": {"input":N,"cacheCreate":N,"cacheRead":N,"output":N,"turns":N}`
as the last key, or `"sessionTokens": null`.

## Behavior

- Delta rule (both drivers): for each counter `c`, `delta.c = now.c − start.c`; if `now` or
  `start` is `null`, or any `delta.c < 0`, the field is `null`.
- Reading happens at row-write time (DONE / each verdict pass), never at prompt time — the
  transcript is empty right after `/clear`.

## Acceptance Criteria

- **AC-20261029-02-1**: WHEN the stamped transcript holds assistant lines `{id:"A", usage:{input_tokens:2, cache_creation_input_tokens:2125, cache_read_input_tokens:82077, output_tokens:566}}` twice (two lines, same id, identical usage), `{id:"B", usage:{input_tokens:32, cache_creation_input_tokens:409, cache_read_input_tokens:81508, output_tokens:160}}` once, and a `type:"user"` line between them THE SYSTEM SHALL return `sessionUsage(root)` deep-equal to `{input:34, cacheCreate:2534, cacheRead:163585, output:726, turns:2}` → writes tests/provenance/provenance.test.js
- **AC-20261029-02-2**: WHEN the stamp is absent, OR the stamped transcript file is missing, OR the transcript holds only lines without a `message.usage` object THE SYSTEM SHALL return `null` from `sessionUsage(root)` without throwing (e.g. transcript `[{type:"user"},{type:"assistant", message:{model:"claude-opus-5"}}]` → `null`) → writes tests/provenance/provenance.test.js
- **AC-20261029-02-3**: WHEN the build driver creates its sidecar while the stamped transcript sums to `{output:160, turns:1}` and later reaches DONE while it sums to `{output:726, turns:2}` (inputs likewise grown) THE SYSTEM SHALL append a row whose LAST key is `sessionTokens` deep-equal to the counter-wise difference (e.g. `output: 566`, `turns: 1`), whose keys immediately after `tier` are still `via, model`; and WHEN no stamp exists at either moment THE SYSTEM SHALL write `"sessionTokens": null` as the last key → writes tests/build/build-driver-commit.test.js
- **AC-20261029-02-4**: WHEN `verdict.js` runs a review-profile `--ledger` pass with `--via loop --model claude-opus-5 --sessionTokens '{"input":1,"cacheCreate":2,"cacheRead":3,"output":4,"turns":1}'` THE SYSTEM SHALL print a row whose keys begin `ts, spec, stage, tier, via, model, runId`, whose `checkpoint` key (when passed) sits immediately after `verdict`, and whose LAST key is `sessionTokens` deep-equal to that object → writes tests/provenance/provenance.test.js
- **AC-20261029-02-5**: WHEN `verdict.js` runs a review-profile `--ledger` pass without `--sessionTokens` THE SYSTEM SHALL print a row with no `sessionTokens` key, byte-identical (minus `ts`) to the pre-change row for the same inputs (e.g. keys `[…, "verdict"]` end there) → writes tests/provenance/provenance.test.js
- **AC-20261029-02-6**: WHEN `verdict.js` receives `--sessionTokens not-json`, OR `--sessionTokens '[1]'`, OR `--sessionTokens '{}' --profile release` THE SYSTEM SHALL exit 2 with stderr containing `--sessionTokens` and print no row (e.g. `--sessionTokens '{}' --profile release` → exit 2; `--sessionTokens null` on the review profile → exit 0 with `"sessionTokens": null` last) → writes tests/provenance/provenance.test.js
- **AC-20261029-02-7**: WHEN the review driver runs a verdict pass with a stamped transcript present THE SYSTEM SHALL invoke `verdict.js` with `--sessionTokens` followed by a JSON object or `null` immediately after the `--model` pair (e.g. argv `[…, '--via','loop','--model','claude-opus-5','--sessionTokens','{"input":…}', '--checkpoint', …]`; a driver sidecar with no `tokensAtStart` → `--sessionTokens null`) → writes tests/review/review-driver.test.js
## Assumptions (escalation triggers)

- A1: Assistant lines repeat per `message.id` with identical `usage`. Spiked 2026-10-29 on the
  stamped transcript of this repo: 34 assistant lines, 20 distinct ids, raw `output_tokens` sum
  20048, first-per-id sum 10088. — **if false:** (a transcript format where ids are unique) the
  dedupe is a no-op and nothing changes.
- A2: Every assistant line carries `message.usage` with `input_tokens`,
  `cache_creation_input_tokens`, `cache_read_input_tokens`, `output_tokens`. Spiked: 0 of 34
  lines lacked `usage`; one older line lacked only `output_tokens_details`, which D1 does not
  read. — **if false:** missing counters count 0 (already in D1); a transcript with no usage
  objects returns `null`.
- A3: The review driver sets `marks.via` at sidecar creation (`spec-review-driver.js:611-612`)
  and the build driver at `:409`; those are the snapshot points. — **if false:** snapshot at
  the first `--mark` the driver accepts and record the deviation.
- A4: The key-order pins that must keep passing are `tests/provenance/provenance.test.js:240`
  (first seven keys), `:297` (byte-identity minus via/model), `:322` (`checkpoint` after
  `verdict`) and `tests/build/build-driver-commit.test.js` (`tier, via, model` slice). —
  **if false:** a pin that asserts the row's LAST key must be read before any edit; never
  weaken it, place the new key where it demands.
## Rationale

JJ asked, during the 2026-10-29 model-placement review, whether the recommended seat changes
raise cost, and the honest answer was that nothing measures it. The ledger already carries the
session model per row, derived from the transcript at row-write time; the same transcript
carries per-message usage, so the measurement is one more read of a file the plugin already
trusts. The field is a delta because the ledger row is about a stage, not a session, and the
stamp is per root and last-writer-wins, so a snapshot at sidecar creation is the only honest
"before".

The dedupe rule is the load-bearing detail: Claude Code writes one transcript line per content
block, each repeating the message's usage, so the obvious sum is roughly double the truth. The
spike numbers are in A1. Reading the whole file instead of the 512 KiB tail is deliberate: a
window gives a partial sum with no way to know it is partial. Transcripts of a few MB stream in
well under a second.

Named `sessionTokens`, not `tokens`, because subagents (workers, reviewer, disposer) write their
own transcripts and this field does not see them. A whole-run figure would need the Agent tool
to report usage, which it does not do into the host transcript. A later spec can add
`subagentTokens` beside it if a carrier appears.

Fragile: `verdict.js` is a critical surface; the flag follows the `--via`/`--model` pattern
exactly, including the release-profile refusal and the "absent flag means absent key" rule the
byte-identity pin depends on. Anything that touches key order breaks four pinned tests on
purpose — place the new key last.

Rejected: writing cost in dollars. Prices change per model and per provider; counters are
stable, and a reader can price them later from the `model` field on the same row.

## Canonical Delta

docs/canonical/build-integrity.md § Run provenance, append one paragraph: "Build and review
rows also carry `sessionTokens` as their last key: the orchestrating session's own transcript
usage during that stage — `input`, `cacheCreate`, `cacheRead`, `output` token counters and
`turns` — as a delta between sidecar creation and row write, deduplicated by message id because
the transcript repeats a message's usage on every content-block line. `null` when the stamp or
transcript is absent or the stamp moved to another transcript mid-stage. Subagent spend is not
included; the name says so."
