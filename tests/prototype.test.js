'use strict'
// Pins spec/scripts/prototype.js: OPEN → ROUND → APPROVED → CONTRACTED → CLOSED on tmp hosts with a
// stub app (a node http server on the port OPEN allocated). Spec 20261105/14, AC-1 to AC-7.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const net = require('node:net')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { tmpdir, gitRepo, runNode, SPEC } = require('./helpers')

const SCRIPT = path.join(SPEC, 'scripts/prototype.js')
const STEM = 'invoice-list-page'

// A host with no src/, no index.html: only the url and the boot command.
function host(extra = {}, proto = {}) {
  const root = tmpdir('proto')
  fs.mkdirSync(path.join(root, '.claude'))
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify({ prototype: { url: 'http://127.0.0.1:{port}', bootCommand: 'node app.js', ...proto }, ...extra }))
  const g = gitRepo(root) // a non-empty dir is seeded and committed as it stands
  return { root, g }
}

const drive = (root, args) => runNode(SCRIPT, [...args, '--root', root])
const mark = (root, stem, verb, ...more) => drive(root, [stem, '--mark', verb, ...more])
const pin = (root, stem, ...a) => drive(root, [stem, 'pin', ...a])
const read = (root, rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'))
const statusOf = (root, stem = STEM) => read(root, `design/prototypes/${stem}/status.json`)
const ok = (r) => { assert.strictEqual(r.status, 0, r.stderr + r.stdout); return r.stdout }

// A stub app on the port OPEN allocated; resolves once it answers. stop() frees the port.
async function startApp(t, port) {
  const child = spawn(process.execPath, ['-e', `require('http').createServer((q, s) => s.end('app')).listen(${port}, '127.0.0.1', () => console.log('up'))`], { stdio: ['ignore', 'pipe', 'inherit'] })
  t.after(() => child.kill('SIGKILL'))
  await new Promise((resolve) => child.stdout.on('data', resolve))
  return { stop: () => new Promise((resolve) => { child.once('exit', resolve); child.kill('SIGKILL') }) }
}

const canBind = (port) => new Promise((resolve) => {
  const s = net.createServer()
  s.on('error', () => resolve(false))
  s.listen(port, '127.0.0.1', () => s.close(() => resolve(true)))
})

// Idea words → OPEN → stub app up → opened. Returns the app handle and the port.
async function opened(t, h) {
  ok(drive(h.root, ['invoice', 'list', 'page']))
  const st = statusOf(h.root)
  const app = await startApp(t, st.appPort)
  ok(mark(h.root, STEM, 'opened'))
  return { app, port: st.appPort, url: st.url }
}

// Two pins on /invoices and one on /invoices/new, then approved at round 2.
async function approved(t, h) {
  const o = await opened(t, h)
  ok(pin(h.root, STEM, '--kind', 'behaviour', '--route', '/invoices', '--given', 'an unpaid invoice', '--note', 'Delete asks for confirmation'))
  ok(pin(h.root, STEM, '--kind', 'look', '--route', '/invoices', '--note', 'Bigger title'))
  ok(mark(h.root, STEM, 'round-done'))
  ok(pin(h.root, STEM, '--kind', 'behaviour', '--route', '/invoices/new', '--note', 'Totals update live'))
  ok(mark(h.root, STEM, 'approved'))
  return o
}

test('AC-1: OPEN needs no entry file: auto stem, one free port, boot line, worktree with the setup marker', async (t) => {
  const h = host({ setupCommand: 'echo ready > marker.txt' })
  assert.ok(!fs.existsSync(path.join(h.root, 'src')) && !fs.existsSync(path.join(h.root, 'index.html')))
  const r = drive(h.root, ['invoice', 'list', 'page'])
  const out = ok(r)
  assert.match(out, /^▶ OPEN/)
  assert.match(out, new RegExp(`📌 Auto-picked stem ${STEM} `))
  assert.doesNotMatch(out, /overlay|entry/i, 'no line about an entry file or overlay')
  const boot = /cd \.claude\/worktrees\/proto-invoice-list-page && export PORT=(\d+) && node app\.js/.exec(out)
  assert.ok(boot, out)
  const port = Number(boot[1])
  assert.ok(await canBind(port), 'a port nothing was bound to')
  assert.match(out, /Build a throwaway prototype of invoice list page/)
  const wt = path.join(h.root, '.claude/worktrees/proto-' + STEM)
  assert.match(h.g('branch', '--list', 'proto/' + STEM), /proto\//)
  assert.strictEqual(fs.readFileSync(path.join(wt, 'marker.txt'), 'utf8'), 'ready\n', 'setupCommand ran in the worktree')
  const st = statusOf(h.root)
  assert.strictEqual(st.appPort, port)
  assert.strictEqual(st.url, `http://127.0.0.1:${port}`)
  assert.strictEqual('pinsPort' in st, false)

  const refused = mark(h.root, STEM, 'opened')
  assert.strictEqual(refused.status, 2)
  assert.ok(refused.stderr.includes(`nothing answers at http://127.0.0.1:${port}`), refused.stderr)
  await startApp(t, port)
  assert.match(ok(mark(h.root, STEM, 'opened')), /OPEN → ROUND/)
})

test('AC-1: the printed boot line, run by sh from the repo root, expands $PORT in bootCommand', async () => {
  const h = host({}, { bootCommand: 'echo "--port $PORT" > port.txt' })
  const out = ok(drive(h.root, ['invoice', 'list', 'page']))
  const line = out.split('\n').map((l) => l.trim()).find((l) => l.includes('export PORT='))
  assert.ok(line, out)
  const cmd = /(cd \.claude\/worktrees\/\S+ && export PORT=\d+ && echo "--port \$PORT" > port\.txt)/.exec(line)
  assert.ok(cmd, line)
  const r = require('node:child_process').spawnSync('sh', ['-c', cmd[1]], { cwd: h.root, encoding: 'utf8' })
  assert.strictEqual(r.status, 0, r.stderr)
  const port = statusOf(h.root).appPort
  assert.strictEqual(fs.readFileSync(path.join(h.root, '.claude/worktrees/proto-' + STEM, 'port.txt'), 'utf8'), `--port ${port}\n`)
})

test('AC-1: a failing setupCommand refuses with the tail; a fixed url that already answers is refused', async (t) => {
  let h = host({ setupCommand: 'echo boom >&2; exit 3' })
  let r = drive(h.root, ['some', 'idea'])
  assert.strictEqual(r.status, 1)
  assert.match(r.stderr, /setupCommand failed[\s\S]*boom/)

  const port = await new Promise((resolve) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)) }) })
  const other = await startApp(t, port) // JJ's unrelated app on a fixed port
  h = host({}, { url: `http://127.0.0.1:${port}` })
  r = drive(h.root, ['some', 'idea'])
  assert.strictEqual(r.status, 2)
  assert.ok(r.stderr.includes(`something already answers at http://127.0.0.1:${port} and it is not this app — stop it, or put {port} in prototype.url`), r.stderr)
  await other.stop()
  const out = ok(drive(h.root, ['some', 'idea']))
  assert.ok(out.includes(`cd .claude/worktrees/proto-some-idea && node app.js`) && !out.includes('PORT='), 'a fixed url carries no PORT=')
  assert.strictEqual(statusOf(h.root, 'some-idea').appPort, null)
})

