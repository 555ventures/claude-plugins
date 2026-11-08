'use strict'
// Pins spec/scripts/lib/criteria.js (ADR-0048): which files are tests, which criteria they cite at a commit and on
// disk, and GATE's check — a criterion cited at the base and by nothing now is red, a criterion of the spec being built
// with no citing test is red where the project's tests cite criteria and a note where they cite none.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { tmpdir, gitRepo, SPEC } = require('./helpers')
const C = require(path.join(SPEC, 'scripts/lib/criteria.js'))
const S = require(path.join(SPEC, 'scripts/lib/spec.js'))

function repo(files) {
  const dir = tmpdir('criteria')
  const put = (f, t) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), t) }
  for (const [f, t] of Object.entries(files)) put(f, t)
  const g = gitRepo(dir)
  return { dir, g, put, rm: (f) => fs.rmSync(path.join(dir, f)), base: g('rev-parse', 'HEAD').trim() }
}
const asObj = (m) => Object.fromEntries([...m].map(([k, v]) => [k, [...v].sort()]))

// A spec on disk defining AC-20990101-01-1 and -2; the spec being built, with its own criterion.
const OLD = '---\nstatus: done\n---\n# Old\n\n## Acceptance Criteria\n\n- **AC-20990101-01-1**: WHEN x THE SYSTEM SHALL y.\n- **AC-20990101-01-2**: z.\n'
const building = (extra = '') => S.parse(`---\nstatus: done\n---\n# New\n\n## Decisions\n\n| ID | Decision | Why |\n|---|---|---|\n| D1 | drop the old pin | x |\n\n## Acceptance Criteria\n\n- **AC-20990102-01-1**: WHEN a THE SYSTEM SHALL b.\n${extra}`)

test('AC-20261107-04-1 cited maps each AC-ID to the test files naming it: basename rule or testGlobs, -11 is never -1, notes are skipped (a testGlobs match too), a sha reads the commit', () => {
  const h = repo({
    'a.test.js': '// AC-20990101-01-1 and AC-20990101-01a-2\n',
    'py/b_spec.py': '# AC-20990101-01-11\n',
    'notes.md': 'AC-20990101-01-3\n',
    'checks/x.sh': '# AC-20990101-01-4\n',
    'checks/fixture.md': 'AC-20990101-01-5\n',
    'checks/x.run/evidence.txt': 'AC-20990101-01-6\n',
  })
  const want = { 'AC-20990101-01-1': ['a.test.js'], 'AC-20990101-01a-2': ['a.test.js'], 'AC-20990101-01-11': ['py/b_spec.py'], 'AC-20990101-01-4': ['checks/x.sh'] }
  const cfg = { testGlobs: ['checks/**'] }
  assert.deepStrictEqual(asObj(C.cited(h.dir, null, cfg)), want)
  const plain = asObj(C.cited(h.dir, null, {}))
  assert.ok(!plain['AC-20990101-01-4'], 'without testGlobs checks/x.sh is not a test file')
  h.put('a.test.js', '// nothing cited any more\n')
  h.put('new.test.js', '// AC-20990101-01-9\n')
  assert.deepStrictEqual(asObj(C.cited(h.dir, h.base, cfg)), want, 'at a sha the committed text is read, not the disk')
  const disk = asObj(C.cited(h.dir, null, cfg))
  assert.deepStrictEqual([disk['AC-20990101-01-1'], disk['AC-20990101-01-9']], [undefined, ['new.test.js']], 'the disk sees edits and untracked files')
})

