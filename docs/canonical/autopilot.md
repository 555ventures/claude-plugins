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

## Conventions

- Zero dependencies: global `fetch`/`FormData`/`Blob`/`AbortController` and Node built-ins only.
  Transports are injected (`fetchImpl`) rather than mocked by module interception.
- `autopilot/**` is covered by `.claude/rules/conventions/scripts.md` (script conventions:
  header comment, remedy-naming errors, hand-rolled arg parsing).
- Tests live under `tests/autopilot/` and inject transports — no network, no SDK imports. The
  scoped location matters: the repo's full suite carries deliberate failing INTAKE pins, so
  pipeline gate runs are scoped to `tests/<scope>/`.
