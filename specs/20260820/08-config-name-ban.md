---
date: 2026-08-20
status: done
diff_base: 5628834de5418a29561b4d63c9d59ced88fc5fa6
tier: standard
area: gate-integrity
design: false
breaking: false
depends_on: []
depended_on_by: []
spiked: 2026-08-20
open_markers: 0
---

# Config-read closure: ban naming the settings file instead of detecting reads

## Goal

The pin that is supposed to force every private read of the host's `.claude/spec.config.json`
through `lib/host-config.js` is fail-open in two independent dimensions, both demonstrated by
execution today. Replace its read-detection predicate with a decidable one — **only three named
files under `spec/scripts/` may contain the literal `spec.config.json` in executable text** —
and complete `lib/host-config.js` so every legitimate reason to name the file has a route
through the library. Done means: the two evasions executed today go red, every prose mention
stays green, and the eight offending lines in five files are migrated.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | **Supersede locked ruling `d10-predicate-v1`** (`tests/host-config/config-read.test.js` header, D10 of specs/20260815/01). Its four-clause read-detection predicate and its `DISPLAY_JOIN_EXEMPT` regex are deleted, not amended (AC-20260820-08-1, AC-20260820-08-7) | "Does this line read the config?" is undecidable from one line of text, so every tightening moves the goalpost by one hoisted constant; the ruling's own justification is also stale — all four offenders D10 named are fixed and `suite-baseline.js`, the file whose display-join the exemption existed to spare, has since been deleted, so the regex matches zero lines in the tree (executed, A3) |
| D2 | The replacement predicate is exactly three ordered clauses per source line: (1) line does not contain the literal **`spec.config`** → green; (2) the **trimmed** line starts with `//`, or starts with `#` **not** immediately followed by `[A-Za-z0-9_$]` → green; (3) otherwise → offender (AC-20260820-08-1, AC-20260820-08-15, AC-20260820-08-16) | Naming is decidable where reading is not: a private read must write the filename somewhere, so banning the name catches constant-hoisting, multi-line pairing, template literals, and `child_process` shell-outs with one rule instead of a growing clause list. The literal is the **stem**, not the full filename, which also closes the `'spec.config.' + 'json'` split at zero cost — the tree contains no occurrence of `spec.config` that is not part of the filename (executed, A7) |
| D3 | **No trailing-comment exemption**, and the comment-prefix set is exactly `//` plus non-identifier `#` — `*` and `/*` are deliberately NOT prose prefixes (AC-20260820-08-2, AC-20260820-08-15) | Fail-closed on both halves. A trailing-`//` exemption reopens the hole immediately (`root + '//.claude/spec.config.json'` puts the literal after a `//` sitting inside a string). And three of the four obvious prose prefixes begin executable JavaScript: `*` starts a generator method, `/*` starts a same-line-closed block comment followed by live code, and `#` starts a private class field — `#cfg = fs.readFileSync('.claude/spec.config.json')` is a read whose trimmed line starts with `#`. A private field name admits no space after `#`, and every shell comment in this repo is `# text` or `#!`, so the identifier-character test separates them cleanly. The tree today has 8 `//` mentions and 1 `#` mention and zero `*` or `/*` mentions, so the tightening reddens nothing legitimate (executed, A7) |
| D4 | The walk covers **every file** under `spec/scripts/`, at any depth, with no extension, name-shape, or file-type filter (AC-20260820-08-3) | This repo's rules § Gotchas already records that a guard selecting what to inspect by file name or extension is evadable by the exact thing it guards; the `.js` filter is a live instance — a three-line bash private read sat under `spec/scripts/` and the pin stayed green (executed, A2) |
| D5 | Exactly **three** paths are exempt, each named literally in the test with a one-line reason: `lib/host-config.js` (the sole Node reader), `smoke.sh` and `spec-state-gate.sh` (read via `jq`; bash cannot `require()` the Node library). The exemption is a closed list of literal relative paths, never a pattern, and the test asserts the list's exact contents so growth is a visible, reviewed edit rather than a drive-by (AC-20260820-08-4) | A named-path allowlist cannot be evaded by adding a file — a new bash or JS script that names the config goes red and forces an explicit decision — whereas the extension filter admitted every future `.sh`, `.py`, or extensionless script silently; growing the list is a visible test edit, which is the intended friction (JJ ruling 2026-08-20) |
| D6 | `spec-state-gate.sh` is **not** edited by this spec. Routing bash through a sourced `lib/host-config.sh` is deferred `[no-ac: a deferral — the observable is the absence of a diff to that file, which scope-reconcile's File Plan comparison already enforces; an AC asserting a file is unchanged is untestable against a spec that does not touch it]` | That file is a session hook: this repo's pipeline rules § Risk Tiers make hook surfaces a critical-tier trigger because a broken hook pollutes or blocks every prompt in every host repo. Deferring keeps this spec standard tier and leaves the stricter option open (JJ ruling 2026-08-20) |
| D7 | `lib/host-config.js` gains three exports so the ban is fair: `configPath(root)` (the existing private `configPathFor`, renamed at the export boundary), `configExists(root)` (presence probe, no content read), and `CONFIG_RELPATH = '.claude/spec.config.json'` (the literal, for user-facing remedy text). `readConfig`, `readConfigStrict`, and `declaredForge` keep their current behavior byte-for-byte (AC-20260820-08-5, AC-20260820-08-6, AC-20260820-08-12) | A ban with no sanctioned route is a ban authors route around: the two reasons this repo actually names the file today — a presence probe and a remedy string — had no library route, which is precisely why `fleet-reader.js` grew a deliberate string-concat workaround to dodge the old predicate |
| D8 | `fleet-reader.js`'s discovery probe becomes `configExists(dir)`, and the whole five-line comment block above it — the one explaining that the filename is concatenated on purpose to dodge the sweep, ending "Do not tidy" — is **replaced**, not merely trimmed, by a one-line comment stating that discovery gates on presence only and the library owns the read (AC-20260820-08-8) | That comment is the defect's own confession — the guard shaped the code around itself rather than the code around the invariant. Left in place it becomes actively false the moment the probe migrates, and it describes a predicate that no longer exists: an archaeology trap for the next reader |
| D9 | The seven remedy-string lines (`env-preflight.js` ×2, `fidelity-check.js` ×2, `review-legs.js` ×2, `spec-design-driver.js` ×1) interpolate `CONFIG_RELPATH` instead of writing the literal (AC-20260820-08-9) | All five files already `require('./lib/host-config')`, so this is a substitution, not a new dependency |
| D10 | `fidelity-check.js`'s two messages, which today say the bare `spec.config.json`, become `.claude/spec.config.json` via `CONFIG_RELPATH`. Their surrounding phrasing is otherwise unchanged (AC-20260820-08-9) | One constant means one spelling; the fuller relative path is the more precise remedy, and no test pins either substring (executed, A4) |
| D11 | Falsifiability is an **end-to-end canary**, not a fixture string: `scanConfigReadOffenders(scriptsRoot)` takes its root as a parameter, and a canary test builds a synthetic tree in `tmpdir()` holding (a) the hoisted-constant `.js` evasion, (b) the `.sh` jq evasion, (c) a file at the exempt path `lib/host-config.js` containing a real read, (d) a `//`-comment-only mention, (e) an evasion nested two directories deep — then asserts the scan returns exactly (a), (b), (e) (AC-20260820-08-10, AC-20260820-08-11) | Today's green came from **two** components failing open independently — the predicate (hoist) and the walk (extension filter) — and a fixture string exercises only the first, so a future name-shape filter or a non-recursing walk would be invisible again. The canary exercises walk + predicate + exemption together, matches this repo's behavioral-test convention (synthetic host in a tmpdir, never a regex over prose), and costs milliseconds |
| D12 | Accepted residual gaps, stated in the test's header: a literal split **across the stem itself** (`'spec' + '.config.json'`), an encoded or computed filename, and readdir-based discovery still evade. No AST checker (AC-20260820-08-13) | Irreducible without parsing, and this repo is strictly zero-dependency; an AST checker loses to dynamic `require`/`eval` anyway. Each surviving evasion now requires deliberate intent, whereas this pin's threat model is convenience drift — and convenience spells the filename out. Stating the gap is honest; pretending it is closed is not |
| D13 | Plugin version bumps `7.11.0 → 7.12.0` with a last-3-versions changelog paragraph (AC-20260820-08-14) | Host pipeline rules § Planning: every behavior change bumps the owning plugin's semver |
| D14 | **Collision ruling (orchestrator, build 2026-08-20).** `tests/fleet-reader/review-fixes.test.js` (“review finding 6”) pins both `/configPathFor\(/` in `fleet-reader.js`'s source and `typeof hostConfig.configPathFor === 'function'`. D7 retires that name at the export boundary and D8 retires that call site, so the pin is a retired-literal collision. It is **updated in place and retagged** to AC-20260820-08-8 — `configExists(` in the reader's source, `configExists`/`configPath` exported as functions — never weakened and never left red; the anti-concatenation assertion in the same test is kept verbatim. `tests/fleet-reader/review-fixes.test.js` joins the File Plan as a tests row. | This repo's rules § Gotchas prescribes exactly this mechanism for a Decision that retires a literal asserted outside the File Plan; the lock-time collision-closure literals leg swept `d10-predicate-v1`/`DISPLAY_JOIN_EXEMPT`/`display-join` but not `configPathFor`, which this spec retires rather than inherits |
| D15 | **Coverage ruling (orchestrator, build 2026-08-20).** AC-20260820-08-14 cites "the existing version-bump consistency test"; no such test exists in `tests/` (executed: no test reads `spec/.claude-plugin/plugin.json`'s `version`). The AC gains a real carrier at `tests/consistency/plugin-version.test.js` (CREATE), pinning the durable invariant rather than the literal: the declared version is valid semver and strictly greater than `7.11.0`, the `description`'s `Changelog (last 3):` run lists exactly three versions, and its leading version equals the declared `version`. | An AC whose stated carrier does not exist is uncovered, and `ac-matrix.js` would report it as such at review. A literal `7.12.0` assert is churn by construction — this repo's own § Gotchas records that a spec's literal version number is a target, not a pin, because concurrent sessions race the semver. The bump-without-changelog defect the paragraph rule catches is the one this spec's own D13 could have shipped |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/host-config.js | MODIFY | scripts | Export `configPath(root)`, add and export `configExists(root)`, export `CONFIG_RELPATH`; header gains the D7 rationale and the ban's statement (D7) |
| spec/scripts/fleet-reader.js | MODIFY | scripts | Discovery probe → `configExists(dir)`; delete the string-concat workaround comment (D8) |
| spec/scripts/env-preflight.js | MODIFY | scripts | Two remedy strings interpolate `CONFIG_RELPATH` (D9) |
| spec/scripts/fidelity-check.js | MODIFY | scripts | Two report/remedy strings interpolate `CONFIG_RELPATH`, gaining the `.claude/` prefix (D9, D10) |
| spec/scripts/review-legs.js | MODIFY | scripts | Two remedy strings interpolate `CONFIG_RELPATH` (D9) |
| spec/scripts/spec-design-driver.js | MODIFY | scripts | One remedy string interpolates `CONFIG_RELPATH` (D9) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | Version 7.12.0 + changelog paragraph (D13) |
| tests/host-config/config-read.test.js | MODIFY | tests | AC-20260820-08-1, -2, -3, -4, -10, -11, -13, -15, -16; retains AC-20260815-01-11 |
| tests/host-config/host-config-api.test.js | CREATE | tests | AC-20260820-08-5, -6, -7, -12 |
| tests/fleet-reader/discovery.test.js | MODIFY | tests | AC-20260820-08-8 |
| tests/fleet-reader/review-fixes.test.js | MODIFY | tests | AC-20260820-08-8 — retired-literal collision pin retagged in place (D14) |
| tests/consistency/plugin-version.test.js | CREATE | tests | AC-20260820-08-14 — the carrier the AC cites does not exist (D15) |

## Contracts

```js
// spec/scripts/lib/host-config.js — exports after this spec
module.exports = {
  readConfig,        // unchanged: absent/unreadable/unparsable/non-object → {}
  readConfigStrict,  // unchanged: throws on absent/unreadable/unparsable; verbatim parse otherwise
  declaredForge,     // unchanged
  configPath,        // NEW (export of the existing private configPathFor):
                     //   configPath(root) → path.join(root, '.claude', 'spec.config.json')
  configExists,      // NEW: fs.existsSync(configPath(root)) → boolean.
                     //   Presence only — never opens, reads, or parses the file.
                     //   A directory occupying the path returns true (existsSync semantics);
                     //   callers that need readability call readConfigStrict.
  CONFIG_RELPATH,    // NEW: the string '.claude/spec.config.json' (forward slashes, no leading
                     //   dot-slash) — for user-facing remedy text only, never for path building.
}
```

```js
// tests/host-config/config-read.test.js — the replacement predicate (D2/D3/D4/D5)
const CONFIG_STEM = 'spec.config'                 // the stem, not the full filename (D2) —
                                                  // written plainly: this file lives under
                                                  // tests/, which the walk never scans
const EXEMPT = [                                  // literal relative paths; never a pattern
  path.join('lib', 'host-config.js'),             // the sole Node reader
  'smoke.sh',                                     // reads via jq; bash cannot require() the lib
  'spec-state-gate.sh',                           // same; session hook, untouched by D6
]

function offendingLine (line) {
  if (!line.includes(CONFIG_STEM)) return false             // clause 1
  const t = line.trim()
  if (t.startsWith('//')) return false                      // clause 2a — JS/prose comment
  if (t.startsWith('#') && !/[A-Za-z0-9_$]/.test(t[1] || ''))
    return false                                            // clause 2b — shell comment or shebang,
                                                            //   never a `#field` private class member
  return true                                               // clause 3
}

