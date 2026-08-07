---
date: 2026-08-07
status: implementing
open_markers: 0
risk: T2
area: autopilot
design: false
breaking: true
depends_on: []
depended_on_by: []
brief: n/a
---

# Autopilot dead-surface deletion: screenshot chain + onText

## Goal

Delete the two adapter surfaces the 2026-08-07 over-engineering audit verified as
zero-consumer: the entire screenshot chain (`screenshotIfConfigured` → `sendPhoto` →
`screenshotCommand` config row) and the `onText`/`textCb` free-text callback registration.
Both shipped to spec-shape ahead of any consumer ("unconsumed completeness") and are defended
only by their own tests. Done = the surfaces are gone, the scoped autopilot suite passes, and
the adapter's living documentation (`docs/canonical/autopilot.md`) matches the real surface.
Deletion-only: net lines down, no new mechanisms.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | Delete the whole screenshot chain: `screenshotIfConfigured` in `autopilot/daemon/checkpoint.js:137-176` (+ its export at :178), the call site `autopilot/daemon/lane.js:158-167` (the full `if` block including its closing brace) (+ its import at :33), `sendPhoto` in `autopilot/daemon/telegram.js:189-198` (+ export at :389), the `screenshotCommand` row in `autopilot/config.example.json:21`, and the `screenshotCommand` mention in `autopilot/daemon/config.js:7`'s header comment | Zero consumers: `grep -c screenshot ~/.config/autopilot/config.json` = 0 in the only real deployment; the chain was BRIEF #9 wish-fulfilment, never a measured need. Rejected: keep behind a scaffold-ledger retire condition — autopilot guards are pinned by spec ACs, not ledger rows (docs/canonical/autopilot.md), and the surface never had a consumer to wait for |
| D2 | Delete `api()`'s multipart branch with `sendPhoto`: the `isForm` check in `telegram.js:121-124` collapses to the JSON-only `init`, and the header comment's `FormData/Blob` mention (:10) is trimmed to the primitives still used | `sendPhoto` was the only `FormData` caller; keeping the branch is exactly the unconsumed-completeness pattern this spec deletes |
| D3 | Delete `onText`/`textCb`: registration (`telegram.js:262-264`), the state var (:114), the `if (textCb) {...}` dispatch block in `handleMessage` (:324-330 ONLY — lines 322-323 are the `return`+brace closing the `otherAwaitQIdx` completion branch and MUST survive), and the export (:389). Topic messages with no pending "Other…" await are silently dropped — byte-identical to today's behavior, since no caller ever registered a callback | Zero consumers anywhere including tests; the "Other…" free-text flow is adapter-internal via `otherAwaitQIdx` (:302-321) and stays. Rejected: keep for a future Slack/free-text feature — speculative generality is the audited disease |
| D4 | `pendingAsk` stays; only its false consumer claim is corrected: `specs/20260801/01-telegram-adapter.md:73` says "used by daemon + D7 matching" but only tests call it — reword to "exposed for tests; D7 matching is adapter-internal" | The function is live test-consumed ask-lifecycle surface; the lie about who consumes it is the defect |
| D5 | Historical specs under `specs/20260801/` are immutable build records — the D4 one-line factual correction is the ONLY edit; D2/D7/D12 decision tables and Behavior sections stay as written even though they describe deleted surface | Specs are dated artifacts; the living surface doc is `docs/canonical/autopilot.md`, updated via this spec's Canonical Delta. Rejected: rewriting history to match the present |
| D6 | `autopilot/.claude-plugin/plugin.json` bumps 0.4.1 → 0.5.0 with the deletion noted in `description` | Removing public adapter surface is a breaking change; description is the changelog surface |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| autopilot/daemon/telegram.js | MODIFY | scripts | D2/D3: delete `sendPhoto`, `onText`/`textCb`, `api()` multipart branch; export shrinks to 6 keys; drop any require/comment left unused |
| autopilot/daemon/checkpoint.js | MODIFY | scripts | D1: delete `screenshotIfConfigured` + export; drop requires left unused (`os`/`fs` only if nothing else uses them) |
| autopilot/daemon/lane.js | MODIFY | scripts | D1: delete screenshot call site + `screenshotIfConfigured` import (keep `startSurfaces`) |
| autopilot/daemon/config.js | MODIFY | scripts | D1: header comment drops `screenshotCommand` from the optional-fields list |
| autopilot/config.example.json | MODIFY | other | D1: delete the `screenshotCommand` row |
| tests/autopilot/telegram.test.js | MODIFY | tests | AC-20260807-02-1, AC-20260807-02-2, AC-20260807-02-5 |
| tests/autopilot/checkpoint.test.js | MODIFY | tests | delete test `AC-20260801-03-11` + its header mentions; AC-20260807-02-3, AC-20260807-02-4 |
| tests/autopilot/lane.test.js | MODIFY | tests | drop `sendPhoto` from the fake adapter (lines 58, 66) |
| specs/20260801/01-telegram-adapter.md | MODIFY | other | D4: correct the pendingAsk consumer claim at line 73 — nothing else |
| autopilot/.claude-plugin/plugin.json | MODIFY | other | D6: 0.5.0 + description changelog line |

## Contracts

Adapter surface after this spec (the platform-neutral seam, D2 of specs/20260801/01 as
amended here):

