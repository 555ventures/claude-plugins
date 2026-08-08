---
date: 2026-08-08
status: hardened
open_markers: 0
risk: T2
area: autopilot
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
spiked: 2026-08-08
---

# autopilot enroll — spoke-side enrollment CLI

## Goal

Make the hub's paste-ready line work end-to-end on a fresh machine:
`autopilot enroll --hub <url> --code <code>` exchanges a one-time enrollment code for a
spoke identity against the deployed autopilot-hub (contract version 1), persists the
credentials the later spoke calls need (hub URL, spokeId, bearer token, projects) to a
0600 local file, and prints a token-free success line. Done = the stub suite proves the
exact wire contract, and one real enrollment against the production hub succeeds.
The poll/report loop that will consume these credentials is out of scope (no roadmap
brief covers it yet — see Rationale).

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | New CLI `autopilot/bin/autopilot` with subcommand dispatch; `enroll` is its only subcommand in this spec. All enrollment logic lives in `autopilot/daemon/enroll.js` (library, DI'd `fetchImpl` + `configPath`), the bin only parses argv and renders exit codes | The hub's reply text pins the command name `autopilot enroll`; `autopilotd` is the daemon, not a CLI. Library split = § Test Rules mode 4 unit-testability (rejected: folding enroll into autopilotd — wrong process, wrong lifecycle) |
| D2 | `~/Projects/autopilot-hub/src/contract/` is copied VERBATIM to `autopilot/contract/` (all 3 files: `constants.ts`, `index.ts`, `contract.test.ts`). The copy is read-only; the only runtime import is `require('../contract/constants.ts')` for `CONTRACT_VERSION` and friends | Hub ADR-0007: the folder is the wire-contract source of truth, self-contained by design. Spike (2026-08-08, Node 26): CJS `require()` of `constants.ts` works via native type stripping, `CONTRACT_VERSION = 1` observed. Never hand-write or edit the schemas |
| D3 | `@sinclair/typebox` is NOT installed. `index.ts` and `contract.test.ts` sit inert (spike: loading `index.ts` throws `ERR_MODULE_NOT_FOUND` for typebox — that is expected and fine). `.claude/rules/spec-pipeline.md` § Review Checks gets a vendored-copy exemption line so the copy's typebox import is not a hard finding | Zero-dep doctrine holds: enroll needs only `CONTRACT_VERSION` at runtime; the stub tests assert the literal JSON the brief pins, not schema validation. Rejected: installing typebox to run schema validation — a second dependency for what a literal-JSON assertion already covers, reversible later if the spoke loop needs it |
| D4 | Credentials persist to `~/.config/autopilot/hub.json` (overridable only via `$HOME` for tests), mode 0600, written atomically (temp file in same dir with mode 0600 → `rename`). Directory created `{recursive: true, mode 0o700}` — a PRE-EXISTING dir keeps its current mode (mkdirSync never chmods; accepted: the file's 0600 is the security boundary, dir mode is defense-in-depth only) | Separate file from the hand-edited `config.json`: a machine-written secret must not share a file the operator edits by hand. Same-dir temp + rename = no partial file, mode survives rename (POSIX); silently chmod-ing an operator's existing dir was rejected as surprising |
| D5 | If the config file already exists, refuse with exit 2 naming `--force` and the path, BEFORE any network call. `--force` re-enrolls and overwrites | A second enroll mints a second spoke identity on the hub — that must be deliberate. Checking pre-network means a refusal never burns a code |
| D6 | Token secrecy: the clear token appears ONLY inside `hub.json`. Success stdout prints machineName + spokeId + project count + config path — never the token. No error path, log line, or debug output ever includes it | Brief rule; the token is shown once by the hub and never expires — leaking it to scrollback is unrecoverable |
| D7 | Exit alphabet: `0` success · `1` exchange failed (hub error response, malformed 201, network failure/timeout) · `2` usage/precondition (bad flags, unknown subcommand, existing config without `--force`, unloadable contract copy). 401 maps to the fixed string "code invalid, already used, or expired — get a fresh one with /enroll in Telegram". 409 `conflict` (machine name already registered on the hub) maps to a fixed string advising `--machine-name <a different name>` and noting the code is NOT burned by this failure | Repo script convention (0/1/2 + documented header); the 401 wording is pinned by the brief. 409 is real hub behavior the brief's error list omits (refuter: hub `uq_spokes_name` unique constraint → `409 conflict`, rolled back = code un-burned) — and it is exactly what `--force` with the default hostname hits, since re-enrolling resends the same `os.hostname()` |
| D8 | Flags: `--hub <url>` and `--code <code>` required; `--machine-name <name>` (default `os.hostname()`), `--project <name>` repeatable (default `[]`), `--force` optional. Hand-rolled parsing, no arg library. `--hub` is used VERBATIM — no trailing-slash strip, no URL normalization; request URL is string-concat `hubUrl + '/api/spokes/enroll'` | Brief pins `--hub`/`--code` names and verbatim-URL handling; `--machine-name` exists because the brief's recovery path is "retry with a different machineName after a 4xx-that-wasn't-401" |
| D9 | The bin wraps `require('../contract/constants.ts')` in try/catch; on failure it exits 2 with a remedy naming Node ≥ 22.18 (type stripping on by default since v22.18.0/v23.6.0 per nodejs.org/api/typescript.html History). No version arithmetic | Capability check beats a version-table claim we can't execute against other Node majors; `autopilotd`'s 20.19 floor is untouched (enroll is a separate entry point). Refuter corrected the original "Node ≥ 24" remedy — 22.18 LTS already strips by default |
| D10 | HTTP via built-in global `fetch` with `AbortSignal.timeout(30000)`; `enroll.js` takes `fetchImpl` by injection (canonical autopilot convention). Request: `POST`, `content-type: application/json`, body exactly `{code, contractVersion, machineName, projects}` | Zero-dep; injected transport is how every autopilot test works (docs/canonical/autopilot.md § Conventions) |
| D11 | Live verification is an env-gated suite `tests/autopilot/enroll-live.test.js`: activates only when `AUTOPILOT_ENROLL_LIVE=1` AND `AUTOPILOT_ENROLL_HUB` AND `AUTOPILOT_ENROLL_CODE` are all set; skip-by-declaration otherwise. JJ supplies a fresh code from Telegram `/enroll` at run time (codes expire in 15 min, so the code travels by env var, never a fixture) | User ruling 2026-08-08 ("Live enroll + stub tests"); the gate shape mirrors `live.test.js` (specs/20260801/04-live-smoke.md D6) — env presence alone must never make `npm test` hit production |
| D12 | `autopilot` plugin version bumps 0.5.0 → 0.6.0 with the enroll changelog in `plugin.json` description; root `README.md` autopilot operator section gains an enroll step (after install, before config) | Repo version-bump discipline; README is autopilot's only operator doc (it ships no README of its own) |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| autopilot/contract/constants.ts | CREATE | scripts | Verbatim copy of ~/Projects/autopilot-hub/src/contract/constants.ts — byte-identical, never edited (D2) |
| autopilot/contract/index.ts | CREATE | scripts | Verbatim copy — inert reference (typebox import stays unresolved by design, D3) |
| autopilot/contract/contract.test.ts | CREATE | scripts | Verbatim copy — inert (hub's own test file; not picked up by any test glob here) |
| autopilot/daemon/enroll.js | CREATE | scripts | Enrollment library: refusal check, exchange, error mapping, atomic 0600 persistence (D1, D4–D7, D10) |
| autopilot/bin/autopilot | CREATE | scripts | CLI dispatcher: `enroll` subcommand, hand-rolled flag parsing, contract capability check, exit rendering (D1, D8, D9) |
| .claude/rules/spec-pipeline.md | MODIFY | doctrine | § Review Checks + § Worker Rules: `autopilot/contract/**` vendored-copy exemption (read-only, typebox import sanctioned-inert) (D3); § Test Rules: reword "One sanctioned env-gated suite" to sanction both live suites (`live.test.js`, `enroll-live.test.js` — D11), citing this spec — MUST keep naming `AUTOPILOT_LIVE` and never reintroduce "there is no env-gated suite" (pinned by tests/autopilot/runbook.test.js AC-20260801-04-11) |
| README.md | MODIFY | doctrine | Autopilot operator section: enroll step with the paste-line (D12) — inserted WITHOUT disturbing the pinned install → /spec:init → config.json → autopilotd → SIGTERM ordering (tests/autopilot/runbook.test.js AC-20260801-04-10; the enroll text must not mention `config.json` or `autopilotd` ahead of their pinned positions) |
| autopilot/.claude-plugin/plugin.json | MODIFY | doctrine | Bump 0.6.0; description changelog names enroll (D12) |
| tests/autopilot/enroll.test.js | CREATE | tests | AC-20260808-01-1 … AC-20260808-01-11, AC-20260808-01-13 (stub `node:http` server + DI unit tests) |
| tests/autopilot/enroll-live.test.js | CREATE | tests | AC-20260808-01-12 `[env: AUTOPILOT_ENROLL_LIVE]` |

## Contracts

CLI (bin help/usage line):

```
usage: autopilot enroll --hub <url> --code <code> [--machine-name <name>] [--project <name>]... [--force]
```

Request (POST `{hub}/api/spokes/enroll`, no auth — the code is the credential):

```json
{
  "code": "<22-char base64url one-time code>",
  "contractVersion": 1,
  "machineName": "<1-100 chars, default os.hostname()>",
  "projects": ["<name>", "..."]
}
```

`contractVersion` is `require('../contract/constants.ts').CONTRACT_VERSION` — never a literal.

Success 201:

```json
{
  "spokeId": "...",
  "token": "<43-char base64url bearer, shown once, never expires>",
  "projects": [{ "projectId": "...", "name": "..." }],
  "contractVersion": 1
}
```

Errors — all shaped `{ "code": "...", "message": "..." }`:
`400 contract_version_unsupported` · `400 validation_failed` · `401 unauthorized` ·
`409 conflict` (machine name already registered — hub `uq_spokes_name`; the transaction
rolls back, so the code is NOT burned).

Stored credentials — `~/.config/autopilot/hub.json`, mode 0600:

```json
{
  "hubUrl": "<the --hub value, verbatim>",
  "spokeId": "...",
  "token": "...",
  "machineName": "...",
  "projects": [{ "projectId": "...", "name": "..." }],
  "contractVersion": 1,
  "enrolledAt": "<ISO-8601 UTC Z>"
}
```

Library (`autopilot/daemon/enroll.js`):

```js
// enroll({ hubUrl, code, machineName, projects, force, configPath, fetchImpl, now })
//   → resolves { spokeId, machineName, projectCount, configPath }
//   → rejects EnrollError { message, exitCode }  (exitCode 1 or 2 per D7)
// No process.exit, no console — bin/autopilot owns rendering (config.js precedent).
```

Fixed user-facing strings (tests assert these substrings on stderr):

- 401 → `code invalid, already used, or expired — get a fresh one with /enroll in Telegram`
- `contract_version_unsupported` → names a stale contract copy and the remedy `update the autopilot plugin (hub contract is newer than this machine's copy)`
- `validation_failed` → includes the hub's `message` field verbatim
- 409 `conflict` → `machine name already registered on the hub — retry with --machine-name <a different name> (same code is still valid)`
- refusal → names the existing config path and `--force`, and that `--force` mints a NEW spoke identity on the hub

## Behavior

- Order of operations: parse flags → contract capability check (D9) → refusal check (D5,
  before any network) → POST exchange (D10) → validate 201 body has non-empty `spokeId` and
  `token` (else exit 1 "hub answered 201 but the response is missing spokeId/token" — still
  token-free) → atomic write (D4) → one success line to stdout, exit 0.
- Success stdout (single line):
  `enrolled <machineName> as spoke <spokeId> (<N> projects) — credentials saved to <configPath>`
- Non-2xx with unparseable/JSON-less body → exit 1: `hub answered <status> — <first 200 chars of body>` (a token can never appear here; the hub never echoes tokens on errors).
- Network failure / 30s timeout → exit 1: message names the `--hub` URL and the underlying
  error code (e.g. `ECONNREFUSED`).
- `--project` values pass through in argv order, unvalidated client-side — the hub owns
  validation (duplicates → its 400 `validation_failed`, surfaced verbatim).
- The 15-minute code expiry and the un-burn-on-rollback semantics are hub-side; the spoke's
  only contract obligations are the fixed 401 message (get a fresh code) and the fixed 409
  message (same code still valid, retry with a different `--machine-name`).
- Any other `{code, message}` error status (403 revoked, 5xx, future codes) → exit 1:
  `hub answered <status> <code> — <message>`; no config file. The enumerated codes get the
  fixed strings above; everything else falls through to this generic render.
- `hub.json` has no consumer in this repo today (verified by grep, A6); the future
  poll/report loop reads it — this spec only guarantees the stored shape above.

## Acceptance Criteria

- **AC-20260808-01-1**: WHEN `autopilot enroll --hub http://127.0.0.1:<port> --code C` runs
  against a stub answering 201, THE SYSTEM SHALL issue exactly one
  `POST http://127.0.0.1:<port>/api/spokes/enroll` with `content-type: application/json` and
  a body deep-equal to `{"code":"C","contractVersion":CV,"machineName":os.hostname(),"projects":[]}`
  where CV is `require('autopilot/contract/constants.ts').CONTRACT_VERSION` (asserted against
  the import, never the literal 1) → tests/autopilot/enroll.test.js
- **AC-20260808-01-2**: WHEN the stub answers 201 with
  `{"spokeId":"sp_1","token":"tok_abc","projects":[{"projectId":"p1","name":"alpha"}],"contractVersion":1}`,
  THE SYSTEM SHALL exit 0 and write `$HOME/.config/autopilot/hub.json` with file mode 0600
  (`stat.mode & 0o777 === 0o600`) whose parsed content deep-equals the Contracts shape —
  `hubUrl` byte-identical to the `--hub` value, `spokeId:"sp_1"`, `token:"tok_abc"`, the
  returned projects array, `contractVersion:1`, and an `enrolledAt` matching
  `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$` → tests/autopilot/enroll.test.js
- **AC-20260808-01-3**: WHEN enrollment succeeds with token `tok_abc`, THE SYSTEM SHALL print
  one stdout line containing `sp_1` and the machineName, and the run's combined
  stdout+stderr SHALL NOT contain the substring `tok_abc` → tests/autopilot/enroll.test.js
- **AC-20260808-01-4**: WHEN the stub answers `401 {"code":"unauthorized","message":"..."}`,
  THE SYSTEM SHALL exit 1, print stderr containing `code invalid, already used, or expired —
  get a fresh one with /enroll in Telegram`, and SHALL NOT create the config file →
  tests/autopilot/enroll.test.js
- **AC-20260808-01-5**: WHEN the stub answers
  `400 {"code":"contract_version_unsupported","message":"..."}`, THE SYSTEM SHALL exit 1 with
  stderr naming the stale contract copy and the remedy (`update the autopilot plugin`), and no
  config file → tests/autopilot/enroll.test.js
- **AC-20260808-01-6**: WHEN the stub answers
  `400 {"code":"validation_failed","message":"duplicate project names"}`, THE SYSTEM SHALL
  exit 1 with stderr containing `duplicate project names`, and no config file →
  tests/autopilot/enroll.test.js
- **AC-20260808-01-7**: WHEN `$HOME/.config/autopilot/hub.json` already exists and `--force`
  is absent, THE SYSTEM SHALL exit 2, print stderr naming the path and `--force`, leave the
  file byte-identical, and the stub SHALL record zero requests → tests/autopilot/enroll.test.js
- **AC-20260808-01-8**: WHEN the config file exists and `--force` is passed with a stub
  answering 201 with `spokeId:"sp_2"`, THE SYSTEM SHALL exit 0 and the rewritten file SHALL
  contain `sp_2` and keep mode 0600 → tests/autopilot/enroll.test.js
- **AC-20260808-01-9**: WHEN invoked as `autopilot enroll` missing `--hub` or `--code`, or as
  `autopilot <unknown-subcommand>`, THE SYSTEM SHALL exit 2 and print the usage line from
  Contracts on stderr → tests/autopilot/enroll.test.js
- **AC-20260808-01-10**: WHEN invoked with
  `--machine-name box-7 --project alpha --project beta`, THE SYSTEM SHALL send
  `"machineName":"box-7","projects":["alpha","beta"]` (argv order preserved) →
  tests/autopilot/enroll.test.js
- **AC-20260808-01-11**: WHEN `--hub` points at a genuinely closed high port (bind an
  ephemeral `node:http` server, note its port, close it, then enroll against it — NEVER port
  1, which Node's fetch rejects as a spec-forbidden "bad port" TypeError with no `.code`),
  THE SYSTEM SHALL exit 1 with stderr naming that URL and the underlying failure
  (`ECONNREFUSED` when the cause carries a code; the cause message otherwise), and no config
  file → tests/autopilot/enroll.test.js
- **AC-20260808-01-13**: WHEN the stub answers
  `409 {"code":"conflict","message":"Machine name already registered"}`, THE SYSTEM SHALL
  exit 1 with stderr containing `retry with --machine-name` and `same code is still valid`,
  and no config file → tests/autopilot/enroll.test.js
- **AC-20260808-01-12** `[env: AUTOPILOT_ENROLL_LIVE]`: WHEN `AUTOPILOT_ENROLL_LIVE=1`,
  `AUTOPILOT_ENROLL_HUB`, and `AUTOPILOT_ENROLL_CODE` are all set (operator pastes a fresh
  Telegram `/enroll` code), THE SYSTEM SHALL complete a real enrollment against that hub
  using a run-unique `--machine-name` (`enroll-live-<epoch-ms>` — the hub's machine-name
  uniqueness constraint would 409 a reused name on every re-run) — exit 0, `hub.json` written
  under a test-scoped `$HOME` with non-empty `spokeId`/`token` and `contractVersion` equal to
  the contract copy's — and WHEN the gate vars are not all set the suite SHALL skip by
  declaration naming them → tests/autopilot/enroll-live.test.js

## Assumptions (escalation triggers)

- A1: Node ≥ 23.6-era type stripping loads `constants.ts` via CJS `require()` — **executed**
  2026-08-08 on Node 26.0.0: `require('./contract/constants.ts')` → `CONTRACT_VERSION = 1`,
  exit 0; ESM `import` identical. — **if false** on an operator machine: D9's capability
  check exits 2 with the Node ≥ 24 remedy; never falls through to a raw stack trace.
- A2: The production hub is live and speaks contract v1 — **executed** 2026-08-08:
  `GET https://autopilot-hub-production.up.railway.app/health` → `{"ok":true,"contractVersion":1}`
  (route is `/health`, NOT `/api/health` — that 404s; observed both). — **if false** at
  live-AC time: AC-12 skips by env-gate; stub ACs still gate the build.
- A3: `index.ts` is NOT loadable here — **executed** 2026-08-08: `require('./contract/index.ts')`
  → `ERR_MODULE_NOT_FOUND: Cannot find package '@sinclair/typebox'`. This is the sanctioned
  inert state (D3). — **if false** (someone installs typebox): harmless, but the § Review
  Checks exemption line still governs.
- A4: `os.hostname()` yields 1–100 chars on target machines — **if false:** hub 400s
  `validation_failed`; the user retries with `--machine-name` (safe: a non-401 4xx un-burns
  the code, per the hub contract).
- A5: POSIX `rename()` preserves the temp file's 0600 mode — AC-2/AC-8 assert the mode, so a
  violation goes red in the suite, — **if false:** `chmod` after rename as fallback.
- A6: Nothing else reads or writes `~/.config/autopilot/hub.json` (repo grep 2026-08-08:
  zero references) — **if false:** STOP, ask the user before changing the stored shape.
- A7: The hub un-burns the code on any rolled-back non-401 4xx — hub-side behavior stated by
  the brief, not spoke-verifiable — **if false:** live retry needs a fresh code (cheap; the
  fixed 401 message already routes the user there).

## Rationale

The one real fork was how to honor "copy the contract verbatim" inside a repo whose review
checks make any non-SDK dependency a hard finding. The spike settled it: Node 26 loads the
dependency-free `constants.ts` directly (type stripping), and `CONTRACT_VERSION` is the only
runtime need — so the copy lands byte-identical, `index.ts`/`contract.test.ts` stay inert
(their typebox import intentionally unresolved), and no dependency is added. The alternative
(install typebox, validate outgoing payloads against the real schemas) was rejected as a
second dependency duplicating what literal-JSON stub assertions already pin; it stays cheap
to revisit when the poll/report loop lands. This requires a one-line § Review Checks / §
Worker Rules amendment sanctioning `autopilot/contract/**` as a read-only vendored surface —
without it the first review of this spec would correctly flag its own File Plan.

Credentials live in a new `hub.json` rather than the daemon's `config.json` because the
latter is operator-hand-edited (example-file workflow); a machine-written 0600 secret in the
same file invites both clobbering directions. The bin/library split copies the
`config.js`/`autopilotd` precedent: pure library, CLI owns argv + exit rendering.

No scaffold-ledger row: enroll is product code, not a pipeline guard (docs/canonical/
autopilot.md says exactly this — autopilot guards are pinned by spec ACs).

Follow-up with no durable home: the poll/report/asks spoke loop that consumes `hub.json`.
Recorded as a lock-report item rather than a roadmap brief authored here — the hub↔spoke
milestone sequencing lives with JJ and the hub repo's roadmap; authoring a spoke-loop brief
without that context would invent scope.

Refuter findings (2026-08-08, one Sonnet refuter, all five ACCEPTED and fixed in place):
(1) hub 409 `conflict` on duplicate machineName — the brief's error list omitted it and it is
the default `--force` re-enroll path; added to Contracts/D7/Behavior + AC-13. (2) AC-11's
original `127.0.0.1:1` fixture never produces ECONNREFUSED — Node fetch rejects port 1 as a
spec-forbidden "bad port" TypeError with no `.code` (refuter executed both cases); AC-11
rewritten to a bind-then-close ephemeral port. (3) D9's remedy overstated the Node floor —
type stripping is default since v22.18.0/v23.6.0, remedy corrected. (4) § Test Rules'
"One sanctioned env-gated suite exists" would go stale — File Plan row extended to reword it
for both live suites. (5) `mkdirSync {mode}` never chmods a pre-existing
`~/.config/autopilot/` (0755 observed on this machine) — D4 now states the file's 0600 is
the security boundary and dir mode applies to fresh dirs only.

## Canonical Delta

Append to `docs/canonical/autopilot.md` a new `## Enrollment` section:

> Spoke enrollment is `autopilot/bin/autopilot enroll --hub <url> --code <code>` — the
> spoke side of the hub's Telegram `/enroll` paste-line. The wire contract is vendored
> verbatim at `autopilot/contract/` (hub ADR-0007; read-only, typebox import deliberately
> inert; `CONTRACT_VERSION` is always imported from `constants.ts`, never a literal).
> Credentials (hubUrl, spokeId, bearer token, projects) persist to
> `~/.config/autopilot/hub.json`, 0600, written atomically; the token never appears on
> stdout/stderr. Re-enrollment requires `--force` because it mints a second spoke identity
> on the hub. Exit alphabet 0/1/2 per the script convention; 401 always renders the fixed
> "get a fresh one with /enroll in Telegram" line. Live verification is the env-gated
> `tests/autopilot/enroll-live.test.js` (`AUTOPILOT_ENROLL_LIVE=1` + `_HUB` + `_CODE`),
> same opt-in discipline as the Telegram live suite.

Also update § Conventions' "Zero dependencies" bullet to note the sanctioned inert vendored
copy at `autopilot/contract/`.
