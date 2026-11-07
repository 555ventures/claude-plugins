'use strict'
// Pins spec/scripts/release.js (spec 20261105/15 D13-D17): the note is never read as a flag; staging runs deploy →
// ready → migrations → e2e with BASE_URL; a green run on HEAD is the only way to --promote; production must answer
// after the promote before `✅ released` prints.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')
const { tmpdir, gitRepo, runNode, freePort, v7Scripts, SPEC } = require('./helpers')
const R = require(path.join(SPEC, 'scripts/release.js'))

// A host whose release commands log what they ran to <dir>/log. `url` is a file:// url over a dir holding /ok.
function setup(release = {}, { migrations = false } = {}) {
  const d = tmpdir('release')
  const web = path.join(d, 'web')
  fs.mkdirSync(web)
  fs.writeFileSync(path.join(web, 'ok'), 'up\n')
  if (migrations) fs.mkdirSync(path.join(d, 'migrations'))
  fs.mkdirSync(path.join(d, '.claude'))
  const url = 'file://' + web
  fs.writeFileSync(path.join(d, '.claude/spec.config.json'), JSON.stringify({ release: {
    deployCommand: 'echo deploy >> log', stagingUrl: url, healthPath: '/ok', e2eCommand: 'echo "e2e $BASE_URL $STAGING_URL note=$RELEASE_NOTE" >> log',
    promoteCommand: 'echo promote >> log', productionUrl: url, ...release } }))
  const g = gitRepo(d)
  return {
    d, g, url, web,
    run: (...a) => runNode('scripts/release.js', ['--root', d, ...a]),
    runEnv: (env, ...a) => runNode('scripts/release.js', ['--root', d, ...a], { env }),
    log: () => (fs.existsSync(path.join(d, 'log')) ? fs.readFileSync(path.join(d, 'log'), 'utf8').trim().split('\n') : []),
    record: () => { const f = path.join(d, '.git/spec-release.json'); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null },
  }
}

const closedUrl = async () => `http://127.0.0.1:${await freePort()}`

// A child-process HTTP server answering every request with `body`; resolves to its url.
function serve(t, body) {
  const child = spawn(process.execPath, ['-e', "require('http').createServer((q, s) => s.end(process.argv[1])).listen(0, '127.0.0.1', function () { console.log(this.address().port) })", body], { stdio: ['ignore', 'pipe', 'inherit'] })
  t.after(() => child.kill())
  return new Promise((resolve, reject) => {
    child.on('error', reject)
    child.stdout.once('data', (b) => resolve(`http://127.0.0.1:${String(b).trim()}`))
  })
}

test('missing config exits 2 naming the keys; --promote needs promoteCommand and productionUrl', () => {
  const none = setup({ deployCommand: '', stagingUrl: '', e2eCommand: '' })
  const r = none.run()
  assert.strictEqual(r.status, 2)
  assert.match(r.stderr, /deployCommand/)
  assert.match(r.stderr, /stagingUrl/)
  assert.match(r.stderr, /e2eCommand/)
  const h = setup({ productionUrl: '', promoteCommand: '' })
  const p = h.run('--promote')
  assert.strictEqual(p.status, 2)
  assert.match(p.stderr, /promoteCommand/)
  assert.match(p.stderr, /productionUrl/)
  assert.deepStrictEqual(h.log(), [], 'nothing ran')
})

test('AC-20261105-15-17 --promote without productionUrl exits 2 and runs no promoteCommand, even after green staging', () => {
  const h = setup({ productionUrl: '' })
  assert.strictEqual(h.run().status, 0)
  const p = h.run('--promote')
  assert.strictEqual(p.status, 2)
  assert.match(p.stderr, /productionUrl/)
  assert.ok(!h.log().includes('promote'))
})

test('AC-20261105-15-12 after `--` everything is note text; an unknown flag before it exits 2 and runs nothing; release.md drives `release.js -- $ARGUMENTS`', () => {
  const h = setup()
  const r = h.run('--', '--promote')
  assert.strictEqual(r.status, 0, r.stderr)
  assert.deepStrictEqual(h.log(), ['deploy', `e2e ${h.url} ${h.url} note=--promote`], 'staging ran with RELEASE_NOTE=--promote and no promote')
  assert.ok(!h.log().includes('promote'))
  const bogus = setup()
  const b = bogus.run('--bogus')
  assert.strictEqual(b.status, 2)
  assert.match(b.stderr, /--bogus/)
  assert.deepStrictEqual(bogus.log(), [], 'nothing ran')
  const words = setup()
  words.run('--', 'v1', '--json', 'second')
  assert.match(words.log()[1], /note=v1 --json second$/, 'a note is joined words, flags after `--` included')
  const md = fs.readFileSync(path.join(SPEC, 'commands/release.md'), 'utf8')
  assert.match(md, /release\.js(?: --promote)? -- \$ARGUMENTS/)
})

