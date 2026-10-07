---
date: 2026-10-05
status: done
build_base: design-retool
tier: critical
area: runtime
breaking: false
depends_on: []
brief: n/a
spiked: 2026-10-05
open_markers: 0
diff_base: a49fc94c10140ea76e89696df7bc3d3ce0c1008f
---

# One port per launch

## Goal

The plugin identifies a running host app by a fixed address in two config fields
(`runtime.readyCheck` and `prototype.url`), so a second launch of the same repo — a sibling spec
worktree, an open prototype round, another session — collides with the first or checks the wrong
app (observed: the boot smoke failed `stale-ready` while a prototype held port 3000). After this
spec every launch the plugin starts or asks for gets its own free port: the smoke leg allocates
one and hands it to the host's commands as `PORT`, and the prototype and build drivers allocate
one, print it in the step line and derive the capture address from it. A host whose config still
names a fixed port behaves exactly as today and `/spec:doctor` says so. Done means two launches of
one PORT-reading host run side by side and each is checked on its own address. Release legs are
out of scope (they check a deployed host).

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | A host is **PORT-reading for smoke** exactly when `runtime.readyCheck` references the shell variable `PORT` (`$PORT`, `${PORT}`, `${PORT:-…}` — the Contracts predicate). For such a host `smoke.sh` allocates one free port per run, `export`s it as `PORT` before the pre-boot probe, and `bootCommand`, every `readyCheck` run and `seedCommand` all see that one value; an inherited `PORT` is overridden; the pass line gains ` \| port: <n>` inside its parentheses (AC-20261005-03-1, AC-20261005-03-2, AC-20261005-03-3) | The ready check is the thing that identifies the app, so it is the opt-in signal; rejected: always exporting `PORT` (a host whose boot ignores it would be probed on a port nothing serves) |
| D2 | A host whose `readyCheck` does not reference `PORT` is untouched: `smoke.sh` allocates nothing and sets nothing, and every existing exit code and sentinel holds (AC-20261005-03-4, AC-20261005-03-5) | "Hosts with a fixed readyCheck keep today's behaviour" is the user's stated bound |
| D3 | The pre-boot probe stays for every host, keeps exit 7 and the `stale-ready` slug, and its sentence becomes: `__SMOKE_FAIL__ stale-ready: another process is already answering on this address — readyCheck passed before bootCommand was spawned. Stop that process and re-run; to let launches of this repo run side by side, make the host read PORT (/spec:doctor names the fix).` The header's exit-7 paragraph is reworded to match (AC-20261005-03-5, AC-20261005-03-6) | The old sentence blamed "a previous run" when the holder was a live sibling launch; the slug and exit code are a machine contract with callers and stay |
| D4 | One new module, `spec/scripts/lib/app-port.js`, is the only place that allocates an app port, decides whether a command reads `PORT`, and resolves a `{port}` address (Contracts). `smoke.sh` calls its CLI (`node "$(dirname "$0")/lib/app-port.js" --if-reads "$READY"`); the two drivers `require` it. An allocation failure in `smoke.sh` exits 5 with `__SMOKE_FAIL__ no-port: …` naming the remedy (documented under exit 5 in the header) (AC-20261005-03-7) | One predicate, not a bash copy and a JS copy that drift; node is the plugin's own runtime and every caller of `smoke.sh` already runs beside it |
| D5 | `prototype.url` may carry the literal placeholder `{port}` (e.g. `http://localhost:{port}`). A URL without it is a fixed address and every driver treats it exactly as today (AC-20261005-03-13, AC-20261005-03-16) | Plugin-substituted config values are brace placeholders everywhere else (`{brief}`, `{file}`, `{testDirs}`); the host part stays the host's choice because a saved sign-in's cookies are bound to it |
| D6 | **Prototype rounds.** When `prototype.url` carries `{port}` the prototype driver keeps one app port per prototype in `status.json` as `appPort` — allocated at `--mark opened`, or on first need for a prototype opened before this spec — and never re-allocates it. The ROUND step's dev-server `Session:` line prints `PORT=<appPort> <bootCommand>`; the probe, the `🎨 ready for pins — <address>` line, the not-answering line and the tailscale share line all use the resolved address; the not-answering line ends ` — the boot command must serve on $PORT` (AC-20261005-03-9, AC-20261005-03-10, AC-20261005-03-11) | A stable address across rounds is what the person pinning has open in a browser; the pin endpoint's port is already kept this way |
| D7 | **Freeze capture.** `--mark frozen` probes and captures at the resolved address: `lib/freeze.js` `captureAll` takes a `baseUrl` argument and sends `--url <baseUrl><state path>`; `contract.json` state urls stay relative exactly as today (AC-20261005-03-12) | The contract must not record a port that no later launch will have |
| D8 | **Build capture.** When `prototype.url` carries `{port}` the build driver keeps one capture port per build in `<spec>.build/capture-port.json` (`{"port": <n>}`), allocated the first time the CAPTURE step prints or `--mark captured` runs, whichever is first. The CAPTURE step prints `PORT=<n> <bootCommand>` and names the resolved address; `--mark captured` joins relative contract urls onto the resolved address. `capture-state.json` and `build-state.json` are not touched (AC-20261005-03-14, AC-20261005-03-15, AC-20261005-03-16) | Both existing sidecar files have pinned shapes; a build runs in its own worktree so a sidecar file is per-launch by construction |
| D9 | **Saved sign-in.** `proto-capture.js` re-points a saved sign-in's browser storage to the capture address: when the storage-state file has exactly one `origins[]` entry whose hostname equals the `--url` hostname and none whose origin equals the `--url` origin, the page opens with the parsed state as an object with that one entry's `origin` replaced; cookies are never edited. In every other case the file path is passed as today; when two or more entries share the hostname and none equals the target, stderr also carries one line `proto-capture: note — cannot tell which saved origin is the app (<origins>); browser storage not re-pointed` (AC-20261005-03-17, AC-20261005-03-18, AC-20261005-03-19) | Spiked (A1): cookies follow the host across ports, `localStorage` does not; guessing between two same-host origins would merge two apps' storage |
| D10 | **Doctor.** `port-check.js` gains a fourth class, `config-fixed-port`, read from `<root>/.claude/spec.config.json` after the tests walk: one finding for `runtime.readyCheck` when the runtime is not inert, the command names a loopback host (`localhost`, `127.0.0.1`, `[::1]`, `0.0.0.0`) and does not read `PORT`; one for `prototype.url` when its hostname is a loopback host and it carries no `{port}`. Finding shape is the existing one (`file` = `.claude/spec.config.json`, `line` = the 1-indexed line holding the key, `text` = the key name). A missing or unparseable config adds no finding. The `tests/`-missing exit 2 is unchanged. `/spec:doctor` check 19 is retitled **Fixed ports** and names the remedy: make the boot command serve on `$PORT`, spell the port `$PORT` in `readyCheck` and `{port}` in `prototype.url` (AC-20261005-03-20) | Extends the existing port check instead of adding a doctor ordinal; a non-loopback address is a deployed or shared host the plugin never launches |
| D11 | **Grounding contract** (the one edit): § Runtime verification states that `smoke.sh` gives each run a free port as `PORT`, that `bootCommand` must serve on it, that `readyCheck`/`seedCommand` read it, and that a `readyCheck` naming a fixed port keeps fixed-address behaviour and cannot run beside a second launch; the example becomes `curl -sf localhost:$PORT/api/health`. § Prototype states `url` carries `{port}` and the driver prints the port to boot on. This repo's `contractHash` is re-stamped (AC-20261005-03-22) | The contract is what `/spec:init` generates from; hosts owe a `/spec:doctor` re-stamp |
| D12 | **Genesis templates.** `spec/templates/finalists.json`: both `readyCheck`s become `curl -sf http://127.0.0.1:$PORT/ >/dev/null`; `next-bun` keeps `bun run dev`; `tanstack-node` becomes `npm run dev -- --port $PORT`. `spec/doctrine/genesis.md`'s finalist shape sentence adds that `bootCommand` serves on `$PORT` and `readyCheck` probes it (AC-20261005-03-21) | Spiked (A2): Next's dev server reads `PORT`; Vite does not and takes the last `--port`; the race runs each finalist through `smoke.sh`, so finalists stop sharing port 3000 |
| D13 | **Init.** `spec/commands/init.md`: the runtime findings and Phase 1.5 substrate say the generated `bootCommand` serves on `$PORT` and `readyCheck` probes `$PORT` (adding the framework's port flag to the command, or a `PORT` read to the host's own boot script, where the dev server does not read the variable), a declared `prototype.url` carries `{port}`, and the generated run skill tells a session to launch on a free port rather than a fixed one [no-ac: command prose the invoking session follows — no script surface; `port-check` (D10) is the executed check on what init produced] | Init authors the config by judgment; the deterministic backstop is D10 |
| D14 | `spec/commands/prototype.md` ROUND and APPROVED sections say the boot line carries the driver's port when the host declares `{port}`, and that the sign-in file may be written on any port of the same host [no-ac: command prose — the driver's printed step (D6) is the tested surface] | Keeps the command file true to the driver |
| D15 | The `spec` plugin is bumped via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` [no-ac: `plugin-bump.js --check` in the gate is the oracle] | Repo rule |
| D16 | Not done here, on purpose: the pin endpoint's own port allocation, Storybook's port in genesis, the release legs, and Claude Code allow-rules for a `PORT=<n> `-prefixed command are all left as they are [no-ac: scope statement] | Each is either already per-launch, out of the stated scope, or (allow-rules) has no documented spelling — see Rationale |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/app-port.js | CREATE | scripts | D4 — `freePort`, `readsPort`, `hasPortSlot`, `resolveUrl`, CLI `--if-reads` |
| spec/scripts/smoke.sh | MODIFY | scripts | D1–D4 — allocation, export, pass-line port, reworded exit-7 sentence and header, `no-port` under exit 5 |
| spec/scripts/prototype-driver.js | MODIFY | scripts | D6, D7 — `appPort` get-or-allocate, ROUND lines, frozen probe and `baseUrl`; header updated |
| spec/scripts/lib/freeze.js | MODIFY | scripts | D7 — `captureAll` takes `baseUrl` (default `config.prototype.url`) |
| spec/scripts/spec-build-driver.js | MODIFY | scripts | D8 — `capture-port.json`, CAPTURE step lines, `--mark captured` join; header updated |
| spec/scripts/proto-capture.js | MODIFY | scripts | D9 — re-point rule; header updated |
| spec/scripts/port-check.js | MODIFY | scripts | D10 — `config-fixed-port`; header updated |
| spec/templates/grounding-contract.md | MODIFY | doctrine | D11 — the one contract edit |
| spec/templates/finalists.json | MODIFY | doctrine | D12 |
| spec/doctrine/genesis.md | MODIFY | doctrine | D12 — the finalist shape sentence |
| spec/commands/init.md | MODIFY | doctrine | D13 |
| spec/commands/doctor.md | MODIFY | doctrine | D10 — check 19 retitled, config remedy |
| spec/commands/prototype.md | MODIFY | doctrine | D14 |
| .claude/spec.config.json | MODIFY | other | D11 — `contractHash` re-stamp |
| spec/.claude-plugin/plugin.json | MODIFY | other | D15 — `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` |
| tests/app-port.test.js | CREATE | tests | AC-20261005-03-7, AC-20261005-03-8, AC-20261005-03-21 |
| tests/smoke-port.test.js | CREATE | tests | AC-20261005-03-1, AC-20261005-03-2, AC-20261005-03-3, AC-20261005-03-4, AC-20261005-03-6 |
| tests/prototype/app-port.test.js | CREATE | tests | AC-20261005-03-9, AC-20261005-03-10, AC-20261005-03-11, AC-20261005-03-12 |
| tests/build/build-driver-port.test.js | CREATE | tests | AC-20261005-03-14, AC-20261005-03-15 |
| tests/prototype/capture-port.test.js | CREATE | tests | AC-20261005-03-17, AC-20261005-03-18 |
| tests/doctor/port-check-config.test.js | CREATE | tests | AC-20261005-03-20 |

Reused, unchanged (no row): `tests/smoke-stale-ready.test.js` (AC-20261005-03-5),
`tests/prototype/prototype-driver.test.js` (AC-20261005-03-13),
`tests/build/build-driver-lane.test.js` (AC-20261005-03-16),
`tests/prototype/capture-sign-in.test.js` (AC-20261005-03-19),
`tests/consistency/contract-stamp.test.js` (AC-20261005-03-22).

Collision notes (no row): `tests/smoke-stale-ready.test.js` spells the retired sentence only
inside an assert *message*, never a match — waived, it stays green and the pin's subject (exit 7,
the slug, boot never spawned) is unchanged. Test helpers the new files need (`freePort`, `runBash`,
`tmpdir`, the prototype and build fixtures) already exist and are used as they are.

## Contracts

```js
// spec/scripts/lib/app-port.js — CommonJS, Node built-ins only.

