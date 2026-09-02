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

// specs/20260824/01-render-gate.md D17 (spec/bin/spec-paths row): the new render-gate.js,
// render-compare.js, and render-inventory.browser.js scripts need spec-paths keys like every
// other bundled script — a missing key breaks review.md's render-gate advisory leg (D16) and
// render-gate.js's own resolution of render-compare/render-inventory silently (§ Risk Tiers,
// spec-paths). D17 marks this row [no-ac]: it is enforced fail-closed by this existing suite
// guard (and by tests/consistency/entrypoints.test.js; same additive-collision class as
// AC-20260819-02-10 above).

// specs/20260824/04-render-rules.md D9 (spec/bin/spec-paths row): the new render-rules.js script
// needs a spec-paths key like every other bundled script — a missing key breaks render-gate.js's
// own resolution of render-rules.js (D5) silently (§ Risk Tiers, spec-paths). D9 marks this row
// [no-ac: suite guards]: it is enforced fail-closed by this existing suite guard (and by
// tests/consistency/entrypoints.test.js; same additive-collision class as AC-20260819-02-10
// above).

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

test('every documented key resolves to an existing path', () => {
  const fs = require('node:fs')
  for (const key of ['root', 'workflows', 'wf-enforce',
    'wf-research', 'design-atlas', 'merge-back',
    'smoke', 'manifest-check', 'spec-status', 'spec-queue', 'scope-reconcile', 'init-gen', 'verdict', 'ci-query', 'review-legs',
    'review-driver', 'build-driver', 'promise-sweep', 'replay', 'replay-corpus', 'red-check', 'render-gate', 'render-compare',
    'render-inventory', 'render-rules', 'registry-check', 'genesis-driver', 'escape-row', 'shared', 'shared-genesis', 'template', 'templates', 'contract']) {
    const p = run(key).trim()
    assert.ok(fs.existsSync(p), key + ' -> ' + p)
  }
  assert.match(run('version').trim(), /^\d+\.\d+\.\d+$/)
  assert.match(run('contract-hash').trim(), /^[0-9a-f]{12}$/)
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
test('shared-for: scoped output carries its sections and is smaller than the full doc (incl. AC-20260820-05-17: escape keeps serving Incident Policy; AC-20260823-01-19: release keeps Release Stage/Runtime Verification and drops Feedback Loop; AC-20260824-05-6: design continues to include Design Canon and Design Atlas, stays a strict subset of full doctrine, and now serves Design Render Gate instead of Design Binding Pipeline)', () => {
  const full = run('shared-for', 'no-such-command')
  for (const cmd of ['plan', 'design', 'build', 'review', 'release', 'enforce', 'atlas', 'sketch', 'escape', 'doctor', 'replay', 'queue']) {
    const out = run('shared-for', cmd)
    assert.ok(out.length < full.length, cmd + ' output should be a strict subset')
    assert.match(out, /## Host Grounding/, cmd + ' must keep Host Grounding')
  }
  assert.match(run('shared-for', 'design'), /## Design Canon/,
    'AC-20260824-05-6: design must continue to be served Design Canon')
  assert.match(run('shared-for', 'design'), /## Design Authoring Contracts/)
  assert.match(run('shared-for', 'design'), /## Design Render Gate/,
    'D1 renames Design Binding Pipeline to Design Render Gate — design must be served the section under its new name')
  assert.match(run('shared-for', 'design'), /## Design Atlas/,
    'AC-20260824-05-6: design must continue to be served Design Atlas')
  assert.match(run('shared-for', 'atlas'), /## Design Atlas/)
  assert.match(run('shared-for', 'atlas'), /## Design Canon/,
    'atlas consumes bound/approved semantics — the ledger definition lives in Design Canon')
  assert.ok(!/## Design Render Gate/.test(run('shared-for', 'atlas')),
    'atlas must not pay for the render gate — design-only doctrine')
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
  assert.match(run('shared-for', 'build'), /## Worker Git Ban/)
  assert.ok(!/## Design (Canon|Authoring Contracts|Render Gate)/.test(run('shared-for', 'review')),
    'review must not pay for design doctrine')
  assert.match(run('shared-for', 'review'), /## Runtime Verification/,
    'review pays for the boot-leg doctrine — CLEAN requires it')
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
    'D12: /spec:queue must be served § Console Output Style — the list glyph conventions (✅▶○🅰, veto/accept lines) must follow the shared narration doctrine')
})

// AC-20260824-05-3: specs/20260824/05-design-doctrine-cut.md D4 renames the design shared-for
// SECTIONS map entry from "Design Binding Pipeline" to "Design Render Gate" (D1 renames the
// underlying design.md heading) and drops "Workflows Encode Shape, Not Judgment" from the
// design-command list specifically (another command's own list could still keep it, per D4) — a
// stale map entry would mean `shared-for` "silently drops mismatches" (§ Review Checks) and
// /spec:design would read no doctrine at all for the render gate it now runs on.
// specs/20260827/03-genesis-design-state.md D7: the parenthetical below names the deleted
// design-lock command as the sibling whose own list still kept this section; that command's
// doctrine surface folds into genesis instead. Updated in place — never a claim this test
// doesn't itself verify.
test('AC-20260824-05-3: spec-paths shared-for design emits ## Design Render Gate, never ## Design Binding Pipeline, and no longer emits Workflows Encode Shape, Not Judgment', () => {
  const out = run('shared-for', 'design')
  assert.match(out, /## Design Render Gate/,
    'D1/D4: design.md\'s renamed section must be served under its new heading — a shared-for map ' +
    'still pointing at the old name means /spec:design reads no doctrine at all for the render ' +
    'gate it now runs on (§ Risk Tiers, spec-paths: "a wrong key breaks commands silently")')
  assert.ok(!/## Design Binding Pipeline/.test(out),
    'the old heading name must never be emitted again once D1 renames the section — a surviving ' +
    'citation here means the map still points at a heading that no longer exists in design.md, ' +
    'which shared-for "silently drops" rather than erroring on (§ Review Checks)')
  assert.ok(!/## Workflows Encode Shape, Not Judgment/.test(out),
    'D4: the design SECTIONS list drops Workflows Encode Shape, Not Judgment specifically for ' +
    '/spec:design — a surviving citation here means the command still pays for doctrine its own ' +
    'section map was supposed to stop serving it (this drop is scoped to design\'s own list only)')
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
    '/spec:build\'s driver invocation silently (§ Risk Tiers, spec-paths: "a wrong key breaks commands silently")')
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
