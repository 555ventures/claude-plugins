---
date: 2026-10-05
status: hardened
tier: critical
area: design
breaking: false
depends_on: []
brief: n/a
spiked: 2026-10-05
open_markers: 0
---

# Connect wires a project to the review service

## Goal

Connecting a client project to the hosted review service takes five hand steps across two
repositories, and a project that skipped them falls back to confirming stories in the terminal
without saying why. `/spec:connect`, run in the client project with no arguments, creates (or
joins) the project on the service, keeps the token in a file git ignores, writes the
`walkthrough` config block, proves the link with a call that needs the token, and prints one
line. Done means: one command, safe to run twice, and the same session can send screens right
after it.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | A new script, `spec/scripts/walkthrough-connect.js` (`spec-paths walkthrough-connect`), is the ONE writer of the host's `walkthrough` block and of the stored token. `spec/scripts/walkthrough.js` gains no verb and keeps both of its rules: it never edits the host's config and never writes or prints the token. (AC-20261005-01-1, AC-20261005-01-18) | The "never edits the host's config" rule is scoped per script, so it stays true and testable for the client; rejected: a `connect` verb inside `walkthrough.js`, which would make the rule false for the file that states it. |
| D2 | Project id: `--project <id>`, else derived from the folder name — the main checkout's folder when the root is a linked git worktree. Derivation: every run of characters outside `[A-Za-z0-9_.-]` becomes one `-`, runs of `-` collapse to one, leading and trailing `-` are dropped; case is kept. A result that is empty or fails the contract's `name` shape is refused `no-id`; it is never truncated or guessed. Display name: `--name <text>`, else the folder name verbatim. (AC-20261005-01-4, AC-20261005-01-5) | The service refuses any other id shape; a silent truncation would connect two long-named folders to one project. |
| D3 | Railway is reached only through the `railway` binary on `PATH`, run without a shell and with stdin closed, in this order and only when needed: `railway list --json` (the id of the project named `walkthrough`), `railway ssh --project <pid> --service walkthrough --environment <env> -- printenv RAILWAY_PUBLIC_DOMAIN` (the address, `https://<domain>`), then the project tool `node dist/server/src/start/project.js create <id> <name>` or `token <id>` behind the same `railway ssh … --` prefix. `--base-url <url>` replaces the address lookup. (AC-20261005-01-1, AC-20261005-01-7, AC-20261005-01-12) | Spiked: `--project` takes the id, never the name; stdout is clean; arguments arrive intact. Rejected: a hard-coded project id or address in the plugin. |
| D4 | Environment: `--environment <name>`, default `staging`. (AC-20261005-01-7) | JJ's ruling 2026-10-05: production is not deployed, so the plain command must work today; the default flips in a later release (queued). |
| D5 | An id the service already holds is joined: when `create` exits non-zero with a stderr line equal to `project-exists`, the script runs `token <id>` and the result line says `joined existing project`. No flag is asked for. (AC-20261005-01-6) | JJ's ruling 2026-10-05: a second machine or a fresh clone connects with one command; only someone with Railway access can run this at all. |
| D6 | The token is stored as `env.<tokenEnv>` in the host's `.claude/settings.local.json`: other keys kept, written atomically, a newly created file gets mode `0600`. `tokenEnv` is `WALKTHROUGH_TOKEN`, or the existing block's value. Before `create` runs, `git check-ignore -q .claude/settings.local.json` must exit 0 in the root; otherwise the run is refused `not-ignored` with nothing created or written. An existing settings file that is not a JSON object is refused `bad-settings` and never overwritten. The token is never printed and is written to no other file. (AC-20261005-01-1, AC-20261005-01-2, AC-20261005-01-9, AC-20261005-01-14) | Spiked: a new session receives `env` from this file; `check-ignore` exits 1 for an unignored AND for a tracked file, so one check covers both. Rejected: `.gitignore` edits by the script (a tracked host file) and an OS keychain (never reaches the client). |
| D7 | The client resolves the token as: the non-empty string at `env.<tokenEnv>` in the host's `.claude/settings.local.json`, else the environment variable `<tokenEnv>`. `check`, every service verb and the new probe share this one rule (`storedToken` in `lib/walkthrough-client.js`). The header of `spec/scripts/walkthrough.js` states the same rule in place of "read from the environment variable the config names". The `no-token` remedy becomes `run /spec:connect, or export <tokenEnv>=<the project's token>`. (AC-20261005-01-15, AC-20261005-01-16, AC-20261005-01-17) | JJ's ruling 2026-10-05: the session that ran connect must be able to send screens with no restart; spiked: a running session never sees a variable added to the file. Stored-first, because connect has just proved the stored value, while an exported one may be stale. |
| D8 | The link is proved by `probe` (new export of `lib/walkthrough-client.js`): the hello gate, then one `pullApprovals` call with the token; it writes no file and needs no local round. The block is written only after the probe passes. (AC-20261005-01-1, AC-20261005-01-8) | `hello` succeeds with a wrong token (executed 2026-10-05); the `pull-approvals` verb refuses a project with no local round, so the proof calls the service directly. |
| D9 | Safe to run twice. With a block present the target is the block; a candidate token (D7's rule) that passes the probe ends the run with zero Railway calls and zero writes: `already connected`. A candidate refused `bad-token`, `wrong-project` or `unknown-project` leads to D3's create-or-join and replaces the stored token. Any other probe refusal ends the run with that refusal and nothing changed. A token stored by a run whose proof did not answer is reused by the next run with no second `create`. (AC-20261005-01-3, AC-20261005-01-8, AC-20261005-01-11) | Idempotence is derived from the two files and one read-only call, never from a marker file. |
| D10 | A block that points elsewhere is never rewritten: `--project` or `--base-url` differing from the block's value, or (when a Railway step is about to run) a looked-up address differing from the block's `baseUrl`, is refused `connected-elsewhere`; the path back is deleting the `walkthrough` block and running again. (AC-20261005-01-10) | Moving a project is rare and loses nothing by being two steps; a silent rewrite would orphan the rounds git already holds. |
| D11 | Output: on success exactly one stdout line `connected <id> → <baseUrl>/p/<id>` followed by ` (new project)`, ` (joined existing project)`, ` (already connected)` or nothing (a block written from an already stored token). Every refusal is one stderr line `walkthrough-connect: <code> — <sentence> — remedy: <what to do>`; a refusal thrown by the client is printed as the client words it. Exit codes: 0 connected · 1 refused (by the service, by Railway or by the project tool) · 2 usage, config or precondition · 3 the service did not answer. (AC-20261005-01-1, AC-20261005-01-12, AC-20261005-01-13) | Same alphabet as `walkthrough.js`, so a session reads both the same way. |
| D12 | `spec/commands/connect.md` is a thin shell: frontmatter (`description`, `argument-hint`, `allowed-tools: Bash(spec-paths:*), Bash(node:*)`), one run of `node "$(spec-paths walkthrough-connect)" --root . $ARGUMENTS`, print the script's line verbatim, and on exit 0 name `/spec:mocks` as the next step. It reads no doctrine and gets no `shared-for` list. [no-ac: a command file is prose; the script it runs carries every behaviour and the key it resolves is pinned by AC-20261005-01-18] | No judgment happens in the command; rejected: a driver or a question step. |
| D13 | `spec/bin/spec-paths` gains the key `walkthrough-connect` and its usage mention; `spec/entrypoints.json` gains the row `spec/scripts/walkthrough-connect.js` → `spec/commands/connect.md`. (AC-20261005-01-18) | New-surface checklist; the live entrypoints pin reddens the gate on a script without a row. |
| D14 | In terminal mode, the `mocks-driver.js` SCREENS step that asks for the terminal confirm ends with one more line: `(this project is not connected to the review service — /spec:connect connects it, and the screens are then drawn and sent)`. Nothing else in the driver changes. (AC-20261005-01-19) | The fallback was silent; one line names the way out without changing terminal mode. |
| D15 | `spec/templates/grounding-contract.md` § Walkthrough, the one contract edit: the `tokenEnv` clause reads "`tokenEnv` (the name of the variable that holds the project's token: read from `env` in the git-ignored `.claude/settings.local.json` when `/spec:connect` stored it there, else from the environment; the token is never written to a file git tracks)". [no-ac: wording of a prose contract no script reads; the behaviour it describes is D7's] | The old sentence ("never written to a file") is false once D6 lands; this is a genuine contract change, so every host owes a `/spec:doctor` re-stamp. |
| D16 | This repo's `.claude/spec.config.json` `contractHash` is re-stamped to `spec-paths contract-hash`'s output after D15. (AC-20261005-01-20) | The live pin reddens the gate on a stale stamp. |
| D17 | A new amendment ADR (next free number under `docs/adr/`, titled "Connect is the one writer") records D1, D6 and D7 as an amendment of ADR-0031's "read from the named environment variable at call time and never printed or written" clause; ADR-0031 gains the `Amended by` backlink. [no-ac: decision record prose] | ADR-0031 is where a cold reader looks for the token rule. |
| D18 | `README.md`'s command table gains one `/spec:connect` row; the spec plugin is bumped with `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"`. [no-ac: `plugin-bump.js --check` in the gate is the oracle; the README row is prose] | Version-bump discipline; the README is the one user-facing list of commands. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/walkthrough-client.js | MODIFY | scripts | D7, D8 — `storedToken`, `contextFromBlock`, `probe`; the token rule in `checkConfig`/`openContext`; the `no-token` remedy; header updated |
| spec/scripts/walkthrough-connect.js | CREATE | scripts | D1–D6, D8–D11 |
| spec/scripts/walkthrough.js | MODIFY | scripts | D7 — header comment only: the token sentence states the stored-first rule; no verb, no behaviour change |
| spec/scripts/mocks-driver.js | MODIFY | scripts | D14 — one line on the terminal-confirm step |
| spec/bin/spec-paths | MODIFY | scripts | D13 — the `walkthrough-connect` key and its usage mention |
| spec/commands/connect.md | CREATE | doctrine | D12 |
| spec/templates/grounding-contract.md | MODIFY | doctrine | D15 — the one contract edit |
| spec/entrypoints.json | MODIFY | other | D13 |
| .claude/spec.config.json | MODIFY | other | D16 — `contractHash` re-stamp |
| docs/adr/0033-connect-is-the-one-writer.md | CREATE | other | D17 (next free number; amend this row if a sibling claims it) |
| docs/adr/0031-the-walkthrough-contract.md | MODIFY | other | D17 — `Amended by` backlink |
| README.md | MODIFY | other | D18 — one command-table row |
| spec/.claude-plugin/plugin.json | MODIFY | other | D18 — `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` |
| tests/walkthrough/fixture.js | MODIFY | tests | helpers only: `makeRailway`, `runConnect`, a git-initialised host (no AC of its own) |
| tests/walkthrough/connect.test.js | CREATE | tests | AC-20261005-01-1, AC-20261005-01-2, AC-20261005-01-3, AC-20261005-01-4, AC-20261005-01-5, AC-20261005-01-6, AC-20261005-01-7, AC-20261005-01-8, AC-20261005-01-9, AC-20261005-01-10, AC-20261005-01-11, AC-20261005-01-12, AC-20261005-01-13, AC-20261005-01-14, AC-20261005-01-15, AC-20261005-01-17, AC-20261005-01-18 |
| tests/mocks/connect-hint.test.js | CREATE | tests | AC-20261005-01-19 |

