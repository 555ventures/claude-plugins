'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('./helpers')

const SCRIPT = 'scripts/fidelity-check.js'

// One surface (s1) mapped to src/S1.tsx by default; override any piece per test.
function fixture({ strings = [], layout = [], files = {}, skeletons = null, deltas = null, slice = null, extract = null } = {}) {
  const root = tmpdir('fid')
  const sidecar = path.join(root, 'spec.design')
  fs.mkdirSync(sidecar, { recursive: true })
  fs.writeFileSync(path.join(sidecar, 'slice-s1.html'),
    slice !== null ? slice : '<div>' + strings.map(s => '<span>' + s + '</span>').join('') + '</div>')
  fs.writeFileSync(path.join(sidecar, 'extract.json'), JSON.stringify(extract || {
    schemaVersion: 2,
    surfaces: [{ id: 's1', sliceFile: 'slice-s1.html', strings, layout }],
  }))
  fs.writeFileSync(path.join(sidecar, 'skeletons.json'), JSON.stringify(skeletons || {
    skeletons: [{ id: 's1', decision: 'author', componentPath: 'src/S1.tsx',
      sliceRef: 'slice-s1.html', states: ['default'], tokens: ['surface'] }],
  }))
  if (deltas) fs.writeFileSync(path.join(sidecar, 'deltas.json'), JSON.stringify(deltas))
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(root, rel)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, content)
  }
  return { root, sidecar }
}
const run = (f) => runNode(SCRIPT, [f.sidecar, '--repo-root', f.root])

test('clean pass: every mock string present, in order', () => {
  const f = fixture({
    strings: ['Email address', 'Send invite', 'Cancel'],
    files: { 'src/S1.tsx': 'label("Email address"); <Button>Send invite</Button>; <Button>Cancel</Button>' },
  })
  const res = run(f)
  assert.strictEqual(res.status, 0, res.stderr)
  assert.match(res.stdout, /clean/)
})

test('missing mock copy fails and names the string', () => {
  const f = fixture({
    strings: ['Send invite'],
    files: { 'src/S1.tsx': '<Button>Send</Button>' }, // the classic paraphrase loss
  })
  const res = run(f)
  assert.strictEqual(res.status, 1)
  assert.match(res.stderr, /Send invite/)
})

test('whitespace/entity variants still count as the same copy', () => {
  const f = fixture({
    strings: ['Email address'],
    files: { 'src/S1.tsx': '<label>Email&nbsp;address</label>' },
  })
  assert.strictEqual(run(f).status, 0)
})

test('reordered actions fail the order check', () => {
  const f = fixture({
    strings: ['Send invite', 'Cancel'], // mock: Send first
    files: { 'src/S1.tsx': '<Button>Cancel</Button><Button>Send invite</Button>' },
  })
  const res = run(f)
  assert.strictEqual(res.status, 1)
  assert.match(res.stderr, /order/)
})

test('layout primitive: Tailwind arbitrary-value form passes, absence fails', () => {
  const layout = [{ property: 'grid-template-columns', value: '1fr auto' }]
  const ok = fixture({ layout, files: { 'src/S1.tsx': '<div className="grid grid-cols-[1fr_auto]">' } })
  assert.strictEqual(run(ok).status, 0, run(ok).stderr)
  const bad = fixture({ layout, files: { 'src/S1.tsx': '<div className="flex flex-col">' } })
  const res = run(bad)
  assert.strictEqual(res.status, 1)
  assert.match(res.stderr, /grid-template-columns/)
})

test('camelCase style-object form of a layout primitive passes', () => {
  const f = fixture({
    layout: [{ property: 'flex-direction', value: 'column' }],
    files: { 'src/S1.tsx': 'style={{ flexDirection: "column" }}' },
  })
  assert.strictEqual(run(f).status, 0, run(f).stderr)
})

test('a delta with a verified slice quote excuses a divergence; a forged quote does not', () => {
  const args = {
    strings: ['Send invite'],
    files: { 'src/S1.tsx': '<Button>Send</Button>' },
  }
  const good = fixture({ ...args, deltas: { deltas: [{ surfaceId: 's1', kind: 'string', target: 'Send invite',
    sliceQuote: 'Send invite', proof: 'gate output: Button label max 6 chars (tokens/type.css:12)' }] } })
  const gres = run(good)
  assert.strictEqual(gres.status, 0, gres.stderr)
  assert.match(gres.stdout, /excused/)

  const forged = fixture({ ...args, deltas: { deltas: [{ surfaceId: 's1', kind: 'string', target: 'Send invite',
    sliceQuote: 'Revoke is a direct action', proof: 'UX: re-issuable in one click' }] } })
  const fres = run(forged)
  assert.strictEqual(fres.status, 1)
  assert.match(fres.stderr, /sliceQuote not found/)
})

test('a delta with an empty proof is itself a failure', () => {
  const f = fixture({
    strings: ['Send invite'],
    files: { 'src/S1.tsx': '<Button>Send</Button>' },
    deltas: { deltas: [{ surfaceId: 's1', kind: 'string', target: 'Send invite', sliceQuote: 'Send invite', proof: '  ' }] },
  })
  const res = run(f)
  assert.strictEqual(res.status, 1)
  assert.match(res.stderr, /proof/)
})

