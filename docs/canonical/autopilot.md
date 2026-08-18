# Canonical — autopilot

Autopilot is a sibling plugin in this marketplace repo (`autopilot/`): a daemon plus its
messaging adapters. It is product code, not spec-pipeline machinery — its guards are pinned by
spec ACs and behavioral tests.

## Messaging seam

All messaging goes through the adapter seam in `autopilot/daemon/hub-adapter.js`, which speaks
the hub API (`POST /api/spokes/report`, `POST /api/spokes/asks`, `GET /api/spokes/poll`) — the
daemon never touches Telegram; the hub owns it. The direct-Telegram adapter was deleted in
0.9.0 (2026-08-10 ruling: one way to run — Telegram permits one `getUpdates` consumer per bot
token and the hub is that consumer; a leftover direct-mode box would silently steal its
updates). The `callback_data` alphabet and 429-handling notes are history — hub-owned now.

Platform-neutral interface (a future adapter — Slack, dashboard — implements the same seven):
`start · stop · send · report · askButtons · pendingAsk · cancelAsk`

- `send(project, text)` posts one `narration` event; `report(project, type, payload)` posts a
  typed event from the vendored `SPOKE_REPORTABLE_EVENT_TYPES` alphabet. Both mint ULID
  eventIds (`hub-http.js`), retry once, and on terminal failure log and drop — a hub outage
  never takes a lane down (0.4.1 lane-failure-semantics discipline).
- Phone-visibility calibration: the hub narrator posts a closed inventory (stage_finished,
  lane_halted, question_asked, ask_cancelled, session_wrapup, project_registered);
  `narration` and `stage_started` are durable-log-only. Lane done/halt lines travel as typed
  events; idle/backoff narration stays free-text `send()`.
- `askButtons(project, ask)` takes the SDK's `AskUserQuestionInput.questions` shape verbatim
  (questions 1–4, options 2–4, `{label, description}`) and resolves
  `{ answers: { [question text]: string | string[] } }` — no timeout, ever. Creation POSTs a
  ULID `clientAskId` and retries indefinitely (1s→60s backoff) until 2xx/409. On `409` the
  adapter adopts a deep-equal pending ask from the next poll's `asks[]` (key-order-insensitive
  compare — `questions` round-trips a Postgres jsonb column) or cancels and re-creates a
  mismatched one, so daemon restarts never duplicate the question on the phone.
- One shared poll loop per adapter: `GET /api/spokes/poll?since=<cursor>` with a durable
  cursor at `<stateDir>/hub-cursor.json` (atomic write; cold start `since=0` replays the
  spoke-scoped history once and drains naturally). Consumes `answer_given` (resolve pending
  ask) and `ask_cancelled` (reject the holder); ignores every other type; errors back off
  1s→60s and never reject the loop; each iteration yields to the macrotask queue.

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