// A free TCP port on 127.0.0.1, as an integer. Synchronous: binds port 0 in a child process,
// reads the bound number, closes. Throws an Error naming the cause when no port can be bound.
freePort() -> number

// True when a shell command references the variable PORT.
//   /\$PORT(?![A-Za-z0-9_])|\$\{PORT[}:\-+=?#%]/
// true:  'curl -sf localhost:$PORT/h'   'curl localhost:${PORT}/'   'curl localhost:${PORT:-3000}/'
// false: 'curl -sf localhost:3000/h'    'curl localhost:${DEV_PORT:-3000}/'   'curl localhost:$PORTAL/'
//        'test -f .ready'               '' / non-string
readsPort(command) -> boolean

// True when a prototype.url string carries the literal '{port}'.
hasPortSlot(url) -> boolean

// Replaces every '{port}' with String(port). A url with no slot is returned unchanged.
resolveUrl(url, port) -> string

// CLI:  node app-port.js --if-reads <command>
//   command reads PORT  -> prints the free port and a newline, exit 0
//   command does not    -> prints nothing, exit 0
//   allocation failed   -> 'app-port: <cause> — remedy: …' on stderr, exit 1
//   anything else       -> usage on stderr, exit 2
```

```text
smoke.sh pass line, PORT-reading host:
  __SMOKE_PASS__ ready after 2s, stopped cleanly (exit 0) after 0s (boot: <boot> | ready: <ready> | port: 52249)
