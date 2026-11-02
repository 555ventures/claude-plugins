'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { ROOT, tmpdir } = require('../helpers')

// /spec:fix pin for dropped test tails: `--test-force-exit` exits each per-file child once its
// reporter stream ENDS, while bytes still queued in the non-blocking stdout pipe to the runner
// are discarded — the child exits 0, the runner drops the child's plan, and the file's last
// tests vanish from a green run. scripts/test-stdout-blocking.js makes child stdout blocking;
// these pins prove the loss happens without it, does not happen with it, and that every
// force-exit command this repo runs loads it.

const PRELOAD = path.join(ROOT, 'scripts/test-stdout-blocking.js')
const TESTS = 60

// A fixture of async tests whose child-v8 event stream outgrows a 64 KiB pipe buffer: async
// tests are the shape that leaves events queued in the pipe at force-exit (a file of purely
// synchronous tests does not reproduce the loss).
function fixture(dir) {
  const file = path.join(dir, 'big.test.js')
  const name = 'x'.repeat(100)
  const lines = ["const { test } = require('node:test')"]
  for (let i = 0; i < TESTS; i++) lines.push(`test('t${i} ${name}', async () => { await new Promise((r) => setTimeout(r, 20)) })`)
  fs.writeFileSync(file, lines.join('\n') + '\n')
  return file
}

// Spawn the file exactly as the runner spawns a child (NODE_TEST_CONTEXT=child-v8), into a pipe
// whose reader waits until the child has exited — up to `maxWaitTicks` x 50 ms, since a blocking
// child cannot exit before the reader drains it (0 = wait for exit however long it takes).
// Returns the number of test:pass events that arrived.
function passesThroughLateReader(dir, file, extraArgs, maxWaitTicks) {
  const out = path.join(dir, 'out.bin')
  const done = path.join(dir, 'done')
  fs.rmSync(done, { force: true })
  const node = JSON.stringify(process.execPath)
  const script =
    `{ NODE_TEST_CONTEXT=child-v8 ${node} --test-force-exit ${extraArgs} ${JSON.stringify(file)}; : > ${JSON.stringify(done)}; } | ` +
    `{ i=0; while [ ! -f ${JSON.stringify(done)} ] && { [ ${maxWaitTicks} -eq 0 ] || [ $i -lt ${maxWaitTicks} ]; }; do sleep 0.05; i=$((i+1)); done; cat > ${JSON.stringify(out)}; }`
  const r = spawnSync('sh', ['-c', script], { encoding: 'utf8', timeout: 60000 })
  assert.strictEqual(r.status, 0,
    'the late-reader pipeline did not complete, so no event count can be trusted (a child that never exits ' +
    'deadlocks an uncapped reader): status ' + r.status + ' ' + r.stderr)
  return fs.readFileSync(out).toString('latin1').split('test:pass').length - 1
}

test('without the preload, --test-force-exit discards the tail of a child whose output outruns its reader (the fixture really exercises the loss)', () => {
  const dir = tmpdir('stdout-blocking-')
  const passes = passesThroughLateReader(dir, fixture(dir), '', 0)
  assert.ok(passes < TESTS,
    `the control run must lose test:pass events (got ${passes} of ${TESTS}) — if it no longer ` +
    'does, either this fixture stopped filling the pipe or node stopped discarding queued ' +
    'stdout on force-exit, and scripts/test-stdout-blocking.js may be retirable')
})

test('with the preload, every test:pass event of the child reaches a late reader under --test-force-exit', () => {
  const dir = tmpdir('stdout-blocking-')
  const passes = passesThroughLateReader(dir, fixture(dir), `--require ${JSON.stringify(PRELOAD)}`, 20)
  assert.strictEqual(passes, TESTS,
    `all ${TESTS} test:pass events must arrive — fewer means queued stdout was discarded at ` +
    'force-exit and a green run is hiding unrun tests')
})

test('every --test-force-exit command this repo runs (npm test, testCommand, gateCommand) also loads the stdout-blocking preload', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude/spec.config.json'), 'utf8'))
  const commands = { 'package.json scripts.test': pkg.scripts.test, testCommand: cfg.testCommand, gateCommand: cfg.gateCommand }
  for (const [where, cmd] of Object.entries(commands)) {
    if (!/--test-force-exit/.test(cmd)) continue
    assert.ok(cmd.includes('--require ./scripts/test-stdout-blocking.js'),
      `${where} carries --test-force-exit without --require ./scripts/test-stdout-blocking.js — ` +
      `its per-file children can exit with results still queued and drop tests silently: ${cmd}`)
  }
})
