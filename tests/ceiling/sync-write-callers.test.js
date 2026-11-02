'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { ROOT, tmpdir, runNode, read } = require('../helpers')

// specs/20261101/09-the-five-writers-that-never-retried.md: AC-20261101-09-1 pins each gate
// script's exit code under a closed stdout by execution; AC-20261101-09-2 pins the source shape.

const FIVE = ['port-check', 'spec-number-check', 'workspace-scan', 'design-contract-check', 'catalog-inventory']

function argvFor(name, dir) {
  if (name === 'catalog-inventory') return ['--root', dir, '--out', 'catalog.md', '--check']
  if (name === 'port-check') return ['--root', dir, '--json']
  return ['--root', dir]
}

function runWithClosedStdout(name, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'spec/scripts', name + '.js'), ...args],
      { stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout.destroy()
    let text = ''
    child.stderr.on('data', (d) => { text += d })
    child.on('error', reject)
    child.on('close', (code, signal) => resolve({ code, signal, text }))
  })
}

for (const name of FIVE) {
  test(`AC-20261101-09-1: ${name}.js spawned with its stdout destroyed exits with the code its open-stdout run produces and prints no EPIPE trace`, async () => {
    const dir = tmpdir('sync-write-' + name)
    if (name === 'port-check') fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
    const args = argvFor(name, dir)
    const open = runNode('scripts/' + name + '.js', args)
    assert.ok(open.stdout.length > 0,
      'the open run must print a verdict, else the closed run exercises no write: ' + open.stderr)
    const closed = await runWithClosedStdout(name, args)
    assert.strictEqual(closed.signal, null, 'the script must exit on its own, not die by signal: ' + closed.signal)
    assert.strictEqual(closed.code, open.status,
      'a reader that closed early leaves nothing to deliver, so the script keeps its own exit code — a different code means EPIPE escaped the writer as an uncaught exception: ' + closed.text)
    assert.doesNotMatch(closed.text, /EPIPE|Error:|at writeOut/,
      'stderr must carry no EPIPE stack trace from the writer: ' + closed.text)
  })

  test(`AC-20261101-09-2: ${name}.js source holds no fs.writeSync( call and exactly one require of ./lib/sync-write`, () => {
    const src = read('spec/scripts/' + name + '.js')
    const writes = src.match(/\bfs\.writeSync\(/g) || []
    assert.strictEqual(writes.length, 0,
      'a local fs.writeSync loop is a private writer copy that retries nothing — every byte must route through lib/sync-write.js: ' + writes.length + ' hits')
    const reqs = src.match(/require\('\.\/lib\/sync-write'\)/g) || []
    assert.strictEqual(reqs.length, 1,
      'the script must import the shared writer exactly once, else it still carries its own copy: ' + reqs.length + ' hits')
  })
}

// specs/20261101/10-one-writer-and-no-copies-left.md: AC-20261101-10-1 pins the single-writer sweep
// over spec/scripts/; AC-20261101-10-2 pins spec-status.js --json under a closed stdout by execution.

function walkFiles(dir) {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...walkFiles(p))
    else out.push(p)
  }
  return out
}

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\/|(^|\s)\/\/.*$/gm, '$1')
}

test('AC-20261101-10-1: writeSync( occurs, comments stripped, in exactly one file under spec/scripts/ — lib/sync-write.js', () => {
  const lib = path.join(ROOT, 'spec/scripts/lib/sync-write.js')
  const offenders = walkFiles(path.join(ROOT, 'spec/scripts'))
    .filter((p) => p !== lib && stripComments(fs.readFileSync(p, 'utf8')).includes('writeSync('))
    .map((p) => path.relative(ROOT, p))
  assert.ok(stripComments(fs.readFileSync(lib, 'utf8')).includes('writeSync('),
    'the shared writer must itself hold the one writeSync loop, else the sweep guards nothing')
  assert.deepStrictEqual(offenders, [],
    'each listed script carries a private copy of the synchronous writer that rethrows EPIPE — route it through lib/sync-write.js: ' + offenders.join(', '))
})

test('AC-20261101-10-2: spec-status.js --root <empty dir> --json spawned with its stdout destroyed exits 0 with no EPIPE trace, matching the open run', async () => {
  const dir = tmpdir('sync-write-spec-status')
  const open = runNode('scripts/spec-status.js', ['--root', dir, '--json'])
  assert.strictEqual(open.status, 0, 'the open run must succeed so the closed run has a baseline: ' + open.stderr)
  assert.deepStrictEqual(JSON.parse(open.stdout), { briefs: [], specs: [], superseded: [], anomalies: [] },
    'the open run must print the empty four-key payload, else the closed run exercises no write: ' + open.stdout)
  const closed = await runWithClosedStdout('spec-status', ['--root', dir, '--json'])
  assert.strictEqual(closed.signal, null, 'the script must exit on its own, not die by signal: ' + closed.signal)
  assert.strictEqual(closed.code, 0,
    'a reader that closed early leaves nothing to deliver, so the script keeps exit 0 — exit 1 means EPIPE escaped the writer as an uncaught exception: ' + closed.text)
  assert.doesNotMatch(closed.text, /EPIPE|Error:|at writeOut/,
    'stderr must carry no EPIPE stack trace from the writer: ' + closed.text)
})
