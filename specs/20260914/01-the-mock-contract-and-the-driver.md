---
date: 2026-09-14
status: implementing
build_base: main
tier: critical
area: mocks
design: false
breaking: true
depends_on: []
depended_on_by: [specs/20260914/02-genesis-run-and-sketch-read-the-mock-app.md, specs/20260914/03-the-html-atlas-is-retired.md]
brief: 26
open_markers: 0
spiked: 2026-09-14
diff_base: c636be83d55786631e2e12a19cfe06f770290bdc
---

# The mock contract and the driver

## Goal

`/spec:mocks` drives a greenfield product's own Vite + React + shadcn app instead of gray HTML
wireframes. This spec ships the one contract between this plugin and the separate reviewer
package (`spec/templates/mock/contract.json`), a dependency-free library that calls the package's
CLI through it and refuses a version mismatch, and `mocks-driver.js` rewritten over
SEED → SHELL → SCREENS → THEME → CLIENT → APPROVED, with the provenance ledger's verbs and gate
kept verbatim. Done means: on a host with the package installed, every mark is derived from
`design/notes.json`, `design/approval.json` and `mock-review check --json`, the SEED step prints
the executed scaffold command, and the old driver's retired verbs refuse with a remedy. The HTML
scripts still exist after this spec (specs 02 and 03 rewire and delete them); nothing this spec
ships calls them.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | The contract is one file, `spec/templates/mock/contract.json`, resolved by the new `spec-paths mock-contract` key. It carries `contractVersion: 1`, `package: "@555/mock-review"`, `bin: "mock-review"`, the verb list `["contract","sweep","answer","check","serve"]`, the host layout (Contracts) and the JSON shapes of `design/notes.json`, `design/approval.json`, `design/decisions.json`, `check --json` and `sweep --json` as required-key lists the driver validates by hand (key presence per object and per array element, no library, no type checks; `null` is a present value). The contract also fixes two meanings the driver gates on: `check --json`'s `ok` is `true` exactly when no finding has `severity: "error"` (error kinds: `type` — a TypeScript error; `layer` — an import outside the allowed layers; `doc` — a project component or shell without its doc line or `examples`; `render` — a screen state that throws; `config` — an invalid `mock.config.ts`; warn kinds: `size` — a screen past 150 lines; `twin` — a component whose shadcn imports match another's; `states` — a screen missing a state the seed requires), and an unresolved journey edge is never a finding (it lives only in `journeys[].unresolved`); `serve.url` is `null` whenever no `mock-review serve` process is running for the app. (AC-20260914-01-3, AC-20260914-01-6, AC-20260914-01-14, AC-20260914-01-22) | One spelling of every shared shape, readable by a dependency-free script and copied by the package's own tests; a zod schema would live where packages are allowed, not here. |
| D2 | `spec/scripts/lib/mock-cli.js` is the only caller of the package. `run(root, verb, args)` spawns `mock-review <verb> …` via `spawnSync` with `cwd: <app dir>` and `shell: false`, with `<app dir>/node_modules/.bin` prepended to the inherited PATH (an `npm i -D` bin is never on PATH by itself; a stub earlier on PATH still wins); `contractOrDie(root)` runs `contract --json` first and refuses (exit 2) when `contractVersion` differs from the template's, printing both numbers and `remedy: npm i -D @555/mock-review@<major matching contract>`; an ENOENT spawn refuses with `remedy: npm i -D @555/mock-review`. Every JSON verb's stdout is parsed and validated against D1's shape before any caller reads it; a parse or shape failure is exit 2 naming the verb and the missing key. (AC-20260914-01-1, AC-20260914-01-2) | Skew between two repositories must be a refusal with a remedy, never a silent misread; one library so the check exists once. |
| D3 | `mocks-driver.js` derives the state on every run from `design/mocks/status.json` (schemaVersion 2: `marks {seedDone, shellDrawn, themePicked, approved}`, `journeys {<id>: {drawn, approved}}`, `reopens []`) plus disk: SEED until `seedDone` (while `seedDone` is null the plain run and `--state` spawn nothing — the package is not installed before the SEED block's `npm i` line — and `contractOrDie` first runs at `--mark seed-done`); SHELL until `shellDrawn`; SCREENS until every journey the seed declares — the `### <journey>` names `lib/surfaces.js`'s `parseSeedJourneys` returns for `design/mocks/seed.md`, in seed order — is `drawn` and `approved` (the seed is the journey set, so a journey added to the seed mid-SCREENS reopens the state, and an empty `src/journeys.ts` at SHELL can never skip it); THEME until `themePicked`; CLIENT until `approved`; then APPROVED. A status.json with `schemaVersion: 1` is refused (exit 2) with `remedy: rm design/mocks/status.json — no host holds data on the old path (ADR-0028)`; SHAPES, KIT and WIREFRAMES no longer exist. (AC-20260914-01-5, AC-20260914-01-6, AC-20260914-01-23) | Stock shadcn is the kit and the shell is a component, so the two states that named shared parts before screens are gone; a schema bump is honest because the marks set changed. |
| D4 | The SEED step block prints, in order: `Read only: design/mocks/seed.md`; the scaffold command verbatim — `npx shadcn@4.21.0 init -t vite -b radix -p nova -n app -y -s` (executed 2026-09-14, A1; the scaffold creates the subdirectory `app/`, so `status.app` is the literal `"app"` — the driver writes it on the cold-root create and every later read of `mock.config.ts`, `src/`, `design/*.json` and the spawn `cwd` goes through `path.join(root, status.app)`; `design/mocks/` stays at the root) — then `cd app && npm i -D @555/mock-review`, then one `cp "$(spec-paths templates)"/mock/<file> app/<dest>` line per template file (`mock.config.ts` → `mock.config.ts`, `journeys.ts` → `src/journeys.ts`, `screen.example.tsx` → `design/examples/`, `records.example.ts` → `design/examples/`; the two examples land outside every contract host glob so the reviewer never lists them as a screen or a records file, and `journeys.ts` carries the journey types with an empty `journeys` array so nothing it imports is unwritten), then the records rule from `--mark seed-done`'s refusal text. `--mark seed-done` refuses when `seed.md` lacks `## Records`, when any `## Records` entity has no `src/records/<entity>.ts`, when `mock.config.ts` is absent, or when `contractOrDie` refuses; it never asks the user for data. (AC-20260914-01-4, AC-20260914-01-5) | The scaffold is one executed command plus copies, printed rather than run, so the session sees exactly what lands in the host; records are typed source now, so the seed's data rule moves to a file check. |
| D5 | `--mark shell-drawn` refuses unless `check --json` reports `ok: true` and at least one entry under `shells` whose `examples` is non-empty; it accepts otherwise — warn findings never refuse — and the next run prints SCREENS for the first seed journey (D3). There is no human stop at SHELL: the first journey's approval is the shell's approval. (AC-20260914-01-6) | The kit sign-off existed to force naming shared parts before screens; with the shell a component every screen imports, its first look is the first journey's look. |
| D6 | `--mark journey-drawn --journey <j>` refuses when `<j>` is not a seed journey (naming the seed's journeys), when `check --json` lists no journey with id `<j>` (`remedy: add journey <j> to src/journeys.ts`), or unless `check --json` reports `ok: true` and `journeys[<j>].resolved === true`; a refusal lists every unresolved edge as `step <from> → <to>: <reason>`. Drawing runs no ledger gate (pins are made while drawing, as today). (AC-20260914-01-7) | Every edge is a real control, as before; the check owns the resolution because it runs the same click matcher the guide uses. |
| D7 | `--mark journey-approved --journey <j>` refuses when `approval.journeys[<j>].approvedAt` is absent, when any step's screen lacks `approval.screens[<screen>].approvedAt`, when any note in `design/notes.json` with `status: "open"` sits on one of those screens, when `notes.journeys[<j>].status === "open"`, or when any `project: true` note is `open`; it then runs the ledger's `gateVerdict` exactly as today and records the mark. (AC-20260914-01-8, AC-20260914-01-24) | A journey is blue only when its one conversation and every screen on it are; red notes and project notes block as ADR-0019/0026 rule. |
| D8 | `--mark theme-picked` refuses unless `approval.theme` names a `<k>` that `check --json` reports under `themes` and `check --json`'s `config.theme === <k>`; the driver writes nothing into the host's `src/`. The THEME step block tells the session to author two `src/themes/<k>.css` candidates, then to set `theme: "<k>"` in `mock.config.ts` once `approval.theme` is picked on the page. (AC-20260914-01-9) | The pick is recorded by the page and applied by the session editing one config line; a plugin script never writes host source. |
| D9 | `--mark approved` refuses while any journey lacks `approval.journeys[<j>].client` ∈ `{"ok","waived"}`, while any note anywhere is `open`, or while any `project: true` note is not `approved`; it runs `gateVerdict` and records. `client open` (CLIENT only) prints `<check.serve.url>/?client=<check.config.client.token>`, and refuses (exit 2) while `serve.url` is `null` with `remedy: npx mock-review serve` (started as a tracked background task); `client waive --journey <j> --reason <r>` writes `approval.journeys[<j>].client = "waived"` with the reason and date and is the only write this driver makes to `approval.json`. `client log` is retired. (AC-20260914-01-10, AC-20260914-01-14) | The client walks the same app in a client role; the waiver is the one thing the page cannot do for an absent client. |
| D10 | `--reopen journey:<j>|shell|theme` clears, respectively: that journey's `approved` plus `approved`; `shellDrawn` plus every journey's `approved` plus `themePicked` plus `approved`; `themePicked` plus `approved`. Every reopen appends `{at, target, cleared: [...]}` to `status.reopens` and leaves every other file byte-identical. `--reopen shapes|kit` is refused naming the retired state. (AC-20260914-01-12) | Reopening never deletes, as today; the shell reopen cascades because every screen renders inside it. |
| D11 | Retired verbs refuse with exit 2 and a one-line replacement: `notes …` → "notes are read with `npx mock-review sweep` and answered with `npx mock-review answer`"; `stop …` → "approvals are recorded on the served page"; `theme state|compose|shortlist` → "author `src/themes/<k>.css`, pick on the page, then `--mark theme-picked`"; `look`, `look-probe`, `look-via` → "`npx mock-review check --look <screen>`"; `--refresh-register`, `--mark kit-signed|shape-picked|canon-written`, `ledger derive`, `client log` → "retired (ADR-0028)". (AC-20260914-01-15) | A stale command in a doctrine file or a memory must fail loudly with the new spelling, never fall through to a default. |
| D12 | Every step block for SHELL, SCREENS and THEME carries the line `Skill: mock-authoring — load it before the first edit`; SEED, CLIENT and APPROVED never do. The skill is `spec/skills/mock-authoring/SKILL.md` (frontmatter `name: mock-authoring`, `description`) and states the four authoring rules: a screen imports only from `react`, `@/components/ui`, `@/components`, `@/shells` and `@/records`; every project component and shell carries one `/** … */` doc line above its export and a named `examples` export; screens take their data from `src/records`, never literals; read the shadcn component's official example source before composing. The skill names `design/examples/screen.example.tsx` and `design/examples/records.example.ts` as the starting shapes to copy from, never to edit in place. The `frontend-design` skill line is gone from this driver. (AC-20260914-01-13, AC-20260914-01-19) | The rules that make the inventory exact and reuse the cheap path are four sentences; loading them only at authoring steps is the context discipline. |
| D13 | Doctrine: `spec/doctrine/mocks.md` keeps every `## Mocks: …` heading name and rewrites the bodies of § Mocks: State Machine (the six states, D3 marks, D10 reopens), § Mocks: Seed (D4 scaffold and records), § Mocks: Look and Serve (`npx mock-review serve` as a tracked background task; the look is the human's on the served reviewer; Claude screenshots only via `check --look` at `journey-drawn` and for a layout note), § Mocks: Page Notes (the red/yellow/blue thread model of ADR-0026 as the reviewer carries it: red = the session's turn, answered with `answer`, which flips to yellow; approve/reject/delete on the page only; project notes per ADR-0019; the sweep lists only red items, grouped by file, journey requests first), § Mocks: Client Player (the `?client=<token>` role: no delete, no reject, no Components page; `client` ∈ ok/waived per journey), § Mocks: Authoring Rules (D12's four rules plus the size warning `check` prints past 150 lines). § Provenance Ledger and § Mocks: Checkpoint contract are untouched. (AC-20260914-01-19) | Heading names are cited across commands and tests; keeping them means zero citation churn while every body says the new thing. |
| D14 | `spec/commands/mocks.md` is rewritten to the new loop (Setup, the driver loop, the six states in one paragraph each, Report) and never names `design-atlas`, `kit`, `wire`, `tokens.css`, `data-status` or `exclusions.md`; `spec-paths shared-for mocks` serves `Host Grounding\|Model Placement\|Decisions\|Question Style\|Console Output Style\|MCP Policy\|Design Canon\|Session Execution` (Design Atlas dropped). (AC-20260914-01-18, AC-20260914-01-19) | The command is the session's whole read; it must not point at surfaces spec 03 deletes. |
| D15 | The old driver's tests are deleted in this spec (File Plan), and `tests/mocks/mocks-driver-fixtures.js` is replaced by `tests/mocks/mock-app-fixtures.js`: a synthetic host with `design/mocks/seed.md`, `ledger.md`, `mock.config.ts`, `src/records/*.ts`, `design/notes.json`, `design/approval.json`, and a stub `mock-review` executable placed first on PATH that answers `contract --json`, `check --json` and `sweep` from fixture files the test writes. [no-ac: test infrastructure; every AC below runs through it] | The driver is tested the way every script here is — exec against a synthetic host — and the package is never installed in this repo. |
| D16 | Ledger verbs `add`, `set`, `catch`, `check`, `counts` keep their flags, output and exit codes verbatim; `--mark seed-done`, `journey-approved`, `theme-picked` and `approved` keep running `gateVerdict` before recording. (AC-20260914-01-16, AC-20260914-01-17, AC-20260914-01-24) | The ledger is the one part of the old system that was never about HTML. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/templates/mock/contract.json | CREATE | doctrine | D1: contract version 1, package, verbs, host layout, JSON shapes |
| spec/templates/mock/mock.config.ts | CREATE | doctrine | D4 scaffold copy: `{ name, port, targets: { viewports, schemes }, theme?, client: { token } }` |
| spec/templates/mock/journeys.ts | CREATE | doctrine | D4 scaffold copy: the journey types (Step, Edge, Journey) and `export const journeys: Journey[] = []`, one commented example |
| spec/templates/mock/screen.example.tsx | CREATE | doctrine | D4 scaffold copy to `design/examples/`: one screen with `meta` and named states |
| spec/templates/mock/records.example.ts | CREATE | doctrine | D4 scaffold copy to `design/examples/`: one typed records array |
| spec/templates/mocks-seed.md | MODIFY | doctrine | `## Records` entities map to `src/records/<entity>.ts`; kit/dense-screen wording removed |
| spec/scripts/lib/mock-cli.js | CREATE | scripts | D2: spawn, contract check, JSON validation against D1 |
| spec/scripts/mocks-driver.js | MODIFY | scripts | D3–D12, D16: rewritten in place over the six states; ledger verbs kept; retired verbs refuse |
| spec/bin/spec-paths | MODIFY | scripts | `mock-contract` key; `shared-for mocks` list per D14; usage line |
| spec/skills/mock-authoring/SKILL.md | CREATE | doctrine | D12: the four authoring rules |
| spec/doctrine/mocks.md | MODIFY | doctrine | D13: section bodies rewritten, headings kept |
| spec/commands/mocks.md | MODIFY | doctrine | D14: the new loop |
| spec/entrypoints.json | MODIFY | other | `spec/scripts/mocks-driver.js` row keeps `spec/commands/mocks.md`, `spec/commands/sketch.md`, `spec/templates/mocks-ledger.md`, `spec/templates/mocks-seed.md`; `spec/commands/atlas.md` stays until spec 03 |
| spec/.claude-plugin/plugin.json | MODIFY | other | `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` |
| tests/mocks/mock-app-fixtures.js | CREATE | tests | D15 synthetic host + stub `mock-review` |
| tests/mocks/mock-cli.test.js | CREATE | tests | AC-20260914-01-1, AC-20260914-01-2 |
| tests/mocks/mock-contract.test.js | CREATE | tests | AC-20260914-01-3, AC-20260914-01-22 |
| tests/mocks/mock-driver-states.test.js | CREATE | tests | AC-20260914-01-4 … AC-20260914-01-15, AC-20260914-01-23 |
| tests/mocks/mock-driver-ledger.test.js | CREATE | tests | AC-20260914-01-16 (SHALL CONTINUE TO pin), AC-20260914-01-24 |
| tests/consistency/mocks-doctrine.test.js | CREATE | tests | AC-20260914-01-19 |
| tests/spec-paths.test.js | MODIFY | tests | AC-20260914-01-17 (reuse), AC-20260914-01-18 (rewrite) |
| tests/mocks/mocks-driver-fixtures.js | DELETE | tests | replaced by mock-app-fixtures.js |
| tests/mocks/mocks-driver-exclusions.test.js | DELETE | tests | pinned the retired `ledger derive` / exclusions path |
| tests/mocks/mocks-driver-look-stops-2.test.js | DELETE | tests | pinned `stop open` and the frontend-design line |
| tests/mocks/mocks-driver-notes-gate.test.js | DELETE | tests | pinned the `notes` gate on HTML notes |
| tests/mocks/mocks-driver-seed-records.test.js | DELETE | tests | pinned `data-*` record binding; D4 replaces it |
| tests/mocks/mock-invention.test.js | DELETE | tests | pinned HTML invention checks |
| tests/mocks/record-binding.test.js | DELETE | tests | pinned mock-seed-checks over HTML |
| tests/mocks/walk-state-retired.test.js | DELETE | tests | pinned `--reopen` over walk.json |
| tests/mocks/bounded-output-pins.test.js | DELETE | tests | pinned `notes open` output bounds |
| tests/mocks/human-authored-notes.test.js | DELETE | tests | pinned `notes add/address/waive` |
| tests/mocks/note-conversation.test.js | DELETE | tests | pinned the driver's `notes` reply model over HTML notes |
| tests/design-look-handoff.test.js | DELETE | tests | pinned `look` / `look-probe` |
| tests/mocks/mocks-exclusions.test.js | DELETE | tests | execs the retired `ledger derive` through the driver (collision closure at lock) |
| tests/mocks/client-walk-route.test.js | DELETE | tests | A5 survivor: drives the old seed grammar through `--mark seed-done` via the deleted fixtures; deleted per A5's remedy, never weakened |
| tests/mocks/exclusions-route.test.js | DELETE | tests | A5 survivor: drives the old seed grammar through `--mark seed-done` via the deleted fixtures; deleted per A5's remedy, never weakened |
| tests/mocks/notes-reanchor.test.js | DELETE | tests | A5 survivor: execs the retired driver `notes address` verb; deleted per A5's remedy, never weakened |
| tests/mocks/wire-register.test.js | DELETE | tests | A5 survivor: imports the deleted mocks-driver fixtures; deleted per A5's remedy, never weakened |

Orchestrator duty (outside the table): after the plugin.json bump, `node scripts/plugin-bump.js
--check` is green.

## Contracts

`spec/templates/mock/contract.json` (abridged; the file is the binding spelling):

```json
{
  "contractVersion": 1,
  "package": "@555/mock-review",
  "bin": "mock-review",
  "verbs": ["contract", "sweep", "answer", "check", "serve"],
  "host": {
    "examples": "design/examples/ (outside every glob below)",
    "config": "mock.config.ts",
    "screens": "src/screens/*.tsx",
    "components": "src/components/*.tsx",
    "shells": "src/shells/*.tsx",
    "journeys": "src/journeys.ts",
    "records": "src/records/*.ts",
    "themes": "src/themes/*.css",
    "notes": "design/notes.json",
    "approval": "design/approval.json",
    "decisions": "design/decisions.json"
  },
  "shapes": {
    "contract": { "required": ["contractVersion", "package", "version"] },
    "check": { "required": ["contractVersion", "ok", "findings", "screens", "shells", "journeys", "themes", "config", "serve"],
      "screens[]": ["name", "file", "states", "shell", "hash", "lines"],
      "shells[]": ["name", "file", "examples"],
      "journeys[]": ["id", "title", "steps", "edges", "resolved", "unresolved"],
      "findings[]": ["kind", "severity", "file", "message"],
      "config": ["name", "port", "targets", "theme", "client"],
      "serve": ["url"] },
    "sweep": { "required": ["contractVersion", "inventory", "queue"],
      "inventory[]": ["name", "kind", "props", "doc", "usedOn"],
      "queue[]": ["kind", "id", "screen", "state", "file", "line", "last", "reuse"] },
    "notes": { "required": ["contractVersion", "notes", "journeys"],
      "notes[]": ["id", "screen", "state", "component", "key", "snippet", "status", "thread"],
      "thread[]": ["by", "text"],
      "journeys{}": ["status", "thread"] },
    "approval": { "required": ["contractVersion", "screens", "journeys"],
      "screens{}": ["hash", "approvedAt", "states", "viewports", "schemes", "screenshots"],
      "journeys{}": ["approvedAt", "client"],
      "theme": "string?" },
    "decisions": { "required": ["contractVersion", "decisions"], "decisions[]": ["screen", "text", "at"] }
  }
}
```

`check --json` meanings (binding, D1): `ok === !findings.some(f => f.severity === "error")`;
`severity` ∈ `error` (kinds `type`, `layer`, `doc`, `render`, `config`) | `warn` (kinds
`size`, `twin`, `states`); an unresolved journey edge is reported only in
`journeys[].unresolved`, never as a finding; `serve.url` is a URL string while a
`mock-review serve` process for this app is running and `null` otherwise.

Statuses: a note's `status` ∈ `open` (red, the session's turn) | `answered` (yellow) |
`approved` (blue); a journey conversation's `status` uses the same three; `approval.journeys[j].client`
∈ `ok` | `waived` | absent.

CLI surface the driver relies on (implemented in the package's repository, fixed here):

```
mock-review contract --json                         → {contractVersion, package, version}
mock-review check [--json] [--look <screen> [--state <s>]]
mock-review sweep [--json]                          → text queue (inventory first) or the sweep shape
mock-review answer (--note <id> | --journey <id>) --text <t> [--decision <d>]
mock-review serve                                   → prints the URL on its first stdout line
```

Driver surface:

```
mocks-driver.js [--root <dir>] [--state]
mocks-driver.js --root <dir> --mark seed-done|shell-drawn|journey-drawn|journey-approved|theme-picked|approved [--journey <j>]
mocks-driver.js --root <dir> --reopen journey:<j>|shell|theme
mocks-driver.js --root <dir> ledger (add|set|catch|check|counts) [flags]   (unchanged)
mocks-driver.js --root <dir> client open | client waive --journey <j> --reason <r>
```

`status.json` schemaVersion 2:

```json
{ "schemaVersion": 2, "state": "SEED", "app": "app",
  "marks": { "seedDone": null, "shellDrawn": null, "themePicked": null, "approved": null },
  "journeys": { "<id>": { "drawn": null, "approved": null } },
  "reopens": [], "lastUpdated": null }
```

`app` is the directory holding `mock.config.ts`, relative to the root; the driver writes `"app"`
on the cold-root create (D4) and never changes it. Every host-app path the driver reads
(`mock.config.ts`, `src/records/*.ts`, `design/notes.json`, `design/approval.json`) resolves
through `path.join(root, app)`; `design/mocks/` (status, seed, ledger) stays at the root.
`lib/mock-cli.js` spawns with `cwd: path.join(root, app)` and `PATH = <cwd>/node_modules/.bin:$PATH`.
Spec 02's `design.app` in `spec.config.json` is the same value, written by the same session at
genesis (spec 02 D1).

## Behavior

One driver run prints exactly one step block, as today. A step block names `Read only:` files,
the governing `Doctrine:` section, the `Skill:` line where D12 applies, and the printed `--mark`
line. The session's authoring loop inside SCREENS is: run `npx mock-review sweep`; act on the
queue top to bottom (journey requests first, then notes grouped by file); `npx mock-review
answer` per item; `npx mock-review check`; re-run `sweep` until it prints one line; then the
driver's mark. The driver never reads `sweep`; it reads `check --json`, `notes.json` and
`approval.json` only.

Refusal text always ends with `remedy: <command>` and goes to stderr. From `--mark seed-done` on,
a refusal from `contractOrDie` precedes every other refusal in a run; while `seedDone` is null no
run spawns the package (D3).

## Acceptance Criteria

- **AC-20260914-01-1**: WHEN `mock-review contract --json` on PATH prints `{"contractVersion":2,"package":"@555/mock-review","version":"2.0.0"}` and the template says 1 THE SYSTEM SHALL exit 2 from `node mocks-driver.js --root <host>` on a host whose `marks.seedDone` is set, with stderr containing `contract 2 ≠ 1` and `remedy: npm i -D @555/mock-review@1` (`contractVersion: 1` in both → no refusal, the step block prints) → writes tests/mocks/mock-cli.test.js
- **AC-20260914-01-2**: WHEN `--mark seed-done` runs and neither PATH nor `<root>/<status.app>/node_modules/.bin` holds a `mock-review` executable THE SYSTEM SHALL exit 2 with stderr containing `mock-review not found` and `remedy: npm i -D @555/mock-review`; WHEN the only `mock-review` is `<root>/<status.app>/node_modules/.bin/mock-review` (PATH holds none) THE SYSTEM SHALL find it and proceed → writes tests/mocks/mock-cli.test.js
- **AC-20260914-01-3**: WHEN `spec-paths mock-contract` runs THE SYSTEM SHALL print an absolute path ending in `spec/templates/mock/contract.json` whose JSON parses with `contractVersion === 1`, `package === "@555/mock-review"`, `bin === "mock-review"` and `verbs` deep-equal to `["contract","sweep","answer","check","serve"]` → writes tests/mocks/mock-contract.test.js
- **AC-20260914-01-4**: WHEN the driver runs on a cold root (no status.json, no `mock-review` anywhere on PATH) THE SYSTEM SHALL create status.json with `schemaVersion: 2` and `app: "app"` and print a SEED block whose stdout contains, in this order, `Read only: design/mocks/seed.md`, `npx shadcn@4.21.0 init -t vite -b radix -p nova -n app -y -s`, `npm i -D @555/mock-review`, and one `cp "$(spec-paths templates)"/mock/` line per template file (four lines, each targeting `app/`), and no `Skill:` line → writes tests/mocks/mock-driver-states.test.js
- **AC-20260914-01-5**: WHEN `--mark seed-done` runs with `seed.md` declaring `## Records` entities `client` and `task` and only `app/src/records/client.ts` present THE SYSTEM SHALL exit 2 naming `app/src/records/task.ts` with `remedy: write app/src/records/task.ts`; WHEN both records files and `app/mock.config.ts` exist and `contract --json` matches THE SYSTEM SHALL record `marks.seedDone` and the next run prints a SHELL block carrying `Skill: mock-authoring` → writes tests/mocks/mock-driver-states.test.js
- **AC-20260914-01-6**: WHEN `--mark shell-drawn` runs and the stub's `check --json` reports `ok: false` (one finding `{"kind":"layer","severity":"error","file":"src/screens/home.tsx","message":"imports @/review/store"}`) THE SYSTEM SHALL exit 2 printing that finding's `file` and `message`; WHEN it reports `ok: true`, `journeys: []`, one finding `{"kind":"size","severity":"warn","file":"src/shells/ConsoleShell.tsx","message":"162 lines"}` and `shells: [{"name":"ConsoleShell","file":"src/shells/ConsoleShell.tsx","examples":["Default"]}]` on a host whose `seed.md` declares `### first-visit` then `### daily-check` THE SYSTEM SHALL record `marks.shellDrawn` and the next run prints `draw journey first-visit` (the first seed journey); WHEN both seed journeys carry `drawn` and `approved` and `### onboarding` is then appended to `seed.md` THE SYSTEM SHALL print `SCREENS` from `--state` and `draw journey onboarding` from the plain run → writes tests/mocks/mock-driver-states.test.js
- **AC-20260914-01-7**: WHEN `--mark journey-drawn --journey first-visit` runs and `check --json` lists no journey with id `first-visit` THE SYSTEM SHALL exit 2 with stderr containing `remedy: add journey first-visit to src/journeys.ts`; WHEN it runs with `--journey nope` (not in the seed) THE SYSTEM SHALL exit 2 naming `first-visit` and `daily-check`; WHEN it runs and `check --json` reports that journey `resolved: false` with `unresolved: [{"from":1,"to":2,"reason":"no control with text \"Account\" in ConsoleShell"}]` THE SYSTEM SHALL exit 2 with stderr containing `step 1 → 2: no control with text "Account" in ConsoleShell`; WHEN `resolved: true` THE SYSTEM SHALL record `journeys["first-visit"].drawn` without running the ledger gate (an `open` invented ledger row does not refuse) → writes tests/mocks/mock-driver-states.test.js
- **AC-20260914-01-8**: WHEN `--mark journey-approved --journey first-visit` runs against `approval.json` lacking `journeys["first-visit"].approvedAt` THE SYSTEM SHALL exit 2 naming `approvedAt`; WHEN that field is set but `screens["console-home"]` (a step's screen) lacks `approvedAt` THE SYSTEM SHALL exit 2 naming `console-home`; WHEN both are set but `notes.json` holds `{"id":"N002","screen":"console-home","status":"open",…}` THE SYSTEM SHALL exit 2 naming `N002`; WHEN both are set and `notes.json` holds a `project: true` note with `status: "open"` THE SYSTEM SHALL exit 2 naming that note's id; WHEN both are set and `notes.journeys["first-visit"].status === "open"` THE SYSTEM SHALL exit 2 naming `first-visit`; WHEN none of those hold THE SYSTEM SHALL record `journeys["first-visit"].approved` → writes tests/mocks/mock-driver-states.test.js
- **AC-20260914-01-9**: WHEN `--mark theme-picked` runs with `approval.theme` absent THE SYSTEM SHALL exit 2 naming `approval.theme`; WHEN `approval.theme === "warm"` and `check --json` reports `config.theme: null` THE SYSTEM SHALL exit 2 with `remedy: set theme: "warm" in mock.config.ts`; WHEN `config.theme === "warm"` and `themes` contains `"warm"` THE SYSTEM SHALL record `marks.themePicked` and the next run prints a CLIENT block with no `Skill:` line → writes tests/mocks/mock-driver-states.test.js
- **AC-20260914-01-10**: WHEN `--mark approved` runs with one journey whose `client` is absent THE SYSTEM SHALL exit 2 naming that journey and `remedy: client waive --journey <j> --reason <r>`; WHEN every journey's `client` ∈ `{ok, waived}` but one note is `open` THE SYSTEM SHALL exit 2 naming it; WHEN nothing is open THE SYSTEM SHALL record `marks.approved` and `--state` prints `APPROVED` → writes tests/mocks/mock-driver-states.test.js
- **AC-20260914-01-12**: WHEN `--reopen shell` runs on an APPROVED root THE SYSTEM SHALL clear `marks.shellDrawn`, `marks.themePicked`, `marks.approved` and every `journeys[*].approved`, append one `reopens` row with `cleared` listing those keys, leave `notes.json` and `approval.json` byte-identical, and `--state` prints `SHELL`; WHEN `--reopen kit` runs THE SYSTEM SHALL exit 2 naming `retired (ADR-0028)` → writes tests/mocks/mock-driver-states.test.js
- **AC-20260914-01-13**: WHEN the driver prints a SHELL, SCREENS or THEME block THE SYSTEM SHALL include the line `Skill: mock-authoring — load it before the first edit`; WHEN it prints SEED, CLIENT or APPROVED THE SYSTEM SHALL print no `Skill:` line → writes tests/mocks/mock-driver-states.test.js
- **AC-20260914-01-14**: WHEN `client open` runs in CLIENT with `check --json` reporting `serve.url: "http://127.0.0.1:45980"` and `config.client.token: "k9"` THE SYSTEM SHALL print `http://127.0.0.1:45980/?client=k9`; WHEN `serve.url` is `null` THE SYSTEM SHALL exit 2 with stderr containing `remedy: npx mock-review serve`; WHEN it runs in SCREENS THE SYSTEM SHALL exit 2 naming `CLIENT`; WHEN `client waive --journey daily-check --reason "no reply in 7 days"` runs THE SYSTEM SHALL write `approval.journeys["daily-check"].client = "waived"` with `reason` and `at` and leave every other key of `approval.json` unchanged → writes tests/mocks/mock-driver-states.test.js
- **AC-20260914-01-15**: WHEN any of `notes open`, `stop open shapes`, `theme compose --direction a`, `look home`, `look-probe`, `--refresh-register`, `--mark kit-signed`, `--mark shape-picked`, `--mark canon-written`, `ledger derive`, `client log` runs THE SYSTEM SHALL exit 2 with stderr containing the D11 replacement text for that verb (e.g. `notes open` → `npx mock-review sweep`) → writes tests/mocks/mock-driver-states.test.js
- **AC-20260914-01-16**: WHEN `ledger add --id A1 --step SCREENS --kind product --claim "x" --tag invented --status open` then `ledger counts` run on the mock-app fixture host (schemaVersion 2 `status.json` present) THE SYSTEM SHALL CONTINUE TO exit 0, append the row `| A1 | SCREENS | product | x | invented | open | - | - | - |`, print a counts line containing `1 invented (1 open)`, and leave `status.json` byte-identical → writes tests/mocks/mock-driver-ledger.test.js
- **AC-20260914-01-24**: WHEN `--mark journey-approved --journey first-visit` runs with every D7 condition satisfied and the ledger row `A1` still `open` THE SYSTEM SHALL exit 2 naming `A1` and the `ledger set --id A1 --status confirmed --tag said-by-user` remedy → writes tests/mocks/mock-driver-ledger.test.js
- **AC-20260914-01-17**: WHEN `spec-paths mocks-driver` runs THE SYSTEM SHALL CONTINUE TO resolve to `spec/scripts/mocks-driver.js` → reuses tests/spec-paths.test.js :: AC-20260902-07-15: spec-paths mocks-driver resolves
- **AC-20260914-01-18**: WHEN `spec-paths shared-for mocks` runs THE SYSTEM SHALL emit `## Design Canon` and `## Session Execution` and never `## Design Atlas` → rewrites tests/spec-paths.test.js :: AC-20260914-01-18: spec-paths shared-for mocks serves exactly the D14 section set — Design Canon present, Design Atlas and Design Render Gate both absent
- **AC-20260914-01-19**: WHEN `spec/doctrine/mocks.md`, `spec/commands/mocks.md` and `spec/skills/mock-authoring/SKILL.md` are read THE SYSTEM SHALL satisfy: mocks.md § Mocks: State Machine names `SEED → SHELL → SCREENS → THEME → CLIENT → APPROVED` and none of `KIT`, `WIREFRAMES`, `SHAPES`; § Mocks: Authoring Rules names `@/components/ui`, `/**`, `examples`, `src/records`; mocks.md's `## Provenance Ledger` body is byte-identical to the pre-change body; commands/mocks.md contains none of `design-atlas`, `tokens.css`, `data-status`, `exclusions.md`, `frontend-design`; SKILL.md's frontmatter has `name: mock-authoring` → writes tests/consistency/mocks-doctrine.test.js
- **AC-20260914-01-22**: WHEN the SEED block's four `cp` lines are parsed THE SYSTEM SHALL name only files that exist under `spec/templates/mock/` (`mock.config.ts`, `journeys.ts`, `screen.example.tsx`, `records.example.ts`), and no `cp` destination for `screen.example.tsx` or `records.example.ts` SHALL fall under `src/` (both land in `app/design/examples/`) → writes tests/mocks/mock-contract.test.js
- **AC-20260914-01-23**: WHEN `design/mocks/status.json` carries `schemaVersion: 1` THE SYSTEM SHALL exit 2 with stderr containing `schemaVersion 1` and `remedy: rm design/mocks/status.json` and write nothing → writes tests/mocks/mock-driver-states.test.js

## Assumptions (escalation triggers)

- A1: `npx -y shadcn@4.21.0 init -t vite -b radix -p nova -n spike-app -y -s` scaffolds a Vite + React 19 + Tailwind 4 app with `components.json` `style: "radix-nova"`, `baseColor: "neutral"`, `cssVariables: true` — **executed 2026-09-14** in the session scratchpad: exit 0, `components.json` as stated, `package.json` carrying `react ^19.2.8`, `vite ^8`, `tailwindcss ^4`, `radix-ui ^1.6.7`, `shadcn ^4.21.0`. (A first attempt with `-p radix-nova` failed: `Invalid preset: radix-nova. Available presets: nova, vega, …`; the printed command uses `-p nova`.) — **if false** (a later shadcn drops the flag): the SEED block is the one place the command is spelled; amend D4 and the AC-4 literal in the same build.
- A2: `spawnSync('mock-review', …, { env: { ...process.env, PATH: <cwd>/node_modules/.bin + ':' + PATH } })` with the stub first on PATH is found by Node's PATH lookup on Linux with `shell: false` — the pattern `tests/helpers.js` already uses for a stub `npx` (specs/20260911/06 D12). — **if false:** spawn via the PATH split and an explicit lookup in `lib/mock-cli.js`; never `shell: true`.
- A3: The npm scope `@555` is available or already owned by JJ. — **if false:** the package name changes in `contract.json` only; every other file reads it from there (D1), and AC-1/2/3 literals are amended in the same build.
- A4: `lib/mocks-ledger.js` does not require `lib/mocks-exclusions.js` (grep 2026-09-14: the dependency runs the other way), so retiring `ledger derive` (D11) removes the driver's only use of `mocks-exclusions.js` and spec 03 may delete it. — **if false:** keep the file in spec 03 and record the deviation.
- A5: Deleting the old driver test files (File Plan) leaves every other `tests/mocks/*` file green because those exec `design-atlas.js` or the libs directly, never the driver — grep 2026-09-14 lists exactly which files spawn `mocks-driver.js`; the listed survivors (`client-region`, `client-walk-route`, `exclusions-route`, `mocks-exclusions`, `notes-reanchor`, `wire-register`) reference the driver only in comments or via the ledger. — **if false:** a survivor that execs a retired verb is deleted in the same batch (it pins a surface this spec retires), never weakened.
- Collision closure (executed at lock, `collision-closure.js --literal` over the retired verbs and states): fix rows entered — `tests/mocks/mocks-exclusions.test.js` (execs `ledger derive`). Waived as comment or fixture text, never an assertion on this spec's surface: `spec/scripts/lib/mocks-ledger.js` (header comment naming `ledger derive`), `tests/ceiling/count-tests.test.js` and `tests/expiry/test-expiry.test.js` (a regex-literal fixture containing `stop open`), `tests/spec-status.test.js`, `tests/question-style-gate.test.js` and `tests/fixtures/mocks-ledger/dry-run.md` (ledger rows whose free-text `step` is `WIREFRAMES`), `tests/review/verdict.test.js` and `legs-verdict-pair.test.js` (the review verdict's own `derive`, unrelated). Hits inside files spec 02 or 03 rewrites or deletes are carried by those File Plans. Every other hit lives under `specs/`, `docs/adr/`, `docs/roadmap/`, `docs/audit/` or a stale `.claude/worktrees/` tree.
- A7: AC-16 is green against the pre-change driver on the mock-app fixture — **executed 2026-09-14** with the HEAD `mocks-driver.js` over a scratch host carrying a schemaVersion 2 `status.json` (`app: "app"`), `app/design/notes.json`, `app/design/approval.json` and the template ledger: `ledger add … --status open` exit 0 appending `| A1 | SCREENS | product | x | invented | open | - | - | - |`; `ledger counts` exit 0 printing `… 1 invented (1 open) …`; `status.json` byte-identical (`cmp`). The same `ledger add` without `--status` exits 2 (`status "null" — allowed: …`), which is why the AC spells the flag. — **if false** at build (red-check `broken-pin`): the fixture differs from the executed host; align the fixture, never drop CONTINUE TO.
- A6: No `tests/**` file greps `--mark kit-signed`, `shape-picked`, `canon-written`, `theme compose`, `stop open`, `notes open|address|waive`, `look-probe` outside the deleted set and `tests/consistency/retired-flags.test.js` (which spec 03 rewrites) — the collision-closure run at lock lists any other hit. — **if false:** enter each hit as a fix row in the same batch.

## Rationale

The plugin's whole design surface existed to keep two artifacts in agreement. ADR-0028 removes
the second artifact, so this spec's job is smaller than the driver it replaces: derive six
states from three files, keep the ledger, and refuse everything else with a remedy. The contract
is a JSON file rather than shared code because this repo cannot import a package and the
package's repository can import anything; a file both sides test against is the only shape that
satisfies both rules. The driver reads `check --json` for structure (screens, journeys, shells,
themes, config, serve URL) and the two reviewer files for human verdicts; it never reads the
sweep, which exists for the session, so a change to the sweep's text can never break a mark.

KIT is retired because the argument for it (name shared parts before screens) is answered by
stock shadcn plus the docgen inventory the sweep prints; SHAPES is retired because a product
shape pick over HTML candidates has no home in a single app and the seed's journeys already fix
the structure. SHELL keeps the one thing KIT did that still matters: the shell exists, with
examples, before any screen. The theme pick is recorded on the page and applied by one config
line so no plugin script writes host source. The client role is a token because the client walks
the same served app; the waiver is the driver's only write to `approval.json`, and it is
narrow.

The journey set is the seed's, not `src/journeys.ts`'s, for the same reason the old driver used the seed: an empty or half-written journey file must never let SCREENS complete. The four authoring rules live in three homes (the skill, § Mocks: Authoring Rules, spec 02's § Design Authoring Contracts); each home's literals are pinned by a doctrine test (AC-19 here, spec 02 AC-10), so a drift in one reddens the suite — accepted rather than replaced by citations, which those pins could not see.

Rejected: a driver-side `sweep` passthrough (the session runs the package's CLI directly; one
fewer surface); a build-time `mock-review` fixture package (a stub executable is enough and
keeps this repo dependency-free); keeping `ledger derive` (it derived exclusions from client
answers on `walk.json`, which no longer exists). Fragile: the retired-verb sweep (A6) and the
survivor test set (A5) are predictions priced with their remedies.

## Canonical Delta

`docs/canonical/design.md` § "the mocks command/driver" (lines ~275–420) is replaced by: the
six states and their marks (D3), the three files the driver reads and the one it writes (D7,
D9), the contract file and the mismatch refusal (D1, D2), the scaffold (D4), and the retired verb
list (D11). `docs/canonical/scripts.md` gains a `spec/scripts/lib/mock-cli.js` row and a
`spec/templates/mock/contract.json` note. The § Provenance Ledger passage is unchanged.
