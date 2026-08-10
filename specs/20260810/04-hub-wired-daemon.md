---
date: 2026-08-10
status: draft
risk: T3
area: autopilot
design: false
breaking: true
depends_on: [specs/20260810/03-repo-discovery.md]
depended_on_by: [specs/20260810/05-service-bootstrap.md]
brief: 03
---

# Hub-wired daemon — autopilotd boots from hub.json; direct-Telegram mode deleted

## Goal

Connect the daemon to the hub it has never spoken to. Today `autopilotd` requires a
per-host `botToken` + `supergroupId` + hand-assigned per-lane `topicId`
(`daemon/config.js`) and talks Telegram directly — the pre-hub architecture, and the
reason per-machine setup cannot scale. After this spec, `autopilotd` boots from
`hub.json` + repo discovery (spec 03), narrates and asks through the hub API via a new
`daemon/hub-adapter.js` behind the existing messaging seam, and the direct-Telegram mode
is deleted (2026-08-10 ruling). Done = a freshly enrolled box starts the daemon with
zero hand-written config, and messages appear in the hub-owned Telegram topics.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | Delete direct-Telegram mode: `daemon/telegram.js`, `tests/autopilot/telegram.test.js`, and the live suite `tests/autopilot/live.test.js` are removed; `config.json`'s `botToken`/`supergroupId`/`allowedUserIds`/`topicId` fields cease to exist | User ruling 2026-08-10: one way to run. Telegram allows one `getUpdates` consumer per bot token and the hub is that consumer — a leftover direct-mode box silently steals the hub's updates. The live-suite discipline moves to the hub repo (it owns Telegram now); the spoke's live pin is `enroll-live.test.js`, which stays. |
| D2 | `daemon/hub-adapter.js` implements the seam `start · stop · send · askButtons · pendingAsk · cancelAsk` **plus new `report(project, type, payload)`**; lane.js emits `report(project, 'stage_finished', {stage})` on done and `report(project, 'lane_halted', {reason})` on halt, keeping `send()` for free-text narration | The hub narrator posts a **closed inventory** (stage_finished, lane_halted, question_asked, ask_cancelled, session_wrapup, project_registered — narration and stage_started are deliberately log-only). Typed reports are the only way phone-visible lines survive the move; emoji-sniffing `send()` text into types was rejected as fragile. |
| D3 | `send(project, text)` → one `narration` event via `POST /api/spokes/report`; `report()` → the given type; both mint ULID eventIds (`hub-http.js`), one-retry, and on terminal failure **log and drop** — never throw into the lane | Narration is durable-log material (at-least-once, hub-side dedupe); a hub outage must never take a lane down (0.4.1 lane-failure-semantics precedent). Event types are the vendored `SPOKE_REPORTABLE_EVENT_TYPES` alphabet — `stage_started` is reported too (durable record) though the narrator doesn't post it. |
| D4 | `askButtons(project, ask)` → `POST /api/spokes/asks` with ULID `clientAskId`; resolution arrives as an `answer_given` event `{askId, answers}` over the shared poll loop; `cancelAsk` → `POST /api/spokes/asks/:askId/cancel`. Ask creation retries with the daemon's standard backoff (1s base → 60s cap) **indefinitely** until 2xx/409 — asks have no timeout and must never be lost | Asks are the product's core loop; the hub enforces one-pending-ask-per-project with `409 conflict`. Answer keys/values are the seam's existing shape (`answers: {[question text]: string | string[]}` — verified identical in the hub adapter source). |
| D5 | On `409 conflict` at ask creation: read the project's pending ask from the next poll's `asks[]`; if its `questions` deep-equal ours → **adopt** its `askId` and await its answer; else cancel it and re-create | After a daemon restart the lane re-asks the same fork (canonical re-materialization rule) — adopting avoids a duplicate question on the phone; a mismatched stale ask is superseded by cancel+recreate. Deep-equal = JSON.stringify equality after stripping undefined-valued keys. |
| D6 | One shared poll loop per adapter: `GET /api/spokes/poll?since=<cursor>` with a **durable cursor** at `<stateDir>/hub-cursor.json`; cold start `since="0"`; consume `answer_given` (resolve pending ask) and `ask_cancelled` (reject/notify holder); ignore every other type; errors back off 1s→60s and never reject | Mirrors the hub narrator's own durable-consumer-cursor design. `since="0"` cold start replays the spoke's history once (spoke-scoped, 100/page, drains naturally) — a "start from now" cursor was rejected because the hub has no tail API and an invented high cursor would permanently skip real events. `asks[]` in the response is used only for D5 adoption, not as an event source. |
| D7 | `daemon/config.js` is rewritten: the daemon boots from `hub.json` (missing → exit 2, remedy `autopilot enroll`) + discovery (spec 03, re-run every start, registrations refreshed); `config.json` demotes to **optional overrides** — per-project `{devServerCommand, tunnelCommand, pollSeconds}` keyed by project name, host-level `{specPluginRoot, pluginPaths, reposRoot}` | Discovery-at-boot makes fleet ops "clone + restart" and self-heals the `projects: []` class of silence. Defaults derived from the plugin checkout itself: `specPluginRoot = <checkout>/spec`, `pluginPaths = [<checkout>/spec, <checkout>/git]` where `<checkout> = path.resolve(__dirname, '../..')` — the values every box previously hand-typed were always these. |
| D8 | `autopilotd` gains `--hub-config <path>` (default `~/.config/autopilot/hub.json`); the preflight fixture becomes `fixtures/preflight-hub.json` + a grounded fixture repo `fixtures/repos/demo/.claude/spec.config.json`; `.claude/spec.config.json`'s `bootCommand` updated to pass `--hub-config` | The boot leg (`--check --hold`) must keep passing offline in CI where no real `~/.config` exists. Preflight scans (fs-only) but performs **no** network registration — registration happens only on real start. |
| D9 | Auth-shaped stage failures skip the Fable repair pass and halt immediately with `report(project, 'lane_halted', {reason: '🔑 <machine> needs `claude login`'})`; detection is a case-insensitive pattern list over the thrown/reported error text: `/authentication|unauthorized|oauth|api key|401|logged? ?out|login/i` | The fleet runs on Claude subscriptions (2026-08-10 ruling — no cost cap; the subscription is the ceiling). Burning a Fable repair on an auth failure wastes a pass that cannot succeed; `lane_halted` is narrator-posted so the phone sees exactly one 🔑 line. Subscription-limit exhaustion already classifies `retryable` (SDK throw) and keeps the existing 30s→15min backoff — auto-resumes when the window resets, log-only by design. |
| D10 | The seam's canonical surface becomes `start · stop · send · report · askButtons · pendingAsk · cancelAsk` | One additive method; recorded in Canonical Delta. A future adapter (Slack, dashboard) implements the same seven. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| autopilot/daemon/hub-adapter.js | CREATE | scripts | the seam over report/asks/poll: D2–D6 |
| autopilot/daemon/config.js | MODIFY | scripts | hub.json boot + optional overrides + derived defaults (D7) |
| autopilot/bin/autopilotd | MODIFY | scripts | `--hub-config`, discovery-at-boot, hub-adapter wiring, preflight update (D7/D8) |
| autopilot/daemon/lane.js | MODIFY | scripts | `report()` for done/halt lines; auth-shaped classification (D2/D9) |
| autopilot/daemon/telegram.js | DELETE | scripts | direct mode retired (D1) |
| tests/autopilot/telegram.test.js | DELETE | tests | pins of the deleted surface (D1) |
| tests/autopilot/live.test.js | DELETE | tests | Telegram live suite moves conceptually to the hub repo (D1) |
| autopilot/config.example.json | MODIFY | scripts | overrides-only shape with comment (D7) |
| autopilot/fixtures/preflight-hub.json | CREATE | scripts | offline boot-leg credential fixture (D8) |
| autopilot/fixtures/repos/demo/.claude/spec.config.json | CREATE | scripts | grounded fixture repo for preflight discovery (D8) |
| .claude/spec.config.json | MODIFY | other | bootCommand passes `--hub-config autopilot/fixtures/preflight-hub.json` (D8) |
| autopilot/.claude-plugin/plugin.json | MODIFY | doctrine | version bump (major behavior change) + description changelog |
| tests/autopilot/hub-adapter.test.js | CREATE | tests | AC-20260810-04-1 … -7 |
| tests/autopilot/config.test.js | MODIFY | tests | AC-20260810-04-8, -9; direct-mode cases removed |
| tests/autopilot/lane.test.js | MODIFY | tests | AC-20260810-04-10, -11; adapter fake gains `report` |

