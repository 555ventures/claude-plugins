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
  fs.writeFileSync(path.join(root, 'index.html'), '<script type="module" src="/src/main.tsx"></script>\n')
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

// A stand-in dev app on a free port; prototype.url is pointed at it so `opened` finds it listening.
async function startApp(t, root) {
  const port = await freePort()
  const child = spawn(process.execPath, ['-e', `require('http').createServer((q, s) => s.end('app')).listen(${port}, '127.0.0.1', () => console.log('up'))`], { stdio: ['ignore', 'pipe', 'inherit'] })
  t.after(() => child.kill('SIGKILL'))
  await new Promise((resolve) => child.stdout.on('data', resolve))
  const url = `http://127.0.0.1:${port}`
  const cfg = path.join(root, '.claude/spec.config.json')
  fs.writeFileSync(cfg, JSON.stringify({ ...JSON.parse(fs.readFileSync(cfg, 'utf8')), prototype: { url, bootCommand: 'npm run dev', overlay: 'src/main.tsx' } }))
  return url
}

const post = (url, body) => fetch(url + '/pin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

test('full chain: words → OPEN → ROUND → pins → approve → contract + queue → closed', async (t) => {
  const { root, g } = host()
  const app = await startApp(t, root)
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
  assert.ok(drive(root, [stem]).stdout.includes(`🎨 ready for pins — ${app}`))

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
  r = drive(root, [stem])
  assert.match(r.stdout, /pins\.json/)
  assert.match(r.stdout, /now: p1, p2, p3/, 'the round names every unhandled pin')

  // a change round records its pins as handled, then approve
  assert.strictEqual(mark(root, stem, 'round-done').status, 0)
  assert.deepStrictEqual(json(root, `design/prototypes/${stem}/status.json`).handled, ['p1', 'p2', 'p3'])
  assert.strictEqual(json(root, `design/prototypes/${stem}/status.json`).rounds, 1)
  r = drive(root, [stem])
  assert.match(r.stdout, /Round 2/)
  assert.match(r.stdout, /now: none/)
  assert.strictEqual(mark(root, stem, 'contracted').status, 2, 'not approved yet')
  assert.strictEqual(mark(root, stem, 'approved').status, 0)
  assert.strictEqual(drive(root, [stem, '--state']).stdout.trim(), 'APPROVED')
  assert.match(drive(root, [stem]).stdout, /Approved after 2 round\(s\)/, 'the approving round counts: Round 2 → 2 rounds')
  r = mark(root, stem, 'contracted')
  assert.strictEqual(r.status, 0, r.stderr)

  const contract = json(root, `design/prototypes/${stem}/contract.json`)
  assert.deepStrictEqual(Object.keys(contract), ['stem', 'rounds', 'pins'])
  assert.strictEqual(contract.stem, stem)
  assert.strictEqual(contract.rounds, 2)
  assert.deepStrictEqual(contract.pins[0], { id: 'p1', kind: 'behaviour', route: '/invoices', selector: '#del', note: 'Delete asks confirmation.', sentence: 'On /invoices: Delete asks confirmation.' })
  assert.deepStrictEqual(contract.pins[1], { id: 'p2', kind: 'look', route: '/invoices', note: 'Bigger title', sentence: 'On /invoices: Bigger title' })
  assert.strictEqual(g('log', '-1', '--format=%s'), `chore(proto): contract ${stem}\n`, 'the contract is committed on trunk')
  assert.strictEqual(g('status', '--porcelain', '--', 'design').trim(), '', 'nothing of the stem is left uncommitted')
  const q = JSON.parse(fs.readFileSync(path.join(root, '.git/spec-queue.json'), 'utf8'))
  assert.deepStrictEqual(q.items.map((i) => [i.kind, i.type, i.payload]), [['prompt', 'plan', `design/prototypes/${stem}/contract.json`]])
  assert.strictEqual(mark(root, stem, 'contracted').status, 2, 'a second contracted is out of step')
  assert.strictEqual(drive(root, [stem, '--state']).stdout.trim(), 'CONTRACTED')

  // close removes worktree and branch, warning that the queued plan is still pending
  r = mark(root, stem, 'closed')
  assert.strictEqual(r.status, 0, r.stderr)
  assert.match(r.stdout, /⚠️ \/spec:plan design\/prototypes\/invoice-list-page\/contract\.json is still pending/)
  assert.ok(!fs.existsSync(wt))
  assert.strictEqual(g('branch', '--list', 'proto/' + stem).trim(), '')
  assert.strictEqual(drive(root, [stem, '--state']).stdout.trim(), 'CLOSED')
})

test('a roadmap brief path gives the stem; contracting with no pins is refused; closed works from ROUND', async (t) => {
  const { root, g } = host()
  await startApp(t, root)
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
  const c = mark(root, '03-invoices', 'closed')
  assert.strictEqual(c.status, 0)
  assert.doesNotMatch(c.stdout, /⚠️/, 'nothing was queued, nothing to warn about')
  assert.strictEqual(g('branch', '--list', 'proto/03-invoices').trim(), '')
})

test('the auto stem takes the first four significant words of the idea', () => {
  const { root } = host()
  const r = runNode(SCRIPT, ['a', 'page', 'for', 'the', 'invoices', 'with', 'a', 'delete', 'button', 'and', 'totals', '--root', root])
  assert.match(r.stdout, /Auto-picked stem page-invoices-delete-button /)
})

test('OPEN warns about an entry that is not a browser file; opened refuses when nothing listens', () => {
  const { root } = host()
  const cfg = path.join(root, '.claude/spec.config.json')
  const setCfg = (prototype) => fs.writeFileSync(cfg, JSON.stringify({ prototype }))
  setCfg({ url: 'http://127.0.0.1:9', overlay: 'server.js' })
  let r = drive(root, ['idea', '--stem', 'srv'])
  assert.match(r.stdout, /⚠️ server\.js is not a \.tsx\/\.jsx\/\.ts\/\.js file under src\/.*Ask the user/)
  assert.ok(!fs.existsSync(path.join(root, '.claude/worktrees/proto-srv')), 'no worktree on a guessed entry')
  fs.writeFileSync(path.join(root, 'src/server.js'), "const http = require('node:http')\n")
  setCfg({ url: 'http://127.0.0.1:9', overlay: 'src/server.js' })
  assert.match(drive(root, ['srv']).stdout, /⚠️ src\/server\.js is a server file/)
  assert.strictEqual(mark(root, 'srv', 'opened').status, 2)

  setCfg({ url: 'http://127.0.0.1:9', overlay: 'src/main.tsx' }) // port 9: nothing listens
  assert.match(drive(root, ['srv']).stdout, /proto-overlay/)
  fs.appendFileSync(path.join(root, '.claude/worktrees/proto-srv/src/main.tsx'), "import('./proto-overlay.js')\n")
  r = mark(root, 'srv', 'opened')
  assert.strictEqual(r.status, 2)
  assert.match(r.stderr, /nothing answers at http:\/\/127\.0\.0\.1:9 — start the app/)
})

test('--stem overrides the derived stem and a bad stem is refused', () => {
  const { root } = host()
  assert.match(drive(root, ['some', 'idea', '--stem', 'mine']).stdout, /proto-overlay/)
  assert.ok(fs.existsSync(path.join(root, 'design/prototypes/mine/status.json')))
  assert.strictEqual(drive(root, ['x', '--stem', 'Bad Stem']).status, 2)
})

test('serve accepts pins only from pages on this machine', async (t) => {
  const { root } = host()
  const url = await startServe(t, root, 'origin-check')
  const pin = JSON.stringify({ pins: [{ kind: 'behaviour', route: '/x', note: 'n' }] })
  const from = (origin) => fetch(url + '/pin', { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: pin })
  let res = await from('https://evil.example')
  assert.strictEqual(res.status, 403, 'another site cannot write pins')
  res = await fetch(url + '/pin', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } })
  assert.strictEqual(res.headers.get('access-control-allow-origin'), null, 'nor pass the preflight')
  res = await from('http://localhost:5173')
  assert.strictEqual(res.status, 201, 'the local dev app can')
  assert.strictEqual(res.headers.get('access-control-allow-origin'), 'http://localhost:5173')
  res = await fetch(url + '/pin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'x'.repeat(1100000) })
  assert.strictEqual(res.status, 413, 'an oversized body is refused')
  assert.strictEqual((await (await fetch(url + '/pins')).json()).length, 1)
})