- The daemon (`autopilot/bin/autopilotd`) runs **one lane per project**, booted from
  `~/.config/autopilot/hub.json` (`--hub-config` overrides; missing/invalid → exit 2 naming
  `autopilot enroll`) plus repo discovery re-run at every start, registrations refreshed —
  a box that cannot register exits 1 naming the repo, never runs half-routed.
  `config.json` (`--config`) is **optional overrides only**: per-project
  `{devServerCommand, tunnelCommand, pollSeconds}` keyed by project name (an override key
  naming no discovered project throws — typo guard; `_`-prefixed annotation keys are
  ignored silently, and the retired direct-Telegram host keys — `botToken`, `supergroupId`,
  `allowedUserIds`, `lanes` — are skipped with one boot warning naming the migration, so a
  pre-0.9.0 config degrades instead of crashing; the doctor health check mirrors both
  rules, reporting legacy and unknown-key lines independently (specs/20260817/06); a
  host-level `reposRoot` override steers
  discovery itself), host-level `{specPluginRoot, pluginPaths, reposRoot}` with defaults
  derived from the plugin checkout. Stages within a repo run serially; cross-repo parallelism
  is the only parallelism. No worktrees, no `build_base`, no merge mutex — the lane is its
  repo's only writer.
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
  and asks — it never auto-advances. Exception (D9, 0.9.0): an **auth-shaped failure**
  (anchored, case-insensitive tokens over the stage error's message only —
  authenticat/unauthorized/oauth/api key/logged out/`/login`/status-anchored 401) skips the
  repair pass and halts immediately with one 🔑 `lane_halted` report naming `claude login` —
  a repair pass cannot fix a logged-out box. Subscription-limit exhaustion stays `retryable`
  (backoff, auto-resume), log-only by design. `➡ Next spec` adds the path to an in-memory skip set
  (cleared by restart; a restart is the operator's reset lever) and arms a wake chain that
  bypasses `pollSeconds` until the lane settles into idle. `retryable` backs off 30s ×2 to a
  15min cap, forever.
- **Brief checkpoints** start the dev server + tunnel as detached process groups and pause
  for a phone tap before the brief's first stage. Triggered when the pick's brief differs
  from the last completed one, when the pick's path is a roadmap brief, or on an
  `n/a`→different-path-prefix transition. Tunnel URL is captured from the command's stdout
  **or stderr** (cloudflared prints to stderr), 60s timeout → `null`, which never blocks.
- **Narration** is one event per stage transition, never streamed transcripts: starts go
  typed `report('stage_started', {stage})` (durable-log-only), done
  `report('stage_finished', {stage})` and halts `report('lane_halted', {reason})` (both
  narrator-posted), idle/backoff lines free-text `send()`.
- The daemon **never runs git and never pushes**: review stages run unmodified
  `/spec:review`, which owns its own local merge-back. Merge-strategy forks and every other
  in-session question arrive through the ordinary relay; nothing is special-cased.
- **Lane-state files are advisory.** On restart a lane restores only `lastBrief` and
  re-derives everything else from `spec-status`. A question pending at crash re-materializes
  because the stage re-runs and asks again — repeated, never defaulted.
- **Pidfile lock — one daemon per box** (specs/20260810/05): normal start takes
  `<stateDir>/autopilotd.lock` via an `O_EXCL` (`wx`) write before lane construction; a live
  (or `EPERM`-foreign) pid in the lockfile exits 2 naming that pid. Stale (`ESRCH`) pids
  recover by unlink-then-fresh-`wx` — an `EEXIST` on the retake means another starter won the
  race and is a refusal, never an overwrite. `--check` never touches the lock, so preflight
  runs beside a live daemon.
- **The release contract is a pair, not one promise** (specs/20260814/04): clean release on
  SIGTERM/SIGINT is **best-effort** — it runs in a JS listener, and no listener can run on a
  process that has been killed outright or whose loop is wedged. Reclamation is the
  **guaranteed** leg: after any unclean death the next start's `ESRCH` recovery retakes the
  lock, and a supervisor's SIGKILL escalation (systemd `TimeoutStopSec`) restores the kernel
  default that installing a handler removes. Reading "released on clean shutdown" as a
  guarantee is what made the 2026-08-15 escape look impossible. The daemon's job is to keep a
  listener armed continuously from before the lockfile is written until it exits (the two
  orderings in `bin/autopilotd`, both pinned); the recovery ladder covers everything else.
  Never reclaim a lock from a **live** pid — two daemons on one repo is the hazard the module
  exists to prevent.

## Provisioning

(specs/20260810/05-service-bootstrap.md)

- **Bootstrap is a thin composition of real subcommands** — `autopilot bootstrap --hub <url>
  --code <code> [--repos-root <dir>]` runs enroll → plugin-enable → `service install` (linux;
  darwin prints the tmux line and continues) → `doctor`, stopping at the first hard failure
  with that step's own message. Every step is individually re-runnable and idempotent;
  bootstrap checks `hub.json` existence itself before invoking enroll (present + no
  `--force` → `= already enrolled`, no network) — never string-matching enroll's errors.
  The one manual step it cannot do is the `claude` login; until then lanes halt with the
  phone-visible 🔑 line.
- **Service unit parameters and why**: systemd --user only (darwin = exit 2 naming tmux; the
  launchd deferral is brief 03's). The unit bakes `process.execPath` (service PATH ≠ shell
  PATH), snapshots the installing shell's `$PATH` into `Environment=PATH=` (covers what SDK
  sessions spawn), sets `Restart=always` + `RestartSec=30`, and puts
  `StartLimitIntervalSec=0` in `[Unit]` (post-systemd-230 placement) — without it the default
  start-limit flips a crash-looping unit to permanently `failed`, another silent-box flavor.
  `install` ends with `loginctl enable-linger` — without linger the user manager dies at SSH
  logout and never starts at boot on a headless box.