## Contracts

```js
// daemon/hub-adapter.js
createHubAdapter({
  credential,        // {hubUrl, token} — read once by the caller (config.js)
  stateDir,          // durable cursor lives at <stateDir>/hub-cursor.json
  fetchImpl = fetch, // injected transport (test rule: no network in tests)
  nowMs, randomBytesImpl, // ULID injection, as hub-http.js
}) → {
  start(),                       // begins the poll loop; idempotent
  async stop(),                  // aborts in-flight poll, flushes cursor
  async send(project, text),           // narration event; never throws (D3)
  async report(project, type, payload),// typed event; never throws (D3)
  async askButtons(project, ask),      // resolves {answers}; no timeout (D4/D5)
  pendingAsk(project),                 // → the pending ask's questions | null
  async cancelAsk(project),            // cancels via the hub; resolves when done
}
```

Wire shapes are the vendored contract verbatim (`autopilot/contract/index.ts`):
`ReportRequest`/`ReportedEvent` (ULID eventId), `AskCreateRequest` (ULID clientAskId),
`PollResponse` (`cursor` advances only on received rows; `asks[]` is the pending set,
fresh every response). Payload pins consumed by the hub narrator (defensive, but these
are the rendered fields): `stage_finished.payload.stage` (string), and
`lane_halted.payload.reason` (string).

