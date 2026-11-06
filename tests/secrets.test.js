'use strict'
// Pins the secrets scan at the one door, lib/git.js commitAll (spec 20261105/15 D9): the same hits as
// v7's secrets-scan.js from tag spec-v7-final on one fixture holding every rule. A missing tag fails.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { tmpdir, gitRepo, runNode, v7Scripts, SPEC } = require('./helpers')
const G = require(path.join(SPEC, 'scripts/lib/git.js'))

// Tokens are built at run time so this file holds no literal secret for a scan to find.
const TOKENS = {
  aws: 'AK' + 'IA' + 'ABCDEFGHIJKLMNOP',
  pem: '-----BEGIN ' + 'RSA PRIVATE KEY-----',
  ghp: 'gh' + 'p_' + 'a'.repeat(36),
  pat: 'github' + '_pat_' + 'b'.repeat(25),
  sk: 's' + 'k-' + 'c'.repeat(24),
  slack: 'xo' + 'xb-' + '1234567890ab',
  stripe: 's' + 'k_live_' + 'd'.repeat(24),
  stripeRk: 'r' + 'k_live_' + 'e'.repeat(24),
  aiza: 'AI' + 'za' + 'f'.repeat(35),
  npm: '_auth' + 'Token = abc123',
}
const PATHS = ['.env', '.env.local', 'server.pem', 'a.key', 'b.p12', 'c.pfx', 'd.jks', 'id_rsa', 'id_rsa.pub', 'id_ed25519', 'id_ed25519.pub',
  'credentials.json', 'service-account-prod.json', 'secrets.json', 'secrets.yml', 'secrets.yaml', '.netrc', '.pgpass']

// Writes every rule's fixture into dir: path rules (with a token inside to prove the path short-circuits), content rules
// on line 2, a binary file, an allowed line, .env.example, a file past 1 MiB, and a tracked file deleted on disk.
function fixture() {
  const dir = tmpdir('secrets')
  fs.writeFileSync(path.join(dir, 'gone.txt'), 'x\n')
  fs.writeFileSync(path.join(dir, 'gone-secret.js'), `const k = '${TOKENS.aws}'\n`)
  const g = gitRepo(dir)
  fs.rmSync(path.join(dir, 'gone.txt')); fs.rmSync(path.join(dir, 'gone-secret.js'))
  const put = (f, t) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), t) }
  for (const p of PATHS) put(p, `harmless\n${TOKENS.aws}\n`)
  for (const [k, v] of Object.entries(TOKENS)) put(`src/${k}.js`, `first line\nconst v = '${v}'\nlast\n`)
  put('.env.example', 'KEY=\n')
  fs.writeFileSync(path.join(dir, 'src/binary.bin'), Buffer.concat([Buffer.from([0, 1, 2]), Buffer.from(`\n${TOKENS.aws}\n`)]))
  put('src/allowed.js', `const k = '${TOKENS.aws}' // secrets-scan:allow\nconst other = '${TOKENS.ghp}'\n`)
  put('src/big.txt', 'x'.repeat(1048576 + 10) + `\n${TOKENS.aws}\n`)
  put('src/clean.js', 'module.exports = 1\n')
  return { dir, g }
}

const norm = (hits) => hits.map((h) => ({ path: h.path, reason: h.reason, line: h.line })).sort((a, b) => (a.path + ':' + a.line).localeCompare(b.path + ':' + b.line))

test('AC-20261105-15-9 commitAll returns the same hits as v7 secrets-scan.js on a fixture of every rule, and commits nothing', () => {
  const { dir } = fixture()
  const r = runNode(path.join(v7Scripts(), 'secrets-scan.js'), ['--root', dir, '--worktree', '--json'])
  assert.strictEqual(r.status, 1, r.stderr + r.stdout)
  const oracle = JSON.parse(r.stdout).hits
  assert.ok(oracle.length >= PATHS.length + Object.keys(TOKENS).length, 'the oracle sees every rule')
  assert.ok(!oracle.some((h) => /gone|binary|big\.txt|\.env\.example|clean/.test(h.path)), 'the oracle skips deleted, binary, oversized, example and clean files')
  assert.ok(oracle.find((h) => h.path === 'src/allowed.js').line === 2, 'a secrets-scan:allow line is skipped, the next line is not')
  const head = G.headSha(dir)
  const got = G.commitAll(dir, 'fixture')
  assert.ok(got && Array.isArray(got.hits), 'hits are returned, not a sha')
  assert.deepStrictEqual(norm(got.hits), norm(oracle), 'the same {path, reason, line} hits as v7')
  assert.strictEqual(G.headSha(dir), head, 'nothing was committed')
})

test('AC-20261105-15-9 a path in allow or exclude is not reported; noVerify commits without scanning', () => {
  const { dir } = fixture()
  const all = G.commitAll(dir, 'x').hits.map((h) => h.path)
  const some = [...new Set(all)]
  const allow = some.slice(0, 3)
  const exclude = some.slice(3, 6)
  const got = G.commitAll(dir, 'x', { allow, exclude })
  const paths = new Set(got.hits.map((h) => h.path))
  for (const p of [...allow, ...exclude]) assert.ok(!paths.has(p), `${p} is not reported`)
  assert.strictEqual(paths.size, some.length - 6, 'the rest are still reported')
  const sha = G.commitAll(dir, 'with secrets', { noVerify: true })
  assert.strictEqual(sha, G.headSha(dir), 'noVerify skips the scan as it skips hooks')
  assert.ok(G.sh(['show', '--name-only', '--format=', 'HEAD'], dir).split('\n').includes('.env'), 'the secret file is committed')
})

test('AC-20261105-15-9 excluding every hit commits the rest and leaves the excluded paths on disk', () => {
  const { dir } = fixture()
  const paths = [...new Set(G.commitAll(dir, 'x').hits.map((h) => h.path))]
  const sha = G.commitAll(dir, 'rest', { exclude: paths })
  assert.strictEqual(sha, G.headSha(dir))
  const files = G.sh(['show', '--name-only', '--format=', 'HEAD'], dir).split('\n')
  assert.ok(files.includes('src/clean.js') && files.includes('.env.example') && files.includes('src/binary.bin'), 'what is not a hit is committed')
  assert.ok(files.includes('gone.txt'), 'a deletion is committed')
  for (const p of paths) { assert.ok(!files.includes(p), `${p} is out of the commit`); assert.ok(fs.existsSync(path.join(dir, p)), `${p} stays on disk`) }
})
