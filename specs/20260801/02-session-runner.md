---
date: 2026-08-01
status: implementing
risk: T3
open_markers: 0
area: autopilot
design: false
breaking: false
depends_on: [specs/20260801/01-telegram-adapter.md]
depended_on_by: [specs/20260801/03-lane-engine.md]
brief: n/a
spiked: 2026-08-01
---

# autopilot 02 — SDK session runner

## Goal

The daemon's stage executor: spawn one fresh Claude Agent SDK session per pipeline stage
(`/spec:plan|design|build|review` — BRIEF "why a daemon"), intercept AskUserQuestion and
permission prompts via `canUseTool` and relay them to caller-supplied handlers (the Telegram
adapter, in spec 03), classify the outcome, and report cost. Done means a stage round-trips
question → injected answer → completion against a fake `queryImpl` with zero real SDK calls
in tests.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `autopilot/package.json` carries `@anthropic-ai/claude-agent-sdk` (pinned `0.3.220`, spike-verified); the repo's zero-dep rule stays intact for `spec/` scripts and ALL tests | BRIEF locked the SDK; a daemon cannot hand-roll it; the exception is scoped to `autopilot/` — rejected: shelling to `claude -p` (no in-process question answering) |
| D2 | The SDK is imported ONLY inside `autopilot/daemon/sdk.js`, loaded lazily by the daemon entry point; `session.js` receives `queryImpl` by injection | Root `npm test` must pass without `autopilot/node_modules`; tests inject fakes per repo Test Rules |
| D3 | Questions are answered via `canUseTool`: on `AskUserQuestion` return `{behavior:"allow", updatedInput:{questions, answers}}` where `answers` maps question text → a STRING — the chosen label, or multiSelect labels comma-joined (`"a, b"`; SDK types answers as `{[k]: string}`, never arrays — typings-verified `sdk-tools.d.ts` `AskUserQuestionOutput`); the runner joins adapter-side arrays with `", "` | Typings-verified mechanism; rejected: PreToolUse hooks (deny-only fit) and array answers (SDK has no array form) |
| D4 | Non-question permission prompts relay as allow/deny to `onPermission`; `canUseTool` NEVER returns null and never times out | SDK fail-closed warning (typings: accidental null blocks the tool forever); BRIEF #5: wait forever is the policy, silence is not |
| D5 | Sessions run `permissionMode: "acceptEdits"` with the host repo's own settings (`settingSources: ["project","user","local"]` — the SDK's full `SettingSource` alphabet, typings-verified `sdk.d.ts:6626`; `"local"` carries `.claude/settings.local.json` allowlists, `"global"` does not exist) so allowlists + spec hooks (state gate, question-style gate) apply exactly as in interactive sessions | The pipeline's own guardrails must not be bypassed; rejected: `bypassPermissions` (loses the ask-rule surface) |
| D6 | Every spawned session gets `env.AUTOPILOT_SESSION="1"`; the daemon refuses to start when that var is already set (asserted in spec 03) | Recursion guard, same pattern as `question-style-gate.js`'s judge spawn |
| D7 | Outcome classification: `result` subtype `success` → `done`; ANY other `result` subtype (`error_max_turns`, `error_max_budget_usd`, `error_during_execution`, `error_max_structured_output_retries`, and future additions) → `failed`; thrown errors matching 429/overload/5xx → `retryable`; anything else thrown → `failed` with the error text | The lane engine needs exactly three branches (advance / repair-or-halt / backoff); the SDK retries transient API errors internally (`api_retry` stream messages, typings-verified) so a thrown 429/overload means SDK retries are EXHAUSTED — daemon backoff is the second layer, not a duplicate of the first |
| D8 | Prompt uses streaming-input mode (an async generator yielding the single stage command) even though v1 sends one message | Doc-verified: canUseTool answering mid-session requires the long-lived streaming mode; single-shot mode exhausts after the prompt |
| D9 | `model` is passed per stage by the caller (plan → `"fable"` falling back to `"opus"` per shared § Model Placement; other stages omit model — command doctrine picks internally) | Plan is the judgment seat; build/design/review orchestrate their own model placement |
| D10 | This spec amends the repo's zero-dependency enforcement text with the scoped exception it needs: `spec-pipeline.md` § Worker Rules + § Review Checks and `spec/agents/gate-scripts.md` each gain one sentence — "`autopilot/**` may import ONLY `@anthropic-ai/claude-agent-sdk`, and only from `autopilot/daemon/sdk.js`; any other non-builtin import anywhere, or an SDK import elsewhere, stays a hard finding" | A locked Decision that contradicts standing enforcement text without amending it gets hard-flagged by its own review (refuter-demonstrated); the carve-out is narrower than the rule it pierces |
| D10a | (retainer ruling, 2026-08-01) The File Plan path `spec/agents/gate-scripts.md` is corrected to `.claude/agents/gate-scripts.md` — the sole `gate-scripts.md` in the repo and the only file whose `## Critical Constraints` carries the zero-dependency bullet D10 amends (`.claude/agents/gate-scripts.md:31`); same MODIFY action, same section, same sentence, no scope change | `spec/agents/` holds only `reviewer.md` and no file under `spec/` references `gate-scripts`; creating a new plugin-side agent file would widen scope beyond the row's MODIFY action |
| D11 | `autopilot/package.json` pins `"engines": {"node": ">=20.19.0"}` — the SDK is ESM-only (`"type":"module"`, no `require` export condition) and `require()` of ESM needs Node ≥20.19; the daemon entry (spec 03) asserts the floor at boot | Executed finding: `require()` works on Node 26 but would throw `ERR_REQUIRE_ESM` on the SDK's own stated 18.x floor |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| autopilot/package.json | CREATE | other | private, `"dependencies": {"@anthropic-ai/claude-agent-sdk": "0.3.220"}`, `"engines": {"node": ">=20.19.0"}` (D11) |
| .claude/rules/spec-pipeline.md | MODIFY | doctrine | § Worker Rules + § Review Checks gain D10's scoped-exception sentence; § Test Rules gains sanctioned mode (4): in-process DI unit tests for `autopilot/daemon/*` lib modules (injected fakes, `node:test` mock timers) |
| .claude/agents/gate-scripts.md | MODIFY | doctrine | Critical Constraints gains D10's scoped-exception sentence (this agent implements `autopilot/daemon/*`); path corrected per D10a |
| autopilot/daemon/sdk.js | CREATE | scripts | sole `require("@anthropic-ai/claude-agent-sdk")`; exports `{ query }`; header documents D2 |
| autopilot/daemon/session.js | CREATE | scripts | `runStage(opts)` — builds Options, streaming prompt, canUseTool relay, outcome classification |
| autopilot/.claude-plugin/plugin.json | MODIFY | other | bump 0.1.0 → 0.2.0, description notes session runner |
| tests/autopilot/session.test.js | CREATE | tests | AC-20260801-02-1 … AC-20260801-02-7, fake `queryImpl`, no SDK import |

