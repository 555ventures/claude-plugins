---
date: 2026-09-28
status: done
build_base: design-retool
tier: critical
area: prototype
breaking: false
depends_on: [specs/20260928/01-the-prototype-command-and-the-pin-overlay.md]
depended_on_by: [specs/20260928/03-the-build-reads-the-freeze.md]
brief: 28
spiked: 2026-09-28
open_markers: 0
diff_base: 5b344310222a6089c2f6af513ea0c46852e6b802
---

# Freeze, export and the contract

## Goal

On the user's approval the prototype driver freezes: it refuses unless the host's kit gates are
green on the prototype tree, captures every declared route and state as a structural record
keyed by kit-composite instance, writes the contract (routes, states, ids, the pins that become
tests), has the session derive one end-to-end test per behaviour pin into the host's e2e file on
main, exports the data and API layer to `harden/<stem>` before anything is deleted, writes the
behaviour-lane spec the build will run from, then deletes the worktree and `proto/<stem>` and
records one ledger row. Done means: on a fixture host the freeze refuses on a red gate, refuses
without a fixture per declared state, writes captures and a contract with the documented shape,
refuses the tests mark until every behaviour pin's test is listed by the host's runner, creates
`harden/<stem>` holding exactly the export globs' diff, writes a spec that passes the plan-time
lints, and leaves no `proto/<stem>` behind.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `spec/scripts/proto-capture.js` — spawned by the prototype driver (and by spec 03's build driver), never imported. `--host <hostRoot> --url <u> --out <file> --composites <csv> [--viewport WxH] [--root <selector>]` loads `@playwright/test` through `createRequire(<hostRoot>/package.json)`, opens Chromium at the viewport (default 1280×800, DPR 1, `reducedMotion: reduce`), waits for `load`, injects animation-off CSS, awaits `document.fonts.ready` + 150 ms, injects `spec/templates/proto-stable-id.js` and `spec/templates/proto-capture-page.js` through `page.addScriptTag`, and writes the capture (Contracts): one entry per visible element whose owner chain (spec 01 D6) contains a composite name, with `id`, `tag`, `box` (integer-rounded), `text` (collapsed, ≤ 80 chars) and the 27 longhand computed properties the 2026-09-23 spike recorded. Exit `0` written; `2` on: `@playwright/test` unresolvable from the host (names it), URL unreachable, no element with a fiber (`no fibers — the dev server must run a development build`), zero composite elements (`no composite on <url> — screens import composites only`). `--diff <baseline> <current>` compares two captures by `id`: entries `{ id, kind: missing \| extra \| changed, field?, before?, after? }`, printed as JSON with a `summary` count, exit `0` when empty, `1` otherwise. (AC-20260928-02-1, AC-20260928-02-2, AC-20260928-02-3) | The contract is composite instances, not the DOM: a from-scratch rebuild reproduces the same kit composites in the same order, never the same wrappers, so screen-level elements are deliberately not recorded. The browser-side walk lives in one injected module so the overlay, the capture and the tests share it. |
| D2 | `spec/scripts/lib/freeze.js` — the freeze's steps as exported functions the driver calls: `gateCheck(root, worktree, config)`, `compositeNames(root, config)` (keys of `docs/design/approval.json`'s `composites` when the file exists, else PascalCase basenames of the files directly under `design.kit`; empty = refusal `no composites declared — the kit must exist before a prototype (brief 30)`), `captureAll(...)`, `writeContract(...)`, `reserveSpec(root, brief)`, `exportHarden(...)`, `writeSpec(...)`, `deleteProto(...)`, `ledgerRow(...)`. Pure where possible; effects through `runChild`. [no-ac: library — every function is reached by the driver ACs below] | Keeps the driver's marks readable; the library is not an entry point. |
| D3 | `--mark frozen` (state `APPROVED` → `TESTS`), driver-executed in order, each refusal exit 2 with the remedy and nothing later run: (1) `marks.approved` set; (2) `compositeNames` non-empty; (3) at least one pin with `kind: "behaviour"` (`no behaviour pins — a prototype that changed no behaviour is the direct lane; mark a pin behaviour or close the prototype by hand`); (4) the gate: `prototype.gate` when declared, else the host `gateCommand`; a `gateCommand` carrying `{testDirs}` or `{scopeDirs}` with no `prototype.gate` is refused naming `prototype.gate`; the command runs with cwd = the worktree, output to `design/prototypes/<stem>/gate.log`, non-zero = `kit gates red on proto/<stem> — see <log>`; (5) `prototype.url` probed with `curl -sf -m 3`; (6) for every route × state in `states.json`, `proto-capture.js` writes `design/prototypes/<stem>/captures/<route slug>--<state>.json` (slug: `/` → `_`, leading `_` dropped, `/` root → `root`); a capture exit 2 is the refusal, verbatim; (7) `contract.json` (Contracts) with `ids` = the union of captured ids, `pins.test` = behaviour pin ids, `pins.look` = the rest; (8) `reserveSpec`: `specs/<today>/<NN>-<brief name>.md` with NN the next free two-digit number in that directory (`spec-number-check` is the reference), and one AC id `AC-<today>-<NN>-<k>` per behaviour pin in pin order, written to `contract.json.tests`; (9) `marks.frozen`. (AC-20260928-02-4, AC-20260928-02-5, AC-20260928-02-6) | ADR-0030 (h): freeze requires the kit gates green so the capture is kit structure; a fixture per declared state is what `states.json` × capture enforces. AC ids are reserved before the tests are written so the tests carry them. |
| D4 | The `TESTS` step prints, per behaviour pin: `pin p3 → AC-20260928-09-1 · /women (default) · WomanRow[w_01]<WomenList<WomenScreen#0 · "保存すると行が緑になる"`, the target file (`prototype.e2eFile` with `{brief}` = NN, authored in the **main** working tree), the title grammar `<AC-ID> pin <id>: <note>`, and `Session: write one test per line above; it must fail on main today`. `--mark tests-derived` refuses unless the file exists in the main tree, every reserved AC id occurs in it, and `prototype.e2eList` with `{file}` substituted exits 0 (cwd = root) with stdout containing every AC id; it then runs D5, D6, D7 and D8 in that order and ends at `CLOSED`. (AC-20260928-02-7) | Brief scope 2: derived tests, red until the rebuild passes; listing through the host's own runner proved necessary on 2026-09-28 — salon-os's Playwright config matches only `*smoke.spec.ts`, so a wrongly named file lists zero tests silently. |
| D5 | Export: refuse when `harden/<stem>` exists and `marks.exported` is unset (`harden/<stem> exists — delete it or restore status.json`); when `marks.exported` is set, skip. Else: `git worktree add <root>/.claude/worktrees/harden-<stem> -b harden/<stem> <status.base>`; `git diff <base>...proto/<stem> -- <one ':(glob)<g>' per export glob> | git -C <that worktree> apply --index`; when the diff is non-empty, commit `harden(<stem>): data and API layer exported from proto/<stem>`; remove that worktree; write `status.exported = { files: [...], commit: <sha or null> }`; append to the brief file, replacing a previous one, a `## Data/API sub-plan` section holding a fenced ```harden block: one line per exported path with its diff status (`M`, `A`, `D`), grouped under its glob. (AC-20260928-02-8) | Executed 2026-09-28: `git diff base...proto -- ':(glob)…' \| git apply --index` carries adds, modifications and deletions into a fresh worktree; `git checkout <branch> -- <paths>` would silently keep deleted files. Created before any deletion (ADR-0030 h; the 2026-09-24 audit item 1). |
| D6 | `writeSpec`: the reserved path from `spec/templates/prototype-spec.md` (tokens `{{…}}`): frontmatter `date`, `status: hardened`, `tier: standard`, `area: <brief name>`, `breaking: false`, `depends_on: []`, `depended_on_by: []`, `brief: NN`, `lane: behaviour`, `open_markers: 0`; `## Goal` = the brief's `## Result` first paragraph; Decisions `D1` "the UI is rebuilt from `<base>` against `design/prototypes/<stem>/contract.json`, route by route, through the build driver's capture gate (spec 03)" citing every reserved AC id, `D2` "the data and API layer is merged from `harden/<stem>` and hardened in place through the host gate" `[no-ac: the gate is the oracle]`; File Plan: one row per exported path (`A` → CREATE, `M` → MODIFY, `D` → DELETE, layer `other`), one row per path changed on `proto/<stem>` outside the export globs and not the overlay files (action from the diff status, layer `other`), and the e2e file as a `tests` row listing every AC id; `## Contracts` = the routes × states table and the pointer to `contract.json`; one AC per behaviour pin: `WHEN pin <id> ("<note>", <screen> / <state>) is exercised THE SYSTEM SHALL pass its derived test → writes <e2eFile>`; Assumptions, Rationale and Canonical Delta from the template's fixed text. After writing, the mark runs `ac-matrix.js --spec <path> --lint --resolve-root <root>` and `promise-sweep.js --spec <path>` and refuses on any finding (the file is left for inspection). (AC-20260928-02-9) | The loop needs a hardened spec; a behaviour-lane brief has no plan session, so the freeze writes it from what it measured. The lints run so `/spec:run` never meets a spec the state gate would refuse. |
| D7 | Deletion, after D5 and D6 succeed: `prototype.dbDestroy` when declared (cwd = the prototype worktree, env as at create; non-zero is a refusal — nothing is deleted); `git worktree remove <proto worktree>` (a dirty worktree is a refusal naming `commit or discard on proto/<stem>, then re-run the mark`); `git branch -D proto/<stem>`; `status.marks.closed`. A re-run after a partial failure resumes at the first undone step (each step checks its own postcondition first). (AC-20260928-02-10) | ADR-0030 (h): nothing under `proto/<stem>` is read after CLOSED; `harden/<stem>` is the only survivor. `-D` because the branch is never merged. |
| D8 | Ledger row (numbers, paths, enums only): `{"ts","stage":"prototype","spec":"<generated spec path>","brief":"NN","branch":"proto/<stem>","rounds":N,"pins":{"total":N,"behaviour":N,"look":N},"routes":N,"states":N,"captures":N,"exported":{"files":N,"commit":"<sha>"|null},"harden":"harden/<stem>","verdict":"frozen"}` appended through `appendLedger` before `marks.closed` is written. The `CLOSED` step prints `Read only:` (`contract.json`, the generated spec) and `Next:` = `spec-status --next` verbatim. (AC-20260928-02-11) | Brief scope 3's measurement: round count is on this row; the rebuild's diff count lands on spec 03's build row. |
| D9 | `spec/commands/prototype.md` gains the `APPROVED`/`TESTS`/`CLOSED` sections (read-load ≤ 500); `spec/entrypoints.json` gains `spec/scripts/proto-capture.js` with callers `spec/scripts/prototype-driver.js` (spec 03 adds the build driver). [no-ac: prose and manifest — `read-load` and `entrypoints` are the oracles] | Doctrine follows the driver. |
| D10 | Bump via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"`. [no-ac: bump — `plugin-bump.js --check` is the oracle] | Version discipline. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/proto-capture.js | CREATE | scripts | D1 — the Playwright shell (host `createRequire`), `--diff`, exit codes, header citation |
| spec/templates/proto-capture-page.js | CREATE | doctrine | D1 — browser-side walk: `captureComposites(rootEl, composites, props)` → entries; assigns `globalThis.__protoCapture`; no imports |
| spec/scripts/lib/freeze.js | CREATE | scripts | D2 — the freeze library |
| spec/scripts/prototype-driver.js | MODIFY | scripts | D3 `frozen`; D4 `TESTS` print + `tests-derived`; D5–D8 executed inside `tests-derived`; states `TESTS`, `CLOSED`; usage list |
| spec/templates/prototype-spec.md | CREATE | doctrine | D6 — the generated spec's template with `{{…}}` tokens and the fixed Assumptions/Rationale/Canonical Delta text |
| spec/commands/prototype.md | MODIFY | doctrine | D9 — the three sections; `Read only:` lists |
| spec/entrypoints.json | MODIFY | other | D9 — proto-capture.js row |
| spec/.claude-plugin/plugin.json | MODIFY | other | D10 — `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` |
| tests/prototype/capture-page.test.js | CREATE | tests | AC-20260928-02-1 |
| tests/prototype/proto-capture.test.js | CREATE | tests | AC-20260928-02-2, AC-20260928-02-3 |
| tests/prototype/freeze.test.js | CREATE | tests | AC-20260928-02-4, AC-20260928-02-5, AC-20260928-02-6, AC-20260928-02-7, AC-20260928-02-8, AC-20260928-02-9, AC-20260928-02-10, AC-20260928-02-11 |
| tests/prototype/prototype-driver.test.js | MODIFY | tests | predecessor pin (spec 01's APPROVED-step case) asserted the retired "freeze — not available" step; updated in place to assert D3's freeze step and its `--mark frozen` line (build-time collision fix) |
| tests/fixtures/prototype/host/ | MODIFY | tests | the spec 01 fixture gains: `docs/design/approval.json` with two composites, a `capture-stub.js` the tests substitute for the real capture through `PROTO_CAPTURE_BIN` (writes a canned capture per url), a red-gate switch (`gateCommand` = `node gate.js`, red when `GATE_RED=1`), an `e2eList` stub (`node list-tests.js {file}` printing the file's test titles) |

Note (outside the table): `PROTO_CAPTURE_BIN` is a test seam read by the driver only when set —
the same harness-level swap `tests/helpers.js` documents for network fixtures; the real path is
the executed A1 spike, never a stub.

## Contracts

`design/prototypes/<stem>/captures/women--default.json` (D1):

```json
{ "schemaVersion": 1, "url": "http://localhost:3000/women", "viewport": { "width": 1280, "height": 800 },
  "composites": ["WomenList", "WomanRow", "RecordEditSheet"],
  "entries": [
    { "id": "WomanRow[w_01]<WomenList<WomenScreen#0", "tag": "a", "box": [399, 209, 558, 54], "text": "佐藤 誠 様 ゴールド",
      "styles": { "padding-top": "12px", "padding-left": "16px", "color": "rgb(36, 31, 22)", "display": "flex", "…": "27 longhands" } } ] }
```

`--diff` output (D1):

```json
{ "summary": { "missing": 0, "extra": 1, "changed": 2 },
  "entries": [ { "id": "WomanRow[w_01]<WomenList<WomenScreen#0", "kind": "changed", "field": "styles.padding-left", "before": "16px", "after": "20px" },
               { "id": "WomanRow[w_01]<WomenList<WomenScreen#0", "kind": "changed", "field": "box", "before": [399,209,558,54], "after": [399,209,558,58] },
               { "id": "WomanRow[w_04]<WomenList<WomenScreen#3", "kind": "extra" } ] }
```

`design/prototypes/<stem>/contract.json` (D3):

```json
{ "schemaVersion": 1, "brief": "28", "stem": "28-functional-prototype", "frozenAt": "2026-09-28T10:00:00.000Z",
  "base": "main", "viewport": { "width": 1280, "height": 800 },
  "routes": { "/women": { "default": { "url": "/women", "capture": "captures/women--default.json" },
                          "empty":   { "url": "/women?proto=empty", "capture": "captures/women--empty.json" } } },
  "composites": ["WomenList", "WomanRow", "RecordEditSheet"],
  "ids": ["WomanRow[w_01]<WomenList<WomenScreen#0", "…"],
  "pins": { "test": ["p1", "p3"], "look": ["p2"] },
  "spec": "specs/20260928/09-functional-prototype.md",
  "e2eFile": "e2e/proto-28.smoke.spec.ts",
  "tests": [ { "pin": "p1", "ac": "AC-20260928-09-1" }, { "pin": "p3", "ac": "AC-20260928-09-2" } ] }
```

The brief's appended section (D5):

````
## Data/API sub-plan

```harden
src/db/**
  M src/db/schema.ts
  A src/db/repositories/proposals.ts
drizzle/**
  A drizzle/0031_proposals.sql
src/routes/api/**
  A src/routes/api/collector.$.ts
```
````

The `TESTS` step (D4), rendered:

```
[prototype-driver] state: TESTS  brief: docs/roadmap/28-functional-prototype.md
## Step: derive one end-to-end test per behaviour pin
Read only: design/prototypes/28-functional-prototype/contract.json, design/prototypes/28-functional-prototype/pins.json
pin p1 → AC-20260928-09-1 · /women (default) · WomanRow[w_01]<WomenList<WomenScreen#0 · "保存すると行が緑になる"
pin p3 → AC-20260928-09-2 · /women/new (error) · screen note · "空欄で保存すると赤い注意"
File: e2e/proto-28.smoke.spec.ts (main working tree) · title: `<AC-ID> pin <id>: <note>`
Session: write one test per line above; it must fail on main today.
Then:
  node <driver> docs/roadmap/28-functional-prototype.md --mark tests-derived
```

## Behavior

`approve` → the session marks `frozen`; the driver runs the gate on the prototype tree, captures
every declared state through the host's own Playwright, writes the contract and reserves the
spec and its AC ids. The session writes the derived tests on main and marks `tests-derived`; the
driver creates `harden/<stem>` from the base with the export globs' diff applied, writes the
sub-plan into the brief and the behaviour-lane spec, lints it, destroys the prototype database
through the host's script, removes the worktree and the branch, appends the ledger row and
prints `CLOSED` with `spec-status --next` — which now names `/spec:run <generated spec>`. The
session commits `design/prototypes/<stem>/`, the e2e file, the brief and the spec on main
(direct lane). Nothing on `proto/<stem>` is read again.

## Acceptance Criteria

- **AC-20260928-02-1**: WHEN `captureComposites` runs over a hand-built DOM of plain objects (elements with `__reactFiber$t` chains `Row[w_01]<List<Screen`, a `getBoundingClientRect`, a stubbed `getComputedStyle` returning the 27 longhands, one hidden element with `display: none`, one element whose chain is `Wrapper<Screen` only) with `composites = ["Row","List"]` THE SYSTEM SHALL return entries only for the two `Row`/`List` elements, each with `id`, `tag`, integer `box`, `text` ≤ 80 chars and exactly 27 style keys, and none for the hidden or the `Wrapper` element → writes tests/prototype/capture-page.test.js
- **AC-20260928-02-2**: WHEN `proto-capture.js --host <dir without @playwright/test> --url http://127.0.0.1:1/ --out x.json --composites A` runs THE SYSTEM SHALL exit 2 with stderr naming `@playwright/test`; WHEN it runs with no `--composites` THE SYSTEM SHALL exit 2 naming `--composites` → writes tests/prototype/proto-capture.test.js
- **AC-20260928-02-3**: WHEN `--diff a.json b.json` runs on captures differing by one `styles.padding-left` value, one `box`, one entry present only in `b` and one only in `a` THE SYSTEM SHALL exit 1 and print JSON whose `summary` is `{ "missing": 1, "extra": 1, "changed": 2 }` and whose `changed` entries carry `field`, `before`, `after`; WHEN the files are identical THE SYSTEM SHALL exit 0 with `summary` all zeros → writes tests/prototype/proto-capture.test.js
- **AC-20260928-02-4**: WHEN `--mark frozen` runs before `approved` THE SYSTEM SHALL exit 2 naming `approved`; WHEN `pins.json` holds only `look` pins THE SYSTEM SHALL exit 2 with stderr containing `no behaviour pins` and write no `contract.json`; WHEN `docs/design/approval.json` is absent and the kit directory is empty THE SYSTEM SHALL exit 2 containing `no composites declared` → writes tests/prototype/freeze.test.js
- **AC-20260928-02-5**: WHEN `--mark frozen` runs with `GATE_RED=1` THE SYSTEM SHALL exit 2 with stderr containing `kit gates red on proto/<stem>`, write `design/prototypes/<stem>/gate.log`, and write no capture; WHEN `gateCommand` is `node --test {testDirs}` and no `prototype.gate` is declared THE SYSTEM SHALL exit 2 naming `prototype.gate` and run no gate → writes tests/prototype/freeze.test.js
- **AC-20260928-02-6**: WHEN `--mark frozen` runs on the fixture host (gate green, `states.json` = two routes with two states each, `PROTO_CAPTURE_BIN` = the capture stub, three pins of which two are `behaviour`) THE SYSTEM SHALL exit 0, write four files under `captures/` named `women--default.json`, `women--empty.json`, `women_new--default.json`, `women_new--error.json`, write `contract.json` with `pins.test` = the two behaviour ids in pin order, `tests` = two entries whose `ac` values are `AC-<today>-<NN>-1` and `AC-<today>-<NN>-2`, `spec` = `specs/<today>/<NN>-functional-prototype.md` where NN is `01` on an empty date dir and `03` when `01` and `02` exist, and print `(APPROVED → TESTS)`; WHEN the capture stub exits 2 for one state THE SYSTEM SHALL exit 2 forwarding its stderr and write no `contract.json` → writes tests/prototype/freeze.test.js
- **AC-20260928-02-7**: WHEN the bare run prints `TESTS` THE SYSTEM SHALL print one `pin <id> → <AC-ID>` line per behaviour pin in pin order, the substituted file path `e2e/proto-28.smoke.spec.ts`, and a `Session:` line; WHEN `--mark tests-derived` runs with the file absent THE SYSTEM SHALL exit 2 naming the file; WHEN the file carries only the first AC id THE SYSTEM SHALL exit 2 naming the second; WHEN the file carries both but the list stub prints only one THE SYSTEM SHALL exit 2 containing `e2eList` and the missing id → writes tests/prototype/freeze.test.js
- **AC-20260928-02-8**: WHEN `--mark tests-derived` runs with both AC ids listed, after the prototype branch modified `src/db/schema.ts`, added `drizzle/0001.sql`, deleted `src/db/old.ts`, modified `src/ui/a.js` and carries the overlay files THE SYSTEM SHALL create `harden/<stem>` whose diff against `base` is exactly `M src/db/schema.ts`, `A drizzle/0001.sql`, `D src/db/old.ts` (no `src/ui/a.js`, no overlay file), leave no `harden-<stem>` worktree registered, and append to the brief a `## Data/API sub-plan` section whose ```harden block lists those three paths under their globs; a second run with `marks.exported` set SHALL not touch `harden/<stem>`; WHEN `harden/<stem>` pre-exists with `marks.exported` unset THE SYSTEM SHALL exit 2 containing `harden/<stem> exists` → writes tests/prototype/freeze.test.js
- **AC-20260928-02-9**: WHEN the same mark completes THE SYSTEM SHALL write the reserved spec with `status: hardened`, `brief: 28`, `lane: behaviour`, `open_markers: 0`, a Decisions row `D1` citing both AC ids, a File Plan holding `src/db/schema.ts | MODIFY`, `drizzle/0001.sql | CREATE`, `src/db/old.ts | DELETE`, `src/ui/a.js | MODIFY`, no overlay row, and `e2e/proto-28.smoke.spec.ts | CREATE | tests` naming both ids, two AC bullets each ending `→ writes e2e/proto-28.smoke.spec.ts`; `ac-matrix.js --spec <it> --lint --resolve-root <root>` and `promise-sweep.js --spec <it>` SHALL both exit 0 with zero findings on that file → writes tests/prototype/freeze.test.js
- **AC-20260928-02-10**: WHEN the same mark completes THE SYSTEM SHALL have run `dbDestroy` (the fixture's `db-dropped` marker exists in the root), `git worktree list --porcelain` SHALL not list the prototype worktree, `git branch --list 'proto/*'` SHALL be empty, `harden/<stem>` SHALL exist, and `--state` SHALL print `CLOSED\n`; WHEN the prototype worktree is dirty at that step THE SYSTEM SHALL exit 2 containing `commit or discard on proto/<stem>`, and `harden/<stem>` and the spec SHALL already exist (a re-run after cleaning the worktree exits 0) → writes tests/prototype/freeze.test.js
- **AC-20260928-02-11**: WHEN the same mark completes THE SYSTEM SHALL have appended one `.claude/spec-runs.jsonl` row with `stage: "prototype"`, `spec` = the reserved path, `brief: "28"`, `rounds: 1`, `pins: { total: 3, behaviour: 2, look: 1 }`, `routes: 2`, `states: 4`, `captures: 4`, `exported.files: 3`, `harden: "harden/<stem>"`, `verdict: "frozen"`, and `fleet-reader.js --json` over that ledger SHALL report the row under no drift reason; the `CLOSED` print SHALL contain `Next:` → writes tests/prototype/freeze.test.js

## Assumptions (escalation triggers)

- A1 (executed 2026-09-28, salon-os React 19.2.8 dev, Storybook 10.5.8, Playwright 1.63.0 loaded through `createRequire` from the session scratch): the owner-chain walk records 154 elements with 0 differing rows across two loads; computed longhands and integer boxes are stable across reloads (the 2026-09-23 spike: 0 noise in nine no-change runs, ~0.7 s per screen). — **if false** on a host: raise the settle delay through `--settle <ms>` before anything else; a diff that persists across three no-change runs is a capture defect, never an accepted baseline.
- A2 (executed 2026-09-28): `git diff <base>...proto -- ':(glob)src/db/**' ':(glob)drizzle/**' | git -C <harden wt> apply --index` carries `A`, `M` and `D` into a fresh worktree; `git worktree remove` + `git branch -D` leave `git branch --list 'proto/28-*'` empty. — **if false:** STOP, ask the user.
- A3 (executed 2026-09-28, salon-os): `pnpm exec playwright test --list e2e/proto-28.smoke.spec.ts` lists 2 tests (one per project) for a one-test file at that name, and 0 tests for `e2e/proto-28-pins.spec.ts` — the host's `testMatch` decides. — **if false** (a runner with no `--list`): `e2eList` is any host command that exits 0 and prints the titles; the check reads stdout only.
- A4: the host's `gateCommand` does not run the e2e directory (salon-os runs Playwright only through `release.e2eCommand`), so a red derived test on main keeps main's gate green until the rebuild. — **if false:** STOP, ask the user — the alternatives (skip-until-rebuild, a separate directory) change what "red until the rebuild passes" means.
- A5: `ac-matrix.js --lint` and `promise-sweep.js` accept a spec whose only File Plan test row is a pre-existing file and whose ACs all end `→ writes <file>` (the `writes` verb is unresolved by design). — **if false:** the generated bullets switch to `→ reuses <file> :: <AC-ID>`, resolvable because the title carries the id.
- A6: `spec-status.js` treats a hardened spec carrying `brief: NN` and an unknown frontmatter key `lane` as an ordinary hardened spec (its frontmatter reader ignores unknown keys). — **if false:** the key moves to a `# lane:` comment line read by the build driver; record the deviation.
- A7: no test outside this File Plan pins the exact set of `spec/scripts` executables or the entrypoints manifest's row count in a way the new `proto-capture.js` row cannot satisfy (the inventory checks are satisfied by the row). — **if false:** the hit is a fix row here, never a weakened pin.

## Rationale

The capture records kit-composite instances because the rebuild is from scratch: wrappers,
class names and even line numbers differ, but the composites and their order are what JJ
approved and what the kit guarantees (screens import composites only, brief 30). The 27
longhands are the 2026-09-23 spike's set, which caught a one-step padding and a one-token colour
change with zero noise. The freeze runs the gate on the prototype tree first so the capture is
kit structure — a prototype that restyles a primitive would otherwise freeze the restyle into the
contract. Tests are authored by the session, not generated: a free-text pin cannot be turned into
an executable assertion deterministically, so the driver reserves the AC ids, prints the pins,
and verifies through the host's own runner that every id is listed — the check that would have
caught the 2026-09-28 mis-named file. The export is `git diff | git apply` because `checkout --`
keeps deleted files; the harden branch is created and committed before any deletion, and every
deletion step re-checks its postcondition so a refusal mid-way is resumable. The generated spec
is what makes the loop unchanged: `/spec:run` reads a hardened spec with a File Plan, red tests
and lint-clean ACs; the derived e2e file follows the standard expiry rule at close (its ACs are
this spec's new behaviour, not pins), which is doctrine's call, not this spec's. A prototype with
zero behaviour pins is refused because it is the direct lane in disguise. The live-browser path
has no `[env: CHROME_BIN]` test: the capture needs the host's Playwright, which this repo does
not carry; the executed spike is the evidence and the first real freeze on salon-os is the
measurement ADR-0030 asks for.

Build departures (folded from the deviations sidecar at close). A capture's URL is
`prototype.url` joined with the state's `states.json` path by plain concatenation. D9's
entrypoints row names `spec/scripts/lib/freeze.js` as proto-capture.js's caller, because D2 puts
the spawn inside `captureAll`. D3(5)'s URL probe is advisory; an unreachable dev server is still
refused before anything later runs, by D3(6)'s capture exiting 2 on navigation failure. D7's
`deleteProto` shipped as two functions, `runDbDestroy` (skipped once `marks.dbDestroyed` is set)
and `removeProtoWorktreeAndBranch` (each step checks the worktree or branch still exists), so a
resume never destroys the database twice. Outside-export File Plan rows take their action from
the diff status, as D6 says. The fixture host's `gateCommand`, `e2eList` and `dbDestroy` became
the stubs the File Plan row names, while its `prototype.export` stays `["src/db/**"]` (the export
cases widen it on their own copy) so spec 01's clean-fixture check holds; the fixture also gains a
base `src/ui/a.js` so the export case genuinely modifies it. Spec 01's APPROVED-step pin asserted
the retired not-available freeze step and was updated in place to assert the freeze step and its
`--mark frozen` line.

## Canonical Delta

`docs/canonical/design.md` § Prototypes gains: freeze = gate green on the prototype tree →
capture per route × state keyed by composite instance → `contract.json` → derived e2e tests on
main, listed by the host runner → `harden/<stem>` from `git diff base...proto -- <export globs>`
→ generated behaviour-lane spec → worktree and branch deleted → one `stage: prototype` ledger
row; the brief carries a `## Data/API sub-plan` block; `proto-capture.js --diff` is the one
comparison.