// Root is a PARAMETER, not a constant, so the canary (D11) exercises this exact walk
// against a synthetic tree rather than only the predicate function.
function scanConfigReadOffenders (scriptsRoot) { /* recursive fs walk, every file, EXEMPT skipped */ }
```

The walk stays a pure `fs` recursion over `spec/scripts/`, never a shell grep: `fidelity-check.js`
carries a stray NUL byte that makes `grep` classify it as binary and silently drop its hits (the
mismeasurement d10-predicate-v1 was written to fix; that half of the ruling survives).

## Behavior

`scanConfigReadOffenders(scriptsRoot)` walks every file under `scriptsRoot` at any depth, skips the
three exempt relative paths, reads each file as UTF-8, and applies `offendingLine` per line. The
production pin calls it with `spec/scripts/`; the canary calls it with a synthetic tmpdir tree. Offenders
are reported as `relative/path:lineNumber`, and the assertion message names them so a failure is
self-diagnosing.

Files that fail to read as UTF-8 are **not** skipped silently — a read error is an offender-shaped
failure reported as `relative/path:read-error`, because an unreadable file under the guarded
directory is an uninspected file, and this guard's entire defect history is uninspected surfaces
reading as green.

The eight migration sites, all confirmed by execution today (A1):

| Site | Today | After |
|------|-------|-------|
| `env-preflight.js:64` | `'testEnv in .claude/spec.config.json must be an array — …'` | `'testEnv in ' + CONFIG_RELPATH + ' must be an array — …'` |
| `env-preflight.js:70` | `'testEnv[' + i + '] in .claude/spec.config.json is missing …'` | same, `CONFIG_RELPATH` interpolated |
| `fidelity-check.js:121` | `'(spec.config.json design.copyCatalogs) is not readable — …'` | `'(' + CONFIG_RELPATH + ' design.copyCatalogs) is not readable — …'` |
| `fidelity-check.js:570` | `'… declare them in spec.config.json …'` | `'… declare them in ' + CONFIG_RELPATH + ' …'` |
| `review-legs.js:77` | `` `review-legs.js: cannot read .claude/spec.config.json under --root: …` `` | `CONFIG_RELPATH` interpolated |
| `review-legs.js:81` | `'review-legs.js: no gateCommand in .claude/spec.config.json under --root — …'` | `CONFIG_RELPATH` interpolated |
| `spec-design-driver.js:336` | `'… in .claude/spec.config.json BEFORE binding regions.'` | `CONFIG_RELPATH` interpolated |
| `fleet-reader.js:82` | `fs.existsSync(claudeDir + '/spec.config.json')` | `configExists(dir)` |

## Acceptance Criteria

- **AC-20260820-08-1**: WHEN the config-read predicate is applied to a source line THE SYSTEM SHALL
  return offender for any line containing the literal `spec.config` that is not a comment line,
  regardless of whether the line also contains `readFileSync` or `path.join`
  (e.g. `const CONFIG_NAME = 'spec.config.json'` → offender; `const p = path.join(root, '.claude', CONFIG_NAME)` → green,
  it does not name the file) → test in `tests/host-config/config-read.test.js`
- **AC-20260820-08-2**: WHEN a source line contains the literal inside executable text and also
  carries a trailing `//` comment THE SYSTEM SHALL return offender
  (e.g. `const p = root + '//.claude/spec.config.json' // presence probe` → offender)
  → test in `tests/host-config/config-read.test.js`