## Contracts

```js
// autopilot/daemon/session.js
async runStage({
  repoRoot,          // cwd for the session (one host repo)
  prompt,            // full stage command, e.g. "/spec:build specs/20260801/02-x.md"
  model,             // optional — see D9; "fable" retried as "opus" on unavailable-model errors
  pluginPaths,       // string[] → options.plugins = paths.map(p => ({type:"local", path:p}))
  onQuestion,        // async (questions /* AskUserQuestionInput.questions */) => answers
                     //   answers = { [questionText]: string | string[] } — arrays (adapter multiSelect)
                     //   are joined ", " by the runner before reaching the SDK (D3); may resolve hours later
  onPermission,      // async ({toolName, input, title, description}) => {allow:boolean, message?:string}
  queryImpl,         // injected in tests; defaults to lazy require of ./sdk.js (D2)
  env,               // extra env; runner adds AUTOPILOT_SESSION="1" (D6)
  signal,            // AbortSignal — abort → outcome "aborted"
}) => ({
  outcome,           // "done" | "failed" | "retryable" | "aborted"  (D7)
  resultText,        // result message text ("" when absent)
  sessionId,         // for transcript archaeology / resume
  costUsd, usage,    // from the result message (client-side estimate)
  detail,            // subtype or error message when outcome ≠ "done"
})
// Options passed to query(): { cwd, permissionMode: "acceptEdits", settingSources: ["project","user","local"],
//   plugins, model?, env: {...process.env, ...env, AUTOPILOT_SESSION: "1"}, canUseTool,
//   abortController }  // runner-owned AbortController: caller's `signal` → controller.abort() + query.interrupt()
```

