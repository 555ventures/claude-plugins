'use strict'
const test = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')
const fx = require('./mock-app-fixtures')

// specs/20260914/01-the-mock-contract-and-the-driver.md D2, AC-20260914-01-1, AC-20260914-01-2:
// lib/mock-cli.js is the only caller of the `@555/mock-review` package — every JSON verb's
// stdout is validated, a `contractVersion` mismatch refuses with both numbers and a remedy, and
// an ENOENT spawn refuses naming the install remedy.

test('AC-20260914-01-1: a contractVersion 2 stub against the contractVersion 1 template refuses exit 2 naming both numbers and the pinned-major remedy; a matching version 1 stub prints the next step block', () => {
  const root = tmpdir('mock-cli-contract')
  fx.writeSeed(root, { records: [], journeys: ['first-visit'] })
  fx.writeLedger(root)
  fx.writeStatus(root, { marks: { seedDone: '2026-09-14T00:00:00.000Z', shellDrawn: null, themePicked: null, approved: null } })
  fx.writeApp(root, { records: [] })

  const stub = fx.installStub(path.join(root, 'stub-bin'), path.join(root, 'stub-state'))
  stub.setContract({ contractVersion: 2, package: '@555/mock-review', version: '2.0.0' })
  stub.setCheck(fx.checkOk())

  const mismatch = runNode('scripts/mocks-driver.js', ['--root', root], { env: stub.env() })
  assert.strictEqual(mismatch.status, 2,
    'a contractVersion mismatch must refuse (exit 2), or a stale reviewer package silently misreads every JSON shape this driver depends on: ' + mismatch.stderr)
  assert.match(mismatch.stderr, /contract 2 ≠ 1/,
    'D2: the refusal must print both contractVersion numbers so the session can see the skew at a glance: ' + mismatch.stderr)
  assert.match(mismatch.stderr, /remedy: npm i -D @555\/mock-review@1/,
    'D2: the refusal must name the exact pinned-major install remedy, or the session has no path back to a working contract: ' + mismatch.stderr)

  stub.setContract({ contractVersion: 1, package: '@555/mock-review', version: '1.0.0' })
  const ok = runNode('scripts/mocks-driver.js', ['--root', root], { env: stub.env() })
  assert.strictEqual(ok.status, 0,
    'matching contractVersion 1 on both sides must never refuse — the run must print the next step block: ' + ok.stderr)
  assert.doesNotMatch(ok.stderr + ok.stdout, /contract \d+ ≠ \d+/,
    'a matching contract must never carry the mismatch text — the run prints only the step block: ' + ok.stdout + ok.stderr)
})

test('AC-20260914-01-2: `--mark seed-done` refuses exit 2 with the install remedy when no mock-review binary is reachable, and finds one placed only in the app node_modules/.bin', () => {
  const root = tmpdir('mock-cli-enoent')
  fx.writeSeed(root, { records: ['client'], journeys: ['first-visit'] })
  fx.writeLedger(root)
  fx.writeStatus(root)
  fx.writeApp(root, { records: ['client'] })

  const notFound = runNode('scripts/mocks-driver.js', ['--root', root, '--mark', 'seed-done'],
    { env: { ...process.env, PATH: '' } })
  assert.strictEqual(notFound.status, 2,
    'with no mock-review reachable on PATH or the app bin, `--mark seed-done` must refuse rather than crash on an ENOENT spawn: ' + JSON.stringify(notFound))
  assert.match(notFound.stderr, /mock-review not found/,
    'the refusal must say the binary was not found, or the session cannot tell an ENOENT from a records-file refusal: ' + notFound.stderr)
  assert.match(notFound.stderr, /remedy: npm i -D @555\/mock-review/,
    'the refusal must name the install remedy so the session knows exactly what to run: ' + notFound.stderr)

  const root2 = tmpdir('mock-cli-app-bin')
  fx.writeSeed(root2, { records: ['client'], journeys: ['first-visit'] })
  fx.writeLedger(root2)
  fx.writeStatus(root2)
  fx.writeApp(root2, { records: ['client'] })
  const appBin = fx.installStub(path.join(root2, fx.APP, 'node_modules/.bin'), path.join(root2, 'stub-state'))
  appBin.setContract(fx.contractOk())
  appBin.setCheck(fx.checkOk())

  const found = runNode('scripts/mocks-driver.js', ['--root', root2, '--mark', 'seed-done'],
    { env: { ...process.env, PATH: '', MOCK_STUB_DIR: appBin.stateDir } })
  assert.notStrictEqual(found.status, 2,
    'a mock-review binary present only under <app>/node_modules/.bin (nothing on PATH) must still be found by PATH-prepend lookup, not refused as not-found: ' + JSON.stringify(found))
  assert.doesNotMatch(found.stderr, /mock-review not found/,
    'once the app-bin executable is found, the run must not repeat the not-found refusal: ' + found.stderr)
})