test('AC-2: ROUND prints the ready line only when the app answers', async (t) => {
  const h = host()
  const { app, url, port } = await opened(t, h)
  await app.stop()
  let out = ok(drive(h.root, [STEM]))
  assert.ok(out.includes(`⚠️ nothing answers at ${url}`), out)
  assert.ok(out.includes(`cd .claude/worktrees/proto-${STEM} && export PORT=${port} && node app.js`))
  assert.ok(!out.includes('🎨 ready for pins'))
  await startApp(t, port)
  out = ok(drive(h.root, [STEM]))
  assert.match(out, /Round 1\./)
  assert.match(out, /none yet/)
  assert.ok(out.split('\n').some((l) => l.includes(`🎨 ready for pins — ${url}`)))
  assert.ok(out.includes('--kind') && out.includes('--route') && out.includes('--given') && out.includes('--note'))
  assert.match(out, /END YOUR TURN/)
})

test('AC-3: pin writes the array, refuses bad input, round-done records handled', async (t) => {
  const h = host()
  await opened(t, h)
  const r = ok(pin(h.root, STEM, '--kind', 'behaviour', '--route', '/invoices', '--given', 'an unpaid invoice', '--note', 'Delete asks for confirmation'))
  assert.strictEqual(r, '📌 p1 (behaviour) On /invoices, given an unpaid invoice: Delete asks for confirmation\n')
  ok(pin(h.root, STEM, '--kind', 'look', '--route', '/invoices', '--note', 'Bigger title'))
  const pins = read(h.root, `design/prototypes/${STEM}/pins.json`)
  assert.ok(Array.isArray(pins))
  const { at: at1, ...p1 } = pins[0]
  const { at: at2, ...p2 } = pins[1]
  assert.ok(!Number.isNaN(Date.parse(at1)) && !Number.isNaN(Date.parse(at2)))
  assert.deepStrictEqual(p1, { id: 'p1', kind: 'behaviour', route: '/invoices', given: 'an unpaid invoice', note: 'Delete asks for confirmation', round: 1, status: 'active' })
  assert.deepStrictEqual(p2, { id: 'p2', kind: 'look', route: '/invoices', note: 'Bigger title', round: 1, status: 'active' })
  const body = ok(drive(h.root, [STEM]))
  assert.ok(body.includes('- p1 (behaviour): On /invoices, given an unpaid invoice: Delete asks for confirmation') && body.includes('- p2 (look): On /invoices: Bigger title'))

  for (const bad of [['--kind', 'nope', '--route', '/x', '--note', 'n'], ['--kind', 'look', '--route', 'invoices', '--note', 'n'],
    ['--kind', 'look', '--route', '/x?proto=empty', '--note', 'n'], ['--kind', 'look', '--route', '/x', '--note', ''],
    ['--kind', 'look', '--route', '/x', '--given', '', '--note', 'n']]) {
    const f = pin(h.root, STEM, ...bad)
    assert.strictEqual(f.status, 2, bad.join(' '))
  }
  assert.strictEqual(read(h.root, `design/prototypes/${STEM}/pins.json`).length, 2, 'refusals write nothing')
  assert.strictEqual(drive(h.root, ['ghost', 'pin', '--kind', 'look', '--route', '/x', '--note', 'n']).status, 2, 'an unknown stem')

  ok(mark(h.root, STEM, 'round-done'))
  const st = statusOf(h.root)
  assert.strictEqual(st.rounds, 1)
  assert.deepStrictEqual(st.handled, ['p1', 'p2'])
  assert.match(ok(drive(h.root, [STEM])), /Round 2\.\n[^\n]*\nnone yet/)
})

