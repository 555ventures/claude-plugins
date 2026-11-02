'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, tmpdir, runNode, gitRepo } = require('../helpers')

// specs/20261101/08-no-host-needs-the-shims.md D4/D6: retired inputs are refused by each
// script's generic path (exit 2), and no live surface spells the retired compatibility
// vocabulary. Every retired literal is assembled from fragments so this file never matches its
// own sweep.

const j = (...parts) => parts.join('')

const RETIRED = [
  { id: j('--leg', 'acy'), match: (t) => new RegExp(j('--leg', 'acy', '(?![\\w-])')).test(t) },
  ...[
    j('legacy', 'Resume'), j('legacy', 'Trusted'), j('RETIRED', '_MARKS'), j('brief', '.legacy'),
    j('rules-', 'locked'), j('strip', 'AutoPlaced'), j('checkpoint', 'ReasonArg'),
    j('--checkpoint', '-reason'), j('window and ', 'fleet shares'), j('--after ', 'is retired'),
    j('--brief ', 'is retired'), j('shell-', 'drawn'), j('theme-', 'picked'),
    j('client ', 'waive'), j('client ', 'open'), j('{mocks, ', 'legacy, ratifiedAt}'),
  ].map((lit) => ({ id: lit, match: (t) => t.includes(lit) })),
]

const SELF = path.relative(ROOT, __filename)
const WAIVED = new Set([SELF, 'spec/.claude-plugin/plugin.json'])
const SKIP_DIRS = new Set(['node_modules', '.git'])

function walk(abs, out) {
  const st = fs.statSync(abs)
  if (st.isFile()) { out.push(abs); return }
  for (const name of fs.readdirSync(abs)) {
    if (SKIP_DIRS.has(name)) continue
    walk(path.join(abs, name), out)
  }
}

function liveFiles() {
  const out = []
  for (const rel of ['spec', 'tests', 'scripts', 'README.md']) {
    const abs = path.join(ROOT, rel)
    if (fs.existsSync(abs)) walk(abs, out)
  }
  return out.filter((f) => !WAIVED.has(path.relative(ROOT, f)))
}

test('AC-20261101-08-15: no file under spec/, tests/, scripts/ or README.md (bar the changelog manifest and this file) spells any retired compatibility literal, and the flag literal matches only when no word character or dash follows', () => {
  const flag = RETIRED[0]
  assert.ok(!flag.match(j('npm i --leg', 'acy-peer-deps')),
    'the flag literal must not hit a longer flag that merely starts the same way — a bare substring ban would flag unrelated vocabulary')
  assert.ok(flag.match(j('--mark brief-written --leg', 'acy')),
    'the flag literal must hit the bare retired flag — a sweep that cannot see it guards nothing')
  const hits = []
  for (const f of liveFiles()) {
    let text
    try { text = fs.readFileSync(f, 'utf8') } catch { continue }
    for (const r of RETIRED) {
      if (r.match(text)) hits.push(path.relative(ROOT, f) + ' :: ' + r.id)
    }
  }
  assert.deepStrictEqual(hits, [],
    'a surviving retired literal means a shim, comment or doc line still narrates a path no host needs — it regrows unchecked. Hits:\n  ' + hits.join('\n  '))
})

test('AC-20261101-08-8: verdict.js given a well-formed manifest invocation plus the retired reason flag exits 2 through the generic usage line and prints nothing on stdout', () => {
  const dir = fs.realpathSync(tmpdir('compat-verdict'))
  const manifest = path.join(dir, 'manifest.jsonl')
  fs.writeFileSync(manifest, '')
  const r = runNode('scripts/verdict.js', ['--manifest', manifest, '--ledger', '--spec', 'specs/x.md', '--tier', 'standard',
    '--checkpoint', 'disposer', j('--checkpoint', '-reason'), 'x'])
  assert.strictEqual(r.status, 2, 'the retired reason flag must still exit 2 — a silently accepted flag would let a stale caller believe a reason was recorded: ' + r.stdout + r.stderr)
  assert.match(r.stderr, /^usage: verdict\.js/, 'the refusal must be the generic usage line, not a bespoke stub that outlives the state it served: ' + r.stderr)
  assert.strictEqual(r.stdout, '', 'a refused invocation must print no verdict word and no ledger row: ' + r.stdout)
})