- **AC-20260820-08-3**: WHEN the sweep walks `spec/scripts/` THE SYSTEM SHALL inspect every file at
  any depth with no extension, name-shape, or file-type filter, so that a non-`.js` file naming the
  config in executable text is reported
  (e.g. a `.sh` file whose line 3 is `jq -r '.gateCommand' ".claude/spec.config.json"` → reported as
  `<name>.sh:3`) → test in `tests/host-config/config-read.test.js`
- **AC-20260820-08-4**: WHEN the sweep encounters a file whose path relative to `spec/scripts/` is one
  of exactly `lib/host-config.js`, `smoke.sh`, `spec-state-gate.sh` THE SYSTEM SHALL skip it, and
  SHALL skip no other path (e.g. a file at `lib/host-config-helper.js` naming the config → reported)
  → test in `tests/host-config/config-read.test.js`
- **AC-20260820-08-5**: WHEN `configPath(root)` is called THE SYSTEM SHALL return the joined path
  `<root>/.claude/spec.config.json` (e.g. `configPath('/tmp/h')` → `/tmp/h/.claude/spec.config.json`)
  → test in `tests/host-config/host-config-api.test.js`
- **AC-20260820-08-6**: WHEN `configExists(root)` is called THE SYSTEM SHALL return `true` if a file
  system entry exists at `configPath(root)` and `false` otherwise, without opening, reading, or
  parsing the file — an unparsable config still returns `true`
  (e.g. root holding `{ not json` → `true`; root with no `.claude/` → `false`)
  → test in `tests/host-config/host-config-api.test.js`
