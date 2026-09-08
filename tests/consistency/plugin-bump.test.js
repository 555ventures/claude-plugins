'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { ROOT, tmpdir, gitRepo } = require('../helpers')

// specs/20260908/01-plugin-bump-and-merge-base-pin.md (landed as a direct fix): scripts/plugin-bump.js
// is the deterministic pin behind the host rule "a change under a plugin directory bumps that
// plugin's semver". --check compares each marketplace plugin's manifest version at HEAD against the
// merge base; --bump derives the next minor and rotates the description changelog to three entries.

const SCRIPT = path.join(ROOT, 'scripts', 'plugin-bump.js')

function run(args, cwd) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', cwd })
}

function manifestJson(version, entries) {
  const desc = 'Plugin. ' + (entries === null ? '' : 'Changelog (last 3): ' + entries.join(' '))
  return JSON.stringify({ name: 'spec', version, description: desc }, null, 2) + '\n'
}

// A synthetic marketplace host: one plugin at ./spec, manifest at `version`, one file spec/x.js,
// committed on main; returns the git helper.
function host(version, opts = {}) {
  const dir = tmpdir('plugin-bump')
  const g = gitRepo(dir, { empty: true })
  fs.mkdirSync(path.join(dir, '.claude-plugin'))
  fs.writeFileSync(path.join(dir, '.claude-plugin', 'marketplace.json'),
    JSON.stringify({ plugins: [{ name: 'spec', source: './spec' }] }, null, 2) + '\n')
  fs.mkdirSync(path.join(dir, 'spec', '.claude-plugin'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'spec', '.claude-plugin', 'plugin.json'),
    manifestJson(version, opts.entries === undefined ? [`${version} — a.`, '0.0.2 — b.', '0.0.1 — c.'] : opts.entries))
  fs.writeFileSync(path.join(dir, 'spec', 'x.js'), 'a\n')
  g('add', '-A')
  g('commit', '-q', '-m', 'base')
  if (opts.branch) g('checkout', '-q', '-b', opts.branch)
  return { dir, g, manifest: path.join(dir, 'spec', '.claude-plugin', 'plugin.json') }
}

function setVersion(h, version) {
  const m = JSON.parse(fs.readFileSync(h.manifest, 'utf8'))
  m.version = version
  fs.writeFileSync(h.manifest, JSON.stringify(m, null, 2) + '\n')
}

test('AC-20260908-01-1: the repo\'s own plugins satisfy the merge-base version rule — --check at the repo root exits 0 with one ✅ line per marketplace plugin', () => {
  const r = run(['--check'], ROOT)
  assert.strictEqual(r.status, 0,
    'plugin-bump --check is red on this checkout: a plugin directory changed since the merge base without a higher plugin.json version — the bump discipline was skipped on this branch\n' + r.stdout + r.stderr)
  const plugins = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude-plugin', 'marketplace.json'), 'utf8')).plugins
  for (const p of plugins) {
    assert.ok(r.stdout.includes(`✅ ${p.name} `),
      `--check printed no ✅ line for plugin ${p.name} — a marketplace plugin the check silently skips is a plugin whose bumps are unverified`)
  }
})

test('AC-20260908-01-2: an unbumped change under a plugin directory is red with the bump remedy', () => {
  const h = host('7.1.0', { branch: 'feat' })
  fs.writeFileSync(path.join(h.dir, 'spec', 'x.js'), 'b\n')
  h.g('commit', '-q', '-am', 'change without bump')
  const r = run(['--check'], h.dir)
  assert.strictEqual(r.status, 1,
    'a plugin file changed on the branch while plugin.json stayed at the base version, yet --check exited ' + r.status + ' — the gate would let an unbumped behavior change through')
  assert.match(r.stdout, /❌ spec:/, 'the red line must name the plugin — a reviewer cannot act on an anonymous red')
  assert.ok(r.stdout.includes('7.1.0') && r.stdout.includes('--bump --plugin spec'),
    'the red line must carry both versions and the exact --bump remedy command — a red without a remedy is a dead end for the worker: ' + r.stdout)
})

test('AC-20260908-01-2: the comparator ranks 7.11.0 above 7.9.0 — a bump across the two-digit minor boundary is green', () => {
  const h = host('7.9.0', { branch: 'feat' })
  fs.writeFileSync(path.join(h.dir, 'spec', 'x.js'), 'b\n')
  setVersion(h, '7.11.0')
  h.g('commit', '-q', '-am', 'bump to 7.11.0')
  const r = run(['--check'], h.dir)
  assert.strictEqual(r.status, 0,
    '7.9.0 → 7.11.0 is a valid bump, but --check exited ' + r.status + ' — the comparator fell into the lexical trap ("7.11.0" < "7.9.0" as strings) and would block every bump past minor 9\n' + r.stdout)
})

