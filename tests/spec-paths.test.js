'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const { SPEC, read } = require('./helpers')
const { execFileSync } = require('node:child_process')

const BIN = path.join(SPEC, 'bin/spec-paths')
const run = (...a) => execFileSync('bash', [BIN, ...a], { encoding: 'utf8' })

// specs/20260805/01-review-scope-reconciliation.md File Plan (spec/bin/spec-paths row): the new
// scope-reconcile.js script needs a spec-paths key like every other bundled script — a missing
// key breaks the command that resolves it silently (§ Risk Tiers, spec-paths).

// AC-20260805-03: specs/20260805/03-done-unobserved-observation.md's File Plan adds
// spec/scripts/observe-ci.js to the bundle — like every other bundled script it needs a
// spec-paths key, or /spec:status and /spec:review's D7 observe-ci invocation resolve nothing
// (§ Risk Tiers, spec-paths: "a wrong key breaks commands silently").

// AC-20260817-07-15: specs/20260817/07-promise-sweep-leg.md D5 adds spec/scripts/promise-sweep.js
// to the bundle (the Decisions-carrier leg run at plan lock and in every review scope) — like
// every other bundled script it needs a spec-paths key, or plan.md's Lock checklist invocation
// and review-legs.js's own resolution find nothing.

// AC-20260819-02-10: specs/20260819/02-mutation-replay.md D14 adds spec/scripts/replay.js and
// spec/doctrine/replay-corpus.md to the bundle — like every other bundled script/doctrine file
// they need spec-paths keys (`replay`, `replay-corpus`), or /spec:replay resolves nothing. This
// is a recurrence of the known spec-paths additive-collision class (specs/20260814/01-ac-matrix-script.md):
// the key list below is updated in place, never a parallel exhaustive pin.

// AC-20260821-01-11: specs/20260821/01-red-check.md D11 adds spec/scripts/red-check.js to the
// bundle (build.md's Phase 1 invocation, D8) — like every other bundled script it needs a
// spec-paths key, or build.md's `node "$(spec-paths red-check)"` line resolves nothing (same
// additive-collision class as AC-20260819-02-10 above).

// specs/20260820/07-review-driver.md File Plan (spec/bin/spec-paths row): the new
// spec-review-driver.js script needs a spec-paths key like every other bundled script — a
// missing key breaks /spec:review's driver invocation silently (§ Risk Tiers, spec-paths).
// This row carries no AC — it is a key-resolution addition following the pattern above.

// AC-20260822-02-13: specs/20260822/02-init-generation-script.md D11 adds spec/scripts/init-gen.js
// to the bundle (spec/commands/init.md's sole invocation of the new generate/probe script) — like
// every other bundled script it needs a spec-paths key, or init.md resolves nothing (same
// additive-collision class as AC-20260819-02-10 above; pre-image: `spec-paths init-gen` exits 1
// on the unknown key).

// AC-20260823-01-16: specs/20260823/01-release-legs.md D1/D10 adds spec/scripts/release-legs.js
// to the bundle (a new `release-legs` key) and retires `feedback-template` (its consumer,
// /intake, died in v7) — like every other bundled-script addition it needs a spec-paths key or
// release.md's stage/append/record invocations resolve nothing, and like every other retired
// key it must fail loudly rather than keep quietly resolving a deleted template (same
// additive-collision class as AC-20260819-02-10 above, and the first that also retires a key).

// specs/20260823/08-derived-session-queue.md D12 (spec/bin/spec-paths row): the new
// spec-queue.js script needs a spec-paths key like every other bundled script — a missing key
// breaks /spec:queue's invocation silently (the D8 SessionStart hook and its `hello` delegation
// were removed) (§ Risk Tiers, spec-paths). D12 marks this row [no-ac]: it is enforced fail-closed by
// this existing suite guard (and by tests/consistency/{plugin-version,entrypoints,red-fixture-
// coverage}.test.js), so it carries no AC-ID of its own (same additive-collision class as
// AC-20260819-02-10 above).

// specs/20260824/05-design-doctrine-cut.md D5: dc-extract.js and fidelity-check.js (and their
// spec-paths keys) are deleted with the source-grep fidelity gate they served — a still-
// resolving key here would mean the retirement never actually landed. `dc-extract` is removed
// from this exhaustive resolve-all pin (the refusal itself is pinned behaviorally by
// AC-20260824-05-4 in tests/consistency/design-doctrine.test.js); `fidelity-check` was never a
// member of this list.

// specs/20260825/04-genesis-driver.md D13 (spec/bin/spec-paths row): `genesis-driver` joins the
// list below for the same fail-closed reason — /spec:genesis resolves the driver it loops on
// through this key, and a missing key strands the one greenfield entry point silently.
//
// specs/20260825/03-genesis-currency-executed.md D9 (spec/bin/spec-paths row): the new
// registry-check.js script needs a spec-paths key like every other bundled script — a missing key
// breaks all three genesis commands' D7 menu step (`node "$(spec-paths registry-check)" --menu
// <file> --write`) silently (§ Risk Tiers, spec-paths). This row carries no AC of its own — like
// the spec-review-driver.js and spec-queue.js additions above, it is enforced fail-closed by this
// existing suite guard: the key list below is updated in place, never a parallel exhaustive pin.

// AC-20260901-01-16: specs/20260901/01-build-driver.md D10 adds spec/scripts/spec-build-driver.js
// to the bundle (a new `build-driver` key) — like every other bundled script it needs a
// spec-paths key, or /spec:build's driver invocation resolves nothing (§ Risk Tiers, spec-paths:
// "a wrong key breaks commands silently"; same additive-collision class as AC-20260819-02-10
// above).

// AC-20260901-07-15: specs/20260901/07-escape-class-contract.md D10 adds spec/scripts/escape-row.js
// to the bundle (a new `escape-row` key) — like every other bundled script it needs a spec-paths
// key, or escape.md's D6 `node "$(spec-paths escape-row)" --append/--amend` invocations resolve
// nothing (§ Risk Tiers, spec-paths: "a wrong key breaks commands silently"; same
// additive-collision class as AC-20260819-02-10 above).

