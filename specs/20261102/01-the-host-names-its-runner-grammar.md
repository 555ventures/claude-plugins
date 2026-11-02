---
date: 2026-11-02
status: done
tier: critical
area: host-grounding
breaking: true
depends_on: []
brief: 31
spiked: 2026-11-02
build_base: main
open_markers: 0
diff_base: 60dff05d657080ce33f1348b31e322873e8272f8
---

# The host names its runner's grammar

## Goal

Four places assume how a host's test runner, CI forge and git trunk behave, and each yields a
wrong verdict on a non-Node or non-GitHub host without an error: the test file is always
appended to `testCommand`, the gate log's failure count is read from two built-in shapes, the
review diffs against `main`-then-`master`, and a `gh` failure on a non-GitHub remote reads as
retryable so the CI leg passes with no evidence. The host declares, once, how its own tools
speak — a `{file}` placeholder, `capabilities.failCountPattern`, `trunk`, and a fail-closed
`capabilities.forge` — and every leg that runs them reads the declaration; `/spec:init` detects
and writes the four, `/spec:doctor` re-checks them with one deterministic line. Done means a host
that declares nothing gets byte-for-byte today's commands, counts and base, except that CI
evidence is now reported absent rather than assumed, and `cargo test`, `go test ./pkg/...`,
`dotnet test --filter` and `mvn -Dtest=` are all expressible.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `spec/templates/grounding-contract.md` — this spec's one edit: § Required config keys documents (a) the `{file}` placeholder in `testCommand` and `typecheckCommand` (where present, the plugin substitutes the file path(s) there — one quoted path in `red-check.js`, the quoted space-joined list in the at-risk leg — and the `testNameFilter` fragment is appended after the substituted command; absent, the path(s) are appended as today, the filter fragment ahead of the path) and (b) the optional key `trunk` (the branch the review stage diffs against when the spec pins neither `diff_base` nor `build_base`; absent = the `main`-then-`master` probe, printed as a derived default). § Capabilities gains `failCountPattern` (a regex over the gate log whose group 1 is the failure count, read ahead of the built-in shapes; `"none"` = the runner prints no count; absent = built-ins) and rewrites the forge paragraph: `forge` is `github` or `none`; an absent block, an absent key, or any other value is **no forge adapter** — the CI scripts print the canonical line and never probe `gh`; `/spec:doctor` check 2 nudges. `skipReportPattern`/`testCountPattern`/`ciPoll` keep their absent-key defaults. `[breaking: a host with no capabilities block or no forge key (zubu-menu, zubu-dashboard today) stops observing CI until /spec:init writes forge; the review ci leg reads no-adapter at exit 0, /spec:release's ci leg reads UNMEASURED and stage exits 1]` (AC-20261102-01-1, AC-20261102-01-5, AC-20261102-01-9, AC-20261102-01-14, AC-20261102-01-15) | The contract is the one place a host learns the grammar (core § Host Grounding); rejected: a per-runner preset table in the plugin (a runner vocabulary the plugin would own and that goes stale), and keeping legacy dynamic `gh` probing (the audit's defect: a GitLab remote with `gh` installed reads `transient`, so the legs pass with no evidence). |
| D2 | `spec/scripts/lib/host-run.js` exports `withFiles(cmd, relPaths)` → one shell string: when `cmd` contains `{file}`, every occurrence is replaced by the `quote`d paths joined by one space; otherwise the joined quoted paths are appended after one space. Consumers: `red-check.js` `runLeg` (`withFiles(cmd, [relPath])`) and `runFilteredLeg` (`{file}` present → `withFiles(cmd, [file]) + ' ' + quote(filterArg)`; absent → today's `${cmd} ${quote(filterArg)} ${quote(file)}` byte-for-byte), `review-legs.js`'s at-risk leg (`withFiles(config.testCommand, atRiskFiles)`, the same string written as the `$ ` line of `at-risk.txt`), and `init-gen.js` `probeTestCommand` (`withFiles(cmd, [nonexistent])`). `typecheckCommand` goes through the same `runLeg`. (AC-20261102-01-1, AC-20261102-01-2, AC-20261102-01-3, AC-20261102-01-4) | One substitution home so the four append sites cannot drift (pipeline rules § Review Checks: a value spliced raw into a shell string is hard; `quote` stays the only path into the string); rejected: a per-consumer `replace` (four spellings of one rule, the class `lib/base-derivation.js` exists to prevent). |
| D3 | `spec/scripts/lib/gate-fail-count.js` `failCount(text, pattern)`: `pattern` absent/undefined → the two built-in shapes as today; `pattern === "none"` → `null`; any other string → `new RegExp(pattern, 'm')` is the only shape consulted (first match's group 1 as a number; no match or an invalid regex → `null`). `spec-build-driver.js` `escalateRecommendation` passes `hostConfig.capabilities && hostConfig.capabilities.failCountPattern`, and when that value is the string `"none"` returns `{pick: 'park', text: 'recommended: park (fail count unavailable — the host declares failCountPattern "none")'}` before reading any log; the existing `not derivable` text stays for every other null. (AC-20261102-01-5, AC-20261102-01-6, AC-20261102-01-7) | A declared pattern is authoritative, never a third fallback (the contract's `testCountPattern` precedent: declared-but-no-match is drift, not zero); `"none"` is an explicit decline, so the step says so instead of recommending park on a guess. |
| D4 | `spec/scripts/spec-review-driver.js` `resolveBase()`: after the pinned candidates (`lib/base-derivation.js`, order unchanged) and before the `main`/`master` probe, a non-empty string `trunk` in `readConfig(repoRoot)` is tried with the same `git merge-base HEAD <trunk>`; a failure dies with `config.trunk "<value>" does not resolve to a branch — fix trunk in .claude/spec.config.json or add build_base (or diff_base) to the spec frontmatter` (exit via `die`, before any manifest or leg). When no pin and no `trunk` exist, the probe stands and the branch it picked is printed on stderr as `📌 Auto-picked trunk <main|master> — no config.trunk declared; /spec:init writes it (veto anytime)` once per driver invocation. `merge-back.sh branch-for` and `/git:enter-worktree` are untouched (Rationale). (AC-20261102-01-8, AC-20261102-01-9, AC-20261102-01-10, AC-20261102-01-19) | A pin always beats a ref (the module's own rule), and a declared trunk beats a guessed one; the derived default prints because core § Question Style makes every derived decision visible. |
| D5 | `spec/scripts/ci-query.js`: the pre-`gh` short-circuit becomes `declaredForge(root) !== 'github'` → print `unavailable — no supported forge adapter`, exit 0 — covering `"none"`, an absent block, an absent key and any other value; `declaredForge` itself is unchanged (still returns the raw value or `undefined`). `release-legs.js` and `review-legs.js` inherit it through their existing `/^unavailable/` → `{unavailable: 'no-adapter'}` mapping and change no code; the `transient` alternative now arises only when `forge` is `github` and `gh` itself fails. The header comments of `ci-query.js` are rewritten to this contract. (AC-20261102-01-11, AC-20261102-01-12, AC-20261102-01-13) | Fail closed at the one reader both legs share; a probe on a non-GitHub remote can only produce `transient` (a lie about retryability) or a vacuous pass. |
| D6 | `spec/scripts/init-gen.js`: `generate` exits 2 naming the field for `config.trunk` present but not a non-empty string, `config.capabilities.forge` present but outside `github \| none`, and `config.capabilities.failCountPattern` present but neither `"none"` nor a regex that compiles with at least one capture group (`new RegExp(p + '\|').exec('').length - 1 >= 1`, A3). New subcommand `grammar-check --root <dir> [--json]` → `{"file":{"testCommand":bool,"typecheckCommand":bool\|null},"failCountPattern":"built-in"\|"none"\|"declared"\|"invalid","trunk":{"declared":string\|null,"resolves":bool\|null},"forge":"github"\|"none"\|"undeclared"\|"invalid"}` (`file.*` = the key contains `{file}`, `null` when the key is absent; `trunk.resolves` = `git rev-parse --verify --quiet refs/heads/<trunk>` exits 0, `null` when undeclared); exit 3 when `failCountPattern` is `invalid`, `trunk` is declared and does not resolve, or `forge` is `undeclared`/`invalid`, each with one stderr line `init-gen: grammar-check: <finding> — <remedy naming the key and .claude/spec.config.json>`; else 0. `spec/commands/doctor.md` check 1 runs it beside `shapes-check` (exit 3 → one ⚠️ line per stderr line); check 2's capabilities nudge now reads "CI evidence is off until `capabilities.forge` is declared (`github` \| `none`) — /spec:init refreshes" and keeps the `forge: "none"`-on-a-GitHub-remote lead. (AC-20261102-01-14, AC-20261102-01-15, AC-20261102-01-16, AC-20261102-01-17) | The `shapes-check` precedent (specs/20261101/02 D5): one deterministic line per declared fact, run by doctor, never a new check ordinal (Gotchas: a literal ordinal races). |
| D7 | `spec/commands/init.md` Phase 1 profiles the four facts from the tree and toolchain, never from a stack name: **forge** = `github` iff `git remote get-url origin` is a `github.com` URL and `gh` resolves on PATH, else `none` — always written; **trunk** = `git symbolic-ref --short refs/remotes/origin/HEAD` stripped of its `origin/` prefix, else the branch checked out at init — always written; **`{file}`** written into `testCommand` (and `typecheckCommand`) only when the runner takes its file somewhere other than the end of the command (the probe's appended nonexistent path goes through the same substitution, D2); **failCountPattern** written only when the runner's own summary line matches neither built-in shape (`ℹ\|# fail N`, `N failed`): the regex over that line with group 1 the count, or `"none"` when the runner prints no count. Phase 4's field-by-field list gains `config.trunk`, `config.capabilities.forge`, `config.capabilities.failCountPattern` and the `{file}` note, each pointing at `$(spec-paths contract) § Required config keys` / § Capabilities for the grammar. (AC-20261102-01-18) | The sibling pattern (specs/20261101/01, 02, 03): the plugin fixes a grammar and a fallback, init writes the host's value; the `capabilities` recipe that specs/20260813/10 put in init.md did not survive init-thinning, so this row restores it as the one home. |
| D8 | `node scripts/plugin-bump.js --bump --plugin spec --changelog "…"`. `[no-ac: node scripts/plugin-bump.js --check in the gate is the oracle]` | Behaviour change under `spec/` (pipeline rules § Planning). |
| D9 | Fixture currency for D5 — every test that reaches the dynamic `gh` probe with no declared forge now declares `capabilities.forge: "github"` in its host config, never weakening what it asserts: `tests/review/ci-query.test.js` gains a `githubHost()` helper that writes `.claude/spec.config.json` with `{"capabilities":{"forge":"github"}}` into the tmp root and every probe-path test (the eight that invoke a fake or absent `gh`) uses it; `tests/review/review-legs.test.js` `makeHostForCiLeg` adds `forge: 'github'` to its `capabilities`; `tests/release-legs/release-legs.test.js` (two sites) and `tests/release-legs/unmeasured.test.js` (one site) replace the `forge: undefined` drop-the-key trick with `forge: 'github'` and reword the comment that explains it. The three `SHALL CONTINUE TO` pins keep their AC tags and their subject (gh absent / `[]` / contained sha). `[no-ac: test-setup repair only — AC-20261102-01-11 covers the new refusal]` | Gotchas seventh trigger: a Decision that adds a refusal where the old behaviour was permissive strands every setup that legally did nothing; the repair makes the fixture do what a real init-written host does. |
| D10 | Dogfood: this repo's `.claude/spec.config.json` gains `"trunk": "main"` and its `contractHash` is re-stamped to `$(spec-paths contract-hash)` after D1; `capabilities.forge` is already `github`, `failCountPattern` stays absent (node:test is a built-in shape) and `testCommand` keeps its appended form. `[no-ac: config row; tests/consistency/contract-stamp.test.js is the oracle]` | The one grounding-contract edit flags every host stale by design (pipeline rules § Risk Tiers); this host re-stamps in the same build. |
| D11 | User ruling at build (scripts wave): `spec/scripts/review-legs.js`'s suite leg, when it cannot reuse the gate's whole-suite observation and `testCommand` contains `{file}`, appends the suite row `{"unavailable":"file-placeholder"}` at exit 0 and never runs the unsubstituted command — the gate leg stays the whole-suite observation, and the ledger keeps the absence distinguishable from a pass. `[no-ac: build-time ruling; tests/review/review-legs-at-risk-file-placeholder.test.js's argv log refuses a bare run]` | A `{file}` command has no bare whole-suite form; running it hands the runner a literal placeholder. Rejected: exit 1 (a `{file}` host whose gate does not run the whole suite could never review clean). |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/templates/grounding-contract.md | MODIFY | doctrine | § Required config keys: `{file}` placeholder semantics and the optional `trunk` key; § Capabilities: `failCountPattern` and the fail-closed forge paragraph (D1); `no dependency change` |
| spec/scripts/lib/host-run.js | MODIFY | scripts | `withFiles(cmd, relPaths)` export, the one `{file}` substitution (D2) |
| spec/scripts/red-check.js | MODIFY | scripts | `runLeg` and `runFilteredLeg` through `withFiles` (D2); header comment names the placeholder |
| spec/scripts/review-legs.js | MODIFY | scripts | at-risk leg command through `withFiles` (D2) |
| spec/scripts/lib/gate-fail-count.js | MODIFY | scripts | `failCount(text, pattern)` — declared pattern first, `"none"` → null (D3) |
| spec/scripts/spec-build-driver.js | MODIFY | scripts | `escalateRecommendation` passes `capabilities.failCountPattern`; the `"none"` text (D3) |
| spec/scripts/spec-review-driver.js | MODIFY | scripts | `resolveBase()` tries `config.trunk` after the pins; derived-default line on the probe (D4) |
| spec/scripts/ci-query.js | MODIFY | scripts | forge fail-closed: anything but `github` prints the canonical line before `gh` (D5); header rewritten |
| spec/scripts/init-gen.js | MODIFY | scripts | `generate` validation of `trunk`/`forge`/`failCountPattern`; `probeTestCommand` through `withFiles`; `grammar-check` subcommand (D2, D6) |
| spec/commands/init.md | MODIFY | doctrine | Phase 1 detection recipe for the four facts; Phase 4 field bullets (D7) |
| spec/commands/doctor.md | MODIFY | doctrine | check 1 runs `grammar-check`; check 2's forge nudge (D6) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | `node scripts/plugin-bump.js --bump --plugin spec --changelog "…"` (D8) |
| .claude/spec.config.json | MODIFY | other | `trunk: "main"`; `contractHash` re-stamped after D1 (D10) |
| docs/canonical/review-legs.md | MODIFY | other | the `no-adapter` and `transient` bullets read the fail-closed forge (Canonical Delta) |
| tests/host-run/with-files.test.js | CREATE | tests | AC-20261102-01-1, AC-20261102-01-2 |
| tests/red-check/file-placeholder.test.js | CREATE | tests | AC-20261102-01-3 |
| tests/review/review-legs-at-risk-file-placeholder.test.js | CREATE | tests | AC-20261102-01-4 |
| tests/host-config/gate-fail-count.test.js | CREATE | tests | AC-20261102-01-5, AC-20261102-01-6 |
| tests/build/escalate-choice.test.js | MODIFY | tests | AC-20261102-01-7 |
| tests/review/trunk-declared.test.js | CREATE | tests | AC-20261102-01-8, AC-20261102-01-9, AC-20261102-01-10 |
| tests/review/ci-query.test.js | MODIFY | tests | AC-20261102-01-11, AC-20261102-01-13; `githubHost()` fixture repair on the eight probe-path tests (D9) |
| tests/release-legs/release-legs.test.js | MODIFY | tests | AC-20261102-01-12; `forge: 'github'` at the two `forge: undefined` sites (D9) |
| tests/release-legs/unmeasured.test.js | MODIFY | tests | `forge: 'github'` at the one `forge: undefined` site (D9) |
| tests/review/review-legs.test.js | MODIFY | tests | `makeHostForCiLeg` declares `forge: 'github'` (D9) |
| tests/init-gen/runner-grammar-key.test.js | CREATE | tests | AC-20261102-01-14, AC-20261102-01-15, AC-20261102-01-16, AC-20261102-01-17, AC-20261102-01-18 |