test('copy living in another skeleton-owned file (fixtures) passes with a note', () => {
  const f = fixture({
    strings: ['No members yet'],
    files: { 'src/S1.tsx': '<Empty text={emptyCopy} />', 'src/mocks.ts': 'export const emptyCopy = "No members yet"' },
    skeletons: { skeletons: [
      { id: 's1', decision: 'author', componentPath: 'src/S1.tsx', sliceRef: 'slice-s1.html', states: ['default'], tokens: ['x'] },
      { id: 'foundation', decision: 'author', componentPath: 'src/mocks.ts', states: ['default'], tokens: ['x'], tree: [{ el: 'x' }] },
    ] },
  })
  const res = run(f)
  assert.strictEqual(res.status, 0, res.stderr)
  assert.match(res.stdout, /note:.*mocks\.ts/)
})

test('a mapped file missing on disk fails (cannot verify)', () => {
  const f = fixture({ strings: ['Hi'], files: {} })
  const res = run(f)
  assert.strictEqual(res.status, 1)
  assert.match(res.stderr, /does not exist/)
})

test('no fidelity data (pre-contract extract) is a clean no-op; missing skeletons.json dies', () => {
  const f = fixture({ extract: { schemaVersion: 1, surfaces: [{ id: 's1', sliceFile: 'slice-s1.html' }] } })
  assert.strictEqual(run(f).status, 0)

  const g = fixture({ strings: ['Hi'], files: { 'src/S1.tsx': 'Hi' } })
  fs.rmSync(path.join(g.sidecar, 'skeletons.json'))
  assert.strictEqual(run(g).status, 2)
})

test('a mock surface with no skeleton is a note, not a failure (spec covers a subset)', () => {
  const f = fixture({
    extract: { schemaVersion: 2, surfaces: [
      { id: 's1', sliceFile: 'slice-s1.html', strings: ['Hi'], layout: [] },
      { id: 'unplanned', sliceFile: 'slice-unplanned.html', strings: ['Elsewhere'], layout: [] },
    ] },
    files: { 'src/S1.tsx': 'Hi' },
  })
  fs.writeFileSync(path.join(f.sidecar, 'slice-s1.html'), '<span>Hi</span>')
  const res = run(f)
  assert.strictEqual(res.status, 0, res.stderr)
  assert.match(res.stdout, /note:.*unplanned.*no skeleton/)
})

// Interpolation templates: mock SAMPLE DATA renders from props, not hardcoded literals — the
// gate must accept `Remove ${member.name}` for "Remove Jamie Chen" without opening a hole for
// shortened static copy.

test('composite string passes via a template-literal hole; bare instance data via story fixture', () => {
  const f = fixture({
    strings: ['Remove Jamie Chen', 'Jamie Chen', 'Remove'],
    skeletons: { skeletons: [{ id: 's1', decision: 'author', componentPath: 'src/S1.tsx',
      storyPath: 'src/S1.stories.tsx', sliceRef: 'slice-s1.html', states: ['default'], tokens: ['surface'] }] },
    files: {
      'src/S1.tsx': 'const a = `Remove ${member.name}`; <Button aria-label={a}>Remove</Button>',
      'src/S1.stories.tsx': 'export const Default = { args: { member: { name: "Jamie Chen" } } }',
    },
  })
  const res = run(f)
  assert.strictEqual(res.status, 0, res.stderr)
  assert.match(res.stdout, /via interpolation template/)
})

test('JSX text run with an expression hole matches a composite string', () => {
  const f = fixture({
    strings: ['Invited May 3', 'May 3'],
    files: { 'src/S1.tsx': '<span>Invited {invitedAt}</span>; const at = "May 3"' },
  })
  assert.strictEqual(run(f).status, 0, run(f).stderr)
})

test('a pure-hole template excuses nothing — shortened copy still fails', () => {
  const f = fixture({
    strings: ['Send invite'],
    // `${label}` and {label} have no static segment: matching them would reopen the paraphrase hole
    files: { 'src/S1.tsx': 'const t = `${label}`; <Button>{label}</Button><Button>Send</Button>' },
  })
  const res = run(f)
  assert.strictEqual(res.status, 1)
  assert.match(res.stderr, /Send invite/)
})

test('templates are anchored: a non-hole edge cannot swallow extra mock copy', () => {
  const f = fixture({
    strings: ['Send invite'],
    // template `invite ${n}` matches "invite …" only from the start — not "Send invite"
    files: { 'src/S1.tsx': 'const t = `invite ${n}`' },
  })
  assert.strictEqual(run(f).status, 1)
})

test('bare instance data appearing nowhere in the pass still fails', () => {
  const f = fixture({
    strings: ['Jamie Chen'],
    files: { 'src/S1.tsx': 'const a = `Remove ${member.name}`' }, // template exists, fixture forgotten
  })
  const res = run(f)
  assert.strictEqual(res.status, 1)
  assert.match(res.stderr, /Jamie Chen/)
})