smoke.sh pass line, fixed host: unchanged (no ` | port:` segment).
smoke.sh exit 5, allocation failed:
  __SMOKE_FAIL__ no-port: could not allocate a free port (<cause>) — remedy: free a loopback port, or give runtime.readyCheck a fixed address
```

```text
prototype status.json (only when prototype.url carries {port}):   "appPort": 52250
<spec>.build/capture-port.json (only when prototype.url carries {port}):   {"port": 52251}

ROUND step, prototype.url = http://localhost:{port}, bootCommand = pnpm dev, appPort = 52250:
  Session: in <worktree>, start the dev server in the background (tracked): PORT=52250 pnpm dev
  🎨 ready for pins — http://localhost:52250
  dev server is not answering on http://localhost:52250 — the boot command must serve on $PORT
  Share (only when someone else must see it): tailscale serve --bg 52250

CAPTURE step, same host, capture port 52251:
  Session: start the app in the background (tracked) so it answers at http://localhost:52251: PORT=52251 pnpm dev
```

```text
port-check.js config findings (plain form, then the --json entry):
  .claude/spec.config.json:12: config-fixed-port runtime.readyCheck
  .claude/spec.config.json:20: config-fixed-port prototype.url
  {"file":".claude/spec.config.json","line":12,"class":"config-fixed-port","text":"runtime.readyCheck"}
