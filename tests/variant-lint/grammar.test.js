'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')

// specs/20261103/10-two-missing-briefs-are-not-the-same-brief.md D5 (AC-20261103-10-12, AC-20261103-10-13, AC-20261103-10-14):
// variant-lint.js flags a `.brief` read in a boolean, coalescing or equality position outside the helper.

const LINT = 'scripts/variant-lint.js'

function root(files) {
  const dir = tmpdir('variant-lint')
  for (const [rel, text] of Object.entries(files)) {
    const p = path.join(dir, rel)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, text)
  }
  return dir
}

const A_LINES = [
  'if (!e.brief) x()',
  'const t = e.brief && 1',
  'const u = e.brief ? 1 : 2',
  'if (e.brief) {}',
  'const v = e.brief ?? 0',
  'const w = e.brief?.num',
  'const y = 1 && e.brief',
  'if (a.brief === b.brief) {}',
  "if ('32' !== e.brief) {}",
  '// if (e.brief) comment',
]
const CLASSES = ['boolean-not', 'boolean-and-or', 'boolean-ternary', 'boolean-if', 'coalescing', 'coalescing', 'coalescing-rhs', 'equality', 'equality-rhs']

test('AC-20261103-10-12: variant-lint prints one finding per brief read in a boolean, coalescing or equality position in file order, skips comment lines, and exits 1 with the sentinel and a --json shape', () => {
  const dir = root({ 'spec/scripts/a.js': A_LINES.join('\n') + '\n' })
  const r = runNode(LINT, ['--root', dir])
  assert.strictEqual(r.status, 1, 'findings must exit 1, or the suite stays green over a defect-class site: ' + r.stderr + r.stdout)
  const findings = r.stdout.split('\n').filter((l) => /^spec\/scripts\/a\.js:\d+ /.test(l))
  assert.strictEqual(findings.length, 9, 'exactly nine of the ten lines are findings (the comment is not): ' + r.stdout)
  findings.forEach((l, i) => {
    assert.ok(l.startsWith('spec/scripts/a.js:' + (i + 1) + ' ' + CLASSES[i] + ' | ' + A_LINES[i]),
      'finding ' + (i + 1) + ' must be "<path>:<line> ' + CLASSES[i] + ' | <code>", or the author cannot find the position class: ' + l)
  })
  assert.match(r.stdout, /^VARIANT_LINT fields=1 files=1 findings=9$/m, 'the sentinel line must carry the counts, or a gate cannot read the result: ' + r.stdout)
  const j = JSON.parse(runNode(LINT, ['--root', dir, '--json']).stdout)
  assert.strictEqual(j.findings.length, 9, '--json must carry all nine findings: ' + JSON.stringify(j.findings))
  assert.deepStrictEqual(j.findings[7], { path: 'spec/scripts/a.js', line: 8, field: 'brief', class: 'equality', code: 'if (a.brief === b.brief) {}' },
    '--json findings must carry path, line, field, class and code, or a consumer reads a shape nobody pinned: ' + JSON.stringify(j.findings[7]))
})

test('AC-20261103-10-13: variant-lint passes shapes that read no stamp as a boolean, exempts the helper, and prints a skip line for each foreign file it does not count', () => {
  const dir = root({
    'spec/scripts/b.js': [
      'const n = x.briefs.length',
      "if (e.brief.kind === 'adhoc') {}",
      'const o = { brief: e.brief }',
      'fn(e.brief)',
      'const k = e.brief[0]',
    ].join('\n') + '\n',
    'spec/scripts/lib/brief.js': 'return a.brief === b.brief\n',
    'spec/scripts/genesis-driver.js': 'if (status.brief && status.brief.mocks) {}\n',
  })
  const r = runNode(LINT, ['--root', dir])
  assert.strictEqual(r.status, 0, 'a tree with no pattern site must exit 0: ' + r.stderr + r.stdout)
  assert.ok(r.stdout.includes('skip spec/scripts/genesis-driver.js — `status.brief` is the genesis status record (ratified-brief object), not a spec stamp'),
    'the foreign file must print its skip line, or the exemption is invisible on every run: ' + r.stdout)
  assert.match(r.stdout, /^VARIANT_LINT fields=1 files=2 findings=0$/m, 'the helper and the foreign file must not be counted, or the exemption widens silently: ' + r.stdout)
})

test('AC-20261103-10-14: variant-lint --field prints the field table, an unknown field name exits 2 naming the known fields, and a missing root exits 2 naming the directory', () => {
  const table = runNode(LINT, ['--field'])
  assert.strictEqual(table.status, 0, '--field alone must print the table and exit 0: ' + table.stderr)
  assert.strictEqual(table.stdout.trim(), 'brief → spec/scripts/lib/brief.js (scope spec/scripts/**; foreign: spec/scripts/genesis-driver.js, spec/scripts/prototype-driver.js)',
    'the table line must name the helper, scope and foreign files, or a later axis cannot be reviewed from it: ' + table.stdout)
  const bad = runNode(LINT, ['--field', 'nope'])
  assert.strictEqual(bad.status, 2, 'an unknown field must exit 2, or a typo lints nothing and passes: ' + bad.stdout)
  assert.ok(bad.stderr.includes('unknown field nope') && bad.stderr.includes('brief'), 'stderr must name the unknown field and the known ones: ' + bad.stderr)
  const missing = path.join(tmpdir('variant-lint'), 'no-such-dir')
  const gone = runNode(LINT, ['--root', missing])
  assert.strictEqual(gone.status, 2, 'an unreadable root must exit 2, or a wrong --root passes green: ' + gone.stdout)
  assert.ok(gone.stderr.includes(missing), 'stderr must name the directory it could not read: ' + gone.stderr)
})
