---
date: 2026-08-10
status: done
risk: T3
open_markers: 0
area: autopilot
design: false
breaking: false
depends_on: [specs/20260810/04-hub-wired-daemon.md]
brief: 03
---

# autopilot service + doctor + bootstrap — survive reboots, one-command machine setup

## Goal

Make the daemon survive reboots and collapse per-machine setup to one pasted command.
Today nothing keeps `autopilotd` alive (launchd/systemd exist only as prose in
`autopilot/BRIEF.md`) — a provisioned box goes dark at the first power cycle. This spec
adds `autopilot service install|uninstall|status|logs` targeting systemd --user (the
mini-PC fleet is Linux), an offline `autopilot doctor`, a pidfile lock so two daemons
can never drive one repo, and `autopilot bootstrap --hub <url> --code <code>
[--repos-root <dir>]` as a thin composition: enroll → discover (inside enroll) →
plugin-enable → service install → doctor. Done = provisioning a box is one Telegram
`/enroll` tap + one pasted command + the Claude Code login.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | systemd --user only; on `process.platform !== 'linux'` every `service` verb exits 2 with the remedy "run `autopilotd` in tmux — launchd support is a recorded deferral (brief 03)" | The fleet is Linux; JJ's Mac is the only darwin box and runs interactive sessions anyway. Building launchd now doubles the surface for zero fleet value. |
| D2 | Unit written to `~/.config/systemd/user/autopilot.service`: `StartLimitIntervalSec=0` in the **`[Unit]` section** (moved from `[Service]` to `[Unit]` in systemd 230 — refuter-sourced; `[Service]` placement is at best legacy-compat, at worst silently ignored on current Ubuntu/Debian), `ExecStart=<process.execPath> <abs path to autopilot/bin/autopilotd>`, `Restart=always`, `RestartSec=30`, `Environment=PATH=<the installing shell's $PATH>`, `[Install] WantedBy=default.target` | `StartLimitIntervalSec=0` is load-bearing: systemd's default start-limit (5 in 10s) flips a crash-looping unit to permanently `failed` — another flavor of the silence this brief exists to kill. Baking `process.execPath` beats `/usr/bin/env node` because the service PATH is not the shell PATH; the PATH snapshot covers what SDK sessions spawn (git, npm, gates, cloudflared). |
| D3 | `service install` = write unit (atomic) → `systemctl --user daemon-reload` → `systemctl --user enable --now autopilot` → `loginctl enable-linger <user>`; `uninstall` = `disable --now` + remove unit + daemon-reload (linger left on); `status` = is-active + linger check + baked-node-path existence + unit-file presence, exit 0 healthy / 1 unhealthy with each failing line naming its remedy; `logs` = exec `journalctl --user -u autopilot -f` passthrough | Linger is the #1 Linux footgun: without it the user manager dies at SSH logout and never starts at boot on a headless box — `enable-linger` needs no root for one's own user. A moved node (nvm/brew upgrade) is detected by `status`/`doctor` with the remedy "re-run autopilot service install". |
| D4 | All systemd/loginctl calls go through an injected `execImpl` (execFileSync-shaped); unit-file generation is a pure exported function | Test rule: no real systemd in tests (CI and JJ's Mac are darwin); generation is pinned byte-exactly, orchestration is pinned via recorded calls. |
| D5 | Pidfile lock in `autopilotd` (normal start only, never `--check`): `<stateDir>/autopilotd.lock` written via `fs.writeFileSync(path, pid, {flag: 'wx'})` (real `O_EXCL` — refuter-executed: second `wx` write throws `EEXIST`); on `EEXIST`, read the pid and branch on **error code, not any-throw**: `process.kill(pid, 0)` succeeding OR throwing `EPERM` = alive (exit 2 naming the pid and remedy — `EPERM` means a live foreign-user process, refuter-executed); throwing `ESRCH` = stale — recover by `unlink` **then a fresh `wx` write**, and an `EEXIST` on that second write means another starter won the race → exit 2 (never an unconditional rewrite). Removed on clean shutdown | Under `Restart=always`, a debug daemon in tmux plus the service is an easy accident — two lanes over one repo means two SDK sessions writing the same worktree. The unlink-then-`wx` recovery closes the refuter-demonstrated TOCTOU: two concurrent starters both seeing a dead pid must not both "rewrite" the lock. Same-user pid-reuse racing the ESRCH check remains accepted residual risk on a single-user box. |
| D6 | `doctor` — offline checks, one line each, exit 0 all-pass / 1 any-fail, each failure naming its remedy: hub.json present+parseable; reposRoot exists; discovery yields ≥0 repos without error (collision = fail); overrides file (if present) parses and names only discovered projects; plugin enabled (`~/.claude/settings.json` `enabledPlugins["autopilot@555-tools"]` true and the `555-tools` marketplace entry present); Node ≥ floor; lock/daemon liveness (pid in lockfile alive → "daemon running (pid N)"); on linux additionally the D3 service checks. Plus one **network-tolerant** check: `GET <hubUrl>/health` with 5s timeout reporting reachability and clock skew vs the response `Date` header (>60s skew = warn line, never a failure; unreachable = warn, not fail) | Doctor is the "why is this box silent" answer sheet — every historical silence cause (2026-08-10 incident) becomes a named line. Skew is warn-only: enrollment-code TTL confusion is worth a line, but a box with no NTP yet must still pass provisioning. |
| D7 | `bootstrap --hub <url> --code <code> [--repos-root <dir>] [--machine-name <n>] [--force]` runs: enroll-step → plugin-enable → `service install` (linux; on darwin print the tmux line and continue) → `doctor`; first hard failure stops with that step's own message; every step is individually re-runnable and idempotent. **Enroll-step mechanism (pinned):** bootstrap itself checks `hub.json` existence *before* invoking enroll — present and no `--force` → print the pass line `= already enrolled (<spokeId>)` and skip to the next step (no EnrollError string-matching, no network); absent, or `--force` given → run enroll with the provided flags (`--force` passes through to enroll's documented re-enroll semantics: mints a new spoke identity, overwrites `hub.json`) | Thin composition over real subcommands (not a monolith): a failure at step 3 must not force a re-enroll that burns a fresh code and mints a duplicate spoke identity. The pre-check pin exists because enroll's refusal is exit-2-with-message, not a machine-discriminated error — bootstrap must not parse strings to distinguish "already enrolled" from real failures (refuter finding). |
| D8 | Plugin-enable step: read `~/.claude/settings.json`, merge `extraKnownMarketplaces["555-tools"] = {source: {source: "directory", path: <checkout root>}}` (shape copied from a live settings file at build time) and `enabledPlugins["autopilot@555-tools"] = true`, preserving every unknown key, write atomically (tmp + rename); already-set is a no-op (no write at all); unparseable settings = fail with remedy, never overwrite. Before writing, re-`stat` the file: if mtime changed since the read, fail with "settings.json changed underneath us — re-run bootstrap". **Accepted residual risk (recorded):** a concurrent Claude Code write landing between the stat and the rename can still be lost — mitigated by the no-op fast path (provisioning boxes rarely have live sessions) and re-runnability | The Stop hook auto-wires via `plugin.json` `hooks` on enablement — per-repo `.claude/settings.json` surgery is the wrong layer (2026-08-10 finding: the missing enable line was itself a root cause of JJ's silent box). A user-level settings file we cannot parse must never be clobbered; the mtime check narrows (not eliminates) the lost-update window Claude Code's own writes create (refuter finding). |
| D9 | New subcommands live as `daemon/service.js`, `daemon/doctor.js`, `daemon/bootstrap.js` library modules; `bin/autopilot` stays the dispatcher owning argv parsing, usage, and exit rendering (existing `enroll` precedent) | Repo convention: pure lib + thin bin keeps everything unit-testable in-process (§ Test Rules mode 4). |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| autopilot/daemon/service.js | CREATE | scripts | unit generation (pure) + install/uninstall/status/logs via execImpl (D1–D4) |
| autopilot/daemon/doctor.js | CREATE | scripts | check runner returning `[{name, ok, detail, remedy?}]` + render (D6) |
| autopilot/daemon/bootstrap.js | CREATE | scripts | sequencing + plugin-enable merge (D7/D8) |
| autopilot/daemon/lock.js | CREATE | scripts | acquire/release pidfile with stale-pid recovery (D5) |
| autopilot/bin/autopilot | MODIFY | scripts | `service`/`doctor`/`bootstrap` dispatch + usage/exit-code header |
| autopilot/bin/autopilotd | MODIFY | scripts | take the lock after arg parse on normal start; release on shutdown (D5) |
| README.md | MODIFY | doctrine | operator setup section rewritten around bootstrap; tmux note for macOS |
| autopilot/.claude-plugin/plugin.json | MODIFY | doctrine | version bump + description changelog |
| tests/autopilot/service.test.js | CREATE | tests | AC-20260810-05-1 … -4 |
| tests/autopilot/doctor.test.js | CREATE | tests | AC-20260810-05-5 … -7 |
| tests/autopilot/bootstrap.test.js | CREATE | tests | AC-20260810-05-8 … -10 |
| tests/autopilot/lock.test.js | CREATE | tests | AC-20260810-05-11, -12 |

## Contracts

```js
// daemon/service.js
renderUnit({ nodePath, daemonPath, pathEnv }) → string   // pure, byte-pinned by tests
installService({ execImpl, fsImpl, platform, env })      // D3 sequence
serviceStatus({ execImpl, fsImpl, platform }) → { ok, lines: [{name, ok, detail, remedy?}] }

// daemon/lock.js
acquireLock({ stateDir, pid, killImpl }) → { acquired: true } | throws LockError(.pid)
releaseLock({ stateDir, pid })                            // removes only if it holds it

// daemon/doctor.js
runDoctor({ fsImpl, execImpl, fetchImpl, platform, homedir }) → { ok, lines: [...] }

// daemon/bootstrap.js
runBootstrap({ args, deps })  // deps = injected enroll/discover/service/doctor/settings fns
```

Unit file content (D2), exactly:

```ini
[Unit]
Description=autopilot spoke daemon
StartLimitIntervalSec=0

[Service]
ExecStart={nodePath} {daemonPath}
Restart=always
RestartSec=30
Environment=PATH={pathEnv}

[Install]
WantedBy=default.target
```

## Behavior

- `service install` on linux: D3 sequence; any exec failure exits 1 printing the failed
  command verbatim plus stderr. On darwin: exit 2 with the D1 remedy.
- `status`/`doctor` degrade gracefully: each check runs even when earlier ones fail, so
  one run shows the full picture (a box can be missing linger AND have a moved node).
- `bootstrap` prints a final report: each step's ✅/⚠ line, then the one manual step —
  `claude` login — with the note that until login, lanes will halt with the 🔑 line
  (spec 04 D9), which is itself phone-visible once the daemon runs.
- Lock lifecycle — order pinned: parse args → `mkdirSync(stateDir)` (the lock lives
  inside it) → `acquireLock` → adapter/lane construction → start. `--check` never
  touches the lock (preflight must be able to run beside a live daemon).
- `logs` on linux replaces the process image (spawn with stdio inherit and forward the
  exit code) — a passthrough, not a re-implementation.

## Acceptance Criteria

- **AC-20260810-05-1**: WHEN `renderUnit({nodePath: '/usr/bin/node', daemonPath:
  '/opt/cp/autopilot/bin/autopilotd', pathEnv: '/usr/bin:/bin'})` runs THE SYSTEM SHALL
  return the Contracts unit content byte-exactly with those values substituted
  (including `StartLimitIntervalSec=0` under `[Unit]`, not `[Service]`) →
  tests/autopilot/service.test.js
- **AC-20260810-05-2**: WHEN `installService` runs on linux THE SYSTEM SHALL write the
  unit to `~/.config/systemd/user/autopilot.service` then call, in order:
  `systemctl --user daemon-reload`, `systemctl --user enable --now autopilot`,
  `loginctl enable-linger <user>` → tests/autopilot/service.test.js
- **AC-20260810-05-3**: WHEN any `service` verb runs with `platform: 'darwin'` THE
  SYSTEM SHALL exit 2 and the message SHALL name tmux and the launchd deferral →
  tests/autopilot/service.test.js
- **AC-20260810-05-4**: WHEN `serviceStatus` finds linger `no` or the baked node path
  missing THE SYSTEM SHALL report that line `ok: false` with its remedy
  (`loginctl enable-linger` / `re-run autopilot service install`) and overall exit 1,
  while still reporting every other line → tests/autopilot/service.test.js
- **AC-20260810-05-5**: WHEN `runDoctor` runs on a box with no `hub.json` THE SYSTEM
  SHALL fail that line with remedy `autopilot enroll`, still run all remaining checks,
  and exit 1 → tests/autopilot/doctor.test.js
- **AC-20260810-05-6**: WHEN the hub is reachable and its `Date` header differs from
  local time by more than 60s THE SYSTEM SHALL print a skew warn line and NOT count it
  as a failure (exit 0 when all real checks pass); WHEN unreachable THE SYSTEM SHALL
  warn, not fail → tests/autopilot/doctor.test.js
- **AC-20260810-05-7**: WHEN `~/.claude/settings.json` lacks
  `enabledPlugins["autopilot@555-tools"]` THE SYSTEM SHALL fail that line naming the
  bootstrap plugin-enable step as remedy → tests/autopilot/doctor.test.js
- **AC-20260810-05-8**: WHEN `runBootstrap` succeeds THE SYSTEM SHALL have invoked, in
  order: enroll (with reposRoot), plugin-enable, service install, doctor — and its final
  output SHALL name the `claude` login as the remaining manual step →
  tests/autopilot/bootstrap.test.js
- **AC-20260810-05-9**: WHEN the plugin-enable step reads a settings file with unrelated
  keys THE SYSTEM SHALL write back those keys unchanged plus the marketplace entry and
  `enabledPlugins["autopilot@555-tools"]: true` (literal check: input
  `{"model": "opus", "enabledPlugins": {"spec@555-tools": true}}` → output preserves
  both and adds the autopilot entry); WHEN the file is unparseable THE SYSTEM SHALL
  fail with a remedy and not write → tests/autopilot/bootstrap.test.js
- **AC-20260810-05-10**: WHEN the service-install step fails THE SYSTEM SHALL stop,
  exit non-zero with that step's message; WHEN bootstrap re-runs with `hub.json`
  present and no `--force` THE SYSTEM SHALL print `= already enrolled` and invoke no
  enroll (and no network) for that step — D7's pre-check, never EnrollError
  string-matching → tests/autopilot/bootstrap.test.js
- **AC-20260810-05-11**: WHEN `acquireLock` finds a lockfile whose pid is alive (kill-0
  succeeds) or foreign (`EPERM`) THE SYSTEM SHALL throw `LockError` carrying that pid;
  WHEN the pid is dead (`ESRCH`) THE SYSTEM SHALL unlink and retake via a fresh
  `wx` write; WHEN that fresh `wx` write throws `EEXIST` (a racing starter won) THE
  SYSTEM SHALL throw `LockError`, never overwrite → tests/autopilot/lock.test.js
- **AC-20260810-05-12**: WHEN `autopilotd` starts normally THE SYSTEM SHALL hold the
  lock and release it on SIGTERM shutdown; WHEN started with `--check` THE SYSTEM SHALL
  CONTINUE TO run preflight without creating or touching the lockfile →
  tests/autopilot/lock.test.js
- **AC-20260810-05-13**: WHEN `autopilot service`/`doctor`/`bootstrap` are invoked with
  a bad flag or missing value THE SYSTEM SHALL exit 2 printing usage (existing bin
  convention), and `autopilot enroll`'s exit alphabet SHALL CONTINUE TO be 0/1/2 as
  documented → tests/autopilot/bootstrap.test.js

## Assumptions (escalation triggers)

- A1: `loginctl enable-linger <self>` needs no root for one's own user (systemd
  documented behavior) — *unverified on the target mini PCs* (no Linux box in this
  session). — **if false:** `install` prints the sudo variant as a 👤 manual line and
  `status` keeps checking; never silently skip the linger check.
