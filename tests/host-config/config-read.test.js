'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, tmpdir } = require('../helpers')

// specs/20260815/01-recurrence-carriers.md (2026-08-15, D5/D7): lib/host-config.js gains
// `readConfigStrict(root)` — the fail-loud sibling of the swallow-to-{} `readConfig`, prescribed
// by the config-read class's own 2026-08-14 advisory row and needed by the strict callers
// (ci-gate-parity.js, spec-design-driver.js) that structurally cannot use the degrade-to-{}
// reader. AC-20260815-01-10 pins the throw contract (absent/unreadable/unparsable) and the
// verbatim-return contract (no shape coercion, no non-object throw — a config parsing to a
// scalar or null must round-trip exactly, per the adversarial finding that a coercing throw
// would have silently rewritten ci-gate-parity's locked exit-2/exit-0 contract).
// AC-20260815-01-11 pins `readConfig`'s existing swallow-to-{} behavior as an untouched
// regression (declared "green pre-change" by the spec itself — this is not a new-behavior pin).
//
// AC-20260815-01-12 (the closure pin over spec/scripts/**/*.js): orchestrator ruling
// d10-predicate-v1 (D10, 2026-08-16, superseding A2's naive one-line predicate that this file
// previously blocked on) specifies the exact ordered-clause predicate below — a pure `fs` walk,
// never a shell grep, because fidelity-check.js carries a stray NUL byte that makes grep
// misclassify it as binary and silently drop its hits (the plan-time mismeasurement D10 fixes).
// Per line: (1) no literal `spec.config.json` -> green; (2) `readFileSync` present -> offender,
// unconditionally; (3) `path.join` present -> offender, unless the line is a display-join
// (a template-literal interpolation consisting solely of one `path.join(...)` call rendering the
// path for an error message, structurally incapable of reading); (4) otherwise green. D10 states
// this must flag exactly the four live D6 offenders (ci-gate-parity.js:40, design-atlas.js:367,
// fidelity-check.js:114, spec-design-driver.js:77) and leave every prose mention — including
// suite-baseline.js:150's display join — green.

function writeConfig(dir, content) {
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude', 'spec.config.json'), content)
}

test('AC-20260815-01-10: readConfigStrict(root) throws an Error naming the config path and "cannot read/parse" when the config is absent, occupied by a directory, or unparsable JSON', () => {
  const { readConfigStrict } = require('../../spec/scripts/lib/host-config')

  const absentDir = tmpdir('host-config-absent')
  assert.throws(() => readConfigStrict(absentDir),
    err => err instanceof Error && err.message.includes('cannot read/parse') &&
      err.message.includes(path.join(absentDir, '.claude', 'spec.config.json')),
    'readConfigStrict must throw naming the config path and "cannot read/parse" when the config ' +
    'file is absent — a strict caller (ci-gate-parity.js, spec-design-driver.js) relies on this ' +
    'exact message text to compose its own remedy suffix without re-wrapping (D6)')

  const dirAsFileDir = tmpdir('host-config-dirasfile')
  fs.mkdirSync(path.join(dirAsFileDir, '.claude', 'spec.config.json'), { recursive: true })
  assert.throws(() => readConfigStrict(dirAsFileDir),
    err => err instanceof Error && err.message.includes('cannot read/parse'),
    'readConfigStrict must throw "cannot read/parse" when the config path is occupied by a ' +
    'directory (an unreadable read) — silently swallowing this and returning {} would make a ' +
    'strict caller believe the host has no config at all rather than a broken one')

  const garbageDir = tmpdir('host-config-garbage')
  writeConfig(garbageDir, '{ this is not valid json')
  assert.throws(() => readConfigStrict(garbageDir),
    err => err instanceof Error && err.message.includes('cannot read/parse'),
    'readConfigStrict must throw "cannot read/parse" when the config file exists but fails to ' +
    'parse as JSON — a strict caller must fail loud here instead of degrading to {}')
})

