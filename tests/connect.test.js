'use strict'
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { tmpdir, gitRepo, runNode } = require('./helpers')

const STUB = path.join(__dirname, 'fixtures', 'stub-service.js')
const MINTED = 'wt_3f9a1c0de4b7a2c5'
const HELLO = { status: 200, body: { apiVersion: 1, revision: 2, sunset: null } }
const APPROVALS = { status: 200, body: { apiVersion: 1, approvals: [] } }

async function startStub(t, answers) {
  const dir = tmpdir('stub')
  fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify(answers))
  fs.writeFileSync(path.join(dir, 'log.jsonl'), '')
  const child = spawn(process.execPath, [STUB, '0', path.join(dir, 'a.json'), path.join(dir, 'log.jsonl')], { stdio: ['ignore', 'pipe', 'inherit'] })
  t.after(() => child.kill('SIGKILL'))
  const port = await new Promise((resolve) => child.stdout.on('data', (d) => { const m = /PORT (\d+)/.exec(d); if (m) resolve(Number(m[1])) }))
  return { url: 'http://127.0.0.1:' + port, log: () => fs.readFileSync(path.join(dir, 'log.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) }
}

// A fake `npx walkthrough-cli` that logs its argv and answers whoami/new/token.
function fakeNpx(service) {
  const dir = tmpdir('npx')
  const calls = path.join(dir, 'calls.log')
  fs.writeFileSync(path.join(dir, 'npx'), `#!${process.execPath}
const fs = require('fs')
const argv = process.argv.slice(4)
fs.appendFileSync(${JSON.stringify(calls)}, argv[0] + '\\n')
if (argv[0] === 'whoami') console.log(JSON.stringify({ service: ${JSON.stringify(service)} }))
else if (argv[0] === 'new') console.log(JSON.stringify({ id: 'x' }))
else if (argv[0] === 'token') console.log(JSON.stringify({ id: 1, token: ${JSON.stringify(MINTED)} }))
`, { mode: 0o755 })
  return { dir, verbs: () => (fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8').split('\n').filter(Boolean) : []) }
}

function host(name) {
  const dir = path.join(tmpdir('connect'), name)
  gitRepo(dir, { empty: true })
  return dir
}

const connect = (root, args, npx) => runNode('scripts/connect.js', [...args, '--root', root], {
  env: { GIT_CONFIG_GLOBAL: '/dev/null', XDG_CONFIG_HOME: tmpdir('xdg'), PATH: (npx ? npx.dir + path.delimiter : '') + process.env.PATH, WALKTHROUGH_TOKEN: undefined },
})

test('connect creates the project, stores the token ignored, writes the block, proves the link', async (t) => {
  const stub = await startStub(t, { 'GET /v1': [HELLO], 'GET /v1/projects/acme-shop/approvals': [APPROVALS] })
  const root = host('acme-shop')
  const npx = fakeNpx(stub.url)
  const r = connect(root, [], npx)
  assert.strictEqual(r.status, 0, r.stderr)
  assert.strictEqual(r.stdout, `connected acme-shop → ${stub.url}/p/acme-shop (new project)\nnext: /spec:mocks\n`)
  assert.deepStrictEqual(npx.verbs(), ['whoami', 'new', 'token'])
  const settings = JSON.parse(fs.readFileSync(path.join(root, '.claude/settings.local.json'), 'utf8'))
  assert.strictEqual(settings.env.WALKTHROUGH_TOKEN, MINTED)
  assert.ok(fs.readFileSync(path.join(root, '.gitignore'), 'utf8').includes('.claude/settings.local.json'))
  const cfg = JSON.parse(fs.readFileSync(path.join(root, '.claude/spec.config.json'), 'utf8'))
  assert.deepStrictEqual(cfg.walkthrough, { baseUrl: stub.url, project: 'acme-shop', tokenEnv: 'WALKTHROUGH_TOKEN' })
  assert.ok(!r.stdout.includes(MINTED) && !r.stderr.includes(MINTED))
  const auth = stub.log().filter((l) => l.url.includes('approvals')).map((l) => l.headers.authorization)
  assert.deepStrictEqual(auth, ['Bearer ' + MINTED])
})

test('a connected project with a working token calls walkthrough-cli zero times', async (t) => {
  const stub = await startStub(t, { 'GET /v1': [HELLO], 'GET /v1/projects/acme-shop/approvals': [APPROVALS] })
  const root = host('acme-shop')
  fs.mkdirSync(path.join(root, '.claude'))
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify({ walkthrough: { baseUrl: stub.url, project: 'acme-shop', tokenEnv: 'WALKTHROUGH_TOKEN' } }))
  fs.writeFileSync(path.join(root, '.claude/settings.local.json'), JSON.stringify({ env: { WALKTHROUGH_TOKEN: MINTED } }))
  const npx = fakeNpx('unused')
  const r = connect(root, [], npx)
  assert.strictEqual(r.status, 0, r.stderr)
  assert.match(r.stdout, /\(already connected\)/)
  assert.deepStrictEqual(npx.verbs(), [])
})

test('--project and --base-url are used, and a refused token is exit 1 with a remedy', async (t) => {
  const stub = await startStub(t, { 'GET /v1': [HELLO], 'GET /v1/projects/p1/approvals': [{ status: 401, body: { error: 'bad-token', detail: 'no', apiVersion: 1 } }] })
  const root = host('whatever')
  const npx = fakeNpx('unused')
  const r = connect(root, ['--project', 'p1', '--base-url', stub.url], npx)
  assert.strictEqual(r.status, 1)
  assert.match(r.stderr, /bad-token.*remedy/)
  assert.deepStrictEqual(npx.verbs(), ['new', 'token'], 'with --base-url whoami is not needed')
  assert.ok(!fs.existsSync(path.join(root, '.claude/spec.config.json')), 'no block is written when the proof fails')
})

test('a bad flag is a usage refusal', () => {
  const r = connect(host('x'), ['--bogus', '1'])
  assert.strictEqual(r.status, 2)
})