- **AC-20260820-08-7**: WHEN `tests/host-config/config-read.test.js` is read THE SYSTEM SHALL contain
  no `DISPLAY_JOIN_EXEMPT` identifier and no clause conditioned on `readFileSync` or `path.join`
  → test in `tests/host-config/config-read.test.js`
- **AC-20260820-08-8**: WHEN `fleet-reader.js` discovers repos THE SYSTEM SHALL determine
  config presence via `configExists` from `lib/host-config.js`, and its source SHALL contain no
  occurrence of the literal `spec.config.json`
  → test in `tests/fleet-reader/discovery.test.js`
- **AC-20260820-08-9**: WHEN any of the seven remedy strings is printed THE SYSTEM SHALL render the
  path `.claude/spec.config.json` (e.g. `review-legs.js` with an unreadable config → stderr contains
  `cannot read .claude/spec.config.json under --root`; `fidelity-check.js` with an unreadable copy
  catalog → stderr contains `.claude/spec.config.json design.copyCatalogs`)
  → tests in `tests/host-config/host-config-api.test.js`
- **AC-20260820-08-10**: WHEN `scanConfigReadOffenders(scriptsRoot)` is called with a synthetic tree
  containing (a) `hoist.js` whose line 3 is `const CONFIG_NAME = 'spec.config.json'`, (b) `probe.sh`
  whose line 2 is `jq -r '.gateCommand' ".claude/spec.config.json"`, (c) `lib/host-config.js`
  containing `fs.readFileSync(path.join(root, '.claude', 'spec.config.json'))`, (d) `prose.js` whose
  only mention is `// reads .claude/spec.config.json`, and (e) `nested/deep/evade.js` whose line 1 is
  `const N = 'spec.config.json'` THE SYSTEM SHALL return exactly
  `['hoist.js:3', 'nested/deep/evade.js:1', 'probe.sh:2']` — the exempt file, the prose file, and no
  other path → test in `tests/host-config/config-read.test.js`
