'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { ROOT, read, tmpdir, runNode, runBash, gitRepo } = require('../helpers')

// specs/20260812/02-hotspot-audit.md (2026-08-12): /spec:audit's hotspot derivation
// (spec/scripts/hotspot.js) and its doctrine wiring (audit.md, release.md, shared.md,
// spec-paths) do not exist yet at HEAD. Pins AC-20260812-02-1 … -9 (AC-10 is carried
// unmodified by tests/review/scope-reconcile.test.js; AC-11 by
// tests/terminal-observable-acs.test.js per the spec's File Plan).

const SCRIPT = 'scripts/hotspot.js'

// Commits a file at a controlled point in the past so --since windows are deterministic
// regardless of when the suite runs.
function commitFile(dir, relPath, content, daysAgo, msg) {
  const full = path.join(dir, relPath)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content)
  const date = new Date(Date.now() - daysAgo * 86400000).toISOString()
  const env = { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date }
  execFileSync('git', ['-C', dir, 'add', '-A'], { env, encoding: 'utf8' })
  execFileSync('git', ['-C', dir, 'commit', '-q', '-m', msg || ('update ' + relPath)], { env, encoding: 'utf8' })
}

function removeFile(dir, relPath, daysAgo, msg) {
  execFileSync('git', ['-C', dir, 'rm', '-q', relPath], { encoding: 'utf8' })
  const date = new Date(Date.now() - daysAgo * 86400000).toISOString()
  const env = { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date }
  execFileSync('git', ['-C', dir, 'commit', '-q', '-m', msg || ('remove ' + relPath)], { env, encoding: 'utf8' })
}

function parseJSON(res, label) {
  assert.strictEqual(res.status, 0, `${label}: hotspot.js must exit 0 — stderr: ${res.stderr}`)
  try {
    return JSON.parse(res.stdout)
  } catch (e) {
    assert.fail(`${label}: hotspot.js --json must print parseable JSON — got: ${res.stdout} (${e.message})`)
  }
}

test('AC-20260812-02-1: hotspot.js ranks by commits*(1+complexity) desc, ties by path, with exact per-file values', () => {
  const dir = tmpdir('hotspot-rank')
  gitRepo(dir, { empty: true })
  // hot.js: 3 in-window commits, final body lines indented 8/4/0 spaces -> complexity 2+1+0=3
  commitFile(dir, 'hot.js', '        a\n', 10, 'hot 1')
  commitFile(dir, 'hot.js', '        a\n    b\n', 8, 'hot 2')
  commitFile(dir, 'hot.js', '        a\n    b\nc\n', 5, 'hot 3')
  // cold.js: 1 in-window commit, complexity 1 (single line indented 4 spaces -> ceil(4/4)=1)
  commitFile(dir, 'cold.js', '    x\n', 4, 'cold 1')

  const res = runNode(SCRIPT, ['--root', dir, '--json', '--since', '365', '--top', '5'])
  const out = parseJSON(res, 'AC-1')
  assert.strictEqual(out.window.sinceDays, 365, 'AC-1: --since 365 must be echoed as the resolved window')

  const hot = out.hotspots.find(h => h.path === 'hot.js')
  const cold = out.hotspots.find(h => h.path === 'cold.js')
  assert.ok(hot, 'AC-1: hot.js missing from the ranking — churn/complexity derivation dropped it')
  assert.ok(cold, 'AC-1: cold.js missing from the ranking — churn/complexity derivation dropped it')
  assert.deepStrictEqual({ commits: hot.commits, complexity: hot.complexity, score: hot.score },
    { commits: 3, complexity: 3, score: 12 },
    'AC-1: hot.js must report commits=3, complexity=3 (D4 indentation sum), score=commits*(1+complexity)=12')
  assert.deepStrictEqual({ commits: cold.commits, complexity: cold.complexity, score: cold.score },
    { commits: 1, complexity: 1, score: 2 },
    'AC-1: cold.js must report commits=1, complexity=1, score=2')
  const hotIdx = out.hotspots.indexOf(hot)
  const coldIdx = out.hotspots.indexOf(cold)
  assert.ok(hotIdx < coldIdx, 'AC-1: hot.js (score 12) must rank ahead of cold.js (score 2) in the JSON ranking')
})

test('AC-20260812-02-2: hotspot.js exits 2 with a remedy when --root is not a git repository', () => {
  const dir = tmpdir('hotspot-nogit')
  const res = runNode(SCRIPT, ['--root', dir, '--json'])
  assert.strictEqual(res.status, 2,
    'a non-git --root must exit 2, not crash or silently emit an empty ranking')
  assert.match(res.stderr, /git repo|git repository/i,
    'the exit-2 message must name the remedy (run inside a git repo / pass a repo root) per the header comment convention')
})