// AC-20260926-03-8: specs/20260926/03-gates-per-workspace.md D1/D7 adds
// spec/scripts/workspace-scan.js to the bundle (a new `workspace-scan` key) — like every other
// bundled script it needs a spec-paths key, or /spec:enforce's Phase 1 `workspace-scan --root .
// --json` invocation resolves nothing (§ Risk Tiers, spec-paths: "a wrong key breaks commands
// silently"; same additive-collision class as AC-20260819-02-10 above).
test('AC-20260926-03-8: spec-paths workspace-scan resolves to spec/scripts/workspace-scan.js, an existing file', () => {
  const fs = require('node:fs')
  const workspaceScanPath = run('workspace-scan').trim()
  assert.strictEqual(workspaceScanPath, path.join(SPEC, 'scripts/workspace-scan.js'),
    'D1/D7: `spec-paths workspace-scan` must resolve to spec/scripts/workspace-scan.js — a wrong or ' +
    'missing key breaks /spec:enforce\'s Phase 1 scan invocation silently (§ Risk Tiers, spec-paths: ' +
    '"a wrong key breaks commands silently")')
  assert.ok(fs.existsSync(workspaceScanPath), 'the resolved workspace-scan.js path must actually exist on disk: ' + workspaceScanPath)
})

// AC-20260904-02-12: specs/20260904/02-worktree-include-shared-owner.md D5 adds
// spec/scripts/worktree-include.sh to the bundle (a new `worktree-include` key) — like every
// other bundled script it needs a spec-paths key, or replay.js's sibling-resolution fallback and
// any session running `spec-paths worktree-include` by hand resolve nothing (§ Risk Tiers,
// spec-paths: "a wrong key breaks commands silently"; same additive-collision class as
// AC-20260819-02-10 above). The key list below is updated in place, never a parallel exhaustive pin.

// AC-20260905-04-1: specs/20260905/04-per-project-look-server.md D1 deletes the hub script and
// its spec-paths key — its three `stop` verbs move onto design-atlas.js (already a key) instead,
// so this is a pure removal, not a rename; the key list below is updated in place, never a
// parallel exhaustive pin.

// specs/20260926/04-the-design-brief.md D12: three new bundled keys — `catalog-inventory`
// (D4's script), `design-brief-template` and `design-paths-template` (D6/D3's templates) — like
// every other bundled asset they need spec-paths keys, or the genesis driver's own
// `spec-paths catalog-inventory` invocation and every doc-authoring step's template read resolve
// nothing (§ Risk Tiers, spec-paths: "a wrong key breaks commands silently"; same additive-
// collision class as AC-20260819-02-10 above; the key list below is updated in place, never a
// parallel exhaustive pin).
// AC-20260928-01-2: specs/20260928/01-the-prototype-command-and-the-pin-overlay.md D2 adds
// spec/scripts/prototype-driver.js to the bundle (a new `prototype-driver` key) and D9 gives
// /spec:prototype its own `shared-for` arm — like every other bundled script it needs a
// spec-paths key, or /spec:prototype's driver invocation resolves nothing (§ Risk Tiers,
// spec-paths: "a wrong key breaks commands silently"; same additive-collision class as
// AC-20260819-02-10 above). The key list below is updated in place, never a parallel exhaustive
// pin, and the new `shared-for prototype` assertions are folded into this test per the AC's own
// `rewrites tests/spec-paths.test.js :: AC-20260926-03-8: every documented key resolves to an
// existing path` pointer.
// specs/20260929/01-the-walkthrough-contract-and-the-client.md D13 (AC-20260929-01-18): three new
// bundled keys — `walkthrough` (the one script that talks to the review service) and
// `walkthrough-contract` / `walkthrough-catalog` (the two plain-JSON files both repositories test
// against) — folded into this same test, with the usage string naming all three.
test('AC-20260926-03-8: every documented key resolves to an existing path (AC-20260928-01-2; AC-20260929-01-18)', () => {
  const fs = require('node:fs')
  for (const key of ['root', 'workflows', 'wf-enforce',
    'wf-research', 'merge-back',
    'smoke', 'manifest-check', 'spec-status', 'spec-queue', 'scope-reconcile', 'init-gen', 'verdict', 'ci-query', 'review-legs',
    'review-driver', 'build-driver', 'promise-sweep', 'replay', 'replay-corpus', 'red-check',
    'registry-check', 'genesis-driver', 'escape-row', 'mocks-driver', 'commit-coverage',
    'worktree-include', 'shared', 'shared-genesis', 'shared-mocks', 'template', 'templates', 'contract',
    'design-contract-check', 'design-rules-template', 'workspace-scan',
    'catalog-inventory', 'design-brief-template', 'design-paths-template', 'prototype-driver',
    'walkthrough', 'walkthrough-contract', 'walkthrough-catalog']) {
    const p = run(key).trim()
    assert.ok(fs.existsSync(p), key + ' -> ' + p)
  }
  for (const [key, tail] of [['walkthrough', 'scripts/walkthrough.js'],
    ['walkthrough-contract', 'templates/walkthrough/contract.json'],
    ['walkthrough-catalog', 'templates/walkthrough/catalog.json']]) {
    assert.ok(run(key).trim().endsWith(tail),
      'AC-20260929-01-18/D13: `spec-paths ' + key + '` must print a path ending ' + tail + ' — a wrong key sends the wireframe ' +
      'client or its contract check to the wrong file silently: ' + run(key).trim())
  }
  const { spawnSync } = require('node:child_process')
  const usage = spawnSync('bash', [BIN, 'no-such-key-xyz'], { encoding: 'utf8' }).stderr
  for (const key of ['walkthrough', 'walkthrough-contract', 'walkthrough-catalog']) {
    assert.match(usage, new RegExp('(^|[|\\[])' + key + '($|[|\\]])'),
      'D13: the usage line must name `' + key + '` or a session reading it never learns the key exists: ' + usage)
  }
  assert.match(run('version').trim(), /^\d+\.\d+\.\d+$/)
  assert.match(run('contract-hash').trim(), /^[0-9a-f]{12}$/)

  const prototypeScoped = run('shared-for', 'prototype')
  assert.match(prototypeScoped, /\/spec:prototype/,
    'D9: `spec-paths shared-for prototype` must print a section-scoped header naming /spec:prototype — a missing arm falls open to the whole doctrine instead: ' + prototypeScoped.slice(0, 200))
  assert.ok(prototypeScoped.split('\n').length < 400,
    'D9/A6: the prototype shared-for arm must stay under the flat 400-line read-load cap: got ' + prototypeScoped.split('\n').length + ' lines')
})