- **AC-20260820-08-11**: WHEN `scanConfigReadOffenders` walks a synthetic tree THE SYSTEM SHALL
  recurse into every subdirectory at any depth, so that case (e) above at two levels down is
  reported → test in `tests/host-config/config-read.test.js`
- **AC-20260820-08-12**: WHEN `readConfig`, `readConfigStrict`, or `declaredForge` is called THE
  SYSTEM SHALL CONTINUE TO behave exactly as before this spec — `readConfig` degrades to `{}` on
  absent/unreadable/unparsable/non-object, `readConfigStrict` throws naming the path and
  `cannot read/parse`, and returns a successful parse verbatim with no coercion
  → existing tests in `tests/host-config/config-read.test.js` retagged, plus
  `tests/host-config/host-config-api.test.js`
- **AC-20260820-08-15**: WHEN the predicate is applied to a line whose trimmed form begins with a
  character that is not a comment marker in the position it appears THE SYSTEM SHALL return offender
  (e.g. `#cfg = fs.readFileSync('.claude/spec.config.json', 'utf8')` → offender, a private class
  field; `*readCfg () { return fs.readFileSync('.claude/spec.config.json') }` → offender, a generator
  method; `/* */ const raw = fs.readFileSync('.claude/spec.config.json')` → offender, live code after
  a closed block comment), and SHALL return green for `# CONFIG=".claude/spec.config.json" (legacy)`
  and `#!/usr/bin/env bash  # reads .claude/spec.config.json`
  → test in `tests/host-config/config-read.test.js`
- **AC-20260820-08-16**: WHEN the predicate is applied to a line that splits the filename after the
  stem THE SYSTEM SHALL return offender (e.g. `const n = 'spec.config.' + 'json'` → offender)
  → test in `tests/host-config/config-read.test.js`