## Behavior

- **canUseTool relay:** `toolName === "AskUserQuestion"` → `await onQuestion(input.questions)`
  (unbounded — BRIEF #5), then `{behavior:"allow", updatedInput:{questions: input.questions,
  answers}}`. Any other tool reaching the callback → `await onPermission(...)`; allow →
  `{behavior:"allow"}` (plus `updatedPermissions: options.suggestions` when the handler says
  "always"), deny → `{behavior:"deny", message}`. Handler throw → deny with the error text
  (fail closed, session continues and reports).
- **Model fallback:** if the query dies with an unavailable-model error and `model` was
  `"fable"`, retry once with `"opus"` (shared § Model Placement availability contract);
  the literal string stays `"fable"` in callers.
- **Abort:** the runner owns an `AbortController` passed as `options.abortController`; the
  caller's `signal` triggers `controller.abort()` and `query.interrupt()` (streaming-mode
  method — D8 guarantees availability); a question pending
  at abort time rejects its `onQuestion` promise consumer-side (the lane engine forgets the
  ask; the Telegram buttons for it answer a dead prompt harmlessly — replay-safe per spec 01).
- **No transcript parsing:** outcome comes from the `result` message only; stage-level truth
  (did the spec flip state?) is re-derived by the caller via `spec-status.js` (v6.20.0 rule).

## Acceptance Criteria

- **AC-20260801-02-1**: WHEN `runStage` runs against a fake `queryImpl` that yields a result message `{type:"result", subtype:"success", result:"✅ done", session_id:"s1", total_cost_usd:0.42}` THE SYSTEM SHALL return `{outcome:"done", resultText:"✅ done", sessionId:"s1", costUsd:0.42}` → tests/autopilot/session.test.js
- **AC-20260801-02-2**: WHEN the fake session invokes `canUseTool("AskUserQuestion", {questions:[{question:"Merge strategy?",header:"Merge",options:[{label:"squash",description:"one commit"},{label:"merge-commit",description:"keep history"}],multiSelect:false}]})` and `onQuestion` resolves `{"Merge strategy?":"squash"}` THE SYSTEM SHALL return to the SDK exactly `{behavior:"allow", updatedInput:{questions:[…original…], answers:{"Merge strategy?":"squash"}}}` → tests/autopilot/session.test.js
- **AC-20260801-02-3**: WHEN `canUseTool` fires for `Bash` and `onPermission` resolves `{allow:false, message:"not on autopilot"}` THE SYSTEM SHALL return `{behavior:"deny", message:"not on autopilot"}` and SHALL NOT return null on any path (assert callback result is always an object) → tests/autopilot/session.test.js
- **AC-20260801-02-4**: WHEN the fake `queryImpl` throws an error whose message contains `529` or `overloaded` or `rate limit` THE SYSTEM SHALL return `{outcome:"retryable"}` with the message in `detail` (e.g. `Error("API overloaded_error")` → `retryable`) → tests/autopilot/session.test.js
- **AC-20260801-02-5**: WHEN `runStage` is invoked THE SYSTEM SHALL pass the fake `queryImpl` an options object with `cwd` = repoRoot, `permissionMode:"acceptEdits"`, `settingSources:["project","user","local"]`, `plugins:[{type:"local",path:<each pluginPath>}]`, and `env.AUTOPILOT_SESSION === "1"` → tests/autopilot/session.test.js
- **AC-20260801-02-9**: WHEN `onQuestion` resolves `{"Which features?":["auth","billing"]}` for a multiSelect question THE SYSTEM SHALL hand the SDK `answers:{"Which features?":"auth, billing"}` (comma-joined string; `[]` → `""`) → tests/autopilot/session.test.js
- **AC-20260801-02-10**: WHEN the fake session yields a result with subtype `error_max_structured_output_retries` THE SYSTEM SHALL return `{outcome:"failed"}` with the subtype in `detail` → tests/autopilot/session.test.js
- **AC-20260801-02-6**: WHEN `model:"fable"` and the fake `queryImpl` first throws a model-unavailable error then succeeds THE SYSTEM SHALL have called it twice — second call with `model:"opus"` — and return `outcome:"done"` → tests/autopilot/session.test.js
- **AC-20260801-02-7**: WHEN `signal` aborts while the fake session is mid-stream THE SYSTEM SHALL return `{outcome:"aborted"}` and call the query's interrupt/abort path → tests/autopilot/session.test.js
- **AC-20260801-02-8**: WHEN `require("autopilot/daemon/session.js")` runs in a process with no `autopilot/node_modules` present THE SYSTEM SHALL not throw (SDK require is lazy, only on default `queryImpl` use) → tests/autopilot/session.test.js

## Assumptions (escalation triggers)

- A1 (spike-executed 2026-08-01): `@anthropic-ai/claude-agent-sdk@0.3.220` installs clean on Node 26 and exports `query`; typings confirm `CanUseTool` receives `(toolName, input, {toolUseID, requestId, signal, suggestions})` and `AskUserQuestionInput` is questions[1–4]/options[2–4] `{label, description, preview?}` — observed via `npm install` + `.d.ts` inspection in scratchpad — **if a later SDK breaks the shape:** the pin in package.json holds until deliberately bumped.
- A2 (typings-verified, not live-executed): the `updatedInput.answers` map with question-text keys and STRING values (multiSelect comma-joined — `sdk-tools.d.ts` `AskUserQuestionOutput.answers: {[k]: string}`) is how answers reach the model — **if false:** the fake-driven tests still pass but live sessions misbehave; fallback is echoing answers via a user message in streaming mode; STOP and verify live before spec 03 ships.
- A3: `plugins: [{type:"local", path}]` loads the spec plugin so `/spec:*` slash commands and hooks (state gate, question-style gate) fire headless — **if false:** sessions run with marketplace-installed plugins via settingSources instead; adjust `pluginPaths` to empty and rely on host installation.
- A4: hook-blocked prompts (state gate exit 2) surface as a session that produces no stage work but still completes — **if false (prompt vanishes):** the lane engine's pre-check (`spec-status --next --json`) already prevents issuing gate-violating commands; the gate is belt-and-suspenders.

## Rationale

This spec is the boundary between "our code" and Anthropic's runtime, so every claim a
third-party adjudicates was either executed (A1: install + typings inspection) or carries a
doc citation and a pre-thought fallback (A2). The dependency exception (D1) is the series'
one doctrine deviation: the repo's zero-dep rule protects `spec/` scripts and the test suite,
both untouched — `sdk.js` quarantines the import (D2) so `npm test` never needs
`autopilot/node_modules` (AC-8 pins that). `acceptEdits` over `bypassPermissions` (D5) keeps
the spec plugin's own hooks and the host's ask-rules live — autopilot must not be a
permission bypass; whatever would prompt a human prompts JJ's phone instead (D4). Outcome
classification (D7) is deliberately coarse: the lane engine only branches three ways, and
finer-grained SDK errors are detail text, not states. Refuter findings folded (all
typings/execution-grounded): `settingSources` corrected to the real alphabet
(`"global"` doesn't exist; omitting `"local"` would drop `settings.local.json` allowlists),
multiSelect answers are comma-joined strings not arrays, the fourth error subtype joined the
`failed` bucket, the SDK's internal `api_retry` layer reframed D7's rationale (daemon backoff
is layer two), D10 exists because the zero-dep enforcement text would otherwise hard-flag
this spec's own File Plan, and D11 pins the ESM-only `require()` Node floor. Fragile: A2 is the one unexecuted
load-bearing claim — it's flagged for a live smoke before spec 03's daemon loops unattended. `resultText`
defaults to `""` when a session dies pre-result — callers never branch on its absence.

## Canonical Delta

Append to `docs/canonical/autopilot.md`: stage execution goes through
`autopilot/daemon/session.js runStage()` (fresh SDK session per stage, canUseTool relays
questions/permissions, outcome ∈ done/failed/retryable/aborted); the SDK import lives only in
`autopilot/daemon/sdk.js`; `autopilot/package.json` is the sanctioned dependency boundary —
`spec/` scripts and `tests/` stay zero-dep.