## Contracts

`.claude/spec.config.json` (D1):

```jsonc
"testCommand": "cargo test --test {file}",        // {file}: the plugin substitutes the quoted path(s) here;
                                                  // absent: appended after the command (today's form)
"typecheckCommand": "tsc --noEmit {file}",        // same placeholder, optional key as today
"trunk": "develop",                               // optional; the review diff base when the spec pins none;
                                                  // absent = main-then-master probe, printed as derived
"capabilities": {
  "forge": "github",                              // "github" | "none"; absent block/key or any other value
                                                  // = no forge adapter (the CI scripts never probe gh)
  "failCountPattern": "Failed:\\s+(\\d+)",        // optional regex over the gate log, group 1 = failures;
                                                  // "none" = the runner prints no count; absent = built-ins
  "skipReportPattern": "none",                    // unchanged
  "testCountPattern": "none",                     // unchanged
  "ciPoll": { "intervalSeconds": 30, "timeoutSeconds": 600 }
}
```

`lib/host-run.js` (D2):

```js
withFiles(cmd, relPaths) -> string
// 'node --test', ['tests/a.test.js']            -> "node --test 'tests/a.test.js'"
// 'cargo test --test {file}', ['it']            -> "cargo test --test 'it'"
// 'go test ./pkg/... -run {file} -v', ['A','B'] -> "go test ./pkg/... -run 'A' 'B' -v"
```