- A2: `systemctl --user` is present and functional on the fleet's distro (any
  systemd-based distro; the mini PCs are assumed stock Ubuntu/Debian-family). —
  **if false (non-systemd distro):** blocked; service backend choice returns to the
  user.
- A3: The live `~/.claude/settings.json` marketplace entry shape
  (`extraKnownMarketplaces["555-tools"]`) is as observed 2026-08-10 on JJ's machine;
  the build worker copies the exact shape from a live file, not from this spec's
  paraphrase. — **if false / shape differs on a fresh machine:** blocked; verify against
  a clean Claude Code install before writing.
- A4: `process.kill(pid, 0)` throws `ESRCH` for dead pids, `EPERM` for live
  foreign-user pids, and succeeds for live same-user ones. **Executed 2026-08-10**
  (refuter checks): self → no throw; dead pid → `ESRCH`; pid 1 → `EPERM`. D5 branches
  on the code, treating only `ESRCH` as stale. Same-user pid-reuse racing the check is
  accepted residual risk on a single-user box. — **if false:** unreachable; evidence
  recorded.
- A6: systemd claims (`StartLimitIntervalSec` placement in `[Unit]`, bare `autopilot`
  implying `.service`, `WantedBy=default.target` for user units, rootless
  `enable-linger`) are documentation-sourced and **unverifiable on this darwin
  machine**; the first Linux install is the executed check. — **if any false:**
  `service status`/`doctor` surface it as a failing line; fix the generator, never
  hand-edit installed units.