- **AC-20260820-08-13**: WHEN `tests/host-config/config-read.test.js`'s header is read THE SYSTEM
  SHALL state the three accepted residual evasions (a literal split across the stem itself, an encoded
  or computed filename, readdir-based discovery) and that no AST checker is used
  → test in `tests/host-config/config-read.test.js`
- **AC-20260820-08-14**: WHEN `spec/.claude-plugin/plugin.json` is read THE SYSTEM SHALL declare
  version `7.12.0` → test in `tests/consistency/plugin-version.test.js` (D15 — the "existing
  version-bump consistency test" the lock cited does not exist)

## Assumptions (escalation triggers)

- **A1 (executed 2026-08-20)**: The migration set is exactly eight lines in five files. Executed: a
  walk of every file under `spec/scripts/` applying the D2 predicate with the three D5 exemptions
  printed `env-preflight.js:64,70`, `fidelity-check.js:121,570`, `fleet-reader.js:82`,
  `review-legs.js:77,81`, `spec-design-driver.js:336` — eight lines — plus eight comment-line
  mentions (`ci-gate-parity.js:9,27`, `env-preflight.js:10,15`, `fidelity-check.js:17,47`,
  `scope-reconcile.js:15`, `smoke.sh:14`) all green under clause 2. **If false:** migrate the actual
  set; a site that is a genuine read rather than a display string gets `configPath`/`configExists`,
  not `CONFIG_RELPATH`.
- **A2 (executed 2026-08-20, negative claim)**: The current pin is fail-open on both a
  constant-hoisted Node read and a bash read. Executed: with `spec/scripts/__probe_hoist.js` (a
  five-line private read hoisting the filename to `const CONFIG_NAME`) and `spec/scripts/__probe_bash.sh`
  (`jq -r '.gateCommand' ".claude/spec.config.json"`) both live, `node --test 'tests/host-config/*.test.js'`
  reported `pass 5 / fail 0`. The same two probes under the D2/D4/D5 predicate were reported as
  `__probe_hoist.js:4` and `__probe_bash.sh:3`. Both probes deleted; `git status spec/scripts/` clean.
  **If false:** the spec's premise is gone — STOP and re-derive.
- **A3 (executed 2026-08-20)**: `DISPLAY_JOIN_EXEMPT` protects nothing today. Executed: the regex
  matched zero lines across every `.js` file under `spec/scripts/`; `spec/scripts/suite-baseline.js`,
  the file D10 cited as its reason, does not exist. **If false:** enumerate the lines it protects and
  migrate each to `configPath` before deleting the regex.
- **A4 (executed 2026-08-20)**: No test pins the two `fidelity-check.js` substrings that D10 changes.
  Executed: `tests/fidelity-check.test.js:436` asserts `/copy catalog app\/messages\/en\.json.*not readable/`,
  which does not span the parenthetical; grep for `design.copyCatalogs declared` across `tests/`
  found only a comment in `tests/design-driver.test.js:240`. **If false:** update the pin in place
  and retag it with AC-20260820-08-9 — never weaken it.
- **A5**: `spec/scripts/` contains only `.js` (26) and `.sh` (6) files today, and the three exempt
  paths are the only files that legitimately name the config. **If false:** the new file is an
  offender by design — decide explicitly whether it routes through the library or joins the
  exemption list; never widen by pattern.
- **A7 (executed 2026-08-20, from the Fable second opinion)**: Tightening the comment-prefix set to
  `//` plus non-identifier `#`, and scanning the stem `spec.config` rather than the full filename,
  reddens nothing legitimate in the tree. Executed: a prefix census of every line under
  `spec/scripts/` containing `spec.config` returned `{"//": 8, "#": 1, "CODE": 12}` — zero lines
  begin with `*` or `/*`; a grep for `spec.config` not followed by `.json` returned no hits; and no
  shell comment in the tree omits the space after `#`. **If false:** the offending legitimate line is
  rewritten as a `//` comment on its own line — a one-line remedy — never a widened prefix set.
- **A6**: Exporting `configPathFor` as `configPath` does not make `lib/host-config.js` an entry
  point — `tests/consistency/entrypoints.test.js:519` pins that `lib/` files are excluded from the
  manifest. **If false:** add the manifest row in the same diff.

## Rationale

The pin this spec replaces tried to answer "does this line read the config?" from one line of text.
That question is undecidable, so the predicate accumulated clauses — `readFileSync`, then
`path.join`, then a 70-character regex carving out an exemption for a display join — and each
clause was a new edge for the next author to fall off. Two executed probes today showed the two
edges that were already open: hoisting the filename to a constant breaks the one-line pairing the
predicate requires, and the `.js` filter means a bash script reading the config with `jq` is not
inspected at all. The second is not hypothetical drift — `smoke.sh` and `spec-state-gate.sh` do
exactly that today and the pin has been green over them since it landed.

Banning the name substitutes a decidable question. A private read has to spell the filename
somewhere, so one rule covers constant-hoisting, multi-line construction, template literals, and
shelling out. The cost is friction: a future legitimate reason to name the file must first earn a
library export. That friction is the mechanism, not a side effect — it is what turned the previous
recurrence (three private readers drifting apart on error policy) into one library in the first
place.

Two alternatives were rejected. Intercepting real file opens at runtime via a `--require` shim sees
only code paths that execute, so a config read behind a flag stays invisible — fail-open in a new
dimension, for a per-entrypoint harness this zero-dependency repo would hand-maintain. Deleting the
pin outright was rejected on materiality: the config-read class has three recorded paydowns
(2026-08-12 glob-match, 2026-08-14 ci-query/observe-ci, 2026-08-15 the strict-reader recurrence a
day after the second), and the guard-evasion class now has two recorded members — the entry-point
guard's extension allowlist closed by specs/20260820/04 on 2026-08-20, and this one.

The exemption list is the part most worth watching. A named-path allowlist and an extension filter
look similar and are not: a new file cannot join a literal list by existing, so every future script
that names the config goes red and forces a decision, whereas the extension filter admitted every
future non-`.js` file silently. Routing the two shell scripts through a sourced `lib/host-config.sh`
would remove the list entirely and was the stricter option on the table; it was declined for this
spec because one of the two is the session hook that runs before every prompt in every host repo,
which this repo's own risk tiers make a critical-tier surface. That option stays open.

**Second opinion (Fable, 2026-08-20), and what it changed.** The approach was confirmed —
ban-the-name over an extension-blind, location-scoped walk with a closed named exemption list is the
right invariant under a zero-dependency constraint, and it is simpler than the predicate it replaces.
Three amendments came out of it, each verified against the tree before adoption (A7). First, the
comment-prefix set as originally drafted was itself an evasion surface: `*`, `/*`, and `#` all begin
executable JavaScript, so a private class field or a generator method reading the config would have
passed clause 2 — the same shape as today's hoist. Second, the falsifiability plan was half theater:
today's failure was two components failing open independently, and a fixture string exercises only
the predicate, so a future name-shape filter in the walk would have been invisible again — hence the
parameterized root and the end-to-end canary. Third, scanning the stem rather than the full filename
closes the `'spec.config.' + 'json'` split for free, since the tree contains no bare `spec.config`
token. It also confirmed independently that all eight migration lines are classified correctly (the
`readFileSync` near `fidelity-check.js:121` reads the copy catalog, not the config), that the literal
appears nowhere under `spec/bin/`, `spec/hooks/`, or root `scripts/`, and that a `lib/host-config.sh`
would relocate the literal into a fourth exempt file without removing a single bash read — buying
nothing while pricing in hook risk. Its one rejected suggestion is recorded as out of scope: the
stray NUL byte in `fidelity-check.js` is a standing landmine for every future grep-shaped tool, not
just this pin, and deserves its own one-line fix rather than a fourth mechanism designed around it.

**Collision closure (run at lock, 2026-08-20).** The literals leg reports `d10-predicate-v1`,
`DISPLAY_JOIN_EXEMPT`, and `display-join` living in exactly one file,
`tests/host-config/config-read.test.js`, which is already a File Plan row — closed, no waive owed.
The paths leg reports one `likely` hit, `tests/consistency/entrypoints.test.js`, against
`env-preflight.js`, `lib/host-config.js`, and `review-legs.js`: **waived** — that test diffs the
entry-point manifest against real call sites, and this spec adds no script, deletes none, and
renames none; the one new call site (`fleet-reader.js` requiring `lib/host-config.js`) is a `lib/`
require, and `lib/` is excluded from the manifest by that test's own pin at line 519 (A6). The
remaining hits are `mentions` tier, which owe no waive line.

**Review disposition (2026-08-21, runId `rv_ee8a27ff5a0c`, CLEAN).** The reviewer returned zero
survivors. The only leg finding was scope-reconcile's `outOfPlan=12`, **waived** in full: none of
the twelve paths appears in this spec's build commit `7687071`. Six are agent-memory writes (this
build's workers plus specs/20260820/05's fix batch), four are unrelated design-flow roadmap and ADR
work from an adjacent session, and two were browser-session scratch files. At close the scratch was
deleted and `.playwright-mcp/` gitignored, and the design roadmap/ADR work was committed separately
as `196bdaf` so this spec's close commit describes only its own contents. One follow-on repair rode
the close: the gate-scripts agent memory still taught `configPathFor(root)` as the sanctioned
existence-check route, an export D7 retires — rewritten to teach `configExists`/`configPath`/
`CONFIG_RELPATH` and the ban itself, so the next worker is not steered to a dead import.