test('AC-20261107-04-2 a test citing a defined criterion deleted since the base is red; listed under Retired criteria, or defined by no spec, it is nothing', () => {
  const files = { 'specs/20990101/01-old.md': OLD, 'tests/old.test.js': '// AC-20990101-01-1\n', 'tests/new.test.js': '// AC-20990102-01-1\n' }
  const h = repo(files); h.rm('tests/old.test.js')
  const r = C.check({ wt: h.dir, base: h.base, cfg: {}, doc: building() })
  assert.strictEqual(r.red.length >= 1, true, JSON.stringify(r))
  assert.ok(r.red[0].includes('AC-20990101-01-1') && r.red[0].includes('tests/old.test.js'), r.red.join('\n'))
  assert.ok(r.red.join('\n').includes('restore') && r.red.join('\n').includes('unmet'), r.red.join('\n'))
  const retired = C.check({ wt: h.dir, base: h.base, cfg: {}, doc: building('\n## Retired criteria\n\n- AC-20990101-01-1 — retired by D1: the old pin goes\n') })
  assert.deepStrictEqual(retired, { red: [], warn: [] })
  const undef = repo({ ...files, 'specs/20990101/01-old.md': OLD.replace(/AC-20990101-01-1/, 'AC-20990101-01-8') }); undef.rm('tests/old.test.js')
  assert.deepStrictEqual(C.check({ wt: undef.dir, base: undef.base, cfg: {}, doc: building() }), { red: [], warn: [] }, 'an ID no spec defines is not watched')
  const stub = repo({ ...files, 'specs/20990101/01-old.md': '---\nstatus: done\nacs: [AC-20990101-01-1, AC-20990101-01-2]\n---\n# Old\n' }); stub.rm('tests/old.test.js')
  assert.match(C.check({ wt: stub.dir, base: stub.base, cfg: {}, doc: building() }).red[0], /AC-20990101-01-1/, "a stub's acs: line defines its IDs")
})

test('AC-20261107-04-3 an uncited criterion of the spec being built is red where the base cites an AC, nothing when checked at review, a warning where the base cites none', () => {
  const h = repo({ 'specs/20990101/01-old.md': OLD, 'tests/old.test.js': '// AC-20990101-01-1\n' })
  const r = C.check({ wt: h.dir, base: h.base, cfg: {}, doc: building() })
  assert.strictEqual(r.red.length, 2, r.red.join('\n'))
  assert.ok(r.red[0].includes('AC-20990102-01-1') && /restore|test/.test(r.red[1]), r.red.join('\n'))
  assert.deepStrictEqual(r.warn, [])
  const prose = C.check({ wt: h.dir, base: h.base, cfg: {}, doc: building('\n## Retired criteria\n\n- AC-20990102-01-1 — checked at review: prose\n') })
  assert.deepStrictEqual(prose, { red: [], warn: [] })
  const none = repo({ 'specs/20990101/01-old.md': OLD, 'tests/plain.test.js': '// cites nothing\n' })
  const w = C.check({ wt: none.dir, base: none.base, cfg: {}, doc: building() })
  assert.deepStrictEqual(w.red, [], 'a project whose tests cite no criterion is never refused')
  assert.strictEqual(w.warn.length, 1)
  assert.ok(w.warn[0].includes('AC-20990102-01-1'), w.warn[0])
})

test('AC-20261107-04-4 a spec-less fix deleting a test that cites a defined criterion is red with needs-plan as its second exit; deleting none is nothing', () => {
  const files = { 'specs/20990101/01-old.md': OLD, 'tests/old.test.js': '// AC-20990101-01-1\n' }
  const doc = S.fixDoc('the export double-sends', null)
  const clean = repo(files)
  assert.deepStrictEqual(C.check({ wt: clean.dir, base: clean.base, cfg: {}, doc }), { red: [], warn: [] })
  const h = repo(files); h.rm('tests/old.test.js')
  const r = C.check({ wt: h.dir, base: h.base, cfg: {}, doc })
  const tail = r.red.join('\n')
  assert.ok(tail.includes('AC-20990101-01-1') && tail.includes('restore') && tail.includes('needs-plan'), tail)
  assert.ok(!tail.includes('unmet'), 'a fix has no spec to amend: ' + tail)
})
