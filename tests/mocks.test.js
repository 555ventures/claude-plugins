'use strict'
const test = require('node:test')
const assert = require('node:assert')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { tmpdir, gitRepo, runNode } = require('./helpers')

const STUB = path.join(__dirname, 'fixtures', 'stub-service.js')
const SEED = `# Seed

## Product

A tiny shop for sharing results. For teams. It invites people.

## Journeys

### invite-teammate
When I just signed up, I want to add my team, so I can start sharing results.
1. "I open the app" -> home
2. "I see nothing here yet" -> roster@first-run
3. "I send the invite" -> invite-sent
`
const screen = (to) => ({
  root: 'page',
  elements: {
    page: { type: 'Stack', props: { gap: 16 }, children: ['title', ...(to ? ['go'] : [])] },
    title: { type: 'Heading', props: { text: 'Hello', level: 1 }, children: [] },
    ...(to ? { go: { type: 'Button', props: { label: 'Next' }, children: [], on: { press: { action: 'navigate', params: { to } } } } } : {}),
  },
})

function host(config) {
  const root = tmpdir('mocks')
  if (config) { fs.mkdirSync(path.join(root, '.claude')); fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify(config)) }
  gitRepo(root)
  return root
}
const drive = (root, args = []) => runNode('scripts/mocks.js', [...args, '--root', root])
const write = (root, rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), typeof text === 'string' ? text : JSON.stringify(text)) }
const drawAll = (root) => {
  write(root, 'design/mocks/screens/home.json', screen('roster@first-run'))
  write(root, 'design/mocks/screens/roster@first-run.json', screen('invite-sent'))
  write(root, 'design/mocks/screens/invite-sent.json', screen(null))
}
const beatsHash = () => crypto.createHash('sha256').update('I open the app -> home\nI see nothing here yet -> roster@first-run\nI send the invite -> invite-sent').digest('hex').slice(0, 12)

test('terminal mode: SEED → SCREENS → APPROVED', () => {
  const root = host()
  let r = drive(root)
  assert.match(r.stdout, /^▶ SEED/)
  assert.ok(fs.existsSync(path.join(root, 'design/mocks/seed.md')), 'the template seed is written')
  assert.strictEqual(drive(root, ['--mark', 'seed-done']).status, 2, 'placeholders are refused')

  write(root, 'design/mocks/seed.md', SEED)
  r = drive(root, ['--mark', 'seed-done'])
  assert.strictEqual(r.status, 0, r.stderr)
  assert.match(r.stdout, /SEED → SCREENS/)
  assert.match(drive(root).stdout, /journey-drawn --journey invite-teammate/)
  assert.strictEqual(drive(root, ['--mark', 'approved']).status, 2, 'nothing drawn yet')

  write(root, 'design/mocks/screens/home.json', screen('invite-sent')) // wrong target: no control to roster
  write(root, 'design/mocks/screens/roster@first-run.json', screen('invite-sent'))
  write(root, 'design/mocks/screens/invite-sent.json', screen(null))
  r = drive(root, ['--mark', 'journey-drawn', '--journey', 'invite-teammate'])
  assert.strictEqual(r.status, 2)
  assert.match(r.stderr, /home has no control/)
  drawAll(root)
  r = drive(root, ['--mark', 'journey-drawn', '--journey', 'invite-teammate'])
  assert.strictEqual(r.status, 0, r.stderr)
  r = drive(root)
  assert.match(r.stdout, /approve all, or name the ones to change/)
  assert.doesNotMatch(r.stdout, /ready for review/)

  r = drive(root, ['--mark', 'approved'])
  assert.strictEqual(r.status, 0, r.stderr)
  assert.strictEqual(drive(root, ['--state']).stdout.trim(), 'APPROVED')
  r = drive(root)
  assert.match(r.stdout, /✅ wireframe approved — 1 journeys/)
  assert.match(r.stdout, /Next: \/spec:genesis/)
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(root, 'design/mocks/status.json'), 'utf8')).marks.approved.length > 0, true)
})