```

## Behavior

**Smoke.** After the config is read and before the pre-boot probe, `smoke.sh` asks the module
whether `readyCheck` reads `PORT`. A printed number is exported as `PORT` for the rest of the run;
no output leaves the environment as the caller gave it. Everything after that point is the
existing flow. Because the port was free a moment earlier, the pre-boot probe on a PORT-reading
host normally fails (nothing answers yet) and boot proceeds; when it passes anyway the host's
ready check does not really depend on the port, and the reworded exit-7 sentence is still true.

**Prototype.** `appPort` is read from `status.json`; when the URL carries `{port}` and the field is
absent the driver allocates, writes the field and continues — this is the one case where a bare
(no-mark) run writes `status.json`. The port is never re-allocated: a bound-but-not-yet-answering
port is what the session's own booting server looks like, so the driver cannot tell it from a
foreign holder. The session boots, re-runs the driver, and gets either the ready line or the
not-answering line.

**Build capture.** Same get-or-allocate shape against `capture-port.json`. A contract url that is
already absolute passes through unchanged, exactly as today.

**Sign-in re-point.** Decided per capture from the file's `origins[]` and the `--url`:

| Entries sharing the `--url` hostname | One of them equals the `--url` origin | Page opens with |
|---|---|---|
| 0 | — | the file path (today) |
| ≥1 | yes | the file path (today) |
| exactly 1 | no | the parsed object, that entry's `origin` = the `--url` origin |
| ≥2 | no | the file path, plus the stderr note |

Every existing refusal (not a path string, missing file, unreadable JSON, the redirect checks)
runs first and is unchanged.

**Doctor.** A finding does not change `port-check.js`'s exit rule: any finding, tests or config,
exits 1.

## Acceptance Criteria

- **AC-20261005-03-1**: WHEN `smoke.sh` runs against a host whose `readyCheck` reads `PORT` THE
  SYSTEM SHALL run `bootCommand`, `readyCheck` and (with `--seed`) `seedCommand` with one and the
  same integer `PORT`, exit 0, and print that integer in the pass line (e.g. boot
  `echo "$PORT" > boot.port; touch "ready.$PORT"; exec sleep 30` with a clean-exit trap, ready
  `test -f "ready.$PORT"`, seed `echo "$PORT" > seed.port` → `boot.port` and `seed.port` hold the
  same number `n`, 1024 ≤ n ≤ 65535, and stdout matches `| port: n)`) → writes tests/smoke-port.test.js
- **AC-20261005-03-2**: WHEN two `smoke.sh` runs against copies of one PORT-reading host overlap
  in time THE SYSTEM SHALL give each its own port and pass both (e.g. two runs started together
  with an async runner, each boot holding its port for 2 s → both exit 0, the two pass lines carry
  different `port:` numbers, neither prints `stale-ready`) → writes tests/smoke-port.test.js
- **AC-20261005-03-3**: WHEN the caller's environment already sets `PORT` and the host's
  `readyCheck` reads `PORT` THE SYSTEM SHALL override it with its own allocation (e.g. the test
  holds a listener on port `p` and runs smoke with `PORT=p` → `boot.port` ≠ `p`, exit 0)
  → writes tests/smoke-port.test.js
- **AC-20261005-03-4** `[pre-green: absence-invariant]`: WHEN the host's `readyCheck` does not
  read `PORT` THE SYSTEM SHALL NOT set `PORT` for the host's commands (e.g. ready
  `test -f ready`, boot `echo "${PORT-unset}" > boot.port; touch ready; exec sleep 30`, caller
  environment without `PORT` → `boot.port` holds `unset`, and the pass line has no `port:`)
  → writes tests/smoke-port.test.js
- **AC-20261005-03-5**: WHEN `readyCheck` already passes before `bootCommand` is spawned THE
  SYSTEM SHALL CONTINUE TO exit 7 with a `__SMOKE_FAIL__ stale-ready` line and never spawn boot
  (e.g. ready `test -f ready` with `ready` pre-created → exit 7, no boot marker file)
  → reuses tests/smoke-stale-ready.test.js :: AC-20260821-03-9:
- **AC-20261005-03-6**: WHEN `smoke.sh` exits 7 THE SYSTEM SHALL say what is true of a live
  sibling launch and name the fix (e.g. stdout contains `another process is already answering on
  this address` and `/spec:doctor`, and does not contain `previous run`)
  → writes tests/smoke-port.test.js
- **AC-20261005-03-7**: WHEN `app-port.js --if-reads <command>` runs THE SYSTEM SHALL print a
  bindable port exactly when the command reads `PORT` (e.g. `'curl -sf localhost:$PORT/h'`,
  `'curl localhost:${PORT}/'`, `'curl localhost:${PORT:-3000}/'` → one line, an integer the test
  can then `listen` on at 127.0.0.1, exit 0; `'curl -sf localhost:3000/h'`,
  `'curl localhost:${DEV_PORT:-3000}/'`, `'curl localhost:$PORTAL/'`, `'test -f .ready'` → empty
  stdout, exit 0; no arguments → exit 2 with a usage line on stderr) → writes tests/app-port.test.js
- **AC-20261005-03-8**: WHEN `resolveUrl` is given an address THE SYSTEM SHALL substitute every
  `{port}` and leave a slot-less address alone (e.g. `resolveUrl('http://localhost:{port}', 4123)`
  → `http://localhost:4123`; `resolveUrl('http://localhost:3000', 4123)` → `http://localhost:3000`;
  `hasPortSlot` → `true` then `false`) → writes tests/app-port.test.js
