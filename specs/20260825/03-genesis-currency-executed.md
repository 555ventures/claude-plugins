---
date: 2026-08-25
status: done
diff_base: b1c140ef0b16ea1a4c554b8938780f407613ec80
tier: critical           # adds a spec-paths key (key-set edit — critical trigger, precedent specs/20260823/01, specs/20260824/05)
area: genesis
design: false
breaking: false
depends_on: [specs/20260825/02-genesis-consultant-discovery.md]
depended_on_by: [specs/20260825/04-genesis-driver.md]
brief: 10
open_markers: 0
spiked: 2026-08-25
---

# Currency is executed: a registry check replaces the Haiku recency pass

## Goal

A version that does not exist on its registry cannot enter a genesis menu. The Haiku "still
current?" pass in `wf-research.js` — an opinion, not a check, and never told to pin to release
pages — is replaced by a deterministic script, `registry-check.js`, that resolves every
package a menu option names against the registry's own per-version JSON endpoint (npm, PyPI,
crates.io) and endoflife.date's cycle list for runtimes, drops the options that do not
resolve, and stamps the survivors. Offline is never a block: an unreachable registry stamps the
menu `unverified` and the interview continues. Done means: `wf-research.js` has one phase,
every option carries a `packages` list the script can resolve, the script is wired into the
genesis commands' menu step behind a `spec-paths` key, and the fake-major roundup traps (Bun
2.0, Deno 3.0, Storybook 11) are mechanically impossible to ship in a menu.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | New `spec/scripts/registry-check.js` (`spec-paths registry-check`), zero-dependency, `#!/usr/bin/env node` + `'use strict'`, header per Worker Rules; contract: `registry-check.js --menu <file>… [--write] [--base <registry>=<url>]… [--timeout-ms <n>] [--json]`; reads each menu's `options[].packages[]` (`{registry, name, version}`) and resolves each package by one GET (AC-20260825-03-1) | Brief 10 unit D: currency is executed, not opined; slopsquatting is a live RCE class |
| D2 | Registry endpoints (defaults; `--base <registry>=<url>` overrides the origin for tests): `npm` → `GET {base}/{name}/{version}` with `/` in a scoped name encoded as `%2f`; `pypi` → `GET {base}/pypi/{name}/{version}/json`; `crates` → `GET {base}/api/v1/crates/{name}/{version}`; `endoflife` → `GET {base}/api/{name}.json`, a JSON array of cycles — `version` resolves when some `cycle` equals it or `version` starts with `cycle + "."`. Defaults: `https://registry.npmjs.org`, `https://pypi.org`, `https://crates.io`, `https://endoflife.date`; scheme chosen from the URL (`http:` allowed for overrides); request header `user-agent: spec-plugin-registry-check/<plugin version>`, `accept: application/json`; per-request timeout default 8000 ms (AC-20260825-03-1, AC-20260825-03-3) | Executed 2026-08-25 (Assumptions A1–A3): all four answer 200/404 per version, no auth, no rate-limit hit |
| D3 | Package verdicts: `exists` (HTTP 200 with a JSON body) · `missing` (HTTP 404 on npm/pypi/crates, or an `endoflife` product found whose cycles do not match) · `unknown-product` (`endoflife` 404 or non-JSON body — the curated list proves nothing by absence) · `unreachable` (network error, timeout, any 5xx, or a 200 whose body is not JSON) · `unsupported` (any other `registry` string). Option status: any `missing` → `missing`; else no packages → `unverified`; else any `unreachable`/`unknown-product` → `unverified`; else any `unsupported` and no `exists` → `unsupported`; else `verified` (AC-20260825-03-1, AC-20260825-03-3, AC-20260825-03-4, AC-20260825-03-5) | A 404 on a package name IS the slopsquat signal; a 404 on a curated runtime list is not |
| D4 | Output: one line per package `registry-check: <dimension> "<label>" <registry>:<name>@<version> <verdict>`; then exactly one sentinel: `__REGISTRY_OK__` (exit 0: no option `missing`), `__REGISTRY_DROPPED__ n=<k>` (exit 1: k options `missing`), `__REGISTRY_UNREACHABLE__` (exit 3: every probe `unreachable`, nothing verified); exit 2 = usage / unreadable menu / malformed (`options` not an array, a package lacking `registry`/`name`/`version`) — stderr names the file and the remedy (`re-run the research round`); `--json` prints `{menus:[{file, dimension, options:[{label, status, packages:[{…, verdict}]}]}]}` through the synchronous writer (AC-20260825-03-1, AC-20260825-03-4, AC-20260825-03-6) | Sentinel contract per Worker Rules; exit 3 is the never-block path the doctrine promises |
| D5 | `--write` rewrites each menu file in place: options with status `missing` are removed from `options` and appended to `droppedForCurrency: [{label, packages}]`; every surviving option gains `currency: {status, checkedAt, packages:[{registry,name,version,verdict}]}`; the menu gains `currencyCheckedAt`; on exit 3 all options are stamped `unverified` and none removed; on exit 2 nothing is written (AC-20260825-03-2, AC-20260825-03-4) | The script owns the mechanical edit so the session never hand-drops options |
| D6 | `wf-research.js`: the `Verify` phase, `RECENCY_VERDICT_SCHEMA`, `verifyKeys`, `toVerify`, `verifyFailed`, `still_current`, `verify_note`, and every `haiku` seat are deleted; `meta.phases` has one entry (`Research`) and `meta.whenToUse` names "the genesis commands" (no command name); the return is `{stage, menus, alsoConsidered, tokens}`; `optionSetSchema()` (spec 02) gains a REQUIRED `packages` array per option — items `{registry: string, name: string, version: string}`, empty array allowed for taste dimensions; the prompt instructs: name the registry package and the exact version you cite from a release page or the registry itself — never a blog roundup; a version you cannot source gets no package entry and `recency: "unverified — model knowledge"` (AC-20260825-03-7, AC-20260825-03-8) | The opinion seat goes with the check that replaces it; the schema is the executed input |
| D7 | Genesis commands' menu step (architect Phase 1 step 2; design Phase 1; explore Phase 1): after writing `interview-research/{dimension}.json` (stamping `fetchedAt`), run `node "$(spec-paths registry-check)" --menu <file> --write`; exit 1 → print one `📌 dropped for currency: "<label>" — <registry>:<name>@<version> not on the registry` line per dropped option; exit 3 → print `⚠️ registries unreachable — menu stamped unverified, continuing`; exit 2 → re-run the research round for that dimension (never present a malformed menu); the `AskUserQuestion` is built from the rewritten file; the "drop or demote still_current: false" instruction is deleted (AC-20260825-03-9) | The command reads the file the script wrote — one writer |
| D8 | `genesis.md` § Genesis: Discovery Interview: the model-placement paragraph's Haiku sentence becomes "currency is executed by `registry-check.js` (`spec-paths registry-check`) over each option's `packages` — a version absent from its registry never enters a menu; unreachable registries stamp `unverified`, never block"; `## Genesis: On-disk Handoff`'s `interview-research` line names the `currency` block and `droppedForCurrency` (AC-20260825-03-9) | Doctrine states the invariant; commands hold the step |
| D9 | `spec-paths` gains `registry-check) echo "$ROOT/scripts/registry-check.js"` + the usage token; `spec/entrypoints.json` gains `spec/scripts/registry-check.js` → `["spec/commands/genesis-architect.md", "spec/commands/genesis-design.md", "spec/commands/genesis-explore.md"]`; `tests/spec-paths.test.js` resolve-all list gains `registry-check` (in place) (AC-20260825-03-6) | New-surface checklist (rules § Planning) |
| D10 | Regression pins: `checkWorkflowSyntax('spec/workflows/wf-research.js')` continues to pass and `capOptions` continues to cap 6→4 minority-preserving (spec 02 AC-6's test, retagged AC-20260825-03-8); the live entrypoints pin (`AC-20260820-04-6`) continues green with the new row (its existing test is the oracle) (AC-20260825-03-8) | Deleting a phase must not break the body |
| D11 | New-surface checklist: `plugin.json` bump to next free 7.38.x with a changelog paragraph naming the script, the endpoints, and the deleted Haiku pass [no-ac: plugin-version guard] | — |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/registry-check.js | CREATE | scripts | D1–D5 |
| spec/workflows/wf-research.js | MODIFY | scripts | D6: Verify phase deleted, `packages` required, prompt line |
| spec/bin/spec-paths | MODIFY | scripts | D9 key + usage token |
| spec/entrypoints.json | MODIFY | scripts | D9 row |
| spec/doctrine/genesis.md | MODIFY | doctrine | D8 |
| spec/commands/genesis-architect.md | MODIFY | doctrine | D7 menu step |
| spec/commands/genesis-design.md | MODIFY | doctrine | D7 menu step |
| spec/commands/genesis-explore.md | MODIFY | doctrine | D7 menu step (Phase 1 research) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D11 |
| tests/genesis/registry-check.test.js | CREATE | tests | AC-20260825-03-1, AC-20260825-03-2, AC-20260825-03-3, AC-20260825-03-4, AC-20260825-03-5, AC-20260825-03-6 |
| tests/genesis/research-menu.test.js | MODIFY | tests | AC-20260825-03-7, AC-20260825-03-8 (spec 02's capOptions/syntax test retagged in place) |
| tests/consistency/genesis-doctrine.test.js | MODIFY | tests | AC-20260825-03-9 |
| tests/spec-paths.test.js | MODIFY | tests | D9 resolve-all list (in place) |

## Contracts

Menu option after `--write` (additive to spec 02's shape):

```json
{
  "label": "Bun 1.x runtime",
  "tradeoff": "…", "recency": "1.4.0 stable as of 2026-08", "rank": 1,
  "because": "…", "priced": "…",
  "packages": [{ "registry": "npm", "name": "bun", "version": "1.4.0" }],
  "currency": {
    "status": "verified",
    "checkedAt": "2026-08-25T18:00:00.000Z",
    "packages": [{ "registry": "npm", "name": "bun", "version": "1.4.0", "verdict": "exists" }]
  }
}
```

Menu-level additions: `"currencyCheckedAt": "<ISO-8601>"`, `"droppedForCurrency": [{ "label": "Bun 2.0", "packages": [{ "registry": "npm", "name": "bun", "version": "2.0.0" }] }]`.

Exit codes and sentinels (D4): 0 `__REGISTRY_OK__` · 1 `__REGISTRY_DROPPED__ n=<k>` · 2 usage/malformed (stderr, no sentinel) · 3 `__REGISTRY_UNREACHABLE__`.

`--base` grammar: `--base npm=http://127.0.0.1:41234` (repeatable; registry ∈ `npm|pypi|crates|endoflife`; an unknown registry name in `--base` is exit 2).

## Behavior

- A menu whose options all have `packages: []` (taste/UX dimensions) exits 0 with every
  option `unverified`; no request is made.
- Requests run sequentially per menu (≤4 options × a handful of packages); a slow registry
  costs at most `timeout-ms × packages`.
- `endoflife` version matching: `nodejs@26` matches cycle `26`; `nodejs@26.1.0` matches cycle
  `26`; `deno@3.0` against cycles `2.9, 2.8, …` → `missing`.
- The script never edits anything but the `--menu` files given, and only with `--write`.

## Acceptance Criteria

- **AC-20260825-03-1**: WHEN `registry-check.js --menu m.json --base npm=<fixture>` runs over a
  menu whose options name `npm:react@19.0.0` (fixture 200) and `npm:bun@2.0.0` (fixture 404)
  THE SYSTEM SHALL print `registry-check: <dim> "…" npm:react@19.0.0 exists` and
  `registry-check: <dim> "…" npm:bun@2.0.0 missing`, print `__REGISTRY_DROPPED__ n=1`, and
  exit 1 → `tests/genesis/registry-check.test.js`
- **AC-20260825-03-2**: WHEN the same run adds `--write` THE SYSTEM SHALL rewrite `m.json` so
  `options` no longer contains the `bun@2.0.0` option, `droppedForCurrency` contains
  `{label, packages}` for it, every surviving option carries `currency.status === "verified"`
  and an ISO-8601 `currency.checkedAt`, and the menu carries `currencyCheckedAt` (e.g. 2
  options in → 1 option + 1 dropped out) → `tests/genesis/registry-check.test.js`
- **AC-20260825-03-3**: WHEN a menu names `pypi:pydantic@2.0.0`, `crates:serde@1.0.0`, and
  `endoflife:nodejs@26` against fixtures serving 200 for all three (endoflife body
  `[{"cycle":"26"},{"cycle":"25"}]`) THE SYSTEM SHALL print `exists` for each, `__REGISTRY_OK__`,
  and exit 0; and `endoflife:deno@3.0` against `[{"cycle":"2.9"}]` SHALL print `missing` (e.g.
  `nodejs@26.1.0` → exists; `deno@3.0` → missing) → `tests/genesis/registry-check.test.js`
- **AC-20260825-03-4**: WHEN every `--base` points at a closed port THE SYSTEM SHALL print
  `unreachable` for each package, print `__REGISTRY_UNREACHABLE__`, exit 3, and with `--write`
  SHALL stamp every option `currency.status === "unverified"` while removing none (e.g. 2
  options in → 2 options out, `droppedForCurrency` absent or empty) →
  `tests/genesis/registry-check.test.js`
- **AC-20260825-03-5**: WHEN a package declares `registry: "gem"` THE SYSTEM SHALL print
  `unsupported` for it and stamp that option `currency.status === "unsupported"` (no `exists`
  sibling) with exit 0, and WHEN `endoflife:zzz@1` gets a 404 HTML body THE SYSTEM SHALL print
  `unknown-product` and stamp the option `unverified`, never `missing` →
  `tests/genesis/registry-check.test.js`
- **AC-20260825-03-6**: WHEN a menu's option lacks `packages[].version`, or no `--menu` is
  given, or `--base gem=…` is passed THE SYSTEM SHALL exit 2 with a stderr line naming the file
  (or `usage:`) and the remedy, writing nothing even with `--write`; and `spec-paths
  registry-check` SHALL print an existing path (e.g. `{registry:"npm",name:"react"}` → exit 2,
  stderr matches `/version/`) → `tests/genesis/registry-check.test.js`
- **AC-20260825-03-7**: WHEN `optionSetSchema` is extracted from `wf-research.js` and called
  THE SYSTEM SHALL require `packages` per option with items requiring `registry`, `name`,
  `version`, and the source SHALL contain none of `RECENCY_VERDICT_SCHEMA`, `verifyKeys`,
  `still_current`, `'haiku'`, `phase('Verify')`, and `meta.phases` SHALL have length 1 (e.g. a
  surviving `model: 'haiku'` → red) → `tests/genesis/research-menu.test.js`
- **AC-20260825-03-8**: WHEN `wf-research.js` is checked with `checkWorkflowSyntax` and
  `capOptions` runs on a 6-option menu with one minority option THE SYSTEM SHALL CONTINUE TO
  parse and to return 4 options including the minority one → `tests/genesis/research-menu.test.js`
  (spec 02 AC-6's test, retagged)
- **AC-20260825-03-9**: WHEN `spec/doctrine/genesis.md` and the three genesis command files
  are read THE SYSTEM SHALL contain `registry-check` in each, and none SHALL contain
  `still_current`, `Haiku pass`, `Haiku currency`, or `verifyKeys` (e.g. architect.md keeping
  `verifyKeys: [<the version-bearing subset>]` → red) →
  `tests/consistency/genesis-doctrine.test.js`

## Assumptions (escalation triggers)

- A1 (executed micro-spike 2026-08-25, scratch `reg-spike.js`/`reg-spike2.js`, deleted):
  npm per-version endpoint — `GET https://registry.npmjs.org/react/19.0.0` → 200 (1.8 KB),
  `/react/99.0.0` → 404 body `"version not found: 99.0.0"`, `/bun/2.0.0` → 404, `/storybook`
  dist-tag latest `10.5.10` with no `11.*`, `/bun` latest `1.4.0` with no `2.0.0`, scoped
  `/@tanstack%2freact-start/latest` → 200, unknown name → 404 `{"error":"Not found"}`; the
  whole-package document is 6.9 MB for `react` (2.9 MB abbreviated) — hence per-version GETs
  only — **if false** (endpoint shape changes): the verdict degrades to `unreachable` (non-JSON
  or 5xx), never to `exists`; fix the URL builder.
- A2 (executed 2026-08-25): PyPI — `GET https://pypi.org/pypi/pydantic/2.0.0/json` → 200,
  `/99.0.0/json` → 404 `{"message": "Not Found"}`, unknown name → 404; crates.io —
  `GET https://crates.io/api/v1/crates/serde/1.0.0` → 200, `/99.0.0` → 404 `{"errors":[…does
  not have a version…]}`, unknown crate → 404, with a `user-agent` header set (crates.io
  requires one) — **if false**: same degradation as A1.
- A3 (executed 2026-08-25): endoflife.date — `GET https://endoflife.date/api/nodejs.json` →
  200 JSON array (cycles `26` lts, `25`, `24` lts), `bun.json` → cycles `1`, `deno.json` →
  `2.9, 2.8` (no `3.x`), unknown product → 404 with an HTML body (not JSON) — the reason D3
  makes `endoflife` 404 `unknown-product`, never `missing` — **if false**: same degradation.
- A4: Node's `https`/`http` built-ins suffice (no fetch polyfill, no package) — Worker Rules
  zero-dependency; the test fixture is an in-process `http.createServer` with `--base
  <registry>=http://127.0.0.1:<port>`, and "closed port" is a server bound on port 0, its
  port read, then closed before the run (ECONNREFUSED → `unreachable`) — **if false**: STOP,
  ask the user.
- A5: The harness enforces `schema.required` on the `packages` array (spec 02 A2) — **if
  false**: a menu with no `packages` on an option is malformed → exit 2 → the command re-runs
  the round (D7); never a silent `verified`.
- A6: No other file reads `verifyFailed`, `still_current`, or `verifyKeys` (executed
  2026-08-25: `grep -rn "verifyFailed\|still_current\|verifyKeys" spec/ tests/ README.md
  docs/canonical` → only `wf-research.js`, `genesis.md`, and the three genesis commands — all
  in the File Plan) — **if false**: add the row; never a stale reference.

## Rationale

The Haiku recency pass was the pipeline's only currency mechanism and it was structurally an
opinion: a fast model asked "is this still current?" with no instruction to pin to release
pages, in a year when blog roundups assert Bun 2.0, Deno 3.0, Tauri 3.0 and Storybook 11 —
none of which exist (executed A1/A3). Replacing it with a registry GET does two things the
model cannot: it makes a fake major *impossible* to ship in a menu (the version 404s), and it
closes slopsquatting for the packages a menu names (the name 404s). The verdict vocabulary is
deliberately asymmetric — a 404 on npm/PyPI/crates is the signal, a 404 on endoflife.date's
curated list is nothing — because a runtime slug the researcher spelled differently must not
delete a real option. Exit 3 is the never-block path the doctrine has always promised for a
research call that returns nothing in good time; the menu is stamped and the interview goes
on. The script owns the `--write` edit so the session never hand-drops an option and
"forgets"; the command only reads the file the script wrote.

`packages` is required per option (an empty array is legal) because the check is only as
good as its input: an option that names no package is honestly `unverified`, which the user
sees in the description; an option that names a package is verified or gone.

Rejected: shelling out to `npm view` / `pip index` (needs each package manager installed on
the planning machine — the pipeline's host may be a Python repo with no npm; HTTPS JSON is
portable and dependency-free); keeping Haiku as a fallback for unsupported registries (an
opinion where the check cannot run is still an opinion — `unsupported` is printed instead);
whole-package documents (6.9 MB for `react`; per-version GETs are ~2 KB).

Collision-closure at lock (2026-08-25, `--literal verifyKeys --literal still_current --literal
verifyFailed`): paths leg `likely` = 1 — `tests/consistency/entrypoints.test.js` (the exhaustive
live pin; adding the D9 row is the recorded add-a-member class, caught at build, no waive owed
per rules § Gotchas); literals leg — `genesis-architect.md`, `genesis-design.md`,
`genesis-explore.md`, `genesis.md` are all File Plan rows; `docs/audit/` waived by location.
Retired-literal sweep at lock (by hand): `still_current`, `verifyKeys`, `verifyFailed`,
`RECENCY_VERDICT_SCHEMA` across `tests/` → no hits (A6); `Haiku` in `genesis.md` → the one
model-placement sentence (D8). `SHALL CONTINUE TO` pins: AC-8 (workflow body + cap); the
entrypoints live pin is the oracle for the new row.

Deviation folded at review close (2026-08-26, one-off): `spec/entrypoints.json`'s
`spec/scripts/registry-check.js` row declares a fourth entry point,
`spec/doctrine/genesis.md`, beyond D9's enumeration of the three genesis commands. D8 requires
genesis.md to name the script through its resolver (`` `spec-paths registry-check` ``), and the
exhaustive live entrypoints pin (AC-20260820-04-6, `tests/consistency/entrypoints.test.js`) —
named by D10 as the oracle for the new row — reads that mention as an invocation site. The
manifest follows the oracle; the added member is a consequence of D8 inside this same spec, not
a widening of scope. Orchestrator edit at build Phase 3 (shared wiring surface, never a parallel
worker's).

## Canonical Delta

Append to `docs/canonical/genesis.md` a section *Currency (executed)*: *Since
specs/20260825/03 every research menu option carries `packages: [{registry, name, version}]`
and is resolved by `registry-check.js` (`spec-paths registry-check`) against the registry's
per-version JSON endpoint — npm, PyPI, crates.io — and endoflife.date's cycle list for
runtimes. A `missing` option is dropped into `droppedForCurrency` before the user sees the
menu; survivors carry a `currency` block; unreachable registries stamp `unverified` and never
block (exit 3). The Haiku recency pass, `verifyKeys`, and `still_current` are retired. Exit
codes: 0 ok · 1 dropped · 2 malformed · 3 unreachable; sentinels `__REGISTRY_OK__`,
`__REGISTRY_DROPPED__ n=<k>`, `__REGISTRY_UNREACHABLE__`.*