test('AC-4: APPROVED prints the sentences by route; contracted needs the yes; the contract is sentences', async (t) => {
  const h = host()
  await approved(t, h)
  const out = ok(drive(h.root, [STEM]))
  assert.match(out, /▶ APPROVED/)
  assert.match(out, /\n\/invoices\n- p1 \(behaviour\): On \/invoices, given an unpaid invoice: Delete asks for confirmation\n- p2 \(look\): On \/invoices: Bigger title\n\n\/invoices\/new\n- p3 \(behaviour\): On \/invoices\/new: Totals update live\n/)
  assert.match(out, /Show the user these sentences\. On a yes: .*--mark contracted --confirmed/)
  assert.ok(!out.includes('Pictures need the app at'), 'no picture command, no picture line')
  const no = mark(h.root, STEM, 'contracted')
  assert.strictEqual(no.status, 2)
  assert.match(no.stderr, /user confirms the sentences first/)
  ok(drive(h.root, [STEM, 'drop', 'p2', '--why', 'duplicate']))
  assert.strictEqual(drive(h.root, [STEM, 'drop', 'p2', '--why', 'again']).status, 2, 'already dropped')
  const done = ok(mark(h.root, STEM, 'contracted', '--confirmed'))
  assert.match(done, /committed on trunk/)

  const c = read(h.root, `design/prototypes/${STEM}/contract.json`)
  assert.deepStrictEqual(Object.keys(c), ['stem', 'rounds', 'pins'])
  assert.strictEqual(c.rounds, 2)
  assert.deepStrictEqual(c.pins, [
    { id: 'p1', kind: 'behaviour', route: '/invoices', given: 'an unpaid invoice', note: 'Delete asks for confirmation', sentence: 'On /invoices, given an unpaid invoice: Delete asks for confirmation', round: 1, status: 'active' },
    { id: 'p2', kind: 'look', route: '/invoices', note: 'Bigger title', sentence: 'On /invoices: Bigger title', round: 1, status: 'dropped', why: 'duplicate' },
    { id: 'p3', kind: 'behaviour', route: '/invoices/new', note: 'Totals update live', sentence: 'On /invoices/new: Totals update live', round: 2, status: 'active' },
  ])
  assert.doesNotMatch(JSON.stringify(c), /selector|"screen"|"state"|anchor|"who"|schemaVersion|proto=/)
  assert.strictEqual(h.g('log', '-1', '--format=%s').trim(), `chore(proto): contract ${STEM}`)
  assert.strictEqual(h.g('status', '--porcelain').trim(), '', 'nothing of the stem is left uncommitted')
  assert.strictEqual(h.g('show', `HEAD:design/prototypes/${STEM}/status.json`).includes('"contracted"'), true, 'the committed status carries the mark')
  const q = JSON.parse(fs.readFileSync(path.join(h.root, '.git/spec-queue.json'), 'utf8'))
  assert.deepStrictEqual(q.items.map((i) => [i.kind, i.type, i.payload]), [['prompt', 'plan', `design/prototypes/${STEM}/contract.json`]])
  assert.strictEqual(drive(h.root, [STEM, '--state']).stdout.trim(), 'CONTRACTED')
  assert.strictEqual(mark(h.root, STEM, 'contracted', '--confirmed').status, 2, 'a second contracted is out of step')

  // drop at CONTRACTED rewrites the contract and commits it on trunk
  ok(drive(h.root, [STEM, 'drop', 'p3', '--why', 'not wanted after all']))
  assert.strictEqual(read(h.root, `design/prototypes/${STEM}/contract.json`).pins[2].status, 'dropped')
  assert.strictEqual(h.g('log', '-1', '--format=%s').trim(), 'chore(proto): drop p3 — not wanted after all')
  assert.strictEqual(h.g('status', '--porcelain').trim(), '')
})