```js
createTelegramAdapter(opts) → {
  start, stop,
  send(project, text),
  askButtons(project, ask),
  pendingAsk(project),   // exposed for tests; D7 free-text matching is adapter-internal
  cancelAsk(project),
}
```

`api()` sends JSON-only (`content-type: application/json`); no multipart path remains.

## Behavior

- `handleMessage` after D3: allowed-user topic messages either complete a pending
  `otherAwaitQIdx` question (unchanged) or are silently dropped. No callback dispatch exists.
- Checkpoint flow after D1: `startSurfaces` (dev server + tunnel, untouched) → checkpoint
  message posts URL-only, always. No screenshot attempt, no photo.
- `startSurfaces` is explicitly out of scope — it is the design center of BRIEF #2/#3 and has
  live consumers; only the screenshot leg dies.

## Acceptance Criteria

- **AC-20260807-02-1**: WHEN `createTelegramAdapter(opts)` returns THE SYSTEM SHALL expose
  exactly six methods (`Object.keys(adapter).sort()` →
  `['askButtons','cancelAsk','pendingAsk','send','start','stop']`) → new surface-pin test in
  tests/autopilot/telegram.test.js
- **AC-20260807-02-2**: WHEN an "Other…" button was tapped and the next topic message from an
  allowed user arrives THE SYSTEM SHALL CONTINUE TO resolve that question with the message
  text → NEW test in tests/autopilot/telegram.test.js (no existing test exercises the
  `otherAwaitQIdx` completion path — refuter-verified; author it fresh, expected green
  against pre-change code like any `SHALL CONTINUE TO` pin)
- **AC-20260807-02-3**: WHEN a lane checkpoint runs with `devServerCommand`/`tunnelCommand`
  configured THE SYSTEM SHALL CONTINUE TO spawn detached process groups and capture the
  tunnel URL from stdout or stderr → tag the existing `startSurfaces` tests in
  tests/autopilot/checkpoint.test.js
- **AC-20260807-02-4**: WHEN `autopilot/daemon/checkpoint.js` is required THE SYSTEM SHALL
  export exactly `['startSurfaces']` (`Object.keys(module.exports)`) → new export-pin
  assertion in tests/autopilot/checkpoint.test.js
- **AC-20260807-02-5**: WHEN a topic message arrives from an allowed user with no pending
  "Other…" await THE SYSTEM SHALL drop it without throwing and without completing any
  question (injected-transport observation: no state change, poll loop continues) → new
  assertion in tests/autopilot/telegram.test.js

## Assumptions (escalation triggers)

- A1: `~/.config/autopilot/config.json` — the only real deployment — sets no
  `screenshotCommand` (verified 2026-08-07: `grep -c screenshot` = 0) — **if false:** STOP;
  the chain has a consumer and D1 is void.
- A2: No repo outside this marketplace consumes the adapter as a library (the daemon binary
  is the only entry point) — **if false:** the 0.5.0 breaking bump is the contract; the
  surface was never documented outside this repo and `docs/canonical/autopilot.md`.
- A3: `tests/autopilot/live.test.js` (env-gated Telegram suite) references none of the
  deleted surface (verified 2026-08-07 grep over tests/autopilot: hits only in
  checkpoint.test.js and lane.test.js) — **if false:** update the live suite in the same
  tests row, still deletion-only.
- A4: The regression-pin tests (AC-2, AC-3) are green against pre-change code — AC-3 tags
  existing tests; AC-2 is authored fresh but pins behavior that already works (the
  `otherAwaitQIdx` path predates this spec); the build red-check treats `SHALL CONTINUE TO`
  pins as the sanctioned green exception.

## Rationale

The 2026-08-07 audit of specs/20260801 found this series LEAN overall with one bloat class:
surfaces finished to spec-shape before anything consumed them, then defended by their own
tests so they read as load-bearing ("unconsumed completeness"). The screenshot chain is the
canonical case — a BRIEF #9 wish that entered the lane-engine spec as D12, gained ~120 lines
across four files plus a test and a config row, and has had zero consumers through the only
supervised live run (2026-08-01) and since. `onText` is the same pattern one layer down:
the free-text path it was built for landed adapter-internally (`otherAwaitQIdx`), leaving
the callback seam registered by nobody, ever.

Deletion beats a retire condition here because autopilot is product code whose guards are
pinned by spec ACs (canonical doc), and there is no consumer whose arrival a condition would
wait for — git history is the archive. The `api()` multipart branch goes with `sendPhoto`
(D2) for the same reason: keeping a generic-looking branch nobody calls is the pattern under
deletion. Fragile spots for the worker: the `handleMessage` tail must keep the
`otherAwaitQIdx` completion path intact (delete only the `textCb` dispatch), and
checkpoint.js's remaining requires must be re-checked after the deletion (spawn stays for
`startSurfaces`; `os`/`fs` may not).

## Canonical Delta

In `docs/canonical/autopilot.md` § Messaging seam: the interface line becomes
`start · stop · send · askButtons · pendingAsk · cancelAsk`; add one sentence: "The v0.4
screenshot chain (`sendPhoto` + per-lane `screenshotCommand`) and the `onText` free-text
callback were deleted in 0.5.0 as zero-consumer surface (2026-08-07 audit); free-text
'Other…' replies are handled adapter-internally." In § Conventions: the zero-dependency line
drops `FormData`/`Blob` from the globals list (now `fetch`/`AbortController` and Node
built-ins).
