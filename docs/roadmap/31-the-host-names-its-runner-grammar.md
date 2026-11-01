# 31 — The host names its runner's grammar

Phase: P3 · Depends on: — · Primary workspaces: spec/scripts/red-check.js,
spec/scripts/lib/gate-fail-count.js, spec/scripts/spec-review-driver.js, spec/scripts/ci-query.js,
spec/scripts/release-legs.js, spec/scripts/init-gen.js, spec/templates/grounding-contract.md,
spec/commands/{init,doctor}.md, tests · Risk: T2 (one grounding-contract edit — critical tier at
plan; every key is opt-in and an undeclared host is byte-for-byte unchanged) · Design stage: no ·
Expected specs: 1

<!-- Minted 2026-11-01 from the five-agent audit (specs/20261101/02 and 03 Rationale carry the
     audit's shape). Four places where the plugin assumes how a host's test runner, CI forge and
     git trunk behave; each one yields a wrong verdict on a non-Node or non-GitHub host without an
     error. Sibling of specs/20261101/01 (test cases), 02 (file shapes) and 03 (evidence legs):
     same pattern — the plugin fixes a grammar and a fallback, init writes the host's value. -->

## Result

A host declares, once, how its own tools speak, and every leg that runs them reads the declaration:

- **`{file}` in `testCommand`** (and `typecheckCommand`). Where present, red-check and the at-risk
  leg substitute the file path there instead of appending it; absent, today's append stands.
  `cargo test`, `go test ./pkg/...`, `dotnet test --filter`, `mvn -Dtest=` all become expressible.
- **`capabilities.failCountPattern`**: a regex over runner output whose group 1 is the failure
  count, read by `lib/gate-fail-count.js` ahead of its built-in shapes; `"none"` makes the build
  driver's ESCALATE step print `fail count unavailable` instead of recommending park on a guess.
- **`trunk`**: the branch a review diffs against when a spec pins no `build_base`/`diff_base`;
  absent, today's `main`-then-`master` probe stands and is printed as a derived default.
- **Forge fail-closed**: `capabilities.forge` absent or outside `github | none` makes `ci-query.js`
  and `release-legs.js` report `unavailable — no supported forge adapter` (never `transient`), and
  `/spec:doctor` check 2 prints the one-line nudge; `gh` is never probed on a non-GitHub remote.

Init detects all four from the tree and the toolchain it profiled and writes them; doctor
re-checks each (`shapes-check`-style, one deterministic line); the contract names them as
optional keys with the fallbacks above.

## Current state

- `red-check.js` `runLeg` appends the path: `${cmd} ${quote(relPath)}` (line 340). The contract
  (`grounding-contract.md:23`) describes `testNameFilter` being appended "ahead of the file
  path", so the append is contractual today.
- `lib/gate-fail-count.js:10` parses two built-in shapes only (`ℹ|# fail N`, `N failed`) and
  reads no host key.
- `spec-review-driver.js:639` probes `['main', 'master']`; `prototype-driver.js` defaults the base
  to `main`. No config key names the trunk.
- `ci-query.js:81` treats any `gh` failure not matching `no git remotes found|failed to determine
  base repo` as `transient:true`; a GitLab remote with `gh` installed is reported retryable, and
  the review and release CI legs pass with no evidence.
- 8 hosts: 6 declare `forge:"github"`, zubu-menu has no `capabilities`, zubu-dashboard has the
  block without `forge`. No host declares a non-GitHub remote today; the defect is latent.

## Out of scope

Adapters for GitLab, Bitbucket, CircleCI or any second forge — none of the 8 hosts has one; this
brief only makes the absence legible. Host-declared module-path-to-file matching for the at-risk
leg (an import grammar per language for an advisory leg; declined, the leg stays path-string
based and the contract says so). Go/NuGet/Maven/Hex registries for genesis research. Non-React
prototype pins and a non-Storybook design stage. The regex-over-prose pins (queue q11 decides the
rule; replacement happens on touch). Shell-glob expansion of `{testDirs}`/`{scopeDirs}` for runners
that do not expand globs (pytest, `go test`) — wait for the first such host. Test classification
(specs/20261101/02) and case listing (specs/20261101/01) are siblings, not this brief.