`lib/gate-fail-count.js` (D3):

```js
failCount(text, pattern?) -> number | null
// ('ℹ fail 4\n')                              -> 4        (built-in, pattern absent)
// ('Failed: 2\n', 'Failed:\\s+(\\d+)')        -> 2
// ('ℹ fail 4\n', 'Failed:\\s+(\\d+)')         -> null     (declared pattern is the only shape consulted)
// ('ℹ fail 4\n', 'none')                      -> null
// ('x', '(unclosed')                          -> null     (invalid regex never throws)
```

`init-gen grammar-check --root <dir> --json` (D6):

```json
{"file":{"testCommand":false,"typecheckCommand":null},"failCountPattern":"built-in","trunk":{"declared":"main","resolves":true},"forge":"github"}
```

## Behavior

- **Red-check and at-risk, `{file}` absent:** every command string this repo's tests pin today is
  reproduced byte-for-byte (`withFiles` appends exactly `' ' + quote(p)` per path, in order).
- **Red-check with both `{file}` and `testNameFilter`:** `cargo test --test {file}` with filter
  `-- {name}` runs `cargo test --test 'it' -- '^title$'`; `node --test` with
  `--test-name-pattern={name}` keeps running `node --test '--test-name-pattern=^title$' 'tests/a.test.js'`.