Cursor file: `{ "cursor": "<string bigint>" }`, written after each batch is fully
handled, same atomic-write discipline as `hub.json`.

Config resolution (D7): `loadConfig` becomes
`loadHubConfig({hubConfigPath, overridesPath})` → `{credential, reposRoot, specPluginRoot,
pluginPaths, lanes: [{project, root, pollSeconds, devServerCommand?, tunnelCommand?}]}`
with lanes built from `discoverRepos()` output merged with per-project overrides.

## Behavior

- **Boot order** (normal start): recursion guard → Node floor → parse args → read
  `hub.json` (exit 2 + remedy if absent/invalid) → `discoverRepos` (exit 2 on
  DiscoverError, message verbatim) → `registerRepos` (network; non-2xx → exit 1 naming
  the repo — a box that cannot register must say so loudly, not run half-routed) →
  build hub adapter + lanes → start. `--check` keeps its offline guarantee: hub.json
  validated, SDK forced, oracle asserted, **scan but never register**, adapter+lanes
  constructed (no I/O), PASS.
- **Ask lifecycle**: lane blocks in `askButtons` → adapter POSTs (retrying per D4) →
  poll loop sees `answer_given {askId, answers}` → resolves the waiting promise →
  lane proceeds. `ask_cancelled` for a held askId rejects the wait with a distinguishable
  error the lane already treats as ask-cancelled. Answers for unknown askIds are ignored
  (another machine's history replay).
- **Restart with a pending ask**: stage re-runs → re-ask → 409 → D5 adoption. The phone
  sees the original question, still pending, and the tap lands in the restarted daemon.
- **Shutdown**: `lane.stop()` semantics unchanged; `adapter.stop()` aborts the in-flight
  poll (`AbortController`), flushes the cursor, resolves. Double-signal force-exit
  unchanged.
- **stage_started/idle/backoff narration** continues via `send()` — durable event log
  only; the phone deliberately sees finished/halted/asks/wrap-ups (hub posting policy).

## Acceptance Criteria

- **AC-20260810-04-1**: WHEN `send('prax', '💤 idle')` runs THE SYSTEM SHALL POST
  `/api/spokes/report` with one event `{eventId: <26-char ULID>, type: 'narration',
  projectId: <resolved>, payload: {text: '💤 idle'}}`; WHEN the POST fails twice THE
  SYSTEM SHALL resolve anyway and log — never reject → tests/autopilot/hub-adapter.test.js
- **AC-20260810-04-2**: WHEN `askButtons` POSTs and the hub answers
  `201 {askId: 'ask_1'}` and a later poll delivers `answer_given` with
  `{askId: 'ask_1', answers: {'Deploy?': 'Later'}}` THE SYSTEM SHALL resolve
  `{answers: {'Deploy?': 'Later'}}` → tests/autopilot/hub-adapter.test.js
- **AC-20260810-04-3**: WHEN ask creation answers `409` and the next poll's `asks[]`
  carries a pending ask for the project with deep-equal `questions` THE SYSTEM SHALL
  adopt its `askId` (no cancel, no re-create) and resolve on its `answer_given`; WHEN
  the pending ask's questions differ THE SYSTEM SHALL cancel it and re-create →
  tests/autopilot/hub-adapter.test.js
- **AC-20260810-04-4**: WHEN the poll loop receives events THE SYSTEM SHALL persist
  `{cursor}` to `<stateDir>/hub-cursor.json` after handling and resume from it on
  restart; WHEN no cursor file exists THE SYSTEM SHALL poll `since=0` →
  tests/autopilot/hub-adapter.test.js
- **AC-20260810-04-5**: WHEN a poll request throws or answers 5xx THE SYSTEM SHALL back
  off (1s doubling to 60s cap), continue, and never reject the loop; each iteration
  yields to the macrotask queue (`setImmediate`) so a synchronously-resolving injected
  transport cannot OOM the test (Gotchas: 20260801-01) →
  tests/autopilot/hub-adapter.test.js
- **AC-20260810-04-6**: WHEN `stop()` is called with a poll in flight THE SYSTEM SHALL
  abort it and resolve; a pending `askButtons` wait stays unresolved (the ask survives
  hub-side) → tests/autopilot/hub-adapter.test.js
- **AC-20260810-04-7**: WHEN `report('prax', 'stage_finished', {stage: '/spec:build … · $1.23'})`
  runs THE SYSTEM SHALL POST one `stage_finished` event with that payload verbatim →
  tests/autopilot/hub-adapter.test.js
- **AC-20260810-04-8**: WHEN `loadHubConfig` runs with no hub.json THE SYSTEM SHALL
  throw an Error naming `autopilot enroll` as the remedy; WHEN hub.json exists and no
  overrides file exists THE SYSTEM SHALL return lanes from discovery with
  `pollSeconds: 300` and derived `specPluginRoot`/`pluginPaths` ending in `/spec` and
  `[/spec, /git]` under the checkout root → tests/autopilot/config.test.js
- **AC-20260810-04-9**: WHEN the overrides file maps `prax` to
  `{pollSeconds: 60, devServerCommand: 'npm run dev'}` THE SYSTEM SHALL apply them to
  the `prax` lane only; an override key naming no discovered project SHALL throw an
  Error naming the key and the repos root (typo guard) → tests/autopilot/config.test.js
- **AC-20260810-04-10**: WHEN a stage fails with error text matching the D9 auth pattern
  (e.g. `"OAuth token has expired · Please run /login"`) THE SYSTEM SHALL skip the
  repair pass and halt with one `report(project, 'lane_halted', {reason})` whose reason
  contains `🔑`; a non-auth failure SHALL CONTINUE TO get exactly one Fable repair pass
  before halting → tests/autopilot/lane.test.js
- **AC-20260810-04-11**: WHEN a stage completes THE SYSTEM SHALL emit
  `report(project, 'stage_finished', {stage})` where `stage` carries the action, path,
  and cost line, and WHEN the lane parks THE SYSTEM SHALL emit `lane_halted` with the
  ask's reason — while `send()` free-text SHALL CONTINUE TO flow for idle/backoff lines
  → tests/autopilot/lane.test.js
- **AC-20260810-04-12**: WHEN `autopilotd --check --hold --ready-file <p> --hub-config
  autopilot/fixtures/preflight-hub.json` runs offline THE SYSTEM SHALL pass preflight
  (≥1 lane from the fixture repo), write the ready file, and perform zero network calls
  → boot-leg execution via the repo's runtime block (smoke), plus an injected-transport
  assertion in tests/autopilot/config.test.js

## Assumptions (escalation triggers)

- A1: The hub narrator's posting policy (narration/stage_started log-only;
  stage_finished/lane_halted/question_asked/ask_cancelled/session_wrapup posted) is as
  read 2026-08-10 in autopilot-hub `src/core/narrator.ts` D3. — **if false:** the D2
  mapping is miscalibrated; re-read the narrator before changing any event choice.