- **AC-20261005-03-9**: WHEN `--mark opened` succeeds on a host whose `prototype.url` is
  `http://127.0.0.1:{port}` THE SYSTEM SHALL record an integer `appPort` in `status.json`, and the
  bare ROUND run SHALL print the boot line with that port and the not-answering line with the
  resolved address (e.g. `appPort` 52250, `bootCommand` `npm run dev` → stdout contains
  `(tracked): PORT=52250 npm run dev` and `dev server is not answering on http://127.0.0.1:52250 —
  the boot command must serve on $PORT`, and contains no `{port}`) → writes tests/prototype/app-port.test.js
- **AC-20261005-03-10**: WHEN something answers HTTP 200 on the recorded `appPort` THE SYSTEM
  SHALL print the ready line and the share line with it (e.g. the test listens on `appPort` 52250
  and runs the driver with an async runner → `🎨 ready for pins — http://127.0.0.1:52250` and
  `tailscale serve --bg 52250`) → writes tests/prototype/app-port.test.js
- **AC-20261005-03-11**: WHEN a prototype's `status.json` has no `appPort` and `prototype.url`
  carries `{port}` THE SYSTEM SHALL allocate one on the bare ROUND run, write it, and print the
  same port on every later run (e.g. delete `appPort`, run twice → `status.json` gains an integer
  `appPort`; both runs print the same `PORT=<n> `) → writes tests/prototype/app-port.test.js
