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

test('AC-20260908-01-5 (also AC-20260909-02-7, SHALL CONTINUE TO): an unresolvable base is a refusal, never a pass, even when SPEC_REVIEW_BASE also fails to resolve', () => {
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
  // AC-20260909-02-7: neither main, origin/main, NOR a 40-hex SPEC_REVIEW_BASE resolves in this
  // detached-HEAD-with-no-main-branch repo — the new middle candidate must not change the exit-2
  // refusal or its remedy.
  const r3 = runEnv(['--check'], dir, { SPEC_REVIEW_BASE: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef' })
  assert.strictEqual(r3.status, 2,
    'AC-20260909-02-7: adding an unresolvable SPEC_REVIEW_BASE candidate must not change the outcome — main, ' +
    'origin/main, and the env candidate all fail to resolve here, so this must still exit 2: ' + JSON.stringify(r3))
  assert.match(r3.stderr, /git fetch origin main:main/,
    'AC-20260909-02-7: the refusal must still name the fetch remedy with SPEC_REVIEW_BASE set: ' + r3.stderr)
})

function execGit(dir, ...a) {
  const r = spawnSync('git', a[0] === 'init' ? a : ['-C', dir, ...a], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error('git ' + a.join(' ') + ' failed: ' + r.stderr)
}

// specs/20260909/02-replay-base-and-label-honesty.md D2 (AC-20260909-02-3..7, -17): resolveBase()
// gains a middle candidate, a 40-hex $SPEC_REVIEW_BASE, tried between --base and main/origin/main
// — a host check that infers its own comparison point from branch topology reads a different
// history than the one a review (or replay's scratch tree standing at parent-plus-overlay) is
// judging. `runEnv` layers extra env vars over process.env for a --check invocation.
function runEnv(args, cwd, env) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', cwd, env: { ...process.env, ...env } })
}

// A1 (executed): the replay scratch tree stands at the close commit's PARENT plus one overlay
// commit re-applying the close commit's non-meta content, and the branch has already merged into
// main — so merge-base(HEAD, main) collapses onto the parent (c1), which sits AFTER the commit
// that carried the bump. This host reproduces that shape from scratch: c0 on main; a `feat`
// branch's c1 edits spec/x.js AND bumps the manifest one minor; c2 (still on feat) edits
// spec/y.js AND specs/n.md; main merges feat with --no-ff; the scratch tree is then a detached
// HEAD at c1 plus one overlay commit re-applying ONLY c2's spec/y.js (never specs/n.md — the
// overlay drops meta-prefixed paths exactly as replay.js --setup --overlay does).
function mergedScratchHost() {
  const h = host('1.0.0', { branch: 'feat' })
  fs.writeFileSync(path.join(h.dir, 'spec', 'x.js'), 'b\n')
  setVersion(h, '1.1.0')
  h.g('commit', '-q', '-am', 'c1: bump to 1.1.0')
  const c1 = h.g('rev-parse', 'HEAD').trim()
  fs.writeFileSync(path.join(h.dir, 'spec', 'y.js'), 'y\n')
  fs.mkdirSync(path.join(h.dir, 'specs'), { recursive: true })
  fs.writeFileSync(path.join(h.dir, 'specs', 'n.md'), 'note\n')
  h.g('add', '-A')
  h.g('commit', '-q', '-m', 'c2: spec/y.js + specs/n.md')
  const c2 = h.g('rev-parse', 'HEAD').trim()
  h.g('checkout', '-q', 'main')
  h.g('merge', '--no-ff', '-q', '-m', 'merge feat', 'feat')
  h.g('checkout', '-q', c1)
  const yAtC2 = h.g('show', `${c2}:spec/y.js`)
  fs.writeFileSync(path.join(h.dir, 'spec', 'y.js'), yAtC2)
  h.g('add', 'spec/y.js')
  h.g('commit', '-q', '-m', 'overlay: reapply c2 spec/y.js')
  return { ...h, c0: h.g('rev-parse', c1 + '^').trim(), c1, c2 }
}

test('AC-20260909-02-3: an already-merged branch\'s scratch tree is green against the review\'s own base and red against the collapsed merge base', () => {
  const h = mergedScratchHost()
  const bare = run(['--check'], h.dir)
  assert.strictEqual(bare.status, 1,
    'A1: on the merged-and-overlaid scratch tree, merge-base(HEAD, main) collapses onto c1 (main already ' +
    'contains it), so bare --check compares HEAD against c1 — a window that shows spec/y.js changed since c1 ' +
    'with the version unmoved (1.1.0 at both ends) and must go red exactly as the real replay tree did: ' +
    JSON.stringify(bare))
  assert.match(bare.stdout, /❌ spec:/,
    'the red line must name the plugin: ' + bare.stdout)
  const occurrences = (bare.stdout.match(/1\.1\.0/g) || []).length
  assert.strictEqual(occurrences, 2,
    'D2: the red line must show version 1.1.0 at BOTH ends (HEAD and the collapsed base c1) — this is the ' +
    'exact "check judges a window that excludes the very change it exists to see" defect: ' + bare.stdout)

  const withEnv = runEnv(['--check'], h.dir, { SPEC_REVIEW_BASE: h.c0 })
  assert.strictEqual(withEnv.status, 0,
    'D2: given the review\'s own base (c0, the true pre-image before the bump), the SAME tree must report the ' +
    'bump it actually made — SPEC_REVIEW_BASE is not yet a candidate resolveBase() tries, so this is red today: ' +
    JSON.stringify(withEnv))
  assert.match(withEnv.stdout, /✅ spec 1\.0\.0 → 1\.1\.0/,
    'D2: given SPEC_REVIEW_BASE=c0, --check must print the real bump 1.0.0 → 1.1.0, not the collapsed-base ' +
    'false red: ' + withEnv.stdout)
})

test('AC-20260909-02-4: an explicit --base outranks SPEC_REVIEW_BASE', () => {
  const h = mergedScratchHost()
  const r = runEnv(['--check', '--base', 'HEAD'], h.dir, { SPEC_REVIEW_BASE: h.c0 })
  assert.strictEqual(r.status, 0,
    '--base HEAD names the overlay commit itself as the base, so the diff HEAD..HEAD is empty regardless of ' +
    'SPEC_REVIEW_BASE=c0 (which alone would print the real bump) — an explicit --base flag must always win: ' +
    JSON.stringify(r))
  assert.match(r.stdout, /✅ spec 1\.1\.0 \(no change under spec\/\)/,
    'D2: --base must outrank SPEC_REVIEW_BASE — a wrong precedence here would let an environment variable ' +
    'silently override a caller\'s explicit flag: ' + r.stdout)
})

test('AC-20260909-02-5: an unresolvable SPEC_REVIEW_BASE falls through to main and produces the same result as an unset variable', () => {
  const h = host('7.1.0', { branch: 'feat' })
  fs.writeFileSync(path.join(h.dir, 'spec', 'x.js'), 'b\n')
  h.g('commit', '-q', '-am', 'change without bump')
  const bare = run(['--check'], h.dir)
  const withBadEnv = runEnv(['--check'], h.dir, { SPEC_REVIEW_BASE: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef' })
  assert.strictEqual(bare.status, 1, 'sanity: this unbumped branch must be red today: ' + JSON.stringify(bare))
  assert.strictEqual(withBadEnv.status, bare.status,
    'D2: a 40-hex SPEC_REVIEW_BASE this repository cannot resolve must fall through to main exactly as an ' +
    'unset variable does, never a silent pass: ' + JSON.stringify(withBadEnv))
  assert.strictEqual(withBadEnv.stdout, bare.stdout,
    'D2: the stdout must be byte-identical between the unset and unresolvable-sha runs — any divergence means ' +
    'the unresolvable candidate leaked into the comparison instead of being dropped: ' +
    JSON.stringify({ bare: bare.stdout, withBadEnv: withBadEnv.stdout }))
})

test('AC-20260909-02-6: a ref-shaped SPEC_REVIEW_BASE is ignored, because a name means a different commit in every repository', () => {
  const h = mergedScratchHost()
  const bare = run(['--check'], h.dir)
  const withRefEnv = runEnv(['--check'], h.dir, { SPEC_REVIEW_BASE: 'main' })
  assert.strictEqual(withRefEnv.status, bare.status,
    'D2: SPEC_REVIEW_BASE="main" would resolve in THIS repo (and print the real bump if honored) — but only a ' +
    '40-hex sha may cross the environment boundary, since a ref name resolves to a different commit in every ' +
    'repository, including a synthetic one a test builds in a temporary directory: ' + JSON.stringify(withRefEnv))
  assert.strictEqual(withRefEnv.stdout, bare.stdout,
    'D2: a ref-shaped SPEC_REVIEW_BASE must be dropped entirely, producing byte-identical stdout to the unset ' +
    'run — resolving it would silently redirect the base inside every synthetic marketplace this script\'s own ' +
    'tests build: ' + JSON.stringify({ bare: bare.stdout, withRefEnv: withRefEnv.stdout }))
})

// AC-20260909-02-17 must prove SPEC_REVIEW_BASE moves the window on THIS real checkout (not only
// in a synthetic host) without depending on this branch's own topology relative to main — a bare
// `--check` (no --base, no env) shows a "→" line only while HEAD carries an unbumped or
// not-yet-merged change under spec/, which is false the instant this branch merges into main. The
// two windows below are instead both anchored to state the test itself controls: a fixed,
// already-merged historical commit (the commit that first gave spec's manifest a semver-shaped
// version — an ancestor of every future HEAD, so `git merge-base HEAD <this sha>` always resolves
// to it unchanged) versus HEAD itself — neither depends on whether HEAD is ahead of, equal to, or on a
// branch alongside main.
const SPEC_FIRST_VERSIONED_MANIFEST_SHA = '8b97167412d120d20a758db557d7daf1f7ebe75c'

test('AC-20260909-02-17: on this checkout, SPEC_REVIEW_BASE moves the window the check judges, independent of this branch\'s own topology', () => {
  const headSha = execGitCapture(ROOT, 'rev-parse', 'HEAD')
  const explicitOldBase = run(['--check', '--base', SPEC_FIRST_VERSIONED_MANIFEST_SHA], ROOT)
  assert.strictEqual(explicitOldBase.status, 0,
    'sanity: --base pinned to a real ancestor commit must resolve and succeed on this checkout: ' + JSON.stringify(explicitOldBase))
  assert.match(explicitOldBase.stdout, /✅ spec .* → /,
    'sanity: every commit since this fixed ancestor has only ever raised the spec plugin\'s version, so an ' +
    'explicit --base pinned to it must show a real version-comparison "→" line for spec — this anchors the ' +
    'test to a value it controls instead of the ambient bare-run topology: ' + explicitOldBase.stdout)

  const viaEnv = runEnv(['--check'], ROOT, { SPEC_REVIEW_BASE: SPEC_FIRST_VERSIONED_MANIFEST_SHA })
  assert.strictEqual(viaEnv.status, explicitOldBase.status,
    'AC-20260909-02-17: SPEC_REVIEW_BASE set to the SAME ancestor sha, with no --base flag, must resolve to an ' +
    'identical outcome as passing it explicitly via --base: ' + JSON.stringify(viaEnv))
  assert.strictEqual(viaEnv.stdout, explicitOldBase.stdout,
    'AC-20260909-02-17: SPEC_REVIEW_BASE must be honored on this real checkout (not only in synthetic hosts) — ' +
    'stdout must be byte-identical to the explicit --base run naming the same commit, proving the env value ' +
    'resolved through the same code path: ' + JSON.stringify({ explicitOldBase: explicitOldBase.stdout, viaEnv: viaEnv.stdout }))

  const viaEnvHead = runEnv(['--check'], ROOT, { SPEC_REVIEW_BASE: headSha })
  assert.strictEqual(viaEnvHead.status, 0,
    'AC-20260909-02-17: SPEC_REVIEW_BASE=<HEAD sha> collapses the window to HEAD..HEAD (no change anywhere) ' +
    'and must exit 0 — HEAD is always resolvable regardless of this branch\'s relationship to main: ' + JSON.stringify(viaEnvHead))
  for (const line of viaEnvHead.stdout.trim().split('\n')) {
    assert.match(line, /\(no change under /,
      'AC-20260909-02-17: every plugin line under SPEC_REVIEW_BASE=<HEAD sha> must read "(no change under " — ' +
      'a "→" line here means the variable was not honored: ' + line)
  }
  assert.notStrictEqual(viaEnv.stdout, viaEnvHead.stdout,
    'AC-20260909-02-17: two different SPEC_REVIEW_BASE values must produce two different windows — identical ' +
    'output for the old-ancestor candidate and the HEAD candidate would mean the variable is not actually ' +
    'moving the comparison point at all: ' + JSON.stringify({ viaEnv: viaEnv.stdout, viaEnvHead: viaEnvHead.stdout }))
})

function execGitCapture(dir, ...a) {
  const r = spawnSync('git', ['-C', dir, ...a], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error('git ' + a.join(' ') + ' failed: ' + r.stderr)
  return r.stdout.trim()
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