- **ESCALATE:** `failCountPattern` absent → logs read by the built-ins (unchanged text);
  declared → group 1 of its first match per log; `"none"` → the step prints the unavailable text
  and recommends park without reading the logs.
- **Review base:** `diff_base` → `build_base` → `trunk` → `main`/`master` probe (with the derived
  line) → die. A declared trunk that does not resolve dies before the first manifest row.
- **CI legs:** `forge: "github"` → the `gh` probe as today (`transient` possible); anything else →
  the canonical line, `no-adapter` rows, exit 0 for review, UNMEASURED for release.
- **Doctor:** check 1 prints one ⚠️ line per `grammar-check` stderr line; check 2's nudge names
  `capabilities.forge`.

## Acceptance Criteria

- **AC-20261102-01-1**: WHEN `withFiles` is called with a command carrying `{file}` THE SYSTEM
  SHALL replace every occurrence with the quoted space-joined paths and append nothing (e.g.
  `withFiles('go test ./pkg/... -run {file} -v', ['A', 'B'])` → `go test ./pkg/... -run 'A' 'B' -v`;
  `withFiles('cargo test --test {file} {file}', ['it'])` → `cargo test --test 'it' 'it'`)
  → writes tests/host-run/with-files.test.js
- **AC-20261102-01-2**: WHEN `withFiles` is called with a command carrying no `{file}` THE SYSTEM
  SHALL append one space and each quoted path in order (e.g. `withFiles('node --test', ['tests/a.test.js'])`
  → `node --test 'tests/a.test.js'`; a path `customers.$id.test.tsx` stays single-quoted so `$id` is never expanded)
  → writes tests/host-run/with-files.test.js
