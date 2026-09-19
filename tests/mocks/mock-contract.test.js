'use strict'
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, runBash, SPEC } = require('../helpers')
const fx = require('./mock-app-fixtures')

// specs/20260917/01-the-client-confirms-the-story.md D9, AC-20260917-01-15, AC-20260917-01-16:
// spec/templates/mock/contract.json bumps to contractVersion 2 (approval.journeys{} = beats
// grammar, theme removed, a top-level `fields` documentation key) and
// spec/templates/mock/journeys.ts's Step.beat becomes required. AC-20260914-01-22 (the SEED
// block's cp lines) is untouched by this spec and stays below.
//
// specs/20260918/01-mock-contract-v3.md D1, AC-20260918-01-1, AC-20260918-01-6: contract.json
// bumps again to contractVersion 3 (approve/waive join verbs, host and shapes drop decisions),
// and the stub's own defaultApproval/defaultNotes fixtures move to 3 with no theme key.

test('AC-20260917-01-15 / AC-20260918-01-1: `spec-paths mock-contract` prints an absolute path to a contract.json carrying contractVersion 3, verbs gaining approve and waive, no host.decisions or shapes.decisions, a top-level fields object pinning check.journeys[].steps[], shapes.approval["journeys{}"] equal to ["client","beats"] and no shapes.approval.theme; and `contractOrDie` proceeds against a stub reporting contractVersion 3 while one reporting 2 dies naming "contract 2 ≠ 3"', () => {
  const r = runBash('bin/spec-paths', ['mock-contract'])
  assert.strictEqual(r.status, 0, 'spec-paths mock-contract must resolve, or every caller of D1\'s contract silently gets nothing: ' + r.stderr)
  const printed = r.stdout.trim()
  assert.ok(path.isAbsolute(printed), 'the printed path must be absolute — a relative path breaks a caller invoked from a different cwd: ' + printed)
  assert.ok(printed.endsWith(path.join('spec/templates/mock/contract.json')),
    'the key must resolve to spec/templates/mock/contract.json exactly, per D1: ' + printed)
  assert.ok(fs.existsSync(printed), 'the resolved contract.json must actually exist on disk: ' + printed)
  const contract = JSON.parse(fs.readFileSync(printed, 'utf8'))
  assert.strictEqual(contract.contractVersion, 3, 'specs/20260918/01 D1 bumps contractVersion to 3 — a drifted version here silently changes what every mismatch check compares against')
  assert.strictEqual(contract.package, '@555-ventures/mock-review', 'D1 pins the exact package name every install remedy prints')
  assert.strictEqual(contract.bin, 'mock-review', 'D1 pins the exact bin name every spawn resolves')
  assert.deepStrictEqual(contract.verbs, ['contract', 'sweep', 'answer', 'approve', 'waive', 'check', 'serve'],
    'D1 pins the exact verb list in this exact order, now carrying approve and waive — a caller iterating verbs must see the same list this contract enumerates')
  assert.strictEqual(contract.host.decisions, undefined,
    'D1: the host block must drop "decisions" — design/decisions.json is retired, and a surviving key here would tell the next reader it still exists: ' + JSON.stringify(contract.host))
  assert.strictEqual(contract.shapes.decisions, undefined,
    'D1: the shapes block must drop "decisions" — validateShape would otherwise keep enforcing a shape for a document the package no longer writes: ' + JSON.stringify(Object.keys(contract.shapes)))
  assert.ok(contract.fields && typeof contract.fields === 'object' && !Array.isArray(contract.fields),
    'D9 requires a top-level `fields` key (never under `shapes`, so validateShape never walks it): ' + JSON.stringify(contract.fields))
  assert.deepStrictEqual(contract.fields && contract.fields['check.journeys[].steps[]'], ['screen', 'beat', 'state?'],
    'the fields documentation must pin steps[] to exactly screen/beat/state?: ' + JSON.stringify(contract.fields && contract.fields['check.journeys[].steps[]']))
  assert.deepStrictEqual(contract.shapes.approval['journeys{}'], ['client', 'beats'],
    'D9 narrows approval.journeys{} to exactly client/beats — the retired approvedAt/screen shape must be gone: ' + JSON.stringify(contract.shapes.approval['journeys{}']))
  assert.strictEqual(contract.shapes.approval.theme, undefined,
    'D9 removes shapes.approval.theme — the page pick control it described no longer exists: ' + JSON.stringify(contract.shapes.approval.theme))

  const root = tmpdir('mock-contract-mismatch')
  fx.writeSeed(root, { records: [], journeys: ['first-visit'] })
  fx.writeLedger(root)
  fx.writeStatus(root, { marks: { seedDone: '2026-09-18T00:00:00.000Z', shellDrawn: null, themePicked: null, approved: null } })
  fx.writeApp(root, { records: [] })
  const stub = fx.installStub(path.join(root, 'stub-bin'), path.join(root, 'stub-state'))
  stub.setContract({ contractVersion: 2, package: '@555-ventures/mock-review', version: '2.0.0' })
  stub.setCheck(fx.checkOk())
  const mismatch = runNode('scripts/mocks-driver.js', ['--root', root], { env: stub.env() })
  assert.strictEqual(mismatch.status, 2, 'a stub reporting the retired contractVersion 2 against the now-3 template must refuse: ' + mismatch.stderr)
  assert.match(mismatch.stderr, /contract 2 ≠ 3/, 'the refusal must print both contractVersion numbers, retired-vs-current: ' + mismatch.stderr)

  stub.setContract({ contractVersion: 3, package: '@555-ventures/mock-review', version: '3.0.0' })
  const proceed = runNode('scripts/mocks-driver.js', ['--root', root], { env: stub.env() })
  assert.strictEqual(proceed.status, 0, 'a stub reporting the current contractVersion 3 must let the run proceed to the step block, not refuse on a phantom mismatch: ' + proceed.stderr)
  assert.doesNotMatch(proceed.stderr + proceed.stdout, /contract \d+ ≠ \d+/,
    'a matching contract must never carry the mismatch text: ' + proceed.stdout + proceed.stderr)
})

