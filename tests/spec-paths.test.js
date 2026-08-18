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

test('every documented key resolves to an existing path', () => {
  const fs = require('node:fs')
  for (const key of ['root', 'workflows', 'wf-design', 'wf-enforce',
    'wf-panel', 'wf-research', 'dc-extract', 'design-atlas', 'skeletons-check', 'merge-back',
    'smoke', 'manifest-check', 'spec-status', 'scope-reconcile', 'verdict', 'ci-query',
    'shared', 'shared-genesis', 'template', 'templates', 'contract']) {
    const p = run(key).trim()
    assert.ok(fs.existsSync(p), key + ' -> ' + p)
  }
  assert.match(run('version').trim(), /^\d+\.\d+\.\d+$/)
  assert.match(run('contract-hash').trim(), /^[0-9a-f]{12}$/)
})

test('shared-for: every mapped section name still exists as a shared.md heading', () => {
  const src = read('spec/bin/spec-paths')
  const doc = read('spec/doctrine/shared.md')
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
test('shared-for: scoped output carries its sections and is smaller than the full doc', () => {
  const full = run('shared-for', 'no-such-command')
  for (const cmd of ['plan', 'design', 'build', 'review', 'release', 'enforce', 'atlas', 'sketch', 'escape', 'doctor']) {
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
  assert.match(run('shared-for', 'build'), /## Escalation Contract/)
  assert.ok(!/## Design (Canon|Authoring Contracts|Binding Pipeline)/.test(run('shared-for', 'review')),
    'review must not pay for design doctrine')
  assert.match(run('shared-for', 'review'), /## Runtime Verification/,
    'review pays for the boot-leg doctrine — CLEAN requires it')
  assert.match(run('shared-for', 'release'), /## Release Stage/)
  assert.match(run('shared-for', 'release'), /## Runtime Verification/)
  assert.match(run('shared-for', 'escape'), /## Feedback Loop/,
    'escape IS the Emit leg — it writes preventedBy rows and Gotchas tags')
  assert.ok(!/## Design (Canon|Authoring Contracts|Binding Pipeline)/.test(run('shared-for', 'doctor')),
    'doctor must not pay for design doctrine — check 8 only verifies design files exist')
  assert.match(run('shared-for', 'doctor'), /## Grounding Drift/)
  assert.match(run('shared-for', 'doctor'), /## Rule Enforcement/)
})
