'use strict'
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { tmpdir, gitRepo, runNode, freePort, SPEC } = require('./helpers')

const SCRIPT = path.join(SPEC, 'scripts/prototype.js')

function host() {
  const root = tmpdir('proto')
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  fs.mkdirSync(path.join(root, '.claude'))
  fs.writeFileSync(path.join(root, 'src/main.tsx'), 'console.log("app")\n')
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify({ prototype: { url: 'http://localhost:5173', bootCommand: 'npm run dev', overlay: 'src/main.tsx' } }))
  const g = gitRepo(root) // a non-empty dir is seeded and committed as it stands
  return { root, g }
}

const drive = (root, args) => runNode(SCRIPT, [...args, '--root', root])
const mark = (root, stem, verb) => drive(root, [stem, '--mark', verb])
const json = (root, rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'))

async function startServe(t, root, stem) {
  const port = await freePort()
  const child = spawn(process.execPath, [SCRIPT, 'serve', '--stem', stem, '--port', String(port), '--root', root], { stdio: ['ignore', 'pipe', 'inherit'] })
  t.after(() => child.kill('SIGKILL'))
  await new Promise((resolve) => child.stdout.on('data', resolve))
  return `http://127.0.0.1:${port}`
}

const post = (url, body) => fetch(url + '/pin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

test('full chain: words → OPEN → ROUND → pins → approve → contract + queue → closed', async (t) => {
  const { root, g } = host()
  // OPEN: the idea words are rejoined into a stem; the worktree and overlay appear
  let r = runNode(SCRIPT, ['invoice', 'list', 'page', '--root', root])
  assert.strictEqual(r.status, 0, r.stderr)
  assert.match(r.stdout, /^▶ OPEN/)
  assert.match(r.stdout, /Auto-picked stem invoice-list-page/)
  const stem = 'invoice-list-page'
  const wt = path.join(root, '.claude/worktrees/proto-' + stem)
  assert.match(g('branch', '--list', 'proto/' + stem), /proto\//)
  const overlay = fs.readFileSync(path.join(wt, 'src/proto-overlay.js'), 'utf8')
  assert.ok(overlay.includes('http://127.0.0.1:') && !overlay.includes('__PIN_ENDPOINT__'))
  // opened is refused until the entry imports the overlay
  assert.strictEqual(mark(root, stem, 'opened').status, 2)
  fs.appendFileSync(path.join(wt, 'src/main.tsx'), "if (import.meta.env.DEV) import('./proto-overlay.js')\n")
  r = mark(root, stem, 'opened')
  assert.strictEqual(r.status, 0, r.stderr)
  assert.match(r.stdout, /OPEN → ROUND/)
  assert.match(drive(root, [stem]).stdout, /🎨 ready for pins — http:\/\/localhost:5173/)

  // a fake pin POST against serve on a free port
  const url = await startServe(t, root, stem)
  let res = await post(url, { pins: [{ kind: 'behaviour', route: '/invoices', selector: '#del', note: 'Delete asks confirmation.' }, { kind: 'look', route: '/invoices', note: 'Bigger title' }] })
  assert.strictEqual(res.status, 201)
  assert.deepStrictEqual((await res.json()).ids, ['p1', 'p2'])
  res = await post(url, { pins: [{ kind: 'behaviour', route: '/invoices', note: 'ok' }, { kind: 'nope', route: '/x', note: 'bad' }] })
  assert.strictEqual(res.status, 400)
  assert.strictEqual((await (await fetch(url + '/pins')).json()).length, 2, 'one bad pin writes nothing')
  res = await post(url, { pins: [{ kind: 'behaviour', route: '/invoices/new', note: 'Totals update live' }] })
  assert.deepStrictEqual((await res.json()).ids, ['p3'])

  // a change round, then approve
  assert.strictEqual(mark(root, stem, 'round-done').status, 0)
  assert.strictEqual(json(root, `design/prototypes/${stem}/status.json`).rounds, 1)
  assert.match(drive(root, [stem]).stdout, /Round 2/)
  assert.strictEqual(mark(root, stem, 'contracted').status, 2, 'not approved yet')
  assert.strictEqual(mark(root, stem, 'approved').status, 0)
  assert.strictEqual(drive(root, [stem, '--state']).stdout.trim(), 'APPROVED')
  r = mark(root, stem, 'contracted')
  assert.strictEqual(r.status, 0, r.stderr)

  const contract = json(root, `design/prototypes/${stem}/contract.json`)
  assert.deepStrictEqual(Object.keys(contract), ['stem', 'rounds', 'pins'])
  assert.strictEqual(contract.stem, stem)
  assert.strictEqual(contract.rounds, 1)
  assert.deepStrictEqual(contract.pins[0], { id: 'p1', kind: 'behaviour', route: '/invoices', selector: '#del', note: 'Delete asks confirmation.', sentence: 'When /invoices, Delete asks confirmation.' })
  assert.deepStrictEqual(contract.pins[1], { id: 'p2', kind: 'look', route: '/invoices', note: 'Bigger title', sentence: 'When /invoices, Bigger title.' })
  const q = JSON.parse(fs.readFileSync(path.join(root, '.git/spec-queue.json'), 'utf8'))
  assert.deepStrictEqual(q.items.map((i) => i.payload), [`/spec:plan design/prototypes/${stem}/contract.json`])
  assert.strictEqual(mark(root, stem, 'contracted').status, 2, 'a second contracted is out of step')
  assert.strictEqual(drive(root, [stem, '--state']).stdout.trim(), 'CONTRACTED')

  // close removes worktree and branch
  r = mark(root, stem, 'closed')
  assert.strictEqual(r.status, 0, r.stderr)
  assert.ok(!fs.existsSync(wt))
  assert.strictEqual(g('branch', '--list', 'proto/' + stem).trim(), '')
  assert.strictEqual(drive(root, [stem, '--state']).stdout.trim(), 'CLOSED')
})

test('a roadmap brief path gives the stem; contracting with no pins is refused; closed works from ROUND', () => {
  const { root, g } = host()
  fs.mkdirSync(path.join(root, 'docs/roadmap'), { recursive: true })
  fs.writeFileSync(path.join(root, 'docs/roadmap/03-invoices.md'), '# 03\n')
  const brief = 'docs/roadmap/03-invoices.md'
  assert.match(drive(root, [brief]).stdout, /▶ OPEN/)
  const wt = path.join(root, '.claude/worktrees/proto-03-invoices')
  fs.appendFileSync(path.join(wt, 'src/main.tsx'), "import('./proto-overlay.js')\n")
  assert.strictEqual(mark(root, '03-invoices', 'opened').status, 0)
  assert.strictEqual(mark(root, '03-invoices', 'approved').status, 0)
  const r = mark(root, '03-invoices', 'contracted')
  assert.strictEqual(r.status, 2)
  assert.match(r.stderr, /no pins/)
  assert.strictEqual(mark(root, '03-invoices', 'closed').status, 0)
  assert.strictEqual(g('branch', '--list', 'proto/03-invoices').trim(), '')
})

test('--stem overrides the derived stem and a bad stem is refused', () => {
  const { root } = host()
  assert.match(drive(root, ['some', 'idea', '--stem', 'mine']).stdout, /proto-overlay/)
  assert.ok(fs.existsSync(path.join(root, 'design/prototypes/mine/status.json')))
  assert.strictEqual(drive(root, ['x', '--stem', 'Bad Stem']).status, 2)
})