test('AC-20260908-01-3: no change under the plugin directory owes no bump — HEAD equal to main is green', () => {
  const h = host('7.1.0')
  const r = run(['--check'], h.dir)
  assert.strictEqual(r.status, 0,
    'nothing under spec/ changed between main and HEAD, yet --check exited ' + r.status + ' — the gate would be red on every untouched checkout, including main itself\n' + r.stdout + r.stderr)
  assert.match(r.stdout, /✅ spec 7\.1\.0 \(no change under spec\/\)/,
    'the green line must say the plugin directory is unchanged — otherwise a reader cannot tell "bumped" from "nothing to bump"')
})

test('AC-20260908-01-3: a manifest-only edit owes no bump — a description change at the same version is green', () => {
  const h = host('7.1.0', { branch: 'feat' })
  const m = JSON.parse(fs.readFileSync(h.manifest, 'utf8'))
  m.description = m.description + ' typo fixed.'
  fs.writeFileSync(h.manifest, JSON.stringify(m, null, 2) + '\n')
  h.g('commit', '-q', '-am', 'description only')
  const r = run(['--check'], h.dir)
  assert.strictEqual(r.status, 0,
    'only spec/.claude-plugin/plugin.json changed, yet --check exited ' + r.status + ' — the manifest must be excluded from the changed set or every changelog wording fix demands its own version\n' + r.stdout)
})

test('AC-20260908-01-4: a branch behind a bumped base is red with the rebase remedy', () => {
  const h = host('7.3.0', { branch: 'feat' })
  fs.writeFileSync(path.join(h.dir, 'spec', 'x.js'), 'b\n')
  setVersion(h, '7.2.0')
  h.g('commit', '-q', '-am', 'stale branch at 7.2.0')
  const r = run(['--check'], h.dir)
  assert.strictEqual(r.status, 1,
    'HEAD reads 7.2.0 while the base already shipped 7.3.0 and spec/ changed, yet --check exited ' + r.status + ' — the stale-sibling race this script exists to catch would pass\n' + r.stdout)
  assert.match(r.stdout, /rebase onto/,
    'a version LOWER than the base must name the rebase remedy, not only the bump — bumping a stale branch to 7.3.0 would collide again at merge')
})

test('AC-20260908-01-5: an unresolvable base is a refusal, never a pass', () => {
  const dir = tmpdir('plugin-bump-trunk')
  execGit(dir, 'init', '-q', '-b', 'trunk', dir)
  execGit(dir, 'config', 'user.email', 't@t')
  execGit(dir, 'config', 'user.name', 't')
  fs.mkdirSync(path.join(dir, '.claude-plugin'))
  fs.writeFileSync(path.join(dir, '.claude-plugin', 'marketplace.json'), JSON.stringify({ plugins: [{ name: 'spec', source: './spec' }] }) + '\n')
  fs.mkdirSync(path.join(dir, 'spec', '.claude-plugin'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'spec', '.claude-plugin', 'plugin.json'), manifestJson('7.1.0', ['7.1.0 — a.', '7.0.0 — b.', '6.9.0 — c.']))
  execGit(dir, 'add', '-A')
  execGit(dir, 'commit', '-q', '-m', 'base')
  const r = run(['--check'], dir)
  assert.strictEqual(r.status, 2,
    'neither main nor origin/main exists in this repo, yet --check exited ' + r.status + ' — an unresolvable base that passes is a silent skip of the whole rule')
  assert.match(r.stderr, /git fetch origin main:main/,
    'the refusal must name the fetch remedy — a shallow or detached checkout needs to know how to make the base exist')
  const r2 = run(['--check', '--base', 'trunk'], dir)
  assert.strictEqual(r2.status, 0,
    '--base trunk names a real ref with no change under spec/, yet --check exited ' + r2.status + ' — --base must override the main/origin/main derivation\n' + r2.stdout + r2.stderr)
})