- **AC-20261005-03-12**: WHEN `--mark frozen` captures on a `{port}` host THE SYSTEM SHALL send
  every capture to the resolved address and keep the contract's urls relative (e.g. `appPort`
  52250, states `/women` → `default: /women`, a recording `PROTO_CAPTURE_BIN` → its argv carries
  `--url http://127.0.0.1:52250/women`; `contract.json`'s url for that state is `/women`)
  → writes tests/prototype/app-port.test.js
- **AC-20261005-03-13**: WHEN `prototype.url` carries no `{port}` THE SYSTEM SHALL CONTINUE TO
  print the ROUND step against that literal address with the bare boot command (e.g. url
  `http://127.0.0.1:39217` → `dev server is not answering on http://127.0.0.1:39217`)
  → reuses tests/prototype/prototype-driver.test.js :: AC-20260928-01-5: the bare ROUND run reports
- **AC-20261005-03-14**: WHEN the build driver prints the CAPTURE step on a `{port}` host before
  any capture THE SYSTEM SHALL allocate one capture port, write it to
  `<spec>.build/capture-port.json`, print it in the boot line and the address, and print the same
  port on a second run (e.g. url `http://localhost:{port}`, boot `pnpm dev` → file content
  `{"port": n}`; stdout contains `so it answers at http://localhost:n: PORT=n pnpm dev`; second
  run prints the same `n`) → writes tests/build/build-driver-port.test.js
- **AC-20261005-03-15**: WHEN `--mark captured` runs on a `{port}` host THE SYSTEM SHALL join each
  relative contract url onto the resolved address (e.g. capture port `n`, contract url `/women` →
  the recording capture stub receives `--url http://localhost:n/women`; an absolute contract url
  `http://localhost:3000/men` is received unchanged) → writes tests/build/build-driver-port.test.js
- **AC-20261005-03-16**: WHEN `prototype.url` carries no `{port}` THE SYSTEM SHALL CONTINUE TO
  join a relative contract url onto the literal `prototype.url` (e.g. url `http://localhost:3000`,
  contract url `/women` → `--url http://localhost:3000/women`)
  → reuses tests/build/build-driver-lane.test.js :: --mark captured joins [retired: specs/20261007/03-plan-cites-the-build-replays-and-status-derives-the-delete.md]
