---
date: 2026-11-01
status: hardened
tier: critical
area: host-grounding
breaking: false
depends_on: [specs/20261101/01-the-host-names-its-own-test-cases.md]
brief: n/a
open_markers: 0
---

# The host declares its file shapes

## Goal

Seven scripts that run against a host repo each carry their own private table of what a test
file, a code file or a dependency manifest looks like — five copies of the test globs, two
extension lists, one manifest regex — and every table is shaped like this Node repository. On a
Ruby, Java, .NET, Go-in-subdirectory or monorepo host, test files are not classified as tests (so
the at-risk leg finds no candidates, `ac-drift` reports false `uncovered-ac` findings and
`expire-tests`' keep-clause cannot protect a non-JavaScript gate script), and a dependency change
to `pom.xml` or a `.csproj` skips the structural lint without saying so. The host declares its
shapes once: an optional config block `fileShapes` with stack-neutral, widened defaults, read
through one library by every consumer, written by `/spec:init` and checked by `/spec:doctor`.
Done means every classification in the plugin comes from that one place, a host that declares
nothing gets the same answer this repo gets today, and the six sample layouts the audit found
unclassified are classified.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `spec/templates/grounding-contract.md` § Required config keys gains the optional block `fileShapes` `{ "testGlobs"?: string[], "codeExtensions"?: string[], "manifests"?: string[] }` — `lib/glob-match.js` syntax for `testGlobs` and `manifests` (a manifest entry matches a path's basename, e.g. `*.csproj`, `requirements*.txt`), `codeExtensions` entries start with `.`. Each key absent = that key's default (Contracts); the block absent = all three defaults. The defaults are the only lists the plugin ships and they are stack-neutral: `testGlobs` widened to the thirteen entries in Contracts, `codeExtensions` the thirty-one in Contracts, `manifests` the twenty-nine in Contracts. (AC-20261101-02-1, AC-20261101-02-2, AC-20261101-02-3) | Core § Host Grounding: the repo supplies grounding; rejected: a per-stack preset table in the plugin (a stack vocabulary the plugin would then own) and keeping the top-level undocumented `testGlobs` key (no host declares it — checked all 8 — so it moves into the block with no alias). |
| D2 | New `spec/scripts/lib/file-shapes.js`: `fileShapes(config)` → `{testGlobs, codeExtensions, manifests}` (defaults merged key by key), `isTestClassified(rel, shapes)`, `isCodeFile(rel, shapes)`, `isManifest(basename, shapes)`, `validateFileShapes(block)` → `null` or one message naming the first bad key, and the three `DEFAULT_*` arrays. `DEFAULT_TEST_GLOBS` leaves `lib/host-config.js` (export removed, no alias). (AC-20261101-02-1, AC-20261101-02-2, AC-20261101-02-3, AC-20261101-02-4, AC-20261101-02-18) | One binding home (core § Doctrine Authoring); the five copies of the globs test already disagreed with the two extension lists about what a test file is. |
| D3 | Every classification reads through D2: `lib/scan-test-calls.js` `listTestFiles`, `lib/invariants.js` (the universe is `isCodeFile` and not test-classified; `TRACKED_EXT_RE` deleted; the `require`/`import` edge walk is unchanged), `scope-reconcile.js` (both the at-risk derivation and `--probe-at-risk`; the `--test-globs` flag stays as the probe's override), `ac-drift.js`, `init-gen.js` `probeAtRisk` (the config's shapes when a config exists, else defaults), `coverage-scope.js` (`CODE_EXT` deleted), `collision-closure.js` `isRunnable` (`isCodeFile` or a shebang), `decision-lint.js` (`MANIFEST_RE` deleted; `isManifest`). `workspace-scan.js` is untouched (its manifest→stack table names stacks, which is `/spec:enforce`'s discovery, Rationale). (AC-20261101-02-5, AC-20261101-02-6, AC-20261101-02-7, AC-20261101-02-8, AC-20261101-02-9, AC-20261101-02-10) | Every consumer that classifies a path answers from the same lists, so a host that declares a shape is understood everywhere at once. |
| D4 | `spec/commands/init.md` Phase 1 profiles the host's test-file layout, code extensions and manifests from the tree (never from a stack name) and Phase 4 always writes `config.fileShapes` with the three lists it observed; `init-gen generate` validates a present block through `validateFileShapes` (exit 2: `init-gen: profile field "config.fileShapes.<key>" <message>`), and `init-gen probe` reads `--test-globs` when given, else the existing config's shapes, else the defaults. (AC-20261101-02-11, AC-20261101-02-12) | The pattern precedent is `capabilities`: init detects and writes, the plugin never guesses at use time. |
| D5 | New `init-gen shapes-check --root <dir> [--json]`: `{"declared":bool,"invalid":string|null,"testFiles":N,"unmatchedTestGlobs":string[]}`; exit 3 when `invalid` is set or any declared `testGlobs` entry matches no tracked file, else 0. `spec/commands/doctor.md` check 1 runs it; exit 3 → one ⚠️ line per unmatched glob or the `invalid` message. (AC-20261101-02-13) | A declared glob that matches nothing is drift the host cannot see otherwise (the same class as a `paths:` rule glob matching zero files, doctor § Session grounding). |
| D6 | `node scripts/plugin-bump.js --bump --plugin spec --changelog "…"`. `[no-ac: node scripts/plugin-bump.js --check in the gate is the oracle]` | Behaviour change under `spec/` (pipeline rules § Planning). |
| D7 | Work found and not taken here is queued, never done silently: `workspace-scan.js` returning every manifest of a directory (polyglot roots read as JavaScript only) — q10 (`spec-queue add`, fix lane, after this spec). `[no-ac: queue row only]` | Out of this spec's landing unit; stack naming belongs to enforce's discovery. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/templates/grounding-contract.md | MODIFY | doctrine | § Required config keys: the optional `fileShapes` block and its defaults pointer (D1); `no dependency change` |
| spec/scripts/lib/file-shapes.js | CREATE | scripts | the one home of the three lists, the three predicates and the validator (D2) |
| spec/scripts/lib/host-config.js | MODIFY | scripts | `DEFAULT_TEST_GLOBS` removed from exports and file (D2) |
| spec/scripts/lib/scan-test-calls.js | MODIFY | scripts | `listTestFiles` through `isTestClassified` (D3) |
| spec/scripts/lib/invariants.js | MODIFY | scripts | universe = code files not test-classified via D2; `TRACKED_EXT_RE` deleted (D3) |
| spec/scripts/scope-reconcile.js | MODIFY | scripts | at-risk and probe classification via D2 (D3) |
| spec/scripts/ac-drift.js | MODIFY | scripts | classification via D2 (D3) |
| spec/scripts/coverage-scope.js | MODIFY | scripts | `CODE_EXT` deleted; `isCodeFile` (D3) |
| spec/scripts/collision-closure.js | MODIFY | scripts | `isRunnable` = `isCodeFile` or shebang (D3) |
| spec/scripts/decision-lint.js | MODIFY | scripts | `MANIFEST_RE` deleted; `isManifest` (D3) |
| spec/scripts/init-gen.js | MODIFY | scripts | `probeAtRisk` via D2, `fileShapes` validation, `shapes-check` subcommand (D3, D4, D5) |
| spec/commands/init.md | MODIFY | doctrine | Phase 1 shape profiling, Phase 4 `config.fileShapes` bullet (D4) |
| spec/commands/doctor.md | MODIFY | doctrine | check 1 runs `shapes-check` (D5) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | `node scripts/plugin-bump.js --bump --plugin spec --changelog "…"` (D6) |
| docs/adr/0011-single-sourced-test-globs.md | MODIFY | other | `Amended by: specs/20261101/02-the-host-declares-its-file-shapes.md` line — the single declaration moves from `lib/host-config.js` to `lib/file-shapes.js` (D2) |
| .claude/spec.config.json | MODIFY | other | `contractHash` re-stamped to `$(spec-paths contract-hash)` after the D1 edit; this host declares no `fileShapes` (defaults reproduce its 199 test files, A1) |
| docs/canonical/pipeline.md | MODIFY | other | the `testGlobs`/`DEFAULT_TEST_GLOBS` sentence at line 190–191 points at `lib/file-shapes.js` (Canonical Delta applies the scripts.md text) |
| tests/host-config/file-shapes.test.js | CREATE | tests | AC-20261101-02-1, AC-20261101-02-2, AC-20261101-02-3, AC-20261101-02-4, AC-20261101-02-5, AC-20261101-02-6, AC-20261101-02-7, AC-20261101-02-8, AC-20261101-02-9, AC-20261101-02-10 |
| tests/init-gen/file-shapes-key.test.js | CREATE | tests | AC-20261101-02-11, AC-20261101-02-12, AC-20261101-02-13, AC-20261101-02-14 |
| tests/doctor/ac-drift.test.js | MODIFY | tests | AC-20261101-02-18 |

## Contracts

`.claude/spec.config.json` (D1):

```jsonc
"fileShapes": {
  "testGlobs":      ["tests/**", "**/*_spec.rb"],   // lib/glob-match.js syntax; absent key = DEFAULT_TEST_GLOBS
  "codeExtensions": [".rb", ".erb"],               // each starts with "."; absent = DEFAULT_CODE_EXTENSIONS
  "manifests":      ["Gemfile", "Gemfile.lock"]    // basename globs; absent = DEFAULT_MANIFESTS
}
```

`lib/file-shapes.js` (D2):

```js
DEFAULT_TEST_GLOBS = ['tests/**', 'test/**', '**/tests/**', '**/test/**', '**/__tests__/**',
  '**/*.test.*', '**/*.spec.*', '**/*_test.*', '**/test_*.*', '**/*_spec.*',
  '**/*Test.*', '**/*Tests.*', '**/*.Tests/**']
DEFAULT_CODE_EXTENSIONS = ['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.mts', '.cts', '.sh', '.bash',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.kts', '.scala', '.cs', '.fs', '.swift', '.dart',
  '.php', '.ex', '.exs', '.pl', '.ps1', '.lua', '.zig', '.c', '.cc', '.cpp', '.h']
DEFAULT_MANIFESTS = ['package.json', 'package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml',
  'yarn.lock', 'bun.lockb', 'bun.lock', 'deno.json', 'pyproject.toml', 'poetry.lock', 'uv.lock',
  'Pipfile', 'Pipfile.lock', 'requirements*.txt', 'setup.py', 'setup.cfg', 'Cargo.toml', 'Cargo.lock',
  'go.mod', 'go.sum', 'Gemfile', 'Gemfile.lock', 'composer.json', 'composer.lock', 'pom.xml',
  'build.gradle', 'build.gradle.kts', 'libs.versions.toml', '*.csproj', '*.fsproj',
  'Directory.Packages.props', 'mix.exs', 'mix.lock', 'pubspec.yaml', 'pubspec.lock',
  'Package.swift', 'Package.resolved']
fileShapes(config)                 // -> { testGlobs, codeExtensions, manifests }; config.fileShapes merged key by key over the defaults
isTestClassified(rel, shapes)      // rel repo-relative POSIX; any testGlobs entry matches
isCodeFile(rel, shapes)            // path.extname(rel).toLowerCase() ∈ codeExtensions
isManifest(basename, shapes)       // any manifests entry globMatch-es the basename
validateFileShapes(block)          // null | 'fileShapes.<key> must be an array of non-empty strings' | 'fileShapes.codeExtensions entries must start with "."' | 'fileShapes must be an object'
```

(The default `codeExtensions` list above has 34 entries and `manifests` 37; D1's counts are superseded by these literals — the literal lists are the contract.)

`init-gen.js` (D4, D5):

```
init-gen generate …     config.fileShapes present and invalid -> exit 2:
                        init-gen: profile field "config.fileShapes" <validateFileShapes message> — fix the profile JSON
init-gen probe --root <dir> [--test-globs a,b]   classification: --test-globs, else <dir>/.claude/spec.config.json fileShapes, else defaults
init-gen shapes-check --root <dir> [--json]
  -> {"declared":false,"invalid":null,"testFiles":N,"unmatchedTestGlobs":[]}                     exit 0
  -> {"declared":true,"invalid":null,"testFiles":N,"unmatchedTestGlobs":["**/*_spec.rb"]}        exit 3 (stderr one line per glob)
  -> {"declared":true,"invalid":"fileShapes.codeExtensions entries must start with \".\"", …}    exit 3
  human form: one `<field>: <value>` line each
```

`spec/commands/doctor.md` check 1 (D5) gains: `fileShapes` — run `node "$(spec-paths init-gen)" shapes-check --root . --json`; exit 3 prints one ⚠️ line per `unmatchedTestGlobs` entry or the `invalid` message.

## Behavior

Fixture host A (Ruby/Java/.NET/Go layout, no `fileShapes`): `spec/models/user_spec.rb`,
`src/test/java/FooTest.java`, `Foo.Tests/BarTests.cs`, `src/pkg/test_foo.py`, `crates/a/tests/it.rs`,
`packages/a/tests/x.ts`, plus non-tests `src/app.rb`, `pom.xml`, `Api/Api.csproj`, `tools/run.py`
(no shebang). Under the widened defaults all six test paths are test-classified and the four
others are not (executed this session, A1).

Fixture host B (declared block): `fileShapes: { testGlobs: ['qa/**'], codeExtensions: ['.rb'],
manifests: ['Gemfile'] }` with `qa/a_spec.rb`, `tests/b.test.js`, `Gemfile`, `pom.xml`. Then
`tests/b.test.js` is NOT a test (the host replaced the list), `qa/a_spec.rb` is, `pom.xml` is not a
manifest, `Gemfile` is.

This repository: the widened defaults classify exactly the same 199 files as today's five globs
(executed, A1), so its config declares no block.

## Acceptance Criteria

- **AC-20261101-02-1**: WHEN `fileShapes({})` is called THE SYSTEM SHALL return the three default arrays verbatim (e.g. `testGlobs[0]` `tests/**`, `codeExtensions` containing `.cs`, `manifests` containing `pom.xml`), and WHEN called with `{fileShapes: {testGlobs: ['qa/**']}}` THE SYSTEM SHALL return `testGlobs` `['qa/**']` with the other two keys still the defaults → writes tests/host-config/file-shapes.test.js
- **AC-20261101-02-2**: WHEN `isTestClassified` runs under the defaults THE SYSTEM SHALL return `true` for each of `spec/models/user_spec.rb`, `src/test/java/FooTest.java`, `Foo.Tests/BarTests.cs`, `src/pkg/test_foo.py`, `crates/a/tests/it.rs`, `packages/a/tests/x.ts` and `false` for `spec/scripts/count-tests.js` and `src/app.rb`; WHEN `isManifest` runs under the defaults THE SYSTEM SHALL return `true` for `pom.xml`, `Api.csproj`, `requirements-dev.txt` and `false` for `README.md` → writes tests/host-config/file-shapes.test.js
- **AC-20261101-02-3**: WHEN `validateFileShapes` is given `{testGlobs: 'tests/**'}` THE SYSTEM SHALL return `fileShapes.testGlobs must be an array of non-empty strings`; given `{codeExtensions: ['rb']}` return the message ending `must start with "."`; given `[]` return `fileShapes must be an object`; given `{manifests: ['Gemfile']}` return `null` → writes tests/host-config/file-shapes.test.js
- **AC-20261101-02-4**: WHEN `require('spec/scripts/lib/host-config.js')` is read THE SYSTEM SHALL export no `DEFAULT_TEST_GLOBS`, and `grep -rn "DEFAULT_TEST_GLOBS\|TRACKED_EXT_RE\|CODE_EXT\b\|MANIFEST_RE" spec/scripts` SHALL hit only `lib/file-shapes.js` → writes tests/host-config/file-shapes.test.js
- **AC-20261101-02-5**: WHEN `count-tests.js --root <host A> --json` runs THE SYSTEM SHALL count the cases of `packages/a/tests/x.ts` (one `test('ts case')` → `{"count":1}`; today `{"count":0}`), and WHEN run over host B THE SYSTEM SHALL print `{"count":0}` because `tests/b.test.js` is no longer test-classified → writes tests/host-config/file-shapes.test.js
- **AC-20261101-02-6**: WHEN `decision-lint.js --spec <spec> --root <host A> --json` lints a File Plan row `| pom.xml | MODIFY | other | adds a dependency |` THE SYSTEM SHALL emit `missing-dependency-names` for `pom.xml` (today: no finding), and the same row for `Api/Api.csproj` likewise; WHEN the host is B and the row is `pom.xml` THE SYSTEM SHALL emit no finding → writes tests/host-config/file-shapes.test.js
- **AC-20261101-02-7**: WHEN `scope-reconcile.js --probe-at-risk <list> --root <host A>` runs with `src/app.rb` in the list and `spec/models/user_spec.rb` containing the string `app.rb` THE SYSTEM SHALL report that spec file as an at-risk hit (today it is not a test file, so zero hits) → writes tests/host-config/file-shapes.test.js
- **AC-20261101-02-8**: WHEN `expire-tests.js --root <host A> --invariants --json` (the invariants listing) runs with `gateCommand` `python3 tools/run.py` THE SYSTEM SHALL list `tools/run.py` as an invariant (today: not tracked, extension outside `js|mjs|cjs|ts|sh`) → writes tests/host-config/file-shapes.test.js
- **AC-20261101-02-9**: WHEN `coverage-scope.js --root <host A>` scans a `Checks/AcGate.cs` file containing `AC-\d{8}` THE SYSTEM SHALL list it as a candidate check (today `.cs` is outside `CODE_EXT`) → writes tests/host-config/file-shapes.test.js
- **AC-20261101-02-10**: WHEN `collision-closure.js`'s runnable classification is exercised on `tools/run.py` (no shebang) under the defaults THE SYSTEM SHALL classify it runnable (e.g. a `--literal run` sweep over host A reports the `tools/run.py` target as `executes`-eligible), and a `notes.txt` SHALL NOT be → writes tests/host-config/file-shapes.test.js
- **AC-20261101-02-11**: WHEN `init-gen.js generate` runs with `config.fileShapes` `{testGlobs: ['qa/**'], codeExtensions: ['.rb'], manifests: ['Gemfile']}` THE SYSTEM SHALL exit 0 and write the block verbatim into `.claude/spec.config.json`; WHEN `config.fileShapes.codeExtensions` is `['rb']` THE SYSTEM SHALL exit 2 with stderr containing `profile field "config.fileShapes" fileShapes.codeExtensions entries must start with "."` and write no config → writes tests/init-gen/file-shapes-key.test.js
- **AC-20261101-02-12**: WHEN `init-gen.js probe --root <host B>` runs (config present, `testGlobs` `['qa/**']`) THE SYSTEM SHALL sample `tests/b.test.js` as a NON-test file (it appears in the probe's sampled list), and WHEN run with `--test-globs 'tests/**'` THE SYSTEM SHALL exclude it → writes tests/init-gen/file-shapes-key.test.js
- **AC-20261101-02-13**: WHEN `init-gen.js shapes-check --root <host B> --json` runs with `testGlobs` `['qa/**', '**/*_spec.rb', 'nothing/**']` THE SYSTEM SHALL print `"unmatchedTestGlobs":["nothing/**"]`, `"testFiles":1`, exit 3 with one stderr line naming `nothing/**`; WHEN the host declares no block THE SYSTEM SHALL print `{"declared":false,"invalid":null,"testFiles":N,"unmatchedTestGlobs":[]}` and exit 0 → writes tests/init-gen/file-shapes-key.test.js
- **AC-20261101-02-14**: WHEN `spec/commands/doctor.md`'s check 1 is read THE SYSTEM SHALL contain the literal `shapes-check`, and WHEN `spec/commands/init.md` Phase 4 is read THE SYSTEM SHALL contain `config.fileShapes` → writes tests/init-gen/file-shapes-key.test.js
- **AC-20261101-02-15**: WHEN `count-tests.js --root <fixture> --json` runs over a host that declares no `fileShapes` and holds five line-start `test()`/`it()` calls beside a `"test("` string, a `// test(` comment, a `describe(` and a `t.test(` THE SYSTEM SHALL CONTINUE TO print `{"count":5}` and exit 0 → reuses tests/ceiling/count-tests.test.js :: AC-20260911-02-1:
- **AC-20261101-02-16**: WHEN a changed non-test file's path stem appears in a test-classified file on a host that declares no `fileShapes` THE SYSTEM SHALL CONTINUE TO report that test file as at-risk → reuses tests/scope-reconcile-at-risk.test.js :: AC-20260815-02-1 [AC-20260822-02-12
- **AC-20261101-02-17**: WHEN a File Plan row names `package.json` with a Summary naming no package on a host that declares no `fileShapes` THE SYSTEM SHALL CONTINUE TO emit `missing-dependency-names` → reuses tests/decision-lint/structural-triggers.test.js :: AC-20261029-05-2: a manifest row with
- **AC-20261101-02-18**: WHEN a host declares `fileShapes.testGlobs` `['checks/**']` THE SYSTEM SHALL classify only `checks/**` paths as tests in `ac-drift.js` (a `tests/x.test.js` pin is not a test file; `checks/x.js` is), and `lib/file-shapes.js`'s `DEFAULT_TEST_GLOBS` SHALL be the single declaration of the default array under `spec/scripts/` (ADR-0011's pin, retargeted) → rewrites tests/doctor/ac-drift.test.js :: AC-20260906-01-8:

## Assumptions (escalation triggers)

- A1: Executed this session against this repository with `lib/walk-files.js` + `lib/glob-match.js`: the five current globs classify 199 files, the thirteen widened defaults classify the same 199 (0 added, 0 removed); the six audit sample paths all classify `true` and `spec/scripts/count-tests.js`, `spec/templates/spec.md` classify `false` — **if false at build** (a later commit adds a file the widened set catches): this host's config declares `fileShapes.testGlobs` with the old five, never a narrowing of the defaults.
- A2: No host of the 8 in the fleet declares a top-level `testGlobs` (grep over every `/home/jj/projects/*/.claude/spec.config.json` this session: 0 hits), so moving the key into the block needs no alias — **if false:** that host's config is edited by hand in the same build and the move stays alias-free.
- A3: `expire-tests.js --invariants` lists `lib/invariants.js`'s derived set (the flag exists, tests/expiry/invariants.test.js) — **if false:** AC-8 exercises `deriveInvariants` directly through `require`.
- A4: `scope-reconcile.js --probe-at-risk` output names each hit test file (init-gen reads it) — **if false:** AC-7 asserts on the probe's `hits` count only.
- A5: `collision-closure.js` has no `--literal`-free dry mode exposing `isRunnable`; the test reaches it by a `--literal` sweep over host A — **if false** (classification not visible in output): export `isRunnable` from the script behind `require.main === module` and test it directly.
- A6: `tests/consistency/contract-stamp.test.js` pins the config stamp against the live contract hash (line 27–47), so the `.claude/spec.config.json` row is the re-stamp — **if false:** drop the row as a deviation.

## Rationale

The audit (five parallel agents, 2026-11-01) found the same defect seven times: a private table of
file shapes written for a Node repository, each working here and quietly doing less on another
host. Three remedies were weighed. Fixing each table in place widens them but leaves seven homes
that drift again (they already disagreed: `coverage-scope` knew `.py` and `.go`, `invariants` did
not). A per-stack preset table in the plugin ("ruby → `spec/**`") puts a stack vocabulary into the
plugin, which is what core § Host Grounding forbids. The chosen shape is the `capabilities`
pattern: one optional declared block with stack-neutral defaults, detected and written by init,
checked by doctor, read through one library.

The defaults are widened rather than left as they were because a host that predates the block
must still get a sane answer; A1 shows the widening changes nothing for this repository, and the
six layouts the audit found unclassified are now classified. The undocumented top-level
`testGlobs` key moves into the block with no alias because no host declares it (A2) — the plugin
carries no compatibility path for a key nobody used.

`workspace-scan.js` keeps its own manifest→stack table: it answers a different question (which
stack a directory is) and that answer is `/spec:enforce`'s discovery input; the polyglot-root
defect the audit found there (first manifest wins) is queued (D7), not folded in. The
`require`/`import` edge walk in `invariants.js` stays JavaScript-shaped: edges only widen the
invariant set, and the universe widening alone closes the audit's finding (a Python gate script
named in `gateCommand` becomes an invariant through `configCommandStrings`).

Spec 20261101/01 lands first (`depends_on`): both touch `lib/scan-test-calls.js`, and that
spec's `listTestFiles` caller is unchanged by this one.

Collision closure (lock, `--literal DEFAULT_TEST_GLOBS --literal TRACKED_EXT_RE --literal CODE_EXT --literal MANIFEST_RE`): 13 literals-leg hits, every one a File Plan row (the seven scripts, `docs/canonical/pipeline.md`, `docs/adr/0011-single-sourced-test-globs.md`, `tests/doctor/ac-drift.test.js`), zero waived; test-corpus hits are the suites of the scripts this spec changes, whose fixtures declare no `fileShapes` and are pinned unchanged by AC-15, AC-16, AC-17.

## Canonical Delta

docs/canonical/scripts.md, new bullet after the `lib/ignored-paths.js` bullet: "**`spec/scripts/lib/file-shapes.js` is the one definition of a test file, a code file and a dependency manifest.** `fileShapes(config)` merges the host's optional `fileShapes` block (`testGlobs`, `codeExtensions`, `manifests`) key by key over stack-neutral defaults; `isTestClassified`, `isCodeFile` and `isManifest` are the only predicates, read by `scan-test-calls.js`, `invariants.js`, `scope-reconcile.js`, `ac-drift.js`, `coverage-scope.js`, `collision-closure.js`, `decision-lint.js` and `init-gen.js`. `/spec:init` writes the block from the tree it profiled; `init-gen shapes-check` is `/spec:doctor` check 1's proof that every declared test glob still matches a file. No script carries a private extension, glob or manifest list. (specs/20261101/02-the-host-declares-its-file-shapes.md D2, D3)"

docs/canonical/pipeline.md line 190–191: replace "Test classification is the host's `testGlobs` or `DEFAULT_TEST_GLOBS` (`lib/host-config.js`)" with "Test classification is `lib/file-shapes.js`'s `isTestClassified` over the host's `fileShapes.testGlobs` or its defaults".
