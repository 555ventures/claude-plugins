'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { SPEC } = require('./helpers')

// PRAX-20260721-03: parity-check.js planes are file-globbed, but real casing
// conventions are scoped by syntactic role and by which side of a seam an expression
// is on. Measured on prax: 20 of 20 remaining findings were false positives in two
// classes. Class A — `class RunEvent` in `run_event.py` (PEP 8, universal) case-folds
// to `runevent` vs `run_event` and is reported as one identifier spelled two ways
// (a type identifier compared against its own module's name). Class B — a boundary
// file whose snake_case locals construct camelCase wire kwargs (`entry_px` local vs
// `entryPx=` kwarg, both correct, lines apart) cannot be expressed by any file glob.
// Fix contract: (A) never compare an identifier against the basename of the file
// defining it / compare within syntactic role; (B) let the caller declare an exempt
// seam vocabulary (--exempt a,b,c — derivable from the wire plane's own exemplars).

const SCRIPT = path.join(SPEC, 'scripts/parity-check.js')
const FIX = p => path.join(__dirname, 'fixtures/parity', p)

test('a PascalCase class in its own snake_case module is not a parity finding', () => {
  const r = spawnSync('node', [SCRIPT, FIX('run_event.py'), FIX('__init__.py')],
    { encoding: 'utf8' })
  assert.strictEqual(r.status, 0,
    'PEP 8\'s most universal convention (class RunEvent in run_event.py) is flagged ' +
    'as a cross-spelling: type identifiers are folded against module/value names.\n' +
    r.stdout + r.stderr)
})

test('a declared seam vocabulary exempts wire kwargs inside internal-plane files', () => {
  const r = spawnSync('node',
    [SCRIPT, '--exempt', 'runId,entryPx', FIX('engine_run.py')],
    { encoding: 'utf8' })
  assert.strictEqual(r.status, 0,
    'the plane boundary is a line, not a file: snake_case internals constructing ' +
    'camelCase wire records are correct on both sides, and the checker needs an ' +
    'exempt-vocabulary affordance to express it.\n' + r.stdout + r.stderr)
})
