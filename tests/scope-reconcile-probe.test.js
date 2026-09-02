'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('./helpers')

// specs/20260822/02-init-generation-script.md D9 (A9): scope-reconcile.js gains an additive,
// read-only `--probe-at-risk <file> --root <dir> [--test-globs <csv>]` mode for init-gen.js's
// at-risk-applicability probe — `<file>` is a newline-separated list of repo-relative source
// paths (init-gen samples up to 20 tracked non-test files), and the mode REUSES the existing
// stemsFor derivation and test-file content scan in place (the sole-derivation rule: a second
// stem implementation anywhere is a hard violation). This test pins AC-11. The motivating
// incident is the at-risk escape this same derivation was built to close (specs/20260815/02)
// — D9's point is that a Python-shaped (dotted-import) host is silently indistinguishable
// from "clean" unless the probe surfaces refs:0 at init time.

const SCRIPT = 'scripts/scope-reconcile.js'

function writeSampleFile(dir, lines) {
  const p = path.join(dir, 'sample.txt')
  fs.writeFileSync(p, lines.join('\n') + '\n')
  return p
}

test('AC-20260822-02-11: a sampled source file whose path stem appears in a test file\'s content is reported with refs >= 1', () => {
  const dir = tmpdir('scope-reconcile-probe')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/util.test.js'), "require('../src/lib/util.js')\n")
  const sampleFile = writeSampleFile(dir, ['src/lib/util.js'])

  const r = runNode(SCRIPT, ['--probe-at-risk', sampleFile, '--root', dir])
  assert.strictEqual(r.status, 0, 'a probe-at-risk run over a well-formed sample list must exit 0 — findings are data, never a failure: ' + r.stderr)
  const out = JSON.parse(r.stdout)
  assert.strictEqual(out.sampled, 1, 'sampled must count the lines of the --probe-at-risk input file, or init-gen\'s reported sample size is wrong: ' + r.stdout)
  assert.ok(out.testFiles >= 1, 'testFiles must count the test-classified files found under --root — tests/util.test.js must be counted: ' + r.stdout)
  assert.ok(out.refs >= 1,
    "tests/util.test.js contains the literal stem \"src/lib/util.js\" from the changed sample — refs:0 here would mean the reused stem scan stopped matching a plain relative require, silently telling the interview the at-risk leg is inert when it is not: " + r.stdout)
})

test('AC-20260822-02-11: a sampled source file referenced only via a dotted module import (no path-shaped substring) is reported with refs 0', () => {
  const dir = tmpdir('scope-reconcile-probe')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/services.test.js'), '# from app.services import x\n')
  const sampleFile = writeSampleFile(dir, ['app/services.py'])

  const r = runNode(SCRIPT, ['--probe-at-risk', sampleFile, '--root', dir])
  assert.strictEqual(r.status, 0, r.stderr)
  const out = JSON.parse(r.stdout)
  assert.strictEqual(out.sampled, 1, 'sampled must count the one sampled path: ' + r.stdout)
  assert.strictEqual(out.refs, 0,
    'stemsFor("app/services.py") never yields a dotted form ("app.services") — a Python-shaped host\'s test suite references its changed files only by dotted import, so refs must be 0 here, exactly the "silently indistinguishable from clean" case D9 exists to surface to the interview rather than hide: ' + r.stdout)
})
