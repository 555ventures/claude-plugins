'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, freePort, serveAtlas } = require('../helpers')

// Pins: specs/20260906/01-ac-drift-doctor-check.md D8, AC-20260906-01-12 .. AC-20260906-01-14.
// Parsed-but-never-passed flags are deleted (registry-check.js --timeout-ms, design-atlas.js
// stop open --question) or already never had a live consumer (promise-sweep.js
// --applies-from — its SHALL CONTINUE TO not-applicable pin is retagged in
// tests/review/promise-sweep.test.js; its refusal and the V7_APPLIES_FROM export live here,
// AC-20260906-01-10, because that file is green-expected under red-check.js). Every
// assertion below observes the flag's own script directly against a synthetic host.
// render-gate.js is deleted (specs/20260914/02 D14); its --no-boot case (AC-20260906-01-11)
// and the render-gate half of AC-20260906-01-14 are retired with it.

// specs/20260909/06-ephemeral-serve-ports.md D2/D3: freePort() comes from tests/helpers.js now
// — this test needs a specific port up front because the `stop open --port <p>` CLI argument
// below must name the exact port the serve child bound. withServeAt is a thin call to
// helpers.serveAtlas for the spawn-and-wait-for-readiness step, the same idiom
// tests/design-atlas.test.js uses.
async function withServeAt(dir, port, fn) {
  const s = await serveAtlas(dir, { port })
  try {
    return await fn()
  } finally {
    await s.stop()
  }
}

test('AC-20260906-01-12: registry-check.js --menu <m> --timeout-ms 5 exits 2 with a usage line naming --timeout-ms as an unknown argument and carrying no --timeout-ms <n> segment', () => {
  const res = runNode('scripts/registry-check.js', ['--menu', 'menu.json', '--timeout-ms', '5'])
  assert.strictEqual(res.status, 2,
    `D8: --timeout-ms is deleted — the parser must refuse it as an unrecognized argument (exit 2), never ` +
    `accept and apply it as a positive-number override (stdout: ${res.stdout} stderr: ${res.stderr})`)
  assert.ok(res.stderr.includes('unknown argument "--timeout-ms"'),
    `A6: registry-check.js's own unknown-argument die() message names the offending flag verbatim — got ${JSON.stringify(res.stderr)}`)
  assert.ok(!res.stderr.includes('--timeout-ms <n>'),
    `D8: the printed usage line must no longer document --timeout-ms <n> at all once it is deleted from the ` +
    `USAGE string — a lingering mention would advertise a flag the parser no longer accepts — got ${JSON.stringify(res.stderr)}`)
})

test('AC-20260906-01-13: design-atlas.js stop open --question "which?" writes the stop with question: null in design/mocks/picks.json', async () => {
  const dir = tmpdir('retired-question')
  const port = await freePort()
  await withServeAt(dir, port, async () => {
    const res = runNode('scripts/design-atlas.js',
      ['stop', 'open', '--root', dir, '--kind', 'approve', '--key', 'journey-approved:j',
        '--title', 'approve journey j', '--candidates', 'a=mocks/a.html', '--question', 'which?', '--port', String(port)])
    assert.strictEqual(res.status, 0,
      `stop open with a healthy serve child up must exit 0: ${res.stdout}${res.stderr}`)
    const stops = JSON.parse(fs.readFileSync(path.join(dir, 'design/mocks/picks.json'), 'utf8'))
    const stop = stops.find((s) => s.key === 'journey-approved:j')
    assert.ok(stop, `stop open must have written a stop for key journey-approved:j — got ${JSON.stringify(stops)}`)
    assert.strictEqual(stop.question, null,
      `D8/A7: --question is deleted from the CLI — flagArg(args, '--question') no longer reads it, so ` +
      `cmdStopOpen's openStop() call must pass question: null regardless of what the command line carries; ` +
      `picks.json's stored field and lib/mocks-picks.js's openStop shape are otherwise untouched — got ${JSON.stringify(stop.question)}`)
  })
})

test('AC-20260906-01-14: promise-sweep.js\'s usage names no --applies-from; design-atlas.js stop open\'s bare usage names "stop open" and no --question', () => {
  const promiseSweepRes = runNode('scripts/promise-sweep.js', [])
  assert.strictEqual(promiseSweepRes.status, 2, `promise-sweep.js with no arguments must refuse with exit 2 — got ${promiseSweepRes.status}`)
  assert.ok(!promiseSweepRes.stderr.includes('--applies-from'),
    `D8: promise-sweep.js's usage line must no longer mention --applies-from at all once it is deleted — got ${JSON.stringify(promiseSweepRes.stderr)}`)

  const stopOpenRes = runNode('scripts/design-atlas.js', ['stop', 'open'])
  assert.strictEqual(stopOpenRes.status, 2, `design-atlas.js stop open with no flags must refuse with exit 2 — got ${stopOpenRes.status}`)
  assert.ok(stopOpenRes.stderr.includes('stop open'),
    `design-atlas.js stop open's own bare-invocation usage must name "stop open" — got ${JSON.stringify(stopOpenRes.stderr)}`)
  assert.ok(!stopOpenRes.stderr.includes('--question'),
    `D8: once --question is deleted, no printed usage for stop open may mention it — got ${JSON.stringify(stopOpenRes.stderr)}`)
})

test('AC-20260906-01-10 (the two new promises; the SHALL CONTINUE TO pin stays in tests/review/promise-sweep.test.js): lib/spec-sections.js\'s exported V7_APPLIES_FROM equals "20260817", the same floor promise-sweep.js\'s not-applicable branch prints, and promise-sweep.js refuses a --applies-from override as an unrecognized flag, exiting 2 with the usage line', () => {
  const { V7_APPLIES_FROM } = require('../../spec/scripts/lib/spec-sections')
  assert.strictEqual(V7_APPLIES_FROM, '20260817',
    `specs/20260906/01-ac-drift-doctor-check.md D2: lib/spec-sections.js must export V7_APPLIES_FROM equal to ` +
    `"20260817" — ac-drift.js and promise-sweep.js share this one constant instead of each carrying its own ` +
    `copy of the v7 cutover date, or the two scripts can silently drift apart on which specs the floor exempts ` +
    `— got ${JSON.stringify(V7_APPLIES_FROM)}`)

  const dir = tmpdir('ps-applies-from-deleted')
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, '# Test Spec\n\n## Decisions\n\n' +
    '| ID | Decision | One-line rationale |\n|----|----------|--------------------|\n' +
    '| D1 | does X | why |\n\n## Acceptance Criteria\n\n' +
    '- **AC-20260899-99-1**: WHEN X THE SYSTEM SHALL Y → tests/foo.test.js\n')
  const res = runNode('scripts/promise-sweep.js', ['--spec', spec, '--applies-from', '20260101'])
  assert.strictEqual(res.status, 2,
    `D8: --applies-from is a never-passed flag this spec deletes — promise-sweep.js must refuse it exactly ` +
    `like any other unrecognized argument (exit 2), never accept it as an override of the shared v7 floor ` +
    `(stderr: ${res.stderr})`)
  assert.match(res.stderr, /usage: promise-sweep\.js --spec <path> \[--manifest <path>\] \[--json\]/,
    `D8: the refusal must print promise-sweep.js's usage line — got "${res.stderr}"`)
  assert.ok(!res.stderr.includes('--applies-from'),
    `D8: once deleted, the printed usage line must no longer mention --applies-from at all — a lingering ` +
    `mention would document a flag the parser no longer accepts — got "${res.stderr}"`)
})
