'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { SPEC } = require('../helpers')

// specs/20261026/02-one-tests-row-check-and-host-shape-hints.md AC-20261026-02-4 (D2): no
// inline tests-layer predicate outside lib/file-plan.js.

const SCRIPTS = path.join(SPEC, 'scripts')
const OWNER = path.join('lib', 'file-plan.js')

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (e.name.endsWith('.js')) out.push(p)
  }
  return out
}

const PATTERNS = [
  ['/^tests?$/ regex literal', /\/\^tests\?\$\//],
  ["toLowerCase() === 'tests' comparison", /toLowerCase\(\)\s*[!=]==?\s*['"]tests['"]/],
]

function hits(scriptsDir) {
  const out = []
  for (const file of walk(scriptsDir, [])) {
    const rel = path.relative(scriptsDir, file)
    if (rel === OWNER) continue
    const src = fs.readFileSync(file, 'utf8')
    for (const [name, re] of PATTERNS) if (re.test(src)) out.push(rel + ': ' + name)
  }
  return out
}

test('AC-20261026-02-4: spec/scripts holds no inline tests-layer predicate outside lib/file-plan.js', () => {
  assert.deepStrictEqual(hits(SCRIPTS), [],
    'a script re-spells the tests-layer predicate — the spellings drift and red-check skips rows build dispatches; call isTestsRow from lib/file-plan.js')
})

test('AC-20261026-02-4: the scan flags a regex-literal copy and a lowercase comparison but not agent.kind === tests', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'otr-'))
  fs.writeFileSync(path.join(dir, 'a.js'), 'const x = /^tests?$/i.test(r.layer)\n')
  fs.writeFileSync(path.join(dir, 'b.js'), "const y = (r.layer || '').toLowerCase() === 'tests'\n")
  fs.writeFileSync(path.join(dir, 'c.js'), "const z = agent.kind === 'tests'\n")
  const got = hits(dir).sort()
  fs.rmSync(dir, { recursive: true, force: true })
  assert.deepStrictEqual(got,
    ['a.js: /^tests?$/ regex literal', "b.js: toLowerCase() === 'tests' comparison"],
    'the scan misses a planted predicate or flags agent.kind — the guard would pass a seventh copy or refuse init-gen.js')
})
