# 03 — Fleet provisioning: hub-wired daemon, repo discovery, one-command machine setup

Phase: P1
Depends on: none

## Why this brief

2026-08-10 incident: JJ enrolled his own machine against the production hub and got total
silence. Root causes, all verified live: `autopilot enroll` was run without `--project`, so
`hub.json` recorded `"projects": []` and nothing could route to a Telegram topic; the
`autopilot@555-tools` plugin was not in `~/.claude/settings.json` `enabledPlugins`, so the
session-wrapup Stop hook never fired; no daemon process was running, because `enroll`
registers an identity and starts nothing; and no launchd/systemd wiring exists anywhere in
the repo (grep: the only mention is prose in `autopilot/BRIEF.md`), so even a started daemon
dies at reboot.

The deeper finding: **the daemon has never been connected to the hub.** `bin/autopilotd`
requires `~/.config/autopilot/config.json` with a per-host `botToken`, `supergroupId`, and a
hand-assigned Telegram `topicId` per lane (`daemon/config.js`), and speaks Telegram directly
via `daemon/telegram.js` — the pre-hub architecture. Nothing on the daemon path reads
`hub.json`; only `enroll.js` writes it and `wrapup.js` reads it. So per-machine setup means
hand-writing a bot token and topic ids on every box — exactly what does not scale to a
cluster of mini PCs, and a standing 409 risk since Telegram allows one `getUpdates` consumer
per bot token and the hub is now that consumer.

Meanwhile the hub already ships everything the daemon needs: `POST /api/spokes/report`
(narration), `POST /api/spokes/asks` + answers arriving as `answer_given` events over
`GET /api/spokes/poll` (one pending ask per project enforced by 409), idempotent
`POST /api/spokes/projects`, and hub-side Telegram topic auto-creation. The spoke's
messaging seam (`docs/canonical/autopilot.md` § Messaging seam) is already
platform-neutral, so a hub-backed adapter is a drop-in — spoke-repo work only, zero hub
changes.

Target: provisioning a new box is one Telegram `/enroll` tap plus one pasted command —
`autopilot bootstrap --hub <url> --code <code>` — that enrolls, discovers the machine's
spec-grounded repos, installs the service unit, and starts the daemon. The only remaining
manual step is the Claude Code login (irreducibly human).

## Scope

- **Repo discovery + registration.** A repo is spec-grounded iff
  `<repo>/.claude/spec.config.json` exists (the `/spec:init` artifact). Scan exactly one
  level under a `--repos-root` (default `~/Projects`), persisted into `hub.json`; skip
  dotdirs, `node_modules`, and git-worktree checkouts (`.git` is a file, not a directory —
  verified). Project name = directory basename (load-bearing:
  `hooks/session-wrapup.js` `repoBasename()` routes on it). Same-basename collision is a
  hard error listing both paths and registering neither — the hub's projects route is
  idempotent, so a soft merge would silently share one Telegram topic. Discovery re-runs on
  every daemon start (`POST /api/spokes/projects` is idempotent), so adding a repo to a box
  is "clone + restart".
- **Hub-wired daemon.** `autopilotd` boots from `hub.json` + discovery; a new
  `daemon/hub-adapter.js` implements the existing messaging seam over
  `report`/`asks`/`poll`. The direct-Telegram mode (`daemon/telegram.js`, per-host
  `botToken`/`topicId` config) is **deleted** (2026-08-10 ruling — one way to run; a
  leftover direct-mode box would steal the hub's `getUpdates`). `config.json` demotes to
  optional overrides (`devServerCommand`, `tunnelCommand`, `pollSeconds`);
  `specPluginRoot`/`pluginPaths` become derivable from the plugin checkout itself.
- **Failure classification for unattended boxes.** The fleet runs on Claude subscriptions:
  when a box's subscription limit is hit, sessions stop working (2026-08-10 ruling — no
  spend cap needed; the subscription is the ceiling). Auth-expiry and limit-shaped failures
  must classify distinctly instead of folding into `failed` → Fable repair → halt: back
  off, narrate once ("🔑 needs `claude` login" / "⏳ usage limit"), never burn repair passes
  on them.
- **Service wiring + one-command setup.** `autopilot service install|uninstall|status|logs`
  targeting systemd --user (the mini-PC fleet is Linux): unit at
  `~/.config/systemd/user/autopilot.service`, `Restart=always`, `RestartSec=30`,
  `StartLimitIntervalSec=0` (a crash loop must never permanently fail the unit), ExecStart
  baking `process.execPath` + absolute daemon path, installer-PATH snapshot,
  `loginctl enable-linger` (without it the daemon dies at SSH logout on a headless box).
  `autopilot doctor` (offline checks: credential present, plugin enabled, baked node path
  exists, linger on, daemon alive, clock skew vs the hub's `Date` header). `autopilot
  bootstrap --hub <url> --code <code> [--repos-root <dir>]` as a thin composition over the
  individually-runnable subcommands. A pidfile lock so two daemons can never run two lanes
  over one repo.

## Grounding

- `docs/canonical/autopilot.md` — § Messaging seam (the adapter surface the hub adapter
  implements), § Lane engine & daemon, § Enrollment.
- `autopilot/daemon/config.js` (the config split this brief retires), `daemon/enroll.js` +
  `daemon/wrapup.js` (hub.json shape, hub HTTP conventions: ULID event ids, at-least-once +
  hub-side dedupe, `AbortSignal.timeout`), `bin/autopilotd` (boot order, preflight/--hold
  boot leg), `hooks/session-wrapup.js` (basename naming rule).
- `autopilot/contract/` — the vendored hub wire contract (ADR-0007): `PollResponse`
  (events + pending asks), `AskCreateRequest`/`Response`, `ReportRequest`,
  `RegisterProjectRequest`/`Response`.
- autopilot-hub `docs/canonical/api.md` — route table; § "Answers reach spokes as
  `answer_given`" (the only answer path; no HTTP answer route).
- 2026-08-10 session rulings: delete direct-Telegram mode; no cost cap (subscription is the
  ceiling); systemd-first.

## Out of scope

- **launchd/macOS service wiring** — the fleet is Linux; JJ's Mac runs `autopilotd` in
  tmux. `service install` on darwin exits with the remedy naming this deferral.
- **Multi-use / batch enrollment codes** — hub-repo work (route schema + table semantics +
  contract bump). One `/enroll` tap per box is acceptable at fleet size 5–15.
- **Dev-server/tunnel auto-detection** — checkpoints already tolerate absent commands;
  undiscovered repos checkpoint without a URL.
- **Hub-side project/topic deletion**, log rotation, auto-updating the plugins checkout
  (`doctor` prints the checkout's version; updating stays manual).

## Open questions

- Poll-cursor start position for a freshly booted daemon (from 0 replays history; from
  "now" risks missing an answer committed during boot) — resolved at plan time against the
  hub's cursor semantics.
- Exact SDK error shapes for auth-expiry and subscription-limit failures — unverified;
  plan records pattern-match assumptions with fallbacks.