test('AC-4: contracting with no active pin is refused; pin is refused after CONTRACTED', async (t) => {
  const h = host()
  await opened(t, h)
  ok(pin(h.root, STEM, '--kind', 'look', '--route', '/', '--note', 'Wider'))
  ok(drive(h.root, [STEM, 'drop', 'p1', '--why', 'changed my mind']))
  ok(mark(h.root, STEM, 'approved'))
  const r = mark(h.root, STEM, 'contracted', '--confirmed')
  assert.strictEqual(r.status, 2)
  assert.match(r.stderr, /nothing to contract — drop was the last word/)
  ok(pin(h.root, STEM, '--kind', 'look', '--route', '/', '--note', 'Narrower')) // pin is accepted at APPROVED, in the approving round
  assert.strictEqual(read(h.root, `design/prototypes/${STEM}/pins.json`)[1].round, 1)
  ok(mark(h.root, STEM, 'contracted', '--confirmed'))
  assert.strictEqual(pin(h.root, STEM, '--kind', 'look', '--route', '/', '--note', 'late').status, 2)
})

test('AC-5: a rejecting pre-commit hook leaves APPROVED and prints no committed line; the re-run succeeds', async (t) => {
  const h = host()
  await approved(t, h)
  const hook = path.join(h.root, '.git/hooks/pre-commit')
  fs.writeFileSync(hook, '#!/bin/sh\necho "hook says no" >&2\nexit 1\n', { mode: 0o755 })
  const r = mark(h.root, STEM, 'contracted', '--confirmed')
  assert.notStrictEqual(r.status, 0)
  assert.match(r.stderr, /hook says no/)
  assert.ok(!r.stdout.includes('committed on trunk'))
  assert.strictEqual(drive(h.root, [STEM, '--state']).stdout.trim(), 'APPROVED')
  assert.strictEqual(statusOf(h.root).marks.contracted, undefined)
  assert.strictEqual(h.g('status', '--porcelain', '--untracked-files=all', '--', 'design').includes('status.json'), true, 'the stem is still uncommitted')
  assert.strictEqual(h.g('diff', '--cached', '--name-only').trim(), '', 'nothing left staged')
  fs.rmSync(hook)
  assert.match(ok(mark(h.root, STEM, 'contracted', '--confirmed')), /committed on trunk/)
  assert.strictEqual(h.g('status', '--porcelain').trim(), '')
})

