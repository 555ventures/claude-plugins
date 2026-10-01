---
date: 2026-10-01
status: done
build_base: design-retool
tier: critical
area: prototype
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
spiked: 2026-10-01
open_markers: 0
diff_base: 212712a68330e937f7acf3309a51fa15186bad9f
---

# The freeze signs in and derives its tier

## Goal

A prototype freeze can capture routes that only render signed in: the host declares one saved
sign-in (`prototype.storageState`) and every capture — at the freeze and at the build's capture
gate — loads it, where today such a route refuses as a login redirect. The spec the freeze
generates stops being hardcoded `tier: standard`: its tier is derived from the paths the host's
pipeline rules § Risk Tiers names, matched over the generated File Plan, and a File Plan that
touches a named path is never written until the user has confirmed the lock. Done means a
signed-in route freezes with a saved sign-in, a stale or missing sign-in refuses by name, and a
generated spec touching a risk-listed path cannot reach `hardened` without an explicit tier.

Tier: **critical because** this spec edits `spec/templates/grounding-contract.md` (its hash is
stamped into every host config — host pipeline rules § Risk Tiers).

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `spec/templates/grounding-contract.md` § Prototype, this spec's one contract edit: the key list gains, directly after the `gate` clause, `optional \`storageState\` (a host-root-relative path to a Playwright storage-state file — one saved sign-in every capture loads, at the freeze and at the build's capture gate; absent = captures run signed out; never tracked by git)`. No other contract sentence changes. This repo's `.claude/spec.config.json` `contractHash` is re-stamped to the new `spec-paths contract-hash` output in the same build. (AC-20261001-01-17) | A host key the contract does not name is drift; one key, one default for every route — a per-route sign-in is out of scope (Rationale). |
| D2 | `spec/scripts/proto-capture.js` reads the key itself: `readConfig(<--host>).prototype.storageState` through `lib/host-config.js`, never a new flag and never a caller change — the freeze (`lib/freeze.js` `captureAll`) and the build capture gate (`spec-build-driver.js`) both already pass `--host`. Absent key = today's signed-out capture, byte-for-byte. Declared: validated after usage validation and BEFORE `@playwright/test` is resolved or a browser launched, each refusal exit 2 writing no `--out`: not a non-empty string → `prototype.storageState must be a path string — remedy: fix it in .claude/spec.config.json, then run /spec:doctor`; resolved against `--host` (`path.resolve(host, value)`) and missing → `prototype.storageState (<value>) does not exist at <abs> — remedy: sign in against <origin of --url> and save the browser state to that path (the host's own Playwright sign-in setup); inside a spec worktree, list the path in .worktreeinclude or run the setup there, then re-run`; present but not parseable as a JSON object → `prototype.storageState (<value>) is not a readable storage-state JSON file (<error>) — remedy: re-run the sign-in setup to rewrite it`. Valid: the page opens with `browser.newPage({ viewport, deviceScaleFactor: 1, reducedMotion: 'reduce', storageState: <abs> })`. The config filename is spelled only via `CONFIG_RELPATH`. `--diff` mode never reads the key. Header comment and `Exit codes:` 2-list gain the three refusals. (AC-20261001-01-1, AC-20261001-01-2, AC-20261001-01-3, AC-20261001-01-4) | The script already owns `--host`; reading one key there gives both callers the sign-in with one derivation. Rejected: a `--storage-state` flag threaded through two callers (two derivations of the same path). Playwright's own error for a bad file names no remedy (A2). |
| D3 | The redirect refusal forks on whether a sign-in was loaded. Signed out (no key): `redirected from <url> to <final> — the capture browser starts signed out, so a signed-in route lands on its login page; remedy: declare prototype.storageState (a saved sign-in) in .claude/spec.config.json, capture only routes that render signed out, or serve the route without its auth guard in the prototype`. Signed in: `redirected from <url> to <final> — the capture browser was signed in from <value>, so the saved sign-in has expired, belongs to another server, or this route only renders signed out; remedy: sign in again to rewrite <value>, or drop the route from states.json, then re-run`. Both exit 2 and write no `--out`; `samePage` is untouched. (AC-20261001-01-5, AC-20261001-01-6, AC-20261001-01-19) | A stale sign-in must fail as loudly as a missing one — a login page is never a baseline. The remedy differs, so the sentence does. |
| D4 | `prototype-driver.js check` (doctor check 23) gains one finding, key `prototype.storageState`: when the declared path is tracked by git (`git -C <root> ls-files --error-unmatch -- <value>` exits 0) → `prototype.storageState (<value>) is tracked by git — a saved sign-in holds live session cookies; remedy: git rm --cached <value> and add it to .gitignore`. A declared path that is untracked, or absent from disk, is NOT a finding (the file is written on demand per prototype). (AC-20261001-01-7, AC-20261001-01-8) | Committing session cookies is the one irreversible mistake this key invites; a missing file is normal between prototypes. |
| D5 | `spec/scripts/lib/freeze.js` gains `riskTierHits({ root, config, paths })` → `{ ok: true, rulesPath, hits: [{ path, trigger }] }` or `{ ok: false, message }`. It reads `<root>/<config.pipelineRules>`, takes the body under the first line starting `## Risk Tiers` up to the next line starting `## `, and collects every single-backtick inline code span on one line, in document order. A span containing whitespace is dropped. Each remaining span is brace-expanded (`{a,b}` groups containing a comma, any number of groups, innermost-first; a brace group without a comma stays literal), a leading `./` is stripped, and a trailing `/` becomes `/**`. Each expansion is a glob tested with `lib/glob-match.js` `globMatch` against each File Plan path; a path's `trigger` is the ORIGINAL span (unexpanded) of the first matching candidate in document order; `hits` keeps File Plan row order, one entry per matching path. Unreadable rules file, a non-string `pipelineRules`, or no `## Risk Tiers` line → `{ ok: false, message: 'cannot derive the generated spec\'s tier — <rulesPath> is unreadable or has no "## Risk Tiers" section; remedy: run /spec:doctor, then re-run --mark tests-derived' }`. The function reads no diff content and judges no statement — paths only. (AC-20261001-01-10, AC-20261001-01-13, AC-20261001-01-14) | § Risk Tiers is prose, but the paths in it are code spans, and a path match is the only part a script can decide. Rejected: a session-judged tier (the freeze session is the cheap seat, and a judgment cannot fail closed); a new machine-readable config key (a second contract edit and a second source of truth for the same list). |
| D6 | `--mark tests-derived` accepts `--tier standard\|critical`. Any other value → exit 2 `--tier must be standard or critical` before any other work in the mark. Tier is decided inside the existing spec-write block (spec not yet on disk), after export and before `writeSpec`, over EVERY generated File Plan row's path including the e2e file: `riskTierHits` `ok: false` → refuse with its message. Hits and no `--tier` → exit 2, nothing written past the export: `<N> File Plan path(s) named in <rulesPath> § Risk Tiers:` then one line per hit `  <path> ← \`<trigger>\``, then `remedy: the user confirms the lock — re-run --mark tests-derived with --tier critical, or with --tier standard when the user rules none of these is a risk change`. Otherwise the tier is: no hits, no flag → `standard`; `--tier critical` → `critical` (with or without hits); hits and `--tier standard` → `standard`. On a successful spec write the mark prints `🚦 generated spec tier: <tier> (<N> risk-listed path(s))` before the checkpoint line (`path` when N is 1, else `paths`). A spec already on disk is never rewritten — `--tier` is ignored on that resume, and no 🚦 line prints. The refusal leaves `harden/<stem>`, the worktree and `marks.exported` in place; the re-run resumes at the spec write. (AC-20261001-01-9, AC-20261001-01-10, AC-20261001-01-11, AC-20261001-01-12, AC-20261001-01-13, AC-20261001-01-15, AC-20261001-01-16, AC-20261001-01-18, AC-20261001-01-20) | A risk-listed path is a question, never an answer: the host's list names paths that are only sometimes triggers (a new pure-additive migration), so the script neither stamps critical nor lets standard through silently. Upgrade is always allowed because prose-only triggers are invisible to D5. |
| D7 | `spec/templates/prototype-spec.md`: frontmatter `tier: standard` becomes `tier: {{tier}}`; `## Rationale` opens with a new first paragraph `{{tierBasis}}` followed by a blank line; the header comment's token list gains both tokens. `writeSpec` takes `tier` and `tierHits` and substitutes `tierBasis` as exactly one of — no hits, standard: `Tier: standard — no File Plan path is named in the host's pipeline rules § Risk Tiers.`; hits, critical: `Tier: critical because \`<first hit path>\` is named in the host's pipeline rules § Risk Tiers (\`<its trigger>\`)<more>; the user confirmed the lock at freeze.`; hits, standard: `Tier: standard — \`<first hit path>\` is named in the host's pipeline rules § Risk Tiers (\`<its trigger>\`)<more>; ruled not a risk change by the user at freeze.`; no hits, critical: `Tier: critical — declared at freeze; no File Plan path is named in the host's pipeline rules § Risk Tiers.` — where `<more>` is empty for one hit and ` and <N-1> more` otherwise. `status: hardened` is unchanged in every case. (AC-20261001-01-9, AC-20261001-01-11, AC-20261001-01-12, AC-20261001-01-16, AC-20261001-01-21) | The build and review drivers read `tier:` from frontmatter already; the basis line is what a cold reader needs to see why, and matches hosts whose rules demand a `critical because <trigger>` line. |
| D8 | The shared fixture host gains `tests/fixtures/prototype/host/.claude/rules/spec-pipeline.md` whose `## Risk Tiers` section names only `src/auth/**` and `migrations/{up,down}.sql` — neither matches any path the existing freeze tests generate (`src/db/schema.js`, `drizzle/0001.sql`, `src/db/old.js`, `src/ui/a.js`, `e2e/proto-28.smoke.spec.ts`), so every existing `tests-derived` case keeps its zero-hit path. (AC-20261001-01-18) | D5's fail-closed refusal would otherwise strand every shared setup: the fixture has declared `pipelineRules` without the file since it was written. |
| D9 | `spec/commands/prototype.md`: § APPROVED gains one sentence — when `prototype.storageState` is declared the capture loads that saved sign-in and refuses naming the file when it is missing or stale; write it by signing in against the running prototype with the host's own Playwright sign-in setup. § TESTS gains: when a generated File Plan path is named in the host's § Risk Tiers the mark refuses listing each path and its trigger — put that list to the user as one `AskUserQuestion` (confirm the lock as critical / rule these not a risk change), never pick for them, then re-run with `--tier`; pass `--tier critical` unprompted only when the user has said a prose trigger applies. `spec/commands/doctor.md` check 23's sentence gains the tracked-sign-in finding. Read-load stays under the flat cap. [no-ac: command prose — `read-load` and `citations-check` are the oracles] | Doctrine follows the driver; the driver's own refusal carries the remedy, so the prose only says who answers. |
| D10 | Bump via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"`. [no-ac: bump — `plugin-bump.js --check` is the oracle] | Version discipline. |