test('AC-20260815-01-10: readConfigStrict(root) returns a successful parse verbatim with no shape coercion, including non-object scalars and null', () => {
  const { readConfigStrict } = require('../../spec/scripts/lib/host-config')

  const objDir = tmpdir('host-config-obj')
  writeConfig(objDir, JSON.stringify({ gateCommand: 'true' }))
  assert.deepStrictEqual(readConfigStrict(objDir), { gateCommand: 'true' },
    'readConfigStrict must round-trip a valid object config verbatim — every existing caller\'s ' +
    'own shape guard (e.g. typeof config.gateCommand === "string") owns validation, so the lib ' +
    'must not pre-filter or coerce the object it hands back')

  const scalarDir = tmpdir('host-config-scalar')
  writeConfig(scalarDir, '3')
  assert.strictEqual(readConfigStrict(scalarDir), 3,
    'readConfigStrict must return the bare number 3 (no non-object throw, no coercion to {}) — ' +
    'a coercing implementation would silently flip ci-gate-parity.js\'s locked exit-0 ' +
    '"inapplicable — no gateCommand" degrade on a scalar config into an exit-2 crash (the exact ' +
    'adversarial finding D5 folds)')

  const nullDir = tmpdir('host-config-null')
  writeConfig(nullDir, 'null')
  assert.strictEqual(readConfigStrict(nullDir), null,
    'readConfigStrict must return the parsed value null verbatim rather than throwing or ' +
    'substituting {} — the contract is "no non-object throw", and null is valid JSON that parses ' +
    'successfully')
})

test('AC-20260815-01-11: readConfig(root) continues to return {} without throwing when the config is absent or unparsable (regression pin, declared green pre-change by the spec)', () => {
  const { readConfig } = require('../../spec/scripts/lib/host-config')

  const absentDir = tmpdir('host-config-degrade-absent')
  assert.deepStrictEqual(readConfig(absentDir), {},
    'readConfig must continue to degrade to {} when the config is absent — every existing ' +
    'caller (glob-match.js, the CI scripts, design-atlas.js) relies on this swallow-to-{} ' +
    'contract staying byte-identical; D5 adds readConfigStrict alongside it, it does not touch ' +
    'this function')

  const garbageDir = tmpdir('host-config-degrade-garbage')
  writeConfig(garbageDir, '{ not json')
  assert.deepStrictEqual(readConfig(garbageDir), {},
    'readConfig must continue to degrade to {} on unparsable JSON without throwing — a throw ' +
    'here would break every caller that depends on the current swallow-to-{} degrade path')
})

// D10's ordered-clause predicate over one line of source, applied by the closure pin below.
// Kept local to the test (there is no separate closure script — the walk IS the pin, per D7's
// Behavior section) rather than imported, so this test exercises the predicate as specified, not
// an implementation's restatement of it.
const DISPLAY_JOIN_EXEMPT =
  /\$\{\s*path\.join\([^()]*['"`][^'"`]*spec\.config\.json['"`][^()]*\)\s*\}/

function offendingLine(line) {
  if (!line.includes('spec.config.json')) return false
  if (line.includes('readFileSync')) return true
  if (line.includes('path.join')) return !DISPLAY_JOIN_EXEMPT.test(line)
  return false
}

function scanConfigReadOffenders() {
  const scriptsDir = path.join(ROOT, 'spec', 'scripts')
  const exemptRel = path.join('lib', 'host-config.js')
  const offenders = []

  ;(function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) { walk(full); continue }
      if (!entry.name.endsWith('.js')) continue
      const rel = path.relative(scriptsDir, full)
      if (rel === exemptRel) continue
      const lines = fs.readFileSync(full, 'utf8').split('\n')
      lines.forEach((line, i) => {
        if (offendingLine(line)) offenders.push(rel + ':' + (i + 1))
      })
    }
  })(scriptsDir)

  return offenders
}

test('AC-20260815-01-12: no .js file under spec/scripts/ other than lib/host-config.js pairs the literal spec.config.json with readFileSync (unconditionally) or a non-display-join path.join on one line', () => {
  const offenders = scanConfigReadOffenders()
  assert.deepStrictEqual(offenders, [],
    'every private spec.config.json read under spec/scripts/ must route through ' +
    'lib/host-config.js — readConfig for degrade-to-{} semantics, readConfigStrict for ' +
    'fail-loud — instead of privately pairing the config filename with readFileSync or ' +
    'path.join on one line; offending file:line(s): ' + offenders.join(', '))
})