test('AC-5: prototype.picture writes one picture per pinned route and commits them; one failure is a warn, not a gate', async (t) => {
  const pic = path.join(tmpdir('pic'), 'pic.js')
  fs.writeFileSync(pic, "const [url, out] = process.argv.slice(2)\nif (url.endsWith('/invoices/new')) { console.error('screenshot failed'); process.exit(1) }\nrequire('fs').writeFileSync(out, 'PNG ' + url)\n")
  let h = host({}, { picture: `node ${pic} {url} {out}` })
  await approved(t, h)
  assert.match(ok(drive(h.root, [STEM])), /Pictures need the app at http:\/\/127\.0\.0\.1:\d+: cd \.claude\/worktrees\/proto-invoice-list-page && export PORT=\d+ && node app\.js/)
  const out = ok(mark(h.root, STEM, 'contracted', '--confirmed'))
  assert.match(out, /⚠️ no picture for \/invoices\/new/)
  assert.match(out, /committed on trunk/)
  assert.strictEqual(fs.readFileSync(path.join(h.root, `design/prototypes/${STEM}/pictures/invoices.png`), 'utf8').startsWith('PNG http://127.0.0.1:'), true)
  assert.ok(!fs.existsSync(path.join(h.root, `design/prototypes/${STEM}/pictures/invoices_new.png`)))
  assert.ok(h.g('ls-files', '--', `design/prototypes/${STEM}/pictures`).includes('invoices.png'))
  assert.ok(fs.existsSync(path.join(h.root, `design/prototypes/${STEM}/contract.json`)))

  // both routes succeed: both pictures are committed
  fs.writeFileSync(pic, "require('fs').writeFileSync(process.argv[3], 'PNG')\n")
  h = host({}, { picture: `node ${pic} {url} {out}` })
  await approved(t, h)
  ok(mark(h.root, STEM, 'contracted', '--confirmed'))
  const tracked = h.g('ls-files', '--', `design/prototypes/${STEM}/pictures`)
  assert.ok(tracked.includes('pictures/invoices.png') && tracked.includes('pictures/invoices_new.png'), tracked)
})

test('AC-6: closed refuses unmerged work without --force; --force discards it and frees the stem', async (t) => {
  const h = host()
  await opened(t, h)
  const wt = path.join(h.root, '.claude/worktrees/proto-' + STEM)
  const tip = h.g('rev-parse', '--short', 'proto/' + STEM).trim()
  const r = mark(h.root, STEM, 'closed')
  assert.strictEqual(r.status, 2)
  assert.ok(r.stderr.includes('--force') && r.stderr.includes(tip), r.stderr)
  assert.ok(fs.existsSync(wt) && fs.existsSync(path.join(h.root, `design/prototypes/${STEM}/status.json`)), 'nothing changed')
  assert.match(ok(mark(h.root, STEM, 'closed', '--force')), /prototype closed/)
  assert.ok(!fs.existsSync(wt))
  assert.strictEqual(h.g('branch', '--list', 'proto/' + STEM).trim(), '')
  assert.ok(!fs.existsSync(path.join(h.root, `design/prototypes/${STEM}`)))
  assert.strictEqual(h.g('status', '--porcelain').trim(), '')
  ok(drive(h.root, ['invoice', 'list', 'page'])) // the stem is free again
})