test('AC-20260918-01-6: WHEN a host is scaffolded via writeApp THE SYSTEM SHALL write design/approval.json and design/notes.json carrying contractVersion 3 and no theme key', () => {
  assert.strictEqual(fx.defaultApproval().contractVersion, 3,
    'D5: the fixtures\' own defaultApproval document must report contractVersion 3, or every host this suite scaffolds still looks like a retired-version document to the package\'s plugin-shapes guard: ' + JSON.stringify(fx.defaultApproval()))
  assert.strictEqual(fx.defaultApproval().theme, undefined,
    'D5: defaultApproval must carry no theme key — the page pick control it described is gone: ' + JSON.stringify(fx.defaultApproval()))
  assert.strictEqual(fx.defaultNotes().contractVersion, 3,
    'D5: the fixtures\' own defaultNotes document must report contractVersion 3 for the same reason as defaultApproval: ' + JSON.stringify(fx.defaultNotes()))

  const root = tmpdir('mock-contract-fixtures-v3')
  fx.writeApp(root, { records: [] })
  const approval = fx.readApproval(root)
  const notes = fx.readNotes(root)
  assert.strictEqual(approval.contractVersion, 3,
    'the design/approval.json a scaffolded host actually carries on disk must be contractVersion 3, not just the in-memory default: ' + JSON.stringify(approval))
  assert.strictEqual(approval.theme, undefined,
    'the design/approval.json a scaffolded host actually carries on disk must carry no theme key: ' + JSON.stringify(approval))
  assert.strictEqual(notes.contractVersion, 3,
    'the design/notes.json a scaffolded host actually carries on disk must be contractVersion 3: ' + JSON.stringify(notes))
})

test('AC-20260917-01-16: spec/templates/mock/journeys.ts declares beat: string inside Step with no ?, and no longer claims "the plugin itself never reads them"', () => {
  const src = fs.readFileSync(path.join(SPEC, 'templates/mock/journeys.ts'), 'utf8')
  assert.match(src, /export type Step = \{[^}]*\bbeat:\s*string\b[^}]*\}/s,
    'D9 requires Step.beat: string with no ? — SCREENS copies the seed\'s beats verbatim, so the field is never optional: ' + src)
  assert.doesNotMatch(src, /\bbeat\?\s*:/, 'beat must never be declared optional anywhere in the template: ' + src)
  assert.doesNotMatch(src, /the plugin itself never reads them/,
    'D9 retires this claim — the driver now reads step.beat directly through check --json to prove SCREENS copied it verbatim: ' + src)
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