- **AC-20261005-03-17**: WHEN the sign-in file has exactly one `origins[]` entry on the `--url`
  hostname and it is on another port THE SYSTEM SHALL open the page with the state as an object
  whose entry is re-pointed and whose cookies are untouched (e.g. file
  `{"cookies":[{"name":"sid","value":"a","domain":"localhost","path":"/"}],"origins":[{"origin":"http://localhost:3000","localStorage":[{"name":"tok","value":"x"}]}]}`,
  `--url http://localhost:4123/women` → `newPage` receives `storageState` as an object with
  `origins[0].origin === "http://localhost:4123"`, the same `localStorage`, and `cookies`
  deep-equal to the file's) → writes tests/prototype/capture-port.test.js [retired: specs/20261007/03-plan-cites-the-build-replays-and-status-derives-the-delete.md]
- **AC-20261005-03-18**: WHEN two `origins[]` entries share the `--url` hostname and neither is
  the `--url` origin THE SYSTEM SHALL pass the file path unchanged and say why on stderr (e.g.
  origins `http://localhost:3000` and `http://localhost:4000`, `--url http://localhost:4123/women`
  → `storageState` is the absolute path string; stderr contains `cannot tell which saved origin is
  the app` and both origins; the capture still exits 0) → writes tests/prototype/capture-port.test.js [retired: specs/20261007/03-plan-cites-the-build-replays-and-status-derives-the-delete.md]
- **AC-20261005-03-19**: WHEN the sign-in file needs no re-point THE SYSTEM SHALL CONTINUE TO open
  the page with the declared file as an absolute host-resolved path (e.g. `"origins": []` →
  `storageState` is a string ending `/e2e/.auth/user.json`)
  → reuses tests/prototype/capture-sign-in.test.js :: AC-20261001-01-1: [retired: specs/20261007/03-plan-cites-the-build-replays-and-status-derives-the-delete.md]
- **AC-20261005-03-20**: WHEN `port-check.js --root <host>` runs THE SYSTEM SHALL report a
  `config-fixed-port` finding for each fixed loopback address in the config and none otherwise
  (e.g. `readyCheck` `curl -sf http://localhost:3000/api/health` → exit 1 and a line
  `.claude/spec.config.json:<line of "readyCheck">: config-fixed-port runtime.readyCheck`;
  `curl -sf http://localhost:${DEV_PORT:-3000}/api/health` → the same finding; `prototype.url`
  `http://127.0.0.1:3000` → `config-fixed-port prototype.url`; `--json` carries
  `{"file":".claude/spec.config.json","line":<n>,"class":"config-fixed-port","text":"runtime.readyCheck"}`;
  and with `readyCheck` `curl -sf localhost:$PORT/api/health`, or `test -f .ready`, or
  `runtime: {"inert": "cli"}`, or `prototype.url` `http://localhost:{port}`, or
  `https://dev.example.com`, or no config file at all → no `config-fixed-port` finding and, with
  a clean `tests/`, exit 0) → writes tests/doctor/port-check-config.test.js
- **AC-20261005-03-21**: WHEN the shipped `spec/templates/finalists.json` is read THE SYSTEM SHALL
  carry only PORT-reading ready checks (e.g. for each finalist, `readsPort(readyCheck)` is `true`
  and `readyCheck` contains no `:3000`; `tanstack-node`'s `bootCommand` is
  `npm run dev -- --port $PORT`) → writes tests/app-port.test.js
- **AC-20261005-03-22**: WHEN this repo's `.claude/spec.config.json` is read THE SYSTEM SHALL
  CONTINUE TO carry a `contractHash` equal to the first 12 characters of the SHA-256 of
  `spec/templates/grounding-contract.md` (e.g. `spec-paths contract-hash` prints the value the
  config holds) → reuses tests/consistency/contract-stamp.test.js :: AC-20260912-15-8

## Assumptions (escalation triggers)

- A1 (spiked 2026-10-05, Playwright from a local host, Chromium): a storage state saved on
  `http://127.0.0.1:A` was loaded into a page on `http://127.0.0.1:B`. Unchanged state → cookie
  header on B `sid=abc; __Secure-s=sec` (host-only and `Secure` cookies both sent), `localStorage`
  on B `null`. `origins[].origin` re-pointed to B and passed in object form → same cookies,
  `localStorage` on B `"xyz"`. So cookie sign-ins survive a port change untouched and
  browser-storage sign-ins survive once re-pointed. The one host that declares a sign-in today
  carries one cookie and zero origins — **if false** (a host's sign-in still lands on its login
  page after a port change): the existing redirect refusal fires naming the file; remedy is to
  sign in again on the printed port, no code change.
- A2 (spiked 2026-10-05): Vite 8.3.1 started as `vite --port 3000 --port 52249 --strictPort`
  served on 52249 (HTTP 200) — the last flag wins; started with only `PORT=52250` it served on
  5173 — it does not read the variable. Next 16.3.7 started with only `PORT=52251` printed
  `Local: http://localhost:52251` (the scratch app then failed on an unrelated symlinked
  `node_modules`, so a page render on that port was not observed) — **if false** for a finalist's
  real scaffold: the race's own smoke run goes `not-ready` for that finalist and the session
  corrects that finalist's `bootCommand`; the template is an example, the race is the oracle.
- A3: every caller of `smoke.sh` runs where `node` is on `PATH` (the review legs, the manifest
  check and the genesis race are all node scripts or run beside them) — **if false:** exit 5
  `no-port` names it; do not add a bash-only allocator.
- A4: binding port 0, reading the number and closing leaves a window in which another process can
  take the port before the app binds it. Not closed here — **if it bites:** the boot fails or the
  pre-boot probe reports the address taken; re-run. Do not add retry loops.
- A5: the existing fixtures cover the fixed-address paths, so no existing test changes: the smoke,
  prototype, build and capture fixtures all use fixed addresses or no `PORT` reference, and D2/D5
  leave those paths byte-identical — **if false** (an existing test reddens): the cause is a
  changed fixed-address path, which is a defect in the build; fix the code, never the test.
- A6: a test that must answer HTTP on a port while the driver under test runs needs a file-local
  async `child_process.spawn` runner (`runNode` is `spawnSync` and blocks the test's own server —
  pipeline rules § Gotchas) — applies to AC-2 and AC-10.
- A7: `status.json`'s key set is not pinned exhaustively for hosts with a `{port}` URL (existing
  fixtures use fixed URLs and never gain `appPort`) — **if false:** STOP, ask the user.