test('AC-6: closed names a spec that is mid-run from this prototype', async (t) => {
  const h = host()
  await approved(t, h)
  ok(mark(h.root, STEM, 'contracted', '--confirmed'))
  const spec = 'specs/20261105/01-invoices.md'
  fs.mkdirSync(path.join(h.root, 'specs/20261105/01-invoices.run'), { recursive: true })
  fs.writeFileSync(path.join(h.root, spec), `---\nstatus: hardened\nprototype: ${STEM}\n---\n\n# x\n`)
  fs.writeFileSync(path.join(h.root, 'specs/20261105/01-invoices.run/state.json'), JSON.stringify({ step: 'BUILD' }))
  const r = mark(h.root, STEM, 'closed')
  assert.strictEqual(r.status, 2)
  assert.ok(r.stderr.includes(spec), r.stderr)
  fs.rmSync(path.join(h.root, 'specs/20261105/01-invoices.run'), { recursive: true })
  assert.match(ok(mark(h.root, STEM, 'closed')), /worktree and branch removed/)
})

test('AC-6: a contracted close commits its status; a locked worktree is kept and said so', async (t) => {
  const h = host()
  await approved(t, h)
  ok(mark(h.root, STEM, 'contracted', '--confirmed'))
  const wt = path.join(h.root, '.claude/worktrees/proto-' + STEM)
  h.g('worktree', 'lock', wt)
  const out = ok(mark(h.root, STEM, 'closed'))
  assert.ok(out.includes(`⚠️ worktree kept at .claude/worktrees/proto-${STEM}`) && out.includes(`git worktree remove --force .claude/worktrees/proto-${STEM}`), out)
  assert.ok(!out.includes('worktree and branch removed'))
  assert.match(out, /still pending in the queue/)
  assert.ok(h.g('branch', '--list', 'proto/' + STEM).includes('proto/'), 'the branch is kept')
  assert.strictEqual(h.g('log', '-1', '--format=%s').trim(), `chore(proto): close ${STEM}`)
  assert.strictEqual(h.g('status', '--porcelain').trim(), '')
  assert.strictEqual(drive(h.root, [STEM, '--state']).stdout.trim(), 'CLOSED')
})

test('AC-6: a clean contracted close reports the removal and that the contract carries on', async (t) => {
  const h = host()
  await approved(t, h)
  ok(mark(h.root, STEM, 'contracted', '--confirmed'))
  fs.writeFileSync(path.join(h.root, '.git/spec-queue.json'), JSON.stringify({ version: 3, seq: 0, items: [] }))
  const out = ok(mark(h.root, STEM, 'closed'))
  assert.match(out, /- worktree and branch removed/)
  assert.match(out, /Next: nothing needs you — the contract carries on/)
  assert.strictEqual(h.g('status', '--porcelain').trim(), '')
})

test('AC-7: idea words that auto-derive another idea\'s stem are refused', () => {
  const h = host()
  ok(drive(h.root, ['invoice', 'list', 'page', 'redesign', 'alpha']))
  const r = drive(h.root, ['invoice', 'list', 'page', 'redesign', 'beta'])
  assert.strictEqual(r.status, 2)
  assert.ok(r.stderr.includes('belongs to "invoice list page redesign alpha"') && r.stderr.includes('--stem'), r.stderr)
  assert.match(ok(drive(h.root, ['invoice', 'list', 'page', 'redesign', 'alpha'])), /▶ OPEN/, 'the same words resume')
  assert.match(ok(drive(h.root, ['invoice-list-page-redesign'])), /▶ OPEN/, 'the stem resumes')
  assert.match(ok(drive(h.root, ['invoice', 'list', 'page', 'redesign', 'beta', '--stem', 'beta'])), /▶ OPEN/, '--stem is the way out')
})