- **Doctor is the mechanized silence-runbook**: offline one-line checks (hub.json, reposRoot,
  discovery, overrides, plugin enablement, Node floor, lock/daemon liveness, service state on
  linux), each failure naming its remedy command; the hub health probe is network-tolerant —
  unreachable or >60s clock skew warns, never fails, so a box without NTP still provisions.
- **Plugin-enable merges user-level `~/.claude/settings.json`** (marketplace entry +
  `enabledPlugins`), preserving unknown keys, atomic write, mtime-guarded, no-op when already
  set; unparseable settings fail with a remedy and are never overwritten. Per-repo
  `.claude/settings.json` surgery is the wrong layer — the Stop hook auto-wires via
  `plugin.json` on enablement.

## Conventions

- Zero dependencies: global `fetch`/`AbortController` and Node built-ins only.
  Transports are injected (`fetchImpl`) rather than mocked by module interception. The one
  sanctioned inert exception is the vendored hub wire contract at `autopilot/contract/`
  (see § Enrollment) — its typebox import is deliberately unresolved and adds no dependency.
- `autopilot/package.json` is the repo's one sanctioned dependency boundary — `spec/` scripts and
  `tests/` stay zero-dep. The SDK import lives only in `autopilot/daemon/sdk.js`, loaded lazily,
  so `npm test` never needs `autopilot/node_modules`; `session.js` takes `queryImpl` by injection.
- `autopilot/**` is covered by `.claude/rules/conventions/scripts.md` (script conventions:
  header comment, remedy-naming errors, hand-rolled arg parsing).
- Spoke-HTTP helpers (`postJson`, `mintEventId`, `readCredential`) live in
  `autopilot/daemon/hub-http.js`; `wrapup.js` and `discover.js` consume them. `wrapup.js`
  re-exports `mintEventId` for its existing consumers and wraps `HubHttpError` back into
  `WrapupError` at its call sites — its "rejects `WrapupError` only" contract survives the
  extraction (specs/20260810/03-repo-discovery.md D7/A4).
- Tests live under `tests/autopilot/` and inject transports — no network, no SDK imports. The
  scoped location keeps pipeline gate runs fast (`tests/<scope>/` glob form).

**Operational proof.** `autopilotd --check` is an offline preflight — it validates `hub.json`,
forces the real SDK require (which the daemon otherwise loads lazily), asserts the oracle script
exists, **scans for repos but never registers them** (registration is network; preflight is not),
constructs the adapter and every lane, and reports without touching the network, spawning a
process, or writing state. The boot leg's fixture is `autopilot/fixtures/preflight-hub.json` plus
the grounded fixture repo under `autopilot/fixtures/repos/demo/`. With `--hold --ready-file <path>` it stays resident after a passing
preflight so it can serve as a boot leg: `.claude/spec.config.json` declares it as `bootCommand`
with `readyCheck: test -f <path>`, and the repo no longer declares itself `inert`. The reason the
hold mode exists is worth remembering — `smoke.sh` treats a boot process that exits before
`readyCheck` passes as a crash, so a one-shot preflight would red-gate every review. `--state-dir`
overrides the lane-state location and preflight writes nothing there.

