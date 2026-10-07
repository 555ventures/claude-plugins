---
date: 2026-10-07
status: done
tier: critical
area: prototype
breaking: false
depends_on: []
depended_on_by: [specs/20261007/02-the-prototype-opens-from-words-a-brief-or-a-stem.md, specs/20261007/03-plan-cites-the-build-replays-and-status-derives-the-delete.md]
brief: 28a
spiked: 2026-10-07
build_base: main
open_markers: 0
diff_base: 639ae05b66a9da56ec35c2ed30552aca22248c65
---

# Approve writes a behaviour contract

## Goal

On the user's `approve`, the prototype driver writes a **behaviour contract** and nothing else
leaves the worktree: every pin as a plain sentence, one picture of every declared route × state
made by a command the host owns, and one end-to-end test per behaviour pin that passed against
the prototype and now waits, red, for a production build. No gate runs on the prototype tree, no
kit is required, no data or API layer is exported, no spec is generated, and the worktree and
`proto/<stem>` stay until a later `--mark closed`. The driver hands the contract to `/spec:plan`
by printing the paste and queueing it. Done means: on a fixture host the contracted mark refuses
without behaviour pins or a picture, writes the pictures and `contract.json`, the tests-derived
mark refuses a test the runner does not list or that is red against the prototype, copies the
test file into the contract, queues the plan paste and records one ledger row; `--mark closed`
deletes the database, worktree and branch; `/git:merge` still refuses `proto/*` and names the
contract.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | **The one contract edit.** `spec/templates/grounding-contract.md` § Prototype is rewritten (text in Contracts): `url`, `overlay`, `e2eFile` (a path template carrying `{stem}`), `e2eList` (`{file}`, lists the tests in one file), `e2eRun` (`{file}`, runs the tests in one file; exit 0 = green; env `PROTO_URL` = the app address), `picture` (`{url}`, `{out}`, `{width}`, `{height}`: writes one PNG of the page at `{url}` to `{out}`), optional `dbCreate` / `dbDestroy`. `export`, `gate` and `storageState` are gone. This repository's `.claude/spec.config.json` is re-stamped with the new `contractHash` (`spec-paths contract-hash`). `[no-ac: contract prose and the stamp — the restamp pin in tests/consistency/contract-stamp.test.js is the oracle; D2's refusals are the behaviour]` | Brief 28a: no code leaves the prototype, so there is nothing to export and nothing to gate; a saved Playwright sign-in and a Playwright capture are tool names the plugin may not carry (specs/20261005/06 D2, core § Rule Enforcement) — the host's own `picture` command signs in however it likes. `{stem}` replaces `{brief}` because spec 02 lets a prototype start from words with no brief number. |
| D2 | **Config validation moves to the keys that are used.** `prototype-driver.js` no longer refuses on `prototype.export` at startup (the block alone admits). `check` (doctor check 23) findings become: `prototype.e2eFile` lacks `{stem}`; `prototype.e2eList` lacks `{file}`; `prototype.e2eRun` undeclared or lacks `{file}`; `prototype.picture` undeclared or lacks `{url}` or `{out}`. The `export`, overlay-in-export and `storageState` findings are deleted. `spec/commands/doctor.md` check 23's sentence lists the new findings. (AC-20261007-01-1) | A key that no step reads is not a finding; a key a mark will need is checked before the user reaches that mark. |
| D3 | **`lib/freeze.js` becomes `lib/contract.js`.** Exports: `routeSlug`, `pictureAll({ root, worktreePath, designDir, config, statesDoc, viewport, baseUrl, env })`, `writeContract(...)`, `copyContractTests({ root, branch, e2eFile, designDir })`, `runDbDestroy`, `removeProtoWorktreeAndBranch` (both verbatim from today), `ledgerRow(...)`. Deleted with the file: `compositeNames`, `gateCheck`, `captureAll`, `reserveSpec`, `nextFreeSpecNumber`, `todayStamp`, `exportHarden`, `exportTests`, `writeSpec`, `riskTierHits`, `braceExpand`. `spec/templates/prototype-spec.md` is deleted; `spec/entrypoints.json`'s `proto-capture.js` row drops `spec/scripts/lib/freeze.js` from its callers (the build driver stays until spec 03). `[no-ac: library — every function is reached by the driver ACs below]` | The verb "freeze" promised a gate and a snapshot of code; the new verb promises a contract. Keeping the two deletion helpers verbatim keeps the dirty-worktree and double-destroy guards that were paid for. |
| D4 | **`--mark contracted` replaces `--mark frozen`** (state `APPROVED` → `TESTS`), driver-executed in order, each refusal exit 2 naming its remedy with nothing later run: (1) `marks.approved` set; (2) at least one pin with `kind: "behaviour"` (`no behaviour pins — a prototype that changed no behaviour is the direct lane; mark a pin behaviour or close the prototype with --mark closed`); (3) `states.json` parses with at least one route and a valid `viewport` (today's check); (4) `prototype.picture` declared, else `prototype.picture is not declared — remedy: declare it (spec/templates/grounding-contract.md § Prototype), then run /spec:doctor`; (5) for every route × state, `pictureAll` runs `bash -c <picture>` with `{url}` = the resolved app address joined to the state's path, `{out}` = `design/prototypes/<stem>/captures/<slug>--<state>.png` (absolute), `{width}`/`{height}` from the viewport, cwd = the prototype worktree, env `PROTO_BRANCH`/`PROTO_WORKTREE`/`PROTO_BRIEF` as `dbCreate` gets; a non-zero exit is `prototype.picture failed for <route> (<state>) at <url> (exit <n>): <stderr>`; a missing, empty or non-PNG `{out}` (first eight bytes ≠ `89 50 4e 47 0d 0a 1a 0a`) is `prototype.picture wrote no PNG at <out> for <route> (<state>) — remedy: the command must write one PNG file to {out}`; (6) `contract.json` (Contracts, `schemaVersion: 2`) with every pin as a record and `tests: null`; (7) `marks.contracted`. No gate, no composites, no `gate.log`, no spec reservation, no AC ids. `--mark frozen` is unknown. (AC-20261007-01-2, AC-20261007-01-3) | Brief 28a scope 2: the design reference is a picture judged by eye; the kit-gates-green precondition and the structural capture are retired by JJ's 2026-10-07 ruling. The PNG signature check is the one thing the plugin can verify about a picture without naming a tool. |
| D5 | **The `TESTS` step** prints, per behaviour pin in pin order, `pin <id> · <screen> (<state>) · <anchor id | screen note> · "<note>"`, then `File: <worktree rel>/<e2eFile> (prototype worktree — commit it on proto/<stem>) · title: \`pin <id>: <note>\``, then `Session: start the dev server in the background (tracked): <PORT=<n> >bootCommand` and `Session: write one test per line above in the prototype worktree and commit the file on proto/<stem>; each test must pass against the prototype and fail against <base>`, then `Then: --mark tests-derived`. `<e2eFile>` is `prototype.e2eFile` with `{stem}` substituted. (AC-20261007-01-4) | The session acts on the printed step; the title grammar carries the pin id, never an AC id — the AC ids belong to the spec plan writes later (spec 03). |
| D6 | **`--mark tests-derived`** (state `TESTS` → `CONTRACTED`), in order, each refusal exit 2: (1) `marks.contracted` set; (2) the test file is committed on `proto/<stem>` — today's three refusals (`<e2eFile> is in the main working tree`, `is not committed on proto/<stem>`, `has uncommitted edits in <worktree>`), the harden branch clause deleted; (3) `git show proto/<stem>:<e2eFile>` contains `pin <id>:` for every behaviour pin, else `<e2eFile> does not carry pin <id>: — remedy: add a test whose title starts with pin <id>:`; (4) `prototype.e2eList` declared, run with `{file}` substituted, cwd = the worktree, exit 0 and stdout containing every `pin <id>:` (today's wording, `pin <id>:` in place of the AC id); (5) `prototype.e2eRun` declared, else `prototype.e2eRun is not declared — remedy: declare it (spec/templates/grounding-contract.md § Prototype)`; run with `{file}` substituted, cwd = the worktree, env `PROTO_URL` = the resolved app address, stdout+stderr to `design/prototypes/<stem>/e2e.log`; non-zero = `contract tests red against the prototype (e2eRun exited <n>) — a derived test must pass on the prototype it describes; see <log>`; (6) `copyContractTests` writes `git show proto/<stem>:<e2eFile>` to `design/prototypes/<stem>/tests/<basename of e2eFile>`; (7) `contract.json.tests` = `{ file, source, run, pins }` (Contracts); (8) the ledger row (D8) is appended once, guarded by `marks.testsDerived`; (9) once, guarded by `status.queued`: `spec-queue.js add "/spec:plan design/prototypes/<stem>/contract.json" --top` (cwd = root), its printed ref saved as `status.queued`; a non-zero exit is a refusal naming `spec-queue`; (10) `marks.testsDerived`. Nothing is exported, destroyed or deleted. A re-run after a partial failure resumes at the first undone step. (AC-20261007-01-5, AC-20261007-01-6) | A derived test that never passed anywhere proves nothing: green on the prototype and red on the base is what makes it a contract. The copy under `design/prototypes/<stem>/tests/` is how the test reaches the production build without the branch (spec 03 copies it into the build worktree). The queue is the pipeline's memory for the hand-off; the step also prints the paste. |
| D7 | **States and steps.** `deriveState`, in order: `marks.closed` → `CLOSED`; `marks.testsDerived` → `CONTRACTED`; `!marks.opened` or the worktree unregistered → `OPEN`; `!marks.approved` → `ROUND`; `!marks.contracted` → `APPROVED`; else `TESTS`. The `APPROVED` step is `## Step: write the behaviour contract` with `Read only: pins.json, states.json` and `Then: --mark contracted`. The `ROUND` reply line reads `Reply \`approve\` to write the contract; anything else is a change for this session to apply on proto/<stem>, then:`. The `CONTRACTED` step prints `[prototype-driver] state: CONTRACTED  prototype: <stem>`, `Read only: design/prototypes/<stem>/contract.json`, `Next: /spec:plan design/prototypes/<stem>/contract.json` and `Close (when every spec citing <stem> is done, or to abandon): node <driver> <arg> --root <root> --mark closed`. The `CLOSED` step prints `Read only: contract.json` and `Next:` = `spec-status --next` verbatim. `--mark closed` (D9) is accepted from `ROUND`, `APPROVED`, `TESTS` and `CONTRACTED`. (AC-20261007-01-6, AC-20261007-01-7, AC-20261007-01-8) | The worktree now outlives the contract, so `CONTRACTED` is a resting state a bare run can print for weeks; `OPEN`'s worktree probe must not shadow it. |
| D8 | **Ledger row** (numbers, paths, enums only): `{"ts","stage":"prototype","stem","brief":"NN"|"n/a","branch":"proto/<stem>","rounds":N,"pins":{"total":N,"behaviour":N,"look":N},"routes":N,"states":N,"captures":N,"contract":"design/prototypes/<stem>/contract.json","verdict":"contracted"}`, appended through `appendLedger`. `spec/scripts/fleet-reader.js`: `prototype` leaves `SPEC_STAGES` (a prototype row names no spec) and stays in `STAGES`. (AC-20261007-01-6, AC-20261007-01-9) | The spec is written by plan, later; the row points at the contract instead. |
| D9 | **`--mark closed`** — driver-executed: `runDbDestroy` (skipped once `marks.dbDestroyed`, recorded right after it runs), `removeProtoWorktreeAndBranch` (a dirty worktree is `commit or discard on proto/<stem>, then re-run --mark closed`), `marks.closed`, checkpoint `(<prev> → CLOSED)`. Nothing is exported first; the contract directory on main is untouched. (AC-20261007-01-8) | Brief 28a Result: the worktree and branch are deleted when the last citing spec is done (spec 03 derives and runs this mark), or by hand to abandon — never at approve. |
| D10 | **`/git:merge` Step 1.** The `proto/*` refusal's text becomes `outcome: {anchor:'🚫', text:'<source> is a prototype branch — it is never merged; its behaviour contract (design/prototypes/<stem>/contract.json) lands through a spec'}`, `next: {kind:'command', text:'/spec:plan design/prototypes/<stem>/contract.json'}`; the `harden/*` refusal, its report example and the `**Prototype/harden refusal**` heading's harden half are deleted. Bump the git plugin. `[no-ac: command prose — plugin-bump.js --check is the oracle for the bump]` | Brief 28a scope 2: `/git:merge` keeps refusing `proto/*` and names the contract, not a harden branch. |
| D11 | **Doctrine follows the driver.** `spec/commands/prototype.md`: frontmatter `description` rewritten (no freeze, no export, no deletion at approve); § APPROVED, § TESTS, § CLOSED rewritten as § APPROVED, § TESTS, § CONTRACTED, § CLOSED per D4–D9 (the storageState and `--tier` sentences deleted); the Rules bullet reads `…lives under design/prototypes/<stem>/ on the main working tree, committed there directly (never through a build worker) — nothing on proto/<stem> is read by any later stage`; read-load stays under the flat cap. `spec/doctrine/design.md` § Design Canon, the prototype paragraph: `**A prototype is a branch of the product, not a second artifact.** \`/spec:prototype\` runs a functional prototype on \`proto/<stem>\`, a reference and never a source: nothing on it is read by plan, build or review. Its rounds, pins, declared states and, after approve, its behaviour contract — pins as sentences, one picture per route × state, one end-to-end test per behaviour pin — live under \`design/prototypes/<stem>/\` in the main working tree; the worktree and branch stay until the last spec citing the stem is done (specs/20261007/01-approve-writes-a-behaviour-contract.md D4/D6/D9, ADR-0035).` (≤ 160 lines, AC-20260926-01-8 literals kept). `[no-ac: prose — read-load, citations-check and the design.md line pin are the oracles]` | One binding home per rule. |
| D12 | Bump via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"`; the paragraph says the contract hash changed and hosts owe a `/spec:doctor` re-stamp. `[no-ac: bump — plugin-bump.js --check is the oracle]` | Version discipline; pipeline rules § Planning. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/contract.js | CREATE | scripts | D3 — `routeSlug`, `pictureAll`, `writeContract`, `copyContractTests`, `runDbDestroy`, `removeProtoWorktreeAndBranch`, `ledgerRow`; header per pipeline rules § Worker Rules |
| spec/scripts/lib/freeze.js | DELETE | scripts | D3 — retired with its gate, capture, export, spec-write and tier functions |
| spec/scripts/prototype-driver.js | MODIFY | scripts | D2 startup + `check`; D4 `contracted`; D5 TESTS print; D6 `tests-derived`; D7 states/steps; D8 row; D9 `closed`; `require('./lib/contract')`; header, usage and exit-code list rewritten |
| spec/scripts/fleet-reader.js | MODIFY | scripts | D8 — `prototype` leaves `SPEC_STAGES` |
| spec/templates/grounding-contract.md | MODIFY | doctrine | D1 — § Prototype rewritten (the one contract edit) |
| spec/templates/prototype-spec.md | DELETE | doctrine | D3 — no generated spec |
| spec/commands/prototype.md | MODIFY | doctrine | D11 — description, § ROUND reply line, § APPROVED/TESTS/CONTRACTED/CLOSED, Rules |
| spec/commands/doctor.md | MODIFY | doctrine | D2 — check 23's sentence |
| spec/doctrine/design.md | MODIFY | doctrine | D11 — the prototype paragraph |
| git/commands/merge.md | MODIFY | doctrine | D10 — Step 1 `proto/*` text; `harden/*` refusal, heading half and example deleted |
| spec/entrypoints.json | MODIFY | other | D3 — `proto-capture.js` row loses the `lib/freeze.js` caller |
| .claude/spec.config.json | MODIFY | other | D1 — `contractHash` re-stamped (`spec-paths contract-hash`) |
| spec/.claude-plugin/plugin.json | MODIFY | other | D12 — `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` |
| git/.claude-plugin/plugin.json | MODIFY | other | D10 — `node scripts/plugin-bump.js --bump --plugin git --changelog "<paragraph>"` |
| tests/prototype/contract.test.js | CREATE | tests | AC-20261007-01-2, AC-20261007-01-3, AC-20261007-01-4, AC-20261007-01-5, AC-20261007-01-6, AC-20261007-01-7, AC-20261007-01-8 |
| tests/prototype/prototype-driver.test.js | MODIFY | tests | AC-20261007-01-1 (the `export` refusal case becomes the admit case; the `check` cases); the `## Step: freeze` / `--mark frozen` / `Reply approve to freeze` pins rewritten in place to D7's text |
| tests/prototype/ledger-stage.test.js | MODIFY | tests | AC-20261007-01-9 |
| tests/prototype/capture-sign-in.test.js | MODIFY | tests | the two `prototype-driver check` storageState cases (AC-20261001-01-7, AC-20261001-01-8) deleted; the six proto-capture.js cases stay until spec 03 |
| tests/prototype/freeze.test.js | DELETE | tests | its subjects (gate, capture, reservation, export, generated spec, deletion at freeze) are retired |
| tests/prototype/freeze-tier.test.js | DELETE | tests | its subject (the generated spec's tier) is retired |
| tests/prototype/fixture.js | MODIFY | tests | `contract.tests.source` in place of `contract.e2eFile`; helpers for the picture and e2eRun stubs' switches |
| tests/fixtures/prototype/host/ | MODIFY | tests | config: `export`/`gate` removed, `e2eFile` = `e2e/proto-{stem}.spec.ts`, `e2eRun` = `node run-tests.js {file}`, `picture` = `node picture-stub.js {url} {out} {width} {height}`; `picture-stub.js` writes a 1×1 PNG to `{out}` (exit 2 for the state named in `PICTURE_RED`, a zero-byte file when `PICTURE_EMPTY=1`); `run-tests.js` exits 1 when `E2E_RED=1`, else 0, and writes `process.env.PROTO_URL` to `e2e-env.txt` beside the log; `list-tests.js` prints `pin <id>:` titles; `capture-stub.js`, `gate.js` and `docs/design/approval.json` deleted |

Note (outside the table): `tests/consistency/entrypoints.test.js`, `read-load.test.js` and
`contract-stamp.test.js` are not edited — the rows above satisfy them. The done specs whose
criteria lose their only citing test get `[retired: specs/20261007/01-approve-writes-a-behaviour-contract.md]`
on each such pointer line in the same batch (derive the set as the AC-IDs cited under `tests/`
at the base minus those cited after; at lock the known set is `AC-20260928-02-4` … `-11`,
`AC-20261001-01-7`, `-8`, `-9` … `-16`, `-18`, `-20`, `-21`, `AC-20261005-05-5`). The
`spec-paths` key, the `shared-for prototype` arm and `tests/spec-paths.test.js` are untouched.

## Contracts

The `prototype` config block (D1), the grounding-contract § Prototype row, rendered on a host:

```jsonc
"prototype": {
  "url": "http://localhost:{port}",                      // base URL the dev server answers on; {port} = the driver's app port
  "overlay": "src/proto-overlay.js",                     // worktree-relative; the dev entry imports it behind its dev flag
  "e2eFile": "e2e/proto-{stem}.spec.ts",                 // {stem} = the prototype stem; must match the host runner's own file pattern
  "e2eList": "pnpm exec playwright test --list {file}",  // exits 0 and prints the test titles in {file}
  "e2eRun": "pnpm exec playwright test {file}",          // exits 0 when every test in {file} passes; PROTO_URL carries the app address
  "picture": "node scripts/picture.js {url} {out} {width} {height}", // writes one PNG of the page at {url} to {out}
  "dbCreate": "node scripts/worktree-db.ts create",      // optional; cwd = worktree; PROTO_BRANCH/PROTO_WORKTREE/PROTO_BRIEF in env
  "dbDestroy": "node scripts/worktree-db.ts drop"        // optional; same cwd and env
}
```

§ Prototype text (D1), replacing lines 130–145 whole:

> `prototype` — the grounding `/spec:prototype` runs a throwaway branch against
> (specs/20261007/01-approve-writes-a-behaviour-contract.md D1): `url` (the dev server's base
> URL, carrying `{port}` — the driver prints the port to boot on), `overlay` (the
> worktree-relative file the driver writes the pin overlay to; the host's dev entry imports it
> behind its own dev flag), `e2eFile` (a path template carrying `{stem}`, where the contract's
> derived tests are written in the prototype worktree), `e2eList` (a shell string carrying
> `{file}` that lists the tests in one file and exits 0), `e2eRun` (a shell string carrying
> `{file}` that runs the tests in one file and exits 0 only when every test passes; it runs with
> `PROTO_URL` in its environment, the address of the app under test), `picture` (a shell string
> carrying `{url}`, `{out}`, `{width}` and `{height}` that writes one PNG of the page at `{url}`
> to `{out}`, however this stack makes a picture of a screen — signing in is its own business; run
> with cwd = the prototype worktree), optional `dbCreate` / `dbDestroy` (shell strings run with
> cwd = the prototype worktree and env `PROTO_BRANCH`, `PROTO_WORKTREE`, `PROTO_BRIEF`). Absent
> block = the host has never declared a prototype path — the driver refuses naming this block
> and `/spec:doctor`.

`design/prototypes/<stem>/contract.json` (D4 at `contracted`, D6 completes `tests`):

```json
{ "schemaVersion": 2, "stem": "28-functional-prototype", "brief": "28", "idea": null,
  "approvedAt": "2026-10-07T10:00:00.000Z", "base": "main",
  "viewport": { "width": 1280, "height": 800 },
  "routes": { "/women":     { "default": { "url": "/women",             "capture": "captures/women--default.png" },
                             "empty":   { "url": "/women?proto=empty", "capture": "captures/women--empty.png" } },
              "/women/new": { "default": { "url": "/women/new",         "capture": "captures/women_new--default.png" },
                             "error":   { "url": "/women/new?proto=error", "capture": "captures/women_new--error.png" } } },
  "pins": [
    { "id": "p1", "kind": "behaviour", "screen": "/women", "state": "default",
      "anchor": "WomanRow[w_01]<WomenList<WomenScreen#0", "note": "保存すると行が緑になる", "round": 1 },
    { "id": "p2", "kind": "look", "screen": "/women", "state": "empty", "anchor": null, "note": "空のときは案内文だけ", "round": 1 },
    { "id": "p3", "kind": "behaviour", "screen": "/women/new", "state": "error", "anchor": null, "note": "空欄で保存すると赤い注意", "round": 2 } ],
  "tests": { "file": "tests/proto-28-functional-prototype.spec.ts",
             "source": "e2e/proto-28-functional-prototype.spec.ts",
             "run": "pnpm exec playwright test {file}",
             "pins": ["p1", "p3"] } }
```

`idea` is `status.idea` when present (spec 02 writes it for a prototype started from words), else
`null`; `brief` is `status.brief` (`"n/a"` once spec 02 lands a words prototype). `anchor` is the
pin's anchor id or `null` for a screen note. `tests` is `null` until `tests-derived`.

The `TESTS` step (D5), rendered:

```
[prototype-driver] state: TESTS  brief: docs/roadmap/28-functional-prototype.md
## Step: derive one end-to-end test per behaviour pin
Read only: design/prototypes/28-functional-prototype/contract.json, design/prototypes/28-functional-prototype/pins.json
pin p1 · /women (default) · WomanRow[w_01]<WomenList<WomenScreen#0 · "保存すると行が緑になる"
pin p3 · /women/new (error) · screen note · "空欄で保存すると赤い注意"
File: .claude/worktrees/proto-28-functional-prototype/e2e/proto-28-functional-prototype.spec.ts (prototype worktree — commit it on proto/28-functional-prototype) · title: `pin <id>: <note>`
Session: start the dev server in the background (tracked): PORT=4713 pnpm dev
Session: write one test per line above in the prototype worktree and commit the file on proto/28-functional-prototype; each test must pass against the prototype and fail against main
Then:
  node <driver> docs/roadmap/28-functional-prototype.md --mark tests-derived
```

The `CONTRACTED` step (D7), rendered:

```
[prototype-driver] state: CONTRACTED  prototype: 28-functional-prototype
Read only: design/prototypes/28-functional-prototype/contract.json
Next: /spec:plan design/prototypes/28-functional-prototype/contract.json
Close (when every spec citing 28-functional-prototype is done, or to abandon): node <driver> docs/roadmap/28-functional-prototype.md --root <root> --mark closed
```

The ledger row (D8):

```json
{"ts":"2026-10-07T10:05:00.000Z","stage":"prototype","stem":"28-functional-prototype","brief":"28","branch":"proto/28-functional-prototype","rounds":2,"pins":{"total":3,"behaviour":2,"look":1},"routes":2,"states":4,"captures":4,"contract":"design/prototypes/28-functional-prototype/contract.json","verdict":"contracted"}
```

`/git:merge` refusal (D10):

```report
🚫 **proto/28-functional-prototype is a prototype branch — it is never merged; its behaviour contract (design/prototypes/28-functional-prototype/contract.json) lands through a spec**
Next: /spec:plan design/prototypes/28-functional-prototype/contract.json
```

## Behavior

`approve` → the session marks `contracted`; the driver pictures every declared route × state
through the host's own `picture` command and writes `contract.json`. The session boots the dev
server, writes one test per behaviour pin in the prototype worktree (title `pin <id>: <note>`),
commits it on `proto/<stem>` and marks `tests-derived`; the driver verifies the runner lists
every pin's test, runs them against the prototype (green, or the mark refuses), copies the file
into `design/prototypes/<stem>/tests/`, completes the contract, appends the ledger row, queues the
plan paste at the top of the session queue and prints `CONTRACTED` with the paste. The session
commits `design/prototypes/<stem>/` on main (direct lane). The worktree, branch and database stay
until `--mark closed` — run by the review driver when the last citing spec closes (spec 03), or by
hand to abandon the idea.

The two replies the least-technical actor types: `approve` at the ROUND stop (success sentence =
the `✅ checkpoint … (ROUND → APPROVED)` line; path back = any other reply is a change to apply,
then `--mark round-done`; farthest artifact = `contract.json` and the pictures, dated files on
main a later `--mark closed` never touches) and the `--mark closed` paste on the CONTRACTED step
(success = `(CONTRACTED → CLOSED)`; path back = none — the branch is gone, the contract stays;
farthest artifact = the deleted worktree, branch and database). Both are rendered by
`prototype-driver.js` and typed into the terminal; no page posts them.

## Acceptance Criteria

- **AC-20261007-01-1**: WHEN the bare run executes on the fixture host whose `prototype` block carries no `export` key and no `gate` key THE SYSTEM SHALL exit 0 and print `state: OPEN` (no stderr line names `prototype.export`); WHEN `check --json` runs on that host THE SYSTEM SHALL exit 0 with `{ "findings": [] }`; WHEN `e2eFile` is `e2e/proto-28.spec.ts` THE SYSTEM SHALL exit 1 with one finding whose `key` is `prototype.e2eFile` and whose message names `{stem}`; WHEN `e2eRun` is absent THE SYSTEM SHALL exit 1 naming `prototype.e2eRun`; WHEN `picture` is `node x.js {out}` THE SYSTEM SHALL exit 1 naming `prototype.picture` and `{url}`; WHEN the config carries `storageState: "e2e/.auth/user.json"` with that file tracked by git THE SYSTEM SHALL exit 0 with no finding → rewrites tests/prototype/prototype-driver.test.js :: AC-20260928-01-1: the driver exits 2 naming prototype.export
- **AC-20261007-01-2**: WHEN `--mark contracted` runs on the fixture host (approved, `states.json` = `/women` with `default`+`empty` and `/women/new` with `default`+`error`, three pins of which `p1` and `p3` are `behaviour`) THE SYSTEM SHALL exit 0, print `(APPROVED → TESTS)`, write four PNG files `captures/women--default.png`, `captures/women--empty.png`, `captures/women_new--default.png`, `captures/women_new--error.png` each starting with the bytes `89 50 4e 47 0d 0a 1a 0a`, write `contract.json` with `schemaVersion: 2`, `routes["/women"].empty.capture` = `captures/women--empty.png`, `pins` = three records in pin order where `pins[0]` is `{ id: "p1", kind: "behaviour", screen: "/women", state: "default", anchor: "WomanRow[w_01]<WomenList<WomenScreen#0", note: "保存すると行が緑になる", round: 1 }` and `pins[1].anchor` is `null`, `tests: null`, no `spec`, `ids`, `composites` or `frozenAt` key, write no `gate.log` and create no file under `specs/`; the picture stub's recorded argv for `/women` `empty` SHALL be `http://127.0.0.1:<appPort>/women?proto=empty <abs captures/women--empty.png> 1280 800` with cwd = the prototype worktree; `--mark frozen` SHALL exit 2 containing `--mark frozen is unknown` → writes tests/prototype/contract.test.js
- **AC-20261007-01-3**: WHEN `--mark contracted` runs before `approved` THE SYSTEM SHALL exit 2 naming `approved`; WHEN `pins.json` holds only `look` pins THE SYSTEM SHALL exit 2 with stderr containing `no behaviour pins` and `--mark closed` and write no `contract.json`; WHEN `prototype.picture` is undeclared THE SYSTEM SHALL exit 2 naming `prototype.picture` and write no PNG; WHEN the picture stub exits 2 for `/women` `empty` (`PICTURE_RED=women--empty`) THE SYSTEM SHALL exit 2 with stderr containing `prototype.picture failed for /women (empty) at http://127.0.0.1:<appPort>/women?proto=empty (exit 2)` and write no `contract.json`; WHEN the stub writes a zero-byte file (`PICTURE_EMPTY=1`) THE SYSTEM SHALL exit 2 containing `wrote no PNG at` and the file path → writes tests/prototype/contract.test.js
- **AC-20261007-01-4**: WHEN the bare run prints `TESTS` on the fixture host THE SYSTEM SHALL print, in order, `pin p1 · /women (default) · WomanRow[w_01]<WomenList<WomenScreen#0 · "保存すると行が緑になる"` and `pin p3 · /women/new (error) · screen note · "空欄で保存すると赤い注意"`, a `File:` line containing `.claude/worktrees/proto-28-functional-prototype/e2e/proto-28-functional-prototype.spec.ts` and `` title: `pin <id>: <note>` ``, a `Session:` line containing the host's `runtime.bootCommand`, a `Session:` line containing `must pass against the prototype and fail against main`, and `--mark tests-derived`; no line SHALL contain `AC-` or `--tier` → writes tests/prototype/contract.test.js
- **AC-20261007-01-5**: WHEN `--mark tests-derived` runs with no test file on `proto/<stem>` THE SYSTEM SHALL exit 2 naming `e2e/proto-28-functional-prototype.spec.ts` and `proto/28-functional-prototype`; WHEN a copy sits in the main working tree THE SYSTEM SHALL exit 2 containing `is in the main working tree`; WHEN the committed file carries only `pin p1:` THE SYSTEM SHALL exit 2 containing `does not carry pin p3:`; WHEN the file carries both but the list stub prints only `pin p1:` THE SYSTEM SHALL exit 2 containing `e2eList` and `pin p3:`; WHEN both are listed and `E2E_RED=1` THE SYSTEM SHALL exit 2 containing `contract tests red against the prototype (e2eRun exited 1)`, write `design/prototypes/28-functional-prototype/e2e.log`, write no file under `design/prototypes/28-functional-prototype/tests/`, append no ledger row and leave `contract.json.tests` `null`; WHEN `prototype.e2eRun` is undeclared THE SYSTEM SHALL exit 2 naming `prototype.e2eRun` → writes tests/prototype/contract.test.js
- **AC-20261007-01-6**: WHEN `--mark tests-derived` runs with both titles listed and the run stub green THE SYSTEM SHALL exit 0, print `(TESTS → CONTRACTED)`, write `design/prototypes/28-functional-prototype/tests/proto-28-functional-prototype.spec.ts` byte-equal to `git show proto/28-functional-prototype:e2e/proto-28-functional-prototype.spec.ts`, set `contract.json.tests` to `{ file: "tests/proto-28-functional-prototype.spec.ts", source: "e2e/proto-28-functional-prototype.spec.ts", run: "node run-tests.js {file}", pins: ["p1","p3"] }`, have run the stub with `PROTO_URL` = `http://127.0.0.1:<appPort>` (the fixture's `e2e-env.txt`), leave the prototype worktree registered and `proto/28-functional-prototype` existing, create no `harden/` branch, append exactly one `.claude/spec-runs.jsonl` row with `stage: "prototype"`, `stem: "28-functional-prototype"`, `brief: "28"`, `rounds: 1`, `pins: { total: 3, behaviour: 2, look: 1 }`, `routes: 2`, `states: 4`, `captures: 4`, `contract: "design/prototypes/28-functional-prototype/contract.json"`, `verdict: "contracted"` and no `spec`, `exported` or `harden` key, and `spec-queue.js list` SHALL show one item whose text is `/spec:plan design/prototypes/28-functional-prototype/contract.json` at position 1; `--state` SHALL print `CONTRACTED`; a second `--mark tests-derived` SHALL exit 0 and leave one ledger row and one queue item → writes tests/prototype/contract.test.js
- **AC-20261007-01-7**: WHEN the bare run executes in state `CONTRACTED` THE SYSTEM SHALL print `state: CONTRACTED`, `Read only: design/prototypes/28-functional-prototype/contract.json`, `Next: /spec:plan design/prototypes/28-functional-prototype/contract.json` and a `Close (` line containing `--mark closed`; WHEN the prototype worktree is removed by hand in that state THE SYSTEM SHALL still print `state: CONTRACTED` → writes tests/prototype/contract.test.js
- **AC-20261007-01-8**: WHEN `--mark closed` runs in state `CONTRACTED` THE SYSTEM SHALL exit 0, print `(CONTRACTED → CLOSED)`, have run `dbDestroy` once (the fixture's `db-dropped` marker exists), leave `git worktree list --porcelain` without the prototype worktree and `git branch --list 'proto/*'` empty, leave `design/prototypes/28-functional-prototype/contract.json` and `captures/` in place, and `--state` SHALL print `CLOSED`; WHEN the worktree is dirty at that step THE SYSTEM SHALL exit 2 containing `commit or discard on proto/28-functional-prototype` and a re-run after cleaning SHALL exit 0 without running `dbDestroy` a second time; WHEN `--mark closed` runs in state `ROUND` THE SYSTEM SHALL exit 0 and print `(ROUND → CLOSED)`; the `CLOSED` bare run SHALL print `Next:` → writes tests/prototype/contract.test.js
- **AC-20261007-01-9**: WHEN `fleet-reader.js --json` reads a ledger holding `{"ts":"…","stage":"prototype","stem":"x","brief":"n/a","contract":"design/prototypes/x/contract.json","verdict":"contracted"}` THE SYSTEM SHALL list that row under neither `stage-unknown` nor `missing-spec` → rewrites tests/prototype/ledger-stage.test.js :: AC-20260928-01-11: a prototype-stage row with

## Assumptions (escalation triggers)

- A1 (executed 2026-10-07): `node -e` prints the PNG signature as `89504e470d0a1a0a`; the fixture stub writes a 1×1 PNG from those bytes plus a fixed IHDR/IDAT/IEND payload, so the signature check is the only property the driver verifies. — **if false** (a host's picture command writes another format): the refusal names the format expected; never widen to "any file".
- A2 (executed 2026-10-07): `spec-queue.js add <payload…> [--top | --at <n>]` is the usage line; a free-text payload is accepted and `--top` places it first. — **if false:** the driver prints the paste only and records `status.queued = null`; record the deviation.
- A3 (executed 2026-10-07, specs/20260928/02 A2 and A3 re-read): `git worktree remove` refuses a dirty worktree and `git branch -D` removes an unmerged branch; `removeProtoWorktreeAndBranch` moves verbatim. — **if false:** STOP, ask the user.
- A4: `tests/consistency/read-load.test.js`'s flat cap (500) holds for `prototype.md` after D11 (measured at lock: 131 own + 150 shared ≈ 282). — **if false:** cut sentences, never the arm.
- A5: no test outside this File Plan asserts `lane: behaviour`, `harden/`, `--mark frozen`, `tests-derived`'s export behaviour, `verdict: "frozen"`, or `SPEC_STAGES` containing `prototype` (lock grep: `tests/build/build-driver-lane.test.js`, `tests/build/build-driver.fixtures.js` and `tests/review/harden-branch-cleanup.test.js` spell `harden/` and `lane: behaviour` against the build and review drivers, which this spec does not edit — they stay green and are deleted by spec 03; `tests/fleet-reader/queries.test.js:160` asserts only that `prototype` is a known stage). — **if false:** the hit is a fix row here, never a weakened pin.
- A6: the done specs whose criteria lose their last citing test are exactly the set the File Plan note lists (a lock-time grep, priced as a prediction); `ac-drift-clean.test.js` reddens only for CONTINUE-TO pins and none of the deleted files carries one. — **if false:** tag the extra hit `[retired: …]` in the same batch; never invent a covering test.
- A7: `salon-os` and every other host carries no `prototype` block today (checked 2026-10-07), so no live host loses a declared `export`, `gate` or `storageState` value; the re-stamp is the only host-side cost. — **if false:** the doctor's drift report names the stale key; the host removes it.

## Rationale

The freeze was built as a gate plus a snapshot of code: kit gates green, a structural capture
keyed by composite instance, an export of the data and API layer to `harden/<stem>`, a generated
spec, and deletion. JJ's 2026-10-07 rulings reverse each half: no code leaves the prototype (the
export, the sub-plan, the generated spec and its tier go), design is judged by eye (the structural
capture, the composite requirement and the kit gate go — a picture needs no kit), and the
worktree lives until the specs that read the contract are done (deletion moves to `--mark closed`).
What stays is what carries behaviour: the pins, now as records in the contract rather than as
anchors for a diff; a picture per declared state, made by a command the host owns because the
plugin may name no browser (specs/20261005/06 D2 settled that on 2026-10-05, after the capture
shipped); and one test per behaviour pin. The test is verified twice where it used to be verified
once — listed by the runner, and now also run against the prototype — because a contract test that
never passed anywhere is a wish, not a contract; red against the base is checked where it always
was, by the build's red-check once spec 03 copies the file in. The title carries the pin id, not an
AC id, because the AC ids belong to a spec that does not exist yet; spec 03's plan writes one AC per
pin and the build driver maps them. Rejected: reusing the `pictures` block (its wanted list is
story names rendered by a showcase, not routes of a running app, and its folder is cleaned on
every run); keeping `storageState` as a sign-in the plugin loads (a Playwright file format named in
the contract — the host's picture command and test runner sign in themselves); reserving spec
numbers at approve (plan may amend a brief or mint a series, so the number is plan's). Between
this spec and spec 03 the build driver still carries `HARDEN_MERGE` and `CAPTURE` for a
`lane: behaviour` spec that nothing can produce any more, and still refuses a brief's spec while
`proto/<NN>-*` exists — dead code and a refusal that cannot bite, both deleted by spec 03 in the
same series. No `SHALL CONTINUE TO` pin: every surviving behaviour (the pin endpoint, the round
loop, `check`'s remaining findings) keeps its own citing test, and this spec's own tests expire at
close as its ACs describe new behaviour.

Collision closure (2026-10-07, literals `harden`, `freeze`, `frozen`, `tests-derived`, `storageState`, `prototype.export`, `gate.log`): every hit outside the File Plan is a prose mention in `docs/adr`, `docs/roadmap`, `docs/canonical` (rewritten by the Canonical Delta) or a plugin changelog, a sibling test of the build or review driver that this spec does not change (`tests/build/build-driver-lane.test.js`, `tests/review/harden-branch-cleanup.test.js`, `tests/prototype/capture-port.test.js`), or an unrelated meaning (`gate.log` in genesis) — waived; the `executes` hits on `fleet-reader.js` are suites that never assert `SPEC_STAGES`.

Build deviations (folded at close, 2026-10-07; one-offs, none recurring-shaped — Gotchas at cap):
- Fixture host: `export` dropped, so the unchanged `AC-20260928-01-3`…`-6` and cross-worktree
  cases were red on the pre-image until D2 landed (verified green with `export` re-added); `url`
  became `http://127.0.0.1:{port}` so the driver allocates `appPort`; `gateCommand` became `true`
  (its only target `gate.js` is deleted). `authorDerivedTests(dir, opts)` writes the test file
  directly because `contract.tests` is null until `tests-derived`. Stub side channels:
  `picture-calls.jsonl` at the host root, `e2e-env.txt` beside the log.
- `setupHost` commits a `.gitignore` for `db-created` and `src/proto-*.js` (a glob, because a
  literal `proto-overlay.js` line made `.gitignore` count as an overlay importer) so
  `--mark closed` can remove the worktree. A real host has no such ignore and gets the
  dirty-worktree refusal once per close — queued as a follow-up.
- `removeProtoWorktreeAndBranch` gained an optional `rerun` argument for D9's `then re-run
  --mark closed` text; `tests-derived` records `status.ledgered` right after the append so a crash
  before `marks.testsDerived` cannot duplicate the row; `check --json` prints `{"findings":[]}` on
  a clean host (AC-1).
- The doctrine worker ran `git rm` on the File Plan's own DELETE row (worker git ban breach,
  effect limited to staging that deletion). The orchestrator applied the four `other` rows
  directly and tagged 22 done-spec criteria `[retired: …]`, matching the lock-time set exactly.
- Review: one hard finding fixed (a `copyContractTests` refusal without a remedy clause); one soft
  advisory left (a fixture comment in `destroy-db.js` cites the deleted `freeze.test.js`).

## Canonical Delta

`docs/canonical/design.md` § Prototypes is rewritten whole: `/spec:prototype` runs a functional
prototype on `proto/<stem>` in `.claude/worktrees/proto-<stem>`; the host declares `prototype`
(`url`, `overlay`, `e2eFile` with `{stem}`, `e2eList`, `e2eRun`, `picture`, optional
`dbCreate`/`dbDestroy`); rounds, pins and declared states live under `design/prototypes/<stem>/`
on main; a pin is one record with an optional anchor; the pin endpoint runs only during a round.
On approve the driver writes the behaviour contract: one picture per route × state through the
host's `picture` command, `contract.json` (every pin as a record), then — after the session writes
one test per behaviour pin in the worktree, listed by `e2eList` and green under `e2eRun` against
the prototype — the test file copied into `design/prototypes/<stem>/tests/`, one `stage: prototype`
ledger row and the `/spec:plan <contract>` paste queued at the top. No gate runs on the prototype
tree, nothing is exported, no spec is generated; the worktree and branch stay until `--mark closed`
(run by the review driver when the last citing spec closes, or by hand to abandon). `/git:merge`
refuses `proto/*` and names the contract. The `{port}` paragraph stays as it is.