- A2: `answer_given` payload is `{askId, answers}` with answers keyed by question text
  (verified in hub `src/telegram/adapter.ts:341-350` and `narrator.test.ts:377`). —
  **if false:** blocked; the wire has drifted — re-vendor the contract first.
- A3: Poll `cursor` semantics: advance only on received rows; `since=0` replays the
  spoke's full (spoke-scoped) history, 100 rows/page, drains across successive polls
  (hub `docs/canonical/api.md` § long-poll). — **if false:** blocked; cursor design
  must be re-derived against the live route.
- A4: SDK auth failures surface as error text matching D9's pattern list — *unverified*;
  the pattern is an allowlist of observed CLI phrasings, not an SDK contract. —
  **if false (an auth failure classifies as plain `failed`):** behavior degrades to
  today's repair-then-halt, which is safe; extend the pattern list from the observed
  error text, never loosen `failed` handling itself.
- A5: Deleting `live.test.js` leaves no other consumer of `daemon/telegram.js`
  (grep at build start; `bin/autopilotd` is rewired in this same spec). — **if false:**
  the extra consumer is in-scope to rewire or the deletion is blocked; stop and consult.
- A6: The preflight fixture repo (`fixtures/repos/demo/`) satisfies spec 03's D1
  predicate without being a git repo (discovery does not require `.git`). — **if
  false:** make the fixture minimal-git; never weaken the predicate for the fixture.