test('AC-20261101-08-9: commit-coverage.js refuses the two retired window/fleet flags with the generic unknown-flag message at exit 2', () => {
  for (const [flag, val] of [['--since', '2026-01-01'], ['--repos-root', '/x']]) {
    const r = runNode('scripts/commit-coverage.js', [flag, val, '--commit', 'abc1234'])
    assert.strictEqual(r.status, 2, flag + ' must exit 2 — accepting it would resurrect the fleet share the script no longer computes: ' + r.stdout + r.stderr)
    assert.ok(r.stderr.includes('unknown flag ' + flag),
      flag + ' must be refused by the generic unknown-flag path, or the bespoke stub still lives: ' + r.stderr)
    assert.ok(!r.stderr.includes(j('window and ', 'fleet')),
      flag + ' refusal must not carry the retired narration: ' + r.stderr)
  }
})

test('AC-20261101-08-11: mocks-driver.js --mark with either retired design name exits 2 through the generic unknown-mark refusal with the remedy list', () => {
  for (const name of [j('shell-', 'drawn'), j('theme-', 'picked')]) {
    const root = tmpdir('compat-mocks-mark')
    const r = runNode('scripts/mocks-driver.js', ['--root', root, '--mark', name])
    assert.strictEqual(r.status, 2, '--mark ' + name + ' must exit 2 — a step that no longer exists cannot be marked: ' + r.stdout + r.stderr)
    assert.ok(r.stderr.includes('--mark ' + name + ' is unknown'),
      '--mark ' + name + ' must fall to the generic unknown-mark refusal, not a bespoke retired stub: ' + r.stderr)
    assert.ok(r.stderr.includes('seed-done|journey-drawn|journey-approved|approved'),
      '--mark ' + name + ' refusal must list the accepted marks as its remedy: ' + r.stderr)
  }
})

test('AC-20261101-08-12: mocks-driver.js --reopen of a retired step and the retired client verbs exit 2 through the generic reopen-shape and unknown-command refusals', () => {
  const rOpen = runNode('scripts/mocks-driver.js', ['--root', tmpdir('compat-mocks-reopen'), '--reopen', 'shell'])
  assert.strictEqual(rOpen.status, 2, '--reopen shell must exit 2 — there is no shell step to reopen: ' + rOpen.stdout + rOpen.stderr)
  assert.ok(rOpen.stderr.includes('--reopen must be journey:<j>'),
    '--reopen shell must fall to the generic reopen-shape refusal: ' + rOpen.stderr)
  for (const verb of ['waive', 'open']) {
    const r = runNode('scripts/mocks-driver.js', ['--root', tmpdir('compat-mocks-client'), 'client', verb])
    assert.strictEqual(r.status, 2, 'client ' + verb + ' must exit 2 — the verb is gone: ' + r.stdout + r.stderr)
    assert.ok(r.stderr.includes('unknown command "client"'),
      'client ' + verb + ' must fall to the generic unknown-command refusal: ' + r.stderr)
  }
})

test('AC-20261101-08-10: spec-queue add refuses the retired flags with the generic add unknown-flag message at exit 2 and writes no queue file', () => {
  for (const argv of [['add', 'x', '--after', 'q1'], ['add', '--brief', '05']]) {
    const dir = tmpdir('compat-queue')
    gitRepo(dir)
    const r = runNode('scripts/spec-queue.js', argv, { cwd: dir })
    assert.strictEqual(r.status, 2, argv.join(' ') + ' must exit 2: ' + r.stdout + r.stderr)
    assert.ok(r.stderr.includes('add: unknown flag ' + argv.find((a) => a.startsWith('--'))),
      argv.join(' ') + ' must fall to the generic add unknown-flag refusal: ' + r.stderr)
    assert.ok(!fs.existsSync(path.join(dir, '.git/spec-queue.json')),
      'a refused add must write no queue file — a stray item would reorder the session queue: ' + dir)
  }
})