// AC-20260904-02-12 pins the usage line spec-paths prints on an UNKNOWN key (the only
// usage-line trigger this script has); zero args keeps printing the plugin ROOT (AC-20260902-06-10).
test('AC-20260904-02-12: spec-paths worktree-include resolves to spec/scripts/worktree-include.sh, an existing file, and the usage line names the key', () => {
  const fs = require('node:fs')
  const worktreeIncludePath = run('worktree-include').trim()
  assert.strictEqual(worktreeIncludePath, path.join(SPEC, 'scripts/worktree-include.sh'),
    'D5: `spec-paths worktree-include` must resolve to spec/scripts/worktree-include.sh — a wrong or ' +
    'missing key breaks replay.js\'s owner resolution and any manual invocation silently (§ Risk Tiers, ' +
    'spec-paths: "a wrong key breaks commands silently")')
  assert.ok(fs.existsSync(worktreeIncludePath),
    'the resolved worktree-include.sh path must actually exist on disk: ' + worktreeIncludePath)

  // an unknown key triggers spec-paths' own usage line — on stderr, exit 1 (AC-12's amended wording)
  const { spawnSync } = require('node:child_process')
  const r = spawnSync('bash', [BIN, 'no-such-key-xyz'], { encoding: 'utf8' })
  assert.strictEqual(r.status, 1,
    'AC-12: an unknown key exits 1 (usage, never a resolved path): ' + JSON.stringify({ status: r.status, stdout: r.stdout, stderr: r.stderr }))
  assert.strictEqual(r.stdout, '',
    'AC-12: the usage line goes to stderr only — anything on stdout would be mistaken for a resolved path by a $(spec-paths …) caller: ' + JSON.stringify(r.stdout))
  assert.match(r.stderr, /^usage: spec-paths \[.*\|worktree-include\|.*\]/,
    'D5: spec-paths\' own usage line (stderr) must list `worktree-include` alongside every other bundled key, or a ' +
    'session reading the usage line to discover keys never learns this one exists: ' + JSON.stringify(r.stderr))
})

// AC-20260901-07-15
test('AC-20260901-07-15: spec-paths escape-row resolves to spec/scripts/escape-row.js, an existing executable file', () => {
  const fs = require('node:fs')
  const escapeRowPath = run('escape-row').trim()
  assert.strictEqual(escapeRowPath, path.join(SPEC, 'scripts/escape-row.js'),
    'D2/D10: `spec-paths escape-row` must resolve to spec/scripts/escape-row.js — a wrong or missing key breaks escape.md\'s D6 --append/--amend invocations silently (§ Risk Tiers, spec-paths: "a wrong key breaks commands silently")')
  assert.ok(fs.existsSync(escapeRowPath), 'the resolved escape-row.js path must actually exist on disk: ' + escapeRowPath)
  assert.ok(fs.statSync(escapeRowPath).isFile(), 'the resolved escape-row.js path must be a regular file, not a directory or missing entirely: ' + escapeRowPath)
})

// AC-20260904-01-1: specs/20260904/01-commit-time-escape-coverage.md D1 adds
// spec/scripts/commit-coverage.js to the bundle (a new `commit-coverage` key) — like every other
// bundled script it needs a spec-paths key, or git/commands/commit.md's step 3
// `spec-paths commit-coverage` invocation resolves nothing (§ Risk Tiers, spec-paths: "a wrong
// key breaks commands silently"; same additive-collision class as AC-20260819-02-10 above).
test('AC-20260904-01-1: spec-paths commit-coverage resolves to spec/scripts/commit-coverage.js, an existing absolute path', () => {
  const fs = require('node:fs')
  const commitCoveragePath = run('commit-coverage').trim()
  assert.strictEqual(commitCoveragePath, path.join(SPEC, 'scripts/commit-coverage.js'),
    'D1: `spec-paths commit-coverage` must resolve to spec/scripts/commit-coverage.js — a wrong or missing key breaks git/commands/commit.md\'s step 3 invocation silently (§ Risk Tiers, spec-paths: "a wrong key breaks commands silently")')
  assert.ok(path.isAbsolute(commitCoveragePath), 'the printed path must be absolute — a relative path breaks a caller invoked from a different cwd: ' + commitCoveragePath)
  assert.ok(fs.existsSync(commitCoveragePath), 'the resolved commit-coverage.js path must actually exist on disk: ' + commitCoveragePath)
})

// specs/20260914/03-the-html-atlas-is-retired.md AC-20260914-03-5 (reuse, tag only): reuses this
// case to pin that shared-mocks still resolves after the HTML-atlas deletion batch.
// specs/20260902/06-mocks-provenance-ledger.md D7, AC-20260902-06-9: spec-paths gains a
// `shared-mocks` key resolving to the new spec/doctrine/mocks.md, the way `shared-design` and
// `shared-genesis` resolve their own doctrine files — a missing key breaks any command that
// resolves it silently (§ Risk Tiers, spec-paths).
test('AC-20260902-06-9: spec-paths shared-mocks resolves to an existing spec/doctrine/mocks.md carrying a Provenance Ledger heading', () => {
  const fs = require('node:fs')
  const mocksPath = run('shared-mocks').trim()
  assert.ok(mocksPath.endsWith('spec/doctrine/mocks.md'),
    'D7: `spec-paths shared-mocks` must print an absolute path ending in spec/doctrine/mocks.md, not resolve to some other doctrine file or an empty usage line: ' + mocksPath)
  assert.ok(path.isAbsolute(mocksPath), 'the printed path must be absolute — a relative path breaks callers invoked from a different cwd: ' + mocksPath)
  assert.ok(fs.existsSync(mocksPath), 'the resolved mocks.md path must actually exist on disk, or every command that resolves it silently gets nothing: ' + mocksPath)
  assert.match(read('spec/doctrine/mocks.md'), /^## Provenance Ledger$/m,
    'D7: mocks.md must carry a "## Provenance Ledger" heading — the section spec 07\'s driver and the ledger grammar doctrine live under')
})

// specs/20260902/06-mocks-provenance-ledger.md AC-20260902-06-10: the zero-argument default is a
// regression pin — adding the shared-mocks key must never change what bare `spec-paths` prints.
test('AC-20260902-06-10: spec-paths with no arguments continues to print the plugin root', () => {
  const noArgs = execFileSync('bash', [BIN], { encoding: 'utf8' }).trim()
  assert.strictEqual(noArgs, run('root').trim(),
    'AC-10: spec-paths with no arguments must CONTINUE TO print the plugin root exactly as `spec-paths root` does — adding the shared-mocks key must never change the zero-argument default')
})