## Rationale

The reframe this spec lands: `bootstrap` tooling (spec 05) would automate the wrong
layer while the daemon still demanded a hand-written bot token and topic ids — the
two-config split (`hub.json` written by enroll but read only by the wrap-up hook;
`config.json` demanded by the daemon) was the actual scaling blocker. The hub side is
already complete (report/asks/poll/topic auto-creation), so this is spoke-only work
behind the existing seam. Direct-mode deletion (D1) was put to the user and ruled:
delete — a fallback mode would both drift and race the hub for `getUpdates`.
Phone-visibility calibration (D2/D3): the hub narrator's closed posting inventory is
respected rather than extended — lane "done" and "halt" lines become typed events it
already posts; start/idle lines stay durable-log-only. If start-lines on the phone are
wanted later, that is a one-line hub narrator change, deliberately out of this repo's
scope. The indefinite ask-creation retry (D4) follows "asks have no timeout": a lane
blocked on a fork must outlive any hub outage. Rejected alternative for restart
re-asks: cancel-always (simpler than D5 adoption) — rejected because it re-posts the
same question to the phone on every daemon restart, and restarts become routine once
spec 05 puts the daemon under `Restart=always`. Watch during execution: `config.js` is
consumed by `--check`'s offline guarantee — registration must stay out of the preflight
path or CI gains a network dependency.

## Canonical Delta

`docs/canonical/autopilot.md`: § Messaging seam rewritten — surface is
`start · stop · send · report · askButtons · pendingAsk · cancelAsk`, implemented by
`daemon/hub-adapter.js` over the hub API; direct-Telegram adapter deleted (0.8.0), the
`callback_data` alphabet and 429-handling notes move to history (the hub owns them).
§ Lane engine & daemon updated: boots from `hub.json` + discovery, `config.json` is
optional overrides, derived plugin-checkout defaults, `--hub-config`, durable poll
cursor, D9 auth-halt rule. § Live verification updated: the Telegram live suite is
retired here (hub-owned); `enroll-live.test.js` remains the spoke's live pin.
