'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, ROOT, SPEC } = require('../helpers')
const { writeBrief, ratifyBriefArtifacts } = require('./tournament.fixtures.js')

// specs/20260930/01-the-brief-stops-ratifying-prose.md: AC-20260930-01-1 through AC-20260930-01-5
// — genesis-driver.js's brief-written mark, BRIEF step print and fresh status carry no
// doctrine/design-rules artifact, and no live plugin surface names the retired literals.

const SCRIPT = 'scripts/genesis-driver.js'
const DOCTRINE = 'docs/design/doctrine.md'
const RULES = '.claude/genesis/design-rules.json'

function bare(dir) { return runNode(SCRIPT, ['--root', dir]) }
function mark(dir, name, extra) { return runNode(SCRIPT, ['--root', dir, '--mark', name].concat(extra || [])) }
function statusPath(dir) { return path.join(dir, '.claude/genesis/status.json') }
function statusOf(dir) { return JSON.parse(fs.readFileSync(statusPath(dir), 'utf8')) }

// A cold root that has passed discovery-done for the named archetype, no design artifacts on disk.
function atBrief(prefix, archetype) {
  const dir = tmpdir(prefix)
  bare(dir)
  writeBrief(dir, { picks: ['- archetype: ' + archetype] })
  const disco = mark(dir, 'discovery-done')
  assert.strictEqual(disco.status, 0, 'test setup requires discovery-done to be accepted for ' + archetype + ': ' + disco.stderr)
  return dir
}

// Legacy resume: menusDone recorded, briefWritten unset, no mocks status on disk.
function legacyResume(prefix) {
  const dir = atBrief(prefix, 'web-app')
  const st = statusOf(dir)
  st.marks.menusDone = true
  fs.writeFileSync(statusPath(dir), JSON.stringify(st, null, 2))
  return dir
}

test('AC-20260930-01-1: WHEN a web-app root has APPROVED mocks, passing brief sections and neither doctrine.md nor design-rules.json THE SYSTEM accepts --mark brief-written with exit 0, records design ratified, and creates neither file', () => {
  const dir = atBrief('brief-retires-ac1', 'web-app')
  ratifyBriefArtifacts(dir)
  assert.ok(!fs.existsSync(path.join(dir, DOCTRINE)) && !fs.existsSync(path.join(dir, RULES)),
    'test setup requires neither retired artifact on disk — the fixture is writing one again')
  const r = mark(dir, 'brief-written')
  assert.strictEqual(r.status, 0,
    'D1: brief-written must not require the retired doctrine or rules manifest — a refusal here means the gate still reads them: ' + r.stderr)
  assert.match(r.stdout, /checkpoint — genesis state saved \(BRIEF → MENUS\)/,
    'D1: the accepted mark must print the BRIEF → MENUS checkpoint line: ' + r.stdout)
  const st = statusOf(dir)
  assert.strictEqual(st.design, 'ratified', 'D1: a visual archetype must record design "ratified": ' + JSON.stringify(st.design))
  assert.strictEqual(st.brief && st.brief.mocks, 'design/mocks/status.json', 'D1: brief.mocks must name the approved mocks status: ' + JSON.stringify(st.brief))
  assert.strictEqual(st.brief.legacy, false, 'D1: a fresh visual run must record brief.legacy false: ' + JSON.stringify(st.brief))
  assert.ok(!fs.existsSync(path.join(dir, DOCTRINE)),
    'D1: the mark must never create the retired doctrine file — a new canon is being written by the driver')
  assert.ok(!fs.existsSync(path.join(dir, RULES)),
    'D1: the mark must never create the retired rules manifest — a new canon is being written by the driver')
})

test('AC-20260930-01-2: WHEN a conversational-bot or cli-devtool root has passed discovery-done with no design artifacts THE SYSTEM accepts --mark brief-written with exit 0 and records design skipped and brief.mocks null', () => {
  for (const archetype of ['conversational-bot', 'cli-devtool']) {
    const dir = atBrief('brief-retires-ac2-' + archetype, archetype)
    const r = mark(dir, 'brief-written')
    assert.strictEqual(r.status, 0,
      'D2: ' + archetype + ' must be in the design-skipped set and owe nothing beyond discovery — a refusal means it still needs a doctrine: ' + r.stderr)
    const st = statusOf(dir)
    assert.strictEqual(st.design, 'skipped', 'D2: ' + archetype + ' must record design "skipped": ' + JSON.stringify(st.design))
    assert.strictEqual(st.brief && st.brief.mocks, null, 'D2: ' + archetype + ' must record brief.mocks null: ' + JSON.stringify(st.brief))
    assert.strictEqual(st.brief.legacy, false, 'D2: ' + archetype + ' must record brief.legacy false: ' + JSON.stringify(st.brief))
  }
})

