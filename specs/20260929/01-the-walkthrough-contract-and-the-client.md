---
date: 2026-09-29
status: hardened
tier: critical
area: design
breaking: false
depends_on: []
depended_on_by: []
brief: 29
spiked: 2026-09-29
open_markers: 0
---

# The walkthrough contract and the client

## Goal

The plugin gains the one scripted HTTP client that talks to the hosted review service
(`walkthrough`), the one machine-readable contract file both repositories test against, and the
gray wireframe vocabulary as plain JSON, so a session can check a round before it sends it. A
project that declares no `walkthrough` block in its config is untouched: no request, no file, no
error. Done means: against a stub service the client pushes a wireframe round and a picture
round, pulls notes and approvals into `design/rounds/<n>/` as files git can diff, answers a note,
marks a round, refuses every answer that breaks the contract, and never prints the token.
`/spec:mocks` and the npm reviewer are not touched; switching them is a later spec of brief 29.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | New optional host config block `walkthrough` = `{ "baseUrl", "project", "tokenEnv" }`, all three non-empty strings, added to `spec/templates/grounding-contract.md` as an optional block with its own section (Contracts). **Absent block = the project does not use the service**: every verb of D6 that would talk to the service prints `walkthrough: not configured for this project — nothing sent`, exits 0, sends no request and writes no file. `project` matches the `name` shape (D3). `baseUrl` must be `https:` unless its hostname is `localhost`, `127.0.0.1` or `[::1]`; anything else is refused `insecure-base-url` before any request. The token is read from `process.env[tokenEnv]` at call time and nowhere else. (AC-20260929-01-4, AC-20260929-01-5, AC-20260929-01-19) | JJ ruled 2026-09-29: the service is optional per project. A bearer token over plain HTTP to a remote host is a leak, so the rule is in the client, not in a document. One contract edit for the whole series (pipeline rules § Planning cap). |
| D2 | `spec/scripts/lib/json-shape.js` is the one validator: a hand-rolled subset of JSON Schema with exactly these keywords — `type` (one name or an array of names from `string`, `integer`, `number`, `boolean`, `object`, `array`, `null`; an integer satisfies `number`), `properties`, `required`, `additionalProperties` (boolean only), `items`, `enum`, `const`, `$ref` (`#/shapes/<name>` only), `oneOf` (exactly one branch must match), `minLength`, `maxLength`, `pattern`, `minimum`, `maximum`, `minItems`, `maxItems`, `propertyNames` (`{ "pattern" }` only), `minProperties`, `description`. `validate(shapes, shapeName, value)` returns findings `{ at, code, detail }`, `at` a path such as `notes[2].anchor.index`. A schema carrying any other keyword is itself a finding `unknown-keyword` — never ignored. Exports `validate` and `KEYWORDS`. (AC-20260929-01-1) | One file both sides test against needs a format the service can read with a standard library and the plugin can read with none. Fail closed on an unknown keyword, or the contract could promise a check the plugin silently skips. Rejected: a home-made string grammar (`"string?"`) — only this repository could read it. |
| D3 | `spec/templates/walkthrough/contract.json` (key `walkthrough-contract`) is the contract, shaped as in Contracts: `apiVersion: 1`, `revision: 1`, `prefix: "/v1"`, `auth`, `compatibility`, `limits`, `errors` (code → HTTP status), `calls` (seven: `hello`, `pushRound`, `putImage`, `pullNotes`, `replyNote`, `pullApprovals`, `markRound`), `shapes` (D2's subset) and `examples` (one request and one response per call that has them). Request shapes set `additionalProperties: false`; response shapes do not, so a newer service may add fields. Shared shape `name` = `^(?!.*--)[A-Za-z0-9_.-]{1,80}$`. (AC-20260929-01-2) | Production gap 1. The examples are what the service's own contract tests replay, so they are checked here against their shapes. Requests are strict so a typo is refused; responses are open so an additive change breaks nobody. |
| D4 | `spec/templates/walkthrough/catalog.json` (key `walkthrough-catalog`) is the vocabulary: `catalogVersion: 1`, `containers` (the seven component names that may have children: `Stack`, `Row`, `Grid`, `Card`, `List`, `Nav`, `Tabs`), `actions` (`navigate`, params shape `{ to: name }`), and `shapes` holding one props shape per component — exactly the 19 names `Stack`, `Row`, `Grid`, `Card`, `Divider`, `Heading`, `Text`, `Badge`, `Alert`, `Button`, `Field`, `Select`, `Checkbox`, `Tabs`, `Nav`, `List`, `Table`, `Image`, `Avatar` — plus the shared value shapes `expression`, `text`, `number`, `boolean`, `texts`, `rows`. Every props shape is `additionalProperties: false`. The props, their kinds and which are required are the table in Contracts, verbatim. (AC-20260929-01-2, AC-20260929-01-3) | Brief 29 open question 1, default taken: the vocabulary lives in the plugin, versioned with the contract, so a session validates before it pushes. Plain JSON, not Zod: the plugin has no packages (pipeline rules § Worker Rules). |
| D5 | `spec/scripts/lib/walkthrough-catalog.js` checks a round offline. Per screen spec: `root` present (`missing-root`) and naming an element (`root-not-found`); every element has `type`, `props`, `children` (`missing-type`, `missing-props`, `missing-children`); `type` is one of the 19 (`unknown-component`); props pass the component's shape, reported as `unknown-prop`, `missing-prop` or `bad-prop`; every child key names an element (`missing-child`); a component outside `containers` has `children: []` (`children-not-allowed`); `on` may hold only `press` with `action: "navigate"` and params passing the action's shape (`unknown-action`, `bad-action`); `repeat` is `{ statePath: string }` (`bad-repeat`). Per round: `name`/`state` pass the `name` shape (`bad-name`); no two screens share name + state (`duplicate-screen`); every journey step names a screen + state of the round (`unknown-step-screen`); every `navigate` target names a screen of the round (`unknown-screen`); `variantOf` names another journey of the round (`unknown-variant-of`) that is not itself a variant (`chained-variant`); counts stay inside `limits` (`too-many`). Findings are `{ screen, state, element, code, detail }`. (AC-20260929-01-3) | The library's own validator checks component names only (spike finding 9), so the prop check is ours. Checking offline means a typo costs no request. The service runs the same rules from the same file. |
| D6 | `spec/scripts/walkthrough.js` (key `walkthrough`; `spec/entrypoints.json` row naming `spec/commands/doctor.md`) is the only entry point. `walkthrough <verb> [--root <dir>] [--json]`, hand-rolled argv. Verbs: `self-check [--contract <file>] [--catalog <file>]` (no network: D3/D4 files use only D2's keywords, every call's `request`/`response` names an existing shape, every example passes its shape, every code a call lists is in `errors`, the catalog holds exactly the 19 components); `validate --round-file <file>` (no network: D5); `check` (no network: D12); `hello`; `push --round-file <file> [--round <n>] [--resume <n>]`; `pull-notes [--round <n>]`; `pull-approvals [--round <n>]`; `reply --note <id> --text-file <file>`; `mark --round <n> --status open\|answered\|closed`. Exit codes: `0` done, or not configured; `1` refused — by the service, by the contract, or by findings; `2` usage, config or precondition; `3` the service did not answer (unreachable, timeout). Every refusal is one stderr line `walkthrough: <code> — <sentence> — remedy: <what to do>`. `--json` prints one JSON object on stdout through a synchronous writer. Every verb accepts `--contract <file>` and `--catalog <file>`, defaulting to the shipped files beside the script's plugin root. (AC-20260929-01-2, AC-20260929-01-17, AC-20260929-01-18) | One script behind which the network dependency sits (ADR-0030 consequences). Exit 3 is separate from 1 so a caller can tell "the service said no" from "nobody answered". The name avoids node's test-discovery patterns (pipeline rules § Gotchas). |
| D7 | `spec/scripts/lib/walkthrough-client.js` holds the calls; the config is read through `lib/host-config.js` `readConfig`. Every request: `Authorization: Bearer <token>` (except `hello`), `redirect: 'error'`, a timeout of 10 s (60 s for `putImage`) by `AbortController`, both replaced by `WALKTHROUGH_TIMEOUT_MS` milliseconds when that environment variable holds a positive integer (the tests' seam; undocumented to hosts). A redirect answer is refused `redirected`; a request that timed out is `timeout`, one that could not connect `unreachable`. Every response body is parsed as JSON and checked against the call's response shape before anything is written; a failing body is refused `contract-mismatch` naming the first finding's path, and no file is written. A non-2xx body that passes the `error` shape is refused with its own `error` code; one that does not is refused `not-json` or `http-<status>`. On `429` with a `Retry-After` of 60 seconds or less the client waits that long and retries the same request, at most twice; a longer or missing `Retry-After` is refused `rate-limited` naming the seconds. No other retry exists. The token never appears in stdout, stderr, `--json` output, a URL or any written file. (AC-20260929-01-10, AC-20260929-01-13, AC-20260929-01-16) | Production gaps 3 and 5. Checking answers at run time is the plugin's half of "both sides test against one file". Redirects are refused because a redirect is where a token travels to a host nobody named. |
| D8 | Versions (production gap 6), written in `contract.json` `compatibility` and enforced by the client: inside `/v1` only additive changes are allowed (a new optional request field, a new response field, a new call, a new error code) and each one raises `revision` by 1; removing or renaming a field, changing a type or a meaning, making an optional field required, or lowering a published limit is breaking and ships as `/v2`, with `/v1` served beside it for at least 90 days (`overlapDays: 90`). `hello` answers `{ apiVersion, revision, sunset }`, `sunset` = `null` or the date `/v1` stops. Before `push`, `pull-notes`, `pull-approvals`, `reply` and `mark` the client calls `hello`: `apiVersion` ≠ 1 or a 404 → refused `unknown-api-version`; service `revision` lower than the plugin's → refused `service-behind` naming both numbers; a non-null `sunset` → one stderr line `walkthrough: /v1 stops on <date> — update the plugin`, and the call proceeds. (AC-20260929-01-6) | A plugin one revision ahead may send a field the older service refuses as unknown, so "behind" is checked before the real call, not discovered as `bad-request`. 90 days is the default taken; it is a number in one file. |
| D9 | `push`: the round file (Contracts) is read and checked by D5 — findings print one line each, exit 1, nothing is sent. The round number is `--round <n>`, else one past the highest all-digit folder under `design/rounds/` (1 when none). For each journey the client computes `beats` with `lib/surfaces.js` `beatHash` over the journey's own steps; the round file never carries a hash. A step or screen whose `state` is absent or `null` sends **no** `state` key. `contentHash` = lowercase hex SHA-256 of the UTF-8 bytes of `JSON.stringify(body)` taken before the `contentHash` key is added. `409 round-exists` whose `detail.contentHash` equals the one sent is a success (the earlier push arrived; its answer was lost); any other `round-exists` is refused, naming `--round <n+1>` as the remedy, and no file is written. On success `design/rounds/<n>/round.json` is written (Contracts). (AC-20260929-01-7, AC-20260929-01-8) | The plugin owns the round number (spike finding 3), so a service whose data was reset can never make a pull overwrite an older round. "No state" has one spelling on the wire (spike finding 12): the story hash writes no `@state` for it. The content hash makes a repeated push safe without a second call. |
| D10 | A picture round (`kind: "screenshots"`): each screen names a local PNG `file` and a `width`. Before any request the client checks every file: the first 8 bytes are `89 50 4e 47 0d 0a 1a 0a` (else `not-png`), the size is at most `limits.imageBytes` (else `too-large`). The push body carries `sha256` and `bytes` per picture, never the file path. After the `201`, each picture is one `putImage` request, in round-file order: raw bytes, `content-type: image/png`, `x-content-sha256: <hex>`; the image key is `<name>--<width>` for a screen without a state and `<name>--<state>--<width>` with one. `round.json` lists every picture with `uploaded: false`, written before the first upload and rewritten after each success. A failed upload stops the run (exit 1 or 3) and leaves the round `uploading`; `push --round-file <file> --resume <n>` sends no `pushRound` and uploads only pictures whose `uploaded` is false, refusing (`exit 2`) when `design/rounds/<n>/round.json` is missing or its `contentHash` differs from the round file's. (AC-20260929-01-9, AC-20260929-01-11) | One request per picture with the round hidden until all arrive (spike finding 5). The checksum catches a truncated upload (production gap 5). Resume needs no extra call because an upload is safe to repeat. |
| D11 | Pulls. `--round` defaults to the highest all-digit folder under `design/rounds/`; a round with no `round.json` is refused (`exit 2`, remedy: push it, or name another round). `pull-notes`: when `design/rounds/<n>/notes.json` exists and holds a `cursor`, the request carries `since=<cursor>` and the answer is merged into the file by note `id` (an answered note replaces the stored one, a new one is added); otherwise the pull is full. `pull-approvals` is always full. Files (Contracts) hold `apiVersion`, `round`, the data, and for notes the `cursor`; notes are sorted by `at` then `id`, approvals by `journey`; nothing time-of-pull is written, so a pull that changed nothing leaves the file byte-identical. Writes are atomic (temp file + rename). Notes belong to the project: no `round` filter is sent, so a note from round 1 is still in round 2's file. (AC-20260929-01-12, AC-20260929-01-14) | Production gap 4. Git stays the ledger (ADR-0030 f); a file that changes on every pull would bury the real changes. Per-round files are kept because "what did the client say at round n" is the question a later reader asks. |
| D12 | `reply` reads the text from `--text-file`, trims it, refuses an empty text or one longer than `limits.replyChars` before any request (`exit 1`, `bad-request`), and posts `{ text }`. `mark` refuses a status outside `open`, `answered`, `closed` at `exit 2`. `check` (doctor) inspects the config only: block absent → prints nothing, exit 0; a missing or empty key, a `project` failing the `name` shape, an insecure `baseUrl`, or an unset token variable is one line each naming the key or the variable's **name**, exit 1; `--json` prints `{ "findings": [...] }`. `spec/commands/doctor.md` gains the check under the next free ordinal (24 at lock; take the next free number at build and amend every mention), advisory, run only when the block is present. (AC-20260929-01-15, AC-20260929-01-17, AC-20260929-01-19) | The fifth call (spike finding 1): without it the client never sees what happened to a note. The doctor check is the script's declared caller until a later spec wires the wireframe command. |
| D13 | `spec/bin/spec-paths` gains the keys `walkthrough` → `scripts/walkthrough.js`, `walkthrough-contract` → `templates/walkthrough/contract.json`, `walkthrough-catalog` → `templates/walkthrough/catalog.json`, and its usage string names all three. (AC-20260929-01-18) | Commands resolve scripts through `spec-paths` only (pipeline rules § Risk Tiers). |
| D14 | A new amendment ADR (next free number, `0031` at lock; take the next free number at build and amend every mention) records what ADR-0030 (f) now means: the client has seven calls, not four; the plugin owns the round number; the service is optional per project; the contract file and the vocabulary live in the plugin. `docs/adr/0030-the-kit-is-the-contract.md` gains the `Amended by` backlink. [no-ac: prose record; `citations-check` is the oracle] | ADR-0030 (f) says "four calls" in so many words; a spec that contradicts a binding record amends it in the open. |
| D15 | This repository's own `.claude/spec.config.json` is re-stamped with the new `contractHash` (`spec-paths contract-hash`). It gains **no** `walkthrough` block. [no-ac: `tests/consistency/contract-stamp.test.js`'s restamp pin is the oracle] | The contract edit of D1 changes the hash every host compares. This repository has no wireframes of its own. |
| D16 | Bump via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"`. [no-ac: bump — `plugin-bump.js --check` is the oracle] | Version discipline. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/json-shape.js | CREATE | scripts | D2 — `validate`, `KEYWORDS`; header comment with owner citation |
| spec/scripts/lib/walkthrough-catalog.js | CREATE | scripts | D5 — `checkScreen`, `checkRound`; reads the catalog through a path argument |
| spec/scripts/lib/walkthrough-client.js | CREATE | scripts | D1 config + token rules; D7 request/answer rules; D8 `hello` gate; D9–D12 calls and file writes |
| spec/scripts/walkthrough.js | CREATE | scripts | D6 — argv, verbs, exit codes, refusal line, `--json` through a synchronous writer |
| spec/templates/walkthrough/contract.json | CREATE | doctrine | D3, D8 — the contract, as in Contracts |
| spec/templates/walkthrough/catalog.json | CREATE | doctrine | D4 — the vocabulary, as in Contracts |
| spec/templates/grounding-contract.md | MODIFY | doctrine | D1 — `walkthrough` in the optional list and a `## Walkthrough` section (the series' one contract edit) |
| spec/commands/doctor.md | MODIFY | doctrine | D12 — check 24 (next free ordinal at build) |
| spec/bin/spec-paths | MODIFY | scripts | D13 — three keys and the usage string |
| spec/entrypoints.json | MODIFY | other | D6 — row for `spec/scripts/walkthrough.js` naming `spec/commands/doctor.md` |
| docs/adr/0031-the-walkthrough-contract.md | CREATE | other | D14 — the amendment record (next free number at build) |
| docs/adr/0030-the-kit-is-the-contract.md | MODIFY | other | D14 — `Amended by` backlink |
| .claude/spec.config.json | MODIFY | other | D15 — `contractHash` re-stamped |
| spec/.claude-plugin/plugin.json | MODIFY | other | D16 — `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` |
| tests/walkthrough/json-shape.test.js | CREATE | tests | AC-20260929-01-1 |
| tests/walkthrough/contract-files.test.js | CREATE | tests | AC-20260929-01-2 |
| tests/walkthrough/round-check.test.js | CREATE | tests | AC-20260929-01-3 |
| tests/walkthrough/config.test.js | CREATE | tests | AC-20260929-01-4, AC-20260929-01-5, AC-20260929-01-17 |
| tests/walkthrough/push.test.js | CREATE | tests | AC-20260929-01-6, AC-20260929-01-7, AC-20260929-01-8 |
| tests/walkthrough/pictures.test.js | CREATE | tests | AC-20260929-01-9, AC-20260929-01-11 |
| tests/walkthrough/answers.test.js | CREATE | tests | AC-20260929-01-10, AC-20260929-01-13, AC-20260929-01-16 |
| tests/walkthrough/pulls.test.js | CREATE | tests | AC-20260929-01-12, AC-20260929-01-14, AC-20260929-01-15 |
| tests/walkthrough/fixture.js | CREATE | tests | shared setup: a tmp host with or without the block, an async `spawn` runner for the script, `startStub(script)`; not a `*.test.js` file |
| tests/walkthrough/stub-service.js | CREATE | tests | a child-process `node:http` stub: `stub-service.js <port> <answers.json> <log.jsonl>`; answers each request from the scripted list in order per method + path, appends one line per request (method, url, headers, body length, body SHA-256, parsed JSON body) |
| tests/fixtures/walkthrough/hearwell-round.json | CREATE | tests | the wireframe round file of Contracts, four screens, one journey |
| tests/fixtures/walkthrough/pictures-round.json | CREATE | tests | a picture round file: `owner-intro` at 390 and 1280, `roster-confirm@empty` at 390 |
| tests/spec-paths.test.js | MODIFY | tests | key list gains the three keys (in place, per its own comment); AC-20260929-01-18 |
| tests/consistency/contract-stamp.test.js | MODIFY | tests | AC-20260929-01-19 |

Note (outside the table): `tests/consistency/entrypoints.test.js` is not edited — its key-count
pin compares the manifest with the inventory, and the two rows above move together. The three
`lib/` modules owe no manifest row (the inventory excludes `spec/scripts/lib/`). Every test whose
subject makes a request uses `fixture.js`'s async runner and the child-process stub; `runNode`
is `spawnSync` and would deadlock (pipeline rules § Gotchas). The stub writes PNG bytes for the
picture fixtures at setup (8 signature bytes plus filler); no binary file is committed.

## Contracts

The `walkthrough` config block (D1) and the grounding-contract section:

```jsonc
"walkthrough": {
  "baseUrl": "http://localhost:4791",   // https: required unless the host is localhost, 127.0.0.1 or [::1]
  "project": "hearwell",                // the project id on the service; shape `name`
  "tokenEnv": "WALKTHROUGH_TOKEN"       // the NAME of the env var holding the project's token
}
```

```markdown
## Walkthrough (optional — present when the project reviews wireframes on the hosted service)

`walkthrough` — `baseUrl` (the service's address; `https:` unless the host is `localhost`,
`127.0.0.1` or `[::1]`), `project` (the project id on the service), `tokenEnv` (the name of the
environment variable that holds the project's token; the token itself is never written to a
file). Absent block = the project does not use the service: the client sends nothing, writes
nothing and exits 0.
```

`spec/templates/walkthrough/contract.json` (D3, D8) — the whole file except `examples`, which
holds one `request` and one `response` per call built from the literal values in the Acceptance
Criteria:

```json
{
  "apiVersion": 1,
  "revision": 1,
  "prefix": "/v1",
  "auth": { "scheme": "bearer", "scope": "project", "header": "authorization", "minTokenLength": 32 },
  "compatibility": {
    "additive": ["a new optional request field", "a new response field", "a new call", "a new error code"],
    "breaking": ["a removed or renamed field", "a changed type or meaning", "an optional field made required", "a published limit lowered"],
    "additiveRaises": "revision",
    "breakingRaises": "apiVersion",
    "overlapDays": 90
  },
  "limits": {
    "pushBytes": 2000000, "imageBytes": 8000000, "screens": 300, "journeys": 100, "steps": 60,
    "replyChars": 4000, "pickedTextChars": 40, "actorChars": 60, "requestsPerMinute": 120
  },
  "errors": {
    "bad-request": 400, "bad-spec": 400, "bad-journey": 400, "beats-mismatch": 400,
    "unknown-variant-of": 400, "chained-variant": 400, "not-png": 400, "checksum-mismatch": 400,
    "bad-cursor": 400, "bad-token": 401, "wrong-project": 403, "unknown-project": 404,
    "unknown-round": 404, "unknown-picture": 404, "unknown-note": 404, "unknown-api-version": 404,
    "round-exists": 409, "not-screenshots": 409, "round-uploading": 409, "too-large": 413,
    "rate-limited": 429, "internal": 500
  },
  "calls": {
    "hello": { "method": "GET", "path": "/v1", "auth": false, "success": 200, "response": "hello", "errors": ["unknown-api-version"] },
    "pushRound": { "method": "POST", "path": "/v1/projects/{project}/rounds", "auth": true, "success": 201, "request": "roundPush", "response": "roundPushed",
      "errors": ["bad-request", "bad-spec", "bad-journey", "beats-mismatch", "unknown-variant-of", "chained-variant", "round-exists", "too-large"] },
    "putImage": { "method": "PUT", "path": "/v1/projects/{project}/rounds/{round}/images/{image}", "auth": true, "success": 200,
      "body": "image/png", "headers": { "x-content-sha256": "sha256" }, "response": "imageStored",
      "errors": ["not-png", "checksum-mismatch", "unknown-round", "unknown-picture", "not-screenshots", "too-large"] },
    "pullNotes": { "method": "GET", "path": "/v1/projects/{project}/notes", "auth": true, "success": 200,
      "query": { "since": "cursor", "round": "roundNumber" }, "response": "notesPulled", "errors": ["bad-request", "bad-cursor"] },
    "replyNote": { "method": "POST", "path": "/v1/projects/{project}/notes/{note}/reply", "auth": true, "success": 200,
      "request": "replyRequest", "response": "replied", "errors": ["bad-request", "unknown-note"] },
    "pullApprovals": { "method": "GET", "path": "/v1/projects/{project}/approvals", "auth": true, "success": 200, "response": "approvalsPulled", "errors": [] },
    "markRound": { "method": "POST", "path": "/v1/projects/{project}/rounds/{round}/mark", "auth": true, "success": 200,
      "request": "markRequest", "response": "marked", "errors": ["bad-request", "unknown-round", "round-uploading"] }
  },
  "commonErrors": ["bad-token", "wrong-project", "unknown-project", "rate-limited", "internal"],
  "shapes": {
    "name": { "type": "string", "pattern": "^(?!.*--)[A-Za-z0-9_.-]{1,80}$" },
    "hash12": { "type": "string", "pattern": "^[0-9a-f]{12}$" },
    "sha256": { "type": "string", "pattern": "^[0-9a-f]{64}$" },
    "time": { "type": "string", "pattern": "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}" },
    "cursor": { "type": "string", "minLength": 1, "maxLength": 200 },
    "roundNumber": { "type": "integer", "minimum": 1 },
    "roundStatus": { "enum": ["uploading", "open", "answered", "closed"] },
    "noteStatus": { "enum": ["open", "answered", "approved", "deferred"] },
    "error": { "type": "object", "required": ["error", "detail", "apiVersion"],
      "properties": { "error": { "type": "string", "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$" }, "apiVersion": { "const": 1 } } },
    "hello": { "type": "object", "required": ["apiVersion", "revision", "sunset"],
      "properties": { "apiVersion": { "type": "integer" }, "revision": { "type": "integer", "minimum": 1 },
        "sunset": { "type": ["string", "null"], "pattern": "^\\d{4}-\\d{2}-\\d{2}$" } } },
    "step": { "type": "object", "additionalProperties": false, "required": ["beat", "screen"],
      "properties": { "beat": { "type": "string", "minLength": 1, "maxLength": 300 }, "screen": { "$ref": "#/shapes/name" }, "state": { "$ref": "#/shapes/name" } } },
    "journey": { "type": "object", "additionalProperties": false, "required": ["id", "title", "beats", "steps"],
      "properties": { "id": { "$ref": "#/shapes/name" }, "title": { "type": "string", "minLength": 1, "maxLength": 120 },
        "persona": { "type": "string", "maxLength": 300 }, "beats": { "$ref": "#/shapes/hash12" },
        "steps": { "type": "array", "minItems": 1, "maxItems": 60, "items": { "$ref": "#/shapes/step" } },
        "actor": { "type": "string", "minLength": 1, "maxLength": 60 }, "variantOf": { "$ref": "#/shapes/name" } } },
    "wireframeScreen": { "type": "object", "additionalProperties": false, "required": ["name", "spec"],
      "properties": { "name": { "$ref": "#/shapes/name" }, "state": { "$ref": "#/shapes/name" }, "spec": { "type": "object", "required": ["root", "elements"] } } },
    "pictureScreen": { "type": "object", "additionalProperties": false, "required": ["name", "width", "sha256", "bytes"],
      "properties": { "name": { "$ref": "#/shapes/name" }, "state": { "$ref": "#/shapes/name" },
        "width": { "type": "integer", "minimum": 240, "maximum": 3840 }, "sha256": { "$ref": "#/shapes/sha256" },
        "bytes": { "type": "integer", "minimum": 1, "maximum": 8000000 } } },
    "wireframePush": { "type": "object", "additionalProperties": false, "required": ["round", "kind", "contentHash", "journeys", "screens"],
      "properties": { "round": { "$ref": "#/shapes/roundNumber" }, "kind": { "const": "wireframe" }, "contentHash": { "$ref": "#/shapes/sha256" },
        "journeys": { "type": "array", "minItems": 1, "maxItems": 100, "items": { "$ref": "#/shapes/journey" } },
        "screens": { "type": "array", "minItems": 1, "maxItems": 300, "items": { "$ref": "#/shapes/wireframeScreen" } } } },
    "picturePush": { "type": "object", "additionalProperties": false, "required": ["round", "kind", "contentHash", "journeys", "screens"],
      "properties": { "round": { "$ref": "#/shapes/roundNumber" }, "kind": { "const": "screenshots" }, "contentHash": { "$ref": "#/shapes/sha256" },
        "journeys": { "type": "array", "maxItems": 100, "items": { "$ref": "#/shapes/journey" } },
        "screens": { "type": "array", "minItems": 1, "maxItems": 300, "items": { "$ref": "#/shapes/pictureScreen" } } } },
    "roundPush": { "oneOf": [{ "$ref": "#/shapes/wireframePush" }, { "$ref": "#/shapes/picturePush" }] },
    "roundPushed": { "type": "object", "required": ["apiVersion", "round", "kind", "status", "journeys"],
      "properties": { "apiVersion": { "const": 1 }, "round": { "$ref": "#/shapes/roundNumber" }, "kind": { "enum": ["wireframe", "screenshots"] },
        "status": { "enum": ["uploading", "open"] },
        "journeys": { "type": "array", "items": { "type": "object", "required": ["id", "beats"],
          "properties": { "id": { "$ref": "#/shapes/name" }, "beats": { "$ref": "#/shapes/hash12" } } } } } },
    "roundExists": { "type": "object", "required": ["contentHash", "status"],
      "properties": { "contentHash": { "$ref": "#/shapes/sha256" }, "status": { "$ref": "#/shapes/roundStatus" } } },
    "imageStored": { "type": "object", "required": ["apiVersion", "round", "image", "bytes", "remaining", "status"],
      "properties": { "apiVersion": { "const": 1 }, "round": { "$ref": "#/shapes/roundNumber" }, "image": { "type": "string" },
        "bytes": { "type": "integer", "minimum": 1 }, "remaining": { "type": "integer", "minimum": 0 }, "status": { "enum": ["uploading", "open"] } } },
    "nodeAnchor": { "type": "object", "additionalProperties": false, "required": ["node", "index"],
      "properties": { "node": { "type": "string", "minLength": 1 }, "index": { "type": "integer", "minimum": 0 } } },
    "pictureAnchor": { "type": "object", "additionalProperties": false, "required": ["x", "y", "width"],
      "properties": { "x": { "type": "number", "minimum": 0, "maximum": 1 }, "y": { "type": "number", "minimum": 0, "maximum": 1 },
        "width": { "type": "integer", "minimum": 240, "maximum": 3840 } } },
    "anchor": { "oneOf": [{ "type": "null" }, { "$ref": "#/shapes/nodeAnchor" }, { "$ref": "#/shapes/pictureAnchor" }] },
    "threadEntry": { "type": "object", "required": ["by", "text", "at"],
      "properties": { "by": { "enum": ["client", "owner", "session"] }, "who": { "type": "string" }, "text": { "type": "string" }, "at": { "$ref": "#/shapes/time" } } },
    "note": { "type": "object", "required": ["id", "round", "screen", "anchor", "pickedText", "status", "text", "author", "thread", "at"],
      "properties": { "id": { "type": "string", "minLength": 1 }, "round": { "$ref": "#/shapes/roundNumber" },
        "screen": { "type": ["string", "null"] }, "state": { "$ref": "#/shapes/name" }, "anchor": { "$ref": "#/shapes/anchor" },
        "pickedText": { "type": ["string", "null"], "maxLength": 40 }, "status": { "$ref": "#/shapes/noteStatus" },
        "text": { "type": "string" }, "author": { "enum": ["client", "owner", "session"] },
        "thread": { "type": "array", "minItems": 1, "items": { "$ref": "#/shapes/threadEntry" } }, "at": { "$ref": "#/shapes/time" } } },
    "journeyThread": { "type": "object", "required": ["id", "status", "thread"],
      "properties": { "id": { "$ref": "#/shapes/name" }, "status": { "$ref": "#/shapes/noteStatus" },
        "thread": { "type": "array", "items": { "$ref": "#/shapes/threadEntry" } } } },
    "notesPulled": { "type": "object", "required": ["apiVersion", "notes", "journeys", "cursor"],
      "properties": { "apiVersion": { "const": 1 }, "notes": { "type": "array", "items": { "$ref": "#/shapes/note" } },
        "journeys": { "type": "array", "items": { "$ref": "#/shapes/journeyThread" } }, "cursor": { "$ref": "#/shapes/cursor" } } },
    "replyRequest": { "type": "object", "additionalProperties": false, "required": ["text"],
      "properties": { "text": { "type": "string", "minLength": 1, "maxLength": 4000 } } },
    "replied": { "type": "object", "required": ["apiVersion"],
      "properties": { "apiVersion": { "const": 1 }, "note": { "$ref": "#/shapes/note" }, "journey": { "$ref": "#/shapes/journeyThread" } } },
    "approval": { "type": "object", "required": ["journey", "by", "round", "beats", "at"],
      "properties": { "journey": { "$ref": "#/shapes/name" }, "by": { "enum": ["client", "owner"] }, "who": { "type": "string" },
        "round": { "$ref": "#/shapes/roundNumber" }, "beats": { "$ref": "#/shapes/hash12" }, "at": { "$ref": "#/shapes/time" }, "reason": { "type": "string" } } },
    "approvalsPulled": { "type": "object", "required": ["apiVersion", "approvals"],
      "properties": { "apiVersion": { "const": 1 }, "approvals": { "type": "array", "items": { "$ref": "#/shapes/approval" } } } },
    "markRequest": { "type": "object", "additionalProperties": false, "required": ["status"],
      "properties": { "status": { "enum": ["open", "answered", "closed"] } } },
    "marked": { "type": "object", "required": ["apiVersion", "round", "status"],
      "properties": { "apiVersion": { "const": 1 }, "round": { "$ref": "#/shapes/roundNumber" }, "status": { "$ref": "#/shapes/roundStatus" } } }
  }
}
```

A refusal body is always the `error` shape: `{ "error": "<code>", "detail": <anything>, "apiVersion": 1 }`.
For `round-exists`, `detail` passes `roundExists`. For `bad-spec`, `detail` is the list of D5
findings. `since` returns every note whose status or thread changed after the cursor was issued,
and the journey threads that changed; a note is never deleted. A journey-level thread is
addressed in `replyNote` by the journey's id in the `{note}` place.

`spec/templates/walkthrough/catalog.json` (D4): `{ "catalogVersion": 1, "containers": [...],
"actions": { "navigate": { "params": "navigateParams" } }, "shapes": { ... } }`. Value shapes:

```json
{
  "expression": { "type": "object", "propertyNames": { "pattern": "^\\$" }, "minProperties": 1 },
  "text": { "oneOf": [{ "type": "string" }, { "$ref": "#/shapes/expression" }] },
  "number": { "oneOf": [{ "type": "number" }, { "$ref": "#/shapes/expression" }] },
  "boolean": { "oneOf": [{ "type": "boolean" }, { "$ref": "#/shapes/expression" }] },
  "texts": { "oneOf": [{ "type": "array", "items": { "$ref": "#/shapes/text" } }, { "$ref": "#/shapes/expression" }] },
  "rows": { "oneOf": [{ "type": "array", "items": { "$ref": "#/shapes/texts" } }, { "$ref": "#/shapes/expression" }] },
  "navigateParams": { "type": "object", "additionalProperties": false, "required": ["to"], "properties": { "to": { "type": "string", "minLength": 1 } } }
}
```

Component props (a `?` marks an optional prop; an enum prop never accepts an expression):

| Component | Container | Props |
|---|---|---|
| `Stack` | yes | `gap?` number, `padding?` number, `align?` enum `start`\|`center`\|`end`\|`stretch` |
| `Row` | yes | `gap?` number, `align?` enum `start`\|`center`\|`end`\|`stretch`, `justify?` enum `start`\|`center`\|`end`\|`between`, `wrap?` boolean |
| `Grid` | yes | `columns?` number, `gap?` number |
| `Card` | yes | `title?` text, `description?` text |
| `Divider` | no | `label?` text |
| `Heading` | no | `text` text, `level?` enum `1`\|`2`\|`3`\|`4` (numbers) |
| `Text` | no | `text` text, `size?` enum `sm`\|`md`\|`lg`, `muted?` boolean |
| `Badge` | no | `text` text |
| `Alert` | no | `title` text, `text?` text |
| `Button` | no | `label` text, `variant?` enum `primary`\|`secondary`\|`ghost` |
| `Field` | no | `label` text, `placeholder?` text, `value?` text, `hint?` text, `multiline?` boolean |
| `Select` | no | `options` texts, `label?` text, `value?` text, `placeholder?` text |
| `Checkbox` | no | `label` text, `checked?` boolean |
| `Tabs` | yes | `tabs` texts, `active?` text |
| `Nav` | yes | `brand?` text, `items?` texts, `active?` text, `vertical?` boolean |
| `List` | yes | `items?` texts, `ordered?` boolean |
| `Table` | no | `columns` texts, `rows` rows |
| `Image` | no | `label?` text, `height?` number |
| `Avatar` | no | `name?` text, `size?` enum `sm`\|`md`\|`lg` |

The round file (D9, D10) — what `push` and `validate` read. A `state` that is absent or `null`
means the screen's base state:

```json
{ "kind": "wireframe",
  "journeys": [ { "id": "owner-onboarding", "title": "Owner onboarding",
    "persona": "Mika (clinic owner) is invited, confirms her roster, and ends at the brief.",
    "steps": [ { "beat": "I open the invitation", "screen": "owner-intro" },
               { "beat": "I check who is on my team", "screen": "roster-confirm" },
               { "beat": "I see nobody is listed yet", "screen": "roster-confirm", "state": "empty" },
               { "beat": "I read what happens next", "screen": "reciprocity-brief" } ] } ],
  "screens": [ { "name": "owner-intro", "spec": { "root": "page", "elements": {
      "page": { "type": "Stack", "props": { "gap": 16, "padding": 24 }, "children": ["title", "start"] },
      "title": { "type": "Heading", "props": { "text": "You are invited to Hearwell", "level": 1 }, "children": [] },
      "start": { "type": "Button", "props": { "label": "Check my team" }, "children": [],
                 "on": { "press": { "action": "navigate", "params": { "to": "roster-confirm" } } } } } } },
    { "name": "roster-confirm", "spec": { "…": "…" } },
    { "name": "roster-confirm", "state": "empty", "spec": { "…": "…" } },
    { "name": "reciprocity-brief", "spec": { "…": "…" } } ] }
```

```json
{ "kind": "screenshots", "journeys": [],
  "screens": [ { "name": "owner-intro", "width": 390, "file": "captures/owner-intro-390.png" },
               { "name": "owner-intro", "width": 1280, "file": "captures/owner-intro-1280.png" },
               { "name": "roster-confirm", "state": "empty", "width": 390, "file": "captures/roster-empty-390.png" } ] }
```

`file` is resolved against the round file's own directory. The story hash of the journey above
is `08363cd98ef8` (executed, A1).

Files under `design/rounds/<n>/` (D9–D11), two-space JSON with a trailing newline:

```json
{ "apiVersion": 1, "round": 3, "kind": "screenshots", "status": "uploading",
  "contentHash": "<64 hex>", "journeys": [ { "id": "owner-onboarding", "beats": "08363cd98ef8" } ],
  "screens": [ { "name": "owner-intro", "state": null, "width": 390, "image": "owner-intro--390", "sha256": "<64 hex>", "bytes": 200008, "uploaded": true },
               { "name": "roster-confirm", "state": "empty", "width": 390, "image": "roster-confirm--empty--390", "sha256": "<64 hex>", "bytes": 200008, "uploaded": false } ] }
```

A wireframe round's `screens` entries are `{ name, state }` only. `notes.json` =
`{ "apiVersion": 1, "round": 3, "cursor": "c-2", "notes": [ <note>… ], "journeys": [ <journeyThread>… ] }`;
`approvals.json` = `{ "apiVersion": 1, "round": 3, "approvals": [ <approval>… ] }`.

The refusal line (D6) and its codes that the service never sends: `not-configured` (exit 0, on
stdout, no `remedy`), `bad-config`, `no-token`, `insecure-base-url`, `bad-round-file` (exit 2);
`contract-mismatch`, `service-behind`, `not-json`, `http-<status>`, `redirected`, and the local
`not-png` / `too-large` / `bad-request` (exit 1); `unreachable`, `timeout` (exit 3).

```
walkthrough: bad-token — POST /v1/projects/hearwell/rounds was refused — remedy: issue a new token for hearwell in the service and export WALKTHROUGH_TOKEN
walkthrough: unreachable — http://localhost:4791 did not answer (ECONNREFUSED) — remedy: start the service, or fix walkthrough.baseUrl
```

## Behavior

A caller (today a person or a session; later the wireframe driver) assembles a round file and
runs `validate`, then `push`. The client reads the config; without the block it says so and
stops at exit 0. With the block it checks the round, greets the service, picks the round number
from the folders git already holds, sends the round, and writes `round.json`. For pictures it
then uploads one file at a time; the service keeps the round hidden until the last one arrives.
Later the caller runs `pull-notes` and `pull-approvals`; each answer is checked against the
contract before it touches a file, then written under the round's folder. A session that
answered a note in the next round runs `reply`, and `mark` when the round is done.

Approval staleness is not computed here: `approvals.json` carries the hash the client confirmed,
and the caller compares it with the seed's current hash (`lib/surfaces.js`). The reviewer's own
pages, sign-in, and the rule that "changed" compares with the round the client confirmed belong
to the service's repository (`docs/handoff/walkthrough-service-brief.md`).

## Acceptance Criteria

- **AC-20260929-01-1**: WHEN `validate(shapes, name, value)` runs THE SYSTEM SHALL return no finding for `Heading` props `{"text":"You are invited to Hearwell","level":1}`, one finding with code `unknown-field` at `.levle` for `{"text":"x","levle":1}`, one `missing` at `.text` for `{"level":2}`, one `enum` at `.level` for `{"text":"x","level":5}`, no finding for `Avatar` props `{"name":{"$item":"name"}}`, one `one-of` at `.name` for `{"name":{"item":"name"}}`, one `one-of` at `.rows` for `Table` props `{"columns":["Q"],"rows":["a"]}`, and one `unknown-keyword` naming `format` for a shape `{"type":"string","format":"email"}` whatever the value → writes tests/walkthrough/json-shape.test.js
- **AC-20260929-01-2**: WHEN `walkthrough self-check` runs on the shipped files THE SYSTEM SHALL exit 0 and print `contract ok: 7 calls` and `catalog ok: 19 components`; WHEN `--contract` names a copy whose `examples.pullNotes.response.notes[0]` lost its `anchor` key THE SYSTEM SHALL exit 1 naming `examples.pullNotes.response` and `anchor`; WHEN a copy's `calls.markRound.response` is `"markd"` THE SYSTEM SHALL exit 1 naming `markd`; WHEN `--catalog` names a copy without the `Avatar` shape THE SYSTEM SHALL exit 1 naming `Avatar` → writes tests/walkthrough/contract-files.test.js
- **AC-20260929-01-3**: WHEN `walkthrough validate --round-file tests/fixtures/walkthrough/hearwell-round.json` runs THE SYSTEM SHALL exit 0 and print `round ok: 4 screens, 1 journey`; WHEN a copy's `roster-confirm@empty` element `add` has props `{"lable":"Add a person"}` THE SYSTEM SHALL exit 1 with a line containing `roster-confirm@empty`, `add`, `unknown-prop` and `lable`, and a line containing `missing-prop` and `label`; WHEN a `Button` has `children: ["x"]` THE SYSTEM SHALL report `children-not-allowed`; WHEN `start` navigates to `roster-confrim` THE SYSTEM SHALL report `unknown-screen` naming `roster-confrim`; WHEN step 3's `state` is `emtpy` THE SYSTEM SHALL report `unknown-step-screen` naming `roster-confirm@emtpy`; WHEN a second journey has `variantOf: "owner-onboarding"` and a third has `variantOf` naming the second THE SYSTEM SHALL report `chained-variant` for the third only; and every failing run SHALL send no request → writes tests/walkthrough/round-check.test.js
- **AC-20260929-01-4**: WHEN `push`, `pull-notes`, `pull-approvals`, `reply`, `mark` or `hello` runs in a host whose config has no `walkthrough` block THE SYSTEM SHALL exit 0, print `walkthrough: not configured for this project — nothing sent` on stdout, print `{"skipped":true}` under `--json`, create no `design/rounds` directory, and open no connection (the stub's log stays empty even with a stub listening) → writes tests/walkthrough/config.test.js
- **AC-20260929-01-5**: WHEN the block lacks `tokenEnv` THE SYSTEM SHALL exit 2 naming `walkthrough.tokenEnv`; WHEN `tokenEnv` is `WALKTHROUGH_TOKEN` and that variable is unset or empty THE SYSTEM SHALL exit 2 with code `no-token` naming `WALKTHROUGH_TOKEN`; WHEN `baseUrl` is `http://walk.example.com` THE SYSTEM SHALL exit 2 with code `insecure-base-url` and send nothing; WHEN `baseUrl` is `http://127.0.0.1:<port>`, `http://localhost:<port>` or `https://walk.example.com` THE SYSTEM SHALL not report `insecure-base-url` → writes tests/walkthrough/config.test.js
- **AC-20260929-01-6**: WHEN `push` runs and the stub answers `GET /v1` with `{"apiVersion":1,"revision":1,"sunset":null}` THE SYSTEM SHALL send `GET /v1` first and without an `authorization` header; WHEN the answer is `{"apiVersion":2,"revision":1,"sunset":null}` or a `404` THE SYSTEM SHALL exit 1 with code `unknown-api-version` and send no `POST`; WHEN the contract copy in use has `revision: 3` and the answer has `revision: 2` THE SYSTEM SHALL exit 1 with code `service-behind` naming `2` and `3`; WHEN the answer has `"sunset":"2027-01-31"` THE SYSTEM SHALL print a stderr line containing `/v1 stops on 2027-01-31` and still push → writes tests/walkthrough/push.test.js
- **AC-20260929-01-7**: WHEN `push --round-file <hearwell round>` runs in a host holding `design/rounds/1/` and `design/rounds/2/` with token `tok_0123456789abcdef0123456789abcdef` and project `hearwell` THE SYSTEM SHALL send `POST /v1/projects/hearwell/rounds` with header `authorization: Bearer tok_0123456789abcdef0123456789abcdef` and a body whose `round` is `3`, `kind` is `wireframe`, `journeys[0].beats` is `08363cd98ef8`, whose `journeys[0].steps[0]` has no `state` key and `steps[2].state` is `empty`, whose `screens[0]` has no `state` key, and whose `contentHash` equals the SHA-256 of the body serialized without that key; on the stub's `201` it SHALL exit 0, print `pushed round 3 (wireframe) — open`, and write `design/rounds/3/round.json` with `round: 3`, `journeys: [{"id":"owner-onboarding","beats":"08363cd98ef8"}]` and four `screens`; WHEN `--round 7` is given THE SYSTEM SHALL send `round: 7` → writes tests/walkthrough/push.test.js
- **AC-20260929-01-8**: WHEN the stub answers the push with `409 {"error":"round-exists","detail":{"contentHash":"<the hash sent>","status":"open"},"apiVersion":1}` THE SYSTEM SHALL exit 0 and write `round.json`; WHEN `detail.contentHash` is 64 zeros THE SYSTEM SHALL exit 1 with code `round-exists`, name `--round 4` in the remedy (for round 3), and create no `design/rounds/3/` → writes tests/walkthrough/push.test.js
- **AC-20260929-01-9**: WHEN `push --round-file <pictures round>` runs for round 1 THE SYSTEM SHALL send the push with three `screens` each carrying `sha256` and `bytes` and no `file` key, then exactly three `PUT` requests in order to `/v1/projects/hearwell/rounds/1/images/owner-intro--390`, `…/owner-intro--1280` and `…/roster-confirm--empty--390`, each with `content-type: image/png`, an `x-content-sha256` equal to the SHA-256 of the bytes received, and the file's exact bytes; after the third it SHALL write `round.json` with every `uploaded: true` and `status: "open"`; WHEN the stub answers the second `PUT` with `500` THE SYSTEM SHALL exit 1, send no third `PUT`, and leave `round.json` with `uploaded` = `true, false, false` and `status: "uploading"`; WHEN `push --round-file <same> --resume 1` then runs THE SYSTEM SHALL send no `POST` and exactly the two remaining `PUT`s; WHEN `--resume 1` runs with a round file whose content differs THE SYSTEM SHALL exit 2 naming `contentHash` → writes tests/walkthrough/pictures.test.js
- **AC-20260929-01-10**: WHEN the stub answers a request with `429`, `retry-after: 1` and then `200` THE SYSTEM SHALL exit 0 having sent that request twice; WHEN it answers `429` three times THE SYSTEM SHALL exit 1 with code `rate-limited` having sent the request three times; WHEN `retry-after` is `120` THE SYSTEM SHALL exit 1 naming `120` having sent the request once → writes tests/walkthrough/answers.test.js
- **AC-20260929-01-11**: WHEN a picture file begins with the bytes `GIF89a` THE SYSTEM SHALL exit 1 with code `not-png` naming the file and send no request; WHEN a picture file is 8,000,001 bytes THE SYSTEM SHALL exit 1 with code `too-large` naming `8000000` and send no request → writes tests/walkthrough/pictures.test.js
- **AC-20260929-01-12**: WHEN `pull-notes` runs for round 2 with no `notes.json` and the stub answers two notes (`n2` at `2026-09-29T10:05:00Z`, `n1` at `2026-09-29T10:00:00Z`, `n1` carrying `round: 1` and anchor `{"node":"start","index":0}`) and `cursor: "c-1"` THE SYSTEM SHALL request `/v1/projects/hearwell/notes` with no query, and write `design/rounds/2/notes.json` holding `cursor: "c-1"` and the notes in the order `n1`, `n2`; WHEN it runs again and the stub answers `n1` with `status: "answered"`, a new `n3` and `cursor: "c-2"` THE SYSTEM SHALL request `…/notes?since=c-1` and the file SHALL hold `n1` (answered), `n2` (unchanged), `n3` and `cursor: "c-2"`; WHEN it runs a third time and the stub answers no notes and `cursor: "c-2"` THE SYSTEM SHALL leave the file byte-identical; WHEN `--round 9` names a round with no `round.json` THE SYSTEM SHALL exit 2 naming `design/rounds/9/round.json` → writes tests/walkthrough/pulls.test.js
- **AC-20260929-01-13**: WHEN the stub answers `pull-notes` with `{"apiVersion":1,"cursor":"c-1","journeys":[]}` THE SYSTEM SHALL exit 1 with code `contract-mismatch` naming `notes` and write no file; WHEN a note's anchor is `{"node":"start"}` THE SYSTEM SHALL exit 1 with code `contract-mismatch` naming `notes[0].anchor`; WHEN the answer carries an extra top-level field `"hint":"x"` and is otherwise valid THE SYSTEM SHALL exit 0 → writes tests/walkthrough/answers.test.js
- **AC-20260929-01-14**: WHEN `pull-approvals` runs for round 2 and the stub answers approvals for `team-invite` and `owner-onboarding` (`by: "client"`, `round: 2`, `beats: "08363cd98ef8"`) THE SYSTEM SHALL write `design/rounds/2/approvals.json` with `owner-onboarding` first and both `beats` values unchanged → writes tests/walkthrough/pulls.test.js
- **AC-20260929-01-15**: WHEN `reply --note n1 --text-file <file holding "  Moved the button up.\n">` runs THE SYSTEM SHALL send `POST /v1/projects/hearwell/notes/n1/reply` with body `{"text":"Moved the button up."}` and exit 0; WHEN the file holds only spaces THE SYSTEM SHALL exit 1 and send nothing; WHEN it holds 4,001 characters THE SYSTEM SHALL exit 1 naming `4000` and send nothing; WHEN `mark --round 2 --status answered` runs THE SYSTEM SHALL send `POST /v1/projects/hearwell/rounds/2/mark` with body `{"status":"answered"}`; WHEN `--status done` is given THE SYSTEM SHALL exit 2 and send nothing → writes tests/walkthrough/pulls.test.js
- **AC-20260929-01-16**: WHEN the stub answers `401 {"error":"bad-token","detail":"revoked","apiVersion":1}` THE SYSTEM SHALL exit 1 with a stderr line starting `walkthrough: bad-token — ` and containing `remedy:`, and neither stdout nor stderr nor any file under the host SHALL contain `tok_0123456789abcdef0123456789abcdef`; WHEN `baseUrl` names a closed port THE SYSTEM SHALL exit 3 with code `unreachable`; WHEN the stub answers `200` with the body `<html>` THE SYSTEM SHALL exit 1 with code `not-json`; WHEN the stub answers `302` with a `location` header THE SYSTEM SHALL exit 1 with code `redirected` and send no second request; WHEN the stub never answers and the timeout is set to 300 ms by the test-only environment variable `WALKTHROUGH_TIMEOUT_MS` THE SYSTEM SHALL exit 3 with code `timeout` → writes tests/walkthrough/answers.test.js
- **AC-20260929-01-17**: WHEN `walkthrough check` runs in a host with no block THE SYSTEM SHALL exit 0 and print nothing; WHEN the block is complete and the token variable is set THE SYSTEM SHALL exit 0; WHEN `project` is `hear--well` THE SYSTEM SHALL exit 1 naming `walkthrough.project`; WHEN the token variable is unset THE SYSTEM SHALL exit 1 with a line naming `WALKTHROUGH_TOKEN`; `--json` SHALL print `{"findings":[…]}` with one entry per line; and no case SHALL open a connection → writes tests/walkthrough/config.test.js
- **AC-20260929-01-18**: WHEN `spec-paths walkthrough`, `spec-paths walkthrough-contract` and `spec-paths walkthrough-catalog` run THE SYSTEM SHALL print existing paths ending `scripts/walkthrough.js`, `templates/walkthrough/contract.json` and `templates/walkthrough/catalog.json` → rewrites tests/spec-paths.test.js :: AC-20260926-03-8: every documented key resolves to an existing path
- **AC-20260929-01-19**: WHEN `spec/templates/grounding-contract.md` is read THE SYSTEM SHALL name `walkthrough` in the optional list of § Required config keys and carry a `## Walkthrough` section naming `baseUrl`, `project` and `tokenEnv` and the sentence that an absent block sends nothing → writes tests/consistency/contract-stamp.test.js

## Assumptions (escalation triggers)

- A1 (executed 2026-09-29): `lib/surfaces.js` `parseSeedJourneys` returns a `Map`; its beats are `{ n, beat, screen, state }` with `state: null` when the seed names none; `beatHash` over the hearwell owner-onboarding beats prints `08363cd98ef8`, and over `[{beat:"I open the invitation",screen:"owner-intro"},{beat:"I see nobody is listed yet",screen:"roster-confirm",state:"empty"}]` prints `f5eac39a8e33` (absent and `null` state hash alike). — **if false:** STOP; the story hash is ADR-0029's and is never re-derived here.
- A2 (executed 2026-09-29, Node v26.8.2): global `fetch` exists; a `PUT` with a `Buffer` body of 200,008 bytes and a custom `x-content-sha256` header arrives byte-identical with `content-length: 200008` and the header intact. — **if false:** send through `node:http` `request`; record the deviation.
- A3 (executed 2026-09-29): `fetch` to a closed port rejects with `TypeError` whose `cause.code` is `ECONNREFUSED`; an aborted request rejects with `name: 'AbortError'`; `redirect: 'error'` on a `302` rejects with `TypeError` whose `cause.message` is `unexpected redirect`; `res.json()` on an HTML body rejects with `SyntaxError`; a `429` exposes `retry-after` through `res.headers.get`. — **if false:** map by HTTP status and error name only and record the deviation; never follow a redirect.
- A4 (executed 2026-09-29): a validator of D2's keyword set, written in under 60 lines, judges the ten prop cases of AC-1 as listed (ten of ten), including an expression object through `propertyNames` and the nested `rows` shape through `oneOf`. — **if false:** the failing keyword is fixed in `json-shape.js`; the contract files never gain a keyword to work around it.
- A5 (executed 2026-09-29 in the prototype, `@json-render/core` and `@json-render/react` 0.21.0): the library's validator checks component names only, drops `on` from its output and requires `children` on every element; a component never receives its own key; a repeated element is one key drawn many times. These bind the service; here they are why D5 exists and why an anchor is `{ node, index }`. — **if false:** nothing in this spec changes; the service brief is corrected.
- A6 (executed 2026-09-29 against the prototype service): a wireframe round of four screens and one journey is one request of about 2.5 KB; `null` and `"default"` as a step's state were both refused by the service, the omitted key accepted. — **if false:** D9's one-spelling rule stands; the service conforms.
- A7: no test outside this File Plan pins the exact `spec-paths` usage string or the doctor's check count (grep at lock: the usage pin in `tests/spec-paths.test.js` asserts membership of named keys, never the whole string). — **if false:** the hit is a fix row here, never a weakened pin.
- A8: the service will implement `contentHash`, `since`/`cursor`, `x-content-sha256`, `sunset` and `revision` as the contract states; the prototype has none of the five. — **if false** when the service is built: the contract is amended by an additive revision before spec 02 of this brief is planned; this spec's client and tests stand on the stub.

## Rationale

The prototype (2026-09-29, a copy of the reviewer retooled onto real `@json-render/react` and
Postgres) proved the contract's shape end to end: push, note, pull, reply, confirm, a confirmed
story going stale by hash, a picture round, and refusals. It also showed what a production
contract still lacked, and this spec closes the plugin's half of each gap: one contract file
(D3), one error shape (D7), incremental pulls (D11), limits and a checksum (D3, D10), a written
version rule (D8). Tokens per project and real sign-in are the service's; the contract only
says a token belongs to one project and names the two refusals.

JSON Schema's subset was chosen over a private grammar because the contract has two readers and
one of them may use any standard library. The plugin's reader is hand-rolled because this
repository ships no packages. It fails closed on an unknown keyword.

Three additions were not in the prototype and are this spec's own: the content hash that makes a
repeated push safe, the `hello` gate with `revision` and `sunset`, and the cursor. Each is
additive, each is cheap for the service, and A8 names the fallback. Rejected: a sixth "read a
round" call for resuming uploads (an upload is safe to repeat, so local flags are enough);
retrying on network errors (a retry hides an outage; only `429` with a short wait retries);
storing pull time in the files (git would show a change on every pull).

`state` is omitted, never `null` or `"default"`, on the wire: the story hash writes no `@state`
for a beat without one, and two spellings of nothing broke the prototype twice. Files on disk
may hold `state: null` because they are read by scripts, not hashed.

The script's only caller today is the doctor's config check. The wireframe command is wired in a
later spec of brief 29, once the service runs; the facade has its consumer in the series.
No `SHALL CONTINUE TO` pin: this spec adds surfaces and changes no existing behaviour.
Fragile and worth watching at build: the token-secrecy assertion must search every file under
the host, not only `round.json`; and the stub must be a child process.

## Canonical Delta

`docs/canonical/design.md` gains a section **The walkthrough client**: a project opts in with a
`walkthrough` block (`baseUrl`, `project`, `tokenEnv`) in its config, and a project without it
sends nothing; `spec-paths walkthrough` is the one script that talks to the service, with the
verbs `self-check`, `validate`, `check`, `hello`, `push`, `pull-notes`, `pull-approvals`,
`reply` and `mark`, and the exit codes 0 done or not configured, 1 refused, 2 usage or config,
3 no answer; the contract is `spec-paths walkthrough-contract` (seven calls, one error shape,
limits, the version rule) and the wireframe vocabulary is `spec-paths walkthrough-catalog`
(19 gray components, one action); both are plain JSON in a fixed subset of JSON Schema, read by
`lib/json-shape.js`; the plugin owns the round number; every answer is checked against the
contract before it is written; rounds, notes and approvals land under `design/rounds/<n>/`; the
token is read from the named environment variable and never written or printed.