**Deviations folded 2026-08-21** (sidecar deleted; the two recurring-shaped items went to the
host rules' Gotchas — the collision-closure retires-vs-inherits gap as a new entry, and the
vacuous-red-pin count as an update to the existing one):

- AC-20260820-08-9's own worked example named an unreachable branch. The message it quotes sits
  behind `readConfig(root)` throwing, and `readConfig` never throws — it swallows every
  read/parse failure to `{}`. The test executes the reachable remedy instead (absent config
  degrades to `{}`, `gateCommand` then reports missing, which is one of the same seven D9 remedy
  strings and does render the path). Not blocked: the AC's normative text is satisfied by the
  reachable arm; only its illustration was dead.
- A1's migration table was stale on `fleet-reader.js`. It listed eight sites in five files; the
  `fleet-reader.js` entry had already been migrated by the 2026-08-20 review of specs/20260820/05.
  Executed at Phase 0, the predicate reported seven offenders in four files. Per A1's own
  escalation clause the actual set was migrated and D8's substance applied in full.
- D15 — AC-20260820-08-14 had no carrier. It cites "the existing version-bump consistency test";
  executed at Phase 0, no test read `plugin.json`'s `version`, so the AC would have been reported
  uncovered at review. Closed with `tests/consistency/plugin-version.test.js`, pinning the durable
  invariant (semver shape, numerically greater than 7.11.0, exactly three changelog versions,
  leading version equals the declared one) rather than the literal `7.12.0`.