test('AC-20261105-15-13 e2e gets the config url as BASE_URL and STAGING_URL, never an inherited STAGING_URL; the order is deploy, ready, migrations, e2e', () => {
  const h = setup({ migrationsCheck: 'echo migrations >> log' })
  const r = h.runEnv({ ...process.env, STAGING_URL: 'http://inherited.example' })
  assert.strictEqual(r.status, 0, r.stderr)
  assert.deepStrictEqual(h.log(), ['deploy', 'migrations', `e2e ${h.url} ${h.url} note=`])
  assert.match(r.stdout, /ready ok/)
})

test('AC-20261105-15-13 a staging url that fails three tries stops at ready, exit 1, with neither migrations nor e2e run', async () => {
  const h = setup({ stagingUrl: await closedUrl(), healthPath: '/', migrationsCheck: 'echo migrations >> log' })
  const r = h.run()
  assert.strictEqual(r.status, 1, r.stderr)
  assert.match(r.stdout, /release stopped at ready/)
  assert.deepStrictEqual(h.log(), ['deploy'], 'neither migrations nor e2e ran')
  assert.strictEqual(h.record(), null)
})

test('AC-20261105-15-13 a missing curl stops at ready', () => {
  const h = setup()
  const bin = tmpdir('nocurl') // a PATH with git and nothing else: no curl
  fs.symlinkSync(require('child_process').execFileSync('which', ['git'], { encoding: 'utf8' }).trim(), path.join(bin, 'git'))
  const r = h.runEnv({ ...process.env, PATH: bin })
  assert.strictEqual(r.status, 1, r.stderr + r.stdout)
  assert.match(r.stdout, /release stopped at ready/)
  assert.match(r.stdout, /curl/)
  assert.deepStrictEqual(h.log(), ['deploy'], 'e2e did not run')
})

const COUNT = 'Tests:\\s+(\\d+)'
test('AC-20261105-15-14 e2e that exits 0 with the pattern matching 0 or nothing stops at e2e and writes no record; a positive count passes; an absent or `none` pattern passes uncounted', () => {
  for (const out of ['Tests: 0', 'nothing to see']) {
    const h = setup({ e2eCommand: `echo "${out}"`, testCountPattern: COUNT })
    const r = h.run()
    assert.strictEqual(r.status, 1, r.stdout)
    assert.match(r.stdout, /release stopped at e2e/)
    assert.match(r.stdout, /e2e exited 0 but ran no tests/)
    assert.strictEqual(h.record(), null, 'no staging record')
  }
  const pass = setup({ e2eCommand: 'echo "Tests: 12"', testCountPattern: COUNT })
  const p = pass.run()
  assert.strictEqual(p.status, 0, p.stdout)
  assert.match(p.stdout, /e2e ok \(12 tests\)/)
  assert.ok(pass.record())
  for (const pattern of [undefined, 'none']) {
    const h = setup({ e2eCommand: 'echo "no summary"', ...(pattern ? { testCountPattern: pattern } : {}) })
    const r = h.run()
    assert.strictEqual(r.status, 0, r.stdout)
    assert.match(r.stdout, /e2e ok \(tests not counted\)/)
  }
})

test('AC-20261105-15-14 the count equals v7 computeTestsExecuted on outputs that include a decoy test name before the real summary', () => {
  const v7 = require(path.join(v7Scripts(), 'lib/count-observation.js'))
  const outputs = [
    'Tests: 7 passed', 'ok 1 - Tests: 99 are listed here\nok 2 - b\nTests: 4 passed', 'Tests: 0', 'no summary at all', 'x\nTests: 3\nTests: 8\n', '  Tests:  15 total',
    'Tests: abc', 'ran 1 tests\nTests: 2',
  ]
  for (const out of outputs) {
    for (const pattern of [COUNT, 'ran (\\d+) tests', 'none', undefined]) {
      const want = v7.computeTestsExecuted(out, pattern)
      const got = require(path.join(SPEC, 'scripts/lib/host.js')).testsExecuted(out, pattern)
      assert.deepStrictEqual(got, typeof want === 'number' ? want : null, `${JSON.stringify(out)} / ${pattern}`)
    }
  }
})

test('AC-20261105-15-15 migrationsCheck exits non-zero: stops at migrations before e2e; `none` is not run; absent runs nothing and asks nothing in a repo holding migrations/', () => {
  const bad = setup({ migrationsCheck: 'echo migrations >> log; exit 1' })
  const r = bad.run()
  assert.strictEqual(r.status, 1)
  assert.match(r.stdout, /release stopped at migrations/)
  assert.deepStrictEqual(bad.log(), ['deploy', 'migrations'], 'e2e did not run')
  const none = setup({ migrationsCheck: 'none' })
  assert.strictEqual(none.run().status, 0)
  assert.ok(!none.log().includes('none') && none.log().length === 2)
  const absent = setup({}, { migrations: true })
  const a = absent.run()
  assert.strictEqual(a.status, 0, a.stdout)
  assert.ok(!/migrat/i.test(a.stdout + a.stderr), 'nothing asked, nothing said')
  assert.strictEqual(absent.log().length, 2)
})