Reused, unchanged (no row): `tests/walkthrough/config.test.js` (AC-20261005-01-16) and
`tests/consistency/contract-stamp.test.js` (AC-20261005-01-20).

## Contracts

```
walkthrough-connect.js [--root <dir>] [--project <id>] [--name <text>]
                       [--environment <name>] [--base-url <url>]

--root          the host (default: the working directory)
--project       the project id (default: derived from the folder name, D2)
--name          the display name (default: the folder name verbatim)
--environment   the Railway environment, ^[A-Za-z0-9_-]{1,40}$ (default: staging)
--base-url      the service's address; skips the Railway address lookup
```

Refusal codes (stderr, one line each, `walkthrough-connect: <code> — <sentence> — remedy: <…>`):

| Code | Exit | When | Remedy names |
|------|------|------|--------------|
| `usage` | 2 | unknown flag, flag without a value, bad `--environment` | the flag list |
| `no-config` | 2 | the host config is absent or not a JSON object | `/spec:init` |
| `bad-config` | 2 | an existing `walkthrough` block fails the client's own checks (token aside) | fix or delete the block |
| `no-id` | 2 | D2's derivation is empty or fails the `name` shape | `--project <id>` |
| `connected-elsewhere` | 2 | D10 | delete the `walkthrough` block, run again |
| `not-ignored` | 2 | D6's `git check-ignore` does not exit 0 (not ignored, tracked, or not a git repository) | add `.claude/settings.local.json` to `.gitignore` (and `git rm --cached` it when tracked) |
| `bad-settings` | 2 | `.claude/settings.local.json` exists and is not a JSON object | repair or delete the file |
| `no-railway` | 2 | the `railway` binary cannot be started | install the Railway CLI, `railway login` |
| `railway-failed` | 1 | a `railway` call exits non-zero (other than D5's `project-exists`), `railway list --json` holds no project named `walkthrough`, or the address answer is not a host name; the sentence carries Railway's last stderr line that does not start with `Using SSH key` | `railway login`, or `--environment <name>` |
| `no-token-line` | 1 | the project tool exits 0 without a stdout line matching `^token: (\S+)$` | run the project tool by hand |

The token is the text after `token: ` on that line, whole (`token: wt_3f9a` → `wt_3f9a`).

`lib/walkthrough-client.js`, new exports (existing exports keep their signatures):

```js
storedToken(root, name)   // the string at env[name] in <root>/.claude/settings.local.json; ''
                          // when the file, its `env` object or the key is absent, unreadable,
                          // not JSON, or not a non-empty string. Never throws.
contextFromBlock(root, env, contract, block)
                          // what openContext returns for a config whose walkthrough block is
                          // `block`, with the same Refusals; openContext calls it.
probe(c, warn)            // gate(c, warn), then one pullApprovals call; writes no file;
                          // returns { apiVersion, revision }.
```

Token rule, one place: `storedToken(root, block.tokenEnv) || env[block.tokenEnv] || ''`.

Files written in the host:

```json
// .claude/spec.config.json — the block is added as the last key; every other key and its order kept
"walkthrough": { "baseUrl": "https://walkthrough-staging-4090.up.railway.app", "project": "acme-shop", "tokenEnv": "WALKTHROUGH_TOKEN" }

// .claude/settings.local.json — merged; other keys kept
{ "env": { "WALKTHROUGH_TOKEN": "wt_…" } }
```

Both are written as `JSON.stringify(value, null, 2)` plus a newline, through a temp file and a
rename. The config path comes from `lib/host-config.js` (`configPath`), which is the only place
that may spell the config's file name.

## Behavior

One run, in order. "Refuse" means: print the line, exit, change nothing further.

1. Parse flags. Read the host config (`no-config`).
2. **Target.** Block present: it must pass the client's block checks other than the token
   (`bad-config`); the target is its `baseUrl`, `project` and `tokenEnv`; a `--project` or
   `--base-url` that differs is `connected-elsewhere`. Block absent: `project` per D2 (`no-id`),
   `tokenEnv` = `WALKTHROUGH_TOKEN`, `baseUrl` = `--base-url` or, failing that, the Railway
   address lookup (D3's first two calls).
3. **Candidate.** The token by D7's rule. When there is one, probe the target with it:
   - passes → write the block when absent; print the line (` (already connected)` when the
     block was present, no note otherwise); exit 0.
   - refused `bad-token`, `wrong-project` or `unknown-project` → go on to step 4.
   - any other refusal → refuse with the client's own line and exit code.
4. **Create or join.** `git check-ignore` (`not-ignored`); read the settings file
   (`bad-settings`). Resolve the Railway project id, and the address when step 2 did not
   (with a block present and no `--base-url`, the looked-up address must equal the block's
   `baseUrl`, else `connected-elsewhere`). Run `create <id> <name>`; on `project-exists` run
   `token <id>` (D5). Read the token line (`no-token-line`).
5. **Store** the token (D6).
6. **Prove** with the new token (D8). A refusal ends the run with the client's line and exit
   code; the token stays stored, the block is not written, and the next run resumes at step 3.
7. **Write the block** when absent. Print the line with ` (new project)` or
   ` (joined existing project)`; exit 0.

The three ways, for the one actor who runs this (the engineer with Railway access). Success
sentence: D11's line. Path back: delete the `walkthrough` block (the project then reviews in
the terminal again) and, to cut the access, `project revoke <id> <token id>` on the service.
Farthest artifact: one project row and one token on the service; the service has no tool that
deletes a project, so a created project stays. The line is printed by
`spec/scripts/walkthrough-connect.js` and relayed by `spec/commands/connect.md`.

Railway's stderr is never printed on success. No retry anywhere; each `railway` call has a 60 s
limit and a timeout is `railway-failed`.

## Acceptance Criteria

Fixtures used by the examples: a git-initialised host folder named `acme-shop` whose
`.gitignore` holds `.claude/settings.local.json` and whose config is `{ "generatedBy": "test" }`;
a fake `railway` executable first on `PATH` that logs its arguments and answers from a script
(project list `[{"id":"11111111-2222-3333-4444-555555555555","name":"walkthrough"}]`, `create`
→ stdout `token: wt_3f9a1c0de4b7a2c5`, stderr `Using SSH key from file …` and `created project
acme-shop`); the stub service at `http://127.0.0.1:<port>` (called `<stub>`) answering `GET /v1`
with `{"apiVersion":1,"revision":2,"sunset":null}` and `GET /v1/projects/acme-shop/approvals`
with `{"apiVersion":1,"approvals":[]}`. Runs pass `--base-url <stub>` unless the example says
otherwise, and run with `WALKTHROUGH_TOKEN` unset.

- **AC-20261005-01-1**: WHEN connect runs in a host with no `walkthrough` block and the id is
  new on the service THE SYSTEM SHALL create the project, store the token, prove the link and
  write the block (e.g. exit 0; stdout is exactly `connected acme-shop → <stub>/p/acme-shop
  (new project)`; the fake's log holds `ssh --project 11111111-2222-3333-4444-555555555555
  --service walkthrough --environment staging -- node dist/server/src/start/project.js create
  acme-shop acme-shop`; the approvals request carried `authorization: Bearer
  wt_3f9a1c0de4b7a2c5`; the config is `{ "generatedBy": "test", "walkthrough": { "baseUrl":
  "<stub>", "project": "acme-shop", "tokenEnv": "WALKTHROUGH_TOKEN" } }`;
  `.claude/settings.local.json` is `{ "env": { "WALKTHROUGH_TOKEN": "wt_3f9a1c0de4b7a2c5" } }`;
  no `design/` folder exists) → writes tests/walkthrough/connect.test.js
- **AC-20261005-01-2**: WHEN connect succeeds or refuses after a token was issued THE SYSTEM
  SHALL keep the token out of everything except the settings file (e.g. after the run of
  criterion 1, and after a run whose proof is answered `401 {"error":"bad-token","detail":null,
  "apiVersion":1}`: `wt_3f9a1c0de4b7a2c5` occurs in neither stdout nor stderr, and in no file
  under the host other than `.claude/settings.local.json`) → writes tests/walkthrough/connect.test.js
- **AC-20261005-01-3**: WHEN connect runs again in a host it already connected THE SYSTEM SHALL
  change nothing and call Railway zero times (e.g. second run: exit 0, stdout `connected
  acme-shop → <stub>/p/acme-shop (already connected)`, the fake's log gains no line, the config
  and the settings file are byte-identical to before) → writes tests/walkthrough/connect.test.js
- **AC-20261005-01-4**: WHEN no `--project` is given THE SYSTEM SHALL derive the id from the
  folder name and pass the folder name as the display name (e.g. folder `2024 Cycling Trip
  Book` → `create 2024-Cycling-Trip-Book` with the name argument `2024 Cycling Trip Book` as
  one argument; folder `my--app` → id `my-app`; folder `a -- b` → id `a-b`; a linked worktree
  of `acme-shop` checked out in a folder named `wt-x` → id `acme-shop`; `--project shop2 --name
  "Shop Two"` in `acme-shop` → `create shop2` with the name argument `Shop Two`)
  → writes tests/walkthrough/connect.test.js
- **AC-20261005-01-5**: WHEN the folder name yields no valid id THE SYSTEM SHALL refuse before
  any Railway call (e.g. folder `日本語`, or a folder of 81 letters `a`: exit 2, stderr starts
  `walkthrough-connect: no-id` and contains `--project`, the fake's log is empty, neither file
  is written) → writes tests/walkthrough/connect.test.js
- **AC-20261005-01-6**: WHEN `create` exits 1 with the stderr line `project-exists` THE SYSTEM
  SHALL mint a token for the existing project and connect (e.g. the fake's log holds `… create
  acme-shop acme-shop` and then `… project.js token acme-shop`; exit 0; stdout `connected
  acme-shop → <stub>/p/acme-shop (joined existing project)`; the stored token is the one
  `token` printed) → writes tests/walkthrough/connect.test.js
- **AC-20261005-01-7**: WHEN no `--base-url` is given THE SYSTEM SHALL ask Railway for the
  address in the chosen environment, `staging` by default (e.g. the fake answers `printenv
  RAILWAY_PUBLIC_DOMAIN` with `127.0.0.1:<closed port>`: the log holds `ssh --project
  11111111-2222-3333-4444-555555555555 --service walkthrough --environment staging --
  printenv RAILWAY_PUBLIC_DOMAIN`, the run exits 3 and stderr names
  `https://127.0.0.1:<closed port>`; with `--environment production` every `ssh` line in the
  log carries `--environment production`) → writes tests/walkthrough/connect.test.js
- **AC-20261005-01-8**: WHEN the proof does not answer after a token was issued THE SYSTEM SHALL
  keep the token, leave the block unwritten, and finish on the next run without a second
  `create` (e.g. first run with `--base-url http://127.0.0.1:<closed port>`: exit 3, the
  settings file holds `wt_3f9a1c0de4b7a2c5`, the config has no `walkthrough` key; second run
  with `--base-url <stub>`: exit 0, stdout `connected acme-shop → <stub>/p/acme-shop`, the log
  holds exactly one `create` line in total) → writes tests/walkthrough/connect.test.js
- **AC-20261005-01-9**: WHEN `.claude/settings.local.json` is not ignored by git THE SYSTEM
  SHALL refuse before creating anything (e.g. a host with an empty `.gitignore`, and a host
  where the file is committed: exit 2, stderr starts `walkthrough-connect: not-ignored` and
  contains `.gitignore`, the log holds no `create` line, the config has no `walkthrough` key)
  → writes tests/walkthrough/connect.test.js
- **AC-20261005-01-10**: WHEN the host's block points somewhere other than the flags name THE
  SYSTEM SHALL refuse and leave the block as it is (e.g. a block with project `acme-shop` and
  `--project other`: exit 2, stderr starts `walkthrough-connect: connected-elsewhere` and
  contains `delete the walkthrough block`, the log is empty, the config is byte-identical)
  → writes tests/walkthrough/connect.test.js
- **AC-20261005-01-11**: WHEN a connected host's stored token is refused `bad-token` THE SYSTEM
  SHALL issue a new one and replace the stored value (e.g. block present, settings file holds
  `wt_old`, the stub answers approvals first `401 {"error":"bad-token","detail":null,
  "apiVersion":1}` then `200`; the fake answers `create` with `project-exists` and `token`
  with `token: wt_new`: exit 0, stdout ends `(joined existing project)`, the settings file
  holds `wt_new` and not `wt_old`, the second approvals request carried `Bearer wt_new`)
  → writes tests/walkthrough/connect.test.js
- **AC-20261005-01-12**: WHEN Railway cannot do its part THE SYSTEM SHALL refuse with Railway's
  own last line and write nothing (e.g. the fake exits 1 on `ssh` with stderr `Using SSH key
  from file /k.pub: a@b` then `ServiceInstance not found`: exit 1, stderr starts
  `walkthrough-connect: railway-failed`, contains `ServiceInstance not found` and
  `--environment`, and does not contain `Using SSH key`; with no `railway` on `PATH`: exit 2,
  stderr starts `walkthrough-connect: no-railway`; in both the config has no `walkthrough` key
  and no settings file exists) → writes tests/walkthrough/connect.test.js
- **AC-20261005-01-13**: WHEN the host has no usable config THE SYSTEM SHALL refuse naming the
  bootstrap command (e.g. a folder with no `.claude/spec.config.json`: exit 2, stderr starts
  `walkthrough-connect: no-config` and contains `/spec:init`, the fake's log is empty)
  → writes tests/walkthrough/connect.test.js
- **AC-20261005-01-14**: WHEN connect stores the token THE SYSTEM SHALL keep what the settings
  file already holds, create a missing file readable by its owner only, and never overwrite a
  file it cannot parse (e.g. existing `{ "permissions": { "allow": ["Bash(ls:*)"] }, "env": {
  "FOO": "1" } }` → afterwards the same object plus `env.WALKTHROUGH_TOKEN`; a created file
  has mode `0600`; an existing file holding `not json`: exit 2, stderr starts
  `walkthrough-connect: bad-settings`, the file still holds `not json`, the log holds no
  `create` line) → writes tests/walkthrough/connect.test.js
- **AC-20261005-01-15**: WHEN the token variable is not in the environment and the host's
  settings file stores it THE SYSTEM SHALL send the stored token, and SHALL prefer the stored
  token over an exported one (e.g. `walkthrough.js pull-approvals --round 2` on a host whose
  settings file is `{ "env": { "WALKTHROUGH_TOKEN": "wt_stored" } }`: with the variable unset
  the request carries `Bearer wt_stored` and the run exits 0; with the variable set to
  `wt_exported` the request still carries `Bearer wt_stored`; `walkthrough.js check` on that
  host with the variable unset exits 0 with no finding)
  → writes tests/walkthrough/connect.test.js
- **AC-20261005-01-16**: WHEN the token variable is unset or empty and no token is stored THE
  SYSTEM SHALL CONTINUE TO exit 2 with the code `no-token`, name the variable and send nothing
  (e.g. `pull-approvals --round 2` with `WALKTHROUGH_TOKEN` unset → exit 2, stderr matches
  `no-token` and `WALKTHROUGH_TOKEN`, the stub's log is empty)
  → reuses tests/walkthrough/config.test.js :: AC-20260929-01-5: an
- **AC-20261005-01-17**: WHEN the client refuses for a missing token THE SYSTEM SHALL name the
  connect command as the first remedy (e.g. `pull-approvals --round 2`, variable unset, no
  settings file → stderr contains `remedy: run /spec:connect, or export WALKTHROUGH_TOKEN=`)
  → writes tests/walkthrough/connect.test.js
- **AC-20261005-01-18**: WHEN `spec-paths walkthrough-connect` runs THE SYSTEM SHALL print the
  path of an existing file ending `scripts/walkthrough-connect.js`, and `walkthrough.js` SHALL
  refuse a `connect` verb (e.g. `spec-paths walkthrough-connect` → exit 0, the printed path
  exists; `walkthrough.js connect` → exit 2, stderr contains `unknown verb "connect"`)
  → writes tests/walkthrough/connect.test.js
- **AC-20261005-01-19**: WHEN the mocks driver prints the terminal-confirm step for a project
  with no `walkthrough` block THE SYSTEM SHALL name the connect command (e.g. a bare driver run
  in SCREENS on a config with no `walkthrough` key → stdout contains `(this project is not
  connected to the review service — /spec:connect connects it, and the screens are then drawn
  and sent)`; the same run on a host with a block does not contain `/spec:connect`)
  → writes tests/mocks/connect-hint.test.js
- **AC-20261005-01-20**: WHEN this repo's `.claude/spec.config.json` is read THE SYSTEM SHALL
  CONTINUE TO carry a `contractHash` equal to the first 12 characters of the SHA-256 of
  `spec/templates/grounding-contract.md` (e.g. after D15's edit, `spec-paths contract-hash`
  prints the value the config holds) → reuses tests/consistency/contract-stamp.test.js :: AC-20260912-15-8

## Assumptions (escalation triggers)

Executed on 2026-10-05 against the Railway project `walkthrough` (`railway` 5.63.1), its
`staging` environment, git 2.54.0 and Claude Code headless sessions:

- A1 (spiked): `railway ssh --project <id> --service walkthrough --environment staging -- sh -c
  'echo "token: wt_spike_fake"; echo "created project x" >&2'` returns stdout `token:
  wt_spike_fake\n` (LF only, nothing else, checked with `od -c`) and stderr `Using SSH key from
  file …` plus the remote stderr line. — **if false:** read the token line with `^token: `
  anywhere in stdout after stripping `\r`; never read it from stderr.
- A2 (spiked): `--project walkthrough` (the name) answers `Project not found`, exit 1; the id
  from `railway list --json` (top-level `id` and `name` per element) works from an unlinked
  folder. — **if false:** STOP, ask the user.
- A3 (spiked): the remote exit code comes back (`sh -c 'exit 1'` → 1), and arguments arrive
  intact without a shell: `create my-id 'O'"'"'Brien & Co $HOME "x" ; ls `id`'` reached the
  remote `process.argv` as exactly those three strings. — **if false:** restrict `--name` to
  the `name` shape and refuse anything else.
- A4 (spiked): `… -- printenv RAILWAY_PUBLIC_DOMAIN` prints
  `walkthrough-staging-4090.up.railway.app\n`. — **if false:** `--base-url` becomes required
  and its absence is a `usage` refusal naming it.
- A5 (spiked): the same call against `production` exits 1 with `ServiceInstance not found`
  (nothing is deployed there). — **if false:** nothing to do; the refusal path is generic.
- A6 (spiked): the project tool runs in the container: `… project.js tokens zz-spike-missing`
  → stderr `unknown-project`, exit 1.
- A7 (spiked): on staging `GET /v1` answers 200 without a token and `GET
  /v1/projects/zz-spike-missing/approvals` answers `401 {"error":"bad-token","detail":null,
  "apiVersion":1}` with a wrong and with no bearer. — **if false:** the probe proves nothing;
  STOP, ask the user.
- A8 (spiked): a headless Claude Code session started in a folder whose
  `.claude/settings.local.json` holds `env.WT_SPIKE_A` prints it from `printenv`; a key added
  to the file by a script during the session is not visible to later commands of that session;
  a `node` script wrote the file with no permission prompt (a `cp` onto it was prompted). —
  **if false (a write is blocked in some permission mode):** the script refuses with the
  operating system's error and the remedy names running the same command from a plain
  terminal; D7 keeps the stored token working either way.
- A9 (spiked): `git check-ignore -q .claude/settings.local.json` exits 0 where a `.gitignore`
  or the user's global ignore file covers it (hearwell, salon-os) and 1 where the file is
  tracked (this repo). — **if false:** add `git ls-files --error-unmatch` as a second check.
- A10 (spiked): `git rev-parse --path-format=absolute --git-common-dir` inside a linked
  worktree prints the main checkout's `.git`. — **if false:** use the root's own folder name.

Not executed here (a real `create` leaves a project on staging that no tool can delete):

- A11: `create` prints `token: wt_…` on stdout (JJ's executed local run, 2026-10-05; the
  service's `src/start/project.ts`). — **if false:** `no-token-line` fires; STOP, ask the user.
- A12: `create` on a held id prints `project-exists` on stderr and exits 1; `token <id>` mints
  another token (the service's `create-project.ts` and `project.ts`, read 2026-10-05). — **if
  false:** D5 never triggers and the run ends `railway-failed` carrying the tool's line; STOP,
  ask the user.
- A13: `pullApprovals` on a project with no round answers `{"apiVersion":1,"approvals":[]}`
  (the service's `pull-approvals.ts` has no round check). — **if false:** probe with
  `pullNotes` instead.
- A14: no test outside this File Plan asserts the old `no-token` remedy wording or an exact
  line count of the terminal-confirm step (grep 2026-10-05: `config.test.js` matches only
  `no-token` and the variable's name; `wireframe-states.test.js` matches by `includes`). —
  **if false:** update the colliding assertion in place in the same batch; never weaken it.
- A15: the spec worktree a build runs in carries no token; every test supplies its own host,
  stub and fake `railway`, so no test reaches Railway or the real service. — **if false:** the
  test is wrong; fix the test.

## Rationale

The fork the request named first, the "never edits the host's config" rule, is settled by
keeping connect out of `walkthrough.js` (D1). That file's header states two refusals — no
config edit, no token written or printed — and both stay literally true for it; connect is a
second script with its own header and the opposite job. A verb would have been fewer files and
a false header.

D7 is the one change JJ did not ask for and then chose: the spike showed a session never sees
a variable added to its settings file after start, so "connect, then send screens" needs
either a restart or a client that reads the stored value. JJ picked no restart. Stored-first
was chosen over environment-first because the stored token is the one connect just proved; a
stale `export` in a shell profile would otherwise shadow it in exactly the session that ran
connect. Hosts wired by hand have no stored value and behave as before (AC-16).

D4 and D5 are JJ's rulings. Staging as the default means client projects connected now live
where data can be reset; reconnecting them later is D10's two steps, and the default's flip is
queued. Joining an existing id without a flag is safe enough because only a Railway login can
run the tool at all, and a wrong join surfaces at the first push as `round-exists`.

D15 makes this critical tier: the grounding contract's hash is stamped into every host, and
the old sentence becomes false. It is one clause; hosts owe a `/spec:doctor` re-stamp.

Fragile, watch during the build: the fake `railway` must be a real executable found through
`PATH` (the script spawns without a shell); the client's scrub knows only the token of its
current context, so connect must scrub the minted token from anything it prints itself; and
`tests/mocks/wireframe-rounds.test.js` asserts that no file under a mocks host contains the
token — true still, because those hosts get it from the environment.

Collision sweep at lock (literals leg, 8 hits). Fixed by a File Plan row: `lib/walkthrough-client.js`
(two literals), `grounding-contract.md`, `walkthrough.js` (its header sentence), ADR-0031 (the
backlink; its clause stands as the amended record). Waived: `spec/scripts/env-preflight.js`
("unset or empty" is its own exit-code text, unrelated); `tests/walkthrough/config.test.js` (the
reused pin of AC-16, unchanged); `spec/commands/mocks.md` ("the token is never printed or
written" is said of the mocks driver and stays true).

No regression pin beyond AC-16 and AC-20: every other criterion is new behaviour whose test
expires at close, and the client's untouched rules are already pinned by their own spec.

## Canonical Delta

`docs/canonical/design.md`, section "The walkthrough client (specs/20260929/01)" — the closing
clause "the token is read from the named environment variable and never written or printed"
becomes "the client reads the token from the project's git-ignored settings file when connect
stored it there, else from the named environment variable, and never writes or prints it".
Then append:

A project is connected with `/spec:connect` (`spec-paths walkthrough-connect`,
specs/20261005/01): run in the project with no arguments, it derives the project id from the
folder name, creates the project on the service through the Railway CLI (or joins the id when
the service already holds it), stores the token as `env.WALKTHROUGH_TOKEN` in the git-ignored
`.claude/settings.local.json`, proves the link with a call that needs the token, and only then
writes the `walkthrough` block. It is the one writer of that block and of the stored token;
the client still never edits the config and never writes or prints the token. The client
reads the stored token first and the environment variable second, so the session that ran
connect can send screens at once. A second run changes nothing; a block that points elsewhere
is never rewritten. The default environment is `staging` until production is deployed.