- Red-check note: most of this spec's ACs are green-by-construction. The guard IS the test —
  `offendingLine` and `scanConfigReadOffenders` live inside `tests/host-config/config-read.test.js`,
  so AC-1/-2/-3/-4/-7/-10/-11/-13/-15/-16 pass the moment the test author writes them. The observed
  file-level red came from the production pin (seven live migration sites), AC-5/-6 (missing
  exports), and AC-9's `fidelity-check.js` leg: six failing assertions across four files, each
  attributable to the contract. Recorded because "13 of 14 green at red-check" reads as a weak TDD
  phase and is not — it is the shape of a spec whose deliverable is a predicate living in a test.
- The Contracts block's NUL-byte claim is stale. It states `fidelity-check.js` carries a stray NUL
  byte that makes `grep` classify it as binary; executed at Phase 4, the file contains zero NUL
  bytes at `diff_base` and after the migration. Nothing changes — the pure `fs` walk is right on
  D4's independent grounds — but the Rationale's "standing landmine for every future grep-shaped
  tool" describes a condition not in the tree.

## Canonical Delta

`docs/canonical/gate-integrity.md` — extend the "Every executable declares who calls it" bullet's
closing sentence into a standing rule of its own, appended as a new bullet after it:

- **Guards ban the name, not the shape.** Where a guard exists to force one route to a resource,
  it forbids *naming* the resource outside the sanctioned module rather than trying to detect uses
  of it: `tests/host-config/config-read.test.js` reports any line under `spec/scripts/` containing
  the stem `spec.config` outside a comment, with a closed list of three literal exempt paths
  (`lib/host-config.js`, `smoke.sh`, `spec-state-gate.sh`). Two supporting rules travel with it. The
  comment exemption is `//` plus `#` not followed by an identifier character, and nothing else —
  `*`, `/*`, and a trailing `//` all begin or contain executable code, so treating them as prose is
  a hole, and a legitimate mention that trips the rule is rewritten as its own `//` line. And the
  guard's falsification is an end-to-end canary over a synthetic tree, never a fixture string fed to
  the predicate alone: a guard with two components can fail open in either, and only the walk-plus-
  predicate-plus-exemption path proves both. "Does this line read X?" is
  undecidable from source text and every read-detecting predicate grows clauses until one is
  hoisted around; "does this line name X?" is decidable in one comparison. The exemption is a list
  of literal paths, never a pattern — a list cannot be joined by a new file merely existing, which
  is the distinction between this and the extension filters the Gotchas entry condemns. Accepted
  residual: deliberately split or computed literals and readdir-based discovery still evade, which
  is irreducible without an AST and out of scope for a zero-dependency repo.
