# Canonical — autopilot

Autopilot is a sibling plugin in this marketplace repo (`autopilot/`): a daemon plus its
messaging adapters. It is product code, not spec-pipeline machinery — its guards are pinned by
spec ACs, not by `spec/doctrine/scaffold-ledger.md` rows.

## Messaging seam

All messaging goes through the adapter seam in `autopilot/daemon/telegram.js`. The daemon never
speaks Telegram directly, so a later Slack adapter can implement the same surface (BRIEF #10).

Platform-neutral interface:
`start · stop · send · askButtons · pendingAsk · cancelAsk`

The v0.4 screenshot chain (`sendPhoto` + per-lane `screenshotCommand`) and the `onText`
free-text callback were deleted in 0.5.0 as zero-consumer surface (2026-08-07 audit);
free-text "Other…" replies are handled adapter-internally.

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
- **The oracle's action set includes `/spec:escape`** (specs/20260805/03-done-unobserved:
  a done spec whose latest qualifying `stage:"observe"` ledger row is red tops `--next` as a
  full oracle-shaped entry — `blockers:[]`, `parallel:false`, `parallel_reason:null`, and
  `note` carrying the branch/sha/run-url evidence the escape session derives from; D8's
  implication check may still record no escape). The lane dispatches it through the same
  generic path as every other action (no special case — the entry shape carries everything
  `pickFrom` reads) and it is excluded from the `⚡` parallel-lane fan-out on the status side,
  never here.
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

- Zero dependencies: global `fetch`/`AbortController` and Node built-ins only.
  Transports are injected (`fetchImpl`) rather than mocked by module interception.
- `autopilot/package.json` is the repo's one sanctioned dependency boundary — `spec/` scripts and
  `tests/` stay zero-dep. The SDK import lives only in `autopilot/daemon/sdk.js`, loaded lazily,
  so `npm test` never needs `autopilot/node_modules`; `session.js` takes `queryImpl` by injection.
- `autopilot/**` is covered by `.claude/rules/conventions/scripts.md` (script conventions:
  header comment, remedy-naming errors, hand-rolled arg parsing).
- Tests live under `tests/autopilot/` and inject transports — no network, no SDK imports. The
  scoped location matters: the repo's full suite carries deliberate failing INTAKE pins, so
  pipeline gate runs are scoped to `tests/<scope>/`.

**Operational proof.** `autopilotd --check` is an offline preflight — it validates config, forces
the real SDK require (which the daemon otherwise loads lazily), asserts the oracle script exists,
constructs the adapter and every lane, and reports without touching the network, spawning a
process, or writing state. With `--hold --ready-file <path>` it stays resident after a passing
preflight so it can serve as a boot leg: `.claude/spec.config.json` declares it as `bootCommand`
with `readyCheck: test -f <path>`, and the repo no longer declares itself `inert`. The reason the
hold mode exists is worth remembering — `smoke.sh` treats a boot process that exits before
`readyCheck` passes as a crash, so a one-shot preflight would red-gate every review. `--state-dir`
overrides the lane-state location and preflight writes nothing there.

**The exemption lesson.** An `inert` runtime declaration is an exemption with an expiry, and this
one expired silently the moment a bootable entry point landed, voiding executed verification for
three consecutive specs. Re-read the declared reason whenever a repo gains a process.

**Live verification.** Real-world behavior is pinned by a deliberately interactive suite
(`tests/autopilot/live.test.js`) that posts real questions to a real Telegram topic and waits for
a real tap. It activates only under `AUTOPILOT_LIVE=1` plus credentials — credential presence
alone is not enough, so a stray exported token cannot turn `npm test` into a hang. Telegram permits
one `getUpdates` consumer per bot token, so the live tests and a running daemon must never share
one. Operator setup — install, grounding a throwaway repo, config location, start, stop — lives in
the root `README.md`; autopilot ships no README of its own.

**Lane failure semantics (0.4.1).** `mainLoop`'s post-oracle body (checkpoint, stage, repair,
halt — everything that narrates through the adapter) is covered by the same catch-log-backoff
discipline as the oracle call: a non-retryable transport error (e.g. Telegram Unauthorized) logs
via the lane logger — never via `narrate`, which is exactly what may be throwing — backs off, and
continues; it must never reject `mainLoop`'s promise and take the daemon down. stop()-driven
rejections still exit the loop. Found when review demonstrated the AC-12 boot test crashing on
this path (specs/20260801/04-live-smoke.md, 2026-08-05).