- A5: Journald handles log retention (`journalctl --user`); no rotation work needed
  spoke-side. — **if false (distro without persistent user journal):** logs are still
  viewable per-boot; retention is a recorded deferral, not a blocker.

## Rationale

The decomposition principle is "every step individually re-runnable": fleet debugging
at 2am is `doctor` → the one failing line → its remedy command, never "re-run the whole
bootstrap and hope". That is also why bootstrap refuses to be clever — it sequences
real subcommands and stops at the first hard failure with that step's own message.
The lock (D5) lands here rather than spec 04 because `Restart=always` is what makes
the two-daemons accident likely (a tmux debug session beside the service); its
stale-pid recovery exists for the same reason (crash restarts never ran cleanup).
Doctor's checks are exactly the 2026-08-10 incident's causes plus Fable-consult
findings (moved node path, linger, clock skew) — it is the runbook, mechanized. The
darwin refusal (D1) was weighed against shipping launchd now: JJ's Mac is the only
darwin box, it runs interactive Claude sessions (wrap-up relay covers it), and the
launchd surface (bootstrap/bootout verbs, no rotation, gui-domain quirks) is real
cost for zero fleet boxes — recorded deferral in brief 03's Out of scope. Adversarial
note honored from planning: `service logs` must exec-passthrough, not parse journal
output — parsing invites drift against journalctl formats.

