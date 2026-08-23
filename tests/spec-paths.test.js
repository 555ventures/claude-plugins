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
// is the third recurrence of the known spec-paths additive-collision class (JJ-20260814-01):
// the key list below is updated in place, never a parallel exhaustive pin.

// AC-20260821-01-11: specs/20260821/01-red-check.md D11 adds spec/scripts/red-check.js to the
// bundle (build.md's Phase 1 invocation, D8) — like every other bundled script it needs a
// spec-paths key, or build.md's `node "$(spec-paths red-check)"` line resolves nothing. This is
// the fourth recurrence of the known spec-paths additive-collision class (JJ-20260814-01): the
// key list below is updated in place, never a parallel exhaustive pin.

// specs/20260820/07-review-driver.md File Plan (spec/bin/spec-paths row): the new
// spec-review-driver.js script needs a spec-paths key like every other bundled script — a
// missing key breaks /spec:review's driver invocation silently (§ Risk Tiers, spec-paths).
// This row carries no AC — it is a key-resolution addition following the pattern above.

// AC-20260823-01-16: specs/20260823/01-release-legs.md D1/D10 adds spec/scripts/release-legs.js
// to the bundle (a new `release-legs` key) and retires `feedback-template` (its consumer,
// /intake, died in v7) — like every other bundled-script addition it needs a spec-paths key or
// release.md's stage/append/record invocations resolve nothing, and like every other retired
// key it must fail loudly rather than keep quietly resolving a deleted template.

test('every documented key resolves to an existing path', () => {
  const fs = require('node:fs')
  for (const key of ['root', 'workflows', 'wf-design', 'wf-enforce',
    'wf-panel', 'wf-research', 'dc-extract', 'design-atlas', 'skeletons-check', 'merge-back',
    'smoke', 'manifest-check', 'spec-status', 'scope-reconcile', 'verdict', 'ci-query', 'review-legs',
    'review-driver', 'promise-sweep', 'replay', 'replay-corpus', 'red-check', 'shared', 'shared-genesis',
    'template', 'templates', 'contract']) {
    const p = run(key).trim()
    assert.ok(fs.existsSync(p), key + ' -> ' + p)
  }
  assert.match(run('version').trim(), /^\d+\.\d+\.\d+$/)
  assert.match(run('contract-hash').trim(), /^[0-9a-f]{12}$/)
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
test('shared-for: scoped output carries its sections and is smaller than the full doc (incl. AC-20260820-05-17: escape keeps serving Incident Policy; AC-20260823-01-19: release keeps Release Stage/Runtime Verification and drops Feedback Loop)', () => {
  const full = run('shared-for', 'no-such-command')
  for (const cmd of ['plan', 'design', 'build', 'review', 'release', 'enforce', 'atlas', 'sketch', 'escape', 'doctor', 'replay']) {
    const out = run('shared-for', cmd)
    assert.ok(out.length < full.length, cmd + ' output should be a strict subset')
    assert.match(out, /## Host Grounding/, cmd + ' must keep Host Grounding')
  }
  assert.match(run('shared-for', 'design'), /## Design Canon/)
  assert.match(run('shared-for', 'design'), /## Design Authoring Contracts/)
  assert.match(run('shared-for', 'design'), /## Design Binding Pipeline/)
  assert.match(run('shared-for', 'design'), /## Design Atlas/)
  assert.match(run('shared-for', 'atlas'), /## Design Atlas/)
  assert.match(run('shared-for', 'atlas'), /## Design Canon/,
    'atlas consumes bound/approved semantics — the ledger definition lives in Design Canon')
  assert.ok(!/## Design Binding Pipeline/.test(run('shared-for', 'atlas')),
    'atlas must not pay for the binding pipeline — design-only doctrine')
  assert.ok(!/## Design (Binding Pipeline|Authoring Contracts)/.test(run('shared-for', 'genesis-explore')),
    'genesis-explore loads only Design Canon of the design sections')
  assert.match(run('shared-for', 'genesis-design'), /## Design Authoring Contracts/)
  assert.ok(!/## Design Binding Pipeline/.test(run('shared-for', 'genesis-design')),
    'genesis-design authors canon, never binds specs')
  assert.match(run('shared-for', 'build'), /## Worker Git Ban/)
  assert.ok(!/## Design (Canon|Authoring Contracts|Binding Pipeline)/.test(run('shared-for', 'review')),
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
  assert.ok(!/## Design (Canon|Authoring Contracts|Binding Pipeline)/.test(run('shared-for', 'doctor')),
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

test('AC-20260821-01-11: spec-paths red-check resolves to spec/scripts/red-check.js, an existing path', () => {
  const fs = require('node:fs')
  const redCheckPath = run('red-check').trim()
  assert.strictEqual(redCheckPath, path.join(SPEC, 'scripts/red-check.js'),
    'D11: `spec-paths red-check` must resolve to spec/scripts/red-check.js — a wrong or missing key breaks ' +
    'build.md\'s `node "$(spec-paths red-check)"` invocation silently (§ Risk Tiers, spec-paths: "a wrong ' +
    'key breaks commands silently")')
  assert.ok(fs.existsSync(redCheckPath), 'the resolved red-check.js path must actually exist on disk: ' + redCheckPath)
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
