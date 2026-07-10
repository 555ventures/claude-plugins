'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('./helpers')

const SCRIPT = 'scripts/skeletons-check.js'

function check(doc) {
  const dir = tmpdir('skel')
  const file = path.join(dir, 'skeletons.json')
  fs.writeFileSync(file, JSON.stringify(doc))
  return runNode(SCRIPT, [file])
}

const AUTHOR = (over = {}) => ({
  id: 's1',
  decision: 'author',
  componentPath: 'src/components/S1.tsx',
  tree: [{ el: 'div', style: { fill: 'surface-raised' } }],
  states: ['default', 'empty'],
  tokens: ['surface-raised'],
  ...over,
})

test('clean author + bind skeletons pass', () => {
  const res = check({
    skeletons: [
      AUTHOR(),
      { id: 's2', decision: 'bind', bind: { component: 'Card', from: 'src/components/Card' } },
    ],
  })
  assert.strictEqual(res.status, 0, res.stderr)
})

test('literals in style values are rejected; token roles are not', () => {
  for (const bad of ['#fff', '#a1b2c3', '12px', 'rgb(0,0,0)', 'hsl(0 0% 0%)', 'var(--x)', '.5rem', '0.5rem', '50%', 'calc(1px + 2px)', '1em', 'red']) {
    const res = check({ skeletons: [AUTHOR({ tree: [{ el: 'div', style: { fill: bad } }] })] })
    assert.notStrictEqual(res.status, 0, 'literal accepted: ' + bad)
  }
  for (const good of ['surface-raised', 'spacing-px', 'radius-pill', 'text-body', 'elevation-2']) {
    const res = check({ skeletons: [AUTHOR({ tree: [{ el: 'div', style: { fill: good } }] })] })
    assert.strictEqual(res.status, 0, 'role rejected: ' + good + '\n' + res.stderr)
  }
})

test('prototype-key ids are not falsely reported as duplicates', () => {
  const res = check({ skeletons: [AUTHOR({ id: 'constructor' }), AUTHOR({ id: 'toString', componentPath: 'src/T.tsx' })] })
  assert.strictEqual(res.status, 0, res.stderr)
})

test('real duplicate ids are reported', () => {
  const res = check({ skeletons: [AUTHOR(), AUTHOR()] })
  assert.notStrictEqual(res.status, 0)
  assert.match(res.stderr, /duplicate/)
})

test('author needs non-empty tree, states, and tokens', () => {
  for (const over of [{ tree: [] }, { states: [] }, { tokens: [] }]) {
    const res = check({ skeletons: [AUTHOR(over)] })
    assert.notStrictEqual(res.status, 0, 'accepted empty ' + Object.keys(over)[0])
  }
})

test('bind entries carrying author-shaped fields are flagged as confused', () => {
  const res = check({
    skeletons: [{
      id: 'sx', decision: 'bind',
      bind: { component: 'Card', from: 'src/components/Card' },
      tree: [{ el: 'div' }], componentPath: 'src/components/Sx.tsx',
    }],
  })
  assert.notStrictEqual(res.status, 0, 'half-author bind entry must be rejected')
})

test('invalid decision and malformed nodes are reported with paths', () => {
  const res = check({ skeletons: [AUTHOR({ decision: 'maybe' }), AUTHOR({ tree: [{ style: { x: 'ok-role' } }] })] })
  assert.notStrictEqual(res.status, 0)
  assert.match(res.stderr, /skeletons\[0\]\.decision/)
  assert.match(res.stderr, /skeletons\[1\]\.tree\[0\]/)
})

test('mock-bound author (sliceRef, no tree, tokenMap of roles) passes; a tree there is rejected', () => {
  const MOCK = (over = {}) => ({
    id: 'm1', decision: 'author', componentPath: 'src/M1.tsx', sliceRef: 'slice-m1.html',
    tokenMap: { '#3b82f6': 'accent-primary', '12px': 'space-3' },
    states: ['default', 'empty'], tokens: ['accent-primary', 'space-3'], ...over,
  })
  assert.strictEqual(check({ skeletons: [MOCK()] }).status, 0)
  // the paraphrase hop the binding-map contract forbids
  const res = check({ skeletons: [MOCK({ tree: [{ el: 'div' }] })] })
  assert.notStrictEqual(res.status, 0)
  assert.match(res.stderr, /must not carry a tree/)
  // tokenMap values are ROLES, never literals
  const res2 = check({ skeletons: [MOCK({ tokenMap: { '#3b82f6': '#3b82f6' } })] })
  assert.notStrictEqual(res2.status, 0)
  assert.match(res2.stderr, /tokenMap/)
  // tokenMap is optional, but when present must be an object
  assert.notStrictEqual(check({ skeletons: [MOCK({ tokenMap: ['x'] })] }).status, 0)
})
