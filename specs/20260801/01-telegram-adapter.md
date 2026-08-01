---
date: 2026-08-01
status: implementing
risk: T2
open_markers: 0
area: autopilot
design: false
breaking: false
depends_on: []
depended_on_by: [specs/20260801/02-session-runner.md, specs/20260801/03-lane-engine.md]
brief: n/a
spiked: 2026-08-01
---

# autopilot 01 — Telegram messaging adapter

## Goal

Give the autopilot daemon (BRIEF.md decisions #8–#10) its messaging seam: a zero-dependency
Telegram adapter that long-polls one bot token, posts into one supergroup's forum topics
(one topic per project), renders AskUserQuestion-shaped questions as inline keyboards, and
routes button taps back to pending asks. Done means the adapter round-trips a question to an
answer against an injected fake transport under `tests/autopilot/`, and the `autopilot`
plugin exists in the marketplace.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | Zero external dependencies: global `fetch` + Node built-ins only; transport injected as `fetchImpl` for tests | Repo convention (`.claude/rules/conventions/scripts.md`); rejected: a Telegram client package |
| D2 | Adapter interface is platform-neutral (`send/askButtons/sendPhoto/onAnswer/onText/start/stop`); `telegram.js` is its only v1 implementation | BRIEF #10 reserves a later Slack adapter behind the same seam; rejected: Telegram-shaped calls throughout the daemon |
| D3 | `callback_data` is a closed alphabet: `a:<promptKey>:<qIdx>:<optIdx>` (answer), `d:<promptKey>:<qIdx>` (multiSelect Done), `o:<promptKey>:<qIdx>` (Other…) — `promptKey` is an adapter-assigned integer, never free text | Telegram caps callback_data at 64 bytes; question text can't travel in it; rejected: hashing question text |
| D4 | Updates from user ids not in `allowedUserIds` are ignored silently (logged, never resolved) | The bot is discoverable; only JJ may answer fork questions; rejected: open bot |
| D5 | One `getUpdates` long-poll loop per adapter instance, offset = last `update_id` + 1, persisted in memory only | One poller per token (BRIEF #8); missed updates are re-served by Telegram within 24h after restart; rejected: offset file |
| D6 | 429 responses honor Telegram's `parameters.retry_after` then retry the same call; other 5xx retry with exponential backoff (base 1s, cap 60s, max 5 tries) | BRIEF #7 requires graceful degradation; rejected: fail-fast |
| D7 | Free-text answers ("Other") arrive as a plain topic message; `onText` hands them to the daemon, which matches them to that topic's single pending ask | Telegram has no per-button text prompt; one-pending-ask-per-topic makes matching unambiguous (lane blocks while asking, BRIEF #5) |
| D8 | Messages over 4096 chars split into sequential ≤4096-char messages on line boundaries | Telegram hard limit; rejected: silent truncation |
| D9 | Plugin registration (`autopilot/.claude-plugin/plugin.json` v0.1.0 + marketplace entry) lands in this spec | First landing unit makes the plugin real; repo new-plugin checklist (pipeline rules § Planning) |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| autopilot/.claude-plugin/plugin.json | CREATE | other | name `autopilot`, version `0.1.0`, description, author (match spec/git shape) |
| .claude-plugin/marketplace.json | MODIFY | other | append `{name: "autopilot", source: "./autopilot", description}` |
| autopilot/daemon/telegram.js | CREATE | scripts | adapter factory `createTelegramAdapter(opts)`; long-poll loop; inline keyboards; splitting; backoff; allowlist |
| .claude/rules/conventions/scripts.md | MODIFY | doctrine | frontmatter `paths:` gains `"autopilot/**"` so script conventions ground autopilot worker sessions (refuter finding: rule never fired for `autopilot/daemon/**`) |
| tests/autopilot/telegram.test.js | CREATE | tests | AC-20260801-01-1 … AC-20260801-01-8, injected `fetchImpl`, no network |

## Contracts

```js
// autopilot/daemon/telegram.js — the messaging seam (platform-neutral surface)
// Zero deps. Header comment per repo script conventions (usage, why, NOT-do, Exit codes: n/a — library).
createTelegramAdapter({
  botToken,            // string
  supergroupId,        // number (negative -100… id)
  topicMap,            // { [project: string]: number /* message_thread_id */ }
  allowedUserIds,      // number[] — updates from anyone else are ignored (D4)
  fetchImpl,           // optional, defaults to global fetch — injected in tests (D1)
  pollTimeoutSec,      // optional, default 50 (long-poll timeout)
}) => ({
  start(),                                  // begins getUpdates loop; idempotent
  async stop(),                             // aborts in-flight poll, resolves when loop exited
  async send(project, text),                // → { messageIds: number[] } (split per D8)
  async sendPhoto(project, {buffer, filename, caption}), // → { messageId }
  async askButtons(project, ask),           // ask = { promptKey?: never, questions: AskUserQuestionInput.questions }
                                            // → Promise resolving { answers: { [questionText]: string | string[] } }
                                            //   one message per question; buttons per option + "Other…";
                                            //   multiSelect → toggle buttons + "✔ Done"; resolves only when
                                            //   every question is answered. No timeout ever (BRIEF #5).
  onText(cb),                               // cb({ project, text, userId }) — free-text replies in a topic (D7)
  pendingAsk(project),                      // → true if a topic has an unresolved ask (used by daemon + D7 matching)
  cancelAsk(project),                       // reject + clear the topic's pending ask (lane stop/abort path)
})
// callback_data wire format (D3, closed alphabet): `a:<promptKey>:<qIdx>:<optIdx>` answer ·
// `d:<promptKey>:<qIdx>` multiSelect Done · `o:<promptKey>:<qIdx>` Other… (free-text flow, Behavior).
// cancelAsk(project): rejects the pending ask's promise, clears pendingAsk, removes keyboards
// (editMessageReplyMarkup) — used by lane stop(); a tap on a cancelled ask is answered + ignored.
// Telegram methods used: getUpdates, sendMessage (message_thread_id, reply_markup.inline_keyboard),
// sendPhoto (multipart), answerCallbackQuery, editMessageReplyMarkup (multiSelect toggle render).
```

## Behavior

- **Ask flow:** `askButtons` assigns the next integer `promptKey`, sends one message per
  question into the project's topic (question text + option labels as buttons, one per row,
  option `description` appended to the message body as `— label: description` lines), and
  registers the pending ask. A tap arrives as `callback_query`; the adapter answers it
  (`answerCallbackQuery`, so the phone stops spinning), records the choice, and when all
  questions in the ask are answered resolves the promise with
  `{ answers: { [question text]: chosen label } }`. multiSelect questions toggle ✅ marks on
  the keyboard via `editMessageReplyMarkup`; "✔ Done" commits the set (array of labels).
- **"Other…" button:** tapping it edits the question message to say "reply in this topic
  with your answer"; the next `onText` message in that topic from an allowed user resolves
  that question with the free text (the daemon passes it through — the SDK adds the Other
  path natively, spike-verified `AskUserQuestionInput` has no Other option baked in).
- **Long-poll loop:** `getUpdates(offset, timeout=pollTimeoutSec, allowed_updates=["message","callback_query"])`
  in a serial loop; each batch advances offset to max `update_id`+1 before processing (a
  crash mid-batch re-serves, handlers must tolerate replays — resolving an already-resolved
  ask is a no-op). Network errors: backoff per D6, loop never exits except via `stop()`.
- **Failure isolation:** a throwing consumer callback is caught and logged; the poll loop
  survives. `send` to an unknown project throws synchronously (config bug, fail loud).

## Acceptance Criteria

- **AC-20260801-01-1**: WHEN `askButtons("prax", {questions:[{question:"Which storage?",header:"Storage",options:[{label:"SQLite",description:"single file"},{label:"Postgres",description:"needs server"}],multiSelect:false}]})` is called THE SYSTEM SHALL POST `sendMessage` with `message_thread_id` = topicMap.prax and `reply_markup.inline_keyboard` containing buttons labeled `SQLite`, `Postgres`, and `Other…` with callback_data `a:1:0:0`, `a:1:0:1`, `o:1:0` → test in tests/autopilot/telegram.test.js
- **AC-20260801-01-2**: WHEN a `callback_query` update with data `a:1:0:1` from an allowed user arrives THE SYSTEM SHALL call `answerCallbackQuery` and resolve the pending ask with `{answers:{"Which storage?":"Postgres"}}` → tests/autopilot/telegram.test.js
- **AC-20260801-01-3**: WHEN the transport returns HTTP 429 with body `{"parameters":{"retry_after":2}}` for `sendMessage` THE SYSTEM SHALL retry the identical call after ≥2s and ultimately deliver it (fake clock/short-circuit in test) → tests/autopilot/telegram.test.js
- **AC-20260801-01-4**: WHEN any update arrives from user id not in `allowedUserIds` THE SYSTEM SHALL neither resolve any pending ask nor answer the callback, and the poll loop SHALL continue (next update processed) → tests/autopilot/telegram.test.js
- **AC-20260801-01-5**: WHEN `send` is called with a 9000-char text THE SYSTEM SHALL deliver it as 3 sequential `sendMessage` calls each ≤4096 chars, split at line boundaries where possible (e.g. 9000 chars of 80-char lines → 3 messages, none mid-line) → tests/autopilot/telegram.test.js
- **AC-20260801-01-6**: WHEN a multiSelect question's option is tapped twice then `d:<key>:<qIdx>` (Done) arrives THE SYSTEM SHALL resolve that question with the empty array `[]` (toggle on + off = deselected; literal `{"answers":{"Which features?":[]}}`) → tests/autopilot/telegram.test.js
- **AC-20260801-01-7**: WHEN `getUpdates` returns updates with `update_id` 7 and 8 THE SYSTEM SHALL issue the next `getUpdates` with `offset=9` (no reprocessing) → tests/autopilot/telegram.test.js
- **AC-20260801-01-8**: WHEN `stop()` is called during an in-flight long-poll THE SYSTEM SHALL abort the request and resolve `stop()` within the poll timeout, with no further transport calls after resolution → tests/autopilot/telegram.test.js
- **AC-20260801-01-9**: WHEN `cancelAsk("prax")` is called with an ask pending THE SYSTEM SHALL reject that ask's promise, make `pendingAsk("prax")` return false, and a subsequent `callback_query` for the cancelled promptKey SHALL be answered (`answerCallbackQuery`) but resolve nothing → tests/autopilot/telegram.test.js

## Assumptions (escalation triggers)

- A1: Telegram Bot API surface used (getUpdates/sendMessage/sendPhoto/answerCallbackQuery/editMessageReplyMarkup, forum `message_thread_id`, 64-byte callback_data, 4096-char messages) is stable as documented — **if false:** adapter isolates all wire calls in one `api()` helper; fix there, tests are transport-injected so they pin our behavior not Telegram's.
- A2: One pending ask per topic at a time (lane blocks while asking, BRIEF #5) makes free-text matching unambiguous — **if false (concurrent asks appear in a later version):** promptKey is already in callback_data; free-text "Other" would need reply-to-message matching; noted, not built.
- A3: `node:test` fake `fetchImpl` (queued responses) is sufficient — no network in tests, per repo Test Rules — **if false:** STOP, ask the user.

## Rationale

The adapter exists so the daemon (spec 03) never speaks Telegram directly — BRIEF #10 locked
"thin adapter so Slack can be added later". The interface is deliberately the shape of the
SDK's `AskUserQuestionInput` (spike-verified against `@anthropic-ai/claude-agent-sdk@0.3.220`
typings: questions 1–4, options 2–4, `{label, description}`) so the session runner (spec 02)
passes questions through without reshaping. Integer promptKeys (D3) exist because Telegram's
64-byte callback_data cannot carry question text — the wrong obvious design. The allowlist
(D4) is a security decision, not politeness: the bot token grants anyone who finds the bot
the ability to answer design forks. Registration rows (D9) ride here because the repo's
new-plugin checklist binds plugin.json + marketplace entry to the first landed unit.
Fragile: Telegram replay semantics after crash (offset in memory, D5) — handlers are
idempotent by design; watch AC-7's offset math in review. Refuter findings folded: the `o:`
Other-button encoding is now part of D3's closed alphabet (it lived only in AC-1 before),
`cancelAsk` was added because lane `stop()` mid-ask would otherwise strand the topic's
pending-ask flag forever, and the conventions-rule row exists because
`.claude/rules/conventions/scripts.md` is path-scoped and never fired for `autopilot/**`. The scaffold-ledger question
(whether autopilot guards need rows there) was considered: the ledger governs spec-pipeline
guards; autopilot's guards are product behavior pinned by ACs, so no ledger row — revisit if
review disagrees.

## Canonical Delta

Create `docs/canonical/autopilot.md`: autopilot is a sibling plugin (daemon + adapters);
messaging goes through the adapter seam in `autopilot/daemon/telegram.js` (interface:
send/askButtons/sendPhoto/onText/start/stop; platform-neutral, Slack reserved); tests live
under `tests/autopilot/` and inject transports — no network, no SDK imports.