test('AC-20260812-02-3: pipelineOwnedPaths globs exclude matching hotspots, and an absent config skips exclusion silently', () => {
  const dir = tmpdir('hotspot-owned')
  gitRepo(dir, { empty: true })
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'),
    JSON.stringify({ pipelineOwnedPaths: ['gen/*.js'] }))
  execFileSync('git', ['-C', dir, 'add', '-A'], { encoding: 'utf8' })
  execFileSync('git', ['-C', dir, 'commit', '-q', '-m', 'config'],
    { env: { ...process.env, GIT_AUTHOR_DATE: new Date(Date.now() - 20 * 86400000).toISOString(), GIT_COMMITTER_DATE: new Date(Date.now() - 20 * 86400000).toISOString() }, encoding: 'utf8' })
  commitFile(dir, 'gen/wf-x.js', '  a\n', 10, 'generated')
  commitFile(dir, 'real.js', '  a\n', 8, 'real')

  const res = runNode(SCRIPT, ['--root', dir, '--json', '--since', '365'])
  const out = parseJSON(res, 'AC-3 config-present')
  assert.ok(!out.hotspots.some(h => h.path === 'gen/wf-x.js'),
    'AC-3: gen/wf-x.js matches the configured pipelineOwnedPaths glob and must be omitted from the ranking')
  assert.ok(out.hotspots.some(h => h.path === 'real.js'),
    'AC-3: real.js does not match any exclusion glob and must still be ranked')

  const dir2 = tmpdir('hotspot-noconfig')
  gitRepo(dir2, { empty: true })
  commitFile(dir2, 'plain.js', '  a\n', 5, 'plain')
  const res2 = runNode(SCRIPT, ['--root', dir2, '--json', '--since', '365'])
  assert.strictEqual(res2.status, 0,
    'AC-3: an absent .claude/spec.config.json must not error — exclusion is silently skipped')
  const out2 = parseJSON(res2, 'AC-3 config-absent')
  assert.ok(out2.hotspots.some(h => h.path === 'plain.js'),
    'AC-3: with no config file, ranking must still include ordinary files')
})

test('AC-20260812-02-4: a file deleted at HEAD with in-window commit history is omitted, not an error', () => {
  const dir = tmpdir('hotspot-deleted')
  gitRepo(dir, { empty: true })
  commitFile(dir, 'gone.js', '  a\n', 10, 'add gone')
  commitFile(dir, 'stays.js', '  a\n', 8, 'add stays')
  removeFile(dir, 'gone.js', 5, 'remove gone')

  const res = runNode(SCRIPT, ['--root', dir, '--json', '--since', '365'])
  const out = parseJSON(res, 'AC-4')
  assert.ok(!out.hotspots.some(h => h.path === 'gone.js'),
    'AC-4: gone.js has in-window commits but does not exist at HEAD — it cannot be complexity-read and must be omitted, never crash the derivation')
  assert.ok(out.hotspots.some(h => h.path === 'stays.js'),
    'AC-4: stays.js still exists at HEAD and must remain ranked')
})

