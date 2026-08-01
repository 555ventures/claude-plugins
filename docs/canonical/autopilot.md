# Canonical — autopilot

Autopilot is a sibling plugin in this marketplace repo (`autopilot/`): a daemon plus its
messaging adapters. It is product code, not spec-pipeline machinery — its guards are pinned by
spec ACs, not by `spec/doctrine/scaffold-ledger.md` rows.

## Messaging seam

All messaging goes through the adapter seam in `autopilot/daemon/telegram.js`. The daemon never
speaks Telegram directly, so a later Slack adapter can implement the same surface (BRIEF #10).

Platform-neutral interface:
`start · stop · send · sendPhoto · askButtons · onText · pendingAsk · cancelAsk`

- `askButtons(project, ask)` takes the SDK's `AskUserQuestionInput.questions` shape verbatim
  (questions 1–4, options 2–4, `{label, description}`) and resolves
  `{ answers: { [question text]: string | string[] } }` — no timeout, ever.
- `callback_data` is a closed alphabet: `a:<promptKey>:<qIdx>:<optIdx>` (answer) ·
  `d:<promptKey>:<qIdx>` (multiSelect Done) · `o:<promptKey>:<qIdx>` (Other…). `promptKey` is an
  adapter-assigned integer because Telegram caps `callback_data` at 64 bytes — question text
  can never travel on the wire.
- One pending ask per topic (the lane blocks while asking), which is what makes free-text
  "Other…" replies matchable without reply-to threading.
- Every wire call funnels through one `api()` helper: 429 honors `parameters.retry_after` and
  retries uncapped; other 5xx/network failures back off exponentially (1s base, 60s cap, 5 tries).
- Updates from user ids outside `allowedUserIds` are logged and dropped — the bot is
  discoverable, and answering a fork question is a privileged act.

## Stage execution

Every pipeline stage runs as one fresh Claude Agent SDK session through
`autopilot/daemon/session.js` `runStage()`. The runner owns the SDK Options, the streaming-input
prompt, the `canUseTool` relay, and outcome classification; stage-level truth (did the spec
actually flip state?) is never parsed from the transcript — the caller re-derives it via
`spec-status.js`.

- `canUseTool` is the question/permission seam: `AskUserQuestion` relays to `onQuestion` and
  returns `{behavior:'allow', updatedInput:{questions, answers}}` with answers keyed by question
  text and valued as strings (multiSelect arrays comma-joined). Every other tool relays to
  `onPermission`. It never returns null and never times out — a throwing handler denies with the
  error text, and the session continues and reports.
- Sessions run `permissionMode: 'acceptEdits'` with `settingSources: ['project','user','local']`
  so the host's allowlists and the spec plugin's own hooks apply exactly as in an interactive
  session. Autopilot is not a permission bypass.
- `outcome` is a closed alphabet of four: `done` (result subtype `success`) · `failed` (any other
  result subtype, including future ones, plus non-transient throws) · `retryable` (thrown
  overload/rate-limit — the SDK's internal `api_retry` layer is already exhausted, so daemon
  backoff is the second layer) · `aborted`. The lane engine branches on exactly these.
- Every session gets `env.AUTOPILOT_SESSION='1'` as a recursion guard.

## Lane engine & daemon

- The daemon (`autopilot/bin/autopilotd`) runs **one lane per project**, configured from
  `~/.config/autopilot/config.json` (overridable `--config`). Stages within a repo run
  serially; cross-repo parallelism is the only parallelism. No worktrees, no `build_base`,
  no merge mutex — the lane is its repo's only writer.
- Lane states: `idle` · `checkpoint` · `running` · `asking` · `backoff` · `halted`.
- **The oracle is `spec-status.js --next --json`, never re-derived.** The lane picks the
  first `next[]` entry with no blockers that isn't in its skip set; choosing among the
  oracle's own admissible entries is selection, not derivation. A `/spec:plan` pick runs its
  initial session on `model:"fable"`; every other action takes the default model.
- **Halt policy:** a `failed` stage gets exactly one Fable repair pass, then the lane parks
  and asks — it never auto-advances. `➡ Next spec` adds the path to an in-memory skip set
  (cleared by restart; a restart is the operator's reset lever) and arms a wake chain that
  bypasses `pollSeconds` until the lane settles into idle. `retryable` backs off 30s ×2 to a
  15min cap, forever.
- **Brief checkpoints** start the dev server + tunnel as detached process groups and pause
  for a phone tap before the brief's first stage. Triggered when the pick's brief differs
  from the last completed one, when the pick's path is a roadmap brief, or on an
  `n/a`→different-path-prefix transition. Tunnel URL is captured from the command's stdout
  **or stderr** (cloudflared prints to stderr), 60s timeout → `null`, which never blocks.
- **Narration** is one topic message per stage transition — start (`▶ <action> <path>`),
  done (first report line + cost), halt/idle — never streamed transcripts.
- The daemon **never runs git and never pushes**: review stages run unmodified
  `/spec:review`, which owns its own local merge-back. Merge-strategy forks and every other
  in-session question arrive through the ordinary relay; nothing is special-cased.
- **Lane-state files are advisory.** On restart a lane restores only `lastBrief` and
  re-derives everything else from `spec-status`. A question pending at crash re-materializes
  because the stage re-runs and asks again — repeated, never defaulted.

## Conventions

- Zero dependencies: global `fetch`/`FormData`/`Blob`/`AbortController` and Node built-ins only.
  Transports are injected (`fetchImpl`) rather than mocked by module interception.
- `autopilot/package.json` is the repo's one sanctioned dependency boundary — `spec/` scripts and
  `tests/` stay zero-dep. The SDK import lives only in `autopilot/daemon/sdk.js`, loaded lazily,
  so `npm test` never needs `autopilot/node_modules`; `session.js` takes `queryImpl` by injection.
- `autopilot/**` is covered by `.claude/rules/conventions/scripts.md` (script conventions:
  header comment, remedy-naming errors, hand-rolled arg parsing).
- Tests live under `tests/autopilot/` and inject transports — no network, no SDK imports. The
  scoped location matters: the repo's full suite carries deliberate failing INTAKE pins, so
  pipeline gate runs are scoped to `tests/<scope>/`.