- A8: Claude Code allow-rules do not match past a leading `PORT=<n> ` assignment (documented:
  only "certain known-safe" variables are stripped, the list is unpublished), so the printed boot
  line may ask for one permission approval per launch — **if that proves too noisy:** a follow-up,
  not this spec (D16).
- A9: the read-load budgets hold (measured at lock: `/spec:init` loads 684 of 735 lines,
  `/spec:doctor` 457 of 500, `/spec:prototype` 276 of 500). The prose edits are edits in place —
  `init.md` grows by at most 8 lines, `doctor.md`'s check 19 is rewritten inside its own
  paragraph — **if a budget reddens:** condense the edited passage itself; never raise a budget,
  and grep the literals inside any passage before reflowing it (pipeline rules § Gotchas).

## Rationale

The defect is one of identity: the plugin asks "is the app up?" at an address every launch of the
repo shares. Two shapes were available. Proving *which* process answers (a pid file, a nonce
endpoint) needs every host to grow new code. Giving each launch its own address needs only what
most dev servers already do — read `PORT` — so that is the design, and it is strictly opt-in:
the signal is the host's own config spelling (`$PORT` in the ready check, `{port}` in the
prototype address), and a host that changes nothing is byte-for-byte on today's path (D2, D5).

Two spellings for one idea is deliberate. The runtime commands are shell strings run with an
environment, and `PORT` is the variable frameworks already read. `prototype.url` is not a shell
string; the config's existing convention for plugin-substituted values is braces. One module (D4)
owns both predicates so smoke, the drivers, doctor and the template test cannot disagree.

Kept as one spec although it has 13 source rows and touches both the smoke leg and the prototype
lane: the contract may be edited once per spec, and it must document both spellings in the same
edit that doctor starts flagging them — splitting would either stamp hosts twice or ship a contract
that promises a placeholder no driver substitutes yet.

The prototype port is allocated once and never re-allocated (D6) because the driver cannot tell a
foreign holder from its own server mid-boot; a wrong re-allocation would strand a healthy round.
The cost is that a taken port needs a manual fix (delete `appPort`), which is rare in the
ephemeral range.

The sign-in rule (D9) changes what Playwright receives only in the one case the spike showed is
broken, so the existing pin on the path form survives. The `stale-ready` slug and exit 7 stay
(D3): only the sentence was wrong.

Fragile, watch during build: the smoke tests must use real overlapping processes (AC-2), not a
mocked allocator; `smoke.sh`'s `set -u` with an empty CLI result; and the header comments of all
five edited scripts, which review treats as contract.

Collision closure at lock (literals `previous run`, `Fixed test ports`,
`localhost:3000/api/health`): four hits. Three are File Plan rows (`smoke.sh`, `doctor.md`,
`grounding-contract.md`). The fourth, `tests/smoke-stale-ready.test.js`, is waived: it spells
the old sentence only in an assert message, matches only the unchanged slug, and stays green.

Renumbered 02 → 03 before build (2026-10-05): a sibling spec locked as `20261005/02` in parallel,
and the shared number made both specs' AC-IDs collide in one namespace.

Regression pins: AC-5, AC-13, AC-16, AC-19 and AC-22 reuse existing tests, so the fixed-address
behaviour this spec promises not to change outlives its close.

## Canonical Delta

**docs/canonical/review.md** — in the boot-smoke section, add:

> **One port per smoke run.** When the host's `runtime.readyCheck` reads the shell variable
> `PORT`, `smoke.sh` allocates a free loopback port for the run and exports it as `PORT` to
> `bootCommand`, `readyCheck` and `seedCommand`; the pass line names the port. Two smoke runs of
> one repo can then overlap. A ready check that names a fixed port is left exactly as it was and
> cannot run beside a second launch: the pre-boot probe exits 7 saying another process is already
> answering on this address. `spec/scripts/lib/app-port.js` is the one allocator and the one
> definition of "reads PORT".

**docs/canonical/design.md** — in the prototype grounding paragraph, add:

> `prototype.url` may carry `{port}`. The prototype driver then keeps one app port per prototype
> (`appPort` in `status.json`) and the build driver one capture port per build
> (`<spec>.build/capture-port.json`); each prints `PORT=<n> <bootCommand>` in its step and probes
> and captures at the resolved address. The frozen contract's urls stay relative, so a baseline
> never records a port. A saved sign-in follows the app across ports: cookies need nothing, and a
> single saved browser-storage origin on the same host is re-pointed to the capture address at
> load time. `/spec:doctor`'s fixed-ports check flags a loopback address with a literal port in
> either `runtime.readyCheck` or `prototype.url`.