**Build deviations (folded 2026-08-11, one-off interpretation calls):** D6's "daemon
running (pid N)" liveness line is informational only — it never gates doctor's overall `ok`
(AC-6 requires a passing doctor on a box with no daemon running; the D3 service checks own
install/active assertions). D5's post-`EEXIST` pid read in the stale-lock retake is
best-effort (tolerates `ENOENT` when the racing winner's write is already gone) — the
`LockError` throw is unconditional either way.

**Review dispositions (2026-08-11, iteration 1 — wf_6c217c0f-8f2):** five panel findings, all
fix-dispatched (user-approved): re-stat failure error in `daemon/bootstrap.js` now names its
remedy (demonstrated hard finding); duplicated contract-version loader removed from
`daemon/bootstrap.js` — `bin/autopilot` resolves once and passes `deps.contractVersion`
(enroll.js DI precedent); linux service-install success now logs its ✅ line per Behavior;
the three tmp+rename copies (enroll/service/bootstrap) extracted into shared
`daemon/atomic.js` — user chose the wider cleanup knowingly, `enroll.js` + `atomic.js` are
sanctioned review-fix additions outside the original File Plan. Rejected (mechanical scope
finding): `docs/roadmap/00-overview.md`, `docs/roadmap/04-review-smell-lens.md`,
`docs/roadmap/05-hotspot-audit.md` are JJ's own uncommitted roadmap-planning edits predating
this review, not build output — confirmed by user, left uncommitted.

## Canonical Delta

`docs/canonical/autopilot.md` § Lane engine & daemon gains: the pidfile lock rule (one
daemon per box; `--check` exempt). New § Provisioning: bootstrap composition (D7),
service unit parameters and why (`StartLimitIntervalSec=0`, PATH snapshot,
`process.execPath` baking, linger), doctor as the mechanized silence-runbook, the
darwin/tmux deferral, and the rule that the plugin-enable step merges user-level
settings and never edits per-repo `.claude/settings.json`. Root `README.md` operator
section is rewritten around `bootstrap` (README owns operator setup; autopilot ships no
README of its own).