test('editing a drawn journey\'s beats makes it pending again', () => {
  const root = host()
  write(root, 'design/mocks/seed.md', SEED)
  drive(root, ['--mark', 'seed-done'])
  drawAll(root)
  drive(root, ['--mark', 'journey-drawn', '--journey', 'invite-teammate'])
  write(root, 'design/mocks/seed.md', SEED.replace('I send the invite', 'I send it'))
  assert.strictEqual(drive(root, ['--mark', 'approved']).status, 2)
})

test('a malformed seed is refused with each defect named', () => {
  const root = host()
  write(root, 'design/mocks/seed.md', '### j1\n1. "a" -> home\n### j2\nWhen x, I want y, so I can z.\n1. "a" -> home\n3. no quotes -> x\n')
  const r = drive(root, ['--mark', 'seed-done'])
  assert.strictEqual(r.status, 2)
  assert.match(r.stderr, /job story/)
  assert.match(r.stderr, /malformed beat/)
})

async function startStub(t, answers) {
  const dir = tmpdir('stub')
  fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify(answers))
  fs.writeFileSync(path.join(dir, 'log.jsonl'), '')
  const child = spawn(process.execPath, [STUB, '0', path.join(dir, 'a.json'), path.join(dir, 'log.jsonl')], { stdio: ['ignore', 'pipe', 'inherit'] })
  t.after(() => child.kill('SIGKILL'))
  const port = await new Promise((resolve) => child.stdout.on('data', (d) => { const m = /PORT (\d+)/.exec(d); if (m) resolve(Number(m[1])) }))
  return { url: 'http://127.0.0.1:' + port, log: () => fs.readFileSync(path.join(dir, 'log.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) }
}

test('service mode: push prints the link, approved needs the client\'s confirmation on the current beats', async (t) => {
  const approval = { journey: 'invite-teammate', by: 'client', round: 1, beats: beatsHash(), at: '2026-11-04T10:00:00Z' }
  const stub = await startStub(t, {
    'GET /v1': [{ status: 200, body: { apiVersion: 1, revision: 2, sunset: null } }],
    'POST /v1/projects/shop/rounds': [{ status: 201, body: { apiVersion: 1, round: 1, status: 'open' } }],
    'GET /v1/projects/shop/notes': [{ status: 200, body: { apiVersion: 1, notes: [{ id: 'n1', status: 'open', screen: 'home', text: 'Move it', at: 'a' }], journeys: [], cursor: 'c1' } }],
    'GET /v1/projects/shop/approvals': [{ status: 200, body: { apiVersion: 1, approvals: [] } }, { status: 200, body: { apiVersion: 1, approvals: [approval] } }],
  })
  const root = host({ walkthrough: { baseUrl: stub.url, project: 'shop', tokenEnv: 'SHOP_TOKEN' } })
  const env = { SHOP_TOKEN: 'tok_0123456789abcdef0123456789abcdef' }
  const run = (args) => runNode('scripts/mocks.js', [...args, '--root', root], { env })
  write(root, 'design/mocks/seed.md', SEED)
  run(['--mark', 'seed-done'])
  drawAll(root)
  run(['--mark', 'journey-drawn', '--journey', 'invite-teammate'])
  assert.match(run([]).stdout, /mocks\.js push/)

  let r = run(['push'])
  assert.strictEqual(r.status, 0, r.stderr)
  assert.match(r.stdout, new RegExp(`🎨 ready for review — ${stub.url}/p/shop`))
  const posted = stub.log().find((l) => l.method === 'POST')
  assert.strictEqual(posted.json.journeys[0].beats, beatsHash())
  assert.strictEqual(posted.json.screens.length, 3)
  assert.strictEqual(posted.headers.authorization, 'Bearer ' + env.SHOP_TOKEN)
  assert.match(run([]).stdout, /mocks\.js pull/)

  r = run(['pull'])
  assert.strictEqual(r.status, 0, r.stderr)
  assert.match(r.stdout, /waiting n1 \(home\): Move it/)
  assert.match(r.stdout, /invite-teammate: not confirmed/)
  assert.strictEqual(run(['--mark', 'approved']).status, 2, 'not confirmed yet')

  r = run(['pull'])
  assert.match(r.stdout, /invite-teammate: confirmed\n/)
  assert.strictEqual(run(['--mark', 'approved']).status, 0)
  assert.match(run([]).stdout, /wireframe approved — 1 journeys/)
})