**The exemption lesson.** An `inert` runtime declaration is an exemption with an expiry, and this
one expired silently the moment a bootable entry point landed, voiding executed verification for
three consecutive specs. Re-read the declared reason whenever a repo gains a process.

**Live verification.** The Telegram live suite (`tests/autopilot/live.test.js`) was retired in
0.9.0 with the direct-Telegram adapter — the hub owns Telegram now, and that discipline moves
with it to the hub repo. The spoke's live pin is `tests/autopilot/enroll-live.test.js`
(`AUTOPILOT_ENROLL_LIVE=1` + credentials — env-gate discipline unchanged: credential presence
alone never activates a live suite). Operator setup — install, grounding a throwaway repo,
enrollment, start, stop — lives in the root `README.md`; autopilot ships no README of its own.

## Enrollment

Spoke enrollment is `autopilot/bin/autopilot enroll --hub <url> --code <code>` — the
spoke side of the hub's Telegram `/enroll` paste-line. The wire contract is vendored
verbatim at `autopilot/contract/` (hub ADR-0007; read-only, typebox import deliberately
inert; `CONTRACT_VERSION` is always imported from `constants.ts`, never a literal).
Credentials (hubUrl, spokeId, bearer token, projects) persist to
`~/.config/autopilot/hub.json`, 0600, written atomically; the token never appears on
stdout/stderr. Re-enrollment requires `--force` because it mints a second spoke identity
on the hub. Exit alphabet 0/1/2 per the script convention; 401 always renders the fixed
"get a fresh one with /enroll in Telegram" line. Live verification is the env-gated
`tests/autopilot/enroll-live.test.js` (`AUTOPILOT_ENROLL_LIVE=1` + `_HUB` + `_CODE`),
same opt-in discipline as the Telegram live suite.

**Repo discovery (0.8.0).** `autopilot discover [--repos-root <dir>] [--json]` scans exactly
one directory level under a persisted repos root and registers each spec-grounded repo against
the hub's idempotent `POST /api/spokes/projects` route, sequentially in basename order, then
atomically rewrites `hub.json` (0600) with the full `{projectId, name}` list and the resolved
`reposRoot`. The spec-grounded predicate is `<repo>/.claude/spec.config.json` exists (the
`/spec:init` artifact — D1); an empty-but-grounded repo becomes an idle lane, never an error.
Skips: dot-names, `node_modules`, symlinks (`Dirent.isDirectory()` is authoritative), and
git-worktree checkouts (`.git` present as a regular file — D2). Project name = directory
basename; a basename collision is a hard `DiscoverError` naming both paths (D3 — the hub topic
and the Stop hook's wrap-up routing both key on basename, so a soft merge would interleave two
repos in one Telegram topic). reposRoot resolution: `--repos-root` flag → `hub.json.reposRoot`
→ `~/Projects` if present → exit 2 naming the flag (D5). `enroll --repos-root <dir>` runs the
same discovery **before** the network exchange — discovery failures exit 2 without burning the
one-time code — and the deduped, sorted union of discovered basenames and `--project` values
rides `EnrollRequest.projects[]` (D6). Non-2xx from the projects route: exit 1 naming the repo,
`hub.json` untouched; re-running heals (idempotent route).

**Lane failure semantics (0.4.1).** `mainLoop`'s post-oracle body (checkpoint, stage, repair,
halt — everything that narrates through the adapter) is covered by the same catch-log-backoff
discipline as the oracle call: a non-retryable transport error (e.g. Telegram Unauthorized) logs
via the lane logger — never via `narrate`, which is exactly what may be throwing — backs off, and
continues; it must never reject `mainLoop`'s promise and take the daemon down. stop()-driven
rejections still exit the loop. Found when review demonstrated the AC-12 boot test crashing on
this path (specs/20260801/04-live-smoke.md, 2026-08-05).