test('AC-20260812-02-5: audit.md states the closed fate enum, ledger path, ledger-first rule, promotion rule, ingestion seam, and the never-edit/never-gate hard rules', () => {
  const CMD = path.join(ROOT, 'spec/commands/audit.md')
  assert.ok(fs.existsSync(CMD), 'spec/commands/audit.md does not exist yet — /spec:audit is unshipped')
  const cmd = fs.existsSync(CMD) ? fs.readFileSync(CMD, 'utf8') : ''

  assert.match(cmd, /refactor-brief\(NN\)/, 'AC-5: audit.md must state the refactor-brief(NN) fate literally')
  assert.match(cmd, /rule-row/, 'AC-5: audit.md must state the rule-row fate literally')
  assert.match(cmd, /enforcer/, 'AC-5: audit.md must state the enforcer fate literally')
  assert.match(cmd, /rejected\(/, 'AC-5: audit.md must state the rejected(<reason>) fate literally')
  assert.match(cmd, /docs\/audit\/debt-ledger\.md/, 'AC-5: audit.md must name the ledger path docs/audit/debt-ledger.md')
  assert.match(cmd, /(reads?|read) the ledger.{0,20}first|ledger[- ]first/i,
    'AC-5: audit.md must state the ledger-read-first rule')
  assert.match(cmd, /≥\s?2|at least 2|two ledger rows|2 ledger rows/i,
    'AC-5: audit.md must state the ≥2-per-class recurrence promotion rule')
  assert.match(cmd, /docs\/audit\/advisory-findings\.md/,
    'AC-5: audit.md must name the advisory-findings.md ingestion seam')
  assert.match(cmd, /never edits? host source|never modif(?:y|ies) host source/i,
    'AC-5: audit.md must state the hard rule that the audit never edits host source')
  assert.match(cmd, /never gates?/i,
    'AC-5: audit.md must state the hard rule that the audit never gates any pipeline stage')
})

test('AC-20260812-02-6: spec-paths resolves hotspot, scopes shared-for audit to Model Placement, and lists hotspot in the usage line', () => {
  const hotspotPath = runBash('bin/spec-paths', ['hotspot'])
  assert.strictEqual(hotspotPath.status, 0, 'spec-paths hotspot must resolve: ' + hotspotPath.stderr)
  assert.strictEqual(hotspotPath.stdout.trim(), path.join(ROOT, 'spec/scripts/hotspot.js'),
    'spec-paths hotspot must print the absolute path to spec/scripts/hotspot.js')

  const sharedFor = runBash('bin/spec-paths', ['shared-for', 'audit'])
  assert.strictEqual(sharedFor.status, 0, 'spec-paths shared-for audit must resolve: ' + sharedFor.stderr)
  assert.match(sharedFor.stdout, /^## Model Placement$/m,
    'spec-paths shared-for audit must emit the ## Model Placement section')
  assert.doesNotMatch(sharedFor.stdout, /^## Rule Enforcement$/m,
    'spec-paths shared-for audit must be scoped to its declared section list, not fall back to the whole document (which would also carry ## Rule Enforcement)')

  const usage = runBash('bin/spec-paths', ['definitely-not-a-key'])
  assert.strictEqual(usage.status, 1, 'an unknown key must fall through to the usage line')
  assert.match(usage.stderr, /hotspot/,
    'the usage error must list hotspot among the valid spec-paths keys (components-check precedent)')
})

test('AC-20260812-02-7: release.md offers /spec:audit, shared.md names an Opus exception for it, and spec-status.js never suggests it', () => {
  const releaseDoc = read('spec/commands/release.md')
  assert.match(releaseDoc, /\/spec:audit/,
    'AC-7: release.md Phase 4 report must gain an optional line offering /spec:audit at the milestone seam')

  const sharedDoc = read('spec/doctrine/shared.md')
  const modelPlacementStart = sharedDoc.indexOf('## Model Placement')
  assert.notStrictEqual(modelPlacementStart, -1, 'AC-7: shared.md has no ## Model Placement section to check')
  const nextHeading = sharedDoc.indexOf('\n## ', modelPlacementStart + 1)
  const modelPlacement = sharedDoc.slice(modelPlacementStart, nextHeading === -1 ? sharedDoc.length : nextHeading)
  assert.match(modelPlacement, /\/spec:audit/, 'AC-7: § Model Placement must name /spec:audit')
  assert.match(modelPlacement, /Opus/, 'AC-7: § Model Placement must state /spec:audit runs on Opus')

  const statusScript = read('spec/scripts/spec-status.js')
  assert.doesNotMatch(statusScript, /\/spec:audit/,
    'AC-7 (D10 negative pin): spec-status.js must never suggest /spec:audit — the audit is user-judgment spend, not a derived next-step')
})

test('AC-20260812-02-8: spec-paths spec-status continues to resolve spec-status.js after the hotspot case is added', () => {
  const res = runBash('bin/spec-paths', ['spec-status'])
  assert.strictEqual(res.status, 0, 'spec-paths spec-status must resolve: ' + res.stderr)
  assert.strictEqual(res.stdout.trim(), path.join(ROOT, 'spec/scripts/spec-status.js'),
    'pre-existing spec-paths keys must survive the case-statement edit that adds hotspot')
})

test('AC-20260812-02-9: a git-mv rename inside the window is counted as ordinary add/delete churn, never dropped or a parse failure', () => {
  const dir = tmpdir('hotspot-rename')
  gitRepo(dir, { empty: true })
  commitFile(dir, 'old.js', '  a\n', 10, 'add old')
  commitFile(dir, 'old.js', '  a\n  b\n', 8, 'edit old')
  const date = new Date(Date.now() - 5 * 86400000).toISOString()
  const env = { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date }
  execFileSync('git', ['-C', dir, 'mv', 'old.js', 'new.js'], { encoding: 'utf8' })
  fs.writeFileSync(path.join(dir, 'new.js'), '  a\n  b\n  c\n')
  execFileSync('git', ['-C', dir, 'add', '-A'], { env, encoding: 'utf8' })
  execFileSync('git', ['-C', dir, 'commit', '-q', '-m', 'rename old to new'], { env, encoding: 'utf8' })

  const res = runNode(SCRIPT, ['--root', dir, '--json', '--since', '365'])
  assert.strictEqual(res.status, 0,
    'AC-9: a renamed-and-modified file in the window must not crash the derivation — stderr: ' + res.stderr)
  assert.doesNotMatch(res.stderr, /=>/,
    'AC-9: a combined "{old => new}" numstat row means --no-renames was not passed to git log — the churn count would silently drop the commit')
  const out = parseJSON(res, 'AC-9')
  const renamed = out.hotspots.find(h => h.path === 'new.js')
  assert.ok(renamed, 'AC-9: new.js must appear in the ranking — the rename commit\'s churn must be counted under the --no-renames split, never dropped')
  assert.ok(renamed.commits >= 1,
    'AC-9: new.js must carry at least the rename commit\'s churn count')
})