function execGit(dir, ...a) {
  const r = spawnSync('git', a[0] === 'init' ? a : ['-C', dir, ...a], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error('git ' + a.join(' ') + ' failed: ' + r.stderr)
}

test('AC-20260908-01-6: bump advances the minor, resets the patch, and rotates the changelog to three entries', () => {
  const h = host('7.102.0', { entries: ['7.102.0 — a.', '7.101.0 — b.', '7.100.0 — c.'] })
  const r = run(['--bump', '--plugin', 'spec', '--changelog', 'adds X'], h.dir)
  assert.strictEqual(r.status, 0, '--bump refused a well-formed manifest: ' + r.stderr)
  assert.strictEqual(r.stdout.trim(), '7.103.0',
    '--bump must print the new version alone on stdout — a worker pipes this into the File Plan row and the commit message')
  const m = JSON.parse(fs.readFileSync(h.manifest, 'utf8'))
  assert.strictEqual(m.version, '7.103.0', 'the manifest version must advance the minor and reset the patch')
  assert.ok(m.description.endsWith('Changelog (last 3): 7.103.0 — adds X. 7.102.0 — a. 7.101.0 — b.'),
    'the changelog run must lead with the new entry (a period appended), keep the previous two, and drop the oldest — got: ' + m.description)

  const h2 = host('7.9.3', { entries: ['7.9.3 — a.', '7.9.2 — b.', '7.9.1 — c.'] })
  const r2 = run(['--bump', '--plugin', 'spec', '--changelog', 'resets the patch.'], h2.dir)
  assert.strictEqual(r2.stdout.trim(), '7.10.0',
    '7.9.3 must bump to 7.10.0 — a bump that keeps the patch or goes to 7.10.3 is not a minor bump')
})

test('AC-20260908-01-6: the rewritten manifest is byte-stable under a JSON round trip', () => {
  const h = host('7.1.0')
  run(['--bump', '--plugin', 'spec', '--changelog', 'adds X'], h.dir)
  const raw = fs.readFileSync(h.manifest, 'utf8')
  assert.strictEqual(raw, JSON.stringify(JSON.parse(raw), null, 2) + '\n',
    'the written manifest must be exactly 2-space JSON with a trailing newline — any other formatting shows up as a spurious whole-file diff on the next bump')
})

test('AC-20260908-01-7: --dry-run prints the next version and writes nothing', () => {
  const h = host('7.1.0')
  const before = fs.readFileSync(h.manifest, 'utf8')
  const r = run(['--bump', '--plugin', 'spec', '--changelog', 'adds X', '--dry-run'], h.dir)
  assert.strictEqual(r.status, 0, '--dry-run must exit 0: ' + r.stderr)
  assert.strictEqual(r.stdout.trim(), '7.2.0', '--dry-run must print the version the real bump would write')
  assert.strictEqual(fs.readFileSync(h.manifest, 'utf8'), before,
    '--dry-run changed the manifest — a planner previewing the number would have bumped the plugin by accident')
})

test('AC-20260908-01-8: bump refusals name the remedy and write nothing', () => {
  const noMarker = host('1.3.0', { entries: null })
  const before = fs.readFileSync(noMarker.manifest, 'utf8')
  const r1 = run(['--bump', '--plugin', 'spec', '--changelog', 'adds X'], noMarker.dir)
  assert.strictEqual(r1.status, 2, 'a manifest with no "Changelog (last 3):" run must be refused, not bumped version-only — the changelog surface would silently stay empty')
  assert.match(r1.stderr, /^plugin-bump: .*remedy/m, 'the refusal must start "plugin-bump: " and name a remedy: ' + r1.stderr)
  assert.strictEqual(fs.readFileSync(noMarker.manifest, 'utf8'), before, 'a refused bump must leave the manifest bytes untouched')

  const h = host('7.1.0')
  const before2 = fs.readFileSync(h.manifest, 'utf8')
  const r2 = run(['--bump', '--plugin', 'spec', '--changelog', '   '], h.dir)
  assert.strictEqual(r2.status, 2, 'an empty --changelog must be refused — a bump with no paragraph is the exact defect the three-entry pin exists to catch')
  assert.match(r2.stderr, /remedy/, 'the empty-changelog refusal must name a remedy')
  const r3 = run(['--bump', '--plugin', 'nope', '--changelog', 'adds X'], h.dir)
  assert.strictEqual(r3.status, 2, 'a plugin absent from marketplace.json must be refused — there is no manifest path to derive')
  assert.match(r3.stderr, /remedy/, 'the unknown-plugin refusal must name a remedy')
  assert.strictEqual(fs.readFileSync(h.manifest, 'utf8'), before2, 'refused bumps must leave the manifest bytes untouched')
})