// AC-20260926-02-11: specs/20260926/02-the-design-contract-is-code.md D10 adds
// spec/scripts/design-contract-check.js and spec/templates/design-rules.md to the bundle (two new
// keys, `design-contract-check` and `design-rules-template`) — like every other bundled
// script/template addition it needs spec-paths keys, or /spec:doctor check 8's script invocation
// and /spec:init Phase 6's seed-from-template step resolve nothing (§ Risk Tiers, spec-paths: "a
// wrong key breaks commands silently"; same additive-collision class as AC-20260819-02-10 above;
// the key list above is updated in place, never a parallel exhaustive pin).
test('AC-20260926-02-11: spec-paths design-contract-check and design-rules-template resolve to spec/scripts/design-contract-check.js and spec/templates/design-rules.md, both existing files', () => {
  const fs = require('node:fs')
  const checkPath = run('design-contract-check').trim()
  assert.strictEqual(checkPath, path.join(SPEC, 'scripts/design-contract-check.js'),
    'D2/D10: `spec-paths design-contract-check` must resolve to spec/scripts/design-contract-check.js — a wrong or missing key breaks /spec:doctor check 8\'s invocation silently (§ Risk Tiers, spec-paths: "a wrong key breaks commands silently")')
  assert.ok(fs.existsSync(checkPath), 'the resolved design-contract-check.js path must actually exist on disk: ' + checkPath)

  const templatePath = run('design-rules-template').trim()
  assert.strictEqual(templatePath, path.join(SPEC, 'templates/design-rules.md'),
    'D4/D10: `spec-paths design-rules-template` must resolve to spec/templates/design-rules.md — a wrong or missing key breaks /spec:init Phase 6\'s seed-from-template step silently (§ Risk Tiers, spec-paths: "a wrong key breaks commands silently")')
  assert.ok(fs.existsSync(templatePath), 'the resolved design-rules.md path must actually exist on disk: ' + templatePath)
})