test('AC-20261105-15-16 --promote runs only after green staging on the same commit, and once', () => {
  const none = setup()
  const a = none.run('--promote')
  assert.strictEqual(a.status, 2)
  assert.match(a.stderr, /\/spec:release/)
  assert.deepStrictEqual(none.log(), [])

  const red = setup({ e2eCommand: 'exit 3' })
  assert.strictEqual(red.run().status, 1)
  const b = red.run('--promote')
  assert.strictEqual(b.status, 2)
  assert.match(b.stderr, /\/spec:release/)
  assert.ok(!red.log().includes('promote'))

  const moved = setup()
  assert.strictEqual(moved.run('v1').status, 0)
  assert.strictEqual(moved.record().sha, moved.g('rev-parse', 'HEAD').trim())
  assert.strictEqual(moved.record().note, 'v1')
  fs.writeFileSync(path.join(moved.d, 'new.txt'), 'x\n'); moved.g('add', '-A'); moved.g('commit', '-q', '-m', 'new commit')
  const c = moved.run('--promote')
  assert.strictEqual(c.status, 2)
  assert.match(c.stderr, /\/spec:release/)
  assert.ok(!moved.log().includes('promote'), 'a moved HEAD promotes nothing')

  const green = setup()
  assert.strictEqual(green.run().status, 0)
  const d = green.run('--promote')
  assert.strictEqual(d.status, 0, d.stdout + d.stderr)
  assert.ok(green.log().includes('promote'))
  const again = green.run('--promote')
  assert.strictEqual(again.status, 2, 'the approval does not carry to a second promote')
  assert.strictEqual(green.log().filter((l) => l === 'promote').length, 1)
  assert.strictEqual(green.record(), null)
})

test('AC-20261105-15-16 every staging run clears the old record first, and a failing promote stages again', () => {
  const h = setup()
  assert.strictEqual(h.run().status, 0)
  assert.ok(h.record())
  fs.writeFileSync(path.join(h.d, '.claude/spec.config.json'), JSON.stringify({ release: { deployCommand: 'exit 1', stagingUrl: h.url, e2eCommand: 'true', promoteCommand: 'true', productionUrl: h.url } }))
  h.g('add', '-A'); h.g('commit', '-q', '-m', 'break deploy')
  assert.strictEqual(h.run().status, 1)
  assert.strictEqual(h.record(), null, 'a red staging run leaves no record behind')
  const f = setup({ promoteCommand: 'exit 4' })
  assert.strictEqual(f.run().status, 0)
  const p = f.run('--promote')
  assert.strictEqual(p.status, 1)
  assert.match(p.stdout, /release stopped at promote/)
  assert.strictEqual(f.run('--promote').status, 2, 'any failure stages again')
})

test('AC-20261105-15-16 readRelease and writeRelease in lib/state.js are the only code touching spec-release.json', () => {
  const hits = []
  const walk = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir, e.name); if (e.isDirectory()) walk(f); else if (/\.(js|sh)$/.test(e.name) && fs.readFileSync(f, 'utf8').includes('spec-release')) hits.push(path.relative(SPEC, f)) } }
  walk(path.join(SPEC, 'scripts'))
  assert.deepStrictEqual(hits, ['scripts/lib/state.js'])
})

test('AC-20261105-15-17 production that never answers stops at production with exit 1 and no ✅ released; one that answers prints the body, the staged sha and ✅ released', async (t) => {
  const down = setup({ productionUrl: await closedUrl() }) // staging answers through file://, production is a closed port
  assert.strictEqual(down.run().status, 0)
  const bad = down.run('--promote')
  assert.strictEqual(bad.status, 1, bad.stdout + bad.stderr)
  assert.match(bad.stdout, /release stopped at production/)
  assert.ok(!/✅ released/.test(bad.stdout))
  assert.ok(down.log().includes('promote'), 'the promote ran; production did not answer after it')

  const h = setup({ productionUrl: await serve(t, 'build-abc123') })
  assert.strictEqual(h.run('v2').status, 0)
  const sha = h.g('rev-parse', 'HEAD').trim()
  const ok = h.run('--promote')
  assert.strictEqual(ok.status, 0, ok.stdout + ok.stderr)
  assert.match(ok.stdout, /build-abc123/, 'the production response body is printed')
  assert.ok(ok.stdout.includes(sha), 'the staged sha is printed')
  assert.match(ok.stdout, /✅ released — v2/)
})