## File Plan

<!-- Machine-consumed: the build stage parses this table into workflow batches.
     Layer ∈ the host config's layerGroups (flattened, in order) plus tests | other | baseline. -->

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/templates/grounding-contract.md | MODIFY | doctrine | D1: the one contract edit — § Prototype gains the optional `storageState` clause |
| spec/templates/prototype-spec.md | MODIFY | doctrine | D7: `tier: {{tier}}`, the `{{tierBasis}}` Rationale paragraph, two token-list entries |
| spec/commands/prototype.md | MODIFY | doctrine | D9: APPROVED sign-in sentence, TESTS tier-confirm sentences |
| spec/commands/doctor.md | MODIFY | doctrine | D9: check 23 names the tracked-sign-in finding |
| spec/scripts/proto-capture.js | MODIFY | scripts | D2, D3: read and validate `prototype.storageState`, open the page signed in, fork the redirect refusal, header + exit codes |
| spec/scripts/lib/freeze.js | MODIFY | scripts | D5, D7: `riskTierHits`, `writeSpec` takes `tier`/`tierHits` and substitutes `tier`/`tierBasis` |
| spec/scripts/prototype-driver.js | MODIFY | scripts | D4, D6: `check` tracked-sign-in finding; `--tier` on `--mark tests-derived`, the hit refusal, the 🚦 line; header + exit codes |
| .claude/spec.config.json | MODIFY | other | D1: re-stamp `contractHash` to the new `spec-paths contract-hash` output |
| spec/.claude-plugin/plugin.json | MODIFY | other | D10: `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` |
| tests/fixtures/prototype/host/.claude/rules/spec-pipeline.md | CREATE | tests | D8: fixture pipeline rules with a `## Risk Tiers` section naming `src/auth/**` and `migrations/{up,down}.sql` only |
| tests/prototype/capture-sign-in.test.js | CREATE | tests | AC-20261001-01-1, AC-20261001-01-2, AC-20261001-01-3, AC-20261001-01-4, AC-20261001-01-5, AC-20261001-01-7, AC-20261001-01-8, AC-20261001-01-19 |
| tests/prototype/freeze-tier.test.js | CREATE | tests | AC-20261001-01-9, AC-20261001-01-10, AC-20261001-01-11, AC-20261001-01-12, AC-20261001-01-13, AC-20261001-01-14, AC-20261001-01-15, AC-20261001-01-16, AC-20261001-01-20, AC-20261001-01-21 |
| tests/prototype/proto-capture.test.js | MODIFY | tests | AC-20261001-01-6 (retag the reused signed-out redirect test's title, appended after the existing words) |
| tests/consistency/contract-stamp.test.js | MODIFY | tests | AC-20261001-01-17 (retag the reused contractHash pin's title) |
| tests/prototype/freeze.test.js | MODIFY | tests | AC-20261001-01-18 (retag the reused generated-spec test's title, appended after the existing words) |

## Contracts

Host config (`.claude/spec.config.json`), the one new key:

```json
{ "prototype": { "url": "http://127.0.0.1:3000", "storageState": "e2e/.auth/user.json" } }
```

The file is Playwright's own storage-state document (written by `context.storageState({ path })`
in the host's sign-in setup) — the plugin never writes it and reads it only to check it parses:

```json
{ "cookies": [ { "name": "sid", "value": "…", "domain": "127.0.0.1", "path": "/",
                 "expires": -1, "httpOnly": false, "secure": false, "sameSite": "Lax" } ],
  "origins": [] }
```

`lib/freeze.js`:

```js
// paths: every generated File Plan row's path, in row order (the e2e file included)
riskTierHits({ root, config, paths })
//  → { ok: true, rulesPath: '.claude/rules/spec-pipeline.md',
//      hits: [ { path: 'drizzle/0006_lucky_silverclaw.sql', trigger: 'drizzle/*.sql' } ] }
//  → { ok: false, message: 'cannot derive the generated spec\'s tier — … remedy: run /spec:doctor, …' }

writeSpec({ root, specPath, brief, briefSlug, briefText, contract, filePlanRows, e2eFile, pinsById,
            tier, tierHits })   // tier: 'standard' | 'critical'; tierHits: riskTierHits().hits
```

Span → candidate globs (D5), literal:

| Span in § Risk Tiers | Candidates |
|---|---|
| `` `drizzle/*.sql` `` | `drizzle/*.sql` |
| `` `src/start/{service,main}.ts` `` | `src/start/service.ts`, `src/start/main.ts` |
| `` `tests/conventions/` `` | `tests/conventions/**` |
| `` `./src/{db,auth}/schema.js` `` | `src/db/schema.js`, `src/auth/schema.js` (reported trigger: the span as written) |
| `` `createApp({…})` `` | `createApp({…})` (no comma — literal; matches nothing real) |
| `` `CREATE TABLE` `` | dropped (whitespace) |

The hit refusal (D6), literal, stderr, exit 2:

```
prototype-driver: 1 File Plan path named in .claude/rules/spec-pipeline.md § Risk Tiers:
  drizzle/0001.sql ← `drizzle/*.sql`
remedy: the user confirms the lock — re-run --mark tests-derived with --tier critical, or with --tier standard when the user rules none of these is a risk change
```

The success line (D6), stdout, directly before the checkpoint line:

```
🚦 generated spec tier: critical (1 risk-listed path)
```

## Behavior

**Sign-in.** Nothing changes for a host that declares no `storageState`. A host that declares
one gets every capture opened with that saved sign-in, at the freeze and again at the build's
capture gate, because both run the same script against their own `--host` root. The freeze runs
from the main working tree, the build from the spec's worktree — a git-ignored sign-in file is
absent from a fresh worktree, which is why the missing-file refusal names `.worktreeinclude`.
Whether the saved session is valid for the server answering `prototype.url` (a fresh prototype
database knows no sessions) is the host's business: an invalid session redirects, and the
redirect refusal — now naming the sign-in file — is the backstop. A route that only renders
signed OUT (the login page itself) redirects under a signed-in capture and is refused the same
way; the remedy names dropping it from `states.json`.

**Tier.** The generated spec's File Plan is matched against the paths the host's risk list
spells as code. No match: the spec is written `tier: standard` as today, with one Rationale line
saying why. Any match: the mark stops and lists each path beside the span that named it. The
session puts that list to the user once. The three ways that control is specified — it is the
only control the user presses here:

- **Success sentence:** `🚦 generated spec tier: <tier> (<N> risk-listed paths)` followed by the
  usual checkpoint line; the generated spec's Rationale opens with the `Tier: …` basis sentence.
- **Path back:** before the answer nothing past the export exists, so re-running without
  `--tier` simply refuses again. After it, the generated spec is an uncommitted file on main at
  `status: hardened` and not yet built — the user edits its `tier:` line (and the basis
  sentence) by hand before `/spec:run`; the driver never rewrites a spec that exists.
- **Farthest artifact:** the `tier:` frontmatter line of the generated spec, which the build and
  review drivers read (ledger rows, `verdict.js --tier`). Rendered by `lib/freeze.js`
  `writeSpec` from `spec/templates/prototype-spec.md`; posted by `prototype-driver.js --mark
  tests-derived`.

A dismissed question stops the run (core § Decisions) — the prototype stays at `TESTS` with its
export intact.

## Acceptance Criteria

- **AC-20261001-01-1**: WHEN the host config declares `prototype.storageState` as
  `e2e/.auth/user.json` and that file holds `{"cookies":[],"origins":[]}` THE SYSTEM SHALL open
  the capture page with a `storageState` option equal to the absolute path
  `<host>/e2e/.auth/user.json`, exit 0 and write `--out` (e.g. a stand-in `@playwright/test`
  that records `newPage`'s options → the recorded `storageState` ends
  `/e2e/.auth/user.json` and is absolute) → writes tests/prototype/capture-sign-in.test.js
- **AC-20261001-01-2**: WHEN `prototype.storageState` is `e2e/.auth/user.json` and no such file
  exists THE SYSTEM SHALL exit 2 with stderr containing
  `prototype.storageState (e2e/.auth/user.json) does not exist at` and `.worktreeinclude`,
  launch no browser and write no `--out` (e.g. the stand-in's `launch` writes a marker file →
  the marker is absent) → writes tests/prototype/capture-sign-in.test.js
- **AC-20261001-01-3**: WHEN the declared sign-in file's content is `{not json` THE SYSTEM SHALL
  exit 2 with stderr containing `is not a readable storage-state JSON file`, launch no browser
  and write no `--out` → writes tests/prototype/capture-sign-in.test.js
- **AC-20261001-01-4**: WHEN `prototype.storageState` is the JSON value `true` THE SYSTEM SHALL
  exit 2 with stderr containing `prototype.storageState must be a path string` and write no
  `--out` → writes tests/prototype/capture-sign-in.test.js
- **AC-20261001-01-5**: WHEN a valid sign-in is declared as `e2e/.auth/user.json` and the page
  sent to `http://localhost:3000/women` settles on `http://localhost:3000/login?next=/women` THE
  SYSTEM SHALL exit 2 with stderr containing
  `redirected from http://localhost:3000/women to http://localhost:3000/login` and
  `signed in from e2e/.auth/user.json`, and write no `--out`
  → writes tests/prototype/capture-sign-in.test.js
- **AC-20261001-01-6**: WHEN no `prototype.storageState` is declared and the page sent to
  `http://localhost:3000/women` settles on `http://localhost:3000/login?next=/women` THE SYSTEM
  SHALL CONTINUE TO exit 2 with stderr matching
  `redirected from http://localhost:3000/women to http://localhost:3000/login` and write no
  `--out` → reuses tests/prototype/proto-capture.test.js :: proto-capture exits 2 naming the redirect
- **AC-20261001-01-7**: WHEN `prototype.storageState` is `e2e/.auth/user.json` and that file is
  committed in the host repo THE SYSTEM SHALL make `prototype-driver.js check` exit 1 printing a
  line containing `prototype.storageState (e2e/.auth/user.json) is tracked by git`, and make
  `check --json` print a `findings` entry whose `key` is `prototype.storageState`
  → writes tests/prototype/capture-sign-in.test.js
- **AC-20261001-01-8**: WHEN `prototype.storageState` is `e2e/.auth/user.json` and that file is
  either absent from disk or present but untracked THE SYSTEM SHALL make `check` exit 0 and
  print nothing (both cases asserted) → writes tests/prototype/capture-sign-in.test.js
- **AC-20261001-01-9**: WHEN `--mark tests-derived` runs with no `--tier` on the fixture host
  whose § Risk Tiers names only `src/auth/**` and `migrations/{up,down}.sql` THE SYSTEM SHALL
  write the generated spec with frontmatter `tier: standard`, a Rationale containing
  `Tier: standard — no File Plan path is named in the host's pipeline rules § Risk Tiers.`, and
  print `🚦 generated spec tier: standard (0 risk-listed paths)` → writes tests/prototype/freeze-tier.test.js
- **AC-20261001-01-10**: WHEN the fixture's § Risk Tiers also names `` `drizzle/*.sql` `` and
  `--mark tests-derived` runs with no `--tier` THE SYSTEM SHALL exit 2 with stderr containing
  `1 File Plan path named in .claude/rules/spec-pipeline.md § Risk Tiers:`, the line
  ``  drizzle/0001.sql ← `drizzle/*.sql` `` and `--tier critical`, write no generated spec file,
  keep `harden/28-functional-prototype` and the prototype worktree, and leave `--state` printing
  `TESTS` → writes tests/prototype/freeze-tier.test.js
- **AC-20261001-01-11**: WHEN that refused mark is re-run with `--tier critical` THE SYSTEM
  SHALL exit 0, write the generated spec with `tier: critical` and `status: hardened`, a
  Rationale containing ``Tier: critical because `drizzle/0001.sql` is named in the host's
  pipeline rules § Risk Tiers (`drizzle/*.sql`); the user confirmed the lock at freeze.``, print
  `🚦 generated spec tier: critical (1 risk-listed path)`, reach `CLOSED`, and leave the spec
  accepted by `ac-matrix.js --lint` and `promise-sweep.js` (both exit 0)
  → writes tests/prototype/freeze-tier.test.js
- **AC-20261001-01-12**: WHEN the same one-hit fixture is marked with `--tier standard` THE
  SYSTEM SHALL write the generated spec with `tier: standard` and a Rationale containing
  ``Tier: standard — `drizzle/0001.sql` is named in the host's pipeline rules § Risk Tiers
  (`drizzle/*.sql`); ruled not a risk change by the user at freeze.``
  → writes tests/prototype/freeze-tier.test.js
- **AC-20261001-01-13**: WHEN § Risk Tiers names `` `./src/{db,auth}/schema.js` ``, `` `src/ui/` ``,
  `` `DROP TABLE` `` and `` `e2e/` `` in that order and the mark runs with no `--tier` THE SYSTEM
  SHALL refuse listing exactly three hits in File Plan row order —
  ``  src/db/schema.js ← `./src/{db,auth}/schema.js` ``, then ``  src/ui/a.js ← `src/ui/` ``,
  then ``  e2e/proto-28.smoke.spec.ts ← `e2e/` `` — under the header
  `3 File Plan paths named in` → writes tests/prototype/freeze-tier.test.js
- **AC-20261001-01-14**: WHEN the host's pipeline rules file is absent, and separately when it
  exists with no `## Risk Tiers` line, THE SYSTEM SHALL make `--mark tests-derived` exit 2 with
  stderr containing `cannot derive the generated spec's tier`, the rules path
  `.claude/rules/spec-pipeline.md` and `/spec:doctor`, and write no generated spec file (both
  cases asserted) → writes tests/prototype/freeze-tier.test.js
- **AC-20261001-01-15**: WHEN `--mark tests-derived --tier high` runs THE SYSTEM SHALL exit 2
  with stderr containing `--tier must be standard or critical` and create no
  `harden/28-functional-prototype` branch → writes tests/prototype/freeze-tier.test.js
- **AC-20261001-01-16**: WHEN the zero-hit fixture is marked with `--tier critical` THE SYSTEM
  SHALL write the generated spec with `tier: critical` and a Rationale containing
  `Tier: critical — declared at freeze; no File Plan path is named in the host's pipeline rules § Risk Tiers.`
  → writes tests/prototype/freeze-tier.test.js
- **AC-20261001-01-19**: WHEN no `prototype.storageState` is declared and the page sent to
  `http://localhost:3000/women` settles on `http://localhost:3000/login` THE SYSTEM SHALL name
  the new way out in the refusal: stderr contains `declare prototype.storageState`
  → writes tests/prototype/capture-sign-in.test.js
- **AC-20261001-01-20**: WHEN the generated spec already exists with `tier: standard` (the
  zero-hit fixture, first mark stopped by the dirty-worktree refusal after the spec write) and
  the mark is re-run with `--tier critical` THE SYSTEM SHALL leave the spec's `tier: standard`
  line unchanged and print no line containing `generated spec tier`
  → writes tests/prototype/freeze-tier.test.js
- **AC-20261001-01-21**: WHEN AC 13's three-hit fixture is marked with `--tier critical` THE
  SYSTEM SHALL write a Rationale containing ``Tier: critical because `src/db/schema.js` is named
  in the host's pipeline rules § Risk Tiers (`./src/{db,auth}/schema.js`) and 2 more; the user
  confirmed the lock at freeze.`` and print `🚦 generated spec tier: critical (3 risk-listed paths)`
  → writes tests/prototype/freeze-tier.test.js
- **AC-20261001-01-17**: WHEN this repo's `.claude/spec.config.json` is read after the contract
  edit THE SYSTEM SHALL CONTINUE TO carry a `contractHash` equal to `spec-paths contract-hash`'s
  output (e.g. the first 12 hex characters of the SHA-256 of
  `spec/templates/grounding-contract.md`) → reuses tests/consistency/contract-stamp.test.js :: AC-20260912-15-8
- **AC-20261001-01-18**: WHEN `--mark tests-derived` runs with no `--tier` on a host whose
  § Risk Tiers names none of the generated File Plan paths THE SYSTEM SHALL CONTINUE TO write the
  reserved spec with `status: hardened`, its Decisions, File Plan and one AC bullet per behaviour
  pin, accepted by `ac-matrix.js --lint` and `promise-sweep.js` (e.g. the fixture host → exit 0,
  two AC bullets each ending `→ writes e2e/proto-28.smoke.spec.ts`)
  → reuses tests/prototype/freeze.test.js :: AC-20260928-02-9: the same mark writes

## Assumptions (escalation triggers)

- A1 (spiked 2026-10-01, `@playwright/test` 1.63.0 resolved from the walkthrough host, scratch
  server that 302s `/app` to `/login` without a `sid=ok` cookie): `browser.newPage({ …,
  storageState: <path> })` loads the saved cookies — observed `no state -> /login`,
  `state path -> /app`. — **if false** on a host's Playwright version: the capture redirects and
  D3's signed-in refusal fires; STOP, ask the user — never fall back to a context-level API
  silently.
- A2 (spiked, same run): Playwright's own failure for a missing or malformed file is the same
  bare `browser.newPage: Error reading storage state from <path>:` with no remedy — observed for
  both — which is why D2 validates before launch. — **if false:** nothing breaks; D2's
  pre-validation still runs first.
- A3 (executed 2026-10-01): D5's algorithm, run as a scratch script over the walkthrough host's
  real `## Risk Tiers` (65 candidates, bare words such as `mine`, `DROP`, `database` included)
  and the 26 File Plan paths of its real generated spec, returned exactly three hits —
  `drizzle.checksums.json`, `drizzle/0006_lucky_silverclaw.sql ← drizzle/*.sql`,
  `src/delivery/http/reader-door.ts` — and no bare-word false hit; over the kaigai host's rules,
  `tests/conventions/a.test.ts ← tests/conventions/`. — **if false** (a bare word matches a real
  root file): it is one extra listed hit the user rules on; never special-case words in the
  matcher.
- A4: `--mark tests-derived` is called in tests only by `tests/prototype/freeze.test.js`, always
  through the shared fixture host (`grep -rln "tests-derived" tests/` → that one file). This is
  a prediction, not an inventory. — **if false:** the other caller's host gains a rules file
  with a non-matching `## Risk Tiers` section in the same batch; never weaken D5's refusal.
- A5: no existing test asserts the generated spec's `tier:` line or the template's bytes
  (`grep -n "tier" tests/prototype/*.js tests/build/build-driver-lane.test.js` → no hit;
  `grep -rn "prototype-spec" tests/` → no hit). — **if false:** update that pin in place, retag
  it with the D7 criterion it now carries, never weaken it.
- A6: `lib/glob-match.js` `globMatch` escapes `{`, `}` as literals (read 2026-10-01), so brace
  expansion must happen before matching and stays inside `riskTierHits`. — **if false:** expand
  anyway; double expansion of an already-expanded glob is a no-op.
- A7: `lib/host-config.js` `readConfig` returns `{}` for an absent or unparsable config, so a
  capture stand-in host with no config (every existing `proto-capture.test.js` case) takes D2's
  absent-key path unchanged. — **if false:** STOP, ask the user.
- A8: no fixture or test host declares `prototype.storageState` today
  (`grep -rlni storageState spec tests docs specs` → no hit before this spec), so D2's and D4's
  new refusals reach no existing setup. — **if false:** that setup is repaired in the same
  batch.

## Rationale

`Tier: critical` — the contract edit re-stamps every host. Everything else here is additive.

**Sign-in (D1–D4).** The walkthrough host's first real freeze could not capture a signed-in
route: the capture browser starts empty, the route redirected to login, and the direct fix of
the day turned that from a silently wrong baseline into a refusal. This spec gives the refusal a
way out. One key, one saved sign-in for every capture, because that is the gap that was hit; a
per-route or per-state sign-in (a signed-out login page inside a signed-in prototype, two roles
in one journey) is deliberately not built — the signed-in redirect refusal names the limit, and
it reopens when a brief needs it. No implicit default path is assumed when the key is absent: a
stale file picked up by convention would change captures with no line in the config saying so.
The script reads the key itself rather than taking a flag because both callers already pass the
host root, and a flag would be the same path derived twice.

**Tier (D5–D8).** Hosts write § Risk Tiers as prose for a judge reading a diff, and several
triggers are statements about content, not files ("a new migration holding anything but CREATE
TABLE"). A script can decide exactly one thing: whether a generated File Plan path is spelled in
that section. So a match is treated as a question for the user, not as a verdict in either
direction — stamping every match critical would make critical meaningless on a host where each
data prototype adds a migration, and passing a match through as standard is the silent failure
this spec exists to remove. What stays invisible is a trigger written only in prose with no
path; `--tier critical` is always accepted for that, and the build stage's existing rule (a
critical trigger found mid-build upgrades the tier at once) remains the backstop. Fragile spots
to watch in the build: the refusal sits after the export on purpose (the File Plan does not
exist earlier) and must leave the export resumable; and D8's fixture must name no path the
existing freeze tests generate, or every one of them turns into a hit refusal.

Collision closure (literals `starts signed out`, `tier: standard`): the first hits only
`spec/scripts/proto-capture.js`, the second `spec/templates/prototype-spec.md` — both File Plan
rows. The other 22 `tier: standard` hits (`spec/templates/spec.md` and 21 test files and
fixtures under `tests/build`, `tests/ceiling`, `tests/expiry`, `tests/frontmatter*`,
`tests/review`) are waived: each spells the frontmatter of a hand-written or synthetic spec,
none reads the generated-spec template, and D7 changes no other file's tier line. `executes`
hits outside the File Plan (`tests/prototype/fixture.js`, `pins-server.test.js`,
`prototype-check.test.js`, `tests/spec-paths.test.js`, the fixture `capture-stub.js`) run the
driver on a host with no `storageState` key and never reach `tests-derived`, so no repair is
planned (A4, A8).

Pins: three behaviours outlive this spec — the signed-out redirect refusal, the contract stamp,
and the zero-hit generated spec — each by retagging the existing test. Every new criterion's
test expires at close.

## Canonical Delta

`docs/canonical/design.md` § Prototypes — the heading's spec list gains
`specs/20261001/01`. In the first paragraph the config block reads: (`url`, `overlay`,
`e2eFile`, `e2eList`, `export`, optional `dbCreate`/`dbDestroy`/`gate`/`storageState`), followed
by one new sentence: "`storageState` is one saved Playwright sign-in that every capture loads —
at the freeze and at the build's capture gate; a missing, unreadable or stale one is a refusal
naming the file, and `/spec:doctor` flags it when git tracks it."

The Freeze paragraph gains, after "the generated behaviour-lane spec": "whose tier is derived:
every generated File Plan path is matched against the paths the host's pipeline rules § Risk
Tiers spells as code; a match stops the mark until the user confirms the lock (`--tier
critical`) or rules it not a risk change (`--tier standard`), and the spec's Rationale opens
with the basis."