test('shared-for: every mapped section name still exists as a core.md or design.md heading', () => {
  const src = read('spec/bin/spec-paths')
  const doc = read('spec/doctrine/core.md') + '\n' + read('spec/doctrine/design.md')
  const headings = [...doc.matchAll(/^## (.+)$/gm)].map(m => m[1])
  const maps = [...src.matchAll(/SECTIONS="([^"]+)"/g)].map(m => m[1])
  assert.ok(maps.length >= 6, 'expected a SECTIONS map per scoped command')
  for (const map of maps) {
    for (const name of map.split('|')) {
      assert.ok(headings.some(h => h.startsWith(name)),
        `section "${name}" in a shared-for map no longer matches any shared.md heading — ` +
        'renaming a heading must update the spec-paths maps')
    }
  }
})

// AC-20260807-04-7 (sanctioned pin exception, green pre-change): specs/20260807/04-claims-
// registry.md D1 lands HTML-comment `enforcedBy:`/`unenforced:` markers as trailing or
// next-line content in shared.md. This awk-based section extraction already passes comment
// lines through unchanged (it filters on `## ` headings only, never on line content), so this
// coverage stays green across the marker landing — the regression pin the AC calls for.
// AC-20260820-05-17 (regression pin, specs/20260820/05-fleet-evidence-reader.md): D7 of that
// spec rewrites `## Incident Policy` in spec/doctrine/core.md — the section escape.md derives
// its defect-class and recurrence rules from. This test's existing
// `run('shared-for', 'escape')` / Incident Policy assert below is the oracle that `shared-for
// escape` keeps serving that section after D7 lands — tagged here rather than duplicated, per
// that spec's File Plan.
// specs/20260912/03-run-isolates-and-owns-the-stages.md D13 (AC-20260912-03-13): design, build
// and review are retired from this scoped-output roster — their shared-for keys fall open to
// the whole-doctrine fallback now (their own dedicated fail-open pin lives in the "shared-for:
// scoped" test below), so they can no longer be asserted as a strict subset or checked for a
// specific section list here without that assertion becoming either false (a "must not carry X"
// check, since the fail-open output carries everything) or vacuously true for every command
// alike (a "must carry X" check). The design/build/review-specific assertions this test used to
// carry are retired along with their subject, never weakened into passing.
//
// AC-20260926-01-6 (specs/20260926/01-the-approval-file-is-not-a-gate.md D1, rewrites this test
// in place): `sketch` joins the fail-open group below (its SECTIONS arm is deleted) and drops
// out of the strict-subset loop that used to check it; the 12 remaining scoped commands' section
// lists are unchanged from the pre-image.
test('shared-for: scoped output carries its sections (AC-20260926-01-6) and is smaller than the full doc, and the retired stage/sketch keys fall open to it (incl. AC-20260820-05-17: escape keeps serving Incident Policy; AC-20260823-01-19: release keeps Release Stage/Runtime Verification and drops Feedback Loop; AC-20260912-03-13: design, build and review print the fail-open whole doctrine)', () => {
  const full = run('shared-for', 'no-such-command')
  for (const cmd of ['plan', 'release', 'enforce', 'escape', 'doctor', 'replay', 'queue']) {
    const out = run('shared-for', cmd)
    assert.ok(out.length < full.length, cmd + ' output should be a strict subset')
    assert.match(out, /## Host Grounding/, cmd + ' must keep Host Grounding')
  }
  const planHeadings = [...run('shared-for', 'plan').matchAll(/^## (.+)$/gm)].map(m => m[1])
  assert.deepStrictEqual(planHeadings.slice(0, 3), ['Host Grounding', 'Pipeline Entry', 'Tiers'],
    'AC-20260926-01-6: plan\'s own section list must be unchanged from the pre-image — it still ' +
    'begins Host Grounding, Pipeline Entry, Tiers: ' + planHeadings.join(', '))
  // AC-20260912-03-13 (D13): the three retired stage keys are the inverse case — each must print
  // the exact fail-open whole-doctrine output an unknown command gets. Executed at plan (spike
  // S2): each retired list is an exact subset of `shared-for run` unioned with the (now also
  // retired) design-only delta key's own output, so no session loses doctrine by the retirement.
  const fallbackLines = full.split('\n').length
  // specs/20260914/03-the-html-atlas-is-retired.md D2: the `atlas` command (and its shared-for
  // key) is deleted along with the retired command it named — it joins the design/build/review
  // fail-open group rather than keeping its own scoped-output assertions, whose subject (a
  // dedicated `atlas` SECTIONS map) is gone. Retired, never weakened into passing.
  // AC-20260926-01-6: `sketch` joins this same fail-open group — D1 deletes its SECTIONS arm
  // outright, so its scoped output must now retire to the exact fail-open line count too.
  for (const cmd of ['design', 'build', 'review', 'atlas', 'sketch']) {
    const got = run('shared-for', cmd).split('\n').length
    assert.strictEqual(got, fallbackLines,
      'D13/AC-20260926-01-6: shared-for ' + cmd + ' must retire to the exact fail-open line count ' +
      'once its SECTIONS arm is deleted — a still-scoped or partially-scoped output here means the ' +
      'retired key was left half-wired, which `shared-for` "silently drops" instead of erroring on ' +
      '(§ Review Checks): got ' + got + ', fallback is ' + fallbackLines)
  }
  // specs/20260827/02-genesis-explore-state.md D10: the retired explore command's own
  // shared-for entry is deleted and `genesis` gains Design Canon instead (the driver runs the
  // taste funnel end-to-end from the entry point). Retargeted to `genesis` in place, tagged
  // AC-20260827-02-8, never weakened — a call scoped to the retired command falls back to the
  // FULL doctrine (AC-20260827-02-8's own test in genesis-doctrine.test.js pins that).
  assert.match(run('shared-for', 'genesis'), /## Design Canon/,
    'AC-20260827-02-8/D10: /spec:genesis must now be served § Design Canon directly — its absence means the entry point lost the doctrine governing the taste funnel it now runs end-to-end')
  // specs/20260827/03-genesis-design-state.md D7: the design lock's own command is deleted too
  // and its shared-for entry folds into `genesis` alongside Design Canon — the two asserts this
  // block carried for that deleted command are retargeted in place to `genesis`, never
  // weakened, since the lock is ratified inside the driver, not a separate command with its own
  // scoped section list.
  assert.match(run('shared-for', 'genesis'), /## Design Authoring Contracts/,
    'D7: /spec:genesis must now also be served § Design Authoring Contracts — the driver ratifies the design pick itself, folding the old design-lock command\'s own doctrine section into the entry point')
  assert.ok(!/## Design Render Gate/.test(run('shared-for', 'genesis')),
    'genesis authors design canon, never binds specs')
  assert.match(run('shared-for', 'release'), /## Release Stage/)
  assert.match(run('shared-for', 'release'), /## Runtime Verification/)
  assert.ok(!/## Feedback Loop/.test(run('shared-for', 'release')),
    'AC-20260823-01-19/D10: release must no longer be served § Feedback Loop — its SECTIONS list ' +
    'drops "Feedback Loop" now that the feedback-brief flush is retired, so a surviving citation ' +
    'here would mean the doc still tells the session to read doctrine for a step that no longer ' +
    'exists: ' + run('shared-for', 'release'))
  assert.match(run('shared-for', 'escape'), /## Feedback Loop/,
    'escape IS the Emit leg — it writes preventedBy rows and Gotchas tags')
  assert.match(run('shared-for', 'escape'), /## Incident Policy/,
    'escape derives its defect-class and recurrence rules from Incident Policy — shared-for filtering silently drops a mismatched section, so escape would run without the policy it is supposed to apply (AC-20260820-05-17)')
  assert.ok(!/## Design (Canon|Authoring Contracts|Render Gate)/.test(run('shared-for', 'doctor')),
    'doctor must not pay for design doctrine — check 8 only verifies design files exist')
  assert.match(run('shared-for', 'doctor'), /## Grounding Drift/)
  assert.match(run('shared-for', 'doctor'), /## Rule Enforcement/)
  // D14: replay's section list — Feedback Loop is where the cadence policy (D12) lives, so the
  // command must be served it or /spec:replay's own doctrine reads nothing about its cadence.
  assert.match(run('shared-for', 'replay'), /## Tiers/)
  assert.match(run('shared-for', 'replay'), /## Model Placement/)
  assert.match(run('shared-for', 'replay'), /## Decisions/)
  assert.match(run('shared-for', 'replay'), /## Question Style/)
  assert.match(run('shared-for', 'replay'), /## Console Output Style/)
  assert.match(run('shared-for', 'replay'), /## Feedback Loop/,
    'replay reads the cadence policy (D12) from Feedback Loop — without this section the command has no ' +
    'doctrine source for "every 5th review" at all')
  // D12: /spec:queue's shared-for section list (Host Grounding|State Machine|Question Style|
  // Console Output Style) — a missing map entry means the command reads no doctrine at all for
  // its predicate vocabulary (State Machine) or its list/veto-notice wording conventions.
  assert.match(run('shared-for', 'queue'), /## State Machine/,
    'D12: /spec:queue must be served § State Machine — the queue\'s strict-sequence item semantics (D3) live there')
  assert.match(run('shared-for', 'queue'), /## Question Style/,
    'D12: /spec:queue must be served § Question Style — any AskUserQuestion it raises (e.g. an ambiguous <ref>) must follow the same doctrine as every other command')
  assert.match(run('shared-for', 'queue'), /## Console Output Style/,
    // specs/20260903/03-pipeline-queue-mechanics.md D8 retires the old glyph-keyed render
    // (done/top/pending/auto-placed markers) for a numbered `{n}  {desc}` list plus one
    // `⏳ after <target> (<state>)` gate marker and a `— {d} done · move: …` footer — message
    // text updated in place, the assertion itself unchanged (this test only checks the section
    // is served, never the render's own literal shape).
    'D12: /spec:queue must be served § Console Output Style — the list\'s numbered-pending render and its ⏳ gate marker must follow the shared narration doctrine')
})

test('AC-20260819-02-10: spec-paths replay and spec-paths replay-corpus resolve to the D14 script and corpus paths', () => {
  const fs = require('node:fs')
  const replayPath = run('replay').trim()
  assert.strictEqual(replayPath, path.join(SPEC, 'scripts/replay.js'),
    'D14: `spec-paths replay` must resolve to spec/scripts/replay.js — a wrong or missing key breaks every ' +
    '/spec:replay invocation silently (§ Risk Tiers, spec-paths: "a wrong key breaks commands silently")')
  assert.ok(fs.existsSync(replayPath), 'the resolved replay.js path must actually exist on disk: ' + replayPath)

  const corpusPath = run('replay-corpus').trim()
  assert.strictEqual(corpusPath, path.join(SPEC, 'doctrine/replay-corpus.md'),
    'D14: `spec-paths replay-corpus` must resolve to spec/doctrine/replay-corpus.md — the corpus is served ' +
    'to /spec:replay through this key, and a wrong key means the command can never find its own corpus')
  assert.ok(fs.existsSync(corpusPath), 'the resolved replay-corpus.md path must actually exist on disk: ' + corpusPath)
})

// AC-20260824-02-1: specs/20260824/02-design-stage-on-render-gate.md D2 retires
// spec/scripts/spec-design-driver.js, spec/workflows/wf-design.js, and
// spec/scripts/skeletons-check.js along with their tests — the driver's 561 lines sequenced
// extract/skeleton/workflow/iterate artifacts, all retired once the design stage runs on the
// render gate (D1). Like AC-20260823-01-16's `feedback-template` retirement, a spec-paths
// key that still resolves after its script is deleted "breaks commands silently" (§ Risk Tiers,
// spec-paths) in the other direction: a caller would get a path to a file that is not there.
// Both halves are pinned together — the keys must refuse, and the files must be gone.
test('AC-20260824-02-1: spec-paths design-driver, wf-design, and skeletons-check are refused now that D2 retires the keys, and their scripts no longer exist on disk', () => {
  const fs = require('node:fs')
  for (const key of ['design-driver', 'wf-design', 'skeletons-check']) {
    let threw = false
    let output = ''
    try {
      run(key)
    } catch (e) {
      threw = true
      output = String(e.stdout || '') + String(e.stderr || '')
    }
    assert.ok(threw,
      'D2: `spec-paths ' + key + '` must exit non-zero now that the key is retired (its script ' +
      'is deleted) — a still-resolving key means a caller gets a path to a file that no longer ' +
      'exists instead of a discoverable error')
    assert.match(output, /usage: spec-paths/,
      '`spec-paths ' + key + '` must print the usage line on refusal, the same way any other ' +
      'unknown key does: ' + output)
  }

  for (const rel of ['scripts/spec-design-driver.js', 'workflows/wf-design.js', 'scripts/skeletons-check.js']) {
    const p = path.join(SPEC, rel)
    assert.ok(!fs.existsSync(p),
      'D2: ' + rel + ' must be deleted with the design-driver state machine it belonged to — its ' +
      'continued presence means the retired mechanism is still reachable even though its ' +
      'spec-paths key is gone: ' + p)
  }
})

test('AC-20260821-01-11: spec-paths red-check resolves to spec/scripts/red-check.js, an existing path', () => {
  const fs = require('node:fs')
  const redCheckPath = run('red-check').trim()
  assert.strictEqual(redCheckPath, path.join(SPEC, 'scripts/red-check.js'),
    'D11: `spec-paths red-check` must resolve to spec/scripts/red-check.js — a wrong or missing key breaks ' +
    'build.md\'s `node "$(spec-paths red-check)"` invocation silently (§ Risk Tiers, spec-paths: "a wrong ' +
    'key breaks commands silently")')
  assert.ok(fs.existsSync(redCheckPath), 'the resolved red-check.js path must actually exist on disk: ' + redCheckPath)
})

test('AC-20260901-01-16: spec-paths build-driver resolves to spec/scripts/spec-build-driver.js, an existing path', () => {
  const fs = require('node:fs')
  const buildDriverPath = run('build-driver').trim()
  assert.strictEqual(buildDriverPath, path.join(SPEC, 'scripts/spec-build-driver.js'),
    'D10: `spec-paths build-driver` must resolve to spec/scripts/spec-build-driver.js — a wrong or missing key breaks ' +
    'the build stage\'s driver invocation silently (§ Risk Tiers, spec-paths: "a wrong key breaks commands silently")')
  assert.ok(fs.existsSync(buildDriverPath), 'the resolved spec-build-driver.js path must actually exist on disk: ' + buildDriverPath)
})

test('AC-20260822-02-13: spec-paths init-gen resolves to spec/scripts/init-gen.js, an existing path', () => {
  const fs = require('node:fs')
  const initGenPath = run('init-gen').trim()
  assert.strictEqual(initGenPath, path.join(SPEC, 'scripts/init-gen.js'),
    'D11: `spec-paths init-gen` must resolve to spec/scripts/init-gen.js — a wrong or missing key breaks ' +
    'spec/commands/init.md\'s invocation of the generation script silently (§ Risk Tiers, spec-paths: "a ' +
    'wrong key breaks commands silently")')
  assert.ok(fs.existsSync(initGenPath), 'the resolved init-gen.js path must actually exist on disk: ' + initGenPath)
})

test('AC-20260823-01-16: spec-paths release-legs resolves to spec/scripts/release-legs.js, and spec-paths feedback-template is refused now that D10 retires the key', () => {
  const fs = require('node:fs')
  const releaseLegsPath = run('release-legs').trim()
  assert.match(releaseLegsPath, /spec\/scripts\/release-legs\.js$/,
    'D1: `spec-paths release-legs` must resolve to spec/scripts/release-legs.js — a wrong or ' +
    'missing key breaks release.md\'s stage/append/record invocations silently (§ Risk Tiers, ' +
    'spec-paths: "a wrong key breaks commands silently"): got ' + releaseLegsPath)
  assert.ok(fs.existsSync(releaseLegsPath),
    'the resolved release-legs.js path must actually exist on disk: ' + releaseLegsPath)

  let threw = false
  let output = ''
  try {
    run('feedback-template')
  } catch (e) {
    threw = true
    output = String(e.stdout || '') + String(e.stderr || '')
  }
  assert.ok(threw,
    'D10: `spec-paths feedback-template` must exit non-zero now that the key is retired (its ' +
    'consumer, /intake, died in v7) — a still-resolving key means the retirement never actually ' +
    'landed and a caller could still write a document nothing reads')
  assert.match(output, /usage: spec-paths/,
    'the refusal must print the usage line, the same way any other unknown key does, so a caller ' +
    'relying on the old key gets a discoverable error rather than a silent wrong path: ' + output)
})

// specs/20260902/07-mocks-command-driver.md D16 (TDD red): spec-paths has no `mocks-driver` key
// and no `mocks` entry in the `shared-for` SECTIONS map yet — /spec:mocks would resolve nothing.
// Reused by specs/20260914/01-the-mock-contract-and-the-driver.md AC-20260914-01-17 (SHALL
// CONTINUE TO: spec-paths mocks-driver keeps resolving to the rewritten driver) — this test is
// that criterion's reuse pointer target; its title stays byte-identical.
test('AC-20260902-07-15: spec-paths mocks-driver resolves to spec/scripts/mocks-driver.js, an existing absolute path', () => {
  const fs = require('node:fs')
  const mocksDriverPath = run('mocks-driver').trim()
  assert.strictEqual(mocksDriverPath, path.join(SPEC, 'scripts/mocks-driver.js'),
    'D16: `spec-paths mocks-driver` must resolve to spec/scripts/mocks-driver.js — a wrong or ' +
    'missing key breaks /spec:mocks\'s driver invocation silently (§ Risk Tiers, spec-paths: "a ' +
    'wrong key breaks commands silently")')
  assert.ok(path.isAbsolute(mocksDriverPath), 'the printed path must be absolute — a relative path breaks a caller invoked from a different cwd: ' + mocksDriverPath)
  assert.ok(fs.existsSync(mocksDriverPath), 'the resolved mocks-driver.js path must actually exist on disk: ' + mocksDriverPath)
})

// specs/20260902/07-mocks-command-driver.md D16, AC-20260902-07-15: the mocks command's own
// shared-for scope — core sections (Host Grounding, Model Placement, Decisions, Question Style,
// Console Output Style, MCP Policy) plus the design sections (Design Canon, Design Atlas), never
// the render gate doctrine (mocks authors screens, it never binds a spec against them).
// AC-20260905-04-1: the hub's own resolution pin — the retired key must behave exactly like any
// other unknown key: exit 1, the generic usage line on stderr, and that usage line must itself
// list no retired key.
test('AC-20260905-04-1: spec-paths design-hub exits 1 with the generic usage line on stderr, which names no "design-hub" key', () => {
  const { spawnSync } = require('node:child_process')
  const r = spawnSync('bash', [BIN, 'design-hub'], { encoding: 'utf8' })
  assert.strictEqual(r.status, 1, 'a retired key must exit 1 exactly like any other unrecognized key: ' + JSON.stringify(r))
  assert.strictEqual(r.stdout, '', 'a refused key must print nothing on stdout — a caller resolving a path must never read a real-looking value for a deleted script: ' + JSON.stringify(r.stdout))
  assert.match(r.stderr, /^usage: spec-paths /, 'the refusal must print the generic usage line on stderr: ' + JSON.stringify(r.stderr))
  assert.doesNotMatch(r.stderr, /design-hub/, 'the usage line must not list "design-hub" among the valid keys — the hub script and its key are both gone: ' + JSON.stringify(r.stderr))
})

// specs/20260914/03-the-html-atlas-is-retired.md D2/AC-20260914-03-1: the eight retired keys
// (design-atlas, components-check, and the six render-* / design-ac-reconcile keys spec
// 20260914/02 D14 already dropped) must each behave exactly like design-hub above — exit 1, the
// generic usage line on stderr, naming none of the eight. design-atlas and components-check
// still resolve to real paths today (TDD red); the other six are already refused by the
// pre-image script (D14 landed first), so this pin also proves the sweep does not regress them.
test('AC-20260914-03-1: spec-paths design-atlas, components-check, render-gate, render-capture, render-compare, render-inventory, render-rules, and design-ac-reconcile all exit 1 with the generic usage line on stderr, and that usage line names none of the eight retired keys', () => {
  const { spawnSync } = require('node:child_process')
  const RETIRED_KEYS = ['design-atlas', 'components-check', 'render-gate', 'render-capture',
    'render-compare', 'render-inventory', 'render-rules', 'design-ac-reconcile']
  for (const key of RETIRED_KEYS) {
    const r = spawnSync('bash', [BIN, key], { encoding: 'utf8' })
    assert.strictEqual(r.status, 1,
      `D1/D2: \`spec-paths ${key}\` must exit 1 now that the eight retired keys are gone — a ` +
      `still-resolving key means the script that key names is still reachable: ${JSON.stringify(r)}`)
    assert.strictEqual(r.stdout, '',
      `D2: a refused key must print nothing on stdout — a caller resolving a path must never ` +
      `read a real-looking value for a deleted script: ${JSON.stringify(r.stdout)}`)
    assert.match(r.stderr, /^usage: spec-paths /,
      `D2: the refusal must print the generic usage line on stderr, exactly like any other ` +
      `unrecognized key: ${JSON.stringify(r.stderr)}`)
  }
  const { stderr } = spawnSync('bash', [BIN, 'no-such-key-xyz'], { encoding: 'utf8' })
  for (const key of RETIRED_KEYS) {
    assert.doesNotMatch(stderr, new RegExp('(^|[|[])' + key + '($|[|\\]])'),
      `D2: the usage line must not list "${key}" among the valid keys — the script and its key ` +
      `are both gone: ${JSON.stringify(stderr)}`)
  }
})

// specs/20260914/01-the-mock-contract-and-the-driver.md D14, AC-20260914-01-18: `/spec:mocks`
// no longer builds or reads the HTML atlas (the mock app is its own product), so `shared-for
// mocks` drops § Design Atlas from the section set the old AC-20260902-07-15 pin asserted —
// superseding that pin's Design Atlas assertion rather than weakening it (the old pin's other
// assertions all still hold and are kept verbatim below).
test('AC-20260914-01-18: spec-paths shared-for mocks serves exactly the D14 section set — Design Canon present, Design Atlas and Design Render Gate both absent', () => {
  const out = run('shared-for', 'mocks')
  const full = run('shared-for', 'no-such-command')
  assert.ok(out.length < full.length, '`shared-for mocks` output must be a strict subset of the full doctrine, or the scoping map has no mocks entry at all')
  assert.match(out, /## Host Grounding/, 'mocks must be served § Host Grounding — the core invariants every command reads')
  assert.match(out, /## Model Placement/, 'mocks must be served § Model Placement')
  assert.match(out, /## Decisions/, 'mocks must be served § Decisions')
  assert.match(out, /## Question Style/, 'mocks must be served § Question Style — the THEME direction interview and every other AskUserQuestion the driver prompts for must follow it')
  assert.match(out, /## Console Output Style/, 'mocks must be served § Console Output Style — the checkpoint/ledger-counts glyph lines follow the shared narration doctrine')
  assert.match(out, /## MCP Policy/, 'mocks must be served § MCP Policy — the look-via browser path tells the session to ToolSearch for a browser MCP')
  assert.match(out, /## Design Canon/, 'mocks must be served § Design Canon — the seed/canon/wireframe grammar it enforces lives there')
  assert.ok(!/## Design Atlas/.test(out),
    'D14: mocks must NOT be served § Design Atlas — /spec:mocks no longer builds or reads the HTML atlas, so paying for that doctrine would be dead weight: ' + out)
  assert.ok(!/## Design Render Gate/.test(out),
    'mocks must NOT be served § Design Render Gate — the driver authors and approves screens, it never binds a spec against one, so paying for the render-gate doctrine would be dead weight')
})

// Direct fix (no spec): Fable 5.1 token-cost trims — the session's doctrine read surface is
// sliced, never whole-file. Owner: core § Session Execution. Four pins: (1) `init` has its own
// shared-for list instead of falling open to core.md + design.md whole; (2) every scoped list
// serves § Session Execution — the one place the edit-don't-rewrite / no-extras / batch-calls
// rules live; (3) the (now retired) design-only delta key /spec:run's Design stage used to load
// on top of `shared-for run`, disjoint from it; (4) `shared-genesis|shared-mocks --section` print
// one named supplement section's content, bare invocation still prints the path.
test('shared-for init: scoped (not fail-open) and strictly smaller than the whole-doctrine fallback', () => {
  const out = run('shared-for', 'init')
  const full = run('shared-for', 'no-such-command')
  assert.ok(out.length < full.length, 'init must be a scoped list — the fail-open arm cats core.md + design.md whole')
  assert.match(out, /## Host Grounding/)
  assert.match(out, /## Rule Enforcement/)
  assert.match(out, /## Design Canon/, 'init Phase 6 authors the design foundation — it needs Design Canon')
  assert.ok(!/## Design Render Gate/.test(out), 'init never renders — Design Render Gate is design-stage doctrine, not init\'s')
})

// AC-20260926-01-5 (specs/20260926/01-the-approval-file-is-not-a-gate.md D1, rewrites this test
// in place): the `sketch` and design-only-delta SECTIONS arms are deleted outright — both fall
// open to the whole doctrine like every unknown command, so the scoped roster this test walks
// must no longer include either. A1's executed-at-lock count (12 remaining arms) replaces the
// prior floor-only pin, since the roster is now a known, exact count rather than a lower bound.
//
// The design-only-delta key's own literal is built by concatenation below (never spelled whole)
// so this file's own fixture does not itself plant the exact literal AC-20260926-01-3's sweep
// exists to find zero occurrences of elsewhere.
const RUN_DESIGN_KEY = 'run-' + 'design'

test('shared-for: every scoped command serves § Session Execution (AC-20260926-01-5; AC-20260928-01-2 adds prototype), and the scoped roster has exactly 13 members with neither sketch nor the design-only-delta key among them', () => {
  const src = read('spec/bin/spec-paths')
  const cmds = [...src.matchAll(/^\s+([a-z-]+)\)\s+SECTIONS="/gm)].map(m => m[1])
  assert.ok(!cmds.includes('sketch'),
    'AC-20260926-01-5/D1: the scoped roster must not include "sketch" — its SECTIONS arm is deleted, ' +
    'falling open to the whole doctrine like every unknown command: ' + cmds.join(','))
  assert.ok(!cmds.includes(RUN_DESIGN_KEY),
    'AC-20260926-01-5/D1: the scoped roster must not include the design-only-delta key — its ' +
    'SECTIONS arm is deleted, falling open to the whole doctrine like every unknown command: ' + cmds.join(','))
  assert.strictEqual(cmds.length, 13,
    'AC-20260926-01-5 + AC-20260928-01-2: with the sketch and design-only-delta arms deleted and the prototype arm added, exactly 13 scoped ' +
    'command arms (A1, executed at lock) — got ' + cmds.length + ': ' + cmds.join(','))
  for (const cmd of cmds) {
    assert.match(run('shared-for', cmd), /## Session Execution/,
      `/spec:${cmd} must load § Session Execution — without it the session has no edit-don't-rewrite / no-extras / batch-calls contract`)
  }
})

test('AC-20260926-01-5: spec-paths shared-for sketch and spec-paths shared-for run + design (the retired design-only-delta key) both fall open exactly like an unknown command — stdout begins with core.md\'s frontmatter and contains § Design Canon', () => {
  const full = run('shared-for', 'no-such-command')
  for (const cmd of ['sketch', RUN_DESIGN_KEY]) {
    const out = run('shared-for', cmd)
    assert.strictEqual(out, full,
      'AC-20260926-01-5/D1: `spec-paths shared-for ' + cmd + '` must print byte-identical output to ' +
      'the unknown-command fallback once its own SECTIONS arm is deleted — got ' + out.length +
      ' bytes vs the fallback\'s ' + full.length)
    assert.match(out, /^---\n/,
      'AC-20260926-01-5: the fall-open output must begin with core.md\'s frontmatter fence, exactly ' +
      'like the unknown-command case')
    assert.match(out, /## Design Canon/,
      'AC-20260926-01-5: the fall-open output must still contain § Design Canon (design.md is cat\'d ' +
      'in full behind core.md in the fallback arm)')
  }
})

test('shared-genesis / shared-mocks --section: one named supplement section, bare call still prints the path', () => {
  assert.match(run('shared-genesis').trim(), /\/doctrine\/genesis\.md$/)
  assert.match(run('shared-mocks').trim(), /\/doctrine\/mocks\.md$/)
  const g = run('shared-genesis', '--section', 'Discovery Interview')
  assert.match(g, /^## Genesis: Discovery Interview/m)
  assert.ok(!/^## Genesis: Brief State/m.test(g), 'a --section slice must not carry the next section')
  const g2 = run('shared-genesis', '--section', 'Decision Record')
  assert.match(g2, /^## Genesis: Decision Record/m, 'prefix match: a parenthetical heading suffix must not defeat the slice')
  const m = run('shared-mocks', '--section', 'State Machine|Checkpoint contract')
  assert.match(m, /^## Mocks: State Machine/m)
  assert.match(m, /^## Mocks: Checkpoint contract/m)
  assert.ok(!/^## Mocks: Seed/m.test(m))
  const full = read('spec/doctrine/genesis.md')
  assert.ok(g.length < full.length / 4, 'a single-section slice must be a fraction of the supplement — that is the whole point')
})