test('AC-7: a v7 record stops every invocation, naming /spec:migrate', () => {
  const h = host()
  const dir = path.join(h.root, 'design/prototypes/old')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'status.json'), JSON.stringify({ schemaVersion: 1, stem: 'old', rounds: [], marks: { closed: 'x' } }))
  for (const args of [['old', '--state'], ['old'], ['old', '--mark', 'closed'], ['old', 'pin', '--kind', 'look', '--route', '/', '--note', 'n'], ['old', 'drop', 'p1', '--why', 'x']]) {
    const r = drive(h.root, args)
    assert.strictEqual(r.status, 2, args.join(' '))
    assert.ok(r.stderr.includes('design/prototypes/old/status.json is a v7 file — run /spec:migrate'), r.stderr)
  }
  fs.writeFileSync(path.join(dir, 'status.json'), JSON.stringify({ stem: 'old', rounds: 1, marks: {} }))
  fs.writeFileSync(path.join(dir, 'pins.json'), JSON.stringify({ schemaVersion: 1, pins: [] }))
  const r = drive(h.root, ['old', '--state'])
  assert.strictEqual(r.status, 2)
  assert.ok(r.stderr.includes('pins.json is a v7 file — run /spec:migrate'), r.stderr)
  fs.writeFileSync(path.join(dir, 'pins.json'), '[]')
  fs.writeFileSync(path.join(dir, 'contract.json'), JSON.stringify({ schemaVersion: 1, stem: 'old', pins: [] }))
  assert.ok(drive(h.root, ['old', '--state']).stderr.includes('contract.json is a v7 file'))
})

test('--stem overrides the derived stem, a bad stem is refused, the auto stem takes four significant words', () => {
  const { root } = host()
  assert.match(ok(drive(root, ['some', 'idea', '--stem', 'mine'])), /▶ OPEN/)
  assert.ok(fs.existsSync(path.join(root, 'design/prototypes/mine/status.json')))
  assert.strictEqual(drive(root, ['x', '--stem', 'Bad Stem']).status, 2)
  assert.match(ok(drive(root, ['a', 'page', 'for', 'the', 'invoices', 'with', 'a', 'delete', 'button', 'and', 'totals'])), /Auto-picked stem page-invoices-delete-button /)
})

test('a roadmap brief path gives the stem', () => {
  const { root } = host()
  fs.mkdirSync(path.join(root, 'docs/roadmap'), { recursive: true })
  fs.writeFileSync(path.join(root, 'docs/roadmap/03-invoices.md'), '# 03\n')
  const out = ok(drive(root, ['docs/roadmap/03-invoices.md']))
  assert.match(out, /Build a throwaway prototype of docs\/roadmap\/03-invoices\.md/)
  assert.ok(fs.existsSync(path.join(root, 'design/prototypes/03-invoices/status.json')))
})

test('AC-16: the docs carry the new shape and none of the old', () => {
  const { ROOT } = require('./helpers')
  const files = ['docs/v8/interface-contract.md', 'docs/v8/architecture.md', 'spec/doctrine.md', 'spec/commands/prototype.md', 'spec/commands/plan.md', 'spec/commands/run.md',
    'spec/commands/migrate.md', 'README.md', fs.readdirSync(path.join(ROOT, 'docs/adr')).filter((f) => f.startsWith('0035-')).map((f) => 'docs/adr/' + f)[0]]
  assert.ok(files.every((f) => f && !f.startsWith('specs/')))
  const text = files.map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n')
  for (const need of ['PIN_TESTS', 'LOOK', 'pin-tested', 'looked', 'look-failed', 'contracted --confirmed', 'closed [--force]', 'prototype:', 'e2eCommand', 'publicUrl', 'export PORT=<port>', 'Amended by: ADR-0043']) {
    assert.ok(text.includes(need), need)
  }
  for (const gone of ['overlay', 'ser' + 've', 'e2eList', 'states.json', 'tests-derived']) assert.ok(!text.toLowerCase().includes(gone.toLowerCase()), gone)
})