test('AC-20260930-01-3: WHEN a web-app status carries discoveryDone and menusDone but no briefWritten, with no mocks, doctrine or rules manifest THE SYSTEM accepts --mark brief-written --legacy with exit 0 and records design ratified and brief.legacy true', () => {
  const dir = legacyResume('brief-retires-ac3')
  assert.ok(!fs.existsSync(path.join(dir, 'design/mocks/status.json')) && !fs.existsSync(path.join(dir, DOCTRINE)) && !fs.existsSync(path.join(dir, RULES)),
    'test setup requires no mocks, doctrine or rules manifest on disk')
  const r = mark(dir, 'brief-written', ['--legacy'])
  assert.strictEqual(r.status, 0,
    'D1: the legacy mark must skip the mocks precondition and require nothing further — a refusal means the retired doctrine gate still fires on the legacy path: ' + r.stderr)
  const st = statusOf(dir)
  assert.strictEqual(st.design, 'ratified', 'D1: the legacy mark must record design "ratified": ' + JSON.stringify(st.design))
  assert.strictEqual(st.brief && st.brief.legacy, true, 'D1: the legacy mark must record brief.legacy true: ' + JSON.stringify(st.brief))
})

test('AC-20260930-01-4: WHEN the driver runs bare on a fresh root and at BRIEF for a web-app with APPROVED mocks, a legacy resume and a conversational-bot root THE SYSTEM writes a status.json with no designManifestPath and prints no doctrine.md or design-rules.json in any BRIEF arm', () => {
  const fresh = tmpdir('brief-retires-ac4-fresh')
  bare(fresh)
  assert.ok(!('designManifestPath' in statusOf(fresh)),
    'D4: a fresh status.json must not carry designManifestPath — the key still names the retired rules file')

  const visual = atBrief('brief-retires-ac4-visual', 'web-app')
  ratifyBriefArtifacts(visual)
  const skipped = atBrief('brief-retires-ac4-skipped', 'conversational-bot')
  const legacy = legacyResume('brief-retires-ac4-legacy')

  for (const [label, dir, pattern] of [
    ['visual', visual, /Step: brief — ratify/],
    ['legacy', legacy, /legacy:/],
    ['skipped', skipped, /Step: brief — nothing owed/],
  ]) {
    const r = bare(dir)
    assert.strictEqual(r.status, 0, 'the bare run at BRIEF (' + label + ') must exit 0: ' + r.stderr)
    assert.match(r.stdout, pattern, 'test setup requires the ' + label + ' arm of the BRIEF step to print: ' + r.stdout)
    assert.match(r.stdout, /--mark brief-written/, 'D3: the ' + label + ' arm must still print the mark command: ' + r.stdout)
    assert.ok(!/doctrine\.md/.test(r.stdout),
      'D3: the ' + label + ' BRIEF arm must not name doctrine.md — it tells the session to write a file nothing reads: ' + r.stdout)
    assert.ok(!/design-rules\.json/.test(r.stdout),
      'D3: the ' + label + ' BRIEF arm must not name design-rules.json — it tells the session to write a file nothing reads: ' + r.stdout)
    assert.ok(!('designManifestPath' in statusOf(dir)),
      'D4: the status.json written for the ' + label + ' root must not carry designManifestPath')
  }
})

function walk(dir, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) walk(p, out)
    else if (ent.isFile()) out.push(p)
  }
  return out
}

test('AC-20260930-01-5: WHEN every file under spec/ and README.md is read THE SYSTEM contains zero occurrences of design-rules.json, docs/design/doctrine.md, designRulesHash, designManifestPath and DOCTRINE_LINE_CAP', () => {
  const banned = ['design-rules.json', 'docs/design/doctrine.md', 'designRulesHash', 'designManifestPath', 'DOCTRINE_LINE_CAP']
  const files = walk(SPEC, [])
  assert.ok(files.length > 50, 'the walk must reach the plugin tree — a near-empty file list means the sweep is vacuous: ' + files.length)
  files.push(path.join(ROOT, 'README.md'))
  const hits = []
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8')
    for (const lit of banned) {
      if (text.includes(lit)) hits.push(path.relative(ROOT, f) + ' names ' + lit)
    }
  }
  assert.deepStrictEqual(hits, [],
    'D1-D9: a live plugin surface still names a retired design-canon literal, so the second canon is still taught by instruction: ' + hits.join('; '))
})
