'use strict'
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, runBash, SPEC } = require('../helpers')
const fx = require('./mock-app-fixtures')

// specs/20260914/01-the-mock-contract-and-the-driver.md D1, AC-20260914-01-3, AC-20260914-01-22:
// spec/templates/mock/contract.json is the one spelling of every shared shape, resolved by
// `spec-paths mock-contract`; the SEED block's four `cp` lines must name only template files
// that actually exist, with the two examples landing outside `src/`.

test('AC-20260914-01-3: `spec-paths mock-contract` prints an absolute path to a contract.json carrying contractVersion 1, the package name, the bin name and the exact verb list', () => {
  const r = runBash('bin/spec-paths', ['mock-contract'])
  assert.strictEqual(r.status, 0, 'spec-paths mock-contract must resolve, or every caller of D1\'s contract silently gets nothing: ' + r.stderr)
  const printed = r.stdout.trim()
  assert.ok(path.isAbsolute(printed), 'the printed path must be absolute — a relative path breaks a caller invoked from a different cwd: ' + printed)
  assert.ok(printed.endsWith(path.join('spec/templates/mock/contract.json')),
    'the key must resolve to spec/templates/mock/contract.json exactly, per D1: ' + printed)
  assert.ok(fs.existsSync(printed), 'the resolved contract.json must actually exist on disk: ' + printed)
  const contract = JSON.parse(fs.readFileSync(printed, 'utf8'))
  assert.strictEqual(contract.contractVersion, 1, 'D1 pins contractVersion: 1 — a drifted version here silently changes what every mismatch check compares against')
  assert.strictEqual(contract.package, '@555/mock-review', 'D1 pins the exact package name every install remedy prints')
  assert.strictEqual(contract.bin, 'mock-review', 'D1 pins the exact bin name every spawn resolves')
  assert.deepStrictEqual(contract.verbs, ['contract', 'sweep', 'answer', 'check', 'serve'],
    'D1 pins the exact verb list in this exact order — a caller iterating verbs must see the same list this contract enumerates')
})

test('AC-20260914-01-22: the SEED block\'s four `cp` lines name only files that exist under spec/templates/mock/, and the two example destinations never fall under src/', () => {
  const root = tmpdir('mock-contract-seed-cp')
  fx.writeSeed(root, { records: ['client'], journeys: ['first-visit'] })
  fx.writeLedger(root)
  const r = runNode('scripts/mocks-driver.js', ['--root', root], { env: { ...process.env, PATH: '' } })
  assert.strictEqual(r.status, 0, 'a cold-root plain run must print the SEED block, or the cp lines can never be inspected: ' + r.stderr)
  const cpLines = r.stdout.split('\n').filter((l) => l.trim().startsWith('cp '))
  assert.strictEqual(cpLines.length, 4, 'the SEED block must print exactly one cp line per D4 template file: ' + r.stdout)
  const templateFiles = ['mock.config.ts', 'journeys.ts', 'screen.example.tsx', 'records.example.ts']
  for (const file of templateFiles) {
    const line = cpLines.find((l) => l.includes(`mock/${file}`))
    assert.ok(line, `the SEED block must print a cp line for ${file} — its absence means the scaffold never lands this template file: ${r.stdout}`)
    const srcPath = path.join(SPEC, 'templates/mock', file)
    assert.ok(fs.existsSync(srcPath), `D4's SEED block names ${file}, but spec/templates/mock/${file} does not exist on disk — a cp line naming a nonexistent source silently fails at scaffold time`)
  }
  const exampleLines = cpLines.filter((l) => l.includes('screen.example.tsx') || l.includes('records.example.ts'))
  assert.strictEqual(exampleLines.length, 2, 'both example templates must be copied: ' + r.stdout)
  for (const line of exampleLines) {
    assert.doesNotMatch(line, /\bsrc\//,
      `an example destination must never fall under src/ — the reviewer would then list it as a real screen or records file: ${line}`)
    assert.match(line, /design\/examples\//,
      `an example destination must land under design/examples/, per D4: ${line}`)
  }
})