- **AC-20261102-01-3**: WHEN a host config declares `testCommand` with `{file}` (e.g.
  `bash ./runner.sh --file {file} --end`, a fixture runner that exits 0 only when `--end` follows
  the path) and `red-check.js` runs against a File Plan tests row THE SYSTEM SHALL execute the
  substituted command (the fixture's argv log reads `--file tests/x.test.js --end`) and classify the
  file from that exit code, where today's appended form would leave the runner refusing
  → writes tests/red-check/file-placeholder.test.js
- **AC-20261102-01-4**: WHEN `review-legs.js` runs the at-risk leg on a host whose `testCommand`
  carries `{file}` and two at-risk files THE SYSTEM SHALL run the command with both quoted paths
  substituted at the placeholder and write that exact line as the `$ ` header of `at-risk.txt`
  (e.g. `$ bash ./runner.sh --file 'src/a.test.js' 'src/b.test.js' --end`)
  → writes tests/review/review-legs-at-risk-file-placeholder.test.js
- **AC-20261102-01-5**: WHEN `failCount(text, pattern)` is called with a declared pattern THE
  SYSTEM SHALL return group 1 of its first match and consult no built-in shape (e.g.
  `failCount('Failed: 2\n', 'Failed:\\s+(\\d+)')` → `2`; `failCount('ℹ fail 4\n', 'Failed:\\s+(\\d+)')` → `null`;
  `failCount('x', '(unclosed')` → `null` without throwing) → writes tests/host-config/gate-fail-count.test.js
- **AC-20261102-01-6**: WHEN `failCount(text)` is called with no pattern or with `"none"` THE
  SYSTEM SHALL CONTINUE TO read the two built-in shapes when no pattern is given (e.g.
  `failCount('ℹ fail 4\n')` → `4`, `failCount('3 failed\n')` → `3`, `failCount('nothing')` → `null`)
  AND SHALL CONTINUE TO return a non-number for text with neither shape
  → writes tests/host-config/gate-fail-count.test.js
- **AC-20261102-01-7**: WHEN the build driver reaches ESCALATE on a host whose config declares
  `capabilities.failCountPattern: "none"` THE SYSTEM SHALL print
  `recommended: park (fail count unavailable — the host declares failCountPattern "none")` and,
  on a host declaring `"Failed:\\s+(\\d+)"` with gate logs `Failed: 9`, `Failed: 4`, `Failed: 2`,
  SHALL print `recommended: re-arm (failures shrank 9 → 4 → 2)`
  → rewrites tests/build/escalate-choice.test.js :: AC-20261029-07-2: gate logs carrying fail 9, 4, 2
- **AC-20261102-01-8**: WHEN a spec pins neither `diff_base` nor `build_base` and the host config
  declares `trunk` naming an existing branch (e.g. `"trunk": "develop"` on a repo whose `main`
  carries the build's own commits) THE SYSTEM SHALL use `git merge-base HEAD develop` as the review
  base, so the diff range is non-empty and the first manifest row is written
  → writes tests/review/trunk-declared.test.js
- **AC-20261102-01-9**: WHEN the host config declares `trunk` naming a branch that does not exist
  (e.g. `"trunk": "nosuch"`) and the spec pins no base THE SYSTEM SHALL exit non-zero before writing
  any manifest row with stderr containing `config.trunk "nosuch" does not resolve to a branch`
  → writes tests/review/trunk-declared.test.js
- **AC-20261102-01-10**: WHEN the host config declares no `trunk` and the spec pins no base THE
  SYSTEM SHALL CONTINUE TO derive the base from `main` (then `master`) and write the first manifest
  row (e.g. a repo with `main` and no config `trunk` → the review base is `git merge-base HEAD main`)
  → writes tests/review/trunk-declared.test.js
- **AC-20261102-01-19**: WHEN the host config declares no `trunk` and the spec pins no base THE
  SYSTEM SHALL print `📌 Auto-picked trunk main — no config.trunk declared; /spec:init writes it (veto anytime)`
  on stderr exactly once (e.g. a repo whose only branch is `main` → that line; a spec carrying
  `diff_base` → no such line) → writes tests/review/trunk-declared.test.js
- **AC-20261102-01-11**: WHEN `ci-query.js` runs with `--root` naming a repo whose config has no
  `capabilities` block, or has the block without `forge`, or has `forge: "gitlab"` — with a fake `gh`
  on PATH that exits 1 — THE SYSTEM SHALL print `unavailable — no supported forge adapter`, exit 0,
  and never invoke `gh` (the fake's argv log stays empty) → writes tests/review/ci-query.test.js
- **AC-20261102-01-12**: WHEN `release-legs.js stage` runs on a host whose config has a
  `capabilities` block without `forge` and a fake `gh` printing a green run THE SYSTEM SHALL append
  `{"leg":"ci","exit":0,"observed":{"unavailable":"no-adapter"}}` and print `UNMEASURED: ci:unavailable:no-adapter`,
  never `transient` → writes tests/release-legs/release-legs.test.js
- **AC-20261102-01-13**: WHEN `ci-query.js` runs with `forge: "github"` declared and a fake `gh` that
  exits 1 THE SYSTEM SHALL CONTINUE TO print `{"available":false,"transient":true}`
  → reuses tests/review/ci-query.test.js :: AC-20260805-02-10 / AC-20260810-07-4: a fake gh exiting non-zero prints transient:true
- **AC-20261102-01-14**: WHEN `init-gen generate` reads a profile whose `config.capabilities.forge`
  is `"gitlab"`, or whose `config.trunk` is `""`, or whose `config.capabilities.failCountPattern` is
  `"no group"` or `"(unclosed"` THE SYSTEM SHALL exit 2 with stderr naming the field (e.g.
  `init-gen: profile field "config.capabilities.forge" must be "github" or "none"`), and a profile with
  `"forge": "none"`, `"trunk": "develop"`, `"failCountPattern": "none"` SHALL generate
  → writes tests/init-gen/runner-grammar-key.test.js
- **AC-20261102-01-15**: WHEN `init-gen grammar-check --root <dir> --json` runs on a host declaring
  `forge: "github"`, `trunk: "main"` (existing), no `failCountPattern` and a `testCommand` without `{file}`
  THE SYSTEM SHALL print `{"file":{"testCommand":false,"typecheckCommand":null},"failCountPattern":"built-in","trunk":{"declared":"main","resolves":true},"forge":"github"}`
  and exit 0 → writes tests/init-gen/runner-grammar-key.test.js
- **AC-20261102-01-16**: WHEN `grammar-check` runs on a host declaring `trunk: "nosuch"`,
  `failCountPattern: "(unclosed"` and no `capabilities.forge` THE SYSTEM SHALL exit 3 with
  `"trunk":{"declared":"nosuch","resolves":false}`, `"failCountPattern":"invalid"`, `"forge":"undeclared"`
  in the JSON and three stderr lines each starting `init-gen: grammar-check:` and naming
  `.claude/spec.config.json` → writes tests/init-gen/runner-grammar-key.test.js
- **AC-20261102-01-17**: WHEN `spec/commands/doctor.md` is read THE SYSTEM SHALL name
  `init-gen)" grammar-check --root . --json` under check 1 and `capabilities.forge` under check 2
  (reference pins, sliced by heading) → writes tests/init-gen/runner-grammar-key.test.js
- **AC-20261102-01-18**: WHEN `spec/commands/init.md` is read THE SYSTEM SHALL name
  `config.trunk`, `config.capabilities.forge`, `config.capabilities.failCountPattern` and
  `{file}` under its Phase 4 field list, and `refs/remotes/origin/HEAD` and `git remote get-url origin`
  under Phase 1 (reference pins) → writes tests/init-gen/runner-grammar-key.test.js

## Assumptions (escalation triggers)

- A1: `git symbolic-ref --short refs/remotes/origin/HEAD` prints `origin/<branch>` exit 0 when the
  remote head is set and exits 128 (`not a symbolic ref`) when it is not — **executed 2026-11-02**
  against git 2.47.3 in a scratch repo: `origin/main` / `exit=0`; without origin: `fatal: ref
  refs/remotes/origin/HEAD is not a symbolic ref` / `exit=128`. — **if false:** init's trunk recipe
  (D7) falls back to the checked-out branch unconditionally; the review driver is unaffected.
- A2: `git merge-base HEAD <nonexistent>` exits 128 with `fatal: Not a valid object name` and
  `git rev-parse --verify --quiet refs/heads/<nonexistent>` exits 1 — **executed 2026-11-02**:
  `exit=128` and `exit=1` respectively; `merge-base HEAD main` printed a sha at exit 0. —
  **if false:** D4's die and D6's `resolves` read `status !== 0` either way; only the message text
  in Rationale would be wrong.
- A3: `new RegExp(p + '|').exec('').length - 1` counts capture groups (named groups included,
  `(?:…)` excluded) and `new RegExp('(unclosed')` throws `SyntaxError` — **executed 2026-11-02**
  on Node 26: `^(?:ℹ|#) fail (\d+)\s*$` → 1, `(\d+) failed` → 1, `no group` → 0, `(?<n>\d+) bad` → 1,
  `(unclosed` → `SyntaxError: Invalid regular expression`. — **if false:** D6 validates compile only
  and D3 treats a match with no group 1 as null; STOP and amend D6's message.
- A4: `String.prototype.replace` with `/\{file\}/g` substitutes every occurrence — **executed
  2026-11-02**: `cargo test --test {file} {file}` → `cargo test --test a a`. — **if false:** D2 loops
  `split('{file}').join(...)`.
- A5: The eight probe-path tests in `tests/review/ci-query.test.js`, the `makeHostForCiLeg` fixture
  and the three `forge: undefined` sites are the complete set of tests that reach the dynamic `gh`
  probe without a declared `github` forge (grep `forge: undefined` across `tests/` → 3 hits; the
  ci-query file writes no config at all) — a prediction, not an inventory. — **if false:** add
  `forge: 'github'` to that test's host config in the same batch; never weaken D5.
- A6: No test under `tests/` pins the review driver's stderr as empty or its first stderr line, so
  D4's derived-default line reddens nothing outside this File Plan (grep `main/master` and
  `neither build_base` across `tests/` → 0 hits). — **if false:** that test enters the File Plan as a
  fix row; the line stays.
- A7: `review-legs.js` and `release-legs.js` already map any stdout line starting `unavailable` to
  `{unavailable:'no-adapter'}` (read at `review-legs.js` wave 1 and `release-legs.js` `ciQueryOnce`),
  so D5 needs no change in either file. — **if false:** add the mapping to the leg that lacks it and
  record the deviation.

## Rationale

The audit behind brief 31 found four assumptions that fail without an error. Each gets the sibling
pattern of specs/20261101/01–03: a grammar in the contract, a fallback that reproduces today's
behaviour for a host declaring nothing, init writing the host's value, doctor re-checking it.

**`{file}` over a per-runner table (D1/D2).** A placeholder is the smallest grammar that makes
`cargo test --test X`, `go test ./pkg/... -run X`, `dotnet test --filter X` and `mvn -Dtest=X`
expressible without the plugin naming any runner. The substitution lives in `lib/host-run.js`
because `quote` already does, and the four append sites otherwise spell the rule four ways. The
filter fragment goes after the substituted command rather than ahead of the file because a
positional file (`cargo test --test it -- name`) cannot take an argument between the subcommand
and its file; the no-placeholder form keeps the filter ahead of the path byte-for-byte so every
existing pin holds.

**Declared pattern is authoritative (D3).** The contract's `testCountPattern` precedent treats a
declared pattern that misses as drift, never as a fallback to a guess; a host declaring
`failCountPattern` has said its runner does not speak the built-in shapes. `"none"` is surfaced as
its own ESCALATE text because recommending park "not derivable" on a host that deliberately
declined is a guess dressed as evidence.

**Trunk only at the review driver (D4).** `merge-back.sh branch-for` derives the merge target
from `build_base`, and `/git:enter-worktree` writes `build_base` from the branch it was entered
from; neither assumes `main`. `prototype-driver.js` uses the branch checked out at open and
prints `main` only as display fallback. The review driver is the one place the literal probe
decides a verdict, so it is the one consumer.

**Breaking by design (D1/D5).** Fail-closed forge removes the legacy `gh` probe: two fleet hosts
without a `forge` key lose CI observation until `/spec:init` writes it, and a release host in that
state exits UNMEASURED. The brief rules this explicitly ("`gh` is never probed on a non-GitHub
remote"); the alternative — probing and reading `transient` — is the defect. `breaking: true` is
set and the Decision carries the tag so the build and review see it.

**No new doctor ordinal (D6).** `grammar-check` rides check 1 beside `shapes-check`; a literal
ordinal races sibling specs (Gotchas, third surface). The forge nudge stays in check 2 where it
already lives.

**Collision closure (lock, literals leg over `legacy mode`, `transient`, `main/master`):** the
in-plan hits are `ci-query.js`, the contract, `review-legs.js`, `release-legs.js`,
`spec-review-driver.js`, `docs/canonical/review-legs.md`, `tests/review/ci-query.test.js` and
`tests/review/review-legs.test.js`. Waived: `env-preflight.js` (`legacy mode` there is the
`testEnv` key's absence, untouched); `spec/doctrine/core.md`, `spec/doctrine/genesis.md`,
`spec/scripts/genesis-driver.js` and `git/commands/enter-worktree.md` (`transient` in the sense
of a transient worktree or state, not the CI alternative); the brief itself. Paths-leg `executes`
hits were read against each Decision's observable change: the only behaviour that reaches an
out-of-plan test is D5's forge refusal, and every such test already declares `forge: 'none'`
(`review-legs.fixtures.js`, `review-legs-at-risk-argv`, `contract-leg`, the build and review
driver fixtures) or is the fixture repair D9 names; `withFiles` without `{file}` reproduces the
appended string byte-for-byte, so the at-risk argv and red-check pins hold. `likely`/`mentions`
hits owe no waive line.

**Rejected:** host-declared module-path matching for the at-risk leg, non-GitHub adapters, shell
glob expansion of `{testDirs}` (all fenced by the brief's Out of scope); a `trunk` read in
`merge-back.sh` (it derives from `build_base`, which the worktree command writes from the real
branch).

**Build deviations (folded at close, 2026-11-02):**
- AC 13's pointer verb was `rewrites` over a CONTINUE-TO bullet — the lock defect § Gotchas already
  names; amended to `reuses`, and the transient case stays a green pin.
- `tests/review/trunk-declared.test.js`'s no-trunk case is green on the pre-image by design (a
  CONTINUE-TO pin); the derived-default line is asserted only in the auto-pick case.
- The suite leg's `{file}` branch records `file-placeholder` instead of running the unsubstituted
  command — ratified as D11 by the user at build.
- The spec's owner citation is folded into each touched script's single `Owner:` line, since the
  comment-lint pins forbid a second citation line or D-ids in comments.
- Review rv_e028d73852e2 rejected the at-risk leg's one failure (`tests/smoke-port.test.js`'s clean
  SIGTERM case) as a parallel-run timing flake outside the range: 5/5 green alone, green in the
  suite and gate legs; user confirmed.

### Advisory debt (review rv_e028d73852e2)
- a0 /home/jj/projects/claude-plugins/.claude/worktrees/spec-01-the-host-names-its-runner-grammar/spec/scripts/review-legs.js:49 — review-legs.js's header enumerates the suite row's typed shapes ending at {"unavailable":"no-test-command"} and states the leg runs config.testCommand BARE (no file args), but D11's new row {"unavailable":"file-placeholder"} (line 402) is absent from that enumeration and the BARE sentence is now false for a {file} host. docs/canonical/review-legs.md likewise never names the new value.
- a1 /home/jj/projects/claude-plugins/.claude/worktrees/spec-01-the-host-names-its-runner-grammar/specs/20261102/01-the-host-names-its-runner-grammar.md:145 — The spec's worked examples for withFiles (Contracts block and AC-20261102-01-1/-2) show quoted paths, but lib/host-run.js quote() returns SAFE-charset strings bare, so the system emits -run A B -v / node --test tests/a.test.js; tests/host-run/with-files.test.js pins the bare form. D2 defers to quote, so the code is right and the examples are drift.

## Canonical Delta

`docs/canonical/review-legs.md` § The ci leg's absence vocabulary — the `no-adapter` bullet reads:
"there is no forge adapter to consult: the host config's `capabilities.forge` is not `github`
(absent block, absent key, `none`, or any other value — the CI scripts never invoke `gh`), or
`forge` is `github` and `gh` is missing or the repo has no remote." The `transient` bullet gains:
"arises only on a `forge: "github"` host whose `gh` executed and failed; it is never produced for an
undeclared forge." Add one sentence after the list: "`/spec:init` writes `forge` from the origin
remote and `gh`; `/spec:doctor` check 1's `grammar-check` reports `undeclared`."
