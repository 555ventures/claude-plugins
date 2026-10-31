'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { ROOT, tmpdir, gitRepo } = require('../helpers')

// Standing guard, deliberately UNTAGGED — no AC-ID in this file, by design.
//
// Design record: specs/20260908/01-plugin-bump-and-merge-base-pin.md (landed as a direct fix).
// Forcing incident (direct fix, 2026-10-30): the version-bump rule's only gate wiring was
// tests/consistency/plugin-bump.test.js, every case of which cited the AC-IDs of two specs that
// later closed. expire-tests.js retired the whole file at close — no keep clause fires for a HOST
// script like scripts/plugin-bump.js — and with it the gate's only run of `--check`. The
// provenance manifest (.claude/rules/enforcement.json) and rules § Review Checks kept naming the
// dead file because nothing checked that a cited configPath still exists; the check was
// reviewer-held for weeks without anyone noticing.
//
// Two structural pins, both of which must stay free of AC-ID tags so the sweep never reads them:
//   1. the gate wiring itself — `--check` runs against THIS checkout and must be green, plus one
//      synthetic red so a silently no-op'd script cannot pass as "green";
//   2. every enforcer.configPath, and every tests/ path inside a verifiedRun, that the manifest
//      cites resolves to a file in the tree — a retired
//      wiring reddens the gate on the next run instead of going silent.
// Do not add an AC-ID to any test title or the comment block above it; do not weaken these
// assertions to make a sweep pass.

const SCRIPT = path.join(ROOT, 'scripts', 'plugin-bump.js')
const MANIFEST = path.join(ROOT, '.claude', 'rules', 'enforcement.json')

function run(args, cwd) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', cwd })
}

function manifestJson(version) {
  const desc = 'Plugin. Changelog (last 3): ' + [`${version} — a.`, '0.0.2 — b.', '0.0.1 — c.'].join(' ')
  return JSON.stringify({ name: 'spec', version, description: desc }, null, 2) + '\n'
}

// A synthetic marketplace host: one plugin at ./spec, one file spec/x.js, committed on main.
function host(version) {
  const dir = tmpdir('plugin-bump-gate')
  const g = gitRepo(dir, { empty: true })
  fs.mkdirSync(path.join(dir, '.claude-plugin'))
  fs.writeFileSync(path.join(dir, '.claude-plugin', 'marketplace.json'),
    JSON.stringify({ plugins: [{ name: 'spec', source: './spec' }] }, null, 2) + '\n')
  fs.mkdirSync(path.join(dir, 'spec', '.claude-plugin'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'spec', '.claude-plugin', 'plugin.json'), manifestJson(version))
  fs.writeFileSync(path.join(dir, 'spec', 'x.js'), 'a\n')
  g('add', '-A')
  g('commit', '-q', '-m', 'base')
  g('checkout', '-q', '-b', 'feat')
  return { dir, g }
}

test('gate wiring: scripts/plugin-bump.js --check at this repo root exits 0 with one ✅ line per marketplace plugin', () => {
  const plugins = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude-plugin', 'marketplace.json'), 'utf8')).plugins
  const r = run(['--check'], ROOT)
  assert.strictEqual(r.status, 0,
    'the version-bump oracle is red or refusing on this checkout — a change under a plugin directory landed without a bump, or the base is unresolvable:\n' + r.stdout + r.stderr)
  for (const p of plugins) {
    assert.match(r.stdout, new RegExp('^✅ ' + p.name + ' ', 'm'),
      'plugin ' + p.name + ' has no ✅ line — the gate is not actually checking every marketplace plugin: ' + r.stdout)
  }
})

test('gate wiring: an unbumped change under a plugin directory is red, names the plugin and the --bump remedy', () => {
  const h = host('7.1.0')
  fs.writeFileSync(path.join(h.dir, 'spec', 'x.js'), 'b\n')
  h.g('commit', '-q', '-am', 'change without bump')
  const r = run(['--check'], h.dir)
  assert.strictEqual(r.status, 1,
    'a plugin file changed on the branch while plugin.json stayed at the base version, yet --check exited ' + r.status + ' — the gate would let an unbumped behavior change through')
  assert.match(r.stdout, /❌ spec:/, 'the red line must name the plugin — a reviewer cannot act on an anonymous red')
  assert.ok(r.stdout.includes('7.1.0') && r.stdout.includes('--bump --plugin spec'),
    'the red line must carry the base version and the exact --bump remedy — a red without a remedy is a dead end for the worker: ' + r.stdout)
})

test('provenance: every enforcer.configPath and every tests/ path in a verifiedRun cited by .claude/rules/enforcement.json exists in the tree', () => {
  const entries = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')).entries
  assert.ok(Array.isArray(entries) && entries.length > 0,
    'enforcement.json has no entries — the provenance manifest is empty or reshaped and this guard is checking nothing')
  const missing = []
  for (const e of entries) {
    const enf = e.enforcer || {}
    const cited = []
    if (typeof enf.configPath === 'string') cited.push(enf.configPath)
    for (const m of String(enf.verifiedRun || '').match(/tests\/\S+/g) || []) cited.push(m)
    for (const rel of cited) if (!fs.existsSync(path.join(ROOT, rel))) missing.push(e.id + ' → ' + rel)
  }
  assert.deepStrictEqual(missing, [],
    'enforcement.json cites a file that is not in the tree — the enforcer it records is no longer wired into the gate and the rule is silently reviewer-held: ' + missing.join('; '))
})
